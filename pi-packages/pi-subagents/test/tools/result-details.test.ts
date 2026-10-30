import { describe, expect, it, vi } from 'vitest';
import { createSubagentCancelTool } from '../../src/tools/subagent-cancel.js';
import { createSubagentContinueTool } from '../../src/tools/subagent-continue.js';
import { createSubagentListTasksTool } from '../../src/tools/subagent-list-tasks.js';
import { createSubagentResultTool } from '../../src/tools/subagent-result.js';
import { createSubagentRunTool } from '../../src/tools/subagent-run.js';
import { createSubagentStatusTool } from '../../src/tools/subagent-status.js';
import type { SubagentTask } from '../../src/types.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();

function detailedTask(): SubagentTask & { future_payload: string } {
  return {
    id: 'subtask_bounded',
    display_name: 'Bounded task',
    agent: 'analyst',
    mode: 'task',
    effective_mode: 'task',
    status: 'completed',
    task: 'delegated task '.repeat(400),
    prompt: 'assembled prompt '.repeat(400),
    context: 'delegated context '.repeat(400),
    continuation_prompt: 'continuation prompt '.repeat(400),
    created_at: '2026-10-21T10:00:00.000Z',
    started_at: '2026-10-21T10:00:01.000Z',
    ended_at: '2026-10-21T10:00:03.000Z',
    last_activity_at: '2026-10-21T10:00:02.000Z',
    last_activity: 'checking payloads',
    attempt: 2,
    session_id: 'parent-session',
    nested_session_path: '/missing/child-session.jsonl',
    model: 'mock/model',
    effort: 'high',
    model_source: 'profile',
    effort_source: 'definition',
    fallback_used: false,
    dropped_tools: ['unavailable_tool'],
    notify_orchestrator_available: true,
    usage: {
      turns: 2,
      input: 100,
      output: 20,
      cacheRead: 10,
      cacheWrite: 5,
      cost: 0.125,
      contextTokens: 135,
    },
    runtime_metrics: {
      toolUses: 3,
      generationMs: 1000,
      generationOutputTokens: 20,
    },
    live_activity: {
      trail: [{ kind: 'tool_completed', label: 'read completed' }],
    },
    pending_message_count: 1,
    undelivered_message_count: 2,
    pending_questions: [
      { request_id: 'question-1', message: 'Which option?', created_at: 'now' },
    ],
    progress_updates: Array.from({ length: 7 }, (_, index) => ({
      message: `checkpoint ${index}`,
      created_at: `time-${index}`,
    })),
    timeout_started_at: 1000,
    timeout_deadline_at: 2000,
    timeout_extensions_used: 1,
    timeout_deadline_generation: 2,
    timeout_max_extensions: 3,
    timeout_continue_enabled: true,
    output_preview: 'partial output',
    result: 'Final response, preserved in full. '.repeat(100),
    error: 'safe legacy error',
    error_metadata: {
      version: 1,
      category: 'tool_failure',
      message: 'Tool failed',
      retryable: false,
      partial_result_available: true,
      details: {
        provider_code: '429',
        prompt: 'SYSTEM: SECRET_METADATA_PROMPT',
      },
    },
    stop_reason: 'stop',
    pi_retry_attempts: 2,
    transcript: 'SECRET_TRANSCRIPT',
    system_prompt: 'SECRET_SYSTEM_PROMPT',
    thread_snapshot: env.statusSnapshot('SECRET_SNAPSHOT'),
    future_payload: 'SECRET_FUTURE_FIELD',
  };
}

function expectBoundedDetails(
  details: any,
  task: SubagentTask,
  final: boolean,
) {
  for (const key of [
    'transcript',
    'system_prompt',
    'thread_snapshot',
    'future_payload',
  ]) {
    expect(details).not.toHaveProperty(key);
  }
  for (const key of [
    'task',
    'prompt',
    'context',
    'continuation_prompt',
  ] as const) {
    expect(details[key]).toHaveLength(2000);
    expect(details[key]).toBe(task[key]?.slice(0, 2000));
  }
  if (final) expect(details.result).toBe(task.result);
  else expect(details).not.toHaveProperty('result');
  expect(details).toMatchObject({
    id: task.id,
    display_name: task.display_name,
    agent: task.agent,
    status: task.status,
    attempt: 2,
    model: 'mock/model',
    effort: 'high',
    usage: task.usage,
    runtime_metrics: task.runtime_metrics,
    live_activity: task.live_activity,
    pending_questions: task.pending_questions,
    pending_question_count: 1,
    pending_message_count: 1,
    undelivered_message_count: 2,
    timeout_deadline_at: 2000,
    timeout_continue_enabled: true,
    dropped_tools: task.dropped_tools,
    notify_orchestrator_available: true,
    error_metadata: {
      category: 'tool_failure',
      details: { provider_code: '429' },
    },
  });
  expect(details.progress_updates).toEqual(task.progress_updates?.slice(-5));
  expect(JSON.stringify(details)).not.toContain('SECRET_');
}

