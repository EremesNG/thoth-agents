import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeCodeAdapter } from '../harness/adapters/claude-code';
import type { HarnessArtifact } from '../harness/types';
import {
  CLAUDE_CODE_MODELS,
  isClaudeCodeModel,
} from '../harness/writers/claude-code-subagent';
import type {
  ClaudeCodeInstallScope,
  ClaudeCodeResolvedTargets,
  ClaudeCodeRoleName,
} from './claude-code-paths';
import {
  CLAUDE_CODE_ROLE_NAMES,
  resolveClaudeCodeTargets,
} from './claude-code-paths';
import {
  type ManagedModelState,
  emptyManagedModelState as sharedEmptyManagedModelState,
  parseManagedModelStateJson as sharedParseManagedModelStateJson,
  readManagedModelState as sharedReadManagedModelState,
  stableJson,
  uniqueMessages,
  writeTextWithBackup,
} from './managed-state-io';
import { findPackageRoot } from './package-root';

export { CLAUDE_CODE_ROLE_NAMES } from './claude-code-paths';

export const CLAUDE_CODE_MANAGED_MODEL_STATE_VERSION = 1;

// Re-exported under the install-layer name for API stability; the canonical
// list lives with the ClaudeCodeModel type.
export const CLAUDE_CODE_MODEL_ALIASES = CLAUDE_CODE_MODELS;

export type ClaudeCodeSetupAction =
  | 'write-plugin-file'
  | 'write-managed-model-state';

export type ClaudeCodeTargetKind =
  | 'plugin-manifest'
  | 'subagent'
  | 'mcp-config'
  | 'hook'
  | 'skill'
  | 'plugin-asset'
  | 'managed-model-state';

export interface ClaudeCodeInstallConfig {
  dryRun?: boolean;
  reset: boolean;
  scope: ClaudeCodeInstallScope;
  projectRoot: string;
  homeDir?: string;
  packageRoot?: string;
}

export interface ClaudeCodeSetupPlanItem {
  kind: ClaudeCodeTargetKind;
  action: ClaudeCodeSetupAction;
  targetPath: string;
  description: string;
  requiresBackup: boolean;
  content: string;
  role?: ClaudeCodeRoleName;
}

export interface ClaudeCodeSetupPlan {
  dryRun: boolean;
  reset: boolean;
  items: ClaudeCodeSetupPlanItem[];
  diagnostics: string[];
  disclaimers: string[];
  pluginRoot: string;
}

export interface ClaudeCodeApplyResult {
  success: boolean;
  changed: string[];
  diagnostics: string[];
  error?: string;
}

export interface ClaudeCodeManagedModelOverride {
  role: ClaudeCodeRoleName;
  model: string;
  catalogId?: string;
  effort?: string;
  clearEffort?: boolean;
}

export const isClaudeCodeModelAlias = isClaudeCodeModel;

export function parseSubagentModel(content: string): string | undefined {
  return /^model:\s*(\S+)\s*$/m.exec(content)?.[1];
}

export function replaceSubagentModel(content: string, model: string): string {
  if (/^model:\s*\S+\s*$/m.test(content)) {
    return content.replace(/^model:\s*\S+\s*$/m, `model: ${model}`);
  }
  return content;
}

export function parseSubagentEffort(content: string): string | undefined {
  return /^effort:\s*(\S+)\s*$/m.exec(content)?.[1];
}

export function replaceSubagentEffort(
  content: string,
  effort: string | undefined,
): string {
  if (effort === undefined) {
    return content.replace(/^effort:\s*\S+\s*\n/m, '');
  }
  if (/^effort:\s*\S+\s*$/m.test(content)) {
    return content.replace(/^effort:\s*\S+\s*$/m, `effort: ${effort}`);
  }
  return content.replace(/^(model:\s*\S+\s*)$/m, `$1\neffort: ${effort}`);
}

function emptyManagedModelState(): ManagedModelState {
  return sharedEmptyManagedModelState(CLAUDE_CODE_MANAGED_MODEL_STATE_VERSION);
}

export function parseManagedModelStateJson(
  text: string | undefined,
): ManagedModelState {
  return sharedParseManagedModelStateJson(
    text,
    CLAUDE_CODE_MANAGED_MODEL_STATE_VERSION,
  );
}

export function readManagedModelState(path: string): ManagedModelState {
  return sharedReadManagedModelState(
    path,
    CLAUDE_CODE_MANAGED_MODEL_STATE_VERSION,
  );
}

function resolvePackageRoot(
  packageRoot: string | undefined,
): string | undefined {
  if (packageRoot) return packageRoot;
  return (
    findPackageRoot(fileURLToPath(new URL('.', import.meta.url))) ?? undefined
  );
}

