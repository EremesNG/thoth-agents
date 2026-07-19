import { describe, expect, test } from 'vitest';
import type { HarnessArtifact } from '../types';
import {
  CODEX_CAPABILITIES,
  codexAdapter,
  renderCodexRootInstructions,
} from './codex';

function render() {
  return codexAdapter.render({
    projectRoot: process.cwd(),
  });
}

function artifact(
  artifacts: HarnessArtifact[],
  suffix: string,
): HarnessArtifact | undefined {
  return artifacts.find((entry) => entry.path.endsWith(suffix));
}

function agentContent(name: string): string {
  return String(
    artifact(render().artifacts, `.codex/agents/thoth-agents-${name}.toml`)
      ?.content,
  );
}

describe('Codex adapter v0.3', () => {
  test('reports Codex capabilities and instruction-level boundaries', () => {
    expect(codexAdapter.id).toBe('codex');
    expect(CODEX_CAPABILITIES).toMatchObject({
      agentDefinitions: 'supported',
      delegatedExecution: 'supported',
      parallelDelegation: 'supported',
      rolePermissions: 'instruction-only',
      parentContextInjection: 'instruction-only',
      memoryGovernanceEnforcement: 'instruction-only',
    });
  });

  test('renders the canonical nine child-agent TOML files', () => {
    const paths = render()
      .artifacts.filter((entry) => entry.kind === 'agent-config')
      .map((entry) => entry.path);

    expect(paths).toEqual([
      '.codex/agents/thoth-agents-explorer.toml',
      '.codex/agents/thoth-agents-librarian.toml',
      '.codex/agents/thoth-agents-oracle.toml',
      '.codex/agents/thoth-agents-sdd-specify.toml',
      '.codex/agents/thoth-agents-sdd-plan.toml',
      '.codex/agents/thoth-agents-sdd-tasks.toml',
      '.codex/agents/thoth-agents-designer.toml',
      '.codex/agents/thoth-agents-quick.toml',
      '.codex/agents/thoth-agents-deep.toml',
    ]);
  });

  test('renders a compact adaptive Codex root', () => {
    const root = renderCodexRootInstructions();

    expect(root.length).toBeLessThan(10_000);
    expect(root).toContain('adaptive root');
    expect(root).toContain('bounded direct work');
    expect(root).toContain('net gain');
    expect(root).toContain('Accelerated SDD');
    expect(root).toContain('collaboration.spawn_agent');
    expect(root).toContain('request_user_input');
    expect(root).toContain('sdd-specify subagent');
    expect(root).not.toContain('delegate-first');
    expect(root).not.toContain('requirements-interview');
    expect(root).not.toContain('task_status');
  });

  test('renders read-only and coordination-write sandbox boundaries', () => {
    const explorer = agentContent('explorer');
    const specify = agentContent('sdd-specify');

    expect(explorer).toContain('sandbox_mode = "read-only"');
    expect(explorer).toContain('Mode: read-only');
    expect(specify).toContain('sandbox_mode = "workspace-write"');
    expect(specify).toContain('coordination-write');
    expect(specify).toContain('Do not edit product code');
    expect(specify).toContain('openspec/');
  });

  test('uses the canonical speed-conscious models for phase agents', () => {
    expect(agentContent('sdd-specify')).toContain('model = "gpt-5.6-sol"');
    expect(agentContent('sdd-specify')).toContain(
      'model_reasoning_effort = "high"',
    );
    expect(agentContent('sdd-plan')).toContain('model = "gpt-5.6-sol"');
    expect(agentContent('sdd-tasks')).toContain('model = "gpt-5.6-luna"');
    expect(agentContent('sdd-tasks')).toContain(
      'model_reasoning_effort = "medium"',
    );
  });

  test('does not bundle a memory provider MCP', () => {
    const content = render()
      .artifacts.filter((entry) => entry.kind === 'mcp-config')
      .map((entry) => String(entry.content))
      .join('\n');

    expect(content).toContain('context7');
    expect(content).toContain('grep_app');
    expect(content).not.toContain('thoth_mem');
  });

  test('ships SDD behavior through agents instead of bundled phase skills', () => {
    const result = render();
    const manifest = JSON.parse(
      String(artifact(result.artifacts, '.codex-plugin/plugin.json')?.content),
    ) as Record<string, unknown>;

    expect(result.artifacts.some((entry) => entry.kind === 'skill')).toBe(
      false,
    );
    expect(manifest.skills).toBeUndefined();
    expect(
      result.artifacts.some((entry) =>
        entry.path.includes('.codex-plugin/skills/'),
      ),
    ).toBe(false);
  });
});
