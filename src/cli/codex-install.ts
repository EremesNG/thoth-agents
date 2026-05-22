import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  codexAdapter,
  renderCodexRootInstructions,
} from '../harness/adapters/codex';
import { codexPluginRootArtifactPath } from '../harness/codex-plugin-paths';
import type { HarnessArtifact } from '../harness/types';
import { writeCodexConfigMerge } from './codex-config-io';
import type { CodexInstallScope, CodexRoleName } from './codex-paths';
import { resolveCodexTargets } from './codex-paths';
import { findPackageRoot } from './custom-skills';

export { CODEX_ROLE_NAMES } from './codex-paths';

export type CodexSetupAction =
  | 'merge-managed-block'
  | 'write-role-toml'
  | 'write-managed-model-state'
  | 'refresh-package'
  | 'merge-marketplace'
  | 'merge-toml'
  | 'diagnose-only';

export type CodexTargetKind =
  | 'root-instructions'
  | 'role-subagent-toml'
  | 'managed-model-state'
  | 'user-config'
  | 'plugin-package'
  | 'personal-plugin-source'
  | 'personal-marketplace'
  | 'diagnostic';

export interface CodexInstallConfig {
  dryRun?: boolean;
  reset: boolean;
  scope: CodexInstallScope;
  projectRoot: string;
  homeDir?: string;
  codexHome?: string;
  packageRoot?: string;
  pluginId?: string;
}

export interface CodexSetupPlanItem {
  kind: CodexTargetKind;
  action: CodexSetupAction;
  targetPath: string;
  description: string;
  requiresBackup: boolean;
  content?: string;
  role?: CodexRoleName;
}

export interface CodexSetupPlan {
  dryRun: boolean;
  reset: boolean;
  items: CodexSetupPlanItem[];
  diagnostics: string[];
  disclaimers: string[];
  configPath: string;
  pluginId?: string;
}

export interface CodexApplyResult {
  success: boolean;
  changed: string[];
  diagnostics: string[];
  error?: string;
}

const ROOT_START = '<!-- thoth-agents:codex-root:start -->';
const ROOT_END = '<!-- thoth-agents:codex-root:end -->';
const MANAGED_MODEL_STATE_VERSION = 1;

interface ManagedModelState {
  version: typeof MANAGED_MODEL_STATE_VERSION;
  models: Record<string, string>;
}

function mergeManagedBlock(existing: string, managedBlock: string): string {
  const start = existing.indexOf(ROOT_START);
  const end = existing.indexOf(ROOT_END);
  if (start !== -1 && end !== -1 && end > start) {
    return `${existing.slice(0, start)}${managedBlock}${existing.slice(end + ROOT_END.length).replace(/^\s*\n/, '')}`;
  }
  return `${existing}${existing.endsWith('\n') || existing.length === 0 ? '' : '\n'}\n${managedBlock}`;
}

function writeTextWithBackup(path: string, content: string): boolean {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return false;
  if (existsSync(path)) copyFileSync(path, `${path}.bak`);
  writeFileSync(path, content);
  return true;
}

function packageArtifactTarget(
  packageRoot: string,
  artifact: HarnessArtifact,
): string {
  return join(packageRoot, codexPluginRootArtifactPath(artifact.path));
}

function resolvePackageRoot(
  packageRoot: string | undefined,
): string | undefined {
  if (packageRoot) return packageRoot;
  return (
    findPackageRoot(fileURLToPath(new URL('.', import.meta.url))) ?? undefined
  );
}

