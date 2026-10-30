import { afterEach, expect, it, vi } from 'vitest';
import * as interactionChannel from '../../src/interaction-channel.js';
import { promptWithInactivity } from '../../src/runner/event-processing.js';
import {
  SubagentRuntimeMetricsTracker,
  ThreadSnapshotBuilder,
} from '../../src/runner/snapshot-builder.js';
import * as threadView from '../../src/thread-view.js';
import type { SubagentActivity } from '../../src/types.js';

function runningSession() {
  let emit: (event: unknown) => void = () => {};
  let finish: () => void = () => {};
  const session = {
    messages: [
      { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
    ] as unknown[],
    subscribe: (listener: typeof emit) => {
      emit = listener;
      return () => {};
    },
    prompt: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    dispose: vi.fn(),
  };
  const activities: SubagentActivity[] = [];
  const outcome = promptWithInactivity(
    session,
    'work',
    10000,
    new AbortController().signal,
    (activity) => activities.push(activity),
  );
  return {
    session,
    activities,
    outcome,
    event: (event: unknown) => emit(event),
    finish: () => finish(),
  };
}

afterEach(() => vi.restoreAllMocks());

it('projects canonical assistant content and usage exactly once at message completion', async () => {
  const run = runningSession();
  const message = {
    role: 'assistant',
    id: 'answer-1',
    content: [
      { type: 'thinking', thinking: 'canonical reasoning' },
      { type: 'text', text: 'canonical first paragraph' },
      { type: 'text', text: 'canonical second paragraph' },
    ],
    usage: { input: 11, output: 7, cost: { total: 0.02 } },
  };
  const text = 'canonical first paragraphcanonical second paragraph';
  try {
    run.event({ type: 'message_start', message: { role: 'assistant' } });
    run.event({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'incomplete draft' },
    });
    const before = run.activities.at(-1);
    const count = run.activities.length;
    run.event({ type: 'message_end', message });
    expect(run.activities).toHaveLength(count + 1);
    expect(run.activities.at(-1)).toMatchObject({
      message: 'assistant message completed',
      persist: false,
      output: text,
      transcript: `${before?.transcript}${text}`,
      usage: { input: 11, output: 7, cost: 0.02 },
      assistant_message: { id: 'answer-1', role: 'assistant' },
    });
    expect(run.activities.at(-1)?.thread_snapshot?.items).toContainEqual(
      expect.objectContaining({
        type: 'assistant',
        id: 'streaming-assistant-1',
        message: expect.objectContaining({
          content: [
            expect.objectContaining({
              type: 'thinking',
              thinking: 'canonical reasoning',
            }),
            expect.objectContaining({
              type: 'text',
              text,
            }),
          ],
        }),
      }),
    );
    expect(JSON.stringify(run.activities.at(-1))).not.toContain(
      'incomplete draft',
    );
  } finally {
    run.finish();
    await run.outcome;
  }
});

it.each([
  {
    content: [],
    expected: [
      [
        {
          type: 'thinking',
          text: 'completed reasoning',
          thinking: 'completed reasoning',
        },
        { type: 'text', text: 'completed answer' },
      ],
    ],
  },
  {
    content: [{ type: 'text', text: 'completed answer' }],
    expected: [
      [
        {
          type: 'thinking',
          text: 'completed reasoning',
          thinking: 'completed reasoning',
        },
      ],
      [{ type: 'text', text: 'completed answer' }],
    ],
  },
  {
    content: [{ type: 'thinking', thinking: 'completed reasoning' }],
    // HEAD drops live text when there is any projected session assistant.
    expected: [
      [
        {
          type: 'thinking',
          text: 'completed reasoning',
          thinking: 'completed reasoning',
        },
      ],
    ],
  },
])('uses HEAD selection without filling omitted session content (%j)', async ({
  content,
  expected,
}) => {
  const run = runningSession();
  const message = {
    role: 'assistant',
    content: [
      { type: 'thinking', thinking: 'completed reasoning' },
      { type: 'text', text: 'completed answer' },
    ],
  };
  run.event({ type: 'message_end', message });
  run.session.messages = [{ role: 'assistant', content }];
  run.finish();
  const result = await run.outcome;
  const assistantItems = result.thread_snapshot?.items.filter(
    (item) => item.type === 'assistant',
  );
  expect(assistantItems?.map((item) => item.message.content)).toEqual(expected);
  expect(run.activities.at(-1)?.transcript).toContain('completed answer');
});

