import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { JobLauncherUnavailable, WindowsJobClient } from './client.js';

const clients: WindowsJobClient[] = [];
function client() {
  const c = new WindowsJobClient();
  clients.push(c);
  return c;
}
const spec = (script: string) => ({
  file: process.execPath,
  args: ['-e', script],
  cwd: process.cwd(),
  env: process.env,
});
async function text(stream: NodeJS.ReadableStream): Promise<string> {
  let result = '';
  for await (const chunk of stream) result += String(chunk);
  return result;
}
async function gone(pid: number) {
  await expect
    .poll(
      () => {
        try {
          process.kill(pid, 0);
          return false;
        } catch {
          return true;
        }
      },
      { timeout: 10000 },
    )
    .toBe(true);
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});
describe.skipIf(process.platform !== 'win32')('real Windows jobs', () => {
  it('round trips stdin, delivers stderr, ends streams and preserves nonzero exit', async () => {
    const c = client();
    const start = performance.now();
    const job = await c.launch(
      spec(
        'process.stdin.pipe(process.stdout);process.stderr.write("error");process.stdin.on("end",()=>{process.exitCode=37})',
      ),
    );
    console.info(
      `Windows helper cold launch: ${Math.round(performance.now() - start)}ms`,
    );
    const output = text(job.stdout);
    const error = text(job.stderr);
    job.stdin.end('hello\n');
    expect(await output).toBe('hello\n');
    expect(await error).toBe('error');
    expect(await job.exited).toEqual({ code: 37 });
    await job.terminate(10000);
    await job.release();
  }, 60000);
  it('preserves Windows argv and unsigned exit codes', async () => {
    const c = client();
    const args = ['', 'a b', 'a"b', 'a\\', 'a\\"b'];
    const job = await c.launch({
      ...spec(
        'process.stdout.write(JSON.stringify(process.argv.slice(1)));process.exitCode=-1',
      ),
      args: [
        '-e',
        'process.stdout.write(JSON.stringify(process.argv.slice(1)));process.exitCode=-1',
        '--',
        ...args,
      ],
    });
    expect(JSON.parse(await text(job.stdout))).toEqual(args);
    expect(await job.exited).toEqual({ code: 4294967295 });
    await job.terminate(10000);
    await job.release();
  }, 60000);
  it('kills detached descendants after leader exit but never an outside process', async () => {
    const outside = spawn(
      process.execPath,
      ['-e', 'setInterval(()=>{},1000)'],
      { stdio: 'ignore' },
    );
    try {
      const job = await client().launch(
        spec(
          'const c=require("child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{detached:true,stdio:"ignore"});console.log(c.pid);c.unref()',
        ),
      );
      const descendant = Number((await text(job.stdout)).trim());
      expect(descendant).toBeGreaterThan(0);
      await job.exited;
      await expect(job.release()).rejects.toThrow('nonempty');
      await job.terminate(10000);
      await gone(descendant);
      expect(() => process.kill(Number(outside.pid), 0)).not.toThrow();
      await job.release();
    } finally {
      outside.kill();
      await once(outside, 'exit');
    }
  }, 60000);
  it('helper death kills the entire job', async () => {
    const c = client();
    const job = await c.launch(
      spec(
        'const c=require("child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{detached:true,stdio:"ignore"});console.log(c.pid);setInterval(()=>{},1000)',
      ),
    );
    const descendant = await new Promise<number>((resolve) =>
      job.stdout.once('data', (chunk) => resolve(Number(String(chunk).trim()))),
    );
    await c.close();
    await gone(job.pid);
    await gone(descendant);
    await expect(job.exited).rejects.toBeInstanceOf(JobLauncherUnavailable);
  }, 60000);
  it('file not found is a target error, not unavailable containment', async () => {
    const c = client();
    const error = await c
      .launch({ ...spec(''), file: 'C:\\nonexistent-thoth-job-target.exe' })
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(JobLauncherUnavailable);
    expect(error.code).toBe(2);
    const job = await c.launch(spec(''));
    expect(await job.exited).toEqual({ code: 0 });
    await job.terminate(10000);
    await job.release();
  }, 60000);
});
