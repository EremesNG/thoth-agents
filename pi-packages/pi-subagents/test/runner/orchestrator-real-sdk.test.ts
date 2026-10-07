import fs from 'node:fs';
import path from 'node:path';
import { expect, it, onTestFinished, vi } from 'vitest';
import type { SubagentManager } from '../../src/manager.js';
import { sendSubagentQuestionMessage } from '../../src/render/question-message.js';
import { registerSubagentTools } from '../../src/tools.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();

// The real session still has permission hardening/teardown after the last reply.
// Synchronize on the public terminal update, not vi.waitFor's 1s default, which
// can expire during Windows I/O. The runner and this integration test are bounded
// by their existing 10s/30s deadlines; failed/cancelled updates also unblock so the
// completed assertion reports the actual outcome instead of waiting forever.
async function waitForTerminalTask(manager: SubagentManager, id: string) {
  let remove = () => {};
  const terminal = new Promise<void>((resolve) => {
    const check = () => {
      const status = manager.getTask(id)?.status;
      if (status && ['completed', 'failed', 'cancelled'].includes(status))
        resolve();
    };
    remove = manager.onTaskUpdate(check);
    check();
  });
  onTestFinished(() => remove());
  try {
    await terminal;
  } finally {
    remove();
  }
}

it.each([
  ['subagent_run', 'same turn'],
  ['subagent_run', 'during tool cleanup'],
  ['subagent_continue', 'same turn'],
  ['subagent_continue', 'during tool cleanup'],
])(
  'returns %s before delivering every same-task concurrent SDK question exactly once (%s)',
  async (toolName, timing) => {
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents', 'analyst.md'),
      '---\nname: analyst\ntools: read, ask_orchestrator\n---\nKeep runtime scope.',
    );
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({
        enable_continue: true,
        timeout_ms: 10000,
        stall_timeout_ms: 1000,
        ask_timeout_ms: 8000,
      }),
    );
    const { AgentSession, ModelRuntime, SettingsManager } = await import(
      '@earendil-works/pi-coding-agent'
    );
    const modelRuntime = await ModelRuntime.create({
      modelsPath: null,
      authPath: path.join(env.tmp, 'auth.json'),
      allowModelNetwork: false,
    });
    const events: string[] = [];
    const pi = {
      sendMessage: vi.fn((notification: any, _delivery: any) => {
        events.push(`question:${notification.details.question}`);
      }),
    };
    const manager = env.createManager(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (task, question) => sendSubagentQuestionMessage(pi, task, question),
    );
    const tools = new Map<string, any>();
    registerSubagentTools(
      { registerTool: (tool: any) => tools.set(tool.name, tool) },
      manager,
      env.tmp,
    );
    let askQuestions = toolName === 'subagent_run';
    const childReplies: string[] = [];
    const prompt = vi
      .spyOn(AgentSession.prototype, 'prompt')
      .mockImplementation(async function (
        this: InstanceType<typeof AgentSession>,
      ) {
        if (askQuestions) {
          const tool = this.agent.state.tools.find(
            (tool) => tool.name === 'ask_orchestrator',
          )!;
          const first = tool.execute(
            'first',
            { kind: 'question', message: 'first' },
            new AbortController().signal,
          );
          if (timing === 'during tool cleanup') {
            // The first handoff resumes the parent before its promise settles.
            await Promise.resolve();
            await Promise.resolve();
          }
          const second = tool.execute(
            'second',
            { kind: 'question', message: 'second' },
            new AbortController().signal,
          );
          const replies = await Promise.all([first, second]);
          childReplies.push(
            ...replies.map(
              (reply) => (reply.content[0] as { text: string }).text,
            ),
          );
        }
        const message = {
          role: 'assistant',
          content: [{ type: 'text', text: 'finished' }],
        } as any;
        this.agent.state.messages.push(message);
        this.sessionManager.appendMessage(message);
      });
    let parent: Promise<any> | undefined;
    try {
      const ctx = {
        cwd: env.tmp,
        sessionId: 'parent-a',
        modelRuntime,
        settingsManager: SettingsManager.inMemory({}),
      };
      let params: any = {
        agent: 'analyst',
        task: 'concurrent alignment',
        mode: 'task',
      };
      if (toolName === 'subagent_continue') {
        const initial = await manager.run(params, ctx);
        askQuestions = true;
        params = {
          task_id: initial.task_ids[0]!,
          prompt: 'Resume with concurrent questions.',
          mode: 'task',
        };
      }
      parent = tools
        .get(toolName)
        .execute('parent', params, undefined, undefined, ctx)
        .then((result: any) => {
          events.push('tool-result');
          return result;
        });
      const result = await parent;
      expect(result.isError, result.content[0].text).not.toBe(true);
      await vi.waitFor(() => expect(pi.sendMessage).toHaveBeenCalledTimes(2));
      expect(events[0]).toBe('tool-result');
      expect(events.slice(1).sort()).toEqual([
        'question:first',
        'question:second',
      ]);
      expect(result.terminate).toBe(true);
      const taskId = result.details.task_ids[0];
      const requestIds = new Set<string>();
      for (const [notification, delivery] of pi.sendMessage.mock.calls) {
        expect(notification.customType).toBe('subagent-question');
        expect(notification.details.task_id).toBe(taskId);
        expect(delivery).toEqual({
          triggerTurn: true,
          deliverAs: 'followUp',
        });
        requestIds.add(notification.details.request_id);
        const reply = await tools.get('subagent_reply').execute(
          'reply',
          {
            task_id: taskId,
            request_id: notification.details.request_id,
            message: `answer:${notification.details.question}`,
          },
          undefined,
          undefined,
          ctx,
        );
        expect(reply.isError).not.toBe(true);
      }
      expect(requestIds.size).toBe(2);
      await waitForTerminalTask(manager, taskId);
      expect(manager.getTask(taskId)?.status).toBe('completed');
      expect(childReplies).toEqual(['answer:first', 'answer:second']);
      expect(pi.sendMessage).toHaveBeenCalledTimes(2);
    } finally {
      await manager.close();
      await parent;
      prompt.mockRestore();
    }
  },
  30_000,
);

