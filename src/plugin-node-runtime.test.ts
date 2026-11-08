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
import { transpileModule } from 'typescript';
import { describe, expect, test, vi } from 'vitest';
import { THOTH_OWNED_SKILL_NAMES } from './harness/core/owned-skills';
import { SUPPORTED_HARNESSES } from './harness/registry';

const pluginSourcePath = fileURLToPath(new URL('./index.ts', import.meta.url));

const registration = vi.hoisted(() => ({
  deps: { config: {}, directory: '/project' },
  load: vi.fn(),
  agents: vi.fn(),
  tools: vi.fn(),
  mcp: vi.fn(),
  command: vi.fn(),
  skills: vi.fn(),
  permissions: vi.fn(),
  profileRuntime: vi.fn(),
  profileRpc: vi.fn(),
  toolRpc: vi.fn(),
  delegation: vi.fn(),
  session: vi.fn(),
}));
vi.mock('./opencode/context', () => ({
  loadOpenCodeDependencies: registration.load,
}));
vi.mock('./opencode/agents', () => ({ registerAgents: registration.agents }));
vi.mock('./opencode/tools', () => ({ registerTools: registration.tools }));
vi.mock('./opencode/mcp', () => ({ registerMcp: registration.mcp }));
vi.mock('./opencode/command', () => ({
  registerCommand: registration.command,
}));
vi.mock('./opencode/skills', () => ({ registerSkills: registration.skills }));
vi.mock('./opencode/permissions', () => ({
  registerPermissions: registration.permissions,
}));
vi.mock('./opencode/profile-runtime', () => ({
  registerProfileRuntime: registration.profileRuntime,
}));
vi.mock('./opencode/profile-rpc-handlers', () => ({
  registerProfileRpc: registration.profileRpc,
}));
vi.mock('./opencode/tool-rpc-handlers', () => ({
  registerToolRpc: registration.toolRpc,
}));
vi.mock('./opencode/delegation-hooks', () => ({
  registerDelegationHooks: registration.delegation,
}));
vi.mock('./opencode/session-hooks', () => ({
  registerSessionHooks: registration.session,
}));

describe('plugin runtime compatibility', () => {
  test('erases OpenCode plugin imports from entry and registration runtime code', () => {
    const paths = [
      pluginSourcePath,
      ...readdirSync('src/opencode')
        .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
        .map((name) => join('src/opencode', name)),
    ];
    for (const path of paths) {
      const { outputText } = transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { removeComments: true, verbatimModuleSyntax: true },
      });
      expect(outputText, path).not.toContain('@opencode/plugin');
    }
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(packageJson.dependencies).not.toHaveProperty('@opencode/plugin');
    expect(packageJson.devDependencies['@opencode/plugin']).toBe('2.2.5');
  });
  test('exports the built plugin for native local and npm resolution', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(manifest.exports['.']).toEqual({
      types: './dist/index.d.ts',
      default: './dist/index.js',
    });
    expect(manifest.exports['./package.json']).toBe('./package.json');
    expect(manifest.exports['./dist/*']).toBe('./dist/*');
    expect(manifest.bin['thoth-agents']).toBe('./dist/cli/index.js');
  });
  test('exports a v2 plugin definition and registers each domain once per setup', async () => {
    const { default: plugin } = await import('./index');
    expect(plugin).toMatchObject({
      id: 'thoth-agents',
      setup: expect.any(Function),
    });
    const ctx = { location: { directory: '/project' } };
    registration.load.mockReturnValue(registration.deps);
    await plugin.setup(ctx as never);
    expect(registration.load).toHaveBeenCalledExactlyOnceWith(ctx);
    for (const register of [
      registration.agents,
      registration.tools,
      registration.mcp,
      registration.command,
      registration.skills,
      registration.permissions,
      registration.profileRuntime,
      registration.profileRpc,
      registration.toolRpc,
      registration.delegation,
      registration.session,
    ]) {
      expect(register).toHaveBeenCalledExactlyOnceWith(ctx, registration.deps);
    }
  });
  test('publishes one native Pi extension, one skill root, and five specialist assets', () => {
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
      'thoth-designer.md',
      'thoth-explorer.md',
      'thoth-librarian.md',
      'thoth-oracle.md',
      'thoth-worker.md',
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
          { windowsHide: true, cwd: root, encoding: 'utf8' },
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
    expect(source).toContain('registerDelegationHooks');
    expect(source).toContain('registerSessionHooks');
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
        status: 'planned',
        changed: false,
        plugin: 'thoth-mem@0.7.0',
        opencodeVersion: '2.2.6',
        configPath: join(homeDir, '.config', 'opencode', 'opencode.json'),
        skillPath: join(homeDir, '.config', 'opencode', 'skills', 'thoth-mem'),
        providerConfigPath: join(
          homeDir,
          '.config',
          'thoth-mem',
          'config.json',
        ),
        receiptPath: null,
        actions: ['Configure thoth-mem for OpenCode'],
        recovered: false,
        warnings: [],
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
          ],
          {
            windowsHide: true,
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
          'Package-provided thoth-owned OpenCode skills planned',
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
