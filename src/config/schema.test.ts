import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import {
  AgentNameSchema,
  ManualPlanSchema,
  PluginConfigSchema,
} from './schema';

const plan = {
  primary: 'openai/primary',
  fallback1: 'openai/fallback-1',
  fallback2: 'openai/fallback-2',
  fallback3: 'openai/fallback-3',
};

describe('v0.3 agent configuration schema', () => {
  test('accepts only the six active built-in roles', () => {
    for (const name of [
      'orchestrator',
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'worker',
    ]) {
      expect(AgentNameSchema.safeParse(name).success, name).toBe(true);
    }

    for (const removed of [
      'quick',
      'deep',
      'sdd-specify',
      'sdd-plan',
      'sdd-tasks',
    ]) {
      expect(AgentNameSchema.safeParse(removed).success, removed).toBe(false);
    }
  });

  test.each([
    { presets: { example: { quick: { model: 'openai/model' } } } },
    { agents: { deep: { model: 'openai/model' } } },
    { fallback: { chains: { quick: ['openai/model'] } } },
  ])('runtime and published schemas reject removed role keys: %#', (config) => {
    expect(PluginConfigSchema.safeParse(config).success).toBe(false);
    const published = JSON.parse(
      readFileSync('thoth-agents.schema.json', 'utf8'),
    );
    expect(z.fromJSONSchema(published).safeParse(config).success).toBe(false);
  });

  test('runtime and published schemas preserve supported custom keys', () => {
    const config = {
      presets: { example: { custom: { model: 'openai/model' } } },
      agents: { custom: { model: 'openai/model' } },
      fallback: { chains: { custom: ['openai/model'] } },
    };
    expect(PluginConfigSchema.safeParse(config).success).toBe(true);
    const published = JSON.parse(
      readFileSync('thoth-agents.schema.json', 'utf8'),
    );
    expect(z.fromJSONSchema(published).safeParse(config).success).toBe(true);
  });

  test('models manual plans for the six active roles', () => {
    expect(
      ManualPlanSchema.safeParse({
        orchestrator: plan,
        explorer: plan,
        librarian: plan,
        oracle: plan,
        designer: plan,
        worker: plan,
      }).success,
    ).toBe(true);
  });
});
