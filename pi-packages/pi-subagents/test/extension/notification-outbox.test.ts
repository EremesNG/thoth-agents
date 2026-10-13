import { describe, expect, it, vi } from 'vitest';
import subagentsExtension from '../../src/extension/subagents-extension.js';
import type { SubagentManager } from '../../src/manager.js';
import { createSubagentResultTool } from '../../src/tools/subagent-result.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const captured = vi.hoisted(() => ({ manager: undefined as any }));
vi.mock('../../src/tools.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/tools.js')>()),
  registerSubagentTools: (_pi: unknown, manager: SubagentManager) => {
    captured.manager = manager;
  },
}));
const env = installSubagentTestEnv();

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
