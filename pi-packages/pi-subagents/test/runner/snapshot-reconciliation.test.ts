import { describe, expect, it } from 'vitest';
import { ThreadSnapshotBuilder } from '../../src/runner/snapshot-builder.js';
import type { SubagentThreadSnapshot } from '../../src/types.js';

function assistantContent(snapshot: SubagentThreadSnapshot | undefined) {
  return snapshot?.items
    .filter((item) => item.type === 'assistant')
    .map((item) =>
      item.message.content.map((part) =>
        part.type === 'toolCall'
          ? `toolCall:${part.id}`
          : part.type === 'thinking'
            ? `thinking:${part.thinking ?? part.text}`
            : `text:${part.text}`,
      ),
    );
}

function rowSummary(snapshot: SubagentThreadSnapshot | undefined) {
  const items = snapshot?.items ?? [];
  const kinds: Record<string, number> = {};
  for (const item of items) kinds[item.type] = (kinds[item.type] ?? 0) + 1;
  const tools = items.filter((item) => item.type === 'tool');
  return {
    rows: items.length,
    kinds,
    firstTool: tools[0]?.tool_call_id,
    lastTool: tools.at(-1)?.tool_call_id,
  };
}

function complete(builder: ThreadSnapshotBuilder, content: unknown[]) {
  builder.update({
    type: 'message_end',
    message: { role: 'assistant', content },
  });
}

const thinking = (thinking: string) => ({ type: 'thinking', thinking });
const text = (text: string) => ({ type: 'text', text });
const toolCall = {
  type: 'toolCall',
  id: 'read-1',
  name: 'read',
  arguments: {},
};

