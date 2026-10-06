import { expect, it, vi } from 'vitest';
import { promptWithInactivity } from '../../src/runner/event-processing.js';
import type { SubagentOrchestratorChannel } from '../../src/types.js';

function inactivitySession(
  stallSuspendMaxMs?: number,
  onQuestionPendingChange?: SubagentOrchestratorChannel['onPendingChange'],
) {
  let event: (event: any) => void = () => {};
  let finish: () => void = () => {};
  const session = {
    messages: [
      { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
    ],
    subscribe: (listener: typeof event) => {
      event = listener;
      return () => {};
    },
    prompt: async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
    abort: vi.fn(async () => finish()),
    dispose: vi.fn(),
  };
  const activities: any[] = [];
  const outcome = promptWithInactivity(
    session,
    'work',
    1000,
    new AbortController().signal,
    (activity) => activities.push(activity),
    undefined,
    undefined,
    undefined,
    undefined,
    'delegated_task',
    'work',
    1,
    undefined,
    undefined,
    onQuestionPendingChange,
    stallSuspendMaxMs,
  ).catch((error) => error);
  return {
    session,
    activities,
    outcome,
    event: (value: any) => event(value),
    finish: () => finish(),
  };
}

it('allows silent compaction longer than ordinary inactivity', async () => {
  vi.useFakeTimers();
  const run = inactivitySession();
  try {
    run.event({ type: 'compaction_start', reason: 'threshold' });
    await vi.advanceTimersByTimeAsync(3500);
    expect(run.session.abort).not.toHaveBeenCalled();
    run.event({ type: 'compaction_end', aborted: false });
    run.finish();
    expect((await run.outcome).result).toBe('done');
  } finally {
    run.finish();
    await run.outcome;
    vi.useRealTimers();
  }
});

it.each([
  { aborted: false },
  { aborted: false, errorMessage: 'summary failed' },
  { aborted: true },
])('refreshes active-tool inactivity on compaction end (%j)', async (end) => {
  vi.useFakeTimers();
  const run = inactivitySession(6000);
  try {
    run.event({
      type: 'tool_execution_start',
      toolCallId: 'read-1',
      toolName: 'read',
    });
    run.event({ type: 'compaction_start', reason: 'threshold' });
    await vi.advanceTimersByTimeAsync(3500);
    expect(run.session.abort).not.toHaveBeenCalled();
    run.event({ type: 'compaction_end', ...end });
    await vi.advanceTimersByTimeAsync(1000);
    expect(run.session.abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(run.session.abort).toHaveBeenCalledOnce();
    expect((await run.outcome).error_metadata.details).toMatchObject({
      stall_timeout_ms: '1000',
      ms_since_last_session_event: '1500',
      last_session_event_type: 'compaction_end',
      active_tools: 'read (1500ms since update)',
    });
    expect((await run.outcome).error_metadata.message).not.toContain(
      'stalled during',
    );
  } finally {
    run.finish();
    await run.outcome;
    vi.useRealTimers();
  }
});

it('bounds compaction suspension despite duplicate starts and interleaved retry events', async () => {
  vi.useFakeTimers();
  const run = inactivitySession(6000);
  run.session.abort.mockImplementation(async () => {
    run.event({ type: 'compaction_end', aborted: true });
    run.finish();
  });
  try {
    run.event({ type: 'compaction_start', reason: 'overflow' });
    await vi.advanceTimersByTimeAsync(3500);
    expect(run.session.abort).not.toHaveBeenCalled();
    run.event({ type: 'compaction_start', reason: 'overflow' });
    run.event({ type: 'auto_retry_start', attempt: 1, delayMs: 2500 });
    run.event({ type: 'message_update' });
    await vi.advanceTimersByTimeAsync(2500);
    expect(run.session.abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(run.session.abort).toHaveBeenCalledOnce();
    expect((await run.outcome).error_metadata).toMatchObject({
      category: 'stall_timeout',
      message: expect.stringContaining('stalled during compaction'),
      details: {
        stall_timeout_ms: '1000',
        stall_suspend_max_ms: '6000',
        stall_suspend_reason: 'compaction',
        ms_since_stall_suspend_start: '6500',
        last_session_event_type: 'message_update',
      },
    });
    expect(run.activities).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('stalled during compaction'),
      }),
    );
  } finally {
    run.finish();
    await run.outcome;
    vi.useRealTimers();
  }
});

