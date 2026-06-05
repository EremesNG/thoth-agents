import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { CLAUDE_CODE_SUBAGENT_DEFAULT_MODELS } from '../../harness/adapters/claude-code';
import {
  applyClaudeCodeManagedModelOverrides,
  applyClaudeCodeSetup,
  buildClaudeCodeSetupPlan,
  CLAUDE_CODE_ROLE_NAMES,
  type ClaudeCodeInstallConfig,
  type ClaudeCodeSetupPlan,
  type ClaudeCodeSetupPlanItem,
  isClaudeCodeModelAlias,
} from '../claude-code-install';
import type {
  ClaudeCodeInstallScope,
  ClaudeCodeRoleName,
} from '../claude-code-paths';
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

export interface ClaudeCodeOperationContext extends OperationContext {
  scope?: ClaudeCodeInstallScope;
  homeDir?: string;
  packageRoot?: string;
}

const CLAUDE_CODE_DISPLAY_NAME = 'Claude Code';
const claudeCodePlanSources = new WeakMap<OperationPlan, ClaudeCodeSetupPlan>();
const claudeCodeModelSources = new WeakMap<
  OperationPlan,
  {
    config: ClaudeCodeInstallConfig;
    roles: { role: ClaudeCodeRoleName; model: string }[];
  }
>();

