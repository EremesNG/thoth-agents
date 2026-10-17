import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { terminateProcessTree } from './process-termination.js';
import type {
  InitializeParams,
  InitializeResponse,
  JsonRpcRequest,
  RequestId,
  ServerNotificationParams,
  ServerRequest,
  ServerRequestHandler,
  ThreadResumeParams,
  ThreadResumeResponse,
  ThreadStartParams,
  ThreadStartResponse,
  TurnCompletedNotification,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
} from './protocol.js';

export interface AppServerClientOptions {
  binaryPath: string;
  /** Arguments before app-server (e.g. a Node fixture script). */
  commandPrefixArgs?: string[];
  extraArgs?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
  serverRequestTimeoutMs?: number;
  maxLineBytes?: number;
  stderrTailBytes?: number;
  closeGraceMs?: number;
  terminationTimeoutMs?: number;
  serverRequestHandler?: ServerRequestHandler;
  onProtocolError?: (error: Error) => void;
}
type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};
type TurnWait = {
  resolve: (value: TurnCompletedNotification) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};
const requestMethods = new Set([
  'mcpServer/elicitation/request',
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/permissions/requestApproval',
]);

export class AppServerClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<RequestId, Pending>();
  private readonly listeners = new Map<string, Set<(params: never) => void>>();
  private readonly completed = new Map<string, TurnCompletedNotification>();
  private readonly waits = new Map<string, Set<TurnWait>>();
  private readonly handlers = new Set<AbortController>();
  private serial = 0;
  private terminalError?: Error;
  private closing = false;
  private closePromise?: Promise<void>;
  private stderr = Buffer.alloc(0);
  private readonly exited: Promise<void>;

  constructor(private readonly options: AppServerClientOptions) {
    this.child = spawn(
      options.binaryPath,
      [
        ...(options.commandPrefixArgs ?? []),
        'app-server',
        '--stdio',
        ...(options.extraArgs ?? []),
      ],
      {
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        cwd: options.cwd,
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    this.exited = new Promise((resolve) => {
      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        this.fail(
          new Error(
            `Codex app-server ${options.binaryPath} exited (code ${code}, signal ${signal}). Stderr: ${this.stderrTail || '(empty)'}`,
          ),
        );
        resolve();
      };
      // `close` can lag indefinitely when a descendant inherits the pipes.
      this.child.once('exit', onExit);
      this.child.once('close', onExit);
    });
    this.child.once('error', (error) =>
      this.fail(
        new Error(
          `Cannot start Codex app-server ${options.binaryPath}: ${error.message}`,
        ),
      ),
    );
    this.child.stdin.on('error', (error) =>
      this.fail(
        new Error(
          `Codex app-server stdin failed: ${error.message}; stderr: ${this.stderrTail}`,
        ),
      ),
    );
    this.child.stderr.on('data', (chunk: Buffer) => {
      const limit = Math.max(1, options.stderrTailBytes ?? 16384);
      this.stderr = Buffer.concat([this.stderr, chunk]).subarray(-limit);
    });
    const decoder = new StringDecoder('utf8');
    let line = '';
    let bytes = 0;
    let dropping = false;
    this.child.stdout.on('data', (chunk: Buffer) => {
      const parts = decoder.write(chunk).split('\n');
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!dropping) {
          bytes += Buffer.byteLength(part);
          if (bytes > (options.maxLineBytes ?? 8 * 1024 * 1024)) {
            line = '';
            dropping = true;
            this.report(new Error('Oversized app-server JSON line discarded'));
          } else line += part;
        }
        if (i < parts.length - 1) {
          if (!dropping && line.trim()) this.receive(line);
          line = '';
          bytes = 0;
          dropping = false;
        }
      }
    });
  }
  get stderrTail(): string {
    return this.stderr.toString('utf8');
  }
  onNotification<M extends keyof ServerNotificationParams>(
    method: M,
    listener: (params: ServerNotificationParams[M]) => void,
  ): () => void {
    let set = this.listeners.get(method);
    if (!set) {
      set = new Set();
      this.listeners.set(method, set);
    }
    const callback = listener as (params: never) => void;
    set.add(callback);
    return () => {
      set.delete(callback);
    };
  }
  async initialize(params?: InitializeParams): Promise<InitializeResponse> {
    try {
      const result = await this.request<InitializeResponse>(
        'initialize',
        params ?? {
          clientInfo: {
            name: 'pi-askcodex',
            title: 'AskCodex',
            version: '0.1.0',
          },
          capabilities: { experimentalApi: true, requestAttestation: false },
        },
      );
      if (!result || typeof result.userAgent !== 'string')
        throw new Error('Invalid initialize response');
      this.send({ method: 'initialized', params: {} });
      return result;
    } catch (error) {
      const failure = new Error(
        `Unsupported or unavailable experimental Codex app-server at ${this.options.binaryPath}. Use a compatible Codex Desktop-bundled binary (ASKCODEX_BIN). Handshake failed: ${String(error)}`,
      );
      this.fail(failure);
      await this.close();
      throw failure;
    }
  }
  threadStart(params: ThreadStartParams): Promise<ThreadStartResponse> {
    return this.request('thread/start', params);
  }
  threadResume(params: ThreadResumeParams): Promise<ThreadResumeResponse> {
    return this.request('thread/resume', params);
  }
  turnStart(params: TurnStartParams): Promise<TurnStartResponse> {
    return this.request('turn/start', params);
  }
  turnInterrupt(params: TurnInterruptParams): Promise<TurnInterruptResponse> {
    return this.request('turn/interrupt', params);
  }
  waitForTurnCompleted(
    turnId: string,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<TurnCompletedNotification> {
    const result = this.completed.get(turnId);
    if (result) return Promise.resolve(result);
    if (this.terminalError) return Promise.reject(this.terminalError);
    if (options.signal?.aborted)
      return Promise.reject(new Error('Turn wait aborted'));
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      const abort = () => {
        wait.cleanup();
        reject(new Error('Turn wait aborted'));
      };
      const wait: TurnWait = {
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer);
          options.signal?.removeEventListener('abort', abort);
          const set = this.waits.get(turnId);
          set?.delete(wait);
          if (!set?.size) this.waits.delete(turnId);
        },
      };
      let set = this.waits.get(turnId);
      if (!set) {
        set = new Set();
        this.waits.set(turnId, set);
      }
      set.add(wait);
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.timeoutMs !== undefined)
        timer = setTimeout(() => {
          wait.cleanup();
          reject(new Error(`Turn ${turnId} completion timed out`));
        }, options.timeoutMs);
    });
  }
  close(): Promise<void> {
    if (!this.closePromise) this.closePromise = this.shutdown();
    return this.closePromise;
  }
  private async shutdown(): Promise<void> {
    this.closing = true;
    this.fail(
      new Error(
        `Codex app-server ${this.options.binaryPath} closed; stderr: ${this.stderrTail}`,
      ),
    );
    // Windows tree ownership depends on the live leader: EOF can make it exit
    // before taskkill /T enumerates descendants. POSIX retains its process group.
    if (process.platform !== 'win32') {
      this.child.stdin.end();
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        this.exited,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, this.options.closeGraceMs ?? 100);
        }),
      ]);
      clearTimeout(timer);
    }
    await terminateProcessTree(this.child, {
      timeoutMs: this.options.terminationTimeoutMs,
    });
    this.child.stdout.destroy();
    this.child.stderr.destroy();
    this.child.stdin.destroy();
  }
  private request<T>(method: string, params: unknown): Promise<T> {
    if (this.terminalError || this.closing)
      return Promise.reject(this.terminalError ?? new Error('Client closed'));
    return new Promise<T>((resolve, reject) => {
      const id = ++this.serial;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `Codex app-server request ${method} timed out; stderr: ${this.stderrTail}`,
          ),
        );
      }, this.options.requestTimeoutMs ?? 30000);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      try {
        this.send({ id, method, params });
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }
  private send(message: unknown): void {
    if (this.child.stdin.destroyed || !this.child.stdin.writable)
      throw new Error('Codex app-server stdin is closed');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  private receive(line: string): void {
    try {
      const message = JSON.parse(line);
      if (!message || typeof message !== 'object' || Array.isArray(message))
        throw new Error('Expected JSON-RPC object');
      const hasId =
        typeof message.id === 'string' || typeof message.id === 'number';
      if (typeof message.method === 'string') {
        if (hasId) {
          void this.dispatch(message);
          return;
        }
        if (message.method === 'turn/completed') {
          if (typeof message.params?.turn?.id !== 'string')
            throw new Error('Invalid turn/completed notification');
          const id = message.params.turn.id;
          this.completed.set(id, message.params);
          // Keep completion-before-registration races safe without unbounded history.
          if (this.completed.size > 128) {
            const oldestId = this.completed.keys().next().value;
            if (oldestId !== undefined) this.completed.delete(oldestId);
          }
          for (const wait of this.waits.get(id) ?? []) {
            wait.cleanup();
            wait.resolve(message.params);
          }
        }
        for (const listener of this.listeners.get(message.method) ?? []) {
          try {
            listener(message.params as never);
          } catch (error) {
            this.report(
              new Error(`Notification listener failed: ${String(error)}`),
            );
          }
        }
      } else if (hasId) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        if (!('result' in message) && !('error' in message))
          throw new Error('Invalid JSON-RPC response');
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error)
          pending.reject(
            new Error(
              `Codex RPC error ${message.error.code}: ${message.error.message}`,
            ),
          );
        else pending.resolve(message.result);
      } else throw new Error('Invalid JSON-RPC message');
    } catch (error) {
      this.report(new Error(`Malformed app-server output: ${String(error)}`));
    }
  }
  private async dispatch(message: JsonRpcRequest): Promise<void> {
    const controller = new AbortController();
    this.handlers.add(controller);
    const request: ServerRequest = requestMethods.has(message.method)
      ? (message as ServerRequest)
      : { ...message, method: 'unknown', originalMethod: message.method };
    let timer: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () =>
          reject(new Error('Server request aborted or timed out'));
        controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      timer = setTimeout(
        () => controller.abort(),
        this.options.serverRequestTimeoutMs ?? 30000,
      );
      const handler = this.options.serverRequestHandler;
      const result = handler
        ? await Promise.race([
            Promise.resolve().then(() =>
              handler(request, { signal: controller.signal }),
            ),
            aborted,
          ])
        : {
            error: {
              code: -32601,
              message: 'No approval handler; request denied',
            },
          };
      if (!this.terminalError) {
        if (request.method === 'unknown')
          this.send({
            id: message.id,
            error: {
              code: -32601,
              message: `Unsupported server request: ${request.originalMethod}`,
            },
          });
        else
          this.send(
            'error' in result
              ? { id: message.id, error: result.error }
              : { id: message.id, result },
          );
      }
    } catch (error) {
      if (!this.terminalError) {
        try {
          this.send({
            id: message.id,
            error: {
              code: -32603,
              message: `Server request denied: ${String(error)}`,
            },
          });
        } catch (sendError) {
          this.fail(new Error(String(sendError)));
        }
      }
    } finally {
      clearTimeout(timer);
      if (onAbort) controller.signal.removeEventListener('abort', onAbort);
      this.handlers.delete(controller);
    }
  }
  private report(error: Error): void {
    try {
      this.options.onProtocolError?.(error);
    } catch {
      /* diagnostics are isolated */
    }
  }
  private fail(error: Error): void {
    if (this.terminalError) return;
    this.terminalError = error;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    for (const set of this.waits.values())
      for (const wait of set) {
        wait.cleanup();
        wait.reject(error);
      }
    this.waits.clear();
    for (const controller of this.handlers) controller.abort();
  }
}
