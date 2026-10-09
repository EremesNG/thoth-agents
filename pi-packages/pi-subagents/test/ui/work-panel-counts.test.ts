import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SubagentManager } from '../../src/manager.js';
import type { SubagentTask } from '../../src/types.js';
import { createSubagentsWorkPanelProvider } from '../../src/ui/work-panel-provider.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();

function persistedTask(overrides: Partial<SubagentTask> = {}): SubagentTask {
  return {
    id: 'persisted',
    agent: 'worker',
    mode: 'task',
    status: 'completed',
    task: 'persisted task',
    created_at: '2026-01-01T00:00:00Z',
    session_id: 'parent-a',
    ...overrides,
  };
}

function waitForTerminalTask(
  manager: SubagentManager,
  id: string,
): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = manager.onTaskUpdate(() => {
      const status = manager.getTask(id)?.status;
      if (
        status &&
        ['completed', 'failed', 'cancelled', 'interrupted'].includes(status)
      ) {
        unsubscribe();
        resolve();
      }
    });
  });
}

describe('Agents persisted session totals', () => {
  it('merges cached history with live tasks without duplicates, caps outcomes and refreshes on completion only', () => {
    let live = [persistedTask({ id: 'live', status: 'running' })];
    let updates = () => {};
    let reads = 0;
    const history = Array.from({ length: 8 }, (_, i) =>
      persistedTask({
        id: `old-${i}`,
        ended_at: new Date(1000 + i).toISOString(),
      }),
    );
    const agents = createSubagentsWorkPanelProvider({
      listTasks: () => live,
      listSessionTasks: () => {
        reads++;
        return [...live, ...history];
      },
      onTaskUpdate: (notify) => {
        updates = notify;
        return () => {};
      },
      cancel: () => {},
      open: () => {},
    });
    const unsubscribe = agents.onVisibleChanged?.(() => {});
    for (let frame = 0; frame < 3; frame++)
      expect(
        agents.listRows(frame, { includeHistory: true }).map((row) => row.id),
      ).toEqual(['live', 'old-7', 'old-6', 'old-5', 'old-4', 'old-3']);
    updates();
    expect(reads).toBe(1);
    live = [
      persistedTask({ id: 'live', ended_at: new Date(2000).toISOString() }),
    ];
    updates();
    expect(reads).toBe(2);
    expect(
      agents.listRows(2000, { includeHistory: true }).map((row) => row.id),
    ).toEqual(['live', 'old-7', 'old-6', 'old-5', 'old-4']);
    expect(agents.listRows(2000).map((row) => row.id)).toEqual(['live']);
    unsubscribe?.();
  });

  it('adds persisted-only totals without counting live terminal tasks twice or reading history during rendering', async () => {
    env.writeAgent('worker');
    const history = env.createHistoryStore();
    for (const [index, status] of [
      'completed',
      'completed',
      'failed',
      'cancelled',
      'interrupted',
    ].entries())
      history.upsertTask(
        env.tmp,
        persistedTask({
          id: `persisted-${index}`,
          status: status as SubagentTask['status'],
        }),
      );
    const manager = env.createManager(env.mockRunner(), history);
    const result = await manager.run(
      { agent: 'worker', task: 'live completed task', mode: 'task' },
      { cwd: env.tmp, sessionId: 'parent-a' },
    );
    const persistedCounts = history.snapshotSessionTaskCounts(
      env.tmp,
      'parent-a',
    );
    const agents = createSubagentsWorkPanelProvider({
      listTasks: () => manager.listActiveSessionTasks(env.tmp, 'parent-a'),
      persistedCounts,
      onTaskUpdate: (notify) => manager.onTaskUpdate(notify),
      cancel: (id, reason) => manager.cancel(id, reason),
      open: async () => {},
    });
    await manager.close();

    for (let frame = 0; frame < 3; frame++) {
      expect(agents.summary?.()).toMatchObject({
        completed: 3,
        failed: 3,
        running: 0,
        total: 6,
      });
      expect(agents.listRows(frame * 100).map((row) => row.id)).toEqual(
        result.task_ids,
      );
    }
    expect(persistedCounts.counts).toEqual({
      completed: 3,
      failed: 1,
      cancelled: 1,
      interrupted: 1,
    });
  });

  it('counts a task once when it completes and persists after the session snapshot', async () => {
    env.writeAgent('worker');
    const history = env.createHistoryStore();
    history.upsertTask(env.tmp, persistedTask());
    let finish = () => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const manager = env.createManager(async () => {
      await finished;
      return { result: 'finished' };
    }, history);
    const running = await manager.run(
      { agent: 'worker', task: 'finishes after snapshot', mode: 'background' },
      { cwd: env.tmp, sessionId: 'parent-a' },
    );
    const agents = createSubagentsWorkPanelProvider({
      listTasks: () => manager.listActiveSessionTasks(env.tmp, 'parent-a'),
      persistedCounts: history.snapshotSessionTaskCounts(env.tmp, 'parent-a'),
      onTaskUpdate: (notify) => manager.onTaskUpdate(notify),
      cancel: (id, reason) => manager.cancel(id, reason),
      open: async () => {},
    });
    try {
      expect(agents.summary?.()).toMatchObject({
        completed: 1,
        failed: 0,
        running: 1,
        total: 2,
      });
      const completed = waitForTerminalTask(manager, running.task_ids[0]);
      finish();
      await completed;
      expect(agents.summary?.()).toMatchObject({
        completed: 2,
        failed: 0,
        running: 0,
        total: 2,
      });
      const later = await manager.run(
        { agent: 'worker', task: 'starts after snapshot', mode: 'task' },
        { cwd: env.tmp, sessionId: 'parent-a' },
      );
      expect(agents.summary?.()).toMatchObject({
        completed: 3,
        failed: 0,
        running: 0,
        total: 3,
      });
      expect(
        agents
          .listRows(0)
          .map((row) => row.id)
          .sort(),
      ).toEqual([...running.task_ids, ...later.task_ids].sort());
    } finally {
      finish();
    }
  });

  it('replaces a persisted terminal baseline when that task is continued in memory later', async () => {
    env.writeAgent('worker');
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ enable_continue: true }),
    );
    const nestedSession = path.join(env.tmp, 'nested-session.jsonl');
    fs.writeFileSync(nestedSession, '');
    const history = env.createHistoryStore();
    history.upsertTask(env.tmp, persistedTask());
    history.upsertTask(
      env.tmp,
      persistedTask({ id: 'continued', nested_session_path: nestedSession }),
    );
    let finish = () => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const manager = env.createManager(async () => {
      await finished;
      throw new Error('continued attempt failed');
    }, history);
    const agents = createSubagentsWorkPanelProvider({
      listTasks: () => manager.listActiveSessionTasks(env.tmp, 'parent-a'),
      persistedCounts: manager.snapshotSessionTaskCounts(env.tmp, 'parent-a'),
      onTaskUpdate: (notify) => manager.onTaskUpdate(notify),
      cancel: (id, reason) => manager.cancel(id, reason),
      open: async () => {},
    });
    expect(agents.summary?.()).toMatchObject({
      completed: 2,
      failed: 0,
      running: 0,
      total: 2,
    });
    expect(agents.listRows(0)).toEqual([]);
    try {
      await manager.continueTask(
        { task_id: 'continued', prompt: 'retry', mode: 'background' },
        { cwd: env.tmp, sessionId: 'parent-a' },
      );
      expect(agents.summary?.()).toMatchObject({
        completed: 1,
        failed: 0,
        running: 1,
        total: 2,
      });
      const failed = waitForTerminalTask(manager, 'continued');
      finish();
      await failed;
      expect(agents.summary?.()).toMatchObject({
        completed: 1,
        failed: 1,
        running: 0,
        total: 2,
      });
      expect(agents.listRows(0).map((row) => row.id)).toEqual(['continued']);
    } finally {
      finish();
    }
  });
});
