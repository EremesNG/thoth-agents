import { ALL_AGENT_NAMES, DEFAULT_MODELS } from '../../config';
import type { HarnessId } from '../../harness/types';
import {
  buildCodexSetupPlan,
  CODEX_ROLE_NAMES,
  parseRoleTomlModel,
} from '../codex-install';
import { parseConfig } from '../config-io';
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
  status(harness: HarnessId): HarnessStatusReport;
  modelRoles(harness: HarnessId): ModelRoleInput[];
  modelOptions(harness: HarnessId): ModelOption[];
  plan(
    harness: HarnessId,
    action: Exclude<TuiAction, 'status' | 'list'>,
  ): OperationPlan;
  modelPlan(harness: HarnessId, roles: ModelRoleInput[]): OperationPlan;
  apply(plan: OperationPlan): OperationApplyResult;
}

const context: OperationContext = { cwd: process.cwd() };
const codexContext: CodexOperationContext = { cwd: process.cwd() };

export const opencodeModelRoles: ModelRoleInput[] = ALL_AGENT_NAMES.map(
  (role) => ({
    role,
    model: DEFAULT_MODELS[role] ?? 'openai/gpt-5.4',
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
      return {
        role,
        model:
          (item?.content ? parseRoleTomlModel(item.content) : undefined) ??
          codexDefaultModels.get(role) ??
          'gpt-5.4-mini',
      };
    });
  } catch {
    return codexModelRoles.map((role) => ({ ...role }));
  }
}

function readRoleModel(config: unknown, role: string): string | undefined {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return undefined;
  }
  const record = config as Record<string, unknown>;
  const value = record[role];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const model = (value as { model?: unknown }).model;
  return typeof model === 'string' && model.length > 0 ? model : undefined;
}

export function getOpenCodeModelRoles(): ModelRoleInput[] {
  const parsed = parseConfig(getExistingLiteConfigPath());
  const agents =
    parsed.config?.agents && typeof parsed.config.agents === 'object'
      ? parsed.config.agents
      : undefined;
  const presets =
    parsed.config?.presets && typeof parsed.config.presets === 'object'
      ? (parsed.config.presets as Record<string, unknown>)
      : {};
  const openaiPreset =
    presets.openai && typeof presets.openai === 'object'
      ? presets.openai
      : undefined;

  return ALL_AGENT_NAMES.map((role) => ({
    role,
    model:
      readRoleModel(agents, role) ??
      readRoleModel(openaiPreset, role) ??
      DEFAULT_MODELS[role] ??
      'openai/gpt-5.4',
  }));
}

function buildTuiModelPlan(
  harness: HarnessId,
  roles: ModelRoleInput[],
): OperationPlan {
  return harness === 'opencode'
    ? buildOpenCodeModelPlan({ harness, dryRun: true, roles }, context)
    : buildCodexModelPlan({ harness, dryRun: true, roles }, codexContext);
}

export const defaultTuiOperations: TuiOperations = {
  status(harness) {
    return harness === 'opencode'
      ? getOpenCodeStatus(context)
      : getCodexStatus(codexContext);
  },
  modelRoles(harness) {
    return harness === 'opencode'
      ? getOpenCodeModelRoles()
      : getCodexModelRoles(codexContext);
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

    if (action === 'install') return buildCodexInstallPlan(codexContext);
    if (action === 'update') return buildCodexUpdatePlan(codexContext);
    if (action === 'sync') return buildCodexSyncPlan(codexContext);
    return buildTuiModelPlan(harness, getCodexModelRoles(codexContext));
  },
  modelPlan(harness, roles) {
    return buildTuiModelPlan(harness, roles);
  },
  apply(plan) {
    return plan.harness === 'opencode'
      ? applyOpenCodePlan(plan)
      : applyCodexPlan(plan);
  },
};