function normalizeRelativeMarketplacePath(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  if (isAbsolute(path) || /^[A-Za-z]:\//.test(normalized)) return normalized;
  if (normalized.startsWith('./')) return normalized;
  return `./${normalized}`;
}

function marketplaceSourcePath(
  homeDir: string,
  personalPluginRoot: string,
): string {
  return normalizeRelativeMarketplacePath(
    relative(homeDir, personalPluginRoot),
  );
}

function managedMarketplaceEntry(
  homeDir: string,
  personalPluginRoot: string,
): Record<string, unknown> {
  return {
    name: 'thoth-agents',
    source: {
      source: 'local',
      path: marketplaceSourcePath(homeDir, personalPluginRoot),
    },
    policy: {
      installation: 'AVAILABLE',
      authentication: 'ON_INSTALL',
    },
    category: 'Productivity',
  };
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function emptyManagedModelState(): ManagedModelState {
  return {
    version: MANAGED_MODEL_STATE_VERSION,
    models: {},
  };
}

function readManagedModelState(path: string): ManagedModelState {
  if (!existsSync(path)) return emptyManagedModelState();

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      version?: unknown;
      models?: unknown;
    };
    if (
      parsed.version !== MANAGED_MODEL_STATE_VERSION ||
      !parsed.models ||
      typeof parsed.models !== 'object' ||
      Array.isArray(parsed.models)
    ) {
      return emptyManagedModelState();
    }

    return {
      version: MANAGED_MODEL_STATE_VERSION,
      models: Object.fromEntries(
        Object.entries(parsed.models).filter(
          (entry): entry is [string, string] =>
            typeof entry[0] === 'string' && typeof entry[1] === 'string',
        ),
      ),
    };
  } catch {
    return emptyManagedModelState();
  }
}

function parseRoleTomlModel(content: string): string | undefined {
  const match = /^model\s*=\s*"((?:\\.|[^"\\])*)"\s*$/m.exec(content);
  if (!match) return undefined;
  return match[1]
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function escapeTomlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\f/g, '\\f')
    .replace(/\r/g, '\\r');
}

function replaceRoleTomlModel(content: string, model: string): string {
  const rendered = `model = "${escapeTomlString(model)}"`;
  if (/^model\s*=\s*"(?:\\.|[^"\\])*"\s*$/m.test(content)) {
    return content.replace(/^model\s*=\s*"(?:\\.|[^"\\])*"\s*$/m, rendered);
  }
  return `${rendered}\n${content}`;
}

function roleManagedModelStateKey(path: string): string {
  return basename(path);
}

function resolveRoleTomlContent(options: {
  renderedContent: string;
  targetPath: string;
  state: ManagedModelState;
  nextState: ManagedModelState;
  reset: boolean;
}): string {
  const renderedModel = parseRoleTomlModel(options.renderedContent);
  const key = roleManagedModelStateKey(options.targetPath);

  if (!renderedModel) return options.renderedContent;

  if (options.reset || !existsSync(options.targetPath)) {
    options.nextState.models[key] = renderedModel;
    return options.renderedContent;
  }

  const currentModel = parseRoleTomlModel(
    readFileSync(options.targetPath, 'utf8'),
  );
  const trackedModel = options.state.models[key];
  const isUserOwned =
    currentModel !== undefined &&
    (trackedModel === undefined
      ? currentModel !== renderedModel
      : currentModel !== trackedModel);

  if (isUserOwned) {
    if (trackedModel !== undefined)
      options.nextState.models[key] = trackedModel;
    return replaceRoleTomlModel(options.renderedContent, currentModel);
  }

  options.nextState.models[key] = renderedModel;
  return options.renderedContent;
}

function mergePersonalMarketplace(
  existing: string,
  homeDir: string,
  personalPluginRoot: string,
): string {
  const parsed = existing.trim()
    ? (JSON.parse(existing) as Record<string, unknown>)
    : {};
  const plugins = Array.isArray(parsed.plugins) ? parsed.plugins : [];
  const managedEntry = managedMarketplaceEntry(homeDir, personalPluginRoot);
  const nextPlugins = plugins
    .filter(
      (entry) =>
        !(
          entry &&
          typeof entry === 'object' &&
          'name' in entry &&
          entry.name === 'thoth-agents'
        ),
    )
    .concat(managedEntry);

  return stableJson({
    ...parsed,
    name:
      typeof parsed.name === 'string' ? parsed.name : 'personal-marketplace',
    interface:
      parsed.interface && typeof parsed.interface === 'object'
        ? parsed.interface
        : { displayName: 'Personal Plugin Marketplace' },
    plugins: nextPlugins,
  });
}

function roleArtifactContent(
  role: CodexRoleName,
  artifacts: HarnessArtifact[],
): string {
  const path = `.codex/agents/thoth-agents-${role}.toml`;
  const artifact = artifacts.find((candidate) => candidate.path === path);
  if (!artifact?.content)
    throw new Error(`Missing Codex role artifact: ${path}`);
  return String(artifact.content);
}

