import { fileURLToPath } from 'node:url';
import { CLAUDE_CODE_PROMPT_DIALECT } from '../../agents/prompt-dialects';
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

const CLAUDE_CODE_ROOT_START = '<!-- thoth-agents:claude-code-root:start -->';
const CLAUDE_CODE_ROOT_END = '<!-- thoth-agents:claude-code-root:end -->';

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

const READ_ONLY_ROLE_TOOLS: Record<string, string> = {
  explorer: 'Read, Grep, Glob',
  librarian: 'Read, Grep, Glob, WebSearch, WebFetch',
  oracle: 'Read, Grep, Glob',
};

const WRITE_CAPABLE_ROLE_TOOLS = 'Read, Edit, Write, Bash, Grep, Glob';

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

function toolsForRole(role: AgentRoleContract): string {
  if (role.canMutateWorkspace) return WRITE_CAPABLE_ROLE_TOOLS;
  return READ_ONLY_ROLE_TOOLS[role.name] ?? 'Read, Grep, Glob';
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
    `- ${role.name} runs as an auto-discovered Claude Code subagent invoked via Task(subagent_type: ${role.name}); the orchestrator is the main Claude Code session, not a generated subagent.`,
    "- Role permissions are enforced by this subagent's frontmatter `tools` allowlist; read-only roles cannot mutate the workspace.",
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

export function renderClaudeCodeRootInstructions(
  config?: PluginConfig,
): string {
  const rootOverride = getAgentOverride(config, 'orchestrator');
  const rootPrompt = renderClaudeCodeRolePrompt(
    'orchestrator',
    config,
    rootOverride?.model ?? DEFAULT_MODELS.orchestrator,
  );

  return [
    CLAUDE_CODE_ROOT_START,
    rootPrompt,
    '<claude-code-runtime>',
    '- The main Claude Code session is the delegate-first root coordinator; orchestrator-only and root-owned instructions apply to it because Claude Code does not generate a selectable orchestrator subagent.',
    '- Delegate by calling the Task tool with `subagent_type` set to one of explorer, librarian, oracle, designer, quick, or deep; these are auto-discovered plugin subagents.',
    '- Parallel delegation is supported: issue multiple Task calls in one turn for independent work.',
    '- On each new session, when thoth-mem tools are installed and session/project identity is known, call mem_session(action="start") as step 0 before any other thoth-mem call, then save the real user prompt with mem_save(kind="prompt") before later delegation.',
    '- If thoth-mem tools or identity values are unavailable, disclose that memory bootstrap could not run and continue without claiming memory was saved.',
    '- Before delegating after meaningful context changes, refresh the handoff body with root-owned mem_session(action="summary") or mem_save(kind="session_summary") when available.',
    '- Use AskUserQuestion for blocking user decisions; do not ask those questions in plain prose.',
    '- Track progress with TodoWrite; subagents do not own progress checkboxes or root-only memory.',
    "- Role permissions are enforced at runtime by each subagent's frontmatter `tools` allowlist.",
    '</claude-code-runtime>',
    CLAUDE_CODE_ROOT_END,
    '',
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

const ROOT_INSTRUCTIONS_FILE = 'hooks/root-instructions.md';
const ROOT_INJECTOR_FILE = 'hooks/inject-root-instructions.mjs';

const ROOT_INJECTOR_SCRIPT = `import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Claude Code SessionStart hook: inject the thoth-agents root coordinator
// instructions into the main session as additionalContext. A plugin cannot edit
// the user's CLAUDE.md, so this is the supported delivery mechanism.
const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, 'root-instructions.md'), 'utf8');

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: text,
    },
  }),
);
`;

function claudeCodeHooksConfig(): Record<string, unknown> {
  return {
    hooks: {
      SessionStart: [
        {
          matcher: 'startup|resume|clear|compact',
          hooks: [
            {
              type: 'command',
              command: `node "\${CLAUDE_PLUGIN_ROOT}/${ROOT_INJECTOR_FILE}"`,
            },
          ],
        },
      ],
    },
  };
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
    const content = renderClaudeCodeSubagent({
      name: role.name,
      description: role.responsibility,
      tools: toolsForRole(role),
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

export const claudeCodeAdapter: HarnessAdapter = {
  id: 'claude',
  displayName: 'Claude Code',
  capabilities: CLAUDE_CODE_CAPABILITIES,
  render(context: HarnessRenderContext): HarnessRenderResult {
    const config = hasConfig(context) ? context.config : undefined;

    const componentArtifacts: HarnessArtifact[] = [
      ...renderSubagentArtifacts(config),
      {
        harness: 'claude',
        kind: 'mcp-config',
        path: '.mcp.json',
        description: 'Claude Code plugin-bundled MCP server definitions.',
        content: stableJson({ mcpServers: claudeCodeMcpServers() }),
      },
      {
        harness: 'claude',
        kind: 'hook-config',
        path: 'hooks/hooks.json',
        description:
          'Claude Code plugin hooks: SessionStart root coordinator injection.',
        content: stableJson(claudeCodeHooksConfig()),
      },
      {
        harness: 'claude',
        kind: 'hook-config',
        path: ROOT_INJECTOR_FILE,
        description:
          'SessionStart hook script that emits the root coordinator instructions as additionalContext.',
        content: ROOT_INJECTOR_SCRIPT,
      },
      {
        harness: 'claude',
        kind: 'documentation',
        path: ROOT_INSTRUCTIONS_FILE,
        description: 'Rendered thoth-agents root coordinator instructions.',
        content: renderClaudeCodeRootInstructions(config),
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
