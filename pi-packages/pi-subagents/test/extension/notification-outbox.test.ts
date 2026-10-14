import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import subagentsExtension from '../../src/extension/subagents-extension.js';
import type { SubagentManager } from '../../src/manager.js';
import { triggerClaudeBackgroundHandoff } from '../../src/tools/background-handoff-state.js';
import { createSubagentContinueTool } from '../../src/tools/subagent-continue.js';
import { createSubagentExtendTool } from '../../src/tools/subagent-extend.js';
import { createSubagentResultTool } from '../../src/tools/subagent-result.js';
import { createSubagentRunTool } from '../../src/tools/subagent-run.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const captured = vi.hoisted(() => ({ manager: undefined as any }));
vi.mock('../../src/tools.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/tools.js')>()),
  registerSubagentTools: (_pi: unknown, manager: SubagentManager) => {
    captured.manager = manager;
  },
}));
const env = installSubagentTestEnv();
afterEach(() => vi.useRealTimers());

async function fixture() {
  const handlers = new Map<string, any[]>();
  const sendMessage = vi.fn();
  let idle = true;
  const ctx = {
    cwd: env.tmp,
    sessionId: 'parent',
    hasUI: false,
    isIdle: () => idle,
    signal: undefined as AbortSignal | undefined,
  };
  subagentsExtension({
    sendMessage,
    on: (name: string, handler: any) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
  });
  const emit = async (name: string, event: any = {}) => {
    for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
  };
  await emit('session_start');
  const manager: SubagentManager = captured.manager;
  const task = (id: string, status = 'completed') => ({
    id,
    agent: 'worker',
    task: 'work',
    mode: 'background',
    status,
    session_id: 'parent',
    created_at: new Date().toISOString(),
    result: 'done',
  });
  const complete = (id: string, attempt = 1, status = 'completed') => {
    const value = { ...task(id, status), attempt };
    (manager as any).tasks.set(id, value);
    (manager as any).onTerminalBackgroundTask(value, env.tmp);
  };
  const ask = (id: string) => {
    (manager as any).tasks.set(id, task(id, 'running'));
    (manager as any).askTimeouts.set(id, 60_000);
    const answer = manager.askOrchestrator(id, 'Which option?');
    void answer.catch(() => {});
    return answer;
  };
  return {
    manager,
    async readResult(taskId: string) {
      const response = await createSubagentResultTool(manager).execute(
        taskId,
        { task_id: taskId },
        undefined,
        undefined,
        ctx,
      );
      await emit('turn_end', {
        toolResults: [
          {
            ...response,
            role: 'toolResult',
            toolCallId: taskId,
            toolName: 'subagent_result',
            isError: false,
          },
        ],
      });
      return response;
    },
    ctx,
    emit,
    sendMessage,
    complete,
    attention: (id: string) => {
      const value = {
        ...task(id, 'running'),
        attempt: 1,
        timeout_deadline_generation: 1,
        timeout_deadline_at: Date.now() + 200,
        timeout_extensions_used: 0,
        timeout_max_extensions: 3,
      };
      (manager as any).tasks.set(id, value);
      (manager as any).deadlines.set(id, {});
      (manager as any).onTimeoutAttention(value, env.tmp, 1, 1);
      return value;
    },
    ask,
    busy: () => {
      idle = false;
      ctx.signal = new AbortController().signal;
      for (const handler of handlers.get('agent_start') ?? []) handler({}, ctx);
    },
    compactionBusy: () => {
      idle = false;
    },
    settle: async () => {
      idle = true;
      ctx.signal = undefined;
      await emit('agent_settled');
    },
  };
}

