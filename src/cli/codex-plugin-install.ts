import { spawnSync } from 'node:child_process';

const MARKETPLACE_NAME = 'thoth-agents';
const MARKETPLACE_SOURCE = 'EremesNG/thoth-agents';
const PLUGIN_ID = 'thoth-agents@thoth-agents';
const MARKETPLACE_TARGET = 'codex://marketplaces/thoth-agents';
const PLUGIN_TARGET = 'codex://plugins/thoth-agents@thoth-agents';

export type CodexPluginSetupAction = 'register-marketplace' | 'install-plugin';

export interface CodexCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CodexCommandOptions {
  cwd: string;
}

export interface CodexCommandInvocationOptions {
  platform?: NodeJS.Platform;
  commandShell?: string;
}

export interface CodexCommandInvocation {
  command: string;
  args: string[];
}

export type CodexCommandExecutor = (
  command: string,
  args: readonly string[],
  options: CodexCommandOptions,
) => CodexCommandResult;

export interface CodexPluginInstallConfig {
  dryRun?: boolean;
  projectRoot: string;
  commandExecutor?: CodexCommandExecutor;
}

export interface CodexPluginSetupPlanItem {
  action: CodexPluginSetupAction;
  targetPath: string;
  description: string;
  command: {
    executable: 'codex';
    args: string[];
    cwd: string;
  };
}

export interface CodexPluginSetupPlan {
  dryRun: boolean;
  items: CodexPluginSetupPlanItem[];
  diagnostics: string[];
  ready: boolean;
  projectRoot: string;
  commandExecutor: CodexCommandExecutor;
}

export interface CodexPluginApplyResult {
  success: boolean;
  changed: string[];
  diagnostics: string[];
  error?: string;
}

interface CodexManagerInspection {
  ready: boolean;
  marketplace: 'absent' | 'installed' | 'conflict' | 'unknown';
  plugin: 'absent' | 'installed' | 'disabled' | 'unknown';
  diagnostics: string[];
}

export function getCodexCommand(
  args: readonly string[],
  options: CodexCommandInvocationOptions = {},
): CodexCommandInvocation {
  if ((options.platform ?? process.platform) !== 'win32') {
    return { command: 'codex', args: [...args] };
  }

  return {
    command: options.commandShell ?? process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', 'codex.cmd', ...args],
  };
}

