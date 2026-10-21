import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installSubagentTestEnv } from './helpers/subagent-test-helpers.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
const env = installSubagentTestEnv();
const olderThanMs = Date.parse('2026-10-01T00:00:00.000Z');

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('time-sliced history pruning', () => {
  it('shrinks slow committed slices to one row, regrows fast batches, and rests between every slice', async () => {
    const history = env.createHistoryStore();
    for (let index = 0; index < 25; index++)
      history.upsertTask(env.tmp, {
        id: `old-${index}`,
        agent: 'worker',
        mode: 'task',
        status: 'completed',
        task: 'keep the task',
        created_at: '2020-01-01T00:00:00.000Z',
        result: 'keep the result',
        transcript: 'legacy detail',
      });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const timers = vi.spyOn(globalThis, 'setTimeout');
    let elapsed = 0;
    let duration = 0;
    let commitDuration = 1;
    let taskBatch = 0;
    const busyTimeouts: string[] = [];
    const limits: number[] = [];
    const slices: number[] = [];
    const yieldsBeforeSlice: number[] = [];
    const prepare = DatabaseSync.prototype.prepare;
    vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementation(function (
      this: InstanceType<typeof DatabaseSync>,
      sql: string,
    ) {
      const statement = prepare.call(this, sql);
      if (/UPDATE subagent_tasks\s/.test(sql)) {
        const run = statement.run;
        vi.spyOn(statement, 'run').mockImplementation(function (
          this: typeof statement,
          ...args: Parameters<typeof run>
        ) {
          limits.push(args.at(-1) as number);
          // First a slow statement, then a slow COMMIT: both must shrink batches.
          commitDuration = taskBatch === 1 ? 39 : 1;
          const statementDuration = taskBatch++ === 0 ? 39 : 1;
          duration = statementDuration + commitDuration;
          elapsed += statementDuration;
          return run.apply(this, args);
        });
      }
      return statement;
    });
    const exec = DatabaseSync.prototype.exec;
    vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementation(function (
      this: InstanceType<typeof DatabaseSync>,
      sql: string,
    ) {
      if (sql.startsWith('PRAGMA busy_timeout')) busyTimeouts.push(sql);
      if (sql === 'BEGIN IMMEDIATE') {
        yieldsBeforeSlice.push(timers.mock.calls.length);
        duration = 1;
        commitDuration = 1;
      }
      if (sql === 'COMMIT') {
        elapsed += commitDuration;
        slices.push(duration);
      }
      return exec.call(this, sql);
    });

    const pruning = history.pruneExecutionDetail({
      olderThanMs,
      batchSize: 4,
      now: () => elapsed,
    });
    await vi.runAllTimersAsync();
    expect(await pruning).toEqual({
      tasksCleared: 25,
      attemptsCleared: 0,
      eventsDeleted: 0,
      busy: false,
    });
    expect(limits.slice(0, 5)).toEqual([4, 2, 1, 2, 4]);
    expect(Math.max(...limits)).toBe(4);
    expect(busyTimeouts).toEqual([
      'PRAGMA busy_timeout = 10',
      'PRAGMA busy_timeout = 2000',
    ]);
    expect(yieldsBeforeSlice).toEqual(slices.map((_, index) => index));
    expect(timers.mock.calls.map(([, delay]) => delay)).toEqual([
      40, 40, 15, 15, 15, 15, 15, 15, 15, 15, 15,
    ]);
    expect(timers.mock.results.every(({ value }) => !value.hasRef())).toBe(
      true,
    );
    expect(history.getTask(env.tmp, 'old-0')).toMatchObject({
      result: 'keep the result',
      transcript: undefined,
    });
  });

  it('starts heavy tables at one row, grows tiny event batches to a cap, and preserves history in a large legacy database', async () => {
    const history = env.createHistoryStore();
    for (let index = 0; index < 14; index++)
      history.upsertTask(env.tmp, {
        id: `legacy-${index}`,
        display_name: `Task ${index}`,
        agent: 'worker',
        mode: 'task',
        status: index === 12 ? 'running' : 'completed',
        task: 'keep the task',
        created_at: index === 13 ? '2026-10-02' : '2020-01-01',
        result: `result-${index}`,
        context: 'keep the context',
        prompt: 'keep the prompt',
        nested_session_path: `/sessions/${index}.jsonl`,
        usage: {
          input: 1,
          output: 2,
          cacheRead: 0,
          cacheWrite: 0,
          cost: 0.5,
          contextTokens: 3,
          turns: 1,
        },
        transcript: 't'.repeat(400000),
        system_prompt: 's'.repeat(100000),
      });
    const db = new DatabaseSync(process.env.PI_SUBAGENTS_HISTORY_DB_PATH!);
    try {
      const snapshot = JSON.stringify({
        version: 1,
        source: 'events',
        items: [{ type: 'status', text: 'snapshot'.repeat(100000) }],
      });
      db.prepare('UPDATE subagent_tasks SET thread_snapshot_json = ?').run(
        snapshot,
      );
      db.prepare(
        'UPDATE subagent_task_attempts SET thread_snapshot_json = ?, transcript = ?, system_prompt = ?',
      ).run(snapshot, 'legacy transcript', 'legacy system');
      db.exec('BEGIN');
      const insert = db.prepare(
        `INSERT INTO subagent_events (task_id, cwd, created_at, status, activity) VALUES ('legacy-0', ?, '2020-01-01', 'completed', 'legacy event')`,
      );
      for (let index = 0; index < 80000; index++) insert.run(env.tmp);
      db.exec('COMMIT');
      const before = history.listTasks(env.tmp, 100, {
        includeSnapshots: true,
      });
      const beforeAttempts = history.listTaskAttempts(env.tmp, 'legacy-0');

      const limits = {
        tasks: [] as number[],
        attempts: [] as number[],
        events: [] as number[],
      };
      const prepare = DatabaseSync.prototype.prepare;
      vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementation(function (
        this: InstanceType<typeof DatabaseSync>,
        sql: string,
      ) {
        const statement = prepare.call(this, sql);
        const table = /UPDATE subagent_tasks\s/.test(sql)
          ? 'tasks'
          : /UPDATE subagent_task_attempts\s/.test(sql)
            ? 'attempts'
            : /DELETE FROM subagent_events/.test(sql)
              ? 'events'
              : undefined;
        if (table) {
          const run = statement.run;
          vi.spyOn(statement, 'run').mockImplementation(function (
            this: typeof statement,
            ...args: Parameters<typeof run>
          ) {
            limits[table].push(args.at(-1) as number);
            return run.apply(this, args);
          });
        }
        return statement;
      });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const pruning = history.pruneExecutionDetail({
        olderThanMs,
        now: () => 0,
      });
      await vi.runAllTimersAsync();
      expect(await pruning).toEqual({
        tasksCleared: 12,
        attemptsCleared: 14,
        eventsDeleted: 80000,
        busy: false,
      });
      expect(limits.tasks[0]).toBe(1);
      expect(limits.attempts[0]).toBe(1);
      expect(limits.events.slice(0, 8)).toEqual([
        100, 200, 400, 800, 1600, 3200, 6400, 10000,
      ]);
      expect(Math.max(...limits.events)).toBe(10000);
      expect(limits.events.length).toBeLessThan(20);
      for (const task of before)
        expect(
          history.getTask(env.tmp, task.id, { includeSnapshots: true }),
        ).toEqual(
          task.id === 'legacy-12' || task.id === 'legacy-13'
            ? task
            : {
                ...task,
                thread_snapshot: undefined,
                transcript: undefined,
                system_prompt: undefined,
              },
        );
      expect(history.listTaskAttempts(env.tmp, 'legacy-0')).toEqual(
        beforeAttempts.map((task) => ({
          ...task,
          thread_snapshot: undefined,
          transcript: undefined,
          system_prompt: undefined,
        })),
      );
      expect(
        db.prepare('SELECT COUNT(*) AS count FROM subagent_events').get(),
      ).toEqual({ count: 0 });
      const again = history.pruneExecutionDetail({ olderThanMs, now: () => 0 });
      await vi.runAllTimersAsync();
      expect(await again).toEqual({
        tasksCleared: 0,
        attemptsCleared: 0,
        eventsDeleted: 0,
        busy: false,
      });
    } finally {
      db.close();
    }
  });
});
