import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BACKGROUND_STATE_CHANNEL,
  BACKGROUND_STATE_REQUEST,
  type BackgroundSnapshot,
  type BackgroundStateRequest,
  isBackgroundSnapshot,
  isBackgroundStateRequest,
  onRequest,
  publish,
  request,
  subscribe,
} from '../src/index.js';
import { createFakeBus } from './fake-bus.js';

const snapshot: BackgroundSnapshot = {
  tasks: [
    {
      id: 'watch',
      name: 'Build monitor',
      kind: 'command_watch',
      status: 'running',
      createdAt: 0,
      startedAt: 1,
      deadlineAt: 1000,
      lastCheckedAt: 2,
      lastProgressAt: 3,
      stopRequestedAt: 4,
      exitCode: null,
      signal: null,
      progress: 'check 2',
      dismissed: false,
    },
    {
      id: 'succeeded',
      kind: 'process',
      status: 'succeeded',
      createdAt: 1,
      startedAt: 2,
      endedAt: 3,
      exitCode: 0,
      progress: 100,
      dismissed: true,
      dismissedAt: 4,
    },
    {
      id: 'failed',
      kind: 'process',
      status: 'failed',
      createdAt: 1,
      startedAt: 2,
      exitCode: -1,
    },
    {
      id: 'cancelled',
      kind: 'process',
      status: 'cancelled',
      createdAt: 1,
      startedAt: 2,
      signal: 'SIGTERM',
    },
    {
      id: 'timeout',
      kind: 'command_watch',
      status: 'timed_out',
      createdAt: 1,
      startedAt: 2,
    },
  ],
  counts: { running: 1, succeeded: 1, failed: 1, cancelled: 1, timed_out: 1 },
};

function withTask(fields: Record<string, unknown>): unknown {
  return { ...snapshot, tasks: [{ ...snapshot.tasks[0], ...fields }] };
}

function withCounts(fields: Record<string, unknown>): unknown {
  return { ...snapshot, counts: { ...snapshot.counts, ...fields } };
}

afterEach(() => vi.restoreAllMocks());

describe('background task state contract', () => {
  it('transports all native statuses and lightweight metadata in a v1 envelope', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    const events = createFakeBus();
    const raw: unknown[] = [];
    const received: BackgroundSnapshot[] = [];
    events.on('thoth:background:state', (value) => raw.push(value));
    subscribe(events, BACKGROUND_STATE_CHANNEL, {
      sessionId: 'session-a',
      onSnapshot: ({ data }) => received.push(data),
    });
    publish(events, BACKGROUND_STATE_CHANNEL, {
      sessionId: 'session-a',
      source: '@thoth-agents/pi-background-tasks',
      data: snapshot,
    });

    expect(isBackgroundSnapshot(snapshot)).toBe(true);
    expect(raw).toEqual([
      {
        v: 1,
        source: '@thoth-agents/pi-background-tasks',
        sessionId: 'session-a',
        at: 100,
        data: snapshot,
      },
    ]);
    expect(received).toEqual([snapshot]);
  });

  it('accepts empty state and finite numeric or bounded text progress without count reconciliation', () => {
    expect(
      isBackgroundSnapshot({
        tasks: [],
        counts: {
          running: 0,
          succeeded: 0,
          failed: 0,
          cancelled: 0,
          timed_out: 0,
        },
      }),
    ).toBe(true);
    expect(isBackgroundSnapshot(withTask({ progress: 'x'.repeat(200) }))).toBe(
      true,
    );
    expect(isBackgroundSnapshot(withTask({ progress: 0.5 }))).toBe(true);
    expect(
      isBackgroundSnapshot(withTask({ endedAt: Number.MAX_SAFE_INTEGER })),
    ).toBe(true);
    expect(
      isBackgroundSnapshot(Object.assign(Object.create(null), snapshot)),
    ).toBe(true);
  });

  it.each([
    ['null snapshot', null],
    ['primitive snapshot', 1],
    ['array snapshot', []],
    ['missing tasks', { ...snapshot, tasks: undefined }],
    ['non-array tasks', { ...snapshot, tasks: {} }],
    ['sparse tasks', { ...snapshot, tasks: Array(1) }],
    ['null task', { ...snapshot, tasks: [null] }],
    ['array task', { ...snapshot, tasks: [[]] }],
    ['empty task', { ...snapshot, tasks: [{}] }],
    ['missing id', withTask({ id: undefined })],
    ['empty id', withTask({ id: '' })],
    ['non-string name', withTask({ name: 1 })],
    ['unknown kind', withTask({ kind: 'watch' })],
    ['unknown status', withTask({ status: 'completed' })],
    ['missing created time', withTask({ createdAt: undefined })],
    ['missing started time', withTask({ startedAt: undefined })],
    ['text created time', withTask({ createdAt: '2026-10-09T00:00:00Z' })],
    ['negative started time', withTask({ startedAt: -1 })],
    ...[
      'endedAt',
      'deadlineAt',
      'lastCheckedAt',
      'lastProgressAt',
      'stopRequestedAt',
      'dismissedAt',
    ].flatMap((key): [string, unknown][] => [
      [`negative ${key}`, withTask({ [key]: -1 })],
      [`fractional ${key}`, withTask({ [key]: 1.5 })],
      [`infinite ${key}`, withTask({ [key]: Number.POSITIVE_INFINITY })],
      [`unsafe ${key}`, withTask({ [key]: Number.MAX_SAFE_INTEGER + 1 })],
      [`null ${key}`, withTask({ [key]: null })],
    ]),
    ['string exit code', withTask({ exitCode: '0' })],
    ['fractional exit code', withTask({ exitCode: 0.5 })],
    ['infinite exit code', withTask({ exitCode: Number.POSITIVE_INFINITY })],
    ['unsafe exit code', withTask({ exitCode: Number.MAX_SAFE_INTEGER + 1 })],
    ['numeric signal', withTask({ signal: 1 })],
    ['empty signal', withTask({ signal: '' })],
    ['oversized progress', withTask({ progress: 'x'.repeat(201) })],
    ['structured progress', withTask({ progress: { stdout: 'secret' } })],
    ['infinite progress', withTask({ progress: Number.POSITIVE_INFINITY })],
    ['NaN progress', withTask({ progress: Number.NaN })],
    ['null progress', withTask({ progress: null })],
    ['non-boolean dismissed', withTask({ dismissed: 1 })],
    ['missing counts', { ...snapshot, counts: undefined }],
    ['array counts', { ...snapshot, counts: [] }],
    ['missing status count', withCounts({ timed_out: undefined })],
    ['negative count', withCounts({ failed: -1 })],
    ['fractional count', withCounts({ running: 0.5 })],
    ['unsafe count', withCounts({ succeeded: Number.MAX_SAFE_INTEGER + 1 })],
    ['extra snapshot field', { ...snapshot, cwd: '/secret' }],
    ['extra counts field', withCounts({ total: 5 })],
    [
      'non-enumerable task field',
      {
        ...snapshot,
        tasks: [
          Object.defineProperty({ ...snapshot.tasks[0] }, 'logPath', {
            value: '/secret',
          }),
        ],
      },
    ],
    ['symbol snapshot field', { ...snapshot, [Symbol('result')]: 'secret' }],
    [
      'custom prototype',
      Object.assign(Object.create({ env: { TOKEN: 'secret' } }), snapshot),
    ],
    [
      'throwing task accessor',
      {
        ...snapshot,
        tasks: [
          {
            get id() {
              throw new Error('unreadable');
            },
          },
        ],
      },
    ],
    [
      'unreadable keys',
      new Proxy(snapshot, {
        ownKeys() {
          throw new Error('unreadable');
        },
      }),
    ],
    ...[
      'command',
      'argv',
      'env',
      'cwd',
      'result',
      'lastState',
      'successWhen',
      'failureWhen',
      'logPath',
      'stdout',
      'stderr',
      'shellUsed',
      'unknown',
    ].map((key): [string, unknown] => [
      `excluded task ${key}`,
      withTask({ [key]: 'secret' }),
    ]),
  ])('rejects %s and ignores it without disrupting valid snapshots', (_name, value) => {
    expect(isBackgroundSnapshot(value)).toBe(false);
    const events = createFakeBus();
    const received: BackgroundSnapshot[] = [];
    subscribe(events, BACKGROUND_STATE_CHANNEL, {
      onSnapshot: ({ data }) => received.push(data),
    });
    expect(() =>
      events.emit('thoth:background:state', {
        v: 1,
        source: '@thoth-agents/pi-background-tasks',
        sessionId: 'session-a',
        at: 0,
        data: value,
      }),
    ).not.toThrow();
    publish(events, BACKGROUND_STATE_CHANNEL, {
      source: '@thoth-agents/pi-background-tasks',
      sessionId: 'session-a',
      data: snapshot,
    });
    expect(received).toEqual([snapshot]);
  });
});