it('does not use completed output as a final-answer fallback after tools, as HEAD did', async () => {
  const run = runningSession();
  run.session.messages = [];
  run.event({
    type: 'tool_execution_start',
    toolCallId: 'read-1',
    toolName: 'read',
  });
  run.event({
    type: 'tool_execution_end',
    toolCallId: 'read-1',
    toolName: 'read',
    result: { output: 'guide' },
  });
  run.event({
    type: 'message_end',
    message: { role: 'assistant', content: 'completed final answer' },
  });
  const outcome = expect(run.outcome).rejects.toMatchObject({
    error_metadata: { category: 'empty_response_after_tools' },
  });
  run.finish();
  await outcome;
  expect(run.activities.at(-1)?.transcript).toContain('completed final answer');
  expect(run.activities.at(-1)?.transcript).not.toContain(
    '# final assistant text',
  );
});

it('uses accumulated completed output without separators when session has no text and no tool ran', async () => {
  const run = runningSession();
  run.session.messages = [];
  run.event({
    type: 'message_end',
    message: { role: 'assistant', content: 'first' },
  });
  run.event({
    type: 'message_end',
    message: { role: 'assistant', content: 'final' },
  });
  run.finish();
  expect((await run.outcome).result).toBe('firstfinal');
  expect(run.activities.at(-1)?.transcript).toBe(
    '# delegated prompt\n\nwork\n\n# subagent execution\nfirstfinal\n\n# final assistant text\n\nfirstfinal',
  );
});

it.each([
  { messages: [], result: 'firstsecond' },
  {
    messages: [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'first' },
          { type: 'text', text: 'second' },
        ],
      },
    ],
    result: 'first\nsecond',
  },
])('concatenates completed text blocks like HEAD deltas but keeps session result formatting (%j)', async ({
  messages,
  result,
}) => {
  const run = runningSession();
  run.session.messages = messages;
  run.event({
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' },
      ],
    },
  });
  run.finish();
  expect((await run.outcome).result).toBe(result);
  expect(run.activities.at(-1)?.transcript).toBe(
    `# delegated prompt\n\nwork\n\n# subagent execution\nfirstsecond\n\n# final assistant text\n\n${result}`,
  );
});

it.each([
  { content: 'start interaction_required:secret payload end' },
  {
    content: [
      { type: 'text', text: 'start interaction_required:secret' },
      { type: 'text', text: ' payload end' },
    ],
  },
])('uses canonical sanitization, never the delta-fragmentation payload leak (%j)', async ({
  content,
}) => {
  const run = runningSession();
  run.session.messages = [];
  for (const delta of ['start interaction_required:secret', ' payload end'])
    run.event({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta },
    });
  run.event({ type: 'message_end', message: { role: 'assistant', content } });
  run.finish();
  const result = await run.outcome;
  expect(result.result).toBe('start [interaction request hidden]');
  expect(
    result.thread_snapshot?.items
      .filter((item) => item.type === 'assistant')
      .map((item) => item.message.content),
  ).toEqual([[{ type: 'text', text: 'start [interaction request hidden]' }]]);
  expect(run.activities.at(-1)?.transcript).toBe(
    '# delegated prompt\n\nwork\n\n# subagent execution\nstart [interaction request hidden]\n\n# final assistant text\n\nstart [interaction request hidden]',
  );
});

