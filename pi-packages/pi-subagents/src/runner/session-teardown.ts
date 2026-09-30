type ChildSession = {
  extensionRunner?: {
    hasHandlers?: (event: 'session_shutdown') => boolean;
    emit: (event: {
      type: 'session_shutdown';
      reason: 'quit';
    }) => Promise<unknown>;
  };
  dispose?: () => void | Promise<void>;
};

const SHUTDOWN_TIMEOUT_MS = 5_000;
const teardowns = new WeakMap<ChildSession, Promise<void>>();

/** Best-effort extension cleanup, once per child, before unconditional disposal. */
export function teardownSubagentSession(
  session: ChildSession | undefined,
): Promise<void> {
  if (!session) return Promise.resolve();
  const existing = teardowns.get(session);
  if (existing) return existing;
  const teardown = Promise.resolve().then(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const runner = session.extensionRunner;
      if (runner?.hasHandlers?.('session_shutdown')) {
        await Promise.race([
          runner.emit({ type: 'session_shutdown', reason: 'quit' }),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, SHUTDOWN_TIMEOUT_MS);
          }),
        ]);
      }
    } catch {
      // Cleanup failure must not replace the child's result or original failure.
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      await session.dispose?.();
    }
  });
  teardowns.set(session, teardown);
  return teardown;
}
