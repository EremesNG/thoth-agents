import { createEventBus } from '@earendil-works/pi-coding-agent';
import {
  isSubagentsSnapshot,
  request,
  SUBAGENTS_STATE_CHANNEL,
  SUBAGENTS_STATE_REQUEST,
  type SubagentsSnapshot,
  type ThothEnvelope,
} from '@thoth-agents/pi-core';
import { describe, expect, it, vi } from 'vitest';
import subagentsExtension from '../src/extension/subagents-extension.js';
import type { SubagentSessionTaskCounts } from '../src/history.js';
import { SubagentsStatePublisher } from '../src/task-state-events.js';
import type { SubagentActivity, SubagentTask } from '../src/types.js';
import { installSubagentTestEnv } from './helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();

function collectSnapshots() {
  const events = createEventBus();
  const snapshots: ThothEnvelope<SubagentsSnapshot>[] = [];
  events.on(SUBAGENTS_STATE_CHANNEL.name, (snapshot) => {
    snapshots.push(JSON.parse(JSON.stringify(snapshot)));
  });
  return { events, snapshots };
}

function task(overrides: Partial<SubagentTask> = {}): SubagentTask {
  return {
    id: 'task-a',
    agent: 'worker',
    mode: 'background',
    status: 'completed',
    task: 'private task text',
    created_at: '2026-01-01T00:00:00.000Z',
    session_id: 'parent-a',
    ...overrides,
  };
}

