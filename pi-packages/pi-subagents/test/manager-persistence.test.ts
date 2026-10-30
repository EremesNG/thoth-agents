import { describe, expect, it, vi } from 'vitest';
import { promptWithInactivity } from '../src/runner/event-processing.js';
import type { SubagentActivity } from '../src/types.js';
import { installSubagentTestEnv } from './helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();

async function startEventRun() {
  env.writeAgent('worker');
  let emit: (event: unknown) => void = () => {};
  let finish = () => {};
  const session = {
    messages: [{ role: 'assistant', content: 'done' }],
    subscribe(listener: typeof emit) {
      emit = listener;
      return () => {};
    },
    prompt: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    abort: async () => finish(),
    dispose: () => {},
  };
  const history = env.createHistoryStore();
  const writes = vi.spyOn(history, 'upsertTask');
  const manager = env.createManager(async ({ onActivity, signal }) => {
    const result = await promptWithInactivity(
      session,
      'work',
      60000,
      signal,
      onActivity,
    );
    return { ...result, fallback_used: false };
  }, history);
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'background' },
    { cwd: env.tmp, sessionId: 'parent' },
  );
  return {
    manager,
    history,
    writes,
    id: run.task_ids[0],
    event: (event: unknown) => emit(event),
    finish: () => finish(),
  };
}

async function startActivityRun() {
  env.writeAgent('worker');
  let report!: (activity: SubagentActivity) => void;
  let finish = () => {};
  const history = env.createHistoryStore();
  const writes = vi.spyOn(history, 'upsertTask');
  const manager = env.createManager(async ({ onActivity }) => {
    if (!onActivity) throw new Error('Missing runner activity callback');
    report = onActivity;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { result: 'done', fallback_used: false };
  }, history);
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'background' },
    { cwd: env.tmp, sessionId: 'parent' },
  );
  return { manager, history, writes, report, finish, id: run.task_ids[0] };
}

