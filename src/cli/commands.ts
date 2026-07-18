import { ALL_AGENT_NAMES, DEFAULT_MODELS } from '../config';
import { getHarnessAdapter } from '../harness/registry';
import { CODEX_ROLE_NAMES } from './codex-install';
import { install } from './install';
import {
  getOperationHarness,
  listOperationHarnesses,
  SUPPORTED_OPERATION_HARNESSES,
} from './operations';
import {
  applyClaudeCodePlan,
  buildClaudeCodeModelPlan,
  buildClaudeCodeSyncPlan,
  buildClaudeCodeUpdatePlan,
  defaultClaudeCodeModelRoles,
  getClaudeCodeStatus,
} from './operations/claude-code';
import {
  applyCodexPlan,
  buildCodexModelPlan,
  buildCodexSyncPlan,
  buildCodexUpdatePlan,
  getCodexStatus,
} from './operations/codex';
import {
  applyOpenCodePlan,
  buildOpenCodeModelPlan,
  buildOpenCodeSyncPlan,
  buildOpenCodeUpdatePlan,
  getOpenCodeStatus,
} from './operations/opencode';
import type {
  BackupExpectation,
  HarnessStatusReport,
  ManagedTarget,
  ModelRoleInput,
  OperationApplyResult,
  OperationContext,
  OperationDisclaimer,
  OperationHarnessMetadata,
  OperationPath,
  OperationPlan,
  OperationWarning,
} from './operations/types';
import { getModelOptions, type ModelOption } from './tui/model-catalog';
import {
  getClaudeCodeModelRoles,
  getCodexModelRoles,
  getOpenCodeModelRoles,
} from './tui/operations';
import type {
  CliModelRoleArg,
  CliOperationCommand,
  CliParseResult,
  GenerateArgs,
  OperationArgs,
  OperationHarnessArg,
} from './types';

function formatHarnessName(harness: OperationPlan['harness']): string {
  const metadata = getOperationHarness(harness);
  return `${metadata.displayName} (${metadata.id})`;
}

function formatTarget(target: ManagedTarget): string {
  const label = target.label ? `${target.label}: ` : '';
  const location = target.path ?? target.description ?? target.kind;
  const state = target.state ? ` [${target.state}]` : '';
  const expected = target.expected ? ` expected ${target.expected}` : '';
  const observed = target.observed ? ` observed ${target.observed}` : '';
  return `- ${label}${location}${state}${expected}${observed}`;
}

function formatPaths(paths: OperationPath[]): string[] {
  return paths.map((path) => {
    const label = path.label ? `${path.label}: ` : '';
    return `- ${label}${path.path}`;
  });
}

function formatWarnings(warnings: OperationWarning[]): string[] {
  return warnings.map(
    (warning) =>
      `- [${warning.severity}]${warning.code ? ` [${warning.code}]` : ''} ${warning.message}`,
  );
}

function formatDisclaimers(disclaimers: OperationDisclaimer[]): string[] {
  return disclaimers.map((disclaimer) => `- ${disclaimer.message}`);
}

function formatBackup(backup: BackupExpectation): string[] {
  const lines = [
    `Backup: ${backup.required ? 'required' : 'not required'} (${backup.strategy})`,
  ];
  if (backup.description) {
    lines.push(`Backup note: ${backup.description}`);
  }
  if (backup.destinations && backup.destinations.length > 0) {
    lines.push('Backup paths:', ...formatPaths(backup.destinations));
  }
  return lines;
}

function joinSections(sections: string[][]): string {
  return sections
    .filter((section) => section.length > 0)
    .map((section) => section.join('\n'))
    .join('\n\n');
}

export function formatHarnessStatusReport(
  reports: readonly HarnessStatusReport[],
): string {
  return joinSections(
    reports.map((report) => [
      `${report.displayName ?? getOperationHarness(report.harness).displayName} (${report.harness})`,
      `State: ${report.state}`,
      `Summary: ${report.summary}`,
      ...(report.providerCapability
        ? [
            'Provider evidence:',
            `Provider capability: ${report.providerCapability.state}`,
            `Evidence source: ${report.providerCapability.source}`,
            `Evidence basis: ${report.providerCapability.basis.length > 0 ? report.providerCapability.basis.join('; ') : 'none supplied'}`,
          ]
        : []),
      ...(report.targets.length > 0
        ? ['Targets:', ...report.targets.map(formatTarget)]
        : []),
      ...(report.diagnostics.length > 0
        ? ['Warnings:', ...formatWarnings(report.diagnostics)]
        : []),
      ...(report.disclaimers && report.disclaimers.length > 0
        ? ['Disclaimers:', ...formatDisclaimers(report.disclaimers)]
        : []),
      ...(report.actions.length > 0
        ? [
            'Actions:',
            ...report.actions.map(
              (action) => `- ${action.label} - ${action.description}`,
            ),
          ]
        : []),
    ]),
  );
}

