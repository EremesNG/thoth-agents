import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { THOTH_OWNED_SKILL_NAMES } from './harness/core/owned-skills';
import { SUPPORTED_HARNESSES } from './harness/registry';

const pluginSourcePath = fileURLToPath(new URL('./index.ts', import.meta.url));

describe('plugin runtime compatibility', () => {
  test('does not compose a bundled provider lifecycle into the plugin runtime', () => {
    const source = readFileSync(pluginSourcePath, 'utf8');

    expect(source).not.toContain('createThothMemHook');
    expect(source).not.toContain('thothMemHook');
    expect(source).not.toContain('config.thoth');
    expect(source).not.toContain('including thoth_mem');
  });

  test('keeps the runtime lean and exactly three harness registrations', () => {
    const source = readFileSync(pluginSourcePath, 'utf8');

    expect(source).not.toContain('createPhaseReminderHook');
    expect(source).not.toContain('createPostReadNudgeHook');
    expect(source).toContain('createJsonErrorRecoveryHook');
    expect(source).toContain('createDelegateTaskRetryHook');
    expect([...SUPPORTED_HARNESSES].sort()).toEqual([
      'claude',
      'codex',
      'opencode',
    ]);
  });

  test.skipIf(!existsSync('dist/index.js'))(
    'built plugin does not require a host global Bun object',
    () => {
      const source = readFileSync('dist/index.js', 'utf8');

      expect(source).not.toContain('globalThis.Bun');
      expect(source).not.toMatch(/{[^}]*spawn[^}]*}\s*=\s*globalThis\.Bun/);
      expect(source).not.toContain('import.meta.require');
    },
  );

  test.skipIf(!existsSync('dist/cli/index.js'))(
    'built CLI resolves packaged owned skills from its emitted chunk',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'thoth-built-cli-'));
      const fakeBin = join(root, 'bin');
      const homeDir = join(root, 'home');
      mkdirSync(fakeBin);
      mkdirSync(homeDir);
      const providerResult = JSON.stringify({
        status: 'complete',
        changed: false,
        harness: 'opencode',
        scope: 'global',
        target: homeDir,
        steps: [{ name: 'setup', outcome: 'planned' }],
        diagnostics: [],
        manual_actions: [],
        receipt: null,
      });

      try {
        if (process.platform === 'win32') {
          writeFileSync(
            join(fakeBin, 'npx.cmd'),
            `@echo off\r\necho ${providerResult}\r\n`,
          );
        } else {
          const fakeNpx = join(fakeBin, 'npx');
          writeFileSync(
            fakeNpx,
            `#!/bin/sh\nprintf '%s\\n' '${providerResult}'\n`,
          );
          chmodSync(fakeNpx, 0o755);
        }

        const result = spawnSync(
          process.execPath,
          [
            resolve('dist', 'cli', 'index.js'),
            'install',
            '--agent=opencode',
            '--dry-run',
            '--no-tui',
            '--tmux=no',
          ],
          {
            cwd: homeDir,
            encoding: 'utf8',
            env: {
              ...process.env,
              FORCE_COLOR: '0',
              HOME: homeDir,
              NO_COLOR: '1',
              PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
              USERPROFILE: homeDir,
            },
          },
        );

        expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
        expect(result.stdout).toContain(
          'Global thoth-owned OpenCode skills planned',
        );
        for (const skillName of THOTH_OWNED_SKILL_NAMES) {
          expect(result.stdout).toContain(skillName);
        }
        expect(existsSync(join(homeDir, '.config', 'opencode', 'skills'))).toBe(
          false,
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
