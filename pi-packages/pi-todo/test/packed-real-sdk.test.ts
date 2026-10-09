import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DefaultResourceLoader,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));

function manifestVersion(relativePath: string): string {
  return JSON.parse(
    fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
  ).version;
}

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

it('loads the packed todo bundle without a runtime core dependency through Pi SDK 1.0.2 offline', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-todo-packed-'));
  let loader: DefaultResourceLoader | undefined;
  try {
    const tarballs = path.join(root, 'tarballs');
    const install = path.join(root, 'install');
    const agentDir = path.join(root, 'agent');
    for (const directory of [tarballs, install, agentDir])
      fs.mkdirSync(directory);
    run('pnpm', ['run', 'build'], packageRoot);
    run('pnpm', ['pack', '--pack-destination', tarballs], packageRoot);
    const todoTar = path.join(
      tarballs,
      `thoth-agents-pi-todo-${manifestVersion('../package.json')}.tgz`,
    );
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
        todoTar,
      ],
      install,
    );

    // Only SDK peers are supplied from the development install. The extension
    // is a regular npm-extracted tarball, never a workspace link.
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
    expect(manifest.pi.extensions).toEqual(['./dist/index.ts']);
    expect(manifest.dependencies?.['@thoth-agents/pi-core']).toBeUndefined();
    expect(manifest.devDependencies['@thoth-agents/pi-core']).toBe(
      `^${manifestVersion('../../pi-core/package.json')}`,
    );
    expect(fs.existsSync(installedCore)).toBe(false);
    expect(fs.lstatSync(installedTodo).isSymbolicLink()).toBe(false);
    const shipped = fs
      .readdirSync(installedTodo, { recursive: true })
      .map((file) => String(file).split(path.sep).join('/'));
    expect(shipped).not.toContain('test');
    expect(shipped).not.toContain('src');
    expect(shipped.filter((file) => file.endsWith('.ts'))).toEqual([
      'dist/index.ts',
    ]);
    for (const resource of ['dist/index.ts', 'README.md', 'LICENSE'])
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