it('answers repeated injected real-SDK questions through subagent_reply in the same live child session', async () => {
  fs.writeFileSync(
    path.join(env.tmp, '.pi', 'subagents', 'analyst.md'),
    '---\nname: analyst\ntools: read, ask_orchestrator\n---\nKeep runtime scope.',
  );
  fs.writeFileSync(
    path.join(env.tmp, '.pi', 'subagents.json'),
    JSON.stringify({
      timeout_ms: 10000,
      stall_timeout_ms: 1000,
      ask_timeout_ms: 8000,
    }),
  );
  const { AgentSession, ModelRuntime, SettingsManager } = await import(
    '@earendil-works/pi-coding-agent'
  );
  const modelRuntime = await ModelRuntime.create({
    modelsPath: null,
    authPath: path.join(env.tmp, 'auth.json'),
    allowModelNetwork: false,
  });
  const pi = { sendMessage: vi.fn() };
  const manager = env.createManager(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    (task, question) => sendSubagentQuestionMessage(pi, task, question),
  );
  const tools = new Map<string, any>();
  registerSubagentTools(
    { registerTool: (tool: any) => tools.set(tool.name, tool) },
    manager,
    env.tmp,
  );
  const childReplies: string[] = [];
  const prompt = vi
    .spyOn(AgentSession.prototype, 'prompt')
    .mockImplementation(async function (
      this: InstanceType<typeof AgentSession>,
    ) {
      const tool = this.agent.state.tools.find(
        (tool) => tool.name === 'ask_orchestrator',
      )!;
      await tool.execute(
        'progress',
        { kind: 'progress', message: 'Discovery complete' },
        new AbortController().signal,
      );
      for (const message of ['Which scope?', 'Which check?']) {
        const result = await tool.execute(
          'question',
          { kind: 'question', message },
          new AbortController().signal,
        );
        childReplies.push((result.content[0] as { text: string }).text);
      }
      this.agent.state.messages.push({
        role: 'assistant',
        content: [{ type: 'text', text: childReplies.join('; ') }],
      } as any);
    });
  try {
    const ctx = {
      cwd: env.tmp,
      sessionId: 'parent-a',
      modelRuntime,
      settingsManager: SettingsManager.inMemory({}),
    };
    const run = await manager.run(
      { agent: 'analyst', task: 'alignment', mode: 'background' },
      ctx,
    );
    const id = run.task_ids[0]!;
    for (const [index, reply] of ['runtime only', 'package check'].entries()) {
      await vi.waitFor(() =>
        expect(pi.sendMessage).toHaveBeenCalledTimes(index + 1),
      );
      const [notification, delivery] = pi.sendMessage.mock.calls[index]!;
      expect(notification.customType).toBe('subagent-question');
      expect(notification.details.task_id).toBe(id);
      expect(delivery).toEqual({ triggerTurn: true, deliverAs: 'followUp' });
      expect(manager.getTask(id)?.status).toBe('running');
      expect(childReplies).toHaveLength(index);
      const result = await tools.get('subagent_reply').execute(
        'reply',
        {
          task_id: id,
          request_id: notification.details.request_id,
          message: reply,
        },
        undefined,
        undefined,
        ctx,
      );
      expect(result.isError).not.toBe(true);
    }
    await waitForTerminalTask(manager, id);
    expect(manager.getTask(id)?.status).toBe('completed');
    expect(manager.getTask(id)?.result).toBe('runtime only; package check');
    expect(
      manager.getTask(id)?.progress_updates?.map((update) => update.message),
    ).toEqual(['Discovery complete']);
    expect(manager.getTask(id)?.pending_questions).toEqual([]);
    expect(prompt).toHaveBeenCalledOnce();
    expect(pi.sendMessage).toHaveBeenCalledTimes(2); // Progress never sends a message.
  } finally {
    await manager.close();
    prompt.mockRestore();
  }
}, 30_000);
