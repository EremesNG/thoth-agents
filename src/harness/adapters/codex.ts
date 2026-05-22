import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CODEX_PROMPT_DIALECT } from '../../agents/prompt-dialects';
import {
  createModelFamilySection,
  createOrchestratorPromptSections,
  createReadOnlySpecialistPromptSections,
  createStepBudgetSection,
  createWriteCapableSpecialistPromptSections,
  type RolePromptSection,
  renderPromptSection,
  renderRolePrompt,
} from '../../agents/prompt-sections';
import {
  appendPromptSections,
  composeAgentPrompt,
} from '../../agents/prompt-utils';
import {
  type AgentOverrideConfig,
  DEFAULT_MODELS,
  DEFAULT_THOTH_COMMAND,
  getAgentOverride,
  loadAgentPrompt,
  type PluginConfig,
} from '../../config';
import { CONTEXT7_MCP_URL } from '../../mcp/context7';
import { exa } from '../../mcp/exa';
import { GREP_APP_MCP_URL } from '../../mcp/grep-app';
import type { McpConfig } from '../../mcp/types';
import {
  type AgentRoleContract,
  type AgentRoleName,
  getAgentPackContract,
} from '../core/agent-pack';
import {
  memoryGovernanceDiagnostics,
  renderMemoryGovernanceInstructions,
} from '../core/memory-governance';
import { getSkillRegistry } from '../core/skills';
import type {
  HarnessAdapter,
  HarnessArtifact,
  HarnessCapabilities,
  HarnessDiagnostic,
  HarnessRenderContext,
  HarnessRenderResult,
} from '../types';
import { renderCodexPluginPackage } from '../writers/codex-plugin-package';
import { renderCodexToml } from '../writers/codex-toml';
import type { CodexSkillOutputMode } from '../writers/skill-layout';
import { renderCodexSkillLayout } from '../writers/skill-layout';
import {
  codexSurfaceDiagnostic,
  getCodexSurface,
  getCodexSurfaceRecords,
} from './codex-surfaces';

export interface CodexRenderContext extends HarnessRenderContext {
  config?: PluginConfig;
}

function readRootPackageVersion(startDir: string): string {
  const packageJsonPath = findRootPackageJsonPath([startDir, process.cwd()]);
  return readPackageJsonVersion(packageJsonPath);
}

function createCodexPluginPackageManifest(projectRoot: string): {
  name: string;
  version: string;
  description: string;
} {
  return {
    name: 'thoth-agents',
    version: readRootPackageVersion(projectRoot),
    description:
      'Delegate-first OpenCode plugin with seven agents, thoth-mem persistence, and bundled SDD skills.',
  };
}

function findRootPackageJsonPath(startDirs: readonly string[]): string {
  for (const startDir of startDirs) {
    let currentDir = resolve(startDir);

    while (true) {
      const packageJsonPath = resolve(currentDir, 'package.json');

      if (existsSync(packageJsonPath)) {
        const packageJsonText = readFileSync(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageJsonText) as {
          name?: unknown;
        };

        if (packageJson.name === 'thoth-agents') {
          return packageJsonPath;
        }
      }

      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }

      currentDir = parentDir;
    }
  }

  throw new Error(
    'Unable to locate the thoth-agents root package.json from the render context or current working directory.',
  );
}