describe('completed assistant reconciliation with session messages', () => {
  it.each([
    { content: [] },
    { content: [toolCall] },
    { content: [text('')] },
    { content: [thinking('')] },
    { content: [text(''), thinking(''), toolCall] },
    { content: '' },
  ])('does not allocate a live assistant row without non-empty text or thinking (%j)', ({
    content,
  }) => {
    const builder = new ThreadSnapshotBuilder('work');
    expect(
      builder.update({
        type: 'message_end',
        message: { role: 'assistant', content },
      }),
    ).toEqual({ snapshotChanged: false });
    expect(rowSummary(builder.snapshot())).toEqual({
      rows: 2,
      kinds: { attempt: 1, user: 1 },
      firstTool: undefined,
      lastTool: undefined,
    });
  });

  it('projects only non-empty text and thinking from a completed mixed assistant message', () => {
    const builder = new ThreadSnapshotBuilder('work');
    complete(builder, [
      thinking('reasoning'),
      text(''),
      toolCall,
      thinking(''),
      text('narration'),
    ]);
    expect(assistantContent(builder.snapshot())).toEqual([
      ['thinking:reasoning', 'text:narration'],
    ]);
  });

  it('retains whitespace in non-empty completed blocks like HEAD deltas', () => {
    const builder = new ThreadSnapshotBuilder('work');
    builder.update({
      type: 'message_end',
      message: { role: 'assistant', content: '  ' },
    });
    complete(builder, [thinking('\n'), text('tail')]);
    expect(assistantContent(builder.snapshot())).toEqual([
      ['thinking:\n', 'text:  tail'],
    ]);
  });

  it('drops a trailing raw JSON-only assistant row when a tool starts, as HEAD did', () => {
    const builder = new ThreadSnapshotBuilder('work');
    complete(builder, [text('{"path":"guide.md"}')]);
    builder.update({
      type: 'tool_execution_start',
      toolCallId: 'read-1',
      toolName: 'read',
      args: { path: 'guide.md' },
    });
    expect(rowSummary(builder.snapshot())).toEqual({
      rows: 3,
      kinds: { attempt: 1, user: 1, tool: 1 },
      firstTool: 'read-1',
      lastTool: 'read-1',
    });
    complete(builder, [text('after tool')]);
    expect(builder.snapshot()?.items.at(-1)).toMatchObject({
      type: 'assistant',
      id: 'streaming-assistant-2',
    });
  });

  it.each([
    {
      turns: 1,
      callsPerTurn: 1,
      live: {
        rows: 3,
        kinds: { attempt: 1, user: 1, tool: 1 },
        firstTool: 'read-0-0',
        lastTool: 'read-0-0',
      },
      final: {
        rows: 4,
        kinds: { attempt: 1, user: 1, assistant: 1, tool: 1 },
        firstTool: 'read-0-0',
        lastTool: 'read-0-0',
      },
    },
    {
      turns: 105,
      callsPerTurn: 1,
      live: {
        rows: 107,
        kinds: { attempt: 1, user: 1, tool: 105 },
        firstTool: 'read-0-0',
        lastTool: 'read-104-0',
      },
      final: {
        rows: 200,
        kinds: { attempt: 1, tool: 100, assistant: 99 },
        firstTool: 'read-5-0',
        lastTool: 'read-104-0',
      },
    },
    {
      turns: 205,
      callsPerTurn: 1,
      live: {
        rows: 200,
        kinds: { attempt: 1, tool: 199 },
        firstTool: 'read-6-0',
        lastTool: 'read-204-0',
      },
      final: {
        rows: 200,
        kinds: { attempt: 1, tool: 100, assistant: 99 },
        firstTool: 'read-105-0',
        lastTool: 'read-204-0',
      },
    },
    {
      turns: 105,
      callsPerTurn: 2,
      live: {
        rows: 200,
        kinds: { attempt: 1, tool: 199 },
        firstTool: 'read-5-1',
        lastTool: 'read-104-1',
      },
      final: {
        rows: 200,
        kinds: { attempt: 1, tool: 133, assistant: 66 },
        firstTool: 'read-38-1',
        lastTool: 'read-104-1',
      },
    },
  ])('matches HEAD live/final row counts, kinds and eviction for $turns tool-only turns with $callsPerTurn calls each', ({
    turns,
    callsPerTurn,
    live,
    final,
  }) => {
    const builder = new ThreadSnapshotBuilder('work');
    const messages: { role: string; content: unknown[] }[] = [];
    for (let turn = 0; turn < turns; turn++) {
      const calls = Array.from({ length: callsPerTurn }, (_, call) => ({
        ...toolCall,
        id: `read-${turn}-${call}`,
      }));
      const message = { role: 'assistant', content: calls };
      messages.push(message);
      builder.update({ type: 'message_start', message });
      builder.update({ type: 'message_end', message });
      for (const call of calls) {
        builder.update({
          type: 'tool_execution_start',
          toolCallId: call.id,
          toolName: 'read',
          args: {},
        });
        builder.update({
          type: 'tool_execution_end',
          toolCallId: call.id,
          toolName: 'read',
          result: { output: 'done' },
        });
      }
      builder.update({ type: 'turn_end' });
    }
    // Literal summaries from the delta-equivalent HEAD scratch harness.
    expect(rowSummary(builder.snapshot())).toEqual(live);
    expect(rowSummary(builder.finalize(messages))).toEqual(final);
    expect(rowSummary(builder.finalize([]))).toEqual(live);
  });

  it.each([
    {
      messages: [
        { role: 'assistant', content: [] },
        { role: 'assistant', content: [text('final answer')] },
      ],
    },
    { messages: [{ role: 'assistant', content: [text('final answer')] }] },
  ])('keeps HEAD merged reasoning separate from the final answer (%j)', ({
    messages,
  }) => {
    const builder = new ThreadSnapshotBuilder('work');
    complete(builder, [thinking('first completed reasoning')]);
    complete(builder, [
      thinking('final completed reasoning'),
      text('final answer'),
    ]);
    expect(assistantContent(builder.snapshot())).toEqual([
      [
        'thinking:first completed reasoningfinal completed reasoning',
        'text:final answer',
      ],
    ]);
    // Literal grouping from the delta-equivalent HEAD harness.
    expect(assistantContent(builder.finalize(messages))).toEqual([
      ['thinking:first completed reasoningfinal completed reasoning'],
      ['text:final answer'],
    ]);
  });

  it('keeps r1 after 198 completed tools and consecutive thinking, matching HEAD eviction', () => {
    const builder = new ThreadSnapshotBuilder('work');
    for (let index = 0; index < 198; index++) {
      builder.update({
        type: 'tool_execution_start',
        toolCallId: `r${index}`,
        toolName: 'read',
        args: {},
      });
      builder.update({
        type: 'tool_execution_end',
        toolCallId: `r${index}`,
        toolName: 'read',
        result: { output: `result ${index}` },
      });
    }
    complete(builder, [thinking('first reasoning')]);
    complete(builder, [thinking('second reasoning')]);
    const snapshot = builder.finalize([
      { role: 'assistant', content: [text('answer')] },
    ]);
    // Exact summary and content from the HEAD Oracle-scenario harness.
    expect(rowSummary(snapshot)).toEqual({
      rows: 200,
      kinds: { attempt: 1, tool: 197, assistant: 2 },
      firstTool: 'r1',
      lastTool: 'r197',
    });
    expect(assistantContent(snapshot)).toEqual([
      ['thinking:first reasoningsecond reasoning'],
      ['text:answer'],
    ]);
  });

  it('keeps all 205 consecutive thinking completions in HEAD grouping', () => {
    const builder = new ThreadSnapshotBuilder('work');
    for (let index = 0; index < 205; index++)
      complete(builder, [thinking(`[${index}]`)]);
    const expectedReasoning = Array.from(
      { length: 205 },
      (_, index) => `[${index}]`,
    ).join('');
    // HEAD keeps all 915 characters in a single thinking block, not 205 rows.
    expect(rowSummary(builder.snapshot())).toEqual({
      rows: 3,
      kinds: { attempt: 1, user: 1, assistant: 1 },
      firstTool: undefined,
      lastTool: undefined,
    });
    const snapshot = builder.finalize([
      { role: 'assistant', content: [text('answer')] },
    ]);
    expect(snapshot?.items).toHaveLength(4);
    expect(assistantContent(snapshot)).toEqual([
      [`thinking:${expectedReasoning}`],
      ['text:answer'],
    ]);
  });

  it('matches HEAD grouping across compaction and splits at steering, status and tool rows', () => {
    const builder = new ThreadSnapshotBuilder('work');
    complete(builder, [text('one'), thinking('a')]);
    complete(builder, [toolCall]);
    builder.update({ type: 'compaction_start' });
    builder.update({ type: 'compaction_end' });
    complete(builder, [thinking('b'), text('two')]);
    builder.update({ type: 'queue_update', steering: ['steer'] });
    builder.update({
      type: 'message_start',
      message: { role: 'user', content: 'steer' },
    });
    complete(builder, [text('three'), thinking('c')]);
    builder.update({ type: 'auto_retry_start' });
    complete(builder, [text('four')]);
    builder.update({
      type: 'tool_execution_start',
      toolCallId: 'read-1',
      toolName: 'read',
    });
    builder.update({
      type: 'tool_execution_end',
      toolCallId: 'read-1',
      result: { output: 'done' },
    });
    complete(builder, [thinking('d')]);
    // Exact live/final grouping from the HEAD mixed-boundary harness. Pure
    // compaction events add no row; actual tool/user/status rows break merging.
    expect(builder.snapshot()?.items.map((item) => item.type)).toEqual([
      'attempt',
      'user',
      'assistant',
      'user',
      'assistant',
      'status',
      'assistant',
      'tool',
      'assistant',
    ]);
    expect(assistantContent(builder.snapshot())).toEqual([
      ['thinking:ab', 'text:onetwo'],
      ['thinking:c', 'text:three'],
      ['text:four'],
      ['thinking:d'],
    ]);
    const snapshot = builder.finalize([
      { role: 'assistant', content: [text('answer')] },
    ]);
    expect(snapshot?.items.map((item) => item.type)).toEqual([
      'attempt',
      'user',
      'assistant',
      'user',
      'assistant',
      'status',
      'tool',
      'assistant',
      'assistant',
    ]);
    expect(assistantContent(snapshot)).toEqual([
      ['thinking:ab'],
      ['thinking:c'],
      ['thinking:d'],
      ['text:answer'],
    ]);
    expect(
      snapshot?.items
        .filter((item) => item.type === 'assistant')
        .map((item) => item.id),
    ).toEqual([
      'streaming-assistant-1',
      'streaming-assistant-2',
      'streaming-assistant-4',
      undefined,
    ]);
  });

  it('does not copy pre-compaction narration into a retained tool-call assistant', () => {
    const builder = new ThreadSnapshotBuilder('work');
    complete(builder, [text('older pre-compaction narration')]);
    complete(builder, [toolCall]);
    expect(
      assistantContent(
        builder.finalize([{ role: 'assistant', content: [toolCall] }]),
      ),
    ).toEqual([['toolCall:read-1']]);
  });

  it.each([
    {
      position: 'empty start',
      retained: [[], [text('middle')], [text('last')]],
      expected: [['text:middle'], ['text:last']],
    },
    {
      position: 'empty middle',
      retained: [[text('first')], [], [text('last')]],
      expected: [['text:first'], ['text:last']],
    },
    {
      position: 'empty end',
      retained: [[text('first')], [text('middle')], []],
      expected: [['text:first'], ['text:middle']],
    },
    {
      position: 'omitted start',
      retained: [[text('middle')], [text('last')]],
      expected: [['text:middle'], ['text:last']],
    },
    {
      position: 'omitted middle',
      retained: [[text('first')], [text('last')]],
      expected: [['text:first'], ['text:last']],
    },
    {
      position: 'omitted end',
      retained: [[text('first')], [text('middle')]],
      expected: [['text:first'], ['text:middle']],
    },
  ])('preserves standalone thinking with an $position session assistant', ({
    retained,
    expected,
  }) => {
    const builder = new ThreadSnapshotBuilder('work');
    complete(builder, [thinking('first reasoning'), text('first')]);
    complete(builder, [thinking('middle reasoning'), text('middle')]);
    complete(builder, [thinking('last reasoning'), text('last')]);
    const result = assistantContent(
      builder.finalize(
        retained.map((content) => ({ role: 'assistant', content })),
      ),
    );
    expect(result).toEqual([
      ['thinking:first reasoningmiddle reasoninglast reasoning'],
      ...expected,
    ]);
  });

  it('keeps changed session text authoritative without attaching event thinking to it', () => {
    const builder = new ThreadSnapshotBuilder('work');
    complete(builder, [
      thinking('completed reasoning'),
      text('completed text'),
    ]);
    expect(
      assistantContent(
        builder.finalize([
          { role: 'assistant', content: [text('different session text')] },
        ]),
      ),
    ).toEqual([
      ['thinking:completed reasoning'],
      ['text:different session text'],
    ]);
  });

  it('drops all event thinking when any projected session assistant has thinking, as HEAD did', () => {
    const builder = new ThreadSnapshotBuilder('work');
    complete(builder, [thinking('older reasoning'), text('old narration')]);
    complete(builder, [
      thinking('completed reasoning'),
      text('completed answer'),
    ]);
    expect(
      assistantContent(
        builder.finalize([
          { role: 'assistant', content: [] },
          {
            role: 'assistant',
            content: [thinking('session reasoning'), text('session answer')],
          },
        ]),
      ),
    ).toEqual([['thinking:session reasoning', 'text:session answer']]);
  });

  it.each([
    { identity: { id: 'message-1' } },
    { identity: { timestamp: 1234 } },
    { identity: { timestamp: '2026-01-01T00:00:00Z' } },
    { identity: { responseId: 'response-1' } },
  ])('does not fill session omissions even with matching message identity ($identity)', ({
    identity,
  }) => {
    const builder = new ThreadSnapshotBuilder('work');
    builder.update({
      type: 'message_end',
      message: {
        role: 'assistant',
        ...identity,
        content: [
          thinking('event reasoning'),
          text('event narration'),
          toolCall,
        ],
      },
    });
    expect(
      assistantContent(
        builder.finalize([
          { role: 'assistant', ...identity, content: [toolCall] },
        ]),
      ),
    ).toEqual([['thinking:event reasoning'], ['toolCall:read-1']]);
  });

  it('does not fill omissions when session retains the identical completed message object', () => {
    const builder = new ThreadSnapshotBuilder('work');
    const message = {
      role: 'assistant',
      content: [thinking('event reasoning'), text('event narration'), toolCall],
    };
    builder.update({ type: 'message_end', message });
    message.content = [toolCall];
    expect(assistantContent(builder.finalize([message]))).toEqual([
      ['thinking:event reasoning'],
      ['toolCall:read-1'],
    ]);
  });

  it('preserves HEAD thinking and tool ordering when compaction retains only a suffix', () => {
    const builder = new ThreadSnapshotBuilder('work');
    complete(builder, [thinking('before compaction'), text('stale narration')]);
    builder.update({
      type: 'tool_execution_start',
      toolCallId: 'old-1',
      toolName: 'read',
    });
    builder.update({
      type: 'tool_execution_end',
      toolCallId: 'old-1',
      result: { output: 'old result' },
    });
    complete(builder, [
      thinking('retained reasoning'),
      text('retained narration'),
      toolCall,
    ]);
    builder.update({
      type: 'tool_execution_start',
      toolCallId: 'read-1',
      toolName: 'read',
    });
    builder.update({
      type: 'tool_execution_end',
      toolCallId: 'read-1',
      result: { output: 'retained result' },
    });
    complete(builder, [thinking('answer reasoning'), text('answer')]);
    const result = builder.finalize([
      { role: 'assistant', content: [toolCall] },
      { role: 'assistant', content: [text('answer')] },
    ]);
    expect(assistantContent(result)).toEqual([
      ['thinking:before compaction'],
      ['thinking:retained reasoning'],
      ['toolCall:read-1'],
      ['thinking:answer reasoning'],
      ['text:answer'],
    ]);
    expect(result?.items.map((item) => item.type)).toEqual([
      'attempt',
      'user',
      'assistant',
      'tool',
      'assistant',
      'assistant',
      'tool',
      'assistant',
      'assistant',
    ]);
    expect(
      result?.items
        .filter((item) => item.type === 'tool')
        .map((item) => item.result?.preview),
    ).toEqual(['old result', 'retained result']);
  });

  it('does not associate different messages that share IDs and timestamps', () => {
    const builder = new ThreadSnapshotBuilder('work');
    for (const reasoning of ['first reasoning', 'second reasoning'])
      builder.update({
        type: 'message_end',
        message: {
          role: 'assistant',
          id: 'duplicate',
          timestamp: 1234,
          content: [thinking(reasoning)],
        },
      });
    expect(
      assistantContent(
        builder.finalize([
          {
            role: 'assistant',
            id: 'duplicate',
            timestamp: 1234,
            content: [text('answer')],
          },
        ]),
      ),
    ).toEqual([['thinking:first reasoningsecond reasoning'], ['text:answer']]);
  });

  it('retains HEAD eviction at the 200-item limit for a long tool-separated run', () => {
    const builder = new ThreadSnapshotBuilder('work');
    const messages: { role: string; content: unknown[] }[] = [];
    for (let index = 0; index < 105; index++) {
      const content = [
        thinking(`reason ${index}`),
        text(`text ${index}`),
        { ...toolCall, id: `read-${index}` },
      ];
      const message = { role: 'assistant', content };
      messages.push(message);
      builder.update({ type: 'message_end', message });
      builder.update({
        type: 'tool_execution_start',
        toolCallId: `read-${index}`,
        toolName: 'read',
      });
      builder.update({
        type: 'tool_execution_end',
        toolCallId: `read-${index}`,
        result: { output: `result ${index}` },
      });
    }
    expect(rowSummary(builder.snapshot())).toEqual({
      rows: 200,
      kinds: { attempt: 1, tool: 100, assistant: 99 },
      firstTool: 'read-5',
      lastTool: 'read-104',
    });
    const snapshot = builder.finalize(messages);
    // The HEAD comparison harness retains the first item plus the last 199.
    expect(snapshot?.items).toHaveLength(200);
    expect(snapshot?.items[0]).toMatchObject({ type: 'attempt', attempt: 1 });
    expect(snapshot?.items[1]).toMatchObject({
      type: 'tool',
      tool_call_id: 'read-5',
      result: { preview: 'result 5' },
    });
    expect(snapshot?.items.at(-1)).toMatchObject({
      type: 'tool',
      tool_call_id: 'read-104',
      result: { preview: 'result 104' },
    });
    expect(JSON.stringify(snapshot)).not.toContain('reason 0');
  });

  it.each([
    { messages: [] },
    { messages: [{ role: 'assistant', content: [] }] },
    { messages: [{ role: 'toolResult', content: [text('tool output')] }] },
  ])('keeps HEAD merged content when there is no projected session assistant (%j)', ({
    messages,
  }) => {
    const builder = new ThreadSnapshotBuilder('work');
    complete(builder, [thinking('first reasoning'), text('first text')]);
    complete(builder, [thinking('second reasoning'), text('second text')]);
    expect(assistantContent(builder.finalize(messages))).toEqual([
      [
        'thinking:first reasoningsecond reasoning',
        'text:first textsecond text',
      ],
    ]);
  });
});
