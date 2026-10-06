import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DefaultResourceLoader,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const coreRoot = path.resolve(packageRoot, '../pi-core');

function run(command: string, args: string[], cwd: string): string {
  // Package managers use .cmd shims on Windows; quote paths for that shell.
  const commandArgs =
    process.platform === 'win32' ? args.map((arg) => `"${arg}"`) : args;
  return execFileSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 60_000,
    stdio: 'pipe',
  });
}

it('loads the packed todo extension with its packed core dependency through Pi SDK 1.0.2 offline', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-todo-packed-'));
  let loader: DefaultResourceLoader | undefined;
  try {
    const tarballs = path.join(root, 'tarballs');
    const install = path.join(root, 'install');
    const agentDir = path.join(root, 'agent');
    for (const directory of [tarballs, install, agentDir])
      fs.mkdirSync(directory);
    run('pnpm', ['pack', '--pack-destination', tarballs], coreRoot);
    run('pnpm', ['pack', '--pack-destination', tarballs], packageRoot);
    const coreTar = path.join(tarballs, 'thoth-agents-pi-core-0.1.0.tgz');
    const todoTar = path.join(tarballs, 'thoth-agents-pi-todo-0.1.0.tgz');
    fs.writeFileSync(
      path.join(install, 'package.json'),
      JSON.stringify({ name: 'packed-fixture', private: true, type: 'module' }),
    );
    run(
      'npm',
      [
        'install',
        '--offline',
        '--ignore-scripts',
        '--legacy-peer-deps',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        coreTar,
        todoTar,
      ],
      install,
    );

    // Only SDK peers are supplied from the development install. Both Thoth
    // packages above are regular npm-extracted tarballs, never workspace links.
    for (const peer of [
      '@earendil-works/pi-coding-agent',
      '@earendil-works/pi-ai',
      '@earendil-works/pi-tui',
      'typebox',
    ]) {
      const destination = path.join(install, 'node_modules', peer);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.symlinkSync(
        fs.realpathSync(path.join(packageRoot, 'node_modules', peer)),
        destination,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    }
    const installedTodo = path.join(
      install,
      'node_modules/@thoth-agents/pi-todo',
    );
    const installedCore = path.join(
      install,
      'node_modules/@thoth-agents/pi-core',
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(installedTodo, 'package.json'), 'utf8'),
    );
    const sdkManifest = JSON.parse(
      fs.readFileSync(
        path.join(
          install,
          'node_modules/@earendil-works/pi-coding-agent/package.json',
        ),
        'utf8',
      ),
    );
    expect(sdkManifest.version).toBe('1.0.2');
    expect(manifest.dependencies['@thoth-agents/pi-core']).toBe('^0.1.0');
    expect(fs.lstatSync(installedCore).isSymbolicLink()).toBe(false);
    expect(fs.lstatSync(installedTodo).isSymbolicLink()).toBe(false);
    const requireFromTodo = createRequire(
      path.join(installedTodo, 'package.json'),
    );
    expect(requireFromTodo.resolve('@thoth-agents/pi-core')).toBe(
      path.join(installedCore, 'src/index.ts'),
    );
    const shipped = fs
      .readdirSync(installedTodo, { recursive: true })
      .map(String);
    expect(shipped).not.toContain('test');
    expect(shipped.some((file) => file.endsWith('.test.ts'))).toBe(false);
    for (const resource of [
      'index.ts',
      'todo.ts',
      'todo-work-panel.ts',
      'state/replay.ts',
      'state/publish.ts',
      'tool/types.ts',
      'view/format.ts',
      'README.md',
      'LICENSE',
    ])
      expect(fs.existsSync(path.join(installedTodo, resource))).toBe(true);

    loader = new DefaultResourceLoader({
      cwd: install,
      agentDir,
      settingsManager: SettingsManager.inMemory({ packages: [] }),
      noExtensions: true,
      additionalExtensionPaths: [installedTodo],
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await loader.reload();
    const result = loader.getExtensions();
    expect(result.errors).toEqual([]);
    expect(result.extensions).toHaveLength(1);
    expect(result.extensions[0].tools.has('todo')).toBe(true);
    expect(result.extensions[0].commands.has('todos')).toBe(true);
  } finally {
    loader?.getExtensions().runtime.invalidate();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 90_000);
