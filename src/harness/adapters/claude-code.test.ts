import { describe, expect, test } from 'vitest';
import {
  getAgentPackContract,
  getImplementationOwnershipInstructions,
} from '../core/agent-pack';
import type { HarnessArtifact } from '../types';
import {
  CLAUDE_CODE_CAPABILITIES,
  type ClaudeCodeRenderContext,
  claudeCodeAdapter,
  renderClaudeCodeRootInstructions,
} from './claude-code';

function render() {
  return claudeCodeAdapter.render({ projectRoot: process.cwd() });
}

function renderWithConfig(config: ClaudeCodeRenderContext) {
  return claudeCodeAdapter.render(config);
}

function artifact(
  artifacts: HarnessArtifact[],
  suffix: string,
): HarnessArtifact | undefined {
  return artifacts.find((entry) => entry.path.endsWith(suffix));
}

describe('Claude Code adapter v0.3', () => {
  test('renders canonical default-first ownership with discovery navigation and a pre-tool check', () => {
    const root = renderClaudeCodeRootInstructions();
    const ownership =
      getAgentPackContract().orchestrationPolicy.implementationOwnership;
    const block =
      root.match(
        /<implementation-ownership>\n([\s\S]*?)\n<\/implementation-ownership>/,
      )?.[1] ?? '';
    expect(block).toBe(
      getImplementationOwnershipInstructions(ownership)
        .map((instruction) => `- ${instruction}`)
        .join('\n'),
    );
    const defaultIndex = block.indexOf('Specialists execute by default');
    expect(defaultIndex).toBeGreaterThanOrEqual(0);
    expect(
      block.indexOf(
        'Root retains known low-risk mechanical work, including reviewed commits',
      ),
    ).toBeGreaterThan(defaultIndex);
    expect
      .soft(block)
      .toMatch(
        /unlocated local source, flow, or responsibility.*Explorer.*before any root code search, file read, shell\/git inspection, or CodeGraph query/i,
      );
    expect
      .soft(block)
      .toContain(
        'no preliminary discovery is needed to prepare that assignment',
      );
    expect
      .soft(block)
      .toContain(
        'Project navigation instructions (webstorm-index, CodeGraph, rg, docs routers) govern how the assigned investigator searches; they never make root the investigator.',
      );
    expect
      .soft(block)
      .toMatch(
        /before the first read\/search\/shell call of a turn, root checks.*known bounded source within a direct-work exception.*if not, dispatch/i,
      );
    expect
      .soft(block)
      .toContain('This self-check is guidance, not runtime enforcement.');
    for (const phrase of [
      'If delegating',
      'Boundaries alone do not require delegation',
      'net gain',
      'Otherwise specialists',
    ]) {
      expect.soft(root).not.toContain(phrase);
    }
  });
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

  test('renders five specialists plus the main-thread orchestrator', () => {
    const paths = render()
      .artifacts.filter((entry) => entry.kind === 'agent-config')
      .map((entry) => entry.path);

    expect(paths).toEqual([
      'agents/designer.md',
      'agents/explorer.md',
      'agents/librarian.md',
      'agents/oracle.md',
      'agents/orchestrator.md',
      'agents/worker.md',
    ]);
  });

  test('uses specialist Claude model aliases', () => {
    const { artifacts } = render();
    const modelOf = (suffix: string) =>
      /^model:\s*(\S+)/m.exec(
        String(artifact(artifacts, suffix)?.content),
      )?.[1];

    expect(modelOf('agents/oracle.md')).toBe('opus');
    expect(modelOf('agents/worker.md')).toBe('sonnet');
  });

  test('renders proportional effort frontmatter with valid override precedence', () => {
    const defaults = render().artifacts;
    const effortOf = (artifacts: HarnessArtifact[], suffix: string) =>
      /^effort:\s*(\S+)/m.exec(
        String(artifact(artifacts, suffix)?.content),
      )?.[1];

    expect(effortOf(defaults, 'agents/explorer.md')).toBe('low');
    expect(effortOf(defaults, 'agents/designer.md')).toBe('medium');
    expect(effortOf(defaults, 'agents/worker.md')).toBe('medium');
    expect(effortOf(defaults, 'agents/librarian.md')).toBe('high');
    expect(effortOf(defaults, 'agents/oracle.md')).toBe('high');

    const overridden = renderWithConfig({
      projectRoot: process.cwd(),
      config: {
        agents: {
          designer: { variant: 'high' },
          worker: { variant: 'invalid' },
        },
      },
    }).artifacts;
    expect(effortOf(overridden, 'agents/designer.md')).toBe('high');
    expect(effortOf(overridden, 'agents/worker.md')).toBe('medium');
  });

  test('renders namespaced explicit selection and canonical routing descriptions', () => {
    const result = render();
    expect(renderClaudeCodeRootInstructions()).toContain('subagent_type');
    expect(renderClaudeCodeRootInstructions()).toContain(
      'thoth-agents:designer',
    );
    for (const name of [
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'worker',
    ]) {
      const content = String(
        artifact(result.artifacts, `agents/${name}.md`)?.content,
      );
      expect(content, name).toContain('Use when:');
      expect(content, name).toContain('Do not use when:');
      expect(content, name).toContain('Escalate when:');
    }
  });

  test('renders native root coordinator instructions with namespaced roles', () => {
    const instructions = renderClaudeCodeRootInstructions();

    // Includes canonical discovery/navigation guidance and the Claude dialect.
    expect(instructions.length).toBeLessThanOrEqual(15_000);
    expect(instructions).toContain('root coordinator');
    expect(instructions).toContain('<implementation-ownership>');
    expect(instructions).toMatch(
      /specialists execute by default.*root retains/is,
    );
    expect(instructions).toContain(
      'Root retains known low-risk mechanical work, including reviewed commits',
    );
    expect(instructions).toContain(
      'Specialists execute by default for discovery of unlocated source, external research and substantive implementation',
    );
    expect(instructions).not.toContain('delegation creates net gain');
    expect(instructions).not.toMatch(/Direct micro-action/i);
    expect(instructions).not.toMatch(/Artifact-backed implement follows/i);
    expect(instructions).toContain('.thoth/changes/<id>/<id>.md');
    expect(instructions).toContain('Agent');
    expect(instructions).toContain('AskUserQuestion');
    expect(instructions).toContain('TodoWrite');
    expect(instructions).toContain('thoth-sdd');
    expect(instructions).toContain('thoth-agents:oracle');
    expect(instructions).toContain('Final verification is mandatory.');
    expect(instructions).toContain(
      'Trivial deterministic low-risk work may use focused root checks',
    );
    expect(instructions).not.toContain('delegate-first');
    expect(instructions).not.toContain('requirements-interview');
    expect(instructions).not.toContain('<phase-protocols>');
  });

  test('renders Claude-native fresh and continuation lifecycle guidance', () => {
    const instructions = renderClaudeCodeRootInstructions();

    expect(instructions).toContain('a normal `Agent` invocation');
    expect(instructions).toContain('`SendMessage` to the prior agent ID');
    expect(instructions).toContain('do not use `fork` for independent work');
    expect(instructions).not.toContain('collaboration.followup_task');
    expect(instructions).not.toContain('task_id');
    expect(instructions).not.toContain('fork_turns');
  });

  test('limits read-only roles by native tool denial', () => {
    const { artifacts } = render();
    const explorer = String(artifact(artifacts, 'agents/explorer.md')?.content);

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
});