describe('manager history persistence boundaries', () => {
  it.each<SubagentActivity>([
    { message: 'session_start handler error: failed hook', diagnostic: true },
    { message: 'lean resource diagnostic', diagnostic: true },
    { message: 'profile warning', diagnostic: true },
    {
      message: 'orchestrator prompt prepared',
      persist: true,
      prompt: 'prepared task',
      system_prompt: 'system',
    },
    {
      message: 'continuation prompt prepared',
      persist: true,
      prompt: 'prepared follow-up',
    },
    {
      message: 'starting worker with model mock/model effort high',
      persist: true,
    },
    {
      message: 'nested session ready',
      persist: true,
      nested_session_path: '/sessions/child.jsonl',
      dropped_tools: [],
      notify_orchestrator_available: true,
    },
  ])('persists the classified SDK startup activity immediately: $message', async (activity) => {
    const run = await startActivityRun();
    try {
      run.writes.mockClear();
      run.report(activity);
      expect(run.writes).toHaveBeenCalledTimes(1);
      expect(run.history.getTask(env.tmp, run.id)?.last_activity).toBe(
        activity.message,
      );
    } finally {
      run.finish();
      await run.manager.close();
    }
  });

  it.each([
    'orchestrator prompt prepared',
    'continuation prompt prepared',
    'starting worker with model mock/model effort high',
    'nested session ready',
  ])('does not infer persistence from the activity label: %s', async (message) => {
    const run = await startActivityRun();
    try {
      run.writes.mockClear();
      run.report({ message });
      expect(run.writes).not.toHaveBeenCalled();
      expect(run.manager.getTask(run.id)?.last_activity).toBe(message);
    } finally {
      run.finish();
      await run.manager.close();
    }
  });

  it.each(
    (['stopping', 'terminal'] as const).flatMap((phase) =>
      (
        [
          { message: 'tool completed', persist: true },
          { message: 'turn completed', persist: true },
          {
            message: 'interaction required',
            persist: true,
            interaction_request: {
              type: 'interaction_required',
              requestId: 'late-question',
              kind: 'custom',
              origin: 'subagent',
              payload: { message: 'Too late?' },
            },
          },
        ] satisfies SubagentActivity[]
      ).map((activity) => ({ phase, activity })),
    ),
  )('ignores late $activity.message activity while $phase without writes or memory changes', async ({
    phase,
    activity,
  }) => {
    vi.useFakeTimers();
    const run = await startActivityRun();
    try {
      if (phase === 'stopping') run.manager.cancel(run.id, 'user request');
      else {
        run.finish();
        await vi.advanceTimersByTimeAsync(0);
      }
      const before = structuredClone(run.manager.getTask(run.id));
      const persisted = run.history.getTask(env.tmp, run.id);
      const updates = vi.fn();
      run.manager.onTaskUpdate(updates);
      run.writes.mockClear();
      run.report({
        ...activity,
        output: 'late output',
        transcript: 'late transcript',
        thread_snapshot: env.statusSnapshot('late detail'),
      });
      expect(run.writes).not.toHaveBeenCalled();
      expect(run.manager.getTask(run.id)).toEqual(before);
      expect(run.history.getTask(env.tmp, run.id)).toEqual(persisted);
      expect(updates).not.toHaveBeenCalled();
    } finally {
      run.finish();
      await run.manager.close();
      vi.useRealTimers();
    }
  });

  it('keeps ordinary and explicitly non-persisting activity in memory without a persistence timer', async () => {
    vi.useFakeTimers();
    const run = await startActivityRun();
    try {
      run.writes.mockClear();
      const timers = vi.getTimerCount();
      run.report({ message: 'ordinary detail', output: 'memory only' });
      run.report({
        persist: false,
        message: 'nested session ready',
        diagnostic: true,
        dropped_tools: ['unavailable'],
        thread_snapshot: env.statusSnapshot('latest detail'),
      });
      expect(vi.getTimerCount()).toBe(timers);
      await vi.advanceTimersByTimeAsync(1000);
      expect(run.writes).not.toHaveBeenCalled();
      expect(run.manager.getTask(run.id)).toMatchObject({
        last_activity: 'nested session ready',
        output_preview: 'memory only',
        thread_snapshot: env.statusSnapshot('latest detail'),
        dropped_tools: ['unavailable'],
      });
    } finally {
      run.finish();
      await run.manager.close();
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    }
  });

  it('persists a partial-result question once immediately and not again on non-boundary activity', async () => {
    const run = await startEventRun();
    try {
      run.writes.mockClear();
      run.event({
        type: 'tool_execution_start',
        toolCallId: 'ask-1',
        toolName: 'ask_orchestrator',
      });
      const partial = {
        type: 'tool_execution_update',
        toolCallId: 'ask-1',
        toolName: 'ask_orchestrator',
        partialResult: {
          details: {
            interactionRequest: {
              type: 'interaction_required',
              requestId: 'question-1',
              kind: 'custom',
              origin: 'subagent',
              payload: { message: 'Which scope?' },
            },
          },
        },
      };
      run.event(partial);
      expect(run.writes).toHaveBeenCalledTimes(1);
      expect(
        run.history.getTask(env.tmp, run.id)?.thread_snapshot?.items,
      ).toContainEqual(
        expect.objectContaining({ type: 'tool', status: 'running' }),
      );
      expect(run.manager.getTask(run.id)?.interaction_request).toMatchObject({
        requestId: 'question-1',
      });
      run.event(partial);
      run.event({
        type: 'message_end',
        message: { role: 'assistant', content: 'Waiting for the answer' },
      });
      expect(run.writes).toHaveBeenCalledTimes(1);
    } finally {
      run.finish();
      await run.manager.close();
    }
  });

  it('keeps lifecycle transitions durable with one write each and no terminal flush duplicate', async () => {
    vi.useFakeTimers();
    const run = await startEventRun();
    try {
      expect(run.writes).toHaveBeenCalledTimes(2); // queued, running
      expect(run.history.getTask(env.tmp, run.id)?.status).toBe('running');
      run.finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(run.writes).toHaveBeenCalledTimes(3);
      expect(run.history.getTask(env.tmp, run.id)?.status).toBe('completed');
      expect(run.manager.listActiveSessionTasks()[0]).not.toHaveProperty(
        'thread_snapshot',
      );
      expect(run.manager.getTask(run.id)?.thread_snapshot).toBeDefined();
    } finally {
      run.finish();
      await run.manager.close();
      vi.useRealTimers();
    }
  });

  it('persists stopping before cleanup and cancelled once after runner settlement', async () => {
    vi.useFakeTimers();
    const run = await startActivityRun();
    try {
      run.writes.mockClear();
      run.manager.cancel(run.id, 'user request');
      expect(run.writes).toHaveBeenCalledTimes(1);
      expect(run.history.getTask(env.tmp, run.id)?.status).toBe('stopping');
      run.finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(run.writes).toHaveBeenCalledTimes(2);
      expect(run.history.getTask(env.tmp, run.id)?.status).toBe('cancelled');
    } finally {
      run.finish();
      await run.manager.close();
      vi.useRealTimers();
    }
  });

  it('keeps questions, answers, progress, steering outcomes and deadline extensions immediate', async () => {
    const run = await startActivityRun();
    try {
      run.writes.mockClear();
      const answer = run.manager.askOrchestrator(run.id, 'Which scope?');
      answer.catch(() => {});
      expect(run.writes).toHaveBeenCalledTimes(1);
      expect(run.history.getTask(env.tmp, run.id)?.last_activity).toBe(
        'awaiting orchestrator reply',
      );
      run.manager.replyToQuestion('parent', run.id, undefined, 'Manager only');
      expect(run.writes).toHaveBeenCalledTimes(2);
      await expect(answer).resolves.toBe('Manager only');
      expect(run.history.getTask(env.tmp, run.id)?.last_activity).toBe(
        'orchestrator question answered',
      );
      run.manager.reportProgress(run.id, 'Boundary reached');
      expect(run.writes).toHaveBeenCalledTimes(3);
      run.manager.registerLiveBridge(
        run.id,
        {
          supported: true,
          detected_pi_version: '1.0.2',
          steer: async () => 'handled',
        },
        'parent',
        1,
      );
      await run.manager.sendMessage({
        task_id: run.id,
        session_id: 'parent',
        message: 'Narrow the scope',
      });
      expect(run.writes).toHaveBeenCalledTimes(4);
      run.manager.extendDeadline(run.id, 1000, 'parent');
      expect(run.writes).toHaveBeenCalledTimes(5);
    } finally {
      run.finish();
      await run.manager.close();
    }
  });

  it('persists a background-mode change immediately', async () => {
    env.writeAgent('worker');
    let markStarted = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let finish = () => {};
    const history = env.createHistoryStore();
    const writes = vi.spyOn(history, 'upsertTask');
    const manager = env.createManager(async () => {
      markStarted();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { result: 'done', fallback_used: false };
    }, history);
    const running = manager.run(
      { agent: 'worker', task: 'work', mode: 'task' },
      { cwd: env.tmp, sessionId: 'parent' },
    );
    try {
      await started;
      const task = manager.listActiveSessionTasks()[0];
      writes.mockClear();
      manager.sendToBackground([task.id]);
      expect(writes).toHaveBeenCalledTimes(1);
      expect(manager.getTask(task.id)?.mode).toBe('background');
      expect(writes.mock.lastCall?.[1].mode).toBe('background');
    } finally {
      finish();
      await running;
    }
  });

  it('recovers an orphan with its last boundary detail, not later in-memory assistant content', async () => {
    vi.useFakeTimers();
    const run = await startEventRun();
    try {
      run.event({
        type: 'tool_execution_start',
        toolCallId: 'read-1',
        toolName: 'read',
      });
      run.event({
        type: 'tool_execution_end',
        toolCallId: 'read-1',
        toolName: 'read',
        result: { output: 'durable guide' },
      });
      const boundary = run.history.getTask(env.tmp, run.id);
      if (!boundary) throw new Error('Missing durable tool boundary');
      run.event({
        type: 'message_end',
        message: { role: 'assistant', content: 'not durable yet' },
      });
      await vi.advanceTimersByTimeAsync(1000);
      const recovered = env.createManager(undefined, env.createHistoryStore());
      expect(recovered.reconcileOrphanedTasks(env.tmp)).toEqual([
        expect.objectContaining({
          id: run.id,
          status: 'interrupted',
          transcript: boundary.transcript,
          thread_snapshot: boundary.thread_snapshot,
          output_preview: boundary.output_preview,
        }),
      ]);
      expect(recovered.getTask(run.id, env.tmp)?.transcript).not.toContain(
        'not durable yet',
      );
      expect(run.manager.getTask(run.id)?.output_preview).toBe(
        'not durable yet',
      );
    } finally {
      run.finish();
      await run.manager.close();
      vi.useRealTimers();
    }
  });

  it('writes only at tool end and turn end, not during messages, tool starts or partial updates', async () => {
    vi.useFakeTimers();
    const run = await startEventRun();
    try {
      run.writes.mockClear();
      for (const type of ['text_delta', 'thinking_delta']) {
        run.event({
          type: 'message_update',
          assistantMessageEvent: { type, delta: 'draft' },
        });
        expect(run.writes).not.toHaveBeenCalled();
      }
      run.event({
        type: 'message_end',
        message: { role: 'assistant', content: 'completed planning' },
      });
      expect(run.manager.getTask(run.id)?.output_preview).toBe(
        'completed planning',
      );
      expect(run.writes).not.toHaveBeenCalled();
      run.event({
        type: 'tool_execution_start',
        toolCallId: 'read-1',
        toolName: 'read',
      });
      expect(run.writes).not.toHaveBeenCalled();
      run.event({
        type: 'tool_execution_update',
        toolCallId: 'read-1',
        toolName: 'read',
        partialResult: { output: 'partial guide' },
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(run.writes).not.toHaveBeenCalled();
      run.event({
        type: 'tool_execution_end',
        toolCallId: 'read-1',
        toolName: 'read',
        result: { output: 'complete guide' },
      });
      expect(run.writes).toHaveBeenCalledTimes(1);
      const boundary = run.history.getTask(env.tmp, run.id);
      for (let index = 0; index < 40; index += 1) {
        run.event({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: 'long answer' },
        });
        await vi.advanceTimersByTimeAsync(300);
      }
      expect(run.writes).toHaveBeenCalledTimes(1);
      run.event({
        type: 'message_end',
        message: { role: 'assistant', content: 'completed final answer' },
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(run.writes).toHaveBeenCalledTimes(1);
      expect(run.history.getTask(env.tmp, run.id)?.transcript).toBe(
        boundary?.transcript,
      );
      run.event({ type: 'turn_end' });
      expect(run.writes).toHaveBeenCalledTimes(2);
      expect(run.history.getTask(env.tmp, run.id)?.transcript).toContain(
        'completed final answer',
      );
    } finally {
      run.finish();
      await run.manager.close();
      vi.useRealTimers();
    }
  });
});
