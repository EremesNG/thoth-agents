import { describe, expect, test } from 'vitest';
import { mergeModelCatalog } from './index';
import { normalizeModelsDevCatalog } from './models-dev';
import type { ModelOption } from './types';

describe('models.dev catalog normalization', () => {
  test('extracts exact effort values while ignoring non-effort controls', () => {
    const result = normalizeModelsDevCatalog({
      openai: {
        name: 'OpenAI',
        future_provider_field: true,
        models: {
          'gpt-5.6-sol': {
            id: 'openai/gpt-5.6-sol',
            name: 'GPT 5.6 Sol',
            reasoning: true,
            reasoning_options: [
              {
                type: 'effort',
                values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
              },
              { type: 'toggle' },
              { type: 'budget_tokens', min: 1_024, max: 32_768 },
              { type: 'future-control', enabled: true },
            ],
            future_model_field: { supported: true },
          },
          'gpt-5-no-effort': {
            name: 'GPT 5 No Effort',
            reasoning: false,
          },
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.catalog.models).toEqual([
      {
        id: 'gpt-5.6-sol',
        catalogId: 'openai/gpt-5.6-sol',
        label: 'GPT 5.6 Sol',
        provider: 'openai',
        efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
        source: 'remote',
      },
      {
        id: 'gpt-5-no-effort',
        catalogId: 'openai/gpt-5-no-effort',
        label: 'GPT 5 No Effort',
        provider: 'openai',
        efforts: [],
        source: 'remote',
      },
    ]);
  });

  test('validates the effort assumptions used by the static OpenAI preset', () => {
    const result = normalizeModelsDevCatalog({
      openai: {
        models: {
          'gpt-5.6-sol': {
            id: 'openai/gpt-5.6-sol',
            reasoning_options: [
              { type: 'effort', values: ['low', 'high', 'xhigh', 'max'] },
            ],
          },
          'gpt-5.6-luna': {
            id: 'openai/gpt-5.6-luna',
            reasoning_options: [
              { type: 'effort', values: ['low', 'medium', 'high'] },
            ],
          },
          'gpt-5.6-terra': {
            id: 'openai/gpt-5.6-terra',
            reasoning_options: [
              { type: 'effort', values: ['high', 'xhigh', 'max'] },
            ],
          },
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const efforts = Object.fromEntries(
      result.catalog.models.map((model) => [model.catalogId, model.efforts]),
    );
    expect(efforts['openai/gpt-5.6-sol']).toContain('high');
    expect(efforts['openai/gpt-5.6-luna']).toEqual(['low', 'medium', 'high']);
    expect(efforts['openai/gpt-5.6-terra']).toEqual(['high', 'xhigh', 'max']);
  });

  test('rejects malformed known model shapes without returning a partial catalog', () => {
    const result = normalizeModelsDevCatalog({
      openai: {
        models: {
          valid: { id: 'openai/valid', reasoning_options: [] },
          invalid: { reasoning_options: 'high' },
        },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThan(0);
  });

  test('preserves manual-only models and their declared efforts', () => {
    const remote = normalizeModelsDevCatalog({
      openai: {
        models: {
          'gpt-5': {
            id: 'openai/gpt-5',
            reasoning_options: [{ type: 'effort', values: ['low', 'high'] }],
          },
        },
      },
    });
    expect(remote.ok).toBe(true);
    if (!remote.ok) return;
    const manual: ModelOption[] = [
      {
        id: 'manual-model',
        catalogId: 'custom/manual-model',
        label: 'Manual Model',
        provider: 'custom',
        efforts: ['careful'],
        source: 'manual',
      },
    ];

    expect(mergeModelCatalog(remote.catalog.models, manual)).toEqual([
      ...remote.catalog.models,
      ...manual,
    ]);
  });

  test('prefers the canonical provider owner regardless of collision order', () => {
    const owner: ModelOption = {
      id: 'gpt-5.6-luna',
      catalogId: 'openai/gpt-5.6-luna',
      label: 'GPT 5.6 Luna',
      provider: 'openai',
      efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
      source: 'remote',
    };
    const secondary: ModelOption = {
      id: 'openai/gpt-5.6-luna',
      catalogId: 'openai/gpt-5.6-luna',
      label: 'OpenRouter GPT 5.6 Luna',
      provider: 'openrouter',
      efforts: ['high'],
      source: 'remote',
    };
    const manualFallback: ModelOption = {
      id: 'gpt-5.6-luna-manual',
      catalogId: 'openai/gpt-5.6-luna',
      label: 'Manual GPT 5.6 Luna',
      provider: 'openai',
      efforts: ['low'],
      source: 'manual',
    };

    expect(mergeModelCatalog([owner, secondary], [manualFallback])).toEqual([
      owner,
    ]);
    expect(mergeModelCatalog([secondary, owner], [manualFallback])).toEqual([
      owner,
    ]);
  });
});
