import type { Plugin } from '@opencode/plugin';
import { expect, test, vi } from 'vitest';
import { registerRequests } from './requests.js';

type HookEvent = {
  sessionID: string;
  agent: string;
  model: { providerID: string; id: string };
  kind: string;
  headers: Record<string, string>;
  request?: Request;
};

function fixture() {
  const hooks = new Map<string, (event: HookEvent) => Promise<void>>();
  const connections = [1, 2].map((n) => ({
    type: 'credential',
    id: `c${n}`,
    label: `Account ${n}`,
    method: 'oauth',
  }));
  const resolve = vi.fn(async (connection: { id: string }) => ({
    type: 'oauth',
    access: `fresh-${connection.id}`,
    refresh: 'native-only',
    expires: 0,
    metadata: { accountID: `chatgpt-${connection.id}` },
  }));
  let deliver: (
    event: { type: 'session.deleted'; data: { sessionID: string } } | undefined,
  ) => void = () => {};
  const deletion = new Promise<
    { type: 'session.deleted'; data: { sessionID: string } } | undefined
  >((resolve) => {
    deliver = resolve;
  });
  const ctx = {
    event: {
      subscribe: async function* (options: { signal: AbortSignal }) {
        options.signal.addEventListener('abort', () => deliver(undefined), {
          once: true,
        });
        const event = await deletion;
        if (event) yield event;
      },
    },
    session: {
      hook: async (name: string, cb: (event: HookEvent) => Promise<void>) => {
        hooks.set(name, cb);
        return { dispose: vi.fn(async () => {}) };
      },
    },
    integration: {
      list: async () => ({ data: [{ id: 'openai', connections }] }),
      connection: { resolve },
    },
  } as unknown as Plugin.Context;
  const registry = {
    list: async () =>
      connections.map((c, i) => ({
        number: i + 1,
        providerID: i ? 'openai-codex-2' : 'openai',
        credentialID: c.id,
        label: c.label,
        state: 'ok' as const,
      })),
  };
  const event = (providerID = 'openai', sessionID = 's1') => ({
    sessionID,
    agent: 'build',
    model: { providerID, id: 'gpt-6.1-sol' },
    kind: 'primary',
    headers: {
      authorization: 'Bearer globally-active',
      'CHATGPT-ACCOUNT-ID': 'active',
      'x-custom': 'keep',
    } as Record<string, string>,
  });
  const run = async (name: string, input: HookEvent) => {
    const hook = hooks.get(name);
    if (!hook) throw new Error(`Missing ${name}`);
    await hook(input);
  };
  return {
    ctx,
    registry,
    event,
    run,
    resolve,
    connections,
    deleteSession: (sessionID: string) =>
      deliver({ type: 'session.deleted', data: { sessionID } }),
  };
}

test('concurrent pinned sessions resolve fresh native credentials and replace mixed-case auth headers', async () => {
  const f = fixture();
  await registerRequests(f.ctx, f.registry);
  const first = f.event();
  const second = f.event('openai-codex-2', 's2');
  await Promise.all([
    f.run('model.request', first),
    f.run('model.request', second),
  ]);
  expect(new Headers(first.headers).get('authorization')).toBe(
    'Bearer fresh-c1',
  );
  expect(new Headers(second.headers).get('authorization')).toBe(
    'Bearer fresh-c2',
  );
  expect(new Headers(first.headers).get('chatgpt-account-id')).toBe(
    'chatgpt-c1',
  );
  expect(new Headers(second.headers).get('chatgpt-account-id')).toBe(
    'chatgpt-c2',
  );
  expect(new Headers(second.headers).get('x-custom')).toBe('keep');
  expect(f.resolve.mock.calls.map(([c]) => c.id).sort()).toEqual(['c1', 'c2']);
});

test('session deletion clears overrides and disposal removes hooks', async () => {
  const f = fixture();
  const runtime = await registerRequests(f.ctx, f.registry);
  runtime.overrides.set('parent', 2);
  await f.run('experimental.ws.handshake', f.event('openai', 'parent'));
  expect(runtime.accountForWebSocket('parent')).toBe(2);
  f.deleteSession('parent');
  await vi.waitFor(() =>
    expect(runtime.overrides.get('parent')).toBeUndefined(),
  );
  expect(runtime.accountForWebSocket('parent')).toBeUndefined();
  await runtime.dispose();
});

