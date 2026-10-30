import {
  type AnimationLevel,
  getAnimationPeriodMs,
  subscribeAnimationClock,
  subscribeAnimationLevel,
} from './animation-clock.js';

export interface AnimationStep {
  frame: number | undefined;
  static: boolean;
  now: number;
}

export interface AnimationStepsOptions {
  intendedMs: number;
  onStep(step: AnimationStep): void;
}

/** Evenly spaced continuous-effect steps; undefined means static at off. */
export function getAnimationCycleSteps(
  cycleMs: number,
  level?: AnimationLevel,
): number | undefined {
  const period = getAnimationPeriodMs(level);
  return period === undefined
    ? undefined
    : Math.max(1, Math.round(cycleMs / period));
}

/**
 * No immediate callback. Animated frames start at 0 and advance by exactly one
 * every max(1, round(intendedMs / periodMs)) ticks, never from wall-clock time.
 * Level changes immediately reset the tick wait and switch scheduling, preserving
 * the next frame. At off only an unref'd 1000 ms static data-refresh timer runs.
 * Subscribe to level changes separately when a surface must also repaint at once.
 */
export function subscribeAnimationSteps({
  intendedMs,
  onStep,
}: AnimationStepsOptions): () => void {
  let frame = 0;
  let removeClock: (() => void) | undefined;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;

  function stop(): void {
    removeClock?.();
    removeClock = undefined;
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }

  function schedule(): void {
    stop();
    const period = getAnimationPeriodMs();
    if (period === undefined) {
      refreshTimer = setInterval(() => {
        onStep({ frame: undefined, static: true, now: Date.now() });
      }, 1000);
      refreshTimer.unref?.();
      return;
    }
    const ticksPerStep = Math.max(1, Math.round(intendedMs / period));
    let ticks = 0;
    removeClock = subscribeAnimationClock((now) => {
      if (++ticks < ticksPerStep) return;
      ticks = 0;
      onStep({ frame: frame++, static: false, now });
    });
  }

  const removeLevel = subscribeAnimationLevel(schedule);
  schedule();
  return () => {
    removeLevel();
    stop();
  };
}
