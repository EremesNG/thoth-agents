import { expect, it, vi } from 'vitest';
import { promptWithInactivity } from '../../src/runner/event-processing.js';

it('suspends inactivity for pending questions and resumes it after the last answer', async () => {
  vi.useFakeTimers();
  let event: (event: any) => void = () => {};
  let pendingChanged: (pending: boolean) => void = () => {};
  let finishPrompt: () => void = () => {};
  const unsubscribe = vi.fn();
  const unsubscribePending = vi.fn();
  const session = {
    messages: [],
    subscribe: (listener: typeof event) => {
      event = listener;
      return unsubscribe;
    },
    prompt: async () => {
      event({
        type: 'tool_execution_start',
        toolCallId: 'question-1',
        toolName: 'ask_orchestrator',
        args: { kind: 'question', message: 'scope?' },
      });
      event({
        type: 'tool_execution_start',
        toolCallId: 'read-1',
        toolName: 'read',
        args: { path: 'README.md' },
      });
      pendingChanged(true);
      await new Promise<void>((resolve) => {
        finishPrompt = resolve;
      });
    },
    abort: vi.fn(async () => finishPrompt()),
    dispose: vi.fn(),
  };
  const promise = promptWithInactivity(
    session,
    'work',
    1000,
    new AbortController().signal,
    undefined,
    undefined,
    undefined,
    undefined,
    'subtask_waiting',
    'delegated_task',
    'work',
    1,
    undefined,
    undefined,
    (listener) => {
      pendingChanged = listener;
      listener(false);
      return unsubscribePending;
    },
  );
  const outcome = promise.catch((error) => error);
  try {
    await vi.advanceTimersByTimeAsync(10000);
    expect(session.abort).not.toHaveBeenCalled();
    // Another question remains outstanding: answering one does not resume the timer.
    pendingChanged(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(session.abort).not.toHaveBeenCalled();
    pendingChanged(false);
    await vi.advanceTimersByTimeAsync(999);
    expect(session.abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(501);
    expect(session.abort).toHaveBeenCalledOnce();
    expect((await outcome).error_metadata.category).toBe('stall_timeout');
    expect(unsubscribePending).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  } finally {
    finishPrompt();
    await outcome;
    vi.useRealTimers();
  }
});
