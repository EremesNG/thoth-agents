import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  checkPiVersionBumps,
  isTestPath,
  runCheck,
} from '../../scripts/check-pi-version-bumps.mjs';

let repo: string;

function git(...args: string[]) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function write(file: string, content: string) {
  const path = join(repo, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function manifest(directory: string, version: string) {
  write(
    `pi-packages/${directory}/package.json`,
    JSON.stringify({ name: `@thoth-agents/${directory}`, version }),
  );
}

function commit(message: string) {
  git('add', '-A');
  git('commit', '-q', '-m', message);
}

const warning = (name: string) =>
  `::warning title=Pi package version not bumped::${name} changed without a version bump`;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'pi-bumps-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  git('config', 'commit.gpgsign', 'false');
  manifest('pi-core', '0.1.0');
  write('pi-packages/pi-core/src/index.ts', 'export {};\n');
  commit('base');
  git('checkout', '-q', '-b', 'feature');
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

const check = () => checkPiVersionBumps('main', { projectRoot: repo });

describe('check-pi-version-bumps', () => {
  test('warns when source changes without a version bump', () => {
    write('pi-packages/pi-core/src/index.ts', 'export const a = 1;\n');
    commit('change');
    expect(check()).toEqual([warning('@thoth-agents/pi-core')]);
  });

  test('is silent when the version is bumped', () => {
    write('pi-packages/pi-core/src/index.ts', 'export const a = 1;\n');
    manifest('pi-core', '0.1.1');
    commit('change');
    expect(check()).toEqual([]);
  });

  test('ignores test-only changes', () => {
    write('pi-packages/pi-core/test/a.ts', 'x\n');
    write('pi-packages/pi-core/src/a.test.ts', 'x\n');
    commit('tests');
    expect(check()).toEqual([]);
  });

  test('ignores new packages', () => {
    manifest('pi-new', '0.1.0');
    write('pi-packages/pi-new/src/index.ts', 'export {};\n');
    commit('new');
    expect(check()).toEqual([]);
  });

  test('classifies test paths', () => {
    expect(isTestPath('pi-packages/x/tests/a.ts')).toBe(true);
    expect(isTestPath('pi-packages/x/a.test.mjs')).toBe(true);
    expect(isTestPath('pi-packages/x/src/a.ts')).toBe(false);
  });

  test('runCheck requires a base ref and never fails otherwise', () => {
    expect(runCheck([], {}, { projectRoot: repo })).toBe(1);
    expect(runCheck(['main'], {}, { projectRoot: repo })).toBe(0);
    expect(
      runCheck([], { GITHUB_BASE_REF: 'main' }, { projectRoot: repo }),
    ).toBe(0); // origin/main is unreachable here: skipped, never failed
  });
});

describe('ci.yml', () => {
  test('runs the bump check on pull requests only, after fetching the base', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const step = ci.slice(ci.indexOf('- name: Check Pi package version bumps'));
    expect(step).toContain("if: github.event_name == 'pull_request'");
    expect(step).toContain('git fetch --no-tags --depth=');
    expect(step.indexOf('git fetch')).toBeLessThan(
      step.indexOf('node scripts/check-pi-version-bumps.mjs'),
    );
    expect(step).toContain('origin/$' + '{{ github.base_ref }}');
  });
});
