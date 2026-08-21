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

  test('renders the canonical six specialist TOML files', () => {
    const paths = render()
      .artifacts.filter((entry) => entry.kind === 'agent-config')
      .map((entry) => entry.path);

    expect(paths).toEqual([
      '.codex/agents/thoth-agents-explorer.toml',
      '.codex/agents/thoth-agents-librarian.toml',
      '.codex/agents/thoth-agents-oracle.toml',
      '.codex/agents/thoth-agents-designer.toml',
      '.codex/agents/thoth-agents-quick.toml',
      '.codex/agents/thoth-agents-deep.toml',
    ]);
  });

  test('renders a compact adaptive Codex root', () => {
    const root = renderCodexRootInstructions();

    expect(root.length).toBeLessThan(10_000);
    expect(root).toContain('adaptive root');
    expect(root).toContain(
      'Handle bounded implementation directly in any route when continuity outweighs delegation overhead',
    );
    expect(root).toContain('net gain');
    expect(root).toContain('<implementation-ownership>');
    expect(root).toContain(
      'SDD routes govern artifacts and gates, not implementation ownership.',
    );
    expect(root).toContain(
      'Explicit safe user direction is an ownership input.',
    );
    expect(root).not.toMatch(/Direct micro-action/i);
    expect(root).not.toMatch(/Artifact-backed implement follows/i);
    expect(root).toContain('Accelerated SDD');
    expect(root).toContain('collaboration.spawn_agent');
    expect(root).toContain('request_user_input');
    expect(root).toContain('thoth-sdd');
    expect(root).toMatch(/every.*verify|verify.*always/i);
    expect(root).toContain('oracle');
    expect(root).not.toContain('delegate-first');
    expect(root).not.toContain('requirements-interview');
    expect(root).not.toContain('task_status');
    expect(root).not.toContain('<phase-protocols>');
  });

  test('renders Codex-native fresh and continuation lifecycle guidance', () => {
    const root = renderCodexRootInstructions();

    expect(root).toContain(
      '`collaboration.spawn_agent` with `fork_turns="none"`',
    );
    expect(root).toContain(
      '`collaboration.followup_task` for the existing agent',
    );
    expect(root).toContain(
      '`fork_turns="none"` prevents parent-history inheritance',
    );
    expect(root).not.toContain('task_id');
    expect(root).not.toContain('SendMessage');
  });

  test('uses conditional agent_type selection with a bounded instruction-only fallback', () => {
    const root = renderCodexRootInstructions();
    expect(root).toContain('schema exposes `agent_type`');
    expect(root).toContain('role-prefixed `task_name`');
    expect(root).toContain('fallback is instruction-only');
    expect(root).not.toMatch(/Codex (?:always|universally).*agent_type/i);
  });

  test('renders canonical routable descriptions for every specialist', () => {
    for (const name of [
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'quick',
      'deep',
    ]) {
      const content = agentContent(name);
      expect(content, name).toContain('Use when:');
      expect(content, name).toContain('Do not use when:');
      expect(content, name).toContain('Escalate when:');
      expect(content, name).toContain('Verification:');
    }
  });

  test('renders read-only and writer sandbox boundaries', () => {
    const explorer = agentContent('explorer');
    const deep = agentContent('deep');

    expect(explorer).toContain('sandbox_mode = "read-only"');
    expect(explorer).toContain('Mode: read-only');
    expect(deep).toContain('sandbox_mode = "workspace-write"');
    expect(deep).toContain('write-capable');
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

  test('does not emit hook diagnostics when the package has no hooks', () => {
    const hookDiagnostics = render().diagnostics.filter((diagnostic) =>
      diagnostic.code.includes('hooks'),
    );

    expect(
      render().artifacts.some((entry) => entry.kind === 'hook-config'),
    ).toBe(false);
    expect(hookDiagnostics).toEqual([]);
  });

  test('declares the thoth-owned bundled skill directory', () => {
    const result = render();
    const manifest = JSON.parse(
      String(artifact(result.artifacts, '.codex-plugin/plugin.json')?.content),
    ) as Record<string, unknown>;

    expect(manifest.skills).toBe('./skills/');
    expect(
      result.artifacts.some((entry) => entry.path === '.codex-plugin/skills/'),
    ).toBe(false);
  });
});
