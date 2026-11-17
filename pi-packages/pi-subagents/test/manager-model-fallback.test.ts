import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  normalizeErrorMetadata,
  SubagentStructuredError,
} from '../src/error-metadata.js';
import { SubagentHistoryStore } from '../src/history.js';
import { SubagentManager } from '../src/manager.js';
import { completionMessage } from '../src/render/completion-message.js';
import type { SubagentRunner } from '../src/types.js';

let tmp: string;
let sessionFile: string;
let oldAgentDir: string | undefined;
let oldHistoryDb: string | undefined;
const managers = new Set<SubagentManager>();
const stores = new Set<SubagentHistoryStore>();

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-subagents-fallback-'));
  oldAgentDir = process.env.PI_CODING_AGENT_DIR;
  oldHistoryDb = process.env.PI_SUBAGENTS_HISTORY_DB_PATH;
  process.env.PI_CODING_AGENT_DIR = path.join(tmp, 'agent');
  process.env.PI_SUBAGENTS_HISTORY_DB_PATH = path.join(tmp, 'history.sqlite');
  fs.mkdirSync(path.join(tmp, '.pi', 'subagents'), { recursive: true });
  sessionFile = path.join(tmp, 'nested-session.jsonl');
  fs.writeFileSync(sessionFile, '');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.allSettled([...managers].map((manager) => manager.close()));
  managers.clear();
  for (const store of stores) store.close();
  stores.clear();
  if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
  if (oldHistoryDb === undefined)
    delete process.env.PI_SUBAGENTS_HISTORY_DB_PATH;
  else process.env.PI_SUBAGENTS_HISTORY_DB_PATH = oldHistoryDb;
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeAgent(extra = 'fallback_models:\n  - p/two\n  - p/three') {
  fs.writeFileSync(
    path.join(tmp, '.pi', 'subagents', 'worker.md'),
    `---\nname: worker\ndescription: worker agent\nmodel: p/one\n${extra}\ntools:\n  - read\n---\n# Worker`,
  );
}

function writeConfig(config: Record<string, unknown> = {}) {
  fs.writeFileSync(
    path.join(tmp, '.pi', 'subagents.json'),
    JSON.stringify({ enable_continue: true, ...config }),
  );
}

function failure(
  category:
    | 'provider_api_error'
    | 'provider_rate_limit'
    | 'provider_network_error'
    | 'provider_auth_error'
    | 'context_overflow'
    | 'stall_timeout',
  message = `${category} fixture`,
) {
  return new SubagentStructuredError(
    normalizeErrorMetadata({
      category,
      message,
      phase: 'runner_invoke',
      partial_result_available: false,
    }),
  );
}

function createManager(runner: SubagentRunner) {
  const history = new SubagentHistoryStore();
  stores.add(history);
  const manager = new SubagentManager(runner, history);
  managers.add(manager);
  return { manager, history };
}

const modelOf = (input: Parameters<SubagentRunner>[0]) =>
  `${input.effectiveProfile?.model.value?.provider}/${input.effectiveProfile?.model.value?.id}`;

function scripted(
  outcomes: Array<
    'ok' | Error | ((input: Parameters<SubagentRunner>[0]) => never)
  >,
) {
  const calls: Array<Parameters<SubagentRunner>[0]> = [];
  const runner: SubagentRunner = async (input) => {
    calls.push(input);
    input.onActivity?.({
      message: 'nested session ready',
      nested_session_path: sessionFile,
    });
    const outcome = outcomes[calls.length - 1] ?? 'ok';
    if (typeof outcome === 'function') return outcome(input);
    if (outcome !== 'ok') throw outcome;
    return {
      result: `done on ${modelOf(input)}`,
      model: modelOf(input),
      fallback_used: input.effectiveProfile?.model.source === 'fallback',
    };
  };
  return { runner, calls };
}

