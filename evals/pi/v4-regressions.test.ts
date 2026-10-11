import fs from 'node:fs';
import { expect, it } from 'vitest';
import type { EvaluationResult } from './harness';
import {
  gradeCase,
  gradeEvaluation,
  liveCases,
  recordPath,
} from './live-cases';
import { envelope } from './test-envelope';

const base: EvaluationResult = {
  status: 'PASS',
  reasons: [],
  warnings: [],
  loadedSkills: [],
  tools: [],
  subagents: [],
  questions: [],
  writtenPaths: [],
  changes: [],
  turns: 1,
  parentCost: 0,
  childCost: 0,
  elapsedMs: 0,
  specialistModels: {},
  modelsUsed: [],
  tasks: [],
};
function item(id: string) {
  const found = liveCases.find((c) => c.id === id);
  if (!found) throw new Error(`Missing case: ${id}`);
  return found;
}

it('v4 FAIL record preserves seeded PASS instructions without a root PASS write', () => {
  const before = fs.readFileSync(
    new URL(
      './fixtures/closeout/.thoth/changes/greeting/greeting.md',
      import.meta.url,
    ),
    'utf8',
  );
  const result = gradeEvaluation(item('verification-fresh-oracle'), {
    ...base,
    reasons: [],
    subagents: [
      {
        id: 'dispatch',
        start: 9,
        name: 'subagent_run',
        args: { agent: 'thoth-oracle' },
      },
    ],
    tasks: [
      {
        at: 17,
        task: {
          id: 'oracle',
          agent: 'thoth-oracle',
          status: 'completed',
          result: envelope('final-verification', 'FAIL'),
        },
      },
    ],
    changes: [
      {
        path: recordPath,
        at: 20,
        kind: 'changed',
        content: before.replace('**Verdict**: PENDING', '**Verdict**: FAIL'),
        previousContent: before,
      },
    ],
  });
  expect(result.status).toBe('INCONCLUSIVE');
  expect(result.reasons).toEqual([
    'No valid expected Oracle approval envelope',
  ]);
});

it('v4 background Oracle assignment is correlated through native details.tasks by exact ID', () => {
  const id = 'subtask_thoth-oracle_1791701889718_7adc7964';
  const result: EvaluationResult = {
    ...base,
    subagents: [
      {
        id: 'dispatch',
        start: 43,
        end: 44,
        name: 'subagent_run',
        args: {
          agent: 'thoth-oracle',
          task: 'MEMORY: none. Independent plan review.',
          mode: 'background',
        },
        result: { details: { tasks: [{ id }] } },
      },
    ],
    tasks: [
      {
        at: 51,
        task: {
          id,
          agent: 'thoth-oracle',
          status: 'completed',
          result: envelope('plan-review', 'OKAY'),
        },
      },
    ],
  };
  result.tools = [...result.subagents];
  const trial = {
    ...item('plan-review-no-forwarded-skills'),
    live: {
      ...item('plan-review-no-forwarded-skills').live,
      expectations: ['oracle-no-forwarded-skills' as const],
    },
  };
  expect(gradeCase(trial, result)).toEqual([]);
  expect(
    gradeCase(trial, {
      ...result,
      tasks: [
        {
          ...result.tasks[0],
          task: { ...result.tasks[0].task, id: 'unrelated' },
        },
      ],
    }),
  ).not.toEqual([]);
});
