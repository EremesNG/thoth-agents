import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const key = Symbol.for('thoth.pi-core.animation-clock.v2');
const legacyKey = Symbol.for('thoth.pi-core.animation-clock.v1');
const shared = globalThis as typeof globalThis & Record<symbol, unknown>;
const cleanups: Array<() => void> = [];

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(1042);
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  delete shared[key];
  delete shared[legacyKey];
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

describe('shared animation clock', () => {
  it('shares levels across copies and immediately realigns, pauses and resumes without resetting ticks', async () => {
    const first = await import('../src/index.js');
    vi.resetModules();
    const second = await import('../src/index.js');
    const levels = vi.fn();
    const offLevel = first.subscribeAnimationLevel(levels);
    cleanups.push(offLevel);
    expect(vi.getTimerCount()).toBe(0);
    const ticks = vi.fn();
    cleanups.push(second.subscribeAnimationClock(ticks));
    second.setAnimationLevel('reduced');
    expect(first.getAnimationLevel()).toBe('reduced');
    second.setAnimationLevel('reduced');
    expect(levels.mock.calls).toEqual([['reduced']]);
    vi.advanceTimersByTime(159);
    expect(ticks.mock.calls).toEqual([[1201, 1]]);
    first.setAnimationLevel('minimal');
    vi.advanceTimersByTime(299);
    expect(ticks).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(ticks).toHaveBeenLastCalledWith(1501, 2);
    second.setAnimationLevel('off');
    expect(first.getAnimationPeriodMs()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(ticks).toHaveBeenCalledTimes(2);
    second.setAnimationLevel('full');
    vi.advanceTimersByTime(100);
    expect(ticks).toHaveBeenLastCalledWith(2601, 3);
    expect(levels.mock.calls).toEqual([
      ['reduced'],
      ['minimal'],
      ['off'],
      ['full'],
    ]);
    offLevel();
    offLevel();
    first.setAnimationLevel('off');
    expect(levels).toHaveBeenCalledTimes(4);
  });

  it('starts no timer for level listeners, empty clocks or clock subscribers at off', async () => {
    const clock = await import('../src/index.js');
    const listener = vi.fn();
    cleanups.push(clock.subscribeAnimationLevel(listener));
    clock.setAnimationLevel('off');
    cleanups.push(clock.subscribeAnimationClock(listener));
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(listener.mock.calls).toEqual([['off']]);
  });

  it.each([
    'legacy first',
    'v2 first',
  ])('leaves a live v1 clock untouched (%s)', async (order) => {
    const ticksV1 = vi.fn();
    const ticksV2 = vi.fn();
    const legacy = async () => {
      const { subscribeAnimationClock } = await import(
        './fixtures/animation-clock-v1.js'
      );
      const off = subscribeAnimationClock(ticksV1);
      cleanups.push(off);
      return off;
    };
    const modern = async () => {
      const clock = await import('../src/index.js');
      const off = clock.subscribeAnimationClock(ticksV2);
      cleanups.push(off);
      return { clock, off };
    };
    const [offV1, { clock, off: offV2 }] =
      order === 'legacy first'
        ? [await legacy(), await modern()]
        : await (async () => {
            const v2 = await modern();
            return [await legacy(), v2] as const;
          })();
    const legacyRecord = shared[legacyKey];
    expect(vi.getTimerCount()).toBe(2);
    vi.advanceTimersByTime(59);
    expect(ticksV1.mock.calls).toEqual([[1101]]);
    expect(ticksV2.mock.calls).toEqual([[1101, 1]]);
    clock.setAnimationLevel('minimal');
    vi.advanceTimersByTime(400);
    expect(ticksV1.mock.calls).toEqual([
      [1101],
      [1201],
      [1301],
      [1401],
      [1501],
    ]);
    expect(ticksV2.mock.calls).toEqual([
      [1101, 1],
      [1501, 2],
    ]);
    clock.setAnimationLevel('off');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(200);
    expect(ticksV1).toHaveBeenLastCalledWith(1701);
    expect(ticksV2).toHaveBeenCalledTimes(2);
    expect(shared[legacyKey]).toBe(legacyRecord);
    offV1();
    expect(vi.getTimerCount()).toBe(0);
    clock.setAnimationLevel('reduced');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(100);
    expect(ticksV2).toHaveBeenLastCalledWith(1801, 3);
    offV2();
    expect(vi.getTimerCount()).toBe(0);
    expect(ticksV1).toHaveBeenCalledTimes(7);
  });

  it('does not read a legacy registry even when its accessor throws', async () => {
    const legacyRead = vi.fn(() => {
      throw new Error('legacy registry must not be read');
    });
    Object.defineProperty(shared, legacyKey, {
      configurable: true,
      get: legacyRead,
    });
    const clock = await import('../src/index.js');
    cleanups.push(clock.subscribeAnimationClock(vi.fn()));
    clock.setAnimationLevel('minimal');
    clock.setAnimationLevel('off');
    expect(legacyRead).not.toHaveBeenCalled();
  });

  it('isolates throwing level listeners and removes duplicate callbacks independently', async () => {
    const clock = await import('../src/index.js');
    const listener = vi.fn();
    cleanups.push(
      clock.subscribeAnimationLevel(() => {
        throw new Error('owner');
      }),
    );
    const off = clock.subscribeAnimationLevel(listener);
    cleanups.push(off, clock.subscribeAnimationLevel(listener));
    off();
    expect(() => clock.setAnimationLevel('off')).not.toThrow();
    expect(listener.mock.calls).toEqual([['off']]);
  });

  it.each([
    ['full', 100, 1101],
    ['reduced', 200, 1201],
    ['minimal', 500, 1501],
  ] as const)('ticks at %s boundaries with consecutive counters', async (level, period, firstAt) => {
    const clock = await import('../src/animation-clock.js');
    expect(clock.getAnimationLevel()).toBe('full');
    clock.setAnimationLevel(level);
    expect(clock.getAnimationPeriodMs()).toBe(period);
    expect(vi.getTimerCount()).toBe(0);
    const listener = vi.fn();
    cleanups.push(clock.subscribeAnimationClock(listener));
    vi.advanceTimersByTime(firstAt - 1042 - 1);
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1 + period * 2);
    expect(listener.mock.calls).toEqual([
      [firstAt, 1],
      [firstAt + period, 2],
      [firstAt + period * 2, 3],
    ]);
  });

  it('ticks within 100 ms of a boundary-aligned subscription and advances the frame on every tick', async () => {
    vi.setSystemTime(1000);
    const { subscribeAnimationClock } = await import(
      '../src/animation-clock.js'
    );
    const ticks: number[] = [];
    cleanups.push(subscribeAnimationClock((now) => ticks.push(now)));
    expect(ticks).toEqual([]);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(99);
    expect(ticks).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(ticks).toEqual([1100]);
    vi.advanceTimersByTime(200);
    expect(ticks).toEqual([1100, 1200, 1300]);
    expect(ticks.map((now) => Math.floor(now / 100))).toEqual([11, 12, 13]);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('shares one timer and one timestamp across separately loaded public APIs, stopping after the last unsubscribe', async () => {
    const first = await import('../src/index.js');
    vi.resetModules();
    const second = await import('../src/index.js');
    expect(first.subscribeAnimationClock).not.toBe(
      second.subscribeAnimationClock,
    );
    const a = vi.fn();
    const b = vi.fn();
    const offA = first.subscribeAnimationClock(a);
    cleanups.push(offA);
    vi.advanceTimersByTime(20);
    const offB = second.subscribeAnimationClock(b);
    cleanups.push(offB);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(39);
    expect(a).toHaveBeenCalledExactlyOnceWith(1101, 1);
    expect(b).toHaveBeenCalledExactlyOnceWith(1101, 1);
    offA();
    offA();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(100);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenLastCalledWith(1201, 2);
    offB();
    offB();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(500);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it.each([
    null,
    { version: 1, listeners: new Set(), timer: undefined },
    ...[
      { level: 'invalid' },
      { tick: -1 },
      { tick: 1.5 },
      { listeners: [] },
      { listeners: new Set([42]) },
      { levelListeners: new Set([42]) },
      { timer: {} },
    ].map((override) => ({
      version: 2,
      level: 'full',
      tick: 0,
      listeners: new Set(),
      levelListeners: new Set(),
      timer: undefined,
      ...override,
    })),
    Object.freeze({
      version: 2,
      level: 'full',
      tick: 0,
      listeners: new Set(),
      levelListeners: new Set(),
      timer: undefined,
    }),
  ])('uses a private clock without replacing an incompatible record: %j', async (foreign) => {
    shared[key] = foreign;
    const originalTimer = foreign?.timer;
    const originalListeners =
      foreign && foreign.listeners instanceof Set
        ? [...foreign.listeners]
        : undefined;
    const { subscribeAnimationClock } = await import(
      '../src/animation-clock.js'
    );
    const listener = vi.fn();
    const off = subscribeAnimationClock(listener);
    cleanups.push(off);
    expect(shared[key]).toBe(foreign);
    expect(foreign?.timer).toBe(originalTimer);
    if (foreign && foreign.listeners instanceof Set)
      expect([...foreign.listeners]).toEqual(originalListeners);
    vi.advanceTimersByTime(59);
    expect(listener).toHaveBeenCalledExactlyOnceWith(1101, 1);
    off();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'throwing accessor',
    'read-only slot',
  ])('falls back when the global registry has a %s', async (kind) => {
    Object.defineProperty(
      shared,
      key,
      kind === 'throwing accessor'
        ? {
            configurable: true,
            get() {
              throw new Error('foreign registry');
            },
          }
        : { configurable: true, writable: false, value: undefined },
    );
    const { subscribeAnimationClock } = await import(
      '../src/animation-clock.js'
    );
    const listener = vi.fn();
    const off = subscribeAnimationClock(listener);
    cleanups.push(off);
    vi.advanceTimersByTime(59);
    expect(listener).toHaveBeenCalledExactlyOnceWith(1101, 1);
    off();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('captures one timestamp even if an earlier listener advances wall-clock time', async () => {
    const { subscribeAnimationClock } = await import(
      '../src/animation-clock.js'
    );
    const listener = vi.fn();
    cleanups.push(
      subscribeAnimationClock(() => vi.setSystemTime(1142)),
      subscribeAnimationClock(listener),
    );
    vi.advanceTimersByTime(59);
    expect(listener).toHaveBeenCalledExactlyOnceWith(1101, 1);
  });

  it('realigns after a delayed tick rather than adding a recurring delay', async () => {
    const { subscribeAnimationClock } = await import(
      '../src/animation-clock.js'
    );
    const listener = vi.fn();
    cleanups.push(subscribeAnimationClock(listener));
    vi.setSystemTime(1170);
    vi.advanceTimersByTime(59);
    expect(listener).toHaveBeenCalledExactlyOnceWith(1229, 1);
    vi.advanceTimersByTime(72);
    expect(listener.mock.calls).toEqual([
      [1229, 1],
      [1301, 2],
    ]);
  });

  it('isolates a throwing subscriber without skipping listeners or future ticks', async () => {
    const { subscribeAnimationClock } = await import(
      '../src/animation-clock.js'
    );
    const listener = vi.fn();
    cleanups.push(
      subscribeAnimationClock(() => {
        throw new Error('subscriber failed');
      }),
      subscribeAnimationClock(listener),
    );
    expect(() => vi.advanceTimersByTime(159)).not.toThrow();
    expect(listener.mock.calls).toEqual([
      [1101, 1],
      [1201, 2],
    ]);
  });

  it('handles removing and adding subscribers during a tick, deferring new listeners until the next tick', async () => {
    const { subscribeAnimationClock } = await import(
      '../src/animation-clock.js'
    );
    const removed = vi.fn();
    const added = vi.fn();
    let offFirst = () => {};
    let offRemoved = () => {};
    offFirst = subscribeAnimationClock(() => {
      offFirst();
      offRemoved();
      cleanups.push(subscribeAnimationClock(added));
    });
    offRemoved = subscribeAnimationClock(removed);
    cleanups.push(offFirst, offRemoved);
    vi.advanceTimersByTime(59);
    expect(removed).not.toHaveBeenCalled();
    expect(added).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(100);
    expect(added).toHaveBeenCalledExactlyOnceWith(1201, 2);
  });

  it('owns subscriptions independently even for the same callback and can restart after becoming empty', async () => {
    const { subscribeAnimationClock } = await import(
      '../src/animation-clock.js'
    );
    const listener = vi.fn();
    const first = subscribeAnimationClock(listener);
    const second = subscribeAnimationClock(listener);
    cleanups.push(first, second);
    first();
    first();
    vi.advanceTimersByTime(59);
    expect(listener).toHaveBeenCalledExactlyOnceWith(1101, 1);
    second();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(37);
    cleanups.push(subscribeAnimationClock(listener));
    vi.advanceTimersByTime(63);
    expect(listener.mock.calls).toEqual([
      [1101, 1],
      [1201, 2],
    ]);
  });

  it('advances frames just after wall-clock boundaries without drifting from subscription time', async () => {
    const { subscribeAnimationClock } = await import(
      '../src/animation-clock.js'
    );
    const ticks: number[] = [];
    cleanups.push(subscribeAnimationClock((now) => ticks.push(now)));
    expect(ticks).toEqual([]);
    vi.advanceTimersByTime(58);
    expect(ticks).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(ticks).toEqual([1101]);
    vi.advanceTimersByTime(200);
    expect(ticks).toEqual([1101, 1201, 1301]);
    expect(ticks.map((now) => Math.floor(now / 100))).toEqual([11, 12, 13]);
  });
});
