import { describe, expect, test } from 'vitest';
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
  legacy?: boolean;
  mutations: string[];
}

function executor(state: ManagerState): CodexCommandExecutor {
  return (_command, args) => {
    const key = args.join(' ');
    if (key === 'plugin marketplace list --json') {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          marketplaces: [
            ...(state.marketplace
              ? [
                  {
                    name: 'thoth-agents-codex',
                    marketplaceSource: {
                      sourceType: 'git',
                      source: 'https://github.com/EremesNG/thoth-agents.git',
                    },
                  },
                ]
              : []),
            ...(state.legacy
              ? [
                  {
                    name: 'thoth-agents',
                    marketplaceSource: {
                      sourceType: 'git',
                      source: 'https://github.com/EremesNG/thoth-agents.git',
                    },
                  },
                ]
              : []),
          ],
        }),
        stderr: '',
      };
    }
    if (key === 'plugin list --available --json') {
      const plugin = {
        pluginId: 'thoth-agents@thoth-agents-codex',
        installed: state.plugin,
        enabled: state.enabled,
      };
      const legacyPlugin = {
        pluginId: 'thoth-agents@thoth-agents',
        installed: true,
        enabled: true,
      };
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          installed: [
            ...(state.plugin ? [plugin] : []),
            ...(state.legacy ? [legacyPlugin] : []),
          ],
          available: state.plugin ? [] : [plugin],
        }),
        stderr: '',
      };
    }

    state.mutations.push(key);
    if (
      key === 'plugin marketplace add EremesNG/thoth-agents --ref master --json'
    ) {
      state.marketplace = true;
    }
    if (key === 'plugin add thoth-agents@thoth-agents-codex --json') {
      state.plugin = true;
      state.enabled = true;
    }
    return { exitCode: 0, stdout: '{}', stderr: '' };
  };
}

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
      projectRoot: process.cwd(),
      commandExecutor: executor(state),
    };

    const first = applyCodexPluginSetup(buildCodexPluginSetupPlan(config));

    expect(first).toMatchObject({
      success: true,
      changed: [
        'codex://marketplaces/thoth-agents-codex',
        'codex://plugins/thoth-agents@thoth-agents-codex',
      ],
    });
    expect(state.mutations).toEqual([
      'plugin marketplace add EremesNG/thoth-agents --ref master --json',
      'plugin add thoth-agents@thoth-agents-codex --json',
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
      projectRoot: process.cwd(),
      commandExecutor: executor(state),
    });

    expect(plan.items.map((item) => item.action)).toEqual([
      'register-marketplace',
      'install-plugin',
    ]);
    expect(formatCodexPluginSetupPlan(plan)).toContain(
      'codex plugin add thoth-agents@thoth-agents-codex --json',
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
          'plugin marketplace add EremesNG/thoth-agents --ref master --json' ||
        key === 'plugin add thoth-agents@thoth-agents-codex --json'
      ) {
        state.mutations.push(key);
        return { exitCode: 0, stdout: '{}', stderr: '' };
      }
      return inspectionExecutor(command, args, options);
    };

    const result = applyCodexPluginSetup(
      buildCodexPluginSetupPlan({
        projectRoot: process.cwd(),
        commandExecutor,
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      'did not verify the expected marketplace and enabled plugin',
    );
    expect(state.mutations).toEqual([
      'plugin marketplace add EremesNG/thoth-agents --ref master --json',
      'plugin add thoth-agents@thoth-agents-codex --json',
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
      projectRoot: process.cwd(),
      commandExecutor: executor(state),
    });

    expect(plan.items.map((item) => item.action)).toEqual(['install-plugin']);
    expect(applyCodexPluginSetup(plan).success).toBe(true);
    expect(state.mutations).toEqual([
      'plugin add thoth-agents@thoth-agents-codex --json',
    ]);
  });

  test('installs the host-specific identity while preserving legacy manager state', () => {
    const state: ManagerState = {
      marketplace: false,
      plugin: false,
      enabled: false,
      legacy: true,
      mutations: [],
    };

    const result = applyCodexPluginSetup(
      buildCodexPluginSetupPlan({
        projectRoot: process.cwd(),
        commandExecutor: executor(state),
      }),
    );

    expect(result.success).toBe(true);
    expect(result.diagnostics.join('\n')).toContain('Legacy Codex');
    expect(state.mutations).toEqual([
      'plugin marketplace add EremesNG/thoth-agents --ref master --json',
      'plugin add thoth-agents@thoth-agents-codex --json',
    ]);
    expect(
      state.mutations.some((mutation) =>
        /\b(?:remove|uninstall)\b/u.test(mutation),
      ),
    ).toBe(false);
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
                name: 'thoth-agents-codex',
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
      projectRoot: process.cwd(),
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
      projectRoot: process.cwd(),
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
        'plugin marketplace add EremesNG/thoth-agents --ref master --json'
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
        projectRoot: process.cwd(),
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
