import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {
  parseErrorMetadata,
  serializeErrorMetadata,
} from './error-metadata.js';
import { boundThreadSnapshot } from './thread-view.js';
import type { SubagentTask, SubagentThreadSnapshot } from './types.js';
import { TERMINAL_STATUSES } from './types.js';

export type PruneExecutionDetailResult = {
  tasksCleared: number;
  attemptsCleared: number;
  eventsDeleted: number;
  busy: boolean;
  /** The pass was cancelled; counts include only committed work. */
  aborted?: true;
};

export type CompactHistoryResult = {
  beforeBytes: number;
  afterBytes: number;
  pruned?: PruneExecutionDetailResult;
};

type PruneOptions = {
  olderThanMs: number;
  /** Optional upper bound for every table's adaptive batches. */
  batchSize?: number;
  /** Monotonic clock; injectable for deterministic slice scheduling tests. */
  now?: () => number;
  /** Activity gate before opening and every batch; must wake when the signal aborts. */
  waitUntilIdle?: (signal: AbortSignal) => Promise<void> | undefined;
  /** Cancellation stops at a batch boundary, never halfway through a write. */
  signal?: AbortSignal;
};
type HistoryPathState = {
  stores: Set<SubagentHistoryStore>;
  pruning: Set<Promise<PruneExecutionDetailResult>>;
  pausedPruning: Set<AbortController>;
  compacting: boolean;
};
const HISTORY_CONNECTIONS_KEY = Symbol.for(
  'pi.subagents.historyConnections.v1',
);
const shared = globalThis as typeof globalThis & {
  [HISTORY_CONNECTIONS_KEY]?: Map<string, HistoryPathState>;
};
// Child session loaders can evaluate separate copies of this module.
shared[HISTORY_CONNECTIONS_KEY] ??= new Map();
const historyPaths = shared[HISTORY_CONNECTIONS_KEY];
function historyState(file: string): HistoryPathState {
  const key = process.platform === 'win32' ? file.toLowerCase() : file;
  let state = historyPaths.get(key);
  if (!state) {
    state = {
      stores: new Set(),
      pruning: new Set(),
      pausedPruning: new Set(),
      compacting: false,
    };
    historyPaths.set(key, state);
  }
  // Older module copies can leave or insert v1 entries without pause tracking.
  state.pausedPruning ??= new Set();
  return state;
}

function historyFileBytes(file: string): number {
  return [file, `${file}-wal`].reduce((total, name) => {
    try {
      return total + fs.statSync(name).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return total;
    }
  }, 0);
}

const require = createRequire(import.meta.url);

type Db = {
  exec(sql: string): void;
  close(): void;
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
};

type DbConstructor = new (file: string) => Db;

function loadDbConstructor(): DbConstructor {
  try {
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync?: DbConstructor;
    };
    if (DatabaseSync) return DatabaseSync;
  } catch {}
  const { Database } = require('bun:sqlite') as { Database?: DbConstructor };
  if (Database) return Database;
  throw new Error(
    'No supported sqlite runtime is available. Expected node:sqlite or bun:sqlite.',
  );
}

export function resolveSubagentsHistoryHome(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.PI_SUBAGENTS_HISTORY_HOME)
    return path.resolve(env.PI_SUBAGENTS_HISTORY_HOME);
  const xdg = env.XDG_DATA_HOME;
  return xdg
    ? path.join(xdg, 'pi', 'subagents')
    : path.join(os.homedir(), '.local', 'share', 'pi', 'subagents');
}

export function resolveSubagentHistoryDbPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.PI_SUBAGENTS_HISTORY_DB_PATH)
    return path.resolve(env.PI_SUBAGENTS_HISTORY_DB_PATH);
  return path.join(
    resolveSubagentsHistoryHome(env),
    'subagents-history.sqlite',
  );
}

function value(text: string | undefined): string | null {
  return text ?? null;
}
function snapshotJson(
  snapshot: SubagentTask['thread_snapshot'],
): string | null {
  const bounded = boundThreadSnapshot(snapshot);
  return bounded ? JSON.stringify(bounded) : null;
}
function parseSnapshotJson(text: unknown): SubagentThreadSnapshot | undefined {
  if (typeof text !== 'string' || !text.trim()) return undefined;
  try {
    return boundThreadSnapshot(JSON.parse(text));
  } catch {
    return undefined;
  }
}
type HistoryReadOptions = { includeSnapshots?: boolean };

export type SubagentSessionTaskCounts = {
  counts: Partial<Record<SubagentTask['status'], number>>;
  statusesById: ReadonlyMap<string, SubagentTask['status']>;
};

const TIMEOUT_COLUMNS = [
  'timeout_started_at',
  'timeout_deadline_at',
  'timeout_extensions_used',
  'timeout_deadline_generation',
  'timeout_max_extensions',
  'timeout_continue_enabled',
] as const;
const TIMEOUT_HISTORY_COLUMNS = `progress_updates_json, ${TIMEOUT_COLUMNS.join(', ')}`;

