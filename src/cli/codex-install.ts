import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  codexAdapter,
  renderCodexRootInstructions,
} from '../harness/adapters/codex';
import type { HarnessArtifact } from '../harness/types';
import { writeCodexConfigMerge } from './codex-config-io';
import type { CodexInstallScope, CodexRoleName } from './codex-paths';
import { resolveCodexTargets } from './codex-paths';
import {
  type ManagedModelState,
  emptyManagedModelState as sharedEmptyManagedModelState,
  readManagedModelState as sharedReadManagedModelState,
  stableJson,
  uniqueMessages,
  writeTextWithBackup,
} from './managed-state-io';
import { findPackageRoot } from './package-root';

export { CODEX_ROLE_NAMES } from './codex-paths';

export type CodexSetupAction =
  | 'merge-managed-block'
  | 'write-role-toml'
  | 'write-managed-model-state'
  | 'merge-toml'
  | 'diagnose-only';

export type CodexTargetKind =
  | 'root-instructions'
  | 'role-subagent-toml'
  | 'managed-model-state'
  | 'user-config'
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
  renderedModel?: string;
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
export const MANAGED_MODEL_STATE_VERSION = 1;

function mergeManagedBlock(existing: string, managedBlock: string): string {
  const start = existing.indexOf(ROOT_START);
  const end = existing.indexOf(ROOT_END);
  if (start !== -1 && end !== -1 && end > start) {
    return `${existing.slice(0, start)}${managedBlock}${existing.slice(end + ROOT_END.length).replace(/^\s*\n/, '')}`;
  }
  return `${existing}${existing.endsWith('\n') || existing.length === 0 ? '' : '\n'}\n${managedBlock}`;
}

function resolvePackageRoot(
  packageRoot: string | undefined,
): string | undefined {
  if (packageRoot) return packageRoot;
  return (
    findPackageRoot(fileURLToPath(new URL('.', import.meta.url))) ?? undefined
  );
}

function emptyManagedModelState(): ManagedModelState {
  return sharedEmptyManagedModelState(MANAGED_MODEL_STATE_VERSION);
}

export function readManagedModelState(path: string): ManagedModelState {
  return sharedReadManagedModelState(path, MANAGED_MODEL_STATE_VERSION);
}

export function parseRoleTomlModel(content: string): string | undefined {
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

export function replaceRoleTomlModel(content: string, model: string): string {
  const rendered = `model = "${escapeTomlString(model)}"`;
  if (/^model\s*=\s*"(?:\\.|[^"\\])*"\s*$/m.test(content)) {
    return content.replace(/^model\s*=\s*"(?:\\.|[^"\\])*"\s*$/m, rendered);
  }
  return `${rendered}\n${content}`;
}

export function parseRoleTomlEffort(content: string): string | undefined {
  return /^model_reasoning_effort\s*=\s*"([^"\\]+)"\s*$/m.exec(content)?.[1];
}

export function replaceRoleTomlEffort(
  content: string,
  effort: string | undefined,
): string {
  const pattern = /^model_reasoning_effort\s*=\s*"[^"\\]+"\s*\r?\n?/m;
  if (effort === undefined) return content.replace(pattern, '');
  const rendered = `model_reasoning_effort = "${escapeTomlString(effort)}"`;
  if (pattern.test(content)) return content.replace(pattern, `${rendered}\n`);
  const modelPattern = /^model\s*=\s*"(?:\\.|[^"\\])*"\s*\r?\n?/m;
  if (modelPattern.test(content)) {
    return content.replace(
      modelPattern,
      (modelLine) => `${modelLine}${rendered}\n`,
    );
  }
  return `${rendered}\n${content}`;
}

export function roleManagedModelStateKey(path: string): string {
  return basename(path);
}

export function normalizeCodexRuntimeModel(model: string): string {
  const separator = model.indexOf('/');
  return separator === -1 ? model : model.slice(separator + 1);
}

export interface CodexManagedModelOverride {
  role: CodexRoleName;
  model: string;
  effort?: string;
  clearEffort?: boolean;
}

