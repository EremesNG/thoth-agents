import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isSubagentsSnapshot,
  isSubagentsStateRequest,
  isSubagentsUsageRequest,
  isSubagentsUsageSnapshot,
  onRequest,
  publish,
  request,
  SUBAGENTS_STATE_CHANNEL,
  SUBAGENTS_STATE_REQUEST,
  SUBAGENTS_USAGE_CHANNEL,
  SUBAGENTS_USAGE_REQUEST,
  type SubagentsSnapshot,
  type SubagentsStateRequest,
  type SubagentsUsageRequest,
  type SubagentsUsageSnapshot,
  subscribe,
} from '../src/index.js';
import { createFakeBus } from './fake-bus.js';

const snapshot: SubagentsSnapshot = {
  history: [],
  tasks: [
    {
      id: 'queued',
      agent: 'worker',
      mode: 'task',
      status: 'queued',
      createdAt: 0,
    },
    {
      id: 'running',
      agent: 'worker',
      displayName: 'Implement contract',
      mode: 'background',
      status: 'running',
      model: 'provider/model',
      effort: 'max',
      createdAt: 1,
      startedAt: 2,
      lastActivityAt: 3,
      usage: { input: 100, output: 20, cost: 0.05 },
      preview: 'Working',
    },
    {
      id: 'stopping',
      agent: 'worker',
      mode: 'task',
      status: 'stopping',
      createdAt: 1,
    },
    {
      id: 'completed',
      agent: 'worker',
      mode: 'task',
      status: 'completed',
      createdAt: 1,
      endedAt: 4,
    },
    {
      id: 'failed',
      agent: 'worker',
      mode: 'task',
      status: 'failed',
      createdAt: 1,
    },
    {
      id: 'cancelled',
      agent: 'worker',
      mode: 'task',
      status: 'cancelled',
      createdAt: 1,
    },
    {
      id: 'interrupted',
      agent: 'worker',
      mode: 'task',
      status: 'interrupted',
      createdAt: 1,
    },
  ],
  counts: {
    queued: 1,
    running: 1,
    stopping: 1,
    completed: 1,
    failed: 1,
    cancelled: 1,
    interrupted: 1,
  },
  totals: {
    total: 12,
    queued: 1,
    running: 1,
    stopping: 1,
    completed: 6,
    failed: 1,
    cancelled: 1,
    interrupted: 1,
  },
};

function withTask(fields: Record<string, unknown>): unknown {
  return { ...snapshot, tasks: [{ ...snapshot.tasks[1], ...fields }] };
}

function withCounts(fields: Record<string, unknown>): unknown {
  return { ...snapshot, counts: { ...snapshot.counts, ...fields } };
}

function withTotals(fields: Record<string, unknown>): unknown {
  return { ...snapshot, totals: { ...snapshot.totals, ...fields } };
}

afterEach(() => vi.restoreAllMocks());

