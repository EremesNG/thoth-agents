import { afterEach, expect, it, vi } from 'vitest';
import type { TaskState } from './state.js';
import { applyTaskMutation, changesState } from './state-reducer.js';

afterEach(() => vi.restoreAllMocks());

it('persists explicit groups on create and group-only updates, including batch ops; empty clears a group', () => {
  const created = applyTaskMutation({ tasks: [], nextId: 1 }, 'create', {
    subject: 'First',
    group: 'pi-1.4',
  });
  expect(created.state.tasks[0].group).toBe('pi-1.4');
  const updated = applyTaskMutation(created.state, 'update', {
    id: 1,
    group: 'narration',
  });
  expect(updated.op).toMatchObject({ kind: 'update', changed: true });
  expect(updated.state.tasks[0].group).toBe('narration');
  const unchanged = applyTaskMutation(updated.state, 'update', {
    id: 1,
    group: 'narration',
  });
  expect(changesState(unchanged.op)).toBe(false);
  const batched = applyTaskMutation(updated.state, 'batch', {
    ops: [
      { action: 'create', subject: 'Second', group: 'old', ref: 'second' },
      { action: 'update', id: 'second', group: 'new' },
      { action: 'update', id: 1, group: '' },
    ],
  });
  expect(batched.state.tasks[0]).not.toHaveProperty('group');
  expect(batched.state.tasks[1].group).toBe('new');
});

it('archives only unarchived completed tasks without changing statuses or the input, and is idempotent', () => {
  vi.spyOn(Date, 'now').mockReturnValue(4000);
  const initial: TaskState = {
    tasks: [
      { id: 1, subject: 'Legacy done', status: 'completed' },
      {
        id: 2,
        subject: 'Already archived',
        status: 'completed',
        completedAt: 1000,
        archivedAt: 2000,
      },
      { id: 3, subject: 'Open', status: 'pending' },
      { id: 4, subject: 'Deleted', status: 'deleted', completedAt: 1000 },
    ],
    nextId: 5,
  };
  const archived = applyTaskMutation(initial, 'archive', {});
  expect(archived.state).toEqual({
    tasks: [
      { id: 1, subject: 'Legacy done', status: 'completed', archivedAt: 4000 },
      {
        id: 2,
        subject: 'Already archived',
        status: 'completed',
        completedAt: 1000,
        archivedAt: 2000,
      },
      { id: 3, subject: 'Open', status: 'pending' },
      { id: 4, subject: 'Deleted', status: 'deleted', completedAt: 1000 },
    ],
    nextId: 5,
  });
  expect(initial.tasks[0]).not.toHaveProperty('archivedAt');
  expect(archived.op).toEqual({ kind: 'archive', count: 1 });
  expect(changesState(archived.op)).toBe(true);
  const again = applyTaskMutation(archived.state, 'archive', {});
  expect(again.state).toBe(archived.state);
  expect(changesState(again.op)).toBe(false);
});

it('retains completion and archival history on either delete path; completed tasks cannot reopen', () => {
  const initial: TaskState = {
    tasks: [
      {
        id: 1,
        subject: 'Done',
        status: 'completed',
        createdAt: 1000,
        completedAt: 2000,
        archivedAt: 3000,
      },
    ],
    nextId: 2,
  };
  for (const action of ['delete', 'update'] as const) {
    const deleted = applyTaskMutation(initial, action, {
      id: 1,
      status: 'deleted',
    });
    expect(deleted.state.tasks[0]).toEqual({
      ...initial.tasks[0],
      status: 'deleted',
    });
  }
  expect(
    applyTaskMutation(initial, 'update', { id: 1, status: 'pending' }).op.kind,
  ).toBe('error');
});

it('stamps creation and first completion in the reducer, including batches, without refreshing no-op timestamps', () => {
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  const created = applyTaskMutation({ tasks: [], nextId: 1 }, 'batch', {
    ops: [
      { action: 'create', subject: 'Open' },
      { action: 'create', subject: 'Done', status: 'completed' },
    ],
  });
  expect(created.state.tasks).toEqual([
    { id: 1, subject: 'Open', status: 'pending', createdAt: 1000 },
    {
      id: 2,
      subject: 'Done',
      status: 'completed',
      createdAt: 1000,
      completedAt: 1000,
    },
  ]);
  vi.mocked(Date.now).mockReturnValue(2000);
  const completed = applyTaskMutation(created.state, 'update', {
    id: 1,
    status: 'completed',
  });
  expect(completed.state.tasks[0]).toMatchObject({
    createdAt: 1000,
    completedAt: 2000,
  });
  vi.mocked(Date.now).mockReturnValue(3000);
  const unchanged = applyTaskMutation(completed.state, 'update', {
    id: 1,
    status: 'completed',
  });
  expect(unchanged.op).toMatchObject({ changed: false });
  expect(unchanged.state.tasks[0].completedAt).toBe(2000);
});
