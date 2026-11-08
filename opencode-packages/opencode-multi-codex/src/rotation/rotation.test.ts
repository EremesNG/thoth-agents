import type { Plugin } from '@opencode/plugin';
import { afterEach, expect, test, vi } from 'vitest';
import { registerRequests } from '../request/requests.js';
import { registerCodexRpc } from '../rpc-handlers.js';
import { statusTable } from '../tui/flow.js';
import { registerRotation } from './rotation.js';

type Event = {
  sessionID?: string;
  agent?: string;
  model?: { providerID: string; id?: string };
  kind?: string;
  headers?: Record<string, string>;
  request?: Request;
  response?: Response;
  error?: unknown;
  frame?: string;
  decision?: { retry: boolean; delay?: number };
  attempt?: number;
};
async function fixture(enabled = true) {
  const hooks = new Map<string, Array<(event: Event) => Promise<void>>>();
  const accounts = [1, 2, 3].map((number) => ({
    number,
    credentialID: `c${number}`,
    state: 'ok' as const,
    label: `Account ${number}`,
    providerID: number === 1 ? 'openai' : `openai-codex-${number}`,
  }));
  const ctx = {
    rpc: { register: vi.fn() },
    session: {
      hook: async (name: string, cb: (event: Event) => Promise<void>) => {
        hooks.set(name, [...(hooks.get(name) ?? []), cb]);
        return { dispose: async () => {} };
      },
    },
    integration: {
      list: async () => ({
        data: [
          {
            id: 'openai',
            connections: accounts.map((a) => ({
              type: 'credential',
              id: a.credentialID,
              label: a.label,
            })),
          },
        ],
      }),
      connection: {
        active: async () => ({ type: 'credential', id: 'c1' }),
        resolve: async (c: { id: string }) => ({
          type: 'oauth',
          access: c.id,
          metadata: { accountID: c.id },
        }),
      },
    },
  } as unknown as Plugin.Context;
  const registry = { list: async () => accounts };
  const percentages = new Map<number, number | undefined>([
    [1, 40],
    [2, 60],
    [3, 90],
  ]);
  const resets = new Map<number, number>();
  const quota = {
    remainingPercent: (n: number) => percentages.get(n),
    resetAt: (n: number) => resets.get(n),
    getQuota: vi.fn(
      async (accountNumber: number, _options?: { refresh?: boolean }) => ({
        state: 'fresh' as const,
        accountNumber,
      }),
    ),
    observeRateLimits: vi.fn(),
  };
  const requests = await registerRequests(ctx, registry);
  const rotation = await registerRotation(ctx, registry, requests, quota, {
    autoSwitchOn429: enabled,
  });
  const run = async (name: string, event: Event) => {
    for (const cb of hooks.get(name) ?? []) await cb(event);
    return event;
  };
  const scope = (n = 1, sessionID = 's') => ({
    sessionID,
    agent: 'build',
    model: {
      providerID: n === 1 ? 'openai' : `openai-codex-${n}`,
      id: 'gpt-6.1-sol',
    },
    kind: 'primary',
  });
  const prepare = async (n = 1, sessionID = 's', kind = 'primary') =>
    run('model.request', { ...scope(n, sessionID), kind, headers: {} });
  const respond = async (
    prepared: Event,
    body: unknown = { error: { type: 'usage_limit_reached' } },
    status = 429,
    headers?: HeadersInit,
  ) => {
    const response = new Response(JSON.stringify(body), { status, headers });
    await run('http.response', {
      ...prepared,
      request: new Request('https://example.test', {
        headers: prepared.headers,
      }),
      response,
    });
    expect(await response.json()).toEqual(body);
  };
  const retry = async (
    body: unknown = { error: { type: 'usage_limit_reached' } },
  ) =>
    run('retry', {
      ...scope(),
      error: {
        type: 'provider.rate-limit',
        status: 429,
        response: { body: JSON.stringify(body) },
      },
      attempt: 1,
      decision: { retry: false },
    });
  const account = (event: Event) =>
    new Headers(event.headers).get('chatgpt-account-id');
  return {
    ctx,
    registry,
    run,
    scope,
    prepare,
    respond,
    retry,
    account,
    requests,
    quota,
    percentages,
    resets,
    rotation,
  };
}
afterEach(() => vi.useRealTimers());