describe('background state request contract', () => {
  it('transports an empty request for the envelope session', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    const events = createFakeBus();
    const received: unknown[] = [];
    onRequest(events, BACKGROUND_STATE_REQUEST, {
      sessionId: 'session-a',
      onRequest: (envelope) => received.push(envelope),
    });
    const data: BackgroundStateRequest = {};
    expect(isBackgroundStateRequest(data)).toBe(true);
    expect(isBackgroundStateRequest(Object.create(null))).toBe(true);
    expect(BACKGROUND_STATE_REQUEST.name).toBe(
      'thoth:background:state:request',
    );
    request(events, BACKGROUND_STATE_REQUEST, {
      source: '@thoth-agents/consumer',
      sessionId: 'session-a',
      data,
    });
    request(events, BACKGROUND_STATE_REQUEST, {
      source: '@thoth-agents/consumer',
      sessionId: 'session-b',
      data,
    });
    expect(received).toEqual([
      {
        v: 1,
        source: '@thoth-agents/consumer',
        sessionId: 'session-a',
        at: 100,
        data: {},
      },
    ]);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['primitive', 1],
    ['array', []],
    ['origin in data', { cwd: '/secret' }],
    ['non-enumerable field', Object.defineProperty({}, 'env', { value: {} })],
    ['symbol field', { [Symbol('env')]: {} }],
    ['date', new Date(0)],
    ['map', new Map()],
    ['custom prototype', Object.create({ command: 'secret' })],
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
  ])('rejects %s without throwing or delivering it', (_name, value) => {
    expect(isBackgroundStateRequest(value)).toBe(false);
    const events = createFakeBus();
    const received: unknown[] = [];
    onRequest(events, BACKGROUND_STATE_REQUEST, {
      onRequest: ({ data }) => received.push(data),
    });
    expect(() =>
      events.emit('thoth:background:state:request', {
        v: 1,
        source: '@thoth-agents/consumer',
        sessionId: 'session-a',
        at: 0,
        data: value,
      }),
    ).not.toThrow();
    request(events, BACKGROUND_STATE_REQUEST, {
      source: '@thoth-agents/consumer',
      sessionId: 'session-a',
      data: {},
    });
    expect(received).toEqual([{}]);
  });
});