it('keeps transcript narration in event order through compaction without copying it to session rows', async () => {
  const run = runningSession();
  const call = { type: 'toolCall', id: 'read-1', name: 'read', arguments: {} };
  run.event({
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'old reasoning' },
        { type: 'text', text: 'old narration' },
      ],
    },
  });
  run.event({ type: 'compaction_start' });
  run.event({ type: 'compaction_end' });
  run.event({
    type: 'message_end',
    message: { role: 'assistant', content: [call] },
  });
  run.event({
    type: 'tool_execution_start',
    toolCallId: 'read-1',
    toolName: 'read',
    args: {},
  });
  run.event({
    type: 'tool_execution_end',
    toolCallId: 'read-1',
    toolName: 'read',
  });
  run.event({
    type: 'message_end',
    message: { role: 'assistant', content: 'final answer' },
  });
  run.session.messages = [
    { role: 'assistant', content: [call] },
    { role: 'assistant', content: 'final answer' },
  ];
  run.finish();
  const result = await run.outcome;
  expect(result.result).toBe('final answer');
  // Literal transcript from the delta-equivalent HEAD harness.
  expect(run.activities.at(-1)?.transcript).toBe(
    '# delegated prompt\n\nwork\n\n# subagent execution\nold narration\n\nread\n\ndone\nfinal answer\n\n# final assistant text\n\nfinal answer',
  );
  expect(JSON.stringify(result.thread_snapshot)).not.toContain('old narration');
  expect(run.activities.at(-1)?.transcript).not.toContain('old reasoning');
});

it.each([
  {
    partials: [],
    failed: false,
    result: { output: 'final output' },
    ending: '\n{"output":"final output"}\n\ndone\n',
  },
  {
    partials: ['partial-one'],
    failed: false,
    result: { output: 'final output' },
    ending: '\n{"output":"final output"}\n\ndone\n',
  },
  {
    partials: ['partial-one', 'partial-two'],
    failed: true,
    result: { output: 'final output' },
    ending: '\n{"output":"final output"}\n\nfailed\n',
  },
  {
    partials: ['partial-one', 'partial-two'],
    failed: false,
    result: undefined,
    ending: '\ndone\n',
  },
])('summarizes only the completed tool result once, with its done/failed marker (%j)', async ({
  partials,
  failed,
  result,
  ending,
}) => {
  const run = runningSession();
  const answer = { role: 'assistant', content: 'answer' };
  run.session.messages = [answer];
  run.event({
    type: 'tool_execution_start',
    toolCallId: 'read-1',
    toolName: 'read',
    args: {},
  });
  for (const output of partials)
    run.event({
      type: 'tool_execution_update',
      toolCallId: 'read-1',
      toolName: 'read',
      partialResult: { output },
    });
  run.event({
    type: 'tool_execution_end',
    toolCallId: 'read-1',
    toolName: 'read',
    result,
    isError: failed,
  });
  run.event({ type: 'message_end', message: answer });
  run.finish();
  expect((await run.outcome).result).toBe('answer');
  expect(run.activities.at(-1)?.transcript).toBe(
    `# delegated prompt\n\nwork\n\n# subagent execution\n\n\nread\n${ending}answer\n\n# final assistant text\n\nanswer`,
  );
});

