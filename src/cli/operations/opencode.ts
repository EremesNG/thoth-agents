import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_AGENT_NAMES } from '../../config';
import {
  disableDefaultAgents,
  parseConfig,
  writeConfig,
  writeLiteConfig,
} from '../config-io';
import {
  CUSTOM_SKILLS,
  getCustomSkillsDir,
  installCustomSkills,
} from '../custom-skills';
import {
  ensureConfigDir,
  ensureOpenCodeConfigDir,
  getExistingConfigPath,
  getExistingLiteConfigPath,
} from '../paths';
import { generateLiteConfig } from '../providers';
import {
  getRecommendedSkillPath,
  installRecommendedSkill,
  RECOMMENDED_SKILLS,
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

const PACKAGE_NAME = 'thoth-agents';
const EXPECTED_PLUGIN = `${PACKAGE_NAME}@latest`;
const OPENAI_PRESET = 'openai';
const ROLE_NAMES = [...ALL_AGENT_NAMES];

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
    description:
      'Preview OpenCode install using --no-tui --tmux=no --skills=yes semantics',
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
    state,
    expected: `plugin includes ${EXPECTED_PLUGIN}`,
  };
}

function targetForLiteConfig(state?: ManagedState): ManagedTarget {
  return {
    kind: 'config',
    path: getExistingLiteConfigPath(),
    label: 'thoth-agents config',
    state,
    expected: `seven-agent ${OPENAI_PRESET} roster`,
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
  return context.env?.HOME ?? context.env?.USERPROFILE;
}

function openCodeSkillTargets(context: OperationContext): {
  targets: ManagedTarget[];
  diagnostics: OperationWarning[];
} {
  const homeDir = homeDirFromContext(context);
  const recommendedTargets: ManagedTarget[] = RECOMMENDED_SKILLS.map(
    (skill) => {
      const path = getRecommendedSkillPath(skill, homeDir);
      const installed = existsSync(path);
      return {
        kind: 'skill',
        path,
        label: titleCaseSkillName(skill.skillName),
        state: installed ? 'installed' : 'missing',
        expected: 'recommended global OpenCode skill',
        observed: installed
          ? 'recommended global skill installed'
          : 'recommended global skill missing',
      };
    },
  );
  const bundledTargets: ManagedTarget[] = CUSTOM_SKILLS.map((skill) => {
    const path = join(getCustomSkillsDir(), skill.name, 'SKILL.md');
    const installed = existsSync(path);
    return {
      kind: 'skill',
      path,
      label: titleCaseSkillName(skill.name),
      state: installed ? 'installed' : 'missing',
      expected: 'bundled thoth-agents OpenCode skill',
      observed: installed
        ? 'bundled OpenCode skill installed'
        : 'bundled OpenCode skill missing',
    };
  });
  const diagnostics: OperationWarning[] = [];
  if (recommendedTargets.some((target) => target.state === 'missing')) {
    diagnostics.push({
      severity: 'minor',
      message:
        'Recommended OpenCode global skills are missing; run the OpenCode install flow with skills enabled.',
      code: 'opencode-recommended-skills-missing',
    });
  }
  if (bundledTargets.some((target) => target.state === 'missing')) {
    diagnostics.push({
      severity: 'important',
      message:
        'Bundled thoth-agents OpenCode skills are missing; run OpenCode install or sync to refresh managed skills.',
      code: 'opencode-bundled-skills-missing',
    });
  }
  return {
    targets: [...recommendedTargets, ...bundledTargets],
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
  const roles = ROLE_NAMES.filter((role) => role in openaiPreset);
  return `preset: ${preset ?? 'none'}; ${OPENAI_PRESET} roles: ${roles.join(', ')}`;
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

function classifyApplySafety(state: ManagedState): boolean {
  return state === 'missing' || state === 'installed';
}

export function getOpenCodeStatus(
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
      return {
        harness: 'opencode',
        displayName: 'OpenCode',
        state: 'drift',
        summary:
          'OpenCode config has a managed thoth-agents plugin entry that is not latest.',
        targets: [
          { ...mainTarget, state: 'drift' },
          { ...liteTarget, state: liteExists ? 'installed' : 'missing' },
          ...skillStatus.targets,
        ],
        diagnostics: [
          {
            severity: 'important',
            message:
              'Managed plugin drift requires an explicit repair before applying sync plans.',
            code: 'opencode-plugin-drift',
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
      diagnostics: [...diagnostics, ...skillStatus.diagnostics],
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
      diagnostics: [...diagnostics, ...skillStatus.diagnostics],
      actions: openCodeActions,
    };
  }

  if (!hasSevenAgentPreset(lite.config)) {
    return {
      harness: 'opencode',
      displayName: 'OpenCode',
      state: 'drift',
      summary:
        'thoth-agents config does not match the expected seven-agent roster.',
      targets: [
        { ...mainTarget, state: 'installed' },
        { ...liteTarget, state: 'drift' },
        ...skillStatus.targets,
      ],
      diagnostics: [
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
    state: 'installed',
    summary: 'OpenCode managed thoth-agents configuration is installed.',
    targets: [
      { ...mainTarget, state: 'installed' },
      { ...liteTarget, state: 'installed' },
      ...skillStatus.targets,
    ],
    diagnostics: [...diagnostics, ...skillStatus.diagnostics],
    actions: openCodeActions,
  };
}

function defaultBackup(path: string) {
  return {
    required: true,
    strategy: 'managed-backup-file' as const,
    destinations: [{ path: `${path}.bak`, label: 'managed backup' }],
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
): OperationPlan {
  const status = getOpenCodeStatus();
  const safe = classifyApplySafety(status.state);
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
    id,
    harness: 'opencode',
    action,
    title,
    summary,
    dryRun: true,
    canApply: safe,
    targets: status.targets,
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
    backup: defaultBackup(getExistingConfigPath()),
    items,
    warnings,
    disclaimers: defaultDisclaimers(),
  };
}

export function buildOpenCodeUpdatePlan(
  _context: OperationContext = { cwd: process.cwd() },
): OperationPlan {
  const path = getExistingConfigPath();
  return planFromItems(
    'opencode-update-preview',
    'update',
    'Update OpenCode managed plugin entry',
    `Preview ensuring plugin: ["${EXPECTED_PLUGIN}"].`,
    [
      {
        title: 'Ensure OpenCode plugin points at thoth-agents@latest',
        target: targetForMainConfig(),
        state: getOpenCodeStatus().state,
        preview: `plugin: ["${EXPECTED_PLUGIN}"]`,
        backup: defaultBackup(path),
      },
    ],
  );
}

export function buildOpenCodeSyncPlan(
  _context: OperationContext = { cwd: process.cwd() },
): OperationPlan {
  const generatedConfig = generateLiteConfig({
    agent: 'opencode',
    hasTmux: false,
    installSkills: false,
    installCustomSkills: true,
    dryRun: true,
    reset: false,
  });
  const litePath = getExistingLiteConfigPath();

  return planFromItems(
    'opencode-sync-preview',
    'sync',
    'Sync OpenCode managed configuration',
    'Preview OpenCode plugin entry, default-agent disablement, and thoth-agents config sync.',
    [
      {
        title: 'Ensure OpenCode plugin points at thoth-agents@latest',
        target: targetForMainConfig(),
        state: getOpenCodeStatus().state,
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
        title: 'Write thoth-agents seven-agent config',
        target: targetForLiteConfig(),
        preview: JSON.stringify(generatedConfig, null, 2),
        backup: defaultBackup(litePath),
      },
    ],
  );
}

function tuiInstallConfig() {
  return {
    agent: 'opencode' as const,
    hasTmux: false,
    installSkills: true,
    installCustomSkills: true,
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
    installSkills: true,
    installCustomSkills: true,
    equivalentCommand:
      'install --agent=opencode --no-tui --tmux=no --skills=yes',
  };
  const litePath = getExistingLiteConfigPath();

  return planFromItems(
    'opencode-install-preview',
    'install',
    'Preview install',
    'Preview OpenCode install equivalent to install --agent=opencode --no-tui --tmux=no --skills=yes.',
    [
      {
        title: 'Apply OpenCode TUI install options',
        target: {
          kind: 'config',
          path: getExistingConfigPath(),
          label: 'OpenCode install options',
          state: getOpenCodeStatus().state,
          expected: '--no-tui --tmux=no --skills=yes',
        },
        preview: JSON.stringify(installPreview, null, 2),
      },
      {
        title: 'Ensure OpenCode plugin points at thoth-agents@latest',
        target: targetForMainConfig(),
        state: getOpenCodeStatus().state,
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
        title: 'Write thoth-agents seven-agent config',
        target: targetForLiteConfig(),
        preview: JSON.stringify(generatedConfig, null, 2),
        backup: defaultBackup(litePath),
      },
      {
        title: 'Install recommended external skills',
        target: {
          kind: 'skill',
          label: 'Recommended OpenCode skills',
          expected: 'skills=yes',
        },
        preview: JSON.stringify({ installSkills: true }, null, 2),
      },
    ],
  );
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
  const items = input.roles.map((role) => {
    const model = normalizeRoleModel(role);
    return {
      title: `Set ${role.role} OpenCode model override`,
      target: targetForLiteConfig(),
      preview: JSON.stringify({ [role.role]: { model } }),
      backup: defaultBackup(getExistingLiteConfigPath()),
    };
  });
  const plan = planFromItems(
    'opencode-model-config-preview',
    'model-config',
    'Configure OpenCode role model overrides',
    'Preview thoth-agents role model overrides in the plugin config agents map.',
    items,
  );

  if (input.harness !== 'opencode') {
    return {
      ...plan,
      canApply: false,
      warnings: [
        ...plan.warnings,
        {
          severity: 'critical',
          message: 'Model plan target harness must be opencode.',
          code: 'opencode-model-harness-mismatch',
        },
      ],
    };
  }

  const unsupportedRoles = input.roles.filter(
    (role) => !ROLE_NAMES.includes(role.role as (typeof ROLE_NAMES)[number]),
  );
  if (input.roles.length === 0 || unsupportedRoles.length > 0) {
    return {
      ...plan,
      canApply: false,
      warnings: [
        ...plan.warnings,
        {
          severity: 'critical',
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
  }

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
    disclaimers: defaultDisclaimers(),
  };
}

function ensureLatestPluginEntry(): {
  success: boolean;
  configPath: string;
  error?: string;
} {
  const configPath = getExistingConfigPath();
  try {
    ensureOpenCodeConfigDir();
    const { config: parsedConfig, error } = parseConfig(configPath);
    if (error) {
      return {
        success: false,
        configPath,
        error: `Failed to parse config: ${error}`,
      };
    }
    const config = parsedConfig ?? {};
    const plugins = Array.isArray(config.plugin) ? config.plugin : [];
    config.plugin = [
      ...plugins.filter(
        (plugin) =>
          plugin !== PACKAGE_NAME && !plugin.startsWith(`${PACKAGE_NAME}@`),
      ),
      EXPECTED_PLUGIN,
    ];
    writeConfig(configPath, config);
    return { success: true, configPath };
  } catch (err) {
    return {
      success: false,
      configPath,
      error: `Failed to update OpenCode plugin config: ${err}`,
    };
  }
}

function validateApplyPlan(plan: OperationPlan): OperationApplyResult | null {
  if (plan.harness !== 'opencode') {
    return rejectPlan(plan, 'Only OpenCode operation plans can be applied.');
  }
  if (!plan.canApply) {
    return rejectPlan(
      plan,
      'OpenCode plan cannot be applied because canApply is false.',
    );
  }
  if (!['install', 'update', 'sync', 'model-config'].includes(plan.action)) {
    return rejectPlan(
      plan,
      `Unsupported OpenCode apply action: ${plan.action}.`,
    );
  }
  if (plan.items.length === 0) {
    return rejectPlan(plan, 'OpenCode plan has no items to apply.');
  }
  if (
    plan.items.some(
      (item) =>
        !item.title ||
        (!item.target.path && item.target.kind !== 'skill') ||
        item.state === 'drift' ||
        item.state === 'unknown',
    )
  ) {
    return rejectPlan(
      plan,
      'OpenCode plan contains malformed or unsafe items.',
    );
  }
  return null;
}

function applyModelPlan(plan: OperationPlan): OperationApplyResult {
  const roleModels = new Map<string, string>();
  for (const item of plan.items) {
    const match = /^Set (.+) OpenCode model override$/.exec(item.title);
    if (!match) {
      return rejectPlan(
        plan,
        'OpenCode model plan contains an unrecognized item.',
      );
    }
    let parsed: Record<string, { model?: string }>;
    try {
      parsed = item.preview
        ? (JSON.parse(item.preview) as Record<string, { model?: string }>)
        : {};
    } catch {
      return rejectPlan(
        plan,
        'OpenCode model plan contains malformed preview JSON.',
      );
    }
    const role = match[1] ?? '';
    const model = parsed[role]?.model;
    if (
      !ROLE_NAMES.includes(role as (typeof ROLE_NAMES)[number]) ||
      typeof model !== 'string'
    ) {
      return rejectPlan(
        plan,
        'OpenCode model plan contains an invalid role or model.',
      );
    }
    roleModels.set(role, model);
  }

  if (roleModels.size === 0) {
    return rejectPlan(
      plan,
      'OpenCode model plan does not contain any role overrides.',
    );
  }

  ensureConfigDir();
  const targetPath = getExistingLiteConfigPath();
  const parsed = parseConfig(targetPath);
  const base =
    parsed.config ??
    (generateLiteConfig({
      agent: 'opencode',
      hasTmux: false,
      installSkills: false,
      installCustomSkills: true,
      dryRun: false,
      reset: false,
    }) as OpenCodeConfig);
  const agents =
    base.agents && typeof base.agents === 'object'
      ? { ...(base.agents as Record<string, unknown>) }
      : {};

  for (const role of roleModels.keys()) {
    agents[role] = {
      ...((agents[role] as Record<string, unknown> | undefined) ?? {}),
      model: roleModels.get(role),
    };
  }
  base.agents = agents;
  writeConfig(targetPath, base);

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
    warnings: [],
    disclaimers: defaultDisclaimers(),
  };
}

function applyInstallSkills(plan: OperationPlan): OperationApplyResult | null {
  for (const skill of RECOMMENDED_SKILLS) {
    const result = installRecommendedSkill(skill);
    if (result.status === 'failed') {
      return rejectPlan(
        plan,
        `Failed to install recommended OpenCode skill: ${skill.name}.`,
      );
    }
  }

  const bundled = installCustomSkills();
  if (!bundled.success) {
    return rejectPlan(
      plan,
      'Failed to install bundled thoth-agents OpenCode skills.',
    );
  }

  return null;
}

export function applyOpenCodePlan(plan: OperationPlan): OperationApplyResult {
  const rejection = validateApplyPlan(plan);
  if (rejection) return rejection;

  const status = getOpenCodeStatus();
  if (!classifyApplySafety(status.state)) {
    return rejectPlan(
      plan,
      `OpenCode state is ${status.state}; refusing to apply plan without a safe status.`,
    );
  }

  if (plan.action === 'model-config') return applyModelPlan(plan);

  const changedTargets: ManagedTarget[] = [];
  const backups = [];

  const pluginResult = ensureLatestPluginEntry();
  if (!pluginResult.success) {
    return rejectPlan(
      plan,
      pluginResult.error ?? 'Failed to update OpenCode plugin config.',
    );
  }
  changedTargets.push({
    ...targetForMainConfig('installed'),
    observed: `plugin includes ${EXPECTED_PLUGIN}`,
  });
  if (existsSync(`${pluginResult.configPath}.bak`)) {
    backups.push({
      path: `${pluginResult.configPath}.bak`,
      label: 'OpenCode config backup',
    });
  }

  if (plan.action === 'sync' || plan.action === 'install') {
    const defaultAgentResult = disableDefaultAgents();
    if (!defaultAgentResult.success) {
      return rejectPlan(
        plan,
        defaultAgentResult.error ??
          'Failed to disable OpenCode default agents.',
      );
    }
    const liteResult = writeLiteConfig(
      {
        agent: 'opencode',
        hasTmux: false,
        installSkills: plan.action === 'install',
        installCustomSkills: true,
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
      observed: 'seven-agent roster written',
    });
    if (existsSync(`${liteResult.configPath}.bak`)) {
      backups.push({
        path: `${liteResult.configPath}.bak`,
        label: 'thoth-agents config backup',
      });
    }
  }

  if (plan.action === 'install') {
    const skillsRejection = applyInstallSkills(plan);
    if (skillsRejection) return skillsRejection;
    changedTargets.push({
      kind: 'skill',
      label: 'Recommended and bundled OpenCode skills',
      state: 'installed',
      observed: 'skills=yes processed',
    });
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
    warnings: [],
    disclaimers: defaultDisclaimers(),
  };
}
