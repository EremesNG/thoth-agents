import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const roots: string[] = [];

function runFixture(args: string[], exitCode = 0) {
  const root = mkdtempSync(join(tmpdir(), 'thoth pi local '));
  roots.push(root);
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'dist', 'cli'), { recursive: true });
  copyFileSync(
    join(repositoryRoot, 'scripts/setup-pi-local.mjs'),
    join(root, 'scripts/setup-pi-local.mjs'),
  );
  writeFileSync(
    join(root, 'dist/cli/index.js'),
    `console.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() })); process.exit(${exitCode});`,
  );
  const result = spawnSync(
    process.execPath,
    [join(root, 'scripts/setup-pi-local.mjs'), ...args],
    { cwd: tmpdir(), encoding: 'utf8' },
  );
  return { root, result };
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('local Pi setup command', () => {
  it('builds before running the local installer', () => {
    const manifest = JSON.parse(
      readFileSync(join(repositoryRoot, 'package.json'), 'utf8'),
    );
    expect(manifest.scripts['setup:pi:local']).toBe(
      'pnpm run build && node scripts/setup-pi-local.mjs',
    );
  });

  it('preserves installer failures', () => {
    expect(runFixture([], 7).result.status).toBe(7);
  });

  it('forwards dry-run without applying a real installation', () => {
    const { result } = runFixture(['--dry-run']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).args).toContain('--dry-run');
  });
  it('invokes the checkout installer with an absolute root, even from another directory', () => {
    const { root, result } = runFixture([]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      args: [
        'install',
        '--agent=pi',
        `--local-package-root=${resolve(root)}`,
        `--local-pi-runtime-root=${resolve(root, 'pi-packages', 'pi-subagents')}`,
      ],
      cwd: root,
    });
  });
});
