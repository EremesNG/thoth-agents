import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { ProviderEvidenceInput } from '../../harness/types';
import {
  applyCodexManagedModelOverrides,
  applyCodexSetup,
  buildCodexSetupPlan,
  CODEX_ROLE_NAMES,
  type CodexInstallConfig,
  type CodexSetupPlan,
  type CodexSetupPlanItem,
  MANAGED_MODEL_STATE_VERSION,
  normalizeCodexRuntimeModel,
  parseRoleTomlModel,
} from '../codex-install';
import type { CodexInstallScope, CodexRoleName } from '../codex-paths';
import {
  getRequiredSkillInstallCommand,
  getRequiredSkillPath,
  installRequiredSkill,
  REQUIRED_SKILLS,
} from '../skills';
import type {
  BackupExpectation,
  HarnessAction,
  HarnessOperationAdapter,
  HarnessStatusReport,
  ManagedState,
  ManagedSurface,
  ManagedTarget,
  ModelConfigInput,
  ModelRoleInput,
  OperationApplyResult,
  OperationContext,
  OperationPlan,
  OperationPlanItem,
  OperationWarning,
} from './types';
import { classifyProviderCapabilityEvidence } from './types';

export interface CodexOperationContext extends OperationContext {
  scope?: CodexInstallScope;
  homeDir?: string;
  codexHome?: string;
  packageRoot?: string;
  pluginId?: string;
}

const CODEX_DISPLAY_NAME = 'Codex';
const codexPlanSources = new WeakMap<
  OperationPlan,
  { setupPlan: CodexSetupPlan; context: CodexOperationContext }
>();
const codexModelSources = new WeakMap<
  OperationPlan,
  {
    config: CodexInstallConfig;
    roles: {
      role: CodexRoleName;
      model: string;
      effort?: string;
      clearEffort?: boolean;
    }[];
  }
>();

