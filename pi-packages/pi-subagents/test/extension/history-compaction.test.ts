import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import subagentsExtension from '../../src/extension/subagents-extension.js';
import { SubagentHistoryStore } from '../../src/history.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const env = installSubagentTestEnv();
let day = 0;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(Date.UTC(2040, 0, ++day));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function host() {
  const handlers = new Map<string, (event: unknown, ctx: unknown) => unknown>();
  const commands = new Map<string, any>();
  const tools = new Map<string, any>();
  const ctx = {
    cwd: env.tmp,
    hasUI: false,
    sessionId: 'parent',
    ui: { notify: vi.fn() },
  };
  subagentsExtension({
    registerTool: (tool: any) => tools.set(tool.name, tool),
    registerCommand: (name: string, command: any) =>
      commands.set(name, command),
    on: (name: string, handler: (event: unknown, ctx: unknown) => unknown) =>
      handlers.set(name, handler),
  });
  return {
    ctx,
    command: commands.get('subagents-history-compact'),
    emit: (name: string) => handlers.get(name)?.({}, ctx),
    status: () =>
      tools
        .get('subagent_status')
        .execute('status', { task_id: 'old' }, undefined, undefined, ctx),
  };
}

function seed() {
  const history = env.createHistoryStore();
  history.upsertTask(env.tmp, {
    id: 'old',
    agent: 'worker',
    mode: 'task',
    status: 'completed',
    task: 'work',
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    result: 'keep the result',
    transcript: 'execution detail'.repeat(10000),
  });
  return history;
}

describe('/subagents-history-compact', () => {
  it.each([
    0, 30, 2,
  ])('honors history_detail_retention_days=%s from command context', async (days) => {
    const history = seed();
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ history_detail_retention_days: days }),
    );
    const { command, ctx, emit } = host();
    try {
      await command.handler('', ctx);
      expect(history.getTask(env.tmp, 'old')?.transcript === undefined).toBe(
        days === 2,
      );
      expect(history.getTask(env.tmp, 'old')?.result).toBe('keep the result');
    } finally {
      await emit('session_shutdown');
    }
  });

  it('reports busy refusal without a success notice or data changes', async () => {
    const history = seed();
    const external = new DatabaseSync(
      process.env.PI_SUBAGENTS_HISTORY_DB_PATH!,
    );
    external.exec('PRAGMA journal_mode = WAL');
    external.prepare('SELECT * FROM subagent_tasks').all();
    const { command, ctx, emit } = host();
    try {
      await expect(command.handler('', ctx)).resolves.toBeUndefined();
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringMatching(
          /refused: another process or connection.*No history data was changed/,
        ),
        'error',
      );
      expect(
        ctx.ui.notify.mock.calls.some(([, level]) => level === 'info'),
      ).toBe(false);
      expect(history.getTask(env.tmp, 'old')?.transcript).toBeDefined();
    } finally {
      external.close();
      await emit('session_shutdown');
    }
  });

  it('warns about twice-size free space on a VACUUM IO failure and releases exclusion for normal access', async () => {
    const history = seed();
    const exec = DatabaseSync.prototype.exec;
    vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementation(function (
      this: InstanceType<typeof DatabaseSync>,
      sql,
    ) {
      if (sql === 'VACUUM')
        throw new Error('SQLITE_FULL: database or disk is full');
      return exec.call(this, sql);
    });
    const { command, ctx, emit, status } = host();
    try {
      await command.handler('', ctx);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringMatching(
          /History compaction failed:.*disk is full.*up to twice the database size in free disk space.*Pruning may already have completed/,
        ),
        'error',
      );
      expect(
        ctx.ui.notify.mock.calls.some(([, level]) => level === 'info'),
      ).toBe(false);
      expect(history.getTask(env.tmp, 'old')?.result).toBe('keep the result');
      expect((await status()).details.task.id).toBe('old');
    } finally {
      await emit('session_shutdown');
    }
  });

  it('skips deferred session-start maintenance while the explicit command holds exclusion', async () => {
    const history = seed();
    const { command, ctx, emit } = host();
    const prune = vi.spyOn(
      SubagentHistoryStore.prototype,
      'pruneExecutionDetail',
    );
    const exec = DatabaseSync.prototype.exec;
    let checkedDuringCompaction = false;
    vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementation(function (
      this: InstanceType<typeof DatabaseSync>,
      sql,
    ) {
      if (sql === 'VACUUM') {
        // Fire the existing AC-2 timer before compaction releases its connection.
        vi.advanceTimersByTime(1000);
        expect(prune).toHaveBeenCalledOnce();
        checkedDuringCompaction = true;
      }
      return exec.call(this, sql);
    });
    try {
      await emit('session_start');
      await command.handler('', ctx);
      expect(checkedDuringCompaction).toBe(true);
      await expect(prune.mock.results[0]!.value).resolves.toEqual({
        tasksCleared: 0,
        attemptsCleared: 0,
        eventsDeleted: 0,
        busy: true,
      });
      expect(history.getTask(env.tmp, 'old')?.result).toBe('keep the result');
    } finally {
      await emit('session_shutdown');
    }
  });

  it('is explicit only, warns about disk space, reports database plus WAL bytes and restores manager history access', async () => {
    const history = seed();
    const compact = vi.spyOn(SubagentHistoryStore, 'compactHistory');
    const exec = vi.spyOn(DatabaseSync.prototype, 'exec');
    const { command, ctx, emit, status } = host();
    try {
      expect(command?.description).toMatch(/prune.*compact/i);
      await emit('session_start');
      expect((await status()).details.task.id).toBe('old');
      await vi.advanceTimersByTimeAsync(1000);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(compact).not.toHaveBeenCalled();
      expect(exec.mock.calls.some(([sql]) => /VACUUM/i.test(String(sql)))).toBe(
        false,
      );
      await command.handler('', ctx);
      expect(compact).toHaveBeenCalledOnce();
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringMatching(
          /up to twice the database size in free disk space/,
        ),
        'warning',
      );
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringMatching(
          /History compacted \(database \+ WAL\): [\d,]+ bytes → [\d,]+ bytes/,
        ),
        'info',
      );
      expect(history.getTask(env.tmp, 'old')?.transcript).toBeUndefined();
      expect((await status()).details.task.id).toBe('old');
    } finally {
      await emit('session_shutdown');
    }
  });
});