describe('parent notification outbox', () => {
  it.each([
    false,
    true,
  ])('hands off same-session blocking runs and delivers attention after settlement (steering failure: %s)', async (steeringFails) => {
    vi.useFakeTimers();
    env.writeAgent('worker');
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({
        timeout_ms: 1000,
        timeout_warning_ms: 200,
        stall_timeout_ms: 10000,
        max_total_timeout_ms: 2000,
        max_concurrency: 3,
      }),
    );
    const host = await fixture();
    (host.manager as any).runner = async ({ signal, onActivity }: any) => {
      if (signal.aborted) throw new Error('aborted');
      onActivity?.({
        message: 'working',
        output: 'partial output',
        notify_orchestrator_available: true,
      });
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        }),
      );
    };
    const steering = vi.spyOn(host.manager, 'sendMessage');
    if (steeringFails)
      steering.mockRejectedValueOnce(new Error('transport failed'));
    const tool = createSubagentRunTool(host.manager, {});
    const results: any[] = [];
    host.busy();
    const calls = [0, 1].map((i) =>
      tool
        .execute(
          `run-${i}`,
          { agent: 'worker', task: 'work', mode: 'task' },
          undefined,
          undefined,
          host.ctx,
        )
        .then((result: any) => {
          results.push(result);
          return result;
        }),
    );
    await vi.advanceTimersByTimeAsync(100);
    const foreign = tool.execute(
      'foreign',
      { agent: 'worker', task: 'foreign', mode: 'task' },
      undefined,
      undefined,
      { ...host.ctx, sessionId: 'other' },
    );
    try {
      await vi.advanceTimersByTimeAsync(700);
      expect(results).toHaveLength(2);
      for (const result of results)
        expect(result).toMatchObject({
          terminate: true,
          details: { mode: 'background' },
        });
      const tasks = host.manager.listActiveSessionTasks(env.tmp, 'parent');
      for (const task of tasks)
        expect(task).toMatchObject({
          mode: 'background',
          effective_mode: 'background',
          status: 'running',
        });
      expect(
        host.manager.listActiveSessionTasks(env.tmp, 'other')[0].mode,
      ).toBe('task');
      if (steeringFails)
        await expect(steering.mock.results[0].value).rejects.toThrow(
          'transport failed',
        );
      else
        expect(await steering.mock.results[0].value).toMatchObject({
          status: 'queued',
        });
      expect(
        results.flatMap((result) => result.details.task_ids).sort(),
      ).toEqual(tasks.map((task) => task.id).sort());
      expect(host.sendMessage).not.toHaveBeenCalled();
      await host.settle();
      expect(
        host.sendMessage.mock.calls.filter(
          ([msg]) => msg.customType === 'subagent-attention',
        ),
      ).toHaveLength(2);
      const extension = await createSubagentExtendTool(host.manager).execute(
        'extend',
        { task_id: tasks[0].id, extra_ms: 500 },
        undefined,
        undefined,
        host.ctx,
      );
      expect(extension.details).toMatchObject({ added_ms: 500 });
      await host.settle();
      expect(
        host.sendMessage.mock.calls.filter(
          ([msg]) => msg.customType === 'subagent-attention',
        ),
      ).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(200);
      expect(
        host.sendMessage.mock.calls.some(
          ([msg]) =>
            msg.customType === 'subagent-completion' &&
            msg.content.includes('Partial context') &&
            msg.details.task.error_metadata.category === 'total_timeout',
        ),
      ).toBe(true);
    } finally {
      const shutdown = host.emit('session_shutdown');
      await vi.advanceTimersByTimeAsync(1000);
      await shutdown;
      await Promise.all([...calls, foreign]);
    }
  });

  it('settles and delivers attention while sibling continuation cleanup outlasts the warned deadline', async () => {
    vi.useFakeTimers();
    env.writeAgent('worker');
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({
        timeout_ms: 1000,
        timeout_warning_ms: 200,
        stall_timeout_ms: 10000,
        enable_continue: true,
      }),
    );
    const nested = path.join(env.tmp, 'resume.jsonl');
    fs.writeFileSync(nested, JSON.stringify({ type: 'session' }));
    let releaseCleanup!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const host = await fixture();
    (host.manager as any).runner = async ({
      task,
      continuation,
      signal,
      onActivity,
    }: any) => {
      if (task === 'initial' && !continuation) {
        onActivity?.({ message: 'ready', nested_session_path: nested });
        await cleanup;
        return {
          result: 'done',
          model: 'mock/model',
          fallback_used: false,
          nested_session_path: nested,
        };
      }
      if (signal.aborted) throw new Error('aborted');
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        }),
      );
    };
    const initial = await host.manager.run(
      { agent: 'worker', task: 'initial', mode: 'background' },
      host.ctx,
    );
    await vi.advanceTimersByTimeAsync(0);
    const taskId = initial.task_ids[0];
    host.manager.cancel(taskId);
    host.busy();
    let returned: any;
    const continuing = createSubagentContinueTool(host.manager, {})
      .execute(
        'continue',
        { task_id: taskId, prompt: 'resume', mode: 'task' },
        undefined,
        undefined,
        host.ctx,
      )
      .then((result: any) => {
        returned = result;
        return result;
      });
    let runReturned: any;
    const running = createSubagentRunTool(host.manager, {})
      .execute(
        'run',
        { agent: 'worker', task: 'warn', mode: 'task' },
        undefined,
        undefined,
        host.ctx,
      )
      .then((result: any) => {
        runReturned = result;
        return result;
      });
    try {
      await vi.advanceTimersByTimeAsync(800);
      expect(returned).toMatchObject({
        terminate: true,
        details: { mode: 'background', task_ids: [taskId] },
      });
      expect(runReturned).toMatchObject({ terminate: true });
      expect(host.manager.getTask(taskId)?.attempt ?? 1).toBe(1);
      await host.settle();
      expect(
        host.sendMessage.mock.calls.filter(
          ([msg]) => msg.customType === 'subagent-attention',
        ),
      ).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(300);
      expect(host.manager.getTask(taskId)?.attempt ?? 1).toBe(1);
      releaseCleanup();
      await vi.advanceTimersByTimeAsync(0);
      expect(host.manager.getTask(taskId)).toMatchObject({
        attempt: 2,
        mode: 'background',
        effective_mode: 'background',
        status: 'running',
      });
    } finally {
      releaseCleanup();
      await vi.advanceTimersByTimeAsync(0);
      const shutdown = host.emit('session_shutdown');
      await vi.advanceTimersByTimeAsync(1000);
      await shutdown;
      await Promise.all([continuing, running]);
    }
  });

  it('releases a published stopping sibling and notifies its terminal result after slow cleanup', async () => {
    vi.useFakeTimers();
    env.writeAgent('worker');
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({
        timeout_ms: 1000,
        timeout_warning_ms: 200,
        stall_timeout_ms: 10000,
      }),
    );
    let releaseCleanup!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const host = await fixture();
    (host.manager as any).runner = async ({ task, signal }: any) => {
      if (task === 'slow cleanup') {
        await cleanup;
        throw new Error('cancelled');
      }
      if (signal.aborted) throw new Error('aborted');
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        }),
      );
    };
    const tool = createSubagentRunTool(host.manager, {});
    const handoff = vi.spyOn(host.manager, 'sendToBackground');
    const returned: any[] = [];
    host.busy();
    const slow = tool
      .execute(
        'slow',
        { agent: 'worker', task: 'slow cleanup', mode: 'task' },
        undefined,
        undefined,
        host.ctx,
      )
      .then((result: any) => {
        returned.push(result);
        return result;
      });
    await vi.advanceTimersByTimeAsync(0);
    const sibling = host.manager.listActiveSessionTasks(env.tmp, 'parent')[0];
    host.manager.cancel(sibling.id);
    expect(sibling.status).toBe('stopping');
    // Shortcut semantics still skip stopping tasks.
    expect(triggerClaudeBackgroundHandoff()).toBe(false);
    const warned = tool
      .execute(
        'warn',
        { agent: 'worker', task: 'warn', mode: 'task' },
        undefined,
        undefined,
        host.ctx,
      )
      .then((result: any) => {
        returned.push(result);
        return result;
      });
    try {
      await vi.advanceTimersByTimeAsync(800);
      expect(returned).toHaveLength(2);
      expect(await slow).toMatchObject({
        terminate: true,
        details: { mode: 'background', task_ids: [sibling.id] },
      });
      expect(await warned).toMatchObject({
        terminate: true,
        details: { mode: 'background' },
      });
      expect(sibling).toMatchObject({
        status: 'stopping',
        mode: 'background',
        effective_mode: 'background',
      });
      expect(host.sendMessage).not.toHaveBeenCalled();
      await host.settle();
      expect(
        host.sendMessage.mock.calls.filter(
          ([msg]) => msg.customType === 'subagent-attention',
        ),
      ).toHaveLength(1);
      expect(
        host.sendMessage.mock.calls.filter(
          ([msg]) =>
            msg.customType === 'subagent-completion' &&
            msg.details.task.id === sibling.id,
        ),
      ).toHaveLength(0);
      expect(triggerClaudeBackgroundHandoff()).toBe(false);
      const handoffCount = handoff.mock.calls.length;
      await vi.advanceTimersByTimeAsync(300);
      expect(sibling.status).toBe('stopping');
      releaseCleanup();
      await vi.advanceTimersByTimeAsync(0);
      expect(sibling.status).toBe('cancelled');
      // Returned tools must not retain task-update handoff listeners.
      expect(handoff).toHaveBeenCalledTimes(handoffCount);
      expect(
        host.sendMessage.mock.calls.filter(
          ([msg]) =>
            msg.customType === 'subagent-completion' &&
            msg.details.task.id === sibling.id,
        ),
      ).toHaveLength(1);
      await host.settle();
      expect(
        host.sendMessage.mock.calls.filter(
          ([msg]) =>
            msg.customType === 'subagent-completion' &&
            msg.details.task.id === sibling.id,
        ),
      ).toHaveLength(1);
    } finally {
      releaseCleanup();
      await vi.advanceTimersByTimeAsync(0);
      const shutdown = host.emit('session_shutdown');
      await vi.advanceTimersByTimeAsync(1000);
      await shutdown;
      await Promise.all([slow, warned]);
    }
  });

  it('holds attention with followUp delivery and drops stale deadline, attempt, status or session', async () => {
    const host = await fixture();
    try {
      host.busy();
      host.attention('valid');
      host.manager.reportProgress(
        'valid',
        'late checkpoint received while held',
      );
      host.attention('extended').timeout_deadline_generation = 2;
      host.attention('continued').attempt = 2;
      host.attention('stopped').status = 'stopping';
      host.attention('foreign').session_id = 'other';
      expect(host.sendMessage).not.toHaveBeenCalled();
      await host.settle();
      expect(host.sendMessage).toHaveBeenCalledOnce();
      expect(host.sendMessage.mock.calls[0][0]).toMatchObject({
        customType: 'subagent-attention',
      });
      expect(host.sendMessage.mock.calls[0][0].content).toContain(
        'subagent_extend',
      );
      expect(host.sendMessage.mock.calls[0][0].content).toContain(
        'late checkpoint received while held',
      );
      expect(host.sendMessage.mock.calls[0][1]).toEqual({
        triggerTurn: true,
        deliverAs: 'followUp',
      });
      await host.settle();
      expect(host.sendMessage).toHaveBeenCalledOnce();
    } finally {
      await host.emit('session_shutdown');
    }
  });

  it('sends immediately during compaction-only busy state without another agent run', async () => {
    const host = await fixture();
    try {
      host.compactionBusy();
      host.complete('compacting');
      expect(host.ctx.isIdle()).toBe(false);
      expect(host.sendMessage).toHaveBeenCalledOnce();
      const answer = host.ask('question');
      await Promise.resolve();
      expect(host.sendMessage).toHaveBeenCalledTimes(2);
      const request = host.manager.getTask('question')!.pending_questions![0];
      host.manager.replyToQuestion(
        'parent',
        'question',
        request.request_id,
        'yes',
      );
      await answer;
    } finally {
      await host.emit('session_shutdown');
    }
  });

  it('holds during a preceding awaited agent_start handler using the live run signal', async () => {
    const host = await fixture();
    try {
      host.compactionBusy();
      host.ctx.signal = new AbortController().signal;
      host.complete('early');
      const answer = host.ask('question');
      await Promise.resolve();
      expect(host.sendMessage).not.toHaveBeenCalled();
      const request = host.manager.getTask('question')!.pending_questions![0];
      host.manager.replyToQuestion(
        'parent',
        'question',
        request.request_id,
        'yes',
      );
      await answer;
      await host.settle();
      expect(
        host.sendMessage.mock.calls.map(([msg]) => msg.details.task.id),
      ).toEqual(['early']);
    } finally {
      await host.emit('session_shutdown');
    }
  });

  it.each([
    'error',
    'changed',
    'unconfirmed',
    'wrong-call',
    'wrong-attempt',
    'wrong-task',
  ])('does not suppress a completion for a %s finalized result', async (replacement) => {
    const host = await fixture();
    try {
      host.busy();
      host.complete('read');
      const response = await createSubagentResultTool(host.manager).execute(
        'call',
        { task_id: 'read' },
        undefined,
        undefined,
        host.ctx,
      );
      if (replacement !== 'unconfirmed')
        await host.emit('turn_end', {
          toolResults: [
            {
              role: 'toolResult',
              toolCallId: replacement === 'wrong-call' ? 'other-call' : 'call',
              toolName: 'subagent_result',
              ...response,
              details:
                replacement === 'wrong-attempt'
                  ? { task: { id: 'read', attempt: 2 } }
                  : replacement === 'wrong-task'
                    ? { task: { id: 'other-task' } }
                    : response.details,
              isError: replacement === 'error',
              content:
                replacement === 'changed'
                  ? [{ type: 'text', text: 'redacted' }]
                  : response.content,
            },
          ],
        });
      await host.settle();
      expect(host.sendMessage).toHaveBeenCalledOnce();
    } finally {
      await host.emit('session_shutdown');
    }
  });

  it('keeps holding after the live signal clears until the settled boundary', async () => {
    const host = await fixture();
    try {
      host.busy();
      host.ctx.signal = undefined;
      await host.emit('agent_end');
      host.complete('between-runs');
      expect(host.sendMessage).not.toHaveBeenCalled();
      await host.settle();
      expect(host.sendMessage).toHaveBeenCalledOnce();
    } finally {
      await host.emit('session_shutdown');
    }
  });

  it('continues flushing later entries when the first send throws', async () => {
    const host = await fixture();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      host.busy();
      host.complete('first');
      host.complete('second');
      host.sendMessage.mockImplementationOnce(() => {
        throw new Error('delivery failed');
      });
      await expect(host.settle()).resolves.toBeUndefined();
      expect(
        host.sendMessage.mock.calls.map(([msg]) => msg.details.task.id),
      ).toEqual(['first', 'second']);
      expect(log).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
      await host.emit('session_shutdown');
    }
  });

  it('sends idle notifications immediately with the existing followUp contract', async () => {
    const host = await fixture();
    try {
      host.complete('done');
      const answer = host.ask('question');
      expect(
        host.sendMessage.mock.calls.map(([msg]) => msg.customType),
      ).toEqual(['subagent-completion', 'subagent-question']);
      expect(
        host.sendMessage.mock.calls.every(
          ([, options]) =>
            options.triggerTurn && options.deliverAs === 'followUp',
        ),
      ).toBe(true);
      const request = host.manager.getTask('question')!.pending_questions![0];
      host.manager.replyToQuestion(
        'parent',
        'question',
        request.request_id,
        'yes',
      );
      await answer;
    } finally {
      await host.emit('session_shutdown');
    }
  });

  it('holds busy notifications until settled and preserves question/completion order without lost wakeups', async () => {
    const host = await fixture();
    try {
      host.busy();
      const answer = host.ask('question');
      await Promise.resolve();
      host.complete('first');
      host.complete('second');
      expect(host.sendMessage).not.toHaveBeenCalled();
      await host.emit('agent_end');
      expect(host.sendMessage).not.toHaveBeenCalled();
      await host.settle();
      expect(
        host.sendMessage.mock.calls.map(([msg]) => msg.details.task.id),
      ).toEqual(['question', 'first', 'second']);
      await host.settle();
      expect(host.sendMessage).toHaveBeenCalledTimes(3);
      const request = host.manager.getTask('question')!.pending_questions![0];
      host.manager.replyToQuestion(
        'parent',
        'question',
        request.request_id,
        'yes',
      );
      await answer;
    } finally {
      await host.emit('session_shutdown');
    }
  });

  it('drops questions answered and terminal results consumed while busy', async () => {
    const host = await fixture();
    try {
      host.busy();
      const answer = host.ask('question');
      await Promise.resolve();
      host.complete('read');
      host.complete('unread');
      const request = host.manager.getTask('question')!.pending_questions![0];
      host.manager.replyToQuestion(
        'parent',
        'question',
        request.request_id,
        'yes',
      );
      await answer;
      await host.readResult('read');
      // Status/getTask is deliberately not result consumption.
      host.manager.getTask('unread');
      await host.settle();
      expect(
        host.sendMessage.mock.calls.map(([msg]) => msg.details.task.id),
      ).toEqual(['unread']);
    } finally {
      await host.emit('session_shutdown');
    }
  });

  it('does not acknowledge a running result read', async () => {
    const host = await fixture();
    try {
      host.busy();
      const answer = host.ask('running');
      await Promise.resolve();
      await host.readResult('running');
      const request = host.manager.getTask('running')!.pending_questions![0];
      host.manager.replyToQuestion(
        'parent',
        'running',
        request.request_id,
        'yes',
      );
      await answer;
      host.complete('running');
      await host.settle();
      expect(host.sendMessage).toHaveBeenCalledTimes(1);
    } finally {
      await host.emit('session_shutdown');
    }
  });

  it.each([
    'completed',
    'failed',
    'cancelled',
    'interrupted',
  ])('acknowledges only the consumed terminal attempt (%s)', async (status) => {
    const host = await fixture();
    try {
      host.busy();
      host.complete('continued', 1, status);
      const result = await host.readResult('continued');
      expect(result.details).toHaveProperty('task');
      host.complete('continued', 2, status);
      await host.settle();
      expect(host.sendMessage).toHaveBeenCalledTimes(1);
    } finally {
      await host.emit('session_shutdown');
    }
  });

  it('retains acknowledgments across multiple consumed continuation attempts', async () => {
    const host = await fixture();
    try {
      host.busy();
      for (const attempt of [1, 2]) {
        host.complete('continued', attempt);
        await host.readResult('continued');
      }
      await host.settle();
      expect(host.sendMessage).not.toHaveBeenCalled();
    } finally {
      await host.emit('session_shutdown');
    }
  });

  it('rechecks pending state immediately before each queued send', async () => {
    const host = await fixture();
    try {
      host.busy();
      host.complete('first');
      const answer = host.ask('question');
      await Promise.resolve();
      const request = host.manager.getTask('question')!.pending_questions![0];
      host.sendMessage.mockImplementationOnce(() => {
        host.manager.replyToQuestion(
          'parent',
          'question',
          request.request_id,
          'yes',
        );
      });
      await host.settle();
      await answer;
      expect(host.sendMessage).toHaveBeenCalledTimes(1);
    } finally {
      await host.emit('session_shutdown');
    }
  });

  it.each([
    'session_start',
    'session_shutdown',
  ])('retains confirmations through settlement but resets all consumption state on %s', async (event) => {
    const host = await fixture();
    try {
      host.busy();
      host.complete('confirmed');
      await host.readResult('confirmed');
      const confirmed = host.manager.getTask('confirmed')!;
      expect(host.manager.isResultAcknowledged(confirmed)).toBe(true);
      await host.settle();
      expect(host.manager.isResultAcknowledged(confirmed)).toBe(true);
      host.busy();
      host.complete('candidate');
      const candidate = host.manager.getTask('candidate')!;
      const response = await createSubagentResultTool(host.manager).execute(
        'candidate-call',
        { task_id: candidate.id },
        undefined,
        undefined,
        host.ctx,
      );
      if (event === 'session_start') host.ctx.sessionId = 'replacement';
      await host.emit(event);
      expect(host.manager.isResultAcknowledged(confirmed)).toBe(false);
      host.manager.confirmResultAcknowledgments([
        {
          ...response,
          role: 'toolResult',
          toolName: 'subagent_result',
          toolCallId: 'candidate-call',
          isError: false,
        },
      ]);
      expect(host.manager.isResultAcknowledged(candidate)).toBe(false);
    } finally {
      await host.emit('session_shutdown');
    }
  });

  it.each([
    'session_start',
    'session_shutdown',
  ])('clears held notifications on %s', async (event) => {
    const host = await fixture();
    try {
      host.busy();
      host.complete('old');
      if (event === 'session_start') host.ctx.sessionId = 'replacement';
      await host.emit(event);
      await host.settle();
      expect(host.sendMessage).not.toHaveBeenCalled();
    } finally {
      await host.emit('session_shutdown');
    }
  });
});