it.each([
  { nextEvent: { type: 'agent_start' }, activeTool: false },
  { nextEvent: { type: 'agent_start' }, activeTool: true },
  { nextEvent: { type: 'message_update' }, activeTool: true },
  {
    nextEvent: {
      type: 'auto_retry_end',
      success: false,
      finalError: 'Retry cancelled',
    },
    activeTool: true,
  },
])('suspends retry backoff until the next session event (%j)', async ({
  nextEvent,
  activeTool,
}) => {
  vi.useFakeTimers();
  const run = inactivitySession(6000);
  try {
    if (activeTool)
      run.event({
        type: 'tool_execution_start',
        toolCallId: 'read-1',
        toolName: 'read',
      });
    run.event({ type: 'auto_retry_start', attempt: 1, delayMs: 3500 });
    await vi.advanceTimersByTimeAsync(3500);
    expect(run.session.abort).not.toHaveBeenCalled();
    run.event(nextEvent);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run.session.abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(run.session.abort).toHaveBeenCalledOnce();
    expect((await run.outcome).error_metadata.details).toMatchObject({
      stall_timeout_ms: '1000',
      last_session_event_type: nextEvent.type,
      ms_since_last_session_event: '1500',
      active_tools: activeTool ? 'read (1500ms since update)' : 'none',
    });
    expect((await run.outcome).error_metadata.message).not.toContain(
      'stalled during',
    );
  } finally {
    run.finish();
    await run.outcome;
    vi.useRealTimers();
  }
});

it.each([
  'compaction_start',
  'auto_retry_start',
])('uses a fifteen-minute safety ceiling by default (%s)', async (type) => {
  vi.useFakeTimers();
  const run = inactivitySession();
  try {
    run.event({ type });
    await vi.advanceTimersByTimeAsync(900000);
    expect(run.session.abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(run.session.abort).toHaveBeenCalledOnce();
    expect((await run.outcome).error_metadata.details).toMatchObject({
      stall_suspend_max_ms: '900000',
      ms_since_stall_suspend_start: '900500',
    });
  } finally {
    run.finish();
    await run.outcome;
    vi.useRealTimers();
  }
});

it.each([
  'compaction_start',
  'auto_retry_start',
])('enforces a maintenance ceiling shorter than ordinary inactivity (%s)', async (type) => {
  vi.useFakeTimers();
  const run = inactivitySession(500);
  try {
    run.event({ type });
    await vi.advanceTimersByTimeAsync(500);
    expect(run.session.abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(run.session.abort).toHaveBeenCalledOnce();
    expect((await run.outcome).error_metadata.details).toMatchObject({
      stall_timeout_ms: '1000',
      stall_suspend_max_ms: '500',
      ms_since_stall_suspend_start: '1000',
    });
  } finally {
    run.finish();
    await run.outcome;
    vi.useRealTimers();
  }
});

it.each([
  'compaction_start',
  'auto_retry_start',
])('does not let pending questions bypass the maintenance ceiling (%s)', async (type) => {
  vi.useFakeTimers();
  const run = inactivitySession(6000, (listener) => {
    listener(true, 1);
    return () => {};
  });
  try {
    run.event({ type });
    await vi.advanceTimersByTimeAsync(6000);
    expect(run.session.abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(run.session.abort).toHaveBeenCalledOnce();
    expect((await run.outcome).error_metadata.details).toMatchObject({
      stall_suspend_max_ms: '6000',
      outstanding_orchestrator_questions: '1',
    });
  } finally {
    run.finish();
    await run.outcome;
    vi.useRealTimers();
  }
});

it('distinguishes session-event age from tool-update age and resets settlement on the next start', async () => {
  vi.useFakeTimers();
  let event: (event: any) => void = () => {};
  let finishPrompt: () => void = () => {};
  const session = {
    messages: [],
    subscribe: (listener: typeof event) => {
      event = listener;
      return () => {};
    },
    prompt: async () => {
      event({ type: 'agent_start' });
      event({
        type: 'tool_execution_start',
        toolCallId: 'read-1',
        toolName: 'read',
      });
      event({ type: 'agent_settled' });
      await new Promise<void>((resolve) => {
        finishPrompt = resolve;
      });
    },
    abort: async () => finishPrompt(),
    dispose: () => {},
  };
  const outcome = promptWithInactivity(
    session,
    'work',
    200,
    new AbortController().signal,
  ).catch((error) => error);
  try {
    await vi.advanceTimersByTimeAsync(100);
    event({ type: 'agent_start' });
    await vi.advanceTimersByTimeAsync(100);
    event({
      type: 'tool_execution_update',
      toolCallId: 'read-1',
      toolName: 'read',
    });
    await vi.advanceTimersByTimeAsync(100);
    event({ type: 'message_update' });
    await vi.advanceTimersByTimeAsync(200);
    expect((await outcome).error_metadata.details).toMatchObject({
      last_session_event_type: 'message_update',
      ms_since_last_session_event: '200',
      active_tools: 'read (300ms since update)',
      settled_after_last_start: 'false',
    });
  } finally {
    finishPrompt();
    await outcome;
    vi.useRealTimers();
  }
});

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
