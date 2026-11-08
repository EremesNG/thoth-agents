import { afterEach, expect, test, vi } from 'vitest';
import { QuotaTracker } from './quota.js';

afterEach(() => vi.useRealTimers());
function fixture(
  fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      rate_limit: {
        primary_window: { used_percent: 20, reset_after_seconds: 600 },
        secondary_window: { used_percent: 70 },
      },
      plan_type: 'plus',
    }),
  ),
) {
  const accounts = [
    { number: 1, credentialID: 'one', state: 'ok' as const },
    { number: 2, credentialID: 'two', state: 'ok' as const },
  ];
  const requests = {
    resolveCredential: vi.fn(async (accountNumber: number) => ({
      accountNumber,
      access: `token-${accountNumber}`,
      accountID: `id-${accountNumber}`,
    })),
  };
  const quota = new QuotaTracker({ list: async () => accounts }, requests, {
    fetch: fetcher,
  });
  return { quota, fetcher, requests, accounts };
}

test('usage fetch authenticates per account, caches for five minutes and reports minimum remaining', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const { quota, fetcher, requests } = fixture();
  expect(await quota.getQuota(1)).toMatchObject({
    accountNumber: 1,
    state: 'fresh',
    fetchedAt: 1000,
    snapshot: { planType: 'plus' },
  });
  expect(fetcher).toHaveBeenCalledWith(
    'https://chatgpt.com/backend-api/wham/usage',
    expect.objectContaining({
      method: 'GET',
      signal: expect.any(AbortSignal),
      headers: {
        Authorization: 'Bearer token-1',
        'ChatGPT-Account-Id': 'id-1',
      },
    }),
  );
  expect(quota.remainingPercent(1)).toBe(30);
  expect(quota.resetAt(1)).toBe(601000);
  await quota.getQuota(1);
  expect(requests.resolveCredential).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(300000);
  expect(quota.remainingPercent(1)).toBeUndefined();
  expect(await quota.getQuota(1, { refresh: false })).toMatchObject({
    state: 'stale',
  });
  await quota.getQuota(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('refresh failures retain stale snapshots, absent snapshots are unavailable, and reasons do not leak credentials', async () => {
  const { quota, fetcher } = fixture();
  await quota.getQuota(1);
  fetcher.mockRejectedValue(new Error('secret bearer token'));
  expect(await quota.getQuota(1, { refresh: true })).toMatchObject({
    state: 'stale',
    error: 'Quota network request failed.',
    snapshot: { primary: { usedPercent: 20 } },
  });
  expect(quota.remainingPercent(1)).toBeUndefined();
  expect(await quota.getQuota(2)).toMatchObject({
    state: 'unavailable',
    error: 'Quota network request failed.',
  });
});

test('concurrent refresh deduplicates per account but not across accounts', async () => {
  let release!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const { quota } = fixture(fetcher);
  const first = quota.getQuota(1);
  const second = quota.getQuota(1, { refresh: true });
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  release(Response.json({ primary_window: { used_percent: 50 } }));
  expect(
    (await Promise.all([first, second])).map((item) => item.state),
  ).toEqual(['fresh', 'fresh']);
  fetcher.mockResolvedValue(
    Response.json({ primary_window: { used_percent: 10 } }),
  );
  await quota.getQuota(2);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('ten second deadline aborts fetch and bounds credential and body stalls', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
  const { quota } = fixture(fetcher);
  const result = quota.getQuota(1);
  await vi.advanceTimersByTimeAsync(10000);
  expect(await result).toMatchObject({
    state: 'unavailable',
    error: expect.stringContaining('timed out'),
  });
  expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  const stalled = fixture();
  stalled.requests.resolveCredential.mockImplementation(
    () => new Promise(() => {}),
  );
  const credentialResult = stalled.quota.getQuota(1);
  await vi.advanceTimersByTimeAsync(10000);
  expect(await credentialResult).toMatchObject({
    state: 'unavailable',
    error: expect.stringContaining('timed out'),
  });
  const body = fixture(
    vi.fn<typeof fetch>(
      async () => ({ ok: true, json: () => new Promise(() => {}) }) as Response,
    ),
  );
  const bodyResult = body.quota.getQuota(1);
  await vi.advanceTimersByTimeAsync(10000);
  expect(await bodyResult).toMatchObject({
    state: 'unavailable',
    error: expect.stringContaining('timed out'),
  });
});

test('observations merge windows without freshening an older omitted window, and expose exhausted resets', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const { quota } = fixture();
  await quota.getQuota(1);
  vi.advanceTimersByTime(300000);
  quota.observeRateLimits(1, {
    primary: { usedPercent: 100, resetAt: 900000 },
  });
  expect(await quota.getQuota(1, { refresh: false })).toMatchObject({
    state: 'stale',
    fetchedAt: 1000,
    snapshot: { secondary: { usedPercent: 70 } },
  });
  expect(quota.resetAt(1)).toBe(900000);
  quota.observeRateLimits(1, {
    secondary: { usedPercent: 90, resetAt: 800000 },
  });
  expect(quota.remainingPercent(1)).toBe(0);
  expect(await quota.listQuota({ refresh: false })).toMatchObject([
    { accountNumber: 1, state: 'fresh' },
    { accountNumber: 2, state: 'unavailable' },
  ]);
});

test('late usage fetch cannot overwrite a newer response observation', async () => {
  let release!: (response: Response) => void;
  const { quota, fetcher } = fixture(
    vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    ),
  );
  const pending = quota.getQuota(1);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
  quota.observeRateLimits(1, { primary: { usedPercent: 99 } });
  release(Response.json({ primary_window: { used_percent: 1 } }));
  expect(await pending).toMatchObject({
    snapshot: { primary: { usedPercent: 99 } },
  });
});

test('rebinding or removing credentials invalidates the numbered account cache', async () => {
  const { quota, accounts } = fixture();
  await quota.getQuota(1);
  const first = accounts[0];
  if (!first) throw new Error('Missing fixture account');
  first.credentialID = 'replacement';
  expect(await quota.getQuota(1, { refresh: false })).toMatchObject({
    state: 'unavailable',
  });
  expect(quota.remainingPercent(1)).toBeUndefined();
  await quota.getQuota(2);
  accounts.pop();
  expect(await quota.getQuota(2, { refresh: false })).toMatchObject({
    state: 'unavailable',
  });
});

test.each([
  [() => new Response('', { status: 401 }), 'HTTP 401'],
  [() => new Response('invalid'), 'Invalid quota response JSON'],
  [() => Response.json({}), 'no usable windows'],
])('malformed and unsuccessful usage responses are unavailable', async (response, reason) => {
  const { quota } = fixture(vi.fn<typeof fetch>(async () => response()));
  expect(await quota.getQuota(1)).toMatchObject({
    state: 'unavailable',
    error: expect.stringContaining(reason),
  });
});

test('reset expiry and clock rollback make cached data stale even within the freshness window', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const { quota } = fixture();
  await quota.listQuota({ refresh: false });
  quota.observeRateLimits(1, { primary: { usedPercent: 100, resetAt: 2000 } });
  vi.setSystemTime(2000);
  expect(quota.remainingPercent(1)).toBeUndefined();
  expect(quota.resetAt(1)).toBeUndefined();
  expect(await quota.getQuota(1, { refresh: false })).toMatchObject({
    state: 'stale',
  });
  vi.setSystemTime(500);
  expect(quota.remainingPercent(1)).toBeUndefined();
});

test('credential failures and missing mappings produce unavailable states without calling fetch', async () => {
  const { quota, requests, fetcher } = fixture();
  requests.resolveCredential.mockRejectedValue(
    new Error('private credential contents'),
  );
  expect(await quota.getQuota(1)).toMatchObject({
    state: 'unavailable',
    error: 'Quota credential unavailable.',
  });
  expect(await quota.getQuota(99)).toMatchObject({
    state: 'unavailable',
    error: 'Account credential unavailable.',
  });
  expect(fetcher).not.toHaveBeenCalled();
});
