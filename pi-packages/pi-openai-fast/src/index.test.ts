import type { Api, AssistantMessage, Model } from '@earendil-works/pi-ai';
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionVirtualModel,
  MessageEndEvent,
  MessageEndEventResult,
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
    end: (message: MessageEndEvent['message']) =>
      handlers.get('message_end')?.({ type: 'message_end', message }, ctx) as
        | MessageEndEventResult
        | undefined,
  };
}

function pricedModel(provider: string, id: string, api: string): Model<Api> {
  return {
    ...model(provider, id, api),
    cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
  };
}

function assistantMessage(base: Model<Api>): AssistantMessage {
  return {
    role: 'assistant',
    provider: base.provider,
    model: base.id,
    api: base.api,
    content: [{ type: 'text', text: 'Done' }],
    stopReason: 'stop',
    timestamp: 0,
    usage: {
      input: 1_000_000,
      output: 1_000_000,
      cacheRead: 1_000_000,
      cacheWrite: 1_000_000,
      totalTokens: 4_000_000,
      cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
    },
  };
}

async function prioritizedRequest(base: Model<Api>) {
  const h = setup([base]);
  await h.start();
  await h.route(`${base.provider}/${base.id}-fast`, 'user');
  expect(h.request({ model: base.id })).toMatchObject({
    service_tier: 'priority',
  });
  return h;
}

const catalog = () => [
  model('openai', 'gpt-5', 'openai-responses'),
  model('openai-codex', 'gpt-5-codex', 'openai-codex-responses'),
  model('openai-codex-2', 'gpt-5-codex', 'openai-codex-responses'),
  model('anthropic', 'claude', 'anthropic-messages'),
];

