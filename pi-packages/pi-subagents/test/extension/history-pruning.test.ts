import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import subagentsExtension from '../../src/extension/subagents-extension.js';
import { resolveSubagentHistoryDbPath } from '../../src/history.js';
import type { SubagentManager } from '../../src/manager.js';
import { sdkSubagentRunner } from '../../src/runner.js';
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
vi.mock('../../src/runner.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/runner.js')>()),
  sdkSubagentRunner: vi.fn(),
}));

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
const env = installSubagentTestEnv();
let day = 0;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(Date.UTC(2030, 0, ++day));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function host(extension = subagentsExtension) {
  const handlers = new Map<string, (event: unknown, ctx: unknown) => unknown>();
  const commands = new Map<
    string,
    { handler: (args: string, ctx: unknown) => unknown }
  >();
  extension({
    registerTool: () => {},
    registerCommand: (
      name: string,
      command: { handler: (args: string, ctx: unknown) => unknown },
    ) => commands.set(name, command),
    on: (name: string, handler: (event: unknown, ctx: unknown) => unknown) =>
      handlers.set(name, handler),
  });
  const ctx = { cwd: env.tmp, hasUI: false, sessionId: 'parent' };
  if (!captured.manager)
    throw new Error('Extension did not register its manager.');
  return Object.assign(
    (name: string, liveCtx = ctx) => handlers.get(name)?.({}, liveCtx),
    {
      manager: captured.manager,
      ctx,
      compact: () => {
        const command = commands.get('subagents-history-compact');
        if (!command) throw new Error('Missing compaction command.');
        return command.handler('', ctx);
      },
    },
  );
}

function seed(id = 'old') {
  const store = env.createHistoryStore();
  store.upsertTask(env.tmp, {
    id,
    agent: 'worker',
    mode: 'task',
    status: 'completed',
    task: 'work',
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    result: 'final response',
    transcript: 'execution detail',
  });
  return store;
}

function holdRuns() {
  const finishers: Array<() => void> = [];
  vi.mocked(sdkSubagentRunner).mockImplementation(
    ({ signal }) =>
      new Promise((resolve) => {
        const finish = () =>
          resolve({
            result: 'done',
            model: 'mock/model',
            fallback_used: false,
          });
        finishers.push(finish);
        signal?.addEventListener('abort', finish, { once: true });
      }),
  );
  return finishers;
}

async function pauseAfterFirstBatch() {
  env.writeAgent('worker');
  const finishers = holdRuns();
  const history = seed('old-1');
  seed('old-2');
  seed('old-3');
  const owner = host();
  const exec = DatabaseSync.prototype.exec;
  let commits = 0;
  let launched: ReturnType<SubagentManager['run']> | undefined;
  vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementation(function (
    this: InstanceType<typeof DatabaseSync>,
    sql: string,
  ) {
    const result = exec.call(this, sql);
    if (sql === 'COMMIT' && ++commits === 1)
      launched = owner.manager.run(
        { agent: 'worker', task: 'pause maintenance', mode: 'background' },
        owner.ctx,
      );
    return result;
  });
  await owner('session_start');
  await vi.advanceTimersByTimeAsync(31000);
  await launched;
  return {
    owner,
    finishers,
    get commits() {
      return commits;
    },
    remaining: () =>
      history
        .listTasks(env.tmp)
        .filter((task) => task.id.startsWith('old-') && task.transcript).length,
  };
}

async function runDeferred() {
  await vi.advanceTimersByTimeAsync(30000);
  await vi.runAllTimersAsync();
}

function pruningState(): { pending: boolean; idleWaiters: Set<() => void> } {
  return Reflect.get(globalThis, Symbol.for('pi.subagents.historyPruning.v1'));
}

