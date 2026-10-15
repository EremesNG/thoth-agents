import { expect, it } from 'vitest';
import { resolveToolStallBudget } from '../../src/runner/tool-stall-budget.js';

it.each([
  ['bash', { timeout: 1000 }, 1030000],
  ['powershell', { timeout: 1000 }, 1030000],
  ['custom', { timeout_seconds: 1000 }, 1030000],
  ['custom', { timeout: 1000 }, 900000],
  ['bash', { timeout: 1 }, 900000],
  ['bash', { timeout: 1e300 }, 3600000],
  ['bash', { timeout_seconds: 1200, timeout: 1000 }, 1230000],
  ['bash', undefined, 900000],
  ['bash', null, 900000],
])('resolves explicit seconds contracts for %s %j', (name, args, expected) => {
  expect(resolveToolStallBudget(name, args, 900000, 3600000)).toBe(expected);
});

it.each([
  0,
  -1,
  '1000',
  'bad',
  null,
  true,
  Infinity,
  NaN,
])('ignores invalid declared seconds %j', (value) => {
  for (const args of [{ timeout: value }, { timeout_seconds: value }]) {
    expect(resolveToolStallBudget('bash', args, 900000, 3600000)).toBe(900000);
  }
});

it('caps declared budgets but leaves an undeclared base budget unchanged', () => {
  expect(
    resolveToolStallBudget('bash', { timeout: 1000 }, 900000, 950000),
  ).toBe(950000);
  expect(resolveToolStallBudget('bash', {}, 900000, 1000)).toBe(900000);
});