test('status reports the exact account block until expiry without changing rotation state', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1893456000000);
  const f = await fixture();
  const handlers = await registerCodexRpc(f.ctx, {
    registry: { ...f.registry, notices: [], add: vi.fn(), remove: vi.fn() },
    requests: f.requests,
    quota: f.quota,
    refreshProviders: vi.fn(),
    blockedUntil: f.rotation.blockedUntil,
  });
  const reset = Date.now() + 60_000;
  expect(f.rotation.blockedUntil(1)).toBeNull();
  await f.respond(await f.prepare(2), {
    error: { type: 'usage_limit_reached', resets_in_seconds: 60 },
  });
  const result = await handlers.state({ sessionID: 's' });
  expect(result).toMatchObject({
    ok: true,
    value: {
      accounts: [
        { number: 1, blockedUntil: null },
        { number: 2, blockedUntil: reset },
        { number: 3, blockedUntil: null },
      ],
    },
  });
  if (result.ok)
    expect(statusTable(result.value)).toContain(new Date(reset).toISOString());
  f.quota.getQuota.mockClear();
  vi.setSystemTime(reset - 1);
  expect(f.rotation.blockedUntil(2)).toBe(reset);
  vi.setSystemTime(reset);
  expect(f.rotation.blockedUntil(2)).toBeNull();
  expect(f.rotation.blockedUntil(99)).toBeNull();
  expect(f.quota.getQuota).not.toHaveBeenCalled();
  expect(await handlers.state({})).toMatchObject({
    ok: true,
    value: {
      accounts: [
        { blockedUntil: null },
        { blockedUntil: null },
        { blockedUntil: null },
      ],
    },
  });
});

test('only observed usage 429 accounts block: rebuilt requests rank fresh quota and retry without attribution', async () => {
  const f = await fixture();
  const primary = await f.prepare();
  const auxiliary = await f.prepare(2, 's', 'compaction');
  await f.respond(auxiliary);
  expect((await f.retry()).decision).toEqual({ retry: true, delay: 0 });
  expect(f.account(await f.prepare())).toBe('c1');
  expect(f.account(await f.prepare(2, 'other'))).toBe('c3');
  await f.respond(primary);
  expect(f.account(await f.prepare())).toBe('c3');
  await f.respond(await f.prepare());
  expect(f.account(await f.prepare())).toBe('c1');
  expect((await f.retry()).decision).toEqual({ retry: false });
});

test.each([
  'relative',
  'absolute',
  'headers',
  'quota',
  'fallback',
])('blocks expire from %s, with a refresh before unknown blocks become eligible', async (source) => {
  vi.useFakeTimers();
  vi.setSystemTime(1893456000000);
  const f = await fixture();
  const start = Date.now();
  const seconds = source === 'fallback' ? 300 : 60;
  const error: Record<string, unknown> = { type: 'usage_limit_reached' };
  if (source === 'relative') error.resets_in_seconds = 60;
  if (source === 'absolute') error.resets_at = (start + 60_000) / 1000;
  if (source === 'quota') f.resets.set(1, start + 60_000);
  const headers =
    source === 'headers'
      ? { 'x-codex-primary-reset-after-seconds': '60' }
      : undefined;
  await f.respond(await f.prepare(), { error }, 429, headers);
  vi.setSystemTime(start + seconds * 1000 - 1);
  expect(f.account(await f.prepare())).toBe('c3');
  f.quota.getQuota.mockClear();
  vi.setSystemTime(start + seconds * 1000);
  expect(f.account(await f.prepare())).toBe('c1');
  if (source === 'fallback')
    expect(f.quota.getQuota).toHaveBeenCalledWith(1, { refresh: true });
});

