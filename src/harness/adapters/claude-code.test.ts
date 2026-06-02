import { describe, expect, test } from 'vitest';
import type { HarnessArtifact } from '../types';
import {
  CLAUDE_CODE_CAPABILITIES,
  claudeCodeAdapter,
  renderClaudeCodeRootInstructions,
} from './claude-code';

function render() {
  return claudeCodeAdapter.render({ projectRoot: process.cwd() });
}

function artifact(
  artifacts: HarnessArtifact[],
  suffix: string,
): HarnessArtifact | undefined {
  return artifacts.find((entry) => entry.path.endsWith(suffix));
}

describe('claudeCodeAdapter', () => {
  test('is a first-class adapter with all capabilities supported', () => {
    expect(claudeCodeAdapter.id).toBe('claude');
    expect(claudeCodeAdapter.displayName).toBe('Claude Code');
    for (const status of Object.values(CLAUDE_CODE_CAPABILITIES)) {
      expect(status).toBe('supported');
    }
  });

  test('renders six specialist subagents plus an orchestrator agent', () => {
    const { artifacts } = render();
    const agents = artifacts
      .filter((entry) => entry.kind === 'agent-config')
      .map((entry) => entry.path);

    expect(agents).toEqual([
      'agents/deep.md',
      'agents/designer.md',
      'agents/explorer.md',
      'agents/librarian.md',
      'agents/oracle.md',
      'agents/orchestrator.md',
      'agents/quick.md',
    ]);
  });

  test('orchestrator agent inherits all tools and is activated as the main thread', () => {
    const { artifacts } = render();
    const orchestrator = String(
      artifact(artifacts, 'agents/orchestrator.md')?.content,
    );

    // No `tools:` frontmatter line → inherits every tool (Task, AskUserQuestion,
    // TodoWrite, MCP, edit tools).
    expect(orchestrator).not.toMatch(/^tools:/m);
    expect(orchestrator).toContain('model: inherit');

    const settings = JSON.parse(
      String(artifact(artifacts, 'settings.json')?.content),
    ) as { agent?: string };
    expect(settings.agent).toBe('orchestrator');
  });

  test('does not generate a SessionStart hook (main-thread agent replaces it)', () => {
    const { artifacts } = render();
    expect(artifacts.some((entry) => entry.path.includes('hooks/'))).toBe(
      false,
    );
  });

  test('restricts read-only roles and grants write tools to write-capable roles', () => {
    const { artifacts } = render();
    const explorer = String(artifact(artifacts, 'agents/explorer.md')?.content);
    const deep = String(artifact(artifacts, 'agents/deep.md')?.content);

    expect(explorer).toContain('tools: "Read, Grep, Glob"');
    expect(explorer).not.toMatch(/tools:.*\b(Write|Edit)\b/);
    expect(explorer).toContain('model: haiku');

    expect(deep).toContain('tools: "Read, Edit, Write, Bash, Grep, Glob"');
    expect(deep).toContain('model: sonnet');
  });

  test('applies the configured per-role model defaults', () => {
    const { artifacts } = render();
    const modelOf = (suffix: string) =>
      /^model:\s*(\S+)/m.exec(
        String(artifact(artifacts, suffix)?.content),
      )?.[1];

    expect(modelOf('agents/explorer.md')).toBe('haiku');
    expect(modelOf('agents/librarian.md')).toBe('sonnet');
    expect(modelOf('agents/oracle.md')).toBe('opus');
    expect(modelOf('agents/designer.md')).toBe('sonnet');
    expect(modelOf('agents/quick.md')).toBe('haiku');
    expect(modelOf('agents/deep.md')).toBe('sonnet');
  });

  test('renders .mcp.json with http type for url-based servers', () => {
    const { artifacts } = render();
    const mcp = JSON.parse(
      String(artifact(artifacts, '.mcp.json')?.content),
    ) as { mcpServers: Record<string, { type?: string; url?: string }> };

    expect(mcp.mcpServers.context7).toEqual({
      type: 'http',
      url: 'https://mcp.context7.com/mcp',
    });
    expect(mcp.mcpServers.grep_app.type).toBe('http');
    expect(mcp.mcpServers.exa).toMatchObject({ command: 'npx' });
    expect(mcp.mcpServers.thoth_mem).toMatchObject({ command: 'npx' });
  });

  test('stamps the manifest version from the root package.json and emits no diagnostics', () => {
    const result = render();
    const manifest = JSON.parse(
      String(artifact(result.artifacts, 'plugin.json')?.content),
    ) as { name: string; version: string };

    expect(manifest.name).toBe('thoth-agents');
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(result.diagnostics).toEqual([]);
  });

  test('root instructions describe Task delegation and AskUserQuestion', () => {
    const instructions = renderClaudeCodeRootInstructions();
    expect(instructions).toContain('Task tool');
    expect(instructions).toContain('subagent_type');
    expect(instructions).toContain('AskUserQuestion');
    expect(instructions).toContain('TodoWrite');
  });
});
