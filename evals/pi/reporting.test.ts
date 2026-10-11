import { expect, it, vi } from 'vitest';
import type { EvaluationResult } from './harness';
import { reportEvaluationStatus, reportVerboseEvaluation } from './reporting';
import { envelope } from './test-envelope';

it('prints Oracle judgment and task-attributed designer read paths without relying on excerpts', () => {
  const log = vi.fn();
  reportVerboseEvaluation(
    {
      expectedOracleReviewKind: 'final-verification',
      status: 'PASS',
      reasons: [],
      warnings: [],
      turns: 1,
      parentCost: 0,
      childCost: 0,
      elapsedMs: 0,
      specialistModels: {},
      modelsUsed: [],
      loadedSkills: [],
      tools: [],
      questions: [],
      subagents: [],
      writtenPaths: [],
      changes: [],
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
        {
          at: 10,
          task: {
            id: 'designer',
            agent: 'thoth-designer',
            status: 'completed',
            result: 'conclusion: Improved the card.',
          },
        },
      ],
      childTools: [
        {
          taskId: 'designer',
          id: 'read',
          name: 'read',
          args: { path: '.pi/skills/fixture-ui-guidelines/SKILL.md' },
          completed: true,
          isError: false,
        },
      ],
    } as EvaluationResult,
    { THOTH_EVAL_VERBOSE: '1' },
    log,
  );
  const output = log.mock.calls.map(([line]) => line).join('\n');
  expect(output).toContain(
    'task=oracle review.kind=final-verification verdict=FAIL',
  );
  expect(output.match(/envelope-valid=/g)).toHaveLength(1);
  expect(output).toContain(
    'task=designer child-read-path=.pi/skills/fixture-ui-guidelines/SKILL.md completed=true isError=false',
  );
});

it('prints bounded ordered trace details only when verbose is explicitly enabled', () => {
  const result = {
    loadedSkills: [
      { name: 'thoth-sdd', filePath: '/repo/skills/thoth-sdd/SKILL.md' },
      { name: 'tdd', filePath: '/temp/agent/skills/tdd/SKILL.md' },
    ],
    tools: [
      { name: 'write', args: { content: 'x'.repeat(3000) }, start: 4 },
      { name: 'read', args: { path: 'README.md' }, start: 1 },
    ],
    questions: [
      {
        at: 2,
        payload: {
          questions: [
            {
              header: 'Review',
              options: [{ label: 'Oracle', value: 'oracle' }],
            },
          ],
        },
        answer: { selection: 'Oracle' },
      },
    ],
    subagents: [
      {
        args: {
          agent: 'thoth-oracle',
          mode: 'task',
          task: 'Read /repo/skills/thoth-sdd/SKILL.md',
        },
      },
      {
        args: {
          agent: 'thoth-worker',
          mode: 'task',
          task: 'No exact skill paths',
        },
      },
    ],
    tasks: [
      {
        at: 3,
        task: {
          agent: 'thoth-oracle',
          status: 'completed',
          result: `[PASS] ${'x'.repeat(2000)}`,
        },
      },
    ],
    expectedOracleReviewKind: 'final-verification',
    writtenPaths: ['README.md', 'gone.txt'],
    changes: [
      {
        path: 'README.md',
        at: 5,
        kind: 'changed',
        content: `Welcome to the fixture.\n${'x'.repeat(3000)}`,
      },
      { path: 'gone.txt', at: 6, kind: 'deleted' },
    ],
    finalText: `Fixed typo. ${'x'.repeat(10000)}`,
  } as unknown as EvaluationResult;
  const log = vi.fn();
  reportVerboseEvaluation(result, {}, log);
  reportVerboseEvaluation(result, { THOTH_EVAL_VERBOSE: '0' }, log);
  expect(log).not.toHaveBeenCalled();
  reportVerboseEvaluation(result, { THOTH_EVAL_VERBOSE: '1' }, log);
  expect(log.mock.calls[0][0]).toContain(
    'Parent loaded skills: thoth-sdd, tdd',
  );
  const output = log.mock.calls.map(([line]) => line).join('\n');
  expect(output).toContain('envelope-valid=No');
  expect(output).toContain('issue-codes=ENVELOPE_FORMAT');
  expect(output).toContain('skill-path-referenced=Yes');
  expect(output).toContain('skill-path-referenced=No');
  expect(output.indexOf('read')).toBeLessThan(output.indexOf('write'));
  for (const text of [
    'README.md',
    'Review',
    'Oracle',
    'selection',
    'thoth-oracle',
    'task',
    'completed',
    '[PASS]',
    'Welcome to the fixture.',
    'gone.txt',
    'deleted',
    'Fixed typo.',
    '[truncated]',
  ])
    expect(output).toContain(text);
  expect(output.length).toBeLessThan(10000);
});

it('passes PASS, fails FAIL, and skips INCONCLUSIVE with its reason', () => {
  const skip = vi.fn();
  expect(() =>
    reportEvaluationStatus({ status: 'PASS', reasons: [] }, skip),
  ).not.toThrow();
  expect(skip).not.toHaveBeenCalled();
  expect(() =>
    reportEvaluationStatus({ status: 'FAIL', reasons: ['bad behavior'] }, skip),
  ).toThrow('bad behavior');
  reportEvaluationStatus(
    { status: 'INCONCLUSIVE', reasons: ['case cost cap'] },
    skip,
  );
  expect(skip).toHaveBeenCalledExactlyOnceWith('case cost cap');
});