describe('deferred session-start history maintenance', () => {
  it.each([
    false,
    true,
  ])('hydrates legacy reload state without changing pending=%s or the hourly throttle', async (pending) => {
    const key = Symbol.for('pi.subagents.historyPruning.v1');
    const previous = Reflect.get(globalThis, key);
    const lastRunAt = Date.now() - 12345;
    const legacy = { lastRunAt, pending };
    let emit: ReturnType<typeof host> | undefined;
    Reflect.set(globalThis, key, legacy);
    try {
      vi.resetModules();
      emit = host(
        (await import('../../src/extension/subagents-extension.js')).default,
      );
      expect(Reflect.get(globalThis, key)).toBe(legacy);
      expect(Reflect.get(legacy, 'managers')).toBeInstanceOf(Set);
      expect(Reflect.get(legacy, 'idleWaiters')).toBeInstanceOf(Set);
      await emit('session_start');
      await runDeferred();
      expect(legacy.lastRunAt).toBe(lastRunAt);
      expect(legacy.pending).toBe(pending);
      await emit('session_shutdown');
      expect(legacy.pending).toBe(pending);
    } finally {
      await emit?.('session_shutdown');
      Reflect.set(globalThis, key, previous);
      vi.resetModules();
    }
  });

  it('schedules and gates maintenance after reloading over eligible legacy state', async () => {
    env.writeAgent('worker');
    const finishers = holdRuns();
    const history = seed();
    const key = Symbol.for('pi.subagents.historyPruning.v1');
    const previous = Reflect.get(globalThis, key);
    const legacy = { lastRunAt: -Infinity, pending: false };
    let emit: ReturnType<typeof host> | undefined;
    Reflect.set(globalThis, key, legacy);
    try {
      vi.resetModules();
      emit = host(
        (await import('../../src/extension/subagents-extension.js')).default,
      );
      expect(legacy).toMatchObject({ lastRunAt: -Infinity, pending: false });
      await emit('session_start');
      await emit.manager.run(
        { agent: 'worker', task: 'keep reload busy', mode: 'background' },
        emit.ctx,
      );
      await vi.advanceTimersByTimeAsync(30000);
      expect(legacy.pending).toBe(true);
      expect(pruningState().idleWaiters.size).toBe(1);
      expect(history.getTask(env.tmp, 'old')?.transcript).toBe(
        'execution detail',
      );
      finishers[0]?.();
      await vi.runAllTimersAsync();
      expect(history.getTask(env.tmp, 'old')?.transcript).toBeUndefined();
      expect(legacy.pending).toBe(false);
      expect(pruningState().idleWaiters.size).toBe(0);
    } finally {
      const closing = emit?.('session_shutdown');
      await vi.runAllTimersAsync();
      await closing;
      Reflect.set(globalThis, key, previous);
      vi.resetModules();
    }
  });

  it('cancels and detaches an owner shutdown wait while another manager stays active, allowing a later request', async () => {
    env.writeAgent('worker');
    const finishers = holdRuns();
    const history = seed();
    const owner = host();
    const child = host();
    let later: ReturnType<typeof host> | undefined;
    try {
      await owner('session_start');
      await child.manager.run(
        { agent: 'worker', task: 'keep process busy', mode: 'background' },
        child.ctx,
      );
      await vi.advanceTimersByTimeAsync(30000);
      expect(pruningState().idleWaiters.size).toBe(1);
      await owner('session_shutdown');
      expect(pruningState().idleWaiters.size).toBe(0);
      expect(pruningState().pending).toBe(false);
      expect(history.getTask(env.tmp, 'old')?.transcript).toBe(
        'execution detail',
      );

      later = host();
      await later('session_start');
      await vi.advanceTimersByTimeAsync(30000);
      expect(pruningState().pending).toBe(true);
      expect(pruningState().idleWaiters.size).toBe(1);
      finishers[0]?.();
      await vi.runAllTimersAsync();
      expect(history.getTask(env.tmp, 'old')?.transcript).toBeUndefined();
      expect(pruningState().pending).toBe(false);
    } finally {
      const closing = child('session_shutdown');
      await vi.runAllTimersAsync();
      await closing;
      await owner('session_shutdown');
      await later?.('session_shutdown');
    }
  });

  it('pauses for running and queued tasks across extension instances and resumes the pending pass when idle', async () => {
    env.writeAgent('worker');
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ max_concurrency: 1 }),
    );
    const finishers = holdRuns();
    const history = seed();
    const emit = host();
    vi.resetModules();
    const child = host(
      (await import('../../src/extension/subagents-extension.js')).default,
    );
    const exec = vi.spyOn(DatabaseSync.prototype, 'exec');
    try {
      await emit('session_start');
      await child('session_start');
      let checkedQueued = false;
      exec.mockClear();
      const release = child.manager.onTaskUpdate(() => {
        const tasks = child.manager.listTasks();
        if (
          !checkedQueued &&
          tasks.some((task) => task.status === 'queued') &&
          !tasks.some((task) => task.status === 'running')
        ) {
          checkedQueued = true;
          vi.advanceTimersByTime(30000);
        }
      });
      await child.manager.run(
        { agent: 'worker', task: 'first', mode: 'background' },
        child.ctx,
      );
      release();
      expect(checkedQueued).toBe(true);
      expect(
        exec.mock.calls.filter(([sql]) => sql === 'BEGIN IMMEDIATE'),
      ).toHaveLength(0);
      await child.manager.run(
        { agent: 'worker', task: 'second', mode: 'background' },
        child.ctx,
      );
      expect(
        child.manager
          .listTasks()
          .map((task) => task.status)
          .sort(),
      ).toEqual(['queued', 'running']);
      exec.mockClear();
      await vi.advanceTimersByTimeAsync(90000);
      expect(
        exec.mock.calls.filter(([sql]) => sql === 'BEGIN IMMEDIATE'),
      ).toHaveLength(0);
      expect(
        exec.mock.calls.some(([sql]) =>
          sql.includes('idx_subagent_tasks_retention_detail'),
        ),
      ).toBe(false);
      expect(history.getTask(env.tmp, 'old')?.transcript).toBe(
        'execution detail',
      );
      finishers[0]?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(
        child.manager.listTasks().some((task) => task.status === 'running'),
      ).toBe(true);
      expect(history.getTask(env.tmp, 'old')?.transcript).toBe(
        'execution detail',
      );
      finishers[1]?.();
      await vi.runAllTimersAsync();
      expect(history.getTask(env.tmp, 'old')?.transcript).toBeUndefined();
      expect(
        exec.mock.calls.filter(([sql]) => sql === 'BEGIN IMMEDIATE').length,
      ).toBeGreaterThan(0);
      expect(
        exec.mock.calls.some(([sql]) =>
          sql.includes('idx_subagent_tasks_retention_detail'),
        ),
      ).toBe(true);
    } finally {
      const closing = child('session_shutdown');
      await vi.runAllTimersAsync();
      await closing;
      await emit('session_shutdown');
    }
  });

  it('stops before the next batch when a task starts mid-pass and completes the same pass after idle', async () => {
    const paused = await pauseAfterFirstBatch();
    const { owner, finishers, remaining } = paused;
    try {
      expect(paused.commits).toBe(1);
      expect(remaining()).toBe(2);
      // Another eligible startup cannot overlap an interrupted pass.
      vi.setSystemTime(Date.now() + 60 * 60 * 1000);
      await owner('session_start');
      await vi.advanceTimersByTimeAsync(30000);
      expect(paused.commits).toBe(1);
      finishers[0]?.();
      await vi.runAllTimersAsync();
      expect(remaining()).toBe(0);
      expect(paused.commits).toBeGreaterThan(1);
    } finally {
      const closing = owner('session_shutdown');
      await vi.runAllTimersAsync();
      await closing;
    }
  });

  it('aborts an obsolete mid-pass wait on context replacement and lets a later request retry within the hour', async () => {
    const paused = await pauseAfterFirstBatch();
    const { owner, finishers, remaining } = paused;
    const replacement = { ...owner.ctx, sessionId: 'replacement' };
    try {
      expect(remaining()).toBe(2);
      expect(pruningState().idleWaiters.size).toBe(1);
      await owner('session_start', replacement);
      await vi.advanceTimersByTimeAsync(0);
      expect(pruningState().idleWaiters.size).toBe(0);
      expect(pruningState().pending).toBe(false);
      expect(remaining()).toBe(2);
      finishers[0]?.();
      await vi.runAllTimersAsync();
      expect(remaining()).toBe(2);
      expect(paused.commits).toBe(1);
      expect(pruningState().idleWaiters.size).toBe(0);
      expect(pruningState().pending).toBe(false);
      await owner('session_start', replacement);
      await runDeferred();
      expect(remaining()).toBe(0);
    } finally {
      const closing = owner('session_shutdown');
      await vi.runAllTimersAsync();
      await closing;
    }
  });

  it('compacts without waiting for active tasks by aborting a paused maintenance pass', async () => {
    const { owner, finishers, remaining } = await pauseAfterFirstBatch();
    let compacting: Promise<unknown> | undefined;
    try {
      expect(remaining()).toBe(2);
      expect(pruningState().idleWaiters.size).toBe(1);
      // VACUUM only, so any additional clearing would come from the obsolete pass.
      fs.writeFileSync(
        path.join(env.tmp, '.pi', 'subagents.json'),
        JSON.stringify({ history_detail_retention_days: 0 }),
      );
      let completed = false;
      compacting = Promise.resolve(owner.compact()).then(() => {
        completed = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(completed).toBe(true);
      expect(
        owner.manager.listTasks().some((task) => task.status === 'running'),
      ).toBe(true);
      expect(pruningState().idleWaiters.size).toBe(0);
      expect(pruningState().pending).toBe(false);
      expect(remaining()).toBe(2);
      finishers[0]?.();
      await vi.runAllTimersAsync();
      expect(remaining()).toBe(2);
      fs.writeFileSync(
        path.join(env.tmp, '.pi', 'subagents.json'),
        JSON.stringify({ history_detail_retention_days: 14 }),
      );
      await owner('session_start');
      await runDeferred();
      expect(remaining()).toBe(0);
    } finally {
      finishers[0]?.();
      await vi.runAllTimersAsync();
      await compacting;
      const closing = owner('session_shutdown');
      await vi.runAllTimersAsync();
      await closing;
    }
  });

  it('returns before pruning, unrefs the timer and rate-limits across extension instances until the next eligible session start', async () => {
    const history = seed();
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const emit = host();
    let second: ReturnType<typeof host> | undefined;
    try {
      await emit('session_start');
      expect(history.getTask(env.tmp, 'old')?.transcript).toBe(
        'execution detail',
      );
      const timer =
        timers.mock.results[
          timers.mock.calls.findIndex((call) => call[1] === 30000)
        ]?.value;
      expect(timer?.hasRef()).toBe(false);
      await vi.advanceTimersByTimeAsync(29999);
      expect(history.getTask(env.tmp, 'old')?.transcript).toBe(
        'execution detail',
      );
      await runDeferred();
      expect(history.getTask(env.tmp, 'old')).toMatchObject({
        result: 'final response',
        transcript: undefined,
      });

      seed('old-again');
      // Child loaders and extension reloads may evaluate a fresh module copy.
      vi.resetModules();
      second = host(
        (await import('../../src/extension/subagents-extension.js')).default,
      );
      await second('session_start');
      await runDeferred();
      expect(history.getTask(env.tmp, 'old-again')?.transcript).toBe(
        'execution detail',
      );
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      // No recurring timer: the next session start is what requests another pass.
      expect(history.getTask(env.tmp, 'old-again')?.transcript).toBe(
        'execution detail',
      );
      await emit('session_start');
      await runDeferred();
      expect(history.getTask(env.tmp, 'old-again')?.transcript).toBeUndefined();
    } finally {
      await emit('session_shutdown');
      await second?.('session_shutdown');
    }
  });

  it('disables all pruning with retention 0 and uses configured retention on a later session start', async () => {
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ history_detail_retention_days: 0 }),
    );
    const history = seed();
    const emit = host();
    try {
      await emit('session_start');
      await runDeferred();
      expect(history.getTask(env.tmp, 'old')?.transcript).toBe(
        'execution detail',
      );
      fs.writeFileSync(
        path.join(env.tmp, '.pi', 'subagents.json'),
        JSON.stringify({ history_detail_retention_days: 30 }),
      );
      await emit('session_start');
      await runDeferred();
      expect(history.getTask(env.tmp, 'old')?.transcript).toBe(
        'execution detail',
      );
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      fs.writeFileSync(
        path.join(env.tmp, '.pi', 'subagents.json'),
        JSON.stringify({ history_detail_retention_days: 2 }),
      );
      await emit('session_start');
      await runDeferred();
      expect(history.getTask(env.tmp, 'old')?.transcript).toBeUndefined();
    } finally {
      await emit('session_shutdown');
    }
  });

  it('does not open maintenance for a session that shut down before the timer fired', async () => {
    const history = seed();
    const emit = host();
    await emit('session_start');
    await emit('session_shutdown');
    await runDeferred();
    expect(history.getTask(env.tmp, 'old')?.transcript).toBe(
      'execution detail',
    );
  });

  it('never fails session start when the deferred database is busy or cannot open', async () => {
    const history = seed();
    const emit = host();
    const writer = new DatabaseSync(resolveSubagentHistoryDbPath());
    try {
      writer.exec('BEGIN IMMEDIATE');
      await expect(
        Promise.resolve(emit('session_start')),
      ).resolves.toBeUndefined();
      await runDeferred();
      expect(history.getTask(env.tmp, 'old')?.transcript).toBe(
        'execution detail',
      );
      writer.exec('ROLLBACK');
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      await emit('session_start');
      // Startup has finished. The deferred opener will now fail, not the hook.
      process.env.PI_SUBAGENTS_HISTORY_DB_PATH = env.tmp;
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(runDeferred()).resolves.toBeUndefined();
      expect(error).toHaveBeenCalled();
    } finally {
      writer.close();
      await emit('session_shutdown');
    }
  });
});