it.each([
  'provider_api_error',
  'provider_rate_limit',
  'provider_network_error',
  'provider_auth_error',
] as const)('continues the same session on the next model after %s', async (category) => {
  writeAgent();
  writeConfig();
  const { runner, calls } = scripted([failure(category, 'first model down')]);
  const { manager, history } = createManager(runner);
  const updates: string[] = [];
  const run = await manager.run(
    { agent: 'worker', task: 'delegated work', mode: 'task' },
    { cwd: tmp },
    undefined,
    (tasks) => updates.push(...tasks.map((task) => task.model ?? '')),
  );
  const task = run.results![0];
  expect(task.status).toBe('completed');
  expect(calls).toHaveLength(2);
  expect(modelOf(calls[0])).toBe('p/one');
  expect(calls[0].continuation).toBeUndefined();
  expect(modelOf(calls[1])).toBe('p/two');
  expect(calls[1].effectiveProfile?.model.source).toBe('fallback');
  expect(calls[1].effectiveProfile?.fallbackModels).toEqual([
    { provider: 'p', id: 'two' },
    { provider: 'p', id: 'three' },
  ]);
  // Same persisted session, short continuation instead of the delegated task.
  expect(calls[1].nested_session_path).toBe(sessionFile);
  expect(calls[1].continuation?.attempt).toBe(2);
  expect(calls[1].continuation?.prompt).toContain('p/one');
  expect(calls[1].continuation?.prompt).toContain('p/two');
  expect(calls[1].continuation?.prompt).not.toContain('delegated work');
  expect(task.id).toBe(run.task_ids[0]);
  expect(task).toMatchObject({
    model: 'p/two',
    model_source: 'fallback',
    fallback_used: true,
    attempt: 2,
    result: 'done on p/two',
  });
  expect(task.fallback_attempts).toEqual([
    expect.objectContaining({ attempt: 1, model: 'p/one', category }),
  ]);
  expect(updates).toContain('p/two');
  // One history attempt row per model, with the classified failure.
  const attempts = history.listTaskAttempts(tmp, task.id);
  expect(attempts.map((a) => [a.attempt, a.model, a.status])).toEqual([
    [1, 'p/one', 'failed'],
    [2, 'p/two', 'completed'],
  ]);
  expect(attempts[0].error_metadata?.category).toBe(category);
  expect(attempts[0].error).toContain(category.replace(/_/g, ' '));
  expect(attempts[1].fallback_used).toBe(true);
  const message = completionMessage(task, false);
  expect(message).toContain('Model fallback:');
  expect(message).toContain(`- p/one failed (${category}): first model down`);
  expect(message).toContain('- continued on p/two');
});

it.each([
  ['context_overflow', failure('context_overflow')],
  ['stall_timeout', failure('stall_timeout')],
  ['plain error', new Error('boom')],
  ['aborted marker', new Error('Subagent was aborted')],
])('does not switch models for %s', async (_name, error) => {
  writeAgent();
  writeConfig();
  const { runner, calls } = scripted([error]);
  const { manager } = createManager(runner);
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp },
  );
  const task = run.results![0];
  expect(calls).toHaveLength(1);
  expect(task.status).toBe('failed');
  expect(task.fallback_attempts).toBeUndefined();
  expect(task.fallback_used).toBeUndefined();
  expect(task.attempt ?? 1).toBe(1);
});

it('does not switch for non-retryable request failures other than auth', async () => {
  writeAgent();
  writeConfig();
  const { runner, calls } = scripted([
    new SubagentStructuredError(
      normalizeErrorMetadata({
        category: 'provider_api_error',
        message: 'prompt-capture: bad request',
        retryable: false,
        phase: 'runner_invoke',
        partial_result_available: false,
      }),
    ),
  ]);
  const { manager } = createManager(runner);
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp },
  );
  expect(calls).toHaveLength(1);
  expect(run.results![0].status).toBe('failed');
});

