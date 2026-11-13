// ACP v1 stdio client, adapted from the Antigravity bridge connection/JSON-RPC transport.
// No inference or authentication flow is performed during initialization.
import {
  type JunieLaunchOptions,
  type JunieProcess,
  launchJunie,
} from '../junie-process.js';
import { JsonRpcResponseError, JsonRpcSession } from './jsonrpc.js';

export interface ConfigValue {
  _meta?: {
    jetbrains?: {
      air?: { modelDisplayName?: unknown; [key: string]: unknown };
    };
    [key: string]: unknown;
  };
  value: string;
  name: string;
}
export interface ConfigGroup {
  group: string;
  name: string;
  options: ConfigValue[];
}
export interface ConfigOption {
  id: string;
  name: string;
  type: string;
  category?: string;
  currentValue: string;
  options: (ConfigValue | ConfigGroup)[];
}
export interface SessionResponse {
  sessionId: string;
  configOptions?: ConfigOption[];
  [key: string]: unknown;
}
export interface Initialization {
  protocolVersion: number;
  agentCapabilities?: Record<string, unknown>;
  authMethods?: { id: string; name: string }[];
}
export interface AcpOptions extends JunieLaunchOptions {
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  onUpdate?: (params: unknown) => void;
  onNotification?: (method: string, params: unknown) => void;
  onPermission?: (params: unknown) => Promise<unknown>;
}
export class AcpAuthError extends Error {
  override name = 'AcpAuthError';
  constructor() {
    super(
      'Junie authentication required: run `junie` and log in with your JetBrains Account.',
    );
  }
}
function translateError(error: unknown): unknown {
  if (
    error instanceof JsonRpcResponseError &&
    (error.code === -32000 ||
      /auth(?:entication)?[ _-]*(?:required|failed)|not authenticated|log.?in/i.test(
        error.message,
      ))
  )
    return new AcpAuthError();
  return error;
}
export class AcpConnection {
  readonly initialization: Initialization;
  private closing?: Promise<void>;
  private constructor(
    private child: JunieProcess,
    private rpc: JsonRpcSession,
    initialization: Initialization,
  ) {
    this.initialization = initialization;
  }
  get stderrTail(): string {
    return this.child.stderrTail();
  }
  static async connect(options: AcpOptions = {}): Promise<AcpConnection> {
    const timeout = options.startupTimeoutMs ?? 30000;
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let child: JunieProcess | undefined;
    let rpc: JsonRpcSession | undefined;
    const start = (async () => {
      child = await launchJunie(options);
      if (expired) {
        await child.terminate();
        throw new Error('Junie startup timed out');
      }
      const process = child;
      rpc = new JsonRpcSession({
        defaultTimeoutMs: options.requestTimeoutMs ?? 30000,
        send: (frame) => {
          process.stdin.write(frame + '\n', (error) => {
            if (error) rpc?.abortAll(error.message);
          });
        },
        onRequest: async (method, params) => {
          if (method === 'session/request_permission')
            return options.onPermission
              ? options.onPermission(params)
              : { outcome: { outcome: 'cancelled' } };
          throw new Error(`Unsupported ACP client method: ${method}`);
        },
        onNotification: (method, params) => {
          if (method === 'session/update') options.onUpdate?.(params);
          options.onNotification?.(method, params);
        },
        onOverflow: () => {
          void process.terminate().catch(() => {});
        },
      });
      process.stdin.on('error', (error) => rpc?.abortAll(error.message));
      process.stdout.setEncoding('utf8');
      process.stdout.on('data', (chunk) => rpc?.feed(String(chunk)));
      const finish = (reason: string) => {
        rpc?.abortAll(reason);
        void process.terminate().catch(() => {});
      };
      process.stdout.on('error', (error) => finish(error.message));
      process.stderr.on('error', (error) => finish(error.message));
      void process.exited.then(
        ({ code }) => finish(`Junie exited (${code}): ${process.stderrTail()}`),
        (error) => finish(String(error)),
      );
      const initialization = (await rpc.request('initialize', {
        protocolVersion: 1,
        clientInfo: { name: 'pi-junie-bridge', version: '0.1.0' },
        clientCapabilities: {},
      })) as Initialization;
      if (initialization?.protocolVersion !== 1)
        throw new Error('Junie did not negotiate ACP v1');
      return new AcpConnection(process, rpc, initialization);
    })();
    try {
      return await Promise.race([
        start,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            expired = true;
            reject(new Error(`Junie startup timed out after ${timeout}ms`));
          }, timeout);
        }),
      ]);
    } catch (error) {
      rpc?.abortAll('Junie startup failed');
      await child?.terminate();
      throw translateError(error);
    } finally {
      clearTimeout(timer);
    }
  }
  async request<T = unknown>(method: string, params: unknown): Promise<T> {
    try {
      return (await this.rpc.request(method, params)) as T;
    } catch (error) {
      throw translateError(error);
    }
  }
  newSession(
    cwd: string,
    mcpServers: unknown[] = [],
  ): Promise<SessionResponse> {
    return this.request('session/new', { cwd, mcpServers });
  }
  resumeSession(
    sessionId: string,
    cwd: string,
    mcpServers: unknown[] = [],
  ): Promise<SessionResponse> {
    return this.request('session/resume', { sessionId, cwd, mcpServers });
  }
  forkSession(
    sessionId: string,
    cwd: string,
    mcpServers: unknown[] = [],
  ): Promise<SessionResponse> {
    return this.request('session/fork', { sessionId, cwd, mcpServers });
  }
  loadSession(
    sessionId: string,
    cwd: string,
    mcpServers: unknown[] = [],
  ): Promise<SessionResponse> {
    return this.request('session/load', { sessionId, cwd, mcpServers });
  }
  closeSession(sessionId: string): Promise<unknown> {
    return this.request('session/close', { sessionId });
  }
  cancelSession(sessionId: string): void {
    this.rpc.notify('session/cancel', { sessionId });
  }
  setConfigOption(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<unknown> {
    return this.request('session/set_config_option', {
      sessionId,
      configId,
      value,
    });
  }
  close(): Promise<void> {
    this.rpc.abortAll('Junie connection closed');
    this.closing ??= this.child.terminate();
    return this.closing;
  }
}