const SESSION_TASK_METADATA_COLUMNS = `
        id,
        display_name,
        cwd,
        agent,
        mode,
        status,
        task,
        context,
        created_at,
        attempt,
        session_id,
        nested_session_path,
        started_at,
        ended_at,
        last_activity_at,
        last_activity,
        output_preview,
        usage_input,
        usage_output,
        usage_cache_read,
        usage_cache_write,
        usage_cost,
        usage_context_tokens,
        usage_turns,
        generation_output_tokens,
        generation_ms,
        model,
        effort,
        model_source,
        effort_source,
        fallback_used,
        error,
        error_metadata_json,
        error_category,
        pi_retry_attempts,
        pending_message_count,
        undelivered_message_count,
        dropped_tools_json,
        ${TIMEOUT_HISTORY_COLUMNS}
`;

function ensureColumn(
  db: Db,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name?: string;
  }>;
  if (!columns.some((row) => row.name === column))
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

const HISTORY_BUSY_TIMEOUT_MS = 2000;
const PRUNE_BUSY_TIMEOUT_MS = 50;
const PRUNE_BACKGROUND_BUSY_TIMEOUT_MS = 10;
// About one frame of synchronous work, followed by at least as much rest.
const PRUNE_SLICE_BUDGET_MS = 15;

function isSqliteBusy(error: unknown): boolean {
  const sqliteError = error as {
    code?: string;
    errcode?: number;
    message?: string;
  } | null;
  return Boolean(
    sqliteError &&
      (/SQLITE_(BUSY|LOCKED)/.test(sqliteError.code ?? '') ||
        (typeof sqliteError.errcode === 'number' &&
          [5, 6].includes(sqliteError.errcode & 255)) ||
        /database (?:is )?(?:busy|locked)|database table is locked/i.test(
          sqliteError.message ?? '',
        )),
  );
}

function configureHistoryDb(db: Db, busyTimeoutMs: number): void {
  db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
  try {
    db.exec('PRAGMA journal_mode = WAL');
  } catch {}
  try {
    db.exec('PRAGMA synchronous = NORMAL');
  } catch {}
}

function ensureAttemptColumns(db: Db): void {
  ensureColumn(
    db,
    'subagent_task_attempts',
    'generation_output_tokens',
    'INTEGER',
  );
  ensureColumn(db, 'subagent_task_attempts', 'generation_ms', 'REAL');
  ensureColumn(db, 'subagent_task_attempts', 'display_name', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'cwd', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'agent', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'mode', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'status', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'task', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'context', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'created_at', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'session_id', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'nested_session_path', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'started_at', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'ended_at', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'last_activity_at', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'last_activity', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'output_preview', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'prompt', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'continuation_prompt', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'system_prompt', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'transcript', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'usage_input', 'INTEGER');
  ensureColumn(db, 'subagent_task_attempts', 'usage_output', 'INTEGER');
  ensureColumn(db, 'subagent_task_attempts', 'usage_cache_read', 'INTEGER');
  ensureColumn(db, 'subagent_task_attempts', 'usage_cache_write', 'INTEGER');
  ensureColumn(db, 'subagent_task_attempts', 'usage_cost', 'REAL');
  ensureColumn(db, 'subagent_task_attempts', 'usage_context_tokens', 'INTEGER');
  ensureColumn(db, 'subagent_task_attempts', 'usage_turns', 'INTEGER');
  ensureColumn(db, 'subagent_task_attempts', 'model', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'effort', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'model_source', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'effort_source', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'fallback_used', 'INTEGER');
  ensureColumn(db, 'subagent_task_attempts', 'error', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'error_metadata_json', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'error_category', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'result', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'thread_snapshot_json', 'TEXT');
  ensureColumn(db, 'subagent_task_attempts', 'pi_retry_attempts', 'INTEGER');
  ensureColumn(db, 'subagent_task_attempts', 'dropped_tools_json', 'TEXT');
  ensureColumn(
    db,
    'subagent_task_attempts',
    'pending_message_count',
    'INTEGER',
  );
  ensureColumn(
    db,
    'subagent_task_attempts',
    'undelivered_message_count',
    'INTEGER',
  );
}

