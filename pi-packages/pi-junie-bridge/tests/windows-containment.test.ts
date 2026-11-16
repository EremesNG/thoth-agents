import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { launchJunie } from '../src/junie-process.js';

const fixture = fileURLToPath(
  new URL('./fixtures/fake-junie.cjs', import.meta.url),
);
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test.skipIf(process.platform !== 'win32')(
  'Windows job kills descendant and leader without affecting an unrelated process',
  async () => {
    const unrelated = spawn(
      process.execPath,
      ['-e', 'setInterval(()=>{},1000)'],
      { stdio: 'ignore' },
    );
    const child = await launchJunie({
      command: { file: process.execPath, args: [fixture] },
      env: { FAKE_DESCENDANT: '1' },
      warn: (message) => {
        throw new Error(message);
      },
    });
    try {
      expect(child.jobBacked).toBe(true);
      const descendant = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('No descendant notification')),
          3000,
        );
        child.stdout.on('data', (data) => {
          for (const line of String(data).trim().split('\n')) {
            const frame = JSON.parse(line);
            if (frame.method === 'fixture/descendant') {
              clearTimeout(timer);
              resolve(frame.params.pid);
            }
          }
        });
      });
      expect(alive(descendant)).toBe(true);
      await child.terminate();
      await expect.poll(() => alive(descendant)).toBe(false);
      expect(alive(child.pid!)).toBe(false);
      expect(alive(unrelated.pid!)).toBe(true);
    } finally {
      await child.terminate();
      unrelated.kill();
    }
  },
  15000,
);

test.skipIf(process.platform !== 'win32')(
  'job termination releases the child working directory before returning',
  async () => {
    for (let i = 0; i < 25; i++) {
      const cwd = mkdtempSync(join(tmpdir(), 'junie-job-cwd-'));
      writeFileSync(join(cwd, 'fixture'), 'test');
      const child = await launchJunie({
        cwd,
        command: { file: process.execPath, args: [fixture] },
        warn: (message) => {
          throw new Error(message);
        },
      });
      try {
        expect(child.jobBacked).toBe(true);
        const started = new Promise<void>((resolve) =>
          child.stdout.once('data', () => resolve()),
        );
        child.stdin.write(
          `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1 } })}\n`,
        );
        await started;
        await child.terminate();
        expect(alive(child.pid!)).toBe(false);
        rmSync(cwd, { recursive: true, force: true });
      } finally {
        await child.terminate();
        await rm(cwd, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        });
      }
    }
  },
  30000,
);

test.skipIf(process.platform !== 'win32')(
  'batch shim with spaces round-trips ACP with piped stdin through the job',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'junie shim '));
    const shim = join(dir, 'junie.bat');
    writeFileSync(
      shim,
      `@echo off\r\n"${process.execPath}" "${fixture}" %*\r\n`,
    );
    let child: Awaited<ReturnType<typeof launchJunie>> | undefined;
    try {
      child = await launchJunie({
        launcherPath: shim,
        warn: (message) => {
          throw new Error(message);
        },
      });
      expect(child.jobBacked).toBe(true);
      const reply = new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Shim ACP timeout')),
          5000,
        );
        child!.stdout.once('data', (data) => {
          clearTimeout(timer);
          resolve(JSON.parse(String(data)));
        });
      });
      child.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: 1 },
        }) + '\n',
      );
      await expect(reply).resolves.toMatchObject({
        id: 1,
        result: { protocolVersion: 1 },
      });
    } finally {
      await child?.terminate();
      rmSync(dir, { recursive: true, force: true });
    }
  },
  15000,
);
