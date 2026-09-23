import { existsSync, readFileSync } from 'node:fs';
import {
  ALL_AGENT_NAMES,
  getDefaultOpenCodeModel,
  getDefaultOpenCodeVariant,
} from '../../config';
import type {
  HarnessId,
  ProviderCapabilityEvidence,
  ProviderEvidenceInput,
} from '../../harness/types';
import {
  buildCodexSetupPlan,
  parseRoleTomlEffort,
  parseRoleTomlModel,
} from '../codex-install';
import { parseConfig } from '../config-io';
import { getShippedModelRoles } from '../model-defaults';
import {
  applyClaudeCodePlan,
  buildClaudeCodeInstallPlan,
  buildClaudeCodeModelPlan,
  buildClaudeCodeSyncPlan,
  buildClaudeCodeUpdatePlan,
  type ClaudeCodeOperationContext,
  defaultClaudeCodeModelRoles,
  getClaudeCodeStatus,
} from '../operations/claude-code';
import {
  applyCodexPlan,
  buildCodexInstallPlan,
  buildCodexModelPlan,
  buildCodexSyncPlan,
  buildCodexUpdatePlan,
  type CodexOperationContext,
  getCodexStatus,
} from '../operations/codex';
import {
  applyOpenCodePlan,
  buildOpenCodeInstallPlan,
  buildOpenCodeModelPlan,
  buildOpenCodeSyncPlan,
  buildOpenCodeUpdatePlan,
  getOpenCodeStatus,
} from '../operations/opencode';
import {
  applyPiPlan,
  buildPiInstallPlan,
  buildPiModelPlan,
  buildPiSyncPlan,
  buildPiUpdatePlan,
  defaultPiModelRoles,
  getPiStatus,
} from '../operations/pi';
import type {
  HarnessStatusReport,
  ModelRoleInput,
  OperationApplyResult,
  OperationContext,
  OperationPlan,
} from '../operations/types';
import { getExistingLiteConfigPath } from '../paths';
import { getModelOptions, type ModelOption } from './model-catalog';

export type TuiAction =
  | 'status'
  | 'list'
  | 'install'
  | 'update'
  | 'sync'
  | 'model';

export interface TuiOperations {
  status(
    harness: HarnessId,
    evidence?: ProviderEvidenceInput,
  ): HarnessStatusReport;
  providerCapability?(harness: HarnessId): Promise<ProviderCapabilityEvidence>;
  modelRoles(harness: HarnessId): ModelRoleInput[];
  modelOptions(harness: HarnessId): Promise<ModelOption[]>;
  plan(
    harness: HarnessId,
    action: Exclude<TuiAction, 'status' | 'list'>,
  ): OperationPlan;
  modelPlan(harness: HarnessId, roles: ModelRoleInput[]): OperationPlan;
  restoreModelPlan(
    harness: HarnessId,
    options: readonly ModelOption[],
  ): OperationPlan;
  apply(plan: OperationPlan): OperationApplyResult;
}

const context: OperationContext = { cwd: process.cwd() };
const codexContext: CodexOperationContext = { cwd: process.cwd() };
const claudeCodeContext: ClaudeCodeOperationContext = {
  cwd: process.cwd(),
  scope: 'user',
};

export const opencodeModelRoles: ModelRoleInput[] = ALL_AGENT_NAMES.map(
  (role) => ({
    role,
    model: getDefaultOpenCodeModel(role),
    effort: { kind: 'effort', value: getDefaultOpenCodeVariant(role) },
  }),
);

export const codexModelRoles = getShippedModelRoles('codex');

function codexInstallConfig(source: CodexOperationContext, dryRun: boolean) {
  return {
    dryRun,
    reset: false,
    scope: source.scope ?? 'user',
    projectRoot: source.cwd,
    homeDir: source.homeDir,
    codexHome: source.codexHome,
    packageRoot: source.packageRoot,
    pluginId: source.pluginId,
  };
}

export function getCodexModelRoles(
  source: CodexOperationContext = codexContext,
): ModelRoleInput[] {
  try {
    const plan = buildCodexSetupPlan(codexInstallConfig(source, true));
    return getShippedModelRoles('codex').map(
      ({ role, model: defaultModel }) => {
        const item = plan.items.find(
          (candidate) =>
            candidate.action === 'write-role-toml' && candidate.role === role,
        );
        const content =
          item && existsSync(item.targetPath)
            ? readFileSync(item.targetPath, 'utf8')
            : item?.content;
        const effort = content ? parseRoleTomlEffort(content) : undefined;
        return {
          role,
          model:
            (content ? parseRoleTomlModel(content) : undefined) ?? defaultModel,
          effort: effort
            ? { kind: 'effort' as const, value: effort }
            : { kind: 'inherit' as const },
        };
      },
    );
  } catch {
    return getShippedModelRoles('codex');
  }
}

export function getClaudeCodeModelRoles(
  _source: ClaudeCodeOperationContext = claudeCodeContext,
): ModelRoleInput[] {
  return defaultClaudeCodeModelRoles();
}

export function getPiModelRoles(): ModelRoleInput[] {
  return defaultPiModelRoles(context);
}

function readRoleField(
  config: unknown,
  role: string,
  field: 'model' | 'variant',
): string | undefined {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return undefined;
  }
  const record = config as Record<string, unknown>;
  const value = record[role];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === 'string' && fieldValue.length > 0
    ? fieldValue
    : undefined;
}

