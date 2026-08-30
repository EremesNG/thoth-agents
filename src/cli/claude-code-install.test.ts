import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  applyClaudeCodeSetup,
  buildClaudeCodeSetupPlan,
  type ClaudeCodeInstallConfig,
  type ClaudeCommandExecutor,
  isClaudeCodeModelAlias,
} from './claude-code-install';

interface ManagerState {
  marketplace: boolean;
  plugin: boolean;
  enabled: boolean;
  legacy?: boolean;
  source?: string;
  failMutation?: boolean;
  failInspection?: boolean;
  mutations: string[];
}

let projectRoot: string;

function executor(state: ManagerState): ClaudeCommandExecutor {
  return (_command, args) => {
    const key = args.join(' ');
    if (key === 'plugin marketplace list --json') {
      if (state.failInspection) {
        return { exitCode: 1, stdout: '', stderr: 'inspection failed' };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify([
          ...(state.marketplace
            ? [
                {
                  name: 'thoth-agents-claude',
                  source: 'github',
                  repo: state.source ?? 'EremesNG/thoth-agents',
                },
              ]
            : []),
          ...(state.legacy
            ? [
                {
                  name: 'thoth-agents',
                  source: 'github',
                  repo: 'EremesNG/thoth-agents',
                },
              ]
            : []),
        ]),
        stderr: '',
      };
    }
    if (key === 'plugin list --json') {
      if (state.failInspection) {
        return { exitCode: 1, stdout: '', stderr: 'inspection failed' };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify([
          ...(state.plugin
            ? [
                {
                  id: 'thoth-agents@thoth-agents-claude',
                  scope: 'user',
                  enabled: state.enabled,
                },
              ]
            : []),
          ...(state.legacy
            ? [
                {
                  id: 'thoth-agents@thoth-agents',
                  scope: 'user',
                  enabled: true,
                },
              ]
            : []),
        ]),
        stderr: '',
      };
    }
    state.mutations.push(key);
    if (state.failMutation) {
      return {
        exitCode: 17,
        stdout: '',
        stderr: `native mutation failed for ${key}`,
      };
    }
    if (key.startsWith('plugin marketplace add ')) {
      state.marketplace = true;
      state.source = 'https://github.com/EremesNG/thoth-agents.git#master';
    }
    if (key.startsWith('plugin install ')) {
      state.plugin = true;
      state.enabled = true;
    }
    if (key.startsWith('plugin enable ')) state.enabled = true;
    return { exitCode: 0, stdout: 'ok', stderr: '' };
  };
}

