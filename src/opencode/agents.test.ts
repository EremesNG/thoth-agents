import type { Plugin } from '@opencode/plugin';
import { describe, expect, test, vi } from 'vitest';
import { registerAgents } from './agents';
import { loadOpenCodeDependencies } from './context';

function fixture() {
  const registered: Record<string, Record<string, unknown>> = {};
  const editor = {
    update: vi.fn(
      (id: string, update: (agent: Record<string, unknown>) => void) => {
        const agent = {
          id,
          hidden: true,
          model: { providerID: 'stale', id: 'stale' },
        };
        update(agent);
        registered[id] = agent;
      },
    ),
    default: vi.fn(),
    remove: vi.fn(),
  };
  const ctx = {
    location: { directory: process.cwd() },
    agent: {
      transform: vi.fn(async (callback) => {
        callback(editor);
      }),
    },
  } as unknown as Plugin.Context;
  const deps = loadOpenCodeDependencies(ctx);
  return { ctx, deps, registered, editor };
}

describe('OpenCode agent registration', () => {
  test('registers six visible roles, their rendered systems and native fields', async () => {
    const { ctx, deps, registered, editor } = fixture();
    await registerAgents(ctx, deps);
    expect(editor.update.mock.calls.map(([id]) => id)).toEqual([
      'orchestrator',
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'worker',
    ]);
    expect(editor.default).toHaveBeenCalledExactlyOnceWith('orchestrator');
    expect(editor.remove.mock.calls).toEqual([['explore'], ['general']]);
    for (const [id, agent] of Object.entries(registered)) {
      expect(agent.system).toBe(deps.agents[id].prompt);
      expect(agent.description).toBe(deps.agents[id].description);
      expect(agent.mode).toBe(id === 'orchestrator' ? 'primary' : 'subagent');
      expect(agent.hidden).toBe(false);
      expect(agent.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(agent).not.toHaveProperty('temperature');
      expect(agent).not.toHaveProperty('prompt');
      expect(agent.model).toMatchObject({ providerID: 'openai' });
      expect(agent.permissions).toEqual(
        expect.arrayContaining([
          {
            action: 'subagent',
            resource: '*',
            effect: id === 'orchestrator' ? 'allow' : 'deny',
          },
        ]),
      );
    }
  });

  test('preserves scalar variants, respects omitted array variants and clears stale inherited models', async () => {
    const { ctx, deps, registered } = fixture();
    deps.agents.orchestrator.model = 'custom/root';
    deps.agents.orchestrator.variant = 'low';
    deps.effectiveModelArrays.worker = [{ id: 'custom/worker' }];
    deps.agents.worker.variant = 'high';
    deps.agents.oracle.model = undefined;
    await registerAgents(ctx, deps);
    expect(registered.orchestrator.model).toEqual({
      providerID: 'custom',
      id: 'root',
      variant: 'low',
    });
    expect(registered.worker.model).toEqual({
      providerID: 'custom',
      id: 'worker',
    });
    expect(registered.oracle.model).toBeUndefined();
  });

  test('uses the first effective model including variant and preserves slashes in model IDs', async () => {
    const { ctx, deps, registered } = fixture();
    deps.effectiveModelArrays.worker = [
      { id: 'openrouter/vendor/model', variant: 'high' },
      { id: 'openai/fallback' },
    ];
    deps.agents.worker.steps = 12;
    await registerAgents(ctx, deps);
    expect(registered.worker.model).toEqual({
      providerID: 'openrouter',
      id: 'vendor/model',
      variant: 'high',
    });
    expect(registered.worker.steps).toBe(12);
  });
});