it('fails with the last exact error once the chain is exhausted and lists every failed model', async () => {
  writeAgent();
  writeConfig();
  const { runner, calls } = scripted([
    failure('provider_api_error', 'one failed'),
    failure('provider_rate_limit', 'two failed'),
    failure('provider_network_error', 'three failed'),
  ]);
  const { manager, history } = createManager(runner);
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp },
  );
  const task = run.results![0];
  expect(calls.map(modelOf)).toEqual(['p/one', 'p/two', 'p/three']);
  expect(task.status).toBe('failed');
  expect(task.error).toBe('provider network error');
  expect(task.error_metadata).toMatchObject({
    category: 'provider_network_error',
    message: 'three failed',
  });
  expect(task.fallback_attempts?.map((a) => a.model)).toEqual([
    'p/one',
    'p/two',
  ]);
  expect(task.fallback_used).toBe(true);
  expect(
    history.listTaskAttempts(tmp, task.id).map((a) => [a.model, a.status]),
  ).toEqual([
    ['p/one', 'failed'],
    ['p/two', 'failed'],
    ['p/three', 'failed'],
  ]);
  const message = completionMessage(task, false);
  expect(message).toContain('- p/one failed (provider_api_error): one failed');
  expect(message).toContain('- p/two failed (provider_rate_limit): two failed');
});

it('applies no fallback without a configured chain', async () => {
  writeAgent('');
  writeConfig();
  const { runner, calls } = scripted([failure('provider_rate_limit')]);
  const { manager } = createManager(runner);
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp },
  );
  const task = run.results![0];
  expect(calls).toHaveLength(1);
  expect(task.status).toBe('failed');
  expect(task.fallback_attempts).toBeUndefined();
  expect(task.fallback_used).toBeUndefined();
});

it('uses subagents.json default_fallback_models when nothing else configures a chain', async () => {
  writeAgent('');
  writeConfig({ default_fallback_models: ['p/one', 'cfg/backup'] });
  const { runner, calls } = scripted([failure('provider_api_error')]);
  const { manager } = createManager(runner);
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp },
  );
  expect(calls.map(modelOf)).toEqual(['p/one', 'cfg/backup']);
  expect(run.results![0].status).toBe('completed');
});

it('disables the chain for an explicit subagent_continue model override but keeps it otherwise', async () => {
  writeAgent();
  writeConfig();
  const first = scripted(['ok']);
  const { manager } = createManager(first.runner);
  const initial = await manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp },
  );
  const taskId = initial.task_ids[0];

  // Without override the configured chain still applies.
  const outcomes: Array<'ok' | Error> = [failure('provider_rate_limit'), 'ok'];
  const seen: string[] = [];
  const manager2Runner: SubagentRunner = async (input) => {
    seen.push(modelOf(input));
    const outcome = outcomes.shift() ?? 'ok';
    if (outcome !== 'ok') throw outcome;
    return { result: 'continued', model: modelOf(input), fallback_used: false };
  };
  (manager as any).runner = manager2Runner;
  const viaChain = await manager.continueTask(
    { task_id: taskId, prompt: 'more', mode: 'task' },
    { cwd: tmp },
  );
  expect(seen).toEqual(['p/one', 'p/two']);
  expect(viaChain.results![0].status).toBe('completed');

  // Explicit override: no fallback, the failure surfaces as-is.
  seen.length = 0;
  outcomes.push(failure('provider_rate_limit'), 'ok');
  const overridden = await manager.continueTask(
    { task_id: taskId, prompt: 'again', model: 'p/chosen', mode: 'task' },
    { cwd: tmp },
  );
  expect(seen).toEqual(['p/chosen']);
  expect(overridden.results![0].status).toBe('failed');
  expect(overridden.results![0].fallback_attempts).toBeUndefined();
});

it('stops without starting the next model when the task is cancelled at the transition', async () => {
  writeAgent();
  writeConfig();
  let managerRef!: SubagentManager;
  const { runner, calls } = scripted([
    (input) => {
      managerRef.cancel(input.taskId!, 'user cancel');
      throw failure('provider_rate_limit');
    },
  ]);
  const created = createManager(runner);
  managerRef = created.manager;
  const run = await created.manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp },
  );
  expect(calls).toHaveLength(1);
  expect(run.results![0].status).toBe('cancelled');
  expect(run.results![0].fallback_attempts).toBeUndefined();
});

