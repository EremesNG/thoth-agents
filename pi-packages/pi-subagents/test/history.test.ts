import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubagentHistoryStore } from '../src/history.js';
import type { SubagentTask } from '../src/types.js';

const require = createRequire(import.meta.url);
const stores = new Set<SubagentHistoryStore>();

function createHistoryStore(): SubagentHistoryStore {
  const store = new SubagentHistoryStore();
  stores.add(store);
  return store;
}

describe('subagent history persistence and display_name compatibility', () => {
  let tmp: string;
  let oldDbPath: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-subagents-history-test-'));
    oldDbPath = process.env.PI_SUBAGENTS_HISTORY_DB_PATH;
    process.env.PI_SUBAGENTS_HISTORY_DB_PATH = path.join(
      tmp,
      'subagents-history.sqlite',
    );
  });

  afterEach(() => {
    for (const store of stores) store.close();
    stores.clear();
    if (oldDbPath === undefined)
      delete process.env.PI_SUBAGENTS_HISTORY_DB_PATH;
    else process.env.PI_SUBAGENTS_HISTORY_DB_PATH = oldDbPath;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('expires only detail older than the boundary, preserving terminal outcomes and active tasks', async () => {
    const store = createHistoryStore();
    const cutoff = Date.parse('2026-10-01T00:00:00.000Z');
    const task: SubagentTask = {
      id: 'old-completed',
      display_name: 'Keep my metadata',
      agent: 'worker',
      mode: 'task',
      status: 'completed',
      task: 'delegated task',
      created_at: '2026-09-01T00:00:00.000Z',
      last_activity_at: '2026-09-30T23:59:59.999Z',
      session_id: 'parent',
      nested_session_path: '/nested/session.jsonl',
      prompt: 'prompt',
      context: 'context',
      result: 'final response',
      system_prompt: 'heavy system prompt',
      transcript: 'heavy transcript',
      thread_snapshot: {
        version: 1,
        source: 'events',
        items: [{ type: 'status', text: 'heavy snapshot' }],
      },
      usage: {
        input: 1,
        output: 2,
        cacheRead: 3,
        cacheWrite: 4,
        cost: 0.5,
        contextTokens: 5,
        turns: 6,
      },
      runtime_metrics: { generationOutputTokens: 2, generationMs: 50 },
    };
    const cases: SubagentTask[] = [
      task,
      ...(
        [
          'failed',
          'cancelled',
          'interrupted',
          'queued',
          'running',
          'stopping',
        ] as const
      ).map((status) => ({ ...task, id: status, status })),
      { ...task, id: 'boundary', last_activity_at: '2026-10-01T00:00:00.000Z' },
      { ...task, id: 'newer', last_activity_at: '2026-10-01T00:00:00.001Z' },
      {
        ...task,
        id: 'ended-recently',
        last_activity_at: undefined,
        ended_at: '2026-10-02T00:00:00.000Z',
      },
      { ...task, id: 'created-only', last_activity_at: undefined },
    ];
    for (const row of cases) store.upsertTask(tmp, row);
    const before = cases.map((row) => store.getTask(tmp, row.id)!);

    expect(
      await store.pruneExecutionDetail({ olderThanMs: cutoff, batchSize: 2 }),
    ).toMatchObject({
      tasksCleared: 5,
      attemptsCleared: 0,
      eventsDeleted: 0,
      busy: false,
    });

    for (const row of before) {
      const expired = [
        'old-completed',
        'failed',
        'cancelled',
        'interrupted',
        'created-only',
      ].includes(row.id);
      expect(store.getTask(tmp, row.id)).toEqual(
        expired
          ? {
              ...row,
              system_prompt: undefined,
              transcript: undefined,
              thread_snapshot: undefined,
            }
          : row,
      );
    }
    expect(
      await store.pruneExecutionDetail({ olderThanMs: cutoff, batchSize: 2 }),
    ).toMatchObject({
      tasksCleared: 0,
      attemptsCleared: 0,
      eventsDeleted: 0,
      busy: false,
    });
  });

  it('clears legacy attempts and events in batches, yielding after each commit', async () => {
    const store = createHistoryStore();
    const task: SubagentTask = {
      id: 'legacy',
      agent: 'worker',
      mode: 'task',
      status: 'running',
      task: 'work',
      created_at: '2026-10-01T00:00:00.000Z',
      result: 'keep result',
      nested_session_path: '/nested/legacy.jsonl',
    };
    for (let attempt = 1; attempt <= 5; attempt++)
      store.upsertTask(tmp, { ...task, attempt });
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(process.env.PI_SUBAGENTS_HISTORY_DB_PATH!);
    try {
      db.exec(
        `UPDATE subagent_task_attempts SET system_prompt = 'old system', transcript = 'old transcript', thread_snapshot_json = '{"version":1,"source":"events","items":[{"type":"status","text":"old snapshot"}]}'`,
      );
      for (let index = 0; index < 5; index++)
        db.prepare(
          `INSERT INTO subagent_events (task_id, cwd, created_at, status, activity) VALUES (?, ?, ?, ?, ?)`,
        ).run(task.id, tmp, task.created_at, task.status, 'legacy event');
      const before = store.listTaskAttempts(tmp, task.id);
      // The empty task-table slice also yields before legacy attempts are cleared.
      const intermediate = new Promise<number>((resolve) =>
        setImmediate(() => {
          resolve(
            store
              .listTaskAttempts(tmp, task.id)
              .filter((row) => !row.transcript).length,
          );
        }),
      );
      const pruning = store.pruneExecutionDetail({
        olderThanMs: Date.parse(task.created_at),
        batchSize: 2,
      });
      expect(await intermediate).toBe(0);
      expect(await pruning).toEqual({
        tasksCleared: 0,
        attemptsCleared: 5,
        eventsDeleted: 5,
        busy: false,
      });
      expect(store.listTaskAttempts(tmp, task.id)).toEqual(
        before.map((row) => ({
          ...row,
          system_prompt: undefined,
          transcript: undefined,
          thread_snapshot: undefined,
        })),
      );
      expect(
        db.prepare('SELECT COUNT(*) AS count FROM subagent_events').get(),
      ).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });

  it.each([
    'warm',
    'cold',
    'between batches',
  ] as const)('ends pruning safely on a busy database (%s)', async (locking) => {
    const store = createHistoryStore();
    const task: SubagentTask = {
      id: 'busy-0',
      agent: 'worker',
      mode: 'task',
      status: 'completed',
      task: 'work',
      created_at: '2026-09-01T00:00:00.000Z',
      result: 'keep result',
      transcript: 'keep until committed',
    };
    for (let index = 0; index < 3; index++)
      store.upsertTask(tmp, { ...task, id: `busy-${index}` });
    const pruningStore = locking === 'cold' ? createHistoryStore() : store;
    const { DatabaseSync } = require('node:sqlite');
    const writer = new DatabaseSync(process.env.PI_SUBAGENTS_HISTORY_DB_PATH!);
    let acquired = false;
    const lock = () => {
      writer.exec('BEGIN IMMEDIATE');
      acquired = true;
    };
    try {
      if (locking === 'between batches') setImmediate(lock);
      else lock();
      const start = performance.now();
      expect(
        await pruningStore.pruneExecutionDetail({
          olderThanMs: Date.parse('2026-10-01'),
          batchSize: 1,
        }),
      ).toEqual({
        tasksCleared: locking === 'between batches' ? 1 : 0,
        attemptsCleared: 0,
        eventsDeleted: 0,
        busy: true,
      });
      expect(performance.now() - start).toBeLessThan(1000);
      expect(
        store
          .listTasks(tmp)
          .map((row) => [row.result, row.transcript])
          .sort(),
      ).toEqual(
        (locking === 'between batches'
          ? [
              ['keep result', undefined],
              ['keep result', task.transcript],
              ['keep result', task.transcript],
            ]
          : Array.from({ length: 3 }, () => ['keep result', task.transcript])
        ).sort(),
      );
      writer.exec('ROLLBACK');
      acquired = false;
      expect(
        await pruningStore.pruneExecutionDetail({
          olderThanMs: Date.parse('2026-10-01'),
          batchSize: 1,
        }),
      ).toMatchObject({
        tasksCleared: locking === 'between batches' ? 2 : 3,
        busy: false,
      });
    } finally {
      if (acquired) writer.exec('ROLLBACK');
      writer.close();
    }
  });

  it('closes database handles idempotently so its temporary directory can be removed', () => {
    const store = createHistoryStore();
    store.listTasks(tmp);

    store.close();
    expect(() => store.close()).not.toThrow();
    expect(() => store.listTasks(tmp)).toThrow(
      'Subagent history store is closed.',
    );
    expect(() =>
      fs.rmSync(tmp, { recursive: true, force: true }),
    ).not.toThrow();
    fs.mkdirSync(tmp, { recursive: true });
  });

  it.each([
    ['snapshotSessionTaskCounts', 'idx_subagent_tasks_session_status'],
    ['listSessionTaskMetadataByCost', 'idx_subagent_tasks_session_cost'],
  ] as const)('uses an index search for %s', (read, index) => {
    const store = createHistoryStore();
    store.listTasks(tmp);
    const { DatabaseSync } =
      require('node:sqlite') as typeof import('node:sqlite');
    const prepare = vi.spyOn(DatabaseSync.prototype, 'prepare');
    let sql: string;
    try {
      // Capture the exact publisher query, including its metadata projection.
      store[read](tmp, 'parent');
      expect(prepare).toHaveBeenCalledOnce();
      sql = prepare.mock.calls[0]![0];
    } finally {
      prepare.mockRestore();
    }

    const db = new DatabaseSync(process.env.PI_SUBAGENTS_HISTORY_DB_PATH!);
    try {
      const plan = db
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all(tmp, 'parent')
        .map((row) => row.detail)
        .join('\n');
      expect(plan).toContain('SEARCH subagent_tasks');
      expect(plan).toContain(index);
      expect(plan).not.toContain('SCAN subagent_tasks');
    } finally {
      db.close();
    }
  });

  it('snapshots exact session status counts beyond the history row cap', () => {
    const store = createHistoryStore();
    const task: SubagentTask = {
      id: 'completed-0',
      agent: 'worker',
      mode: 'task',
      status: 'completed',
      task: 'persisted task',
      created_at: '2026-01-01T00:00:00Z',
      session_id: 'resumed-session',
    };
    for (let index = 0; index < 125; index++)
      store.upsertTask(tmp, { ...task, id: `completed-${index}` });
    for (let index = 0; index < 17; index++)
      store.upsertTask(tmp, {
        ...task,
        id: `failed-${index}`,
        status: 'failed',
      });
    store.upsertTask(tmp, { ...task, attempt: 2 });
    store.upsertTask(tmp, {
      ...task,
      id: 'foreign-session',
      session_id: 'other-session',
    });
    store.upsertTask(path.join(tmp, 'other-cwd'), {
      ...task,
      id: 'foreign-cwd',
    });

    const snapshot = store.snapshotSessionTaskCounts(tmp, 'resumed-session');
    expect(snapshot.counts).toEqual({ completed: 125, failed: 17 });
    expect(snapshot.statusesById.size).toBe(142);
    expect(snapshot.statusesById.get('completed-0')).toBe('completed');
    expect(snapshot.statusesById.get('failed-16')).toBe('failed');
    expect(snapshot.statusesById.has('foreign-session')).toBe(false);
    expect(snapshot.statusesById.has('foreign-cwd')).toBe(false);
    expect(store.listSessionTasks(tmp, 'resumed-session')).toHaveLength(100);
    expect(
      store.snapshotSessionTaskCounts(tmp, 'empty-session').counts,
    ).toEqual({});
  });

  it('ranks session metadata by cost with deterministic ties, NULL costs and a 100-row cap', () => {
    const store = createHistoryStore();
    const task: SubagentTask = {
      id: 'expensive-old',
      agent: 'worker',
      mode: 'task',
      status: 'completed',
      task: 'persisted task',
      created_at: '2026-01-01T00:00:00Z',
      session_id: 'cost-session',
      transcript: 'excluded execution detail',
    };
    const usage = (cost: number) => ({
      input: 1,
      output: 2,
      cacheRead: 0,
      cacheWrite: 0,
      cost,
      contextTokens: 3,
      turns: 1,
    });
    for (const row of [
      { ...task, usage: usage(9) },
      { ...task, id: 'tied-old', usage: usage(2) },
      {
        ...task,
        id: 'tied-new-a',
        created_at: '2026-01-03T00:00:00Z',
        usage: usage(2),
      },
      {
        ...task,
        id: 'tied-new-z',
        created_at: '2026-01-03T00:00:00Z',
        usage: usage(2),
      },
      { ...task, id: 'zero', usage: usage(0) },
      { ...task, id: 'null-old' },
      { ...task, id: 'null-new-a', created_at: '2026-01-04T00:00:00Z' },
      { ...task, id: 'null-new-z', created_at: '2026-01-04T00:00:00Z' },
    ])
      store.upsertTask(tmp, row);
    store.upsertTask(tmp, {
      ...task,
      id: 'foreign-session',
      session_id: 'other-session',
      usage: usage(100),
    });
    store.upsertTask(path.join(tmp, 'other-cwd'), {
      ...task,
      id: 'foreign-cwd',
      usage: usage(100),
    });

    const ranked = store.listSessionTaskMetadataByCost(tmp, 'cost-session');
    expect(ranked.map((row) => row.id)).toEqual([
      'expensive-old',
      'tied-new-z',
      'tied-new-a',
      'tied-old',
      'zero',
      'null-new-z',
      'null-new-a',
      'null-old',
    ]);
    for (const row of ranked) expect(row.transcript).toBeUndefined();
    expect(store.listSessionTaskMetadataByCost(tmp, 'empty-session')).toEqual(
      [],
    );

    for (let index = 0; index < 101; index++)
      store.upsertTask(tmp, {
        ...task,
        id: `capped-${index}`,
        usage: usage(1000 + index),
      });
    const capped = store.listSessionTaskMetadataByCost(tmp, 'cost-session');
    expect(capped).toHaveLength(100);
    expect(capped[0].id).toBe('capped-100');
    expect(capped[99].id).toBe('capped-1');
  });

  it('persists and retrieves display_name across task queries and attempts', () => {
    const store = createHistoryStore();
    const task: SubagentTask = {
      id: 'subtask_persisted_friendly_name',
      display_name: 'Security Vulnerability Scan',
      agent: 'security',
      mode: 'task',
      status: 'completed',
      task: 'scan for vulnerabilities',
      created_at: new Date().toISOString(),
      attempt: 1,
      result: 'no vulnerabilities found',
      session_id: 'history-metrics',
      runtime_metrics: { generationOutputTokens: 300, generationMs: 4000 },
    };

    store.upsertTask(tmp, task);

    const direct = store.getTask(tmp, task.id);
    expect(direct).toBeDefined();
    expect(direct?.display_name).toBe('Security Vulnerability Scan');

    const listed = store.listTasks(tmp);
    expect(listed).toHaveLength(1);
    expect(listed[0].display_name).toBe('Security Vulnerability Scan');

    const byStatus = store.listTasksByStatus(tmp, ['completed']);
    expect(byStatus).toHaveLength(1);
    expect(byStatus[0].display_name).toBe('Security Vulnerability Scan');

    const attempts = store.listTaskAttempts(tmp, task.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].display_name).toBe('Security Vulnerability Scan');
    store.close();
    const reopened = createHistoryStore();
    for (const projected of [
      reopened.getTask(tmp, task.id),
      reopened.listTasks(tmp)[0],
      reopened.listTaskAttempts(tmp, task.id)[0],
      reopened.listSessionTaskMetadata(tmp, 'history-metrics')[0],
    ])
      expect(projected?.runtime_metrics).toEqual({
        generationOutputTokens: 300,
        generationMs: 4000,
      });
  });

  it('stores execution detail only on the latest task while preserving attempt metadata and results', () => {
    const store = createHistoryStore();
    const task: SubagentTask = {
      id: 'detail-once',
      agent: 'worker',
      mode: 'task',
      status: 'completed',
      task: 'work',
      created_at: '2026-01-01T00:00:00Z',
      session_id: 'detail-session',
      nested_session_path: '/nested/session.jsonl',
      prompt: 'delegated prompt',
      system_prompt: 'first system prompt',
      transcript: 'first transcript',
      thread_snapshot: {
        version: 1,
        source: 'events',
        items: [{ type: 'status', text: 'first snapshot' }],
      },
      result: 'first result',
    };
    store.upsertTask(tmp, task);
    store.upsertTask(tmp, { ...task, result: 'updated first result' });
    const latest: SubagentTask = {
      ...task,
      attempt: 2,
      continuation_prompt: 'continue working',
      system_prompt: 'latest system prompt',
      transcript: 'latest transcript',
      thread_snapshot: {
        version: 1,
        source: 'events',
        items: [{ type: 'status', text: 'latest snapshot' }],
      },
      result: 'latest result',
    };
    store.upsertTask(tmp, latest);
    store.close();

    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(process.env.PI_SUBAGENTS_HISTORY_DB_PATH!);
    try {
      expect(
        db
          .prepare(`
          SELECT attempt, system_prompt, transcript, thread_snapshot_json
          FROM subagent_task_attempts WHERE task_id = ? ORDER BY attempt
        `)
          .all(task.id),
      ).toEqual([
        {
          attempt: 1,
          system_prompt: null,
          transcript: null,
          thread_snapshot_json: null,
        },
        {
          attempt: 2,
          system_prompt: null,
          transcript: null,
          thread_snapshot_json: null,
        },
      ]);
      expect(
        db
          .prepare(`
          SELECT system_prompt, transcript, thread_snapshot_json
          FROM subagent_tasks WHERE id = ?
        `)
          .get(task.id),
      ).toEqual({
        system_prompt: 'latest system prompt',
        transcript: 'latest transcript',
        thread_snapshot_json: JSON.stringify(latest.thread_snapshot),
      });
    } finally {
      db.close();
    }

    const reopened = createHistoryStore();
    expect(reopened.getTask(tmp, task.id)).toMatchObject(latest);
    expect(reopened.listTaskAttempts(tmp, task.id)).toMatchObject([
      {
        attempt: 1,
        status: 'completed',
        session_id: 'detail-session',
        nested_session_path: '/nested/session.jsonl',
        prompt: 'delegated prompt',
        result: 'updated first result',
        system_prompt: undefined,
        transcript: undefined,
        thread_snapshot: undefined,
      },
      {
        attempt: 2,
        status: 'completed',
        continuation_prompt: 'continue working',
        result: 'latest result',
        system_prompt: undefined,
        transcript: undefined,
        thread_snapshot: undefined,
      },
    ]);
  });

  it('round trips timeout progress and deadline fields across reopen and attempts', () => {
    const store = createHistoryStore();
    const task: SubagentTask = {
      id: 'timeout',
      agent: 'worker',
      mode: 'background',
      status: 'failed',
      task: 'work',
      created_at: '2026-01-01T00:00:00Z',
      session_id: 'parent',
      error: 'timed out',
      error_metadata: {
        version: 1,
        category: 'total_timeout',
        message: 'timed out',
        retryable: false,
        partial_result_available: true,
      },
      output_preview: 'partial',
      progress_updates: [{ message: 'checkpoint', created_at: 'now' }],
      timeout_started_at: 1000,
      timeout_deadline_at: 3000,
      timeout_extensions_used: 2,
      timeout_deadline_generation: 3,
      timeout_max_extensions: 3,
      timeout_continue_enabled: true,
    };
    store.upsertTask(tmp, task);
    store.close();
    const reopened = createHistoryStore();
    for (const value of [
      reopened.getTask(tmp, task.id),
      reopened.listTaskAttempts(tmp, task.id)[0],
      reopened.listSessionTaskMetadata(tmp, 'parent')[0],
    ]) {
      expect(value).toMatchObject({
        progress_updates: task.progress_updates,
        timeout_started_at: 1000,
        timeout_deadline_at: 3000,
        timeout_extensions_used: 2,
        timeout_deadline_generation: 3,
        timeout_max_extensions: 3,
        timeout_continue_enabled: true,
      });
    }
  });

  it('migrates older databases without display_name or session indexes idempotently', () => {
    const dbPath = process.env.PI_SUBAGENTS_HISTORY_DB_PATH!;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    // Create legacy table without display_name column
    const { DatabaseSync } = require('node:sqlite');
    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`
      CREATE TABLE subagent_tasks (
        id TEXT PRIMARY KEY,
        cwd TEXT NOT NULL,
        agent TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        task TEXT NOT NULL,
        context TEXT,
        created_at TEXT NOT NULL,
        attempt INTEGER,
        session_id TEXT,
        nested_session_path TEXT,
        started_at TEXT,
        ended_at TEXT,
        last_activity_at TEXT,
        last_activity TEXT,
        output_preview TEXT,
        prompt TEXT,
        continuation_prompt TEXT,
        system_prompt TEXT,
        transcript TEXT,
        usage_input INTEGER,
        usage_output INTEGER,
        usage_cache_read INTEGER,
        usage_cache_write INTEGER,
        usage_cost REAL,
        usage_context_tokens INTEGER,
        usage_turns INTEGER,
        model TEXT,
        effort TEXT,
        model_source TEXT,
        effort_source TEXT,
        fallback_used INTEGER,
        error TEXT,
        error_metadata_json TEXT,
        error_category TEXT,
        result TEXT,
        thread_snapshot_json TEXT,
        pi_retry_attempts INTEGER,
        pending_message_count INTEGER,
        undelivered_message_count INTEGER
      );
      CREATE TABLE subagent_task_attempts (
        task_id TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        cwd TEXT NOT NULL,
        agent TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        task TEXT NOT NULL,
        context TEXT,
        created_at TEXT NOT NULL,
        session_id TEXT,
        nested_session_path TEXT,
        started_at TEXT,
        ended_at TEXT,
        last_activity_at TEXT,
        last_activity TEXT,
        output_preview TEXT,
        prompt TEXT,
        continuation_prompt TEXT,
        system_prompt TEXT,
        transcript TEXT,
        usage_input INTEGER,
        usage_output INTEGER,
        usage_cache_read INTEGER,
        usage_cache_write INTEGER,
        usage_cost REAL,
        usage_context_tokens INTEGER,
        usage_turns INTEGER,
        model TEXT,
        effort TEXT,
        model_source TEXT,
        effort_source TEXT,
        fallback_used INTEGER,
        error TEXT,
        error_metadata_json TEXT,
        error_category TEXT,
        result TEXT,
        thread_snapshot_json TEXT,
        pi_retry_attempts INTEGER,
        pending_message_count INTEGER,
        undelivered_message_count INTEGER,
        PRIMARY KEY (task_id, attempt)
      );
      CREATE TABLE subagent_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        attempt INTEGER,
        cwd TEXT NOT NULL,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL,
        activity TEXT NOT NULL,
        output_preview TEXT
      );
    `);
    legacyDb
      .prepare(`
      INSERT INTO subagent_tasks (id, cwd, agent, mode, status, task, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        'subtask_legacy_row',
        tmp,
        'analyst',
        'task',
        'completed',
        'legacy task',
        '2026-01-01T00:00:00.000Z',
      );
    legacyDb
      .prepare(`
      INSERT INTO subagent_task_attempts (task_id, attempt, cwd, agent, mode, status, task, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        'subtask_legacy_row',
        1,
        tmp,
        'analyst',
        'task',
        'completed',
        'legacy task',
        '2026-01-01T00:00:00.000Z',
      );
    expect(
      legacyDb
        .prepare(`
          SELECT name FROM sqlite_master
          WHERE name LIKE 'idx_subagent_tasks_session_%'
        `)
        .all(),
    ).toEqual([]);
    legacyDb.close();

    // Opening with SubagentHistoryStore should trigger ensureColumn migration
    const store = createHistoryStore();
    const legacyTask = store.getTask(tmp, 'subtask_legacy_row');
    expect(legacyTask).toBeDefined();
    expect(legacyTask?.display_name).toBeUndefined();
    expect(legacyTask?.progress_updates).toBeUndefined();
    expect(legacyTask?.timeout_extensions_used).toBeUndefined();
    expect(legacyTask?.runtime_metrics).toBeUndefined();
    expect(
      store.listTaskAttempts(tmp, 'subtask_legacy_row')[0]?.runtime_metrics,
    ).toBeUndefined();

    // Now upsert a new task with display_name
    const newTask: SubagentTask = {
      id: 'subtask_post_migration',
      display_name: 'Post Migration Task',
      progress_updates: [
        { message: 'saved after migration', created_at: 'now' },
      ],
      timeout_extensions_used: 1,
      agent: 'tester',
      mode: 'task',
      status: 'completed',
      task: 'verify migration',
      created_at: new Date().toISOString(),
      attempt: 1,
    };
    store.upsertTask(tmp, newTask);

    const fetchedNew = store.getTask(tmp, newTask.id);
    expect(fetchedNew?.display_name).toBe('Post Migration Task');
    expect(fetchedNew?.progress_updates).toEqual(newTask.progress_updates);
    expect(fetchedNew?.timeout_extensions_used).toBe(1);
    expect(
      store.listTaskAttempts(tmp, newTask.id)[0]?.progress_updates,
    ).toEqual(newTask.progress_updates);

    const all = store.listTasks(tmp);
    expect(all).toHaveLength(2);
    const legacyFromList = all.find((t) => t.id === 'subtask_legacy_row');
    const newFromList = all.find((t) => t.id === 'subtask_post_migration');
    expect(legacyFromList?.display_name).toBeUndefined();
    expect(newFromList?.display_name).toBe('Post Migration Task');

    const db = new DatabaseSync(dbPath);
    try {
      const sessionIndexes = () =>
        db
          .prepare(`
            SELECT name, rootpage FROM sqlite_master
            WHERE name LIKE 'idx_subagent_tasks_session_%'
            ORDER BY name
          `)
          .all();
      const indexes = sessionIndexes();
      expect(indexes).toEqual([
        {
          name: 'idx_subagent_tasks_session_cost',
          rootpage: expect.any(Number),
        },
        {
          name: 'idx_subagent_tasks_session_status',
          rootpage: expect.any(Number),
        },
      ]);
      for (let open = 0; open < 2; open++) {
        const reopened = createHistoryStore();
        expect(reopened.listTasks(tmp)).toEqual(all);
        expect(sessionIndexes()).toEqual(indexes);
        reopened.close();
      }
    } finally {
      db.close();
    }
  });
});
