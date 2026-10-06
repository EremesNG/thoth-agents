/** Race host dialogs that may ignore signals (notably custom UI in some modes). */
export async function waitForUI<T>(
  open: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  if (!signal) return open();
  let abort: () => void = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () =>
      reject(new DOMException('Questionnaire aborted.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    // Attach both rejection handlers before opening a host dialog that may throw synchronously.
    const value = await Promise.race([
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        return open();
      }),
      interrupted,
    ]);
    signal.throwIfAborted();
    return value;
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
