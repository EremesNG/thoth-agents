import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { WindowsJobClient } from './windows-job-client.js';

vi.mock('node:child_process', async (original) => ({ ...await original<typeof childProcess>(), spawn: vi.fn() }));
vi.mock('./powershell.js', () => ({ resolvePowerShell: () => 'powershell.exe' }));

function helper() {
  const stdout = new PassThrough();
  const child = Object.assign(new EventEmitter(), {
    stdout, stderr: new PassThrough(), pid: 123, exitCode: null as number | null, signalCode: null,
    stdin: new Writable({ write(chunk, _encoding, callback) {
      const { id } = JSON.parse(String(chunk));
      stdout.write(JSON.stringify({ id, pid: 456 }) + '\n');
      callback();
    } }),
    kill: vi.fn(() => {
      if (child.exitCode === null) {
        child.exitCode = 1;
        child.emit('exit', 1, null);
      }
      return true;
    }), unref() {},
  });
  return child;
}
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers(); });
it.each(['timeout', 'exit', 'error', 'death'] as const)('recovers from helper %s and shares one fresh start between concurrent jobs', async fault => {
  vi.useFakeTimers();
  const first = helper(), second = helper();
  const spawn = vi.mocked(childProcess.spawn).mockReturnValueOnce(first as unknown as childProcess.ChildProcess).mockReturnValue(second as unknown as childProcess.ChildProcess);
  const client = new WindowsJobClient();
  const spec = { executable: process.execPath, argv: [], cwd: process.cwd(), env: process.env, log: 'unused' };
  const original = client.createJob(spec);
  const initial = original.ready.catch(error => error);
  await vi.advanceTimersByTimeAsync(0);
  if (fault === 'timeout') await vi.advanceTimersByTimeAsync(30000);
  else if (fault === 'death') {
    first.stdout.write('{"event":"ready"}\n');
    await initial;
    first.emit('exit', 1, null);
  } else first.emit(fault, fault === 'error' ? new Error('spawn failed') : 1);
  if (fault !== 'death') expect(await initial).toBeInstanceOf(Error);
  const jobs = [client.createJob(spec), client.createJob(spec)];
  const recovered = Promise.all(jobs.map(job => job.ready));
  void recovered.catch(() => {});
  await vi.advanceTimersByTimeAsync(0);
  expect(spawn).toHaveBeenCalledTimes(2);
  // Late notifications from the retired helper must not poison the new start.
  first.emit('exit', 1, null);
  second.stdout.write('{"event":"ready"}\n');
  await expect(recovered).resolves.toHaveLength(2);
  if (fault === 'death') await expect(original.query()).rejects.toThrow(/helper/);
});