export function getOpenCodeModelRoles(): ModelRoleInput[] {
  const parsed = parseConfig(getExistingLiteConfigPath());
  const agents =
    parsed.config?.agents && typeof parsed.config.agents === 'object'
      ? parsed.config.agents
      : undefined;
  const presets =
    parsed.config?.presets &&
    typeof parsed.config.presets === 'object' &&
    !Array.isArray(parsed.config.presets)
      ? (parsed.config.presets as Record<string, unknown>)
      : {};
  const presetName =
    typeof parsed.config?.preset === 'string'
      ? parsed.config.preset
      : undefined;
  const selectedPreset =
    presetName !== undefined ? presets[presetName] : undefined;
  const activePreset =
    selectedPreset &&
    typeof selectedPreset === 'object' &&
    !Array.isArray(selectedPreset)
      ? selectedPreset
      : undefined;

  return ALL_AGENT_NAMES.map((role) => {
    const defaultModel = getDefaultOpenCodeModel(role);
    const configuredModel =
      readRoleField(agents, role, 'model') ??
      readRoleField(activePreset, role, 'model');
    const model = configuredModel ?? defaultModel;
    const configuredVariant =
      readRoleField(agents, role, 'variant') ??
      readRoleField(activePreset, role, 'variant');
    const variant =
      configuredVariant ??
      (configuredModel === undefined
        ? getDefaultOpenCodeVariant(role)
        : undefined);
    return {
      role,
      model,
      effort: variant
        ? { kind: 'effort' as const, value: variant }
        : { kind: 'inherit' as const },
    };
  });
}

function buildTuiModelPlan(
  harness: HarnessId,
  roles: ModelRoleInput[],
  source: OperationContext = context,
): OperationPlan {
  if (harness === 'opencode') {
    return buildOpenCodeModelPlan({ harness, dryRun: true, roles }, source);
  }
  if (harness === 'claude') {
    return buildClaudeCodeModelPlan({ harness, dryRun: true, roles }, source);
  }
  if (harness === 'pi') {
    return buildPiModelPlan({ harness, dryRun: true, roles }, source);
  }
  return buildCodexModelPlan({ harness, dryRun: true, roles }, source);
}

export function buildRestoreModelPlan(
  harness: HarnessId,
  options: readonly ModelOption[],
  source: OperationContext = context,
): OperationPlan {
  const roles = getShippedModelRoles(harness).map((role) => {
    const catalogId =
      harness === 'codex'
        ? `openai/${role.model}`
        : harness === 'pi'
          ? role.model.replace(/^openai-codex\//, 'openai/')
          : role.model;
    const option =
      options.find((candidate) => candidate.id === role.model) ??
      options.find((candidate) => candidate.catalogId === catalogId);
    return {
      ...role,
      ...(option
        ? {
            provider: option.provider,
            catalogId: option.catalogId,
            availableEfforts: [...option.efforts],
          }
        : {}),
    };
  });
  // Preserve the issued plan's identity and contents for native apply validation.
  return buildTuiModelPlan(harness, roles, source);
}

export const defaultTuiOperations: TuiOperations = {
  status(harness, evidence) {
    if (harness === 'opencode') return getOpenCodeStatus(context, evidence);
    if (harness === 'claude') {
      return getClaudeCodeStatus(claudeCodeContext, evidence);
    }
    if (harness === 'pi') return getPiStatus(context, evidence);
    return getCodexStatus(codexContext, evidence);
  },
  modelRoles(harness) {
    if (harness === 'opencode') return getOpenCodeModelRoles();
    if (harness === 'claude') {
      return getClaudeCodeModelRoles(claudeCodeContext);
    }
    if (harness === 'pi') return getPiModelRoles();
    return getCodexModelRoles(codexContext);
  },
  modelOptions(harness) {
    return getModelOptions(harness);
  },
  plan(harness, action) {
    if (harness === 'opencode') {
      if (action === 'install') return buildOpenCodeInstallPlan(context);
      if (action === 'update') return buildOpenCodeUpdatePlan(context);
      if (action === 'sync') return buildOpenCodeSyncPlan(context);
      return buildTuiModelPlan(harness, getOpenCodeModelRoles());
    }

    if (harness === 'claude') {
      if (action === 'install') {
        return buildClaudeCodeInstallPlan(claudeCodeContext);
      }
      if (action === 'update') {
        return buildClaudeCodeUpdatePlan(claudeCodeContext);
      }
      if (action === 'sync') return buildClaudeCodeSyncPlan(claudeCodeContext);
      return buildTuiModelPlan(
        harness,
        getClaudeCodeModelRoles(claudeCodeContext),
      );
    }

    if (harness === 'pi') {
      if (action === 'install') return buildPiInstallPlan(context);
      if (action === 'update') return buildPiUpdatePlan(context);
      if (action === 'sync') return buildPiSyncPlan(context);
      return buildTuiModelPlan(harness, getPiModelRoles());
    }

    if (action === 'install') return buildCodexInstallPlan(codexContext);
    if (action === 'update') return buildCodexUpdatePlan(codexContext);
    if (action === 'sync') return buildCodexSyncPlan(codexContext);
    return buildTuiModelPlan(harness, getCodexModelRoles(codexContext));
  },
  modelPlan(harness, roles) {
    return buildTuiModelPlan(harness, roles);
  },
  restoreModelPlan(harness, options) {
    return buildRestoreModelPlan(harness, options);
  },
  apply(plan) {
    if (plan.harness === 'opencode') return applyOpenCodePlan(plan);
    if (plan.harness === 'claude') return applyClaudeCodePlan(plan);
    if (plan.harness === 'pi') return applyPiPlan(plan);
    return applyCodexPlan(plan);
  },
};
