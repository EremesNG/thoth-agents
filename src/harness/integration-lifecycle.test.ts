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

describe('integration package lifecycle', () => {
  test('build regenerates integration packages before compiling', () => {
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

  test('version lifecycle regenerates and verifies integration packages', () => {
    const { scripts } = readPackageMetadata();

    expect(scripts.version).toBe(
      'pnpm run integration:sync && pnpm run integration:verify',
    );
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

    expect(scripts[`release:${level}`]).toContain(`npm version ${level}`);
  });

  test('all versioned integration manifests match package.json', () => {
    const root = process.cwd();
    const { version } = readPackageMetadata();
    const codexManifest = readJson<{ version: string }>(
      join(root, 'integrations', 'codex', '.codex-plugin', 'plugin.json'),
    );
    const claudeManifest = readJson<{ version: string }>(
      join(
        root,
        'integrations',
        'claude-code',
        '.claude-plugin',
        'plugin.json',
      ),
    );
    const claudeMarketplace = readJson<{
      plugins: Array<{ name: string; version: string }>;
    }>(join(root, '.claude-plugin', 'marketplace.json'));
    const claudeEntry = claudeMarketplace.plugins.find(
      (plugin) => plugin.name === 'thoth-agents',
    );

    expect(codexManifest.version).toBe(version);
    expect(claudeManifest.version).toBe(version);
    expect(claudeEntry?.version).toBe(version);
  });
});