export function formatHarnessList(
  harnesses: readonly OperationHarnessMetadata[],
): string {
  return joinSections(
    harnesses.map((harness) => [
      `${harness.displayName} [${harness.available ? 'available' : 'unavailable'}]`,
      harness.description,
      ...(harness.reason ? [`Reason: ${harness.reason}`] : []),
      ...(harness.actions.length > 0
        ? [
            'Actions:',
            ...harness.actions.map(
              (action) => `- ${action.label} - ${action.description}`,
            ),
          ]
        : []),
    ]),
  );
}

export function formatOperationPlan(plan: OperationPlan): string {
  return joinSections([
    [
      plan.title,
      `Target harness: ${formatHarnessName(plan.harness)}`,
      `Action: ${plan.action}`,
      `Dry run: ${plan.dryRun ? 'yes' : 'no'}`,
      `Can apply: ${plan.canApply ? 'yes' : 'no'}`,
      `Summary: ${plan.summary}`,
    ],
    plan.targets.length > 0
      ? ['Targets:', ...plan.targets.map(formatTarget)]
      : [],
    plan.blockerTargets?.length
      ? ['Blocking targets:', ...plan.blockerTargets.map(formatTarget)]
      : [],
    plan.surfaces.length > 0
      ? [
          'Managed surfaces:',
          ...plan.surfaces.map(
            (surface) =>
              `- ${surface.label}${surface.path ? `: ${surface.path}` : ''}${
                surface.state ? ` [${surface.state}]` : ''
              }`,
          ),
        ]
      : [],
    formatBackup(plan.backup),
    plan.items.length > 0
      ? [
          'Plan items:',
          ...plan.items.flatMap((item) => [
            `- ${item.title}`,
            `  Target: ${item.target.path ?? item.target.label ?? item.target.kind}`,
            ...(item.state ? [`  State: ${item.state}`] : []),
            ...(item.preview ? [`  Preview: ${item.preview}`] : []),
          ]),
        ]
      : [],
    plan.warnings.length > 0
      ? ['Warnings:', ...formatWarnings(plan.warnings)]
      : [],
    plan.disclaimers.length > 0
      ? ['Disclaimers:', ...formatDisclaimers(plan.disclaimers)]
      : [],
  ]);
}

export function formatOperationApplyResult(
  result: OperationApplyResult,
): string {
  return joinSections([
    [
      `Target harness: ${formatHarnessName(result.harness)}`,
      `Action: ${result.action}`,
      `Applied: ${result.applied ? 'yes' : 'no'}`,
      `Summary: ${result.summary}`,
    ],
    result.changedTargets.length > 0
      ? ['Changed targets:', ...result.changedTargets.map(formatTarget)]
      : [],
    result.diagnosticTargets?.length
      ? ['Diagnostic targets:', ...result.diagnosticTargets.map(formatTarget)]
      : [],
    result.backups.length > 0
      ? ['Backups:', ...formatPaths(result.backups)]
      : [],
    result.warnings.length > 0
      ? ['Warnings:', ...formatWarnings(result.warnings)]
      : [],
    result.disclaimers.length > 0
      ? ['Disclaimers:', ...formatDisclaimers(result.disclaimers)]
      : [],
  ]);
}