function upsertTaskRecord(
  db: Db,
  table: 'subagent_tasks' | 'subagent_task_attempts',
  cwd: string,
  task: SubagentTask,
): void {
  const includeExecutionDetail = table === 'subagent_tasks';
  let errorMetadataJson: string | null = null;
  let errorCategory: string | null = null;
  if (task.error_metadata !== undefined) {
    try {
      errorMetadataJson = serializeErrorMetadata(task.error_metadata);
      errorCategory = parseErrorMetadata(errorMetadataJson)?.category ?? null;
    } catch {
      errorMetadataJson = null;
      errorCategory = null;
    }
  }

  const baseColumns =
    table === 'subagent_tasks'
      ? 'id, display_name, cwd, agent, mode, status, task, context, created_at, attempt, session_id, nested_session_path, started_at, ended_at, last_activity_at, last_activity, output_preview, prompt, continuation_prompt, system_prompt, transcript, usage_input, usage_output, usage_cache_read, usage_cache_write, usage_cost, usage_context_tokens, usage_turns, generation_output_tokens, generation_ms, model, effort, model_source, effort_source, fallback_used, error, error_metadata_json, error_category, result, thread_snapshot_json, pi_retry_attempts, pending_message_count, undelivered_message_count, dropped_tools_json'
      : 'task_id, attempt, display_name, cwd, agent, mode, status, task, context, created_at, session_id, nested_session_path, started_at, ended_at, last_activity_at, last_activity, output_preview, prompt, continuation_prompt, system_prompt, transcript, usage_input, usage_output, usage_cache_read, usage_cache_write, usage_cost, usage_context_tokens, usage_turns, generation_output_tokens, generation_ms, model, effort, model_source, effort_source, fallback_used, error, error_metadata_json, error_category, result, thread_snapshot_json, pi_retry_attempts, pending_message_count, undelivered_message_count, dropped_tools_json';
  const columns = `${baseColumns}, ${TIMEOUT_HISTORY_COLUMNS}`;
  const placeholders = new Array(columns.split(',').length)
    .fill('?')
    .join(', ');
  const update =
    table === 'subagent_tasks'
      ? `display_name=excluded.display_name,
        status=excluded.status,
        attempt=excluded.attempt,
        session_id=excluded.session_id,
        nested_session_path=excluded.nested_session_path,
        started_at=excluded.started_at,
        ended_at=excluded.ended_at,
        last_activity_at=excluded.last_activity_at,
        last_activity=excluded.last_activity,
        output_preview=excluded.output_preview,
        prompt=excluded.prompt,
        continuation_prompt=excluded.continuation_prompt,
        system_prompt=excluded.system_prompt,
        transcript=excluded.transcript,
        usage_input=excluded.usage_input,
        usage_output=excluded.usage_output,
        usage_cache_read=excluded.usage_cache_read,
        usage_cache_write=excluded.usage_cache_write,
        usage_cost=excluded.usage_cost,
        usage_context_tokens=excluded.usage_context_tokens,
        usage_turns=excluded.usage_turns,
        generation_output_tokens=excluded.generation_output_tokens,
        generation_ms=excluded.generation_ms,
        model=excluded.model,
        effort=excluded.effort,
        model_source=excluded.model_source,
        effort_source=excluded.effort_source,
        fallback_used=excluded.fallback_used,
        error=excluded.error,
        error_metadata_json=excluded.error_metadata_json,
        error_category=excluded.error_category,
        result=excluded.result,
        thread_snapshot_json=excluded.thread_snapshot_json,
        pi_retry_attempts=excluded.pi_retry_attempts,
        pending_message_count=excluded.pending_message_count,
        undelivered_message_count=excluded.undelivered_message_count,
        dropped_tools_json=excluded.dropped_tools_json`
      : `display_name=excluded.display_name,
        status=excluded.status,
        session_id=excluded.session_id,
        nested_session_path=excluded.nested_session_path,
        started_at=excluded.started_at,
        ended_at=excluded.ended_at,
        last_activity_at=excluded.last_activity_at,
        last_activity=excluded.last_activity,
        output_preview=excluded.output_preview,
        prompt=excluded.prompt,
        continuation_prompt=excluded.continuation_prompt,
        system_prompt=excluded.system_prompt,
        transcript=excluded.transcript,
        usage_input=excluded.usage_input,
        usage_output=excluded.usage_output,
        usage_cache_read=excluded.usage_cache_read,
        usage_cache_write=excluded.usage_cache_write,
        usage_cost=excluded.usage_cost,
        usage_context_tokens=excluded.usage_context_tokens,
        usage_turns=excluded.usage_turns,
        generation_output_tokens=excluded.generation_output_tokens,
        generation_ms=excluded.generation_ms,
        model=excluded.model,
        effort=excluded.effort,
        model_source=excluded.model_source,
        effort_source=excluded.effort_source,
        fallback_used=excluded.fallback_used,
        error=excluded.error,
        error_metadata_json=excluded.error_metadata_json,
        error_category=excluded.error_category,
        result=excluded.result,
        thread_snapshot_json=excluded.thread_snapshot_json,
        pi_retry_attempts=excluded.pi_retry_attempts,
        pending_message_count=excluded.pending_message_count,
        undelivered_message_count=excluded.undelivered_message_count,
        dropped_tools_json=excluded.dropped_tools_json`;
  const identity = table === 'subagent_tasks' ? 'id' : 'task_id, attempt';

  db.prepare(`
    INSERT INTO ${table} (${columns}) VALUES (${placeholders})
    ON CONFLICT(${identity}) DO UPDATE SET ${update},
      progress_updates_json=excluded.progress_updates_json,
      ${TIMEOUT_COLUMNS.map((column) => `${column}=excluded.${column}`).join(', ')}
  `).run(
    ...(table === 'subagent_tasks' ? [task.id] : [task.id, task.attempt ?? 1]),
    value(task.display_name),
    cwd,
    task.agent,
    task.mode,
    task.status,
    task.task,
    value(task.context),
    task.created_at,
    ...(table === 'subagent_tasks' ? [task.attempt ?? 1] : []),
    value(task.session_id),
    value(task.nested_session_path),
    value(task.started_at),
    value(task.ended_at),
    value(task.last_activity_at),
    value(task.last_activity),
    value(task.output_preview),
    value(task.prompt),
    value(task.continuation_prompt),
    includeExecutionDetail ? value(task.system_prompt) : null,
    includeExecutionDetail ? value(task.transcript) : null,
    task.usage?.input ?? null,
    task.usage?.output ?? null,
    task.usage?.cacheRead ?? null,
    task.usage?.cacheWrite ?? null,
    task.usage?.cost ?? null,
    task.usage?.contextTokens ?? null,
    task.usage?.turns ?? null,
    task.runtime_metrics?.generationOutputTokens ?? null,
    task.runtime_metrics?.generationMs ?? null,
    value(task.model),
    value(task.effort),
    value(task.model_source),
    value(task.effort_source),
    task.fallback_used === undefined ? null : task.fallback_used ? 1 : 0,
    value(task.error),
    errorMetadataJson,
    errorCategory,
    value(task.result),
    includeExecutionDetail ? snapshotJson(task.thread_snapshot) : null,
    task.pi_retry_attempts ?? null,
    task.pending_message_count ?? null,
    task.undelivered_message_count ?? null,
    task.dropped_tools === undefined
      ? null
      : JSON.stringify(task.dropped_tools),
    task.progress_updates === undefined
      ? null
      : JSON.stringify(task.progress_updates.slice(-5)),
    ...TIMEOUT_COLUMNS.map((column) => {
      const field = task[column];
      return field === undefined
        ? null
        : typeof field === 'boolean'
          ? Number(field)
          : field;
    }),
  );
}

