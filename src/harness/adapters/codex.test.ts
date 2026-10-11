import { describe, expect, test } from 'vitest';
import {
  getAgentPackContract,
  getImplementationOwnershipInstructions,
} from '../core/agent-pack';
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
  test('renders canonical default-first ownership with discovery navigation and a pre-tool check', () => {
    const root = renderCodexRootInstructions();
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
    expect(root).toMatch(
      /by default, specialists perform discovery of unlocated source, external research and substantive implementation; you direct, decide, accept and synthesize/i,
    );
    expect(block.indexOf('Unlocated local source')).toBeLessThan(
      block.indexOf(
        'Direct-work exceptions: known low-risk mechanical work, including reviewed commits',
      ),
    );
    expect
      .soft(block)
      .toMatch(
        /unlocated local source, flow, or responsibility goes to Explorer before any root search, read, shell\/git or CodeGraph call/i,
      );
    expect
      .soft(block)
      .toContain(
        'name the unknown location in the assignment instead of pre-reading',
      );
    expect
      .soft(block)
      .toContain(
        'Navigation instructions (CodeGraph, webstorm-index, rg, docs routers) and their fallbacks govern the investigator, never make root one.',
      );
    expect
      .soft(block)
      .toMatch(
        /before the first read\/search\/shell call of a turn, check for a known bounded source within a direct-work exception; otherwise dispatch/i,
      );
    expect
      .soft(block)
      .toContain(
        'This ownership policy is prompt guidance, not runtime enforcement.',
      );
    for (const phrase of [
      'If delegating',
      'Boundaries alone do not require delegation',
      'net gain',
      'Otherwise specialists',
    ]) {
      expect.soft(root).not.toContain(phrase);
    }
  });
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

  test('renders the canonical five specialist TOML files', () => {
    const paths = render()
      .artifacts.filter((entry) => entry.kind === 'agent-config')
      .map((entry) => entry.path);

    expect(paths).toEqual([
      '.codex/agents/thoth-agents-explorer.toml',
      '.codex/agents/thoth-agents-librarian.toml',
      '.codex/agents/thoth-agents-oracle.toml',
      '.codex/agents/thoth-agents-designer.toml',
      '.codex/agents/thoth-agents-worker.toml',
    ]);
  });

  test('renders a compact Codex root coordinator', () => {
    const root = renderCodexRootInstructions();

    // Includes canonical discovery/navigation guidance and the Codex dialect.
    expect(root.length).toBeLessThanOrEqual(13_800);
    expect(root).toContain('root coordinator');
    expect(root).toContain(
      'Direct-work exceptions: known low-risk mechanical work, including reviewed commits',
    );
    expect(root).toContain(
      'By default, specialists perform discovery of unlocated source, external research and substantive implementation',
    );
    expect(root).not.toContain('delegation creates net gain');
    expect(root).toContain('<implementation-ownership>');
    expect(root).toMatch(
      /specialists perform discovery.*you direct, decide, accept/is,
    );
    expect(root).not.toMatch(/another search or dependency ends it/i);
    expect(root).not.toMatch(/Direct micro-action/i);
    expect(root).not.toMatch(/Artifact-backed implement follows/i);
    expect(root).toContain('.thoth/changes/<id>/<id>.md');
    expect(root).toContain('collaboration.spawn_agent');
    expect(root).toContain('request_user_input');
    expect(root).toContain('thoth-sdd');
    expect(root).toContain('Final verification is mandatory:');
    expect(root).toContain(
      'trivial deterministic low-risk work may use focused root checks',
    );
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
      'worker',
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
    const worker = agentContent('worker');

    expect(explorer).toContain('sandbox_mode = "read-only"');
    expect(explorer).toContain('Mode: read-only');
    expect(worker).toContain('sandbox_mode = "workspace-write"');
    expect(worker).toContain('write-capable');
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
