import { describe, expect, it } from 'vitest';
import {
  buildSessionEntries,
  createMockCtx,
  makeTodoToolResult,
  makeUserMessage,
} from '../test/helpers.js';
import { buildToolResult } from '../tool/response-envelope.js';
import {
  STATE_ENTRY_TYPE,
  type Task,
  type TaskDetails,
} from '../tool/types.js';
import { isTaskDetails, replayFromBranch } from './replay.js';
import { applyTaskMutation } from './state-reducer.js';

function buildBranch(snapshots: TaskDetails[]) {
  const messages = snapshots.map((s) => makeTodoToolResult(s));
  return buildSessionEntries([makeUserMessage('hi'), ...messages]);
}

const taskFixture = (
  id: number,
  subject: string,
  extra: Partial<Task> = {},
): Task => ({
  id,
  subject,
  status: 'pending',
  ...extra,
});

describe('isTaskDetails — defensive type guard', () => {
  it('rejects null and undefined', () => {
    expect(isTaskDetails(null)).toBe(false);
    expect(isTaskDetails(undefined)).toBe(false);
  });

  it('rejects primitives (string, number, boolean)', () => {
    expect(isTaskDetails('oops')).toBe(false);
    expect(isTaskDetails(42)).toBe(false);
    expect(isTaskDetails(true)).toBe(false);
  });

  it('rejects objects missing tasks[] or nextId', () => {
    expect(isTaskDetails({})).toBe(false);
    expect(isTaskDetails({ tasks: 'x', nextId: 1 })).toBe(false);
    expect(isTaskDetails({ tasks: [], nextId: '1' })).toBe(false);
  });

  it('accepts well-formed snapshot envelopes', () => {
    expect(isTaskDetails({ tasks: [], nextId: 1 })).toBe(true);
    expect(
      isTaskDetails({ action: 'create', params: {}, tasks: [], nextId: 1 }),
    ).toBe(true);
  });
});

describe('replayFromBranch', () => {
  it('returns empty TaskState when branch has no todo toolResults', () => {
    const ctx = createMockCtx({
      branch: buildSessionEntries([makeUserMessage('hi')]),
    });
    const state = replayFromBranch(ctx);
    expect(state.tasks).toEqual([]);
    expect(state.nextId).toBe(1);
  });

  it('replays the last snapshot (last-write-wins)', () => {
    const ctx = createMockCtx({
      branch: buildBranch([
        {
          action: 'create',
          params: {},
          tasks: [taskFixture(1, 'old')],
          nextId: 2,
        },
        {
          action: 'create',
          params: {},
          tasks: [taskFixture(1, 'old'), taskFixture(2, 'new')],
          nextId: 3,
        },
      ]),
    });
    const state = replayFromBranch(ctx);
    expect(state.tasks).toHaveLength(2);
    expect(state.nextId).toBe(3);
  });

  it('clones tasks so mutating the fixture does not mutate replayed state', () => {
    const fixture: Task = taskFixture(1, 'original');
    const ctx = createMockCtx({
      branch: buildBranch([
        { action: 'create', params: {}, tasks: [fixture], nextId: 2 },
      ]),
    });
    const state = replayFromBranch(ctx);
    const replayed = state.tasks[0];
    expect(replayed).not.toBe(fixture);
    expect(replayed.subject).toBe('original');
  });

  it('skips non-message entries in the branch (defensive type guard)', () => {
    const ctx = createMockCtx({
      branch: [
        { type: 'tool_call', call: { id: 'x' } } as never,
        ...buildBranch([
          {
            action: 'create',
            params: {},
            tasks: [taskFixture(1, 'kept')],
            nextId: 2,
          },
        ]),
      ] as never,
    });
    const state = replayFromBranch(ctx);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.subject).toBe('kept');
    expect(state.nextId).toBe(2);
  });

  it('skips toolResult entries whose details fail isTaskDetails (corrupt-snapshot guard)', () => {
    // Construct a toolResult with toolName=todo but malformed details — must be ignored.
    const corrupt = {
      type: 'message' as const,
      message: {
        role: 'toolResult',
        toolName: 'todo',
        details: { tasks: 'not-an-array' },
      },
    };
    const ctx = createMockCtx({
      branch: [
        ...buildBranch([
          {
            action: 'create',
            params: {},
            tasks: [taskFixture(1, 'good')],
            nextId: 2,
          },
        ]),
        corrupt as never,
      ] as never,
    });
    const state = replayFromBranch(ctx);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.subject).toBe('good');
  });

  it('returns a fresh empty TaskState when called with an empty branch', () => {
    const ctx1 = createMockCtx({
      branch: buildBranch([
        {
          action: 'create',
          params: {},
          tasks: [taskFixture(1, 'x')],
          nextId: 2,
        },
      ]),
    });
    expect(replayFromBranch(ctx1).nextId).toBe(2);

    const ctx2 = createMockCtx({
      branch: buildSessionEntries([makeUserMessage('hi')]),
    });
    const fresh = replayFromBranch(ctx2);
    expect(fresh.tasks).toEqual([]);
    expect(fresh.nextId).toBe(1);
  });
});

