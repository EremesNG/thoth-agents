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
  const result = trace('o1', envelope('plan-review', 'OKAY'));
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
    envelope('final-verification', 'PASS', 'b'.repeat(64)),
  );
  bound.recordSha256 = 'a'.repeat(64);
  bound.changes = result.changes;
  gradeEvaluation(item('verification-fresh-oracle'), bound);
  expect(bound.status).toBe('FAIL');
});
it('requires plan approval, canonical choices, Stop handling and both forwarded skills', () => {
  const result = trace('o1', envelope('plan-review', 'OKAY'));
  result.loadedSkills = [
    { name: 'plan-reviewer', filePath: '/skills/plan-reviewer/SKILL.md' },
    { name: 'thoth-sdd', filePath: '/skills/thoth-sdd/SKILL.md' },
  ];
  result.tasks[0].task.task =
    'SKILLS:\n- plan-reviewer — `/skills/plan-reviewer/SKILL.md`\n- thoth-sdd — `/skills/thoth-sdd/SKILL.md`\nMEMORY: none';
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
  gradeEvaluation(item('plan-review-forwarded-skills'), result);
  expect(result.status, result.reasons.join('; ')).toBe('PASS');
  for (const task of [
    'Read /skills/plan-reviewer/SKILL.md and /skills/thoth-sdd/SKILL.md',
    'SKILLS: plan-reviewer — skills/plan-reviewer/SKILL.md; thoth-sdd — /skills/thoth-sdd/SKILL.md',
    'SKILLS: plan-reviewer — /skills/plan-reviewer/SKILL.md',
    'SKILLS: plan-reviewer — /skills/plan-reviewer/SKILL.md; another-skill — /skills/thoth-sdd/SKILL.md',
    'SKILLS: none\nMemory: none\n- plan-reviewer — /skills/plan-reviewer/SKILL.md\n- thoth-sdd — /skills/thoth-sdd/SKILL.md',
  ]) {
    const missing = {
      ...result,
      status: 'PASS' as const,
      reasons: [],
      tasks: [
        {
          ...result.tasks[0],
          task: { ...result.tasks[0].task, task },
        },
      ],
    };
    gradeEvaluation(item('plan-review-forwarded-skills'), missing);
    expect(missing.status, task).toBe('FAIL');
  }
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
  gradeEvaluation(item('plan-review-forwarded-skills'), unsafe);
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
  gradeEvaluation(item('plan-review-forwarded-skills'), invalid);
  expect(invalid.status).toBe('FAIL');
});
it('requires a forwarded project skill and a successful native read by the same designer', () => {
  const workspace = 'C:\\project with spaces';
  const skill = `${workspace}\\.pi\\skills\\fixture-ui-guidelines\\SKILL.md`;
  const assignment = `SKILLS: fixture-ui-guidelines — "${skill}"\nMEMORY: none.`;
  const read = {
    taskId: 'd1',
    id: 'r',
    name: 'read',
    args: { path: skill },
    completed: true,
    isError: false,
  };
  for (const [calls, task, expected] of [
    [[], assignment, 'FAIL'],
    [[{ ...read, isError: true }], assignment, 'FAIL'],
    [[{ ...read, taskId: 'other' }], assignment, 'FAIL'],
    [[read], 'SKILLS: none\nMEMORY: none.', 'FAIL'],
    [[read], assignment, 'PASS'],
  ] as const) {
    const result = trace(
      'd1',
      `conclusion: Improved the card.
evidence: Project guidelines read.
verification: Checked.
risks: none
openQuestions: none
nextAction: none`,
      'thoth-designer',
    );
    result.workspace = workspace;
    result.childTools = [...calls];
    result.tasks[0].task.task = task;
    result.subagents[0].args.task = task;
    gradeEvaluation(item('designer-project-skill'), result);
    expect(result.status, result.reasons.join('; ')).toBe(expected);
  }
});

it('does not accept designer read evidence before task completion', () => {
  const result = trace('d1', 'conclusion: Work in progress.', 'thoth-designer');
  result.workspace = '/workspace';
  const skill = '/workspace/.pi/skills/fixture-ui-guidelines/SKILL.md';
  result.tasks[0].task.task = `SKILLS: fixture-ui-guidelines — ${skill}\nMEMORY: none.`;
  result.subagents[0].args.task = result.tasks[0].task.task;
  result.tasks[0].task.status = 'running';
  result.childTools = [
    {
      taskId: 'd1',
      id: 'r',
      name: 'read',
      args: { path: skill },
      completed: true,
      isError: false,
    },
  ];
  gradeEvaluation(item('designer-project-skill'), result);
  expect(result.status).toBe('FAIL');
});

it('grades ordinary discovery on MEMORY scope without an envelope', () => {
  for (const [assignment, expected] of [
    ['MEMORY: none. Discover the greeting.', 'PASS'],
    ['Discover the greeting.', 'FAIL'],
  ]) {
    const result = trace(
      'e1',
      'conclusion: Found the greeting.',
      'thoth-explorer',
    );
    result.subagents[0].args.task = assignment;
    gradeEvaluation(item('memory-recall-bounded-reads'), result);
    expect(result.status, result.reasons.join('; ')).toBe(expected);
  }
});