describe('subagent state contract', () => {
  it('transports a complete lightweight snapshot for the envelope session', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    const events = createFakeBus();
    const raw: unknown[] = [];
    const received: SubagentsSnapshot[] = [];
    events.on('thoth:subagents:state', (value) => raw.push(value));
    subscribe(events, SUBAGENTS_STATE_CHANNEL, {
      sessionId: 'session-a',
      onSnapshot: ({ data }) => received.push(data),
    });
    publish(events, SUBAGENTS_STATE_CHANNEL, {
      sessionId: 'session-a',
      source: '@thoth-agents/pi-subagents',
      data: snapshot,
    });

    expect(isSubagentsSnapshot(snapshot)).toBe(true);
    expect(raw).toEqual([
      {
        v: 2,
        source: '@thoth-agents/pi-subagents',
        sessionId: 'session-a',
        at: 100,
        data: snapshot,
      },
    ]);
    expect(received).toEqual([snapshot]);
  });

  it('accepts zero counts, partial usage and boundary-length previews without count reconciliation', () => {
    const counts = {
      queued: 0,
      running: 0,
      stopping: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      interrupted: 0,
    };
    expect(
      isSubagentsSnapshot({
        tasks: [],
        history: [],
        counts,
        totals: { ...counts, total: 0 },
      }),
    ).toBe(true);
    expect(
      isSubagentsSnapshot(withTask({ usage: {}, preview: 'x'.repeat(800) })),
    ).toBe(true);
    expect(
      isSubagentsSnapshot(
        withTask({
          usage: { cost: 0 },
          startedAt: 0,
          endedAt: Number.MAX_SAFE_INTEGER,
        }),
      ),
    ).toBe(true);
    expect(
      isSubagentsSnapshot(Object.assign(Object.create(null), snapshot)),
    ).toBe(true);
  });

  it.each([
    'off',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ])('accepts %s effort', (effort) => {
    expect(isSubagentsSnapshot(withTask({ effort }))).toBe(true);
  });

  it.each([
    ['null snapshot', null],
    ['primitive snapshot', 'snapshot'],
    ['array snapshot', []],
    ['missing tasks', { ...snapshot, tasks: undefined }],
    ['non-array tasks', { ...snapshot, tasks: {} }],
    ['sparse tasks', { ...snapshot, tasks: Array(1) }],
    ['null task', { ...snapshot, tasks: [null] }],
    ['array task', { ...snapshot, tasks: [[]] }],
    ['empty task', { ...snapshot, tasks: [{}] }],
    ['empty id', withTask({ id: '' })],
    ['numeric id', withTask({ id: 1 })],
    ['missing agent', withTask({ agent: undefined })],
    ['empty agent', withTask({ agent: '' })],
    ['unknown mode', withTask({ mode: 'mixed' })],
    ['unknown status', withTask({ status: 'succeeded' })],
    ['null display name', withTask({ displayName: null })],
    ['numeric model', withTask({ model: 1 })],
    ['unknown effort', withTask({ effort: 'extreme' })],
    ['missing created time', withTask({ createdAt: undefined })],
    ['ISO created time', withTask({ createdAt: '2026-10-09T00:00:00Z' })],
    ['negative started time', withTask({ startedAt: -1 })],
    ['fractional ended time', withTask({ endedAt: 1.5 })],
    ['NaN activity time', withTask({ lastActivityAt: Number.NaN })],
    ['infinite time', withTask({ startedAt: Number.POSITIVE_INFINITY })],
    ['unsafe time', withTask({ startedAt: Number.MAX_SAFE_INTEGER + 1 })],
    ['null optional time', withTask({ endedAt: null })],
    ['null usage', withTask({ usage: null })],
    ['array usage', withTask({ usage: [] })],
    ['negative input tokens', withTask({ usage: { input: -1 } })],
    ['fractional output tokens', withTask({ usage: { output: 0.5 } })],
    [
      'unsafe tokens',
      withTask({ usage: { input: Number.MAX_SAFE_INTEGER + 1 } }),
    ],
    ['negative cost', withTask({ usage: { cost: -0.1 } })],
    ['infinite cost', withTask({ usage: { cost: Number.POSITIVE_INFINITY } })],
    ['NaN cost', withTask({ usage: { cost: Number.NaN } })],
    ['text cost', withTask({ usage: { cost: '1' } })],
    ['oversized preview', withTask({ preview: 'x'.repeat(801) })],
    ['non-string preview', withTask({ preview: ['output'] })],
    ['missing counts', { ...snapshot, counts: undefined }],
    ['array counts', { ...snapshot, counts: [] }],
    ['missing status count', withCounts({ interrupted: undefined })],
    ['negative count', withCounts({ running: -1 })],
    ['fractional count', withCounts({ queued: 0.5 })],
    ['unsafe count', withCounts({ failed: Number.MAX_SAFE_INTEGER + 1 })],
    ['missing totals', { ...snapshot, totals: undefined }],
    ['missing total count', withTotals({ total: undefined })],
    ['missing persisted status count', withTotals({ completed: undefined })],
    ['negative total', withTotals({ total: -1 })],
    ['fractional total', withTotals({ total: 1.5 })],
    ['extra snapshot field', { ...snapshot, sessionId: 'session-a' }],
    ['extra counts field', withCounts({ total: 7 })],
    ['extra totals field', withTotals({ statusesById: new Map() })],
    [
      'extra usage field',
      withTask({ usage: { input: 1, transcript: 'secret' } }),
    ],
    [
      'non-enumerable snapshot field',
      Object.defineProperty({ ...snapshot }, 'prompt', { value: 'secret' }),
    ],
    [
      'symbol task field',
      {
        ...snapshot,
        tasks: [{ ...snapshot.tasks[1], [Symbol('result')]: 'secret' }],
      },
    ],
    [
      'inherited heavy field',
      {
        ...snapshot,
        tasks: [
          Object.assign(Object.create({ prompt: 'secret' }), snapshot.tasks[1]),
        ],
      },
    ],
    [
      'throwing accessor',
      {
        get tasks() {
          throw new Error('unreadable');
        },
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
      'task',
      'prompt',
      'context',
      'transcript',
      'result',
      'thread_snapshot',
      'pending_questions',
      'progress_updates',
      'live_activity',
      'command',
      'env',
      'logPath',
      'unknown',
    ].map((key): [string, unknown] => [
      `excluded task ${key}`,
      withTask({ [key]: 'secret' }),
    ]),
  ])('rejects %s and ignores the payload without disrupting valid snapshots', (_name, value) => {
    const events = createFakeBus();
    const received: SubagentsSnapshot[] = [];
    subscribe(events, SUBAGENTS_STATE_CHANNEL, {
      sessionId: 'session-a',
      onSnapshot: ({ data }) => received.push(data),
    });

    expect(isSubagentsSnapshot(value)).toBe(false);
    expect(() =>
      events.emit('thoth:subagents:state', {
        v: 2,
        source: '@thoth-agents/pi-subagents',
        sessionId: 'session-a',
        at: 0,
        data: value,
      }),
    ).not.toThrow();
    publish(events, SUBAGENTS_STATE_CHANNEL, {
      sessionId: 'session-a',
      source: '@thoth-agents/pi-subagents',
      data: snapshot,
    });
    expect(received).toEqual([snapshot]);
  });
});