const claudeCodeActions: HarnessAction[] = [
  {
    id: 'claude-code-status',
    kind: 'status',
    label: 'Status',
    description: 'Inspect managed Claude Code plugin state',
    dryRun: false,
    requiresConfirmation: false,
    supported: true,
  },
  {
    id: 'claude-code-list',
    kind: 'list',
    label: 'List',
    description: 'List managed Claude Code surfaces and actions',
    dryRun: false,
    requiresConfirmation: false,
    supported: true,
  },
  {
    id: 'claude-code-install',
    kind: 'install',
    label: 'Install',
    description: 'Preview Claude Code plugin package install',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
  {
    id: 'claude-code-update',
    kind: 'update',
    label: 'Update',
    description: 'Preview Claude Code managed plugin refresh',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
  {
    id: 'claude-code-sync',
    kind: 'sync',
    label: 'Sync',
    description: 'Preview Claude Code managed plugin sync',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
  {
    id: 'claude-code-model-config',
    kind: 'model-config',
    label: 'Model',
    description: 'Preview supported Claude Code subagent model line changes',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
];

export const claudeCodeOperationAdapter = {
  id: 'claude',
  displayName: CLAUDE_CODE_DISPLAY_NAME,
  available: true,
  description: 'Claude Code plugin package and managed subagent surfaces.',
  actions: claudeCodeActions,
} as const satisfies HarnessOperationAdapter;

function claudeCodeConfig(
  context: ClaudeCodeOperationContext = { cwd: process.cwd() },
  dryRun: boolean,
): ClaudeCodeInstallConfig {
  return {
    dryRun,
    reset: false,
    // Match the installer (install.ts uses 'user') so post-install status,
    // update, sync, and model commands resolve the same plugin root.
    scope: context.scope ?? 'user',
    projectRoot: context.cwd,
    homeDir: context.homeDir,
    packageRoot: context.packageRoot,
  };
}

function claudeCodeDisclaimers() {
  return [
    {
      message:
        'Subagents inherit all main-thread tools (including MCP servers); read-only roles must not mutate the workspace per their operational contract (instruction-level, not tooling-enforced). The orchestrator is the main session.',
      code: 'claude-code-first-class',
    },
    {
      message: 'Subagent models accept only sonnet, opus, haiku, or inherit.',
      code: 'claude-code-model-aliases',
    },
  ];
}

function warning(message: string, code: string): OperationWarning {
  return { severity: 'important', message, code };
}

function targetForItem(
  item: ClaudeCodeSetupPlanItem,
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
      ? `Claude Code ${item.role} subagent`
      : item.kind.replaceAll('-', ' '),
    state,
    expected: item.action,
    observed,
    description: item.description,
  };
}

function surfaceForItem(item: ClaudeCodeSetupPlanItem): ManagedSurface {
  return {
    id: `${item.kind}:${item.role ?? basename(item.targetPath)}`,
    label: item.role
      ? `Claude Code ${item.role} subagent`
      : item.kind.replaceAll('-', ' '),
    path: item.targetPath,
    description: item.description,
  };
}

function backupForItem(item: ClaudeCodeSetupPlanItem): BackupExpectation {
  return {
    required: item.requiresBackup,
    strategy: item.requiresBackup ? 'managed-backup-file' : 'none',
    destinations: item.requiresBackup
      ? [{ path: `${item.targetPath}.bak`, label: 'managed backup' }]
      : [],
  };
}

function manifestState(item: ClaudeCodeSetupPlanItem): {
  state: ManagedState;
  observed: string;
} {
  if (!existsSync(item.targetPath))
    return { state: 'missing', observed: 'absent' };
  const observed = readFileSync(item.targetPath, 'utf8');
  if (observed === item.content)
    return { state: 'installed', observed: 'current' };
  try {
    const expectedVersion = JSON.parse(item.content).version;
    const observedVersion = JSON.parse(observed).version;
    if (
      typeof expectedVersion === 'string' &&
      typeof observedVersion === 'string' &&
      expectedVersion !== observedVersion
    ) {
      return {
        state: 'outdated',
        observed: `version ${observedVersion}; expected ${expectedVersion}`,
      };
    }
  } catch {
    return { state: 'unknown', observed: 'unparseable plugin manifest' };
  }
  return { state: 'drift', observed: 'content differs' };
}

function contentState(item: ClaudeCodeSetupPlanItem): {
  state: ManagedState;
  observed: string;
} {
  if (!existsSync(item.targetPath))
    return { state: 'missing', observed: 'absent' };
  return readFileSync(item.targetPath, 'utf8') === item.content
    ? { state: 'installed', observed: 'current' }
    : { state: 'drift', observed: 'content differs' };
}

function classifyItem(item: ClaudeCodeSetupPlanItem): {
  state: ManagedState;
  observed: string;
} {
  if (item.kind === 'plugin-manifest') return manifestState(item);
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
      return 'Claude Code managed plugin is installed and current.';
    case 'missing':
      return 'Claude Code managed plugin is missing.';
    case 'drift':
      return 'Claude Code managed plugin exists but differs from expected output.';
    case 'outdated':
      return 'Claude Code managed plugin includes an older generated manifest.';
    case 'unknown':
      return 'Claude Code managed plugin could not be classified safely.';
  }
}

function statusFromSetupPlan(plan: ClaudeCodeSetupPlan): HarnessStatusReport {
  const classified = plan.items.map((item) => ({
    item,
    ...classifyItem(item),
  }));
  const state = aggregateState(classified.map((entry) => entry.state));

  return {
    harness: 'claude',
    displayName: CLAUDE_CODE_DISPLAY_NAME,
    state,
    summary: statusSummary(state),
    targets: classified.map(({ item, state, observed }) =>
      targetForItem(item, state, observed),
    ),
    diagnostics: plan.diagnostics.map((message) => ({
      severity: 'minor' as const,
      message,
      code: 'claude-code-diagnostic',
    })),
    actions: claudeCodeActions,
    disclaimers: [
      ...claudeCodeDisclaimers(),
      ...plan.disclaimers.map((message) => ({ message })),
    ],
  };
}

export function getClaudeCodeStatus(
  context: ClaudeCodeOperationContext = { cwd: process.cwd() },
): HarnessStatusReport {
  let plan: ClaudeCodeSetupPlan;
  try {
    plan = buildClaudeCodeSetupPlan(claudeCodeConfig(context, true));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      harness: 'claude',
      displayName: CLAUDE_CODE_DISPLAY_NAME,
      state: 'unknown',
      summary: `Claude Code setup plan could not be built: ${message}`,
      targets: [],
      diagnostics: [
        {
          severity: 'critical',
          message,
          code: 'claude-code-plan-build-failed',
        },
      ],
      actions: claudeCodeActions,
      disclaimers: claudeCodeDisclaimers(),
    };
  }

  return statusFromSetupPlan(plan);
}

function planItemFromSetup(item: ClaudeCodeSetupPlanItem): OperationPlanItem {
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
  setupPlan: ClaudeCodeSetupPlan,
): OperationPlan {
  // Classify the already-built setup plan rather than rebuilding it via
  // getClaudeCodeStatus(), so a single install/update/sync preview renders the
  // adapter (and re-reads the skill tree from disk) only once.
  const status = statusFromSetupPlan(setupPlan);
  const canApply =
    status.state === 'installed' ||
    status.state === 'missing' ||
    status.state === 'outdated' ||
    status.state === 'drift';
  const plan: OperationPlan = {
    id,
    harness: 'claude',
    action,
    title,
    summary,
    dryRun: true,
    canApply,
    targets: status.targets,
    surfaces: setupPlan.items.map(surfaceForItem),
    backup: {
      required: setupPlan.items.some((item) => item.requiresBackup),
      strategy: 'managed-backup-file',
      description:
        'Existing Claude Code plugin files are backed up before being overwritten.',
    },
    items: setupPlan.items.map(planItemFromSetup),
    warnings: status.diagnostics,
    disclaimers: [
      ...claudeCodeDisclaimers(),
      ...setupPlan.disclaimers.map((message) => ({ message })),
    ],
  };
  claudeCodePlanSources.set(plan, setupPlan);
  return plan;
}

export function buildClaudeCodeInstallPlan(
  context: ClaudeCodeOperationContext = { cwd: process.cwd() },
): OperationPlan {
  return planFromSetup(
    'claude-code-install-preview',
    'install',
    'Install Claude Code plugin package',
    'Preview Claude Code plugin package install using buildClaudeCodeSetupPlan().',
    buildClaudeCodeSetupPlan(claudeCodeConfig(context, true)),
  );
}

export function buildClaudeCodeUpdatePlan(
  context: ClaudeCodeOperationContext = { cwd: process.cwd() },
): OperationPlan {
  return planFromSetup(
    'claude-code-update-preview',
    'update',
    'Update Claude Code plugin package',
    'Preview Claude Code managed plugin refresh using buildClaudeCodeSetupPlan().',
    buildClaudeCodeSetupPlan(claudeCodeConfig(context, true)),
  );
}

export function buildClaudeCodeSyncPlan(
  context: ClaudeCodeOperationContext = { cwd: process.cwd() },
): OperationPlan {
  return planFromSetup(
    'claude-code-sync-preview',
    'sync',
    'Sync Claude Code plugin package',
    'Preview Claude Code managed plugin subagents, MCP, hooks, and skills.',
    buildClaudeCodeSetupPlan(claudeCodeConfig(context, true)),
  );
}

function isClaudeCodeRole(role: string): role is ClaudeCodeRoleName {
  return (CLAUDE_CODE_ROLE_NAMES as readonly string[]).includes(role);
}

export function buildClaudeCodeModelPlan(
  input: ModelConfigInput,
  context: ClaudeCodeOperationContext = { cwd: process.cwd() },
): OperationPlan {
  const status = getClaudeCodeStatus(context);
  const supportedRoles = input.roles
    .filter((role) => isClaudeCodeRole(role.role))
    .filter((role) => isClaudeCodeModelAlias(role.model))
    .map((role) => ({
      role: role.role as ClaudeCodeRoleName,
      model: role.model,
    }));
  const rejectedRoles = input.roles.filter(
    (role) =>
      !isClaudeCodeRole(role.role) || !isClaudeCodeModelAlias(role.model),
  );
  const warnings: OperationWarning[] = [
    ...status.diagnostics,
    ...(input.warnings ?? []),
    ...rejectedRoles.map((role) =>
      warning(
        `Claude Code does not accept role "${role.role}" with model "${role.model}"; roles must be one of ${CLAUDE_CODE_ROLE_NAMES.join(', ')} and models must be sonnet, opus, haiku, or inherit.`,
        'claude-code-unsupported-model-role',
      ),
    ),
  ];
  if (input.harness !== 'claude') {
    warnings.push(
      warning(
        'Model plan target harness must be claude.',
        'claude-code-model-harness-mismatch',
      ),
    );
  }

  const targets = supportedRoles.map(({ role }) => {
    const target = status.targets.find((candidate) =>
      candidate.path?.endsWith(`agents${pathSep()}${role}.md`),
    );
    return (
      target ?? {
        kind: 'generated-artifact' as const,
        label: `Claude Code ${role} subagent`,
        state: 'missing' as const,
      }
    );
  });
  const stateTarget = status.targets.find((target) =>
    target.path?.endsWith('.thoth-agents-managed-models.json'),
  );

  const plan: OperationPlan = {
    id: 'claude-code-model-config-preview',
    harness: 'claude',
    action: 'model-config',
    title: 'Configure Claude Code subagent model lines',
    summary:
      'Preview model changes for generated Claude Code subagent files and managed model state only.',
    dryRun: true,
    canApply:
      input.harness === 'claude' &&
      supportedRoles.length > 0 &&
      status.state !== 'unknown',
    targets: [...targets, ...(stateTarget ? [stateTarget] : [])],
    surfaces: targets.map((target) => ({
      id: `claude-code-model:${target.label}`,
      label: target.label ?? 'Claude Code subagent',
      path: target.path,
      state: target.state,
    })),
    backup: {
      required: true,
      strategy: 'managed-backup-file',
      description:
        'Existing subagent files and managed model state are backed up by the managed write helper.',
    },
    items: supportedRoles.map(({ role, model }) => ({
      title: `Set ${role} Claude Code subagent model line`,
      target: targets.find((target) =>
        target.path?.endsWith(`agents${pathSep()}${role}.md`),
      ) ?? {
        kind: 'generated-artifact',
        label: `Claude Code ${role} subagent`,
      },
      preview: JSON.stringify({ role, model }),
      backup: { required: true, strategy: 'managed-backup-file' },
    })),
    warnings,
    disclaimers: [
      ...claudeCodeDisclaimers(),
      ...(input.disclaimers ?? []),
      {
        message:
          'Claude Code model configuration writes only generated subagent frontmatter model lines and the managed model state JSON.',
        code: 'claude-code-model-supported-surface',
      },
    ],
  };
  claudeCodeModelSources.set(plan, {
    config: claudeCodeConfig(context, false),
    roles: supportedRoles,
  });
  return plan;
}

function pathSep(): string {
  return process.platform === 'win32' ? '\\' : '/';
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
    disclaimers: claudeCodeDisclaimers(),
  };
}

