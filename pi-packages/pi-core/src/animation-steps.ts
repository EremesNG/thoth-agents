import {
  type AnimationEffectKind,
  type AnimationLevel,
  getAnimationPeriodMs,
  isAnimationEffectEnabled,
  subscribeAnimationClock,
  subscribeAnimationLevel,
} from './animation-clock.js';

export interface AnimationStep {
  frame: number | undefined;
  static: boolean;
  now: number;
}

export interface AnimationStepsOptions {
  kind: AnimationEffectKind;
  intendedMs: number;
  onStep(step: AnimationStep): void;
}

/** Clock steps per cycle; check effect enablement separately. Undefined at off. */
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
 * every max(1, round(intendedMs / 100)) ticks, never from wall-clock time.
 * Level changes immediately reset the tick wait and switch scheduling, preserving
 * the next frame. A disabled kind uses only an unref'd 1000 ms static refresh.
 * Subscribe to level changes separately when a surface must also repaint at once.
 */
export function subscribeAnimationSteps({
  kind,
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
    if (!isAnimationEffectEnabled(kind)) {
      refreshTimer = setInterval(() => {
        onStep({ frame: undefined, static: true, now: Date.now() });
      }, 1000);
      refreshTimer.unref?.();
      return;
    }
    const ticksPerStep = Math.max(1, Math.round(intendedMs / 100));
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