it('stops when the parent signal aborts before the transition', async () => {
  writeAgent();
  writeConfig();
  const controller = new AbortController();
  const { runner, calls } = scripted([
    () => {
      controller.abort();
      throw failure('provider_network_error');
    },
  ]);
  const { manager } = createManager(runner);
  await manager
    .run(
      { agent: 'worker', task: 'work', mode: 'task' },
      { cwd: tmp },
      controller.signal,
    )
    .catch(() => undefined);
  expect(calls).toHaveLength(1);
});

it('does not start another model once the total task deadline has elapsed', async () => {
  writeAgent();
  writeConfig({ timeout_ms: 600_000 });
  const realNow = Date.now();
  const { runner, calls } = scripted([
    () => {
      // Deterministic: the clock jumps past the single task-wide deadline.
      vi.spyOn(Date, 'now').mockReturnValue(realNow + 3_600_000);
      throw failure('provider_rate_limit', 'late failure');
    },
  ]);
  const { manager } = createManager(runner);
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp },
  );
  vi.restoreAllMocks();
  expect(calls).toHaveLength(1);
  expect(run.results![0].status).toBe('failed');
  expect(run.results![0].error_metadata?.message).toBe('late failure');
});

it('keeps one task-wide deadline across fallback attempts', async () => {
  writeAgent();
  writeConfig({ timeout_ms: 600_000 });
  const deadlines: Array<number | undefined> = [];
  let managerRef!: SubagentManager;
  const { runner } = scripted([
    (input) => {
      deadlines.push(managerRef.getTask(input.taskId!)?.timeout_deadline_at);
      throw failure('provider_api_error');
    },
    (input) => {
      deadlines.push(managerRef.getTask(input.taskId!)?.timeout_deadline_at);
      throw failure('provider_api_error');
    },
  ]);
  const created = createManager(runner);
  managerRef = created.manager;
  await created.manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp },
  );
  expect(deadlines).toHaveLength(2);
  expect(deadlines[0]).toBeDefined();
  expect(deadlines[1]).toBe(deadlines[0]);
});

it('runs the original task on the next model when no session exists to reopen', async () => {
  writeAgent();
  writeConfig();
  const calls: Array<Parameters<SubagentRunner>[0]> = [];
  const runner: SubagentRunner = async (input) => {
    calls.push(input);
    if (calls.length === 1) throw failure('provider_auth_error');
    return { result: 'ok', model: modelOf(input), fallback_used: true };
  };
  const { manager } = createManager(runner);
  const run = await manager.run(
    { agent: 'worker', task: 'delegated work', mode: 'task' },
    { cwd: tmp },
  );
  expect(run.results![0].status).toBe('completed');
  expect(calls[1].continuation).toBeUndefined();
  expect(calls[1].nested_session_path).toBeUndefined();
  expect(calls[1].task).toBe('delegated work');
});

it.each([
  'cancel',
  'deadline',
] as const)('does not invoke the fallback runner or commit pending transition state after %s in the fallback update callback', async (stop) => {
  writeAgent();
  writeConfig({ timeout_ms: 600_000 });
  const { runner, calls } = scripted([failure('provider_rate_limit')]);
  const { manager, history } = createManager(runner);
  let stopped = false;
  let pendingSnapshot:
    | { model?: string; attempt?: number; fallback_used?: boolean }
    | undefined;
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp },
    undefined,
    (tasks) => {
      const task = tasks.find((entry) =>
        entry.last_activity?.includes('model fallback pending'),
      );
      if (!task || stopped) return;
      stopped = true;
      pendingSnapshot = {
        model: task.model,
        attempt: task.attempt,
        fallback_used: task.fallback_used,
      };
      if (stop === 'cancel') manager.cancel(task.id, 'callback cancellation');
      else vi.spyOn(Date, 'now').mockReturnValue(task.timeout_deadline_at! + 1);
    },
  );
  const task = run.results![0];
  expect(stopped).toBe(true);
  expect(pendingSnapshot).toEqual({
    model: 'p/one',
    attempt: 1,
    fallback_used: undefined,
  });
  expect(calls).toHaveLength(1);
  expect(task.status).toBe(stop === 'cancel' ? 'cancelled' : 'failed');
  expect(task.error_metadata?.category).toBe(
    stop === 'cancel' ? 'cancelled' : 'total_timeout',
  );
  expect(task.model).toBe('p/one');
  expect(task.model_source).toBe('definition');
  expect(task.fallback_used).toBeUndefined();
  expect(task.attempt).toBe(1);
  expect(task.fallback_attempts).toBeUndefined();
  expect(
    history
      .listTaskAttempts(tmp, task.id)
      .map((a) => [a.attempt, a.model, a.status, a.fallback_used]),
  ).toEqual([
    [1, 'p/one', stop === 'cancel' ? 'cancelled' : 'failed', undefined],
  ]);
  const message = completionMessage(task, false);
  expect(message).not.toContain('p/two');
  expect(message).not.toContain('continued on');
  expect(message).not.toContain('Model fallback:');
});