function validateClaudeCodePlan(
  plan: OperationPlan,
): OperationApplyResult | null {
  if (plan.harness !== 'claude') {
    return rejectPlan(plan, 'Only Claude Code operation plans can be applied.');
  }
  if (!plan.canApply) {
    return rejectPlan(
      plan,
      'Claude Code plan cannot be applied because canApply is false.',
    );
  }
  if (!['install', 'update', 'sync', 'model-config'].includes(plan.action)) {
    return rejectPlan(
      plan,
      `Unsupported Claude Code apply action: ${plan.action}.`,
    );
  }
  if (plan.items.length === 0) {
    return rejectPlan(plan, 'Claude Code plan has no items to apply.');
  }
  return null;
}

export function applyClaudeCodePlan(plan: OperationPlan): OperationApplyResult {
  const rejection = validateClaudeCodePlan(plan);
  if (rejection) return rejection;

  if (plan.action === 'model-config') {
    const source = claudeCodeModelSources.get(plan);
    if (!source) {
      return rejectPlan(
        plan,
        'Claude Code model plan was not produced by buildClaudeCodeModelPlan in this process.',
      );
    }
    const result = applyClaudeCodeManagedModelOverrides(
      source.config,
      source.roles.map((role) => ({
        role: role.role,
        model: role.model as never,
      })),
    );
    return {
      harness: 'claude',
      action: 'model-config',
      applied: result.success,
      summary: result.success
        ? 'Applied Claude Code subagent model overrides.'
        : (result.error ??
          'Failed to apply Claude Code subagent model overrides.'),
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
        : [{ severity: 'critical', message: result.error ?? 'apply failed.' }],
      disclaimers: claudeCodeDisclaimers(),
    };
  }

  const setupPlan = claudeCodePlanSources.get(plan);
  if (!setupPlan) {
    return rejectPlan(
      plan,
      'Claude Code setup plan was not produced by a Claude Code operation plan builder in this process.',
    );
  }
  const result = applyClaudeCodeSetup({ ...setupPlan, dryRun: false });
  return {
    harness: 'claude',
    action: plan.action,
    applied: result.success,
    summary: result.success
      ? `Applied Claude Code managed ${plan.action} plan.`
      : (result.error ?? `Failed to apply Claude Code ${plan.action} plan.`),
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
      : [{ severity: 'critical', message: result.error ?? 'apply failed.' }],
    disclaimers: claudeCodeDisclaimers(),
  };
}

export function defaultClaudeCodeModelRoles(): ModelRoleInput[] {
  return CLAUDE_CODE_ROLE_NAMES.map((role) => ({
    role,
    model: CLAUDE_CODE_SUBAGENT_DEFAULT_MODELS[role],
  }));
}
