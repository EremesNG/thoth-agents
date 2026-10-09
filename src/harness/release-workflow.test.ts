import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
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

// The workflow runs on Ubuntu; exercise its CLI boundary wherever GNU timeout exists.
const hasGnuTimeout =
  spawnSync('bash', ['-c', 'timeout --version'], {
    encoding: 'utf8',
    timeout: 5000,
  }).stdout?.includes('GNU coreutils') ?? false;

function runReconcile({
  npmScript,
  packageCount = 9,
  outcome = 'success',
  waitSeconds = 2,
}: {
  npmScript: string;
  packageCount?: number;
  outcome?: string;
  waitSeconds?: number;
}) {
  const root = mkdtempSync(join(tmpdir(), 'thoth-reconcile-'));
  try {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    for (let i = 0; i < packageCount; i++) {
      const dir = join(root, 'pi-packages', `package-${i}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
          name: `@thoth-agents/package-${i}`,
          version: '1.0.0',
        }),
      );
    }
    for (const [command, body] of Object.entries({
      npm: `echo "npm $*" >> "$TRACE"\n${npmScript}`,
      sleep: 'echo "sleep $*" >> "$TRACE"\nexec "$REAL_SLEEP" "$@"',
      timeout: 'echo "timeout $*" >> "$TRACE"\nexec "$REAL_TIMEOUT" "$@"',
      git: 'echo "git $*" >> "$TRACE"\nif [ "$1" = "ls-remote" ]; then echo existing-tag; fi',
      gh: 'echo "gh $*" >> "$TRACE"',
    })) {
      writeFileSync(join(bin, command), `#!/usr/bin/env bash\n${body}\n`, {
        mode: 0o755,
      });
    }
    writeFileSync(join(root, 'trace'), '');
    const started = Date.now();
    const result = spawnSync('bash', ['--noprofile', '--norc'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        PI_PUBLISH_OUTCOME: outcome,
        PI_PUBLISH_WAIT_SECONDS: String(waitSeconds),
      },
      input: `export REAL_SLEEP="$(command -v sleep)" REAL_TIMEOUT="$(command -v timeout)"
export PATH="$PWD/bin:$PATH" TRACE="$PWD/trace" TMPDIR="$PWD"
${byName('Reconcile Pi releases').run}`,
    });
    return {
      ...result,
      elapsedMs: Date.now() - started,
      trace: readFileSync(join(root, 'trace'), 'utf8').trim().split('\n'),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

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
    expect(script).toContain('--latest=false');
    expect(script).toMatch(/--to "\$\{tag\}"/);
    expect(script).toMatch(/--tag-prefix "\$\{name\}@"/);

    // Release check is a sibling of the tag check, not nested inside it.
    const tagBlockStart = script.indexOf('git ls-remote --tags origin');
    const tagBlockEnd = script.indexOf('\n  fi\n', tagBlockStart);
    expect(tagBlockEnd).toBeGreaterThan(tagBlockStart);
    expect(script.indexOf('gh release view')).toBeGreaterThan(tagBlockEnd);
    expect(script.indexOf('gh release create')).toBeGreaterThan(tagBlockEnd);
  });

  test('waits for npm propagation after successful Pi publish and fails on timeout', () => {
    const step = byName('Reconcile Pi releases');
    expect(step.env?.PI_PUBLISH_OUTCOME).toBe(
      `\${{ steps.pi-publish.outcome }}`,
    );

    const script = step.run ?? '';
    expect(script).toContain('set -uo pipefail');
    expect(script).toContain(
      `publish_deadline=$((SECONDS + \${PI_PUBLISH_WAIT_SECONDS:-300}))`,
    );
    expect(script).toContain(
      `npm view "\${name}@\${version}" version --prefer-online --fetch-retries=0 --fetch-timeout=10000`,
    );
    expect(script).toContain('[ "$PI_PUBLISH_OUTCOME" != "success" ]');
    expect(script).toContain('[ "$remaining" -le 0 ]');
    expect(script).toContain('sleep "$sleep_seconds"');
    expect(script).toMatch(
      /if \[ "\$PI_PUBLISH_OUTCOME" = "success" \]; then\s+echo "Timed out[^\n]+\n\s+failed=1/,
    );
    expect(script).toContain(`Skipping \${tag}: not published to npm.`);
  });

  test.skipIf(!hasGnuTimeout)(
    'terminates a hung npm process even when it ignores SIGTERM without polling later packages',
    () => {
      const result = runReconcile({
        waitSeconds: 1,
        npmScript: 'trap "" TERM\n"$REAL_SLEEP" 4\necho 1.0.0',
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.elapsedMs).toBeLessThan(5000);
      expect(result.stdout.match(/Timed out waiting for/g)).toHaveLength(9);
      expect(
        result.trace.filter((line) => line.startsWith('npm ')),
      ).toHaveLength(1);
      expect(result.trace.some((line) => line.startsWith('gh '))).toBe(false);
    },
    10000,
  );

  test.skipIf(!hasGnuTimeout)(
    'shares one deadline across nine missing packages and clamps propagation sleeps',
    () => {
      const result = runReconcile({ npmScript: 'exit 1' });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.elapsedMs).toBeLessThan(5000);
      expect(result.stdout.match(/Timed out waiting for/g)).toHaveLength(9);
      const npmCalls = result.trace.filter((line) => line.startsWith('npm '));
      // Once the budget expires, no registry checks start for later packages.
      expect(new Set(npmCalls.map((line) => line.split(' ')[2])).size).toBe(1);
      const sleeps = result.trace.filter((line) => line.startsWith('sleep '));
      expect(sleeps.length).toBeGreaterThan(0);
      for (const sleep of sleeps) {
        expect(Number(sleep.split(' ')[1])).toBeLessThanOrEqual(2);
      }
    },
    15000,
  );

  test.skipIf(!hasGnuTimeout).each(['failure', 'cancelled', 'skipped'])(
    'checks each package once with process timeouts and never sleeps after a %s Pi publish',
    (outcome) => {
      const result = runReconcile({
        npmScript: 'exit 1',
        outcome,
        waitSeconds: 0,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout.match(/Skipping /g)).toHaveLength(9);
      expect(
        result.trace.filter((line) => line.startsWith('npm ')),
      ).toHaveLength(9);
      expect(
        result.trace.filter((line) => line.startsWith('timeout ')),
      ).toHaveLength(9);
      expect(result.trace.some((line) => line.startsWith('sleep '))).toBe(
        false,
      );
      expect(result.trace.some((line) => line.startsWith('gh '))).toBe(false);
    },
  );

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