function config(
  state: ManagerState,
  overrides: Partial<ClaudeCodeInstallConfig> = {},
): ClaudeCodeInstallConfig {
  return {
    dryRun: false,
    reset: false,
    scope: 'user',
    projectRoot,
    commandExecutor: executor(state),
    ...overrides,
  };
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'cc-native-install-'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('claude-code-install', () => {
  test('recognizes only documented Claude model aliases', () => {
    expect(isClaudeCodeModelAlias('opus')).toBe(true);
    expect(isClaudeCodeModelAlias('gpt-5.4')).toBe(false);
  });

  test('dry-run plans native marketplace operations without mutating manager state', () => {
    const state: ManagerState = {
      marketplace: false,
      plugin: false,
      enabled: false,
      mutations: [],
    };
    const plan = buildClaudeCodeSetupPlan(config(state, { dryRun: true }));

    expect(plan.items.map((item) => item.action)).toEqual([
      'register-marketplace',
      'install-plugin',
    ]);
    expect(applyClaudeCodeSetup(plan)).toMatchObject({
      success: true,
      changed: [],
    });
    expect(state.mutations).toEqual([]);
    expect(existsSync(join(projectRoot, '.claude', 'skills'))).toBe(false);
  });

  test('installs through the native manager and becomes an exact no-op', () => {
    const state: ManagerState = {
      marketplace: false,
      plugin: false,
      enabled: false,
      mutations: [],
    };

    const first = applyClaudeCodeSetup(buildClaudeCodeSetupPlan(config(state)));
    expect(first).toMatchObject({
      success: true,
      changed: [
        'claude://marketplaces/thoth-agents-claude',
        'claude://plugins/thoth-agents@thoth-agents-claude',
      ],
    });
    expect(state.mutations).toEqual([
      'plugin marketplace add https://github.com/EremesNG/thoth-agents.git#master --scope user',
      'plugin install thoth-agents@thoth-agents-claude --scope user',
    ]);
    expect(existsSync(join(projectRoot, '.claude', 'skills'))).toBe(false);

    state.mutations.length = 0;
    const secondPlan = buildClaudeCodeSetupPlan(config(state));
    expect(secondPlan.items).toEqual([]);
    expect(applyClaudeCodeSetup(secondPlan)).toMatchObject({
      success: true,
      changed: [],
    });
    expect(state.mutations).toEqual([]);
  });

  test('enables an installed disabled plugin without reinstalling it', () => {
    const state: ManagerState = {
      marketplace: true,
      plugin: true,
      enabled: false,
      mutations: [],
    };
    const plan = buildClaudeCodeSetupPlan(config(state));

    expect(plan.items.map((item) => item.action)).toEqual(['enable-plugin']);
    expect(applyClaudeCodeSetup(plan).success).toBe(true);
    expect(state.mutations).toEqual([
      'plugin enable thoth-agents@thoth-agents-claude --scope user',
    ]);
  });

  test('refreshes an installed plugin through the native manager', () => {
    const state: ManagerState = {
      marketplace: true,
      plugin: true,
      enabled: true,
      mutations: [],
    };
    const plan = buildClaudeCodeSetupPlan(config(state, { refresh: true }));

    expect(plan.items.map((item) => item.action)).toEqual(['update-plugin']);
    expect(applyClaudeCodeSetup(plan).success).toBe(true);
    expect(state.mutations).toEqual([
      'plugin update thoth-agents@thoth-agents-claude --scope user',
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

    const result = applyClaudeCodeSetup(
      buildClaudeCodeSetupPlan(config(state)),
    );

    expect(result.success).toBe(true);
    expect(result.diagnostics.join('\n')).toContain('Legacy Claude');
    expect(state.mutations).toEqual([
      'plugin marketplace add https://github.com/EremesNG/thoth-agents.git#master --scope user',
      'plugin install thoth-agents@thoth-agents-claude --scope user',
    ]);
    expect(
      state.mutations.some((mutation) =>
        /\b(?:remove|uninstall)\b/u.test(mutation),
      ),
    ).toBe(false);
  });

  test('fails closed for unreadable or conflicting marketplace state', () => {
    const unreadable: ManagerState = {
      marketplace: false,
      plugin: false,
      enabled: false,
      failInspection: true,
      mutations: [],
    };
    const unreadablePlan = buildClaudeCodeSetupPlan(config(unreadable));
    expect(unreadablePlan.ready).toBe(false);
    expect(applyClaudeCodeSetup(unreadablePlan).success).toBe(false);
    expect(unreadable.mutations).toEqual([]);

    const conflict: ManagerState = {
      marketplace: true,
      plugin: false,
      enabled: false,
      source: 'other/thoth-agents',
      mutations: [],
    };
    const conflictPlan = buildClaudeCodeSetupPlan(config(conflict));
    expect(conflictPlan.ready).toBe(false);
    expect(applyClaudeCodeSetup(conflictPlan).success).toBe(false);
    expect(conflict.mutations).toEqual([]);
  });

  test('reports bounded native command failure without writing plugin files', () => {
    const state: ManagerState = {
      marketplace: false,
      plugin: false,
      enabled: false,
      failMutation: true,
      mutations: [],
    };

    const result = applyClaudeCodeSetup(
      buildClaudeCodeSetupPlan(config(state)),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('exited with code 17');
    expect(existsSync(join(projectRoot, '.claude', 'skills'))).toBe(false);
  });
});
