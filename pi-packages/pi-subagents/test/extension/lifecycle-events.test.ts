import fs from 'node:fs';
import path from 'node:path';
import { createEventBus } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import subagentsExtension from '../../src/extension/subagents-extension.js';
import type { SubagentManager } from '../../src/manager.js';
import type { SubagentRunner } from '../../src/types.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const captured = vi.hoisted(() => ({
  manager: undefined as SubagentManager | undefined,
}));
vi.mock('../../src/tools.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/tools.js')>()),
  registerSubagentTools: (_pi: unknown, manager: SubagentManager) => {
    captured.manager = manager;
  },
}));

const releaseRunners: Array<() => void> = [];
const shutdowns: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const release of releaseRunners.splice(0)) release();
  for (const shutdown of shutdowns.splice(0)) await shutdown();
  vi.useRealTimers();
});
const env = installSubagentTestEnv();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function controlledRunner() {
  const started = deferred<void>();
  const aborted = deferred<void>();
  const result = deferred<Awaited<ReturnType<SubagentRunner>>>();
  const runner = vi.fn<SubagentRunner>(async ({ signal }) => {
    signal.addEventListener('abort', () => aborted.resolve(), { once: true });
    started.resolve();
    return result.promise;
  });
  releaseRunners.push(() => result.resolve({ result: 'cleanup' }));
  return { runner, started, aborted, result };
}

async function fixture(runner: SubagentRunner) {
  env.writeAgent('worker');
  const handlers = new Map<string, Array<(...args: any[]) => unknown>>();
  const events = createEventBus();
  const emitted: string[] = [];
  // The theme bridge owns Orca signalling; pi-subagents must not emit these.
  for (const name of ['task:subagent:lifecycle', 'subagent:process-terminal'])
    events.on(name, () => {
      emitted.push(name);
    });
  const ctx = { cwd: env.tmp, sessionId: 'parent', hasUI: false };
  subagentsExtension({
    events,
    sendMessage: vi.fn(),
    on(name: string, handler: (...args: any[]) => unknown) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
  });
  const dispatch = async (name: string) => {
    for (const handler of handlers.get(name) ?? []) await handler({}, ctx);
  };
  const shutdown = () => dispatch('session_shutdown');
  shutdowns.push(shutdown);
  await dispatch('session_start');
  const manager = captured.manager;
  if (!manager) throw new Error('Subagent tools did not register.');
  (manager as any).runner = runner;
  return { manager, emitted, ctx, shutdown };
}

