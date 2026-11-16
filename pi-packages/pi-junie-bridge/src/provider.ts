import { createHash, randomUUID } from 'node:crypto';
import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  createAssistantMessageEventStream,
  getCurrentTools,
  type Model,
  type SimpleStreamOptions,
  type Tool,
  type ToolCall,
  type TranscriptContext,
} from '@earendil-works/pi-ai';
import { AcpConnection, type AcpOptions } from './acp/connection.js';
import { JsonRpcResponseError } from './acp/jsonrpc.js';
import {
  type Catalog,
  readCatalog,
  recordContextWindow,
  toAcpModelValue,
  toJunieEffort,
} from './catalog.js';
import { junieUsageLine, readJunieModel } from './junie-usage.js';
import {
  type McpResult,
  type McpServerHandle,
  startMcpServer,
  TOKEN_HEADER,
} from './mcp-server.js';
import {
  NativeActivityFolder,
  type NativeToolActivity,
} from './native-display.js';
import { writeNativeToolHooks } from './native-tool-hooks.js';
import { requestPermission } from './permissions.js';
import {
  createSessionStore,
  type PersistedSession,
  type SessionStore,
} from './session-store.js';

export interface ProviderOptions extends AcpOptions {
  getSession?: (
    piSessionId: string,
  ) => { cwd: string; headless?: boolean } | undefined;
  onPermission?: (
    params: unknown,
    signal?: AbortSignal,
    piSessionId?: string,
  ) => Promise<unknown>;
  /** Display-only entries, excluded from Pi messages and prompt projection. */
  onNativeEvent?: (event: NativeToolActivity, piSessionId?: string) => void;
  /** Optional debug sink for best-effort local telemetry. */
  debug?: (message: string) => void;
  agentDir?: string;
  onCatalogUpdate?: (catalog: Catalog) => void;
  sessionStore?: SessionStore;
  /** Optional additional MCP servers; the provider registers its own Pi server. */
  getMcpServers?: () => unknown[];
  /** Positive milliseconds. Environment defaults are JUNIE_BRIDGE_{STARTUP,INACTIVITY}_TIMEOUT_MS. */
  inactivityTimeoutMs?: number;
}
interface ParkedCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  resolve(result: McpResult): void;
}
interface PromptResponse {
  stopReason: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cachedReadTokens?: number;
    cachedWriteTokens?: number;
  };
}
interface TurnState {
  prompt: Promise<PromptResponse>;
  queue: ParkedCall[];
  contextTokens?: number;
  issued?: ParkedCall;
  wake?: () => void;
  removeAbort?: () => void;
}
interface SessionState {
  openings: Set<Promise<unknown>>;
  mcp?: McpServerHandle;
  piSessionId?: string;
  permissionAbort?: AbortController;
  resettingBrave?: Promise<void>;
  tools?: Tool[];
  turn?: TurnState;
  hiddenTools?: Set<string>;
  nativeActivity?: NativeActivityFolder;
  backlog?: UpdateEnvelope[];
  connection?: AcpConnection;
  sessionId?: string;
  prompted: boolean;
  recording?: PersistedSession;
  // Bumped at the start of every new prompt/continuation and on dispose/close:
  // a pending display-only line whose generation moved is dropped, never reordered.
  displayGeneration: number;
  // cost is already attributed; observedCost also includes idle trailing updates.
  cost: number;
  observedCost: number;
  disposed: boolean;
  closing?: Promise<void>;
  active: boolean;
  onUpdate?: (params: UpdateEnvelope) => void;
  interrupt?: (error: Error) => void;
}
interface UpdateEnvelope {
  sessionId: string;
  update: Omit<NativeToolActivity, 'content'> & {
    sessionUpdate: string;
    configOptions?: { id: string; currentValue: string }[];
    content?: { type: string; text?: string } | NativeToolActivity['content'];
    used?: number;
    size?: number;
    cost?: { amount: number; currency: string };
    title?: string;
    toolCallId?: string;
    status?: string;
    _meta?: { is_mcp_tool_call?: boolean };
  };
}
const COMPACTION_MARKER =
  'The conversation history before this point was compacted';