describe('bounded subagent tool details', () => {
  it.each([
    'status',
    'list_tasks',
  ] as const)('keeps long delegated-task labels and %s model text unchanged', async (kind) => {
    const task: SubagentTask = {
      id: 'subtask_long',
      agent: 'analyst',
      mode: 'task',
      status: 'completed',
      task: `${' \n'.repeat(1100)}Release${' '.repeat(2100)}risk review ${'x'.repeat(3000)}`,
      created_at: '2026-10-21T10:00:00.000Z',
      result: 'Long prompt response',
    };
    const manager: any = {
      getTask: () => task,
      listSessionTasks: () => [task],
    };
    const tool =
      kind === 'status'
        ? createSubagentStatusTool(manager)
        : createSubagentListTasksTool(manager);
    const response: any = await tool.execute(
      kind,
      { task_id: task.id },
      undefined,
      undefined,
      { cwd: env.tmp },
    );
    const label = 'analyst · Release risk review xxxxxxxxxxxxxxxxxxx…';
    const expectedText =
      kind === 'status'
        ? [
            `task: ${label} · task_id: subtask_long · status: completed · attempt: 1`,
            'model: default/current · effort: default/current',
            'undelivered messages: 0',
            'last: n/a at 2026-10-21T10:00:00.000Z',
            'preview: Long prompt response',
          ]
        : [
            'Listed 1 subagent task(s).',
            `Most recent: ${label} · task_id: subtask_long · model: default/current · effort: default/current · status: completed`,
            'List view: collapsed · ctrl+o to expand',
          ];
    expect(response.content[0].text).toBe(expectedText.join('\n'));
    const details =
      kind === 'status' ? response.details.task : response.details.tasks[0];
    expect(details.task.length).toBeLessThanOrEqual(2000);
    const legacy = {
      ...response,
      details:
        kind === 'status'
          ? { task }
          : { tasks: [{ ...task, result: undefined }] },
    };
    const theme = {
      fg: (_n: string, text: string) => text,
      bold: (text: string) => text,
    };
    for (const expanded of [false, true]) {
      const render = (value: any) =>
        tool.renderResult(value, { expanded }, theme).render(180).join('\n');
      const rendered = render(response);
      expect(rendered).toBe(render(legacy));
      expect(rendered).toContain(label);
    }
  });

  it.each([
    0, 1999, 2000, 2001,
  ])('bounds previews of length %s without altering shorter input', async (length) => {
    const text = 'x'.repeat(length);
    const task = {
      ...detailedTask(),
      task: text,
      prompt: text,
      context: text,
      continuation_prompt: text,
    };
    const tool = createSubagentStatusTool({ getTask: () => task } as any);
    const response: any = await tool.execute(
      'boundary',
      { task_id: task.id },
      undefined,
      undefined,
      { cwd: env.tmp },
    );
    for (const key of ['task', 'prompt', 'context', 'continuation_prompt']) {
      expect(response.details.task[key]).toBe(
        'x'.repeat(Math.min(length, 2000)),
      );
    }
  });

  it.each([
    'result',
    'cancel',
    'list_tasks',
  ] as const)('projects subagent_%s without changing its model-facing text', async (kind) => {
    const task = detailedTask();
    const stageResultAcknowledgment = vi.fn();
    const manager: any = {
      getTask: () => task,
      cancel: () => task,
      listSessionTasks: () => [task],
      stageResultAcknowledgment,
    };
    const tool =
      kind === 'result'
        ? createSubagentResultTool(manager)
        : kind === 'cancel'
          ? createSubagentCancelTool(manager)
          : createSubagentListTasksTool(manager);
    const response: any = await tool.execute(
      kind,
      { task_id: task.id },
      undefined,
      undefined,
      { cwd: env.tmp },
    );

    expect(response.isError).not.toBe(true);
    const details =
      kind === 'list_tasks' ? response.details.tasks[0] : response.details.task;
    expectBoundedDetails(details, task, kind !== 'list_tasks');
    if (kind === 'list_tasks') {
      expect(details).not.toHaveProperty('error');
      expect(response.content[0].text).toBe(
        [
          'Listed 1 subagent task(s).',
          'Most recent: Bounded task · task_id: subtask_bounded · model: mock/model · effort: high · status: completed',
          'List view: collapsed · ctrl+o to expand',
          'task_id: subtask_bounded',
          'pending question · request_id: question-1 · Which option?',
          'progress: checkpoint 2',
          'progress: checkpoint 3',
          'progress: checkpoint 4',
          'progress: checkpoint 5',
          'progress: checkpoint 6',
        ].join('\n'),
      );
    } else if (kind === 'result') {
      expect(response.details.full_result).toBe(task.result);
      expect(response.content[0].text).toBe(
        `Warning: Dropped tools unavailable in the child session (missing implementation: unavailable_tool).\n\n${task.result}`,
      );
      expect(stageResultAcknowledgment).toHaveBeenCalledWith(
        kind,
        task,
        response.content,
      );
    } else {
      expect(response.content[0].text).toContain(
        'task: Bounded task · task_id: subtask_bounded · status: completed · attempt: 2',
      );
    }
  });

  it.each([
    'run',
    'continue',
  ] as const)('bounds %s background launch details', async (kind) => {
    const task = {
      ...detailedTask(),
      mode: 'background' as const,
      status: 'running' as const,
    };
    const launch = async () => ({ mode: 'background', task_ids: [task.id] });
    const manager: any = {
      getTask: () => task,
      run: launch,
      continueTask: launch,
    };
    const tool =
      kind === 'run'
        ? createSubagentRunTool(manager, undefined)
        : createSubagentContinueTool(manager, undefined);
    const onUpdate = vi.fn();
    const response: any = await tool.execute(
      kind,
      {
        agent: 'analyst',
        task: task.task,
        task_id: task.id,
        prompt: task.continuation_prompt,
        mode: 'background',
      },
      undefined,
      onUpdate,
      { cwd: env.tmp },
    );

    expect(response.isError).not.toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(response.details.mode).toBe('background');
    expect(response.details.task_ids).toEqual([task.id]);
    expectBoundedDetails(response.details.tasks[0], task, true);
  });

  it.each([
    'run',
    'continue',
  ] as const)('omits responses from %s progress but preserves final responses and background controls', async (kind) => {
    const task = detailedTask();
    const running = { ...task, status: 'running' as const };
    const finish = async (
      _params: any,
      _ctx: any,
      _signal: any,
      onUpdate: any,
    ) => {
      onUpdate([running]);
      onUpdate([task]);
      return { mode: 'task', task_ids: [task.id], results: [task] };
    };
    const manager: any = {
      getTask: () => task,
      onTaskUpdate: () => () => {},
      onQuestion: () => () => {},
      run: finish,
      continueTask: finish,
    };
    const tool =
      kind === 'run'
        ? createSubagentRunTool(manager, undefined)
        : createSubagentContinueTool(manager, undefined);
    const updates: any[] = [];
    const response: any = await tool.execute(
      kind,
      {
        agent: 'analyst',
        task: task.task,
        task_id: task.id,
        prompt: task.continuation_prompt,
        mode: 'task',
      },
      undefined,
      (update: any) => updates.push(update),
      { cwd: env.tmp },
    );

    expect(response.isError).not.toBe(true);
    expect(response.content[0].text).toContain(task.result);
    const taskUpdates = updates.filter((update) => update.details.tasks.length);
    expect(taskUpdates).toHaveLength(2);
    for (const [index, update] of taskUpdates.entries()) {
      expect(update.details).toMatchObject({
        frame: 0,
        backgroundable: true,
        backgroundShortcut: 'ctrl+h',
      });
      expectBoundedDetails(
        update.details.tasks[0],
        index === 0 ? running : task,
        false,
      );
    }
    expectBoundedDetails(response.details.results[0], task, true);
    if (kind === 'continue')
      expectBoundedDetails(response.details.task, task, true);
  });

  it('projects continuation failure details while leaving the failure text unchanged', async () => {
    const task = detailedTask();
    const manager: any = {
      getTask: () => task,
      continueTask: async () => {
        throw new Error('Continuation unavailable');
      },
    };
    const tool = createSubagentContinueTool(manager, undefined);
    const response: any = await tool.execute(
      'continue-error',
      { task_id: task.id, prompt: 'Retry', mode: 'background' },
      undefined,
      undefined,
      { cwd: env.tmp },
    );

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toBe('Continuation unavailable');
    expectBoundedDetails(response.details.tasks[0], task, true);
  });

  it('projects subagent_status through an explicit bounded allowlist', async () => {
    const task = detailedTask();
    const tool = createSubagentStatusTool({ getTask: () => task } as any);
    const response: any = await tool.execute(
      'status',
      { task_id: task.id },
      undefined,
      undefined,
      { cwd: env.tmp },
    );

    expect(response.isError).not.toBe(true);
    expect(response.content[0].text).toContain(
      'task: Bounded task · task_id: subtask_bounded · status: completed · attempt: 2',
    );
    expectBoundedDetails(response.details.task, task, true);
    // Projection must not mutate manager-owned execution detail.
    expect(task.transcript).toBe('SECRET_TRANSCRIPT');
    expect(task.prompt?.length).toBeGreaterThan(2000);
  });
});