export function buildCodexSetupPlan(
  config: CodexInstallConfig,
): CodexSetupPlan {
  const targets = resolveCodexTargets({
    scope: config.scope,
    projectRoot: config.projectRoot,
    homeDir: config.homeDir,
    codexHome: config.codexHome,
  });
  const packageRoot = resolvePackageRoot(config.packageRoot);
  const render = codexAdapter.render({
    projectRoot: config.projectRoot,
    ...(packageRoot ? { packageRoot } : {}),
  });
  const packageArtifacts = render.artifacts.filter((artifact) =>
    artifact.path.startsWith('.codex-plugin/'),
  );
  const rootBlock = renderCodexRootInstructions();
  const managedModelState = readManagedModelState(targets.managedModelsPath);
  const nextManagedModelState = emptyManagedModelState();
  const items: CodexSetupPlanItem[] = [
    {
      kind: 'root-instructions',
      action: 'merge-managed-block',
      targetPath: targets.rootInstructionsPath,
      description: `Merge managed Codex root instructions into ${targets.rootInstructionsPath}.`,
      requiresBackup: true,
      content: rootBlock,
    },
    ...targets.roleAgentPaths.map(
      (target): CodexSetupPlanItem => ({
        kind: 'role-subagent-toml',
        action: 'write-role-toml',
        targetPath: target.path,
        description: `Materialize Codex role subagent ${target.role}.`,
        requiresBackup: existsSync(target.path),
        role: target.role,
        content: resolveRoleTomlContent({
          renderedContent: roleArtifactContent(target.role, render.artifacts),
          targetPath: target.path,
          state: managedModelState,
          nextState: nextManagedModelState,
          reset: config.reset,
        }),
      }),
    ),
    {
      kind: 'managed-model-state',
      action: 'write-managed-model-state',
      targetPath: targets.managedModelsPath,
      description:
        'Record thoth-agents-managed Codex role model ownership state.',
      requiresBackup: existsSync(targets.managedModelsPath),
      content: stableJson(nextManagedModelState),
    },
    ...packageArtifacts.map(
      (artifact): CodexSetupPlanItem => ({
        kind: 'personal-plugin-source',
        action: 'refresh-package',
        targetPath: packageArtifactTarget(targets.personalPluginRoot, artifact),
        description: `Refresh Personal Codex plugin source asset ${artifact.path}.`,
        requiresBackup: false,
        content: String(artifact.content ?? ''),
      }),
    ),
    {
      kind: 'personal-marketplace',
      action: 'merge-marketplace',
      targetPath: targets.personalMarketplacePath,
      description:
        'Register Personal Codex marketplace entry for the local thoth-agents plugin source.',
      requiresBackup: existsSync(targets.personalMarketplacePath),
      content: targets.personalPluginRoot,
    },
    {
      kind: 'user-config',
      action: 'merge-toml',
      targetPath: targets.configPath,
      description: 'Merge managed Codex feature gates into user config.toml.',
      requiresBackup: true,
    },
    {
      kind: 'diagnostic',
      action: 'diagnose-only',
      targetPath: targets.codexHome,
      description:
        'Report /plugins, /hooks, precedence, and capability review steps.',
      requiresBackup: false,
    },
  ];

  return {
    dryRun: config.dryRun === true,
    reset: config.reset,
    items,
    configPath: targets.configPath,
    pluginId: config.pluginId,
    diagnostics: [
      'Restart Codex, then run /plugins to review and enable the Personal thoth-agents plugin registered through ~/.agents/plugins/marketplace.json.',
      'Run /hooks to review and trust plugin hooks; features.plugin_hooks does not bypass hook trust review.',
      'Codex Default mode user-input requests require features.default_mode_request_user_input = true and use the request_user_input tool; other modes may not expose it.',
      'Higher-precedence Codex config (project, profile, CLI, system, or admin) may override user config feature flags.',
    ],
    disclaimers: [
      'Role permissions, provider-per-agent settings, memory governance, and hook enforcement are instruction-level or user-managed unless documented Codex runtime controls are available.',
      'Codex v1 reset is managed-only; no broad destructive --force behavior is implemented.',
    ],
  };
}

