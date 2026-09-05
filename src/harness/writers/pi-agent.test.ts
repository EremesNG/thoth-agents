import { describe, expect, test } from 'vitest';
import { piAdapter } from '../adapters/pi';
import { PI_ROOT_END, PI_ROOT_START } from './pi-agent';

describe('Pi agent writer', () => {
  test('renders one ambient root block and exactly six owned specialists deterministically', () => {
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
      'agents/thoth-quick.md',
      'agents/thoth-deep.md',
    ]);
    expect(
      agents.some((artifact) => artifact.path.includes('orchestrator')),
    ).toBe(false);
    for (const artifact of agents) {
      expect(artifact.content).toContain('managed-by: thoth-agents');
      expect(artifact.content).toContain('tools:');
      expect(artifact.content).toContain(
        `name: ${artifact.path.slice('agents/'.length, -'.md'.length)}`,
      );
    }
    const librarian = agents.find(
      (artifact) => artifact.path === 'agents/thoth-librarian.md',
    );
    expect(librarian?.content).toContain('resolve-library-id');
    expect(librarian?.content).toContain('query-docs');
    expect(librarian?.content).toContain('web_*_exa');
    expect(librarian?.content).toContain('exa_research_*');
    expect(librarian?.content).toContain('mcp');
    expect(librarian?.content).toContain('web_search');
    expect(librarian?.content).toContain('web_fetch');
    for (const agent of agents.filter((artifact) => artifact !== librarian)) {
      expect(agent.content).not.toMatch(/tools:.*\bweb_(?:search|fetch)\b/);
      expect(agent.content).not.toMatch(
        /tools:.*\b(?:ask_user_question|todo)\b/,
      );
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
