import type { Api, Model } from '@earendil-works/pi-ai';
import { describe, expect, it } from 'vitest';
import { planVariantSync, variantKey } from './variants.ts';

function model(
  provider: string,
  id: string,
  api: string,
  extra: Partial<Model<Api>> = {},
): Model<Api> {
  return {
    id,
    name: `Name ${id}`,
    api,
    provider,
    baseUrl: 'https://example.test',
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200_000,
    maxTokens: 64_000,
    ...extra,
  } as Model<Api>;
}

describe('planVariantSync', () => {
  it('creates a -fast variant for each openai-responses and openai-codex-responses model across providers', () => {
    const plan = planVariantSync(
      [
        model('openai', 'gpt-5', 'openai-responses'),
        model('openai-codex', 'gpt-5-codex', 'openai-codex-responses'),
        model('openai-codex-2', 'gpt-5-codex', 'openai-codex-responses'),
      ],
      new Set(),
    );
    expect(plan.register.map((v) => `${v.provider}/${v.id}`)).toEqual([
      'openai/gpt-5-fast',
      'openai-codex/gpt-5-codex-fast',
      'openai-codex-2/gpt-5-codex-fast',
    ]);
    expect(plan.unregister).toEqual([]);
  });

  it('mirrors name, limits, input types and thinking levels of the base model', () => {
    const [variant] = planVariantSync(
      [
        model('openai', 'gpt-5', 'openai-responses', {
          contextWindow: 400_000,
          maxTokens: 128_000,
          input: ['text'],
        }),
      ],
      new Set(),
    ).register;
    expect(variant).toMatchObject({
      baseId: 'gpt-5',
      name: 'Name gpt-5 (fast)',
      contextWindow: 400_000,
      maxTokens: 128_000,
      input: ['text'],
    });
    expect(variant?.thinkingLevels).toContain('off');
    expect(variant?.thinkingLevels.length).toBeGreaterThan(1);
  });

  it('offers only off for non-reasoning models', () => {
    const [variant] = planVariantSync(
      [model('openai', 'gpt-4o', 'openai-responses', { reasoning: false })],
      new Set(),
    ).register;
    expect(variant?.thinkingLevels).toEqual(['off']);
  });

  it('skips other apis, virtual models, and ids already ending in -fast', () => {
    const plan = planVariantSync(
      [
        model('anthropic', 'claude', 'anthropic-messages'),
        model('openai', 'gpt-5-fast', 'openai-responses'),
        model('openai', 'virt', 'pi-virtual'),
      ],
      new Set(),
    );
    expect(plan.register).toEqual([]);
  });

  it('skips a base whose -fast id collides with a physical model of the same provider', () => {
    const plan = planVariantSync(
      [
        model('openai', 'gpt-5', 'openai-responses'),
        model('openai', 'gpt-5-fast', 'openai-responses'),
      ],
      new Set(),
    );
    expect(plan.register).toEqual([]);
  });

  it('unregisters tracked variants whose base disappeared and keeps live ones', () => {
    const tracked = new Set([
      variantKey('openai', 'gone-fast'),
      variantKey('openai', 'gpt-5-fast'),
    ]);
    const plan = planVariantSync(
      [model('openai', 'gpt-5', 'openai-responses')],
      tracked,
    );
    expect(plan.unregister).toEqual([{ provider: 'openai', id: 'gone-fast' }]);
    expect(plan.register.map((v) => v.id)).toEqual(['gpt-5-fast']);
  });
});