const codexActions: HarnessAction[] = [
  {
    id: 'codex-status',
    kind: 'status',
    label: 'Status',
    description: 'Inspect managed Codex setup state',
    dryRun: false,
    requiresConfirmation: false,
    supported: true,
  },
  {
    id: 'codex-list',
    kind: 'list',
    label: 'List',
    description: 'List managed Codex surfaces and actions',
    dryRun: false,
    requiresConfirmation: false,
    supported: true,
  },
  {
    id: 'codex-install',
    kind: 'install',
    label: 'Install',
    description: 'Preview Codex agent-pack setup install',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
  {
    id: 'codex-update',
    kind: 'update',
    label: 'Update',
    description: 'Preview Codex managed setup refresh',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
  {
    id: 'codex-sync',
    kind: 'sync',
    label: 'Sync',
    description: 'Preview Codex managed configuration sync',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
  {
    id: 'codex-model-config',
    kind: 'model-config',
    label: 'Model',
    description: 'Preview supported Codex subagent model line changes',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
];

export const codexOperationAdapter = {
  id: 'codex',
  displayName: CODEX_DISPLAY_NAME,
  available: true,
  description: 'Codex agent-pack and managed subagent surfaces.',
  actions: codexActions,
} as const satisfies HarnessOperationAdapter;

function codexConfig(
  context: CodexOperationContext = { cwd: process.cwd() },
  dryRun: boolean,
): CodexInstallConfig {
  return {
    dryRun,
    reset: false,
    scope: context.scope ?? 'user',
    projectRoot: context.cwd,
    homeDir: context.homeDir,
    codexHome: context.codexHome,
    packageRoot: context.packageRoot,
    pluginId: context.pluginId,
  };
}

function codexDisclaimers() {
  return [
    {
      message:
        'Codex root orchestration remains ambient instructions, not a generated root/orchestrator subagent model surface.',
      code: 'codex-root-guidance-only',
    },
    {
      message:
        'Provider-per-role behavior and permissions are instruction-level or user-managed unless Codex exposes runtime controls.',
      code: 'codex-runtime-limits',
    },
  ];
}

function warning(message: string, code: string): OperationWarning {
  return { severity: 'important', message, code };
}

function targetForItem(
  item: CodexSetupPlanItem,
  state?: ManagedState,
  observed?: string,
): ManagedTarget {
  return {
    kind:
      item.kind === 'managed-model-state'
        ? 'memory-state'
        : 'generated-artifact',
    path: item.targetPath,
    label: item.role
      ? `Codex ${item.role} subagent`
      : item.kind.replaceAll('-', ' '),
    state,
    expected: item.action,
    observed,
    description: item.description,
  };
}

function surfaceForItem(item: CodexSetupPlanItem): ManagedSurface {
  return {
    id: `${item.kind}:${item.role ?? basename(item.targetPath)}`,
    label: item.role
      ? `Codex ${item.role} subagent TOML`
      : item.kind.replaceAll('-', ' '),
    path: item.targetPath,
    description: item.description,
  };
}

function backupForItem(item: CodexSetupPlanItem): BackupExpectation {
  return {
    required: item.requiresBackup,
    strategy: item.requiresBackup ? 'managed-backup-file' : 'none',
    destinations: item.requiresBackup
      ? [{ path: `${item.targetPath}.bak`, label: 'managed backup' }]
      : [],
  };
}

function rootBlockState(item: CodexSetupPlanItem): {
  state: ManagedState;
  observed: string;
} {
  if (!existsSync(item.targetPath))
    return { state: 'missing', observed: 'absent' };
  const content = readFileSync(item.targetPath, 'utf8');
  if (item.content && content.includes(item.content)) {
    return { state: 'installed', observed: 'managed root block present' };
  }
  if (content.includes('thoth-agents:codex-root:start')) {
    return { state: 'drift', observed: 'managed root block differs' };
  }
  return { state: 'missing', observed: 'managed root block absent' };
}

function managedModelState(item: CodexSetupPlanItem): {
  state: ManagedState;
  observed: string;
} {
  if (!existsSync(item.targetPath))
    return { state: 'missing', observed: 'absent' };
  try {
    const parsed = JSON.parse(readFileSync(item.targetPath, 'utf8')) as {
      version?: unknown;
      models?: unknown;
    };
    if (
      parsed.version !== MANAGED_MODEL_STATE_VERSION ||
      !parsed.models ||
      typeof parsed.models !== 'object' ||
      Array.isArray(parsed.models)
    ) {
      return { state: 'unknown', observed: 'invalid managed model state' };
    }
    return item.content === readFileSync(item.targetPath, 'utf8')
      ? { state: 'installed', observed: 'managed model state current' }
      : { state: 'drift', observed: 'managed model state differs' };
  } catch {
    return { state: 'unknown', observed: 'unparseable managed model state' };
  }
}

function userConfigState(item: CodexSetupPlanItem): {
  state: ManagedState;
  observed: string;
} {
  if (!existsSync(item.targetPath))
    return { state: 'missing', observed: 'absent' };
  const content = readFileSync(item.targetPath, 'utf8');
  if (/^\s*default_mode_request_user_input\s*=\s*true\b/m.test(content)) {
    return {
      state: 'installed',
      observed: 'default mode request input enabled',
    };
  }
  if (/^\s*default_mode_request_user_input\s*=\s*false\b/m.test(content)) {
    return { state: 'drift', observed: 'default mode request input disabled' };
  }
  return { state: 'missing', observed: 'managed feature flag absent' };
}

function contentState(item: CodexSetupPlanItem): {
  state: ManagedState;
  observed: string;
} {
  if (!existsSync(item.targetPath))
    return { state: 'missing', observed: 'absent' };
  const observed = readFileSync(item.targetPath, 'utf8');
  if (item.content === observed)
    return { state: 'installed', observed: 'current' };
  if (item.role) {
    const currentModel = parseRoleTomlModel(observed);
    const expectedModel = parseRoleTomlModel(item.content ?? '');
    if (currentModel && expectedModel && currentModel !== expectedModel) {
      return {
        state: 'drift',
        observed: `model ${currentModel}; expected ${expectedModel}`,
      };
    }
  }
  return { state: 'drift', observed: 'content differs' };
}

function classifyItem(item: CodexSetupPlanItem): {
  state: ManagedState;
  observed: string;
} {
  if (item.action === 'diagnose-only') {
    return { state: 'unknown', observed: 'diagnostic guidance only' };
  }
  if (item.action === 'merge-managed-block') return rootBlockState(item);
  if (item.action === 'write-managed-model-state') {
    return managedModelState(item);
  }
  if (item.action === 'merge-toml') return userConfigState(item);
  return contentState(item);
}

function aggregateState(states: ManagedState[]): ManagedState {
  if (states.includes('unknown')) return 'unknown';
  if (states.includes('drift')) return 'drift';
  if (states.includes('outdated')) return 'outdated';
  if (states.includes('missing')) return 'missing';
  return 'installed';
}

function statusSummary(state: ManagedState): string {
  switch (state) {
    case 'installed':
      return 'Codex managed setup surfaces are installed and current.';
    case 'missing':
      return 'Codex managed setup surfaces are missing.';
    case 'drift':
      return 'Codex managed setup exists but differs from expected managed output.';
    case 'outdated':
      return 'Codex managed setup includes an older generated package artifact.';
    case 'unknown':
      return 'Codex managed setup could not be classified safely.';
  }
}

function codexRequiredSkillStatus(context: CodexOperationContext): {
  targets: ManagedTarget[];
  diagnostics: OperationWarning[];
} {
  const targets: ManagedTarget[] = REQUIRED_SKILLS.map((skill) => {
    const path = getRequiredSkillPath(skill, 'codex', context.homeDir);
    const installed = existsSync(path);
    return {
      kind: 'skill',
      path,
      label: `Codex required skill: ${skill.name}`,
      state: installed ? 'installed' : 'missing',
      expected: 'required global Codex skill',
      observed: installed ? 'installed' : 'missing',
    };
  });
  return {
    targets,
    diagnostics: targets.some((target) => target.state === 'missing')
      ? [
          {
            severity: 'important',
            code: 'codex-required-skills-missing',
            message:
              'Required Codex skills are missing; run install, update, or sync to restore them.',
          },
        ]
      : [],
  };
}

function codexRequiredSkillPlanItem(): OperationPlanItem {
  return {
    title: 'Install required external skills for Codex',
    target: {
      kind: 'skill',
      label: 'Required Codex skills',
      expected: REQUIRED_SKILLS.map(({ name }) => name).join(', '),
    },
    preview: JSON.stringify(
      REQUIRED_SKILLS.map((skill) => ({
        name: skill.name,
        ...getRequiredSkillInstallCommand(skill, 'codex'),
      })),
      null,
      2,
    ),
  };
}

export function getCodexStatus(
  context: CodexOperationContext = { cwd: process.cwd() },
  evidence: ProviderEvidenceInput = {},
): HarnessStatusReport {
  const providerCapability = classifyProviderCapabilityEvidence(evidence);
  let plan: CodexSetupPlan;
  try {
    plan = buildCodexSetupPlan(codexConfig(context, true));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      harness: 'codex',
      displayName: CODEX_DISPLAY_NAME,
      state: 'unknown',
      summary: `Codex setup plan could not be built: ${message}`,
      targets: [],
      diagnostics: [
        {
          severity: 'critical',
          message,
          code: 'codex-plan-build-failed',
        },
      ],
      actions: codexActions,
      providerCapability,
      disclaimers: codexDisclaimers(),
    };
  }

  const classified = plan.items
    .filter((item) => item.action !== 'diagnose-only')
    .map((item) => ({ item, ...classifyItem(item) }));
  const requiredSkills = codexRequiredSkillStatus(context);
  const state = aggregateState([
    ...classified.map((item) => item.state),
    ...requiredSkills.targets.map((target) => target.state ?? 'unknown'),
  ]);
  const diagnostics: OperationWarning[] = plan.diagnostics.map((message) => ({
    severity: 'minor' as const,
    message,
    code: 'codex-diagnostic',
  }));
  diagnostics.push(...requiredSkills.diagnostics);

  return {
    harness: 'codex',
    displayName: CODEX_DISPLAY_NAME,
    state,
    summary: statusSummary(state),
    targets: [
      ...classified.map(({ item, state, observed }) =>
        targetForItem(item, state, observed),
      ),
      ...requiredSkills.targets,
    ],
    diagnostics,
    actions: codexActions,
    providerCapability,
    disclaimers: [
      ...codexDisclaimers(),
      ...plan.disclaimers.map((message) => ({ message })),
    ],
  };
}

function planItemFromSetup(item: CodexSetupPlanItem): OperationPlanItem {
  return {
    title: item.description,
    target: targetForItem(item),
    preview: item.content,
    backup: backupForItem(item),
  };
}

function planFromSetup(
  id: string,
  action: OperationPlan['action'],
  title: string,
  summary: string,
  setupPlan: CodexSetupPlan,
  context: CodexOperationContext,
): OperationPlan {
  const status = getCodexStatus(context);
  const canApply =
    status.state === 'installed' ||
    status.state === 'missing' ||
    status.state === 'outdated';
  const plan: OperationPlan = {
    id,
    harness: 'codex',
    action,
    title,
    summary,
    dryRun: true,
    canApply,
    targets: status.targets,
    surfaces: setupPlan.items
      .filter((item) => item.action !== 'diagnose-only')
      .map(surfaceForItem),
    backup: {
      required: setupPlan.items.some((item) => item.requiresBackup),
      strategy: 'existing-helper',
      description:
        'Codex setup apply uses the existing installer backup behavior for files that already exist.',
    },
    items: [
      ...setupPlan.items.map(planItemFromSetup),
      codexRequiredSkillPlanItem(),
    ],
    warnings: [
      ...status.diagnostics,
      ...(canApply
        ? []
        : [
            warning(
              `Codex state is ${status.state}; apply is disabled until the state is safely classified or repaired.`,
              'codex-unsafe-state',
            ),
          ]),
    ],
    disclaimers: [
      ...codexDisclaimers(),
      ...setupPlan.disclaimers.map((message) => ({ message })),
    ],
  };
  codexPlanSources.set(plan, { setupPlan, context });
  return plan;
}

export function buildCodexUpdatePlan(
  context: CodexOperationContext = { cwd: process.cwd() },
): OperationPlan {
  const setupPlan = buildCodexSetupPlan(codexConfig(context, true));
  return planFromSetup(
    'codex-update-preview',
    'update',
    'Update Codex managed setup',
    'Preview Codex managed setup refresh using buildCodexSetupPlan().',
    setupPlan,
    context,
  );
}

export function buildCodexSyncPlan(
  context: CodexOperationContext = { cwd: process.cwd() },
): OperationPlan {
  const setupPlan = buildCodexSetupPlan(codexConfig(context, true));
  return planFromSetup(
    'codex-sync-preview',
    'sync',
    'Sync Codex managed configuration',
    'Preview Codex managed root instructions, subagents, feature gates, and native marketplace guidance.',
    setupPlan,
    context,
  );
}

export function buildCodexInstallPlan(
  context: CodexOperationContext = { cwd: process.cwd() },
): OperationPlan {
  const setupPlan = buildCodexSetupPlan(codexConfig(context, true));
  return planFromSetup(
    'codex-install-preview',
    'install',
    'Install Codex managed setup',
    'Preview Codex managed agent-pack setup using buildCodexSetupPlan().',
    setupPlan,
    context,
  );
}

function normalizeCodexModel(input: ModelRoleInput): string {
  return normalizeCodexRuntimeModel(input.model);
}

const CODEX_DOCUMENTED_EFFORTS = new Set([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
]);

export function resolveCodexEffort(
  input: ModelRoleInput,
):
  | { ok: true; value: string | undefined }
  | { ok: false; code: string; message: string } {
  if (!input.effort || input.effort.kind === 'inherit') {
    return { ok: true, value: undefined };
  }
  const value = input.effort.value;
  if (!CODEX_DOCUMENTED_EFFORTS.has(value)) {
    return {
      ok: false,
      code: 'codex-effort-undocumented',
      message: `Codex does not document reasoning effort "${value}".`,
    };
  }
  if (
    !input.catalogId?.startsWith('openai/') ||
    !input.availableEfforts?.includes(value)
  ) {
    return {
      ok: false,
      code: 'codex-effort-model-unsupported',
      message: `Model ${input.catalogId ?? input.model} does not publish Codex effort "${value}".`,
    };
  }
  return { ok: true, value };
}

function isCodexRole(role: string): role is CodexRoleName {
  return (CODEX_ROLE_NAMES as readonly string[]).includes(role);
}

export function buildCodexModelPlan(
  input: ModelConfigInput,
  context: CodexOperationContext = { cwd: process.cwd() },
): OperationPlan {
  const status = getCodexStatus(context);
  const candidateRoles = input.roles
    .filter((role) => isCodexRole(role.role))
    .map((role) => ({
      role: role.role as CodexRoleName,
      model: normalizeCodexModel(role),
      effort: resolveCodexEffort(role),
      clearEffort: role.effort?.kind === 'inherit',
    }));
  const supportedRoles = candidateRoles
    .filter((role) => role.effort.ok)
    .map((role) => ({
      role: role.role,
      model: role.model,
      ...((role.effort as { ok: true; value: string | undefined }).value
        ? { effort: (role.effort as { ok: true; value: string }).value }
        : {}),
      ...(role.clearEffort ? { clearEffort: true } : {}),
    }));
  const effortErrors = candidateRoles.filter((role) => !role.effort.ok);
  const unsupportedRoles = input.roles.filter(
    (role) => !isCodexRole(role.role),
  );
  const warnings: OperationWarning[] = [
    ...status.diagnostics,
    ...(input.warnings ?? []),
    ...unsupportedRoles.map((role) =>
      warning(
        `Codex does not expose a supported generated model surface for ${role.role}; this plan will not write that role.`,
        'codex-unsupported-model-role',
      ),
    ),
    ...effortErrors.map((role) =>
      warning(
        (role.effort as { ok: false; message: string }).message,
        (role.effort as { ok: false; code: string }).code,
      ),
    ),
  ];
  if (input.harness !== 'codex') {
    warnings.push(
      warning(
        'Model plan target harness must be codex.',
        'codex-model-harness-mismatch',
      ),
    );
  }

  const targets = supportedRoles.map(({ role }) => {
    const target = status.targets.find((candidate) =>
      candidate.path?.endsWith(`thoth-agents-${role}.toml`),
    );
    return (
      target ?? {
        kind: 'generated-artifact' as const,
        label: `Codex ${role} subagent`,
        state: 'missing' as const,
      }
    );
  });
  const config = codexConfig(context, false);
  const stateTarget = status.targets.find((target) =>
    target.path?.endsWith('.thoth-agents-managed-models.json'),
  );
  const plan: OperationPlan = {
    id: 'codex-model-config-preview',
    harness: 'codex',
    action: 'model-config',
    title: 'Configure Codex subagent model lines',
    summary:
      'Preview model changes for generated Codex subagent TOML files and .thoth-agents-managed-models.json only.',
    dryRun: true,
    canApply:
      input.harness === 'codex' &&
      supportedRoles.length > 0 &&
      effortErrors.length === 0 &&
      status.state !== 'unknown',
    targets: [...targets, ...(stateTarget ? [stateTarget] : [])],
    surfaces: targets.map((target) => ({
      id: `codex-model:${target.label}`,
      label: target.label ?? 'Codex subagent TOML',
      path: target.path,
      state: target.state,
    })),
    backup: {
      required: true,
      strategy: 'managed-backup-file',
      description:
        'Existing subagent TOML and managed model state files are backed up by the managed write helper.',
    },
    items: supportedRoles.map(({ role, model, effort }) => ({
      title: `Set ${role} Codex subagent model line`,
      target: targets.find((target) =>
        target.path?.endsWith(`thoth-agents-${role}.toml`),
      ) ?? {
        kind: 'generated-artifact',
        label: `Codex ${role} subagent`,
      },
      preview: JSON.stringify({ role, model, effort }),
      backup: {
        required: true,
        strategy: 'managed-backup-file',
      },
    })),
    warnings,
    disclaimers: [
      ...codexDisclaimers(),
      ...(input.disclaimers ?? []),
      {
        message:
          'Codex model configuration writes only generated subagent TOML model lines and the managed model state JSON.',
        code: 'codex-model-supported-surface',
      },
    ],
  };
  codexModelSources.set(plan, { config, roles: supportedRoles });
  return plan;
}

function rejectPlan(
  plan: OperationPlan,
  message: string,
  severity: OperationWarning['severity'] = 'critical',
): OperationApplyResult {
  return {
    harness: plan.harness,
    action: plan.action,
    applied: false,
    summary: message,
    changedTargets: [],
    backups: [],
    warnings: [{ severity, message }],
    disclaimers: codexDisclaimers(),
  };
}

function validateCodexPlan(plan: OperationPlan): OperationApplyResult | null {
  if (plan.harness !== 'codex') {
    return rejectPlan(plan, 'Only Codex operation plans can be applied.');
  }
  if (!plan.canApply) {
    return rejectPlan(
      plan,
      'Codex plan cannot be applied because canApply is false.',
    );
  }
  if (!['install', 'update', 'sync', 'model-config'].includes(plan.action)) {
    return rejectPlan(plan, `Unsupported Codex apply action: ${plan.action}.`);
  }
  if (plan.items.length === 0) {
    return rejectPlan(plan, 'Codex plan has no items to apply.');
  }
  return null;
}

export function applyCodexPlan(plan: OperationPlan): OperationApplyResult {
  const rejection = validateCodexPlan(plan);
  if (rejection) return rejection;

  if (plan.action === 'model-config') {
    const source = codexModelSources.get(plan);
    if (!source) {
      return rejectPlan(
        plan,
        'Codex model plan was not produced by buildCodexModelPlan in this process.',
      );
    }
    const result = applyCodexManagedModelOverrides(source.config, source.roles);
    return {
      harness: 'codex',
      action: 'model-config',
      applied: result.success,
      summary: result.success
        ? 'Applied Codex subagent model overrides.'
        : (result.error ?? 'Failed to apply Codex subagent model overrides.'),
      changedTargets: result.changed.map((path) => ({
        kind: path.endsWith('.json') ? 'memory-state' : 'generated-artifact',
        path,
        label: basename(path),
        state: 'installed',
      })),
      backups: result.changed
        .filter((path) => existsSync(`${path}.bak`))
        .map((path) => ({ path: `${path}.bak`, label: 'managed backup' })),
      warnings: result.success
        ? []
        : [
            {
              severity: 'critical',
              message: result.error ?? 'Codex model apply failed.',
            },
          ],
      disclaimers: codexDisclaimers(),
    };
  }

  const source = codexPlanSources.get(plan);
  if (!source) {
    return rejectPlan(
      plan,
      'Codex setup plan was not produced by a Codex operation plan builder in this process.',
    );
  }
  const result = applyCodexSetup({ ...source.setupPlan, dryRun: false });
  const requiredSkillWarnings: OperationWarning[] = [];
  const requiredSkillTargets: ManagedTarget[] = [];
  if (result.success) {
    for (const skill of REQUIRED_SKILLS) {
      const installed = installRequiredSkill(skill, 'codex', {
        homeDir: source.context.homeDir,
      });
      const success = installed.status !== 'failed';
      requiredSkillTargets.push({
        kind: 'skill',
        path: installed.skillPath,
        label: `Codex required skill: ${skill.name}`,
        state: success ? 'installed' : 'drift',
        observed: success ? installed.status : 'installation failed',
      });
      if (!success) {
        requiredSkillWarnings.push({
          severity: 'critical',
          code: 'codex-required-skill-failed',
          message: `Failed to install required Codex skill: ${skill.name}.`,
        });
      }
    }
  }
  const success = result.success && requiredSkillWarnings.length === 0;
  return {
    harness: 'codex',
    action: plan.action,
    applied: success,
    summary: success
      ? `Applied Codex managed ${plan.action} plan.`
      : requiredSkillWarnings.length > 0
        ? `Codex setup was written, but required skills failed to install.`
        : (result.error ?? `Failed to apply Codex ${plan.action} plan.`),
    changedTargets: [
      ...result.changed.map((path) => ({
        kind: path.endsWith('.json')
          ? ('memory-state' as const)
          : ('generated-artifact' as const),
        path,
        label: basename(path),
        state: 'installed' as const,
      })),
      ...requiredSkillTargets,
    ],
    backups: result.changed
      .filter((path) => existsSync(`${path}.bak`))
      .map((path) => ({ path: `${path}.bak`, label: 'managed backup' })),
    warnings: [
      ...requiredSkillWarnings,
      ...(result.success
        ? []
        : [
            {
              severity: 'critical' as const,
              message: result.error ?? 'Codex setup apply failed.',
            },
          ]),
    ],
    disclaimers: codexDisclaimers(),
  };
}