function targetKindForArtifact(
  artifact: HarnessArtifact,
): ClaudeCodeTargetKind {
  const path = artifact.path.replaceAll('\\', '/');
  if (path === '.claude-plugin/plugin.json') return 'plugin-manifest';
  if (path.startsWith('agents/')) return 'subagent';
  if (path === '.mcp.json') return 'mcp-config';
  if (path.startsWith('hooks/')) return 'hook';
  if (path.startsWith('skills/')) return 'skill';
  return 'plugin-asset';
}

function roleForArtifact(
  artifact: HarnessArtifact,
): ClaudeCodeRoleName | undefined {
  const match = /^agents\/([^/]+)\.md$/.exec(
    artifact.path.replaceAll('\\', '/'),
  );
  const name = match?.[1];
  // Only specialist subagents are model-managed; the orchestrator agent uses
  // `inherit` and is activated as the main thread, so it is not a managed role.
  return name && (CLAUDE_CODE_ROLE_NAMES as readonly string[]).includes(name)
    ? (name as ClaudeCodeRoleName)
    : undefined;
}

function applyConfiguredModel(
  content: string,
  targetPath: string,
  role: ClaudeCodeRoleName | undefined,
  state: ManagedModelState,
  nextState: ManagedModelState,
  reset: boolean,
): string {
  const renderedModel = parseSubagentModel(content);
  if (!role || !renderedModel) return content;

  nextState.models[role] = renderedModel;
  const configured = reset ? undefined : state.configuredModels?.[role];
  let updated = content;
  if (configured !== undefined) {
    nextState.configuredModels ??= {};
    nextState.configuredModels[role] = configured;
    updated = replaceSubagentModel(updated, configured);
  }

  const configuredEffort = reset ? undefined : state.configuredEfforts?.[role];
  if (configuredEffort !== undefined) {
    nextState.configuredEfforts ??= {};
    nextState.configuredEfforts[role] = configuredEffort;
  }

  if (!reset && existsSync(targetPath)) {
    const installedEffort = parseSubagentEffort(
      readFileSync(targetPath, 'utf8'),
    );
    updated = replaceSubagentEffort(updated, installedEffort);
  }
  return updated;
}

export function buildClaudeCodeSetupPlan(
  config: ClaudeCodeInstallConfig,
): ClaudeCodeSetupPlan {
  const targets = resolveClaudeCodeTargets({
    scope: config.scope,
    projectRoot: config.projectRoot,
    homeDir: config.homeDir,
  });
  const packageRoot = resolvePackageRoot(config.packageRoot);
  const render = claudeCodeAdapter.render({
    projectRoot: config.projectRoot,
    ...(packageRoot ? { packageRoot } : {}),
  });

  const state = readManagedModelState(targets.managedModelsPath);
  const nextState = emptyManagedModelState();

  const items: ClaudeCodeSetupPlanItem[] = render.artifacts.map((artifact) => {
    const role = roleForArtifact(artifact);
    const rendered = String(artifact.content ?? '');
    const targetPath = join(targets.pluginRoot, artifact.path);
    const content =
      role !== undefined
        ? applyConfiguredModel(
            rendered,
            targetPath,
            role,
            state,
            nextState,
            config.reset,
          )
        : rendered;

    return {
      kind: targetKindForArtifact(artifact),
      action: 'write-plugin-file',
      targetPath,
      description: `Materialize Claude Code plugin asset ${artifact.path}.`,
      requiresBackup: existsSync(targetPath),
      content,
      ...(role ? { role } : {}),
    };
  });

  items.push({
    kind: 'managed-model-state',
    action: 'write-managed-model-state',
    targetPath: targets.managedModelsPath,
    description:
      'Record thoth-agents-managed Claude Code subagent model ownership state.',
    requiresBackup: existsSync(targets.managedModelsPath),
    content: stableJson(nextState),
  });

  return {
    dryRun: config.dryRun === true,
    reset: config.reset,
    items,
    pluginRoot: targets.pluginRoot,
    diagnostics: [
      `Installed as a skills-directory plugin at ${targets.pluginRoot}; it auto-loads as thoth-agents@skills-dir on the next Claude Code session.`,
      'Restart Claude Code or run /reload-plugins to activate it; run /plugin (Installed tab) to confirm thoth-agents@skills-dir is loaded.',
      'The plugin settings.json activates the adaptive orchestrator as the main thread; it works directly on bounded tasks and delegates only for net gain.',
      'Provider capability is owned by the external provider and is not established by this thoth-agents setup plan.',
    ],
    disclaimers: [
      'The orchestrator agent is the Claude Code main thread (plugin settings.json `agent` key); while enabled it replaces the default system prompt for every session in scope.',
      'Read-only subagents must not mutate the workspace per their operational contract (instruction-level, not tooling-enforced).',
      'Subagent models accept only sonnet, opus, haiku, or inherit.',
      'Project-scope skills-directory plugins require accepting the workspace trust dialog.',
    ],
  };
}

