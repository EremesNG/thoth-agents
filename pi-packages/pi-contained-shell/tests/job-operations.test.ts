import { PassThrough } from 'node:stream';
import type { BashOperations } from '@earendil-works/pi-coding-agent';
import {
  JobLauncherUnavailable,
  type LaunchedJob,
} from '@thoth-agents/pi-core/windows-job';
import { describe, expect, it, vi } from 'vitest';
import { createJobOperations } from '../src/job-operations.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fakeJob() {
  const exit = deferred<{ code: number }>();
  const job: LaunchedJob = {
    pid: 123,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exited: exit.promise,
    terminate: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
  };
  return { job, exit };
}
function setup(launch = vi.fn()) {
  const fallback = {
    exec: vi.fn<BashOperations['exec']>(async () => ({ exitCode: 9 })),
  };
  const warn = vi.fn();
  const operations = createJobOperations({
    launch,
    fallback,
    warn,
    resolveShell: () => ({ shell: 'C:/bash.exe', args: ['-c'] }),
  });
  return { operations, fallback, warn, launch };
}

describe('job operations', () => {
  it.each([
    false,
    true,
  ])('never feeds stdin after launch cancellation (launch already resolved: %s)', async (resolvedFirst) => {
    const pending = deferred<LaunchedJob>();
    const { job } = fakeJob();
    const controller = new AbortController();
    const onData = vi.fn();
    const input: string[] = [];
    job.stdin.on('data', (b) => input.push(b.toString()));
    job.terminate = vi.fn(async () => {
      job.stdout.push('late output');
      job.stdout.push(null);
      job.stderr.push(null);
    });
    const operations = createJobOperations({
      launch: () => pending.promise,
      fallback: { exec: vi.fn() },
      warn: vi.fn(),
      resolveShell: () => ({
        shell: 'wsl.exe',
        args: [],
        commandTransport: 'stdin',
      }),
    });
    const result = operations.exec('must not execute', process.cwd(), {
      onData,
      signal: controller.signal,
    });
    if (resolvedFirst) pending.resolve(job);
    controller.abort();
    await expect(result).rejects.toThrow(/^aborted$/);
    if (!resolvedFirst) pending.resolve(job);
    await vi.waitFor(() => expect(job.release).toHaveBeenCalledOnce());
    expect(input).toEqual([]);
    expect(onData).not.toHaveBeenCalled();
  });
  it('passes only the remaining timeout to fallback and restores the original timeout error', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    try {
      const pending = deferred<LaunchedJob>();
      const { operations, fallback } = setup(vi.fn(() => pending.promise));
      fallback.exec.mockRejectedValue(new Error('timeout:remaining'));
      const result = operations.exec('echo hello', process.cwd(), {
        onData: vi.fn(),
        timeout: 5,
      });
      const rejected = expect(result).rejects.toThrow(/^timeout:5$/);
      await vi.advanceTimersByTimeAsync(1000);
      pending.reject(new JobLauncherUnavailable('no helper'));
      await rejected;
      expect(fallback.exec.mock.calls[0][2].timeout).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back only for launcher unavailability, preserving command and options', async () => {
    const { operations, fallback, warn } = setup(
      vi.fn(async () => {
        throw new JobLauncherUnavailable('no helper');
      }),
    );
    const options = { onData: vi.fn(), env: { HELLO: 'world' } };
    expect(await operations.exec('echo hello', process.cwd(), options)).toEqual(
      { exitCode: 9 },
    );
    expect(fallback.exec).toHaveBeenCalledWith(
      'echo hello',
      process.cwd(),
      options,
    );
    expect(warn).toHaveBeenCalledOnce();
  });
  it('does not fall back on target errors or cancellation followed by launcher failure', async () => {
    const target = setup(
      vi.fn(async () => {
        throw new Error('target failed');
      }),
    );
    await expect(
      target.operations.exec('bad', process.cwd(), { onData: vi.fn() }),
    ).rejects.toThrow('target failed');
    expect(target.fallback.exec).not.toHaveBeenCalled();
    const pending = deferred<LaunchedJob>();
    const cancelled = setup(vi.fn(() => pending.promise));
    const controller = new AbortController();
    const result = cancelled.operations.exec('bad', process.cwd(), {
      onData: vi.fn(),
      signal: controller.signal,
    });
    controller.abort();
    await expect(result).rejects.toThrow(/^aborted$/);
    pending.reject(new JobLauncherUnavailable('no helper'));
    await new Promise((resolve) => setImmediate(resolve));
    expect(cancelled.fallback.exec).not.toHaveBeenCalled();
  });
  it('does not launch a pre-aborted command and validates SDK timeout bounds', async () => {
    const { operations, launch } = setup();
    await expect(
      operations.exec('bad', process.cwd(), {
        onData: vi.fn(),
        signal: AbortSignal.abort(),
      }),
    ).rejects.toThrow(/^aborted$/);
    for (const timeout of [0, -1, NaN, Infinity]) {
      await expect(
        operations.exec('bad', process.cwd(), { onData: vi.fn(), timeout }),
      ).rejects.toThrow('Invalid timeout: must be a finite number of seconds');
    }
    await expect(
      operations.exec('bad', process.cwd(), {
        onData: vi.fn(),
        timeout: 2147483.648,
      }),
    ).rejects.toThrow('Invalid timeout: maximum is 2147483.647 seconds');
    expect(launch).not.toHaveBeenCalled();
  });
  it.each([
    'abort',
    'timeout',
  ] as const)('bounds pending launch on %s and cleans up the late job', async (kind) => {
    const pending = deferred<LaunchedJob>();
    const { job } = fakeJob();
    const controller = new AbortController();
    const { operations, fallback } = setup(vi.fn(() => pending.promise));
    const result = operations.exec('sleep 999', process.cwd(), {
      onData: vi.fn(),
      signal: controller.signal,
      timeout: kind === 'timeout' ? 0.01 : undefined,
    });
    const rejected = expect(result).rejects.toThrow(
      kind === 'abort' ? /^aborted$/ : /^timeout:0.01$/,
    );
    if (kind === 'abort') controller.abort();
    await rejected;
    job.terminate = vi.fn(async () => {
      job.stdout.push(null);
      job.stderr.push(null);
    });
    pending.resolve(job);
    await vi.waitFor(() => expect(job.release).toHaveBeenCalledOnce());
    expect(job.terminate).toHaveBeenCalledOnce();
    expect(fallback.exec).not.toHaveBeenCalled();
  });

  it.each([
    'abort',
    'timeout',
  ] as const)('terminates and drains before reporting running %s', async (kind) => {
    const { job } = fakeJob();
    job.terminate = vi.fn(async () => {
      job.stdout.push('final');
      job.stdout.push(null);
      job.stderr.push(null);
    });
    const controller = new AbortController();
    const launch = vi.fn(async () => job);
    const { operations } = setup(launch);
    const output: string[] = [];
    const result = operations.exec('sleep 999', process.cwd(), {
      onData: (b) => output.push(b.toString()),
      signal: controller.signal,
      timeout: kind === 'timeout' ? 0.05 : undefined,
    });
    const rejected = expect(result).rejects.toThrow(
      kind === 'abort' ? /^aborted$/ : /^timeout:0.05$/,
    );
    await vi.waitFor(() => expect(job.stdin.writableEnded).toBe(true));
    if (kind === 'abort') controller.abort();
    await rejected;
    expect(job.terminate).toHaveBeenCalledOnce();
    expect(job.release).toHaveBeenCalledOnce();
    expect(output).toEqual(['final']);
  });
  it('terminates after leader exit, drains both pipes, then returns the original exit code', async () => {
    const { job, exit } = fakeJob();
    const { operations } = setup(vi.fn(async () => job));
    const output: string[] = [];
    let settled = false;
    const result = operations
      .exec('exit 17', process.cwd(), {
        onData: (b) => output.push(b.toString()),
      })
      .then((value) => {
        settled = true;
        return value;
      });
    exit.resolve({ code: 17 });
    await vi.waitFor(() => expect(job.terminate).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    job.stdout.push('trailing stdout');
    job.stdout.push(null);
    job.stderr.push('trailing stderr');
    job.stderr.push(null);
    expect(await result).toEqual({ exitCode: 17 });
    expect(output).toEqual(['trailing stdout', 'trailing stderr']);
    expect(job.release).toHaveBeenCalledOnce();
  });
});
