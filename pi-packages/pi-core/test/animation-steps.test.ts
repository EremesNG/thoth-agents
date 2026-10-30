import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAnimationCycleSteps,
  setAnimationLevel,
  subscribeAnimationClock,
  subscribeAnimationSteps,
} from '../src/index.js';

const key = Symbol.for('thoth.pi-core.animation-clock.v2');
const shared = globalThis as typeof globalThis & Record<symbol, unknown>;
const cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  delete shared[key];
  expect(vi.getTimerCount()).toBe(0);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('animation steps', () => {
  it.each([
    ['full', 100, 100, 1],
    ['reduced', 200, 100, 1],
    ['minimal', 500, 100, 1],
    ['full', 100, 200, 2],
    ['reduced', 200, 200, 1],
    ['minimal', 500, 200, 1],
    ['full', 100, 1000, 10],
    ['reduced', 200, 1000, 5],
    ['minimal', 500, 1000, 2],
    ['full', 100, 250, 3],
  ] as const)('at %s (%i ms clock, %i ms intended) steps every %i ticks without skipping frames', (level, period, intendedMs, ticksPerStep) => {
    setAnimationLevel(level);
    const onStep = vi.fn();
    const off = subscribeAnimationSteps({ intendedMs, onStep });
    cleanups.push(off);
    expect(onStep).not.toHaveBeenCalled();
    for (let step = 0; step < 11; step++) {
      for (let tick = 1; tick <= ticksPerStep; tick++) {
        vi.advanceTimersByTime(period);
        expect(onStep).toHaveBeenCalledTimes(
          step + (tick === ticksPerStep ? 1 : 0),
        );
      }
    }
    expect(onStep.mock.calls.map(([step]) => step.frame)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(onStep.mock.calls.every(([step]) => step.static === false)).toBe(
      true,
    );
    expect(onStep.mock.calls[0][0].now).toBe(period * ticksPerStep);
    off();
    off();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses only an unref’d 1 s data-refresh timer at off and cleans it up', () => {
    setAnimationLevel('off');
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const ticks = vi.fn();
    cleanups.push(subscribeAnimationClock(ticks));
    const onStep = vi.fn();
    const off = subscribeAnimationSteps({ intendedMs: 100, onStep });
    cleanups.push(off);
    expect(vi.getTimerCount()).toBe(1);
    expect(intervals.mock.results[0].value.hasRef()).toBe(false);
    vi.advanceTimersByTime(999);
    expect(onStep).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1001);
    expect(onStep.mock.calls).toEqual([
      [{ frame: undefined, static: true, now: 1000 }],
      [{ frame: undefined, static: true, now: 2000 }],
    ]);
    expect(ticks).not.toHaveBeenCalled();
    off();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('switches timers immediately on level changes, preserving the next frame across off', () => {
    const onStep = vi.fn();
    const off = subscribeAnimationSteps({ intendedMs: 200, onStep });
    cleanups.push(off);
    vi.advanceTimersByTime(200);
    expect(onStep).toHaveBeenLastCalledWith({
      frame: 0,
      static: false,
      now: 200,
    });
    setAnimationLevel('off');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(onStep).toHaveBeenLastCalledWith({
      frame: undefined,
      static: true,
      now: 1200,
    });
    setAnimationLevel('minimal');
    vi.advanceTimersByTime(301);
    expect(onStep).toHaveBeenLastCalledWith({
      frame: 1,
      static: false,
      now: 1501,
    });
    setAnimationLevel('reduced');
    vi.advanceTimersByTime(100);
    expect(onStep).toHaveBeenLastCalledWith({
      frame: 2,
      static: false,
      now: 1601,
    });
    off();
    setAnimationLevel('off');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can unsubscribe from its own callback without leaving a clock or level subscription', () => {
    let off = () => {};
    off = subscribeAnimationSteps({ intendedMs: 100, onStep: () => off() });
    cleanups.push(off);
    vi.advanceTimersByTime(100);
    setAnimationLevel('off');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('divides continuous cycles into evenly spaced steps, with no cycle at off', () => {
    expect(getAnimationCycleSteps(2400, 'full')).toBe(24);
    expect(getAnimationCycleSteps(2400, 'reduced')).toBe(12);
    expect(getAnimationCycleSteps(2400, 'minimal')).toBe(5);
    expect(getAnimationCycleSteps(2400, 'off')).toBeUndefined();
    expect(getAnimationCycleSteps(20, 'minimal')).toBe(1);
    setAnimationLevel('minimal');
    expect(getAnimationCycleSteps(2400)).toBe(5);
  });
});