test('WebSocket receive uses the last routed handshake, survives socket reuse, and is isolated from HTTP auxiliaries', async () => {
  const f = await fixture();
  const ws = async (sessionID = 's') =>
    f.run('experimental.ws.handshake', {
      ...f.scope(1, sessionID),
      headers: {},
    });
  const frame = async (value: unknown, sessionID = 's') =>
    f.run('experimental.ws.receive', {
      ...f.scope(1, sessionID),
      frame: JSON.stringify(value),
    });
  await f.respond(await f.prepare());
  expect(f.account(await ws())).toBe('c3');
  await ws('other');
  const auxiliary = await f.prepare(2, 's', 'compaction');
  await f.respond(auxiliary);
  // HTTP did not replace the socket's account with 2, and a status-less frame blocks routed 3, not pinned 1.
  const usage = {
    type: 'error',
    error: { type: 'usage_limit_reached', resets_in_seconds: 60 },
  };
  await frame(usage);
  expect((await f.retry()).decision).toEqual({ retry: false });
  await frame({
    type: 'codex.rate_limits',
    rate_limits: { primary: { used_percent: 83, reset_after_seconds: 90 } },
  });
  expect(f.quota.observeRateLimits).toHaveBeenLastCalledWith(
    3,
    expect.objectContaining({
      primary: expect.objectContaining({ usedPercent: 83 }),
    }),
  );
  // A new handshake after reset/header changes replaces only this session's attribution.
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 301_000);
  expect(f.account(await ws())).toBe('c1');
  await frame({
    type: 'codex.rate_limits',
    rate_limits: { primary: { used_percent: 12 } },
  });
  expect(f.quota.observeRateLimits).toHaveBeenLastCalledWith(
    1,
    expect.anything(),
  );
  await frame(
    {
      type: 'codex.rate_limits',
      rate_limits: { primary: { used_percent: 22 } },
    },
    'other',
  );
  expect(f.quota.observeRateLimits).toHaveBeenLastCalledWith(
    3,
    expect.anything(),
  );
  await frame(usage);
  expect(f.account(await f.prepare())).toBe('c3');
});

test('selection ranks fresh quota, unknown/stale last, then number; unblocked pins and session overrides win', async () => {
  const f = await fixture();
  await f.respond(await f.prepare());
  f.percentages.set(2, undefined);
  f.percentages.set(3, 0);
  expect(f.account(await f.prepare())).toBe('c3');
  f.percentages.set(3, undefined);
  expect(f.account(await f.prepare())).toBe('c2');
  f.percentages.set(2, 50);
  f.percentages.set(3, 50);
  expect(f.account(await f.prepare())).toBe('c2');
  f.percentages.set(3, 100);
  expect(f.account(await f.prepare(2))).toBe('c2');
  f.requests.overrides.set('override', 1);
  expect(f.account(await f.prepare(2, 'override'))).toBe('c3');
  f.requests.overrides.set('override', 2);
  expect(f.account(await f.prepare(1, 'override'))).toBe('c2');
});

test.each([
  ['compaction', 'primary'],
  ['primary', 'compaction'],
  ['generate', 'primary'],
])('a delayed %s 429 callback never blocks the rebuilt %s account', async (failedKind, rebuiltKind) => {
  const f = await fixture();
  const delayed = await f.prepare(2, 's', failedKind);
  await f.respond(await f.prepare()); // primary 1 failed, host can rebuild before auxiliary callback
  const rebuilt = await f.prepare(1, 's', rebuiltKind);
  expect(f.account(rebuilt)).toBe('c3');
  await f.respond(delayed);
  for (let i = 0; i < 2; i++) {
    expect((await f.retry()).decision).toEqual({ retry: true, delay: 0 });
    expect(f.account(await f.prepare(1, 's', rebuiltKind))).toBe('c3');
  }
  expect(f.account(await f.prepare(3, 'other'))).toBe('c3');
  // Actual sent HTTP request headers, not current pins/overrides, determine the block.
  const sent = await f.run('http.request', {
    ...f.scope(),
    request: new Request('https://example.test'),
  });
  await f.run('http.response', {
    ...f.scope(),
    request: sent.request,
    response: new Response('{"error":{"type":"usage_limit_reached"}}', {
      status: 429,
    }),
  });
  expect((await f.retry()).decision).toEqual({ retry: false });
});

test('non-usage 429, other status and unrecognized headers never block or force retry', async () => {
  const f = await fixture();
  await f.respond(await f.prepare(), {
    error: { type: 'rate_limit_exceeded' },
  });
  await f.respond(
    await f.prepare(),
    { error: { type: 'usage_limit_reached' } },
    500,
  );
  await f.run('http.response', {
    ...f.scope(),
    request: new Request('https://example.test'),
    response: new Response('{"error":{"type":"usage_limit_reached"}}', {
      status: 429,
    }),
  });
  expect(f.account(await f.prepare())).toBe('c1');
  expect(
    (await f.retry({ error: { type: 'rate_limit_exceeded' } })).decision,
  ).toEqual({ retry: false });
  const event = {
    ...f.scope(),
    model: { providerID: 'anthropic' },
    error: {
      status: 429,
      response: { body: '{"error":{"type":"usage_limit_reached"}}' },
    },
    decision: { retry: false },
  };
  await f.run('retry', event);
  expect(event.decision).toEqual({ retry: false });
});

