import type { Plugin } from '@opencode/plugin';
import { expect, test, vi } from 'vitest';
import { registerRequests } from '../request/requests.js';
import { registerQuota } from './observer.js';

test('response observer attributes quota to sent credentials, not session or pinned provider, without consuming the body', async () => {
  type Event = {
    sessionID: string;
    model: { providerID: string };
    kind: string;
    request: Request;
    response: Response;
  };
  const hooks = new Map<string, (event: Event) => Promise<void>>();
  const run = async (name: string, event: Event) => {
    const hook = hooks.get(name);
    if (!hook) throw new Error(`Missing hook: ${name}`);
    await hook(event);
  };
  const dispose = vi.fn();
  const ctx = {
    session: {
      hook: async (name: string, cb: (event: Event) => Promise<void>) => {
        hooks.set(name, cb);
        return { dispose };
      },
    },
    integration: {
      list: async () => ({
        data: [
          {
            id: 'openai',
            connections: [1, 2].map((n) => ({
              type: 'credential',
              id: `c${n}`,
            })),
          },
        ],
      }),
      connection: {
        resolve: async (connection: { id: string }) => ({
          type: 'oauth',
          access: `token-${connection.id}`,
          metadata: { accountID: `id-${connection.id}` },
        }),
      },
    },
  } as unknown as Plugin.Context;
  const registry = {
    list: async () =>
      [1, 2].map((n) => ({
        number: n,
        credentialID: `c${n}`,
        label: `${n}`,
        providerID: n === 1 ? 'openai' : 'openai-codex-2',
        state: 'ok' as const,
      })),
  };
  const requests = await registerRequests(ctx, registry);
  const quota = await registerQuota(ctx, registry, requests);
  requests.overrides.set('shared', 2);
  const event = {
    sessionID: 'shared',
    model: { providerID: 'openai' },
    kind: 'primary',
    request: new Request('https://chatgpt.com/backend-api/codex/responses'),
    response: new Response('untouched', {
      headers: { 'x-codex-primary-used-percent': '85' },
    }),
  };
  await run('http.request', event);
  requests.overrides.clear('shared');
  await run('http.response', event);
  expect(quota.remainingPercent(2)).toBe(15);
  expect(quota.remainingPercent(1)).toBeUndefined();
  expect(event.response.bodyUsed).toBe(false);
  expect(await event.response.text()).toBe('untouched');
  await run('http.response', {
    ...event,
    request: new Request(event.request.url),
    response: new Response(null, {
      headers: { 'x-codex-primary-used-percent': '100' },
    }),
  });
  expect(quota.remainingPercent(2)).toBe(15);
  vi.spyOn(requests, 'accountForSentHeaders').mockImplementation(() => {
    throw new Error('transport error');
  });
  await expect(run('http.response', event)).resolves.toBeUndefined();
  await quota.dispose();
  await requests.dispose();
  expect(dispose).toHaveBeenCalledTimes(4);
});