it('retains only actually-executed fallback attempts when stopped before a third model', async () => {
  writeAgent();
  writeConfig({ timeout_ms: 600_000 });
  const { runner, calls } = scripted([
    failure('provider_rate_limit', 'one limited'),
    failure('provider_api_error', 'two failed'),
  ]);
  const { manager, history } = createManager(runner);
  let stopped = false;
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp },
    undefined,
    (tasks) => {
      const task = tasks.find(
        (entry) =>
          entry.last_activity?.includes('model fallback pending') &&
          entry.last_activity.includes('p/three'),
      );
      if (!task || stopped) return;
      stopped = true;
      manager.cancel(task.id, 'stop before third');
    },
  );
  const task = run.results![0];
  expect(stopped).toBe(true);
  expect(calls.map(modelOf)).toEqual(['p/one', 'p/two']);
  expect(task.status).toBe('cancelled');
  expect(task.model).toBe('p/two');
  expect(task.model_source).toBe('fallback');
  expect(task.fallback_used).toBe(true);
  expect(task.attempt).toBe(2);
  expect(
    history
      .listTaskAttempts(tmp, task.id)
      .map((a) => [a.attempt, a.model, a.status, a.fallback_used]),
  ).toEqual([
    [1, 'p/one', 'failed', undefined],
    [2, 'p/two', 'cancelled', true],
  ]);
  const message = completionMessage(task, false);
  expect(message).toContain(
    '- p/one failed (provider_rate_limit): one limited',
  );
  expect(message).toContain(
    '- p/two cancelled (cancelled): Subagent cancelled: stop before third',
  );
  expect(message).not.toContain('continued on');
  expect(message).not.toContain('p/three');
});

it('reports the terminal model failure after an answered interaction and chain exhaustion with partial output', async () => {
  writeAgent('fallback_models:\n  - p/two');
  writeConfig();
  const calls: string[] = [];
  const runner: SubagentRunner = async (input) => {
    calls.push(modelOf(input));
    input.onActivity?.({
      message: 'session ready',
      nested_session_path: sessionFile,
    });
    if (calls.length === 1)
      return {
        result: 'partial work before question',
        model: modelOf(input),
        fallback_used: false,
        interaction_request: {
          type: 'interaction_required',
          requestId: 'fallback-question',
          kind: 'input',
          origin: 'subagent',
          prompt: { message: 'Which scope?' },
        },
      };
    throw calls.length === 2
      ? failure('provider_rate_limit', 'primary unavailable')
      : failure('provider_network_error', 'backup connection lost');
  };
  const answer = vi.fn(async () => 'local scope');
  const { manager } = createManager(runner);
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp, ui: { input: answer } },
  );
  expect(answer).toHaveBeenCalledOnce();
  expect(calls).toEqual(['p/one', 'p/one', 'p/two']);
  const task = run.results![0];
  expect(task.status).toBe('failed');
  expect(task.result).toBe('partial work before question');
  const message = completionMessage(task, false);
  expect(message).toContain(
    '- p/one failed (provider_rate_limit): primary unavailable',
  );
  expect(message).toContain(
    '- p/two failed (provider_network_error): backup connection lost',
  );
  expect(message).toContain('## partial response (task not completed)');
});

