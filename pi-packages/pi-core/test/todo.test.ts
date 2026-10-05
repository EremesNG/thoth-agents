import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isTodoSnapshot,
  isTodoStateRequest,
  onRequest,
  publish,
  request,
  subscribe,
  TODO_STATE_CHANNEL,
  TODO_STATE_REQUEST,
  type TodoSnapshot,
  type TodoStateRequest,
} from '../src/index.js';
import { createFakeBus } from './fake-bus.js';

const snapshot: TodoSnapshot = {
  tasks: [
    { id: 1, subject: 'Plan', status: 'completed', blockedBy: [] },
    {
      id: 2,
      subject: 'Implement',
      description: 'Wire the public contract',
      activeForm: 'Implementing',
      status: 'in_progress',
      blockedBy: [],
      owner: 'worker',
    },
    { id: 3, subject: 'Verify', status: 'pending', blockedBy: [2] },
    { id: 4, subject: 'Old work', status: 'deleted', blockedBy: [] },
  ],
  nextId: 5,
  counts: { pending: 1, in_progress: 1, completed: 1, deleted: 1 },
};

function withTask(fields: Record<string, unknown>): unknown {
  return { ...snapshot, tasks: [{ ...snapshot.tasks[0], ...fields }] };
}

function withCounts(fields: Record<string, unknown>): unknown {
  return { ...snapshot, counts: { ...snapshot.counts, ...fields } };
}

afterEach(() => vi.restoreAllMocks());