it('keeps canonical assistant text, thinking and tool content in the completed run', async () => {
  const run = runningSession();
  const planning = {
    role: 'assistant',
    id: 'plan',
    content: [
      { type: 'thinking', thinking: 'Check the guide first' },
      { type: 'text', text: 'Planning' },
      {
        type: 'toolCall',
        id: 'read-1',
        name: 'read',
        arguments: { path: 'guide.md' },
      },
    ],
  };
  const answer = { role: 'assistant', id: 'answer', content: 'Final answer' };
  run.session.messages = [planning, answer];
  run.event({ type: 'message_end', message: planning });
  run.event({
    type: 'tool_execution_start',
    toolCallId: 'read-1',
    toolName: 'read',
    args: { path: 'guide.md' },
  });
  run.event({
    type: 'tool_execution_update',
    toolCallId: 'read-1',
    partialResult: { output: 'discard partial' },
  });
  run.event({
    type: 'tool_execution_end',
    toolCallId: 'read-1',
    toolName: 'read',
    result: { output: '# Guide', exitCode: 0 },
  });
  run.event({ type: 'message_end', message: answer });
  run.event({ type: 'turn_end' });
  const boundarySnapshot = run.activities.at(-1)?.thread_snapshot;
  run.finish();
  const result = await run.outcome;
  expect(result.result).toBe('Final answer');
  expect(result.thread_snapshot?.items.map((item) => item.type)).toEqual([
    'attempt',
    'user',
    'assistant',
    'tool',
    'assistant',
  ]);
  // Live assistant rows carry only narration/thinking. Final session rows also
  // retain canonical tool-call blocks, exactly as HEAD did at finalization.
  expect(boundarySnapshot?.items[2]).toMatchObject({
    message: {
      content: [
        {
          type: 'thinking',
          thinking: 'Check the guide first',
          text: 'Check the guide first',
        },
        { type: 'text', text: 'Planning' },
      ],
    },
  });
  expect(result.thread_snapshot?.items[3]).toEqual(boundarySnapshot?.items[3]);
  expect(result.thread_snapshot?.items[2]).toMatchObject({
    message: {
      content: [
        {
          type: 'thinking',
          thinking: 'Check the guide first',
          text: 'Check the guide first',
        },
        { type: 'text', text: 'Planning' },
        {
          type: 'toolCall',
          id: 'read-1',
          name: 'read',
          arguments: { path: 'guide.md' },
        },
      ],
    },
  });
  expect(result.thread_snapshot?.items[3]).toMatchObject({
    type: 'tool',
    status: 'completed',
    result: { preview: '# Guide' },
  });
  expect(run.activities.at(-1)?.transcript).toBe(
    '# delegated prompt\n\nwork\n\n# subagent execution\nPlanning\n\nread guide.md\n\n{"output":"# Guide","exitCode":0}\n\ndone\nFinal answer\n\n# final assistant text\n\nFinal answer',
  );
});

it('classifies tool-end, turn-end and question activities as persistence boundaries only', async () => {
  const run = runningSession();
  try {
    run.event({ type: 'message_start', message: { role: 'assistant' } });
    run.event({
      type: 'message_end',
      message: { role: 'assistant', content: 'answer' },
    });
    run.event({
      type: 'tool_execution_start',
      toolCallId: 'read-1',
      toolName: 'read',
    });
    run.event({
      type: 'tool_execution_end',
      toolCallId: 'read-1',
      toolName: 'read',
      result: { output: 'done' },
    });
    run.event({ type: 'turn_end' });
    run.event({ type: 'queue_update', steering: ['follow-up'] });
    run.event({
      type: 'message_start',
      message: { role: 'user', content: 'follow-up' },
    });
    run.event({ type: 'compaction_start' });
    run.event({ type: 'compaction_end' });
    run.event({ type: 'auto_retry_start' });
    run.event({ type: 'auto_retry_end' });
    run.event({ type: 'agent_settled' });
  } finally {
    run.finish();
    await run.outcome;
  }
  expect(
    run.activities.map(({ message, persist }) => [message, persist]),
  ).toEqual([
    ['session started', false],
    ['preparing response', false],
    ['assistant message completed', false],
    ['read', false],
    ['tool completed', true],
    ['turn completed', true],
    ['live steering queue updated', false],
    ['live steering message consumed', false],
    ['context compaction started', false],
    ['context compacted', false],
    ['auto retry start', false],
    ['auto retry end', false],
    ['agent settled (awaiting result)', false],
    ['collected final response', false],
  ]);
});

it('does not project ordinary partial tool output', async () => {
  const run = runningSession();
  run.event({
    type: 'tool_execution_start',
    toolCallId: 'read-1',
    toolName: 'read',
  });
  const before = run.activities.at(-1);
  const count = run.activities.length;
  const update = vi.spyOn(ThreadSnapshotBuilder.prototype, 'update');
  const snapshot = vi.spyOn(ThreadSnapshotBuilder.prototype, 'snapshot');
  const sanitize = vi.spyOn(
    interactionChannel,
    'sanitizeInteractionTransportText',
  );
  const inspect = vi.spyOn(
    interactionChannel,
    'interactionRequestFromCandidate',
  );
  const partialResult = { content: [{ type: 'text', text: 'partial output' }] };
  try {
    run.event({
      type: 'tool_execution_update',
      toolCallId: 'read-1',
      toolName: 'read',
      partialResult,
    });
    expect(run.activities).toHaveLength(count);
    expect(update).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
    expect(sanitize).not.toHaveBeenCalled();
    expect(inspect).toHaveBeenCalledExactlyOnceWith(partialResult);
    run.event({ type: 'turn_end' });
    expect(run.activities.at(-1)?.transcript).toBe(before?.transcript);
    expect(run.activities.at(-1)?.thread_snapshot?.items).toEqual(
      before?.thread_snapshot?.items,
    );
  } finally {
    run.finish();
    await run.outcome;
  }
});

