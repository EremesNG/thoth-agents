import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import {
  BACKGROUND_STATE_CHANNEL,
  BACKGROUND_STATE_REQUEST,
  type BackgroundSnapshot,
  type EventBus,
  isBackgroundSnapshot,
  request,
  type ThothEnvelope,
} from '@thoth-agents/pi-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  baseDir,
  logPathFor,
  metaPathFor,
  taskDir,
  writeMeta,
} from './registry.js';
import { registerBackgroundTaskStateEvents } from './task-state-events.js';
import { lifecycleHost } from './test-support/lifecycle-harness.js';
import type { BackgroundTaskMeta } from './types.js';

type PublisherHost = {
  events: EventBus;
  ctx: ExtensionContext;
  snapshots: ThothEnvelope<BackgroundSnapshot>[];
  emit(type: string): Promise<void>;
};

function publisherHost(
  sessionId = 'session-a',
  cwd = '/project',
): PublisherHost {
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const events: EventBus = {
    emit(name, data) {
      for (const listener of [...(listeners.get(name) ?? [])]) listener(data);
    },
    on(name, listener) {
      const entries = listeners.get(name) ?? new Set();
      entries.add(listener);
      listeners.set(name, entries);
      return () => {
        entries.delete(listener);
      };
    },
  };
  const hooks = new Map<
    string,
    Array<(event: unknown, ctx: ExtensionContext) => unknown>
  >();
  const snapshots: ThothEnvelope<BackgroundSnapshot>[] = [];
  events.on(BACKGROUND_STATE_CHANNEL.name, (value) => {
    snapshots.push(value as ThothEnvelope<BackgroundSnapshot>);
  });
  const ctx = {
    cwd,
    sessionManager: { getSessionId: () => sessionId },
  } as ExtensionContext;
  const pi = {
    events,
    on(
      name: string,
      handler: (event: unknown, ctx: ExtensionContext) => unknown,
    ) {
      const handlers = hooks.get(name) ?? [];
      handlers.push(handler);
      hooks.set(name, handlers);
    },
  } as unknown as ExtensionAPI;
  registerBackgroundTaskStateEvents(pi);
  const host = {
    events,
    ctx,
    snapshots,
    async emit(type: string) {
      for (const handler of hooks.get(type) ?? []) await handler({ type }, ctx);
    },
  };
  hosts.push(host);
  return host;
}

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, watch: vi.fn(fs.watch) };
});

const hosts: PublisherHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.emit('session_shutdown');
  rmSync(baseDir(), { recursive: true, force: true });
  vi.clearAllMocks();
});

function task(
  id = 'task-a',
  fields: Partial<BackgroundTaskMeta> = {},
): BackgroundTaskMeta {
  return {
    id,
    name: 'Build',
    kind: 'process',
    status: 'running',
    startedAt: 1000,
    cwd: '/project',
    callbackOrigin: { cwd: '/project', sessionId: 'session-a' },
    logPath: logPathFor(id),
    spawnPid: process.pid,
    ...fields,
  };
}