function initializeHistorySchema(db: Db): void {
  db.exec(`
  CREATE TABLE IF NOT EXISTS subagent_tasks (
    id TEXT PRIMARY KEY,
    display_name TEXT,
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
  CREATE TABLE IF NOT EXISTS subagent_task_attempts (
    task_id TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    display_name TEXT,
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
  CREATE TABLE IF NOT EXISTS subagent_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    attempt INTEGER,
    cwd TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL,
    activity TEXT NOT NULL,
    output_preview TEXT,
    FOREIGN KEY(task_id) REFERENCES subagent_tasks(id)
  );
  CREATE INDEX IF NOT EXISTS idx_subagent_tasks_created ON subagent_tasks(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_subagent_tasks_session_status ON subagent_tasks(cwd, session_id, status, id);
  CREATE INDEX IF NOT EXISTS idx_subagent_tasks_session_cost ON subagent_tasks(cwd, session_id, usage_cost DESC, created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_subagent_events_task ON subagent_events(task_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_subagent_attempts_task ON subagent_task_attempts(task_id, attempt);
`);
  ensureColumn(db, 'subagent_tasks', 'generation_output_tokens', 'INTEGER');
  ensureColumn(db, 'subagent_tasks', 'generation_ms', 'REAL');
  ensureColumn(db, 'subagent_tasks', 'display_name', 'TEXT');
  ensureColumn(db, 'subagent_tasks', 'attempt', 'INTEGER');
  ensureColumn(db, 'subagent_tasks', 'nested_session_path', 'TEXT');
  ensureColumn(db, 'subagent_tasks', 'continuation_prompt', 'TEXT');
  ensureColumn(db, 'subagent_tasks', 'system_prompt', 'TEXT');
  ensureColumn(db, 'subagent_tasks', 'error_metadata_json', 'TEXT');
  ensureColumn(db, 'subagent_tasks', 'error_category', 'TEXT');
  ensureColumn(db, 'subagent_tasks', 'pi_retry_attempts', 'INTEGER');
  ensureColumn(db, 'subagent_tasks', 'dropped_tools_json', 'TEXT');
  ensureColumn(db, 'subagent_tasks', 'pending_message_count', 'INTEGER');
  ensureColumn(db, 'subagent_tasks', 'undelivered_message_count', 'INTEGER');
  ensureAttemptColumns(db);
  for (const table of ['subagent_tasks', 'subagent_task_attempts']) {
    ensureColumn(db, table, 'progress_updates_json', 'TEXT');
    for (const column of TIMEOUT_COLUMNS)
      ensureColumn(db, table, column, 'INTEGER');
  }
  ensureColumn(db, 'subagent_events', 'attempt', 'INTEGER');
}

export class SubagentHistoryStore {
  private dbs = new Map<string, Db>();
  private closed = false;