test('unrelated providers bypass routing/resolution and unresolved account 1 preserves native headers', async () => {
  const f = fixture();
  const runtime = await registerRequests(f.ctx, f.registry);
  const router = vi.fn(() => 2);
  runtime.setRouter(router);
  for (const providerID of [
    'anthropic',
    'openai-compatible',
    'openai-codex-1',
    'openai-codex-02',
  ]) {
    const event = f.event(providerID);
    const original = { ...event.headers };
    await f.run('model.request', event);
    await f.run('experimental.ws.handshake', event);
    const http = {
      ...event,
      request: new Request('https://example.test', { headers: original }),
    };
    await f.run('http.request', http);
    expect(event.headers).toEqual(original);
    expect(http.request.headers.get('authorization')).toBe(
      'Bearer globally-active',
    );
  }
  expect(router).not.toHaveBeenCalled();
  expect(f.resolve).not.toHaveBeenCalled();
  runtime.setRouter(undefined);
  f.resolve.mockRejectedValue(new Error('secret native error'));
  const event = f.event();
  const original = { ...event.headers };
  await f.run('model.request', event);
  expect(event.headers).toEqual(original);
  await expect(
    f.run('model.request', f.event('openai-codex-2')),
  ).rejects.toThrow('Codex account 2');
  await expect(
    f.run('http.request', {
      ...f.event('openai-codex-3'),
      request: new Request('https://example.test'),
    }),
  ).rejects.toThrow('Codex account 3');
  await expect(
    f.run('experimental.ws.handshake', f.event('openai-codex-2')),
  ).rejects.not.toThrow('secret');
  await runtime.dispose();
});

test('native resolve runs for each request and JWT account claim is the fallback for absent metadata', async () => {
  const f = fixture();
  const runtime = await registerRequests(f.ctx, f.registry);
  const access = `header.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'jwt-account' } })).toString('base64url')}.signature`;
  f.resolve.mockResolvedValue({
    type: 'oauth',
    access,
    refresh: 'native-only',
    expires: 0,
    metadata: {} as { accountID: string },
  });
  const event = f.event('openai-codex-2');
  await f.run('model.request', event);
  expect(new Headers(event.headers).get('chatgpt-account-id')).toBe(
    'jwt-account',
  );
  f.resolve.mockResolvedValue({
    type: 'oauth',
    access: 'refreshed-again',
    refresh: 'native-only',
    expires: 0,
    metadata: { accountID: 'metadata-wins' },
  });
  await f.run('experimental.ws.handshake', event);
  expect(new Headers(event.headers).get('authorization')).toBe(
    'Bearer refreshed-again',
  );
  expect(new Headers(event.headers).get('chatgpt-account-id')).toBe(
    'metadata-wins',
  );
  expect(f.resolve).toHaveBeenCalledTimes(2);
  await runtime.dispose();
});

