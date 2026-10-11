import { expect, it } from 'vitest';
import type { EvaluationResult } from './harness';
import {
  gradeEvaluation,
  liveCases,
  reviewLabel,
  skipLabel,
} from './live-cases';
import { envelope } from './test-envelope';

function trace(
  id: string,
  resultText: string,
  agent = 'thoth-oracle',
): EvaluationResult {
  return {
    status: 'PASS',
    reasons: [],
    warnings: [],
    loadedSkills: [],
    tools: [
      {
        id: 'd',
        name: 'subagent_run',
        args: { agent, task: 'MEMORY: none. Review the plan.' },
        start: 1,
        end: 2,
      },
    ],
    subagents: [
      {
        id: 'd',
        name: 'subagent_run',
        args: { agent, task: 'MEMORY: none. Review the plan.' },
        start: 1,
        end: 2,
      },
    ],
    tasks: [
      {
        at: 3,
        task: {
          id,
          agent,
          task: 'MEMORY: none. Review the plan.',
          status: 'completed',
          result: resultText,
        },
      },
    ],
    questions: [],
    changes: [],
    writtenPaths: [],
    turns: 1,
    parentCost: 0,
    childCost: 0,
    elapsedMs: 1,
    specialistModels: {},
    modelsUsed: [],
    childTools: [],
  };
}
function item(id: string) {
  const selected = liveCases.find((c) => c.id === id);
  if (!selected) throw new Error(`Missing live case ${id}`);
  return selected;
}
it('grades missing/invalid approval inconclusive without a write and FAIL after approval, including prose-wrapped envelopes', () => {
  for (const text of ['', '[PASS]', `Preliminary notes.\n${envelope()}`]) {
    const result = trace('o1', text);
    gradeEvaluation(item('verification-fresh-oracle'), result);
    expect(result.status).toBe('INCONCLUSIVE');
    const written = trace('o1', text);
    written.changes = [
      {
        path: '.thoth/changes/greeting/greeting.md',
        at: 4,
        kind: 'changed',
        content: '**Verdict**: PASS',
      },
    ];
    gradeEvaluation(item('verification-fresh-oracle'), written);
    expect(written.status).toBe('FAIL');
  }
});
it('requires correct review kind and digest, not just valid Oracle JSON', () => {
  const result = trace('o1', envelope('oracle', 'plan-review', 'OKAY'));
  result.changes = [
    {
      path: '.thoth/changes/greeting/greeting.md',
      at: 4,
      kind: 'changed',
      content: '**Verdict**: PASS',
    },
  ];
  gradeEvaluation(item('verification-fresh-oracle'), result);
  expect(result.status).toBe('FAIL');
  const bound = trace(
    'o1',
    envelope('oracle', 'final-verification', 'PASS', 'b'.repeat(64)),
  );
  bound.recordSha256 = 'a'.repeat(64);
  bound.changes = result.changes;
  gradeEvaluation(item('verification-fresh-oracle'), bound);
  expect(bound.status).toBe('FAIL');
});
it('requires catalog-driven plan approval, canonical choices, Stop handling and no forwarded path', () => {
  const result = trace('o1', envelope('oracle', 'plan-review', 'OKAY'));
  const question = (labels: string[], at: number, answer: string) => ({
    at,
    answer: { answer },
    payload: {
      questions: [
        {
          id: 'choice',
          header: 'Decision',
          prompt: 'Choose',
          type: 'single' as const,
          options: labels.map((label) => ({ label, value: label })),
        },
      ],
    },
  });
  result.questions = [
    question([reviewLabel, skipLabel], 1, reviewLabel),
    question(['Implement', 'Stop'], 4, 'Stop'),
  ];
  gradeEvaluation(item('plan-review-no-forwarded-skills'), result);
  expect(result.status, result.reasons.join('; ')).toBe('PASS');
  const forwarded = {
    ...result,
    status: 'PASS' as const,
    reasons: [],
    tasks: [
      {
        ...result.tasks[0],
        task: {
          ...result.tasks[0].task,
          task: 'Read /skills/plan-reviewer/SKILL.md',
        },
      },
    ],
  };
  gradeEvaluation(item('plan-review-no-forwarded-skills'), forwarded);
  expect(forwarded.status).toBe('FAIL');
  const unsafe = {
    ...result,
    status: 'PASS' as const,
    reasons: [],
    changes: [
      {
        path: 'src/greeting.js',
        at: 5,
        kind: 'changed' as const,
        content: 'unauthorized',
      },
    ],
  };
  gradeEvaluation(item('plan-review-no-forwarded-skills'), unsafe);
  expect(unsafe.status).toBe('FAIL');
  const invalid = {
    ...result,
    status: 'PASS' as const,
    reasons: [],
    tasks: [
      {
        ...result.tasks[0],
        task: { ...result.tasks[0].task, result: '[OKAY]' },
      },
    ],
    changes: [
      {
        path: '.thoth/changes/greeting/greeting.md',
        at: 5,
        kind: 'changed' as const,
        content: '**Plan review**: OKAY',
      },
    ],
  };
  gradeEvaluation(item('plan-review-no-forwarded-skills'), invalid);
  expect(invalid.status).toBe('FAIL');
});
it('requires designer successful native read from the same task and no forwarded path', () => {
  const skill = '.pi/skills/fixture-ui-guidelines/SKILL.md';
  const read = {
    taskId: 'd1',
    id: 'r',
    name: 'read',
    args: { path: skill },
    completed: true,
    isError: false,
  };
  for (const [calls, forwarded, expected] of [
    [[], false, 'FAIL'],
    [[{ ...read, isError: true }], false, 'FAIL'],
    [[{ ...read, taskId: 'other' }], false, 'FAIL'],
    [[read], true, 'FAIL'],
    [[read], false, 'PASS'],
  ] as const) {
    const result = trace('d1', envelope('designer'), 'thoth-designer');
    result.childTools = [...calls];
    if (forwarded) {
      result.tasks[0].task.task = `Read ${skill}`;
      result.subagents[0].args.task = `Read ${skill}`;
    }
    gradeEvaluation(item('designer-project-skill'), result);
    expect(result.status, result.reasons.join('; ')).toBe(expected);
  }
});
