import { AcpConnection, type AcpOptions } from './acp/connection.js';

export interface QuotaOptions
  extends Omit<AcpOptions, 'onUpdate' | 'onNotification' | 'onPermission'> {
  timeoutMs?: number;
  commandsTimeoutMs?: number;
}
const unavailable = (error: unknown) =>
  `Junie quota unavailable: ${error instanceof Error ? error.message : String(error)}\nJetBrains Account → JetBrains AI settings (https://account.jetbrains.com)`;

function renderStats(text: string): string {
  const license = /^- License: ([^\r\n]+?)\s*$/m.exec(text)?.[1];
  const balance = /^- Balance left: (\d+(?:\.\d+)? [^\s\d][^\r\n]*?)\s*$/m.exec(
    text,
  )?.[1];
  const url = /^- Top-up: (https:\/\/[^\s]+)\s*$/m.exec(text)?.[1];
  if (!license || !balance || !url)
    throw new Error('Could not parse Junie license and balance');
  return `Junie (${license})\nBalance left: ${balance}\nTop-up: ${url}`;
}

/** Isolated from the provider's session mapping; the only permitted prompt is /stats. */
export async function fetchJunieQuota(
  options: QuotaOptions = {},
): Promise<string> {
  const timeout = options.timeoutMs ?? 10000;
  let connection: AcpConnection | undefined, sessionId: string | undefined;
  let text = '',
    advertised = false,
    failure: Error | undefined;
  let announce: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let commandTimer: ReturnType<typeof setTimeout> | undefined;
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectUnsafe: (error: Error) => void = () => {};
  const unsafe = new Promise<never>((_, reject) => {
    rejectUnsafe = reject;
  });
  // Attach a handler before connecting: updates can arrive with session/new's reply.
  void unsafe.catch(() => {});
  const fail = (reason: string) => {
    failure ??= new Error(reason);
    rejectUnsafe(failure);
  };
  const check = () => {
    if (failure) throw failure;
  };
  try {
    connection = await AcpConnection.connect({
      ...options,
      startupTimeoutMs: Math.min(options.startupTimeoutMs ?? timeout, timeout),
      requestTimeoutMs: Math.min(options.requestTimeoutMs ?? timeout, timeout),
      onPermission: async () => {
        fail('Unexpected tool permission activity');
        return { outcome: { outcome: 'cancelled' } };
      },
      onUpdate: (params) => {
        const event = params as {
          sessionId?: string;
          update?: Record<string, any>;
        };
        if (sessionId && event.sessionId !== sessionId) return;
        const update = event.update;
        if (!update) return;
        const kind = String(update.sessionUpdate);
        if (kind.includes('thought') || kind.startsWith('tool_call'))
          fail(`Unexpected ${kind} activity`);
        if (
          kind === 'usage_update' &&
          update.cost &&
          (!Number.isFinite(update.cost.amount) || update.cost.amount > 0)
        )
          fail('Unexpected usage cost increase');
        if (kind === 'available_commands_update') {
          advertised =
            Array.isArray(update.availableCommands) &&
            update.availableCommands.some(
              (command: { name?: string }) => command.name === 'stats',
            );
          if (advertised) announce?.();
        }
        if (
          kind === 'config_option_update' &&
          update.configOptions?.some(
            (option: { id?: string; currentValue?: string }) =>
              option.id === 'brave_mode' && option.currentValue !== 'off',
          )
        )
          fail('Junie brave_mode is not off');
        if (kind === 'agent_message_chunk' && update.content?.type === 'text') {
          text += update.content.text;
          if (text.length > 100000) fail('Oversized stats response');
        }
      },
    });
    const owned = connection;
    const operation = (async () => {
      sessionId = (await owned.newSession(options.cwd ?? process.cwd(), []))
        .sessionId;
      check();
      await owned.setConfigOption(sessionId, 'brave_mode', 'off');
      check();
      if (!advertised)
        await new Promise<void>((resolve, reject) => {
          announce = resolve;
          commandTimer = setTimeout(
            () => reject(new Error('Junie stats command not advertised')),
            options.commandsTimeoutMs ?? 1000,
          );
        });
      check();
      const result = await owned.request<{ stopReason: string }>(
        'session/prompt',
        { sessionId, prompt: [{ type: 'text', text: '/stats' }] },
      );
      check();
      if (result.stopReason !== 'end_turn')
        throw new Error(`Stats ended with ${result.stopReason}`);
      return renderStats(text);
    })();
    return await Promise.race([
      operation,
      unsafe,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          failure = new Error('Junie quota timed out');
          reject(failure);
        }, timeout);
      }),
    ]);
  } catch (error) {
    return unavailable(error);
  } finally {
    clearTimeout(timer);
    clearTimeout(commandTimer);
    try {
      if (connection && sessionId)
        await Promise.race([
          connection.closeSession(sessionId).catch(() => {}),
          new Promise<void>((resolve) => {
            cleanupTimer = setTimeout(resolve, 250);
          }),
        ]);
    } finally {
      clearTimeout(cleanupTimer);
      await connection?.close();
    }
  }
}
