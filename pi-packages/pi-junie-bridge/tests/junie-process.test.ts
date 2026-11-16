import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import {
  JobLauncherUnavailable,
  type JobLaunchOptions,
} from '@thoth-agents/pi-core/windows-job';
import { expect, test, vi } from 'vitest';
import { launchJunie, resolveJunieLauncher } from '../src/junie-process.js';

test('resolves the real executable from the installed current version file', () => {
  const home = mkdtempSync(join(tmpdir(), 'junie-resolve-'));
  try {
    const data = join(home, '.local/share/junie');
    const file = join(data, 'versions/4020.7/junie/junie.exe');
    mkdirSync(join(data, 'versions/4020.7/junie'), { recursive: true });
    writeFileSync(join(data, 'current'), '4020.7\n');
    writeFileSync(file, '');
    expect(
      resolveJunieLauncher({ home, env: {}, platform: 'win32' }).file,
    ).toBe(file);
    expect(() =>
      resolveJunieLauncher({ launcherPath: join(home, 'missing'), env: {} }),
    ).toThrow(/install Junie/i);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Windows uses job-owned pipes and terminates only through the job', async () => {
  const terminate = vi.fn(async () => {}),
    release = vi.fn(async () => {});
  let reportExit!: (value: { code: number }) => void;
  const exited = new Promise<{ code: number }>((resolve) => {
    reportExit = resolve;
  });
  const job = {
    pid: 42,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exited,
    terminate,
    release,
  };
  const launchJob = vi.fn(async (_options: JobLaunchOptions) => job);
  const child = await launchJunie({
    command: { file: process.execPath, args: [] },
    platform: 'win32',
    launchJob,
  });
  expect(launchJob.mock.calls[0][0]).toMatchObject({
    file: process.execPath,
    args: ['--acp', 'true', '--skip-update-check'],
  });
  expect(child.stdin).toBe(job.stdin);
  expect(child.jobBacked).toBe(true);
  job.stderr.write('diagnostic');
  expect(child.stderrTail()).toBe('diagnostic');
  let closed = false;
  const closing = child.terminate().then(() => {
    closed = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  expect(terminate).toHaveBeenCalledTimes(1);
  expect(closed).toBe(false);
  reportExit({ code: 1 });
  await closing;
  await child.terminate();
  expect(terminate).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
});

test('missing Windows exit notification times out, warns, and releases once', async () => {
  const terminate = vi.fn(async () => {});
  const release = vi.fn(async () => {});
  const warn = vi.fn();
  const child = await launchJunie({
    command: { file: process.execPath, args: [] },
    platform: 'win32',
    warn,
    launchJob: async () => ({
      pid: 42,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exited: new Promise(() => {}),
      terminate,
      release,
    }),
  });
  const first = child.terminate();
  expect(child.terminate()).toBe(first);
  await first;
  expect(terminate).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(expect.stringMatching(/exit.*timed out/i));
}, 5000);

test('a rejected Windows exit notification still releases the job once', async () => {
  const release = vi.fn(async () => {});
  const child = await launchJunie({
    command: { file: process.execPath, args: [] },
    platform: 'win32',
    launchJob: async () => ({
      pid: 42,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exited: Promise.reject(new Error('exit notification failed')),
      terminate: async () => {},
      release,
    }),
  });
  const first = child.terminate();
  expect(child.terminate()).toBe(first);
  await expect(first).rejects.toThrow('exit notification failed');
  expect(release).toHaveBeenCalledTimes(1);
});

test('a failed Windows job termination still attempts release once', async () => {
  const release = vi.fn(async () => {});
  const child = await launchJunie({
    command: { file: process.execPath, args: [] },
    platform: 'win32',
    launchJob: async () => ({
      pid: 42,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exited: new Promise(() => {}),
      terminate: async () => {
        throw new Error('termination failed');
      },
      release,
    }),
  });
  await expect(child.terminate()).rejects.toThrow('termination failed');
  await expect(child.terminate()).rejects.toThrow('termination failed');
  expect(release).toHaveBeenCalledTimes(1);
});

test('unavailable job launcher warns and uses a piped leader-only fallback', async () => {
  const warn = vi.fn();
  const child = await launchJunie({
    command: {
      file: process.execPath,
      args: ['-e', 'process.stdin.pipe(process.stdout)', '--'],
    },
    platform: 'win32',
    launchJob: async () => {
      throw new JobLauncherUnavailable('missing');
    },
    warn,
  });
  try {
    expect(child.jobBacked).toBe(false);
    expect(child.stdin.writable).toBe(true);
    expect(warn.mock.calls[0][0]).toMatch(/leader.only/i);
  } finally {
    await child.terminate();
  }
});

test('target launch failures never retry outside containment', async () => {
  const warn = vi.fn();
  await expect(
    launchJunie({
      command: { file: 'missing.exe', args: [] },
      platform: 'win32',
      launchJob: async () => {
        throw new Error('target failure');
      },
      warn,
    }),
  ).rejects.toThrow('target failure');
  expect(warn).not.toHaveBeenCalled();
});
