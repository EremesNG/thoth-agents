import { describe, expect, it, vi } from 'vitest';
import { promptWithInactivity } from '../../src/runner/event-processing.js';

function sessionFixture() {
  let listener: ((event: any) => void) | undefined;
  let promptCount = 0;
  let stats: any = {
    sessionId: 'child-session',
    sessionFile: '/child/session.jsonl',
    userMessages: 1,
    assistantMessages: 1,
    toolCalls: 2,
    toolResults: 2,
    totalMessages: 4,
    tokens: { input: 30, output: 12, cacheRead: 5, cacheWrite: 2, total: 49 },
    cost: 0.2,
  };
  const session: any = {
    messages: [],
    subscribe: vi.fn((callback: (event: any) => void) => {
      listener = callback;
      return () => {
        listener = undefined;
      };
    }),
    getSessionStats: vi.fn(() => stats),
    getContextUsage: vi.fn(() => ({
      tokens: 600,
      contextWindow: 3000,
      percent: 20,
    })),
    prompt: vi.fn(async () => {
      promptCount += 1;
      const message = {
        id: `assistant-${promptCount}`,
        role: 'assistant',
        timestamp: promptCount * 100,
        content: [{ type: 'text', text: 'private response text' }],
        usage: {
          input: 8,
          output: 4,
          cacheRead: 1,
          cacheWrite: 2,
          totalTokens: 15,
          cost: { total: 0.1 },
        },
      };
      stats = {
        ...stats,
        assistantMessages: stats.assistantMessages + 1,
        toolCalls: stats.toolCalls + 1,
        tokens: {
          ...stats.tokens,
          input: stats.tokens.input + 8,
          output: stats.tokens.output + 4,
          cacheRead: stats.tokens.cacheRead + 1,
          cacheWrite: stats.tokens.cacheWrite + 2,
          total: stats.tokens.total + 15,
        },
        cost: stats.cost + 0.1,
      };
      session.messages.push(message);
      listener?.({ type: 'message_end', message });
      listener?.({
        type: 'tool_execution_start',
        toolName: 'read',
        toolCallId: `read-${promptCount}`,
      });
      listener?.({
        type: 'tool_execution_end',
        toolName: 'read',
        toolCallId: `read-${promptCount}`,
        isError: false,
      });
      listener?.({ type: 'turn_end' });
      listener?.({ type: 'compaction_start', reason: 'threshold' });
      listener?.({
        type: 'compaction_end',
        reason: 'threshold',
        result: { summary: 'compacted' },
        aborted: false,
        willRetry: false,
      });
      listener?.({ type: 'compaction_start', reason: 'overflow' });
      listener?.({
        type: 'compaction_end',
        reason: 'overflow',
        result: undefined,
        aborted: true,
        willRetry: true,
      });
    }),
  };
  return session;
}

describe('child runtime metrics', () => {
  it('projects the child session lifetime stats and redacted assistant accounting events', async () => {
    const session = sessionFixture();
    const activities: any[] = [];

    const result = await promptWithInactivity(
      session,
      'do work',
      10_000,
      new AbortController().signal,
      (activity) => activities.push(activity),
    );
    const assistantActivity = activities.find(
      (activity) => activity.assistant_message,
    );
    const finalActivity = activities.at(-1);

    expect(assistantActivity.assistant_message).toEqual({
      role: 'assistant',
      id: 'assistant-1',
      timestamp: 100,
      usage: {
        input: 8,
        output: 4,
        cacheRead: 1,
        cacheWrite: 2,
        totalTokens: 15,
        cost: { total: 0.1 },
      },
    });
    expect(JSON.stringify(assistantActivity.assistant_message)).not.toContain(
      'private response text',
    );
    expect(finalActivity.runtime_metrics).toEqual({
      contextTokens: 600,
      contextWindow: 3000,
      contextPercent: 20,
      toolUses: 3,
      turns: 1,
      compactions: 1,
    });
    expect(result.usage).toMatchObject({
      input: 38,
      output: 16,
      cacheRead: 6,
      cacheWrite: 4,
      turns: 1,
    });
    expect(result.usage.cost).toBeCloseTo(0.3);
  });

  it('uses restored session totals once across continuation prompts', async () => {
    const session = sessionFixture();
    const first = await promptWithInactivity(
      session,
      'first task',
      10_000,
      new AbortController().signal,
    );
    const second = await promptWithInactivity(
      session,
      'continue task',
      10_000,
      new AbortController().signal,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'continuation',
    );

    expect(first.usage.input).toBe(38);
    expect(second.usage.input).toBe(46);
    expect(second.usage.output).toBe(20);
    expect(second.usage.turns).toBe(1);
  });

  it('omits context estimates when the child session reports them unknown', async () => {
    const session = sessionFixture();
    session.getContextUsage.mockReturnValue({
      tokens: null,
      contextWindow: 4096,
      percent: null,
    });
    const activities: any[] = [];

    await promptWithInactivity(
      session,
      'do work',
      10_000,
      new AbortController().signal,
      (activity) => activities.push(activity),
    );

    expect(activities.at(-1).runtime_metrics).toMatchObject({
      contextWindow: 4096,
      toolUses: 3,
      turns: 1,
      compactions: 1,
    });
    expect(activities.at(-1).runtime_metrics).not.toHaveProperty(
      'contextTokens',
    );
    expect(activities.at(-1).runtime_metrics).not.toHaveProperty(
      'contextPercent',
    );
  });
});
