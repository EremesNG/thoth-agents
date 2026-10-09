import { expect, it } from 'vitest';
import {
  combineSessionAndSubagentCost,
  computeSessionCost,
} from '../src/index.js';

it('aggregates every supported usage entry but classifies by the current provider, not entry providers', () => {
  const entries = [
    {
      type: 'message',
      message: { role: 'user', usage: { cost: { total: 99 } } },
    },
    {
      type: 'message',
      message: {
        role: 'assistant',
        provider: 'claude-bridge',
        usage: { cost: { total: 0.3 } },
      },
    },
    {
      type: 'message',
      message: { role: 'toolResult', usage: { cost: { total: 0.02 } } },
    },
    { type: 'compaction', usage: { cost: { total: 0.1 } } },
    { type: 'branch_summary', usage: { cost: { total: 0.1 } } },
    {
      type: 'usage',
      provider: 'claude-bridge',
      usage: { cost: { total: 0.05 } },
    },
    { type: 'custom', usage: { cost: { total: 99 } } },
    { type: 'message', message: { role: 'assistant' } },
  ];
  let provider = 'anthropic';
  const options = {
    subscriptionProviders: ['claude-bridge'],
    providerOf: () => provider,
  };
  expect(computeSessionCost(entries, options).cost).toBeCloseTo(0.57);
  expect(computeSessionCost(entries, options).isSubscription).toBe(false);
  provider = 'claude-bridge';
  expect(computeSessionCost(entries, options).isSubscription).toBe(true);
  expect(
    computeSessionCost(entries, { ...options, subscriptionProviders: [] })
      .isSubscription,
  ).toBe(false);
});
it('combines the latest cumulative subagent cost without accumulating previous snapshots', () => {
  expect(combineSessionAndSubagentCost(0.3, 0.7)).toBe(1);
  expect(combineSessionAndSubagentCost(0.3, 0.2)).toBe(0.5);
  expect(combineSessionAndSubagentCost(0.3)).toBe(0.3);
});
it('returns zero and no subscription classification for missing entries/provider', () => {
  expect(computeSessionCost([])).toEqual({ cost: 0, isSubscription: false });
  expect(computeSessionCost(null)).toEqual({ cost: 0, isSubscription: false });
  expect(computeSessionCost(undefined)).toEqual({
    cost: 0,
    isSubscription: false,
  });
});
