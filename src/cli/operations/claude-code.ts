import { existsSync } from 'node:fs';
import { CLAUDE_CODE_SUBAGENT_DEFAULT_MODELS } from '../../harness/adapters/claude-code';
import type { ProviderEvidenceInput } from '../../harness/types';
import {
  applyClaudeCodeSetup,
  buildClaudeCodeSetupPlan,
  CLAUDE_CODE_ROLE_NAMES,
  type ClaudeCodeInstallConfig,
  type ClaudeCodeSetupPlan,
  type ClaudeCodeSetupPlanItem,
  type ClaudeCommandExecutor,
  isClaudeCodeModelAlias,
} from '../claude-code-install';
import type { ClaudeCodeInstallScope } from '../claude-code-paths';
import {
  type FinalizeHarnessInstallOptions,
  finalizeHarnessInstall,
} from '../install-completion';
import {
  getInstallLedgerPath,
  type InstallLedgerOptions,
} from '../install-ledger';
import {
  type ExecutingPackageVersionResult,
  resolveExecutingPackageVersion,
} from '../package-version';
import {
  getRequiredSkillInstallCommand,
  getRequiredSkillPath,
  installRequiredSkill,
  REQUIRED_SKILLS,
} from '../skills';
import { getThothMemSetupCommand } from '../thoth-mem-install';
import type {
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
import {
  classifyProviderCapabilityEvidence,
  getCliManagedInstallVersionTarget,
  getInstallCompletionEvidence,
} from './types';

export interface ClaudeCodeOperationContext extends OperationContext {
  scope?: ClaudeCodeInstallScope;
  homeDir?: string;
  packageRoot?: string;
  commandExecutor?: ClaudeCommandExecutor;
  resolveExecutingPackageVersion?: () => ExecutingPackageVersionResult;
  buildClaudeCodeSetupPlan?: typeof buildClaudeCodeSetupPlan;
  applyClaudeCodeSetup?: typeof applyClaudeCodeSetup;
  installRequiredSkill?: typeof installRequiredSkill;
  finalizeHarnessInstall?: (
    options: FinalizeHarnessInstallOptions,
  ) => ReturnType<typeof finalizeHarnessInstall>;
  runThothMemSetup?: FinalizeHarnessInstallOptions['runThothMemSetup'];
  installLedgerOptions?: InstallLedgerOptions;
}

const CLAUDE_CODE_DISPLAY_NAME = 'Claude Code';
const claudeCodePlanSources = new WeakMap<
  OperationPlan,
  {
    setupPlan: ClaudeCodeSetupPlan;
    context: ClaudeCodeOperationContext;
    version?: string;
  }
>();
const CLAUDE_CODE_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

export type ClaudeCodeEffortResolution =
  | { ok: true; effort: string | undefined }
  | { ok: false; code: string; message: string };

export function resolveClaudeCodeEffort(
  input: Pick<
    ModelRoleInput,
    'availableEfforts' | 'catalogId' | 'effort' | 'model'
  >,
): ClaudeCodeEffortResolution {
  if (!input.effort || input.effort.kind === 'inherit') {
    return { ok: true, effort: undefined };
  }
  const effort = input.effort.value;
  if (!CLAUDE_CODE_EFFORTS.has(effort)) {
    return {
      ok: false,
      code: 'claude-code-effort-runtime-unsupported',
      message: `Claude Code does not support effort ${effort}.`,
    };
  }
  if (isClaudeCodeModelAlias(input.model) && input.model !== 'inherit') {
    return { ok: true, effort };
  }
  if (
    input.catalogId === input.model &&
    input.availableEfforts?.includes(effort)
  ) {
    return { ok: true, effort };
  }
  return {
    ok: false,
    code: 'claude-code-effort-catalog-unsupported',
    message: `Effort ${effort} is not supported by ${input.catalogId ?? input.model} in the models.dev catalog.`,
  };
}

const MODEL_CONFIG_DISABLED_REASON =
  'Native Claude marketplace cache files are manager-owned; configure packaged agent defaults in the repository and publish a new plugin version.';

const claudeCodeActions: HarnessAction[] = [
  {
    id: 'claude-code-status',
    kind: 'status',
    label: 'Status',
    description: 'Inspect native Claude Code marketplace and plugin state',
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
    description: 'Preview native Claude marketplace registration and install',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
  {
    id: 'claude-code-update',
    kind: 'update',
    label: 'Update',
    description: 'Preview native Claude plugin reconciliation',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
  {
    id: 'claude-code-sync',
    kind: 'sync',
    label: 'Sync',
    description:
      'Preview native Claude plugin and required-skill reconciliation',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
  {
    id: 'claude-code-model-config',
    kind: 'model-config',
    label: 'Model',
    description: 'Claude agent models are package-owned defaults',
    dryRun: true,
    requiresConfirmation: false,
    supported: false,
    disabledReason: MODEL_CONFIG_DISABLED_REASON,
  },
];

export const claudeCodeOperationAdapter = {
  id: 'claude',
  displayName: CLAUDE_CODE_DISPLAY_NAME,
  available: true,
  description: 'Native Claude Code marketplace plugin and required skills.',
  actions: claudeCodeActions,
} as const satisfies HarnessOperationAdapter;

function claudeCodeConfig(
  context: ClaudeCodeOperationContext = { cwd: process.cwd() },
  dryRun: boolean,
  refresh = false,
): ClaudeCodeInstallConfig {
  return {
    dryRun,
    reset: false,
    scope: context.scope ?? 'user',
    projectRoot: context.cwd,
    commandExecutor: context.commandExecutor,
    refresh,
  };
}

function claudeCodeDisclaimers() {
  return [
    {
      message:
        'Claude Code owns marketplace snapshots and installed plugin cache files; thoth-agents never edits that cache directly.',
      code: 'claude-code-manager-owned-cache',
    },
    {
      message:
        'Read-only roles remain instruction/tool-denylist constrained; the orchestrator is activated as the main plugin agent.',
      code: 'claude-code-first-class',
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
    kind: 'package',
    path: item.targetPath,
    label:
      item.kind === 'native-marketplace'
        ? 'Claude Code marketplace'
        : 'Claude Code plugin',
    state,
    expected: item.action,
    observed,
    description: item.description,
  };
}

function surfaceForItem(item: ClaudeCodeSetupPlanItem): ManagedSurface {
  return {
    id: `${item.kind}:${item.action}`,
    label:
      item.kind === 'native-marketplace'
        ? 'Claude Code marketplace'
        : 'Claude Code plugin',
    path: item.targetPath,
    description: item.description,
  };
}

function managerTargets(plan: ClaudeCodeSetupPlan): ManagedTarget[] {
  if (!plan.ready) {
    return [
      {
        kind: 'package',
        path: plan.pluginRoot,
        label: 'Claude Code native plugin',
        state: 'unknown',
        observed: 'native manager state is unsafe to mutate',
      },
    ];
  }
  if (plan.items.length === 0) {
    return [
      {
        kind: 'package',
        path: plan.pluginRoot,
        label: 'Claude Code native plugin',
        state: 'installed',
        expected: 'registered marketplace and enabled plugin',
        observed: 'registered and enabled',
      },
    ];
  }
  return plan.items.map((item) => {
    if (item.action === 'enable-plugin') {
      return targetForItem(item, 'drift', 'plugin disabled');
    }
    if (item.action === 'update-plugin') {
      return targetForItem(item, 'installed', 'native update requested');
    }
    return targetForItem(item, 'missing', 'absent');
  });
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
      return 'Claude Code native plugin and required skills are installed.';
    case 'missing':
      return 'Claude Code native plugin or required skills are missing.';
    case 'drift':
      return 'Claude Code native plugin is installed but disabled or incomplete.';
    case 'outdated':
      return 'Claude Code native plugin is outdated.';
    case 'unknown':
      return 'Claude Code native plugin state could not be classified safely.';
  }
}

function claudeCodeRequiredSkillStatus(context: ClaudeCodeOperationContext): {
  targets: ManagedTarget[];
  diagnostics: OperationWarning[];
} {
  const targets: ManagedTarget[] = REQUIRED_SKILLS.map((skill) => {
    const path = getRequiredSkillPath(skill, 'claude', context.homeDir);
    const installed = existsSync(path);
    return {
      kind: 'skill',
      path,
      label: `Claude Code required skill: ${skill.name}`,
      state: installed ? 'installed' : 'missing',
      expected: 'required global Claude Code skill',
      observed: installed ? 'installed' : 'missing',
    };
  });
  return {
    targets,
    diagnostics: targets.some((target) => target.state === 'missing')
      ? [
          {
            severity: 'important',
            code: 'claude-code-required-skills-missing',
            message:
              'Required Claude Code skills are missing; run install, update, or sync to restore them.',
          },
        ]
      : [],
  };
}

function claudeCodeRequiredSkillPlanItem(): OperationPlanItem {
  return {
    title: 'Install required external skills for Claude Code',
    target: {
      kind: 'skill',
      label: 'Required Claude Code skills',
      expected: REQUIRED_SKILLS.map(({ name }) => name).join(', '),
    },
    preview: JSON.stringify(
      REQUIRED_SKILLS.map((skill) => ({
        name: skill.name,
        ...getRequiredSkillInstallCommand(skill, 'claude'),
      })),
      null,
      2,
    ),
  };
}

function statusFromSetupPlan(
  plan: ClaudeCodeSetupPlan,
  context: ClaudeCodeOperationContext,
): HarnessStatusReport {
  const manager = managerTargets(plan);
  const requiredSkills = claudeCodeRequiredSkillStatus(context);
  const state = aggregateState(
    [...manager, ...requiredSkills.targets].map(
      (target) => target.state ?? 'unknown',
    ),
  );
  return {
    harness: 'claude',
    displayName: CLAUDE_CODE_DISPLAY_NAME,
    state,
    summary: statusSummary(state),
    targets: [...manager, ...requiredSkills.targets],
    diagnostics: [
      ...plan.diagnostics.map((message) => ({
        severity: 'minor' as const,
        message,
        code: 'claude-code-diagnostic',
      })),
      ...requiredSkills.diagnostics,
    ],
    actions: claudeCodeActions,
    disclaimers: [
      ...claudeCodeDisclaimers(),
      ...plan.disclaimers.map((message) => ({ message })),
    ],
  };
}

export function getClaudeCodeStatus(
  context: ClaudeCodeOperationContext = { cwd: process.cwd() },
  evidence: ProviderEvidenceInput = {},
): HarnessStatusReport {
  const providerCapability = classifyProviderCapabilityEvidence(evidence);
  const installVersionTarget = getCliManagedInstallVersionTarget('claude', {
    env: context.env,
    homeDir: context.homeDir,
  });
  try {
    const plan = buildClaudeCodeSetupPlan(claudeCodeConfig(context, true));
    const status = statusFromSetupPlan(plan, context);
    return {
      ...status,
      targets: [...status.targets, installVersionTarget],
      providerCapability,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      harness: 'claude',
      displayName: CLAUDE_CODE_DISPLAY_NAME,
      state: 'unknown',
      summary: `Claude Code setup plan could not be built: ${message}`,
      targets: [installVersionTarget],
      diagnostics: [
        {
          severity: 'critical',
          message,
          code: 'claude-code-plan-build-failed',
        },
      ],
      actions: claudeCodeActions,
      providerCapability,
      disclaimers: claudeCodeDisclaimers(),
    };
  }
}

function planItemFromSetup(item: ClaudeCodeSetupPlanItem): OperationPlanItem {
  return {
    title: item.description,
    target: targetForItem(item),
    preview: `${item.command.executable} ${item.command.args.join(' ')}`,
    backup: { required: false, strategy: 'external' },
  };
}

function claudeLedgerOptions(
  context: ClaudeCodeOperationContext,
): InstallLedgerOptions {
  return (
    context.installLedgerOptions ?? {
      env: context.env,
      homeDir: context.homeDir,
    }
  );
}

function planFromSetup(
  id: string,
  action: OperationPlan['action'],
  title: string,
  summary: string,
  setupPlan: ClaudeCodeSetupPlan,
  context: ClaudeCodeOperationContext,
  version?: string,
): OperationPlan {
  const status = statusFromSetupPlan(setupPlan, context);
  const missingSkills = status.targets.some(
    (target) => target.kind === 'skill' && target.state === 'missing',
  );
  const providerCommand = getThothMemSetupCommand('claude', true);
  const nativeSetupItems: OperationPlanItem[] =
    setupPlan.items.length > 0
      ? setupPlan.items.map(planItemFromSetup)
      : [
          {
            title: 'Verify Claude Code native marketplace and plugin state',
            target: {
              kind: 'package',
              path: setupPlan.pluginRoot,
              label: 'Claude Code native thoth-agents plugin',
            },
            preview:
              'Inspect and verify the canonical marketplace and enabled native plugin.',
            backup: { required: false, strategy: 'external' },
          },
        ];
  const completionItems: OperationPlanItem[] = version
    ? [
        {
          title: 'Plan provider-owned thoth-mem setup for Claude Code',
          target: {
            kind: 'surface',
            label: 'Provider-owned thoth-mem setup',
          },
          preview: `${providerCommand.command} ${providerCommand.args.join(' ')}`,
        },
        {
          title: 'Record completed Claude Code CLI install',
          target: {
            kind: 'file',
            path: getInstallLedgerPath(claudeLedgerOptions(context)),
            label: 'CLI-managed install version',
            expected: `recorded ${version}`,
          },
          preview: JSON.stringify({ harness: 'claude', version }),
        },
      ]
    : [];
  const plan: OperationPlan = {
    id,
    harness: 'claude',
    action,
    title,
    summary,
    dryRun: true,
    canApply: setupPlan.ready && (setupPlan.items.length > 0 || missingSkills),
    targets: status.targets,
    surfaces:
      setupPlan.items.length > 0
        ? setupPlan.items.map(surfaceForItem)
        : [
            {
              id: 'native-plugin:installed',
              label: 'Claude Code native plugin',
              path: setupPlan.pluginRoot,
              state: setupPlan.ready ? 'installed' : 'unknown',
            },
          ],
    backup: {
      required: false,
      strategy: 'external',
      description:
        'Claude Code owns its marketplace snapshots and plugin cache.',
    },
    items: [
      ...nativeSetupItems,
      claudeCodeRequiredSkillPlanItem(),
      ...completionItems,
    ],
    warnings: status.diagnostics,
    disclaimers: [
      ...claudeCodeDisclaimers(),
      ...setupPlan.disclaimers.map((message) => ({ message })),
    ],
  };
  claudeCodePlanSources.set(plan, {
    setupPlan,
    context,
    ...(version ? { version } : {}),
  });
  return plan;
}

function buildCompleteClaudeCodePlan(
  action: 'install' | 'update',
  context: ClaudeCodeOperationContext,
): OperationPlan {
  const resolveVersion =
    context.resolveExecutingPackageVersion ?? resolveExecutingPackageVersion;
  const packageVersion = resolveVersion();
  const buildSetup =
    context.buildClaudeCodeSetupPlan ?? buildClaudeCodeSetupPlan;
  const plan = planFromSetup(
    `claude-code-${action}-preview`,
    action,
    `${action === 'install' ? 'Install' : 'Update'} complete Claude Code setup`,
    'Preview native marketplace/plugin refresh, required skills, provider setup, and CLI ledger commit.',
    buildSetup(claudeCodeConfig(context, true, action === 'update')),
    context,
    packageVersion.ok ? packageVersion.version : undefined,
  );
  if (!packageVersion.ok) {
    plan.canApply = false;
    plan.warnings.push(
      warning(
        packageVersion.error.message,
        'claude-code-package-version-unresolved',
      ),
    );
  }
  return plan;
}

export function buildClaudeCodeInstallPlan(
  context: ClaudeCodeOperationContext = { cwd: process.cwd() },
): OperationPlan {
  return buildCompleteClaudeCodePlan('install', context);
}

export function buildClaudeCodeUpdatePlan(
  context: ClaudeCodeOperationContext = { cwd: process.cwd() },
): OperationPlan {
  return buildCompleteClaudeCodePlan('update', context);
}

export function buildClaudeCodeSyncPlan(
  context: ClaudeCodeOperationContext = { cwd: process.cwd() },
): OperationPlan {
  const buildSetup =
    context.buildClaudeCodeSetupPlan ?? buildClaudeCodeSetupPlan;
  return planFromSetup(
    'claude-code-sync-preview',
    'sync',
    'Sync Claude Code native plugin',
    'Preview native marketplace, enabled-plugin, and required-skill reconciliation.',
    buildSetup(claudeCodeConfig(context, true)),
    context,
  );
}

export function buildClaudeCodeModelPlan(
  input: ModelConfigInput,
  _context: ClaudeCodeOperationContext = { cwd: process.cwd() },
): OperationPlan {
  const mismatch = input.harness !== 'claude';
  return {
    id: 'claude-code-model-config-unsupported',
    harness: 'claude',
    action: 'model-config',
    title: 'Claude Code package-owned agent models',
    summary: MODEL_CONFIG_DISABLED_REASON,
    dryRun: true,
    canApply: false,
    targets: input.target ? [input.target] : [],
    surfaces: [],
    backup: { required: false, strategy: 'none' },
    items: input.roles.map((role) => ({
      title: `Requested ${role.role} Claude Code model`,
      target: {
        kind: 'package',
        label: `Claude Code ${role.role} packaged agent`,
      },
      preview: JSON.stringify({
        role: role.role,
        model: role.model,
        effort: role.effort ?? null,
        catalogId: role.catalogId ?? null,
      }),
      backup: { required: false, strategy: 'none' },
    })),
    warnings: [
      ...(input.warnings ?? []),
      warning(
        mismatch
          ? 'Model plan target harness must be claude.'
          : MODEL_CONFIG_DISABLED_REASON,
        mismatch
          ? 'claude-code-model-harness-mismatch'
          : 'claude-code-model-cache-owned',
      ),
    ],
    disclaimers: [...claudeCodeDisclaimers(), ...(input.disclaimers ?? [])],
  };
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
  if (!['install', 'update', 'sync'].includes(plan.action)) {
    return rejectPlan(
      plan,
      `Unsupported Claude Code apply action: ${plan.action}.`,
    );
  }
  return null;
}

export function applyClaudeCodePlan(plan: OperationPlan): OperationApplyResult {
  const rejection = validateClaudeCodePlan(plan);
  if (rejection) return rejection;
  const source = claudeCodePlanSources.get(plan);
  if (!source) {
    return rejectPlan(
      plan,
      'Claude Code setup plan was not produced by a Claude Code operation plan builder in this process.',
    );
  }

  if (source.version) {
    const resolveVersion =
      source.context.resolveExecutingPackageVersion ??
      resolveExecutingPackageVersion;
    const currentVersion = resolveVersion();
    if (!currentVersion.ok || currentVersion.version !== source.version) {
      return rejectPlan(
        plan,
        currentVersion.ok
          ? `Approved package version changed from ${source.version} to ${currentVersion.version} before apply.`
          : currentVersion.error.message,
      );
    }
  }

  const applySetup =
    source.context.applyClaudeCodeSetup ?? applyClaudeCodeSetup;
  const result = applySetup({ ...source.setupPlan, dryRun: false });
  const requiredSkillWarnings: OperationWarning[] = [];
  const requiredSkillTargets: ManagedTarget[] = [];
  if (result.success) {
    const installSkill =
      source.context.installRequiredSkill ?? installRequiredSkill;
    for (const skill of REQUIRED_SKILLS) {
      const installed = installSkill(skill, 'claude', {
        homeDir: source.context.homeDir,
      });
      const success = installed.status !== 'failed';
      requiredSkillTargets.push({
        kind: 'skill',
        path: installed.skillPath,
        label: `Claude Code required skill: ${skill.name}`,
        state: success ? 'installed' : 'drift',
        observed: success ? installed.status : 'installation failed',
      });
      if (!success) {
        requiredSkillWarnings.push({
          severity: 'critical',
          code: 'claude-code-required-skill-failed',
          message: `Failed to install required Claude Code skill: ${skill.name}.`,
        });
      }
    }
  }
  let success = result.success && requiredSkillWarnings.length === 0;
  let summary =
    result.error ?? `Failed to apply Claude Code ${plan.action} plan.`;
  if (success) {
    summary = `Applied Claude Code native ${plan.action} plan.`;
  } else if (requiredSkillWarnings.length > 0) {
    summary =
      'Claude Code plugin was installed, but required skills failed to install.';
  }
  const changedTargets: ManagedTarget[] = [
    ...result.changed.map((path) => ({
      kind: 'package' as const,
      path,
      label: path.includes('/marketplaces/')
        ? 'Claude Code marketplace'
        : 'Claude Code plugin',
      state: 'installed' as const,
    })),
    ...requiredSkillTargets,
  ];
  const warnings: OperationWarning[] = [
    ...requiredSkillWarnings,
    ...(result.success
      ? []
      : [
          {
            severity: 'critical' as const,
            message: result.error ?? 'apply failed.',
          },
        ]),
  ];

  if (success && source.version && plan.action !== 'sync') {
    const finalize =
      source.context.finalizeHarnessInstall ?? finalizeHarnessInstall;
    const completion = finalize({
      harness: 'claude',
      version: source.version,
      dryRun: false,
      cwd: source.context.cwd,
      runThothMemSetup: source.context.runThothMemSetup,
      ledgerOptions: claudeLedgerOptions(source.context),
    });
    const completionEvidence = getInstallCompletionEvidence(completion, {
      codePrefix: 'claude-code',
      version: source.version,
      fallbackError: 'Claude Code install finalization failed.',
    });
    warnings.push(...completionEvidence.warnings);
    changedTargets.push(...completionEvidence.targets);
    if (completion.success) {
      summary = `Applied complete Claude Code ${plan.action} plan.`;
    } else {
      success = false;
      summary = completion.error ?? 'Claude Code install finalization failed.';
    }
  }
  return {
    harness: 'claude',
    action: plan.action,
    applied: success,
    summary,
    changedTargets,
    backups: [],
    warnings,
    disclaimers: claudeCodeDisclaimers(),
  };
}

export function defaultClaudeCodeModelRoles(): ModelRoleInput[] {
  return CLAUDE_CODE_ROLE_NAMES.map((role) => ({
    role,
    model: CLAUDE_CODE_SUBAGENT_DEFAULT_MODELS[role],
  }));
}