describe('openai fast extension', () => {
  it.each([
    'gpt-5-codex',
    'gpt-5.5-codex',
  ])('returns priority-priced %s usage without changing the original assistant message', async (id) => {
    const base = pricedModel('openai-codex-2', id, 'openai-codex-responses');
    const h = setup([base]);
    await h.start();
    await h.route(`openai-codex-2/${id}-fast`, 'user');
    expect(h.request({ model: base.id })).toEqual({
      model: base.id,
      service_tier: 'priority',
    });
    const message = assistantMessage(base);
    const original = structuredClone(message);
    const replacement = h.end(message)?.message as AssistantMessage;
    expect(replacement).toEqual({
      ...original,
      usage: {
        ...original.usage,
        cost: { input: 2, output: 4, cacheRead: 6, cacheWrite: 8, total: 20 },
      },
    });
    expect(replacement).not.toBe(message);
    expect(replacement.usage).not.toBe(message.usage);
    expect(replacement.usage.cost).not.toBe(message.usage.cost);
    expect(message).toEqual(original);
  });

  it('uses the Codex priority multiplier of 2.5 for exactly gpt-5.5', async () => {
    const base = pricedModel(
      'openai-codex',
      'gpt-5.5',
      'openai-codex-responses',
    );
    const h = await prioritizedRequest(base);
    const replacement = h.end(assistantMessage(base))
      ?.message as AssistantMessage;
    expect(replacement.usage.cost).toEqual({
      input: 2.5,
      output: 5,
      cacheRead: 7.5,
      cacheWrite: 10,
      total: 25,
    });
  });

  it.each([
    [
      'gpt-5-codex',
      { input: 2, output: 4, cacheRead: 6, cacheWrite: 8, total: 20 },
    ],
    [
      'gpt-5.5',
      { input: 2.5, output: 5, cacheRead: 7.5, cacheWrite: 10, total: 25 },
    ],
  ])('does not double-charge already-priced %s messages', async (id, cost) => {
    const base = pricedModel('openai-codex', id, 'openai-codex-responses');
    const h = await prioritizedRequest(base);
    const message = assistantMessage(base);
    message.usage.cost = cost;
    const original = structuredClone(message);
    expect(h.end(message)).toBeUndefined();
    expect(message).toEqual(original);
    expect(h.end(assistantMessage(base))).toBeUndefined();
  });

  it('leaves OpenAI API pricing to the server-reported tier', async () => {
    const base = pricedModel('openai', 'gpt-5', 'openai-responses');
    const h = setup([base]);
    await h.start();
    await h.route('openai/gpt-5-fast', 'user');
    expect(h.request({ model: base.id })).toMatchObject({
      service_tier: 'priority',
    });
    const message = assistantMessage(base);
    const original = structuredClone(message);
    expect(h.end(message)).toBeUndefined();
    expect(message).toEqual(original);
  });

  it('does not price physical selections or a fast route before priority is applied', async () => {
    const base = pricedModel(
      'openai-codex',
      'gpt-5-codex',
      'openai-codex-responses',
    );
    const h = setup([base]);
    await h.start();
    expect(h.end(assistantMessage(base))).toBeUndefined();
    expect(h.request({ model: base.id })).toBeUndefined();
    expect(h.end(assistantMessage(base))).toBeUndefined();
    await h.route('openai-codex/gpt-5-codex-fast', 'user');
    expect(h.end(assistantMessage(base))).toBeUndefined();
  });

  it.each([
    null,
    { model: 'other-model' },
  ])('does not price when the guard rejects payload %j', async (payload) => {
    const base = pricedModel(
      'openai-codex',
      'gpt-5-codex',
      'openai-codex-responses',
    );
    const h = setup([base]);
    await h.start();
    await h.route('openai-codex/gpt-5-codex-fast', 'user');
    expect(h.request(payload)).toBeUndefined();
    expect(h.request({ model: base.id })).toBeUndefined();
    expect(h.end(assistantMessage(base))).toBeUndefined();
  });

  it.each([
    'stop',
    'error',
    'aborted',
  ] as const)('consumes pricing after one %s assistant message', async (stopReason) => {
    const base = pricedModel(
      'openai-codex',
      'gpt-5-codex',
      'openai-codex-responses',
    );
    const h = await prioritizedRequest(base);
    const message = assistantMessage(base);
    message.stopReason = stopReason;
    expect(h.end(message)?.message).toMatchObject({
      stopReason,
      usage: { cost: { total: 20 } },
    });
    expect(h.end(assistantMessage(base))).toBeUndefined();
  });

  it.each([
    { provider: 'another-provider' },
    { model: 'another-model' },
    { api: 'openai-responses' },
    { api: 'anthropic-messages' },
  ])('consumes pricing without changing a mismatched assistant message: %j', async (mismatch) => {
    const base = pricedModel(
      'openai-codex',
      'gpt-5-codex',
      'openai-codex-responses',
    );
    const h = await prioritizedRequest(base);
    const message = { ...assistantMessage(base), ...mismatch };
    const original = structuredClone(message);
    expect(h.end(message)).toBeUndefined();
    expect(message).toEqual(original);
    expect(h.end(assistantMessage(base))).toBeUndefined();
  });

  it('ignores non-assistant messages without consuming pending pricing', async () => {
    const base = pricedModel(
      'openai-codex',
      'gpt-5-codex',
      'openai-codex-responses',
    );
    const h = await prioritizedRequest(base);
    const user = { role: 'user' as const, content: 'Hello', timestamp: 0 };
    const tool = {
      role: 'toolResult' as const,
      toolCallId: 'call',
      toolName: 'test',
      content: [{ type: 'text' as const, text: 'Result' }],
      isError: false,
      timestamp: 0,
    };
    expect(h.end(user)).toBeUndefined();
    expect(h.end(tool)).toBeUndefined();
    expect(user).toEqual({ role: 'user', content: 'Hello', timestamp: 0 });
    expect(tool.content).toEqual([{ type: 'text', text: 'Result' }]);
    expect(h.end(assistantMessage(base))?.message).toMatchObject({
      role: 'assistant',
      usage: { cost: { total: 20 } },
    });
  });

  it.each([
    false,
    true,
  ])('keeps direct/compaction requests unpriced (prior fast request: %s)', async (priorFast) => {
    const base = pricedModel(
      'openai-codex',
      'gpt-5-codex',
      'openai-codex-responses',
    );
    const h = setup([base]);
    await h.start();
    if (priorFast) {
      await h.route('openai-codex/gpt-5-codex-fast', 'user');
      h.request({ model: base.id });
    }
    await h.route('openai-codex/gpt-5-codex-fast', 'direct');
    expect(h.request({ model: base.id })).toBeUndefined();
    expect(h.end(assistantMessage(base))).toBeUndefined();
  });

  it('disarms the previous pricing marker on a new fast route until its payload is prioritized', async () => {
    const base = pricedModel(
      'openai-codex',
      'gpt-5-codex',
      'openai-codex-responses',
    );
    const next = pricedModel(
      'openai-codex-2',
      'gpt-5.5',
      'openai-codex-responses',
    );
    const h = setup([base, next]);
    await h.start();
    await h.route('openai-codex/gpt-5-codex-fast', 'user');
    h.request({ model: base.id });
    await h.route('openai-codex-2/gpt-5.5-fast', 'retry');
    expect(h.end(assistantMessage(base))).toBeUndefined();
    h.request({ model: next.id });
    expect(h.end(assistantMessage(next))?.message).toMatchObject({
      provider: 'openai-codex-2',
      model: 'gpt-5.5',
      usage: { cost: { total: 25 } },
    });
  });

  it('disarms pricing even when the new route fails', async () => {
    const base = pricedModel(
      'openai-codex',
      'gpt-5-codex',
      'openai-codex-responses',
    );
    const next = pricedModel(
      'openai-codex-2',
      'gpt-5.5',
      'openai-codex-responses',
    );
    const h = setup([base, next]);
    await h.start();
    await h.route('openai-codex/gpt-5-codex-fast', 'user');
    h.request({ model: base.id });
    h.setModels([base]);
    await expect(
      h.route('openai-codex-2/gpt-5.5-fast', 'user'),
    ).rejects.toThrow();
    expect(h.end(assistantMessage(base))).toBeUndefined();
  });

  it.each([
    'error',
    'aborted',
  ] as const)('consumes pricing for zero-cost %s assistant messages', async (stopReason) => {
    const base = pricedModel(
      'openai-codex',
      'gpt-5-codex',
      'openai-codex-responses',
    );
    const h = await prioritizedRequest(base);
    const message = assistantMessage(base);
    message.stopReason = stopReason;
    message.usage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    const original = structuredClone(message);
    expect(h.end(message)?.message).toEqual(original);
    expect(message).toEqual(original);
    expect(h.end(assistantMessage(base))).toBeUndefined();
  });

  it('compares against registry token-tier pricing rather than assuming base rates', async () => {
    const base = pricedModel(
      'openai-codex',
      'gpt-5-codex',
      'openai-codex-responses',
    );
    base.cost.tiers = [
      {
        inputTokensAbove: 1_000_000,
        input: 2,
        output: 4,
        cacheRead: 6,
        cacheWrite: 8,
      },
    ];
    const h = await prioritizedRequest(base);
    const message = assistantMessage(base);
    message.usage.cost = {
      input: 2,
      output: 4,
      cacheRead: 6,
      cacheWrite: 8,
      total: 20,
    };
    const replacement = h.end(message)?.message as AssistantMessage;
    expect(replacement.usage.cost).toEqual({
      input: 4,
      output: 8,
      cacheRead: 12,
      cacheWrite: 16,
      total: 40,
    });
    expect(message.usage.cost.total).toBe(20);
  });

  it.each([
    [10 + 5e-13, true],
    [10 - 5e-13, true],
    [10 + 1e-6, false],
  ])('only tolerates tiny standard-cost rounding differences (%s)', async (total, matchesStandard) => {
    const base = pricedModel(
      'openai-codex',
      'gpt-5-codex',
      'openai-codex-responses',
    );
    const h = await prioritizedRequest(base);
    const message = assistantMessage(base);
    message.usage.cost.total = total;
    const replacement = h.end(message)?.message as AssistantMessage | undefined;
    if (matchesStandard) {
      expect(replacement?.usage.cost.input).toBe(2);
      expect(replacement?.usage.cost.total).toBeCloseTo(20, 10);
    } else {
      expect(replacement).toBeUndefined();
    }
    expect(message.usage.cost.total).toBe(total);
  });

  it('clears pricing safely when the registry base is no longer available', async () => {
    const base = pricedModel(
      'openai-codex',
      'gpt-5-codex',
      'openai-codex-responses',
    );
    const h = await prioritizedRequest(base);
    h.setModels([]);
    expect(h.end(assistantMessage(base))).toBeUndefined();
    h.setModels([base]);
    expect(h.end(assistantMessage(base))).toBeUndefined();
  });

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
