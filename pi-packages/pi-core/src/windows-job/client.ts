import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { connect, type Socket } from 'node:net';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

export class JobLauncherUnavailable extends Error {
  override name = 'JobLauncherUnavailable';
}
export interface JobLaunchOptions {
  file: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}
export interface LaunchedJob {
  pid: number;
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  exited: Promise<{ code: number }>;
  terminate(timeoutMs: number): Promise<void>;
  release(): Promise<void>;
}
interface Message {
  id?: number;
  event?: string;
  key?: string;
  code?: number;
  error?: string;
  kind?: string;
  pid?: number;
  pipes?: string[];
  ok?: boolean;
}
export function quoteWindowsArg(text: string): string {
  return `"${text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}
export function parseMessage(line: string): Message {
  const value = JSON.parse(line) as Message;
  const uint = (n: unknown) =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  if (
    !value ||
    typeof value !== 'object' ||
    !(
      value.event === 'ready' ||
      (value.event === 'exit' &&
        typeof value.key === 'string' &&
        uint(value.code)) ||
      (uint(value.id) &&
        (typeof value.error === 'string' ||
          value.ok === true ||
          (uint(value.pid) && Number(value.pid) > 0) ||
          (Array.isArray(value.pipes) &&
            value.pipes.length === 3 &&
            value.pipes.every(
              (p) =>
                typeof p === 'string' &&
                /^\\\\\.\\pipe\\thoth-job-[a-f0-9]{32}-(stdin|stdout|stderr)$/.test(
                  p,
                ),
            ))))
    )
  )
    throw new Error('Malformed Windows job protocol');
  return value;
}
export function responseError(value: Message): Error {
  return Object.assign(
    value.kind === 'target'
      ? new Error(value.error)
      : new JobLauncherUnavailable(value.error),
    { code: value.code },
  );
}
function powershell(): string {
  const system = join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  return existsSync(system) ? system : 'powershell.exe';
}
function asset(): string {
  const directory = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(directory, 'launcher.ps1'),
    join(directory, 'windows-job', 'launcher.ps1'),
    join(process.cwd(), 'pi-packages/pi-core/src/windows-job/launcher.ps1'),
  ])
    if (existsSync(candidate)) return candidate;
  throw new JobLauncherUnavailable('Windows job launcher assets not found');
}
function pipe(name: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(name);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Windows job pipe connection timed out'));
    }, 10000);
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
  });
}
/** Persistent handle owner. Exported here for isolated integration tests, not from the package. */
export class WindowsJobClient {
  private child?: ChildProcessWithoutNullStreams;
  private ready?: Promise<void>;
  private generation: { failure?: Error } = {};
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve(v: Message): void;
      reject(e: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private exits = new Map<
    string,
    { resolve(v: { code: number }): void; reject(e: Error): void }
  >();
  get helperPid(): number | undefined {
    return this.child?.pid;
  }
  private start(): Promise<void> {
    if (this.ready && !this.generation.failure) return this.ready;
    this.generation = { failure: undefined };
    const generation = this.generation;
    this.ready = new Promise<void>((resolve, reject) => {
      const child = spawn(
        powershell(),
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          asset(),
          '-ParentPid',
          String(process.pid),
        ],
        { windowsHide: true },
      );
      this.child = child;
      let stderr = '';
      const timer = setTimeout(
        () =>
          failed(
            new JobLauncherUnavailable('Windows job helper startup timed out'),
          ),
        30000,
      );
      const failed = (error: Error) => {
        if (generation.failure) return;
        clearTimeout(timer);
        this.fail(error, generation);
        reject(error);
        child.kill();
      };
      child.stderr.on('data', (chunk) => {
        stderr = (stderr + String(chunk)).slice(-8192);
      });
      child.stdin.on('error', (error) =>
        failed(new JobLauncherUnavailable(error.message)),
      );
      const lines = createInterface({ input: child.stdout });
      lines.on('line', (line) => {
        if (generation.failure) return;
        try {
          const value = parseMessage(line);
          if (value.event === 'ready') {
            clearTimeout(timer);
            resolve();
            return;
          }
          if (value.event === 'exit') {
            if (value.key === undefined || value.code === undefined)
              throw new Error('Missing exit fields');
            this.exits.get(value.key)?.resolve({ code: value.code });
            this.exits.delete(value.key);
            return;
          }
          if (value.id === undefined) throw new Error('Missing response id');
          const pending = this.pending.get(value.id);
          if (!pending) return;
          clearTimeout(pending.timer);
          this.pending.delete(value.id);
          if (value.error) pending.reject(responseError(value));
          else pending.resolve(value);
        } catch (error) {
          failed(new JobLauncherUnavailable(String(error)));
        }
      });
      child.on('error', (error) =>
        failed(new JobLauncherUnavailable(error.message)),
      );
      child.on('exit', () => {
        lines.close();
        failed(
          new JobLauncherUnavailable(`Windows job helper exited: ${stderr}`),
        );
      });
      child.unref();
      for (const stream of [child.stdin, child.stdout, child.stderr])
        (stream as unknown as { unref?(): void }).unref?.();
    }).catch((error) => {
      this.fail(error, generation);
      throw error;
    });
    return this.ready;
  }
  private fail(error: Error, generation: { failure?: Error }): void {
    generation.failure ??= error;
    if (generation !== this.generation) return;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    for (const exit of this.exits.values()) exit.reject(error);
    this.exits.clear();
  }
  private async request(
    startup: Promise<void>,
    generation: { failure?: Error },
    op: string,
    extra: Record<string, unknown>,
    timeoutMs = 20000,
  ): Promise<Message> {
    await startup;
    if (generation.failure) throw generation.failure;
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new JobLauncherUnavailable(`Windows job ${op} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      if (!this.child) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new JobLauncherUnavailable('Missing helper'));
        return;
      }
      this.child.stdin.write(
        `${JSON.stringify({ id, op, ...extra })}\n`,
        (error) => {
          if (error) {
            clearTimeout(timer);
            this.pending.delete(id);
            reject(error);
          }
        },
      );
    });
  }
  async launch(options: JobLaunchOptions): Promise<LaunchedJob> {
    if (process.platform !== 'win32')
      throw new JobLauncherUnavailable('Windows jobs require Windows');
    const startup = this.start(),
      generation = this.generation,
      child = this.child;
    // Reconciliation and returned jobs must stay bound to their original helper.
    const request = (
      op: string,
      extra: Record<string, unknown>,
      timeoutMs?: number,
    ) => this.request(startup, generation, op, extra, timeoutMs);
    const key = randomBytes(16).toString('hex');
    const sockets: Socket[] = [];
    const exited = new Promise<{ code: number }>((resolve, reject) => {
      this.exits.set(key, { resolve, reject });
    });
    // Launch can fail before the caller receives the exit promise.
    void exited.catch(() => {});
    try {
      const prepared = await request('launch', { key });
      // Connect sequentially in the server's stdin/stdout/stderr order. No target exists yet.
      if (!prepared.pipes)
        throw new JobLauncherUnavailable('Missing pipe names');
      for (const name of prepared.pipes) sockets.push(await pipe(name));
      const result = await request('start', {
        key,
        ...options,
        command: [options.file, ...options.args].map(quoteWindowsArg).join(' '),
      });
      if (!result.pid) throw new JobLauncherUnavailable('Missing launch pid');
      return {
        pid: result.pid,
        stdin: sockets[0],
        stdout: sockets[1],
        stderr: sockets[2],
        exited,
        terminate: async (timeoutMs) => {
          await request(
            'terminate',
            { key, timeoutMs },
            Math.max(1000, timeoutMs + 5000),
          );
        },
        release: async () => {
          await request('release', { key });
        },
      };
    } catch (error) {
      // Reconcile even a lost start acknowledgement. If control is lost, helper death
      // closes all jobs, and we await that death before exposing the failure.
      try {
        await request('terminate', { key, timeoutMs: 5000 });
        await request('release', { key });
      } catch {
        await this.closeHelper(child);
      }
      for (const socket of sockets) socket.destroy();
      this.exits.delete(key);
      throw error;
    }
  }
  async close(): Promise<void> {
    await this.closeHelper(this.child);
  }
  private async closeHelper(
    child?: ChildProcessWithoutNullStreams,
  ): Promise<void> {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Windows helper did not exit')),
        10000,
      );
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill();
    });
  }
}
const KEY = Symbol.for('thoth-agents.pi-core.windows-job.v1');
const registry = globalThis as typeof globalThis & { [KEY]?: WindowsJobClient };
export function launchInJob(options: JobLaunchOptions): Promise<LaunchedJob> {
  registry[KEY] ??= new WindowsJobClient();
  return registry[KEY].launch(options);
}
