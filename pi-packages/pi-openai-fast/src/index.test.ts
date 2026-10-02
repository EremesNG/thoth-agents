import type { Api, Model } from '@earendil-works/pi-ai';
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionVirtualModel,
} from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import openAiFast from './index.ts';

function model(provider: string, id: string, api: string): Model<Api> {
  return {
    id,
    name: `Name ${id}`,
    api,
    provider,
    baseUrl: 'https://example.test',
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 272_000,
    maxTokens: 128_000,
  } as Model<Api>;
}

type Handler = (event: any, ctx: ExtensionContext) => unknown;

function setup(initial: Model<Api>[]) {
  let models = initial;
  const handlers = new Map<string, Handler>();
  const virtuals = new Map<string, ExtensionVirtualModel>();
  const pi = {
    on: (event: string, handler: Handler) => {
      handlers.set(event, handler);
      return () => {};
    },
    registerVirtualModel: (def: ExtensionVirtualModel) =>
      virtuals.set(`${def.provider}/${def.id}`, def),
    unregisterVirtualModel: (provider: string, id: string) =>
      virtuals.delete(`${provider}/${id}`),
    registerProvider: () => {
      throw new Error('registerProvider must not be called');
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    modelRegistry: {
      getAll: () => models,
      find: (provider: string, id: string) =>
        models.find((m) => m.provider === provider && m.id === id),
    },
  } as unknown as ExtensionContext;
  openAiFast(pi);
  return {
    virtuals,
    ctx,
    setModels: (next: Model<Api>[]) => {
      models = next;
    },
    start: () =>
      handlers.get('session_start')?.(
        { type: 'session_start', reason: 'startup' },
        ctx,
      ),
    route: async (key: string, reason: string, thinkingLevel = 'high') =>
      virtuals.get(key)?.route(
        {
          reason,
          thinkingLevel,
          model: {} as Model<Api>,
          messages: [],
        } as never,
        ctx,
      ) as Promise<{
        model: Model<Api>;
        thinkingLevel: string;
      }>,
    request: (payload: unknown) =>
      handlers.get('before_provider_request')?.(
        { type: 'before_provider_request', payload },
        ctx,
      ),
  };
}

const catalog = () => [
  model('openai', 'gpt-5', 'openai-responses'),
  model('openai-codex', 'gpt-5-codex', 'openai-codex-responses'),
  model('openai-codex-2', 'gpt-5-codex', 'openai-codex-responses'),
  model('anthropic', 'claude', 'anthropic-messages'),
];

describe('openai fast extension', () => {
  it('registers variants for openai, openai-codex and openai-codex-2 on session_start only', async () => {
    const h = setup(catalog());
    expect(h.virtuals.size).toBe(0);
    await h.start();
    expect([...h.virtuals.keys()].sort()).toEqual([
      'openai-codex-2/gpt-5-codex-fast',
      'openai-codex/gpt-5-codex-fast',
      'openai/gpt-5-fast',
    ]);
    const def = h.virtuals.get('openai-codex-2/gpt-5-codex-fast');
    expect(def).toMatchObject({
      name: 'Name gpt-5-codex (fast)',
      contextWindow: 272_000,
      maxTokens: 128_000,
    });
  });

  it('is idempotent and unregisters variants whose base disappeared', async () => {
    const h = setup(catalog());
    await h.start();
    await h.start();
    expect(h.virtuals.size).toBe(3);
    h.setModels(catalog().filter((m) => m.provider !== 'openai-codex-2'));
    await h.start();
    expect([...h.virtuals.keys()].sort()).toEqual([
      'openai-codex/gpt-5-codex-fast',
      'openai/gpt-5-fast',
    ]);
  });

  it.each([
    ['openai/gpt-5-fast', 'openai', 'gpt-5', 'openai-responses'],
    [
      'openai-codex-2/gpt-5-codex-fast',
      'openai-codex-2',
      'gpt-5-codex',
      'openai-codex-responses',
    ],
  ])('routes %s to its physical base and prioritizes the next payload for user/continuation/retry', async (key, provider, baseId, api) => {
    for (const reason of ['user', 'continuation', 'retry']) {
      const h = setup(catalog());
      await h.start();
      const route = await h.route(key, reason, 'high');
      expect(route.model).toMatchObject({ provider, id: baseId, api });
      expect(route.thinkingLevel).toBe('high');
      expect(h.request({ model: baseId, input: [] })).toEqual({
        model: baseId,
        input: [],
        service_tier: 'priority',
      });
      expect(h.request({ model: baseId })).toBeUndefined();
    }
  });

  it('clamps an unsupported thinking level to the base model', async () => {
    const h = setup([
      { ...model('openai', 'gpt-4o', 'openai-responses'), reasoning: false },
    ]);
    await h.start();
    const route = await h.route('openai/gpt-4o-fast', 'user', 'high');
    expect(route.thinkingLevel).toBe('off');
  });

  it('leaves payloads untouched without a fast route, for direct routes, and for non-fast selection', async () => {
    const h = setup(catalog());
    await h.start();
    expect(h.request({ model: 'gpt-5' })).toBeUndefined();
    await h.route('openai/gpt-5-fast', 'direct');
    expect(h.request({ model: 'gpt-5' })).toBeUndefined();
  });

  it('does not let a direct route keep an earlier armed token alive', async () => {
    const h = setup(catalog());
    await h.start();
    await h.route('openai/gpt-5-fast', 'user');
    await h.route('openai/gpt-5-fast', 'direct');
    expect(h.request({ model: 'gpt-5' })).toBeUndefined();
  });

  it('does not leak priority to a same-base request chosen by another package after a mismatched payload', async () => {
    const h = setup(catalog());
    await h.start();
    await h.route('openai/gpt-5-fast', 'user');
    expect(h.request({ model: 'other-model' })).toBeUndefined();
    expect(h.request({ model: 'gpt-5' })).toBeUndefined();
  });

  it('does not leak a stale token from a failed route to a later request', async () => {
    const h = setup(catalog());
    await h.start();
    await h.route('openai/gpt-5-fast', 'user');
    h.setModels(catalog().filter((m) => m.provider !== 'openai-codex'));
    await expect(
      h.route('openai-codex/gpt-5-codex-fast', 'user'),
    ).rejects.toThrow(/gpt-5-codex.*openai-codex/);
    expect(h.request({ model: 'gpt-5' })).toBeUndefined();
  });

  it('throws a clear error when the base model is missing at request time', async () => {
    const h = setup(catalog());
    await h.start();
    h.setModels([]);
    await expect(h.route('openai/gpt-5-fast', 'user')).rejects.toThrow(
      /openai\/gpt-5/,
    );
  });
});
