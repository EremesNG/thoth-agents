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
      'agents/explorer.md',
      'agents/librarian.md',
      'agents/oracle.md',
      'agents/designer.md',
      'agents/quick.md',
      'agents/deep.md',
    ]);
    expect(
      agents.some((artifact) => artifact.path.includes('orchestrator')),
    ).toBe(false);
    for (const artifact of agents) {
      expect(artifact.content).toContain('managed-by: thoth-agents');
      expect(artifact.content).toContain('tools:');
    }
    const librarian = agents.find(
      (artifact) => artifact.path === 'agents/librarian.md',
    );
    expect(librarian?.content).toContain('resolve-library-id');
    expect(librarian?.content).toContain('query-docs');
    expect(librarian?.content).toContain('web_*_exa');
    expect(librarian?.content).toContain('exa_research_*');
    expect(librarian?.content).toContain('mcp');
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
