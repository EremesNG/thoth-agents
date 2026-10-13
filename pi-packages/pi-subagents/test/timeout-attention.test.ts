import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attentionMessage } from '../src/render/attention-message.js';
import {
  completionMessage,
  sendSubagentCompletionMessage,
} from '../src/render/completion-message.js';
import { createSubagentResultTool } from '../src/tools/subagent-result.js';
import { registerSubagentTools } from '../src/tools.js';
import type { SubagentRunner } from '../src/types.js';
import { installSubagentTestEnv } from './helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();
afterEach(() => vi.useRealTimers());

async function fixture(overrides = {}) {
  vi.useFakeTimers();
  env.writeAgent('worker');
  fs.writeFileSync(
    path.join(env.tmp, '.pi', 'subagents.json'),
    JSON.stringify({
      timeout_ms: 1000,
      timeout_warning_ms: 200,
      max_total_timeout_ms: 2500,
      max_timeout_extensions: 2,
      stall_timeout_ms: 10000,
      ...overrides,
    }),
  );
  const attention = vi.fn();
  const runner: SubagentRunner = async ({ signal, onActivity }) => {
    onActivity?.({ message: 'working', output: 'partial output' });
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(new Error('aborted')), {
        once: true,
      }),
    );
  };
  const manager = env.createManager(
    runner,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    attention,
  );
  const steering = vi.spyOn(manager, 'sendMessage');
  const response = await manager.run(
    { agent: 'worker', task: 'work', mode: 'background' },
    { cwd: env.tmp, sessionId: 'parent' },
  );
  await vi.advanceTimersByTimeAsync(0);
  const task = manager.getTask(response.task_ids[0])!;
  return { manager, task, attention, steering };
}

