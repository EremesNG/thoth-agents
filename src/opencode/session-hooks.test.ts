import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { Plugin } from '@opencode/plugin';
import type { SessionHooks } from '@opencode/plugin/promise/session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenCodeDependencies } from './context';
import { registerSessionHooks } from './session-hooks';

vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return { ...fs, readFile: vi.fn(fs.readFile) };
});

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thoth-session-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function host(events: unknown[] = []) {
  const hooks = new Map<string, (input: never) => Promise<void>>();
  const put = vi.fn(async () => {});
  const switchModel = vi.fn(async () => {});
  const subscribe = vi.fn(() => ({
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
  }));
  const ctx = {
    session: {
      hook: vi.fn(async (name, callback) => {
        hooks.set(name, callback);
        return { dispose: vi.fn() };
      }),
      instructions: { entry: { put } },
      switchModel,
    },
    event: { subscribe },
  } as unknown as Plugin.Context;
  const deps = {
    directory,
    agentDefs: [{ name: 'worker' }],
    runtimeChains: { worker: ['p/a', 'p/b'], external: ['p/a', 'p/b'] },
    effectiveModelArrays: {},
  } as unknown as OpenCodeDependencies;
  async function call<K extends keyof SessionHooks>(
    name: K,
    input: Partial<SessionHooks[K]>,
  ) {
    await hooks.get(name)?.(input as never);
  }
  return { ctx, deps, call, put, switchModel, subscribe, hooks };
}

async function record(id: string, text = `# Change: ${id}\n`) {
  const path = join(directory, '.thoth', 'changes', id);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, `${basename(id)}.md`), text);
}

