import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import { calculateSessionCost, formatCost } from './cost.ts';

describe('calculateSessionCost', () => {
  it('aggregates cost across assistant messages, tool results, compactions, and branch summaries', () => {
    const entries = [
      {
        type: 'message',
        id: '1',
        parentId: null,
        timestamp: '2026-10-02T10:00:00Z',
        message: {
          role: 'user',
          content: 'hello',
        },
      },
      {
        type: 'message',
        id: '2',
        parentId: '1',
        timestamp: '2026-10-02T10:00:01Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'hi' }],
          usage: {
            input: 100,
            output: 50,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 150,
            cost: {
              input: 0.1,
              output: 0.2,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0.3,
            },
          },
        },
      },
      {
        type: 'message',
        id: '3',
        parentId: '2',
        timestamp: '2026-10-02T10:00:02Z',
        message: {
          role: 'toolResult',
          toolCallId: 'call_1',
          toolName: 'read',
          content: [{ type: 'text', text: 'result' }],
          isError: false,
          usage: {
            input: 20,
            output: 10,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 30,
            cost: {
              input: 0.01,
              output: 0.01,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0.02,
            },
          },
        },
      },
      {
        type: 'compaction',
        id: '4',
        parentId: '3',
        timestamp: '2026-10-02T10:00:03Z',
        summary: 'compacted',
        firstKeptEntryId: '3',
        tokensBefore: 1000,
        usage: {
          input: 200,
          output: 100,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 300,
          cost: {
            input: 0.04,
            output: 0.06,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0.1,
          },
        },
      },
      {
        type: 'branch_summary',
        id: '5',
        parentId: '4',
        timestamp: '2026-10-02T10:00:04Z',
        fromId: '3',
        summary: 'branch summary',
        usage: {
          input: 300,
          output: 50,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 350,
          cost: {
            input: 0.05,
            output: 0.05,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0.1,
          },
        },
      },
      {
        type: 'usage',
        id: '6',
        parentId: '5',
        timestamp: '2026-10-02T10:00:05Z',
        kind: 'cache_warm',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        usage: {
          input: 100,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 100,
          cost: {
            input: 0.05,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0.05,
          },
        },
      },
      {
        type: 'session_info',
        id: '7',
        parentId: '6',
        timestamp: '2026-10-02T10:00:06Z',
        name: 'test session',
      },
    ] as unknown as SessionEntry[];

    const cost = calculateSessionCost(entries);
    // 0.3 + 0.02 + 0.1 + 0.1 + 0.05 = 0.57
    expect(cost).toBeCloseTo(0.57, 5);
  });

  it('returns 0 when session entries list is empty or has no usage', () => {
    expect(calculateSessionCost([])).toBe(0);
    expect(
      calculateSessionCost([
        {
          type: 'session_info',
          id: '1',
          parentId: null,
          timestamp: '2026-10-02T10:00:00Z',
          name: 'empty',
        } as SessionEntry,
      ]),
    ).toBe(0);
  });

  it('works with a SessionManager-like object with getEntries()', () => {
    const sessionManager = {
      getEntries: () => [
        {
          type: 'compaction',
          id: '1',
          parentId: null,
          timestamp: '2026-10-02T10:00:00Z',
          summary: 'sum',
          firstKeptEntryId: '1',
          tokensBefore: 10,
          usage: {
            input: 1,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 2,
            cost: {
              input: 0.01,
              output: 0.01,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0.02,
            },
          },
        } as unknown as SessionEntry,
      ],
    };
    expect(calculateSessionCost(sessionManager)).toBeCloseTo(0.02, 5);
  });
});

describe('formatCost', () => {
  it('formats cost in ascii mode with $ prefix and 3 decimal places', () => {
    expect(formatCost(1.234, 'ascii')).toBe('$1.234');
    expect(formatCost(0, 'ascii')).toBe('$0.000');
  });

  it('formats cost in nerd mode with nerd icon prefix and 3 decimal places', () => {
    expect(formatCost(1.234, 'nerd')).toBe('\uf1551.234');
    expect(formatCost(0, 'nerd')).toBe('\uf1550.000');
  });
});