test('disabled switching preserves pins and native retry decisions while socket quota observations stay on', async () => {
  const f = await fixture(false);
  await f.respond(await f.prepare());
  expect(f.account(await f.prepare())).toBe('c1');
  expect((await f.retry()).decision).toEqual({ retry: false });
  await f.run('experimental.ws.handshake', { ...f.scope(), headers: {} });
  await f.run('experimental.ws.receive', {
    ...f.scope(),
    frame:
      '{"type":"codex.rate_limits","rate_limits":{"primary":{"used_percent":15}}}',
  });
  expect(f.quota.observeRateLimits).toHaveBeenCalledWith(1, expect.anything());
  await f.rotation.dispose();
  expect(f.account(await f.prepare())).toBe('c1');
});

test('header resets use exhausted windows rather than a later non-exhausted window, and body reset takes priority', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1893456000000);
  const f = await fixture();
  const start = Date.now();
  f.resets.set(1, start + 1000_000);
  const headers = {
    'x-codex-primary-used-percent': '100',
    'x-codex-primary-reset-at': String(start / 1000 + 60),
    'x-codex-secondary-used-percent': '10',
    'x-codex-secondary-reset-after-seconds': '10000',
  };
  await f.respond(await f.prepare(), undefined, 429, headers);
  vi.setSystemTime(start + 60_000);
  expect(f.account(await f.prepare())).toBe('c1');
  await f.respond(
    await f.prepare(),
    { error: { type: 'usage_limit_reached', resets_in_seconds: 10 } },
    429,
    headers,
  );
  vi.setSystemTime(start + 70_000);
  expect(f.account(await f.prepare())).toBe('c1');
});

test('an account blocked while candidate quotas refresh cannot win selection', async () => {
  const f = await fixture();
  const concurrent = await f.prepare(3, 'other');
  await f.respond(await f.prepare());
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  f.quota.getQuota.mockImplementationOnce(async (accountNumber) => {
    entered();
    await gate;
    return { state: 'fresh', accountNumber };
  });
  const rebuilt = f.prepare();
  await started;
  await f.respond(concurrent);
  release();
  expect(f.account(await rebuilt)).toBe('c2');
});

test('unknown-block expiry refresh is shared, fresh exhaustion extends it, and a simultaneous 429 is retained', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1893456000000);
  const f = await fixture();
  const sent = await f.prepare();
  expect(f.quota.getQuota).not.toHaveBeenCalled();
  await f.respond(sent);
  vi.setSystemTime(Date.now() + 300_000);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  f.quota.getQuota.mockImplementationOnce(async (accountNumber) => {
    entered();
    await gate;
    f.percentages.set(1, 0);
    f.resets.set(1, Date.now() + 60_000);
    return { state: 'fresh', accountNumber };
  });
  const first = f.prepare();
  await started;
  const second = f.prepare();
  // The already-sent request re-confirms a later actual reset while refresh is pending.
  await f.respond(sent, {
    error: { type: 'usage_limit_reached', resets_in_seconds: 120 },
  });
  release();
  expect((await Promise.all([first, second])).map(f.account)).toEqual([
    'c3',
    'c3',
  ]);
  expect(
    f.quota.getQuota.mock.calls.filter(
      ([n, options]) => n === 1 && options?.refresh === true,
    ),
  ).toHaveLength(1);
  vi.setSystemTime(Date.now() + 60_000);
  expect(f.account(await f.prepare())).toBe('c3');
  vi.setSystemTime(Date.now() + 60_000);
  expect(f.account(await f.prepare())).toBe('c1');
});

test('fallback refresh with fresh exhausted quota uses its future reset', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1893456000000);
  const f = await fixture();
  await f.respond(await f.prepare());
  vi.setSystemTime(Date.now() + 300_000);
  f.percentages.set(1, 0);
  f.resets.set(1, Date.now() + 60_000);
  expect(f.account(await f.prepare())).toBe('c3');
  vi.setSystemTime(Date.now() + 60_000);
  expect(f.account(await f.prepare())).toBe('c1');
});
