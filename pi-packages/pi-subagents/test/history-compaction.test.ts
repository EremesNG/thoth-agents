import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { SubagentHistoryStore } from '../src/history.js';
import { installSubagentTestEnv } from './helpers/subagent-test-helpers.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const env = installSubagentTestEnv();

function seed() {
  const history = env.createHistoryStore();
  history.upsertTask(env.tmp, {
    id: 'old',
    agent: 'worker',
    mode: 'task',
    status: 'completed',
    task: 'keep the task',
    created_at: '2020-01-01T00:00:00.000Z',
    result: 'keep the result',
    nested_session_path: '/sessions/child.jsonl',
    transcript: 'detail'.repeat(200000),
    system_prompt: 'system prompt',
    usage: {
      input: 1,
      output: 2,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.5,
      contextTokens: 3,
      turns: 1,
    },
  });
  history.upsertTask(env.tmp, {
    id: 'active',
    agent: 'worker',
    mode: 'task',
    status: 'running',
    task: 'active work',
    created_at: '2020-01-01T00:00:00.000Z',
    transcript: 'keep active detail',
  });
  return history;
}

function bytes() {
  const file = process.env.PI_SUBAGENTS_HISTORY_DB_PATH!;
  return [file, `${file}-wal`].reduce(
    (sum, name) => sum + (fs.existsSync(name) ? fs.statSync(name).size : 0),
    0,
  );
}

const olderThanMs = Date.parse('2026-10-01T00:00:00.000Z');

function lateWriter(mode: 'initialize' | 'write') {
  // A different OS process, not a registered in-process history store.
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=commonjs',
      '-e',
      `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(process.argv[1]);
    db.exec('PRAGMA busy_timeout = 30');
    try {
      db.exec(process.argv[2] === 'initialize'
        ? 'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS late_initialization(id)'
        : "INSERT INTO subagent_tasks (id, cwd, agent, mode, status, task, created_at) VALUES ('late', 'late', 'worker', 'task', 'completed', 'late work', '2020-01-01')");
      console.log('unexpected success');
      process.exitCode = 1;
    } catch (error) {
      console.log(error.message);
      process.exitCode = /database (?:is )?(?:busy|locked)/.test(error.message) ? 0 : 2;
    } finally { db.close(); }
  `,
      process.env.PI_SUBAGENTS_HISTORY_DB_PATH!,
      mode,
    ],
    { encoding: 'utf8', timeout: 10000 },
  );
  expect(child.error).toBeUndefined();
  expect(child.status, child.stderr + child.stdout).toBe(0);
  expect(child.stdout).toMatch(/database (?:is )?(?:busy|locked)/);
}

