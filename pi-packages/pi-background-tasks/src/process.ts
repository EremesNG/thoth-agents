import { createProcessTreeTerminator } from "./process-termination.js";
import { spawn } from "node:child_process";
import { powerShellArguments } from "./powershell.js";
import { resolveShell } from './shell.js';
import { spawnWindowsCommand, startWindowsCommandOnce } from "./windows-process.js";
import { appendFileSync, closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import type { ChildProcess } from "node:child_process";
import type { EventEmitter } from "node:events";
import type { CommandResult, CommandSpec, ShellUsed } from "./types.js";

/** The default is the same local bash Pi resolves, never PowerShell fallback. */
export function resolveDefaultShell(): string {
  return resolveShell('bash').executable;
}

export interface SpawnedProcess {
  shell: ShellUsed;
  child: EventEmitter & { pid?: number; unref(): void };
  pgid?: number;
  terminate(): Promise<void>;
}

export function validateCommandSpec(spec: CommandSpec): void {
  if (spec.shell !== undefined && !['bash', 'powershell', 'none'].includes(spec.shell)) {
    throw new Error('shell must be "bash", "powershell", or "none" (default "bash")');
  }
  if (spec.shell === 'none') {
    if (!spec.argv || spec.argv.length === 0 || !spec.argv[0]) {
      throw new Error('argv with at least one element is required when shell:"none"');
    }
    return;
  }
  if (!spec.command || spec.command.trim().length === 0) {
    throw new Error('command is required unless shell:"none" with argv is provided');
  }
}

export function spawnCommand(spec: CommandSpec, logPath: string, detached: boolean): SpawnedProcess {
  validateCommandSpec(spec);
  mkdirSync(dirname(logPath), { recursive: true });
  if (process.platform === "win32") {
    const spawned = spawnWindowsCommand(spec, logPath);
    spawned.child.on("error", (error: Error) => {
      try { appendFileSync(logPath, `\n--- spawn error ${error.message} ---\n`); } catch { /* logging is best effort */ }
    });
    return spawned;
  }
  const execution = commandExecution(spec);
  const fd = openSync(logPath, "a");
  const stdio: SpawnStdio = ["ignore", fd, fd];
  const child = spawnArgs(spec, detached, stdio, execution);
  const marker = `\n--- spawn ${new Date().toISOString()} pid=${child.pid ?? "unknown"} ---\n`;
  try {
    if (fd !== undefined) {
      writeSync(fd, marker);
    } else {
      // The detached child is already running; a throw here would orphan it
      // with no task metadata, so the marker write is best effort.
      appendFileSync(logPath, marker);
    }
  } catch {
    // Log unavailable; the runtime close handler still records the failure.
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* best effort */ }
    }
  }
  // Spawn failures (ENOENT, bad cwd, permission denied) surface as an 'error'
  // event. With no listener Node turns it into an uncaughtException that takes
  // down the whole host process; log it here and let the runtime's 'close'
  // handler finalize the task as failed.
  child.on("error", (error) => {
    try {
      const code = (error as NodeJS.ErrnoException).code ?? "unknown";
      appendFileSync(logPath, `\n--- spawn error ${new Date().toISOString()} code=${code} message=${error.message} ---\n`);
    } catch {
      // Log unavailable; the runtime close handler still records the failure.
    }
  });
  child.on("close", (code, signal) => {
    try {
      appendFileSync(logPath, `\n--- exit ${new Date().toISOString()} code=${code ?? "null"} signal=${signal ?? "null"} ---\n`);
    } catch {
      // Log unavailable (swept tmp dir, ACL change): a throw here would crash
      // the host; the runtime already finalized the task from meta.
    }
  });
  return { child, shell: execution.shell, pgid: detached && child.pid ? child.pid : undefined,
    terminate: child.pid ? createProcessTreeTerminator(child.pid, child.pid) : async () => {} };
}

export class CommandTerminationError extends Error {
  constructor(error: unknown) {
    super(error instanceof Error ? error.message : String(error), { cause: error });
    this.name = "CommandTerminationError";
  }
}

export interface RunningCommand {
  /** Aborted-before-launch commands have no used shell. */
  shell?: ShellUsed;
  result: Promise<CommandResult>;
  /** Retry cleanup independently of an already rejected command result. */
  terminate(): Promise<void>;
  readonly cleanupPending: boolean;
  /** True only after tree verification, or when no process was launched. */
  readonly cleanupVerified: boolean;
}

