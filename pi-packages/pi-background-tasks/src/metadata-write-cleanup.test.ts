import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackgroundTaskMeta } from './types.js';
import { metaPathFor, onMetaChanged, readMeta, writeMeta } from './registry.js';
import { fakeJobHelper } from './test-support/job-helper-fixture.js';
import { lifecycleHost } from './test-support/lifecycle-harness.js';

vi.mock('./powershell.js', async original => ({
  ...await original<typeof import('./powershell.js')>(), resolvePowerShell: () => 'pwsh.exe',
}));
vi.mock('node:child_process', async original => ({
  ...await original<typeof import('node:child_process')>(), spawn: vi.fn(),
}));
vi.mock('node:fs', async original => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, mkdirSync: vi.fn(fs.mkdirSync), writeFileSync: vi.fn(fs.writeFileSync) };
});

const platform = process.platform;
const hosts: ReturnType<typeof lifecycleHost>[] = [];
let fixture: ReturnType<typeof fakeJobHelper>;

// Inject at the filesystem boundary, retaining the real registry and Job Object client.
async function failMetadataWrite(
  matches: (meta: BackgroundTaskMeta) => boolean, failures = 1,
  fault: { partial?: boolean; corruptTarget?: boolean } = {},
) {
  const { writeFileSync: write } = await vi.importActual<typeof import('node:fs')>('node:fs');
  let failed: BackgroundTaskMeta | undefined;
  const terminalWrites: { status: string; activeProcesses: number }[] = [];
  vi.mocked(writeFileSync).mockImplementation((path, data, options) => {
    if (/meta\.json(?:\.[^\\/]+\.tmp)?$/.test(String(path))) {
      const meta = JSON.parse(String(data)) as BackgroundTaskMeta;
      if (meta.status !== 'running') terminalWrites.push({ status: meta.status, activeProcesses: fixture.live.size });
      if (failures > 0 && matches(meta)) {
        failed ??= meta;
        failures--;
        if (fault.partial) write(path, '{"id":', options);
        // Independent corruption/read loss must not revoke launch-time authority.
        if (fault.corruptTarget) write(metaPathFor(meta.id), '{broken');
        throw new Error('metadata write unavailable');
      }
    }
    return write(path, data, options);
  });
  return { get failed() { return failed; }, terminalWrites };
}

function hostFor(session: string) {
  const host = lifecycleHost(session);
  hosts.push(host);
  return host;
}

