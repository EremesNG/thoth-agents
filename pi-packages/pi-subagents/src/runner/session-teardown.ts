type ChildSession = {
  extensionRunner?: {
    createContext?: () => any;
    hasHandlers?: (event: 'session_shutdown') => boolean;
    emit: (event: {
      type: 'session_shutdown';
      reason: 'quit';
    }) => Promise<unknown>;
  };
  dispose?: () => void | Promise<void>;
};

export type ChildShutdownHandler = (
  event: { type: 'session_shutdown'; reason: 'quit' },
  context: any,
) => unknown | Promise<unknown>;

const SHUTDOWN_TIMEOUT_MS = 5_000;
const BACKGROUND_SHUTDOWN_TIMEOUT_MS = 10_000;
const teardowns = new WeakMap<ChildSession, Promise<void>>();
const backgroundShutdownHandlers = new WeakMap<
  ChildSession,
  readonly ChildShutdownHandler[]
>();

/** Handlers removed from ordinary emission during lean extension isolation. */
export function registerChildBackgroundShutdown(
  session: ChildSession,
  handlers: readonly ChildShutdownHandler[],
): void {
  backgroundShutdownHandlers.set(session, [...handlers]);
}

async function boundedCleanup(
  cleanup: () => unknown | Promise<unknown>,
  timeoutMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(cleanup),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    // Cleanup failure must not replace the child's result or original failure.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Independent background cleanup, then best-effort generic shutdown, once per child. */
export function teardownSubagentSession(
  session: ChildSession | undefined,
): Promise<void> {
  if (!session) return Promise.resolve();
  const existing = teardowns.get(session);
  if (existing) return existing;
  const teardown = Promise.resolve().then(async () => {
    try {
      const runner = session.extensionRunner;
      const event = { type: 'session_shutdown', reason: 'quit' } as const;
      const handlers = backgroundShutdownHandlers.get(session) ?? [];
      backgroundShutdownHandlers.delete(session);
      for (const handler of handlers) {
        await boundedCleanup(
          () => handler(event, runner?.createContext?.()),
          BACKGROUND_SHUTDOWN_TIMEOUT_MS,
        );
      }
      if (runner?.hasHandlers?.('session_shutdown')) {
        await boundedCleanup(() => runner.emit(event), SHUTDOWN_TIMEOUT_MS);
      }
    } catch {
      // Preserve the original result even if the runner itself is unavailable.
    } finally {
      await session.dispose?.();
    }
  });
  teardowns.set(session, teardown);
  return teardown;
}
