import { describe, expect, it } from 'vitest';
import type { TaskState } from './state.js';
import { applyTaskMutation } from './state-reducer.js';

const empty = (): TaskState => ({ tasks: [], nextId: 1 });

describe('atomic batch', () => {
  it('creates ten ordered tasks with one in_progress and the correct nextId', () => {
    const initial = empty();
    const result = applyTaskMutation(initial, 'batch', {
      ops: Array.from({ length: 10 }, (_, index) => ({
        action: 'create',
        subject: `Task ${index}`,
        status: index === 0 ? 'in_progress' : 'pending',
      })),
    });
    expect(result.state.tasks).toHaveLength(10);
    expect(result.state.nextId).toBe(11);
    expect(result.state.tasks[0]).toEqual({
      id: 1,
      subject: 'Task 0',
      status: 'in_progress',
    });
    expect(result.state.tasks[9]).toEqual({
      id: 10,
      subject: 'Task 9',
      status: 'pending',
    });
    expect(result.op).toMatchObject({
      kind: 'batch',
      results: expect.arrayContaining([{ index: 9, action: 'create', id: 10 }]),
    });
    expect(initial).toEqual({ tasks: [], nextId: 1 });
  });
});

describe('batch refs and rollback', () => {
  it('resolves earlier refs in every id field, preserving numeric-looking refs and parallel statuses', () => {
    const result = applyTaskMutation(empty(), 'batch', {
      ops: [
        {
          action: 'create',
          subject: 'Root',
          ref: '123',
          status: 'in_progress',
        },
        {
          action: 'create',
          subject: 'Child',
          ref: 'child',
          status: 'in_progress',
          blockedBy: ['123'],
        },
        { action: 'create', subject: 'Done', status: 'completed' },
        {
          action: 'update',
          id: 'child',
          removeBlockedBy: ['123'],
          addBlockedBy: [3],
          owner: 'worker',
        },
        { action: 'delete', id: '123' },
      ],
    });
    expect(result.op).toEqual({
      kind: 'batch',
      results: [
        { index: 0, action: 'create', id: 1, ref: '123' },
        { index: 1, action: 'create', id: 2, ref: 'child' },
        { index: 2, action: 'create', id: 3 },
        { index: 3, action: 'update', id: 2 },
        { index: 4, action: 'delete', id: 1 },
      ],
    });
    expect(result.state.tasks).toEqual([
      { id: 1, subject: 'Root', status: 'deleted' },
      {
        id: 2,
        subject: 'Child',
        status: 'in_progress',
        blockedBy: [3],
        owner: 'worker',
      },
      { id: 3, subject: 'Done', status: 'completed' },
    ]);
    expect(result.state.tasks.every((task) => !('ref' in task))).toBe(true);
    const next = applyTaskMutation(result.state, 'batch', {
      ops: [{ action: 'delete', id: 'child' }],
    });
    expect(next.op).toEqual({
      kind: 'error',
      message: 'op[0] delete: unknown or forward ref "child"',
    });
  });

  it.each([
    { action: 'create', subject: '', reason: 'subject required for create' },
    {
      action: 'create',
      subject: 'Duplicate',
      ref: 'root',
      reason: 'duplicate ref "root"',
    },
    {
      action: 'delete',
      id: 'missing',
      reason: 'unknown or forward ref "missing"',
    },
    {
      action: 'create',
      subject: 'Forward',
      blockedBy: ['later'],
      reason: 'unknown or forward ref "later"',
    },
    {
      action: 'create',
      subject: 'Deleted',
      status: 'deleted',
      reason: 'create status must be pending, in_progress or completed',
    },
    {
      action: 'update',
      id: 1,
      addBlockedBy: [99],
      reason: 'addBlockedBy: #99 not found',
    },
    {
      action: 'update',
      id: 1,
      addBlockedBy: ['root'],
      reason: 'cannot block #1 on itself',
    },
    { action: 'delete', id: 99, reason: '#99 not found' },
    { action: 'clear', reason: 'unsupported batch action' },
    {
      action: 'update',
      id: 1,
      subject: 'Changed',
      ref: 'other',
      reason: 'ref is create-only',
    },
    {
      action: 'create',
      subject: 'Self',
      ref: 'self',
      blockedBy: ['self'],
      reason: 'unknown or forward ref "self"',
    },
  ])('rolls back state and nextId on $reason', ({ reason, ...operation }) => {
    const initial = empty();
    const result = applyTaskMutation(initial, 'batch', {
      ops: [
        { action: 'create', subject: 'Root', ref: 'root' },
        operation,
        { action: 'create', subject: 'Later', ref: 'later' },
      ],
    } as never);
    expect(result.op).toEqual({
      kind: 'error',
      message: `op[1] ${operation.action}: ${reason}`,
    });
    expect(result.state).toBe(initial);
    expect(initial).toEqual({ tasks: [], nextId: 1 });
  });

  it('rejects empty, missing and oversized ops, accepting the 50-op boundary', () => {
    expect(applyTaskMutation(empty(), 'batch', {}).op).toEqual({
      kind: 'error',
      message: 'batch requires non-empty ops',
    });
    expect(applyTaskMutation(empty(), 'batch', { ops: [] }).op.kind).toBe(
      'error',
    );
    const ops = Array.from({ length: 50 }, () => ({
      action: 'create' as const,
      subject: 'Task',
    }));
    expect(applyTaskMutation(empty(), 'batch', { ops }).state.nextId).toBe(51);
    expect(
      applyTaskMutation(empty(), 'batch', { ops: [...ops, ops[0]] }).op,
    ).toEqual({ kind: 'error', message: 'batch supports at most 50 ops' });
  });

  it('rolls back updates, dependency rewrites, metadata deletion and tombstones on a later failure', () => {
    const initial: TaskState = {
      tasks: [
        {
          id: 1,
          subject: 'Root',
          status: 'pending',
          metadata: { keep: true, drop: true },
        },
        { id: 2, subject: 'Child', status: 'pending', blockedBy: [1] },
      ],
      nextId: 3,
    };
    const saved = structuredClone(initial);
    const result = applyTaskMutation(initial, 'batch', {
      ops: [
        {
          action: 'update',
          id: 1,
          metadata: { drop: null },
          status: 'in_progress',
        },
        {
          action: 'update',
          id: 2,
          removeBlockedBy: [1],
          description: 'Changed',
        },
        { action: 'delete', id: 1 },
        { action: 'create', subject: 'Fail', blockedBy: [1] },
      ],
    });
    expect(result.state).toBe(initial);
    expect(initial).toEqual(saved);
    expect(result.op).toEqual({
      kind: 'error',
      message: 'op[3] create: blockedBy: #1 is deleted',
    });
  });
});

