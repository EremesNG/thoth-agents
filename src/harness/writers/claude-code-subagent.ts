export type ClaudeCodeModel = 'sonnet' | 'opus' | 'haiku' | 'inherit';

/** The model aliases Claude Code accepts in subagent frontmatter. */
export const CLAUDE_CODE_MODELS = [
  'sonnet',
  'opus',
  'haiku',
  'inherit',
] as const satisfies readonly ClaudeCodeModel[];

export function isClaudeCodeModel(value: string): value is ClaudeCodeModel {
  return (CLAUDE_CODE_MODELS as readonly string[]).includes(value);
}

export interface ClaudeCodeSubagentInput {
  /** Subagent name; also the `subagent_type` used by the Agent tool. */
  name: string;
  /** When the orchestrator should delegate to this subagent. */
  description: string;
  /**
   * Comma-separated tool allowlist. This is the Claude Code mechanism that
   * enforces role permissions (read-only vs write-capable). Omit to inherit all
   * tools — used by the orchestrator main-thread agent, which must keep Task,
   * AskUserQuestion, TodoWrite, MCP, and edit tools.
   */
  tools?: string;
  /** Tool denylist; preserves inherited tools, including MCP tools. */
  disallowedTools?: string;
  /** Per-role model alias for the subagent frontmatter. */
  model: ClaudeCodeModel;
  /** Optional Claude Code reasoning effort for the selected model. */
  effort?: string;
  /** Rendered system prompt body (role prompt + governance). */
  instructions: string;
}

/**
 * Serialize a single value for a YAML frontmatter scalar. Strings that contain
 * characters with YAML significance are double-quoted and escaped so the
 * frontmatter parses deterministically.
 */
function yamlScalar(value: string): string {
  const needsQuoting = /[:#\-?*&!|>'"%@`{}[\],]|^\s|\s$|^$/.test(value);
  if (!needsQuoting) return value;
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Render a Claude Code subagent file: deterministic YAML frontmatter plus the
 * markdown system-prompt body. Auto-discovered from a plugin `agents/` directory.
 */
export function renderClaudeCodeSubagent(
  input: ClaudeCodeSubagentInput,
): string {
  const frontmatter = [
    '---',
    `name: ${yamlScalar(input.name)}`,
    `description: ${yamlScalar(input.description)}`,
    `model: ${input.model}`,
    ...(input.effort !== undefined ? [`effort: ${input.effort}`] : []),
    ...(input.tools !== undefined ? [`tools: ${yamlScalar(input.tools)}`] : []),
    ...(input.disallowedTools !== undefined
      ? [`disallowedTools: ${yamlScalar(input.disallowedTools)}`]
      : []),
    '---',
  ].join('\n');

  const body = input.instructions.trimEnd();

  return `${frontmatter}\n\n${body}\n`;
}