it('reports each structured partial-result question immediately, before tool completion', async () => {
  const run = runningSession();
  run.event({
    type: 'tool_execution_start',
    toolCallId: 'ask-1',
    toolName: 'ask_orchestrator',
  });
  const before = run.activities.at(-1);
  const count = run.activities.length;
  const request = {
    type: 'interaction_required',
    requestId: 'question-1',
    kind: 'custom',
    origin: 'subagent',
    payload: { message: 'Which scope?' },
  };
  try {
    for (const requestId of [
      'question-1',
      'question-1',
      'question-2',
      'question-1',
    ]) {
      run.event({
        type: 'tool_execution_update',
        toolCallId: 'ask-1',
        toolName: 'ask_orchestrator',
        partialResult: {
          details: { interactionRequest: { ...request, requestId } },
        },
      });
    }
    expect(run.activities.slice(count)).toEqual([
      expect.objectContaining({
        message: 'interaction required',
        persist: true,
        interaction_request: request,
        transcript: before?.transcript,
      }),
      expect.objectContaining({
        message: 'interaction required',
        persist: true,
        interaction_request: { ...request, requestId: 'question-2' },
        transcript: before?.transcript,
      }),
    ]);
    expect(run.activities.at(-1)?.thread_snapshot?.items).toEqual(
      before?.thread_snapshot?.items,
    );
    expect(run.activities.at(-1)?.thread_snapshot?.items).toContainEqual(
      expect.objectContaining({ type: 'tool', status: 'running' }),
    );
  } finally {
    run.finish();
    await run.outcome;
  }
});

it.each([
  { type: 'text_delta', delta: 'unprojected text' },
  { type: 'thinking_delta', delta: 'unprojected thinking' },
  { type: 'toolcall_delta', delta: '{"path":"secret"}' },
  { type: 'future_payload', content: 'ignored' },
  undefined,
])('admits message updates only as liveness and diagnostics (%j)', async (assistantMessageEvent) => {
  const run = runningSession();
  const initial = run.activities.at(-1);
  const update = vi.spyOn(ThreadSnapshotBuilder.prototype, 'update');
  const snapshot = vi.spyOn(ThreadSnapshotBuilder.prototype, 'snapshot');
  const bound = vi.spyOn(threadView, 'boundThreadSnapshot');
  const sanitize = vi.spyOn(
    interactionChannel,
    'sanitizeInteractionTransportText',
  );
  const inspect = vi.spyOn(
    interactionChannel,
    'interactionRequestFromCandidate',
  );
  const metrics = vi.spyOn(SubagentRuntimeMetricsTracker.prototype, 'observe');
  try {
    run.event({
      type: 'message_update',
      assistantMessageEvent,
      interactionRequest: {
        type: 'interaction_required',
        requestId: 'ignored',
      },
    });
    expect(run.activities).toHaveLength(1);
    expect(update).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
    expect(bound).not.toHaveBeenCalled();
    expect(sanitize).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
    expect(metrics).not.toHaveBeenCalled();
    run.event({ type: 'turn_end' });
    expect(run.activities.at(-1)?.transcript).toBe(initial?.transcript);
    expect(run.activities.at(-1)?.output).toBeUndefined();
    expect(run.activities.at(-1)?.thread_snapshot?.items).toEqual(
      initial?.thread_snapshot?.items,
    );
  } finally {
    run.finish();
    await run.outcome;
  }
});