function taskSource(
  tasks: SubagentTask[],
  persistedCounts: SubagentSessionTaskCounts = {
    counts: { completed: 141, failed: 17 },
    statusesById: new Map(),
  },
) {
  const listeners = new Set<() => void>();
  return {
    listActiveSessionTasks: vi.fn((_cwd?: string, sessionId?: string) =>
      tasks.filter((entry) => !sessionId || entry.session_id === sessionId),
    ),
    listSessionHistoryByCost: vi.fn(() => [] as SubagentTask[]),
    snapshotSessionTaskCounts: vi.fn(() => persistedCounts),
    onTaskUpdate(notify: () => void) {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    update() {
      for (const notify of listeners) notify();
    },
  };
}

describe('subagent task-state publication', () => {
  it('scopes real manager tasks to the active session while retaining history-only tasks in totals, not details', async () => {
    env.writeAgent('worker');
    const history = env.createHistoryStore();
    const manager = env.createManager(env.mockRunner(), history);
    const a = await manager.run(
      { agent: 'worker', task: 'private parent-a task', mode: 'task' },
      { cwd: env.tmp, sessionId: 'parent-a' },
    );
    const b = await manager.run(
      { agent: 'worker', task: 'private parent-b task', mode: 'task' },
      { cwd: env.tmp, sessionId: 'parent-b' },
    );
    history.upsertTask(env.tmp, task({ id: 'history-only' }));
    const { events, snapshots } = collectSnapshots();
    const publisher = new SubagentsStatePublisher(events, manager);
    try {
      publisher.startSession(env.tmp, 'parent-a');
      expect(snapshots[0]?.data.tasks.map(({ id }) => id)).toEqual(a.task_ids);
      expect(snapshots[0]?.data.history.map(({ id }) => id)).toEqual([
        'history-only',
      ]);
      expect(snapshots[0]?.data.counts.completed).toBe(1);
      expect(snapshots[0]?.data.totals).toMatchObject({
        total: 2,
        completed: 2,
      });
      publisher.startSession(env.tmp, 'parent-b');
      expect(snapshots[1]?.sessionId).toBe('parent-b');
      expect(snapshots[1]?.data.tasks.map(({ id }) => id)).toEqual(b.task_ids);
      expect(snapshots[1]?.data.totals).toMatchObject({
        total: 1,
        completed: 1,
      });
      publisher.startSession(env.tmp, 'empty-parent');
      expect(snapshots[2]?.data).toMatchObject({
        tasks: [],
        totals: { total: 0 },
      });
      expect(snapshots.every(({ data }) => isSubagentsSnapshot(data))).toBe(
        true,
      );
    } finally {
      publisher.dispose();
    }
  });

  it('publishes the highest-cost persisted history beyond the newest 100, without live overlaps or foreign tasks', async () => {
    env.writeAgent('worker');
    const history = env.createHistoryStore();
    const manager = env.createManager(env.mockRunner(), history);
    const live = await manager.run(
      { agent: 'worker', task: 'live', mode: 'task' },
      { cwd: env.tmp, sessionId: 'parent-a' },
    );
    const usage = (cost: number) => ({
      input: 1,
      output: 2,
      cost,
      cacheRead: 0,
      cacheWrite: 0,
      contextTokens: 0,
      turns: 1,
    });
    history.upsertTask(
      env.tmp,
      task({
        id: 'old-expensive',
        display_name: 'Old review',
        usage: usage(50),
        prompt: 'private',
        output_preview: 'x'.repeat(900),
      }),
    );
    for (let i = 0; i < 110; i++)
      history.upsertTask(
        env.tmp,
        task({
          id: `new-${i}`,
          created_at: new Date(
            Date.parse('2026-02-01T00:00:00Z') + i,
          ).toISOString(),
          usage: usage(i / 100),
        }),
      );
    history.upsertTask(
      env.tmp,
      task({ id: 'foreign', session_id: 'parent-b', usage: usage(100) }),
    );
    history.upsertTask(
      `${env.tmp}/foreign-cwd`,
      task({ id: 'foreign-cwd', usage: usage(200) }),
    );
    expect(
      history.listSessionTasks(env.tmp, 'parent-a').map(({ id }) => id),
    ).not.toContain('old-expensive');
    expect(
      manager.listSessionTasks(env.tmp, 'parent-a').map(({ id }) => id),
    ).not.toContain('old-expensive');
    const { events, snapshots } = collectSnapshots();
    const publisher = new SubagentsStatePublisher(events, manager);
    try {
      publisher.startSession(env.tmp, 'parent-a');
      const snapshot = snapshots[0];
      if (!snapshot) throw new Error('Expected history snapshot');
      expect(snapshot.v).toBe(2);
      expect(snapshot.data.history).toHaveLength(100);
      expect(snapshot.data.history[0]).toMatchObject({
        id: 'old-expensive',
        displayName: 'Old review',
        usage: { cost: 50 },
        preview: 'x'.repeat(800),
      });
      expect(snapshot.data.history.map(({ id }) => id)).not.toContain(
        'foreign',
      );
      expect(snapshot.data.history.map(({ id }) => id)).not.toContain(
        'foreign-cwd',
      );
      expect(snapshot.data.history[1]?.usage?.cost).toBe(1.09);
      expect(snapshot.data.history.at(-1)?.usage?.cost).toBe(0.11);
      expect(snapshot.data.history.map(({ id }) => id)).not.toContain(
        live.task_ids[0],
      );
      expect(isSubagentsSnapshot(snapshot.data)).toBe(true);
      expect(JSON.stringify(snapshot)).not.toContain('private');
    } finally {
      publisher.dispose();
    }
  });

  it('reuses the manager 150-ms activity coalescing without delaying lifecycle transitions', async () => {
    env.writeAgent('worker');
    let reportActivity!: (activity: SubagentActivity) => void;
    let markStarted!: () => void;
    let finishRunner!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const finished = new Promise<void>((resolve) => {
      finishRunner = resolve;
    });
    const manager = env.createManager(async ({ onActivity }) => {
      if (!onActivity) throw new Error('Missing runner activity callback');
      reportActivity = onActivity;
      markStarted();
      await finished;
      return { result: 'finished' };
    });
    const { events, snapshots } = collectSnapshots();
    const publisher = new SubagentsStatePublisher(events, manager);
    vi.useFakeTimers();
    try {
      publisher.startSession(env.tmp, 'parent-a');
      const run = await manager.run(
        { agent: 'worker', task: 'work', mode: 'background' },
        { cwd: env.tmp, sessionId: 'parent-a' },
      );
      await started;
      expect(snapshots.map(({ data }) => data.tasks[0]?.status)).toEqual([
        undefined,
        'queued',
        'running',
      ]);
      snapshots.length = 0;
      reportActivity({ message: 'streaming output', output: 'first' });
      reportActivity({ message: 'streaming output', output: 'latest' });
      await vi.advanceTimersByTimeAsync(149);
      expect(snapshots).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]?.data.tasks[0]).toMatchObject({
        status: 'running',
        preview: 'latest',
      });
      snapshots.length = 0;
      reportActivity({ message: 'streaming output', output: 'pending' });
      manager.cancel(run.task_ids[0]);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]?.data.tasks[0]?.status).toBe('stopping');
      finishRunner();
      await manager.close();
      expect(snapshots).toHaveLength(2);
      expect(snapshots[1]?.data.tasks[0]?.status).toBe('cancelled');
      await vi.advanceTimersByTimeAsync(150);
      expect(snapshots).toHaveLength(2);
      expect(snapshots.every(({ data }) => isSubagentsSnapshot(data))).toBe(
        true,
      );
    } finally {
      publisher.dispose();
      finishRunner();
      await manager.close();
      vi.useRealTimers();
    }
  });

  it('wires readiness, switch, tree and compaction snapshots into the extension and disposes on shutdown', async () => {
    const { events, snapshots } = collectSnapshots();
    const history = env.createHistoryStore();
    history.upsertTask(env.tmp, task({ id: 'persisted-a' }));
    history.upsertTask(
      env.tmp,
      task({ id: 'persisted-b', session_id: 'parent-b', status: 'failed' }),
    );
    const handlers = new Map<
      string,
      Array<(event: unknown, ctx: unknown) => unknown>
    >();
    subagentsExtension({
      events,
      registerTool: () => {},
      on(name: string, handler: (event: unknown, ctx: unknown) => unknown) {
        const registered = handlers.get(name) ?? [];
        registered.push(handler);
        handlers.set(name, registered);
      },
    });
    let sessionId: string | undefined = 'parent-a';
    const ctx = {
      cwd: env.tmp,
      hasUI: false,
      sessionManager: { getSessionId: () => sessionId },
    };
    const emit = async (name: string) => {
      for (const handler of handlers.get(name) ?? []) await handler({}, ctx);
    };
    request(events, SUBAGENTS_STATE_REQUEST, {
      sessionId: 'parent-a',
      source: 'consumer',
      data: {},
    });
    expect(snapshots).toEqual([]);
    try {
      await emit('session_start');
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]?.data).toMatchObject({
        tasks: [],
        totals: { total: 1, completed: 1 },
      });
      for (const name of ['session_start', 'session_tree', 'session_compact']) {
        snapshots.length = 0;
        sessionId = 'parent-b';
        if (name === 'session_start') {
          request(events, SUBAGENTS_STATE_REQUEST, {
            sessionId: 'parent-b',
            source: 'consumer',
            data: {},
          });
          request(events, SUBAGENTS_STATE_REQUEST, {
            sessionId: 'parent-b',
            source: 'consumer',
            data: {},
          });
          expect(snapshots).toEqual([]);
        }
        await emit(name);
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0]?.sessionId).toBe('parent-b');
        expect(snapshots[0]?.data).toMatchObject({
          tasks: [],
          totals: { total: 1, failed: 1, completed: 0 },
        });
      }
      snapshots.length = 0;
      sessionId = 'empty-parent';
      await emit('session_start');
      expect(snapshots[0]?.data).toMatchObject({
        tasks: [],
        totals: { total: 0 },
      });
      snapshots.length = 0;
      sessionId = undefined;
      await emit('session_start');
      request(events, SUBAGENTS_STATE_REQUEST, {
        sessionId: 'parent-b',
        source: 'consumer',
        data: {},
      });
      expect(snapshots).toEqual([]);
    } finally {
      await emit('session_shutdown');
    }
    request(events, SUBAGENTS_STATE_REQUEST, {
      sessionId: 'parent-a',
      source: 'consumer',
      data: {},
    });
    expect(snapshots).toEqual([]);
  });

  it('publishes complete live counts and freshly read persisted totals for the switched session on each manager update', () => {
    const { events, snapshots } = collectSnapshots();
    const tasks = [
      task(),
      task({ id: 'task-b', session_id: 'parent-b', status: 'running' }),
      task({ id: 'unowned', session_id: undefined }),
    ];
    const source = taskSource(tasks);
    const publisher = new SubagentsStatePublisher(events, source);
    try {
      publisher.startSession('/workspace-a', 'parent-a');
      source.snapshotSessionTaskCounts.mockReturnValue({
        counts: { running: 1, completed: 2 },
        statusesById: new Map(),
      });
      publisher.startSession('/workspace-b', 'parent-b');
      expect(snapshots[1]?.data.tasks).toEqual([
        {
          id: 'task-b',
          agent: 'worker',
          mode: 'background',
          status: 'running',
          createdAt: 1767225600000,
        },
      ]);
      snapshots.length = 0;
      tasks[1].status = 'stopping';
      source.snapshotSessionTaskCounts.mockReturnValue({
        counts: { stopping: 1, completed: 2 },
        statusesById: new Map(),
      });
      source.update();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]?.sessionId).toBe('parent-b');
      expect(
        snapshots[0]?.data.tasks.map(({ id, status }) => ({ id, status })),
      ).toEqual([{ id: 'task-b', status: 'stopping' }]);
      expect(snapshots[0]?.data.counts).toEqual({
        queued: 0,
        running: 0,
        stopping: 1,
        completed: 0,
        failed: 0,
        cancelled: 0,
        interrupted: 0,
      });
      expect(snapshots[0]?.data.totals).toEqual({
        total: 3,
        queued: 0,
        running: 0,
        stopping: 1,
        completed: 2,
        failed: 0,
        cancelled: 0,
        interrupted: 0,
      });
      expect(source.listActiveSessionTasks).toHaveBeenLastCalledWith(
        '/workspace-b',
        'parent-b',
      );
      expect(source.snapshotSessionTaskCounts).toHaveBeenLastCalledWith(
        '/workspace-b',
        'parent-b',
      );
      snapshots.length = 0;
      publisher.startSession('/workspace-b', undefined);
      source.update();
      expect(snapshots).toEqual([]);
    } finally {
      publisher.dispose();
    }
    snapshots.length = 0;
    source.update();
    expect(snapshots).toEqual([]);
  });

  it('coalesces early requests into the readiness snapshot and answers only the current session thereafter', () => {
    const { events, snapshots } = collectSnapshots();
    const source = taskSource([task()]);
    const publisher = new SubagentsStatePublisher(events, source);
    const ask = (sessionId: string) =>
      request(events, SUBAGENTS_STATE_REQUEST, {
        sessionId,
        source: 'consumer',
        data: {},
      });
    try {
      ask('parent-a');
      ask('parent-a');
      ask('foreign-parent');
      source.update();
      expect(snapshots).toEqual([]);
      expect(source.listActiveSessionTasks).not.toHaveBeenCalled();
      publisher.startSession('/workspace', undefined);
      expect(snapshots).toEqual([]);
      publisher.startSession('/workspace', 'parent-a');
      expect(snapshots).toHaveLength(1);
      snapshots.length = 0;
      ask('parent-a');
      ask('foreign-parent');
      events.emit(SUBAGENTS_STATE_REQUEST.name, {
        v: 2,
        source: 'consumer',
        sessionId: 'parent-a',
        at: 0,
        data: {},
      });
      events.emit(SUBAGENTS_STATE_REQUEST.name, {
        v: 2,
        source: 'consumer',
        sessionId: 'parent-a',
        at: 0,
        data: { prompt: 'excluded' },
      });
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]?.sessionId).toBe('parent-a');
    } finally {
      publisher.dispose();
    }
    snapshots.length = 0;
    ask('parent-a');
    source.update();
    expect(snapshots).toEqual([]);
  });

  it('serializes only summary keys with bounded preview, Unix-ms times and uncapped persisted totals', () => {
    const { events, snapshots } = collectSnapshots();
    const source = taskSource([
      task({
        display_name: 'Review',
        started_at: '2026-01-01T00:00:01.000Z',
        ended_at: '2026-01-01T00:00:02.000Z',
        last_activity_at: '2026-01-01T00:00:01.500Z',
        model: 'provider/model',
        effort: 'max',
        output_preview: 'x'.repeat(900),
        usage: {
          input: 12,
          output: 34,
          cost: 0.125,
          cacheRead: 56,
          cacheWrite: 78,
          turns: 9,
          contextTokens: 90,
        },
        prompt: 'private prompt',
        continuation_prompt: 'private continuation',
        system_prompt: 'private system prompt',
        context: 'private context',
        transcript: 'private transcript',
        result: 'private result',
        thread_snapshot: {
          version: 1,
          source: 'events',
          items: [{ type: 'status', text: 'private thread' }],
        },
        progress_updates: [
          {
            message: 'private progress',
            created_at: '2026-01-01T00:00:01.000Z',
          },
        ],
        pending_questions: [
          {
            request_id: 'private question',
            message: 'private question text',
            created_at: '2026-01-01T00:00:01.000Z',
          },
        ],
        nested_session_path: 'private path',
      }),
    ]);
    const publisher = new SubagentsStatePublisher(events, source);
    try {
      publisher.startSession('/workspace', 'parent-a');
      expect(snapshots).toHaveLength(1);
      const snapshot = snapshots[0];
      expect(Object.keys(snapshot).sort()).toEqual([
        'at',
        'data',
        'sessionId',
        'source',
        'v',
      ]);
      expect(snapshot).toMatchObject({
        v: 2,
        source: '@thoth-agents/pi-subagents',
        sessionId: 'parent-a',
        at: expect.any(Number),
      });
      expect(isSubagentsSnapshot(snapshot.data)).toBe(true);
      expect(Object.keys(snapshot.data).sort()).toEqual([
        'counts',
        'history',
        'tasks',
        'totals',
      ]);
      expect(snapshot.data.tasks).toEqual([
        {
          id: 'task-a',
          agent: 'worker',
          displayName: 'Review',
          mode: 'background',
          status: 'completed',
          model: 'provider/model',
          effort: 'max',
          createdAt: 1767225600000,
          startedAt: 1767225601000,
          endedAt: 1767225602000,
          lastActivityAt: 1767225601500,
          usage: { input: 12, output: 34, cost: 0.125 },
          preview: 'x'.repeat(800),
        },
      ]);
      expect(snapshot.data.counts).toEqual({
        queued: 0,
        running: 0,
        stopping: 0,
        completed: 1,
        failed: 0,
        cancelled: 0,
        interrupted: 0,
      });
      expect(snapshot.data.totals).toEqual({
        total: 158,
        queued: 0,
        running: 0,
        stopping: 0,
        completed: 141,
        failed: 17,
        cancelled: 0,
        interrupted: 0,
      });
      expect(JSON.stringify(snapshot)).not.toContain('private');
      expect(source.listActiveSessionTasks).toHaveBeenCalledWith(
        '/workspace',
        'parent-a',
      );
      expect(source.snapshotSessionTaskCounts).toHaveBeenCalledWith(
        '/workspace',
        'parent-a',
      );
    } finally {
      publisher.dispose();
    }
  });
});
