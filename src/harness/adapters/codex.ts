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
import { renderCodexHookScript } from '../codex-hook-script';
import {
  type AgentRoleContract,
  getAgentPackContract,
  renderAgentRoutingDescription,
} from '../core/agent-pack';
import { memoryGovernanceDiagnostics } from '../core/memory-governance';
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
import { LEGACY_CODEX_AGENT_ARTIFACTS } from './codex-legacy-agents';
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
      'Bundled AI-first work skills and MCP configuration; the six-role global Codex layer requires thoth-agents CLI setup.',
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
    '- The ambient session is root; no orchestrator TOML. Use collaboration tools directly, never inside `functions.exec`.',
    '- Set `spawn_agent.agent_type` to the selected canonical role; always set `fork_turns: "none"`.',
    '- Bound parallel spawns by observed availability: never exceed free native capacity; refill as children complete. The thread limit is fixed per session, not guaranteed by config.',
    '- On `agent thread limit reached`, inspect `list_agents`; prefer allowed reuse or wait for a running child to finish; report the limit truthfully; never execute delegated work inline.',
    '- A `wait_agent` timeout is nonterminal; inspect `list_agents` for the same task before rerouting or interrupting.',
    '- For blocking choices use `request_user_input`; omit `autoResolutionMs` entirely.',
    '- TOMLs carry model/sandbox defaults; permissions and role matching may be instruction-level. Installed provider guidance owns memory, persistence, hooks, MCP and recovery.',
    '</codex-runtime>',
  ].join('\n');
}

function codexRoleInstructions(role: AgentRoleContract): string {
  return [
    '<role-operational-contract>',
    '- Permissions, memory governance, runtime hooks, and provider-per-agent controls are instruction-level unless the active Codex runtime documents stronger enforcement.',
    `- ${role.name} runs as a Codex custom-agent TOML entry; the orchestrator remains the ambient Codex root session, not a generated role TOML.`,
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
  ].join('\n\n');
}

function codexRootPayload(config?: PluginConfig): string {
  const rootOverride = getAgentOverride(config, 'orchestrator');
  const rootPrompt = renderConfiguredRolePrompt({
    role: 'orchestrator',
    dialect: CODEX_PROMPT_DIALECT,
    config,
    model: rootOverride?.model ?? DEFAULT_MODELS.orchestrator,
  });

  return [rootPrompt, codexRuntimeGuidance()].join('\n');
}

export function renderCodexRootInstructions(config?: PluginConfig): string {
  return [CODEX_ROOT_START, codexRootPayload(config), CODEX_ROOT_END, ''].join(
    '\n',
  );
}

function codexHookPackage(config?: PluginConfig) {
  // These exact role names also populate the TOML name field, not the TOML filenames.
  const roles = getAgentPackContract().roles.filter(
    (role) => role.name !== 'orchestrator',
  );
  const command = `node -e "require(require('path').join(process.env.PLUGIN_ROOT,'codex-hooks','context.cjs'))"`;
  const gateCommand = `node -e "import(require('url').pathToFileURL(require('path').join(process.env.PLUGIN_ROOT,'thoth-hooks','gate-verdict.mjs')).href)"`;
  const handler = {
    type: 'command',
    command,
    commandWindows: command,
    timeout: 10,
    additionalContextLimit: 0,
  };
  return {
    asset: {
      surfaceId: 'plugin-hooks-json',
      manifestField: 'hooks',
      path: '.codex-plugin/codex-hooks/hooks.json',
      hookDefinitions: [
        {
          event: 'SessionStart',
          matcher: '^(startup|resume|clear|compact)$',
          handler,
          outputFields: ['additionalContext'],
        },
        {
          event: 'SubagentStart',
          matcher: `^(${roles.map((role) => role.name).join('|')})$`,
          handler,
          outputFields: ['additionalContext'],
        },
        {
          event: 'PostToolUse',
          matcher: '^(multi_agent_v1)?wait_agent$',
          handler: {
            ...handler,
            command: gateCommand,
            commandWindows: gateCommand,
          },
          outputFields: ['additionalContext'],
        },
      ],
    },
    files: [
      {
        path: '.codex-plugin/codex-hooks/context.cjs',
        content: renderCodexHookScript(roles.map((role) => role.name)),
      },
      {
        path: '.codex-plugin/codex-hooks/payloads/root.md',
        content: codexRootPayload(config),
      },
      ...roles.map((role) => ({
        path: `.codex-plugin/codex-hooks/payloads/${role.name}.md`,
        content: `These are the authoritative ${role.name} instructions; they supersede any inherited orchestrator context.\n\n${roleInstructions(role, config)}`,
      })),
    ],
  };
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

/** @internal Exact pre-hook rendering, retained only for ownership attribution. */
export function renderLegacyCodexAgentArtifacts(): HarnessArtifact[] {
  return LEGACY_CODEX_AGENT_ARTIFACTS.map((artifact) => ({ ...artifact }));
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
        description: renderAgentRoutingDescription(role),
        developer_instructions:
          'Role instructions are delivered as developer context at session start by the thoth-agents plugin hook.',
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

function capabilityDiagnostics({
  includeHooks,
}: {
  includeHooks: boolean;
}): HarnessDiagnostic[] {
  const surfaceDiagnostics = getCodexSurfaceRecords()
    .filter(
      (surface) =>
        surface.status !== 'validated' &&
        (includeHooks || surface.target !== 'hook-config'),
    )
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
    const hooks = codexHookPackage(config);
    const pluginPackage = renderCodexPluginPackage({
      hookFiles: hooks.files,
      manifest: createCodexPluginPackageManifest(context),
      assets: [
        hooks.asset,
        {
          surfaceId: 'plugin-skills-directory',
          manifestField: 'skills',
          path: '.codex-plugin/skills/',
          description: 'Codex plugin-bundled skill directory.',
        },
        {
          surfaceId: 'plugin-mcp-json',
          manifestField: 'mcpServers',
          path: '.codex-plugin/codex.mcp.json',
          description: 'Codex plugin-bundled MCP server definitions.',
          content: stableJson(createCodexBuiltinMcpJsonConfig()),
        },
      ],
    });
    const hasPackagedHooks = pluginPackage.artifacts.some(
      (artifact) => artifact.kind === 'hook-config',
    );

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
        ...(hasPackagedHooks ? hookReadinessDiagnostics() : []),
        ...capabilityDiagnostics({ includeHooks: hasPackagedHooks }),
      ],
    };
  },
};
