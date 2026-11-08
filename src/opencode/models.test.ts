import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from '@opencode/plugin';
import type { SessionRetry } from '@opencode/plugin/promise/session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAgents } from './agents';
import { loadOpenCodeDependencies } from './context';
import { registerSessionHooks } from './session-hooks';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thoth-models-'));
  vi.stubEnv('OPENCODE_CONFIG_DIR', join(directory, 'user'));
  vi.stubEnv('THOTH_AGENTS_PRESET', '');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

async function configuredHost(model: unknown = 'p/a', enabled = true) {
  await mkdir(join(directory, '.opencode'));
  await writeFile(
    join(directory, '.opencode', 'thoth-agents.json'),
    JSON.stringify({
      agents: { worker: { model, variant: 'high' } },
      fallback: { enabled, chains: { worker: ['p/b', 'p/c', 'p/b'] } },
    }),
  );
  const registered: Record<string, { model?: SessionRetry['model'] }> = {};
  const switchModel = vi.fn(async () => {});
  let retryHook!: (input: SessionRetry) => Promise<void>;
  const ctx = {
    location: { directory },
    agent: {
      transform: async (callback) =>
        callback({
          update: (name, update) => {
            const agent = {};
            update(agent);
            registered[name] = agent;
          },
          default: () => {},
          remove: () => {},
        }),
    },
    session: {
      switchModel,
      hook: async (name, callback) => {
        if (name === 'retry') retryHook = callback;
      },
      instructions: { entry: { put: async () => {} } },
    },
    event: { subscribe: () => ({ async *[Symbol.asyncIterator]() {} }) },
  } as unknown as Plugin.Context;
  const deps = loadOpenCodeDependencies(ctx);
  await registerAgents(ctx, deps);
  await registerSessionHooks(ctx, deps);
  async function retry(model = registered.worker.model) {
    const input = {
      sessionID: 's',
      agent: 'worker',
      model,
      error: { type: 'provider.rate-limit', message: 'limited' },
      attempt: 1,
      decision: { retry: false },
    } as SessionRetry;
    await retryHook(input);
    return input.decision;
  }
  return { registered, switchModel, retry };
}

describe('configured OpenCode models through the real loader', () => {
  it('advances from the scalar primary through each fallback once, then exhausts', async () => {
    const h = await configuredHost();
    expect(await h.retry()).toEqual({ retry: true, delay: 0 });
    expect(await h.retry({ providerID: 'p', id: 'b' })).toEqual({
      retry: true,
      delay: 0,
    });
    expect(await h.retry({ providerID: 'p', id: 'c' })).toEqual({
      retry: false,
    });
    expect(await h.retry()).toEqual({ retry: false });
    expect(h.switchModel.mock.calls.map(([call]) => call.model)).toEqual([
      { providerID: 'p', id: 'b' },
      { providerID: 'p', id: 'c' },
    ]);
  });

  it('leaves an external operator selection and the host decision untouched', async () => {
    const h = await configuredHost();
    expect(await h.retry({ providerID: 'operator', id: 'custom' })).toEqual({
      retry: false,
    });
    expect(h.switchModel).not.toHaveBeenCalled();
    expect(await h.retry()).toEqual({ retry: true, delay: 0 });
    expect(h.switchModel).toHaveBeenCalledExactlyOnceWith({
      sessionID: 's',
      model: { providerID: 'p', id: 'b' },
    });
  });

  it.each([
    true,
    false,
  ])('preserves array ordering and per-model variants (fallback enabled: %s)', async (enabled) => {
    const h = await configuredHost(
      [{ id: 'p/a', variant: 'low' }, { id: 'p/b', variant: 'medium' }, 'p/c'],
      enabled,
    );
    expect(h.registered.worker.model).toEqual({
      providerID: 'p',
      id: 'a',
      variant: 'low',
    });
    expect(await h.retry()).toEqual({ retry: true, delay: 0 });
    expect(await h.retry({ providerID: 'p', id: 'b' })).toEqual({
      retry: true,
      delay: 0,
    });
    expect(await h.retry({ providerID: 'p', id: 'c' })).toEqual({
      retry: false,
    });
    expect(h.switchModel.mock.calls.map(([call]) => call.model)).toEqual([
      { providerID: 'p', id: 'b', variant: 'medium' },
      { providerID: 'p', id: 'c' },
    ]);
  });

  it('does not enable a scalar fallback chain when disabled', async () => {
    const h = await configuredHost('p/a', false);
    expect(h.registered.worker.model).toEqual({
      providerID: 'p',
      id: 'a',
      variant: 'high',
    });
    expect(await h.retry()).toEqual({ retry: false });
    expect(h.switchModel).not.toHaveBeenCalled();
  });

  it('preserves a scalar primary variant when a fallback chain is configured', async () => {
    const h = await configuredHost();
    expect(h.registered.worker.model).toEqual({
      providerID: 'p',
      id: 'a',
      variant: 'high',
    });
  });
});
