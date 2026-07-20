import { fileURLToPath } from 'node:url';
import { renderConfiguredRolePrompt } from '../../agents/configured-role-prompt';
import {
  CLAUDE_CODE_PROMPT_DIALECT,
  CLAUDE_CODE_SUBAGENT_NAMESPACE,
  claudeCodeSubagentType,
} from '../../agents/prompt-dialects';
import {
  DEFAULT_MODELS,
  getAgentOverride,
  getPrimaryModelId,
  type PluginConfig,
} from '../../config';
import { CONTEXT7_MCP_URL } from '../../mcp/context7';
import { exa } from '../../mcp/exa';
import { GREP_APP_MCP_URL } from '../../mcp/grep-app';
import {
  type AgentRoleContract,
  type AgentRoleName,
  getAgentPackContract,
} from '../core/agent-pack';
import { renderMemoryGovernanceInstructions } from '../core/memory-governance';
import {
  findRootPackageJsonPath,
  readPackageJsonVersion,
} from '../core/package-version';
import type {
  HarnessAdapter,
  HarnessArtifact,
  HarnessCapabilities,
  HarnessRenderContext,
  HarnessRenderResult,
} from '../types';
import {
  type ClaudeCodePluginManifest,
  renderClaudeCodePluginPackage,
} from '../writers/claude-code-plugin-package';
import {
  type ClaudeCodeModel,
  isClaudeCodeModel,
  renderClaudeCodeSubagent,
} from '../writers/claude-code-subagent';

export interface ClaudeCodeRenderContext extends HarnessRenderContext {
  config?: PluginConfig;
  packageRoot?: string;
}

export const CLAUDE_CODE_CAPABILITIES: HarnessCapabilities =
  CLAUDE_CODE_PROMPT_DIALECT.capabilities.capabilities;

export const CLAUDE_CODE_SUBAGENT_DEFAULT_MODELS = {
  explorer: 'haiku',
  librarian: 'sonnet',
  oracle: 'opus',
  designer: 'sonnet',
  quick: 'haiku',
  deep: 'sonnet',
} as const satisfies Record<
  Exclude<AgentRoleName, 'orchestrator'>,
  ClaudeCodeModel
>;

type ClaudeCodeSubagentName = keyof typeof CLAUDE_CODE_SUBAGENT_DEFAULT_MODELS;

function isClaudeCodeSubagentName(
  name: string,
): name is ClaudeCodeSubagentName {
  return name in CLAUDE_CODE_SUBAGENT_DEFAULT_MODELS;
}

function getClaudeCodeAgentModel(
  role: AgentRoleContract,
  config?: PluginConfig,
): ClaudeCodeModel {
  if (!isClaudeCodeSubagentName(role.name)) return 'inherit';

  const override = getPrimaryModelId(config?.agents?.[role.name]?.model);
  if (override && isClaudeCodeModel(override)) return override;

  return CLAUDE_CODE_SUBAGENT_DEFAULT_MODELS[role.name];
}

function claudeCodeRoleInstructions(role: AgentRoleContract): string {
  return [
    '<role-operational-contract>',
    `- Role: ${role.name}`,
    `- Mode: ${role.mode}`,
    `- Scope: ${role.scope}`,
    `- Responsibility: ${role.responsibility}`,
    '- Use AskUserQuestion for local blocking decisions.',
    `- ${role.name} runs as an auto-discovered Claude Code plugin subagent invoked via Agent(subagent_type: ${claudeCodeSubagentType(role.name)}); plugin subagents are namespaced with the plugin name. The orchestrator is the main Claude Code session.`,
    ...(role.mode === 'read-only'
      ? [
          '- Write and Edit are denied in frontmatter while all other inherited tools, including MCP tools, remain available.',
        ]
      : []),
    ...role.toolGovernance.map((rule) => `- ${rule}`),
    ...role.verification.map((rule) => `- ${rule}`),
    '</role-operational-contract>',
  ].join('\n');
}

function roleInstructions(
  role: AgentRoleContract,
  config?: PluginConfig,
): string {
  const model = getClaudeCodeAgentModel(role, config);

  return [
    renderConfiguredRolePrompt({
      role: role.name,
      dialect: CLAUDE_CODE_PROMPT_DIALECT,
      config,
      model,
    }),
    claudeCodeRoleInstructions(role),
    renderMemoryGovernanceInstructions(role, CLAUDE_CODE_PROMPT_DIALECT),
  ].join('\n\n');
}

/**
 * The orchestrator system prompt body. This is the system prompt of the
 * `orchestrator` plugin agent, which the plugin `settings.json` activates as the
 * Claude Code main thread (`{"agent":"orchestrator"}`) — replacing the default
 * system prompt entirely, which is far stronger than a SessionStart
 * additionalContext injection.
 */
export function renderClaudeCodeRootInstructions(
  config?: PluginConfig,
): string {
  const rootOverride = getAgentOverride(config, 'orchestrator');
  const rootPrompt = renderConfiguredRolePrompt({
    role: 'orchestrator',
    dialect: CLAUDE_CODE_PROMPT_DIALECT,
    config,
    model: rootOverride?.model ?? DEFAULT_MODELS.orchestrator,
  });
  const specialists = getAgentPackContract()
    .roles.filter((role) => role.name !== 'orchestrator')
    .map((role) => claudeCodeSubagentType(role.name))
    .join(', ');

  return [
    rootPrompt,
    '<claude-code-runtime>',
    '- You are the Claude Code adaptive root activated by plugin settings.json.',
    `- Delegate only for net gain through Agent with \`subagent_type\` set to one of these plugin-namespaced specialists: ${specialists}. Always keep the ${CLAUDE_CODE_SUBAGENT_NAMESPACE}: prefix.`,
    '- Subagents cannot delegate further. Parallelize only independent work and maintain one writer per mutable surface.',
    '- Read-only roles deny Write and Edit while retaining other inherited tools, including MCP tools. Coordination-agent path scope remains instruction-level.',
    '- Use AskUserQuestion only for blocking material choices and TodoWrite only for genuine multi-step progress.',
    '- Installed provider guidance owns memory, persistence, hooks, MCP lifecycle, and recovery mechanics.',
    '</claude-code-runtime>',
  ].join('\n');
}

