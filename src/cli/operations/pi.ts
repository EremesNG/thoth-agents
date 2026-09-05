import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import {
  type AgentRoleContract,
  getAgentPackContract,
} from '../../harness/core/agent-pack';
import { THOTH_OWNED_SKILL_NAMES } from '../../harness/core/owned-skills';
import {
  isPiSpecialistRole,
  type PiSpecialistRole,
  piSpecialistName,
} from '../../harness/pi-specialists';
import type { ProviderEvidenceInput } from '../../harness/types';
import {
  type FinalizeHarnessInstallOptions,
  finalizeHarnessInstall,
} from '../install-completion';
import {
  getInstallLedgerPath,
  type InstallLedgerOptions,
} from '../install-ledger';
import {
  getPiOwnedSkillEntries,
  inspectPiPackageSkills,
} from '../owned-skills';
import { resolveExecutingPackageVersion } from '../package-version';
import { resolvePiEffort } from '../pi-effort';
import {
  applyPiSetup,
  buildPiSetupPlan,
  getPiFirstPartyPackages,
  hasExactInstalledPiPackage,
  isVersionAtLeast,
  PI_MINIMUM_VERSION,
  PI_NODE_MINIMUM,
  PI_PACKAGE_SPECS,
  type PiCommandExecutor,
  type PiSetupPlan,
  parsePiPackageList,
  writePiManagedText,
} from '../pi-install';
import { migrateLegacyPiResources } from '../pi-migration';
import {
  classifyPiPackageOwnership,
  getPiPackageReceiptPath,
  piPackagePathsEqual,
  readPiPackageReceipt,
} from '../pi-package-receipt';
import { syncPiSpecialists } from '../pi-resources';
import {
  getRequiredSkillInstallCommand,
  installRequiredSkill,
  REQUIRED_SKILLS,
} from '../skills';
import { getThothMemSetupCommand } from '../thoth-mem-install';
import type {
  HarnessAction,
  HarnessOperationAdapter,
  HarnessStatusReport,
  ManagedState,
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
} from './types';

export interface PiOperationContext extends OperationContext {
  homeDir?: string;
  packageRoot?: string;
  env?: Readonly<Record<string, string | undefined>>;
  installLedgerOptions?: InstallLedgerOptions;
  buildPiSetupPlan?: typeof buildPiSetupPlan;
  applyPiSetup?: typeof applyPiSetup;
  inspectPiPackageSkills?: typeof inspectPiPackageSkills;
  piCommandExecutor?: PiCommandExecutor;
  installRequiredSkill?: typeof installRequiredSkill;
  finalizeHarnessInstall?: (
    options: FinalizeHarnessInstallOptions,
  ) => ReturnType<typeof finalizeHarnessInstall>;
  runThothMemSetup?: FinalizeHarnessInstallOptions['runThothMemSetup'];
}

export type PiResearchProviderId = 'context7' | 'exa' | 'grep';
export type PiResearchRuntimeState =
  | 'ready'
  | 'credential-required'
  | 'unreachable'
  | 'drifted'
  | 'failed';

export interface PiResearchRuntimeEvidence {
  state: PiResearchRuntimeState;
  basis: readonly string[];
}

export interface PiStatusEvidence extends ProviderEvidenceInput {
  research?: Partial<Record<PiResearchProviderId, PiResearchRuntimeEvidence>>;
}

const PI_DISPLAY_NAME = 'Pi';
const MODEL_ROOT_LIMITATION =
  'Pi owns the ambient root session model; only thoth-agents-owned specialist definitions may be changed.';