it.each([
  'cancel',
  'deadline',
] as const)('never leaks the undispatched fallback model when %s occurs during the failed-attempt history write', async (stop) => {
  writeAgent();
  writeConfig({ timeout_ms: 600_000 });
  const { runner, calls } = scripted([
    failure('provider_rate_limit', 'one limited'),
  ]);
  const { manager, history } = createManager(runner);
  const originalUpsert = history.upsertTask.bind(history);
  let injected = false;
  vi.spyOn(history, 'upsertTask').mockImplementation((taskCwd, taskRecord) => {
    if (
      !injected &&
      taskRecord.attempt === 1 &&
      taskRecord.status === 'failed' &&
      taskRecord.error_metadata?.category === 'provider_rate_limit'
    ) {
      injected = true;
      if (stop === 'cancel')
        manager.cancel(taskRecord.id, 'cancelled during failed write');
      else
        vi.spyOn(Date, 'now').mockReturnValue(
          taskRecord.timeout_deadline_at! + 1,
        );
    }
    return originalUpsert(taskCwd, taskRecord);
  });
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp },
  );
  const task = run.results![0];
  expect(injected).toBe(true);
  expect(calls.map(modelOf)).toEqual(['p/one']);
  expect(task.status).toBe(stop === 'cancel' ? 'cancelled' : 'failed');
  expect(task.error_metadata?.category).toBe(
    stop === 'cancel' ? 'cancelled' : 'total_timeout',
  );
  expect(task.model).toBe('p/one');
  expect(task.model_source).toBe('definition');
  expect(task.attempt).toBe(1);
  expect(task.fallback_used).toBeUndefined();
  expect(task.fallback_attempts).toBeUndefined();
  const attempts = history.listTaskAttempts(tmp, task.id);
  expect(
    attempts.map((a) => [a.attempt, a.model, a.status, a.fallback_used]),
  ).toEqual([
    [1, 'p/one', stop === 'cancel' ? 'cancelled' : 'failed', undefined],
  ]);
  expect(attempts[0].error_metadata?.category).toBe(
    stop === 'cancel' ? 'cancelled' : 'total_timeout',
  );
  const message = completionMessage(task, false);
  expect(message).not.toContain('p/two');
  expect(message).not.toContain('continued on');
  expect(message).not.toContain('Model fallback:');
});

it.each([
  'cancel',
  'deadline',
] as const)('reports only models that ran when %s occurs during a second failed-attempt history write', async (stop) => {
  writeAgent();
  writeConfig({ timeout_ms: 600_000 });
  const { runner, calls } = scripted([
    failure('provider_rate_limit', 'one limited'),
    failure('provider_api_error', 'two failed'),
  ]);
  const { manager, history } = createManager(runner);
  const originalUpsert = history.upsertTask.bind(history);
  let injected = false;
  vi.spyOn(history, 'upsertTask').mockImplementation((taskCwd, taskRecord) => {
    if (
      !injected &&
      taskRecord.attempt === 2 &&
      taskRecord.status === 'failed' &&
      taskRecord.error_metadata?.category === 'provider_api_error'
    ) {
      injected = true;
      if (stop === 'cancel')
        manager.cancel(taskRecord.id, 'cancelled during second failed write');
      else
        vi.spyOn(Date, 'now').mockReturnValue(
          taskRecord.timeout_deadline_at! + 1,
        );
    }
    return originalUpsert(taskCwd, taskRecord);
  });
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp },
  );
  const task = run.results![0];
  expect(injected).toBe(true);
  expect(calls.map(modelOf)).toEqual(['p/one', 'p/two']);
  expect(task.status).toBe(stop === 'cancel' ? 'cancelled' : 'failed');
  expect(task.error_metadata?.category).toBe(
    stop === 'cancel' ? 'cancelled' : 'total_timeout',
  );
  expect(task.model).toBe('p/two');
  expect(task.model_source).toBe('fallback');
  expect(task.attempt).toBe(2);
  expect(task.fallback_used).toBe(true);
  expect(task.fallback_attempts?.map((a) => a.model)).toEqual(['p/one']);
  const attempts = history.listTaskAttempts(tmp, task.id);
  expect(
    attempts.map((a) => [a.attempt, a.model, a.status, a.fallback_used]),
  ).toEqual([
    [1, 'p/one', 'failed', undefined],
    [2, 'p/two', stop === 'cancel' ? 'cancelled' : 'failed', true],
  ]);
  expect(attempts[1].error_metadata?.category).toBe(
    stop === 'cancel' ? 'cancelled' : 'total_timeout',
  );
  const message = completionMessage(task, false);
  expect(message).toContain(
    '- p/one failed (provider_rate_limit): one limited',
  );
  expect(message).toContain(
    stop === 'cancel'
      ? '- p/two cancelled (cancelled):'
      : '- p/two failed (total_timeout):',
  );
  expect(message).not.toContain('p/three');
  expect(message).not.toContain('continued on');
});

