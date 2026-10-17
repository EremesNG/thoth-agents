import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { terminateProcessTree } from '../src/process-termination.js';

it('terminates an owned live child within the deadline', async () => {
  const child = spawn(
    process.execPath,
    [
      '-e',
      "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)",
    ],
    {
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  if (!child.stdout) throw new Error('Missing stdout pipe');
  await once(child.stdout, 'data');
  try {
    const start = Date.now();
    await terminateProcessTree(child, { timeoutMs: 1500 });
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    expect(Date.now() - start).toBeLessThan(2500);
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
  }
});
it('handles failed spawns without waiting for a deadline', async () => {
  const child = spawn('askcodex-deliberately-nonexistent-executable', [], {
    shell: false,
  });
  await once(child, 'error');
  await terminateProcessTree(child, { timeoutMs: 10 });
});
it('is safe when the child has already exited', async () => {
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], {
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: 'ignore',
  });
  await once(child, 'exit');
  await terminateProcessTree(child, { timeoutMs: 10 });
  expect(child.exitCode).toBe(0);
});
it('kills descendants that hold the process output pipe open', async () => {
  const script = `const {spawn}=require('node:child_process'); const c=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{}); console.log('descendant-ready'); setInterval(()=>{},1000)"],{stdio:['ignore','inherit','ignore'],windowsHide:true}); setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['-e', script], {
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (!child.stdout) throw new Error('Missing stdout pipe');
  await once(child.stdout, 'data');
  let timer: NodeJS.Timeout | undefined;
  const closed = Promise.race([
    once(child, 'close'),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Descendant kept pipe open')),
        3000,
      );
    }),
  ]);
  try {
    await terminateProcessTree(child, { timeoutMs: 1500 });
    await closed;
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
  }
});