const piActions: HarnessAction[] = [
  {
    id: 'pi-status',
    kind: 'status',
    label: 'Status',
    description:
      'Inspect Pi packages, resources, research providers, and CLI ledger',
    dryRun: false,
    requiresConfirmation: false,
    supported: true,
  },
  {
    id: 'pi-list',
    kind: 'list',
    label: 'List',
    description: 'List Pi-managed targets and truthful capability limits',
    dryRun: false,
    requiresConfirmation: false,
    supported: true,
  },
  {
    id: 'pi-install',
    kind: 'install',
    label: 'Install',
    description: 'Preview complete ordered Pi setup',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
  {
    id: 'pi-update',
    kind: 'update',
    label: 'Update',
    description: 'Preview an installation-equivalent Pi refresh',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
  {
    id: 'pi-sync',
    kind: 'sync',
    label: 'Sync',
    description:
      'Preview attributable root, specialist, skill, and grep configuration sync',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
  {
    id: 'pi-model-config',
    kind: 'model-config',
    label: 'Model',
    description: 'Configure attributable Pi specialist model and effort fields',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
    disabledReason: MODEL_ROOT_LIMITATION,
  },
];

export const piOperationAdapter = {
  id: 'pi',
  displayName: PI_DISPLAY_NAME,
  available: true,
  description:
    'Pi-native packages, ambient root, six specialists, skills, and hybrid research stack.',
  actions: piActions,
} as const satisfies HarnessOperationAdapter;

function disclaimers() {
  return [
    {
      code: 'pi-no-os-sandbox',
      message:
        "Pi extensions execute with the invoking user's system permissions; tool allowlists are not an OS or credential sandbox.",
    },
    {
      code: 'pi-runtime-owned',
      message:
        'Pi and pi-subagents own execution, concurrency, task/history storage, trust, and lifecycle.',
    },
    {
      code: 'pi-research-independent',
      message:
        'Context7, Exa, and grep.app availability is reported independently; Exa credentials remain operator-owned.',
    },
    { code: 'pi-root-model-owned', message: MODEL_ROOT_LIMITATION },
  ];
}

function warning(
  message: string,
  code: string,
  severity: OperationWarning['severity'] = 'important',
): OperationWarning {
  return { severity, message, code };
}

const RESEARCH_PROVIDER_LABEL: Record<PiResearchProviderId, string> = {
  context7: 'Context7',
  exa: 'Exa',
  grep: 'grep.app',
};

function researchRuntimeState(
  provider: PiResearchProviderId,
  targets: readonly ManagedTarget[],
  env: Readonly<Record<string, string | undefined>>,
  evidence: PiStatusEvidence,
): PiResearchRuntimeEvidence {
  const observed = evidence.research?.[provider];
  if (observed) return observed;

  if (provider === 'exa' && !env.EXA_API_KEY) {
    return {
      state: 'credential-required',
      basis: ['EXA_API_KEY is not present in the inspected environment'],
    };
  }

  const packageId = provider === 'grep' ? 'grep-adapter' : provider;
  const packageSource = PI_PACKAGE_SPECS.find(
    ({ id }) => id === packageId,
  )?.source;
  const packageReady = targets.some(
    ({ path, state }) => path === packageSource && state === 'installed',
  );
  const configReady =
    provider !== 'grep' ||
    targets.some(
      ({ kind, label, state }) =>
        kind === 'config' &&
        label?.includes('grep.app') &&
        state === 'installed',
    );

  return packageReady && configReady
    ? {
        state: 'ready',
        basis: [
          'managed package and configuration preconditions are satisfied; no live probe was requested',
        ],
      }
    : {
        state: 'drifted',
        basis: [
          'managed package or configuration preconditions are not satisfied',
        ],
      };
}

function runtimeTarget(
  provider: PiResearchProviderId,
  evidence: PiResearchRuntimeEvidence,
): ManagedTarget {
  const managedState: ManagedState =
    evidence.state === 'ready'
      ? 'installed'
      : evidence.state === 'credential-required'
        ? 'missing'
        : evidence.state === 'drifted'
          ? 'drift'
          : 'unknown';
  return {
    kind: 'surface',
    label: `${RESEARCH_PROVIDER_LABEL[provider]} runtime availability`,
    state: managedState,
    expected: 'ready',
    observed: evidence.state,
    description: evidence.basis.join('; '),
  };
}

function runtimeDiagnostic(
  provider: PiResearchProviderId,
  evidence: PiResearchRuntimeEvidence,
): OperationWarning | undefined {
  if (evidence.state === 'ready') return undefined;
  const code =
    provider === 'exa' && evidence.state === 'credential-required'
      ? 'pi-exa-credential-required'
      : `pi-${provider}-runtime-${evidence.state}`;
  const severity: OperationWarning['severity'] =
    evidence.state === 'failed'
      ? 'critical'
      : evidence.state === 'credential-required'
        ? 'minor'
        : 'important';
  return warning(
    `${RESEARCH_PROVIDER_LABEL[provider]} runtime is ${evidence.state}: ${evidence.basis.join('; ')}.`,
    code,
    severity,
  );
}

function statusFromPlan(
  plan: PiSetupPlan,
  context: PiOperationContext,
  evidence: PiStatusEvidence = {},
): HarnessStatusReport {
  const targets: ManagedTarget[] = plan.items
    .filter((item) => item.kind !== 'preflight')
    .map((item) => ({
      kind:
        item.kind === 'package'
          ? 'package'
          : item.kind === 'agent'
            ? 'file'
            : item.kind === 'mcp'
              ? 'config'
              : 'file',
      path: item.target,
      label: item.description,
      state:
        item.kind === 'package'
          ? 'unknown'
          : existsSync(item.target)
            ? item.content === undefined ||
              readFileSync(item.target, 'utf8') === item.content
              ? 'installed'
              : 'drift'
            : 'missing',
      expected:
        item.kind === 'package' ? item.target : 'attributable managed content',
      description:
        item.kind === 'package'
          ? 'Exact installed-package evidence; this does not prove live tool availability.'
          : undefined,
    }));
  const execute: PiCommandExecutor =
    context.piCommandExecutor ??
    ((command, args) => {
      const result = spawnSync(command, [...args], {
        encoding: 'utf8',
        timeout: 5_000,
        env: {
          ...process.env,
          ...context.env,
          ...(context.homeDir
            ? { HOME: context.homeDir, USERPROFILE: context.homeDir }
            : {}),
          PI_CODING_AGENT_DIR: plan.paths.piRoot,
        },
      });
      return {
        exitCode: result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        error: result.error,
      };
    });
  const node = execute('node', ['--version']);
  const pi = execute('pi', ['--version']);
  const packages = execute('pi', ['list', '--no-approve']);
  targets.unshift(
    {
      kind: 'surface',
      label: 'Node.js runtime',
      state:
        node.exitCode !== 0
          ? 'missing'
          : isVersionAtLeast(node.stdout.trim(), PI_NODE_MINIMUM)
            ? 'installed'
            : 'drift',
      expected: `>=${PI_NODE_MINIMUM}`,
      observed: node.stdout.trim() || node.stderr.trim() || 'unavailable',
    },
    {
      kind: 'package',
      label: 'Pi runtime',
      state:
        pi.exitCode !== 0
          ? 'missing'
          : isVersionAtLeast(pi.stdout.trim(), PI_MINIMUM_VERSION)
            ? 'installed'
            : 'drift',
      expected: `>=${PI_MINIMUM_VERSION}`,
      observed: pi.stdout.trim() || pi.stderr.trim() || 'unavailable',
    },
  );
  for (const target of targets.filter(
    (candidate) =>
      candidate.kind === 'package' && candidate.path?.startsWith('npm:'),
  )) {
    const packageName = target.path
      ?.replace(/^npm:/, '')
      .replace(/@[^@]+$/, '');
    target.state =
      packages.exitCode !== 0
        ? 'unknown'
        : hasExactInstalledPiPackage(packages.stdout, target.path ?? '')
          ? 'installed'
          : packageName && packages.stdout.includes(packageName)
            ? 'drift'
            : 'missing';
    target.observed =
      packages.exitCode === 0
        ? target.state
        : packages.stderr.trim() || 'pi list unavailable';
  }
  const receiptOptions = context.installLedgerOptions ?? {
    env: context.env,
    homeDir: context.homeDir,
  };
  const receipt = readPiPackageReceipt(receiptOptions);
  const configuredPackages =
    packages.exitCode === 0 ? parsePiPackageList(packages.stdout) : [];
  const firstPartyPackages = getPiFirstPartyPackages(
    configuredPackages,
    receipt.status === 'valid' ? receipt.receipt.source : undefined,
  );
  const ownership = classifyPiPackageOwnership({
    receipt,
    globalPackages: firstPartyPackages.filter(({ scope }) => scope === 'user'),
    projectPackages: firstPartyPackages.filter(
      ({ scope }) => scope === 'project',
    ),
  });
  targets.push({
    kind: 'file',
    path: getPiPackageReceiptPath(receiptOptions),
    label: 'First-party Pi ownership receipt',
    state:
      receipt.status === 'valid'
        ? 'installed'
        : receipt.status === 'missing'
          ? 'missing'
          : 'drift',
    observed: receipt.status,
  });
  targets.push({
    kind: 'surface',
    label: 'First-party Pi package ownership',
    state:
      ownership.state === 'owned-current'
        ? 'installed'
        : ownership.state === 'missing' || ownership.state === 'owned-missing'
          ? 'missing'
          : 'drift',
    expected: 'owned-current',
    observed: ownership.state,
    description: ownership.reason,
  });
  let validatedPackageRoot: string | undefined;
  if (receipt.status === 'valid') {
    const configuredCandidates = firstPartyPackages.filter(
      ({ scope, source }) =>
        scope === 'user' && source === receipt.receipt.source,
    );
    const configuredPackage = configuredCandidates[0];
    const configuredPath = configuredPackage?.installedPath;
    const localPathMatches =
      receipt.receipt.source === receipt.receipt.installSource ||
      (configuredPath !== undefined &&
        piPackagePathsEqual(configuredPath, receipt.receipt.installSource));
    const configured =
      ownership.state === 'owned-current' &&
      configuredCandidates.length === 1 &&
      configuredPath !== undefined &&
      isAbsolute(configuredPath) &&
      localPathMatches;
    if (configured) validatedPackageRoot = configuredPath;
    targets.push({
      kind: 'surface',
      path: configuredPath,
      label: 'First-party Pi configured source',
      state: configured
        ? 'installed'
        : configuredCandidates.length === 0
          ? 'missing'
          : 'drift',
      expected: `${receipt.receipt.source} -> ${receipt.receipt.installSource}`,
      observed: configuredPackage
        ? `${configuredPackage.source} -> ${configuredPath ?? 'unavailable'}`
        : 'unavailable',
    });
    const extensionPath = configuredPath
      ? join(configuredPath, 'dist', 'pi.js')
      : undefined;
    const manifestPath = configuredPath
      ? join(configuredPath, 'package.json')
      : undefined;
    let receiptMatches = false;
    if (
      extensionPath &&
      manifestPath &&
      existsSync(extensionPath) &&
      existsSync(manifestPath)
    )
      receiptMatches =
        createHash('sha256')
          .update(readFileSync(extensionPath))
          .digest('hex') === receipt.receipt.extensionSha256 &&
        createHash('sha256')
          .update(readFileSync(manifestPath))
          .digest('hex') === receipt.receipt.manifestSha256;
    targets.push({
      kind: 'surface',
      path: extensionPath,
      label: 'Native Pi extension loadability',
      state: receiptMatches ? 'installed' : extensionPath ? 'drift' : 'unknown',
      observed: receiptMatches ? 'loadable' : 'unavailable',
    });
    targets.push({
      kind: 'surface',
      label: 'Native root observation',
      state: configured && receiptMatches ? 'installed' : 'drift',
      expected: 'observed-at-install',
      observed:
        configured && receiptMatches
          ? 'observed-at-install (receipt-bound)'
          : 'unobserved',
    });
  }
  const ownedSkills = validatedPackageRoot
    ? (() => {
        const inspection = inspectPiPackageSkills({
          packageRoot: validatedPackageRoot,
        });
        return inspection.skills.map((skill) => {
          const issue =
            inspection.issues.find(({ name }) => name === skill.name) ??
            (!inspection.success
              ? {
                  state: 'drift' as const,
                  message:
                    inspection.error ??
                    'Package-declared Pi skill inspection is unavailable.',
                }
              : undefined);
          return {
            kind: 'skill' as const,
            path: join(skill.destinationPath, 'SKILL.md'),
            label: `Pi package-declared skill: ${skill.name}`,
            state: issue?.state ?? ('installed' as const),
            ...(issue ? { observed: issue.message } : {}),
          };
        });
      })()
    : THOTH_OWNED_SKILL_NAMES.map((name) => ({
        kind: 'skill' as const,
        label: `Pi package-declared skill: ${name}`,
        state: 'unknown' as const,
        observed: 'package ownership unavailable',
      }));
  targets.push(...ownedSkills);
  targets.push(
    getCliManagedInstallVersionTarget('pi', {
      env: context.env,
      homeDir: context.homeDir,
    }),
  );
  const fileStates = targets.map((target) => target.state);
  const state: ManagedState = !plan.ready
    ? 'unknown'
    : fileStates.includes('missing')
      ? 'missing'
      : fileStates.includes('drift')
        ? 'drift'
        : fileStates.includes('unknown')
          ? 'unknown'
          : 'installed';
  const runtimeEvidence = (['context7', 'exa', 'grep'] as const).map(
    (provider) => ({
      provider,
      evidence: researchRuntimeState(
        provider,
        targets,
        context.env ?? process.env,
        evidence,
      ),
    }),
  );
  targets.push(
    ...runtimeEvidence.map(({ provider, evidence: runtime }) =>
      runtimeTarget(provider, runtime),
    ),
  );
  const diagnostics = [
    ...plan.blockers.map((message) =>
      warning(message, 'pi-preflight-blocked', 'critical'),
    ),
    ...plan.diagnostics.map((message) =>
      warning(message, 'pi-resource-shadowing'),
    ),
    ...(ownership.state === 'configured-unowned' ||
    ownership.state === 'conflicting'
      ? [
          warning(
            ownership.reason ??
              `First-party Pi package ownership is ${ownership.state}; remove it manually or restore a matching receipt before Update.`,
            `pi-first-party-${ownership.state}`,
            'critical',
          ),
        ]
      : ownership.state === 'owned-missing'
        ? [
            warning(
              'The receipt-owned first-party Pi package is not configured; Install or Update may repair it.',
              'pi-first-party-owned-missing',
            ),
          ]
        : []),
    ...runtimeEvidence
      .map(({ provider, evidence: runtime }) =>
        runtimeDiagnostic(provider, runtime),
      )
      .filter((item): item is OperationWarning => item !== undefined),
  ];
  return {
    harness: 'pi',
    displayName: PI_DISPLAY_NAME,
    state,
    summary:
      state === 'installed'
        ? 'Pi managed resources are present; native package and remote-provider health remain separately owned.'
        : 'Pi setup is missing, drifted, shadowed, or blocked; rerun the complete install after resolving diagnostics.',
    targets,
    diagnostics,
    actions: piActions,
    disclaimers: disclaimers(),
  };
}

function contextPlan(context: PiOperationContext, dryRun = true): PiSetupPlan {
  const build = context.buildPiSetupPlan ?? buildPiSetupPlan;
  const version = resolveExecutingPackageVersion();
  return build({
    dryRun,
    cwd: context.cwd,
    env: context.env,
    homeDir: context.homeDir,
    commandExecutor: context.piCommandExecutor,
    packageRoot:
      context.packageRoot ?? (version.ok ? version.packageRoot : undefined),
    expectedVersion: version.ok ? version.version : undefined,
    receiptOptions: context.installLedgerOptions,
  });
}

export function getPiStatus(
  context: PiOperationContext = { cwd: process.cwd() },
  evidence: PiStatusEvidence = {},
): HarnessStatusReport {
  const status = statusFromPlan(contextPlan(context), context, evidence);
  return {
    ...status,
    providerCapability: classifyProviderCapabilityEvidence(evidence),
  };
}

const planSources = new WeakMap<
  OperationPlan,
  {
    setup: PiSetupPlan;
    context: PiOperationContext;
    version?: string;
    configuredPackageRoot?: string;
    model?: ModelConfigInput;
  }
>();

function configuredPackageRootFromStatus(
  status: HarnessStatusReport,
): string | undefined {
  const ownership = status.targets.find(
    ({ label }) => label === 'First-party Pi package ownership',
  );
  const configured = status.targets.find(
    ({ label }) => label === 'First-party Pi configured source',
  );
  return ownership?.observed === 'owned-current' &&
    configured?.state === 'installed' &&
    configured.path &&
    isAbsolute(configured.path)
    ? configured.path
    : undefined;
}

function piPlan(
  action: 'install' | 'update' | 'sync',
  context: PiOperationContext,
): OperationPlan {
  const setup = contextPlan(context);
  const status = statusFromPlan(setup, context);
  const configuredPackageRoot = configuredPackageRootFromStatus(status);
  const version = resolveExecutingPackageVersion();
  const complete = action !== 'sync';
  const items: OperationPlanItem[] = setup.items
    .filter(
      (item) =>
        complete ||
        item.kind === 'root' ||
        item.kind === 'agent' ||
        item.kind === 'mcp',
    )
    .map((item) => ({
      title: item.description,
      target: {
        kind:
          item.kind === 'package'
            ? 'package'
            : item.kind === 'mcp'
              ? 'config'
              : 'file',
        path: item.target,
        label: item.description,
      },
      preview: item.command
        ? `${item.command.command} ${item.command.args.join(' ')}`
        : `write attributable ${item.kind} surface`,
      backup: {
        required: ['root', 'agent', 'mcp'].includes(item.kind),
        strategy: 'managed-backup-file',
      },
    }));
  items.push({
    title: 'Inspect five package-declared Pi skills',
    target: { kind: 'skill', label: 'Pi package-declared skills' },
    preview: configuredPackageRoot
      ? getPiOwnedSkillEntries({ packageRoot: configuredPackageRoot })
          .map((entry) => join(entry.destinationPath, 'SKILL.md'))
          .join(', ')
      : 'unavailable until the first-party Pi package is receipt-validated',
  });
  if (complete) {
    items.push(
      {
        title: 'Install four required external skills for Pi',
        target: { kind: 'skill', label: 'Pi required external skills' },
        preview: JSON.stringify(
          REQUIRED_SKILLS.map((skill) =>
            getRequiredSkillInstallCommand(skill, 'pi'),
          ),
          null,
          2,
        ),
      },
      {
        title: 'Run provider-owned thoth-mem setup pi',
        target: { kind: 'surface', label: 'Provider setup' },
        preview: (() => {
          const cmd = getThothMemSetupCommand('pi', true);
          return `${cmd.command} ${cmd.args.join(' ')}`;
        })(),
      },
      {
        title: 'Record completed Pi CLI install',
        target: {
          kind: 'file',
          path: getInstallLedgerPath(
            context.installLedgerOptions ?? {
              env: context.env,
              homeDir: context.homeDir,
            },
          ),
          label: 'CLI-managed install version',
        },
        preview: version.ok
          ? JSON.stringify({ harness: 'pi', version: version.version })
          : 'unavailable',
      },
    );
  }
  const ownershipState = status.targets.find(
    ({ label }) => label === 'First-party Pi package ownership',
  )?.observed;
  const ownershipBlocked =
    ownershipState === 'configured-unowned' || ownershipState === 'conflicting';
  const ownershipBlockers: ManagedTarget[] = ownershipBlocked
    ? [
        {
          kind: 'surface',
          label: 'First-party Pi package ownership blocker',
          state: 'drift',
          observed: `${ownershipState}; remove the configured first-party package manually or restore its matching receipt before applying ${action}.`,
        },
      ]
    : [];
  const syncSkillsUnavailable =
    action === 'sync' &&
    (!configuredPackageRoot ||
      status.targets.some(
        ({ label, state }) =>
          label?.startsWith('Pi package-declared skill:') &&
          state !== 'installed',
      ));
  const syncSkillBlockers: ManagedTarget[] = syncSkillsUnavailable
    ? [
        {
          kind: 'skill',
          label: 'Pi package-declared skill evidence blocker',
          state: 'unknown',
          observed:
            'A receipt-validated configured Pi package root with all five manifest-owned skills is required before Sync.',
        },
      ]
    : [];
  const plan: OperationPlan = {
    id: `pi-${action}-preview`,
    harness: 'pi',
    action,
    title: `${action === 'install' ? 'Install' : action === 'update' ? 'Update' : 'Sync'} Pi`,
    summary: complete
      ? 'Preview complete pinned Pi packages, owned resources, skills, provider setup, and final ledger commit.'
      : 'Preview only attributable Pi root, specialist, package-skill evidence, and grep.app surfaces.',
    dryRun: true,
    canApply:
      setup.ready &&
      (!complete || version.ok) &&
      ownershipBlockers.length === 0 &&
      syncSkillBlockers.length === 0,
    targets: status.targets,
    blockerTargets: [
      ...setup.blockers.map((message) => ({
        kind: 'surface' as const,
        label: 'Pi preflight blocker',
        state: 'unknown' as const,
        observed: message,
      })),
      ...ownershipBlockers,
      ...syncSkillBlockers,
    ],
    surfaces: setup.items
      .filter((item) => item.kind !== 'preflight')
      .map((item) => ({
        id: `${item.kind}:${item.target}`,
        label: item.description,
        path: item.target,
      })),
    backup: {
      required: true,
      strategy: 'managed-backup-file',
      description:
        'Attributable shared files retain sibling .bak files when replaced; Pi package state remains manager-owned.',
    },
    items,
    warnings: status.diagnostics,
    disclaimers: disclaimers(),
  };
  if (!version.ok && complete)
    plan.warnings.push(
      warning(
        version.error.message,
        'pi-package-version-unresolved',
        'critical',
      ),
    );
  planSources.set(plan, {
    setup,
    context,
    ...(version.ok ? { version: version.version } : {}),
    ...(configuredPackageRoot ? { configuredPackageRoot } : {}),
  });
  return plan;
}

export function buildPiInstallPlan(
  context: PiOperationContext = { cwd: process.cwd() },
): OperationPlan {
  return piPlan('install', context);
}
export function buildPiUpdatePlan(
  context: PiOperationContext = { cwd: process.cwd() },
): OperationPlan {
  return piPlan('update', context);
}
export function buildPiSyncPlan(
  context: PiOperationContext = { cwd: process.cwd() },
): OperationPlan {
  return piPlan('sync', context);
}

export function defaultPiModelRoles(
  context: PiOperationContext = { cwd: process.cwd() },
): ModelRoleInput[] {
  const plan = contextPlan(context);
  return getAgentPackContract()
    .roles.filter(
      (role): role is AgentRoleContract & { name: PiSpecialistRole } =>
        isPiSpecialistRole(role.name),
    )
    .map((role) => {
      const path = plan.items.find(
        (item) =>
          item.kind === 'agent' &&
          basename(item.target) === `${piSpecialistName(role.name)}.md`,
      )?.target;
      const content =
        path && existsSync(path) ? readFileSync(path, 'utf8') : '';
      const model = /^model:\s*["']?([^"'\r\n]+)/m.exec(content)?.[1]?.trim();
      return {
        role: role.name,
        model: model && model !== 'default' ? model : 'inherit',
        effort: (() => {
          const value = /^effort:\s*["']?([^"'\r\n]+)/m
            .exec(content)?.[1]
            ?.trim();
          return value && value !== 'default' && value !== 'inherit'
            ? { kind: 'effort' as const, value }
            : { kind: 'inherit' as const };
        })(),
      };
    });
}

export function buildPiModelPlan(
  input: ModelConfigInput,
  context: PiOperationContext = { cwd: process.cwd() },
): OperationPlan {
  const setup = contextPlan(context);
  const specialistNames = new Set(
    getAgentPackContract()
      .roles.filter((role) => role.name !== 'orchestrator')
      .map((role) => role.name),
  );
  const invalid =
    input.harness !== 'pi' ||
    input.roles.some((role) => !specialistNames.has(role.role as never));
  const effortErrors = input.roles
    .map((role) => ({ role: role.role, resolution: resolvePiEffort(role) }))
    .filter(({ resolution }) => !resolution.ok);
  const items: OperationPlanItem[] = input.roles.map((role) => {
    const specialist = isPiSpecialistRole(role.role)
      ? piSpecialistName(role.role)
      : undefined;
    return {
      title: `Configure Pi specialist ${role.role}`,
      target: {
        kind: 'file',
        path: specialist
          ? setup.items.find(
              (item) =>
                item.kind === 'agent' &&
                basename(item.target) === `${specialist}.md`,
            )?.target
          : undefined,
        label: `Pi ${role.role} specialist`,
      },
      preview: JSON.stringify({
        model: role.model,
        effort: role.effort ?? null,
      }),
    };
  });
  const plan: OperationPlan = {
    id: 'pi-model-config-preview',
    harness: 'pi',
    action: 'model-config',
    title: 'Configure Pi specialist models',
    summary: MODEL_ROOT_LIMITATION,
    dryRun: true,
    canApply:
      setup.ready &&
      !invalid &&
      effortErrors.length === 0 &&
      items.every((item) => Boolean(item.target.path)),
    targets: items.map((item) => item.target),
    surfaces: [],
    backup: { required: true, strategy: 'managed-backup-file' },
    items,
    warnings: [
      ...(invalid
        ? [
            warning(
              'Pi model configuration accepts only the six owned specialists and never the ambient orchestrator.',
              'pi-model-role-unsupported',
              'critical',
            ),
          ]
        : []),
      ...effortErrors.map(({ role, resolution }) =>
        warning(
          `Pi specialist ${role}: ${resolution.ok ? '' : resolution.message}`,
          'pi-model-effort-unsupported',
          'critical',
        ),
      ),
    ],
    disclaimers: disclaimers(),
  };
  planSources.set(plan, { setup, context, model: input });
  return plan;
}

function replaceFrontmatterField(
  content: string,
  field: string,
  value: string | undefined,
): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return content;
  const end = lines.findIndex(
    (line, index) => index > 0 && line.trim() === '---',
  );
  if (end === -1) return content;
  const prefix = `${field}:`;
  const index = lines
    .slice(1, end)
    .findIndex((line) => line.startsWith(prefix));
  const absoluteIndex = index === -1 ? -1 : index + 1;
  const nativeValue =
    value === undefined || value === 'inherit' ? 'default' : value;
  const replacement = `${field}: ${JSON.stringify(nativeValue)}`;
  if (absoluteIndex === -1) lines.splice(1, 0, replacement);
  else lines[absoluteIndex] = replacement;
  return lines.join(newline);
}

export function applyPiPlan(plan: OperationPlan): OperationApplyResult {
  const source = planSources.get(plan);
  const fileTargets = (paths: readonly string[]): ManagedTarget[] =>
    paths.map((path) => ({ kind: 'file', path, state: 'installed' }));
  const reject = (
    message: string,
    changedTargets: ManagedTarget[] = [],
  ): OperationApplyResult => ({
    harness: 'pi',
    action: plan.action,
    applied: false,
    summary: message,
    changedTargets,
    backups: [],
    warnings: [
      ...plan.warnings,
      warning(message, 'pi-apply-rejected', 'critical'),
    ],
    disclaimers: disclaimers(),
  });
  if (plan.harness !== 'pi' || !plan.canApply || !source)
    return reject(
      'Pi operation plan is not applicable or was not built in this process.',
    );
  if (plan.action === 'model-config' && source.model) {
    const changedTargets: ManagedTarget[] = [];
    for (const role of source.model.roles) {
      const target = plan.items.find((item) => item.title.endsWith(role.role))
        ?.target.path;
      if (!target || !existsSync(target))
        return reject(
          `Owned Pi specialist definition is missing: ${role.role}.`,
        );
      let content = readFileSync(target, 'utf8');
      content = replaceFrontmatterField(content, 'model', role.model);
      content = replaceFrontmatterField(
        content,
        'effort',
        role.effort?.kind === 'effort' ? role.effort.value : undefined,
      );
      writePiManagedText(target, content);
      changedTargets.push({
        kind: 'file',
        path: target,
        label: `Pi ${role.role} specialist`,
        state: 'installed',
      });
    }
    return {
      harness: 'pi',
      action: plan.action,
      applied: true,
      summary:
        'Applied Pi specialist model configuration; ambient root model remains Pi-owned.',
      changedTargets,
      backups: [],
      warnings: [],
      disclaimers: disclaimers(),
    };
  }
  if (plan.action === 'sync') {
    const fresh = (source.context.buildPiSetupPlan ?? buildPiSetupPlan)({
      ...source.setup.options,
      dryRun: false,
    });
    if (!fresh.ready) return reject(fresh.blockers.join('\n'));
    const liveStatus = statusFromPlan(
      contextPlan(source.context),
      source.context,
    );
    const packageRoot = configuredPackageRootFromStatus(liveStatus);
    if (!packageRoot)
      return reject(
        'Receipt-validated configured Pi package root is unavailable.',
      );
    const packageSkills = (
      source.context.inspectPiPackageSkills ?? inspectPiPackageSkills
    )({ packageRoot });
    if (!packageSkills.success)
      return reject(
        packageSkills.error ?? 'Pi package-declared skills are unavailable.',
      );
    const changed: string[] = [];
    try {
      for (const item of fresh.items.filter(
        (item) => item.kind === 'mcp' && item.content !== undefined,
      ))
        if (writePiManagedText(item.target, item.content ?? ''))
          changed.push(item.target);
    } catch (error) {
      return reject(
        error instanceof Error ? error.message : String(error),
        fileTargets(changed),
      );
    }
    const resources = syncPiSpecialists({
      packageRoot,
      piRoot: fresh.paths.piRoot,
      projectRoots: fresh.paths.projectAgentRoots,
    });
    changed.push(...resources.changed);
    if (!resources.success)
      return reject(
        resources.error ?? 'Pi specialist sync failed.',
        fileTargets(changed),
      );
    const migration = migrateLegacyPiResources({
      packageRoot,
      piRoot: fresh.paths.piRoot,
    });
    changed.push(...migration.changed);
    if (!migration.success)
      return reject(
        migration.error ?? 'Pi legacy migration failed.',
        fileTargets(changed),
      );
    return {
      harness: 'pi',
      action: plan.action,
      applied: true,
      summary:
        'Applied attributable Pi managed-surface sync without changing packages, external skills, provider state, or ledger.',
      changedTargets: fileTargets(changed),
      diagnosticTargets: packageSkills.skills.map((skill) => ({
        kind: 'skill' as const,
        path: join(skill.destinationPath, 'SKILL.md'),
        label: `Pi package-declared skill: ${skill.name}`,
        state: 'installed' as const,
      })),
      backups: [],
      warnings: [],
      disclaimers: disclaimers(),
    };
  }
  if (plan.action === 'install' || plan.action === 'update') {
    const fresh = (source.context.buildPiSetupPlan ?? buildPiSetupPlan)({
      ...source.setup.options,
      dryRun: false,
      commandExecutor: source.context.piCommandExecutor,
    });
    const applied = (source.context.applyPiSetup ?? applyPiSetup)(fresh);
    const setupTargets = fileTargets(applied.changed);
    if (!applied.success)
      return reject(
        applied.error ?? 'Pi package or managed-surface setup failed.',
        setupTargets,
      );
    if (!applied.configuredPackageRoot)
      return reject(
        'Verified configured Pi package root is unavailable.',
        setupTargets,
      );
    const packageSkills = (
      source.context.inspectPiPackageSkills ?? inspectPiPackageSkills
    )({ packageRoot: applied.configuredPackageRoot });
    if (!packageSkills.success)
      return reject(
        packageSkills.error ?? 'Pi package-declared skills are unavailable.',
        setupTargets,
      );
    const installSkill =
      source.context.installRequiredSkill ?? installRequiredSkill;
    const skillTargets: ManagedTarget[] = [];
    for (const skill of REQUIRED_SKILLS) {
      const installed = installSkill(skill, 'pi', {
        homeDir: source.context.homeDir,
      });
      if (installed.status === 'failed')
        return reject(`Failed to install required Pi skill: ${skill.name}.`, [
          ...setupTargets,
          ...skillTargets,
        ]);
      skillTargets.push({
        kind: 'skill',
        path: installed.skillPath,
        label: `Pi required skill: ${skill.name}`,
        state: 'installed',
      });
    }
    if (!source.version)
      return reject('Executing thoth-agents package version is unavailable.');
    const finalize =
      source.context.finalizeHarnessInstall ?? finalizeHarnessInstall;
    const completion = finalize({
      harness: 'pi',
      version: source.version,
      dryRun: false,
      cwd: source.context.cwd,
      runThothMemSetup: source.context.runThothMemSetup,
      ledgerOptions: source.context.installLedgerOptions ?? {
        env: source.context.env,
        homeDir: source.context.homeDir,
      },
    });
    if (!completion.success)
      return reject(
        completion.error ?? 'Pi provider setup or ledger commit failed.',
        [...setupTargets, ...skillTargets],
      );
    return {
      harness: 'pi',
      action: plan.action,
      applied: true,
      summary: `Applied complete ordered Pi ${plan.action} including provider evidence and final ledger commit.`,
      changedTargets: [
        ...setupTargets,
        ...skillTargets,
        {
          kind: 'file',
          path: completion.ledger.path,
          label: 'CLI-managed install version',
          state: 'installed',
        },
      ],
      diagnosticTargets: packageSkills.skills.map((skill) => ({
        kind: 'skill' as const,
        path: join(skill.destinationPath, 'SKILL.md'),
        label: `Pi package-declared skill: ${skill.name}`,
        state: 'installed' as const,
      })),
      backups: [],
      warnings: [],
      disclaimers: disclaimers(),
    };
  }
  return reject(`Unsupported Pi apply action: ${plan.action}.`);
}