function defaultCommandExecutor(
  command: string,
  args: readonly string[],
  options: CodexCommandOptions,
): CodexCommandResult {
  const invocation =
    command === 'codex' ? getCodexCommand(args) : { command, args: [...args] };
  const result = spawnSync(invocation.command, invocation.args, {
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

function parseRecordArray(value: unknown): Record<string, unknown>[] | null {
  return Array.isArray(value) && value.every(isRecord) ? value : null;
}

function parseManagerRecord(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeMarketplaceSource(value: string): string {
  return value
    .trim()
    .replace(/^git@github\.com:/i, '')
    .replace(/^(?:https?|ssh):\/\/(?:git@)?github\.com\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/\/?\.git\/?$/i, '')
    .replace(/\/$/, '')
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

function isCanonicalMarketplace(entry: Record<string, unknown>): boolean {
  if (entry.name !== MARKETPLACE_NAME) return false;
  const canonical = MARKETPLACE_SOURCE.toLowerCase();
  return marketplaceSources(entry).some(
    (source) => normalizeMarketplaceSource(source) === canonical,
  );
}

function inspectCodexManager(
  executor: CodexCommandExecutor,
  cwd: string,
): CodexManagerInspection {
  const marketplaceResult = executor(
    'codex',
    ['plugin', 'marketplace', 'list', '--json'],
    { cwd },
  );
  const pluginResult = executor(
    'codex',
    ['plugin', 'list', '--available', '--json'],
    { cwd },
  );
  const diagnostics: string[] = [];

  if (marketplaceResult.exitCode !== 0 || pluginResult.exitCode !== 0) {
    diagnostics.push(
      'Codex native plugin state could not be inspected; no manager mutation will be attempted.',
    );
    return {
      ready: false,
      marketplace: 'unknown',
      plugin: 'unknown',
      diagnostics,
    };
  }

  const marketplaceRecord = parseManagerRecord(marketplaceResult.stdout);
  const pluginRecord = parseManagerRecord(pluginResult.stdout);
  const marketplaces = marketplaceRecord
    ? parseRecordArray(marketplaceRecord.marketplaces)
    : null;
  const installedPlugins = pluginRecord
    ? parseRecordArray(pluginRecord.installed)
    : null;
  if (!marketplaces || !installedPlugins) {
    diagnostics.push(
      'Codex returned unparseable plugin manager JSON; no manager mutation will be attempted.',
    );
    return {
      ready: false,
      marketplace: 'unknown',
      plugin: 'unknown',
      diagnostics,
    };
  }

  const namedMarketplaces = marketplaces.filter(
    (entry) => entry.name === MARKETPLACE_NAME,
  );
  let marketplace: CodexManagerInspection['marketplace'] = 'absent';
  if (namedMarketplaces.length > 0) {
    marketplace = namedMarketplaces.every(isCanonicalMarketplace)
      ? 'installed'
      : 'conflict';
  }
  if (marketplace === 'conflict') {
    diagnostics.push(
      'A Codex marketplace named thoth-agents is registered from a different source; resolve it through Codex before retrying.',
    );
  }

  const matchingPlugins = installedPlugins.filter(
    (entry) => entry.pluginId === PLUGIN_ID,
  );
  let plugin: CodexManagerInspection['plugin'] = 'absent';
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
  action: CodexPluginSetupAction,
  projectRoot: string,
): CodexPluginSetupPlanItem {
  if (action === 'register-marketplace') {
    return {
      action,
      targetPath: MARKETPLACE_TARGET,
      description: 'Register the package-owned thoth-agents Codex marketplace.',
      command: {
        executable: 'codex',
        args: ['plugin', 'marketplace', 'add', MARKETPLACE_SOURCE, '--json'],
        cwd: projectRoot,
      },
    };
  }

  return {
    action,
    targetPath: PLUGIN_TARGET,
    description:
      'Install and enable the thoth-agents Codex plugin from its native marketplace.',
    command: {
      executable: 'codex',
      args: ['plugin', 'add', PLUGIN_ID, '--json'],
      cwd: projectRoot,
    },
  };
}

export function buildCodexPluginSetupPlan(
  config: CodexPluginInstallConfig,
): CodexPluginSetupPlan {
  const commandExecutor = config.commandExecutor ?? defaultCommandExecutor;
  const inspection = inspectCodexManager(commandExecutor, config.projectRoot);
  const items: CodexPluginSetupPlanItem[] = [];

  if (inspection.ready) {
    if (inspection.marketplace === 'absent') {
      items.push(commandItem('register-marketplace', config.projectRoot));
    }
    if (inspection.plugin === 'absent' || inspection.plugin === 'disabled') {
      items.push(commandItem('install-plugin', config.projectRoot));
    }
  }

  return {
    dryRun: config.dryRun === true,
    items,
    ready: inspection.ready,
    projectRoot: config.projectRoot,
    commandExecutor,
    diagnostics: [
      ...inspection.diagnostics,
      'Codex installs thoth-agents from EremesNG/thoth-agents through its native plugin manager and owns the cached plugin files.',
      'Restart Codex after installation; use /plugins to inspect marketplace and plugin state.',
    ],
  };
}

function uniqueMessages(messages: string[]): string[] {
  return [...new Set(messages)];
}

function boundedCommandFailure(
  item: CodexPluginSetupPlanItem,
  result: CodexCommandResult,
): string {
  const detail = result.stderr.trim().replace(/\s+/g, ' ').slice(0, 240);
  return `${item.description} Codex exited with code ${result.exitCode}${detail ? `: ${detail}` : '.'}`;
}

export function applyCodexPluginSetup(
  plan: CodexPluginSetupPlan,
): CodexPluginApplyResult {
  const changed: string[] = [];
  const diagnostics = uniqueMessages(plan.diagnostics);
  if (!plan.ready) {
    return {
      success: false,
      changed,
      diagnostics,
      error: 'Codex native plugin manager state is not safe to mutate.',
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

  const inspection = inspectCodexManager(
    plan.commandExecutor,
    plan.projectRoot,
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
        'Codex did not verify the expected marketplace and enabled plugin after mutation.',
    };
  }

  return { success: true, changed, diagnostics: uniqueMessages(diagnostics) };
}

export function formatCodexPluginSetupPlan(plan: CodexPluginSetupPlan): string {
  const lines = plan.items.map(
    (item) =>
      `- ${item.action}: ${item.command.executable} ${item.command.args.join(' ')}`,
  );
  return ['Codex plugin setup plan:', ...lines].join('\n');
}
