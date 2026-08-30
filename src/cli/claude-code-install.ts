import { spawnSync } from 'node:child_process';
import { isClaudeCodeModel } from '../harness/writers/claude-code-subagent';
import type { ClaudeCodeInstallScope } from './claude-code-paths';

export { CLAUDE_CODE_ROLE_NAMES } from './claude-code-paths';

const PLUGIN_NAME = 'thoth-agents';
const MARKETPLACE_NAME = `${PLUGIN_NAME}-claude`;
const MARKETPLACE_SOURCE = 'EremesNG/thoth-agents';
const MARKETPLACE_REF = 'master';
const MARKETPLACE_INSTALL_SOURCE = `https://github.com/${MARKETPLACE_SOURCE}.git#${MARKETPLACE_REF}`;
const PLUGIN_ID = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;
const LEGACY_MARKETPLACE_NAME = PLUGIN_NAME;
const LEGACY_PLUGIN_ID = `${PLUGIN_NAME}@${LEGACY_MARKETPLACE_NAME}`;
const MARKETPLACE_TARGET = `claude://marketplaces/${MARKETPLACE_NAME}`;
const PLUGIN_TARGET = `claude://plugins/${PLUGIN_ID}`;

export type ClaudeCodeSetupAction =
  | 'register-marketplace'
  | 'install-plugin'
  | 'update-plugin'
  | 'enable-plugin';

export type ClaudeCodeTargetKind = 'native-marketplace' | 'native-plugin';

export interface ClaudeCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ClaudeCommandOptions {
  cwd: string;
}

export type ClaudeCommandExecutor = (
  command: string,
  args: readonly string[],
  options: ClaudeCommandOptions,
) => ClaudeCommandResult;

export interface ClaudeCodeInstallConfig {
  dryRun?: boolean;
  reset: boolean;
  scope: ClaudeCodeInstallScope;
  projectRoot: string;
  commandExecutor?: ClaudeCommandExecutor;
  refresh?: boolean;
}

export interface ClaudeCodeSetupPlanItem {
  kind: ClaudeCodeTargetKind;
  action: ClaudeCodeSetupAction;
  targetPath: string;
  description: string;
  requiresBackup: false;
  command: {
    executable: 'claude';
    args: string[];
    cwd: string;
  };
}

export interface ClaudeCodeSetupPlan {
  dryRun: boolean;
  reset: boolean;
  items: ClaudeCodeSetupPlanItem[];
  diagnostics: string[];
  disclaimers: string[];
  pluginRoot: string;
  ready: boolean;
  scope: ClaudeCodeInstallScope;
  projectRoot: string;
  commandExecutor: ClaudeCommandExecutor;
}

export interface ClaudeCodeApplyResult {
  success: boolean;
  changed: string[];
  diagnostics: string[];
  error?: string;
}

interface ClaudeManagerInspection {
  ready: boolean;
  marketplace: 'absent' | 'installed' | 'conflict' | 'unknown';
  plugin: 'absent' | 'installed' | 'disabled' | 'unknown';
  diagnostics: string[];
}

export const isClaudeCodeModelAlias = isClaudeCodeModel;

function defaultCommandExecutor(
  command: string,
  args: readonly string[],
  options: ClaudeCommandOptions,
): ClaudeCommandResult {
  const result = spawnSync(command, [...args], {
    cwd: options.cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  return {
    exitCode: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? result.error?.message ?? '',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonRecords(content: string): Record<string, unknown>[] | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed) && parsed.every(isRecord)) return parsed;
    if (isRecord(parsed)) return [parsed];
    return null;
  } catch {
    return null;
  }
}

function isCanonicalMarketplace(entry: Record<string, unknown>): boolean {
  return isMarketplaceIdentity(entry, MARKETPLACE_NAME);
}

