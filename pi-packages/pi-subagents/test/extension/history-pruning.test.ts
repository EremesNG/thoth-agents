import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import subagentsExtension from '../../src/extension/subagents-extension.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const require = createRequire(import.meta.url);
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
  extension({
    registerTool: () => {},
    on: (name: string, handler: (event: unknown, ctx: unknown) => unknown) =>
      handlers.set(name, handler),
  });
  const ctx = { cwd: env.tmp, hasUI: false, sessionId: 'parent' };
  return (name: string) => handlers.get(name)?.({}, ctx);
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

async function runDeferred() {
  await vi.advanceTimersByTimeAsync(1000);
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('deferred session-start history maintenance', () => {
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
          timers.mock.calls.findIndex((call) => call[1] === 1000)
        ]?.value;
      expect(timer?.hasRef()).toBe(false);
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
    const { DatabaseSync } = require('node:sqlite');
    const writer = new DatabaseSync(process.env.PI_SUBAGENTS_HISTORY_DB_PATH!);
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
