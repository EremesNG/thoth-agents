import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
  test('publishes one native Pi extension, one skill root, and six specialist assets', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(packageJson.keywords).toContain('pi-package');
    expect(packageJson.pi).toEqual({
      extensions: ['./dist/pi.js'],
      skills: ['./skills'],
    });
    expect(packageJson.files).toContain('pi');
    expect(readFileSync('tsup.config.ts', 'utf8')).toContain("pi: 'src/pi.ts'");
    expect(
      readdirSync('pi/agents').filter((name) => name.endsWith('.md')),
    ).toEqual([
      'deep.md',
      'designer.md',
      'explorer.md',
      'librarian.md',
      'oracle.md',
      'quick.md',
    ]);
  });
  test.skipIf(!existsSync('dist/pi.js'))(
    'loads the built Pi extension from an unrelated directory',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'thoth-built-pi-'));
      try {
        const result = spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '--eval',
            `import(${JSON.stringify(new URL('../dist/pi.js', import.meta.url).href)}).then(m=>{if(typeof m.default!=="function")process.exit(2)})`,
          ],
          { cwd: root, encoding: 'utf8' },
        );
        expect(result.status, result.stderr).toBe(0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
  test('does not compose a bundled provider lifecycle into the plugin runtime', () => {
    const source = readFileSync(pluginSourcePath, 'utf8');

    expect(source).not.toContain('createThothMemHook');
    expect(source).not.toContain('thothMemHook');
    expect(source).not.toContain('config.thoth');
    expect(source).not.toContain('including thoth_mem');
  });

  test('keeps the runtime lean and exactly four harness registrations', () => {
    const source = readFileSync(pluginSourcePath, 'utf8');

    expect(source).not.toContain('createPhaseReminderHook');
    expect(source).not.toContain('createPostReadNudgeHook');
    expect(source).toContain('createJsonErrorRecoveryHook');
    expect(source).toContain('createDelegateTaskRetryHook');
    expect([...SUPPORTED_HARNESSES].sort()).toEqual([
      'claude',
      'codex',
      'opencode',
      'pi',
    ]);
  });

  test('requires Node.js 22.19 across active package, workflow, and bundled skill declarations', () => {
    const paths = [
      'package.json',
      '.github/workflows/ci.yml',
      '.github/workflows/release.yml',
      ...THOTH_OWNED_SKILL_NAMES.flatMap((name) => [
        `skills/${name}/SKILL.md`,
        `plugin/skills/${name}/SKILL.md`,
      ]),
    ].filter(existsSync);
    const content = paths.map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(content).not.toContain('22.13');
    expect(readFileSync('package.json', 'utf8')).toContain('"node": ">=22.19"');
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain(
      'node-version: [22.19]',
    );
    expect(readFileSync('.github/workflows/release.yml', 'utf8')).toContain(
      'node-version: 22.19',
    );
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