afterEach(async () => {
  // Disable only the storage fault; keep real writes and cleanup for teardown.
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  vi.mocked(writeFileSync).mockImplementation(fs.writeFileSync);
  vi.mocked(mkdirSync).mockImplementation(fs.mkdirSync);
  fixture?.onTerminate(() => {});
  fixture?.allowCleanup();
  for (const host of hosts.splice(0)) await host.emit('session_shutdown', 'quit');
  fixture?.helper.kill();
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('metadata write failure preserves launch cleanup ownership', () => {
  it.each(['spawn', 'watch'])('an initial %s metadata write failure launches no process', async kind => {
    fixture = fakeJobHelper(976001);
    const host = hostFor(`${kind}-initial-metadata-write`);
    await host.emit('session_start');
    const fault = await failMetadataWrite(() => true);
    await expect(host.execute(`bg_task_${kind}`, {
      shell: 'none', argv: [process.execPath, '-e', 'setInterval(() => {}, 10000)'], callback: false,
      ...(kind === 'watch' ? { success_when: { type: 'exit_code', equals: 0 } } : {}),
    })).rejects.toThrow('metadata write unavailable');
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(fault.failed).toBeDefined();
    expect(fixture.launchCount).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
    await host.emit('session_shutdown', 'quit');
    expect(fault.terminalWrites).toEqual([]);
  });

  it('a synchronous launch failure settles its pre-persisted record without signaling any process', async () => {
    fixture = fakeJobHelper(979001);
    const host = hostFor('spawn-synchronous-launch-failure');
    await host.emit('session_start');
    // The launch's log-directory preparation fails after the initial registry write.
    const unsubscribe = onMetaChanged(() => {
      unsubscribe();
      vi.mocked(mkdirSync).mockImplementationOnce(() => { throw new Error('launch directory unavailable'); });
    });
    try {
      await expect(host.execute('bg_task_spawn', {
        shell: 'none', argv: [process.execPath, '-e', 'setInterval(() => {}, 10000)'], callback: false,
      })).rejects.toThrow('launch directory unavailable');
      const text = await host.execute('bg_task_list', { status: ['failed'] });
      const id = text.match(/bg_[a-z0-9_]+/)![0];
      expect(await host.status(id)).toMatchObject({ status: 'failed', result: { reason: 'launch directory unavailable' } });
      await host.emit('session_shutdown', 'quit');
      expect(fixture.requests).toEqual([]);
      expect(spawn).not.toHaveBeenCalled();
    } finally { unsubscribe(); }
  });

  it.each(['reload', 'quit'])('%s safely fails a pre-persisted process whose launch never completed', async reason => {
    fixture = fakeJobHelper(978001);
    const before = hostFor('spawn-never-launched');
    await before.emit('session_start');
    const fault = await failMetadataWrite(meta => meta.kind === 'process');
    await expect(before.execute('bg_task_spawn', {
      shell: 'none', argv: [process.execPath, '-e', 'setInterval(() => {}, 10000)'], callback: false,
    })).rejects.toThrow('metadata write unavailable');
    const id = fault.failed!.id;
    // Emulate interruption after the complete initial write but before launch.
    writeMeta(fault.failed!);
    expect(await before.status(id)).toMatchObject({ status: 'running', shell: 'none' });
    await before.emit('session_shutdown', reason);
    const after = hostFor('spawn-never-launched');
    await after.emit('session_start');
    expect(await after.status(id)).toMatchObject({ status: 'failed', result: { reason: expect.stringContaining('launch') } });
    await after.emit('session_shutdown', 'quit');
    expect(fixture.requests).toEqual([]);
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each(['spawn', 'watch'])('a partial post-launch %s metadata write records failure only after Job Object verification', async kind => {
    fixture = fakeJobHelper(980001);
    fixture.allowCleanup();
    const host = hostFor(`${kind}-metadata-error-cleanup-verified`);
    await host.emit('session_start');
    const fault = await failMetadataWrite(meta => !!meta.shellUsed, 1, { partial: true });
    let readableWhileCleaning = false;
    fixture.onTerminate(() => {
      const previous = readMeta(fault.failed!.id);
      readableWhileCleaning = previous?.status === 'running' && previous.endedAt === undefined;
    });
    const params = {
      shell: 'none', argv: [process.execPath, '-e', 'setInterval(() => {}, 10000)'], callback: false,
      ...(kind === 'watch' ? { success_when: { type: 'exit_code', equals: 0 }, timeout_seconds: 0 } : {}),
    };
    if (kind === 'spawn') await expect(host.execute('bg_task_spawn', params)).rejects.toThrow('metadata write unavailable');
    else {
      const abort = new AbortController();
      abort.abort();
      await host.execute('bg_task_watch', params, abort.signal);
    }
    await expect.poll(() => fault.failed?.id).toBeTruthy();
    const id = fault.failed!.id;
    await expect.poll(async () => (await host.status(id)).status).toBe('failed');
    expect(await host.status(id)).toMatchObject({ result: { reason: 'metadata write unavailable' } });
    expect(readableWhileCleaning).toBe(true);
    expect(fixture.live.size).toBe(0);
    expect(fixture.requests.some(request => request.op === 'terminate')).toBe(true);
    expect(fixture.requests.some(request => request.op === 'query')).toBe(true);
    expect(fixture.requests.filter(request => request.op === 'release')).toHaveLength(1);
    expect(fault.terminalWrites).toEqual([{ status: 'failed', activeProcesses: 0 }]);
  });

  it('a spawn acknowledgment metadata failure is observed and settles only after verification', async () => {
    fixture = fakeJobHelper(981001);
    fixture.allowCleanup();
    const host = hostFor('spawn-acknowledgment-metadata-write');
    await host.emit('session_start');
    const fault = await failMetadataWrite(meta => meta.kind === 'process' && !!meta.pid);
    const id = await host.spawn({
      shell: 'none', argv: [process.execPath, '-e', 'setInterval(() => {}, 10000)'], callback: false,
    });
    await expect.poll(() => fault.failed?.id).toBe(id);
    await expect.poll(async () => (await host.status(id)).status).toBe('failed');
    expect(fixture.live.size).toBe(0);
    expect(fault.terminalWrites).toEqual([{ status: 'failed', activeProcesses: 0 }]);
    expect(fixture.requests.filter(request => request.op === 'release')).toHaveLength(1);
  });

  it('a post-launch spawn write failure retains the Job Object for verified session teardown', async () => {
    fixture = fakeJobHelper(977001);
    fixture.leaveActive();
    fixture.onTerminate(() => fixture.failQuery('verification unavailable'));
    const host = hostFor('spawn-post-launch-metadata-write');
    await host.emit('session_start');
    const fault = await failMetadataWrite(meta => meta.kind === 'process' && !!meta.shellUsed);
    await expect(host.execute('bg_task_spawn', {
      shell: 'none', argv: [process.execPath, '-e', 'setInterval(() => {}, 10000)'], callback: false,
    })).rejects.toThrow('metadata write unavailable');
    const id = fault.failed!.id;
    await expect.poll(async () => !!(await host.status(id)).stopError).toBe(true);
    expect(await host.status(id)).toMatchObject({ status: 'running' });
    expect((await host.status(id)).endedAt).toBeUndefined();
    expect(fixture.live.size).toBeGreaterThan(0);
    expect(fixture.requests.some(request => request.op === 'terminate')).toBe(true);
    expect(fault.terminalWrites).toEqual([]);

    fixture.onTerminate(() => {});
    fixture.allowCleanup();
    await host.emit('session_shutdown', 'quit');
    expect(fixture.live.size).toBe(0);
    expect(await host.status(id)).toMatchObject({ status: 'cancelled' });
    expect(fixture.requests.some(request => request.op === 'query')).toBe(true);
    expect(fixture.requests.filter(request => request.op === 'release')).toHaveLength(1);
    expect(fault.terminalWrites).toEqual([{ status: 'cancelled', activeProcesses: 0 }]);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it.each(['spawn', 'watch'])('an unreadable post-launch %s record cannot prevent terminate and verification', async kind => {
    fixture = fakeJobHelper(983001);
    fixture.leaveActive();
    fixture.onTerminate(() => fixture.failQuery('verification unavailable'));
    const host = hostFor(`${kind}-unreadable-metadata`);
    await host.emit('session_start');
    const fault = await failMetadataWrite(meta => !!meta.shellUsed, 1, { partial: true, corruptTarget: true });
    const params = {
      shell: 'none', argv: [process.execPath, '-e', 'setInterval(() => {}, 10000)'], callback: false,
      ...(kind === 'watch' ? { success_when: { type: 'exit_code', equals: 0 }, timeout_seconds: 0 } : {}),
    };
    if (kind === 'spawn') await expect(host.execute('bg_task_spawn', params)).rejects.toThrow('metadata write unavailable');
    else {
      const abort = new AbortController();
      abort.abort();
      await host.execute('bg_task_watch', params, abort.signal);
    }
    await expect.poll(() => fault.failed?.id).toBeTruthy();
    const id = fault.failed!.id;
    await expect.poll(() => fixture.requests.some(request => request.op === 'terminate')).toBe(true);
    await expect.poll(() => fixture.requests.some(request => request.op === 'query')).toBe(true);
    await expect.poll(() => readMeta(id)?.stopError).toBeTruthy();
    expect(readMeta(id)).toMatchObject({ status: 'running' });
    expect(readMeta(id)?.endedAt).toBeUndefined();
    expect(fixture.live.size).toBeGreaterThan(0);
    expect(fault.terminalWrites).toEqual([]);

    fixture.onTerminate(() => {});
    fixture.allowCleanup();
    await host.emit('session_shutdown', 'quit');
    expect(fixture.live.size).toBe(0);
    expect(readMeta(id)?.status).toBe('cancelled');
    expect(fixture.requests.filter(request => request.op === 'release')).toHaveLength(1);
    expect(fault.terminalWrites).toEqual([{ status: 'cancelled', activeProcesses: 0 }]);
  });

  it.each(['spawn', 'watch'])('shutdown retries an owned %s even with unreadable metadata and does not stop another session', async kind => {
    fixture = fakeJobHelper(984001);
    fixture.leaveActive();
    fixture.onTerminate(() => fixture.failQuery('verification unavailable'));
    const host = hostFor(`${kind}-unreadable-shutdown`);
    await host.emit('session_start');
    const params = {
      shell: 'none', argv: [process.execPath, '-e', 'setInterval(() => {}, 10000)'], callback: false,
      ...(kind === 'watch' ? { success_when: { type: 'exit_code', equals: 0 }, timeout_seconds: 0 } : {}),
    };
    const abort = new AbortController();
    abort.abort();
    const text = await host.execute(`bg_task_${kind}`, params, abort.signal);
    const id = text.match(/bg_[a-z0-9_]+/)![0];
    await expect.poll(() => fixture.launchCount).toBe(1);
    await expect.poll(() => readMeta(id)?.shellUsed).toBeTruthy();
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    fs.writeFileSync(metaPathFor(id), '{broken');
    expect(readMeta(id)).toBeUndefined();

    const foreign = hostFor(`${kind}-foreign-shutdown`);
    await foreign.emit('session_start');
    await foreign.emit('session_shutdown', 'quit');
    expect(fixture.requests.some(request => request.op === 'terminate')).toBe(false);
    await expect(host.emit('session_shutdown', 'quit')).rejects.toThrow();
    expect(fixture.live.size).toBeGreaterThan(0);
    expect(fixture.requests.some(request => request.op === 'terminate')).toBe(true);
    expect(fixture.requests.some(request => request.op === 'query')).toBe(true);
    expect(fixture.requests.some(request => request.op === 'release')).toBe(false);
    expect(readMeta(id)?.status).toBe('running');
    expect(readMeta(id)?.endedAt).toBeUndefined();

    fixture.onTerminate(() => {});
    fixture.allowCleanup();
    fs.writeFileSync(metaPathFor(id), '{broken again');
    expect(readMeta(id)).toBeUndefined();
    await host.emit('session_shutdown', 'quit');
    expect(fixture.live.size).toBe(0);
    expect(readMeta(id)?.status).toBe('cancelled');
    expect(fixture.requests.filter(request => request.op === 'release')).toHaveLength(1);
  });

  it.each(['spawn', 'watch'])('shutdown terminates and verifies an unreadable %s despite continuing storage failures', async kind => {
    fixture = fakeJobHelper(986001);
    fixture.allowCleanup();
    const host = hostFor(`${kind}-unreadable-storage-shutdown`);
    await host.emit('session_start');
    const abort = new AbortController();
    abort.abort();
    const text = await host.execute(`bg_task_${kind}`, {
      shell: 'none', argv: [process.execPath, '-e', 'setInterval(() => {}, 10000)'], callback: false,
      ...(kind === 'watch' ? { success_when: { type: 'exit_code', equals: 0 }, timeout_seconds: 0 } : {}),
    }, abort.signal);
    const id = text.match(/bg_[a-z0-9_]+/)![0];
    await expect.poll(() => readMeta(id)?.shellUsed).toBeTruthy();
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    fs.writeFileSync(metaPathFor(id), '{broken');
    expect(readMeta(id)).toBeUndefined();
    const fault = await failMetadataWrite(() => true, Infinity, { partial: true });

    await expect(host.emit('session_shutdown', 'quit')).rejects.toThrow('metadata write unavailable');
    expect(fixture.live.size).toBe(0);
    expect(fixture.requests.some(request => request.op === 'terminate')).toBe(true);
    expect(fixture.requests.some(request => request.op === 'query')).toBe(true);
    expect(fixture.requests.filter(request => request.op === 'release')).toHaveLength(1);
    expect(fault.terminalWrites).toEqual([{ status: 'cancelled', activeProcesses: 0 }]);
  });

  it('a watch observes rejected results even when persisting the cleanup error also fails', async () => {
    fixture = fakeJobHelper(982001);
    fixture.leaveActive();
    fixture.onTerminate(() => fixture.failQuery('verification unavailable'));
    const host = hostFor('watch-repeated-metadata-write');
    await host.emit('session_start');
    const fault = await failMetadataWrite(meta => !!meta.shellUsed || fixture.launchCount > 0, 2);
    const abort = new AbortController();
    abort.abort();
    const text = await host.execute('bg_task_watch', {
      shell: 'none', argv: [process.execPath, '-e', 'setInterval(() => {}, 10000)'],
      success_when: { type: 'exit_code', equals: 0 }, timeout_seconds: 0, callback: false,
    }, abort.signal);
    const id = text.match(/bg_[a-z0-9_]+/)![0];
    await expect.poll(() => fixture.requests.some(request => request.op === 'terminate')).toBe(true);
    await expect.poll(() => fixture.requests.some(request => request.op === 'query')).toBe(true);
    expect(await host.status(id)).toMatchObject({ status: 'running' });
    expect(fixture.live.size).toBeGreaterThan(0);
    expect(fault.terminalWrites).toEqual([]);
    fixture.onTerminate(() => {});
    fixture.allowCleanup();
    await host.emit('session_shutdown', 'quit');
    expect(fixture.live.size).toBe(0);
    expect(await host.status(id)).toMatchObject({ status: 'cancelled' });
    expect(fault.terminalWrites).toEqual([{ status: 'cancelled', activeProcesses: 0 }]);
    // Vitest also fails this regression for any unhandled command/timer rejection.
  });

  it('a watch keeps a failed-cleanup Job Object owned until session teardown verifies it', async () => {
    fixture = fakeJobHelper(975001);
    fixture.leaveActive();
    fixture.onTerminate(() => fixture.failQuery('verification unavailable'));
    const host = hostFor('watch-metadata-write');
    await host.emit('session_start');
    const fault = await failMetadataWrite(meta => meta.kind === 'command_watch' && !!meta.shellUsed);
    const abort = new AbortController();
    abort.abort();
    const text = await host.execute('bg_task_watch', {
      shell: 'none', argv: [process.execPath, '-e', 'setInterval(() => {}, 10000)'],
      success_when: { type: 'exit_code', equals: 0 }, timeout_seconds: 0, callback: false,
    }, abort.signal);
    const id = text.match(/bg_[a-z0-9_]+/)![0];
    await expect.poll(() => fault.failed?.id).toBe(id);
    await expect.poll(async () => {
      const meta = await host.status(id);
      return meta.status !== 'running' || !!meta.stopError;
    }).toBe(true);
    expect(await host.status(id)).toMatchObject({ status: 'running', stopError: expect.any(String) });
    expect((await host.status(id)).endedAt).toBeUndefined();
    expect(fixture.live.size).toBeGreaterThan(0);
    expect(fixture.requests.some(request => request.op === 'terminate')).toBe(true);
    expect(fault.terminalWrites).toEqual([]);

    fixture.onTerminate(() => {});
    fixture.allowCleanup();
    await host.emit('session_shutdown', 'quit');
    expect(fixture.live.size).toBe(0);
    expect(await host.status(id)).toMatchObject({ status: 'cancelled' });
    expect(fixture.requests.some(request => request.op === 'query')).toBe(true);
    expect(fixture.requests.filter(request => request.op === 'release')).toHaveLength(1);
    expect(fault.terminalWrites).toEqual([{ status: 'cancelled', activeProcesses: 0 }]);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
