import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { discoverPiPackages, releasePi } from '../../scripts/release-pi.mjs';

let root: string;
let logs: string[];
const log = (message: string) => logs.push(message);

function writePackage(
  directory: string,
  version: string,
  lane = 'pi-packages',
) {
  const dir = join(root, lane, directory);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: `@thoth-agents/${directory}`, version }),
  );
  return dir;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'release-pi-'));
  logs = [];
  writePackage('pi-subagents', '0.1.0');
  writePackage('pi-core', '0.1.0');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function fakeNpm(calls: Array<{ level: string; cwd: string }>) {
  return (level: string, cwd: string) => {
    calls.push({ level, cwd });
    const file = join(cwd, 'package.json');
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    pkg.version = '0.1.1';
    writeFileSync(file, JSON.stringify(pkg));
    return { status: 0, stdout: '', stderr: '' };
  };
}

describe('release-pi', () => {
  test('discovers the contained-shell package for release without a separate allowlist', () => {
    expect(discoverPiPackages(process.cwd())).toContainEqual(
      expect.objectContaining({
        directory: 'pi-contained-shell',
        name: '@thoth-agents/pi-contained-shell',
      }),
    );
  });

  test('discovers packages from pi-packages/*/package.json', () => {
    expect(
      discoverPiPackages(root)
        .map((p) => p.directory)
        .sort(),
    ).toEqual(['pi-core', 'pi-subagents']);
  });

  test('discovers both lanes and skips directories without manifests', () => {
    const dir = writePackage(
      'opencode-multi-codex',
      '0.1.0',
      'opencode-packages',
    );
    mkdirSync(join(root, 'opencode-packages', 'not-a-package'));
    expect(discoverPiPackages(root)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ directory: 'pi-core' }),
        expect.objectContaining({ directory: 'opencode-multi-codex', dir }),
      ]),
    );
    expect(discoverPiPackages(root)).toHaveLength(3);
  });

  test.each([
    'opencode-multi-codex',
    '@thoth-agents/opencode-multi-codex',
  ])('bumps %s when the Pi lane is absent and prints the correct path', (identifier) => {
    rmSync(join(root, 'pi-packages'), { recursive: true });
    const dir = writePackage(
      'opencode-multi-codex',
      '0.1.0',
      'opencode-packages',
    );
    const calls: Array<{ level: string; cwd: string }> = [];
    expect(
      releasePi([identifier, 'patch'], {
        projectRoot: root,
        runNpm: fakeNpm(calls),
        log,
      }),
    ).toMatchObject({ ok: true, exitCode: 0, newVersion: '0.1.1' });
    expect(calls).toEqual([{ level: 'patch', cwd: dir }]);
    expect(logs.join('\n')).toContain(
      'Commit the bump (opencode-packages/opencode-multi-codex/package.json).',
    );
  });

  test.each([
    'pi-subagents',
    '@thoth-agents/pi-subagents',
  ])('bumps %s in its own directory and prints next steps', (identifier) => {
    const calls: Array<{ level: string; cwd: string }> = [];
    const result = releasePi([identifier, 'patch'], {
      projectRoot: root,
      runNpm: fakeNpm(calls),
      log,
    });
    expect(result).toMatchObject({
      ok: true,
      exitCode: 0,
      oldVersion: '0.1.0',
      newVersion: '0.1.1',
    });
    expect(calls).toEqual([
      { level: 'patch', cwd: join(root, 'pi-packages', 'pi-subagents') },
    ]);
    const output = logs.join('\n');
    expect(output).toContain('0.1.0 -> 0.1.1');
    expect(output).toContain('pnpm release:patch|minor|major');
    expect(output).toContain(
      'Commit the bump (pi-packages/pi-subagents/package.json).',
    );
  });

  test('rejects unknown packages and levels without running npm', () => {
    const calls: Array<{ level: string; cwd: string }> = [];
    const runNpm = fakeNpm(calls);
    for (const args of [
      ['pi-nope', 'patch'],
      ['pi-core', 'huge'],
      ['pi-core'],
      [],
    ]) {
      const result = releasePi(args, { projectRoot: root, runNpm, log });
      expect(result).toEqual({ ok: false, exitCode: 1 });
    }
    expect(calls).toEqual([]);
    expect(logs.join('\n')).toContain('Usage: pnpm release:pi');
  });

  test('propagates npm failure', () => {
    const result = releasePi(['pi-core', 'minor'], {
      projectRoot: root,
      runNpm: () => ({ status: 2, stdout: '', stderr: 'boom' }),
      log,
    });
    expect(result).toEqual({ ok: false, exitCode: 2 });
  });
});