function isCompaction(message: TranscriptContext['messages'][number]): boolean {
  return (
    message.role === 'user' && messageText(message).includes(COMPACTION_MARKER)
  );
}
function messageLabel(message: TranscriptContext['messages'][number]): string {
  return message.role === 'assistant'
    ? `assistant (${message.provider})`
    : message.role === 'toolResult'
      ? `tool result (${message.toolName})`
      : message.role;
}
function messageText(message: TranscriptContext['messages'][number]): string {
  const text =
    typeof message.content === 'string'
      ? message.content
      : message.content
          .map((block) =>
            block.type === 'text'
              ? block.text
              : block.type === 'image'
                ? '[image]'
                : block.type === 'thinking'
                  ? ''
                  : `[tool ${block.name}: ${JSON.stringify(block.arguments)}]`,
          )
          .join('\n');
  const sections =
    message.role === 'system'
      ? Object.values(message.sections ?? {})
          .filter(Boolean)
          .join('\n')
      : '';
  return `${messageLabel(message)}: ${text}${sections ? `\n${sections}` : ''}`;
}
function boundedHistory(messages: TranscriptContext['messages']): string {
  const summary = [...messages].reverse().find(isCompaction);
  const parts = summary
    ? [`[Pi compaction summary]\n${messageText(summary).slice(0, 12000)}`]
    : [];
  let budget = 24000 - (parts[0]?.length ?? 0);
  const recent: string[] = [];
  for (const message of [...messages].reverse()) {
    if (message === summary) continue;
    const text = messageText(message),
      label = `${messageLabel(message)} [truncated]: `;
    if (budget <= label.length + 1) break;
    const kept =
      text.length < budget
        ? text
        : `${label}${text.slice(-(budget - label.length - 1))}`;
    recent.unshift(kept);
    budget -= kept.length + 1;
  }
  return [...parts, ...recent].join('\n');
}
/** Fresh/diverged sessions receive bounded context; live sessions only the unseen suffix. */
export function projectPrompt(
  context: TranscriptContext,
  state: {
    prompted: boolean;
    recording?: PersistedSession;
    headless?: boolean;
  },
) {
  const lastUser = [...context.messages]
    .reverse()
    .find((message) => message.role === 'user');
  const userIndex = lastUser ? context.messages.indexOf(lastUser) : -1;
  if (userIndex < 0) throw new Error('Junie requires a user message.');
  const start = state.prompted
    ? (state.recording?.digests.length ?? userIndex)
    : userIndex;
  const prompt: (
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  )[] = [];
  if (state.headless)
    prompt.push({
      type: 'text',
      text: 'Use the pi/ MCP tools for commands and file changes: pi/bash, pi/edit, and pi/write.',
    });
  if (!state.prompted) {
    const history = boundedHistory(context.messages.slice(0, userIndex));
    if (history)
      prompt.push({
        type: 'text',
        text: `Prior Pi context (oldest content may be truncated):\n${history}`,
      });
  }
  for (const message of context.messages.slice(start)) {
    if (message.role === 'user') {
      const blocks =
        typeof message.content === 'string'
          ? [{ type: 'text' as const, text: message.content }]
          : message.content;
      for (const block of blocks)
        prompt.push(
          block.type === 'image'
            ? { type: 'image', data: block.data, mimeType: block.mimeType }
            : { type: 'text', text: block.text },
        );
    } else prompt.push({ type: 'text', text: messageText(message) });
  }
  return prompt;
}
function bound(
  value: number | undefined,
  env: string | undefined,
  fallback: number,
): number {
  const result = value ?? (env === undefined ? fallback : Number(env));
  if (!Number.isFinite(result) || result <= 0 || result > 2147483647)
    throw new Error(
      'Junie timeout bounds must be positive milliseconds (at most 2147483647).',
    );
  return result;
}
function aborted(): Error {
  return Object.assign(new Error('Junie turn aborted.'), {
    name: 'AbortError',
  });
}

