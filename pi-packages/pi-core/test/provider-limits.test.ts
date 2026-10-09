import { afterEach, describe, expect, it } from 'vitest';
import {
  listProviderLimits,
  type ProviderLimitEntry,
  reportProviderLimit,
  subscribeProviderLimits,
} from '../src/index.js';

const registryKey = Symbol.for('thoth.pi-core.provider-limits.v1');
const shared = globalThis as typeof globalThis & Record<symbol, unknown>;
const entry: ProviderLimitEntry = {
  provider: 'claude-bridge',
  window: 'five_hour',
  status: 'allowed_warning',
  utilization: 0.9,
  resetsAt: 20_000,
  observedAt: 10_000,
  windowType: 'five_hour',
  overageInUse: false,
  overageEnabled: true,
  isUsingOverage: false,
  sessionId: 'child-session',
};

afterEach(() => {
  delete shared[registryKey];
});

describe('provider limits', () => {
  it('replaces only the matching provider/window, including delimiter-like keys', () => {
    const otherWindow = { ...entry, window: 'seven_day' };
    const otherProvider = { ...entry, provider: 'other' };
    const compositeA = { ...entry, provider: 'a:b', window: 'c' };
    const compositeB = { ...entry, provider: 'a', window: 'b:c' };
    for (const value of [
      entry,
      otherWindow,
      otherProvider,
      compositeA,
      compositeB,
    ]) {
      expect(reportProviderLimit(value)).toBe(true);
    }
    const replacement = {
      ...entry,
      status: 'rejected' as const,
      sessionId: 'other-child',
      observedAt: 11_000,
    };
    expect(reportProviderLimit(replacement)).toBe(true);
    expect(listProviderLimits(11_000)).toEqual([
      replacement,
      otherWindow,
      otherProvider,
      compositeA,
      compositeB,
    ]);
  });

  it('notifies synchronously with attribution, isolates failures, and disposes idempotently', () => {
    const captured: ProviderLimitEntry[] = [];
    const offBad = subscribeProviderLimits(() => {
      throw new Error('consumer failure');
    });
    const off = subscribeProviderLimits((reported) => {
      expect(listProviderLimits(10_000)).toEqual([entry]);
      captured.push(reported);
    });
    expect(captured).toEqual([]);
    expect(reportProviderLimit(entry)).toBe(true);
    expect(captured).toEqual([entry]);
    expect(reportProviderLimit({ ...entry, extra: true })).toBe(false);
    expect(captured).toEqual([entry]);
    off();
    off();
    offBad();
    reportProviderLimit({ ...entry, sessionId: 'another-session' });
    expect(captured).toEqual([entry]);
  });

  it('keeps each reentrant report attributed even when the same window is replaced', () => {
    const captured: string[] = [];
    subscribeProviderLimits((reported) => {
      captured.push(`first:${reported.sessionId}`);
      if (reported.sessionId === 'child-session') {
        reportProviderLimit({
          ...entry,
          sessionId: 'second-child',
          status: 'rejected',
        });
      }
    });
    subscribeProviderLimits((reported) => {
      captured.push(`second:${reported.sessionId}`);
    });
    expect(reportProviderLimit(entry)).toBe(true);
    expect(captured).toEqual([
      'first:child-session',
      'first:second-child',
      'second:second-child',
      'second:child-session',
    ]);
    expect(listProviderLimits(10_000)).toEqual([
      { ...entry, sessionId: 'second-child', status: 'rejected' },
    ]);
  });

  it('bounds delivery when listeners subscribe or dispose during a report', () => {
    const captured: string[] = [];
    let offSecond = () => {};
    subscribeProviderLimits((reported) => {
      captured.push(`first:${reported.sessionId}`);
      if (reported.sessionId === 'child-session') {
        offSecond();
        subscribeProviderLimits((value) => {
          captured.push(`late:${value.sessionId}`);
        });
        reportProviderLimit({ ...entry, sessionId: 'second-child' });
      }
    });
    offSecond = subscribeProviderLimits((reported) => {
      captured.push(`second:${reported.sessionId}`);
    });
    expect(reportProviderLimit(entry)).toBe(true);
    expect(captured).toEqual([
      'first:child-session',
      'first:second-child',
      'late:second-child',
    ]);
  });

  it.each([
    'allowed',
    'allowed_warning',
    'rejected',
  ] as const)('projects expired %s windows as allowed without utilization, only on read', (status) => {
    const captured: ProviderLimitEntry[] = [];
    subscribeProviderLimits((value) => {
      captured.push(value);
    });
    const observation = { ...entry, status };
    reportProviderLimit(observation);
    reportProviderLimit({ ...entry, window: 'no-reset', resetsAt: undefined });
    expect(listProviderLimits(19_999)[0]).toEqual(observation);
    const expired = listProviderLimits(20_000)[0];
    expect(expired).toEqual({
      provider: 'claude-bridge',
      window: 'five_hour',
      status: 'allowed',
      resetsAt: 20_000,
      observedAt: 10_000,
      windowType: 'five_hour',
      overageInUse: false,
      overageEnabled: true,
      isUsingOverage: false,
      sessionId: 'child-session',
    });
    expect(expired).not.toHaveProperty('utilization');
    expect(listProviderLimits(25_000)[1]).toEqual({
      ...entry,
      window: 'no-reset',
      resetsAt: undefined,
    });
    expect(listProviderLimits(10_000)[0]).toEqual(observation);
    expect(captured).toEqual([
      observation,
      { ...entry, window: 'no-reset', resetsAt: undefined },
    ]);
    expect(listProviderLimits()[0]?.status).toBe('allowed');
  });

  it.each([
    null,
    42,
    {},
    { version: 2, entries: new Map(), listeners: new Set() },
    { version: 1, entries: [], listeners: new Set() },
    { version: 1, entries: new Map(), listeners: [] },
    { version: 1, entries: new Map(), listeners: new Set([42]) },
    {
      version: 1,
      entries: new Map([['foreign', { ...entry, prompt: 'secret' }]]),
      listeners: new Set(),
    },
    {
      version: 1,
      entries: new Map([['wrong-key', entry]]),
      listeners: new Set(),
    },
    Object.defineProperty({}, 'version', {
      get() {
        throw new Error('foreign registry');
      },
    }),
  ])('leaves incompatible registry records untouched (%#)', (foreign) => {
    shared[registryKey] = foreign;
    const captured: ProviderLimitEntry[] = [];
    const off = subscribeProviderLimits((reported) => {
      captured.push(reported);
    });
    expect(listProviderLimits(10_000)).toEqual([]);
    expect(reportProviderLimit(entry)).toBe(false);
    expect(captured).toEqual([]);
    expect(() => {
      off();
      off();
    }).not.toThrow();
    expect(shared[registryKey]).toBe(foreign);
  });

  it('tolerates a throwing global ownership accessor without replacing it', () => {
    const get = () => {
      throw new Error('foreign ownership');
    };
    Object.defineProperty(shared, registryKey, { get, configurable: true });
    expect(listProviderLimits()).toEqual([]);
    expect(reportProviderLimit(entry)).toBe(false);
    const off = subscribeProviderLimits(() => {});
    expect(() => off()).not.toThrow();
    expect(Object.getOwnPropertyDescriptor(shared, registryKey)?.get).toBe(get);
  });

  it('protects observation attribution from reporter, reader, and listener mutation', () => {
    const captured: ProviderLimitEntry[] = [];
    subscribeProviderLimits((reported) => {
      Reflect.set(reported, 'sessionId', 'tampered');
    });
    subscribeProviderLimits((reported) => {
      captured.push(reported);
    });
    const input = { ...entry };
    expect(reportProviderLimit(input)).toBe(true);
    input.sessionId = 'changed-after-report';
    const listed = listProviderLimits(10_000);
    Reflect.set(listed[0] as object, 'status', 'allowed');
    listed.length = 0;
    expect(captured).toEqual([entry]);
    expect(listProviderLimits(10_000)).toEqual([entry]);
  });

  it('gives duplicate callback subscriptions independent disposers', () => {
    const captured: ProviderLimitEntry[] = [];
    const listener = (reported: ProviderLimitEntry) => {
      captured.push(reported);
    };
    const offFirst = subscribeProviderLimits(listener);
    const offSecond = subscribeProviderLimits(listener);
    offFirst();
    offFirst();
    reportProviderLimit(entry);
    expect(captured).toEqual([entry]);
    offSecond();
    reportProviderLimit(entry);
    expect(captured).toEqual([entry]);
  });

  it('reports a complete rate-limit observation through the root entry', () => {
    expect(listProviderLimits(10_000)).toEqual([]);
    expect(reportProviderLimit(entry)).toBe(true);
    expect(listProviderLimits(10_000)).toEqual([entry]);
  });

  it('accepts minimal observations, future window keys, and optional undefined fields', () => {
    const minimal = {
      provider: 'other',
      window: 'future_window',
      status: 'allowed',
      observedAt: 0,
      sessionId: 'root-session',
      utilization: undefined,
    };
    expect(
      reportProviderLimit(Object.assign(Object.create(null), minimal)),
    ).toBe(true);
    expect(listProviderLimits(0)).toEqual([minimal]);
    expect(reportProviderLimit({ ...entry, utilization: 0 })).toBe(true);
    expect(reportProviderLimit({ ...entry, utilization: 1 })).toBe(true);
  });

  it.each([
    null,
    undefined,
    [],
    'limit',
    ...['provider', 'window', 'sessionId'].flatMap((key) => [
      { ...entry, [key]: '' },
      { ...entry, [key]: 42 },
      { ...entry, [key]: undefined },
    ]),
    ...['status'].flatMap((key) =>
      ['warning', null, undefined].map((value) => ({ ...entry, [key]: value })),
    ),
    ...['observedAt', 'resetsAt'].flatMap((key) =>
      [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1000', null].map(
        (value) => ({ ...entry, [key]: value }),
      ),
    ),
    { ...entry, observedAt: undefined },
    ...[-0.1, 1.1, NaN, Infinity, '0.9', null].map((value) => ({
      ...entry,
      utilization: value,
    })),
    { ...entry, windowType: '' },
    { ...entry, windowType: null },
    { ...entry, windowType: 5 },
    ...['overageInUse', 'overageEnabled', 'isUsingOverage'].flatMap((key) =>
      [1, 'true', null].map((value) => ({ ...entry, [key]: value })),
    ),
    { ...entry, prompt: 'must not be retained' },
    { ...entry, [Symbol('unknown')]: true },
    Object.defineProperty({ ...entry }, 'hidden', { value: true }),
    Object.assign(Object.create({ custom: true }), entry),
    Object.defineProperty({ ...entry }, 'provider', {
      get() {
        throw new Error('foreign getter');
      },
    }),
    new Proxy(entry, {
      ownKeys() {
        throw new Error('foreign proxy');
      },
    }),
  ])('ignores malformed observations (%#) without replacing valid state', (invalid) => {
    expect(reportProviderLimit(entry)).toBe(true);
    expect(reportProviderLimit(invalid)).toBe(false);
    expect(listProviderLimits(10_000)).toEqual([entry]);
  });
});
