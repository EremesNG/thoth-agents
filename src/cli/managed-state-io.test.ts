import { describe, expect, test } from 'vitest';
import { parseManagedModelStateJson, stableJson } from './managed-state-io';

describe('managed model state effort compatibility', () => {
  test('loads legacy v1 model-only state unchanged', () => {
    expect(
      parseManagedModelStateJson(
        JSON.stringify({
          version: 1,
          models: { worker: 'gpt-5' },
          configuredModels: { worker: 'gpt-5.6-sol' },
        }),
        1,
      ),
    ).toEqual({
      version: 1,
      models: { worker: 'gpt-5' },
      configuredModels: { worker: 'gpt-5.6-sol' },
    });
  });

  test('round-trips only explicit configured effort entries', () => {
    const parsed = parseManagedModelStateJson(
      JSON.stringify({
        version: 1,
        models: {},
        configuredEfforts: {
          worker: 'ultra',
          quick: 'inherit',
          explorer: 42,
        },
      }),
      1,
    );
    expect(parsed).toEqual({
      version: 1,
      models: {},
      configuredEfforts: { worker: 'ultra' },
    });
    expect(JSON.parse(stableJson(parsed))).toEqual(parsed);
  });
});
