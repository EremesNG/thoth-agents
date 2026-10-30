import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveSubagentHistoryDbPath,
  type SubagentHistoryStore,
} from '../src/history.js';
import { TERMINAL_STATUSES } from '../src/types.js';
import { installSubagentTestEnv } from './helpers/subagent-test-helpers.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
const env = installSubagentTestEnv();
const olderThanMs = Date.parse('2026-10-01T00:00:00.000Z');

function retentionIndexes(db: InstanceType<typeof DatabaseSync>) {
  return db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE name IN ('idx_subagent_tasks_retention_detail', 'idx_subagent_task_attempts_retention_detail') ORDER BY name",
    )
    .all();
}

const pruningCleanups: (() => Promise<void>)[] = [];

function createPruner() {
  const controller = new AbortController();
  const pending: Promise<unknown>[] = [];
  pruningCleanups.push(async () => {
    controller.abort();
    await Promise.all(pending);
  });
  return (
    history: SubagentHistoryStore,
    options: Parameters<SubagentHistoryStore['pruneExecutionDetail']>[0],
  ) => {
    const pruning = history.pruneExecutionDetail({
      ...options,
      signal: controller.signal,
    });
    // Handle failures immediately without swallowing the promise the test awaits.
    pending.push(pruning.catch(() => {}));
    const draining = vi.runAllTimersAsync().then(() => pruning);
    // Let a timed-out body unwind its own finally before closing its stores.
    pending.push(draining.catch(() => {}));
    return draining;
  };
}