function normalizeMarketplaceSource(value: string): string {
  return value
    .trim()
    .replace(/#.*$/u, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/^(?:https?|ssh):\/\/(?:git@)?github\.com\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/\/?\.git\/?$/i, '')
    .replace(/\/$/u, '')
    .toLowerCase();
}

function marketplaceSources(entry: Record<string, unknown>): string[] {
  const sources = [entry.repo, entry.source];
  if (isRecord(entry.marketplaceSource)) {
    sources.push(entry.marketplaceSource.repo, entry.marketplaceSource.source);
  }
  return sources.filter(
    (source): source is string => typeof source === 'string',
  );
}

function isMarketplaceIdentity(
  entry: Record<string, unknown>,
  name: string,
): boolean {
  if (entry.name !== name) return false;
  const canonical = MARKETPLACE_SOURCE.toLowerCase();
  return marketplaceSources(entry).some(
    (source) => normalizeMarketplaceSource(source) === canonical,
  );
}

function inspectClaudeManager(
  executor: ClaudeCommandExecutor,
  cwd: string,
  scope: ClaudeCodeInstallScope,
): ClaudeManagerInspection {
  const marketplaceResult = executor(
    'claude',
    ['plugin', 'marketplace', 'list', '--json'],
    { cwd },
  );
  const pluginResult = executor('claude', ['plugin', 'list', '--json'], {
    cwd,
  });
  const diagnostics: string[] = [];

  if (marketplaceResult.exitCode !== 0 || pluginResult.exitCode !== 0) {
    diagnostics.push(
      'Claude Code native plugin state could not be inspected; no manager mutation will be attempted.',
    );
    return {
      ready: false,
      marketplace: 'unknown',
      plugin: 'unknown',
      diagnostics,
    };
  }

  const marketplaces = parseJsonRecords(marketplaceResult.stdout);
  const plugins = parseJsonRecords(pluginResult.stdout);
  if (!marketplaces || !plugins) {
    diagnostics.push(
      'Claude Code returned unparseable plugin manager JSON; no manager mutation will be attempted.',
    );
    return {
      ready: false,
      marketplace: 'unknown',
      plugin: 'unknown',
      diagnostics,
    };
  }

  const legacyMarketplace = marketplaces.some((entry) =>
    isMarketplaceIdentity(entry, LEGACY_MARKETPLACE_NAME),
  );
  const hasLegacyState =
    legacyMarketplace || plugins.some((entry) => entry.id === LEGACY_PLUGIN_ID);
  if (hasLegacyState) {
    diagnostics.push(
      'Legacy Claude thoth-agents marketplace or plugin state was detected and preserved; the host-specific identity will be managed independently.',
    );
  }

  const namedMarketplaces = marketplaces.filter(
    (entry) => entry.name === MARKETPLACE_NAME,
  );
  let marketplace: ClaudeManagerInspection['marketplace'] = 'absent';
  if (namedMarketplaces.length > 0) {
    marketplace = namedMarketplaces.every(isCanonicalMarketplace)
      ? 'installed'
      : 'conflict';
  }
  if (marketplace === 'conflict') {
    diagnostics.push(
      'A Claude marketplace named thoth-agents-claude is registered from a different source; resolve it through Claude Code before retrying.',
    );
  }

  const matchingPlugins = plugins.filter(
    (entry) => entry.id === PLUGIN_ID && entry.scope === scope,
  );
  let plugin: ClaudeManagerInspection['plugin'] = 'absent';
  if (matchingPlugins.some((entry) => entry.enabled === true)) {
    plugin = 'installed';
  } else if (matchingPlugins.length > 0) {
    plugin = 'disabled';
  }

  return {
    ready: marketplace !== 'conflict',
    marketplace,
    plugin,
    diagnostics,
  };
}

function commandItem(
  action: ClaudeCodeSetupAction,
  scope: ClaudeCodeInstallScope,
  projectRoot: string,
): ClaudeCodeSetupPlanItem {
  if (action === 'register-marketplace') {
    return {
      kind: 'native-marketplace',
      action,
      targetPath: MARKETPLACE_TARGET,
      description:
        'Register the package-owned thoth-agents Claude marketplace.',
      requiresBackup: false,
      command: {
        executable: 'claude',
        args: [
          'plugin',
          'marketplace',
          'add',
          MARKETPLACE_INSTALL_SOURCE,
          '--scope',
          scope,
        ],
        cwd: projectRoot,
      },
    };
  }

  let command = 'install';
  let description =
    'Install the thoth-agents Claude plugin from its native marketplace.';
  if (action === 'enable-plugin') {
    command = 'enable';
    description = 'Enable the manager-owned thoth-agents Claude plugin.';
  } else if (action === 'update-plugin') {
    command = 'update';
    description = 'Update the manager-owned thoth-agents Claude plugin.';
  }

  return {
    kind: 'native-plugin',
    action,
    targetPath: PLUGIN_TARGET,
    description,
    requiresBackup: false,
    command: {
      executable: 'claude',
      args: ['plugin', command, PLUGIN_ID, '--scope', scope],
      cwd: projectRoot,
    },
  };
}

export function buildClaudeCodeSetupPlan(
  config: ClaudeCodeInstallConfig,
): ClaudeCodeSetupPlan {
  const commandExecutor = config.commandExecutor ?? defaultCommandExecutor;
  const inspection = inspectClaudeManager(
    commandExecutor,
    config.projectRoot,
    config.scope,
  );
  const items: ClaudeCodeSetupPlanItem[] = [];

  if (inspection.ready) {
    if (inspection.marketplace === 'absent') {
      items.push(
        commandItem('register-marketplace', config.scope, config.projectRoot),
      );
    }
    if (inspection.plugin === 'absent') {
      items.push(
        commandItem('install-plugin', config.scope, config.projectRoot),
      );
    } else if (inspection.plugin === 'disabled') {
      items.push(
        commandItem('enable-plugin', config.scope, config.projectRoot),
      );
      if (config.refresh === true || config.reset) {
        items.push(
          commandItem('update-plugin', config.scope, config.projectRoot),
        );
      }
    } else if (config.refresh === true || config.reset) {
      items.push(
        commandItem('update-plugin', config.scope, config.projectRoot),
      );
    }
  }

  return {
    dryRun: config.dryRun === true,
    reset: config.reset,
    items,
    pluginRoot: PLUGIN_TARGET,
    ready: inspection.ready,
    scope: config.scope,
    projectRoot: config.projectRoot,
    commandExecutor,
    diagnostics: [
      ...inspection.diagnostics,
      'Claude Code installs thoth-agents from EremesNG/thoth-agents through its native marketplace and owns the cached plugin files.',
      'Restart Claude Code or run /reload-plugins after installation; use /plugin to inspect marketplace and plugin state.',
      'Provider capability is owned by the external provider and is not established by this thoth-agents setup plan.',
    ],
    disclaimers: [
      'The native plugin activates its orchestrator agent as the main thread through plugin-root settings.json.',
      'Read-only subagents remain instruction/tool-denylist constrained; capability parity with other harnesses is not implied.',
      'Per-role Claude model rewrites are unavailable because native marketplace cache contents are manager-owned and immutable to thoth-agents.',
    ],
  };
}

function uniqueMessages(messages: string[]): string[] {
  return [...new Set(messages)];
}

function boundedCommandFailure(
  item: ClaudeCodeSetupPlanItem,
  result: ClaudeCommandResult,
): string {
  const detail = result.stderr.trim().replace(/\s+/g, ' ').slice(0, 240);
  return `${item.description} Claude exited with code ${result.exitCode}${detail ? `: ${detail}` : '.'}`;
}

export function applyClaudeCodeSetup(
  plan: ClaudeCodeSetupPlan,
): ClaudeCodeApplyResult {
  const changed: string[] = [];
  const diagnostics = uniqueMessages([
    ...plan.diagnostics,
    ...plan.disclaimers,
  ]);
  if (!plan.ready) {
    return {
      success: false,
      changed,
      diagnostics,
      error: 'Claude Code native plugin manager state is not safe to mutate.',
    };
  }
  if (plan.dryRun) return { success: true, changed, diagnostics };

  for (const item of plan.items) {
    const result = plan.commandExecutor(
      item.command.executable,
      item.command.args,
      { cwd: item.command.cwd },
    );
    if (result.exitCode !== 0) {
      return {
        success: false,
        changed,
        diagnostics,
        error: boundedCommandFailure(item, result),
      };
    }
    changed.push(item.targetPath);
  }

  const inspection = inspectClaudeManager(
    plan.commandExecutor,
    plan.projectRoot,
    plan.scope,
  );
  diagnostics.push(...inspection.diagnostics);
  if (
    inspection.marketplace !== 'installed' ||
    inspection.plugin !== 'installed'
  ) {
    return {
      success: false,
      changed,
      diagnostics: uniqueMessages(diagnostics),
      error:
        'Claude Code did not verify the expected marketplace and enabled plugin after mutation.',
    };
  }

  return { success: true, changed, diagnostics: uniqueMessages(diagnostics) };
}

export function formatClaudeCodeSetupPlan(plan: ClaudeCodeSetupPlan): string {
  const lines = plan.items.map(
    (item) =>
      `- ${item.action}: ${item.command.executable} ${item.command.args.join(' ')}`,
  );
  return ['Claude Code setup plan:', ...lines].join('\n');
}