describe('session keyed state', () => {
  it('tracks children per parent, sorts deterministically, and removes idle/deleted sessions', async () => {
    const events = [
      {
        type: 'session.created',
        data: { sessionID: 'z-child', parentID: 'parent' },
      },
      {
        type: 'session.created',
        data: { sessionID: 'a-child', parentID: 'parent' },
      },
      {
        type: 'session.status',
        data: { sessionID: 'z-child', status: { type: 'retry' } },
      },
      {
        type: 'session.status',
        data: { sessionID: 'a-child', status: { type: 'idle' } },
      },
      {
        type: 'session.status',
        data: { sessionID: 'a-child', status: { type: 'busy' } },
      },
      { type: 'session.deleted', data: { sessionID: 'z-child' } },
      { type: 'session.deleted', data: { sessionID: 'a-child' } },
    ];
    const h = host(events);
    await registerSessionHooks(h.ctx, h.deps);
    await vi.waitFor(() =>
      expect(
        h.put.mock.calls.filter(([entry]) => entry.sessionID === 'parent'),
      ).toHaveLength(6),
    );
    const values = h.put.mock.calls
      .filter(([entry]) => entry.sessionID === 'parent')
      .map(([entry]) => entry.value);
    expect(values[1]).toContain(
      'Running delegated sessions:\n- a-child\n- z-child',
    );
    expect(values[2]).toContain('Running delegated sessions:\n- z-child');
    expect(values.at(-1)).toContain('Running delegated sessions:\n- none');
    expect(h.subscribe.mock.calls[0][0]).toMatchObject({
      types: ['session.created', 'session.status', 'session.deleted'],
      signal: expect.any(AbortSignal),
    });
  });

  it('carries state in compaction without changing the system, tools, or existing message prefix', async () => {
    await record('migration');
    const h = host();
    await registerSessionHooks(h.ctx, h.deps);
    const system = Object.freeze([{ text: 'unchanged system' }]);
    const tools = Object.freeze({ shell: { description: 'unchanged tools' } });
    const message = Object.freeze({
      role: 'user',
      content: Object.freeze([{ type: 'text', text: 'original history' }]),
    });
    const input = { sessionID: 'parent', system, tools, messages: [message] };
    await h.call('compaction', input as never);
    expect(input.system).toBe(system);
    expect(input.tools).toBe(tools);
    expect(input.messages[0]).toBe(message);
    expect(input.messages).toHaveLength(2);
    expect(input.messages[1]).toEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Preserve this current Thoth state in the compaction summary:\n${h.put.mock.calls[0][0].value}`,
        },
      ],
    });
    expect(input).not.toHaveProperty('result');
    expect(h.hooks.has('context')).toBe(false);
    expect([...h.hooks.keys()].sort()).toEqual([
      'compaction',
      'prompt',
      'retry',
    ]);
  });

  it('updates record content/removal and excludes malformed records and archive descendants', async () => {
    await record('active', '# Change: Active\n**Status**: implementing\n');
    await record('archive/old');
    await mkdir(join(directory, '.thoth', 'changes', 'no-record'));
    const h = host();
    await registerSessionHooks(h.ctx, h.deps);
    await h.call('prompt', { sessionID: 'parent' } as never);
    expect(h.put.mock.calls[0][0].value).toContain(
      'Change: Active (**Status**: implementing)',
    );
    expect(h.put.mock.calls[0][0].value).not.toContain('no-record');
    expect(h.put.mock.calls[0][0].value).not.toContain('old');
    await record('active', '# Change: Active\n**Status**: ready\n');
    await h.call('prompt', { sessionID: 'parent' } as never);
    expect(h.put.mock.calls.at(-1)?.[0].value).toContain('(**Status**: ready)');
    await rm(join(directory, '.thoth', 'changes', 'active'), {
      recursive: true,
    });
    await h.call('prompt', { sessionID: 'parent' } as never);
    expect(h.put.mock.calls.at(-1)?.[0].value).toContain(
      'Active SDD records:\n- none',
    );
  });

  it('preserves an existing compaction result and carries state into its summary', async () => {
    const h = host();
    await registerSessionHooks(h.ctx, h.deps);
    const input = {
      sessionID: 'parent',
      messages: [],
      result: {
        summary: 'Existing history summary',
        metadata: { other: true },
      },
    };
    await h.call('compaction', input as never);
    expect(input.result.summary).toBe(
      `Existing history summary\n\n${h.put.mock.calls[0][0].value}`,
    );
    expect(input.result.metadata).toEqual({ other: true });
  });

  it('uses refreshed profile retry chains instead of the setup-time copy', async () => {
    const h = host();
    await registerSessionHooks(h.ctx, h.deps);
    h.deps.runtimeChains.worker = ['p/new', 'p/backup'];
    h.deps.effectiveModelArrays.worker = [
      { id: 'p/new' },
      { id: 'p/backup', variant: 'low' },
    ];
    await h.call('retry', {
      sessionID: 's',
      agent: 'worker',
      model: { providerID: 'p', id: 'new' },
      error: { type: 'provider.rate-limit', message: 'limited' },
      decision: { retry: false },
    } as never);
    expect(h.switchModel).toHaveBeenCalledWith({
      sessionID: 's',
      model: { providerID: 'p', id: 'backup', variant: 'low' },
    });
  });

  it('does not register fallback for non-thoth configured chains', async () => {
    const h = host();
    await registerSessionHooks(h.ctx, h.deps);
    await h.call('retry', {
      sessionID: 's',
      agent: 'external',
      model: { providerID: 'p', id: 'a' },
      error: { type: 'provider.rate-limit', message: 'limited' },
      decision: { retry: false },
    } as never);
    expect(h.switchModel).not.toHaveBeenCalled();
  });

  it('publishes deterministic records only when rendered state changes', async () => {
    await record('zeta');
    await record('alpha');
    await record('archive');
    const h = host();
    await registerSessionHooks(h.ctx, h.deps);
    await h.call('prompt', { sessionID: 'parent' } as never);
    expect(h.put).toHaveBeenCalledOnce();
    expect(h.put.mock.calls[0][0]).toEqual({
      sessionID: 'parent',
      key: 'thoth.state',
      value:
        'Thoth state\nActive SDD records:\n- .thoth/changes/alpha/alpha.md — Change: alpha\n- .thoth/changes/zeta/zeta.md — Change: zeta\nRunning delegated sessions:\n- none',
    });
    const reads = vi.mocked(readFile).mock.calls.length;
    await Promise.all([
      h.call('prompt', { sessionID: 'parent' } as never),
      h.call('prompt', { sessionID: 'parent' } as never),
    ]);
    expect(h.put).toHaveBeenCalledOnce();
    expect(vi.mocked(readFile).mock.calls).toHaveLength(reads);
    await record('beta');
    await h.call('prompt', { sessionID: 'parent' } as never);
    expect(h.put).toHaveBeenCalledTimes(2);
  });
});