describe.each([
  ['state', SUBAGENTS_STATE_REQUEST, isSubagentsStateRequest],
  ['usage', SUBAGENTS_USAGE_REQUEST, isSubagentsUsageRequest],
])('subagent %s request contract', (kind, channel, validate) => {
  it('transports an empty request with session identity only in the envelope', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    const events = createFakeBus();
    const received: unknown[] = [];
    onRequest(events, channel, {
      sessionId: 'session-a',
      onRequest: (envelope) => received.push(envelope),
    });
    const data = {} satisfies SubagentsStateRequest & SubagentsUsageRequest;
    expect(validate(data)).toBe(true);
    expect(validate(Object.create(null))).toBe(true);
    expect(channel.name).toBe(`thoth:subagents:${kind}:request`);
    request(events, channel, {
      source: '@thoth-agents/consumer',
      sessionId: 'session-a',
      data,
    });
    request(events, channel, {
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
    ['session in data', { sessionId: 'session-a' }],
    [
      'non-enumerable field',
      Object.defineProperty({}, 'prompt', { value: 'secret' }),
    ],
    ['symbol field', { [Symbol('prompt')]: 'secret' }],
    ['date', new Date(0)],
    ['map', new Map()],
    ['custom prototype', Object.create({ prompt: 'secret' })],
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
  ])('rejects %s without throwing', (_name, value) => {
    expect(validate(value)).toBe(false);
    const events = createFakeBus();
    const received: unknown[] = [];
    onRequest(events, channel, {
      onRequest: ({ data }) => received.push(data),
    });
    expect(() =>
      events.emit(channel.name, {
        v: 1,
        source: '@thoth-agents/consumer',
        sessionId: 'session-a',
        at: 0,
        data: value,
      }),
    ).not.toThrow();
    request(events, channel, {
      source: '@thoth-agents/consumer',
      sessionId: 'session-a',
      data: {},
    });
    expect(received).toEqual([{}]);
  });
});

describe('subagent usage contract', () => {
  const usage: SubagentsUsageSnapshot = { totalCost: 0.25, runCount: 2 };

  it('transports cumulative usage for the parent envelope session and filters stale envelopes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    const events = createFakeBus();
    const raw: unknown[] = [];
    const received: SubagentsUsageSnapshot[] = [];
    events.on('thoth:subagents:usage', (value) => raw.push(value));
    subscribe(events, SUBAGENTS_USAGE_CHANNEL, {
      sessionId: 'parent',
      onSnapshot: ({ data }) => received.push(data),
    });
    const envelope = {
      v: 1,
      source: '@thoth-agents/pi-subagents',
      sessionId: 'parent',
      at: 0,
      data: usage,
    };
    events.emit('thoth:subagents:usage', { ...envelope, sessionId: 'child' });
    events.emit('thoth:subagents:usage', { ...envelope, v: 2 });
    publish(events, SUBAGENTS_USAGE_CHANNEL, {
      source: '@thoth-agents/pi-subagents',
      sessionId: 'parent',
      data: usage,
    });
    expect(isSubagentsUsageSnapshot({ totalCost: 0, runCount: 0 })).toBe(true);
    expect(isSubagentsUsageSnapshot(usage)).toBe(true);
    expect(raw[2]).toMatchObject(envelope);
    expect(received).toEqual([usage]);
  });

  it.each([
    ['null', null],
    ['array', []],
    ['missing cost', { runCount: 1 }],
    ['negative cost', { totalCost: -1, runCount: 1 }],
    ['infinite cost', { totalCost: Number.POSITIVE_INFINITY, runCount: 1 }],
    ['NaN cost', { totalCost: Number.NaN, runCount: 1 }],
    ['string cost', { totalCost: '1', runCount: 1 }],
    ['missing run count', { totalCost: 1 }],
    ['negative run count', { totalCost: 1, runCount: -1 }],
    ['fractional run count', { totalCost: 1, runCount: 1.5 }],
    [
      'unsafe run count',
      { totalCost: 1, runCount: Number.MAX_SAFE_INTEGER + 1 },
    ],
    ['legacy session field', { ...usage, parentSessionId: 'parent' }],
    ['extra heavy field', { ...usage, result: 'secret' }],
    [
      'non-enumerable field',
      Object.defineProperty({ ...usage }, 'extra', { value: true }),
    ],
    ['symbol field', { ...usage, [Symbol('extra')]: true }],
    [
      'throwing accessor',
      {
        runCount: 1,
        get totalCost() {
          throw new Error('unreadable');
        },
      },
    ],
  ])('rejects %s and ignores malformed usage', (_name, value) => {
    expect(isSubagentsUsageSnapshot(value)).toBe(false);
    const events = createFakeBus();
    const received: SubagentsUsageSnapshot[] = [];
    subscribe(events, SUBAGENTS_USAGE_CHANNEL, {
      onSnapshot: ({ data }) => received.push(data),
    });
    expect(() =>
      events.emit('thoth:subagents:usage', {
        v: 2,
        source: '@thoth-agents/pi-subagents',
        sessionId: 'parent',
        at: 0,
        data: value,
      }),
    ).not.toThrow();
    publish(events, SUBAGENTS_USAGE_CHANNEL, {
      source: '@thoth-agents/pi-subagents',
      sessionId: 'parent',
      data: usage,
    });
    expect(received).toEqual([usage]);
  });
});

