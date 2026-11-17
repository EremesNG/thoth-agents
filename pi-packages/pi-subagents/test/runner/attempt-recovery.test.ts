import { expect, it } from 'vitest';
import { promptWithInactivity } from '../../src/runner/event-processing.js';

async function run(events: unknown[], promptError = false) {
  let emit: (event: unknown) => void = () => {};
  const session = {
    messages: Array.from({ length: 5 }, () => ({
      role: 'user',
      content: 'prior',
    })),
    subscribe(listener: typeof emit) {
      emit = listener;
      return () => {};
    },
    async prompt() {
      for (const event of events) emit(event);
      this.messages = [{ role: 'user', content: 'compacted' }];
      if (promptError) throw new Error('post-turn transport failure');
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
  );
}

it.each([
  {
    name: 'auto retry',
    errorMessage: '429 rate limit exceeded',
    recovery: [
      { type: 'auto_retry_start', attempt: 1 },
      { type: 'auto_retry_end', success: true },
    ],
  },
  {
    name: 'overflow recovery',
    errorMessage: 'prompt is too long: 213462 tokens > 200000 maximum',
    recovery: [
      { type: 'compaction_start', reason: 'overflow' },
      {
        type: 'compaction_end',
        reason: 'overflow',
        willRetry: true,
        result: {},
      },
    ],
  },
])('returns the successful final response after $name and post-turn compaction', async ({
  errorMessage,
  recovery,
}) => {
  const result = await run([
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        stopReason: 'error',
        errorMessage,
        content: [],
      },
    },
    ...recovery,
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        stopReason: 'stop',
        content: [{ type: 'text', text: 'recovered answer' }],
      },
    },
    { type: 'compaction_start', reason: 'threshold' },
    { type: 'compaction_end', reason: 'threshold', result: {} },
  ]);
  expect(result.result).toBe('recovered answer');
});

it.each([
  false,
  true,
])('sanitizes split interaction payloads after compaction (prompt throws: %s)', async (promptError) => {
  const result = await run(
    [
      {
        type: 'message_end',
        message: {
          role: 'assistant',
          stopReason: 'stop',
          content: [
            { type: 'text', text: 'start interaction_required:secret' },
            { type: 'text', text: ' payload end' },
          ],
        },
      },
      { type: 'compaction_end', result: {} },
    ],
    promptError,
  );
  expect(result.result).toBe('start [interaction request hidden]');
});