describe('bounded timeout attention', () => {
  it('warns once and requests a checkpoint without stopping the task', async () => {
    const { manager, task, attention, steering } = await fixture();
    manager.reportProgress(
      task.id,
      'done: analysis; pending: implementation; touched: a.ts',
    );
    await vi.advanceTimersByTimeAsync(799);
    expect(attention).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(attention).toHaveBeenCalledOnce();
    expect(steering).toHaveBeenCalledOnce();
    expect(steering.mock.calls[0][0].message).toContain('ask_orchestrator');
    expect(task.status).toBe('running');
    await vi.advanceTimersByTimeAsync(200);
    expect(task).toMatchObject({
      status: 'failed',
      error_metadata: {
        category: 'total_timeout',
        retryable: false,
      },
    });
    expect(attention).toHaveBeenCalledOnce();
  });
  it('extends, clamps to the hard ceiling, and rearms one warning per deadline', async () => {
    const { manager, task, attention } = await fixture();
    await vi.advanceTimersByTimeAsync(800);
    const firstGeneration = task.timeout_deadline_generation!;
    const extended = manager.extendDeadline(task.id, undefined, 'parent');
    expect(extended).toMatchObject({
      added_ms: 1000,
      extensions_used: 1,
      extensions_remaining: 1,
    });
    expect(manager.isAttentionCurrent(task.id, 1, firstGeneration)).toBe(false);
    await vi.advanceTimersByTimeAsync(999);
    expect(attention).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(attention).toHaveBeenCalledTimes(2);
    expect(manager.extendDeadline(task.id, 99999, 'parent')).toMatchObject({
      added_ms: 500,
      extensions_used: 2,
      extensions_remaining: 0,
    });
    expect(() => manager.extendDeadline(task.id, 1, 'parent')).toThrow(
      'count exhausted',
    );
    await vi.advanceTimersByTimeAsync(500);
    expect(attention).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(200);
    expect(task).toMatchObject({
      status: 'failed',
      error: 'timed out after 2500ms',
    });
    await vi.advanceTimersByTimeAsync(10000);
    expect(attention).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    expect(() => manager.extendDeadline(task.id, 1, 'parent')).toThrow(
      'not running',
    );
  });

  it('rejects unknown, foreign, invalid, ceiling-bound and stopping tasks', async () => {
    const { manager, task, attention } = await fixture({
      max_total_timeout_ms: 1000,
    });
    expect(() => manager.extendDeadline('missing', 1, 'parent')).toThrow(
      'not found',
    );
    expect(() => manager.extendDeadline(task.id, 1, 'foreign')).toThrow(
      'originating parent',
    );
    expect(() => manager.extendDeadline(task.id, 1)).toThrow(
      'originating parent',
    );
    for (const extra of [0, -1, NaN, Infinity, 1.5])
      expect(() => manager.extendDeadline(task.id, extra, 'parent')).toThrow(
        'positive integer',
      );
    expect(() => manager.extendDeadline(task.id, 1, 'parent')).toThrow(
      'ceiling already reached',
    );
    manager.cancel(task.id);
    expect(() => manager.extendDeadline(task.id, 1, 'parent')).toThrow(
      'not running',
    );
    await vi.advanceTimersByTimeAsync(10000);
    expect(attention).not.toHaveBeenCalled();
  });

  it('tolerates checkpoint enqueue failure and disabled progress channels', async () => {
    const { task, attention, steering } = await fixture();
    steering.mockRejectedValueOnce(new Error('steering failed'));
    await vi.advanceTimersByTimeAsync(800);
    expect(attention).toHaveBeenCalledOnce();
    expect(task.status).toBe('running');
    await vi.advanceTimersByTimeAsync(200);
    const disabled = await fixture({ enable_ask_orchestrator: false });
    await vi.advanceTimersByTimeAsync(800);
    expect(disabled.steering).not.toHaveBeenCalled();
    expect(disabled.attention).toHaveBeenCalledOnce();
    expect(disabled.task.status).toBe('running');
  });

  it('registers the root extension tool and verifies its caller identity', async () => {
    const { manager, task } = await fixture();
    const tools: any[] = [];
    registerSubagentTools(
      { registerTool: (tool: any) => tools.push(tool) },
      manager,
      env.tmp,
    );
    const tool = tools.find((tool) => tool.name === 'subagent_extend');
    expect(tool).toBeDefined();
    const denied = await tool.execute(
      'call',
      { task_id: task.id },
      undefined,
      undefined,
      { sessionId: 'foreign' },
    );
    expect(denied.isError).toBe(true);
    const extended = await tool.execute(
      'call',
      { task_id: task.id },
      undefined,
      undefined,
      { sessionId: 'parent' },
    );
    expect(extended.details).toMatchObject({
      added_ms: 1000,
      extensions_used: 1,
    });
  });

  it('exposes bounded partial context in timeout completion and result, without claiming a checkpoint', async () => {
    const { manager, task } = await fixture({ enable_continue: true });
    manager.reportProgress(
      task.id,
      'discard-prefix' + 'p'.repeat(4000) + 'checkpoint-tail',
    );
    task.output_preview =
      'discard-preview-prefix' + 'x'.repeat(4000) + 'preview-tail';
    const nested = path.join(env.tmp, 'child.jsonl');
    fs.writeFileSync(nested, '{}');
    task.nested_session_path = nested;
    const attention = attentionMessage(task);
    expect(attention).toContain('checkpoint-tail');
    expect(attention).toContain('preview-tail');
    expect(attention).not.toContain('discard-prefix');
    expect(attention).not.toContain('discard-preview-prefix');
    expect(attention.length).toBeLessThan(4000);
    await vi.advanceTimersByTimeAsync(1000);
    const notification = completionMessage({ ...task, cwd: env.tmp }, true);
    const result = await createSubagentResultTool(manager).execute(
      'call',
      { task_id: task.id },
      undefined,
      undefined,
      { cwd: env.tmp },
    );
    const send = vi.fn();
    sendSubagentCompletionMessage({ sendMessage: send }, task, env.tmp);
    for (const text of [
      notification,
      (result.details as Record<string, unknown>).full_result,
      send.mock.calls[0][0].details.full_result,
    ]) {
      expect(text).toContain('timed out after 1000ms');
      expect(text).toContain('## Partial context');
      expect(text).toContain('checkpoint-tail');
      expect(text).toContain('preview-tail');
      expect(text).toContain('Extensions used: 0');
      expect(text).toContain('Nested session: available');
      expect(text).toContain('subagent_continue: enabled');
      expect(text).not.toContain('discard-prefix');
      expect(text).not.toContain('discard-preview-prefix');
      expect(text.length).toBeLessThan(5000);
    }
    expect(task.error_metadata).toMatchObject({
      category: 'total_timeout',
      retryable: false,
    });
  });

  it('resets deadline state on continuation and cancels both timers on early completion', async () => {
    const { manager, task, attention } = await fixture({
      enable_continue: true,
    });
    const nested = path.join(env.tmp, 'resume.jsonl');
    fs.writeFileSync(nested, '{}');
    task.nested_session_path = nested;
    manager.extendDeadline(task.id, 1000, 'parent');
    await vi.advanceTimersByTimeAsync(2000);
    expect(task.status).toBe('failed');
    await manager.continueTask(
      { task_id: task.id, prompt: 'continue', mode: 'background' },
      { cwd: env.tmp, sessionId: 'parent' },
    );
    await vi.advanceTimersByTimeAsync(0);
    const resumed = manager.getTask(task.id)!;
    expect(resumed).toMatchObject({
      attempt: 2,
      timeout_extensions_used: 0,
      timeout_deadline_generation: 1,
    });
    await vi.advanceTimersByTimeAsync(799);
    expect(attention).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(attention).toHaveBeenCalledTimes(2);
    manager.cancel(task.id);
    await vi.advanceTimersByTimeAsync(10000);
    expect(attention).toHaveBeenCalledTimes(2);

    const finishedAttention = vi.fn();
    const finished = env.createManager(
      env.mockRunner(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      finishedAttention,
    );
    await finished.run(
      { agent: 'worker', task: 'fast', mode: 'background' },
      { cwd: env.tmp, sessionId: 'parent' },
    );
    await vi.advanceTimersByTimeAsync(10000);
    expect(finishedAttention).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns history-backed timeout partial context after the runtime closes', async () => {
    const { manager, task } = await fixture();
    manager.reportProgress(
      task.id,
      'done: checkpoint persisted; pending: finish',
    );
    manager.extendDeadline(task.id, 1000, 'parent');
    await vi.advanceTimersByTimeAsync(2000);
    await manager.close();
    const reopened = env.createManager();
    const response = await createSubagentResultTool(reopened).execute(
      'call',
      { task_id: task.id },
      undefined,
      undefined,
      { cwd: env.tmp },
    );
    expect(response.content[0].text).toContain('checkpoint persisted');
    expect(response.content[0].text).toContain('partial output');
    expect(response.content[0].text).toContain('Extensions used: 1');
    expect(response.content[0].text).toContain('subagent_continue: disabled');
  });

  it('keeps the per-attempt ceiling while a task-mode interaction is pending', async () => {
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
    const runner: SubagentRunner = async () => ({
      result: 'awaiting confirmation',
      model: 'mock/model',
      fallback_used: false,
      interaction_request: {
        type: 'interaction_required',
        requestId: 'confirmation',
        kind: 'confirm',
        prompt: { message: 'Continue?' },
      },
    });
    const attention = vi.fn();
    const manager = env.createManager(
      runner,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      attention,
    );
    const steering = vi.spyOn(manager, 'sendMessage');
    const run = manager.run(
      { agent: 'worker', task: 'work', mode: 'task' },
      {
        cwd: env.tmp,
        sessionId: 'parent',
        ui: { confirm: () => new Promise(() => {}) },
      },
    );
    await vi.advanceTimersByTimeAsync(800);
    expect(attention).toHaveBeenCalledOnce();
    expect(steering).toHaveBeenCalledOnce();
    expect(await steering.mock.results[0].value).toMatchObject({
      reason: 'not_background',
    });
    await vi.advanceTimersByTimeAsync(250);
    const task = manager.listActiveSessionTasks(env.tmp, 'parent')[0];
    expect(task).toMatchObject({
      status: 'failed',
      error_metadata: { category: 'total_timeout' },
    });
    await expect(run).resolves.toMatchObject({
      results: [{ status: 'failed' }],
    });
  });

  it('tolerates a synchronous checkpoint transport throw', async () => {
    const { task, attention, steering } = await fixture();
    steering.mockImplementationOnce(() => {
      throw new Error('transport threw');
    });
    await vi.advanceTimersByTimeAsync(800);
    expect(attention).toHaveBeenCalledOnce();
    expect(task.status).toBe('running');
  });
  it('does not overflow native timers when an extension exceeds the timer delay limit', async () => {
    const { manager, task, attention } = await fixture({
      max_total_timeout_ms: 3000000000,
    });
    expect(manager.extendDeadline(task.id, 3000000000, 'parent')).toMatchObject(
      { added_ms: 2999999000 },
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(task.status).toBe('running');
    expect(attention).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2999999799);
    expect(attention).toHaveBeenCalledOnce();
    expect(task.status).toBe('running');
    await vi.advanceTimersByTimeAsync(200);
    expect(task.status).toBe('failed');
  });
});
