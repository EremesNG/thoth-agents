import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workspace = fileURLToPath(new URL('..', import.meta.url));
const packages = {
  'pi-subagents': { tool: 'subagent_run' },
  'pi-todo': { tool: 'todo', command: 'todos' },
  'pi-questions-user': { tool: 'ask_user_question' },
  'pi-background-tasks': {
    command: 'bg',
    assets: ['dist/windows-job-helper.ps1', 'dist/windows-job-helper.cs'],
  },
  'pi-antigravity-bridge': { tool: 'antigravity', command: 'agy' },
  'pi-claude-bridge': { provider: 'claude-bridge' },
  'pi-openai-fast': { event: 'before_provider_request' },
  'pi-thoth-theme': { event: 'session_start' },
  'pi-sidebar': { command: 'sidebar', event: 'session_start' },
};
const hostPackages = ['pi-coding-agent', 'pi-agent-core', 'pi-ai', 'pi-tui'];

function copyPackedPackage(name, install) {
  const source = join(workspace, 'pi-packages', name);
  // Listing is offline and ignores lifecycle scripts (publication does too).
  const listing = JSON.parse(
    execFileSync(
      process.platform === 'win32' ? 'cmd.exe' : 'npm',
      process.platform === 'win32'
        ? [
            '/d',
            '/s',
            '/c',
            'npm pack --dry-run --json --ignore-scripts --offline',
          ]
        : ['pack', '--dry-run', '--json', '--ignore-scripts', '--offline'],
      {
        cwd: source,
        encoding: 'utf8',
        timeout: 10_000,
        stdio: 'pipe',
      },
    ),
  );
  // npm returns an array; the pnpm-provided npm shim returns a keyed object.
  const packed = Object.values(listing);
  assert.equal(packed.length, 1);
  const files = packed[0].files.map(({ path }) => path);
  const manifest = JSON.parse(
    readFileSync(join(source, 'package.json'), 'utf8'),
  );
  assert.deepEqual(manifest.pi.extensions, ['./dist/index.ts'], name);
  assert.deepEqual(
    files.filter((path) => path.endsWith('.ts')),
    ['dist/index.ts'],
    `${name}: publish exactly the generated TypeScript-suffixed bundle`,
  );
  for (const asset of packages[name].assets ?? []) {
    assert.ok(files.includes(asset), `${name}: missing packed asset ${asset}`);
  }

  const destination = join(install, 'node_modules', manifest.name);
  for (const file of files) {
    const target = join(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(source, file), target);
  }
  // Supply only declared runtime exceptions from the frozen workspace install.
  // Inlined dependencies and host SDK peers are deliberately not installed.
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    assert.ok(!dependency.startsWith('@earendil-works/'), dependency);
    const target = join(destination, 'node_modules', dependency);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(
      realpathSync(join(source, 'node_modules', dependency)),
      target,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  }
  return destination;
}

async function loadPackage(
  packageRoot,
  cwd,
  agentDir,
  discoverAndLoadExtensions,
) {
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8'),
  );
  // Pi discovery can silently omit nonexistent manifest entries. Do not let
  // that turn a broken published package into a passing zero-extension smoke.
  for (const entry of manifest.pi.extensions) {
    assert.ok(
      existsSync(resolve(packageRoot, entry)),
      `${manifest.name}: missing bundle ${entry}`,
    );
  }
  const result = await discoverAndLoadExtensions([packageRoot], cwd, agentDir);
  try {
    assert.deepEqual(result.errors, [], manifest.name);
    assert.deepEqual(result.warnings, [], manifest.name);
    assert.equal(result.extensions.length, 1, manifest.name);
    assert.equal(
      result.extensions[0].resolvedPath,
      resolve(packageRoot, 'dist/index.ts'),
      manifest.name,
    );
    return result;
  } catch (error) {
    result.runtime.invalidate();
    throw error;
  }
}

