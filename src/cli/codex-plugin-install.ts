import { spawnSync } from 'node:child_process';
import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { getCodexHome } from './codex-paths';

const PLUGIN_NAME = 'thoth-agents';
const MARKETPLACE_NAME = 'thoth-plugins';
const MARKETPLACE_SOURCE = 'https://github.com/EremesNG/thoth-plugins.git';
const PLUGIN_ID = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;
const LEGACY_MARKETPLACE_SOURCE =
  'https://github.com/EremesNG/thoth-agents.git';
const LEGACY_MARKETPLACE_NAMES = [PLUGIN_NAME, `${PLUGIN_NAME}-codex`];
const LEGACY_PLUGIN_IDS = LEGACY_MARKETPLACE_NAMES.map(
  (name) => `${PLUGIN_NAME}@${name}`,
);
const LEGACY_ROOTS = [
  {
    relativePath: 'plugins/cache/thoth-agents',
    kind: 'cache',
    marketplaceName: 'thoth-agents',
  },
  {
    relativePath: 'plugins/cache/thoth-agents-codex',
    kind: 'cache',
    marketplaceName: 'thoth-agents-codex',
  },
  {
    relativePath: '.tmp/marketplaces/thoth-agents',
    kind: 'snapshot',
    marketplaceName: 'thoth-agents',
  },
  {
    relativePath: '.tmp/marketplaces/thoth-agents-codex',
    kind: 'snapshot',
    marketplaceName: 'thoth-agents-codex',
  },
] as const;
type LegacyRootDefinition = (typeof LEGACY_ROOTS)[number];
const MARKETPLACE_TARGET = `codex://marketplaces/${MARKETPLACE_NAME}`;
const PLUGIN_TARGET = `codex://plugins/${PLUGIN_ID}`;

export type CodexPluginSetupAction = 'register-marketplace' | 'install-plugin';
export type CodexPluginCleanupAction =
  | 'remove-legacy-plugin'
  | 'remove-legacy-marketplace'
  | 'remove-legacy-root';

export interface CodexLegacyCleanupRoot {
  kind: 'cache' | 'snapshot';
  marketplaceName: string;
  path: string;
  realPath: string;
  relativePath: string;
}

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
  codexHome?: string;
  dryRun?: boolean;
  expectedVersion: string;
  homeDir?: string;
  projectRoot: string;
  commandExecutor?: CodexCommandExecutor;
}

export interface CodexPluginSetupPlanItem {
  action: CodexPluginSetupAction | CodexPluginCleanupAction;
  targetPath: string;
  description: string;
  command?: {
    executable: 'codex';
    args: string[];
    cwd: string;
  };
  cleanupRoot?: CodexLegacyCleanupRoot;
}

