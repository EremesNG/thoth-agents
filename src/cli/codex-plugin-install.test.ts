import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { CodexCommandExecutor } from './codex-plugin-install';
import {
  applyCodexPluginSetup,
  buildCodexPluginSetupPlan,
  formatCodexPluginSetupPlan,
  getCodexCommand,
} from './codex-plugin-install';

interface ManagerState {
  marketplace: boolean;
  plugin: boolean;
  enabled: boolean;
  pluginVersion?: string;
  legacyPluginIds?: Set<string>;
  legacyMarketplaces?: Map<string, string>;
  afterCentralInstall?: () => void;
  mutations: string[];
}

const VERSION = '0.3.11';
const roots: string[] = [];

function temporaryCodexHome(name: string): string {
  const root = join(
    tmpdir(),
    `thoth-agents-codex-plugin-${name}-${process.pid}-${roots.length}`,
  );
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

function testConfig(name: string) {
  return {
    codexHome: temporaryCodexHome(name),
    expectedVersion: VERSION,
    projectRoot: process.cwd(),
  };
}

function seedLegacyCache(
  codexHome: string,
  marketplaceName: 'thoth-agents' | 'thoth-agents-codex',
): string {
  const root = join(codexHome, 'plugins', 'cache', marketplaceName);
  const versionRoot = join(root, 'thoth-agents', VERSION);
  mkdirSync(join(versionRoot, '.codex-plugin'), { recursive: true });
  writeFileSync(
    join(versionRoot, '.codex-plugin', 'plugin.json'),
    `${JSON.stringify({ name: 'thoth-agents', version: VERSION }, null, 2)}\n`,
  );
  writeFileSync(join(versionRoot, 'payload.txt'), `${marketplaceName}\n`);
  return root;
}

function seedLegacySnapshot(
  codexHome: string,
  marketplaceName: 'thoth-agents' | 'thoth-agents-codex',
): string {
  const root = join(codexHome, '.tmp', 'marketplaces', marketplaceName);
  mkdirSync(join(root, '.agents', 'plugins'), { recursive: true });
  writeFileSync(
    join(root, '.codex-marketplace-install.json'),
    `${JSON.stringify({ source_type: 'git', source: 'https://github.com/EremesNG/thoth-agents.git' }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, '.agents', 'plugins', 'marketplace.json'),
    `${JSON.stringify({ name: marketplaceName, plugins: [{ name: 'thoth-agents' }] }, null, 2)}\n`,
  );
  return root;
}

function executor(state: ManagerState): CodexCommandExecutor {
  return (_command, args) => {
    const key = args.join(' ');
    if (key === 'plugin marketplace list --json') {
      const legacyMarketplaces = [...(state.legacyMarketplaces ?? [])].map(
        ([name, source]) => ({
          name,
          marketplaceSource: {
            sourceType: source.startsWith('http') ? 'git' : 'local',
            source,
          },
        }),
      );
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          marketplaces: [
            ...(state.marketplace
              ? [
                  {
                    name: 'thoth-plugins',
                    marketplaceSource: {
                      sourceType: 'git',
                      source: 'https://github.com/EremesNG/thoth-plugins.git',
                    },
                  },
                ]
              : []),
            ...legacyMarketplaces,
          ],
        }),
        stderr: '',
      };
    }
    if (key === 'plugin list --available --json') {
      const plugin = {
        pluginId: 'thoth-agents@thoth-plugins',
        installed: state.plugin,
        enabled: state.enabled,
        version: state.pluginVersion ?? VERSION,
      };
      const legacyPlugins = [...(state.legacyPluginIds ?? [])].map(
        (pluginId) => ({
          pluginId,
          installed: true,
          enabled: true,
          version: VERSION,
        }),
      );
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          installed: [...(state.plugin ? [plugin] : []), ...legacyPlugins],
          available: state.plugin ? [] : [plugin],
        }),
        stderr: '',
      };
    }

    state.mutations.push(key);
    if (
      key ===
      'plugin marketplace add https://github.com/EremesNG/thoth-plugins.git --json'
    ) {
      state.marketplace = true;
    }
    if (key === 'plugin add thoth-agents@thoth-plugins --json') {
      state.plugin = true;
      state.enabled = true;
      state.pluginVersion = VERSION;
      state.afterCentralInstall?.();
    }
    if (key.startsWith('plugin remove ')) {
      const pluginId = key.split(' ')[2];
      if (pluginId) state.legacyPluginIds?.delete(pluginId);
    }
    if (key.startsWith('plugin marketplace remove ')) {
      const marketplaceName = key.split(' ')[3];
      if (marketplaceName) state.legacyMarketplaces?.delete(marketplaceName);
    }
    return { exitCode: 0, stdout: '{}', stderr: '' };
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('Codex native plugin installation', () => {
  test('routes Codex through an extension-neutral command on Windows', () => {
    const invocation = getCodexCommand(
      ['plugin', 'list', '--available', '--json'],
      { platform: 'win32', commandShell: 'C:\\Windows\\System32\\cmd.exe' },
    );

    expect(invocation).toEqual({
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        'codex',
        'plugin',
        'list',
        '--available',
        '--json',
      ],
    });
  });

  test('installs through the native manager and becomes an exact no-op', () => {
    const state: ManagerState = {
      marketplace: false,
      plugin: false,
      enabled: false,
      mutations: [],
    };
    const config = {
      ...testConfig('install-noop'),
      commandExecutor: executor(state),
    };

    const first = applyCodexPluginSetup(buildCodexPluginSetupPlan(config));

    expect(first).toMatchObject({
      success: true,
      changed: [
        'codex://marketplaces/thoth-plugins',
        'codex://plugins/thoth-agents@thoth-plugins',
      ],
    });
    expect(state.mutations).toEqual([
      'plugin marketplace add https://github.com/EremesNG/thoth-plugins.git --json',
      'plugin add thoth-agents@thoth-plugins --json',
    ]);

    state.mutations.length = 0;
    const secondPlan = buildCodexPluginSetupPlan(config);
    expect(secondPlan.items).toEqual([]);
    expect(applyCodexPluginSetup(secondPlan)).toMatchObject({
      success: true,
      changed: [],
    });
    expect(state.mutations).toEqual([]);
  });

  test('dry-run reports both commands without mutating manager state', () => {
    const state: ManagerState = {
      marketplace: false,
      plugin: false,
      enabled: false,
      mutations: [],
    };
    const plan = buildCodexPluginSetupPlan({
      dryRun: true,
      ...testConfig('dry-run'),
      commandExecutor: executor(state),
    });

    expect(plan.items.map((item) => item.action)).toEqual([
      'register-marketplace',
      'install-plugin',
    ]);
    expect(formatCodexPluginSetupPlan(plan)).toContain(
      'codex plugin add thoth-agents@thoth-plugins --json',
    );
    expect(applyCodexPluginSetup(plan)).toMatchObject({
      success: true,
      changed: [],
    });
    expect(state.mutations).toEqual([]);
  });

  test('rejects successful commands when Codex does not expose the final state', () => {
    const state: ManagerState = {
      marketplace: false,
      plugin: false,
      enabled: false,
      mutations: [],
    };
    const inspectionExecutor = executor(state);
    const commandExecutor: CodexCommandExecutor = (command, args, options) => {
      const key = args.join(' ');
      if (
        key ===
          'plugin marketplace add https://github.com/EremesNG/thoth-plugins.git --json' ||
        key === 'plugin add thoth-agents@thoth-plugins --json'
      ) {
        state.mutations.push(key);
        return { exitCode: 0, stdout: '{}', stderr: '' };
      }
      return inspectionExecutor(command, args, options);
    };

    const result = applyCodexPluginSetup(
      buildCodexPluginSetupPlan({
        ...testConfig('unverified-final-state'),
        commandExecutor,
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      'did not verify the expected marketplace and enabled plugin',
    );
    expect(state.mutations).toEqual([
      'plugin marketplace add https://github.com/EremesNG/thoth-plugins.git --json',
      'plugin add thoth-agents@thoth-plugins --json',
    ]);
  });

  test('re-enables an installed but disabled plugin through plugin add', () => {
    const state: ManagerState = {
      marketplace: true,
      plugin: true,
      enabled: false,
      mutations: [],
    };
    const plan = buildCodexPluginSetupPlan({
      ...testConfig('reenable'),
      commandExecutor: executor(state),
    });

    expect(plan.items.map((item) => item.action)).toEqual(['install-plugin']);
    expect(applyCodexPluginSetup(plan).success).toBe(true);
    expect(state.mutations).toEqual([
      'plugin add thoth-agents@thoth-plugins --json',
    ]);
  });

  test('repairs an enabled central plugin at the wrong version', () => {
    const state: ManagerState = {
      marketplace: true,
      plugin: true,
      enabled: true,
      pluginVersion: '0.3.10',
      mutations: [],
    };
    const plan = buildCodexPluginSetupPlan({
      ...testConfig('repair-version'),
      commandExecutor: executor(state),
    });

    expect(plan.items.map((item) => item.action)).toEqual(['install-plugin']);
    expect(applyCodexPluginSetup(plan).success).toBe(true);
    expect(state.pluginVersion).toBe(VERSION);
  });

  test('verifies the central identity before removing exact owned legacy manager state', () => {
    const state: ManagerState = {
      marketplace: false,
      plugin: false,
      enabled: false,
      legacyPluginIds: new Set([
        'thoth-agents@thoth-agents',
        'thoth-agents@thoth-agents-codex',
      ]),
      legacyMarketplaces: new Map([
        ['thoth-agents', 'https://github.com/EremesNG/thoth-agents.git'],
        ['thoth-agents-codex', 'https://github.com/EremesNG/thoth-agents.git'],
      ]),
      mutations: [],
    };

    const result = applyCodexPluginSetup(
      buildCodexPluginSetupPlan({
        ...testConfig('legacy-manager'),
        commandExecutor: executor(state),
      }),
    );

    expect(result.success).toBe(true);
    expect(state.mutations).toEqual([
      'plugin marketplace add https://github.com/EremesNG/thoth-plugins.git --json',
      'plugin add thoth-agents@thoth-plugins --json',
      'plugin remove thoth-agents@thoth-agents --json',
      'plugin remove thoth-agents@thoth-agents-codex --json',
      'plugin marketplace remove thoth-agents --json',
      'plugin marketplace remove thoth-agents-codex --json',
    ]);
    expect(state.legacyPluginIds?.size).toBe(0);
    expect(state.legacyMarketplaces?.size).toBe(0);
  });

  test('removes safe orphan roots while preserving sibling and unrelated Codex state, then becomes a no-op', () => {
    const config = testConfig('orphan-roots');
    const cacheRoot = seedLegacyCache(config.codexHome, 'thoth-agents-codex');
    const snapshotRoot = seedLegacySnapshot(
      config.codexHome,
      'thoth-agents-codex',
    );
    const sibling = join(
      config.codexHome,
      'plugins',
      'cache',
      'thoth-mem-codex',
      'control.txt',
    );
    const unrelated = join(
      config.codexHome,
      'plugins',
      'cache',
      'unrelated',
      'control.txt',
    );
    mkdirSync(join(sibling, '..'), { recursive: true });
    mkdirSync(join(unrelated, '..'), { recursive: true });
    writeFileSync(sibling, 'sibling-control\n');
    writeFileSync(unrelated, 'unrelated-control\n');
    const state: ManagerState = {
      marketplace: false,
      plugin: false,
      enabled: false,
      mutations: [],
    };
    const input = { ...config, commandExecutor: executor(state) };

    const plan = buildCodexPluginSetupPlan(input);
    expect(plan.items.map((item) => item.action)).toEqual([
      'register-marketplace',
      'install-plugin',
      'remove-legacy-root',
      'remove-legacy-root',
    ]);
    const first = applyCodexPluginSetup(plan);

    expect(first.success).toBe(true);
    expect(existsSync(cacheRoot)).toBe(false);
    expect(existsSync(snapshotRoot)).toBe(false);
    expect(readFileSync(sibling, 'utf8')).toBe('sibling-control\n');
    expect(readFileSync(unrelated, 'utf8')).toBe('unrelated-control\n');

    state.mutations.length = 0;
    const secondPlan = buildCodexPluginSetupPlan(input);
    expect(secondPlan.items).toEqual([]);
    expect(applyCodexPluginSetup(secondPlan)).toMatchObject({
      success: true,
      changed: [],
    });
    expect(state.mutations).toEqual([]);
  });

  test('dry-run reports exact manager and root cleanup without changing either', () => {
    const config = testConfig('cleanup-dry-run');
    const cacheRoot = seedLegacyCache(config.codexHome, 'thoth-agents');
    const state: ManagerState = {
      marketplace: true,
      plugin: true,
      enabled: true,
      legacyPluginIds: new Set(['thoth-agents@thoth-agents']),
      legacyMarketplaces: new Map([
        ['thoth-agents', 'https://github.com/EremesNG/thoth-agents.git'],
      ]),
      mutations: [],
    };
    const plan = buildCodexPluginSetupPlan({
      ...config,
      dryRun: true,
      commandExecutor: executor(state),
    });

    expect(plan.items.map((item) => item.action)).toEqual([
      'remove-legacy-plugin',
      'remove-legacy-marketplace',
      'remove-legacy-root',
    ]);
    expect(formatCodexPluginSetupPlan(plan)).toContain(
      'plugin remove thoth-agents@thoth-agents --json',
    );
    expect(formatCodexPluginSetupPlan(plan)).toContain(
      'plugins/cache/thoth-agents',
    );
    expect(applyCodexPluginSetup(plan)).toMatchObject({
      success: true,
      changed: [],
    });
    expect(existsSync(cacheRoot)).toBe(true);
    expect(state.mutations).toEqual([]);
  });

  test('rejects unsafe exact roots before any manager mutation', () => {
    for (const kind of ['file', 'link', 'foreign-manifest'] as const) {
      const config = testConfig(`unsafe-${kind}`);
      const root = join(
        config.codexHome,
        'plugins',
        'cache',
        'thoth-agents-codex',
      );
      mkdirSync(join(root, '..'), { recursive: true });
      if (kind === 'file') writeFileSync(root, 'not-a-directory\n');
      else if (kind === 'link') {
        const outside = join(config.codexHome, 'outside');
        mkdirSync(outside, { recursive: true });
        writeFileSync(join(outside, 'control.txt'), 'outside-control\n');
        symlinkSync(
          outside,
          root,
          process.platform === 'win32' ? 'junction' : 'dir',
        );
      } else {
        const manifestRoot = join(
          root,
          'thoth-agents',
          VERSION,
          '.codex-plugin',
        );
        mkdirSync(manifestRoot, { recursive: true });
        writeFileSync(
          join(manifestRoot, 'plugin.json'),
          `${JSON.stringify({ name: 'thoth-mem', version: VERSION })}\n`,
        );
      }
      const state: ManagerState = {
        marketplace: false,
        plugin: false,
        enabled: false,
        mutations: [],
      };

      const plan = buildCodexPluginSetupPlan({
        ...config,
        commandExecutor: executor(state),
      });
      const result = applyCodexPluginSetup(plan);

      expect(plan.ready).toBe(false);
      expect(plan.items).toEqual([]);
      expect(plan.diagnostics.join('\n')).toContain('preflight failed');
      expect(result.success).toBe(false);
      expect(state.mutations).toEqual([]);
      if (kind === 'link') {
        expect(
          readFileSync(
            join(config.codexHome, 'outside', 'control.txt'),
            'utf8',
          ),
        ).toBe('outside-control\n');
      }
    }
  });

  test('retains the verified central plugin on a cleanup race and converges on retry', () => {
    const config = testConfig('cleanup-retry');
    const cacheRoot = seedLegacyCache(config.codexHome, 'thoth-agents-codex');
    const state: ManagerState = {
      marketplace: false,
      plugin: false,
      enabled: false,
      mutations: [],
    };
    state.afterCentralInstall = () => {
      state.afterCentralInstall = undefined;
      rmSync(cacheRoot, { recursive: true, force: true });
      writeFileSync(cacheRoot, 'changed-after-preflight\n');
    };
    const input = { ...config, commandExecutor: executor(state) };

    const first = applyCodexPluginSetup(buildCodexPluginSetupPlan(input));

    expect(first.success).toBe(false);
    expect(first.error).toContain(
      'Central thoth-agents@thoth-plugins remains installed',
    );
    expect(first.error).toContain('Close Codex and retry');
    expect(state.plugin).toBe(true);
    expect(readFileSync(cacheRoot, 'utf8')).toBe('changed-after-preflight\n');

    rmSync(cacheRoot, { force: true });
    seedLegacyCache(config.codexHome, 'thoth-agents-codex');
    state.mutations.length = 0;
    const second = applyCodexPluginSetup(buildCodexPluginSetupPlan(input));

    expect(second.success).toBe(true);
    expect(existsSync(cacheRoot)).toBe(false);
    expect(state.plugin).toBe(true);
    expect(state.mutations).toEqual([]);
  });

  test('rejects conflicting legacy manager and snapshot provenance without mutation', () => {
    const managerConfig = testConfig('legacy-manager-conflict');
    const managerState: ManagerState = {
      marketplace: false,
      plugin: false,
      enabled: false,
      legacyMarketplaces: new Map([
        ['thoth-agents-codex', 'https://example.invalid/unrelated.git'],
      ]),
      mutations: [],
    };
    const managerPlan = buildCodexPluginSetupPlan({
      ...managerConfig,
      commandExecutor: executor(managerState),
    });

    expect(managerPlan.ready).toBe(false);
    expect(managerPlan.items).toEqual([]);
    expect(managerPlan.diagnostics.join('\n')).toContain(
      'provenance conflicts',
    );
    expect(managerState.mutations).toEqual([]);

    const snapshotConfig = testConfig('legacy-snapshot-conflict');
    const snapshotRoot = seedLegacySnapshot(
      snapshotConfig.codexHome,
      'thoth-agents-codex',
    );
    writeFileSync(
      join(snapshotRoot, '.codex-marketplace-install.json'),
      `${JSON.stringify({ source_type: 'git', source: 'https://example.invalid/unrelated.git' })}\n`,
    );
    const snapshotState: ManagerState = {
      marketplace: false,
      plugin: false,
      enabled: false,
      mutations: [],
    };
    const snapshotPlan = buildCodexPluginSetupPlan({
      ...snapshotConfig,
      commandExecutor: executor(snapshotState),
    });

    expect(snapshotPlan.ready).toBe(false);
    expect(snapshotPlan.items).toEqual([]);
    expect(snapshotPlan.diagnostics.join('\n')).toContain(
      'conflicting provenance',
    );
    expect(snapshotState.mutations).toEqual([]);
  });

  test('retains central state when an official legacy removal command fails', () => {
    const state: ManagerState = {
      marketplace: true,
      plugin: true,
      enabled: true,
      legacyPluginIds: new Set(['thoth-agents@thoth-agents-codex']),
      mutations: [],
    };
    const baseExecutor = executor(state);
    const commandExecutor: CodexCommandExecutor = (command, args, options) => {
      if (
        args.join(' ') ===
        'plugin remove thoth-agents@thoth-agents-codex --json'
      ) {
        return { exitCode: 23, stdout: '', stderr: 'cache is locked' };
      }
      return baseExecutor(command, args, options);
    };

    const result = applyCodexPluginSetup(
      buildCodexPluginSetupPlan({
        ...testConfig('manager-cleanup-failure'),
        commandExecutor,
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('cache is locked');
    expect(result.error).toContain(
      'Central thoth-agents@thoth-plugins remains installed',
    );
    expect(state.plugin).toBe(true);
    expect([...(state.legacyPluginIds ?? [])]).toEqual([
      'thoth-agents@thoth-agents-codex',
    ]);
  });

  test('fails closed when the marketplace name belongs to another source', () => {
    const mutations: string[] = [];
    const commandExecutor: CodexCommandExecutor = (_command, args) => {
      const key = args.join(' ');
      if (key === 'plugin marketplace list --json') {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            marketplaces: [
              {
                name: 'thoth-plugins',
                marketplaceSource: {
                  sourceType: 'git',
                  source: 'https://github.com/example/not-thoth-agents.git',
                },
              },
            ],
          }),
          stderr: '',
        };
      }
      if (key === 'plugin list --available --json') {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ installed: [], available: [] }),
          stderr: '',
        };
      }
      mutations.push(key);
      return { exitCode: 0, stdout: '{}', stderr: '' };
    };

    const plan = buildCodexPluginSetupPlan({
      ...testConfig('central-conflict'),
      commandExecutor,
    });
    const result = applyCodexPluginSetup(plan);

    expect(plan.ready).toBe(false);
    expect(plan.items).toEqual([]);
    expect(result).toMatchObject({
      success: false,
      changed: [],
      error: 'Codex native plugin manager state is not safe to mutate.',
    });
    expect(result.diagnostics.join('\n')).toContain('different source');
    expect(mutations).toEqual([]);
  });

  test('fails closed when Codex returns unreadable manager JSON', () => {
    const commandExecutor: CodexCommandExecutor = (_command, args) => ({
      exitCode: 0,
      stdout:
        args.join(' ') === 'plugin marketplace list --json'
          ? 'not-json'
          : JSON.stringify({ installed: [], available: [] }),
      stderr: '',
    });

    const plan = buildCodexPluginSetupPlan({
      ...testConfig('unreadable-json'),
      commandExecutor,
    });

    expect(plan.ready).toBe(false);
    expect(plan.items).toEqual([]);
    expect(applyCodexPluginSetup(plan).success).toBe(false);
    expect(plan.diagnostics.join('\n')).toContain('unparseable');
  });

  test('returns a bounded error when a native manager command fails', () => {
    const state: ManagerState = {
      marketplace: false,
      plugin: false,
      enabled: false,
      mutations: [],
    };
    const baseExecutor = executor(state);
    const commandExecutor: CodexCommandExecutor = (command, args, options) => {
      if (
        args.join(' ') ===
        'plugin marketplace add https://github.com/EremesNG/thoth-plugins.git --json'
      ) {
        return {
          exitCode: 17,
          stdout: '',
          stderr: `manager failed\n${'private-detail '.repeat(50)}`,
        };
      }
      return baseExecutor(command, args, options);
    };

    const result = applyCodexPluginSetup(
      buildCodexPluginSetupPlan({
        ...testConfig('command-failure'),
        commandExecutor,
      }),
    );

    expect(result.success).toBe(false);
    expect(result.changed).toEqual([]);
    expect(result.error).toContain('Codex exited with code 17: manager failed');
    expect(result.error?.length).toBeLessThan(400);
    expect(state.mutations).toEqual([]);
  });
});
