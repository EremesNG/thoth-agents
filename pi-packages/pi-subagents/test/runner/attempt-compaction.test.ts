import { expect, it } from 'vitest';
import { promptWithInactivity } from '../../src/runner/event-processing.js';
import { ThreadSnapshotBuilder } from '../../src/runner/snapshot-builder.js';

function previousAttempt() {
  const builder = new ThreadSnapshotBuilder('previous');
  builder.update({
    type: 'tool_execution_start',
    toolCallId: 'old',
    toolName: 'mem_recall',
  });
  builder.update({
    type: 'tool_execution_end',
    toolCallId: 'old',
    toolName: 'mem_recall',
    isError: true,
  });
  return builder.finalize([]);
}

function continuation(events: any[], finalMessages: any[]) {
  let emit: (event: any) => void = () => {};
  const session = {
    messages: Array.from({ length: 5 }, (_, i) => ({
      role: 'user',
      content: `old ${i}`,
    })),
    subscribe(listener: typeof emit) {
      emit = listener;
      return () => {};
    },
    async prompt() {
      for (const event of events) emit(event);
      this.messages = finalMessages;
    },
    dispose() {},
  };
  return promptWithInactivity(
    session,
    'continue',
    10_000,
    new AbortController().signal,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    'continuation',
    'continue',
    2,
    undefined,
    previousAttempt(),
  );
}

const tool = (name: string, isError: boolean) => [
  { type: 'tool_execution_start', toolCallId: name, toolName: name },
  { type: 'tool_execution_end', toolCallId: name, toolName: name, isError },
];

// Unit-level session double models the SDK's post-turn replacement deterministically;
// forcing real SDK auto-compaction requires provider-specific token accounting.
it('returns the attempt final text after post-turn compaction shrinks the session', async () => {
  const answer = {
    role: 'assistant',
    stopReason: 'stop',
    content: [{ type: 'text', text: 'current answer' }],
  };
  const run = continuation(
    [
      ...tool('read', false),
      { type: 'message_end', message: answer },
      { type: 'compaction_start' },
      { type: 'compaction_end', result: {} },
    ],
    [{ role: 'user', content: 'compacted context' }, answer],
  );
  expect((await run).result).toBe('current answer');
});

it('ignores stale failed tools when the current attempt has only successful tools and no answer', async () => {
  await expect(continuation(tool('read', false), [])).rejects.toMatchObject({
    error_metadata: { category: 'empty_response_after_tools' },
  });
});

it('reports only current-attempt failed tools when there is no final answer', async () => {
  await expect(continuation(tool('read', true), [])).rejects.toMatchObject({
    error_metadata: {
      category: 'tool_failure',
      source: { tool: 'read' },
      details: { tool_names: 'read' },
    },
  });
});

it('uses attempt events when compaction rewrites messages without shrinking them', async () => {
  const answer = {
    role: 'assistant',
    stopReason: 'stop',
    content: 'current answer',
  };
  const rewritten = Array.from({ length: 7 }, (_, i) => ({
    role: 'assistant',
    content: `stale ${i}`,
  }));
  expect(
    (
      await continuation(
        [
          ...tool('read', false),
          { type: 'message_end', message: answer },
          { type: 'compaction_start' },
          { type: 'compaction_end', result: {} },
        ],
        rewritten,
      )
    ).result,
  ).toBe('current answer');
});

it('does not turn earlier narration into an answer when the last assistant message is a tool call', async () => {
  await expect(
    continuation(
      [
        {
          type: 'message_end',
          message: { role: 'assistant', content: 'checking' },
        },
        {
          type: 'message_end',
          message: {
            role: 'assistant',
            stopReason: 'toolUse',
            content: [
              { type: 'toolCall', id: 'read', name: 'read', arguments: {} },
            ],
          },
        },
        ...tool('read', true),
        { type: 'compaction_end', result: {} },
      ],
      [],
    ),
  ).rejects.toMatchObject({
    error_metadata: {
      category: 'tool_failure',
      details: { tool_names: 'read' },
    },
  });
});

it('does not mistake mixed narration and a tool call for a final response', async () => {
  await expect(
    continuation(
      [
        {
          type: 'message_end',
          message: {
            role: 'assistant',
            stopReason: 'toolUse',
            content: [
              { type: 'text', text: 'checking' },
              { type: 'toolCall', id: 'read', name: 'read', arguments: {} },
            ],
          },
        },
        ...tool('read', true),
        { type: 'compaction_end', result: {} },
      ],
      [],
    ),
  ).rejects.toMatchObject({
    error_metadata: {
      category: 'tool_failure',
      source: { tool: 'read' },
      details: { tool_names: 'read' },
    },
  });
});

it('keeps a current assistant error after compaction instead of returning an earlier answer', async () => {
  await expect(
    continuation(
      [
        {
          type: 'message_end',
          message: {
            role: 'assistant',
            stopReason: 'stop',
            content: 'earlier',
          },
        },
        {
          type: 'message_end',
          message: {
            role: 'assistant',
            stopReason: 'error',
            errorMessage: '401 invalid api key',
            content: [],
          },
        },
        { type: 'compaction_end', result: {} },
      ],
      [],
    ),
  ).rejects.toMatchObject({
    error_metadata: { category: 'provider_auth_error' },
  });
});

it('does not return earlier narration after compaction if the final assistant message is empty', async () => {
  await expect(
    continuation(
      [
        {
          type: 'message_end',
          message: {
            role: 'assistant',
            stopReason: 'stop',
            content: 'earlier',
          },
        },
        {
          type: 'message_end',
          message: { role: 'assistant', stopReason: 'stop', content: [] },
        },
        { type: 'compaction_end', result: {} },
      ],
      [],
    ),
  ).rejects.toMatchObject({
    error_metadata: { category: 'empty_response_no_tools' },
  });
});

it.each([
  'toolUse',
  'stop',
])('rejects a projected assistant with narration and tool calls even with stopReason %s', async (stopReason) => {
  const message = {
    role: 'assistant',
    stopReason,
    content: [
      { type: 'text', text: 'checking' },
      { type: 'toolCall', id: 'read', name: 'read', arguments: {} },
    ],
  };
  const projection = [
    ...Array.from({ length: 5 }, () => ({ role: 'user', content: 'old' })),
    message,
  ];
  await expect(
    continuation(
      [{ type: 'message_end', message }, ...tool('read', true)],
      projection,
    ),
  ).rejects.toMatchObject({
    error_metadata: {
      category: 'tool_failure',
      details: { tool_names: 'read' },
    },
  });
});

it('does not return a pending assistant response after compaction', async () => {
  await expect(
    continuation(
      [
        {
          type: 'message_end',
          message: {
            role: 'assistant',
            stopReason: 'pending',
            content: 'not final',
          },
        },
        { type: 'compaction_end', result: {} },
      ],
      [],
    ),
  ).rejects.toMatchObject({
    error_metadata: { category: 'empty_response_no_tools' },
  });
});