describe('staged dependency graph', () => {
  it('checks replacement adjacency when combined remove/add via refs repairs a replayed cycle', () => {
    const initial: TaskState = {
      tasks: [
        { id: 1, subject: 'A', status: 'pending', blockedBy: [2] },
        { id: 2, subject: 'B', status: 'pending', blockedBy: [1] },
      ],
      nextId: 3,
    };
    const result = applyTaskMutation(initial, 'batch', {
      ops: [
        { action: 'create', subject: 'C', ref: 'c' },
        { action: 'update', id: 1, removeBlockedBy: [2], addBlockedBy: ['c'] },
      ],
    });
    expect(result.op.kind).toBe('batch');
    expect(result.state.tasks[0].blockedBy).toEqual([3]);
    expect(initial.tasks[0].blockedBy).toEqual([2]);
  });

  it('allows ordered rewiring via refs but rejects a cycle in the staged graph atomically', () => {
    const ops = [
      { action: 'create' as const, subject: 'A', ref: 'a' },
      { action: 'create' as const, subject: 'B', ref: 'b', blockedBy: ['a'] },
      { action: 'create' as const, subject: 'C', ref: 'c' },
      {
        action: 'update' as const,
        id: 'b',
        removeBlockedBy: ['a'],
        addBlockedBy: ['c'],
      },
      { action: 'update' as const, id: 'a', addBlockedBy: ['b'] },
    ];
    expect(
      applyTaskMutation(empty(), 'batch', { ops }).state.tasks[1].blockedBy,
    ).toEqual([3]);
    const initial = empty();
    const result = applyTaskMutation(initial, 'batch', {
      ops: [...ops, { action: 'update', id: 'c', addBlockedBy: ['a'] }],
    });
    expect(result.state).toBe(initial);
    expect(result.op).toEqual({
      kind: 'error',
      message:
        'op[5] update: addBlockedBy would create a cycle in the blockedBy graph',
    });
  });
});

it('treats a numeric-looking string as a ref rather than an existing numeric id', () => {
  const initial: TaskState = {
    tasks: [{ id: 1, subject: 'Existing', status: 'pending' }],
    nextId: 2,
  };
  const result = applyTaskMutation(initial, 'batch', {
    ops: [
      { action: 'create', subject: 'New', ref: '1' },
      { action: 'update', id: '1', status: 'in_progress' },
    ],
  });
  expect(result.state.tasks).toEqual([
    { id: 1, subject: 'Existing', status: 'pending' },
    { id: 2, subject: 'New', status: 'in_progress' },
  ]);
});

it('preserves terminal status transitions within a batch', () => {
  const initial = empty();
  const result = applyTaskMutation(initial, 'batch', {
    ops: [
      { action: 'create', subject: 'Done', status: 'completed', ref: 'done' },
      { action: 'update', id: 'done', status: 'in_progress' },
    ],
  });
  expect(result.state).toBe(initial);
  expect(result.op).toEqual({
    kind: 'error',
    message: 'op[1] update: illegal transition completed → in_progress',
  });
});