/** Run a command in its own process group, including any descendants holding output pipes. */
export function runCommandOnce(
  spec: CommandSpec,
  maxBufferBytes = 1024 * 1024,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<CommandResult> {
  return startCommandOnce(spec, maxBufferBytes, timeoutMs, signal).result;
}

/** A command result plus retained, retriable ownership of its process tree. */
export function startCommandOnce(
  spec: CommandSpec,
  maxBufferBytes = 1024 * 1024,
  timeoutMs?: number,
  signal?: AbortSignal,
): RunningCommand {
  validateCommandSpec(spec);
  if (signal?.aborted) return {
    result: Promise.reject(new Error("Command aborted before launch")),
    terminate: async () => {}, cleanupPending: false, cleanupVerified: true,
  };
  if (process.platform === "win32") return startWindowsCommandOnce(spec, maxBufferBytes, timeoutMs, signal);
  const startedAt = Date.now();
  const execution = commandExecution(spec);
  const child = spawnArgs(spec, true, ["ignore", "pipe", "pipe"], execution);
  const cap = Math.max(1, Math.floor(maxBufferBytes));
  const stdoutCapture = createCaptureBuffer();
  const stderrCapture = createCaptureBuffer();
  let timedOut = false;
  child.stdout?.on("data", (chunk: Buffer | string) => captureChunk(stdoutCapture, chunk, cap));
  child.stderr?.on("data", (chunk: Buffer | string) => captureChunk(stderrCapture, chunk, cap));
  const terminateTree = child.pid ? createProcessTreeTerminator(child.pid, child.pid) : async () => {};
  let cleanupPending = !!child.pid;
  let cleanupVerified = !child.pid;
  let requestTermination!: () => Promise<void>;
  const result = new Promise<CommandResult>((resolve, reject) => {
    let termination: Promise<void> | undefined;
    let commandError: Error | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };
    requestTermination = () => {
      if (termination) return termination;
      cleanupPending = true;
      termination = Promise.resolve().then(terminateTree).then(() => { cleanupPending = false; cleanupVerified = true; }, (error) => {
        termination = undefined;
        cleanup();
        const failure = new CommandTerminationError(error);
        reject(failure);
        throw failure;
      });
      return termination;
    };
    const terminate = () => { void requestTermination().catch(() => {}); };
    const onAbort = () => terminate();
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) terminate();
    if (timeoutMs !== undefined) {
      timeout = setTimeout(() => { timedOut = true; terminate(); }, Math.max(1, timeoutMs));
      timeout.unref();
    }
    child.on("error", (error) => {
      commandError = error;
      cleanup();
      void requestTermination().then(() => reject(error), reject);
    });
    // 'close' can wait forever on pipes inherited by a descendant. Leader exit
    // starts settlement; close/result resolution still awaits that verification.
    child.on("exit", terminate);
    child.on("close", (exitCode, exitSignal) => {
      cleanup();
      void (async () => {
        await requestTermination();
        if (commandError) throw commandError;
        const stdout = finishCapture(stdoutCapture);
        const stderr = finishCapture(stderrCapture);
        resolve({
          exitCode, signal: exitSignal, stdout: stdout.text, stderr: stderr.text,
          startedAt, endedAt: Date.now(),
          ...(timedOut ? { timedOut: true } : {}),
          ...(stdout.discardedBytes > 0 ? { stdoutDiscardedBytes: stdout.discardedBytes } : {}),
          ...(stderr.discardedBytes > 0 ? { stderrDiscardedBytes: stderr.discardedBytes } : {}),
          ...(stdout.discardedBytes > 0 || stderr.discardedBytes > 0 ? { captureTruncated: true } : {}),
        });
      })().catch(reject);
    });
  });
  return { result, shell: execution.shell, terminate: () => requestTermination(),
    get cleanupPending() { return cleanupPending; }, get cleanupVerified() { return cleanupVerified; } };
}

interface CaptureBuffer {
  chunks: Buffer[];
  storedBytes: number;
  discardedBytes: number;
  truncated: boolean;
}

function createCaptureBuffer(): CaptureBuffer {
  return { chunks: [], storedBytes: 0, discardedBytes: 0, truncated: false };
}

function asBuffer(chunk: Buffer | string): Buffer {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}

