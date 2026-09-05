import {
  ALL_AGENT_NAMES,
  getDefaultOpenCodeModel,
  getDefaultOpenCodeVariant,
} from '../config';
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
import {
  applyPiPlan,
  buildPiModelPlan,
  buildPiSyncPlan,
  buildPiUpdatePlan,
  defaultPiModelRoles,
  getPiStatus,
} from './operations/pi';
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
import { resolveExecutingPackageVersion } from './package-version';
import { getModelOptions, type ModelOption } from './tui/model-catalog';
import {
  getClaudeCodeModelRoles,
  getCodexModelRoles,
  getOpenCodeModelRoles,
  getPiModelRoles,
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

function formatCliManagedInstall(targets: readonly ManagedTarget[]): string[] {
  const target = targets.find(
    ({ label }) => label === 'CLI-managed install version',
  );
  if (!target) return [];
  const executing = target.expected?.replace(/^executing\s+/, '') ?? 'unknown';
  const recorded = target.observed?.replace(/^recorded\s+/, '') ?? 'unknown';
  return [
    'Official CLI-managed install:',
    `Executing CLI version: ${executing}`,
    `Recorded complete-install version: ${recorded}`,
    'Native marketplace versions do not advance this record.',
  ];
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
      ...formatCliManagedInstall(report.targets),
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
  const packageVersion = resolveExecutingPackageVersion();
  const exactPluginEntry = packageVersion.ok
    ? `thoth-agents@${packageVersion.version}`
    : 'thoth-agents@<executing-version-unavailable>';
  console.log(`
thoth-agents CLI (npm binary: thoth-agents)

Usage: thoth-agents [COMMAND] [OPTIONS]
       npx thoth-agents@latest [COMMAND] [OPTIONS]
       pnpm dlx thoth-agents@latest [COMMAND] [OPTIONS]
       pnpm dlx thoth-agents install [OPTIONS]
       pnpm dlx thoth-agents generate --harness=codex --dry-run

Commands:
  (no command)          Open the interactive TUI in a TTY; fall back to OpenCode install in CI/non-TTY
  install               Install OpenCode, Codex, Claude Code, or Pi agent assets
  generate              Generate harness-specific artifacts
  status                Show official CLI-managed versions and managed install status
  list                  List managed surfaces and actions
  update                Preview a complete selected-harness CLI refresh
  sync                  Preview managed configuration sync
  model                 Preview role model/provider settings

Options:
  --tmux=yes|no          Enable tmux integration (yes/no)
  --no-tui               Non-interactive mode
  --dry-run              Simulate install without writing files
  --apply                Apply a reviewed update, sync, or model plan
  --reset                Repair managed installer-owned targets
  --agent=opencode|codex|claude|pi
                         Select OpenCode plugin install (default), Codex/Claude setup, or complete Pi-native setup
  --local-package-root=PATH
                         Install local thoth-agents with --agent=pi; thoth-mem is installed separately
  --harness=...          Select harness for status/update/sync/model (opencode|codex|claude|pi)
  --role-effort=role=effort
                         Set a repeatable role effort; use inherit or default for no override
  -h, --help             Show this help message

Generate options:
  --harness=codex|claude  Select Codex or Claude Code artifact generation
  --output-root=PATH     Override generation root metadata

OpenCode plugin config and the npm binary are separate surfaces.
OpenCode loads the plugin with config such as:
  plugin: ["${exactPluginEntry}"]

That plugin entry does not create a global thoth-agents command.
Run this CLI through a global install, npx, or pnpm dlx.
@latest selects the CLI release; OpenCode receives that exact version pin.

Update performs the complete selected-harness CLI refresh and records success last.
The official record is $XDG_CONFIG_HOME/thoth-agents/install-state.json,
or ~/.config/thoth-agents/install-state.json when XDG_CONFIG_HOME is unset.
Codex and Claude marketplace versions remain native-manager-owned and do not prove
that CLI-managed agents, skills, configuration, or provider setup are aligned.
Runtime release checks notify only; use the latest CLI install or interactive CLI Update.

OpenCode install configures the adaptive seven-role roster and native task delegation.
Provider capability is external and reported only from caller-supplied evidence.

External required skills are installed for every harness:
  simplify, tdd, progressive-context-router, and architectural-grilling.
Their installation is mandatory and cannot be skipped.

The generated OpenCode config supports the built-in OpenAI preset only.

Examples:
  thoth-agents
  pnpm dlx thoth-agents@latest
  pnpm dlx thoth-agents@latest install
  pnpm dlx thoth-agents@latest install --agent=opencode
  pnpm dlx thoth-agents@latest install --agent=codex
  pnpm dlx thoth-agents@latest install --agent=codex --dry-run
  pnpm dlx thoth-agents@latest install --agent=claude
  pnpm dlx thoth-agents@latest install --agent=claude --dry-run
  pnpm dlx thoth-agents@latest install --agent=pi --dry-run
  node dist/cli/index.js install --agent=pi --local-package-root="<absolute-path>"
  pnpm dlx thoth-agents install --no-tui --tmux=no
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

function statusReports(
  args: OperationArgs,
  context: OperationContext = operationContext(),
): HarnessStatusReport[] {
  const harnesses =
    args.all || !args.harness ? SUPPORTED_OPERATION_HARNESSES : [args.harness];
  return harnesses.map((harness) => {
    if (harness === 'opencode') return getOpenCodeStatus(context);
    if (harness === 'claude') return getClaudeCodeStatus(context);
    if (harness === 'pi') return getPiStatus(context);
    return getCodexStatus(context);
  });
}

function buildOperationPlan(
  command: Extract<CliOperationCommand, 'update' | 'sync'>,
  args: OperationArgs,
  context: OperationContext = operationContext(),
): OperationPlan {
  const harness = selectedHarness(args);
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
  if (harness === 'pi') {
    return command === 'update'
      ? buildPiUpdatePlan(context)
      : buildPiSyncPlan(context);
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

  if (harness === 'pi') return defaultPiModelRoles();

  return ALL_AGENT_NAMES.map((role) => ({
    role,
    model: getDefaultOpenCodeModel(role),
    effort: { kind: 'effort', value: getDefaultOpenCodeVariant(role) },
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
  applyOperationPlan?(plan: OperationPlan): OperationApplyResult;
}

const defaultModelCommandServices: CliModelCommandServices = {
  operationContext,
  modelRoles(harness) {
    if (harness === 'opencode') return getOpenCodeModelRoles();
    if (harness === 'claude') return getClaudeCodeModelRoles();
    if (harness === 'pi') return getPiModelRoles();
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
  if (harness === 'pi') return buildPiModelPlan(input, context);
  return buildCodexModelPlan(input, context);
}

function applyOperationPlan(plan: OperationPlan): OperationApplyResult {
  if (plan.harness === 'opencode') return applyOpenCodePlan(plan);
  if (plan.harness === 'claude') return applyClaudeCodePlan(plan);
  if (plan.harness === 'pi') return applyPiPlan(plan);
  return applyCodexPlan(plan);
}

function printPlanOrApply(
  plan: OperationPlan,
  args: OperationArgs,
  applyPlan: (plan: OperationPlan) => OperationApplyResult,
): number {
  if (args.apply && args.dryRun) {
    console.error('--apply cannot be combined with --dry-run.');
    return 1;
  }

  if (!args.apply) {
    console.log(formatOperationPlan(plan));
    return 0;
  }

  const result = applyPlan(plan);
  console.log(formatOperationApplyResult(result));
  return result.applied ? 0 : 1;
}

async function runOperationCommand(
  command: CliOperationCommand,
  args: OperationArgs,
  services: CliModelCommandServices,
): Promise<number> {
  if (command === 'status') {
    console.log(
      formatHarnessStatusReport(
        statusReports(args, services.operationContext()),
      ),
    );
    return 0;
  }

  if (command === 'list') {
    console.log(formatHarnessList(listOperationHarnesses()));
    return 0;
  }

  if (command === 'update' || command === 'sync') {
    return printPlanOrApply(
      buildOperationPlan(command, args, services.operationContext()),
      args,
      services.applyOperationPlan ?? applyOperationPlan,
    );
  }

  const plan = await buildModelPlan(args, services);
  if (!plan) return printModelGuidance();
  return printPlanOrApply(
    plan,
    args,
    services.applyOperationPlan ?? applyOperationPlan,
  );
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