export function printHelp(): void {
  console.log(`
thoth-agents CLI (npm binary: thoth-agents)

Usage: thoth-agents [COMMAND] [OPTIONS]
       npx thoth-agents@latest [COMMAND] [OPTIONS]
       pnpm dlx thoth-agents@latest [COMMAND] [OPTIONS]
       pnpm dlx thoth-agents install [OPTIONS]
       pnpm dlx thoth-agents generate --harness=codex --dry-run

Commands:
  (no command)          Open the interactive TUI in a TTY; fall back to OpenCode install in CI/non-TTY
  install               Install OpenCode, Codex, or Claude Code agent assets
  generate              Generate harness-specific artifacts
  status                Show managed install status
  list                  List managed surfaces and actions
  update                Preview managed updates
  sync                  Preview managed configuration sync
  model                 Preview role model/provider settings

Options:
  --tmux=yes|no          Enable tmux integration (yes/no)
  --skills=yes|no        Install recommended external skills
  --no-tui               Non-interactive mode
  --dry-run              Simulate install without writing files
  --reset                Repair managed installer-owned targets
  --agent=opencode|codex|claude
                         Select OpenCode plugin install (default), Codex agent-pack, or Claude Code plugin setup
  --harness=...          Select harness for status/update/sync/model (opencode|codex|claude)
  --role-effort=role=effort
                         Set a repeatable role effort; use inherit or default for no override
  -h, --help             Show this help message

Generate options:
  --harness=codex|claude  Select Codex or Claude Code artifact generation
  --output-root=PATH     Override generation root metadata

OpenCode plugin config and the npm binary are separate surfaces.
OpenCode loads the plugin with config such as:
  plugin: ["thoth-agents@latest"]

That plugin entry does not create a global thoth-agents command.
Run this CLI through a global install, npx, or pnpm dlx.

OpenCode install configures the seven-agent roster, native task delegation,
and bundled SDD skills for OpenCode.
Provider capability is external and reported only from caller-supplied evidence.

Bundled thoth-agents skills are always installed.
Use --skills=no to skip only recommended external skills.

The generated config uses OpenAI by default.
For alternative providers, see docs/provider-configurations.md.

Examples:
  thoth-agents
  pnpm dlx thoth-agents@latest
  pnpm dlx thoth-agents@latest install
  pnpm dlx thoth-agents@latest install --agent=opencode
  pnpm dlx thoth-agents@latest install --agent=codex
  pnpm dlx thoth-agents@latest install --agent=codex --dry-run
  pnpm dlx thoth-agents@latest install --agent=claude
  pnpm dlx thoth-agents@latest install --agent=claude --dry-run
  pnpm dlx thoth-agents install --no-tui --tmux=no --skills=yes
  pnpm dlx thoth-agents install --dry-run
  pnpm dlx thoth-agents install --reset
  pnpm dlx thoth-agents generate --harness=codex --dry-run
  pnpm dlx thoth-agents generate --harness=claude --dry-run
`);
}

function operationContext(): OperationContext {
  return { cwd: process.cwd() };
}

function selectedHarness(
  args: OperationArgs,
  fallback: OperationHarnessArg = 'opencode',
): OperationHarnessArg {
  return args.harness ?? fallback;
}

function statusReports(args: OperationArgs): HarnessStatusReport[] {
  const harnesses =
    args.all || !args.harness ? SUPPORTED_OPERATION_HARNESSES : [args.harness];
  const context = operationContext();
  return harnesses.map((harness) => {
    if (harness === 'opencode') return getOpenCodeStatus(context);
    if (harness === 'claude') return getClaudeCodeStatus(context);
    return getCodexStatus(context);
  });
}

function buildOperationPlan(
  command: Extract<CliOperationCommand, 'update' | 'sync'>,
  args: OperationArgs,
): OperationPlan {
  const harness = selectedHarness(args);
  const context = operationContext();
  if (harness === 'opencode') {
    return command === 'update'
      ? buildOpenCodeUpdatePlan(context)
      : buildOpenCodeSyncPlan(context);
  }
  if (harness === 'claude') {
    return command === 'update'
      ? buildClaudeCodeUpdatePlan(context)
      : buildClaudeCodeSyncPlan(context);
  }
  return command === 'update'
    ? buildCodexUpdatePlan(context)
    : buildCodexSyncPlan(context);
}

function defaultModelRoles(harness: OperationHarnessArg): ModelRoleInput[] {
  if (harness === 'codex') {
    return CODEX_ROLE_NAMES.map((role) => ({
      role,
      model: 'openai/gpt-5.4-mini',
    }));
  }

  if (harness === 'claude') {
    return defaultClaudeCodeModelRoles();
  }

  return ALL_AGENT_NAMES.map((role) => ({
    role,
    model: DEFAULT_MODELS[role] ?? 'openai/gpt-5.4',
  }));
}

export function resolveCliModelRoles(
  harness: OperationHarnessArg,
  roles: readonly CliModelRoleArg[],
  resolution?: {
    currentRoles: readonly ModelRoleInput[];
    modelOptions: readonly ModelOption[];
  },
): ModelRoleInput[] {
  const defaults = resolution?.currentRoles ?? defaultModelRoles(harness);
  if (roles.length === 0) return defaults.map((role) => ({ ...role }));
  const defaultsByRole = new Map(defaults.map((role) => [role.role, role]));
  return roles.map((role) => {
    const fallback = defaultsByRole.get(role.role);
    const model = role.model ?? fallback?.model ?? '';
    const catalogId =
      harness === 'codex' && !model.includes('/') ? `openai/${model}` : model;
    const option = resolution?.modelOptions.find(
      (candidate) =>
        candidate.id === model ||
        candidate.catalogId === model ||
        candidate.catalogId === catalogId,
    );
    const provider = role.provider ?? option?.provider ?? fallback?.provider;
    return {
      role: role.role,
      model,
      ...(provider !== undefined ? { provider } : {}),
      ...(option?.catalogId !== undefined
        ? { catalogId: option.catalogId }
        : fallback?.catalogId
          ? { catalogId: fallback.catalogId }
          : {}),
      ...(option?.efforts !== undefined
        ? { availableEfforts: option.efforts }
        : fallback?.availableEfforts
          ? { availableEfforts: fallback.availableEfforts }
          : {}),
      ...(role.effort !== undefined ? { effort: role.effort } : {}),
    };
  });
}

