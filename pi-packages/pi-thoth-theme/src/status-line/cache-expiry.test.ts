import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import {
  cacheExpiryRemainingMs,
  findCacheAnchor,
  resolveCacheExpiry,
} from './cache-expiry.ts';

const NOW = 1_800_000_000_000;

function assistant(
  id: string,
  parentId: string | null,
  timestamp: unknown,
  provider?: string,
): SessionEntry {
  return {
    type: 'message',
    id,
    parentId,
    timestamp: '2026-10-02T10:00:00Z',
    message: {
      role: 'assistant',
      content: [],
      ...(timestamp === undefined ? {} : { timestamp }),
      ...(provider === undefined ? {} : { provider }),
    },
  } as unknown as SessionEntry;
}

function user(id: string, parentId: string | null): SessionEntry {
  return {
    type: 'message',
    id,
    parentId,
    timestamp: '2026-10-02T10:00:00Z',
    message: { role: 'user', content: [] },
  } as unknown as SessionEntry;
}

describe('resolveCacheExpiry', () => {
  it('applies the package defaults when the section is omitted', () => {
    expect(resolveCacheExpiry(undefined)).toEqual({
      enabled: true,
      ttlMinutes: 60,
      providerTtlMinutes: { openai: 30, 'openai-codex': 30 },
    });
  });

  it('keeps explicit values and user provider overrides', () => {
    expect(
      resolveCacheExpiry({
        enabled: false,
        ttlMinutes: 15,
        providerTtlMinutes: { openai: 45, custom: 5 },
      }),
    ).toEqual({
      enabled: false,
      ttlMinutes: 15,
      providerTtlMinutes: { openai: 45, 'openai-codex': 30, custom: 5 },
    });
  });

  it('rejects a non-positive lifetime', () => {
    expect(
      resolveCacheExpiry({ enabled: true, ttlMinutes: 0 }).ttlMinutes,
    ).toBe(60);
  });
});

describe('findCacheAnchor', () => {
  it('uses the latest assistant request start and its provider', () => {
    const entries = [
      user('1', null),
      assistant('2', '1', NOW - 600_000, 'openai'),
      assistant('3', '2', NOW - 30_000, 'anthropic'),
    ];
    expect(findCacheAnchor(entries, '3')).toEqual({
      timestamp: NOW - 30_000,
      provider: 'anthropic',
    });
  });

  it('skips user messages and legacy messages without a numeric timestamp', () => {
    const entries = [
      assistant('1', null, NOW - 60_000, 'openai'),
      assistant('2', '1', undefined),
      user('3', '2'),
      assistant('4', '3', 'not-a-number'),
    ];
    expect(findCacheAnchor(entries, '4')).toEqual({
      timestamp: NOW - 60_000,
      provider: 'openai',
    });
  });

  it('reports no anchor for an empty, missing or user-only history', () => {
    expect(findCacheAnchor([], '1')).toBeUndefined();
    expect(findCacheAnchor(undefined, '1')).toBeUndefined();
    expect(findCacheAnchor([user('1', null)], '1')).toBeUndefined();
  });

  it('reports no anchor for a null leaf, which is an empty branch after resetLeaf', () => {
    // SessionManager.resetLeaf() leaves the entries in place but clears the
    // leaf, so the current branch is empty and nothing is cached for it.
    const entries = [
      user('1', null),
      assistant('2', '1', NOW - 60_000, 'openai'),
    ];
    expect(findCacheAnchor(entries, null)).toBeUndefined();
  });

  it('restricts the anchor to the branch that ends at the leaf', () => {
    // 1 → 2 (main, older) and 1 → 3 (side branch, newer assistant message).
    const entries = [
      user('1', null),
      assistant('2', '1', NOW - 900_000, 'anthropic'),
      assistant('3', '1', NOW - 1000, 'openai'),
    ];
    expect(findCacheAnchor(entries, '2')).toEqual({
      timestamp: NOW - 900_000,
      provider: 'anthropic',
    });
    expect(findCacheAnchor(entries, '3')).toEqual({
      timestamp: NOW - 1000,
      provider: 'openai',
    });
    // An unresolvable leaf hides the countdown rather than borrowing another
    // branch's request.
    expect(findCacheAnchor(entries, 'missing')).toBeUndefined();
  });

  it('tolerates a cyclic parent chain without hanging', () => {
    const entries = [assistant('1', '2', NOW), assistant('2', '1', NOW - 1000)];
    expect(findCacheAnchor(entries, '1')).toEqual({ timestamp: NOW - 1000 });
  });
});

describe('cacheExpiryRemainingMs', () => {
  it('counts down from the anchor and rounds up to whole seconds', () => {
    expect(cacheExpiryRemainingMs({ timestamp: NOW }, undefined, NOW)).toBe(
      3_600_000,
    );
    expect(
      cacheExpiryRemainingMs({ timestamp: NOW }, undefined, NOW + 42_400),
    ).toBe(3_558_000);
  });

  it('uses the provider override for the anchor provider', () => {
    expect(
      cacheExpiryRemainingMs(
        { timestamp: NOW, provider: 'openai-codex' },
        undefined,
        NOW,
      ),
    ).toBe(1_800_000);
    expect(
      cacheExpiryRemainingMs(
        { timestamp: NOW, provider: 'openai' },
        { enabled: true, ttlMinutes: 60, providerTtlMinutes: { openai: 5 } },
        NOW,
      ),
    ).toBe(300_000);
  });

  it('reports a remaining time of zero or less once expired', () => {
    expect(
      cacheExpiryRemainingMs({ timestamp: NOW }, undefined, NOW + 3_600_000),
    ).toBe(0);
    expect(
      cacheExpiryRemainingMs({ timestamp: NOW }, undefined, NOW + 3_601_500),
    ).toBe(-1000);
  });

  it('hides the indicator when disabled or when there is no anchor', () => {
    expect(
      cacheExpiryRemainingMs(
        { timestamp: NOW },
        { enabled: false, ttlMinutes: 60 },
        NOW,
      ),
    ).toBeUndefined();
    expect(cacheExpiryRemainingMs(undefined, undefined, NOW)).toBeUndefined();
  });
});
