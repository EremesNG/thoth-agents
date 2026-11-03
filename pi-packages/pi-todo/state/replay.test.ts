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

  it.each([
    0,
    -1,
    Number.MIN_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
  ])('accepts safe integer boundaries without ordering constraints: %s', (id) => {
    expect(
      isTaskDetails({ tasks: [taskFixture(id, 'valid')], nextId: id }),
    ).toBe(true);
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
const todoResult = (details: unknown) => ({
  type: 'message',
  message: makeTodoToolResult(details),
});

describe.each([
  ['state entries', stateEntry],
  ['legacy results', todoResult],
] as const)('replayFromBranch — malformed snapshots in %s', (_source, entry) => {
  const lastValid = { tasks: [taskFixture(1, 'last valid')], nextId: 2 };
  const replayAfterValid = (corrupt: unknown) =>
    replayFromBranch(
      createMockCtx({
        branch: [
          entry(snapshot(lastValid.tasks, lastValid.nextId)),
          entry(corrupt),
        ],
      }),
    );

  it.each([
    ['null task', null],
    ['array task', []],
    [
      'truncation marker',
      '[output-policy: array truncated, dropped 3 item(s)]',
    ],
    ['missing id', { subject: 'bad', status: 'pending' }],
    ['missing subject', { id: 1, status: 'pending' }],
    ['non-string subject', { id: 1, subject: 7, status: 'pending' }],
    ['missing status', { id: 1, subject: 'bad' }],
    ['unknown status', { id: 1, subject: 'bad', status: 'done' }],
  ])('skips the whole snapshot containing %s', (_reason, malformed) => {
    const corrupt = {
      tasks: [taskFixture(1, 'must not partially apply'), malformed],
      nextId: 9,
    };
    expect(replayAfterValid(corrupt)).toEqual(lastValid);
  });

  it.each([
    ['description', { description: 7 }],
    ['activeForm', { activeForm: 7 }],
    ['owner', { owner: {} }],
    ['group', { group: 7 }],
    ['blockedBy string', { blockedBy: '#2' }],
    ['blockedBy non-number', { blockedBy: ['2'] }],
    ['blockedBy fractional id', { blockedBy: [1.5] }],
    ['blockedBy NaN', { blockedBy: [Number.NaN] }],
    ['blockedBy infinite id', { blockedBy: [Number.POSITIVE_INFINITY] }],
    ['blockedBy unsafe id', { blockedBy: [Number.MAX_SAFE_INTEGER + 1] }],
    ['metadata string', { metadata: 'm' }],
    ['metadata null', { metadata: null }],
    ['metadata array', { metadata: [] }],
    ['createdAt string', { createdAt: 'yesterday' }],
    ['createdAt NaN', { createdAt: Number.NaN }],
    ['completedAt string', { completedAt: 'today' }],
    ['completedAt infinite', { completedAt: Number.POSITIVE_INFINITY }],
    ['archivedAt string', { archivedAt: 'tomorrow' }],
    ['archivedAt infinite', { archivedAt: Number.NEGATIVE_INFINITY }],
  ])('skips a snapshot with malformed optional %s', (_field, extra) => {
    const corrupt = {
      tasks: [{ ...taskFixture(1, 'corrupt'), ...extra }],
      nextId: 9,
    };
    expect(replayAfterValid(corrupt)).toEqual(lastValid);
  });

  it('restores a later valid snapshot with every local optional field and status', () => {
    const tasks = [
      taskFixture(1, 'pending'),
      taskFixture(2, 'in progress', {
        status: 'in_progress',
        group: 'Implementation',
        description: 'Details',
        activeForm: 'Working',
        blockedBy: [1],
        owner: 'worker',
        metadata: { key: 1, nested: { value: null } },
        createdAt: 1_700_000_000_000,
        completedAt: 1_700_000_001_000,
        archivedAt: 1_700_000_002_000,
      }),
      taskFixture(3, 'completed', { status: 'completed' }),
      taskFixture(4, 'deleted', { status: 'deleted' }),
    ];
    const ctx = createMockCtx({
      branch: [
        entry({ tasks: ['[output-policy: array truncated]'], nextId: 9 }),
        entry(snapshot(tasks, 5)),
      ],
    });
    expect(replayFromBranch(ctx)).toEqual({ tasks, nextId: 5 });
  });

  describe.each([
    'id',
    'nextId',
  ] as const)('%s must be a safe integer', (field) => {
    it.each([
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      Number.MIN_SAFE_INTEGER - 1,
    ])('skips a snapshot with %s', (value) => {
      const corrupt = {
        tasks: [taskFixture(field === 'id' ? value : 1, 'corrupt')],
        nextId: field === 'nextId' ? value : 9,
      };
      expect(replayAfterValid(corrupt)).toEqual(lastValid);
    });
  });
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

  it('falls back to a valid legacy result when a custom snapshot contains a malformed task', () => {
    const ctx = createMockCtx({
      branch: [
        todoResult(snapshot([taskFixture(1, 'legacy')], 2)),
        stateEntry({
          tasks: [taskFixture(1, 'must not partially apply'), 'truncated'],
          nextId: 9,
        }),
      ],
    });
    expect(replayFromBranch(ctx)).toEqual({
      tasks: [taskFixture(1, 'legacy')],
      nextId: 2,
    });
  });

  it('keeps an earlier authoritative snapshot despite malformed entries and a later valid legacy result', () => {
    const ctx = createMockCtx({
      branch: [
        stateEntry(snapshot([taskFixture(1, 'authoritative')], 2)),
        stateEntry({ tasks: [taskFixture(1, 'corrupt')], nextId: 1.5 }),
        todoResult(snapshot([taskFixture(1, 'stale legacy')], 2)),
        todoResult({ tasks: ['truncated'], nextId: 9 }),
      ],
    });
    expect(replayFromBranch(ctx)).toEqual({
      tasks: [taskFixture(1, 'authoritative')],
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
        stateEntry({ tasks: [null], nextId: 9 }),
        todoResult({ tasks: [taskFixture(1, 'corrupt')], nextId: Number.NaN }),
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
      {
        id: 1,
        subject: 'Root',
        status: 'in_progress',
        createdAt: expect.any(Number),
      },
      {
        id: 2,
        subject: 'Child',
        status: 'pending',
        blockedBy: [1],
        createdAt: expect.any(Number),
      },
    ],
    nextId: 3,
  });
});
