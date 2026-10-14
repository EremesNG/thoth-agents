import { expect, it } from 'vitest';
import { contractCaseSchema } from '../contracts-schema';
import { evaluationCaps } from './harness';
import { liveCases } from './live-cases';

it('applies per-case caps between defaults and explicit environment caps', () => {
  expect(
    evaluationCaps({}, { timeMs: 1800000, turns: 50, caseUsd: 0.8 }),
  ).toEqual({
    timeMs: 1800000,
    turns: 50,
    caseUsd: 0.8,
    runUsd: 5,
    cleanupMs: 10000,
  });
  expect(
    evaluationCaps(
      {
        THOTH_EVAL_TIME_MS: '200',
        THOTH_EVAL_MAX_TURNS: '3',
        THOTH_EVAL_CASE_USD: '0.2',
      },
      { timeMs: 1800000, turns: 50, caseUsd: 0.8 },
    ),
  ).toMatchObject({ timeMs: 200, turns: 3, caseUsd: 0.2 });
  expect(() =>
    evaluationCaps({ THOTH_EVAL_TIME_MS: '' }, { timeMs: 1800000 }),
  ).toThrow();
});

it('validates live cap overrides and gives substantial cases thirty minutes at one dollar', () => {
  const item = liveCases[0];
  expect(
    contractCaseSchema.safeParse({
      ...item,
      live: { ...item.live, caps: { timeMs: 1800000, turns: 40, caseUsd: 1 } },
    }).success,
  ).toBe(true);
  for (const caps of [
    { timeMs: 0 },
    { turns: 1.5 },
    { caseUsd: -1 },
    { runUsd: 2 },
    { timeMs: Infinity },
  ])
    expect(
      contractCaseSchema.safeParse({ ...item, live: { ...item.live, caps } })
        .success,
    ).toBe(false);
  for (const id of ['plan-review-choice', 'verification-fresh-oracle'])
    expect(liveCases.find((entry) => entry.id === id)?.live.caps).toEqual({
      timeMs: 1800000,
      caseUsd: 1,
    });
});
