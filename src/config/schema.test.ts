import { describe, expect, test } from 'vitest';
import { AgentNameSchema, ManualPlanSchema } from './schema';

const plan = {
  primary: 'openai/primary',
  fallback1: 'openai/fallback-1',
  fallback2: 'openai/fallback-2',
  fallback3: 'openai/fallback-3',
};

describe('v0.3 agent configuration schema', () => {
  test('accepts only the seven active built-in roles', () => {
    for (const name of [
      'orchestrator',
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'quick',
      'deep',
    ]) {
      expect(AgentNameSchema.safeParse(name).success, name).toBe(true);
    }

    for (const removed of ['sdd-specify', 'sdd-plan', 'sdd-tasks']) {
      expect(AgentNameSchema.safeParse(removed).success, removed).toBe(false);
    }
  });

  test('models manual plans for the seven active roles', () => {
    expect(
      ManualPlanSchema.safeParse({
        orchestrator: plan,
        explorer: plan,
        librarian: plan,
        oracle: plan,
        designer: plan,
        quick: plan,
        deep: plan,
      }).success,
    ).toBe(true);
  });
});