function serialized(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function requestState(host: PublisherHost, sessionId = 'session-a'): void {
  request(host.events, BACKGROUND_STATE_REQUEST, {
    sessionId,
    source: 'consumer',
    data: {},
  });
}

function replaceExternally(meta: BackgroundTaskMeta): void {
  const path = metaPathFor(meta.id);
  const temporary = `${path}.external.tmp`;
  writeFileSync(temporary, JSON.stringify(meta));
  renameSync(temporary, path);
}

describe('background task state events', () => {
  it('leaves tool-only hosts with no event bus usable', () => {
    expect(() =>
      registerBackgroundTaskStateEvents({ on() {} } as unknown as ExtensionAPI),
    ).not.toThrow();
  });

  it('publishes a validated allow-list summary without command, result, environment or log fields', async () => {
    writeMeta(
      task('task-a', {
        kind: 'command_watch',
        status: 'failed',
        endedAt: 2000,
        deadlineAt: 3000,
        lastCheckedAt: 1800,
        lastProgressAt: 1700,
        stopRequestedAt: 1900,
        dismissedAt: 2100,
        lastExitCode: 2,
        lastSignal: 'SIGTERM',
        command: 'secret command',
        argv: ['secret argument'],
        env: { TOKEN: 'secret' },
        result: { reason: 'secret result' },
        lastState: { secret: 'state' },
        successWhen: { type: 'stdout_contains', value: 'secret condition' },
      }),
    );
    const host = publisherHost();
    await host.emit('session_start');
    expect(host.snapshots).toHaveLength(1);
    expect(serialized(host.snapshots[0])).toEqual({
      v: 1,
      source: '@thoth-agents/pi-background-tasks',
      sessionId: 'session-a',
      at: expect.any(Number),
      data: {
        tasks: [
          {
            id: 'task-a',
            name: 'Build',
            kind: 'command_watch',
            status: 'failed',
            createdAt: 1000,
            startedAt: 1000,
            endedAt: 2000,
            deadlineAt: 3000,
            lastCheckedAt: 1800,
            lastProgressAt: 1700,
            stopRequestedAt: 1900,
            dismissedAt: 2100,
            exitCode: 2,
            signal: 'SIGTERM',
            dismissed: true,
          },
        ],
        counts: {
          running: 0,
          succeeded: 0,
          failed: 1,
          cancelled: 0,
          timed_out: 0,
        },
      },
    });
    expect(isBackgroundSnapshot(host.snapshots[0]?.data)).toBe(true);
    expect(JSON.stringify(host.snapshots)).not.toContain('secret');
  });

  it('publishes complete current cwd/session snapshots on local changes, ignoring other origins', async () => {
    writeMeta(task());
    writeMeta(
      task('other-session', {
        callbackOrigin: { cwd: '/project', sessionId: 'session-b' },
      }),
    );
    writeMeta(
      task('other-cwd', {
        cwd: '/elsewhere',
        callbackOrigin: { cwd: '/elsewhere', sessionId: 'session-a' },
      }),
    );
    writeMeta(task('legacy', { callbackOrigin: undefined }));
    const host = publisherHost();
    await host.emit('session_start');
    expect(host.snapshots[0]?.data.tasks.map(({ id }) => id)).toEqual([
      'task-a',
    ]);

    writeMeta(task('task-a', { status: 'succeeded', endedAt: 2000 }));
    writeMeta(task('task-b', { status: 'timed_out', endedAt: 2100 }));
    await vi.waitFor(() =>
      expect(host.snapshots.at(-1)?.data.counts).toEqual({
        running: 0,
        succeeded: 1,
        failed: 0,
        cancelled: 0,
        timed_out: 1,
      }),
    );
    expect(host.snapshots.at(-1)?.data.tasks.map(({ id }) => id)).toEqual([
      'task-a',
      'task-b',
    ]);
    const publications = host.snapshots.length;
    writeMeta(
      task('other-session', {
        status: 'failed',
        callbackOrigin: { cwd: '/project', sessionId: 'session-b' },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(host.snapshots).toHaveLength(publications);
  });

  it('publishes external same-ID atomic replacements from fresh metadata, including repeated replacement', async () => {
    writeMeta(task()); // Seeds the process-owned metadata cache with a running record.
    const host = publisherHost();
    await host.emit('session_start');
    // Linux recursive fs.watch follows file inodes and can stop reporting after
    // the first atomic replacement. Watch the containing directory directly.
    expect(watch).toHaveBeenCalledWith(
      taskDir('task-a'),
      { persistent: false },
      expect.any(Function),
    );
    for (const [, options] of vi.mocked(watch).mock.calls) {
      expect(options).not.toHaveProperty('recursive', true);
    }
    replaceExternally(task('task-a', { status: 'succeeded', endedAt: 2000 }));
    await vi.waitFor(() =>
      expect(host.snapshots.at(-1)?.data.tasks[0]?.status).toBe('succeeded'),
    );
    replaceExternally(
      task('task-a', { status: 'failed', endedAt: 3000, lastExitCode: 1 }),
    );
    await vi.waitFor(() =>
      expect(host.snapshots.at(-1)?.data.tasks[0]?.status).toBe('failed'),
    );
    expect(host.snapshots.at(-1)?.data.counts).toEqual({
      running: 0,
      succeeded: 0,
      failed: 1,
      cancelled: 0,
      timed_out: 0,
    });
  });

  it.each([
    'initial attachment',
    'error recovery',
  ])('discovers tasks created immediately before their parent watcher attaches during %s', async (phase) => {
    writeMeta(task());
    const host = publisherHost();
    if (phase === 'error recovery') await host.emit('session_start');
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const tasksDirectory = dirname(taskDir('task-a'));
    vi.mocked(watch).mockImplementation((...args: Parameters<typeof watch>) => {
      if (args[0] === tasksDirectory) {
        mkdirSync(taskDir('gap-task'), { recursive: true });
        replaceExternally(task('gap-task'));
      }
      return fs.watch(...args);
    });
    try {
      if (phase === 'initial attachment') await host.emit('session_start');
      else {
        const calls = vi.mocked(watch).mock.calls;
        const results = vi.mocked(watch).mock.results;
        const tasksIndex = calls.findIndex(([path]) => path === tasksDirectory);
        results[tasksIndex]?.value.emit(
          'error',
          new Error('watch interrupted'),
        );
        // Simulate the ancestor notification that retries the errored watch.
        const registryIndex = calls.findIndex(([path]) => path === baseDir());
        results[registryIndex]?.value.emit('change', 'rename', 'tasks');
      }
      expect(watch).toHaveBeenCalledWith(
        taskDir('gap-task'),
        { persistent: false },
        expect.any(Function),
      );
      replaceExternally(task('gap-task', { status: 'failed', endedAt: 3000 }));
      await vi.waitFor(() =>
        expect(
          host.snapshots.at(-1)?.data.tasks.find(({ id }) => id === 'gap-task')
            ?.status,
        ).toBe('failed'),
      );
      expect(
        vi
          .mocked(watch)
          .mock.calls.filter(([path]) => path === taskDir('gap-task')),
      ).toHaveLength(1);
    } finally {
      vi.mocked(watch).mockImplementation(fs.watch);
    }
  });

  it('keeps reporting 50 serial and 50 parallel rounds of same-ID replacements', async () => {
    const ids = Array.from({ length: 8 }, (_, index) => `stress-${index}`);
    for (const id of ids) writeMeta(task(id));
    const host = publisherHost();
    await host.emit('session_start');
    for (let round = 1; round <= 50; round++) {
      replaceExternally(task(ids[0], { lastCheckedAt: round }));
      await vi.waitFor(() =>
        expect(
          host.snapshots.at(-1)?.data.tasks.find(({ id }) => id === ids[0])
            ?.lastCheckedAt,
        ).toBe(round),
      );
    }
    for (let round = 51; round <= 100; round++) {
      await Promise.all(
        ids.map(async (id) => {
          const path = metaPathFor(id);
          const temporary = `${path}.stress.tmp`;
          await writeFile(
            temporary,
            JSON.stringify(task(id, { lastCheckedAt: round })),
          );
          await rename(temporary, path);
        }),
      );
      await vi.waitFor(() => {
        const tasks = host.snapshots.at(-1)?.data.tasks;
        expect(tasks).toHaveLength(ids.length);
        expect(tasks?.map(({ lastCheckedAt }) => lastCheckedAt)).toEqual(
          ids.map(() => round),
        );
      });
    }
    expect(watch).toHaveBeenCalledTimes(3 + ids.length);
  }, 20_000);

  it('starts with no registry and discovers externally created tasks without polling or local writes', async () => {
    expect(existsSync(baseDir())).toBe(false);
    const host = publisherHost();
    await host.emit('session_start');
    expect(host.snapshots[0]?.data).toEqual({
      tasks: [],
      counts: {
        running: 0,
        succeeded: 0,
        failed: 0,
        cancelled: 0,
        timed_out: 0,
      },
    });
    expect(existsSync(baseDir())).toBe(false);
    mkdirSync(taskDir('task-a'), { recursive: true });
    replaceExternally(task());
    await vi.waitFor(() =>
      expect(host.snapshots.at(-1)?.data.tasks[0]?.status).toBe('running'),
    );
    replaceExternally(task('task-a', { status: 'cancelled', endedAt: 4000 }));
    await vi.waitFor(() =>
      expect(host.snapshots.at(-1)?.data.tasks[0]?.status).toBe('cancelled'),
    );
  });

  it('rebinds task directory watches after external deletion and recreation', async () => {
    writeMeta(task());
    const host = publisherHost();
    await host.emit('session_start');
    rmSync(taskDir('task-a'), { recursive: true, force: true });
    await vi.waitFor(() =>
      expect(host.snapshots.at(-1)?.data.tasks).toEqual([]),
    );
    mkdirSync(taskDir('task-a'), { recursive: true });
    replaceExternally(task('task-a', { status: 'failed', endedAt: 3000 }));
    await vi.waitFor(() =>
      expect(host.snapshots.at(-1)?.data.tasks[0]?.status).toBe('failed'),
    );
    replaceExternally(task('task-a', { status: 'cancelled', endedAt: 4000 }));
    await vi.waitFor(() =>
      expect(host.snapshots.at(-1)?.data.tasks[0]?.status).toBe('cancelled'),
    );
  });

  it.each([
    'request',
    'local change',
    'external change',
  ] as const)('keeps the active binding after a cancelled switch for %s', async (change) => {
    writeMeta(task());
    const host = publisherHost();
    await host.emit('session_start');
    const closes = vi
      .mocked(watch)
      .mock.results.map(({ value }) => vi.spyOn(value, 'close'));
    expect(closes).toHaveLength(4); // Parent, registry, tasks and task directory.

    // Pi returns immediately on cancellation: no shutdown or start follows.
    await host.emit('session_before_switch');
    if (change === 'request') {
      requestState(host);
      expect(host.snapshots).toHaveLength(2);
      expect(host.snapshots.at(-1)?.data.tasks[0]?.status).toBe('running');
    } else {
      const updated = task('task-a', { status: 'succeeded', endedAt: 2000 });
      if (change === 'local change') writeMeta(updated);
      else replaceExternally(updated);
      await vi.waitFor(() =>
        expect(host.snapshots.at(-1)?.data.tasks[0]?.status).toBe('succeeded'),
      );
      expect(host.snapshots).toHaveLength(2);
    }
    expect(host.snapshots.at(-1)?.sessionId).toBe('session-a');
    expect(watch).toHaveBeenCalledTimes(4);
    for (const close of closes) expect(close).not.toHaveBeenCalled();
  });

  it('disposes and rebinds directory watches on a completed switch and stops all publications on shutdown', async () => {
    writeMeta(task());
    const second = task('task-b', {
      cwd: '/second-project',
      callbackOrigin: { cwd: '/second-project', sessionId: 'session-b' },
    });
    writeMeta(second);
    const host = publisherHost();
    await host.emit('session_start');
    const firstWatches = vi
      .mocked(watch)
      .mock.results.map(({ value }) => vi.spyOn(value, 'close'));
    expect(firstWatches).toHaveLength(5);
    const firstWatchCount = vi.mocked(watch).mock.results.length;
    writeMeta(task('task-a', { status: 'failed' })); // A pending old-origin notification must not cross the switch.
    await host.emit('session_before_switch');
    for (const close of firstWatches) expect(close).not.toHaveBeenCalled();
    // Pi 1.0.2 tears down the old session before starting its replacement.
    await host.emit('session_shutdown');
    for (const close of firstWatches) expect(close).toHaveBeenCalledTimes(1);
    const beforeStart = host.snapshots.length;
    requestState(host);
    expect(host.snapshots).toHaveLength(beforeStart);
    host.ctx.cwd = '/second-project';
    host.ctx.sessionManager.getSessionId = () => 'session-b';
    await host.emit('session_start');
    for (const close of firstWatches) expect(close).toHaveBeenCalledTimes(1);
    expect(host.snapshots.at(-1)?.sessionId).toBe('session-b');
    expect(host.snapshots.at(-1)?.data.tasks.map(({ id }) => id)).toEqual([
      'task-b',
    ]);
    const secondWatches = vi
      .mocked(watch)
      .mock.results.slice(firstWatchCount)
      .map(({ value }) => vi.spyOn(value, 'close'));
    expect(secondWatches).toHaveLength(5);
    expect(watch).toHaveBeenCalledTimes(10);
    expect(
      vi
        .mocked(watch)
        .mock.calls.filter(([directory]) => directory === baseDir()),
    ).toHaveLength(2); // One retired and exactly one live registry watcher.
    const beforeRequest = host.snapshots.length;
    requestState(host);
    expect(host.snapshots).toHaveLength(beforeRequest);
    requestState(host, 'session-b');
    expect(host.snapshots).toHaveLength(beforeRequest + 1);
    replaceExternally({ ...second, status: 'succeeded', endedAt: 2000 });
    await vi.waitFor(() =>
      expect(host.snapshots.at(-1)?.data.tasks[0]?.status).toBe('succeeded'),
    );
    expect(host.snapshots).toHaveLength(beforeRequest + 2);
    writeMeta({ ...second, status: 'cancelled', endedAt: 3000 });
    await vi.waitFor(() =>
      expect(host.snapshots.at(-1)?.data.tasks[0]?.status).toBe('cancelled'),
    );
    expect(host.snapshots).toHaveLength(beforeRequest + 3);
    const publications = host.snapshots.length;
    replaceExternally(task('task-a', { status: 'cancelled' }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(host.snapshots).toHaveLength(publications);
    await host.emit('session_shutdown');
    for (const close of secondWatches) expect(close).toHaveBeenCalledTimes(1);
    replaceExternally({ ...second, status: 'failed' });
    writeMeta({ ...second, status: 'timed_out' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(host.snapshots).toHaveLength(publications);
  });

  it('replaces the previous binding when session_start arrives without shutdown', async () => {
    writeMeta(task());
    const host = publisherHost();
    await host.emit('session_start');
    const firstWatches = vi
      .mocked(watch)
      .mock.results.map(({ value }) => vi.spyOn(value, 'close'));
    expect(firstWatches).toHaveLength(4);

    await host.emit('session_start');
    for (const close of firstWatches) expect(close).toHaveBeenCalledTimes(1);
    const secondWatches = vi
      .mocked(watch)
      .mock.results.slice(firstWatches.length)
      .map(({ value }) => vi.spyOn(value, 'close'));
    expect(secondWatches).toHaveLength(4);
    expect(watch).toHaveBeenCalledTimes(8);
    expect(host.snapshots).toHaveLength(2);
    requestState(host);
    expect(host.snapshots).toHaveLength(3); // Exactly one active request listener.
    replaceExternally(task('task-a', { status: 'succeeded', endedAt: 2000 }));
    await vi.waitFor(() =>
      expect(host.snapshots.at(-1)?.data.tasks[0]?.status).toBe('succeeded'),
    );
    expect(host.snapshots).toHaveLength(4);
    await host.emit('session_shutdown');
    for (const close of firstWatches) expect(close).toHaveBeenCalledTimes(1);
    for (const close of secondWatches) expect(close).toHaveBeenCalledTimes(1);
  });

  it('coalesces requests until readiness and answers only the current session with fresh full snapshots', async () => {
    const host = publisherHost();
    requestState(host);
    requestState(host);
    requestState(host, 'foreign-session');
    expect(host.snapshots).toHaveLength(0);
    writeMeta(task());
    await host.emit('session_start');
    expect(host.snapshots).toHaveLength(1);
    expect(host.snapshots[0]?.data.tasks[0]?.id).toBe('task-a');
    replaceExternally(task('task-a', { status: 'succeeded', endedAt: 2500 }));
    requestState(host);
    expect(host.snapshots).toHaveLength(2);
    expect(host.snapshots[1]?.data.tasks[0]?.status).toBe('succeeded');
    requestState(host, 'foreign-session');
    host.events.emit(BACKGROUND_STATE_REQUEST.name, {
      v: 99,
      source: 'consumer',
      sessionId: 'session-a',
      at: 0,
      data: {},
    });
    expect(host.snapshots).toHaveLength(2);
    await host.emit('session_before_switch');
    requestState(host, 'session-b');
    requestState(host, 'session-b');
    expect(host.snapshots).toHaveLength(2);
    await host.emit('session_shutdown');
    host.ctx.sessionManager.getSessionId = () => 'session-b';
    await host.emit('session_start');
    expect(host.snapshots).toHaveLength(3);
    expect(host.snapshots[2]?.sessionId).toBe('session-b');
    expect(host.snapshots[2]?.data.tasks).toEqual([]);
    await host.emit('session_shutdown');
    requestState(host, 'session-b');
    expect(host.snapshots).toHaveLength(3);
  });

  it('omits unreadable or malformed records instead of publishing an invalid snapshot', async () => {
    writeMeta(task());
    writeMeta(
      task('invalid-status', {
        status: 'unknown' as BackgroundTaskMeta['status'],
      }),
    );
    writeMeta(task('invalid-time', { startedAt: -1 }));
    writeMeta(
      task('invalid-kind', { kind: 'unknown' as BackgroundTaskMeta['kind'] }),
    );
    mkdirSync(taskDir('unreadable'), { recursive: true });
    writeFileSync(metaPathFor('unreadable'), '{');
    const host = publisherHost();
    await host.emit('session_start');
    expect(host.snapshots[0]?.data.tasks.map(({ id }) => id)).toEqual([
      'task-a',
    ]);
    expect(isBackgroundSnapshot(host.snapshots[0]?.data)).toBe(true);
  });

  it.each([
    'missing session',
    'unreadable session',
    'missing cwd',
  ])('fails closed on %s identity and can bind once identity is ready', async (failure) => {
    writeMeta(task());
    const host = publisherHost();
    if (failure === 'missing cwd') host.ctx.cwd = '';
    else
      host.ctx.sessionManager.getSessionId = () => {
        if (failure === 'unreadable session')
          throw new Error('session unavailable');
        return '';
      };
    requestState(host);
    await expect(host.emit('session_start')).resolves.toBeUndefined();
    expect(host.snapshots).toHaveLength(0);
    expect(vi.mocked(watch)).not.toHaveBeenCalled();
    host.ctx.cwd = '/project';
    host.ctx.sessionManager.getSessionId = () => 'session-a';
    await host.emit('session_start');
    expect(host.snapshots).toHaveLength(1);
    expect(host.snapshots[0]?.data.tasks[0]?.id).toBe('task-a');
  });

  it('wires publication into the extension without changing its existing lifecycle', async () => {
    writeMeta(task('task-a', { status: 'failed', endedAt: 2000 }));
    const host = lifecycleHost('session-a');
    host.ctx.cwd = '/project';
    const snapshots: ThothEnvelope<BackgroundSnapshot>[] = [];
    host.pi.events.on(BACKGROUND_STATE_CHANNEL.name, (value) =>
      snapshots.push(value as ThothEnvelope<BackgroundSnapshot>),
    );
    try {
      await host.emit('session_start');
      expect(snapshots.at(-1)?.data.tasks[0]?.id).toBe('task-a');
      writeMeta(task('task-a', { status: 'succeeded', endedAt: 3000 }));
      await vi.waitFor(() =>
        expect(snapshots.at(-1)?.data.tasks[0]?.status).toBe('succeeded'),
      );
      expect(host.tools.has('bg_task_spawn')).toBe(true);
      expect(host.commands.has('bg')).toBe(true);
    } finally {
      await host.emit('session_shutdown', 'reload');
    }
  });
});
