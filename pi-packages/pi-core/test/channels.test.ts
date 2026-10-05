import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defineChannel,
  onRequest,
  publish,
  request,
  subscribe,
  type ThothEnvelope,
} from '../src/index.js';
import { createFakeBus } from './fake-bus.js';

type CountSnapshot = { count: number };
const countChannel = defineChannel<CountSnapshot>({
  name: 'thoth:test:state',
  version: 3,
  validate: (value): value is CountSnapshot =>
    typeof value === 'object' &&
    value !== null &&
    'count' in value &&
    typeof value.count === 'number',
});

type CountRequest = { includeCount: boolean };
const countRequestChannel = defineChannel<CountRequest>({
  name: 'thoth:test:state:request',
  version: 1,
  validate: (value): value is CountRequest =>
    typeof value === 'object' &&
    value !== null &&
    'includeCount' in value &&
    typeof value.includeCount === 'boolean',
});

const requestEnvelope: ThothEnvelope<CountRequest> = {
  v: 1,
  source: '@thoth-agents/consumer',
  sessionId: 'session-a',
  at: 1_740_000_000_000,
  data: { includeCount: true },
};

const envelope: ThothEnvelope<CountSnapshot> = {
  v: 3,
  source: '@thoth-agents/example',
  sessionId: 'session-a',
  at: 1_740_000_000_000,
  data: { count: 2 },
};

afterEach(() => vi.restoreAllMocks());