export function applyCodexManagedModelOverrides(
  config: CodexInstallConfig,
  overrides: CodexManagedModelOverride[],
): CodexApplyResult {
  if (config.dryRun) {
    return {
      success: true,
      changed: [],
      diagnostics: [
        'Dry-run Codex model override apply requested; no files were written.',
      ],
    };
  }

  const plan = buildCodexSetupPlan({ ...config, dryRun: true, reset: false });
  const stateItem = plan.items.find(
    (item) => item.action === 'write-managed-model-state',
  );
  const statePath = stateItem?.targetPath;
  if (!statePath) {
    return {
      success: false,
      changed: [],
      diagnostics: plan.diagnostics,
      error: 'Codex managed model state target was not found.',
    };
  }

  const changed: string[] = [];
  const diagnostics = uniqueMessages([
    ...plan.diagnostics,
    ...plan.disclaimers,
  ]);
  const state = readManagedModelState(statePath);
  const nextState: ManagedModelState = {
    version: MANAGED_MODEL_STATE_VERSION,
    models: { ...state.models },
    ...(state.configuredModels
      ? { configuredModels: { ...state.configuredModels } }
      : {}),
    ...(state.configuredEfforts
      ? { configuredEfforts: { ...state.configuredEfforts } }
      : {}),
  };

  try {
    for (const override of overrides) {
      const roleItem = plan.items.find(
        (item) =>
          item.action === 'write-role-toml' && item.role === override.role,
      );
      if (!roleItem?.content) {
        throw new Error(
          `Missing Codex role TOML content for ${override.role}.`,
        );
      }

      const before = existsSync(roleItem.targetPath)
        ? readFileSync(roleItem.targetPath, 'utf8')
        : roleItem.content;
      const model = normalizeCodexRuntimeModel(override.model);
      let updated = replaceRoleTomlModel(before, model);
      if (override.clearEffort) {
        updated = replaceRoleTomlEffort(updated, undefined);
      } else if (override.effort !== undefined) {
        updated = replaceRoleTomlEffort(updated, override.effort);
      }
      if (writeTextWithBackup(roleItem.targetPath, updated)) {
        changed.push(roleItem.targetPath);
      }
      const key = roleManagedModelStateKey(roleItem.targetPath);
      nextState.models[key] = normalizeCodexRuntimeModel(
        roleItem.renderedModel ?? model,
      );
      nextState.configuredModels ??= {};
      nextState.configuredModels[key] = model;
      if (override.clearEffort) {
        if (nextState.configuredEfforts) {
          delete nextState.configuredEfforts[key];
        }
      } else if (override.effort !== undefined) {
        nextState.configuredEfforts ??= {};
        nextState.configuredEfforts[key] = override.effort;
      }
    }

    if (writeTextWithBackup(statePath, stableJson(nextState))) {
      changed.push(statePath);
    }

    return {
      success: true,
      changed,
      diagnostics: uniqueMessages(diagnostics),
    };
  } catch (error) {
    return {
      success: false,
      changed,
      diagnostics: uniqueMessages(diagnostics),
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
  const configuredModel = options.reset
    ? undefined
    : options.state.configuredModels?.[key];
  const configuredEffort = options.reset
    ? undefined
    : options.state.configuredEfforts?.[key];

  if (configuredEffort !== undefined) {
    options.nextState.configuredEfforts ??= {};
    options.nextState.configuredEfforts[key] = configuredEffort;
  }

  if (options.reset || !existsSync(options.targetPath)) {
    options.nextState.models[key] = renderedModel;
    if (configuredModel !== undefined) {
      options.nextState.configuredModels ??= {};
      options.nextState.configuredModels[key] = configuredModel;
      return replaceRoleTomlModel(options.renderedContent, configuredModel);
    }
    return options.renderedContent;
  }

  const installedContent = readFileSync(options.targetPath, 'utf8');
  const currentModel = parseRoleTomlModel(installedContent);
  const currentEffort = parseRoleTomlEffort(installedContent);
  if (configuredModel !== undefined) {
    options.nextState.models[key] = renderedModel;
    options.nextState.configuredModels ??= {};
    options.nextState.configuredModels[key] = configuredModel;
    return replaceRoleTomlEffort(
      replaceRoleTomlModel(
        options.renderedContent,
        currentModel && currentModel !== configuredModel
          ? currentModel
          : configuredModel,
      ),
      currentEffort,
    );
  }

  const trackedModel = options.state.models[key];
  const isUserOwned =
    currentModel !== undefined &&
    (trackedModel === undefined
      ? currentModel !== renderedModel
      : currentModel !== trackedModel);

  if (isUserOwned) {
    if (trackedModel !== undefined)
      options.nextState.models[key] = trackedModel;
    return replaceRoleTomlEffort(
      replaceRoleTomlModel(options.renderedContent, currentModel),
      currentEffort,
    );
  }

  options.nextState.models[key] = renderedModel;
  return replaceRoleTomlEffort(options.renderedContent, currentEffort);
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
        renderedModel: parseRoleTomlModel(
          roleArtifactContent(target.role, render.artifacts),
        ),
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
        'Report /plugins, precedence, and consumer capability review steps.',
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
      'The combined install flow runs `codex plugin marketplace add EremesNG/thoth-agents --ref master` and `codex plugin add thoth-agents@thoth-agents-codex` through the native manager; restart Codex, then use /plugins to review its state.',
      'The CLI does not copy a plugin into ~/.codex/plugins or merge ~/.agents/plugins/marketplace.json directly; Codex owns marketplace snapshots and installed plugin cache state.',
      'The /hooks surface may show hooks from independently installed plugins; this thoth-agents setup plan does not install provider hooks.',
      'Codex Default mode user-input requests require features.default_mode_request_user_input = true and use the request_user_input tool; other modes may not expose it.',
      'Higher-precedence Codex config (project, profile, CLI, system, or admin) may override user config feature flags.',
      'Provider capability is owned by the external provider and is not established by this thoth-agents setup plan.',
    ],
    disclaimers: [
      'Role permissions and provider-per-agent settings are instruction-level or user-managed unless documented Codex runtime controls are available.',
      'Codex reset is managed-only; no broad destructive --force behavior is implemented.',
    ],
  };
}

export function formatCodexSetupPlan(plan: CodexSetupPlan): string {
  const lines = plan.items.map(
    (item) => `- ${item.action}: ${item.targetPath} (${item.description})`,
  );

  return ['Codex setup plan:', ...lines].join('\n');
}

export function applyCodexSetup(plan: CodexSetupPlan): CodexApplyResult {
  const changed: string[] = [];
  const diagnostics: string[] = uniqueMessages([
    ...plan.diagnostics,
    ...plan.disclaimers,
  ]);
  if (plan.dryRun) return { success: true, changed, diagnostics };

  try {
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