it.each([
  'cancel',
  'deadline',
] as const)('persists the next-attempt history row only after runner dispatch and reconciles %s during that write', async (stop) => {
  writeAgent();
  writeConfig({ timeout_ms: 600_000 });
  const calls: Array<Parameters<SubagentRunner>[0]> = [];
  const runner: SubagentRunner = async (input) => {
    calls.push(input);
    input.onActivity?.({
      message: 'nested session ready',
      nested_session_path: sessionFile,
    });
    if (calls.length === 1) throw failure('provider_rate_limit', 'one limited');
    return new Promise((_resolve, reject) => {
      if (input.signal.aborted) {
        reject(new Error('aborted'));
        return;
      }
      input.signal.addEventListener(
        'abort',
        () => reject(new Error('aborted')),
        { once: true },
      );
    });
  };
  const { manager, history } = createManager(runner);
  const originalUpsert = history.upsertTask.bind(history);
  let injected = false;
  let callsAtNextAttemptWrite = 0;
  vi.spyOn(history, 'upsertTask').mockImplementation((taskCwd, taskRecord) => {
    if (
      !injected &&
      taskRecord.attempt === 2 &&
      taskRecord.model === 'p/two' &&
      taskRecord.status === 'running'
    ) {
      injected = true;
      callsAtNextAttemptWrite = calls.length;
      if (stop === 'cancel')
        manager.cancel(taskRecord.id, 'cancelled during next-attempt write');
      else
        vi.spyOn(Date, 'now').mockReturnValue(
          taskRecord.timeout_deadline_at! + 1,
        );
    }
    return originalUpsert(taskCwd, taskRecord);
  });
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp },
  );
  const task = run.results![0];
  expect(injected).toBe(true);
  expect(callsAtNextAttemptWrite).toBe(2);
  expect(calls.map(modelOf)).toEqual(['p/one', 'p/two']);
  expect(task.status).toBe(stop === 'cancel' ? 'cancelled' : 'failed');
  expect(task.error_metadata?.category).toBe(
    stop === 'cancel' ? 'cancelled' : 'total_timeout',
  );
  expect(task.model).toBe('p/two');
  expect(task.model_source).toBe('fallback');
  expect(task.attempt).toBe(2);
  expect(task.fallback_used).toBe(true);
  expect(task.fallback_attempts?.map((a) => a.model)).toEqual(['p/one']);
  const attempts = history.listTaskAttempts(tmp, task.id);
  expect(
    attempts.map((a) => [a.attempt, a.model, a.status, a.fallback_used]),
  ).toEqual([
    [1, 'p/one', 'failed', undefined],
    [2, 'p/two', stop === 'cancel' ? 'cancelled' : 'failed', true],
  ]);
  expect(attempts[1].error_metadata?.category).toBe(
    stop === 'cancel' ? 'cancelled' : 'total_timeout',
  );
  const message = completionMessage(task, false);
  expect(message).toContain(
    '- p/one failed (provider_rate_limit): one limited',
  );
  expect(message).toContain(
    stop === 'cancel'
      ? '- p/two cancelled (cancelled):'
      : '- p/two failed (total_timeout):',
  );
  expect(message).not.toContain('p/three');
  expect(message).not.toContain('continued on');
});