afterEach(async () => {
  // Vitest's default stack order runs this before env closes stores/removes the DB.
  for (const cleanup of pruningCleanups) await cleanup();
  pruningCleanups.length = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('time-sliced history pruning', () => {
  it('lazily indexes legacy detail during pruning and keeps repeated passes idempotent', async () => {
    const prune = createPruner();
    const history = env.createHistoryStore();
    history.upsertTask(env.tmp, {
      id: 'legacy',
      agent: 'worker',
      mode: 'task',
      status: 'completed',
      task: 'keep the task',
      created_at: '2020-01-01',
      result: 'keep the result',
      transcript: 'legacy detail',
    });
    const db = new DatabaseSync(resolveSubagentHistoryDbPath());
    try {
      // Opening and initializing a pre-maintenance store must stay cheap.
      const otherHistory = env.createHistoryStore();
      otherHistory.listTasks(env.tmp);
      expect(retentionIndexes(db)).toEqual([]);
      db.exec(
        "UPDATE subagent_task_attempts SET system_prompt = 'legacy attempt detail'",
      );
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      expect(await prune(history, { olderThanMs, now: () => 0 })).toEqual({
        tasksCleared: 1,
        attemptsCleared: 1,
        eventsDeleted: 0,
        busy: false,
      });
      const expectedIndexes = [
        { name: 'idx_subagent_task_attempts_retention_detail' },
        { name: 'idx_subagent_tasks_retention_detail' },
      ];
      expect(retentionIndexes(db)).toEqual(expectedIndexes);
      expect(history.getTask(env.tmp, 'legacy')).toMatchObject({
        result: 'keep the result',
        transcript: undefined,
      });
      expect(
        history.listTaskAttempts(env.tmp, 'legacy')[0]?.system_prompt,
      ).toBeUndefined();
      expect(await prune(otherHistory, { olderThanMs, now: () => 0 })).toEqual({
        tasksCleared: 0,
        attemptsCleared: 0,
        eventsDeleted: 0,
        busy: false,
      });
      expect(retentionIndexes(db)).toEqual(expectedIndexes);
    } finally {
      db.close();
    }
  });

  it('skips a busy index build without scanning or clearing detail and retries on a later pass', async () => {
    const prune = createPruner();
    const history = env.createHistoryStore();
    history.upsertTask(env.tmp, {
      id: 'busy',
      agent: 'worker',
      mode: 'task',
      status: 'completed',
      task: 'keep',
      created_at: '2020-01-01',
      transcript: 'detail',
    });
    const writer = new DatabaseSync(resolveSubagentHistoryDbPath());
    let locked = false;
    try {
      writer.exec('BEGIN IMMEDIATE');
      locked = true;
      const exec = vi.spyOn(DatabaseSync.prototype, 'exec');
      const prepare = vi.spyOn(DatabaseSync.prototype, 'prepare');
      await expect(
        history.pruneExecutionDetail({ olderThanMs }),
      ).resolves.toEqual({
        tasksCleared: 0,
        attemptsCleared: 0,
        eventsDeleted: 0,
        busy: true,
      });
      expect(
        exec.mock.calls.some(([sql]) =>
          sql.includes(
            'CREATE INDEX IF NOT EXISTS idx_subagent_tasks_retention_detail',
          ),
        ),
      ).toBe(true);
      expect(
        prepare.mock.calls.some(([sql]) =>
          /^\s*SELECT (?:id|task_id, attempt) FROM subagent_(?:tasks|task_attempts)\b/.test(
            sql,
          ),
        ),
      ).toBe(false);
      expect(retentionIndexes(writer)).toEqual([]);
      expect(history.getTask(env.tmp, 'busy')?.transcript).toBe('detail');
      writer.exec('ROLLBACK');
      locked = false;
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      expect(await prune(history, { olderThanMs, now: () => 0 })).toEqual({
        tasksCleared: 1,
        attemptsCleared: 0,
        eventsDeleted: 0,
        busy: false,
      });
      expect(retentionIndexes(writer)).toHaveLength(2);
      expect(history.getTask(env.tmp, 'busy')?.transcript).toBeUndefined();
    } finally {
      if (locked) writer.exec('ROLLBACK');
      writer.close();
    }
  });

  it('uses the partial indexes for the actual detail-first candidate queries instead of table scans', async () => {
    const prune = createPruner();
    const history = env.createHistoryStore();
    history.listTasks(env.tmp);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const prepare = vi.spyOn(DatabaseSync.prototype, 'prepare');
    expect(await prune(history, { olderThanMs, now: () => 0 })).toMatchObject({
      busy: false,
    });
    const queries = prepare.mock.calls
      .map(([sql]) => sql)
      .filter((sql) =>
        /^\s*SELECT (?:id|task_id, attempt) FROM subagent_(?:tasks|task_attempts)\b/.test(
          sql,
        ),
      );
    prepare.mockRestore();
    expect(queries).toHaveLength(2);
    const db = new DatabaseSync(resolveSubagentHistoryDbPath());
    const plans = () =>
      queries.map((sql, index) =>
        db
          .prepare(`EXPLAIN QUERY PLAN ${sql}`)
          .all(
            ...(index === 0
              ? [...TERMINAL_STATUSES, new Date(olderThanMs).toISOString(), 1]
              : [1]),
          )
          .map((row) => row.detail)
          .join('\n'),
      );
    try {
      db.exec(`
        DROP INDEX idx_subagent_tasks_retention_detail;
        DROP INDEX idx_subagent_task_attempts_retention_detail;
      `);
      expect(plans()).toEqual([
        'SCAN subagent_tasks',
        'SCAN subagent_task_attempts',
      ]);
      expect(await prune(history, { olderThanMs, now: () => 0 })).toMatchObject(
        {
          busy: false,
        },
      );
      // EXPLAIN alone can retain this observer's pre-build schema cache.
      expect(retentionIndexes(db)).toHaveLength(2);
      const indexedPlans = plans();
      expect(indexedPlans[0]).toContain(
        'SEARCH subagent_tasks USING INDEX idx_subagent_tasks_retention_detail (status=?)',
      );
      expect(indexedPlans[1]).toContain(
        'SCAN subagent_task_attempts USING INDEX idx_subagent_task_attempts_retention_detail',
      );
      for (const sql of queries)
        expect(sql).toMatch(
          /WHERE\s+\(thread_snapshot_json IS NOT NULL OR transcript IS NOT NULL OR system_prompt IS NOT NULL\)\s+(?:AND|LIMIT)\b/,
        );
    } finally {
      db.close();
    }
  });

  it.each([
    { column: 'status', value: 'running' },
    { column: 'status', value: 'queued' },
    { column: 'last_activity_at', value: '2026-10-02T00:00:00.000Z' },
  ])('selects detail keys outside write locks and rechecks concurrent $column=$value changes', async ({
    column,
    value,
  }) => {
    const prune = createPruner();
    const history = env.createHistoryStore();
    for (const id of ['old-0', 'old-1'])
      history.upsertTask(env.tmp, {
        id,
        agent: 'worker',
        mode: 'task',
        status: 'completed',
        task: 'keep',
        created_at: '2020-01-01',
        transcript: 'detail',
      });
    const writer = new DatabaseSync(process.env.PI_SUBAGENTS_HISTORY_DB_PATH!);
    writer.exec(
      "UPDATE subagent_task_attempts SET transcript = 'legacy detail'",
    );
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let inTransaction = false;
    const reads: string[] = [];
    const writes: string[] = [];
    const prepare = DatabaseSync.prototype.prepare;
    vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementation(function (
      this: InstanceType<typeof DatabaseSync>,
      sql: string,
    ) {
      const statement = prepare.call(this, sql);
      if (
        /^\s*SELECT (?:id|task_id, attempt) FROM subagent_(?:tasks|task_attempts)\b/.test(
          sql,
        )
      ) {
        const all = statement.all;
        vi.spyOn(statement, 'all').mockImplementation(function (
          this: typeof statement,
          ...args: Parameters<typeof all>
        ) {
          expect(inTransaction).toBe(false);
          const rows = all.apply(this, args);
          reads.push(sql);
          if (
            rows.length &&
            /FROM subagent_tasks\b/.test(sql) &&
            reads.filter((read) => /FROM subagent_tasks\b/.test(read))
              .length === 1
          )
            writer
              .prepare(
                `UPDATE subagent_tasks SET ${column} = ? WHERE id = 'old-0'`,
              )
              .run(value);
          if (rows.length && /FROM subagent_task_attempts\b/.test(sql))
            writer
              .prepare(
                'UPDATE subagent_task_attempts SET transcript = NULL WHERE task_id = ? AND attempt = ?',
              )
              .run(
                (rows[0] as { task_id: string }).task_id,
                (rows[0] as { attempt: number }).attempt,
              );
          return rows;
        });
      }
      if (/UPDATE subagent_(?:tasks|task_attempts)\b/.test(sql))
        writes.push(sql);
      return statement;
    });
    const exec = DatabaseSync.prototype.exec;
    vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementation(function (
      this: InstanceType<typeof DatabaseSync>,
      sql: string,
    ) {
      const result = exec.call(this, sql);
      if (sql === 'BEGIN IMMEDIATE') inTransaction = true;
      if (sql === 'COMMIT' || sql === 'ROLLBACK') inTransaction = false;
      return result;
    });
    try {
      expect(
        await prune(history, { olderThanMs, batchSize: 1, now: () => 0 }),
      ).toEqual({
        tasksCleared: 1,
        attemptsCleared: 0,
        eventsDeleted: 0,
        busy: false,
      });
      expect(reads.some((sql) => /FROM subagent_tasks\b/.test(sql))).toBe(true);
      expect(
        reads.some((sql) => /FROM subagent_task_attempts\b/.test(sql)),
      ).toBe(true);
      expect(writes.every((sql) => !/SELECT/.test(sql))).toBe(true);
      expect(history.getTask(env.tmp, 'old-0')).toMatchObject({
        [column]: value,
        transcript: 'detail',
      });
      expect(history.getTask(env.tmp, 'old-1')?.transcript).toBeUndefined();
    } finally {
      writer.close();
    }
  });

  it('shrinks slow committed slices to one row, regrows fast batches, and rests between every slice', async () => {
    const prune = createPruner();
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
      if (/SELECT id FROM subagent_tasks\s/.test(sql)) {
        const all = statement.all;
        vi.spyOn(statement, 'all').mockImplementation(function (
          this: typeof statement,
          ...args: Parameters<typeof all>
        ) {
          limits.push(args.at(-1) as number);
          // First a slow read, then a slow COMMIT: measure the whole batch.
          commitDuration = taskBatch === 1 ? 39 : 1;
          const statementDuration = taskBatch++ === 0 ? 39 : 1;
          duration = statementDuration + commitDuration;
          elapsed += statementDuration;
          return all.apply(this, args);
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
      }
      if (sql === 'COMMIT') {
        elapsed += commitDuration;
        slices.push(duration);
        duration = 1;
        commitDuration = 1;
      }
      return exec.call(this, sql);
    });

    expect(
      await prune(history, { olderThanMs, batchSize: 4, now: () => elapsed }),
    ).toEqual({
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

  // Large legacy blobs and 80k inserts need headroom on slow Windows runners.
  it('starts heavy tables at one row, grows tiny event batches to a cap, and preserves history in a large legacy database', async () => {
    const prune = createPruner();
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
        const table = /SELECT id FROM subagent_tasks\s/.test(sql)
          ? 'tasks'
          : /SELECT task_id, attempt FROM subagent_task_attempts\s/.test(sql)
            ? 'attempts'
            : /DELETE FROM subagent_events/.test(sql)
              ? 'events'
              : undefined;
        if (table === 'events') {
          const run = statement.run;
          vi.spyOn(statement, 'run').mockImplementation(function (
            this: typeof statement,
            ...args: Parameters<typeof run>
          ) {
            limits.events.push(args.at(-1) as number);
            return run.apply(this, args);
          });
        } else if (table) {
          const all = statement.all;
          vi.spyOn(statement, 'all').mockImplementation(function (
            this: typeof statement,
            ...args: Parameters<typeof all>
          ) {
            limits[table].push(args.at(-1) as number);
            return all.apply(this, args);
          });
        }
        return statement;
      });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      expect(await prune(history, { olderThanMs, now: () => 0 })).toEqual({
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
      expect(await prune(history, { olderThanMs, now: () => 0 })).toEqual({
        tasksCleared: 0,
        attemptsCleared: 0,
        eventsDeleted: 0,
        busy: false,
      });
    } finally {
      db.close();
    }
  }, 60_000);
});