describe('task-list state contract', () => {
  it('validates and transports full snapshots with all statuses and optional task fields', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_740_000_000_000);
    const events = createFakeBus();
    const rawSnapshots: unknown[] = [];
    const requests: unknown[] = [];
    const received: TodoSnapshot[] = [];
    events.on('thoth:todo:state', (value) => rawSnapshots.push(value));
    events.on('thoth:todo:state:request', (value) => requests.push(value));
    subscribe(events, TODO_STATE_CHANNEL, {
      sessionId: 'session-a',
      onSnapshot: (envelope) => received.push(envelope.data),
    });

    publish(events, TODO_STATE_CHANNEL, {
      sessionId: 'session-a',
      source: '@thoth-agents/pi-todo',
      data: snapshot,
    });
    const requestData: TodoStateRequest = {};
    request(events, TODO_STATE_REQUEST, {
      sessionId: 'session-a',
      source: '@thoth-agents/consumer',
      data: requestData,
    });

    expect(isTodoSnapshot(snapshot)).toBe(true);
    expect(isTodoStateRequest(requestData)).toBe(true);
    expect(rawSnapshots).toEqual([
      {
        v: 1,
        source: '@thoth-agents/pi-todo',
        sessionId: 'session-a',
        at: 1_740_000_000_000,
        data: snapshot,
      },
    ]);
    expect(received).toEqual([snapshot]);
    expect(requests).toEqual([
      {
        v: 1,
        source: '@thoth-agents/consumer',
        sessionId: 'session-a',
        at: 1_740_000_000_000,
        data: {},
      },
    ]);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['primitive', 'request'],
    ['array', []],
    ['unexpected fields', { sessionId: 'session-a' }],
    ['non-enumerable fields', Object.defineProperty({}, 'extra', { value: 1 })],
    ['symbol fields', { [Symbol('extra')]: true }],
    ['date', new Date(0)],
    ['map', new Map()],
    [
      'unreadable keys',
      new Proxy(
        {},
        {
          ownKeys() {
            throw new Error('unreadable');
          },
        },
      ),
    ],
  ])('rejects %s request data without disrupting valid requests', (_name, value) => {
    const events = createFakeBus();
    const received: TodoStateRequest[] = [];
    onRequest(events, TODO_STATE_REQUEST, {
      onRequest: (envelope) => received.push(envelope.data),
    });

    expect(isTodoStateRequest(value)).toBe(false);
    expect(() =>
      events.emit('thoth:todo:state:request', {
        v: 1,
        source: '@thoth-agents/consumer',
        sessionId: 'session-a',
        at: 0,
        data: value,
      }),
    ).not.toThrow();
    request(events, TODO_STATE_REQUEST, {
      sessionId: 'session-a',
      source: '@thoth-agents/consumer',
      data: {},
    });
    expect(received).toEqual([{}]);
  });

  it('accepts an empty list with a fresh nextId and zero counts', () => {
    expect(
      isTodoSnapshot({
        tasks: [],
        nextId: 1,
        counts: { pending: 0, in_progress: 0, completed: 0, deleted: 0 },
      }),
    ).toBe(true);
  });

  it.each([
    ['null snapshot', null],
    ['undefined snapshot', undefined],
    ['primitive snapshot', 1],
    ['array snapshot', []],
    ['missing tasks', { ...snapshot, tasks: undefined }],
    ['non-array tasks', { ...snapshot, tasks: {} }],
    ['sparse tasks', { ...snapshot, tasks: Array(1) }],
    ['null task', { ...snapshot, tasks: [null] }],
    ['empty task', { ...snapshot, tasks: [{}] }],
    ['array task', { ...snapshot, tasks: [[]] }],
    ['missing nextId', { ...snapshot, nextId: undefined }],
    ['string nextId', { ...snapshot, nextId: '5' }],
    ['zero nextId', { ...snapshot, nextId: 0 }],
    ['negative nextId', { ...snapshot, nextId: -1 }],
    ['fractional nextId', { ...snapshot, nextId: 1.5 }],
    ['infinite nextId', { ...snapshot, nextId: Number.POSITIVE_INFINITY }],
    ['NaN nextId', { ...snapshot, nextId: Number.NaN }],
    ['unsafe nextId', { ...snapshot, nextId: Number.MAX_SAFE_INTEGER + 1 }],
    ['missing counts', { ...snapshot, counts: undefined }],
    ['array counts', { ...snapshot, counts: [] }],
    ['missing pending count', withCounts({ pending: undefined })],
    ['missing in_progress count', withCounts({ in_progress: undefined })],
    ['missing completed count', withCounts({ completed: undefined })],
    ['missing deleted count', withCounts({ deleted: undefined })],
    ['string count', withCounts({ pending: '1' })],
    ['negative count', withCounts({ pending: -1 })],
    ['fractional count', withCounts({ pending: 1.5 })],
    ['infinite count', withCounts({ pending: Number.POSITIVE_INFINITY })],
    ['NaN count', withCounts({ pending: Number.NaN })],
    ['unsafe count', withCounts({ pending: Number.MAX_SAFE_INTEGER + 1 })],
    ['missing id', withTask({ id: undefined })],
    ['string id', withTask({ id: '1' })],
    ['zero id', withTask({ id: 0 })],
    ['negative id', withTask({ id: -1 })],
    ['fractional id', withTask({ id: 1.5 })],
    ['infinite id', withTask({ id: Number.POSITIVE_INFINITY })],
    ['NaN id', withTask({ id: Number.NaN })],
    ['unsafe id', withTask({ id: Number.MAX_SAFE_INTEGER + 1 })],
    ['missing subject', withTask({ subject: undefined })],
    ['non-string subject', withTask({ subject: 1 })],
    ['missing status', withTask({ status: undefined })],
    ['unknown status', withTask({ status: 'inProgress' })],
    ['missing blockedBy', withTask({ blockedBy: undefined })],
    ['non-array blockedBy', withTask({ blockedBy: '2' })],
    ['string blocker', withTask({ blockedBy: ['2'] })],
    ['zero blocker', withTask({ blockedBy: [0] })],
    ['negative blocker', withTask({ blockedBy: [-1] })],
    ['fractional blocker', withTask({ blockedBy: [1.5] })],
    ['NaN blocker', withTask({ blockedBy: [Number.NaN] })],
    ['sparse blockers', withTask({ blockedBy: Array(1) })],
    ['null description', withTask({ description: null })],
    ['non-string description', withTask({ description: 1 })],
    ['non-string activeForm', withTask({ activeForm: 1 })],
    ['null owner', withTask({ owner: null })],
    ['non-string owner', withTask({ owner: 1 })],
    [
      'throwing accessor',
      {
        get tasks() {
          throw new Error('unreadable');
        },
      },
    ],
  ])('rejects %s and ignores it on the state channel', (_name, value) => {
    const events = createFakeBus();
    const received: TodoSnapshot[] = [];
    subscribe(events, TODO_STATE_CHANNEL, {
      sessionId: 'session-a',
      onSnapshot: (envelope) => received.push(envelope.data),
    });

    expect(isTodoSnapshot(value)).toBe(false);
    expect(() =>
      events.emit('thoth:todo:state', {
        v: 1,
        source: '@thoth-agents/pi-todo',
        sessionId: 'session-a',
        at: 0,
        data: value,
      }),
    ).not.toThrow();
    publish(events, TODO_STATE_CHANNEL, {
      sessionId: 'session-a',
      source: '@thoth-agents/pi-todo',
      data: snapshot,
    });

    expect(received).toEqual([snapshot]);
  });
});
