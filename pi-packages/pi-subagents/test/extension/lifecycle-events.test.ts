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

function lifecycle(id: string, status: string, description = 'work') {
  return [
    'task:subagent:lifecycle',
    { id, runId: id, agent: 'worker', description, status },
  ];
}

function runnerExit(id: string) {
  return ['subagent:process-terminal', { runId: id }];
}

async function fixture(runner: SubagentRunner, withEvents = true) {
  env.writeAgent('worker');
  const handlers = new Map<string, Array<(...args: any[]) => unknown>>();
  const events = createEventBus();
  const emitted: Array<[string, { runId: string }]> = [];
  for (const name of ['task:subagent:lifecycle', 'subagent:process-terminal'])
    events.on(name, (payload) => {
      emitted.push([name, payload as { runId: string }]);
    });
  const ctx = { cwd: env.tmp, sessionId: 'parent', hasUI: false };
  subagentsExtension({
    events: withEvents ? events : undefined,
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
  return { manager, events, emitted, ctx, shutdown };
}

describe('parent subagent lifecycle events', () => {
  it.each([
    'task',
    'background',
  ] as const)('publishes one start, completion and runner exit in %s mode', async (mode) => {
    const host = await fixture(async () => ({ result: 'done' }));
    const completed = deferred<void>();
    const response = await host.manager.run(
      {
        agent: 'worker',
        task: 'Review the lifecycle contract',
        display_name: 'Review lifecycle',
        mode,
      },
      host.ctx,
      undefined,
      (tasks) => {
        if (tasks[0]?.status === 'completed') completed.resolve();
      },
    );
    await completed.promise;
    await host.manager.close();
    const id = response.task_ids[0];
    expect(host.emitted).toEqual([
      lifecycle(id, 'started', 'Review lifecycle'),
      lifecycle(id, 'completed', 'Review lifecycle'),
      runnerExit(id),
    ]);
  });

  it.each([
    'task',
    'background',
  ] as const)('publishes %s runner failure with a bounded task description', async (mode) => {
    const host = await fixture(async () => {
      throw new Error('child crashed');
    });
    const failed = deferred<void>();
    const response = await host.manager.run(
      { agent: 'worker', task: `Review\n  ${'x'.repeat(200)}`, mode },
      host.ctx,
      undefined,
      (tasks) => {
        if (tasks[0]?.status === 'failed') failed.resolve();
      },
    );
    await failed.promise;
    await host.manager.close();
    const id = response.task_ids[0];
    expect(host.manager.getTask(id)?.status).toBe('failed');
    expect(host.emitted).toEqual([
      lifecycle(id, 'started', `Review ${'x'.repeat(153)}`),
      lifecycle(id, 'failed', `Review ${'x'.repeat(153)}`),
      runnerExit(id),
    ]);
  });

  it.each([
    'task',
    'background',
  ] as const)('publishes cancellation once, only after %s runner teardown', async (mode) => {
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
    expect(host.emitted).toEqual([lifecycle(id, 'started')]);
    // A late runner failure must not override cancellation or emit twice.
    child.result.reject(new Error('crash during abort cleanup'));
    await host.manager.close();
    await run;
    host.manager.cancel(id);
    expect(host.manager.getTask(id)?.status).toBe('cancelled');
    expect(host.emitted).toEqual([
      lifecycle(id, 'started'),
      lifecycle(id, 'aborted'),
      runnerExit(id),
    ]);
  });

  it.each([
    'task',
    'background',
  ] as const)('publishes timeout failure once after %s runner teardown', async (mode) => {
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
    expect(host.emitted).toEqual([lifecycle(id, 'started')]);
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
    expect(host.emitted).toEqual([
      lifecycle(id, 'started'),
      lifecycle(id, 'failed'),
      runnerExit(id),
    ]);
  });

  it('publishes an aborted terminal on extension shutdown/reload, even if shutdown repeats', async () => {
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
    expect(host.emitted).toEqual([lifecycle(id, 'started')]);
    child.result.resolve({ result: 'late result' });
    await shuttingDown;
    await host.shutdown();
    expect(host.manager.getTask(id)?.status).toBe('interrupted');
    expect(host.emitted).toEqual([
      lifecycle(id, 'started'),
      lifecycle(id, 'aborted'),
      runnerExit(id),
    ]);
  });

  it('pairs a pre-aborted launch without invoking the child', async () => {
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
    const id = response.task_ids[0];
    expect(runner).not.toHaveBeenCalled();
    expect(host.emitted).toEqual([
      lifecycle(id, 'started'),
      lifecycle(id, 'aborted'),
    ]);
  });

  it('finishes every queued start as aborted without invoking a cancelled child', async () => {
    const child = controlledRunner();
    const host = await fixture(child.runner);
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ max_concurrency: 1 }),
    );
    const response = await host.manager.run(
      { agents: ['worker', 'worker'], task: 'work', mode: 'background' },
      host.ctx,
    );
    await child.started.promise;
    const [runningId, queuedId] = response.task_ids;
    expect(host.manager.getTask(queuedId)?.status).toBe('queued');
    host.manager.cancel(queuedId);
    host.manager.cancel(queuedId);
    const closing = host.manager.close();
    await child.aborted.promise;
    child.result.resolve({ result: 'late result' });
    await closing;
    expect(child.runner).toHaveBeenCalledOnce();
    expect(
      host.emitted.filter(([, payload]) => payload.runId === runningId),
    ).toEqual([
      lifecycle(runningId, 'started'),
      lifecycle(runningId, 'aborted'),
      runnerExit(runningId),
    ]);
    expect(
      host.emitted.filter(([, payload]) => payload.runId === queuedId),
    ).toEqual([lifecycle(queuedId, 'started'), lifecycle(queuedId, 'aborted')]);
  });

  it('pairs each attempt when a continuation reuses the task id', async () => {
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
    expect(host.emitted).toEqual([
      lifecycle(id, 'started'),
      lifecycle(id, 'completed'),
      runnerExit(id),
      lifecycle(id, 'started'),
      lifecycle(id, 'completed'),
      runnerExit(id),
    ]);
  });

  it('still completes when the parent has no extension event bus', async () => {
    const host = await fixture(async () => ({ result: 'done' }), false);
    const response = await host.manager.run(
      { agent: 'worker', task: 'work', mode: 'task' },
      host.ctx,
    );
    await host.manager.close();
    expect(response.results?.[0].status).toBe('completed');
    expect(host.emitted).toEqual([]);
  });

  it('attempts every event once without propagating event-bus failures', async () => {
    const host = await fixture(async () => ({ result: 'done' }));
    const emit = host.events.emit.bind(host.events);
    const publish = vi
      .spyOn(host.events, 'emit')
      .mockImplementation((name, payload) => {
        if (
          name === 'task:subagent:lifecycle' ||
          name === 'subagent:process-terminal'
        )
          throw new Error('status consumer unavailable');
        emit(name, payload);
      });
    const response = await host.manager.run(
      { agent: 'worker', task: 'work', mode: 'task' },
      host.ctx,
    );
    await host.manager.close();
    expect(response.results?.[0].status).toBe('completed');
    const id = response.task_ids[0];
    expect(
      publish.mock.calls.filter(
        ([name]) =>
          name === 'task:subagent:lifecycle' ||
          name === 'subagent:process-terminal',
      ),
    ).toEqual([
      lifecycle(id, 'started'),
      lifecycle(id, 'completed'),
      runnerExit(id),
    ]);
  });
});
