import { expect, it } from 'vitest';
import {
  completionMessage,
  sendSubagentCompletionMessage,
} from '../../src/render/completion-message.js';
import { createSubagentResultTool } from '../../src/tools/subagent-result.js';
import { createSubagentStatusTool } from '../../src/tools/subagent-status.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();

it('persists dropped tools in task, attempt and metadata history and warns the parent through status, result and completion', async () => {
  env.writeAgent('analyst');
  const store = env.createHistoryStore();
  const manager = env.createManager(
    async () => ({
      result: 'bounded result',
      dropped_tools: ['missing_fixture_tool'],
    }),
    store,
  );
  const run = await manager.run(
    { agent: 'analyst', task: 'bounded task', mode: 'task' },
    { cwd: env.tmp, sessionId: 'parent' },
  );
  const id = run.task_ids[0];
  const task = store.getTask(env.tmp, id)!;
  expect(task.dropped_tools).toEqual(['missing_fixture_tool']);
  expect(store.listTasks(env.tmp)[0].dropped_tools).toEqual([
    'missing_fixture_tool',
  ]);
  expect(store.listTaskAttempts(env.tmp, id)[0].dropped_tools).toEqual([
    'missing_fixture_tool',
  ]);
  expect(
    store.listSessionTaskMetadata(env.tmp, 'parent')[0].dropped_tools,
  ).toEqual(['missing_fixture_tool']);
  const restored = env.createManager(undefined, store);
  for (const tool of [
    createSubagentStatusTool(restored),
    createSubagentResultTool(restored),
  ]) {
    const result: any = await tool.execute(
      'read',
      { task_id: id },
      undefined,
      undefined,
      { cwd: env.tmp },
    );
    expect(result.details.task.dropped_tools).toEqual(['missing_fixture_tool']);
    expect(result.content[0].text).toContain('Warning:');
    expect(result.content[0].text).toContain('missing_fixture_tool');
  }
  expect(completionMessage(task)).toContain('Warning:');
  expect(completionMessage(task)).toContain('missing_fixture_tool');
  const messages: any[] = [];
  sendSubagentCompletionMessage(
    { sendMessage: (message: any) => messages.push(message) },
    task,
    env.tmp,
  );
  expect(messages[0].details.task.dropped_tools).toEqual([
    'missing_fixture_tool',
  ]);
});

it('persists dropped-tool warnings from activity even when prompting later fails', async () => {
  env.writeAgent('analyst');
  const store = env.createHistoryStore();
  const manager = env.createManager(async ({ onActivity }) => {
    onActivity?.({
      message: 'nested session ready',
      dropped_tools: ['missing_fixture_tool'],
    });
    throw new Error('provider failed');
  }, store);
  const run = await manager.run(
    { agent: 'analyst', task: 'bounded task', mode: 'task' },
    { cwd: env.tmp },
  );
  expect(store.getTask(env.tmp, run.task_ids[0])).toMatchObject({
    status: 'failed',
    dropped_tools: ['missing_fixture_tool'],
  });
  expect(
    store.listTaskAttempts(env.tmp, run.task_ids[0])[0].dropped_tools,
  ).toEqual(['missing_fixture_tool']);
});