test(
  'published Pi bundles load offline using only the workspace host SDK',
  { timeout: 110_000 },
  async (t) => {
    const temporary = mkdtempSync(join(tmpdir(), 'thoth-pi-bundles-'));
    const install = join(temporary, 'install');
    const agentDir = join(temporary, 'agent');
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    const previousCwd = process.cwd();
    let hooks;
    try {
      mkdirSync(install);
      mkdirSync(agentDir);
      process.env.PI_CODING_AGENT_DIR = agentDir;
      process.chdir(install);
      const { discoverAndLoadExtensions, getAgentDir } = await import(
        '@earendil-works/pi-coding-agent'
      );
      const { Text } = await import('@earendil-works/pi-tui');
      const sdkRoot = resolve(
        dirname(
          fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent')),
        ),
        '..',
      );
      const hostRoots = hostPackages.map((name) =>
        realpathSync(join(sdkRoot, '..', name)),
      );
      const observedHostModules = new Set();
      hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
          const result = nextResolve(specifier, context);
          if (
            result.url.startsWith('file:') &&
            result.url.includes('/@earendil-works/')
          ) {
            const modulePath = realpathSync(fileURLToPath(result.url));
            assert.ok(
              hostRoots.some((root) => modulePath.startsWith(`${root}${sep}`)),
              `Duplicate/non-host SDK module: ${result.url}`,
            );
            observedHostModules.add(result.url);
          }
          return result;
        },
      });

      for (const [name, expected] of Object.entries(packages)) {
        await t.test(
          `${name}: packed bundle activates without sibling SDK copies`,
          async () => {
            const installed = copyPackedPackage(name, install);
            assert.ok(
              !existsSync(join(install, 'node_modules/@earendil-works')),
            );
            for (const host of hostPackages) {
              assert.throws(
                () =>
                  createRequire(join(installed, 'dist/index.ts')).resolve(
                    `@earendil-works/${host}`,
                  ),
                { code: 'MODULE_NOT_FOUND' },
              );
            }
            observedHostModules.clear();
            const result = await loadPackage(
              installed,
              install,
              agentDir,
              discoverAndLoadExtensions,
            );
            try {
              const extension = result.extensions[0];
              if (expected.noop) {
                for (const registrations of [
                  extension.tools,
                  extension.commands,
                  extension.handlers,
                  extension.flags,
                  extension.shortcuts,
                  extension.messageRenderers,
                ]) {
                  assert.equal(registrations.size, 0, name);
                }
                assert.equal(
                  result.runtime.pendingProviderRegistrations.length,
                  0,
                  name,
                );
              } else {
                assert.ok(
                  observedHostModules.size > 0,
                  `${name}: host SDK module resolution was observed`,
                );
              }
              if (expected.tool)
                assert.ok(extension.tools.has(expected.tool), name);
              if (expected.command)
                assert.ok(extension.commands.has(expected.command), name);
              if (expected.event)
                assert.ok(extension.handlers.has(expected.event), name);
              if (expected.provider) {
                assert.ok(
                  result.runtime.pendingProviderRegistrations.some(
                    ({ name }) => name === expected.provider,
                  ),
                  name,
                );
              }
            } finally {
              result.runtime.invalidate();
            }
          },
        );
      }

      await t.test(
        'Pi aliases preserve host export identity from the isolated install',
        async () => {
          const key = Symbol.for('thoth-pi-bundles.test.host');
          globalThis[key] = { Text, getAgentDir };
          const probe = join(install, 'host-identity.ts');
          writeFileSync(
            probe,
            `
import { Text } from '@earendil-works/pi-tui';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
export default function (pi) {
  const host = globalThis[Symbol.for('thoth-pi-bundles.test.host')];
  pi.registerFlag('host-sdk-identity', {
    type: 'boolean', default: Text === host.Text && getAgentDir === host.getAgentDir,
  });
}
`,
          );
          let result;
          try {
            result = await discoverAndLoadExtensions(
              [probe],
              install,
              agentDir,
            );
            assert.deepEqual(result.errors, []);
            assert.deepEqual(result.warnings, []);
            assert.equal(result.extensions.length, 1);
            assert.equal(
              result.runtime.flagValues.get('host-sdk-identity'),
              true,
            );
            assert.ok(
              observedHostModules.size > 0,
              'SDK module resolution was observed',
            );
          } finally {
            result?.runtime.invalidate();
            delete globalThis[key];
          }
        },
      );

      await t.test(
        'a manifest referencing a missing bundle is rejected',
        async () => {
          const broken = join(
            install,
            'node_modules/@thoth-agents/missing-bundle',
          );
          mkdirSync(broken, { recursive: true });
          writeFileSync(
            join(broken, 'package.json'),
            JSON.stringify({
              name: '@thoth-agents/missing-bundle',
              pi: { extensions: ['./dist/missing.ts'] },
            }),
          );
          await assert.rejects(
            loadPackage(broken, install, agentDir, discoverAndLoadExtensions),
            /missing bundle .\/dist\/missing\.ts/,
          );
        },
      );
    } finally {
      hooks?.deregister();
      process.chdir(previousCwd);
      if (previousAgentDir === undefined)
        delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);