export interface CliModelCommandServices {
  operationContext(): OperationContext;
  modelRoles(harness: OperationHarnessArg): ModelRoleInput[];
  modelOptions(harness: OperationHarnessArg): Promise<ModelOption[]>;
}

const defaultModelCommandServices: CliModelCommandServices = {
  operationContext,
  modelRoles(harness) {
    if (harness === 'opencode') return getOpenCodeModelRoles();
    if (harness === 'claude') return getClaudeCodeModelRoles();
    return getCodexModelRoles();
  },
  modelOptions: getModelOptions,
};

function printModelGuidance(): number {
  console.log(
    [
      'Model command requires explicit model input.',
      'Examples:',
      '  thoth-agents model --harness=codex --role=deep --model=openai/gpt-5.4-mini',
      '  thoth-agents model --harness=opencode --role-model=deep=openai/gpt-5.4',
      'Preview is the default. Add --apply only after reviewing the plan.',
    ].join('\n'),
  );
  return 1;
}

async function buildModelPlan(
  args: OperationArgs,
  services: CliModelCommandServices,
): Promise<OperationPlan | undefined> {
  if (args.roles.length === 0) return undefined;
  const harness = selectedHarness(args);
  const context = services.operationContext();
  const currentRoles = services.modelRoles(harness);
  const modelOptions = await services.modelOptions(harness);
  const input = {
    harness,
    dryRun: true,
    roles: resolveCliModelRoles(harness, args.roles, {
      currentRoles,
      modelOptions,
    }),
  };
  if (harness === 'opencode') return buildOpenCodeModelPlan(input, context);
  if (harness === 'claude') return buildClaudeCodeModelPlan(input, context);
  return buildCodexModelPlan(input, context);
}

function applyOperationPlan(plan: OperationPlan): OperationApplyResult {
  if (plan.harness === 'opencode') return applyOpenCodePlan(plan);
  if (plan.harness === 'claude') return applyClaudeCodePlan(plan);
  return applyCodexPlan(plan);
}

function printPlanOrApply(plan: OperationPlan, args: OperationArgs): number {
  if (args.apply && args.dryRun) {
    console.error('--apply cannot be combined with --dry-run.');
    return 1;
  }

  if (!args.apply) {
    console.log(formatOperationPlan(plan));
    return 0;
  }

  console.log(formatOperationApplyResult(applyOperationPlan(plan)));
  return 0;
}

async function runOperationCommand(
  command: CliOperationCommand,
  args: OperationArgs,
  services: CliModelCommandServices,
): Promise<number> {
  if (command === 'status') {
    console.log(formatHarnessStatusReport(statusReports(args)));
    return 0;
  }

  if (command === 'list') {
    console.log(formatHarnessList(listOperationHarnesses()));
    return 0;
  }

  if (command === 'update' || command === 'sync') {
    return printPlanOrApply(buildOperationPlan(command, args), args);
  }

  const plan = await buildModelPlan(args, services);
  if (!plan) return printModelGuidance();
  return printPlanOrApply(plan, args);
}

export function printHarnessGeneration(args: GenerateArgs): number {
  if (!args.dryRun) {
    console.error('Generation is dry-run only in this MVP. Pass --dry-run.');
    return 1;
  }

  const adapter = getHarnessAdapter(args.harness);
  const result = adapter.render({
    projectRoot: process.cwd(),
    options: {
      dryRun: true,
      outputRoot: args.outputRoot,
      targetHarness: args.harness,
    },
  });

  console.log(JSON.stringify(result, null, 2));
  return 0;
}

export async function runCliCommand(
  parsed: CliParseResult,
  modelServices: CliModelCommandServices = defaultModelCommandServices,
): Promise<number> {
  if (parsed.command === 'install') {
    return install(parsed.installArgs);
  }

  if (parsed.command === 'generate') {
    return printHarnessGeneration(parsed.generateArgs);
  }

  if (parsed.command === 'help') {
    printHelp();
    return 0;
  }

  if (parsed.command === 'tui') {
    const { runInteractiveTui } = await import('./tui/index.js');
    return runInteractiveTui();
  }

  if (parsed.command === 'error') {
    console.error(parsed.message);
    console.error('Run with --help for usage information');
    return 1;
  }

  return runOperationCommand(
    parsed.command,
    parsed.operationArgs,
    modelServices,
  );
}
