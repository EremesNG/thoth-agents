import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAnimationCycleSteps,
  isAnimationEffectEnabled,
  setAnimationLevel,
  subscribeAnimationClock,
  subscribeAnimationSteps,
} from '../src/index.js';

const key = Symbol.for('thoth.pi-core.animation-clock.v3');
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
    ['full', [true, true, true]],
    ['reduced', [false, true, true]],
    ['minimal', [false, false, true]],
    ['off', [false, false, false]],
  ] as const)('enables exactly the specified effect kinds at %s without starting a timer', (level, enabled) => {
    const kinds = ['ambient', 'secondary', 'primary'] as const;
    expect(kinds.map((kind) => isAnimationEffectEnabled(kind, level))).toEqual(
      enabled,
    );
    setAnimationLevel(level);
    expect(kinds.map((kind) => isAnimationEffectEnabled(kind))).toEqual(
      enabled,
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['full', 100, 1],
    ['reduced', 100, 1],
    ['minimal', 100, 1],
    ['full', 200, 2],
    ['reduced', 200, 2],
    ['minimal', 200, 2],
    ['full', 1000, 10],
    ['reduced', 1000, 10],
    ['minimal', 1000, 10],
    ['full', 250, 3],
    ['reduced', 149, 1],
    ['minimal', 150, 2],
    ['minimal', 20, 1],
  ] as const)('at %s (%i ms intended) steps every %i ticks without skipping frames', (level, intendedMs, ticksPerStep) => {
    setAnimationLevel(level);
    const onStep = vi.fn();
    const off = subscribeAnimationSteps({
      kind: 'primary',
      intendedMs,
      onStep,
    });
    cleanups.push(off);
    expect(onStep).not.toHaveBeenCalled();
    for (let step = 0; step < 11; step++) {
      for (let tick = 1; tick <= ticksPerStep; tick++) {
        vi.advanceTimersByTime(100);
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
    expect(onStep.mock.calls[0][0].now).toBe(100 * ticksPerStep);
    off();
    off();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['ambient', 'reduced'],
    ['ambient', 'minimal'],
    ['ambient', 'off'],
    ['secondary', 'minimal'],
    ['secondary', 'off'],
    ['primary', 'off'],
  ] as const)('keeps disabled %s at %s static with only an unref’d 1 s refresh and no clock subscription', (kind, level) => {
    setAnimationLevel(level);
    const timeouts = vi.spyOn(globalThis, 'setTimeout');
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const onStep = vi.fn();
    const off = subscribeAnimationSteps({ kind, intendedMs: 100, onStep });
    cleanups.push(off);
    expect(timeouts).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    expect(intervals.mock.results[0].value.hasRef()).toBe(false);
    vi.advanceTimersByTime(999);
    expect(onStep).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1001);
    expect(onStep.mock.calls).toEqual([
      [{ frame: undefined, static: true, now: 1000 }],
      [{ frame: undefined, static: true, now: 2000 }],
    ]);
    expect(timeouts).not.toHaveBeenCalled();
    off();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['ambient', 'full', 'reduced'],
    ['secondary', 'reduced', 'minimal'],
    ['primary', 'minimal', 'off'],
  ] as const)('switches %s live from %s to %s and back, preserving the next frame and resetting the tick wait', (kind, enabled, disabled) => {
    setAnimationLevel(enabled);
    const onStep = vi.fn();
    const off = subscribeAnimationSteps({ kind, intendedMs: 200, onStep });
    cleanups.push(off);
    vi.advanceTimersByTime(300);
    expect(onStep.mock.calls).toEqual([
      [{ frame: 0, static: false, now: 200 }],
    ]);
    setAnimationLevel(disabled);
    vi.advanceTimersByTime(1000);
    expect(onStep.mock.calls).toEqual([
      [{ frame: 0, static: false, now: 200 }],
      [{ frame: undefined, static: true, now: 1300 }],
    ]);
    setAnimationLevel(enabled);
    vi.advanceTimersByTime(199);
    expect(onStep).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(onStep).toHaveBeenLastCalledWith({
      frame: 1,
      static: false,
      now: 1500,
    });
    off();
    setAnimationLevel(disabled);
    setAnimationLevel(enabled);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('runs one shared clock only while an enabled kind is subscribed', () => {
    setAnimationLevel('minimal');
    const timeouts = vi.spyOn(globalThis, 'setTimeout');
    const onDisabled = vi.fn();
    const onEnabled = vi.fn();
    const offDisabled = subscribeAnimationSteps({
      kind: 'secondary',
      intendedMs: 100,
      onStep: onDisabled,
    });
    cleanups.push(offDisabled);
    expect(timeouts).not.toHaveBeenCalled();
    const offEnabled = subscribeAnimationSteps({
      kind: 'primary',
      intendedMs: 100,
      onStep: onEnabled,
    });
    cleanups.push(offEnabled);
    expect(vi.getTimerCount()).toBe(2);
    vi.advanceTimersByTime(100);
    expect(onEnabled).toHaveBeenCalledExactlyOnceWith({
      frame: 0,
      static: false,
      now: 100,
    });
    offEnabled();
    const scheduled = timeouts.mock.calls.length;
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1900);
    expect(timeouts).toHaveBeenCalledTimes(scheduled);
    expect(onDisabled.mock.calls).toEqual([
      [{ frame: undefined, static: true, now: 1000 }],
      [{ frame: undefined, static: true, now: 2000 }],
    ]);
    offDisabled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses only an unref’d 1 s data-refresh timer at off and cleans it up', () => {
    setAnimationLevel('off');
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const ticks = vi.fn();
    cleanups.push(subscribeAnimationClock(ticks));
    const onStep = vi.fn();
    const off = subscribeAnimationSteps({
      kind: 'primary',
      intendedMs: 100,
      onStep,
    });
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
    const off = subscribeAnimationSteps({
      kind: 'primary',
      intendedMs: 200,
      onStep,
    });
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
    vi.advanceTimersByTime(200);
    expect(onStep).toHaveBeenLastCalledWith({
      frame: 1,
      static: false,
      now: 1400,
    });
    setAnimationLevel('reduced');
    vi.advanceTimersByTime(200);
    expect(onStep).toHaveBeenLastCalledWith({
      frame: 2,
      static: false,
      now: 1600,
    });
    off();
    setAnimationLevel('off');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can unsubscribe from its own callback without leaving a clock or level subscription', () => {
    let off = () => {};
    off = subscribeAnimationSteps({
      kind: 'primary',
      intendedMs: 100,
      onStep: () => off(),
    });
    cleanups.push(off);
    vi.advanceTimersByTime(100);
    setAnimationLevel('off');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('divides continuous cycles into evenly spaced steps, with no cycle at off', () => {
    expect(getAnimationCycleSteps(2400, 'full')).toBe(24);
    expect(getAnimationCycleSteps(2400, 'reduced')).toBe(24);
    expect(getAnimationCycleSteps(2400, 'minimal')).toBe(24);
    expect(getAnimationCycleSteps(2400, 'off')).toBeUndefined();
    expect(getAnimationCycleSteps(20, 'minimal')).toBe(1);
    setAnimationLevel('minimal');
    expect(getAnimationCycleSteps(2400)).toBe(24);
  });
});
