import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';

type Step = {
  name?: string;
  id?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
};

const raw = readFileSync(
  join(process.cwd(), '.github', 'workflows', 'release.yml'),
  'utf8',
);
const steps = (parse(raw) as { jobs: { publish: { steps: Step[] } } }).jobs
  .publish.steps;
const indexOf = (name: string) => steps.findIndex((s) => s.name === name);
const byName = (name: string) => steps[indexOf(name)];

describe('release workflow Pi packages', () => {
  test('publishes Pi packages before root npm publish', () => {
    const pi = byName('Publish Pi packages');
    expect(pi.id).toBe('pi-publish');
    expect(pi.run?.trim()).toBe(
      'pnpm publish -r --filter "./pi-packages/*" --ignore-scripts --no-git-checks',
    );
    expect(indexOf('Check built plugin runtime')).toBeLessThan(
      indexOf('Publish Pi packages'),
    );
    expect(indexOf('Publish Pi packages')).toBeLessThan(
      indexOf('Publish to npm'),
    );
    expect(byName('Publish Pi packages').if).toBeUndefined();
    expect(byName('Publish to npm').if).toBeUndefined();
  });

  test('reconciles tags and releases independently, even after publish failure', () => {
    const step = byName('Reconcile Pi releases');
    expect(step.if).toContain('always()');
    expect(step.if).toContain("steps.install.outcome == 'success'");
    expect(steps[indexOf('Install dependencies')].id).toBe('install');
    expect(indexOf('Publish Pi packages')).toBeLessThan(
      indexOf('Reconcile Pi releases'),
    );
    expect(indexOf('Reconcile Pi releases')).toBeLessThan(
      indexOf('Publish to npm'),
    );

    const script = step.run ?? '';
    expect(script).toContain('npm view');
    expect(script).toContain('git ls-remote --tags origin');
    expect(script).toContain('gh release view');
    expect(script).toContain('--verify-tag');
    expect(script).toMatch(/--to "\$\{tag\}"/);
    expect(script).toMatch(/--tag-prefix "\$\{name\}@"/);

    // Release check is a sibling of the tag check, not nested inside it.
    const tagBlockStart = script.indexOf('git ls-remote --tags origin');
    const tagBlockEnd = script.indexOf('\n  fi\n', tagBlockStart);
    expect(tagBlockEnd).toBeGreaterThan(tagBlockStart);
    expect(script.indexOf('gh release view')).toBeGreaterThan(tagBlockEnd);
    expect(script.indexOf('gh release create')).toBeGreaterThan(tagBlockEnd);
  });

  test('root notes exclude Pi packages and package tags', () => {
    const run = byName('Generate release notes').run ?? '';
    expect(run).toContain('--exclude-path pi-packages');
    expect(run).toContain("--package-tags '@thoth-agents/*@*'");
  });

  test('uses OIDC without npm token secrets', () => {
    expect(raw).not.toContain('NPM_TOKEN');
    expect(raw).not.toContain('NODE_AUTH_TOKEN');
    expect(raw).toContain('id-token: write');
  });
});
