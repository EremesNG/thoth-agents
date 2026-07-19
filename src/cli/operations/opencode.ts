import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_AGENT_NAMES } from '../../config';
import type { ProviderEvidenceInput } from '../../harness/types';
import {
  parseConfig,
  updateOpenCodeMainConfig,
  writeConfig,
  writeLiteConfig,
} from '../config-io';
import {
  readManagedModelState,
  stableJson,
  writeTextWithBackup,
} from '../managed-state-io';
import { resolveOpenCodeEffort } from '../opencode-effort';
import {
  ensureConfigDir,
  getExistingConfigPath,
  getExistingLiteConfigPath,
  getOpenCodeManagedModelStatePath,
} from '../paths';
import { generateLiteConfig } from '../providers';
import {
  getRequiredSkillInstallCommand,
  getRequiredSkillPath,
  installRequiredSkill,
  REQUIRED_SKILLS,
} from '../skills';
import type { OpenCodeConfig } from '../types';
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
import { classifyProviderCapabilityEvidence } from './types';

const PACKAGE_NAME = 'thoth-agents';
const EXPECTED_PLUGIN = `${PACKAGE_NAME}@latest`;
const OPENAI_PRESET = 'openai';
const ROLE_NAMES = [...ALL_AGENT_NAMES];

interface NormalizedOpenCodeRoleOverride {
  readonly role: string;
  readonly model: string;
  readonly variant: string | null;
}

type IssuedOpenCodePayload =
  | { readonly kind: 'fixed'; readonly action: 'install' | 'update' | 'sync' }
  | {
      readonly kind: 'model';
      readonly roles: readonly NormalizedOpenCodeRoleOverride[];
    };

interface IssuedOpenCodePlan {
  readonly planDigest: string;
  readonly liveStatusDigest: string;
  readonly harness: 'opencode';
  readonly action: 'install' | 'update' | 'sync' | 'model-config';
  readonly context: OperationContext;
  readonly payload: IssuedOpenCodePayload;
}

const issuedOpenCodePlans = new WeakMap<OperationPlan, IssuedOpenCodePlan>();

interface CanonicalDigestResult {
  ok: boolean;
  digest?: string;
}

class NonCanonicalDataError extends Error {}

function rejectSerializationHook(
  value: object,
  prototype: object | null,
): void {
  if (Object.getOwnPropertyDescriptor(value, 'toJSON')) {
    throw new NonCanonicalDataError('Own toJSON hooks are not canonical data.');
  }
  let current = prototype;
  while (current) {
    if (Object.getOwnPropertyDescriptor(current, 'toJSON')) {
      throw new NonCanonicalDataError(
        'Inherited toJSON hooks are not canonical data.',
      );
    }
    current = Object.getPrototypeOf(current);
  }
}

function canonicalData(value: unknown, active: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new NonCanonicalDataError('Non-finite numbers are not canonical.');
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new NonCanonicalDataError('Only JSON-like data is canonical.');
  }
  if (active.has(value)) {
    throw new NonCanonicalDataError('Cycles are not canonical.');
  }

  const prototype = Object.getPrototypeOf(value);
  const array = Array.isArray(value);
  if (
    (array && prototype !== Array.prototype) ||
    (!array && prototype !== Object.prototype && prototype !== null)
  ) {
    throw new NonCanonicalDataError('Non-plain prototypes are not canonical.');
  }
  rejectSerializationHook(value, prototype);

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === 'symbol')) {
    throw new NonCanonicalDataError('Symbol keys are not canonical.');
  }
  const keys = ownKeys as string[];
  active.add(value);
  try {
    if (array) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (!lengthDescriptor || !('value' in lengthDescriptor)) {
        throw new NonCanonicalDataError('Array length must be data.');
      }
      const length = lengthDescriptor.value;
      if (!Number.isSafeInteger(length) || length < 0) {
        throw new NonCanonicalDataError('Array length is invalid.');
      }
      const indexKeys = keys.filter((key) => key !== 'length');
      if (
        indexKeys.length !== length ||
        indexKeys.some(
          (key) =>
            !/^(0|[1-9]\d*)$/.test(key) ||
            Number(key) >= length ||
            String(Number(key)) !== key,
        )
      ) {
        throw new NonCanonicalDataError(
          'Sparse arrays and extra array properties are not canonical.',
        );
      }
      const parts: string[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (!descriptor || !('value' in descriptor)) {
          throw new NonCanonicalDataError('Array accessors are not canonical.');
        }
        parts.push(canonicalData(descriptor.value, active));
      }
      return `[${parts.join(',')}]`;
    }

    const parts: string[] = [];
    for (const key of keys.sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) {
        throw new NonCanonicalDataError('Accessors are not canonical.');
      }
      parts.push(
        `${JSON.stringify(key)}:${canonicalData(descriptor.value, active)}`,
      );
    }
    return `{${parts.join(',')}}`;
  } finally {
    active.delete(value);
  }
}

function canonicalDigest(value: unknown): CanonicalDigestResult {
  try {
    const serialized = canonicalData(value, new Set());
    return {
      ok: true,
      digest: createHash('sha256').update(serialized).digest('hex'),
    };
  } catch {
    return { ok: false };
  }
}

function liveStatusDigest(status: HarnessStatusReport): CanonicalDigestResult {
  return canonicalDigest({
    state: status.state,
    diagnostics: status.diagnostics,
    targets: status.targets,
  });
}

function immutableContext(context: OperationContext): OperationContext {
  return Object.freeze({
    cwd: context.cwd,
    ...(context.env ? { env: Object.freeze({ ...context.env }) } : {}),
  });
}

function issueOpenCodePlan(
  plan: OperationPlan,
  status: HarnessStatusReport,
  context: OperationContext,
  payload: IssuedOpenCodePayload,
): OperationPlan {
  const planDigest = canonicalDigest(plan);
  const statusDigest = liveStatusDigest(status);
  if (
    !planDigest.ok ||
    !planDigest.digest ||
    !statusDigest.ok ||
    !statusDigest.digest
  ) {
    return plan;
  }
  const immutablePayload: IssuedOpenCodePayload =
    payload.kind === 'fixed'
      ? Object.freeze({ kind: 'fixed', action: payload.action })
      : Object.freeze({
          kind: 'model',
          roles: Object.freeze(
            payload.roles.map((role) => Object.freeze({ ...role })),
          ),
        });
  issuedOpenCodePlans.set(plan, {
    planDigest: planDigest.digest,
    liveStatusDigest: statusDigest.digest,
    harness: 'opencode',
    action: payload.kind === 'model' ? 'model-config' : payload.action,
    context: immutableContext(context),
    payload: immutablePayload,
  });
  return plan;
}

