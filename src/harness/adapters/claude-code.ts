import { fileURLToPath } from 'node:url';
import {
  CLAUDE_CODE_PROMPT_DIALECT,
  CLAUDE_CODE_SUBAGENT_NAMESPACE,
  claudeCodeSubagentType,
} from '../../agents/prompt-dialects';
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
  getPrimaryModelId,
  loadAgentPrompt,
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
import { getSkillRegistry } from '../core/skills';
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
import { renderClaudeCodeSkillLayout } from '../writers/claude-code-skill-layout';
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

function claudeCodePromptSections(
  roleName: AgentRoleName,
): RolePromptSection[] {
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

function claudeCodeModelFamilyPromptSection(
  roleName: AgentRoleName,
  model?: AgentOverrideConfig['model'] | string,
): string | undefined {
  const section = createModelFamilySection(roleName, model);

  return section
    ? renderPromptSection(section, CLAUDE_CODE_PROMPT_DIALECT)
    : undefined;
}

function claudeCodeStepBudgetPromptSection(steps?: number): string | undefined {
  const section = createStepBudgetSection(steps);

  return section
    ? renderPromptSection(section, CLAUDE_CODE_PROMPT_DIALECT)
    : undefined;
}

function renderClaudeCodeRolePrompt(
  roleName: AgentRoleName,
  config?: PluginConfig,
  model?: AgentOverrideConfig['model'] | string,
): string {
  const promptOverrides = loadAgentPrompt(roleName, config?.preset);
  const override = getAgentOverride(config, roleName);
  const basePrompt = renderRolePrompt(
    claudeCodePromptSections(roleName),
    CLAUDE_CODE_PROMPT_DIALECT,
  );
  const prompt = composeAgentPrompt({
    basePrompt,
    customPrompt: promptOverrides.prompt,
    customAppendPrompt: appendPromptSections(
      claudeCodeModelFamilyPromptSection(roleName, model),
      promptOverrides.appendPrompt,
    ),
  });

  return appendPromptSections(
    prompt,
    claudeCodeStepBudgetPromptSection(override?.steps),
  );
}

function claudeCodeRoleInstructions(role: AgentRoleContract): string {
  return [
    '<role-operational-contract>',
    `- Role: ${role.name}`,
    `- Mode: ${role.mode}`,
    `- Scope: ${role.scope}`,
    `- Responsibility: ${role.responsibility}`,
    '- Use AskUserQuestion for local blocking decisions.',
    `- ${role.name} runs as an auto-discovered Claude Code plugin subagent invoked via Task(subagent_type: ${claudeCodeSubagentType(role.name)}); plugin subagents are namespaced with the plugin name. The orchestrator is the main Claude Code session.`,
    "- This subagent inherits ALL of the main thread's tools, including MCP servers (thoth-mem, context7, exa, grep_app); read-only roles (explorer, librarian, oracle) MUST NOT mutate the workspace per this operational contract (instruction-level, not tooling-enforced).",
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
    renderClaudeCodeRolePrompt(role.name, config, model),
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
  const rootPrompt = renderClaudeCodeRolePrompt(
    'orchestrator',
    config,
    rootOverride?.model ?? DEFAULT_MODELS.orchestrator,
  );
  const specialists = getAgentPackContract()
    .roles.filter((role) => role.name !== 'orchestrator')
    .map((role) => claudeCodeSubagentType(role.name))
    .join(', ');

  return [
    rootPrompt,
    '<claude-code-runtime>',
    '- You ARE the Claude Code main-thread agent: the delegate-first root coordinator. This is your system prompt (activated via the plugin settings.json `agent` key), so orchestrator-only and root-owned rules apply to you directly.',
    '- As your FIRST action on a new session, when thoth-mem tools are installed and session/project identity is known, call mem_session(action="start") as step 0 before any other thoth-mem call, then save the real user prompt with mem_save(kind="prompt") before later delegation.',
    "- thoth-mem tools are provided by this plugin's bundled MCP server and are exposed under a plugin namespace; call the available namespaced tool whose name ends in mem_session, mem_recall, mem_context, mem_save, mem_get, or mem_project (do not assume a bare, unnamespaced tool name).",
    '- If thoth-mem tools or identity values are unavailable, disclose that memory bootstrap could not run and continue without claiming memory was saved.',
    `- Delegate via the Task tool with \`subagent_type\` set to a plugin-namespaced specialist: ${specialists}. Bare role names (e.g. "explorer") are NOT valid in this harness — always use the ${CLAUDE_CODE_SUBAGENT_NAMESPACE}: prefix.`,
    '- Parallel delegation is supported: issue multiple Task calls in one turn for independent work.',
    '- Before delegating after meaningful context changes, refresh the handoff body with root-owned mem_session(action="summary") or mem_save(kind="session_summary") when available.',
    '- Use AskUserQuestion for blocking user decisions; do not ask those questions in plain prose.',
    '- Track progress with TodoWrite; subagents do not own progress checkboxes or root-only memory.',
    '- Subagents inherit all of your tools (including MCP servers); role permissions are instruction-level, so read-only roles (explorer, librarian, oracle) must not mutate the workspace per their operational contract.',
    '</claude-code-runtime>',
  ].join('\n');
}

function claudeCodeMcpServers(): Record<string, unknown> {
  const [exaCommand = '', ...exaArgs] = exa.command;
  const [thothCommand = '', ...thothArgs] = DEFAULT_THOTH_COMMAND;

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
    thoth_mem: {
      command: thothCommand,
      ...(thothArgs.length > 0 ? { args: thothArgs } : {}),
    },
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
      'Delegate-first agent pack with seven roles, thoth-mem persistence, and bundled SDD skills, packaged for Claude Code.',
    author: { name: 'thoth-agents' },
  };
}

function renderSubagentArtifacts(config?: PluginConfig): HarnessArtifact[] {
  const artifacts: HarnessArtifact[] = [];

  for (const role of getAgentPackContract().roles.filter(
    (candidate) => candidate.name !== 'orchestrator',
  )) {
    // Omit `tools` for every subagent so each inherits ALL of the main thread's
    // tools, including MCP servers (thoth-mem, context7, exa, grep_app). A
    // `tools` allowlist in Claude Code would restrict the subagent to exactly
    // that list and exclude MCP tools, so read-only enforcement is now
    // instruction-level via each role's operational contract.
    const content = renderClaudeCodeSubagent({
      name: role.name,
      description: role.responsibility,
      model: getClaudeCodeAgentModel(role, config),
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
      'Delegate-first root coordinator for SDD workflow and specialist dispatch.',
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

    const skillLayout = renderClaudeCodeSkillLayout({
      projectRoot: context.projectRoot,
      ...(hasPackageRoot(context) ? { packageRoot: context.packageRoot } : {}),
      skills: getSkillRegistry(),
    });
    componentArtifacts.push(...skillLayout.artifacts);

    const pluginPackage = renderClaudeCodePluginPackage({
      manifest: createPluginManifest(context),
      componentArtifacts,
    });

    return {
      harness: 'claude',
      artifacts: pluginPackage.artifacts,
      diagnostics: [...skillLayout.diagnostics, ...pluginPackage.diagnostics],
    };
  },
};