function readPackageJsonVersion(packageJsonPath: string): string {
  const packageJsonText = readFileSync(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonText) as {
    version?: unknown;
  };

  if (
    typeof packageJson.version !== 'string' ||
    packageJson.version.length === 0
  ) {
    throw new Error('Root package.json version must be a non-empty string.');
  }

  return packageJson.version;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function codexCommandConfig(
  commandParts: readonly string[],
): Record<string, unknown> {
  const [command = '', ...args] = commandParts;
  return {
    command,
    ...(args.length > 0 ? { args } : {}),
  };
}

function codexMcpConfig(config: McpConfig): Record<string, unknown> {
  if ('url' in config) {
    return { url: config.url };
  }

  const [command = '', ...args] = config.command;

  return {
    command,
    ...(args.length > 0 ? { args } : {}),
    ...(config.environment && Object.keys(config.environment).length > 0
      ? { env: config.environment }
      : {}),
  };
}

function createCodexBuiltinMcpServers(): Record<string, unknown> {
  return {
    exa: codexMcpConfig(exa),
    context7: { url: CONTEXT7_MCP_URL },
    grep_app: { url: GREP_APP_MCP_URL },
    thoth_mem: codexCommandConfig(DEFAULT_THOTH_COMMAND),
  };
}

function createCodexBuiltinMcpJsonConfig(): Record<string, unknown> {
  return {
    mcpServers: createCodexBuiltinMcpServers(),
  };
}

function createCodexBuiltinMcpTomlConfig(): Record<string, unknown> {
  return {
    mcp_servers: createCodexBuiltinMcpServers(),
  };
}

const CODEX_SUBAGENT_DEFAULT_MODELS = {
  oracle: 'gpt-5.5',
  librarian: 'gpt-5.4-mini',
  explorer: 'gpt-5.4-mini',
  designer: 'gpt-5.4-mini',
  quick: 'gpt-5.4-mini',
  deep: 'gpt-5.5',
} as const;

type CodexSubagentName = keyof typeof CODEX_SUBAGENT_DEFAULT_MODELS;

const CODEX_SUBAGENT_REASONING_EFFORTS = {
  oracle: 'high',
  explorer: 'low',
  librarian: 'medium',
  designer: 'medium',
  quick: 'low',
  deep: 'medium',
} as const satisfies Record<CodexSubagentName, string>;

const CODEX_ROOT_START = '<!-- thoth-agents:codex-root:start -->';
const CODEX_ROOT_END = '<!-- thoth-agents:codex-root:end -->';

export const CODEX_CAPABILITIES: HarnessCapabilities =
  CODEX_PROMPT_DIALECT.capabilities.capabilities;

function codexPromptSections(roleName: AgentRoleName): RolePromptSection[] {
  switch (roleName) {
    case 'orchestrator':
      return createOrchestratorPromptSections();
    case 'explorer':
    case 'librarian':
    case 'oracle':
      return createReadOnlySpecialistPromptSections(roleName);
    case 'designer':
    case 'quick':
    case 'deep':
      return createWriteCapableSpecialistPromptSections(roleName);
  }
}

function codexModelFamilyPromptSection(
  roleName: AgentRoleName,
  model?: AgentOverrideConfig['model'] | string,
): string | undefined {
  const section = createModelFamilySection(roleName, model);

  return section
    ? renderPromptSection(section, CODEX_PROMPT_DIALECT)
    : undefined;
}

function codexStepBudgetPromptSection(steps?: number): string | undefined {
  const section = createStepBudgetSection(steps);

  return section
    ? renderPromptSection(section, CODEX_PROMPT_DIALECT)
    : undefined;
}

function renderCodexRolePrompt(
  roleName: AgentRoleName,
  config?: PluginConfig,
  model?: AgentOverrideConfig['model'] | string,
): string {
  const promptOverrides = loadAgentPrompt(roleName, config?.preset);
  const override = getAgentOverride(config, roleName);
  const basePrompt = renderRolePrompt(
    codexPromptSections(roleName),
    CODEX_PROMPT_DIALECT,
  );
  const prompt = composeAgentPrompt({
    basePrompt,
    customPrompt: promptOverrides.prompt,
    customAppendPrompt: appendPromptSections(
      codexModelFamilyPromptSection(roleName, model),
      promptOverrides.appendPrompt,
    ),
  });

  return appendPromptSections(
    prompt,
    codexStepBudgetPromptSection(override?.steps),
  );
}

function codexRoleInstructions(role: AgentRoleContract): string {
  return [
    '<role-operational-contract>',
    `- Role: ${role.name}`,
    `- Mode: ${role.mode}`,
    `- Scope: ${role.scope}`,
    `- Responsibility: ${role.responsibility}`,
    '- Use request_user_input for local blocking decisions.',
    '- Permissions, memory governance, runtime hooks, and provider-per-agent controls are instruction-level unless the active Codex runtime documents stronger enforcement.',
    `- ${role.name} runs as a Codex custom agent TOML; there is no selectable orchestrator TOML.`,
    ...role.toolGovernance.map((rule) => `- ${rule}`),
    ...role.verification.map((rule) => `- ${rule}`),
    '</role-operational-contract>',
  ].join('\n');
}

function roleInstructions(
  role: AgentRoleContract,
  config?: PluginConfig,
): string {
  const model = getCodexAgentModel(role, config) ?? DEFAULT_MODELS[role.name];

  return [
    renderCodexRolePrompt(role.name, config, model),
    codexRoleInstructions(role),
    renderMemoryGovernanceInstructions(role, CODEX_PROMPT_DIALECT),
  ].join('\n\n');
}

export function renderCodexRootInstructions(config?: PluginConfig): string {
  const rootOverride = getAgentOverride(config, 'orchestrator');
  const rootPrompt = renderCodexRolePrompt(
    'orchestrator',
    config,
    rootOverride?.model ?? DEFAULT_MODELS.orchestrator,
  );

  return [
    CODEX_ROOT_START,
    rootPrompt,
    '<codex-runtime>',
    '- The ambient Codex root session is the root/main orchestrator; orchestrator-only and root-owned instructions apply to it because Codex does not generate a selectable orchestrator agent TOML.',
    '- On each new root session, when thoth-mem tools are installed and session/project identity is known, call mem_session_start with the active project and session identity, then save the real user prompt with mem_save_prompt before later delegation.',
    '- If thoth-mem tools or identity values are unavailable, disclose that memory bootstrap could not run and continue without claiming memory was saved.',
    '- Use the ambient Codex root session as the delegate-first root coordinator; do not generate or select an orchestrator TOML.',
    '- Delegate by invoking the installed Codex role agents: explorer, librarian, oracle, designer, quick, and deep.',
    '- After receiving a delegated subagent response, close that subagent session unless you will retry or intentionally keep using that exact same session; explorer and librarian sessions must always be closed immediately after their response, and retry sessions must be closed after the retry result unless explicit same-session reuse is still required.',
    '- Use packaged thoth-agents plugin capabilities through Codex plugin, skill, MCP, and hook review surfaces after enabling them with /plugins and /hooks.',
    '- For blocking user decisions in Codex Default mode, use request_user_input after features.default_mode_request_user_input is enabled; do not ask those questions in plain prose.',
    '- Permissions, memory policy, provider-per-agent controls, and hooks are instruction-only unless the active Codex runtime documents stronger enforcement.',
    '</codex-runtime>',
    CODEX_ROOT_END,
    '',
  ].join('\n');
}

function agentModelReasoningEffort(role: AgentRoleContract): string {
  return isCodexSubagentName(role.name)
    ? CODEX_SUBAGENT_REASONING_EFFORTS[role.name]
    : 'medium';
}

function isCodexSubagentName(name: string): name is CodexSubagentName {
  return name in CODEX_SUBAGENT_DEFAULT_MODELS;
}

function getPrimaryModelId(
  model: AgentOverrideConfig['model'],
): string | undefined {
  if (Array.isArray(model)) {
    const first = model[0];
    return typeof first === 'string' ? first : first?.id;
  }

  return model;
}

function getCodexAgentModel(
  role: AgentRoleContract,
  config?: PluginConfig,
): string | undefined {
  if (!isCodexSubagentName(role.name)) return undefined;

  return (
    getPrimaryModelId(config?.agents?.[role.name]?.model) ??
    CODEX_SUBAGENT_DEFAULT_MODELS[role.name]
  );
}

function codexSurfaceHasField(surfaceId: string, field: string): boolean {
  return getCodexSurface(surfaceId)?.fields.includes(field) ?? false;
}

function hasCodexConfig(
  context: HarnessRenderContext,
): context is CodexRenderContext {
  return 'config' in context;
}

function renderAgentArtifacts({ config }: { config?: PluginConfig }): {
  artifacts: HarnessArtifact[];
  diagnostics: HarnessDiagnostic[];
} {
  const artifacts: HarnessArtifact[] = [];
  const diagnostics: HarnessDiagnostic[] = [];
  const supportsReasoningEffort = codexSurfaceHasField(
    'project-agent-toml',
    'model_reasoning_effort',
  );

  for (const role of getAgentPackContract().roles.filter(
    (candidate) => candidate.name !== 'orchestrator',
  )) {
    const model = getCodexAgentModel(role, config);
    const toml = renderCodexToml({
      surfaceId: 'project-agent-toml',
      values: {
        name: role.name,
        description: role.responsibility,
        developer_instructions: roleInstructions(role, config),
        ...(model ? { model } : {}),
        ...(supportsReasoningEffort
          ? { model_reasoning_effort: agentModelReasoningEffort(role) }
          : {}),
        sandbox_mode: role.canMutateWorkspace ? 'workspace-write' : 'read-only',
      },
    });

    diagnostics.push(...toml.diagnostics);
    artifacts.push({
      harness: 'codex',
      kind: 'agent-config',
      path: `.codex/agents/thoth-agents-${role.name}.toml`,
      description: `Codex agent definition for ${role.name}.`,
      content: toml.content,
    });
  }

  return { artifacts, diagnostics };
}

function renderConfigArtifacts(): {
  artifacts: HarnessArtifact[];
  diagnostics: HarnessDiagnostic[];
} {
  const config = renderCodexToml({
    surfaceId: 'project-config-toml',
    values: {
      approval_policy: 'on-request',
      sandbox_mode: 'workspace-write',
      'skills.config': { enabled: true, sources: ['repo'] },
      agents: getAgentPackContract()
        .roles.filter((role) => role.name !== 'orchestrator')
        .map((role) => role.name),
    },
  });
  const mcp = renderCodexToml({
    surfaceId: 'mcp-server-config',
    values: createCodexBuiltinMcpTomlConfig(),
  });

  return {
    artifacts: [
      {
        harness: 'codex',
        kind: 'harness-config',
        path: '.codex/config.toml',
        description: 'Codex project configuration snippet for the agent pack.',
        content: config.content,
      },
      {
        harness: 'codex',
        kind: 'mcp-config',
        path: '.codex/config.toml',
        description: 'Codex MCP configuration snippet for thoth-mem.',
        content: mcp.content,
      },
    ],
    diagnostics: [...config.diagnostics, ...mcp.diagnostics],
  };
}

function capabilityDiagnostics(): HarnessDiagnostic[] {
  const surfaceDiagnostics = getCodexSurfaceRecords()
    .filter((surface) => surface.status !== 'validated')
    .map(codexSurfaceDiagnostic);

  const governanceDiagnostics = memoryGovernanceDiagnostics({
    harness: 'codex',
    permissionControls: CODEX_CAPABILITIES.rolePermissions,
    parentContextInjection: CODEX_CAPABILITIES.parentContextInjection,
    memoryWriteControls: CODEX_CAPABILITIES.memoryGovernanceEnforcement,
  });

  return [...surfaceDiagnostics, ...governanceDiagnostics];
}

function hookReadinessDiagnostics(): HarnessDiagnostic[] {
  return [
    {
      severity: 'warning',
      code: 'codex.hooks.project_trust.required',
      message:
        'Codex project-local hooks require trusted project configuration before .codex/hooks.json or inline [hooks] command handlers are active; generated artifacts remain diagnostic-only until trust and features.hooks are reviewed.',
      harness: 'codex',
      surface: 'project-hooks-json',
      fallback: 'diagnostic-only',
    },
    {
      severity: 'warning',
      code: 'codex.hooks.features_hooks.required',
      message:
        'Codex hook loading is gated by features.hooks; this adapter reports the docs-backed config surface but does not generate hook scripts or claim runtime enforcement.',
      harness: 'codex',
      surface: 'features-hooks-toggle',
      fallback: 'diagnostic-only',
    },
    {
      severity: 'warning',
      code: 'codex.hooks.plugin_trust.required',
      message:
        'Bundled Codex plugin hook configuration is package content only; activation requires features.plugin_hooks and plugin hook trust review, and this adapter does not enable hooks automatically or claim hard permission enforcement.',
      harness: 'codex',
      surface: 'plugin-hooks-bundle',
      fallback: 'diagnostic-only',
    },
  ];
}

function resolveSkillOutputModes(
  context: HarnessRenderContext,
): readonly CodexSkillOutputMode[] {
  return context.options?.codexSkillOutputModes ?? ['plugin-package'];
}

export const codexAdapter: HarnessAdapter = {
  id: 'codex',
  displayName: 'Codex',
  capabilities: CODEX_CAPABILITIES,
  render(context: HarnessRenderContext): HarnessRenderResult {
    const config = hasCodexConfig(context) ? context.config : undefined;
    const agentArtifacts = renderAgentArtifacts({ config });
    const configArtifacts = renderConfigArtifacts();
    const skillOutputModes = resolveSkillOutputModes(context);
    const skillLayout = renderCodexSkillLayout({
      projectRoot: context.projectRoot,
      skills: getSkillRegistry(),
      surfaceId: 'plugin-skills-directory',
      outputModes: skillOutputModes,
    });
    const pluginPackage = renderCodexPluginPackage({
      manifest: createCodexPluginPackageManifest(context.projectRoot),
      assets: [
        {
          surfaceId: 'plugin-skills-directory',
          manifestField: 'skills',
          path: '.codex-plugin/skills/',
          description: 'Codex plugin-bundled skill directory.',
        },
        {
          surfaceId: 'plugin-mcp-json',
          manifestField: 'mcpServers',
          path: '.codex-plugin/.mcp.json',
          description: 'Codex plugin-bundled MCP server definitions.',
          content: stableJson(createCodexBuiltinMcpJsonConfig()),
        },
        {
          surfaceId: 'plugin-hooks-json',
          manifestField: 'hooks',
          path: '.codex-plugin/hooks/hooks.json',
          description: 'Codex plugin-bundled hook configuration.',
          hookDefinitions: [],
        },
      ],
    });

    return {
      harness: 'codex',
      artifacts: [
        ...agentArtifacts.artifacts,
        ...configArtifacts.artifacts,
        ...pluginPackage.artifacts,
        ...skillLayout.artifacts,
      ],
      diagnostics: [
        ...agentArtifacts.diagnostics,
        ...configArtifacts.diagnostics,
        ...pluginPackage.diagnostics,
        ...skillLayout.diagnostics,
        ...hookReadinessDiagnostics(),
        ...capabilityDiagnostics(),
      ],
    };
  },
};