export function formatCodexSetupPlan(plan: CodexSetupPlan): string {
  const refreshPackageGroups = new Map<CodexTargetKind, CodexSetupPlanItem[]>();

  for (const item of plan.items) {
    if (item.action !== 'refresh-package') continue;
    const group = refreshPackageGroups.get(item.kind) ?? [];
    group.push(item);
    refreshPackageGroups.set(item.kind, group);
  }

  const renderedRefreshKinds = new Set<CodexTargetKind>();
  const lines: string[] = [];
  for (const item of plan.items) {
    if (item.action !== 'refresh-package') {
      lines.push(`- ${item.action}: ${item.targetPath} (${item.description})`);
      continue;
    }
    if (renderedRefreshKinds.has(item.kind)) continue;
    renderedRefreshKinds.add(item.kind);
    lines.push(formatRefreshPackageGroup(item.kind, refreshPackageGroups));
  }

  return ['Codex setup plan:', ...lines].join('\n');
}

function formatRefreshPackageGroup(
  kind: CodexTargetKind,
  groups: Map<CodexTargetKind, CodexSetupPlanItem[]>,
): string {
  const items = groups.get(kind) ?? [];
  const description =
    kind === 'personal-plugin-source'
      ? 'Refresh Personal Codex plugin source'
      : 'Refresh documented .codex-plugin package';
  return `- refresh-package: ${commonTargetDirectory(items)} (${description}, ${items.length} files.)`;
}

function commonTargetDirectory(items: CodexSetupPlanItem[]): string {
  if (items.length === 0) return '';
  let common = dirname(items[0]?.targetPath ?? '');
  for (const item of items.slice(1)) {
    while (!isSameOrChildPath(item.targetPath, common)) {
      const parent = dirname(common);
      if (parent === common) return common;
      common = parent;
    }
  }
  return common;
}

function isSameOrChildPath(path: string, parent: string): boolean {
  return (
    path === parent ||
    path.startsWith(`${parent}\\`) ||
    path.startsWith(`${parent}/`)
  );
}

function uniqueMessages(messages: string[]): string[] {
  return [...new Set(messages)];
}

export function applyCodexSetup(plan: CodexSetupPlan): CodexApplyResult {
  const changed: string[] = [];
  const diagnostics: string[] = uniqueMessages([
    ...plan.diagnostics,
    ...plan.disclaimers,
  ]);
  if (plan.dryRun) return { success: true, changed, diagnostics };

  try {
    for (const targetPath of managedRefreshRoots(plan)) {
      rmSync(targetPath, { recursive: true, force: true });
    }

    for (const item of plan.items) {
      if (item.action === 'diagnose-only') continue;
      if (item.action === 'merge-toml') {
        const result = writeCodexConfigMerge({
          configPath: item.targetPath,
          dryRun: false,
          pluginId: plan.pluginId,
        });
        diagnostics.push(...result.diffSummary, ...result.warnings);
        if (!result.success) throw new Error(result.error);
        if (result.changed) changed.push(item.targetPath);
        continue;
      }
      if (item.action === 'merge-marketplace') {
        if (item.content === undefined) continue;
        const content = mergePersonalMarketplace(
          existsSync(item.targetPath)
            ? readFileSync(item.targetPath, 'utf8')
            : '',
          dirname(dirname(dirname(item.targetPath))),
          item.content,
        );
        if (writeTextWithBackup(item.targetPath, content))
          changed.push(item.targetPath);
        continue;
      }
      if (item.content === undefined) continue;
      const content =
        item.action === 'merge-managed-block'
          ? mergeManagedBlock(
              existsSync(item.targetPath)
                ? readFileSync(item.targetPath, 'utf8')
                : '',
              item.content,
            )
          : item.content;
      if (writeTextWithBackup(item.targetPath, content))
        changed.push(item.targetPath);
    }
    return { success: true, changed, diagnostics: uniqueMessages(diagnostics) };
  } catch (error) {
    return {
      success: false,
      changed,
      diagnostics: uniqueMessages(diagnostics),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function managedRefreshRoots(plan: CodexSetupPlan): string[] {
  const refreshGroups = new Map<CodexTargetKind, CodexSetupPlanItem[]>();

  for (const item of plan.items) {
    if (item.action !== 'refresh-package') continue;
    const group = refreshGroups.get(item.kind) ?? [];
    group.push(item);
    refreshGroups.set(item.kind, group);
  }

  return [...refreshGroups]
    .filter(([kind]) => kind === 'personal-plugin-source')
    .map(([, items]) => commonTargetDirectory(items))
    .filter((path) => path.length > 0);
}
