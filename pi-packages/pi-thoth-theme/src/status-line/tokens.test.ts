import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import { calculateSessionTokens } from './tokens.ts';

const entries = [
  {
    type: 'message',
    message: {
      role: 'assistant',
      usage: { input: 100, output: 50, cacheRead: 20, cacheWrite: 999 },
    },
  },
  {
    type: 'message',
    message: {
      role: 'toolResult',
      usage: { input: 20, output: 10, cacheRead: 5 },
    },
  },
  { type: 'compaction', usage: { input: 200, output: 100, cacheRead: 30 } },
  { type: 'branch_summary', usage: { input: 300, output: 50, cacheRead: 40 } },
  { type: 'usage', usage: { input: 100, output: 0, cacheRead: 50 } },
  {
    type: 'message',
    message: {
      role: 'user',
      usage: { input: 999, output: 999, cacheRead: 999 },
    },
  },
  { type: 'custom', usage: { input: 999, output: 999, cacheRead: 999 } },
] as unknown as SessionEntry[];

describe('calculateSessionTokens', () => {
  it('totals input, output and cache-read over the same main-session entry scope as cost', () => {
    expect(calculateSessionTokens(entries)).toEqual({
      input: 720,
      output: 210,
      cacheRead: 145,
    });
  });

  it('accepts a SessionManager-like source and empty or unavailable history', () => {
    expect(calculateSessionTokens({ getEntries: () => entries })).toEqual({
      input: 720,
      output: 210,
      cacheRead: 145,
    });
    for (const source of [[], null, undefined]) {
      expect(calculateSessionTokens(source)).toEqual({
        input: 0,
        output: 0,
        cacheRead: 0,
      });
    }
  });

  it('ignores missing and invalid counters independently without poisoning valid totals', () => {
    const malformed = [
      null,
      { type: 'message', message: { role: 'assistant' } },
      { type: 'compaction' },
      { type: 'usage', usage: { input: Number.NaN, output: 3, cacheRead: -1 } },
      {
        type: 'usage',
        usage: { input: 5, output: Number.POSITIVE_INFINITY, cacheRead: '9' },
      },
    ] as unknown as SessionEntry[];
    expect(calculateSessionTokens(malformed)).toEqual({
      input: 5,
      output: 3,
      cacheRead: 0,
    });
  });
});
