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

describe('Claude Code adapter v0.3', () => {
  test('reports enforcement gaps truthfully', () => {
    expect(claudeCodeAdapter.id).toBe('claude');
    expect(CLAUDE_CODE_CAPABILITIES).toMatchObject({
      agentDefinitions: 'supported',
      delegatedExecution: 'supported',
      parallelDelegation: 'supported',
      runtimeHooks: 'supported',
      mcpConfiguration: 'supported',
      skillPackaging: 'supported',
      rolePermissions: 'supported',
      parentContextInjection: 'supported',
      memoryGovernanceEnforcement: 'instruction-only',
    });
  });

  test('renders nine specialists plus the main-thread orchestrator', () => {
    const paths = render()
      .artifacts.filter((entry) => entry.kind === 'agent-config')
      .map((entry) => entry.path);

    expect(paths).toEqual([
      'agents/deep.md',
      'agents/designer.md',
      'agents/explorer.md',
      'agents/librarian.md',
      'agents/oracle.md',
      'agents/orchestrator.md',
      'agents/quick.md',
      'agents/sdd-plan.md',
      'agents/sdd-specify.md',
      'agents/sdd-tasks.md',
    ]);
  });

  test('uses speed-conscious Claude model aliases for SDD agents', () => {
    const { artifacts } = render();
    const modelOf = (suffix: string) =>
      /^model:\s*(\S+)/m.exec(
        String(artifact(artifacts, suffix)?.content),
      )?.[1];

    expect(modelOf('agents/sdd-specify.md')).toBe('sonnet');
    expect(modelOf('agents/sdd-plan.md')).toBe('sonnet');
    expect(modelOf('agents/sdd-tasks.md')).toBe('haiku');
  });

  test('renders adaptive native root instructions with namespaced roles', () => {
    const instructions = renderClaudeCodeRootInstructions();

    expect(instructions.length).toBeLessThan(9_500);
    expect(instructions).toContain('adaptive root');
    expect(instructions).toContain('Accelerated SDD');
    expect(instructions).toContain('Agent');
    expect(instructions).toContain('AskUserQuestion');
    expect(instructions).toContain('TodoWrite');
    expect(instructions).toContain('thoth-agents:sdd-specify');
    expect(instructions).not.toContain('delegate-first');
    expect(instructions).not.toContain('requirements-interview');
  });

  test('limits phase agents by instruction and discloses enforcement level', () => {
    const { artifacts } = render();
    const specify = String(
      artifact(artifacts, 'agents/sdd-specify.md')?.content,
    );
    const explorer = String(artifact(artifacts, 'agents/explorer.md')?.content);

    expect(specify).toContain('coordination-write');
    expect(specify).toContain('Do not edit product code');
    expect(specify).toContain('openspec/');
    expect(specify).toContain('instruction-level');
    expect(explorer).toContain('Mode: read-only');
    expect(explorer).toContain('disallowedTools: "Write, Edit"');
  });

  test('activates the orchestrator as the main thread', () => {
    const { artifacts } = render();
    const orchestrator = String(
      artifact(artifacts, 'agents/orchestrator.md')?.content,
    );
    const settings = JSON.parse(
      String(artifact(artifacts, 'settings.json')?.content),
    ) as { agent?: string };

    expect(orchestrator).not.toMatch(/^tools:/m);
    expect(orchestrator).toContain('model: inherit');
    expect(settings.agent).toBe('orchestrator');
  });

  test('bundles unrelated MCP servers but no memory provider', () => {
    const { artifacts } = render();
    const mcp = JSON.parse(
      String(artifact(artifacts, '.mcp.json')?.content),
    ) as {
      mcpServers: Record<string, unknown>;
    };

    expect(mcp.mcpServers.context7).toBeDefined();
    expect(mcp.mcpServers.grep_app).toBeDefined();
    expect(mcp.mcpServers.exa).toBeDefined();
    expect(mcp.mcpServers.thoth_mem).toBeUndefined();
  });

  test('ships SDD behavior through agents instead of bundled phase skills', () => {
    const { artifacts } = render();

    expect(artifacts.some((entry) => entry.kind === 'skill')).toBe(false);
    expect(artifacts.some((entry) => entry.path.startsWith('skills/'))).toBe(
      false,
    );
  });
});