describe('versioned event channels', () => {
  it('publishes a complete envelope on the defined channel with a millisecond timestamp', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_740_000_000_000);
    const events = createFakeBus();
    const received: unknown[] = [];
    events.on('thoth:test:state', (value) => received.push(value));

    publish(events, countChannel, {
      sessionId: 'session-a',
      source: '@thoth-agents/example',
      data: { count: 2 },
    });

    expect(received).toEqual([envelope]);
  });

  it('delivers typed envelopes until the subscriber unsubscribes', () => {
    const events = createFakeBus();
    const received: ThothEnvelope<CountSnapshot>[] = [];
    const off = subscribe(events, countChannel, {
      onSnapshot: (snapshot) => received.push(snapshot),
    });

    events.emit('thoth:test:state', envelope);
    events.emit('thoth:test:state', { ...envelope, sessionId: 'session-b' });
    off();
    events.emit('thoth:test:state', { ...envelope, data: { count: 8 } });

    expect(received).toEqual([
      envelope,
      { ...envelope, sessionId: 'session-b' },
    ]);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['primitive', 'snapshot'],
    ['array', []],
    ['missing envelope', {}],
    ['unsupported version', { ...envelope, v: 4 }],
    ['string version', { ...envelope, v: '3' }],
    ['foreign session', { ...envelope, sessionId: 'session-b' }],
    ['missing session', { ...envelope, sessionId: undefined }],
    ['empty session', { ...envelope, sessionId: '' }],
    ['non-string session', { ...envelope, sessionId: 1 }],
    ['missing source', { ...envelope, source: undefined }],
    ['empty source', { ...envelope, source: '' }],
    ['non-string source', { ...envelope, source: 1 }],
    ['missing timestamp', { ...envelope, at: undefined }],
    ['string timestamp', { ...envelope, at: '1740000000000' }],
    ['negative timestamp', { ...envelope, at: -1 }],
    ['NaN timestamp', { ...envelope, at: Number.NaN }],
    ['infinite timestamp', { ...envelope, at: Number.POSITIVE_INFINITY }],
    ['missing payload', { ...envelope, data: undefined }],
    ['invalid payload', { ...envelope, data: { count: '2' } }],
  ])('ignores %s without disrupting subsequent snapshots', (_name, value) => {
    const events = createFakeBus();
    const received: ThothEnvelope<CountSnapshot>[] = [];
    subscribe(events, countChannel, {
      sessionId: 'session-a',
      onSnapshot: (snapshot) => received.push(snapshot),
    });

    expect(() => events.emit('thoth:test:state', value)).not.toThrow();
    events.emit('thoth:test:state', envelope);

    expect(received).toEqual([envelope]);
  });

  it('ignores validation exceptions and unreadable envelopes without swallowing consumer errors', () => {
    const events = createFakeBus();
    const received: ThothEnvelope<CountSnapshot>[] = [];
    const fragileChannel = defineChannel<CountSnapshot>({
      ...countChannel,
      validate(value): value is CountSnapshot {
        if (value === 'unreadable') throw new Error('invalid payload');
        return countChannel.validate(value);
      },
    });
    const off = subscribe(events, fragileChannel, {
      onSnapshot: (snapshot) => received.push(snapshot),
    });
    const unreadableEnvelope = Object.defineProperty({ ...envelope }, 'v', {
      get() {
        throw new Error('invalid envelope');
      },
    });

    expect(() =>
      events.emit('thoth:test:state', { ...envelope, data: 'unreadable' }),
    ).not.toThrow();
    expect(() =>
      events.emit('thoth:test:state', unreadableEnvelope),
    ).not.toThrow();
    events.emit('thoth:test:state', envelope);
    expect(received).toEqual([envelope]);
    off();

    subscribe(events, countChannel, {
      onSnapshot() {
        throw new Error('consumer failure');
      },
    });
    expect(() => events.emit('thoth:test:state', envelope)).toThrow(
      'consumer failure',
    );
  });

  it('receives synchronous request responses and later full snapshots for its session', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_740_000_000_000);
    const events = createFakeBus();
    const requests: unknown[] = [];
    events.on('thoth:test:state:request', (value) => requests.push(value));
    const offRequest = onRequest(events, countRequestChannel, {
      sessionId: 'session-a',
      onRequest: ({ sessionId, data }) => {
        if (!data.includeCount) return;
        publish(events, countChannel, {
          sessionId,
          source: '@thoth-agents/example',
          data: { count: 2 },
        });
      },
    });
    const received: ThothEnvelope<CountSnapshot>[] = [];
    subscribe(events, countChannel, {
      sessionId: 'session-a',
      onSnapshot: (snapshot) => received.push(snapshot),
    });

    request(events, countRequestChannel, {
      sessionId: 'session-b',
      source: '@thoth-agents/consumer',
      data: { includeCount: true },
    });
    request(events, countRequestChannel, {
      sessionId: 'session-a',
      source: '@thoth-agents/consumer',
      data: { includeCount: true },
    });
    publish(events, countChannel, {
      sessionId: 'session-a',
      source: '@thoth-agents/example',
      data: { count: 8 },
    });
    offRequest();
    request(events, countRequestChannel, {
      sessionId: 'session-a',
      source: '@thoth-agents/consumer',
      data: { includeCount: true },
    });

    expect(requests).toEqual([
      { ...requestEnvelope, sessionId: 'session-b' },
      requestEnvelope,
      requestEnvelope,
    ]);
    expect(received).toEqual([envelope, { ...envelope, data: { count: 8 } }]);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['primitive', 'session-a'],
    ['array', ['session-a']],
    ['missing envelope', {}],
    ['legacy unversioned request', { sessionId: 'session-a' }],
    ['unsupported version', { ...requestEnvelope, v: 999 }],
    ['missing version', { ...requestEnvelope, v: undefined }],
    ['string version', { ...requestEnvelope, v: '1' }],
    ['foreign session', { ...requestEnvelope, sessionId: 'session-b' }],
    ['missing session', { ...requestEnvelope, sessionId: undefined }],
    ['empty session', { ...requestEnvelope, sessionId: '' }],
    ['non-string session', { ...requestEnvelope, sessionId: 1 }],
    ['null session', { ...requestEnvelope, sessionId: null }],
    ['missing source', { ...requestEnvelope, source: undefined }],
    ['empty source', { ...requestEnvelope, source: '' }],
    ['non-string source', { ...requestEnvelope, source: 1 }],
    ['missing timestamp', { ...requestEnvelope, at: undefined }],
    ['string timestamp', { ...requestEnvelope, at: '1740000000000' }],
    ['negative timestamp', { ...requestEnvelope, at: -1 }],
    ['NaN timestamp', { ...requestEnvelope, at: Number.NaN }],
    [
      'infinite timestamp',
      { ...requestEnvelope, at: Number.POSITIVE_INFINITY },
    ],
    ['missing payload', { ...requestEnvelope, data: undefined }],
    ['invalid payload', { ...requestEnvelope, data: { includeCount: 'true' } }],
    [
      'throwing accessor',
      {
        ...requestEnvelope,
        get sessionId() {
          throw new Error('unreadable');
        },
      },
    ],
  ])('ignores %s requests without disrupting later valid requests', (_name, value) => {
    const events = createFakeBus();
    const received: ThothEnvelope<CountRequest>[] = [];
    onRequest(events, countRequestChannel, {
      sessionId: 'session-a',
      onRequest: (request) => received.push(request),
    });

    expect(() => events.emit('thoth:test:state:request', value)).not.toThrow();
    events.emit('thoth:test:state:request', requestEnvelope);

    expect(received).toEqual([requestEnvelope]);
  });

  it('ignores throwing request validators without hiding errors in request handlers', () => {
    const events = createFakeBus();
    const received: ThothEnvelope<CountRequest>[] = [];
    const fragileChannel = defineChannel<CountRequest>({
      ...countRequestChannel,
      validate(value): value is CountRequest {
        if (value === 'unreadable') throw new Error('invalid request');
        return countRequestChannel.validate(value);
      },
    });
    const off = onRequest(events, fragileChannel, {
      onRequest: (request) => received.push(request),
    });
    expect(() =>
      events.emit('thoth:test:state:request', {
        ...requestEnvelope,
        data: 'unreadable',
      }),
    ).not.toThrow();
    events.emit('thoth:test:state:request', requestEnvelope);
    events.emit('thoth:test:state:request', {
      ...requestEnvelope,
      sessionId: 'session-b',
    });
    expect(received).toEqual([
      requestEnvelope,
      { ...requestEnvelope, sessionId: 'session-b' },
    ]);
    off();

    onRequest(events, countRequestChannel, {
      onRequest() {
        throw new Error('producer failure');
      },
    });

    expect(() =>
      request(events, countRequestChannel, {
        sessionId: 'session-a',
        source: '@thoth-agents/consumer',
        data: { includeCount: true },
      }),
    ).toThrow('producer failure');
  });
});
