import fs from 'node:fs';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import { SubagentHistoryStore } from '../src/history.js';
import { createSubagentResultTool } from '../src/tools/subagent-result.js';
import { createSubagentStatusTool } from '../src/tools/subagent-status.js';
import type { SubagentTask } from '../src/types.js';
import { createSubagentsWorkPanelProvider } from '../src/ui/work-panel-provider.js';
import { installSubagentTestEnv } from './helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();

describe('terminal task memory release', () => {
  it.each([
    'failed',
    'cancelled',
    'interrupted',
  ] as const)('keeps %s execution detail until runner cleanup and retains terminal identity after release', async (status) => {
    env.writeAgent('worker');
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const history = env.createHistoryStore();
    const manager = env.createManager(async ({ onActivity }) => {
      onActivity?.({
        message: 'working',
        transcript: 'partial transcript',
        thread_snapshot: env.statusSnapshot('partial snapshot'),
        system_prompt: 'system',
      });
      await gate;
      throw new Error('runner failed');
    }, history);
    const run = await manager.run(
      { agent: 'worker', task: 'work', mode: 'background' },
      { cwd: env.tmp, sessionId: 'parent' },
    );
    const id = run.task_ids[0];
    await setImmediate();
    try {
      if (status !== 'failed')
        manager.cancel(
          id,
          status === 'interrupted' ? 'Pi session shutdown' : 'cancelled',
        );
      expect(manager.listActiveSessionTasks()[0]).toMatchObject({
        status: status === 'failed' ? 'running' : 'stopping',
        transcript: 'partial transcript',
        thread_snapshot: env.statusSnapshot('partial snapshot'),
      });
    } finally {
      finish();
    }
    await vi.waitFor(() =>
      expect(manager.listActiveSessionTasks()[0].status).toBe(status),
    );
    const summary = manager.listActiveSessionTasks()[0];
    expect(summary).not.toHaveProperty('transcript');
    expect(summary).not.toHaveProperty('thread_snapshot');
    expect(summary).not.toHaveProperty('system_prompt');
    expect(manager.cancel(id)).toBe(summary);
    expect(
      await manager.sendMessage({
        task_id: id,
        session_id: 'parent',
        message: 'late',
      }),
    ).toMatchObject({ reason: 'not_running' });
    expect(history.getTask(env.tmp, id)?.status).toBe(status);
    expect(manager.getTask(id)?.transcript).toBe('partial transcript');
  });
  it('preserves terminal operations and work-panel counts, including status/result while compaction suspends hydration', async () => {
    env.writeAgent('worker');
    let before: ReturnType<typeof observe> | undefined;
    const history = env.createHistoryStore();
    const manager = env.createManager(
      async () => ({
        result: 'done',
        fallback_used: false,
        system_prompt: 'system',
        thread_snapshot: env.statusSnapshot('detail'),
      }),
      history,
      (task) => {
        before = observe(task.id);
      },
    );
    const panel = createSubagentsWorkPanelProvider({
      listTasks: () => manager.listActiveSessionTasks(env.tmp, 'parent'),
      onTaskUpdate: (notify) => manager.onTaskUpdate(notify),
      cancel: (id, reason) => manager.cancel(id, reason),
      open: () => {},
    });
    const ctx = { cwd: env.tmp, sessionId: 'parent' };
    async function observe(id: string) {
      const cancelled = manager.cancel(id);
      let extensionError = '';
      try {
        manager.extendDeadline(id, 100, 'parent');
      } catch (error) {
        extensionError = (error as Error).message;
      }
      return {
        cancelStatus: cancelled.status,
        extensionError,
        attention: manager.isAttentionCurrent(id, 1, 1),
        visible: panel.visibleCount?.(),
        counts: panel.summary?.(),
        message: await manager.sendMessage({
          task_id: id,
          session_id: 'parent',
          message: 'late',
        }),
        status: await createSubagentStatusTool(manager).execute(
          'status',
          { task_id: id },
          undefined,
          undefined,
          ctx,
        ),
        result: await createSubagentResultTool(manager).execute(
          'result',
          { task_id: id },
          undefined,
          undefined,
          ctx,
        ),
      };
    }
    const run = await manager.run(
      { agent: 'worker', task: 'work', mode: 'background' },
      ctx,
    );
    await setImmediate();
    const id = run.task_ids[0];
    expect(manager.listActiveSessionTasks()[0]).not.toHaveProperty(
      'thread_snapshot',
    );
    expect(await observe(id)).toEqual(await before);
    expect(manager.cancel(id)).toBe(manager.cancel(id));
    const compacting = SubagentHistoryStore.compactHistory({});
    // compactHistory suspends stores synchronously, before awaiting its first phase.
    expect(() => history.getTask(env.tmp, id)).toThrow('compaction');
    expect(manager.getTask(id)?.result).toBe('done');
    expect(manager.getTask(id)?.thread_snapshot).toBeUndefined();
    const duringStatus = createSubagentStatusTool(manager).execute(
      'status',
      { task_id: id },
      undefined,
      undefined,
      ctx,
    );
    const duringResult = createSubagentResultTool(manager).execute(
      'result',
      { task_id: id },
      undefined,
      undefined,
      ctx,
    );
    await compacting;
    const observed = await before!;
    expect(await duringStatus).toEqual(observed.status);
    expect(await duringResult).toEqual(observed.result);
    expect(manager.getTask(id)?.thread_snapshot).toEqual(
      env.statusSnapshot('detail'),
    );
  });

  it('hydrates continuation detail using the original cwd without retaining it in the summary', async () => {
    env.writeAgent('worker');
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ enable_continue: true }),
    );
    const nested = path.join(env.tmp, 'resume.jsonl');
    fs.writeFileSync(nested, '{}');
    const history = env.createHistoryStore();
    const snapshots: unknown[] = [];
    const manager = env.createManager(async ({ continuation, cwd }) => {
      expect(cwd).toBe(env.tmp);
      if (continuation) snapshots.push(continuation.previous_snapshot);
      return {
        result: 'done',
        fallback_used: false,
        nested_session_path: nested,
        thread_snapshot: env.statusSnapshot('detail'),
      };
    }, history);
    const result = await manager.run(
      { agent: 'worker', task: 'work', mode: 'task' },
      { cwd: env.tmp },
    );
    await setImmediate();
    const lookup = vi.spyOn(history, 'getTask');
    const next = await manager.continueTask(
      { task_id: result.task_ids[0], prompt: 'next', mode: 'task' },
      { cwd: path.join(env.tmp, 'other') },
    );
    expect(next.results?.[0]).toMatchObject({ attempt: 2, result: 'done' });
    expect(snapshots).toEqual([env.statusSnapshot('detail')]);
    expect(lookup.mock.calls.every(([cwd]) => cwd === env.tmp)).toBe(true);
    await setImmediate();
    expect(manager.listActiveSessionTasks()[0]).not.toHaveProperty(
      'thread_snapshot',
    );
  });
  it('never lets old foreground consumption release or wait for a same-id continuation', async () => {
    env.writeAgent('fast');
    env.writeAgent('slow');
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ enable_continue: true }),
    );
    const nested = path.join(env.tmp, 'session.jsonl');
    fs.writeFileSync(nested, '{}');
    let finishSlow!: () => void;
    let finishNext!: () => void;
    const slow = new Promise<void>((resolve) => {
      finishSlow = resolve;
    });
    const next = new Promise<void>((resolve) => {
      finishNext = resolve;
    });
    const manager = env.createManager(
      async ({ definition, continuation, onActivity }) => {
        if (continuation) {
          onActivity?.({
            message: 'next running',
            thread_snapshot: env.statusSnapshot('next detail'),
            system_prompt: 'next system',
          });
          await next;
        } else if (definition.name === 'slow') await slow;
        return {
          result: continuation ? 'next result' : 'first result',
          fallback_used: false,
          nested_session_path: nested,
          thread_snapshot: env.statusSnapshot('final detail'),
        };
      },
    );
    let results: SubagentTask[] | undefined;
    const running = manager
      .run(
        { agents: ['fast', 'slow'], task: 'work', mode: 'task' },
        { cwd: env.tmp },
      )
      .then((value) => {
        results = value.results;
      });
    try {
      await setImmediate();
      const id = manager
        .listActiveSessionTasks()
        .find((task) => task.agent === 'fast')!.id;
      await manager.continueTask(
        { task_id: id, prompt: 'next', mode: 'background' },
        { cwd: env.tmp },
      );
      await setImmediate();
      finishSlow();
      await vi.waitFor(() => expect(results).toBeDefined(), { timeout: 500 });
      expect(results?.find((task) => task.id === id)).toMatchObject({
        attempt: 1,
        result: 'first result',
      });
      expect(
        manager.listActiveSessionTasks().find((task) => task.id === id),
      ).toMatchObject({
        attempt: 2,
        status: 'running',
        system_prompt: 'next system',
        thread_snapshot: env.statusSnapshot('next detail'),
      });
    } finally {
      finishSlow();
      finishNext();
      await running;
    }
  });
  it.each([
    'once',
    'always',
  ])('keeps the full task and logs once when terminal writes fail %s', async (failureMode) => {
    env.writeAgent('worker');
    const history = env.createHistoryStore();
    const upsert = history.upsertTask.bind(history);
    let failed = false;
    vi.spyOn(history, 'upsertTask').mockImplementation((cwd, task) => {
      if (
        task.status === 'completed' &&
        (!failed || failureMode === 'always')
      ) {
        failed = true;
        throw new Error('database is locked');
      }
      upsert(cwd, task);
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const manager = env.createManager(async ({ onActivity }) => {
        onActivity?.({ message: 'working', transcript: 'detail' });
        return {
          result: 'done',
          fallback_used: false,
          system_prompt: 'system',
          thread_snapshot: env.statusSnapshot('detail'),
        };
      }, history);
      const run = await manager.run(
        { agent: 'worker', task: 'work', mode: 'background' },
        { cwd: env.tmp },
      );
      await setImmediate();
      expect(failed).toBe(true);
      expect(manager.listActiveSessionTasks()[0]).toMatchObject({
        system_prompt: 'system',
        thread_snapshot: env.statusSnapshot('detail'),
      });
      expect(manager.getTask(run.task_ids[0])?.transcript).toContain('detail');
      expect(log).toHaveBeenCalledOnce();
      expect(log.mock.calls[0].join(' ')).toContain(run.task_ids[0]);
    } finally {
      log.mockRestore();
    }
  });
  it('keeps settled siblings full until the foreground run has taken every result', async () => {
    env.writeAgent('fast');
    env.writeAgent('slow');
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const manager = env.createManager(async ({ definition }) => {
      if (definition.name === 'slow') await gate;
      return {
        result: definition.name,
        fallback_used: false,
        thread_snapshot: env.statusSnapshot('detail'),
      };
    });
    const running = manager.run(
      { agents: ['fast', 'slow'], task: 'work', mode: 'task' },
      { cwd: env.tmp },
    );
    try {
      await setImmediate();
      const fast = manager
        .listActiveSessionTasks()
        .find((task) => task.agent === 'fast')!;
      expect(fast.status).toBe('completed');
      expect(fast.thread_snapshot).toBeDefined();
    } finally {
      finish();
    }
    const result = await running;
    expect(result.results?.every((task) => task.thread_snapshot)).toBe(true);
    await setImmediate();
    expect(
      manager
        .listActiveSessionTasks()
        .every((task) => !('thread_snapshot' in task)),
    ).toBe(true);
  });
  it('keeps execution detail through terminal delivery, then retains only a hydratable summary after settlement', async () => {
    env.writeAgent('worker');
    const history = env.createHistoryStore();
    let delivery: unknown;
    const manager = env.createManager(
      async () => ({
        result: 'done',
        fallback_used: false,
        system_prompt: 'system detail',
        thread_snapshot: env.statusSnapshot('snapshot detail'),
      }),
      history,
      (task) => {
        delivery = {
          full: Boolean(task.thread_snapshot),
          retained: Boolean(
            manager.listActiveSessionTasks()[0].thread_snapshot,
          ),
          persisted: history.getTask(env.tmp, task.id)?.result,
        };
      },
    );
    const result = await manager.run(
      { agent: 'worker', task: 'work', mode: 'background' },
      { cwd: env.tmp, sessionId: 'parent' },
    );
    await setImmediate();
    expect(delivery).toEqual({ full: true, retained: true, persisted: 'done' });
    const summary = manager.listActiveSessionTasks()[0];
    expect(summary).toMatchObject({
      id: result.task_ids[0],
      status: 'completed',
      result: 'done',
    });
    expect(summary).not.toHaveProperty('transcript');
    expect(summary).not.toHaveProperty('thread_snapshot');
    expect(summary).not.toHaveProperty('system_prompt');
    expect(manager.getTask(summary.id)).toMatchObject({
      system_prompt: 'system detail',
      thread_snapshot: env.statusSnapshot('snapshot detail'),
    });
  });
});
