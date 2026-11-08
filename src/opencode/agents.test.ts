import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from '@opencode/plugin';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { registerAgents } from './agents';
import { loadOpenCodeDependencies } from './context';

function fixture(directory: string) {
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
    location: { directory },
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
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'thoth-profile-agents-'));
    vi.stubEnv('OPENCODE_CONFIG_DIR', root);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  test('applies global profile defaults before deduplicated configured fallbacks', async () => {
    writeFileSync(
      join(root, 'thoth-agents.json'),
      JSON.stringify({
        agents: {
          worker: {
            model: [{ id: 'custom/worker', variant: 'low' }, 'custom/backup'],
          },
        },
        fallback: { chains: { worker: ['custom/backup', 'custom/last'] } },
      }),
    );
    mkdirSync(join(root, 'thoth'));
    writeFileSync(
      join(root, 'thoth/profiles.json'),
      JSON.stringify({
        version: 1,
        active: 'fast',
        profiles: {
          fast: {
            agents: {
              worker: { model: 'custom/backup', variant: 'max' },
              orchestrator: { model: 'custom/root', variant: 'high' },
            },
          },
        },
      }),
    );
    const { ctx, deps, registered } = fixture(root);
    await registerAgents(ctx, deps);
    expect(registered.worker.model).toEqual({
      providerID: 'custom',
      id: 'backup',
      variant: 'max',
    });
    expect(registered.orchestrator.model).toEqual({
      providerID: 'custom',
      id: 'root',
      variant: 'high',
    });
    expect(deps.effectiveModelArrays.worker).toEqual([
      { id: 'custom/backup', variant: 'max' },
      { id: 'custom/worker', variant: 'low' },
      { id: 'custom/last' },
    ]);
    expect(deps.runtimeChains.worker).toEqual([
      'custom/backup',
      'custom/worker',
      'custom/last',
    ]);
  });
  test('project pin beats global active and refresh updates the existing transform', async () => {
    const { ctx, deps, registered, editor } = fixture(root);
    deps.profileState.store.save('global', 'global', {
      agents: { worker: { model: 'custom/global' } },
    });
    deps.profileState.store.setGlobalActive('global');
    deps.profileState.store.save('project', 'project', {
      agents: { worker: { model: 'custom/project', variant: 'low' } },
    });
    deps.profileState.store.setProjectPin('project');
    deps.profileState.refresh();
    await registerAgents(ctx, deps);
    expect(deps.profileState.selection.name).toBe('project');
    expect(registered.worker.model).toEqual({
      providerID: 'custom',
      id: 'project',
      variant: 'low',
    });
    deps.profileState.store.setProjectPin(undefined);
    deps.profileState.refresh();
    const transform = vi.mocked(ctx.agent.transform).mock.calls[0][0];
    await transform(editor as unknown as Parameters<typeof transform>[0]);
    expect(registered.worker.model).toEqual({
      providerID: 'custom',
      id: 'global',
    });
    expect(deps.effectiveModelArrays.worker[0].id).toBe('custom/global');
    deps.profileState.store.setGlobalActive(undefined);
    deps.profileState.refresh();
    await transform(editor as unknown as Parameters<typeof transform>[0]);
    expect(registered.worker.model).toEqual({
      providerID: 'openai',
      id: 'gpt-6-luna',
      variant: 'max',
    });
    expect(deps.effectiveModelArrays.worker).toBeUndefined();
    expect(deps.runtimeChains.worker).toBeUndefined();
  });

  test('missing project and global pointers warn and fall back to default', async () => {
    for (const dir of [join(root, 'thoth'), join(root, '.opencode/thoth')]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'profiles.json'),
        JSON.stringify({ version: 1, active: 'missing', profiles: {} }),
      );
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ctx, deps, registered } = fixture(root);
    await registerAgents(ctx, deps);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(deps.profileState.selection.name).toBe('default');
    expect(registered.worker.model).toEqual({
      providerID: 'openai',
      id: 'gpt-6-luna',
      variant: 'max',
    });
  });

  test('virtual default preserves scalar models, variant-less arrays and retry eligibility', async () => {
    writeFileSync(
      join(root, 'thoth-agents.json'),
      JSON.stringify({
        agents: {
          worker: {
            model: ['custom/worker', { id: 'custom/backup', variant: 'low' }],
            variant: 'high',
          },
          oracle: { model: 'custom/oracle', variant: 'high' },
        },
        fallback: { chains: { oracle: ['custom/oracle', 'custom/last'] } },
      }),
    );
    const { ctx, deps, registered } = fixture(root);
    await registerAgents(ctx, deps);
    expect(registered.worker.model).toEqual({
      providerID: 'custom',
      id: 'worker',
    });
    expect(registered.oracle.model).toEqual({
      providerID: 'custom',
      id: 'oracle',
      variant: 'high',
    });
    expect(deps.effectiveModelArrays.worker).toEqual([
      { id: 'custom/worker' },
      { id: 'custom/backup', variant: 'low' },
    ]);
    expect(deps.effectiveModelArrays.oracle).toEqual([
      { id: 'custom/oracle', variant: 'high' },
      { id: 'custom/last' },
    ]);
    expect(deps.runtimeChains).toEqual({
      worker: ['custom/worker', 'custom/backup'],
      oracle: ['custom/oracle', 'custom/last'],
    });
    expect(deps.effectiveModelArrays.orchestrator).toBeUndefined();
    expect(deps.modelArrayMap.worker).toEqual([
      { id: 'custom/worker' },
      { id: 'custom/backup', variant: 'low' },
    ]);
  });

  test('registers six visible roles, their rendered systems and native fields', async () => {
    const { ctx, deps, registered, editor } = fixture(root);
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
    const { ctx, deps, registered } = fixture(root);
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
    const { ctx, deps, registered } = fixture(root);
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