/** Largest UTF-8 prefix of `buffer` that fits in `maxBytes`. */
export function utf8PrefixLength(buffer: Buffer, maxBytes: number): number {
  if (maxBytes <= 0) return 0;
  if (buffer.length <= maxBytes) return buffer.length;
  let end = maxBytes;
  while (end > 0 && (buffer[end]! & 0xc0) === 0x80) end -= 1;
  if (end === 0 && (buffer[0]! & 0xc0) === 0x80) return 0;
  const lead = buffer[end]!;
  const need = lead <= 0x7f ? 1
    : (lead & 0xe0) === 0xc0 ? 2
    : (lead & 0xf0) === 0xe0 ? 3
    : (lead & 0xf8) === 0xf0 ? 4
    : 1;
  return end + need <= maxBytes ? end + need : end;
}

function captureChunk(target: CaptureBuffer, chunk: Buffer | string, maxBytes: number): void {
  const buffer = asBuffer(chunk);
  if (target.truncated) {
    target.discardedBytes += buffer.length;
    return;
  }
  const room = maxBytes - target.storedBytes;
  if (buffer.length <= room) {
    target.chunks.push(buffer);
    target.storedBytes += buffer.length;
    return;
  }
  const take = utf8PrefixLength(buffer, room);
  if (take > 0) {
    target.chunks.push(buffer.subarray(0, take));
    target.storedBytes += take;
  }
  target.discardedBytes += buffer.length - take;
  target.truncated = true;
}

/**
 * Length of `buffer` without a trailing UTF-8 sequence that the cap cut short.
 * Chunk boundaries can split a code point; once capture overflows, the bytes
 * that would have completed it were discarded, so the dangling lead bytes are
 * discarded too instead of decoding to U+FFFD.
 */
export function completeUtf8Length(buffer: Buffer): number {
  let start = buffer.length - 1;
  while (start >= 0 && buffer.length - start < 4 && (buffer[start]! & 0xc0) === 0x80) start -= 1;
  if (start < 0) return buffer.length;
  const lead = buffer[start]!;
  const need = lead <= 0x7f ? 1
    : (lead & 0xe0) === 0xc0 ? 2
    : (lead & 0xf0) === 0xe0 ? 3
    : (lead & 0xf8) === 0xf0 ? 4
    : 1;
  return start + need > buffer.length ? start : buffer.length;
}

function finishCapture(target: CaptureBuffer): { text: string; discardedBytes: number } {
  const stored = Buffer.concat(target.chunks, target.storedBytes);
  const keep = target.truncated ? completeUtf8Length(stored) : stored.length;
  return {
    text: stored.subarray(0, keep).toString("utf8"),
    discardedBytes: target.discardedBytes + (stored.length - keep),
  };
}

/** Signal a POSIX group only. Windows requires an opaque launch-time Job Object. */
export function stopProcessGroup(
  pid: number,
  pgid?: number,
  signal: NodeJS.Signals = "SIGTERM",
): void {
  if (process.platform === "win32") throw new Error("Windows termination requires an owned Job Object, never a PID");
  process.kill(-(pgid ?? pid), signal);
}

export function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Only ESRCH proves absence. Permission/unknown probe failures must not
    // let cleanup declare a possibly-live tree terminated.
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** Run a command in its own process group, including any descendants holding output pipes. */
export function commandExecution(spec: CommandSpec): { execPath: string; execArgs: string[]; shell: ShellUsed } {
  validateCommandSpec(spec);
  if (spec.shell === 'none') {
    const [command, ...args] = spec.argv!;
    return { execPath: command!, execArgs: args, shell: { kind: 'none', executable: command!, label: `none (direct argv: ${command})` } };
  }
  const shell = resolveShell(spec.shell ?? 'bash', spec.cwd);
  const { args, ...shellUsed } = shell;
  return { execPath: shell.executable, execArgs: shell.kind === 'powershell' ? powerShellArguments(spec.command!) : [...args, spec.command!], shell: shellUsed };
}

/** Stdio for a spawned task: stdin is always ignored; stdout/stderr are piped (collected) or ignored (redirected into the log by the child itself). */
type SpawnStdio = ["ignore", "pipe" | "ignore" | number, "pipe" | "ignore" | number];

function spawnArgs(
  spec: CommandSpec,
  detached: boolean,
  stdio: SpawnStdio,
  execution: ReturnType<typeof commandExecution>,
): ChildProcess {
  const env = { ...process.env, ...spec.env };
  const { execPath, execArgs } = execution;
  return spawn(execPath, execArgs, {
    cwd: spec.cwd,
    env,
    detached,
    stdio,
    // A detached Windows child gets its own console window unless hidden; these
    // tasks write to log files and must not flash terminals.
    windowsHide: true,
  });
}
