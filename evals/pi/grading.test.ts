import { expect, it } from 'vitest';
import {
  hasSubagentTask,
  hasToolCall,
  ordered,
  requireProgress,
  writesPath,
} from './grading';
import type { EvaluationResult } from './harness';

const result = {
  tools: [
    {
      id: '1',
      name: 'subagent_run',
      args: { agent: 'thoth-oracle', task: 'MEMORY: none. Review.' },
      start: 1,
      end: 2,
      result: {},
      isError: false,
    },
  ],
  tasks: [{ at: 2, task: { agent: 'thoth-oracle', status: 'completed' } }],
  writtenPaths: ['verdict.md'],
  changes: [{ path: 'verdict.md', at: 3, kind: 'added' }],
  questions: [],
} as unknown as EvaluationResult;
it('grades tool predicates, task matching, path writes and completed-before-write ordering', () => {
  expect(
    hasToolCall(
      result,
      'subagent_run',
      (call) => call.args.agent === 'thoth-oracle',
    ),
  ).toBe(true);
  expect(hasSubagentTask(result, 'thoth-oracle', /MEMORY: none/)).toBe(true);
  expect(hasSubagentTask(result, 'thoth-worker')).toBe(false);
  expect(writesPath(result, /^verdict/)).toBe(true);
  expect(ordered(2, 3)).toBe(true);
  expect(ordered(undefined, 3)).toBe(false);
  expect(ordered(3, 2)).toBe(false);
  expect(requireProgress(result)).toEqual([]);
  expect(
    requireProgress({ ...result, tools: [], changes: [], questions: [] }),
  ).toEqual(['No positive progress recorded']);
});

it('does not bless a write observed before or alongside oracle completion', async () => {
  const { completedTaskBeforeWrite } = await import('./grading');
  expect(completedTaskBeforeWrite(result, 'thoth-oracle', 'verdict.md')).toBe(
    true,
  );
  expect(
    completedTaskBeforeWrite(
      {
        ...result,
        tasks: [
          { at: 4, task: { agent: 'thoth-oracle', status: 'completed' } },
        ],
      },
      'thoth-oracle',
      'verdict.md',
    ),
  ).toBe(false);
});
