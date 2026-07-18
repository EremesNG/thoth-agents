import { fileURLToPath } from 'node:url';
import { renderConfiguredRolePrompt } from '../../agents/configured-role-prompt';
import { CODEX_PROMPT_DIALECT } from '../../agents/prompt-dialects';
import {
  CONFIRMED_OPENAI_SUBAGENT_PRESET,
  DEFAULT_MODELS,
  getAgentOverride,
  getPrimaryModelId,
  type PluginConfig,
} from '../../config';
import { CONTEXT7_MCP_URL } from '../../mcp/context7';
import { exa } from '../../mcp/exa';
import { GREP_APP_MCP_URL } from '../../mcp/grep-app';
import type { McpConfig } from '../../mcp/types';
import {
  type AgentRoleContract,
  getAgentPackContract,
} from '../core/agent-pack';
import {
  memoryGovernanceDiagnostics,
  renderMemoryGovernanceInstructions,
} from '../core/memory-governance';
import {
  findRootPackageJsonPath,
  readPackageJsonVersion,
} from '../core/package-version';
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
import {
  codexSurfaceDiagnostic,
  getCodexSurfaceRecords,
} from './codex-surfaces';

export interface CodexRenderContext extends HarnessRenderContext {
  config?: PluginConfig;
  packageRoot?: string;
}

function readRootPackageVersion(context: HarnessRenderContext): string {
  const packageJsonPath = findRootPackageJsonPath([
    ...(hasCodexPackageRoot(context) ? [context.packageRoot] : []),
    context.projectRoot,
    process.cwd(),
    fileURLToPath(new URL('.', import.meta.url)),
  ]);
  return readPackageJsonVersion(packageJsonPath);
}

function createCodexPluginPackageManifest(context: HarnessRenderContext): {
  name: string;
  version: string;
  description: string;
} {
  return {
    name: 'thoth-agents',
    version: readRootPackageVersion(context),
    description:
      'Adaptive multi-harness agent pack with ten roles and Spec Kit-compatible SDD coordination.',
  };
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
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

type CodexSubagentName = keyof typeof CONFIRMED_OPENAI_SUBAGENT_PRESET;

function isCodexSubagentName(name: string): name is CodexSubagentName {
  return name in CONFIRMED_OPENAI_SUBAGENT_PRESET;
}

const CODEX_ROOT_START = '<!-- thoth-agents:codex-root:start -->';
const CODEX_ROOT_END = '<!-- thoth-agents:codex-root:end -->';

export const CODEX_CAPABILITIES: HarnessCapabilities =
  CODEX_PROMPT_DIALECT.capabilities.capabilities;

function codexRuntimeGuidance(): string {
  return [
    '<codex-runtime>',
    '- The ambient Codex session is the adaptive root; no orchestrator child TOML is generated.',
    '- Delegate with `collaboration.spawn_agent` only when the root determines that specialization, context isolation, review, or independent parallel work creates a net gain.',
    '- Collaboration tools are direct tools and must not be called from inside `functions.exec`.',
    '- Use a role-prefixed `task_name` and a self-contained English `message` with scope, anchors, constraints, verification, and the compact return contract. The current collaboration surface has no hard custom-role selector, so role selection remains instruction-level.',
    '- Keep maximum depth 1: children do not delegate. Use one writer per mutable surface and parallelize only independent work.',
    '- A `collaboration.wait_agent` timeout is nonterminal; inspect `collaboration.list_agents` for the same task before rerouting or interrupting it.',
    '- Use `request_user_input` only for blocking material choices and always omit `autoResolutionMs` entirely.',
    '- Generated custom-agent TOMLs carry model and sandbox defaults, but permissions and role matching may remain instruction-level in the active host.',
    '- Installed provider guidance owns memory, persistence, hooks, MCP lifecycle, and recovery mechanics.',
    '</codex-runtime>',
  ].join('\n');
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
    `- ${role.name} runs as a Codex custom-agent TOML entry; the orchestrator remains the ambient Codex root session, not a generated role TOML.`,
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
    renderConfiguredRolePrompt({
      role: role.name,
      dialect: CODEX_PROMPT_DIALECT,
      config,
      model,
    }),
    codexRoleInstructions(role),
    renderMemoryGovernanceInstructions(role, CODEX_PROMPT_DIALECT),
  ].join('\n\n');
}

export function renderCodexRootInstructions(config?: PluginConfig): string {
  const rootOverride = getAgentOverride(config, 'orchestrator');
  const rootPrompt = renderConfiguredRolePrompt({
    role: 'orchestrator',
    dialect: CODEX_PROMPT_DIALECT,
    config,
    model: rootOverride?.model ?? DEFAULT_MODELS.orchestrator,
  });

  return [
    CODEX_ROOT_START,
    rootPrompt,
    codexRuntimeGuidance(),
    CODEX_ROOT_END,
    '',
  ].join('\n');
}

function getCodexAgentModel(
  role: AgentRoleContract,
  config?: PluginConfig,
): string | undefined {
  if (!isCodexSubagentName(role.name)) return undefined;

  return (
    getPrimaryModelId(config?.agents?.[role.name]?.model) ??
    CONFIRMED_OPENAI_SUBAGENT_PRESET[role.name].model
  );
}

function getCodexAgentEffort(
  role: AgentRoleContract,
  config?: PluginConfig,
): string | undefined {
  if (!isCodexSubagentName(role.name)) return undefined;
  if (getPrimaryModelId(config?.agents?.[role.name]?.model)) return undefined;
  return CONFIRMED_OPENAI_SUBAGENT_PRESET[role.name].effort;
}

function hasCodexConfig(
  context: HarnessRenderContext,
): context is CodexRenderContext {
  return 'config' in context;
}

function hasCodexPackageRoot(
  context: HarnessRenderContext,
): context is CodexRenderContext & { packageRoot: string } {
  return (
    'packageRoot' in context &&
    typeof context.packageRoot === 'string' &&
    context.packageRoot.length > 0
  );
}

function renderAgentArtifacts({ config }: { config?: PluginConfig }): {
  artifacts: HarnessArtifact[];
  diagnostics: HarnessDiagnostic[];
} {
  const artifacts: HarnessArtifact[] = [];
  const diagnostics: HarnessDiagnostic[] = [];
  for (const role of getAgentPackContract().roles.filter(
    (candidate) => candidate.name !== 'orchestrator',
  )) {
    const model = getCodexAgentModel(role, config);
    const effort = getCodexAgentEffort(role, config);
    const toml = renderCodexToml({
      surfaceId: 'project-agent-toml',
      values: {
        name: role.name,
        description: role.responsibility,
        developer_instructions: roleInstructions(role, config),
        ...(model ? { model } : {}),
        ...(effort ? { model_reasoning_effort: effort } : {}),
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
        description:
          'Codex MCP configuration snippet for unrelated integrations.',
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

export const codexAdapter: HarnessAdapter = {
  id: 'codex',
  displayName: 'Codex',
  capabilities: CODEX_CAPABILITIES,
  render(context: HarnessRenderContext): HarnessRenderResult {
    const config = hasCodexConfig(context) ? context.config : undefined;
    const agentArtifacts = renderAgentArtifacts({ config });
    const configArtifacts = renderConfigArtifacts();
    const pluginPackage = renderCodexPluginPackage({
      manifest: createCodexPluginPackageManifest(context),
      assets: [
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
      ],
      diagnostics: [
        ...agentArtifacts.diagnostics,
        ...configArtifacts.diagnostics,
        ...pluginPackage.diagnostics,
        ...hookReadinessDiagnostics(),
        ...capabilityDiagnostics(),
      ],
    };
  },
};
