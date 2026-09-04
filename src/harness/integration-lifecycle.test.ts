import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

interface PackageMetadata {
  version: string;
  scripts: Record<string, string>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function readPackageMetadata(): PackageMetadata {
  return readJson<PackageMetadata>(join(process.cwd(), 'package.json'));
}

describe('shared plugin lifecycle', () => {
  test('build regenerates the shared plugin before compiling', () => {
    const { scripts } = readPackageMetadata();
    const buildSteps = scripts.build.split('&&').map((step) => step.trim());
    const prepublishSteps = scripts.prepublishOnly
      .split('&&')
      .map((step) => step.trim());

    expect(buildSteps[0]).toBe('pnpm run integration:sync');
    expect(buildSteps).toContain('tsup');
    expect(prepublishSteps).toEqual([
      'pnpm run build',
      'pnpm run integration:verify',
    ]);
  });

  test('version lifecycle regenerates and verifies the shared plugin', () => {
    const { scripts } = readPackageMetadata();
    const versionSteps = scripts.version.split('&&').map((step) => step.trim());

    expect(versionSteps).toEqual([
      'pnpm run integration:sync',
      'pnpm run integration:verify',
      'git add -- plugin',
    ]);
    expect(scripts['integration:verify']).toContain(
      'src/harness/integration-lifecycle.test.ts',
    );
  });

  test.each([
    'patch',
    'minor',
    'major',
  ] as const)('release:%s uses the synchronizing npm version lifecycle', (level) => {
    const { scripts } = readPackageMetadata();

    expect(scripts[`release:${level}`]).toBe(
      `npm version ${level} --ignore-scripts=false && git push --follow-tags`,
    );
  });

  test('both plugin manifests match package.json', () => {
    const root = process.cwd();
    const { version } = readPackageMetadata();
    const codexManifest = readJson<{ version: string }>(
      join(root, 'plugin', '.codex-plugin', 'plugin.json'),
    );
    const claudeManifest = readJson<{ version: string }>(
      join(root, 'plugin', '.claude-plugin', 'plugin.json'),
    );
    expect(codexManifest.version).toBe(version);
    expect(claudeManifest.version).toBe(version);
  });
});