describe('explicit history compaction', () => {
  it.each([
    'established WAL reader',
    'write lock',
  ])('refuses an external %s before changing any database or WAL bytes', async (mode) => {
    const history = seed();
    const file = process.env.PI_SUBAGENTS_HISTORY_DB_PATH!;
    const external = new DatabaseSync(file);
    external.exec('PRAGMA journal_mode = WAL');
    expect(
      external.prepare('SELECT COUNT(*) AS count FROM subagent_tasks').get()
        .count,
    ).toBe(2);
    if (mode === 'write lock') external.exec('BEGIN IMMEDIATE');
    const before = [file, `${file}-wal`].map((name) => fs.readFileSync(name));
    try {
      await expect(
        SubagentHistoryStore.compactHistory({ olderThanMs }),
      ).rejects.toThrow(
        /refused: another process or connection.*open or locked.*No history data was changed/,
      );
      for (const [index, name] of [file, `${file}-wal`].entries())
        expect(fs.readFileSync(name).equals(before[index]!)).toBe(true);
      expect(history.getTask(env.tmp, 'old')?.transcript).toHaveLength(1200000);
    } finally {
      if (mode === 'write lock') external.exec('ROLLBACK');
      external.close();
    }
    await expect(
      SubagentHistoryStore.compactHistory({ olderThanMs }),
    ).resolves.toMatchObject({
      pruned: { tasksCleared: 1, busy: false },
    });
  });

  it.each([
    'initialize',
    'write',
  ] as const)('blocks a newly opened process attempting to %s during pruning and immediately before VACUUM', async (mode) => {
    const history = seed();
    for (let index = 0; index < 101; index++) {
      history.upsertTask(env.tmp, {
        id: `batch-${index}`,
        agent: 'worker',
        mode: 'task',
        status: 'completed',
        task: 'committed work',
        created_at: '2020-01-01T00:00:00.000Z',
        transcript: 'detail',
        result: `committed-${index}`,
      });
    }
    let beforeVacuum = false;
    const exec = DatabaseSync.prototype.exec;
    const spy = vi
      .spyOn(DatabaseSync.prototype, 'exec')
      .mockImplementation(function (
        this: InstanceType<typeof DatabaseSync>,
        sql,
      ) {
        if (sql === 'VACUUM') {
          beforeVacuum = true;
          lateWriter(mode);
        }
        return exec.call(this, sql);
      });
    const compacting = SubagentHistoryStore.compactHistory({ olderThanMs });
    try {
      // The first one-row pruning commit yields; there is still another batch.
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(beforeVacuum).toBe(false);
      lateWriter(mode);
      await expect(compacting).resolves.toMatchObject({
        pruned: { tasksCleared: 102 },
      });
      expect(beforeVacuum).toBe(true);
    } finally {
      await compacting;
      spy.mockRestore();
    }
    expect(history.listTasks(env.tmp, 200)).toHaveLength(103);
    expect(history.getTask(env.tmp, 'old')?.result).toBe('keep the result');
    for (let index = 0; index < 101; index++)
      expect(history.getTask(env.tmp, `batch-${index}`)?.result).toBe(
        `committed-${index}`,
      );
    expect(history.getTask(env.tmp, 'late')).toBeUndefined();
  });

  it('waits for an in-flight maintenance pass and skips new passes until compaction releases exclusion', async () => {
    const history = seed();
    for (let index = 0; index < 3; index++)
      history.upsertTask(env.tmp, {
        id: `maintenance-${index}`,
        agent: 'worker',
        mode: 'task',
        status: 'completed',
        task: 'work',
        created_at: '2020-01-01T00:00:00.000Z',
        transcript: 'detail',
      });
    // A separately evaluated module still shares the same suspension/registry.
    vi.resetModules();
    const ReloadedStore = (await import('../src/history.js'))
      .SubagentHistoryStore;
    const newMaintenance = new ReloadedStore();
    expect(newMaintenance.getTask(env.tmp, 'old')?.result).toBe(
      'keep the result',
    );
    let maintenanceFinished = false;
    const maintenance = history
      .pruneExecutionDetail({ olderThanMs, batchSize: 1 })
      .then((result) => {
        maintenanceFinished = true;
        return result;
      });
    let acquired = false;
    const exec = DatabaseSync.prototype.exec;
    const spy = vi
      .spyOn(DatabaseSync.prototype, 'exec')
      .mockImplementation(function (
        this: InstanceType<typeof DatabaseSync>,
        sql,
      ) {
        if (sql === 'PRAGMA locking_mode = EXCLUSIVE') {
          expect(maintenanceFinished).toBe(true);
          acquired = true;
        }
        return exec.call(this, sql);
      });
    const compacting = SubagentHistoryStore.compactHistory({ olderThanMs });
    try {
      expect(maintenanceFinished).toBe(false);
      try {
        expect(
          await newMaintenance.pruneExecutionDetail({ olderThanMs }),
        ).toEqual({
          tasksCleared: 0,
          attemptsCleared: 0,
          eventsDeleted: 0,
          busy: true,
        });
      } finally {
        newMaintenance.close();
      }
      expect(await maintenance).toMatchObject({ tasksCleared: 4, busy: false });
      expect(await compacting).toMatchObject({
        pruned: { tasksCleared: 0, busy: false },
      });
      expect(acquired).toBe(true);
      expect(history.getTask(env.tmp, 'old')?.result).toBe('keep the result');
    } finally {
      await maintenance;
      await compacting;
      spy.mockRestore();
    }
  });

  it('prunes and shrinks the database plus WAL, keeps outcomes and active detail, and lazily reopens all local stores', async () => {
    const history = seed();
    const secondStore = env.createHistoryStore();
    expect(secondStore.getTask(env.tmp, 'old')?.result).toBe('keep the result');
    const beforeBytes = bytes();

    const result = await SubagentHistoryStore.compactHistory({ olderThanMs });

    expect(result.beforeBytes).toBe(beforeBytes);
    expect(result.afterBytes).toBe(bytes());
    expect(result.afterBytes).toBeLessThan(result.beforeBytes / 2);
    expect(result.pruned).toMatchObject({ tasksCleared: 1, busy: false });
    expect(history.getTask(env.tmp, 'old')).toMatchObject({
      task: 'keep the task',
      result: 'keep the result',
      nested_session_path: '/sessions/child.jsonl',
      transcript: undefined,
      system_prompt: undefined,
      usage: { cost: 0.5 },
    });
    expect(secondStore.getTask(env.tmp, 'active')?.transcript).toBe(
      'keep active detail',
    );
    history.upsertTask(env.tmp, {
      ...history.getTask(env.tmp, 'old')!,
      result: 'new committed result',
    });
    expect(secondStore.getTask(env.tmp, 'old')?.result).toBe(
      'new committed result',
    );
  });
});