const openCodeActions: HarnessAction[] = [
  {
    id: 'opencode-status',
    kind: 'status',
    label: 'Status',
    description: 'Inspect managed OpenCode config state',
    dryRun: false,
    requiresConfirmation: false,
    supported: true,
  },
  {
    id: 'opencode-list',
    kind: 'list',
    label: 'List',
    description: 'List managed OpenCode surfaces and actions',
    dryRun: false,
    requiresConfirmation: false,
    supported: true,
  },
  {
    id: 'opencode-install',
    kind: 'install',
    label: 'Install',
    description: 'Preview OpenCode install with required external skills',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
  {
    id: 'opencode-update',
    kind: 'update',
    label: 'Update',
    description: 'Preview OpenCode plugin entry updates',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
  {
    id: 'opencode-sync',
    kind: 'sync',
    label: 'Sync',
    description: 'Preview OpenCode managed configuration sync',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
  {
    id: 'opencode-model-config',
    kind: 'model-config',
    label: 'Model',
    description: 'Preview OpenCode role model override changes',
    dryRun: true,
    requiresConfirmation: true,
    supported: true,
  },
];

export const opencodeOperationAdapter = {
  id: 'opencode',
  displayName: 'OpenCode',
  available: true,
  description: 'OpenCode plugin and configuration surfaces.',
  actions: openCodeActions,
} as const satisfies HarnessOperationAdapter;

function targetForMainConfig(state?: ManagedState): ManagedTarget {
  return {
    kind: 'config',
    path: getExistingConfigPath(),
    label: 'OpenCode config',
    ...(state ? { state } : {}),
    expected: `plugin includes ${EXPECTED_PLUGIN}`,
  };
}

function targetForLiteConfig(state?: ManagedState): ManagedTarget {
  return {
    kind: 'config',
    path: getExistingLiteConfigPath(),
    label: 'thoth-agents config',
    ...(state ? { state } : {}),
    expected: `seven-role ${OPENAI_PRESET} roster`,
  };
}

function titleCaseSkillName(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => {
      const normalized = part.toLowerCase();
      if (normalized === 'cli') return 'CLI';
      if (normalized === 'mcp') return 'MCP';
      if (normalized === 'sdd') return 'SDD';
      if (normalized === 'opencode') return 'OpenCode';
      return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`;
    })
    .join('-');
}

function homeDirFromContext(context: OperationContext): string | undefined {
  return (
    context.env?.HOME ??
    context.env?.USERPROFILE ??
    (context.cwd !== process.cwd() ? join(context.cwd, 'home') : undefined)
  );
}

function openCodeSkillTargets(context: OperationContext): {
  targets: ManagedTarget[];
  diagnostics: OperationWarning[];
} {
  const homeDir = homeDirFromContext(context);
  const requiredTargets: ManagedTarget[] = REQUIRED_SKILLS.map((skill) => {
    const path = getRequiredSkillPath(skill, 'opencode', homeDir);
    const installed = existsSync(path);
    return {
      kind: 'skill',
      path,
      label: titleCaseSkillName(skill.skillName),
      state: installed ? 'installed' : 'missing',
      expected: 'required global OpenCode skill',
      observed: installed
        ? 'required global skill installed'
        : 'required global skill missing',
    };
  });
  const diagnostics: OperationWarning[] = [];
  if (requiredTargets.some((target) => target.state === 'missing')) {
    diagnostics.push({
      severity: 'important',
      message:
        'Required OpenCode global skills are missing; run install or sync to restore them.',
      code: 'opencode-required-skills-missing',
    });
  }
  return {
    targets: requiredTargets,
    diagnostics,
  };
}

function configPluginMarker(config: OpenCodeConfig | null): string {
  const plugins = Array.isArray(config?.plugin) ? config.plugin : [];
  return plugins.length > 0
    ? `plugin: ${JSON.stringify(plugins)}`
    : 'plugin: []';
}

function hasExpectedPlugin(config: OpenCodeConfig | null): boolean {
  return (
    Array.isArray(config?.plugin) && config.plugin.includes(EXPECTED_PLUGIN)
  );
}

function hasManagedPluginDrift(config: OpenCodeConfig | null): boolean {
  return (
    Array.isArray(config?.plugin) &&
    config.plugin.some(
      (plugin) =>
        plugin === PACKAGE_NAME || plugin.startsWith(`${PACKAGE_NAME}@`),
    ) &&
    !hasExpectedPlugin(config)
  );
}

function liteConfigMarker(config: OpenCodeConfig | null): string {
  const preset = typeof config?.preset === 'string' ? config.preset : undefined;
  const presets =
    config?.presets && typeof config.presets === 'object'
      ? (config.presets as Record<string, unknown>)
      : {};
  const openaiPreset =
    presets[OPENAI_PRESET] && typeof presets[OPENAI_PRESET] === 'object'
      ? (presets[OPENAI_PRESET] as Record<string, unknown>)
      : {};
  const legacyAgents =
    config?.agents && typeof config.agents === 'object'
      ? (config.agents as Record<string, unknown>)
      : {};
  const roles = ROLE_NAMES.filter(
    (role) => role in openaiPreset || role in legacyAgents,
  );
  return `preset: ${preset ?? 'none'}; observed roles: ${roles.join(', ')}`;
}

function hasSevenAgentPreset(config: OpenCodeConfig | null): boolean {
  if (!config || config.preset !== OPENAI_PRESET) return false;
  if (!config.presets || typeof config.presets !== 'object') return false;
  const presets = config.presets as Record<string, unknown>;
  const openaiPreset = presets[OPENAI_PRESET];
  if (!openaiPreset || typeof openaiPreset !== 'object') return false;
  const roles = openaiPreset as Record<string, unknown>;
  return ROLE_NAMES.every((role) => {
    const value = roles[role];
    return (
      value !== null &&
      typeof value === 'object' &&
      typeof (value as { model?: unknown }).model === 'string'
    );
  });
}

function hasSelectedNamedPreset(config: OpenCodeConfig | null): boolean {
  if (
    !config ||
    typeof config.preset !== 'string' ||
    config.preset.length === 0 ||
    config.preset === OPENAI_PRESET ||
    config.preset === 'agents'
  ) {
    return false;
  }
  if (
    !config.presets ||
    typeof config.presets !== 'object' ||
    Array.isArray(config.presets)
  ) {
    return false;
  }
  const presets = config.presets as Record<string, unknown>;
  if (!Object.hasOwn(presets, config.preset)) return false;
  const selectedPreset = presets[config.preset];
  return (
    selectedPreset !== null &&
    typeof selectedPreset === 'object' &&
    !Array.isArray(selectedPreset)
  );
}

function hasLegacySevenAgentRoster(config: OpenCodeConfig | null): boolean {
  if (!config || config.preset !== 'agents') return false;
  if (!config.agents || typeof config.agents !== 'object') return false;
  const agents = config.agents as Record<string, unknown>;
  return ROLE_NAMES.every((role) => {
    const value = agents[role];
    return (
      value !== null &&
      typeof value === 'object' &&
      typeof (value as { model?: unknown }).model === 'string'
    );
  });
}

const ACTIVE_PRESET_SELECTED_CODE = 'opencode-active-preset-selected';

function activePresetSelectedDiagnostic(): OperationWarning {
  return {
    severity: 'important',
    message:
      'A valid named preset is active; model configuration preserves it while sync or install may repair the managed roster.',
    code: ACTIVE_PRESET_SELECTED_CODE,
  };
}

const REPAIRABLE_DIAGNOSTIC_CODES = new Set([
  'opencode-plugin-drift',
  'opencode-main-config-missing',
  'opencode-lite-config-missing',
  'opencode-roster-drift',
  ACTIVE_PRESET_SELECTED_CODE,
  'opencode-required-skills-missing',
]);

const MODEL_PRECONFIG_SKILL_CODES = new Set([
  'opencode-required-skills-missing',
]);

interface BlockingDetails {
  diagnostics: OperationWarning[];
  targets: ManagedTarget[];
}

function uniqueTargets(targets: ManagedTarget[]): ManagedTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = JSON.stringify([
      target.kind,
      target.path,
      target.label,
      target.state,
      target.expected,
      target.observed,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function targetsForBlockingDiagnostic(
  diagnostic: OperationWarning,
  status: HarnessStatusReport,
): ManagedTarget[] {
  const main = status.targets.find(
    (target) => target.label === 'OpenCode config',
  );
  const lite = status.targets.find(
    (target) => target.label === 'thoth-agents config',
  );
  const code = diagnostic.code;
  if (
    code === 'opencode-plugin-drift' ||
    code === 'opencode-main-config-missing' ||
    code === 'opencode-config-parse-error' ||
    code === 'opencode-unmanaged-config'
  ) {
    return main ? [main] : [];
  }
  if (
    code === 'opencode-roster-drift' ||
    code === ACTIVE_PRESET_SELECTED_CODE ||
    code === 'opencode-lite-config-missing' ||
    code === 'thoth-config-parse-error' ||
    code === 'opencode-roster-unrecognized'
  ) {
    return lite ? [lite] : [];
  }
  if (code === 'opencode-required-skills-missing') {
    return status.targets.filter(
      (target) =>
        target.expected === 'required global OpenCode skill' &&
        target.state !== 'installed',
    );
  }
  return [
    {
      kind: 'unknown',
      label: 'Unknown OpenCode blocker',
      state: 'unknown',
      observed: code ? `${code}: ${diagnostic.message}` : diagnostic.message,
    },
  ];
}

function blockingDetails(
  action: OperationPlan['action'],
  status: HarnessStatusReport,
  includeRepairable = false,
): BlockingDetails {
  const main = status.targets.find(
    (target) => target.label === 'OpenCode config',
  );
  const lite = status.targets.find(
    (target) => target.label === 'thoth-agents config',
  );
  const allowModelPreconfiguration =
    action === 'model-config' &&
    main?.state === 'missing' &&
    lite?.state === 'missing';
  const diagnostics = status.diagnostics.filter((diagnostic) => {
    if (diagnostic.severity === 'critical') return true;
    if (diagnostic.severity === 'minor') return false;
    if (
      !includeRepairable &&
      action === 'model-config' &&
      diagnostic.code === ACTIVE_PRESET_SELECTED_CODE
    ) {
      return false;
    }
    if (
      !includeRepairable &&
      allowModelPreconfiguration &&
      diagnostic.code !== undefined &&
      MODEL_PRECONFIG_SKILL_CODES.has(diagnostic.code)
    ) {
      return false;
    }
    return (
      includeRepairable ||
      !(
        (action === 'sync' || action === 'install') &&
        diagnostic.code !== undefined &&
        REPAIRABLE_DIAGNOSTIC_CODES.has(diagnostic.code)
      )
    );
  });
  return {
    diagnostics,
    targets: uniqueTargets(
      diagnostics.flatMap((diagnostic) =>
        targetsForBlockingDiagnostic(diagnostic, status),
      ),
    ),
  };
}

function canApplyToManagedHealth(
  action: OperationPlan['action'],
  status: HarnessStatusReport,
): boolean {
  return blockingDetails(action, status).diagnostics.length === 0;
}

function getOpenCodeManagedStatus(
  context: OperationContext = { cwd: process.cwd() },
): HarnessStatusReport {
  const mainPath = getExistingConfigPath();
  const litePath = getExistingLiteConfigPath();
  const main = parseConfig(mainPath);
  const lite = parseConfig(litePath);
  const diagnostics: OperationWarning[] = [];
  const skillStatus = openCodeSkillTargets(context);

  if (main.error) {
    diagnostics.push({
      severity: 'critical',
      message: `Failed to parse OpenCode config: ${main.error}`,
      code: 'opencode-config-parse-error',
    });
  }
  if (lite.error) {
    diagnostics.push({
      severity: 'critical',
      message: `Failed to parse thoth-agents config: ${lite.error}`,
      code: 'thoth-config-parse-error',
    });
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'critical')) {
    return {
      harness: 'opencode',
      displayName: 'OpenCode',
      state: 'unknown',
      summary: 'OpenCode managed state could not be classified safely.',
      targets: [
        {
          ...targetForMainConfig('unknown'),
          observed: main.error ?? 'unparsed',
        },
        {
          ...targetForLiteConfig('unknown'),
          observed: lite.error ?? 'unparsed',
        },
        ...skillStatus.targets,
      ],
      diagnostics: [...diagnostics, ...skillStatus.diagnostics],
      actions: openCodeActions,
    };
  }

  const mainExists = existsSync(mainPath);
  const liteExists = existsSync(litePath);
  const mainTarget = {
    ...targetForMainConfig(),
    observed: configPluginMarker(main.config),
  };
  const liteTarget = {
    ...targetForLiteConfig(),
    observed: liteConfigMarker(lite.config),
  };

  if (!mainExists || !hasExpectedPlugin(main.config)) {
    if (hasManagedPluginDrift(main.config)) {
      const currentRoster = hasSevenAgentPreset(lite.config);
      const legacyRoster = hasLegacySevenAgentRoster(lite.config);
      const selectedNamedPreset = hasSelectedNamedPreset(lite.config);
      const recognizedRoster =
        currentRoster || legacyRoster || selectedNamedPreset;
      let liteState: ManagedState = 'unknown';
      if (!liteExists) {
        liteState = 'missing';
      } else if (currentRoster) {
        liteState = 'installed';
      } else if (legacyRoster || selectedNamedPreset) {
        liteState = 'drift';
      }
      return {
        harness: 'opencode',
        displayName: 'OpenCode',
        state: 'drift',
        summary:
          'OpenCode config has a managed thoth-agents plugin entry that is not latest.',
        targets: [
          { ...mainTarget, state: 'drift' },
          {
            ...liteTarget,
            state: liteState,
          },
          ...skillStatus.targets,
        ],
        diagnostics: [
          {
            severity: 'important',
            message:
              'Managed plugin drift requires an explicit repair before applying sync plans.',
            code: 'opencode-plugin-drift',
          },
          ...(legacyRoster
            ? [
                {
                  severity: 'important' as const,
                  message:
                    'Roster drift requires repair before applying generated plans.',
                  code: 'opencode-roster-drift',
                },
              ]
            : []),
          ...(selectedNamedPreset && !currentRoster
            ? [activePresetSelectedDiagnostic()]
            : []),
          ...(!liteExists
            ? [
                {
                  severity: 'important' as const,
                  message:
                    'The managed thoth-agents config is missing and must be restored by install or sync.',
                  code: 'opencode-lite-config-missing',
                },
              ]
            : []),
          ...(!liteExists
            ? [
                {
                  severity: 'important' as const,
                  message:
                    'The managed thoth-agents config is missing and must be restored by install or sync.',
                  code: 'opencode-lite-config-missing',
                },
              ]
            : []),
          ...(liteExists && !recognizedRoster
            ? [
                {
                  severity: 'critical' as const,
                  message:
                    'Existing thoth-agents config has an unrecognized roster shape.',
                  code: 'opencode-roster-unrecognized',
                },
              ]
            : []),
          ...skillStatus.diagnostics,
        ],
        actions: openCodeActions,
      };
    }

    if (!mainExists && liteExists) {
      const currentRoster = hasSevenAgentPreset(lite.config);
      const legacyRoster = hasLegacySevenAgentRoster(lite.config);
      const selectedNamedPreset = hasSelectedNamedPreset(lite.config);
      if (!currentRoster && !legacyRoster && !selectedNamedPreset) {
        return {
          harness: 'opencode',
          displayName: 'OpenCode',
          state: 'unknown',
          summary:
            'Existing thoth-agents config has an unrecognized roster shape.',
          targets: [
            { ...mainTarget, state: 'missing' },
            { ...liteTarget, state: 'unknown' },
            ...skillStatus.targets,
          ],
          diagnostics: [
            {
              severity: 'critical',
              message:
                'Existing thoth-agents config is not a recognized current or legacy managed roster.',
              code: 'opencode-roster-unrecognized',
            },
            ...skillStatus.diagnostics,
          ],
          actions: openCodeActions,
        };
      }
      if (selectedNamedPreset && !currentRoster) {
        return {
          harness: 'opencode',
          displayName: 'OpenCode',
          state: 'drift',
          summary:
            'OpenCode plugin is missing and a valid named preset is active.',
          targets: [
            { ...mainTarget, state: 'missing' },
            { ...liteTarget, state: 'drift' },
            ...skillStatus.targets,
          ],
          diagnostics: [
            {
              severity: 'important',
              message:
                'The managed OpenCode main config is missing and must be restored by install or sync.',
              code: 'opencode-main-config-missing',
            },
            activePresetSelectedDiagnostic(),
            ...skillStatus.diagnostics,
          ],
          actions: openCodeActions,
        };
      }
      if (legacyRoster) {
        return {
          harness: 'opencode',
          displayName: 'OpenCode',
          state: 'drift',
          summary:
            'OpenCode plugin is missing and the managed roster uses the recognized legacy layout.',
          targets: [
            { ...mainTarget, state: 'missing' },
            { ...liteTarget, state: 'drift' },
            ...skillStatus.targets,
          ],
          diagnostics: [
            {
              severity: 'important',
              message:
                'The managed OpenCode main config is missing and must be restored by install or sync.',
              code: 'opencode-main-config-missing',
            },
            {
              severity: 'important',
              message:
                'Roster drift requires repair before applying generated plans.',
              code: 'opencode-roster-drift',
            },
            ...skillStatus.diagnostics,
          ],
          actions: openCodeActions,
        };
      }
      return {
        harness: 'opencode',
        displayName: 'OpenCode',
        state: 'missing',
        summary:
          'The managed roster is present, but the OpenCode main config is missing.',
        targets: [
          { ...mainTarget, state: 'missing' },
          { ...liteTarget, state: 'installed' },
          ...skillStatus.targets,
        ],
        diagnostics: [
          {
            severity: 'important',
            message:
              'The managed OpenCode main config is missing and must be restored by install or sync.',
            code: 'opencode-main-config-missing',
          },
          ...skillStatus.diagnostics,
        ],
        actions: openCodeActions,
      };
    }

    return {
      harness: 'opencode',
      displayName: 'OpenCode',
      state: 'missing',
      summary:
        'OpenCode does not include the managed thoth-agents plugin entry.',
      targets: [
        { ...mainTarget, state: 'missing' },
        { ...liteTarget, state: liteExists ? 'installed' : 'missing' },
        ...skillStatus.targets,
      ],
      diagnostics: [
        ...diagnostics,
        ...(mainExists
          ? [
              {
                severity: 'critical' as const,
                message:
                  'Existing OpenCode config is not positively attributed to thoth-agents management.',
                code: 'opencode-unmanaged-config',
              },
            ]
          : []),
        ...skillStatus.diagnostics,
      ],
      actions: openCodeActions,
    };
  }

  if (!liteExists) {
    return {
      harness: 'opencode',
      displayName: 'OpenCode',
      state: 'missing',
      summary:
        'OpenCode plugin is present, but thoth-agents config is missing.',
      targets: [
        { ...mainTarget, state: 'installed' },
        { ...liteTarget, state: 'missing' },
        ...skillStatus.targets,
      ],
      diagnostics: [
        ...diagnostics,
        {
          severity: 'important',
          message:
            'The managed thoth-agents config is missing and must be restored by install or sync.',
          code: 'opencode-lite-config-missing',
        },
        ...skillStatus.diagnostics,
      ],
      actions: openCodeActions,
    };
  }

  if (!hasSevenAgentPreset(lite.config)) {
    const selectedNamedPreset = hasSelectedNamedPreset(lite.config);
    return {
      harness: 'opencode',
      displayName: 'OpenCode',
      state: 'drift',
      summary: selectedNamedPreset
        ? 'A valid named OpenCode preset is active outside the managed seven-role roster.'
        : 'thoth-agents config does not match the expected seven-role roster.',
      targets: [
        { ...mainTarget, state: 'installed' },
        { ...liteTarget, state: 'drift' },
        ...skillStatus.targets,
      ],
      diagnostics: [
        selectedNamedPreset
          ? activePresetSelectedDiagnostic()
          : {
              severity: 'important',
              message:
                'Roster drift requires repair before applying generated plans.',
              code: 'opencode-roster-drift',
            },
        ...skillStatus.diagnostics,
      ],
      actions: openCodeActions,
    };
  }

  const requiredSkillsMissing = skillStatus.targets.some(
    (target) => target.state === 'missing',
  );
  return {
    harness: 'opencode',
    displayName: 'OpenCode',
    state: requiredSkillsMissing ? 'drift' : 'installed',
    summary: requiredSkillsMissing
      ? 'OpenCode configuration is installed, but required external skills are missing.'
      : 'OpenCode managed thoth-agents configuration is installed.',
    targets: [
      { ...mainTarget, state: 'installed' },
      { ...liteTarget, state: 'installed' },
      ...skillStatus.targets,
    ],
    diagnostics: [...diagnostics, ...skillStatus.diagnostics],
    actions: openCodeActions,
  };
}

export function getOpenCodeStatus(
  context: OperationContext = { cwd: process.cwd() },
  evidence: ProviderEvidenceInput = {},
): HarnessStatusReport {
  return {
    ...getOpenCodeManagedStatus(context),
    providerCapability: classifyProviderCapabilityEvidence(evidence),
  };
}

function defaultBackup(path: string) {
  return {
    required: true,
    strategy: 'managed-backup-file' as const,
    destinations: [{ path: `${path}.bak`, label: 'managed backup' }],
  };
}

function backupFromItems(
  items: readonly OperationPlanItem[],
): OperationPlan['backup'] {
  const backups = items.flatMap((item) => (item.backup ? [item.backup] : []));
  const primary = backups.find((backup) => backup.required) ?? backups[0];
  const destinations: NonNullable<OperationPlan['backup']['destinations']> = [];
  const seenPaths = new Set<string>();
  for (const backup of backups) {
    for (const destination of backup.destinations ?? []) {
      if (seenPaths.has(destination.path)) continue;
      seenPaths.add(destination.path);
      destinations.push(destination);
    }
  }

  return {
    required: backups.some((backup) => backup.required),
    strategy: primary?.strategy ?? 'none',
    ...(destinations.length > 0 ? { destinations } : {}),
    ...(primary?.description ? { description: primary.description } : {}),
  };
}

function defaultDisclaimers() {
  return [
    {
      message:
        'Preview generation does not inspect OpenCode plugin cache internals or write files.',
      code: 'opencode-cache-not-inspected',
    },
  ];
}

function planFromItems(
  id: string,
  action: OperationPlan['action'],
  title: string,
  summary: string,
  items: OperationPlanItem[],
  context: OperationContext,
): { plan: OperationPlan; status: HarnessStatusReport } {
  const status = getOpenCodeStatus(context);
  const blockers = blockingDetails(action, status);
  const safe = blockers.diagnostics.length === 0;
  const warnings = safe
    ? status.diagnostics
    : [
        ...status.diagnostics,
        {
          severity: 'important' as const,
          message: `OpenCode state is ${status.state}; apply is disabled until the state is repaired or safely classified.`,
          code: 'opencode-unsafe-state',
        },
      ];

  return {
    status,
    plan: {
      id,
      harness: 'opencode',
      action,
      title,
      summary,
      dryRun: true,
      canApply: safe,
      targets: status.targets,
      blockerTargets: blockers.targets,
      surfaces: [
        {
          id: 'opencode-config',
          label: 'OpenCode user config',
          path: getExistingConfigPath(),
          state: status.targets[0]?.state,
        },
        {
          id: 'thoth-agents-config',
          label: 'thoth-agents plugin config',
          path: getExistingLiteConfigPath(),
          state: status.targets[1]?.state,
        },
      ],
      backup: backupFromItems(items),
      items,
      warnings,
      disclaimers: defaultDisclaimers(),
    },
  };
}

export function buildOpenCodeUpdatePlan(
  _context: OperationContext = { cwd: process.cwd() },
): OperationPlan {
  const path = getExistingConfigPath();
  const { plan, status } = planFromItems(
    'opencode-update-preview',
    'update',
    'Update OpenCode managed plugin entry',
    `Preview ensuring plugin: ["${EXPECTED_PLUGIN}"].`,
    [
      {
        title: 'Ensure OpenCode plugin points at thoth-agents@latest',
        target: targetForMainConfig(),
        state: getOpenCodeStatus(_context).state,
        preview: `plugin: ["${EXPECTED_PLUGIN}"]`,
        backup: defaultBackup(path),
      },
    ],
    _context,
  );
  return issueOpenCodePlan(plan, status, _context, {
    kind: 'fixed',
    action: 'update',
  });
}

export function buildOpenCodeSyncPlan(
  _context: OperationContext = { cwd: process.cwd() },
): OperationPlan {
  const generatedConfig = generateLiteConfig({
    agent: 'opencode',
    hasTmux: false,
    dryRun: true,
    reset: false,
  });
  const litePath = getExistingLiteConfigPath();

  const { plan, status } = planFromItems(
    'opencode-sync-preview',
    'sync',
    'Sync OpenCode managed configuration',
    'Preview OpenCode plugin entry, default-agent disablement, and thoth-agents config sync.',
    [
      {
        title: 'Ensure OpenCode plugin points at thoth-agents@latest',
        target: targetForMainConfig(),
        state: getOpenCodeStatus(_context).state,
        preview: `plugin: ["${EXPECTED_PLUGIN}"]`,
        backup: defaultBackup(getExistingConfigPath()),
      },
      {
        title: 'Disable OpenCode default agents',
        target: targetForMainConfig(),
        preview: 'agent.explore.disable = true; agent.general.disable = true',
        backup: defaultBackup(getExistingConfigPath()),
      },
      {
        title: 'Write thoth-agents seven-role config',
        target: targetForLiteConfig(),
        preview: JSON.stringify(generatedConfig, null, 2),
        backup: defaultBackup(litePath),
      },
      {
        title: 'Install required external skills',
        target: {
          kind: 'skill',
          label: 'Required OpenCode skills',
          expected: REQUIRED_SKILLS.map(({ name }) => name).join(', '),
        },
        preview: JSON.stringify(
          REQUIRED_SKILLS.map((skill) => ({
            name: skill.name,
            ...getRequiredSkillInstallCommand(skill, 'opencode'),
          })),
          null,
          2,
        ),
      },
    ],
    _context,
  );
  return issueOpenCodePlan(plan, status, _context, {
    kind: 'fixed',
    action: 'sync',
  });
}

function tuiInstallConfig() {
  return {
    agent: 'opencode' as const,
    hasTmux: false,
    dryRun: true,
    reset: false,
  };
}

export function buildOpenCodeInstallPlan(
  _context: OperationContext = { cwd: process.cwd() },
): OperationPlan {
  const generatedConfig = generateLiteConfig(tuiInstallConfig());
  const installPreview = {
    noTui: true,
    hasTmux: false,
    requiredSkills: REQUIRED_SKILLS.map((skill) => skill.name),
    equivalentCommand: 'install --agent=opencode --no-tui --tmux=no',
  };
  const litePath = getExistingLiteConfigPath();

  const { plan, status } = planFromItems(
    'opencode-install-preview',
    'install',
    'Preview install',
    'Preview OpenCode install with the required external skills.',
    [
      {
        title: 'Apply OpenCode TUI install options',
        target: {
          kind: 'config',
          path: getExistingConfigPath(),
          label: 'OpenCode install options',
          state: getOpenCodeStatus(_context).state,
          expected: '--no-tui --tmux=no plus required external skills',
        },
        preview: JSON.stringify(installPreview, null, 2),
      },
      {
        title: 'Ensure OpenCode plugin points at thoth-agents@latest',
        target: targetForMainConfig(),
        state: getOpenCodeStatus(_context).state,
        preview: `plugin: ["${EXPECTED_PLUGIN}"]`,
        backup: defaultBackup(getExistingConfigPath()),
      },
      {
        title: 'Disable OpenCode default agents',
        target: targetForMainConfig(),
        preview: 'agent.explore.disable = true; agent.general.disable = true',
        backup: defaultBackup(getExistingConfigPath()),
      },
      {
        title: 'Write thoth-agents seven-role config',
        target: targetForLiteConfig(),
        preview: JSON.stringify(generatedConfig, null, 2),
        backup: defaultBackup(litePath),
      },
      {
        title: 'Install required external skills',
        target: {
          kind: 'skill',
          label: 'Required OpenCode skills',
          expected: REQUIRED_SKILLS.map(({ name }) => name).join(', '),
        },
        preview: JSON.stringify(
          REQUIRED_SKILLS.map((skill) => ({
            name: skill.name,
            ...getRequiredSkillInstallCommand(skill, 'opencode'),
          })),
          null,
          2,
        ),
      },
    ],
    _context,
  );
  return issueOpenCodePlan(plan, status, _context, {
    kind: 'fixed',
    action: 'install',
  });
}

function normalizeRoleModel(input: ModelRoleInput): string {
  if (input.provider && !input.model.includes('/')) {
    return `${input.provider}/${input.model}`;
  }
  return input.model;
}

export function buildOpenCodeModelPlan(
  input: ModelConfigInput,
  _context: OperationContext = { cwd: process.cwd() },
): OperationPlan {
  const normalizedRoles = input.roles.map((role) => {
    const model = normalizeRoleModel(role);
    const effort = resolveOpenCodeEffort(role);
    return Object.freeze({
      role: role.role,
      model,
      variant: effort.ok ? (effort.variant ?? null) : null,
      effort,
    });
  });
  const items = normalizedRoles.map(({ role, model, variant, effort }) => {
    return {
      title: `Set ${role} OpenCode model override`,
      target: targetForLiteConfig(),
      preview: JSON.stringify({
        [role]: {
          model,
          variant,
        },
      }),
      backup: defaultBackup(getExistingLiteConfigPath()),
      ...(!effort.ok
        ? {
            warnings: [
              {
                severity: 'critical' as const,
                code: effort.code,
                message: effort.message,
              },
            ],
          }
        : {}),
    };
  });
  const { plan, status } = planFromItems(
    'opencode-model-config-preview',
    'model-config',
    'Configure OpenCode role model overrides',
    'Preview thoth-agents role model overrides in the plugin config agents map.',
    items,
    _context,
  );
  const effortWarnings = items.flatMap((item) => item.warnings ?? []);
  if (effortWarnings.length > 0) {
    plan.canApply = false;
    plan.warnings.push(...effortWarnings);
  }

  if (input.harness !== 'opencode') {
    const rejectedPlan = {
      ...plan,
      canApply: false,
      warnings: [
        ...plan.warnings,
        {
          severity: 'critical' as const,
          message: 'Model plan target harness must be opencode.',
          code: 'opencode-model-harness-mismatch',
        },
      ],
    };
    return rejectedPlan;
  }

  const unsupportedRoles = input.roles.filter(
    (role) => !ROLE_NAMES.includes(role.role as (typeof ROLE_NAMES)[number]),
  );
  if (input.roles.length === 0 || unsupportedRoles.length > 0) {
    const rejectedPlan = {
      ...plan,
      canApply: false,
      warnings: [
        ...plan.warnings,
        {
          severity: 'critical' as const,
          message:
            input.roles.length === 0
              ? 'Model plan must include at least one role override.'
              : `Unsupported OpenCode model role(s): ${unsupportedRoles
                  .map((role) => role.role)
                  .join(', ')}.`,
          code: 'opencode-model-roster-incomplete',
        },
      ],
    };
    return rejectedPlan;
  }

  if (effortWarnings.length > 0) {
    return plan;
  }

  const payloadRoles = Object.freeze(
    normalizedRoles.map(({ role, model, variant }) =>
      Object.freeze({ role, model, variant }),
    ),
  );
  if (!plan.canApply || invalidModelPayloadReason(payloadRoles)) {
    return plan;
  }

  return issueOpenCodePlan(plan, status, _context, {
    kind: 'model',
    roles: payloadRoles,
  });
}

function rejectPlan(
  plan: OperationPlan,
  message: string,
  severity: OperationWarning['severity'] = 'critical',
  code = 'opencode-plan-rejected',
  context: OperationContext = { cwd: process.cwd() },
): OperationApplyResult {
  const issued = issuedOpenCodePlans.get(plan);
  const actionDescriptor = Object.getOwnPropertyDescriptor(plan, 'action');
  const describedAction =
    actionDescriptor &&
    'value' in actionDescriptor &&
    typeof actionDescriptor.value === 'string'
      ? actionDescriptor.value
      : undefined;
  const action =
    issued?.action ??
    (describedAction === 'install' ||
    describedAction === 'update' ||
    describedAction === 'sync' ||
    describedAction === 'model-config'
      ? describedAction
      : 'repair');
  const liveStatus = getOpenCodeStatus(context);
  const blockers = blockingDetails(
    action,
    liveStatus,
    code === 'opencode-plan-live-state-changed',
  );
  return {
    harness: issued?.harness ?? 'opencode',
    action,
    applied: false,
    summary: message,
    changedTargets: [],
    diagnosticTargets: blockers.targets,
    backups: [],
    warnings: [...liveStatus.diagnostics, { severity, code, message }],
    disclaimers: defaultDisclaimers(),
  };
}

function validateApplyPlan(plan: OperationPlan): OperationApplyResult | null {
  const issued = issuedOpenCodePlans.get(plan);
  if (!issued) {
    return rejectPlan(
      plan,
      'OpenCode plan was not issued by this process.',
      'critical',
      'opencode-plan-unissued',
    );
  }
  const planDigest = canonicalDigest(plan);
  if (!planDigest.ok || !planDigest.digest) {
    return rejectPlan(
      plan,
      'OpenCode plan contains noncanonical data and cannot be applied.',
      'critical',
      'opencode-plan-noncanonical',
      issued.context,
    );
  }
  if (planDigest.digest !== issued.planDigest) {
    return rejectPlan(
      plan,
      'OpenCode plan changed after it was issued.',
      'critical',
      'opencode-plan-mutated',
      issued.context,
    );
  }
  const liveStatus = getOpenCodeStatus(issued.context);
  const statusDigest = liveStatusDigest(liveStatus);
  if (
    !statusDigest.ok ||
    !statusDigest.digest ||
    statusDigest.digest !== issued.liveStatusDigest
  ) {
    return rejectPlan(
      plan,
      'OpenCode managed state changed after plan preview.',
      'critical',
      'opencode-plan-live-state-changed',
      issued.context,
    );
  }
  if (plan.harness !== 'opencode') {
    return rejectPlan(
      plan,
      'Only OpenCode operation plans can be applied.',
      'critical',
      'opencode-plan-harness-mismatch',
      issued.context,
    );
  }
  if (!plan.canApply) {
    return rejectPlan(
      plan,
      'OpenCode plan cannot be applied because canApply is false.',
      'critical',
      'opencode-plan-blocked',
      issued.context,
    );
  }
  if (!['install', 'update', 'sync', 'model-config'].includes(plan.action)) {
    return rejectPlan(
      plan,
      `Unsupported OpenCode apply action: ${plan.action}.`,
      'critical',
      'opencode-plan-action-unsupported',
      issued.context,
    );
  }
  if (plan.items.length === 0) {
    return rejectPlan(
      plan,
      'OpenCode plan has no items to apply.',
      'critical',
      'opencode-plan-empty',
      issued.context,
    );
  }
  return null;
}

function invalidModelPayloadReason(
  roles: readonly NormalizedOpenCodeRoleOverride[],
): string | undefined {
  if (!Array.isArray(roles) || roles.length === 0) {
    return 'Model payload must contain at least one role override.';
  }
  const seen = new Set<string>();
  for (const role of roles) {
    if (
      !role ||
      typeof role !== 'object' ||
      typeof role.role !== 'string' ||
      !ROLE_NAMES.includes(role.role as (typeof ROLE_NAMES)[number])
    ) {
      return 'Model payload contains an unsupported role.';
    }
    if (seen.has(role.role)) {
      return `Model payload contains duplicate role ${role.role}.`;
    }
    seen.add(role.role);
    if (typeof role.model !== 'string' || role.model.trim().length === 0) {
      return `Model payload for ${role.role} has an empty model.`;
    }
    if (role.variant !== null && typeof role.variant !== 'string') {
      return `Model payload for ${role.role} has an invalid variant.`;
    }
  }
  return undefined;
}

function applyModelPlan(
  roles: readonly NormalizedOpenCodeRoleOverride[],
): OperationApplyResult {
  const roleModels = new Map(
    roles.map((role) => [
      role.role,
      { model: role.model, variant: role.variant },
    ]),
  );
  ensureConfigDir();
  const targetPath = getExistingLiteConfigPath();
  const parsed = parseConfig(targetPath);
  const base =
    parsed.config ??
    (generateLiteConfig({
      agent: 'opencode',
      hasTmux: false,
      dryRun: false,
      reset: false,
    }) as OpenCodeConfig);
  const agents =
    base.agents && typeof base.agents === 'object'
      ? { ...(base.agents as Record<string, unknown>) }
      : {};

  const statePath = getOpenCodeManagedModelStatePath();
  const state = readManagedModelState(statePath, 1);
  const configuredEfforts = { ...(state.configuredEfforts ?? {}) };
  const warnings: OperationWarning[] = [];

  for (const [role, override] of roleModels) {
    const current = {
      ...((agents[role] as Record<string, unknown> | undefined) ?? {}),
    };
    const currentVariant =
      typeof current.variant === 'string' ? current.variant : undefined;
    const trackedVariant = configuredEfforts[role];
    const userOwnsVariant =
      override.variant === null &&
      currentVariant !== undefined &&
      (trackedVariant === undefined || currentVariant !== trackedVariant);

    current.model = override.model;
    if (userOwnsVariant) {
      delete configuredEfforts[role];
      warnings.push({
        severity: 'important',
        code: 'opencode-effort-user-owned',
        message: `Preserved user-owned OpenCode variant ${currentVariant} for ${role}.`,
      });
    } else if (override.variant === null) {
      delete current.variant;
      delete configuredEfforts[role];
    } else {
      current.variant = override.variant;
      configuredEfforts[role] = override.variant;
    }
    agents[role] = current;
  }
  base.agents = agents;
  writeConfig(targetPath, base);
  writeTextWithBackup(
    statePath,
    stableJson({
      version: 1,
      models: state.models,
      ...(Object.keys(configuredEfforts).length > 0
        ? { configuredEfforts }
        : {}),
    }),
  );

  return {
    harness: 'opencode',
    action: 'model-config',
    applied: true,
    summary: 'Applied OpenCode role model overrides.',
    changedTargets: [
      {
        ...targetForLiteConfig('installed'),
        observed: 'agents role overrides updated',
      },
    ],
    backups: existsSync(`${targetPath}.bak`)
      ? [{ path: `${targetPath}.bak`, label: 'managed backup' }]
      : [],
    warnings,
    disclaimers: defaultDisclaimers(),
  };
}

function applyRequiredSkills(context: OperationContext): {
  success: boolean;
  warnings: OperationWarning[];
} {
  const warnings: OperationWarning[] = [];
  const homeDir = homeDirFromContext(context);
  for (const skill of REQUIRED_SKILLS) {
    try {
      const result = installRequiredSkill(skill, 'opencode', { homeDir });
      if (result.status !== 'failed') continue;
      warnings.push({
        severity: 'critical',
        code: 'opencode-required-skill-failed',
        message: `Failed to install required OpenCode skill: ${skill.name}.`,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      warnings.push({
        severity: 'critical',
        code: 'opencode-required-skill-failed',
        message: `Failed to install required OpenCode skill ${skill.name}: ${reason}.`,
      });
    }
  }
  return { success: warnings.length === 0, warnings };
}

export function applyOpenCodePlan(plan: OperationPlan): OperationApplyResult {
  const rejection = validateApplyPlan(plan);
  if (rejection) return rejection;
  const issued = issuedOpenCodePlans.get(plan);
  if (!issued) {
    return rejectPlan(
      plan,
      'OpenCode plan provenance was lost before apply.',
      'critical',
      'opencode-plan-unissued',
    );
  }

  const status = getOpenCodeStatus(issued.context);
  if (!canApplyToManagedHealth(plan.action, status)) {
    return rejectPlan(
      plan,
      `OpenCode state is ${status.state}; refusing to apply plan without a safe status.`,
      'critical',
      'opencode-plan-live-state-blocked',
      issued.context,
    );
  }

  if (issued.payload.kind === 'model') {
    const invalidPayload = invalidModelPayloadReason(issued.payload.roles);
    if (invalidPayload) {
      return rejectPlan(
        plan,
        invalidPayload,
        'critical',
        'opencode-model-payload-invalid',
        issued.context,
      );
    }
    return applyModelPlan(issued.payload.roles);
  }

  const changedTargets: ManagedTarget[] = [];
  const backups = [];
  const warnings: OperationWarning[] = [];

  const mainConfigResult = updateOpenCodeMainConfig({
    ensurePlugin: true,
    disableDefaults:
      issued.payload.action === 'sync' || issued.payload.action === 'install',
  });
  if (!mainConfigResult.success) {
    return rejectPlan(
      plan,
      mainConfigResult.error ?? 'Failed to update OpenCode main config.',
      'critical',
      'opencode-main-config-update-failed',
      issued.context,
    );
  }
  changedTargets.push({
    ...targetForMainConfig('installed'),
    observed: `plugin includes ${EXPECTED_PLUGIN}`,
  });
  if (existsSync(`${mainConfigResult.configPath}.bak`)) {
    backups.push({
      path: `${mainConfigResult.configPath}.bak`,
      label: 'OpenCode config backup',
    });
  }

  if (issued.payload.action === 'sync' || issued.payload.action === 'install') {
    const liteResult = writeLiteConfig(
      {
        agent: 'opencode',
        hasTmux: false,
        dryRun: false,
        reset: false,
      },
      getExistingLiteConfigPath(),
    );
    if (!liteResult.success) {
      return rejectPlan(
        plan,
        liteResult.error ?? 'Failed to write thoth-agents config.',
      );
    }
    changedTargets.push({
      ...targetForLiteConfig('installed'),
      observed: 'seven-role roster written',
    });
    if (existsSync(`${liteResult.configPath}.bak`)) {
      backups.push({
        path: `${liteResult.configPath}.bak`,
        label: 'thoth-agents config backup',
      });
    }
  }

  if (issued.payload.action === 'install' || issued.payload.action === 'sync') {
    const requiredSkills = applyRequiredSkills(issued.context);
    warnings.push(...requiredSkills.warnings);
    changedTargets.push({
      kind: 'skill',
      label: 'Required OpenCode skills',
      state: requiredSkills.success ? 'installed' : 'drift',
      observed: requiredSkills.success
        ? 'required external skills installed'
        : 'required external skill installation failed',
    });
    if (!requiredSkills.success) {
      return {
        harness: 'opencode',
        action: plan.action,
        applied: false,
        summary:
          'OpenCode configuration was written, but required skills failed to install.',
        changedTargets,
        backups,
        warnings,
        disclaimers: defaultDisclaimers(),
      };
    }
  }

  return {
    harness: 'opencode',
    action: plan.action,
    applied: true,
    summary:
      plan.action === 'install'
        ? 'Applied OpenCode install plan.'
        : plan.action === 'sync'
          ? 'Applied OpenCode managed configuration sync.'
          : 'Applied OpenCode plugin update.',
    changedTargets,
    backups,
    warnings,
    disclaimers: defaultDisclaimers(),
  };
}
