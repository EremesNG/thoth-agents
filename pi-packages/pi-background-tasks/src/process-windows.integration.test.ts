import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { processExists, runCommandOnce } from './process.js';
import { readMeta, taskDir } from './registry.js';
import { spawnTask } from './runtime.js';
import { resolvePowerShellConfig } from './powershell.js';
import { getWindowsJobClient, WindowsJobClient } from './windows-job-client.js';
import { lifecycleHost } from './test-support/lifecycle-harness.js';
vi.mock('node:child_process', async original => { const actual = await original<typeof import('node:child_process')>(); return { ...actual, spawn: vi.fn(actual.spawn) }; });
const taskIds: string[] = [];
const pi = {} as ExtensionAPI;
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); for (const id of taskIds.splice(0)) rmSync(taskDir(id), { recursive: true, force: true }); });

describe.skipIf(process.platform !== 'win32')('Windows declared shell integration', () => {
  it('captures real Git Bash stdout and stderr for spawn and watch commands', async () => {
    const meta = spawnTask(pi, { command: "printf 'spawn café\\n'; printf 'spawn stderr π\\n' >&2", callback: false }, process.cwd());
    taskIds.push(meta.id);
    await expect.poll(() => readMeta(meta.id)?.status, { timeout: 10000 }).toBe('succeeded');
    expect(readFileSync(meta.logPath, 'utf8')).toContain('spawn café');
    expect(readFileSync(meta.logPath, 'utf8')).toContain('spawn stderr π');
    const result = await runCommandOnce({ shell: 'bash', command: "printf 'watch café\\n'; printf 'watch stderr π\\n' >&2" });
    expect(result).toMatchObject({ exitCode: 0, stdout: 'watch café\n', stderr: 'watch stderr π\n' });
  });

  it('missing bash fails spawn and watch before launching or creating metadata, naming available 5.1', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bg-no-bash-'));
    mkdirSync(join(dir, '.pi'));
    writeFileSync(join(dir, '.pi', 'settings.json'), JSON.stringify({ shellPath: 'Z:/missing/bash.exe' }));
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH', 'Z:/missing/pwsh.exe');
    const host = lifecycleHost('no-bash');
    host.ctx.cwd = dir;
    const launched = vi.mocked(spawn);
    try {
      for (const name of ['bg_task_spawn', 'bg_task_watch', 'bg_task']) {
        await expect(host.execute(name, { action: 'spawn', command: 'echo unreachable', success_when: { type: 'exit_code', equals: 0 } })).rejects.toThrow(/Requested shell "bash".*Available shells: PowerShell Desktop 5.1.*shell:"powershell"/);
      }
      expect(launched).not.toHaveBeenCalled();
    } finally { await host.emit('session_shutdown', 'quit'); rmSync(dir, { recursive: true, force: true }); }
  });

  it('fresh no-pwsh host runs bash, Windows PowerShell 5.1 and argv jobs/watches and verifies teardown', async () => {
    vi.stubEnv('PI_BACKGROUND_TASKS_PWSH', 'Z:/missing/pwsh.exe');
    const key = Symbol.for('thoth-agents.background-tasks.windows-job-helper.v1');
    const previous = Reflect.get(globalThis, key);
    // Healthy 5.1 launches/queries can exceed 1 s under load; schema faults reply immediately.
    const client = new WindowsJobClient({ testFaults: true });
    Reflect.set(globalThis, key, client);
    const host = lifecycleHost('fresh-no-pwsh');
    const pids: number[] = [];
    try {
      expect(getWindowsJobClient().helperPid).toBeUndefined();
      expect(resolvePowerShellConfig()).toMatchObject({ edition: 'Desktop', version: expect.stringMatching(/^5\.1\./) });
      await host.emit('session_start');
      const idle = 'setInterval(()=>{},1000)';
      for (const params of [
        { command: `printf 'bash spawn ready\\n'; node -e '${idle}'` },
        { shell: 'powershell', command: `[Console]::WriteLine('5.1 spawn ready'); & '${process.execPath.replaceAll("'", "''")}' -e '${idle}'` },
        { shell: 'none', argv: [process.execPath, '-e', `console.log('argv spawn ready'); ${idle}`] },
      ]) {
        const id = await host.spawn({ ...params, callback: false });
        taskIds.push(id);
        await expect.poll(() => readMeta(id)?.pid, { timeout: 10000 }).toBeGreaterThan(0);
        const meta = readMeta(id)!;
        pids.push(meta.pid!);
        await expect.poll(() => readFileSync(meta.logPath, 'utf8'), { timeout: 10000 }).toContain('spawn ready');
      }
      const helperCall = vi.mocked(spawn).mock.calls.find(([, args]) => (args as string[]).some(arg => arg.endsWith('windows-job-helper.ps1')));
      expect(helperCall?.[0]).toMatch(/WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/i);
      for (const params of [
        { shell: 'bash', command: "printf 'bash watch café\\n'; printf 'bash stderr π\\n' >&2" },
        { shell: 'powershell', command: "[Console]::WriteLine('5.1 watch café'); [Console]::Error.WriteLine('5.1 stderr π')" },
        { shell: 'none', argv: [process.execPath, '-e', "console.log('argv watch café'); console.error('argv stderr π')"] },
      ]) {
        const text = await host.execute('bg_task_watch', { ...params, callback: false, success_when: { type: 'stdout_contains', value: 'watch café' } });
        taskIds.push(text.match(/bg_[a-z0-9_]+/)![0]);
        expect(text).toContain('watch café');
        expect(text).toContain('stderr π');
      }
      // Exercise the 5.1 JSON dictionary adapter and assignment-before-resume seam.
      const denied = await client.launch({ executable: process.execPath, argv: ['-e', 'process.exit(0)'], cwd: process.cwd(), env: process.env, log: readMeta(taskIds[0]!)!.logPath, denyAssignment: true }).catch(error => error);
      expect(denied.neverResumed).toBe(true);
      expect(processExists(denied.failedPid)).toBe(false);
      await denied.job.terminate(); await denied.job.release();
      const faultJob = await client.launch({ executable: process.execPath, argv: ['-e', idle], cwd: process.cwd(), env: process.env, log: readMeta(taskIds[0]!)!.logPath, responseFaults: { query: 'schema' } });
      await expect(faultJob.query()).rejects.toThrow(/malformed response/);
      await faultJob.terminate(); await faultJob.release();
      await host.emit('session_shutdown', 'quit');
      for (const pid of pids) expect(processExists(pid)).toBe(false);
      for (const id of taskIds.slice(0, 3)) expect(readMeta(id)?.status).toBe('cancelled');
    } finally {
      await host.emit('session_shutdown', 'quit');
      await client.close();
      if (previous) Reflect.set(globalThis, key, previous); else Reflect.deleteProperty(globalThis, key);
    }
  }, 30000);

  it('delivers raw argv without MSYS rewriting', async () => {
    const expected = ['/c', '/opt/x.sh', 'C:\\literal\\path'];
    const result = await runCommandOnce({ shell: 'none', argv: [process.execPath, '-e', 'console.log(JSON.stringify(process.argv.slice(1)))', ...expected] });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(expected);
  });
});