describe('Orca lifecycle ownership', () => {
  describe.each(['task', 'background'] as const)('%s mode', (mode) => {
    it.each([
      'completed',
      'failed',
    ] as const)('does not publish Orca events for a %s runner', async (status) => {
      const host = await fixture(async () => {
        if (status === 'failed') throw new Error('child crashed');
        return { result: 'done' };
      });
      const settled = deferred<void>();
      const response = await host.manager.run(
        { agent: 'worker', task: 'work', mode },
        host.ctx,
        undefined,
        (tasks) => {
          if (tasks[0]?.status === status) settled.resolve();
        },
      );
      await settled.promise;
      await host.manager.close();
      expect(host.manager.getTask(response.task_ids[0])?.status).toBe(status);
      expect(host.emitted).toEqual([]);
    });

    it('does not publish Orca events during cancellation or runner teardown', async () => {
      const child = controlledRunner();
      const host = await fixture(child.runner);
      const run = host.manager.run(
        { agent: 'worker', task: 'work', mode },
        host.ctx,
      );
      await child.started.promise;
      const id = host.manager.listActiveSessionTasks()[0].id;
      host.manager.cancel(id);
      host.manager.cancel(id);
      await child.aborted.promise;
      expect(host.emitted).toEqual([]);
      // A late runner failure must not override cancellation.
      child.result.reject(new Error('crash during abort cleanup'));
      await host.manager.close();
      await run;
      expect(host.manager.getTask(id)?.status).toBe('cancelled');
      expect(host.emitted).toEqual([]);
    });

    it('does not publish Orca events during timeout or runner teardown', async () => {
      vi.useFakeTimers();
      const child = controlledRunner();
      const host = await fixture(child.runner);
      fs.writeFileSync(
        path.join(env.tmp, '.pi', 'subagents.json'),
        JSON.stringify({ timeout_ms: 1000, timeout_warning_ms: 0 }),
      );
      const run = host.manager.run(
        { agent: 'worker', task: 'work', mode },
        host.ctx,
      );
      await child.started.promise;
      const id = host.manager.listActiveSessionTasks()[0].id;
      await vi.advanceTimersByTimeAsync(1000);
      await child.aborted.promise;
      expect(host.manager.getTask(id)?.status).toBe('stopping');
      expect(host.emitted).toEqual([]);
      // Cancellation/shutdown racing an expired deadline preserves its outcome.
      host.manager.cancel(id);
      child.result.resolve({ result: 'late result' });
      await host.manager.close();
      await vi.advanceTimersByTimeAsync(50);
      await run;
      expect(host.manager.getTask(id)).toMatchObject({
        status: 'failed',
        error_metadata: { category: 'total_timeout' },
      });
      expect(host.emitted).toEqual([]);
    });
  });

  it('does not publish Orca events on extension shutdown/reload, even if shutdown repeats', async () => {
    const child = controlledRunner();
    const host = await fixture(child.runner);
    const response = await host.manager.run(
      { agent: 'worker', task: 'work', mode: 'background' },
      host.ctx,
    );
    await child.started.promise;
    const id = response.task_ids[0];
    const shuttingDown = host.shutdown();
    await child.aborted.promise;
    expect(host.emitted).toEqual([]);
    child.result.resolve({ result: 'late result' });
    await shuttingDown;
    await host.shutdown();
    expect(host.manager.getTask(id)?.status).toBe('interrupted');
    expect(host.emitted).toEqual([]);
  });

  it('does not invoke a pre-aborted child or publish Orca events', async () => {
    const runner = vi.fn<SubagentRunner>(async () => ({
      result: 'unexpected',
    }));
    const host = await fixture(runner);
    const parent = new AbortController();
    parent.abort();
    const response = await host.manager.run(
      { agent: 'worker', task: 'work', mode: 'background' },
      host.ctx,
      parent.signal,
    );
    await host.manager.close();
    expect(runner).not.toHaveBeenCalled();
    expect(host.manager.getTask(response.task_ids[0])?.status).toBe(
      'cancelled',
    );
    expect(host.emitted).toEqual([]);
  });

  it('skips a cancelled queued child when capacity opens without shutting down', async () => {
    const child = controlledRunner();
    const runner = vi
      .fn<SubagentRunner>(async () => ({ result: 'next child completed' }))
      .mockImplementationOnce(child.runner);
    const host = await fixture(runner);
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ max_concurrency: 1 }),
    );
    const nextCompleted = deferred<void>();
    const response = await host.manager.run(
      {
        agents: ['worker', 'worker', 'worker'],
        task: 'work',
        mode: 'background',
      },
      host.ctx,
      undefined,
      (tasks) => {
        if (tasks[2]?.status === 'completed') nextCompleted.resolve();
      },
    );
    await child.started.promise;
    const [runningId, cancelledId, nextId] = response.task_ids;
    expect(host.manager.getTask(cancelledId)?.status).toBe('queued');
    host.manager.cancel(cancelledId);
    host.manager.cancel(cancelledId);
    child.result.resolve({ result: 'first child completed' });
    await nextCompleted.promise;
    expect(runner.mock.calls.map(([input]) => input.taskId)).toEqual([
      runningId,
      nextId,
    ]);
    expect(host.manager.getTask(cancelledId)?.status).toBe('cancelled');
    expect(host.manager.getTask(cancelledId)?.started_at).toBeUndefined();
    await host.manager.close();
    expect(host.emitted).toEqual([]);
  });

  it('does not publish Orca events when a continuation reuses the task id', async () => {
    const nested = path.join(env.tmp, 'nested.jsonl');
    fs.writeFileSync(nested, '{}');
    const host = await fixture(async () => ({
      result: 'done',
      nested_session_path: nested,
    }));
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ enable_continue: true }),
    );
    const response = await host.manager.run(
      { agent: 'worker', task: 'work', mode: 'task' },
      host.ctx,
    );
    const id = response.task_ids[0];
    const continued = await host.manager.continueTask(
      { task_id: id, prompt: 'follow up', mode: 'task' },
      host.ctx,
    );
    await host.manager.close();
    expect(continued.task_ids).toEqual([id]);
    expect(continued.results?.[0].status).toBe('completed');
    expect(host.emitted).toEqual([]);
  });
});
