import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { sendSubagentCompletionMessage } from '../../src/render/completion-message.js';
import { registerSubagentTools } from '../../src/tools.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();

describe('timeout continuation availability across surfaces', () => {
  it.each([
    { enabled: true, registered: false, available: false },
    { enabled: true, registered: true, available: true },
    { enabled: false, registered: true, available: false },
  ])('uses project config and live registration ($enabled/$registered)', async ({
    enabled,
    registered,
    available,
  }) => {
    env.writeAgent('analyst');
    // Register first, then change the effective config to exercise stale tools.
    fs.writeFileSync(
      `${env.tmp}/.pi/subagents.json`,
      JSON.stringify({ enable_continue: true }),
    );
    const task: any = {
      id: 'subtask_timeout',
      agent: 'analyst',
      task: 'timeout',
      mode: 'task',
      status: 'failed',
      created_at: new Date().toISOString(),
      error: 'total timeout',
      error_metadata: { category: 'total_timeout', message: 'total timeout' },
      timeout_continue_enabled: true,
    };
    const updates: any[] = [];
    const finish = async (
      _params: any,
      _ctx: any,
      _signal: any,
      update: any,
    ) => {
      update?.([task]);
      return { mode: 'task', results: [task] };
    };
    const manager: any = {
      run: finish,
      continueTask: finish,
      getTask: () => task,
      cancel: () => task,
      listSessionTasks: () => [task],
      stageResultAcknowledgment: () => {},
      onTaskUpdate: () => () => {},
      onQuestion: () => () => {},
    };
    const tools = new Map<string, any>();
    const sendMessage = vi.fn();
    const pi = {
      getAllTools: () => (registered ? [{ name: 'subagent_continue' }] : []),
      registerTool: (tool: any) => tools.set(tool.name, tool),
      sendMessage,
    };
    registerSubagentTools(pi, manager, env.tmp);
    fs.writeFileSync(
      `${env.tmp}/.pi/subagents.json`,
      JSON.stringify({ enable_continue: enabled }),
    );
    const responses: any[] = [];
    for (const name of [
      'subagent_run',
      'subagent_continue',
      'subagent_status',
      'subagent_result',
      'subagent_cancel',
      'subagent_list_tasks',
    ]) {
      responses.push(
        await tools.get(name).execute(
          name,
          {
            agent: 'analyst',
            task: 'timeout',
            task_id: task.id,
            prompt: 'resume',
            mode: 'task',
          },
          undefined,
          (update: any) => updates.push(update),
          { cwd: env.tmp },
        ),
      );
    }
    sendSubagentCompletionMessage(pi, task, env.tmp);
    const line = `subagent_continue: ${available ? 'enabled' : 'disabled'}`;
    const contexts = [...responses, ...updates].flatMap((response) => {
      const details = response.details;
      return [
        details?.task,
        ...(details?.tasks ?? []),
        ...(details?.results ?? []),
      ]
        .filter((value) => value?.partial_context)
        .map((value) => value.partial_context);
    });
    expect(contexts.length).toBeGreaterThanOrEqual(8);
    for (const context of contexts) expect(context).toContain(line);
    const completion = sendMessage.mock.calls[0][0];
    expect(completion.content).toContain(line);
    expect(completion.details.full_result).toContain(line);
    for (const text of [
      responses[0].content[0].text,
      responses[1].content[0].text,
      responses[4].content[0].text,
      completion.content,
    ]) {
      expect(text.includes('can be resumed with `subagent_continue`')).toBe(
        available,
      );
    }
  });
});