function claudeCodeMcpServers(): Record<string, unknown> {
  const [exaCommand = '', ...exaArgs] = exa.command;
  return {
    exa: {
      command: exaCommand,
      ...(exaArgs.length > 0 ? { args: exaArgs } : {}),
      ...(exa.environment && Object.keys(exa.environment).length > 0
        ? { env: exa.environment }
        : {}),
    },
    context7: { type: 'http', url: CONTEXT7_MCP_URL },
    grep_app: { type: 'http', url: GREP_APP_MCP_URL },
  };
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readRootPackageVersion(context: HarnessRenderContext): string {
  const packageJsonPath = findRootPackageJsonPath([
    ...(hasPackageRoot(context) ? [context.packageRoot] : []),
    context.projectRoot,
    process.cwd(),
    fileURLToPath(new URL('.', import.meta.url)),
  ]);
  return readPackageJsonVersion(packageJsonPath);
}

function hasConfig(
  context: HarnessRenderContext,
): context is ClaudeCodeRenderContext {
  return 'config' in context;
}

function hasPackageRoot(
  context: HarnessRenderContext,
): context is ClaudeCodeRenderContext & { packageRoot: string } {
  return (
    'packageRoot' in context &&
    typeof context.packageRoot === 'string' &&
    context.packageRoot.length > 0
  );
}

function createPluginManifest(
  context: HarnessRenderContext,
): ClaudeCodePluginManifest {
  return {
    name: 'thoth-agents',
    version: readRootPackageVersion(context),
    description:
      'Adaptive multi-harness agent pack with seven roles and a runtime-autonomous Spec Kit-compatible SDD bundle for Claude Code.',
    author: { name: 'thoth-agents' },
  };
}

function renderSubagentArtifacts(config?: PluginConfig): HarnessArtifact[] {
  const artifacts: HarnessArtifact[] = [];

  for (const role of getAgentPackContract().roles.filter(
    (candidate) => candidate.name !== 'orchestrator',
  )) {
    // A denylist preserves inherited MCP tools while enforcing read-only roles.
    // Coordination agents need Edit/Write, so their openspec/ path scope remains
    // instruction-level.
    const content = renderClaudeCodeSubagent({
      name: role.name,
      description: role.responsibility,
      model: getClaudeCodeAgentModel(role, config),
      ...(role.mode === 'read-only' ? { disallowedTools: 'Write, Edit' } : {}),
      instructions: roleInstructions(role, config),
    });

    artifacts.push({
      harness: 'claude',
      kind: 'agent-config',
      path: `agents/${role.name}.md`,
      description: `Claude Code subagent definition for ${role.name}.`,
      content,
    });
  }

  return artifacts;
}

function renderOrchestratorArtifact(config?: PluginConfig): HarnessArtifact {
  const orchestrator = getAgentPackContract().roles.find(
    (role) => role.name === 'orchestrator',
  );

  // The orchestrator agent is activated as the Claude Code main thread via the
  // plugin settings.json `agent` key, so its frontmatter MUST omit `tools` to
  // inherit every tool (Task, AskUserQuestion, TodoWrite, MCP, edit tools) and
  // uses `inherit` so it keeps the user's chosen session model.
  const content = renderClaudeCodeSubagent({
    name: 'orchestrator',
    description:
      orchestrator?.responsibility ??
      'Adaptive root coordinator for direct work, SDD routing, and specialist dispatch.',
    model: 'inherit',
    instructions: renderClaudeCodeRootInstructions(config),
  });

  return {
    harness: 'claude',
    kind: 'agent-config',
    path: 'agents/orchestrator.md',
    description:
      'Claude Code orchestrator agent, activated as the main thread via settings.json.',
    content,
  };
}

export const claudeCodeAdapter: HarnessAdapter = {
  id: 'claude',
  displayName: 'Claude Code',
  capabilities: CLAUDE_CODE_CAPABILITIES,
  render(context: HarnessRenderContext): HarnessRenderResult {
    const config = hasConfig(context) ? context.config : undefined;

    const componentArtifacts: HarnessArtifact[] = [
      ...renderSubagentArtifacts(config),
      renderOrchestratorArtifact(config),
      {
        harness: 'claude',
        kind: 'mcp-config',
        path: '.mcp.json',
        description: 'Claude Code plugin-bundled MCP server definitions.',
        content: stableJson({ mcpServers: claudeCodeMcpServers() }),
      },
      {
        harness: 'claude',
        kind: 'harness-config',
        path: 'settings.json',
        description:
          'Activates the orchestrator agent as the Claude Code main thread.',
        content: stableJson({ agent: 'orchestrator' }),
      },
    ];

    const pluginPackage = renderClaudeCodePluginPackage({
      manifest: createPluginManifest(context),
      componentArtifacts,
    });

    return {
      harness: 'claude',
      artifacts: pluginPackage.artifacts,
      diagnostics: pluginPackage.diagnostics,
    };
  },
};