  close(): void {
    if (this.closed && this.dbs.size === 0) return;
    this.closed = true;
    const errors: unknown[] = [];
    for (const [file, db] of this.dbs) {
      try {
        this.closeDb(file, db);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(
        errors,
        'Failed to close subagent history databases.',
      );
  }

  private db(_cwd: string, busyTimeoutMs = HISTORY_BUSY_TIMEOUT_MS): Db {
    if (this.closed) throw new Error('Subagent history store is closed.');
    const file = resolveSubagentHistoryDbPath();
    if (historyState(file).compacting)
      throw new Error(
        'Subagent history is busy: explicit compaction is running.',
      );
    const existing = this.dbs.get(file);
    if (existing) return existing;
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    try {
      fs.chmodSync(path.dirname(file), 0o700);
    } catch {}
    const Database = loadDbConstructor();
    const db = new Database(file) as Db;
    try {
      fs.chmodSync(file, 0o600);
    } catch {}
    try {
      configureHistoryDb(db, busyTimeoutMs);
      initializeHistorySchema(db);
      this.dbs.set(file, db);
      historyState(file).stores.add(this);
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  private closeDb(file: string, db: Db): void {
    db.close();
    this.dbs.delete(file);
    historyState(file).stores.delete(this);
  }

  /** Explicit only. Suspend local users, then hold SQLite exclusion until close. */
  static async compactHistory({
    olderThanMs,
  }: {
    olderThanMs?: number;
  }): Promise<CompactHistoryResult> {
    if (olderThanMs !== undefined) new Date(olderThanMs).toISOString();
    const file = resolveSubagentHistoryDbPath();
    const state = historyState(file);
    if (state.compacting)
      throw new Error(
        'History compaction refused: compaction is already running.',
      );
    state.compacting = true;
    let db: Db | undefined;
    let acquired = false;
    try {
      // Idle waits must not delay exclusivity until unrelated tasks finish.
      for (const paused of state.pausedPruning) paused.abort();
      // Prevent new maintenance passes, and let every current batch/pass settle.
      await Promise.allSettled([...state.pruning]);
      const beforeBytes = historyFileBytes(file);
      for (const store of [...state.stores]) {
        for (const [storeFile, connection] of store.dbs)
          if (historyState(storeFile) === state)
            store.closeDb(storeFile, connection);
      }
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      const Database = loadDbConstructor();
      db = new Database(file);
      // These PRAGMAs do not access database pages. In WAL mode, EXCLUSIVE must
      // precede the first access, so an established WAL connection blocks BEGIN.
      db.exec('PRAGMA locking_mode = EXCLUSIVE');
      db.exec(`PRAGMA busy_timeout = ${PRUNE_BUSY_TIMEOUT_MS}`);
      db.exec('BEGIN IMMEDIATE');
      db.exec('COMMIT');
      acquired = true;
      initializeHistorySchema(db);
      const connection = db;
      const pruned =
        olderThanMs === undefined
          ? undefined
          : await SubagentHistoryStore.pruneOnDb(
              { olderThanMs },
              () => connection,
            );
      if (pruned?.busy) throw new Error('History pruning could not finish.');
      // EXCLUSIVE locking_mode retains exclusion across the pruning commits.
      // VACUUM must run outside a transaction, on this very same connection.
      db.exec('VACUUM');
      db.close();
      db = undefined;
      return { beforeBytes, afterBytes: historyFileBytes(file), pruned };
    } catch (error) {
      if (!acquired && isSqliteBusy(error))
        throw new Error(
          'History compaction refused: another process or connection has the database open or locked. Close other Pi sessions and retry. No history data was changed.',
          { cause: error },
        );
      throw new Error(
        `History compaction failed: ${error instanceof Error ? error.message : String(error)}. VACUUM can need up to twice the database size in free disk space; check free space and filesystem permissions. Pruning may already have completed.`,
        { cause: error },
      );
    } finally {
      try {
        db?.close();
      } finally {
        state.compacting = false;
      }
    }
  }

  upsertTask(cwd: string, task: SubagentTask): void {
    const db = this.db(cwd);
    upsertTaskRecord(db, 'subagent_tasks', cwd, task);
    upsertTaskRecord(db, 'subagent_task_attempts', cwd, task);
  }

  /** Clear heavy columns, never task outcomes. olderThanMs is an epoch-ms cutoff. */
  async pruneExecutionDetail(
    options: PruneOptions,
  ): Promise<PruneExecutionDetailResult> {
    const state = historyState(resolveSubagentHistoryDbPath());
    if (state.compacting)
      return {
        tasksCleared: 0,
        attemptsCleared: 0,
        eventsDeleted: 0,
        busy: true,
      };
    const controller = new AbortController();
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;
    const waitUntilIdle = options.waitUntilIdle;
    const pass = SubagentHistoryStore.pruneOnDb(
      {
        ...options,
        signal,
        waitUntilIdle: waitUntilIdle
          ? (signal) => {
              const pause = waitUntilIdle(signal);
              if (!pause) return;
              state.pausedPruning.add(controller);
              // Compaction may have started during the preceding batch's rest.
              if (state.compacting) controller.abort();
              return pause.finally(() =>
                state.pausedPruning.delete(controller),
              );
            }
          : undefined,
      },
      () => this.db('', PRUNE_BACKGROUND_BUSY_TIMEOUT_MS),
      true,
    );
    state.pruning.add(pass);
    try {
      return await pass;
    } finally {
      state.pruning.delete(pass);
    }
  }

  private static async pruneOnDb(
    {
      olderThanMs,
      batchSize,
      now = () => performance.now(),
      waitUntilIdle,
      signal = new AbortController().signal,
    }: PruneOptions,
    openDb: () => Db,
    background = false,
  ): Promise<PruneExecutionDetailResult> {
    const cutoff = new Date(olderThanMs).toISOString();
    if (
      batchSize !== undefined &&
      (!Number.isInteger(batchSize) || batchSize < 1)
    )
      throw new Error('Pruning batchSize must be a positive integer.');
    const counts: PruneExecutionDetailResult = {
      tasksCleared: 0,
      attemptsCleared: 0,
      eventsDeleted: 0,
      busy: false,
    };
    const pauseForIdle = () => {
      signal.throwIfAborted();
      return waitUntilIdle?.(signal);
    };
    let db: Db | undefined;
    try {
      for (let pause = pauseForIdle(); pause; pause = pauseForIdle())
        await pause;
      signal.throwIfAborted();
      db = openDb();
      db.exec(
        `PRAGMA busy_timeout = ${background ? PRUNE_BACKGROUND_BUSY_TIMEOUT_MS : PRUNE_BUSY_TIMEOUT_MS}`,
      );
      const detailPredicate =
        'thread_snapshot_json IS NOT NULL OR transcript IS NOT NULL OR system_prompt IS NOT NULL';
      // Build only during maintenance, after the activity gate, never at startup.
      // A busy build ends the pass via the outer catch, just like a busy batch;
      // IF NOT EXISTS lets later passes/processes retry safely without shared state.
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_subagent_tasks_retention_detail
          ON subagent_tasks(status, last_activity_at, ended_at, started_at, created_at, id)
          WHERE ${detailPredicate};
        CREATE INDEX IF NOT EXISTS idx_subagent_task_attempts_retention_detail
          ON subagent_task_attempts(task_id, attempt)
          WHERE ${detailPredicate};
      `);
      const detailBatches = [
        {
          table: 'subagent_tasks',
          keys: ['id'],
          count: 'tasksCleared' as const,
          args: [...TERMINAL_STATUSES, cutoff],
          predicate: `(${detailPredicate})
            AND status IN (${TERMINAL_STATUSES.map(() => '?').join(', ')})
            AND julianday(COALESCE(last_activity_at, ended_at, started_at, created_at)) < julianday(?)`,
        },
        {
          table: 'subagent_task_attempts',
          keys: ['task_id', 'attempt'],
          count: 'attemptsCleared' as const,
          args: [],
          predicate: `(${detailPredicate})`,
        },
      ];
      const connection = db;
      const batches = detailBatches.map((batch) => {
        const select = connection.prepare(`
          SELECT ${batch.keys.join(', ')} FROM ${batch.table}
          WHERE ${batch.predicate} LIMIT ?
        `);
        return {
          count: batch.count,
          initialSize: batchSize ?? 1,
          maxSize: batchSize ?? 100,
          selectBatch(size: number) {
            // Scan without the write lock; recheck eligibility after acquiring it.
            const candidates = select.all(...batch.args, size) as Record<
              string,
              unknown
            >[];
            const placeholders = `(${batch.keys.map(() => '?').join(', ')})`;
            const keyPredicate = candidates.length
              ? `(${batch.keys.join(', ')}) IN (${candidates.map(() => placeholders).join(', ')})`
              : '0';
            return {
              statement: connection.prepare(`
                UPDATE ${batch.table}
                SET thread_snapshot_json = NULL, transcript = NULL, system_prompt = NULL
                WHERE ${keyPredicate} AND ${batch.predicate}
              `),
              args: [
                ...candidates.flatMap((row) =>
                  batch.keys.map((key) => row[key]),
                ),
                ...batch.args,
              ],
              candidateCount: candidates.length,
            };
          },
        };
      });
      const events = db.prepare(
        'DELETE FROM subagent_events WHERE id IN (SELECT id FROM subagent_events LIMIT ?)',
      );
      const eventBatch = {
        count: 'eventsDeleted' as const,
        initialSize: batchSize ?? 100,
        maxSize: batchSize ?? 10000,
        selectBatch: (size: number) => ({
          statement: events,
          args: [size],
          candidateCount: undefined,
        }),
      };
      const changes = db.prepare('SELECT changes() AS count');
      for (const batch of [...batches, eventBatch]) {
        let size = batch.initialSize;
        while (true) {
          for (let pause = pauseForIdle(); pause; pause = pauseForIdle())
            await pause;
          signal.throwIfAborted();
          const startedAt = now();
          const selected = batch.selectBatch(size);
          signal.throwIfAborted();
          let changed: number;
          // A failed BEGIN is handled by the outer busy catch, with nothing to roll back.
          db.exec('BEGIN IMMEDIATE');
          try {
            selected.statement.run(...selected.args);
            changed = (changes.all()[0] as { count: number }).count;
            db.exec('COMMIT');
            counts[batch.count] += changed;
          } catch (error) {
            db.exec('ROLLBACK');
            throw error;
          }
          const elapsed = now() - startedAt;
          // Timers/input get a real rest, not just another immediate callback.
          // Match overruns too, keeping maintenance's duty cycle at most ~50%.
          await new Promise<void>((resolve) => {
            const finish = () => {
              clearTimeout(timer);
              signal.removeEventListener('abort', finish);
              resolve();
            };
            const timer = setTimeout(
              finish,
              Math.max(PRUNE_SLICE_BUDGET_MS, elapsed),
            );
            if (background) timer.unref();
            signal.addEventListener('abort', finish, { once: true });
            if (signal.aborted) finish();
          });
          signal.throwIfAborted();
          // Concurrently rejected keys must not hide later eligible candidates.
          if ((selected.candidateCount ?? changed) < size) break;
          // SQLite calls cannot be preempted. Shrink after an overrun (even to a
          // single heavy row); grow cautiously when there is ample headroom.
          if (elapsed > PRUNE_SLICE_BUDGET_MS)
            size = Math.max(1, Math.floor(size / 2));
          else if (elapsed < PRUNE_SLICE_BUDGET_MS / 2)
            size = Math.min(batch.maxSize, size * 2);
        }
      }
    } catch (error) {
      if (signal.aborted && error === signal.reason) counts.aborted = true;
      else if (isSqliteBusy(error)) counts.busy = true;
      else throw error;
    } finally {
      db?.exec(`PRAGMA busy_timeout = ${HISTORY_BUSY_TIMEOUT_MS}`);
    }
    return counts;
  }

  getTask(
    cwd: string,
    id: string,
    options: HistoryReadOptions = {},
  ): SubagentTask | undefined {
    const rows = this.db(cwd)
      .prepare(`
      SELECT * FROM subagent_tasks WHERE cwd = ? AND id = ? LIMIT 1
    `)
      .all(cwd, id);
    return rows.length ? rowToTask(rows[0], options) : undefined;
  }

  listTasks(
    cwd: string,
    limit = 100,
    options: HistoryReadOptions = {},
  ): SubagentTask[] {
    return this.db(cwd)
      .prepare(`
      SELECT * FROM subagent_tasks WHERE cwd = ?
      ORDER BY COALESCE(last_activity_at, started_at, created_at) DESC, created_at DESC, id DESC
      LIMIT ?
    `)
      .all(cwd, limit)
      .map((row) => rowToTask(row, options));
  }

  listSessionTasks(
    cwd: string,
    sessionId: string,
    limit = 100,
    options: HistoryReadOptions = {},
  ): SubagentTask[] {
    return this.db(cwd)
      .prepare(`
      SELECT * FROM subagent_tasks WHERE cwd = ? AND session_id = ?
      ORDER BY COALESCE(last_activity_at, started_at, created_at) DESC, created_at DESC, id DESC
      LIMIT ?
    `)
      .all(cwd, sessionId, limit)
      .map((row) => rowToTask(row, options));
  }

  /** Uncapped counts and overlap identities from the same persisted snapshot. */
  snapshotSessionTaskCounts(
    cwd: string,
    sessionId: string,
  ): SubagentSessionTaskCounts {
    const rows = this.db(cwd)
      .prepare(`
      SELECT status, COUNT(*) AS count, json_group_array(id) AS ids
      FROM subagent_tasks WHERE cwd = ? AND session_id = ?
      GROUP BY status
    `)
      .all(cwd, sessionId) as Array<{
      status: SubagentTask['status'];
      count: number;
      ids: string;
    }>;
    const counts: SubagentSessionTaskCounts['counts'] = {};
    const statusesById = new Map<string, SubagentTask['status']>();
    for (const row of rows) {
      counts[row.status] = row.count;
      for (const id of JSON.parse(row.ids) as string[])
        statusesById.set(id, row.status);
    }
    return { counts, statusesById };
  }

  listSessionTaskMetadata(
    cwd: string,
    sessionId: string,
    limit = 100,
  ): SubagentTask[] {
    return this.db(cwd)
      .prepare(`
      SELECT ${SESSION_TASK_METADATA_COLUMNS}
      FROM subagent_tasks WHERE cwd = ? AND session_id = ?
      ORDER BY COALESCE(last_activity_at, started_at, created_at) DESC, created_at DESC, id DESC
      LIMIT ?
    `)
      .all(cwd, sessionId, limit)
      .map((row) => rowToTask(row, { includeSnapshots: false }));
  }

  /** Bounded terminal candidates for discovery, independent of launch/activity. */
  listSessionTaskMetadataByCompletion(
    cwd: string,
    sessionId: string,
    limit = 100,
  ): SubagentTask[] {
    return this.db(cwd)
      .prepare(`
      SELECT ${SESSION_TASK_METADATA_COLUMNS}
      FROM subagent_tasks WHERE cwd = ? AND session_id = ?
        AND status IN ('completed', 'failed', 'cancelled', 'interrupted')
      ORDER BY ended_at DESC, id DESC
      LIMIT ?
    `)
      .all(cwd, sessionId, limit)
      .map((row) => rowToTask(row, { includeSnapshots: false }));
  }

  /** Separate cost ranking: recency-based history readers remain unchanged. */
  listSessionTaskMetadataByCost(
    cwd: string,
    sessionId: string,
  ): SubagentTask[] {
    return this.db(cwd)
      .prepare(`
      SELECT ${SESSION_TASK_METADATA_COLUMNS}
      FROM subagent_tasks WHERE cwd = ? AND session_id = ?
      ORDER BY usage_cost DESC, created_at DESC, id DESC
      LIMIT 100
    `)
      .all(cwd, sessionId)
      .map((row) => rowToTask(row, { includeSnapshots: false }));
  }

  listTasksByStatus(
    cwd: string,
    statuses: SubagentTask['status'][],
    options: HistoryReadOptions = {},
  ): SubagentTask[] {
    if (!statuses.length) return [];
    const placeholders = statuses.map(() => '?').join(', ');
    return this.db(cwd)
      .prepare(`
      SELECT * FROM subagent_tasks WHERE cwd = ? AND status IN (${placeholders})
      ORDER BY COALESCE(last_activity_at, started_at, created_at) DESC, created_at DESC, id DESC
    `)
      .all(cwd, ...statuses)
      .map((row) => rowToTask(row, options));
  }

  listTaskAttempts(
    cwd: string,
    taskId: string,
    options: HistoryReadOptions = {},
  ): SubagentTask[] {
    return this.db(cwd)
      .prepare(`
      SELECT
        task_id AS id,
        display_name,
        cwd,
        agent,
        mode,
        status,
        task,
        context,
        created_at,
        attempt,
        session_id,
        nested_session_path,
        started_at,
        ended_at,
        last_activity_at,
        last_activity,
        output_preview,
        prompt,
        continuation_prompt,
        system_prompt,
        transcript,
        usage_input,
        usage_output,
        usage_cache_read,
        usage_cache_write,
        usage_cost,
        usage_context_tokens,
        usage_turns,
        generation_output_tokens,
        generation_ms,
        model,
        effort,
        model_source,
        effort_source,
        fallback_used,
        error,
        error_metadata_json,
        error_category,
        result,
        thread_snapshot_json,
        pi_retry_attempts,
        pending_message_count,
        undelivered_message_count,
        dropped_tools_json,
        ${TIMEOUT_HISTORY_COLUMNS}
      FROM subagent_task_attempts
      WHERE cwd = ? AND task_id = ?
      ORDER BY attempt ASC
    `)
      .all(cwd, taskId)
      .map((row) => rowToTask(row, options));
  }
}

function parseDroppedTools(text: unknown): string[] | undefined {
  if (typeof text !== 'string') return undefined;
  try {
    const names: unknown = JSON.parse(text);
    return Array.isArray(names) &&
      names.every((name) => typeof name === 'string')
      ? names
      : undefined;
  } catch {
    return undefined;
  }
}

function parseProgressUpdates(raw: unknown): SubagentTask['progress_updates'] {
  if (typeof raw !== 'string') return undefined;
  try {
    const updates: unknown = JSON.parse(raw);
    if (!Array.isArray(updates)) return undefined;
    return updates
      .filter(
        (update) =>
          typeof update?.message === 'string' &&
          typeof update?.created_at === 'string',
      )
      .slice(-5)
      .map((update) => ({
        message: update.message,
        created_at: update.created_at,
      }));
  } catch {
    return undefined;
  }
}

function rowToTask(row: any, options: HistoryReadOptions = {}): SubagentTask {
  return {
    id: row.id,
    display_name: row.display_name ?? undefined,
    agent: row.agent,
    mode: row.mode,
    status: row.status,
    task: row.task,
    context: row.context ?? undefined,
    created_at: row.created_at,
    attempt: row.attempt ?? 1,
    session_id: row.session_id ?? undefined,
    nested_session_path: row.nested_session_path ?? undefined,
    started_at: row.started_at ?? undefined,
    ended_at: row.ended_at ?? undefined,
    last_activity_at: row.last_activity_at ?? undefined,
    last_activity: row.last_activity ?? undefined,
    output_preview: row.output_preview ?? undefined,
    prompt: row.prompt ?? undefined,
    continuation_prompt: row.continuation_prompt ?? undefined,
    system_prompt: row.system_prompt ?? undefined,
    transcript: row.transcript ?? undefined,
    usage:
      row.usage_input == null &&
      row.usage_output == null &&
      row.usage_cache_read == null &&
      row.usage_cache_write == null &&
      row.usage_cost == null &&
      row.usage_context_tokens == null &&
      row.usage_turns == null
        ? undefined
        : {
            input: row.usage_input ?? 0,
            output: row.usage_output ?? 0,
            cacheRead: row.usage_cache_read ?? 0,
            cacheWrite: row.usage_cache_write ?? 0,
            cost: row.usage_cost ?? 0,
            contextTokens: row.usage_context_tokens ?? 0,
            turns: row.usage_turns ?? 0,
          },
    runtime_metrics:
      row.generation_output_tokens == null || row.generation_ms == null
        ? undefined
        : {
            generationOutputTokens: row.generation_output_tokens,
            generationMs: row.generation_ms,
          },
    model: row.model ?? undefined,
    effort: row.effort ?? undefined,
    model_source: row.model_source ?? undefined,
    effort_source: row.effort_source ?? undefined,
    fallback_used:
      row.fallback_used === null || row.fallback_used === undefined
        ? undefined
        : Boolean(row.fallback_used),
    error: row.error ?? undefined,
    error_metadata: parseErrorMetadata(row.error_metadata_json),
    result: row.result ?? undefined,
    thread_snapshot:
      options.includeSnapshots === false
        ? undefined
        : parseSnapshotJson(row.thread_snapshot_json),
    pi_retry_attempts: row.pi_retry_attempts ?? undefined,
    dropped_tools: parseDroppedTools(row.dropped_tools_json),
    progress_updates: parseProgressUpdates(row.progress_updates_json),
    timeout_started_at: row.timeout_started_at ?? undefined,
    timeout_deadline_at: row.timeout_deadline_at ?? undefined,
    timeout_extensions_used: row.timeout_extensions_used ?? undefined,
    timeout_deadline_generation: row.timeout_deadline_generation ?? undefined,
    timeout_max_extensions: row.timeout_max_extensions ?? undefined,
    timeout_continue_enabled:
      row.timeout_continue_enabled == null
        ? undefined
        : Boolean(row.timeout_continue_enabled),
    pending_message_count:
      row.pending_message_count === null ||
      row.pending_message_count === undefined
        ? undefined
        : row.pending_message_count,
    undelivered_message_count:
      row.undelivered_message_count === null ||
      row.undelivered_message_count === undefined
        ? undefined
        : row.undelivered_message_count,
  };
}
