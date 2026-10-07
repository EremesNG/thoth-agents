import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { registerSubagentTools } from '../../src/tools.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();

async function questionTask(count = 1) {
  env.writeAgent('analyst');
  const manager = env.createManager(async ({ orchestratorChannel }) => {
    orchestratorChannel!.reportProgress('Discovery complete');
    const replies = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        orchestratorChannel!.askQuestion(`Decision ${i + 1}?`),
      ),
    );
    return { result: replies.join('; ') };
  });
  const tools = new Map<string, any>();
  registerSubagentTools(
    { registerTool: (tool: any) => tools.set(tool.name, tool) },
    manager,
    env.tmp,
  );
  const ctx = {
    cwd: env.tmp,
    sessionManager: { getSessionId: () => 'parent-a' },
  };
  const run = await manager.run(
    { agent: 'analyst', task: 'align', mode: 'background' },
    ctx,
  );
  const id = run.task_ids[0]!;
  await vi.waitFor(() =>
    expect(manager.getTask(id)?.pending_questions).toHaveLength(count),
  );
  const execute = (name: string, params: any, caller: any = ctx) =>
    tools.get(name).execute('reply', params, undefined, undefined, caller);
  return {
    manager,
    id,
    execute,
    questions: manager.getTask(id)!.pending_questions!,
  };
}

describe('subagent_reply tool', () => {
  it('documents question selection, reply ownership, progress and timeout configuration', () => {
    for (const file of [
      'README.md',
      'skills/subagents-configuration/SKILL.md',
    ]) {
      const text = fs.readFileSync(file, 'utf8');
      for (const term of [
        'ask_orchestrator',
        'subagent_reply',
        'enable_ask_orchestrator',
        'ask_timeout_ms',
        '600000',
        'progress',
        'request_id',
      ])
        expect(text).toContain(term);
      expect(text).toMatch(/explicit/);
      expect(text).toMatch(/stall_timeout_ms/);
      expect(text).toMatch(/timeout_ms/);
    }
  });

  it('registers only when enabled and keeps the parent reply model-only', () => {
    const tools: any[] = [];
    const manager = env.createManager(env.mockRunner());
    registerSubagentTools(
      { registerTool: (tool: any) => tools.push(tool) },
      manager,
      env.tmp,
    );
    expect(tools.find((tool) => tool.name === 'subagent_reply')).toMatchObject({
      exposure: 'model-only',
    });
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents.json'),
      JSON.stringify({ enable_ask_orchestrator: false }),
    );
    const disabled: any[] = [];
    registerSubagentTools(
      { registerTool: (tool: any) => disabled.push(tool) },
      manager,
      env.tmp,
    );
    expect(disabled.map((tool) => tool.name)).not.toContain('subagent_reply');
  });

  it('infers the sole pending request and returns the reply text to the blocked child', async () => {
    const { manager, id, execute, questions } = await questionTask();
    const result = await execute('subagent_reply', {
      task_id: id,
      message: 'Keep runtime scope',
    });
    expect(result.isError).not.toBe(true);
    expect(result.details).toEqual({
      task_id: id,
      request_id: questions[0]!.request_id,
      status: 'replied',
    });
    await vi.waitFor(() =>
      expect(manager.getTask(id)?.result).toBe('Keep runtime scope'),
    );
    const stale = await execute('subagent_reply', {
      task_id: id,
      request_id: questions[0]!.request_id,
      message: 'late',
    });
    expect(stale.isError).toBe(true);
    expect(stale.content[0].text).toMatch(/unknown or stale/);
  });

  it('rejects an explicitly empty request_id instead of inferring a sole request', async () => {
    const { manager, id, execute } = await questionTask();
    const result = await execute('subagent_reply', {
      task_id: id,
      request_id: '',
      message: 'answer',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Unknown or stale/);
    expect(manager.getTask(id)?.pending_questions).toHaveLength(1);
  });

  it('rejects unknown, ambiguous, foreign-session, anonymous and empty replies without consuming requests', async () => {
    const { manager, id, execute, questions } = await questionTask(2);
    const cases = [
      {
        params: { task_id: 'missing', message: 'answer' },
        expected: /not found/,
      },
      {
        params: { task_id: id, request_id: 'unknown', message: 'answer' },
        expected: /Unknown or stale/,
      },
      {
        params: { task_id: id, message: 'answer' },
        expected: /Ambiguous.*specify request_id/,
      },
      {
        params: {
          task_id: id,
          request_id: questions[0]!.request_id,
          message: 'answer',
        },
        caller: { sessionId: 'parent-b' },
        expected: /exact originating parent/,
      },
      {
        params: {
          task_id: id,
          request_id: questions[0]!.request_id,
          message: 'answer',
        },
        caller: {},
        expected: /verify the calling Pi session/,
      },
      {
        params: {
          task_id: id,
          request_id: questions[0]!.request_id,
          message: '  ',
        },
        expected: /must not be empty/,
      },
    ];
    for (const { params, caller, expected } of cases) {
      const result = await execute('subagent_reply', params, caller);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(expected);
      expect(manager.getTask(id)?.pending_questions).toHaveLength(2);
    }
    await execute('subagent_reply', {
      task_id: id,
      request_id: questions[1]!.request_id,
      message: 'second answer',
    });
    expect(
      manager
        .getTask(id)
        ?.pending_questions?.map((question) => question.request_id),
    ).toEqual([questions[0]!.request_id]);
    await execute('subagent_reply', { task_id: id, message: 'first answer' });
    await vi.waitFor(() =>
      expect(manager.getTask(id)?.result).toBe('first answer; second answer'),
    );
  });

  it('surfaces outstanding questions and progress in compact status and list details and text', async () => {
    const { id, execute, questions } = await questionTask();
    for (const name of ['subagent_status', 'subagent_list_tasks']) {
      const result = await execute(name, { task_id: id });
      const task = result.details.task ?? result.details.tasks[0];
      expect(task.pending_question_count).toBe(1);
      expect(task.pending_questions).toEqual(questions);
      expect(task.progress_updates).toEqual([
        { message: 'Discovery complete', created_at: expect.any(String) },
      ]);
      expect(task.thread_snapshot).toBeUndefined();
      expect(result.content[0].text).toContain(questions[0]!.request_id);
      expect(result.content[0].text).toContain('Decision 1?');
      expect(result.content[0].text).toContain('Discovery complete');
    }
    await execute('subagent_reply', { task_id: id, message: 'resolved' });
    const status = await execute('subagent_status', { task_id: id });
    expect(status.details.task.pending_question_count).toBe(0);
  });
});