const snapshot = (tasks: Task[], nextId: number): TaskDetails => ({
  action: 'update',
  params: {},
  tasks,
  nextId,
});
const stateEntry = (data: unknown) => ({
  type: 'custom',
  customType: STATE_ENTRY_TYPE,
  data,
});
const todoResult = (details: TaskDetails) => ({
  type: 'message',
  message: makeTodoToolResult(details),
});

describe('replayFromBranch — state entries', () => {
  it('matches the state-entry persistence key', () => {
    expect(STATE_ENTRY_TYPE).toBe('rpiv-todo-state');
  });

  it('replays the latest state entry on a nested-only branch', () => {
    const ctx = createMockCtx({
      branch: [
        ...buildSessionEntries([makeUserMessage('hi')]),
        stateEntry(snapshot([taskFixture(1, 'A')], 2)),
        stateEntry(snapshot([taskFixture(1, 'A'), taskFixture(2, 'B')], 3)),
      ],
    });
    expect(replayFromBranch(ctx)).toEqual({
      tasks: [taskFixture(1, 'A'), taskFixture(2, 'B')],
      nextId: 3,
    });
  });

  it.each([
    'before',
    'after',
  ])('state entries outrank a legacy tool result placed %s them', (order) => {
    const entry = stateEntry(
      snapshot([taskFixture(1, 'T', { status: 'completed' })], 2),
    );
    const legacy = todoResult(
      snapshot([taskFixture(1, 'T', { status: 'in_progress' })], 2),
    );
    const branch = order === 'before' ? [legacy, entry] : [entry, legacy];
    expect(replayFromBranch(createMockCtx({ branch })).tasks[0]?.status).toBe(
      'completed',
    );
  });

  it('falls back to the latest legacy result when all custom entries are invalid or unrelated', () => {
    const ctx = createMockCtx({
      branch: [
        todoResult(snapshot([taskFixture(1, 'old')], 2)),
        stateEntry({ tasks: [], nextId: 'invalid' }),
        { type: 'custom', customType: 'codemode-store', data: snapshot([], 1) },
        todoResult(snapshot([taskFixture(1, 'legacy')], 2)),
      ],
    });
    expect(replayFromBranch(ctx)).toEqual({
      tasks: [taskFixture(1, 'legacy')],
      nextId: 2,
    });
  });

  it('restores a cleared list instead of resurrecting tasks', () => {
    const ctx = createMockCtx({
      branch: [
        stateEntry(snapshot([taskFixture(1, 'gone')], 2)),
        stateEntry(snapshot([], 1)),
        todoResult(snapshot([taskFixture(1, 'stale')], 2)),
      ],
    });
    expect(replayFromBranch(ctx)).toEqual({ tasks: [], nextId: 1 });
  });

  it('ignores malformed state entries and unrelated custom types after a valid entry', () => {
    const ctx = createMockCtx({
      branch: [
        stateEntry(snapshot([taskFixture(1, 'good')], 2)),
        stateEntry({ tasks: 'corrupt', nextId: 9 }),
        stateEntry(null),
        { type: 'custom', customType: 'codemode-store', data: snapshot([], 1) },
      ],
    });
    expect(replayFromBranch(ctx)).toEqual({
      tasks: [taskFixture(1, 'good')],
      nextId: 2,
    });
  });

  it('returns empty state when neither source has a valid snapshot', () => {
    const ctx = createMockCtx({
      branch: [
        stateEntry(undefined),
        ...buildSessionEntries([makeTodoToolResult({})]),
      ],
    });
    expect(replayFromBranch(ctx)).toEqual({ tasks: [], nextId: 1 });
  });

  it('clones the tasks from a custom entry', () => {
    const fixture = taskFixture(1, 'original');
    const replayed = replayFromBranch(
      createMockCtx({ branch: [stateEntry(snapshot([fixture], 2))] }),
    );
    expect(replayed.tasks[0]).toEqual(fixture);
    expect(replayed.tasks[0]).not.toBe(fixture);
    fixture.subject = 'changed';
    expect(replayed.tasks[0]?.subject).toBe('original');
  });
});

it('replays a batch snapshot and its following error without interpreting refs or results', () => {
  const applied = applyTaskMutation({ tasks: [], nextId: 1 }, 'batch', {
    ops: [
      { action: 'create', subject: 'Root', ref: 'root', status: 'in_progress' },
      { action: 'create', subject: 'Child', blockedBy: ['root'] },
    ],
  });
  const success = buildToolResult(
    'batch',
    {},
    applied.state,
    applied.op,
  ).details;
  const failed = applyTaskMutation(applied.state, 'batch', {
    ops: [{ action: 'delete', id: 'root' }],
  });
  const error = buildToolResult('batch', {}, failed.state, failed.op).details;
  expect(
    replayFromBranch(createMockCtx({ branch: buildBranch([success, error]) })),
  ).toEqual({
    tasks: [
      { id: 1, subject: 'Root', status: 'in_progress' },
      { id: 2, subject: 'Child', status: 'pending', blockedBy: [1] },
    ],
    nextId: 3,
  });
});