it.each([
  ['history-write', 'microtask'],
  ['history-write', 'deferred'],
  ['update-callback', 'microtask'],
  ['update-callback', 'deferred'],
] as const)('reconciles as total_timeout instead of completed when expiry occurs during attempt-2 %s and runner settles via %s', async (injectAt, settlement) => {
  writeAgent();
  writeConfig({ timeout_ms: 600_000 });
  const calls: Array<Parameters<SubagentRunner>[0]> = [];
  let releaseSecondAttempt: (() => void) | undefined;
  const runner: SubagentRunner = async (input) => {
    calls.push(input);
    input.onActivity?.({
      message: 'nested session ready',
      nested_session_path: sessionFile,
    });
    if (calls.length === 1) throw failure('provider_rate_limit', 'one limited');
    input.onActivity?.({
      message: 'working on fallback',
      output: 'partial on two',
      nested_session_path: sessionFile,
    });
    if (settlement === 'microtask') {
      await Promise.resolve();
      return {
        result: 'late fallback completion',
        model: modelOf(input),
        fallback_used: true,
      };
    }
    return await new Promise((resolve) => {
      releaseSecondAttempt = () =>
        resolve({
          result: 'late fallback completion',
          model: modelOf(input),
          fallback_used: true,
        });
    });
  };
  const { manager, history } = createManager(runner);
  let injected = false;
  const injectExpiry = (deadlineAt: number) => {
    if (injected) return;
    injected = true;
    vi.spyOn(Date, 'now').mockReturnValue(deadlineAt + 1);
    if (settlement === 'deferred')
      queueMicrotask(() => releaseSecondAttempt?.());
  };
  if (injectAt === 'history-write') {
    const originalUpsert = history.upsertTask.bind(history);
    vi.spyOn(history, 'upsertTask').mockImplementation(
      (taskCwd, taskRecord) => {
        if (
          taskRecord.attempt === 2 &&
          taskRecord.model === 'p/two' &&
          taskRecord.status === 'running'
        )
          injectExpiry(taskRecord.timeout_deadline_at!);
        return originalUpsert(taskCwd, taskRecord);
      },
    );
  }
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    { cwd: tmp },
    undefined,
    injectAt === 'update-callback'
      ? (tasks) => {
          const entry = tasks.find(
            (item) =>
              item.attempt === 2 &&
              item.model === 'p/two' &&
              item.status === 'running',
          );
          if (entry) injectExpiry(entry.timeout_deadline_at!);
        }
      : undefined,
  );
  const task = run.results![0];
  expect(injected).toBe(true);
  expect(calls.map(modelOf)).toEqual(['p/one', 'p/two']);
  expect(task.status).toBe('failed');
  expect(task.error).toBe('timed out after 600000ms');
  expect(task.error_metadata).toMatchObject({
    category: 'total_timeout',
    retryable: false,
    partial_result_available: true,
  });
  expect(task.result).toBeUndefined();
  expect(task.output_preview).toBe('partial on two');
  expect(task.model).toBe('p/two');
  expect(task.model_source).toBe('fallback');
  expect(task.attempt).toBe(2);
  expect(task.fallback_used).toBe(true);
  expect(task.fallback_attempts?.map((a) => a.model)).toEqual(['p/one']);
  const attempts = history.listTaskAttempts(tmp, task.id);
  expect(
    attempts.map((a) => [a.attempt, a.model, a.status, a.fallback_used]),
  ).toEqual([
    [1, 'p/one', 'failed', undefined],
    [2, 'p/two', 'failed', true],
  ]);
  expect(attempts[1].error_metadata?.category).toBe('total_timeout');
  const message = completionMessage({ ...task, cwd: tmp }, true);
  expect(message).toContain(
    '- p/one failed (provider_rate_limit): one limited',
  );
  expect(message).toContain(
    '- p/two failed (total_timeout): timed out after 600000ms',
  );
  expect(message).toContain('## Partial context (total timeout)');
  expect(message).toContain('partial on two');
  expect(message).toContain('Nested session: available');
  expect(message).toContain('subagent_continue: enabled');
  expect(message).not.toContain('late fallback completion');
  expect(message).not.toContain('p/three');
  expect(message).not.toContain('continued on');
});