test('final HTTP requests and every WebSocket handshake use session overrides without affecting children', async () => {
  const f = fixture();
  const runtime = await registerRequests(f.ctx, f.registry);
  runtime.overrides.set('parent', 2);
  expect(runtime.overrides.get('parent')).toBe(2);
  for (const kind of ['primary', 'compaction', 'title', 'generate']) {
    const http = {
      ...f.event('openai', 'parent'),
      kind,
      request: new Request('https://chatgpt.com/backend-api/codex/responses', {
        method: 'POST',
        body: 'payload',
        headers: { Authorization: 'Bearer active', 'x-custom': 'keep' },
      }),
    };
    await f.run('http.request', http);
    expect(http.request.headers.get('authorization')).toBe('Bearer fresh-c2');
    expect(http.request.headers.get('chatgpt-account-id')).toBe('chatgpt-c2');
    expect(http.request.headers.has('x-thoth-codex-account')).toBe(false);
    expect([...http.request.headers.keys()].sort()).toEqual([
      'authorization',
      'chatgpt-account-id',
      'content-type',
      'x-custom',
    ]);
    expect(runtime.accountForSentHeaders(http.request.headers)).toBe(2);
    expect(http.request.headers.get('x-custom')).toBe('keep');
    expect(await http.request.text()).toBe('payload');
    const ws = {
      ...f.event('openai', 'parent'),
      kind,
      url: 'wss://chatgpt.com/backend-api/codex/responses',
    };
    await f.run('experimental.ws.handshake', ws);
    expect(new Headers(ws.headers).get('authorization')).toBe(
      'Bearer fresh-c2',
    );
    expect(new Headers(ws.headers).get('chatgpt-account-id')).toBe(
      'chatgpt-c2',
    );
    expect(new Headers(ws.headers).has('x-thoth-codex-account')).toBe(false);
    const child = f.event('openai', 'child');
    await f.run('model.request', child);
    expect(new Headers(child.headers).get('authorization')).toBe(
      'Bearer fresh-c1',
    );
  }
  runtime.overrides.clear('parent');
  expect(runtime.overrides.get('parent')).toBeUndefined();
  const reset = f.event('openai', 'parent');
  await f.run('model.request', reset);
  expect(new Headers(reset.headers).get('authorization')).toBe(
    'Bearer fresh-c1',
  );
  runtime.setRouter(({ accountNumber }) =>
    accountNumber === 1 ? 2 : accountNumber,
  );
  expect(
    await runtime.resolveAccountForRequest({
      sessionID: 'parent',
      providerID: 'openai',
      kind: 'title',
    }),
  ).toBe(2);
  await f.run('model.request', reset);
  expect(new Headers(reset.headers).get('authorization')).toBe(
    'Bearer fresh-c2',
  );
  await runtime.dispose();
});

test('sent-header attribution survives refresh and concurrent requests without retaining wire markers', async () => {
  const f = fixture();
  const runtime = await registerRequests(f.ctx, f.registry);
  const first = f.event();
  const second = f.event('openai-codex-2', 's2');
  await Promise.all([
    f.run('model.request', first),
    f.run('model.request', second),
  ]);
  const sentFirst = new Headers(first.headers);
  const sentSecond = new Headers(second.headers);
  expect(sentFirst.has('x-thoth-codex-account')).toBe(false);
  expect(runtime.accountForSentHeaders(sentFirst)).toBe(1);
  expect(runtime.accountForSentHeaders(sentSecond)).toBe(2);
  expect(runtime.accountForSentHeaders(new Headers())).toBeUndefined();
  expect(
    runtime.accountForSentHeaders({
      Authorization: 'Bearer unrelated',
      'ChatGPT-Account-Id': 'chatgpt-c2',
    }),
  ).toBeUndefined();
  f.resolve.mockResolvedValue({
    type: 'oauth',
    access: 'refreshed-c2',
    refresh: 'native-only',
    expires: 0,
    metadata: { accountID: 'chatgpt-c2' },
  });
  await f.run('model.request', second);
  expect(runtime.accountForSentHeaders(second.headers)).toBe(2);
  expect(runtime.accountForSentHeaders(sentSecond)).toBe(2);
  expect(runtime.accountForSentHeaders(sentFirst)).toBe(1);
  await runtime.dispose();
  expect(runtime.accountForSentHeaders(sentFirst)).toBeUndefined();
});

test('identical native credentials across mappings make header attribution ambiguous, not last-writer-wins', async () => {
  const f = fixture();
  const runtime = await registerRequests(f.ctx, f.registry);
  f.resolve.mockResolvedValue({
    type: 'oauth',
    access: 'shared-token',
    refresh: 'native-only',
    expires: 0,
    metadata: { accountID: 'shared-account' },
  });
  const first = f.event();
  await f.run('model.request', first);
  expect(runtime.accountForSentHeaders(first.headers)).toBe(1);
  await f.run('model.request', f.event('openai-codex-2'));
  expect(runtime.accountForSentHeaders(first.headers)).toBeUndefined();
  await f.run('model.request', first);
  expect(runtime.accountForSentHeaders(first.headers)).toBeUndefined();
  await runtime.dispose();
});