it('requires v2 bounded history with the same strict task allow-list', () => {
  expect(SUBAGENTS_STATE_CHANNEL.version).toBe(2);
  expect(
    isSubagentsSnapshot({
      ...snapshot,
      history: Array(100).fill(snapshot.tasks[0]),
    }),
  ).toBe(true);
  expect(
    isSubagentsSnapshot({
      ...snapshot,
      history: Array(101).fill(snapshot.tasks[0]),
    }),
  ).toBe(false);
  expect(
    isSubagentsSnapshot({
      ...snapshot,
      history: [{ ...snapshot.tasks[0], prompt: 'private' }],
    }),
  ).toBe(false);
  expect(
    isSubagentsSnapshot({
      ...snapshot,
      history: [{ ...snapshot.tasks[0], usage: { cost: 1, log: 'private' } }],
    }),
  ).toBe(false);
  expect(isSubagentsSnapshot({ ...snapshot, history: Array(1) })).toBe(false);
  expect(
    isSubagentsSnapshot({
      ...snapshot,
      history: [{ ...snapshot.tasks[0], [Symbol('private')]: 'secret' }],
    }),
  ).toBe(false);
  const { history: _history, ...legacy } = snapshot;
  expect(isSubagentsSnapshot(legacy)).toBe(false);
});
