import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const key = Symbol.for('thoth.pi-core.animation-clock.v1');
const shared = globalThis as typeof globalThis & Record<symbol, unknown>;
const cleanups: Array<() => void> = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1042);
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  delete shared[key];
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

describe('shared animation clock', () => {
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
    expect(a).toHaveBeenCalledExactlyOnceWith(1101);
    expect(b).toHaveBeenCalledExactlyOnceWith(1101);
    offA();
    offA();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(100);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenLastCalledWith(1201);
    offB();
    offB();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(500);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it.each([
    null,
    { version: 2, listeners: new Set(), timer: undefined },
    { version: 1, listeners: [], timer: undefined },
    { version: 1, listeners: new Set([42]), timer: undefined },
    { version: 1, listeners: new Set(), timer: {} },
    Object.freeze({ version: 1, listeners: new Set(), timer: undefined }),
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
    expect(listener).toHaveBeenCalledExactlyOnceWith(1101);
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
    expect(listener).toHaveBeenCalledExactlyOnceWith(1101);
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
    expect(listener).toHaveBeenCalledExactlyOnceWith(1101);
  });

  it('realigns after a delayed tick rather than adding a recurring delay', async () => {
    const { subscribeAnimationClock } = await import(
      '../src/animation-clock.js'
    );
    const listener = vi.fn();
    cleanups.push(subscribeAnimationClock(listener));
    vi.setSystemTime(1170);
    vi.advanceTimersByTime(59);
    expect(listener).toHaveBeenCalledExactlyOnceWith(1229);
    vi.advanceTimersByTime(72);
    expect(listener.mock.calls).toEqual([[1229], [1301]]);
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
    expect(listener.mock.calls).toEqual([[1101], [1201]]);
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
    expect(added).toHaveBeenCalledExactlyOnceWith(1201);
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
    expect(listener).toHaveBeenCalledExactlyOnceWith(1101);
    second();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(37);
    cleanups.push(subscribeAnimationClock(listener));
    vi.advanceTimersByTime(63);
    expect(listener.mock.calls).toEqual([[1101], [1201]]);
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
