import { describe, expect, test } from 'vitest';
import { piAdapter } from '../adapters/pi';
import {
  getPiSpecialistDefaultTools,
  PI_ROOT_END,
  PI_ROOT_START,
} from './pi-agent';

describe('Pi agent writer', () => {
  test('selects ask_orchestrator explicitly for every specialist except Oracle', () => {
    const roles = [
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'worker',
    ] as const;
    expect(
      roles.map((role) => [role, getPiSpecialistDefaultTools(role)]),
    ).toEqual([
      ['explorer', ['read', 'bash', 'ask_orchestrator']],
      [
        'librarian',
        [
          'read',
          'bash',
          'resolve-library-id',
          'query-docs',
          'mcp',
          'web_search',
          'fetch_content',
          'get_search_content',
          'source_check',
          'ask_orchestrator',
        ],
      ],
      ['oracle', ['read', 'bash']],
      ['designer', ['read', 'bash', 'edit', 'write', 'ask_orchestrator']],
      ['worker', ['read', 'bash', 'edit', 'write', 'ask_orchestrator']],
    ]);
  });

  test('renders one ambient root block and exactly five owned specialists deterministically', () => {
    const first = piAdapter.render({ projectRoot: process.cwd() });
    const second = piAdapter.render({ projectRoot: process.cwd() });
    expect(second.artifacts).toEqual(first.artifacts);
    expect(
      first.artifacts.some((artifact) => artifact.path === 'APPEND_SYSTEM.md'),
    ).toBe(false);
    const agents = first.artifacts.filter(
      (artifact) => artifact.kind === 'agent-config',
    );
    expect(agents.map((artifact) => artifact.path)).toEqual([
      'agents/thoth-explorer.md',
      'agents/thoth-librarian.md',
      'agents/thoth-oracle.md',
      'agents/thoth-designer.md',
      'agents/thoth-worker.md',
    ]);
    expect(
      agents.some((artifact) => artifact.path.includes('orchestrator')),
    ).toBe(false);
    const expectedTools: Record<string, string> = {
      'agents/thoth-explorer.md': 'read, bash, ask_orchestrator',
      'agents/thoth-librarian.md':
        'read, bash, resolve-library-id, query-docs, mcp, web_search, fetch_content, get_search_content, source_check, ask_orchestrator',
      'agents/thoth-oracle.md': 'read, bash',
      'agents/thoth-designer.md': 'read, bash, edit, write, ask_orchestrator',
      'agents/thoth-worker.md': 'read, bash, edit, write, ask_orchestrator',
    };
    for (const artifact of agents) {
      expect(artifact.content).toContain('managed-by: thoth-agents');
      expect(artifact.content.match(/^tools: (.+)$/m)?.[1]).toBe(
        JSON.stringify(expectedTools[artifact.path]),
      );
      expect(artifact.content).toMatch(/^effort: "(?:low|medium|high|max)"$/m);
      expect(artifact.content).toContain('subagent_mode: "background"');
      expect(artifact.content).not.toMatch(
        /^(?:thinking|async|defaultContext|maxSubagentDepth):/m,
      );
      expect(artifact.content).toContain(
        `name: ${artifact.path.slice('agents/'.length, -'.md'.length)}`,
      );
    }
    const librarian = agents.find(
      (artifact) => artifact.path === 'agents/thoth-librarian.md',
    );
    expect(librarian?.content).toContain('provider is loaded');
    expect(librarian?.content).not.toContain('tool allowlist');
    for (const artifact of agents.filter(
      (artifact) => artifact.path !== 'agents/thoth-librarian.md',
    )) {
      expect(artifact.content).not.toContain('\nasync: true\n');
    }
    expect(
      first.artifacts.some((artifact) =>
        String(artifact.content).includes(PI_ROOT_START),
      ),
    ).toBe(false);
    expect(
      first.artifacts.some((artifact) =>
        String(artifact.content).includes(PI_ROOT_END),
      ),
    ).toBe(false);
  });
});