export interface CodexPluginSetupPlan {
  codexHome: string;
  dryRun: boolean;
  expectedVersion: string;
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
  plugin: 'absent' | 'installed' | 'disabled' | 'outdated' | 'unknown';
  legacyPluginIds: string[];
  legacyMarketplaceNames: string[];
  legacyMarketplaceConflicts: string[];
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
    args: ['/d', '/s', '/c', 'codex', ...args],
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
    .replace(/#.*$/u, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/^(?:https?|ssh):\/\/(?:git@)?github\.com\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/\/?\.git\/?$/i, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function lstatIfPresent(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

function strictDescendant(base: string, candidate: string): boolean {
  const suffix = relative(base, candidate);
  return (
    suffix !== '' &&
    suffix !== '..' &&
    !suffix.startsWith(`..${sep}`) &&
    !isAbsolute(suffix)
  );
}

function parseObjectFile(path: string, label: string): Record<string, unknown> {
  const file = lstatIfPresent(path);
  if (!file || file.isSymbolicLink() || !file.isFile()) {
    throw new Error(`${label} must be a regular non-link file`);
  }
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!isRecord(value)) throw new Error('not an object');
    return value;
  } catch (error) {
    throw new Error(
      `${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function validateCacheManifest(root: string): void {
  const productEntries = readdirSync(root, { withFileTypes: true });
  if (productEntries.length === 0) return;
  if (productEntries.length !== 1 || productEntries[0]?.name !== PLUGIN_NAME) {
    throw new Error(
      `Legacy cache ${root} contains state outside ${PLUGIN_NAME}`,
    );
  }
  const productRoot = join(root, PLUGIN_NAME);
  const product = lstatIfPresent(productRoot);
  if (!product || product.isSymbolicLink() || !product.isDirectory()) {
    throw new Error(`Legacy cache product root ${productRoot} is unsafe`);
  }
  const versions = readdirSync(productRoot, { withFileTypes: true });
  if (versions.length === 0) {
    throw new Error(`Legacy cache ${root} has no plugin manifest`);
  }
  for (const entry of versions) {
    const versionRoot = join(productRoot, entry.name);
    const version = lstatIfPresent(versionRoot);
    if (
      !entry.isDirectory() ||
      !version ||
      version.isSymbolicLink() ||
      !version.isDirectory()
    ) {
      throw new Error(`Legacy cache version root ${versionRoot} is unsafe`);
    }
    const manifest = parseObjectFile(
      join(versionRoot, '.codex-plugin', 'plugin.json'),
      `Legacy cache manifest for ${versionRoot}`,
    );
    if (manifest.name !== PLUGIN_NAME) {
      throw new Error(
        `Legacy cache manifest for ${versionRoot} does not identify ${PLUGIN_NAME}`,
      );
    }
  }
}

function validateSnapshotManifest(root: string, marketplaceName: string): void {
  if (readdirSync(root).length === 0) return;
  const installation = parseObjectFile(
    join(root, '.codex-marketplace-install.json'),
    `Legacy marketplace receipt for ${marketplaceName}`,
  );
  if (
    typeof installation.source !== 'string' ||
    normalizeMarketplaceSource(installation.source) !==
      normalizeMarketplaceSource(LEGACY_MARKETPLACE_SOURCE)
  ) {
    throw new Error(
      `Legacy marketplace snapshot ${marketplaceName} has conflicting provenance`,
    );
  }
  const marketplace = parseObjectFile(
    join(root, '.agents', 'plugins', 'marketplace.json'),
    `Legacy marketplace manifest for ${marketplaceName}`,
  );
  const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const pluginNames = plugins.map((plugin) =>
    isRecord(plugin) ? plugin.name : null,
  );
  if (
    marketplace.name !== marketplaceName ||
    pluginNames.length === 0 ||
    pluginNames.some((name) => name !== PLUGIN_NAME)
  ) {
    throw new Error(
      `Legacy marketplace snapshot ${marketplaceName} does not identify only ${PLUGIN_NAME}`,
    );
  }
}

function validateLegacyRoot(
  codexHome: string,
  definition: LegacyRootDefinition,
  expectedRealPath?: string,
): CodexLegacyCleanupRoot | null {
  const path = resolve(codexHome, ...definition.relativePath.split('/'));
  if (!strictDescendant(codexHome, path)) {
    throw new Error(
      `Legacy cleanup target escapes CODEX_HOME: ${definition.relativePath}`,
    );
  }
  const target = lstatIfPresent(path);
  if (!target) return null;
  const home = lstatIfPresent(codexHome);
  if (!home || !home.isDirectory()) {
    throw new Error(`Resolved CODEX_HOME is not a directory: ${codexHome}`);
  }
  let boundary = codexHome;
  for (const segment of definition.relativePath.split('/')) {
    boundary = join(boundary, segment);
    const value = lstatIfPresent(boundary);
    if (!value || value.isSymbolicLink() || !value.isDirectory()) {
      throw new Error(
        `Legacy cleanup boundary is not a real directory: ${boundary}`,
      );
    }
  }
  const realHome = realpathSync(codexHome);
  const realPath = realpathSync(path);
  if (!strictDescendant(realHome, realPath)) {
    throw new Error(
      `Legacy cleanup target resolves outside CODEX_HOME: ${definition.relativePath}`,
    );
  }
  if (expectedRealPath && realPath !== expectedRealPath) {
    throw new Error(
      `Legacy cleanup target changed after preflight: ${definition.relativePath}`,
    );
  }
  if (definition.kind === 'cache') validateCacheManifest(path);
  else validateSnapshotManifest(path, definition.marketplaceName);
  return {
    kind: definition.kind,
    marketplaceName: definition.marketplaceName,
    path,
    realPath,
    relativePath: definition.relativePath,
  };
}

function preflightLegacyRoots(codexHomeInput: string): {
  codexHome: string;
  roots: CodexLegacyCleanupRoot[];
} {
  if (typeof codexHomeInput !== 'string' || codexHomeInput.trim() === '') {
    throw new Error('CODEX_HOME could not be resolved');
  }
  const codexHome = resolve(codexHomeInput);
  const roots = LEGACY_ROOTS.map((definition) =>
    validateLegacyRoot(codexHome, definition),
  ).filter((root): root is CodexLegacyCleanupRoot => root !== null);
  return { codexHome, roots };
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
  return isMarketplaceIdentity(entry, MARKETPLACE_NAME);
}

function isMarketplaceIdentity(
  entry: Record<string, unknown>,
  name: string,
  source = MARKETPLACE_SOURCE,
): boolean {
  if (entry.name !== name) return false;
  const canonical = normalizeMarketplaceSource(source);
  return marketplaceSources(entry).some(
    (source) => normalizeMarketplaceSource(source) === canonical,
  );
}

function inspectCodexManager(
  executor: CodexCommandExecutor,
  cwd: string,
  expectedVersion: string,
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
      legacyPluginIds: [],
      legacyMarketplaceNames: [],
      legacyMarketplaceConflicts: [],
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
      legacyPluginIds: [],
      legacyMarketplaceNames: [],
      legacyMarketplaceConflicts: [],
      diagnostics,
    };
  }

  const legacyMarketplaceNames = LEGACY_MARKETPLACE_NAMES.filter((name) =>
    marketplaces.some((entry) =>
      isMarketplaceIdentity(entry, name, LEGACY_MARKETPLACE_SOURCE),
    ),
  );
  const legacyMarketplaceConflicts = LEGACY_MARKETPLACE_NAMES.filter((name) =>
    marketplaces.some(
      (entry) =>
        entry.name === name &&
        !isMarketplaceIdentity(entry, name, LEGACY_MARKETPLACE_SOURCE),
    ),
  );
  const legacyPluginIds = LEGACY_PLUGIN_IDS.filter((pluginId) =>
    installedPlugins.some((entry) => entry.pluginId === pluginId),
  );
  if (legacyPluginIds.length > 0 || legacyMarketplaceNames.length > 0) {
    diagnostics.push(
      'Legacy Codex thoth-agents state was detected; cleanup is planned only after the central plugin is verified.',
    );
  }
  if (legacyMarketplaceConflicts.length > 0) {
    diagnostics.push(
      `Legacy Codex marketplace provenance conflicts were found for ${legacyMarketplaceConflicts.join(', ')}; no manager mutation will be attempted.`,
    );
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
      'A Codex marketplace named thoth-plugins is registered from a different source; resolve it through Codex before retrying.',
    );
  }

  const matchingPlugins = installedPlugins.filter(
    (entry) => entry.pluginId === PLUGIN_ID,
  );
  let plugin: CodexManagerInspection['plugin'] = 'absent';
  if (
    matchingPlugins.some(
      (entry) => entry.enabled === true && entry.version === expectedVersion,
    )
  ) {
    plugin = 'installed';
  } else if (matchingPlugins.some((entry) => entry.enabled === true)) {
    plugin = 'outdated';
  } else if (matchingPlugins.length > 0) {
    plugin = 'disabled';
  }

  return {
    ready:
      marketplace !== 'conflict' && legacyMarketplaceConflicts.length === 0,
    marketplace,
    plugin,
    legacyPluginIds,
    legacyMarketplaceNames,
    legacyMarketplaceConflicts,
    diagnostics,
  };
}

function centralPluginVerified(inspection: CodexManagerInspection): boolean {
  return (
    inspection.ready &&
    inspection.marketplace === 'installed' &&
    inspection.plugin === 'installed'
  );
}

function legacyManagerClean(inspection: CodexManagerInspection): boolean {
  return (
    inspection.legacyPluginIds.length === 0 &&
    inspection.legacyMarketplaceNames.length === 0
  );
}

function legacyRootsAbsent(codexHome: string): boolean {
  return LEGACY_ROOTS.every(
    ({ relativePath }) =>
      !lstatIfPresent(resolve(codexHome, ...relativePath.split('/'))),
  );
}

function legacyPluginCommandItem(
  pluginId: string,
  projectRoot: string,
): CodexPluginSetupPlanItem {
  return {
    action: 'remove-legacy-plugin',
    targetPath: `codex://plugins/${pluginId}`,
    description: `Remove the registered legacy Codex plugin ${pluginId}.`,
    command: {
      executable: 'codex',
      args: ['plugin', 'remove', pluginId, '--json'],
      cwd: projectRoot,
    },
  };
}

function legacyMarketplaceCommandItem(
  marketplaceName: string,
  projectRoot: string,
): CodexPluginSetupPlanItem {
  return {
    action: 'remove-legacy-marketplace',
    targetPath: `codex://marketplaces/${marketplaceName}`,
    description: `Remove the registered legacy Codex marketplace ${marketplaceName}.`,
    command: {
      executable: 'codex',
      args: ['plugin', 'marketplace', 'remove', marketplaceName, '--json'],
      cwd: projectRoot,
    },
  };
}

function legacyRootPlanItem(
  root: CodexLegacyCleanupRoot,
): CodexPluginSetupPlanItem {
  return {
    action: 'remove-legacy-root',
    targetPath: root.path,
    description: `Remove the preflight-approved legacy Codex root ${root.relativePath}.`,
    cleanupRoot: root,
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
      description: 'Register the central Thoth Codex marketplace.',
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
  const inspection = inspectCodexManager(
    commandExecutor,
    config.projectRoot,
    config.expectedVersion,
  );
  let cleanupPreflight:
    | { codexHome: string; roots: CodexLegacyCleanupRoot[] }
    | undefined;
  let cleanupPreflightError: string | undefined;
  if (inspection.ready) {
    try {
      cleanupPreflight = preflightLegacyRoots(
        getCodexHome({ codexHome: config.codexHome, homeDir: config.homeDir }),
      );
    } catch (error) {
      cleanupPreflightError = `Legacy cleanup preflight failed: ${error instanceof Error ? error.message : String(error)}. No manager mutation will be attempted.`;
    }
  }
  const ready = inspection.ready && cleanupPreflightError === undefined;
  const items: CodexPluginSetupPlanItem[] = [];

  if (ready) {
    if (inspection.marketplace === 'absent') {
      items.push(commandItem('register-marketplace', config.projectRoot));
    }
    if (
      inspection.plugin === 'absent' ||
      inspection.plugin === 'disabled' ||
      inspection.plugin === 'outdated'
    ) {
      items.push(commandItem('install-plugin', config.projectRoot));
    }
    items.push(
      ...inspection.legacyPluginIds.map((pluginId) =>
        legacyPluginCommandItem(pluginId, config.projectRoot),
      ),
      ...inspection.legacyMarketplaceNames.map((marketplaceName) =>
        legacyMarketplaceCommandItem(marketplaceName, config.projectRoot),
      ),
      ...(cleanupPreflight?.roots.map(legacyRootPlanItem) ?? []),
    );
  }

  return {
    codexHome:
      cleanupPreflight?.codexHome ??
      getCodexHome({ codexHome: config.codexHome, homeDir: config.homeDir }),
    dryRun: config.dryRun === true,
    expectedVersion: config.expectedVersion,
    items,
    ready,
    projectRoot: config.projectRoot,
    commandExecutor,
    diagnostics: [
      ...inspection.diagnostics,
      ...(cleanupPreflightError ? [cleanupPreflightError] : []),
      'Codex installs thoth-agents from the central thoth-plugins marketplace through its native plugin manager, while the thoth-agents repository remains the pinned plugin source.',
      'Close every Codex process before applying legacy cleanup; process-name detection is not a portable or race-free safety boundary.',
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

  const installationItems = plan.items.filter(
    (item) =>
      item.action === 'register-marketplace' ||
      item.action === 'install-plugin',
  );
  const cleanupItems = plan.items.filter(
    (item) =>
      item.action === 'remove-legacy-plugin' ||
      item.action === 'remove-legacy-marketplace',
  );
  const rootItems = plan.items.filter(
    (item) => item.action === 'remove-legacy-root',
  );
  for (const item of installationItems) {
    const command = item.command;
    if (!command) {
      return {
        success: false,
        changed,
        diagnostics,
        error: `Codex plugin setup plan item ${item.action} has no command.`,
      };
    }
    const result = plan.commandExecutor(command.executable, command.args, {
      cwd: command.cwd,
    });
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
    plan.expectedVersion,
  );
  diagnostics.push(...inspection.diagnostics);
  if (!centralPluginVerified(inspection)) {
    return {
      success: false,
      changed,
      diagnostics: uniqueMessages(diagnostics),
      error:
        'Codex did not verify the expected marketplace and enabled plugin after mutation.',
    };
  }

  for (const item of cleanupItems) {
    const command = item.command;
    if (!command) {
      return {
        success: false,
        changed,
        diagnostics: uniqueMessages(diagnostics),
        error: `Codex plugin cleanup plan item ${item.action} has no command.`,
      };
    }
    const result = plan.commandExecutor(command.executable, command.args, {
      cwd: command.cwd,
    });
    if (result.exitCode !== 0) {
      return {
        success: false,
        changed,
        diagnostics: uniqueMessages(diagnostics),
        error: `${boundedCommandFailure(item, result)} Central ${PLUGIN_ID} remains installed; close Codex and retry.`,
      };
    }
    changed.push(item.targetPath);
  }

  const managerCleanupInspection = inspectCodexManager(
    plan.commandExecutor,
    plan.projectRoot,
    plan.expectedVersion,
  );
  diagnostics.push(...managerCleanupInspection.diagnostics);
  if (
    !centralPluginVerified(managerCleanupInspection) ||
    !legacyManagerClean(managerCleanupInspection)
  ) {
    return {
      success: false,
      changed,
      diagnostics: uniqueMessages(diagnostics),
      error: `Central ${PLUGIN_ID} remains installed, but exact legacy manager cleanup did not converge; close Codex and retry.`,
    };
  }

  for (const item of rootItems) {
    const root = item.cleanupRoot;
    const definition = root
      ? LEGACY_ROOTS.find(
          (candidate) => candidate.relativePath === root.relativePath,
        )
      : undefined;
    if (!root || !definition) {
      return {
        success: false,
        changed,
        diagnostics: uniqueMessages(diagnostics),
        error: `Central ${PLUGIN_ID} remains installed, but the fixed legacy cleanup plan is invalid; close Codex and retry.`,
      };
    }
    const exactPath = resolve(
      plan.codexHome,
      ...definition.relativePath.split('/'),
    );
    if (
      resolve(root.path) !== exactPath ||
      resolve(item.targetPath) !== exactPath ||
      root.kind !== definition.kind ||
      root.marketplaceName !== definition.marketplaceName
    ) {
      return {
        success: false,
        changed,
        diagnostics: uniqueMessages(diagnostics),
        error: `Central ${PLUGIN_ID} remains installed, but the fixed legacy cleanup target changed; close Codex and retry.`,
      };
    }
    if (!lstatIfPresent(exactPath)) continue;
    try {
      const validated = validateLegacyRoot(
        plan.codexHome,
        definition,
        root.realPath,
      );
      if (!validated) continue;
      rmSync(validated.path, { recursive: true, force: false });
      if (lstatIfPresent(validated.path)) {
        throw new Error(
          `Legacy cleanup target still exists: ${root.relativePath}`,
        );
      }
      changed.push(item.targetPath);
    } catch (error) {
      const detail = (error instanceof Error ? error.message : String(error))
        .replace(/\s+/g, ' ')
        .slice(0, 240);
      return {
        success: false,
        changed,
        diagnostics: uniqueMessages(diagnostics),
        error: `Central ${PLUGIN_ID} remains installed; legacy root cleanup failed${detail ? `: ${detail}` : ''}. Close Codex and retry.`,
      };
    }
  }

  const finalInspection = inspectCodexManager(
    plan.commandExecutor,
    plan.projectRoot,
    plan.expectedVersion,
  );
  diagnostics.push(...finalInspection.diagnostics);
  if (
    !centralPluginVerified(finalInspection) ||
    !legacyManagerClean(finalInspection) ||
    !legacyRootsAbsent(plan.codexHome)
  ) {
    return {
      success: false,
      changed,
      diagnostics: uniqueMessages(diagnostics),
      error: `Central ${PLUGIN_ID} remains installed, but exact legacy cleanup did not converge; close Codex and retry.`,
    };
  }

  return { success: true, changed, diagnostics: uniqueMessages(diagnostics) };
}

export function formatCodexPluginSetupPlan(plan: CodexPluginSetupPlan): string {
  const lines = plan.items.map((item) =>
    item.command
      ? `- ${item.action}: ${item.command.executable} ${item.command.args.join(' ')}`
      : `- ${item.action}: ${item.cleanupRoot?.relativePath ?? item.targetPath}`,
  );
  return ['Codex plugin setup plan:', ...lines].join('\n');
}