/** Pi blocks close on switch, and on every terminal path (including partial failure). */
function blocksFor(
  stream: AssistantMessageEventStream,
  message: AssistantMessage,
) {
  let open: number | undefined;
  const close = () => {
    if (open === undefined) return;
    const block = message.content[open];
    if (block.type === 'text')
      stream.push({
        type: 'text_end',
        contentIndex: open,
        content: block.text,
        partial: message,
      });
    if (block.type === 'thinking')
      stream.push({
        type: 'thinking_end',
        contentIndex: open,
        content: block.thinking,
        partial: message,
      });
    open = undefined;
  };
  return {
    close,
    append(kind: 'text' | 'thinking', delta: string) {
      if (!delta) return;
      if (open === undefined || message.content[open].type !== kind) {
        close();
        open = message.content.length;
        if (kind === 'text') {
          message.content.push({ type: 'text', text: '' });
          stream.push({
            type: 'text_start',
            contentIndex: open,
            partial: message,
          });
        } else {
          message.content.push({ type: 'thinking', thinking: '' });
          stream.push({
            type: 'thinking_start',
            contentIndex: open,
            partial: message,
          });
        }
      }
      const block = message.content[open];
      if (block.type === 'text') {
        block.text += delta;
        stream.push({
          type: 'text_delta',
          contentIndex: open,
          delta,
          partial: message,
        });
      } else if (block.type === 'thinking') {
        block.thinking += delta;
        stream.push({
          type: 'thinking_delta',
          contentIndex: open,
          delta,
          partial: message,
        });
      }
    },
  };
}
function historyDigests(messages: TranscriptContext['messages']): string[] {
  return messages.map((message, index) =>
    createHash('sha256')
      .update(
        JSON.stringify({
          index,
          role: message.role,
          timestamp: message.timestamp,
          id: (message as { id?: string }).id,
          content: message.content,
          ...(message.role === 'assistant'
            ? { provider: message.provider, model: message.model }
            : {}),
          ...(message.role === 'system'
            ? {
                sections: message.sections,
                toolsAdded: message.toolsAdded,
                toolsRemoved: message.toolsRemoved,
              }
            : {}),
          ...(message.role === 'toolResult'
            ? {
                toolCallId: message.toolCallId,
                toolName: message.toolName,
                isError: message.isError,
              }
            : {}),
        }),
      )
      .digest('hex'),
  );
}
function matches(
  record: PersistedSession,
  digests: string[],
  cwd: string,
  model: string,
  catalog: Catalog | undefined,
): boolean {
  try {
    return (
      record.cwd === cwd &&
      // A record may hold either the Pi id or the ACP value for the same model.
      toAcpModelValue(record.model, catalog) === model &&
      record.digests.length <= digests.length &&
      record.digests.every((digest, index) => digest === digests[index])
    );
  } catch {
    // Removed or ambiguous historical ids cannot safely resume; re-seed instead.
    return false;
  }
}
async function restoreSession(
  connection: AcpConnection,
  saved: PersistedSession,
  mcpServers: unknown[],
) {
  const capabilities = connection.initialization.agentCapabilities;
  const sessionCapabilities = capabilities?.sessionCapabilities as
    | { resume?: unknown }
    | undefined;
  let method: 'resume' | 'load' =
    !sessionCapabilities?.resume && capabilities?.loadSession
      ? 'load'
      : 'resume';
  let session: Awaited<ReturnType<AcpConnection['resumeSession']>>;
  try {
    session = await (method === 'resume'
      ? connection.resumeSession(saved.sessionId, saved.cwd, mcpServers)
      : connection.loadSession(saved.sessionId, saved.cwd, mcpServers));
  } catch (error) {
    if (
      method !== 'resume' ||
      !(error instanceof JsonRpcResponseError) ||
      error.code !== -32601
    )
      throw error;
    method = 'load';
    session = await connection.loadSession(
      saved.sessionId,
      saved.cwd,
      mcpServers,
    );
  }
  return { sessionId: session.sessionId || saved.sessionId, method };
}
export function createJunieProvider(deps: ProviderOptions = {}) {
  const store = deps.sessionStore ?? createSessionStore();
  const sessions = new Map<string, SessionState>();
  const openings = new Set<Promise<unknown>>();
  const cleanups = new Set<Promise<void>>();
  function connect(
    owned: SessionState,
    cwd: string,
    startupTimeoutMs: number,
    headless: boolean,
  ) {
    const nativePermission = deps.onPermission;
    const opening = AcpConnection.connect({
      ...deps,
      cwd,
      configLocation: headless
        ? writeNativeToolHooks(deps.agentDir)
        : undefined,
      startupTimeoutMs,
      requestTimeoutMs: 0,
      onPermission: (params) =>
        requestPermission(
          params,
          nativePermission
            ? (value) =>
                nativePermission(
                  value,
                  owned.permissionAbort?.signal,
                  owned.piSessionId,
                )
            : undefined,
        ),
      onUpdate: (params) => {
        const envelope = params as UpdateEnvelope;
        const usage = envelope.update;
        if (
          !owned.disposed &&
          envelope.sessionId === owned.sessionId &&
          usage?.sessionUpdate === 'usage_update' &&
          usage.cost?.currency === 'USD' &&
          Number.isFinite(usage.cost.amount) &&
          usage.cost.amount >= 0
        )
          owned.observedCost = Math.max(owned.observedCost, usage.cost.amount);
        if (
          !owned.disposed &&
          envelope.update?.sessionUpdate === 'config_option_update' &&
          envelope.update.configOptions?.some(
            (option) =>
              option.id === 'brave_mode' && option.currentValue !== 'off',
          ) &&
          !owned.resettingBrave &&
          owned.connection
        ) {
          (deps.warn ?? console.warn)(
            'Junie enabled brave_mode; forcing it back off.',
          );
          const correction = owned.connection
            .setConfigOption(envelope.sessionId, 'brave_mode', 'off')
            .then(
              () => {},
              (error) => {
                (deps.warn ?? console.warn)(
                  `Junie brave_mode correction failed: ${String(error)}`,
                );
                owned.interrupt?.(
                  new Error('Could not disable Junie brave_mode.'),
                );
                return dispose(owned);
              },
            )
            .finally(() => {
              owned.resettingBrave = undefined;
            });
          owned.resettingBrave = correction;
          cleanups.add(correction);
          void correction
            .finally(() => cleanups.delete(correction))
            .catch(() => {});
        }
        if (owned.onUpdate) owned.onUpdate(params as UpdateEnvelope);
        else if (owned.turn && !owned.disposed) {
          owned.backlog ??= [];
          owned.backlog.push(params as UpdateEnvelope);
        }
      },
    }).then(async (connection) => {
      owned.connection = connection;
      if (owned.disposed) {
        await connection.close();
        throw new Error('Junie session closed during startup.');
      }
      return connection;
    });
    openings.add(opening);
    owned.openings.add(opening);
    void opening
      .finally(() => {
        openings.delete(opening);
        owned.openings.delete(opening);
      })
      .catch(() => {});
    return opening;
  }
  function failParked(state: SessionState, text: string) {
    const turn = state.turn;
    turn?.removeAbort?.();
    for (const call of [
      ...(turn?.issued ? [turn.issued] : []),
      ...(turn?.queue ?? []),
    ])
      call.resolve({ content: [{ type: 'text', text }], isError: true });
    if (turn) {
      turn.issued = undefined;
      turn.queue = [];
    }
  }
  function dispose(state: SessionState): Promise<void> {
    if (state.closing) return state.closing;
    failParked(state, 'Junie turn closed before Pi returned a tool result.');
    state.permissionAbort?.abort();
    state.nativeActivity?.flush();
    state.nativeActivity = undefined;
    state.disposed = true;
    // A line still pending at disposal must never land after the session ends.
    state.displayGeneration++;
    state.onUpdate = undefined;
    state.backlog = [];
    state.closing = (async () => {
      try {
        await Promise.allSettled([...state.openings]);
        await state.connection?.close();
      } finally {
        await state.mcp?.close();
      }
    })();
    return state.closing;
  }
  return {
    async close(piSessionId?: string) {
      const owned =
        piSessionId === undefined
          ? [...sessions.values()]
          : [...sessions.values()].filter(
              (state) => state.piSessionId === piSessionId,
            );
      for (const [key, state] of sessions)
        if (owned.includes(state)) sessions.delete(key);
      for (const state of owned) state.interrupt?.(aborted());
      // No waiting for display-only telemetry: dispose bumps the generation, so
      // a line still resolving after close is dropped by its own check.
      await Promise.all(owned.map(dispose));
      // A launch already in progress is also owned; its completion closes it.
      if (piSessionId === undefined)
        await Promise.allSettled([...openings, ...cleanups]);
    },
    streamSimple(
      model: Model<Api>,
      context: TranscriptContext & { cwd?: string },
      options?: SimpleStreamOptions & { cwd?: string },
    ) {
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: 'assistant',
        content: [],
        api: model.api,
        provider: model.provider,
        model: model.id,
        timestamp: Date.now(),
        stopReason: 'stop',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      const blocks = blocksFor(stream, message);
      void (async () => {
        let state: SessionState | undefined;
        let key: string | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let prompt: Promise<PromptResponse> | undefined;
        let interrupted = false;
        let terminalPromptEnded = false;
        // Generation of the session instance this turn's telemetry belongs to.
        let displayGeneration = 0;
        let rejectWait: (error: Error) => void = () => {};
        const interruption = new Promise<never>((_, reject) => {
          rejectWait = reject;
        });
        // The handler is attached immediately, including pre-aborted/setup failures.
        void interruption.catch(() => {});
        const interrupt = (error: Error) => {
          interrupted = true;
          rejectWait(error);
        };
        const onAbort = () => {
          if (state) {
            state.permissionAbort?.abort();
            failParked(state, 'Pi tool call aborted.');
          }
          try {
            if (state?.sessionId)
              state.connection?.cancelSession(state.sessionId);
          } finally {
            interrupt(aborted());
          }
        };
        const arm = (ms: number, phase: string) => {
          clearTimeout(timer);
          timer = setTimeout(
            () =>
              interrupt(new Error(`Junie ${phase} timed out after ${ms}ms`)),
            ms,
          );
        };
        const wait = <T>(operation: Promise<T>) =>
          Promise.race([operation, interruption]);
        try {
          if (options?.signal?.aborted) throw aborted();
          const startup = bound(
            deps.startupTimeoutMs,
            deps.env?.JUNIE_BRIDGE_STARTUP_TIMEOUT_MS ??
              process.env.JUNIE_BRIDGE_STARTUP_TIMEOUT_MS,
            30000,
          );
          const inactivity = bound(
            deps.inactivityTimeoutMs,
            deps.env?.JUNIE_BRIDGE_INACTIVITY_TIMEOUT_MS ??
              process.env.JUNIE_BRIDGE_INACTIVITY_TIMEOUT_MS,
            120000,
          );
          // Current Pi supplies cwd through session_start; also accept it directly
          // from hosts that attach per-call context. Never use a provider-wide cwd
          // for an identified session whose lifecycle metadata is missing.
          const metadata = options?.sessionId
            ? deps.getSession?.(options.sessionId)
            : undefined;
          const headless = metadata?.headless === true;
          const knownCwd =
            metadata?.cwd ||
            options?.cwd ||
            context.cwd ||
            (!options?.sessionId ? deps.cwd : undefined);
          const persist = Boolean(options?.sessionId && knownCwd);
          if (options?.sessionId && !knownCwd)
            (deps.warn ?? console.warn)(
              `Junie session ${options.sessionId}: missing cwd metadata; using process cwd for session-local ephemeral state.`,
            );
          const pi = {
            id: options?.sessionId ?? `ephemeral-${randomUUID()}`,
            cwd: knownCwd || process.cwd(),
          };
          key = pi.id;
          const candidate = sessions.get(key);
          const existing = candidate?.disposed ? undefined : candidate;
          if (existing?.active)
            throw new Error(
              'A Junie turn is already active for this Pi session.',
            );
          const digests = historyDigests(context.messages);
          // Pi addresses a model by its short id; Junie only accepts the exact
          // ACP value. Resolve once per turn and use the wire value from here.
          const catalog = readCatalog(deps.agentDir),
            wireModel = toAcpModelValue(model.id, catalog);
          state = existing ?? {
            openings: new Set(),
            prompted: false,
            cost: 0,
            observedCost: 0,
            disposed: false,
            active: false,
            displayGeneration: 0,
            recording: persist ? (store.load(key) ?? undefined) : undefined,
          };
          state.piSessionId = options?.sessionId;
          state.permissionAbort ??= new AbortController();
          sessions.set(key, state);
          state.active = true;
          state.interrupt = interrupt;
          // Any line still pending from an earlier turn is stale from here on.
          state.displayGeneration++;
          state.turn?.removeAbort?.();
          state.tools = getCurrentTools(context.messages);
          // Abort must keep precedence over a pending display-only line.
          options?.signal?.addEventListener('abort', onAbort, { once: true });
          if (options?.signal?.aborted) onAbort();
          arm(startup, 'startup');
          const startupDeadline = Date.now() + startup;
          if (
            state.recording &&
            (!matches(state.recording, digests, pi.cwd, wireModel, catalog) ||
              context.messages
                .slice(state.recording.digests.length)
                .some(isCompaction))
          ) {
            if (state.turn)
              throw new Error(
                'Pi history diverged during a parked Junie tool call.',
              );
            // Re-seed instead of forking: ACP fork copies the stale tail too.
            if (persist) store.delete(key);
            state.recording = undefined;
            state.sessionId = undefined;
            state.prompted = false;
            state.cost = 0;
            state.observedCost = 0;
          }
          if (!state.mcp) {
            const owned = state;
            const opening = startMcpServer({
              getTools: () => owned.tools ?? [],
              onCall: (name, args) => {
                const turn = owned.turn;
                if (!turn || owned.disposed)
                  return Promise.resolve({
                    content: [{ type: 'text', text: 'No active Junie turn.' }],
                    isError: true,
                  });
                return new Promise<McpResult>((resolve) => {
                  turn.queue.push({
                    id: `junie-${randomUUID()}`,
                    name,
                    args,
                    resolve,
                  });
                  turn.wake?.();
                });
              },
            }).then(async (server) => {
              if (owned.disposed) {
                await server.close();
                throw new Error('Junie session closed during MCP startup.');
              }
              owned.mcp = server;
            });
            openings.add(opening);
            owned.openings.add(opening);
            void opening
              .finally(() => {
                openings.delete(opening);
                owned.openings.delete(opening);
              })
              .catch(() => {});
            await wait(opening);
          }
          if (!state.connection)
            await wait(connect(state, pi.cwd, startup, headless));
          if (!state.sessionId) {
            let connection = state.connection!;
            const mcpServers = [
              {
                type: 'http',
                name: 'pi',
                url: state.mcp!.url,
                headers: [{ name: TOKEN_HEADER, value: state.mcp!.token }],
              },
              ...(deps.getMcpServers?.() ?? []),
            ];
            const saved = state.recording;
            if (saved && matches(saved, digests, pi.cwd, wireModel, catalog)) {
              let resumeTimer: ReturnType<typeof setTimeout> | undefined;
              try {
                // Observe cumulative usage replayed before the restore response too.
                state.sessionId = saved.sessionId;
                // Reserve half the remaining startup budget for a fresh-session fallback.
                const restored = await wait(
                  Promise.race([
                    restoreSession(connection, saved, mcpServers),
                    new Promise<never>((_, reject) => {
                      resumeTimer = setTimeout(
                        () => reject(new Error('Junie resume timed out')),
                        Math.max(1, (startupDeadline - Date.now()) / 2),
                      );
                    }),
                  ]),
                );
                state.sessionId = restored.sessionId;
                state.recording = { ...saved, resumedWith: restored.method };
                state.prompted = true;
                state.cost = saved.cost;
                state.observedCost = Math.max(state.observedCost, saved.cost);
              } catch (error) {
                if (interrupted) throw error;
                state.recording = undefined;
                state.sessionId = undefined;
                state.cost = 0;
                state.observedCost = 0;
                // Resume may have killed the transport or still be replaying updates.
                // A replacement connection keeps the fresh session isolated from both.
                if (persist) store.delete(key);
                await wait(connection.close());
                connection = await wait(
                  connect(
                    state,
                    pi.cwd,
                    Math.max(1, startupDeadline - Date.now()),
                    headless,
                  ),
                );
              } finally {
                clearTimeout(resumeTimer);
              }
            }
            if (!state.sessionId) {
              const session = await wait(
                connection.newSession(pi.cwd, mcpServers),
              );
              if (!session.sessionId)
                throw new Error('Junie session/new returned no sessionId.');
              state.sessionId = session.sessionId;
            }
            await wait(
              connection.setConfigOption(state.sessionId, 'brave_mode', 'off'),
            );
          }
          const connection = state.connection!,
            sessionId = state.sessionId!;
          if (!state.turn) {
            await wait(
              connection.setConfigOption(sessionId, 'model', wireModel),
            );
            await wait(
              connection.setConfigOption(
                sessionId,
                'effort',
                toJunieEffort(options?.reasoning),
              ),
            );
          }
          stream.push({ type: 'start', partial: message });
          const baseCost = state.cost;
          message.usage.cost.total = Math.max(0, state.observedCost - baseCost);
          const owned = state;
          state.onUpdate = (params) => {
            if (
              interrupted ||
              params?.sessionId !== sessionId ||
              !params.update
            )
              return;
            arm(inactivity, 'inactivity');
            const event = params.update;
            if (
              (event.sessionUpdate === 'agent_message_chunk' ||
                event.sessionUpdate === 'agent_thought_chunk') &&
              !Array.isArray(event.content) &&
              event.content?.type === 'text' &&
              typeof event.content.text === 'string'
            )
              blocks.append(
                event.sessionUpdate === 'agent_thought_chunk'
                  ? 'thinking'
                  : 'text',
                event.content.text,
              );
            if (event.sessionUpdate === 'usage_update') {
              // Context occupancy is not billed input; prompt response owns token usage.
              const turn = owned.turn;
              if (
                turn &&
                typeof event.used === 'number' &&
                Number.isFinite(event.used) &&
                event.used >= 0
              )
                turn.contextTokens = event.used;
              if (
                typeof event.size === 'number' &&
                Number.isFinite(event.size) &&
                event.size > 0
              ) {
                model.contextWindow = event.size;
                try {
                  const catalog = recordContextWindow(
                    wireModel,
                    event.size,
                    deps.agentDir,
                  );
                  if (catalog) deps.onCatalogUpdate?.(catalog);
                } catch (error) {
                  (deps.warn ?? console.warn)(
                    `Junie context capacity cache unavailable: ${String(error)}`,
                  );
                }
              }
              message.usage.cost.total = Math.max(
                0,
                owned.observedCost - baseCost,
              );
            }
            // AC-4/5 seams: no executable Pi tool calls for native activity.
            if (
              event.sessionUpdate === 'tool_call' ||
              event.sessionUpdate === 'tool_call_update'
            ) {
              const own =
                event._meta?.is_mcp_tool_call === true &&
                event.title?.startsWith('pi/');
              if (own && event.toolCallId) {
                owned.hiddenTools ??= new Set();
                owned.hiddenTools.add(event.toolCallId);
              }
              const hidden =
                own ||
                (event.toolCallId && owned.hiddenTools?.has(event.toolCallId));
              if (!hidden) {
                owned.nativeActivity ??= new NativeActivityFolder(
                  (activity) => {
                    try {
                      deps.onNativeEvent?.(activity, owned.piSessionId);
                    } catch {
                      /* Display sinks cannot fail inference. */
                    }
                  },
                );
                owned.nativeActivity.add({
                  ...event,
                  content: Array.isArray(event.content)
                    ? event.content
                    : undefined,
                });
              }
            }
          };
          for (const update of state.backlog ?? []) state.onUpdate(update);
          state.backlog = [];
          arm(inactivity, 'inactivity');
          // A crash after dispatch leaves an unknown remote tail: never persist a park.
          if (persist) store.delete(key);
          if (!state.turn) {
            const content = projectPrompt(context, {
              prompted: state.prompted,
              recording: state.recording,
              headless,
            });
            prompt = connection.request('session/prompt', {
              sessionId,
              prompt: content,
            });
            state.turn = { prompt, queue: [] };
            void prompt.catch(() => {});
          } else {
            prompt = state.turn.prompt;
            const issued = state.turn.issued;
            const result = context.messages
              .slice(state.recording?.digests.length ?? 0)
              .find(
                (entry) =>
                  entry.role === 'toolResult' &&
                  entry.toolCallId === issued?.id,
              );
            if (
              !issued ||
              result?.role !== 'toolResult' ||
              result.toolName !== issued.name
            )
              throw new Error(
                'Missing Pi result for the parked Junie tool call.',
              );
            state.turn.issued = undefined;
            issued.resolve({
              content: result.content.map((block) =>
                block.type === 'image'
                  ? {
                      type: 'image' as const,
                      data: block.data,
                      mimeType: block.mimeType,
                    }
                  : { type: 'text' as const, text: block.text },
              ),
              isError: result.isError,
            });
          }
          const turn = state.turn;
          const nextCall = new Promise<'tool'>((resolve) => {
            turn.wake = () => resolve('tool');
            if (turn.queue.length) resolve('tool');
          });
          const result = await wait(Promise.race([prompt!, nextCall]));
          // Do not report success or hand Pi a tool while a safety correction is pending.
          if (state.resettingBrave) await wait(state.resettingBrave);
          turn.wake = undefined;
          message.usage.cost.total = Math.max(0, state.observedCost - baseCost);
          state.cost = Math.max(baseCost, state.observedCost);
          if (result === 'tool') {
            const call = turn.queue.shift()!;
            turn.issued = call;
            blocks.close();
            const index = message.content.length;
            const toolCall = {
              type: 'toolCall' as const,
              id: call.id,
              name: call.name,
              arguments: call.args as ToolCall['arguments'],
            };
            message.content.push(toolCall);
            stream.push({
              type: 'toolcall_start',
              contentIndex: index,
              partial: message,
            });
            stream.push({
              type: 'toolcall_end',
              contentIndex: index,
              toolCall,
              partial: message,
            });
            message.stopReason = 'toolUse';
            state.prompted = true;
            state.recording = {
              sessionId,
              cwd: pi.cwd,
              model: wireModel,
              digests: historyDigests([...context.messages, message]),
              cost: state.cost,
            };
            // The originating abort signal remains meaningful while Pi executes the tool.
            const parkedAbort = () => {
              failParked(owned, 'Pi tool call aborted.');
              owned.disposed = true;
              if (sessions.get(pi.id) === owned) sessions.delete(pi.id);
              connection.cancelSession(sessionId);
              const cleanup = (async () => {
                // Cancel may acknowledge before the HTTP response reaches Junie.
                // Keep both transports alive for a bounded delivery grace period.
                await new Promise<void>((resolve) => setTimeout(resolve, 250));
                await dispose(owned);
                if (sessions.get(pi.id) === owned) sessions.delete(pi.id);
              })();
              cleanups.add(cleanup);
              void cleanup
                .finally(() => cleanups.delete(cleanup))
                .catch(() => {});
            };
            options?.signal?.addEventListener('abort', parkedAbort, {
              once: true,
            });
            turn.removeAbort = () =>
              options?.signal?.removeEventListener('abort', parkedAbort);
            return;
          }
          terminalPromptEnded = true;
          // Bind this turn's telemetry to its own session instance: capture the
          // generation at terminal time, before any terminal disposal or close.
          displayGeneration = state.displayGeneration;
          // Only the terminal segment owns prompt-wide tokens. Parked segments
          // have zero tokens, avoiding double billing across Pi tool round trips.
          const tokens = (value: number | undefined) =>
            typeof value === 'number' && Number.isFinite(value) && value >= 0
              ? value
              : 0;
          message.usage.input = tokens(result.usage?.inputTokens);
          message.usage.output = tokens(result.usage?.outputTokens);
          message.usage.cacheRead = tokens(result.usage?.cachedReadTokens);
          message.usage.cacheWrite = tokens(result.usage?.cachedWriteTokens);
          message.usage.totalTokens =
            turn.contextTokens ?? tokens(result.usage?.totalTokens);
          turn.removeAbort?.();
          state.turn = undefined;
          state.hiddenTools = undefined;
          state.nativeActivity?.flush();
          state.nativeActivity = undefined;
          state.prompted = true;
          const reason = result?.stopReason;
          message.stopReason =
            reason === 'end_turn'
              ? 'stop'
              : reason === 'max_tokens'
                ? 'length'
                : reason === 'cancelled'
                  ? 'aborted'
                  : 'error';
          if (message.stopReason === 'error')
            message.errorMessage = `Junie stopped: ${reason ?? 'missing stop reason'}`;
          if (
            message.stopReason === 'stop' ||
            message.stopReason === 'length'
          ) {
            state.recording = {
              sessionId,
              cwd: pi.cwd,
              model: wireModel,
              digests: historyDigests([...context.messages, message]),
              cost: state.cost,
              ...(state.recording?.resumedWith
                ? { resumedWith: state.recording.resumedWith }
                : {}),
            };
            if (persist) store.save(key, state.recording);
          }
          if (
            message.stopReason === 'aborted' ||
            message.stopReason === 'error'
          )
            await dispose(state);
        } catch (error) {
          message.stopReason =
            error instanceof Error && error.name === 'AbortError'
              ? 'aborted'
              : 'error';
          message.errorMessage =
            error instanceof Error ? error.message : String(error);
          if (state) {
            state.onUpdate = undefined;
            // Let a cooperative ACP cancel reach the agent before terminating it;
            // a non-cooperative agent is still bounded and never reused.
            if (message.stopReason === 'aborted' && prompt) {
              let grace: ReturnType<typeof setTimeout> | undefined;
              await Promise.race([
                prompt.catch(() => {}),
                new Promise<void>((resolve) => {
                  grace = setTimeout(resolve, 250);
                }),
              ]);
              clearTimeout(grace);
            }
            await dispose(state).catch(() => {});
            if (key && sessions.get(key) === state) sessions.delete(key);
          }
        } finally {
          clearTimeout(timer);
          options?.signal?.removeEventListener('abort', onAbort);
          if (state) {
            if (!options?.sessionId) await dispose(state).catch(() => {});
            state.onUpdate = undefined;
            state.active = false;
            state.interrupt = undefined;
            if (state.disposed && key && sessions.get(key) === state)
              sessions.delete(key);
          }
          blocks.close();
          if (
            message.stopReason === 'error' ||
            message.stopReason === 'aborted'
          )
            stream.push({
              type: 'error',
              reason: message.stopReason,
              error: message,
            });
          else
            stream.push({
              type: 'done',
              reason:
                message.stopReason === 'toolUse'
                  ? 'toolUse'
                  : message.stopReason === 'length'
                    ? 'length'
                    : 'stop',
              message,
            });
          stream.end();
          // The display-only line starts AFTER the terminal stream event and
          // only reads local Junie settings; nothing ever awaits it, so it can
          // never delay a turn, an abort or shutdown. It emits only while its
          // own session instance is alive and its generation is unchanged.
          // A turn that already disposed its session (cancel, refusal) schedules
          // nothing: its telemetry belongs to a session instance that is gone.
          if (terminalPromptEnded && state?.sessionId && !state.disposed) {
            const owned = state;
            const sessionId = state.sessionId;
            // Single source of truth: the cost this turn's message attributes.
            const cost = message.usage.cost.total;
            const piModel = model.id;
            void readJunieModel({
              sessionId,
              home: deps.env?.JUNIE_HOME,
              debug: deps.debug,
            })
              .then((junie) => {
                // A late read never emits after close/disposal or after a newer
                // turn bumped the generation, which would misorder display lines.
                if (
                  !junie ||
                  owned.disposed ||
                  owned.displayGeneration !== displayGeneration
                )
                  return;
                const usageLine = junieUsageLine({ piModel, junie, cost });
                try {
                  deps.onNativeEvent?.({ usageLine }, owned.piSessionId);
                } catch {
                  /* Display sinks cannot fail inference. */
                }
              })
              .catch((error) => {
                deps.debug?.(`Junie display line skipped: ${String(error)}`);
              });
          }
        }
      })();
      return stream;
    },
  };
}
