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
  CODEX_ROLE_NAMES,
  parseRoleTomlEffort,
  parseRoleTomlModel,
} from '../codex-install';
import { parseConfig } from '../config-io';
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

export const codexModelRoles: ModelRoleInput[] = CODEX_ROLE_NAMES.map(
  (role) => ({
    role,
    model: 'gpt-5.4-mini',
  }),
);

const codexDefaultModels = new Map<string, string>(
  codexModelRoles.map((role) => [role.role, role.model]),
);

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
    return CODEX_ROLE_NAMES.map((role) => {
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
          (content ? parseRoleTomlModel(content) : undefined) ??
          codexDefaultModels.get(role) ??
          'gpt-5.4-mini',
        effort: effort
          ? { kind: 'effort' as const, value: effort }
          : { kind: 'inherit' as const },
      };
    });
  } catch {
    return codexModelRoles.map((role) => ({ ...role }));
  }
}

export function getClaudeCodeModelRoles(
  _source: ClaudeCodeOperationContext = claudeCodeContext,
): ModelRoleInput[] {
  return defaultClaudeCodeModelRoles();
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
    const model =
      readRoleField(agents, role, 'model') ??
      readRoleField(activePreset, role, 'model') ??
      defaultModel;
    const configuredVariant =
      readRoleField(agents, role, 'variant') ??
      readRoleField(activePreset, role, 'variant');
    const variant =
      configuredVariant ??
      (model === defaultModel ? getDefaultOpenCodeVariant(role) : undefined);
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
): OperationPlan {
  if (harness === 'opencode') {
    return buildOpenCodeModelPlan({ harness, dryRun: true, roles }, context);
  }
  if (harness === 'claude') {
    return buildClaudeCodeModelPlan(
      { harness, dryRun: true, roles },
      claudeCodeContext,
    );
  }
  return buildCodexModelPlan({ harness, dryRun: true, roles }, codexContext);
}

export const defaultTuiOperations: TuiOperations = {
  status(harness, evidence) {
    if (harness === 'opencode') return getOpenCodeStatus(context, evidence);
    if (harness === 'claude') {
      return getClaudeCodeStatus(claudeCodeContext, evidence);
    }
    return getCodexStatus(codexContext, evidence);
  },
  modelRoles(harness) {
    if (harness === 'opencode') return getOpenCodeModelRoles();
    if (harness === 'claude') {
      return getClaudeCodeModelRoles(claudeCodeContext);
    }
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

    if (action === 'install') return buildCodexInstallPlan(codexContext);
    if (action === 'update') return buildCodexUpdatePlan(codexContext);
    if (action === 'sync') return buildCodexSyncPlan(codexContext);
    return buildTuiModelPlan(harness, getCodexModelRoles(codexContext));
  },
  modelPlan(harness, roles) {
    return buildTuiModelPlan(harness, roles);
  },
  apply(plan) {
    if (plan.harness === 'opencode') return applyOpenCodePlan(plan);
    if (plan.harness === 'claude') return applyClaudeCodePlan(plan);
    return applyCodexPlan(plan);
  },
};
