import { expect, it } from 'vitest';
import type { Task } from '../tool/types.js';
import {
  selectCompactLayout,
  selectTaskGroups,
  selectTodoCounts,
  selectTodoStatusCounts,
} from './selectors.js';
import type { TaskState } from './state.js';

const task = (
  id: number,
  subject: string,
  extra: Partial<Task> = {},
): Task => ({ id, subject, status: 'pending', ...extra });
const state = (...tasks: Task[]): TaskState => ({
  tasks,
  nextId: Math.max(0, ...tasks.map((task) => task.id)) + 1,
});

it('keeps groups contiguous, orders by activity, and represents tasks rather than heading rows', () => {
  const input = state(
    task(8, 'mix: older done', { status: 'completed', completedAt: 100 }),
    task(6, 'mix: blocked', { blockedBy: [2] }),
    task(3, 'mix: queued'),
    task(7, 'mix: newer done', { status: 'completed', completedAt: 200 }),
    task(4, 'mix: running', { status: 'in_progress' }),
    task(2, 'First running', { status: 'in_progress' }),
    task(9, 'Waiting', { blockedBy: [2] }),
    task(5, 'Unblocked by terminal/missing dependencies', {
      blockedBy: [10, 11, 999],
    }),
    task(10, 'Earlier epoch', { status: 'completed', archivedAt: 300 }),
    task(11, 'Deleted', { status: 'deleted' }),
  );
  const before = structuredClone(input);
  const layout = selectCompactLayout(input);
  expect(
    layout.map((entry) =>
      entry.kind === 'group'
        ? entry.label
        : entry.kind === 'task'
          ? entry.task.id
          : entry.kind,
    ),
  ).toEqual([2, 'mix', 5, 9]);
  expect(layout[1]).toMatchObject({
    kind: 'group',
    key: 'mix',
    fullyCompleted: false,
    counts: { in_progress: 1, pending: 2, completed: 2 },
  });
  const group = layout[1];
  if (group.kind !== 'group') throw new Error('expected mixed group');
  expect(
    group.members.map((entry) => [
      entry.task.id,
      entry.displaySubject,
      entry.blocked,
    ]),
  ).toEqual([
    [4, 'running', false],
    [3, 'queued', false],
    [6, 'blocked', true],
  ]);
  expect(layout[2]).toMatchObject({
    counts: { in_progress: 0, pending: 1, completed: 0 },
    fullyCompleted: false,
    blocked: false,
  });
  expect(selectTodoStatusCounts(input)).toEqual({
    in_progress: 2,
    pending: 4,
    completed: 3,
  });
  expect(selectTodoCounts(input)).toEqual({
    total: 9,
    inProgress: 2,
    pending: 4,
    completed: 3,
  });
  expect(input).toEqual(before);
});

it('orders completed entries and members newest first, with legacy timestamps oldest and id breaking ties', () => {
  const layout = selectCompactLayout(
    state(
      task(1, 'Legacy done', { status: 'completed' }),
      task(2, 'done: old', { status: 'completed', completedAt: 100 }),
      task(3, 'done: recent', { status: 'completed', completedAt: 500 }),
      task(4, 'Ungrouped newest', { status: 'completed', completedAt: 600 }),
      task(5, 'Tie', { status: 'completed', completedAt: 500 }),
      task(6, 'Archived newest', {
        status: 'completed',
        completedAt: 900,
        archivedAt: 0,
      }),
    ),
  );
  expect(
    layout.map((entry) =>
      entry.kind === 'group'
        ? entry.label
        : entry.kind === 'task'
          ? entry.task.id
          : entry.kind,
    ),
  ).toEqual([4, 'done', 'completed-summary']);
  expect(layout[2]).toMatchObject({
    kind: 'completed-summary',
    counts: { in_progress: 0, pending: 0, completed: 2 },
  });
  expect(layout[1]).toMatchObject({
    kind: 'group',
    fullyCompleted: true,
    counts: { in_progress: 0, pending: 0, completed: 2 },
  });
  const group = layout[1];
  if (group.kind !== 'group') throw new Error('expected completed group');
  expect(group.members.map((entry) => entry.task.id)).toEqual([3, 2]);
  expect(layout[0]).toMatchObject({
    fullyCompleted: true,
    counts: { in_progress: 0, pending: 0, completed: 1 },
  });
});

it('resolves shared first-token prefixes and strips only the redundant token, preserving AC labels', () => {
  const groups = selectTaskGroups(
    state(
      task(1, 'pi-1.4 AC-1: write tests'),
      task(2, 'pi-1.4: implement'),
      task(3, 'narration: plan + tasks'),
      task(4, 'narration: verify', { status: 'completed', archivedAt: 5 }),
      task(5, 'solo: not a group'),
      task(6, 'solo: tombstone', { status: 'deleted' }),
      task(7, 'plain task'),
      task(8, 'ignored:no delimiter'),
      task(9, 'ignored:no delimiter either'),
    ),
  );
  expect([...groups]).toEqual([
    [
      1,
      { key: 'pi-1.4', label: 'pi-1.4', displaySubject: 'AC-1: write tests' },
    ],
    [2, { key: 'pi-1.4', label: 'pi-1.4', displaySubject: 'implement' }],
    [
      3,
      { key: 'narration', label: 'narration', displaySubject: 'plan + tasks' },
    ],
    [4, { key: 'narration', label: 'narration', displaySubject: 'verify' }],
  ]);
});

it('honors explicit groups even for single tasks and never strips an unrelated or partial prefix', () => {
  const groups = selectTaskGroups(
    state(
      task(1, 'narration: keep this prefix', { group: 'Release' }),
      task(2, 'Release AC-2: ship', { group: 'Release' }),
      task(3, 'Release candidate', { group: 'Release' }),
      task(4, 'Releaseish: not redundant', { group: 'Release' }),
      task(5, 'single: own group', { group: 'single' }),
      task(6, 'narration: alone after explicit override'),
    ),
  );
  expect([...groups]).toEqual([
    [
      1,
      {
        key: 'Release',
        label: 'Release',
        displaySubject: 'narration: keep this prefix',
      },
    ],
    [2, { key: 'Release', label: 'Release', displaySubject: 'AC-2: ship' }],
    [3, { key: 'Release', label: 'Release', displaySubject: 'candidate' }],
    [
      4,
      {
        key: 'Release',
        label: 'Release',
        displaySubject: 'Releaseish: not redundant',
      },
    ],
    [5, { key: 'single', label: 'single', displaySubject: 'own group' }],
  ]);
});