export function applyClaudeCodeSetup(
  plan: ClaudeCodeSetupPlan,
): ClaudeCodeApplyResult {
  const changed: string[] = [];
  const diagnostics = uniqueMessages([
    ...plan.diagnostics,
    ...plan.disclaimers,
  ]);
  if (plan.dryRun) return { success: true, changed, diagnostics };

  try {
    for (const item of plan.items) {
      if (writeTextWithBackup(item.targetPath, item.content)) {
        changed.push(item.targetPath);
      }
    }
    return { success: true, changed, diagnostics };
  } catch (error) {
    return {
      success: false,
      changed,
      diagnostics,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function applyClaudeCodeManagedModelOverrides(
  config: ClaudeCodeInstallConfig,
  overrides: ClaudeCodeManagedModelOverride[],
): ClaudeCodeApplyResult {
  if (config.dryRun) {
    return {
      success: true,
      changed: [],
      diagnostics: [
        'Dry-run Claude Code model override apply requested; no files were written.',
      ],
    };
  }

  const plan = buildClaudeCodeSetupPlan({
    ...config,
    dryRun: true,
    reset: false,
  });
  const stateItem = plan.items.find(
    (item) => item.action === 'write-managed-model-state',
  );
  const statePath = stateItem?.targetPath;
  if (!statePath) {
    return {
      success: false,
      changed: [],
      diagnostics: plan.diagnostics,
      error: 'Claude Code managed model state target was not found.',
    };
  }

  const changed: string[] = [];
  const diagnostics = uniqueMessages([
    ...plan.diagnostics,
    ...plan.disclaimers,
  ]);
  // Seed from the plan's computed state, whose `models` map already holds the
  // true rendered defaults (set before any configured override is applied).
  // Re-deriving from roleItem.content would read the already-overridden model
  // line and drift the managed-default tracking.
  const state = parseManagedModelStateJson(stateItem?.content);
  const nextState: ManagedModelState = {
    version: CLAUDE_CODE_MANAGED_MODEL_STATE_VERSION,
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
      if (
        !isClaudeCodeModelAlias(override.model) &&
        override.catalogId !== override.model
      ) {
        throw new Error(
          `Unsupported Claude Code model "${override.model}" for ${override.role}; use sonnet, opus, haiku, or inherit.`,
        );
      }
      const roleItem = plan.items.find(
        (item) => item.kind === 'subagent' && item.role === override.role,
      );
      if (!roleItem) {
        throw new Error(`Missing Claude Code subagent for ${override.role}.`);
      }

      const before = existsSync(roleItem.targetPath)
        ? readFileSync(roleItem.targetPath, 'utf8')
        : roleItem.content;
      let updated = replaceSubagentModel(before, override.model);
      if (override.clearEffort) {
        updated = replaceSubagentEffort(updated, undefined);
      } else if (override.effort !== undefined) {
        updated = replaceSubagentEffort(updated, override.effort);
      }
      if (writeTextWithBackup(roleItem.targetPath, updated)) {
        changed.push(roleItem.targetPath);
      }
      // models[role] keeps the rendered default from the plan; only the
      // user-configured override is recorded.
      nextState.configuredModels ??= {};
      nextState.configuredModels[override.role] = override.model;
      if (override.clearEffort) {
        if (nextState.configuredEfforts) {
          delete nextState.configuredEfforts[override.role];
        }
      } else if (override.effort !== undefined) {
        nextState.configuredEfforts ??= {};
        nextState.configuredEfforts[override.role] = override.effort;
      }
    }

    if (writeTextWithBackup(statePath, stableJson(nextState))) {
      changed.push(statePath);
    }
    return { success: true, changed, diagnostics };
  } catch (error) {
    return {
      success: false,
      changed,
      diagnostics,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function formatClaudeCodeSetupPlan(plan: ClaudeCodeSetupPlan): string {
  const lines = plan.items.map(
    (item) => `- ${item.action}: ${item.targetPath} (${item.description})`,
  );
  return ['Claude Code setup plan:', ...lines].join('\n');
}

export type { ClaudeCodeResolvedTargets };
