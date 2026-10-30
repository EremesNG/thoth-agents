export type AnimationLevel = 'full' | 'reduced' | 'minimal' | 'off';
export type AnimationListener = (now: number, tick: number) => void;
export type AnimationLevelListener = (level: AnimationLevel) => void;

interface AnimationClock {
  version: 2;
  level: AnimationLevel;
  tick: number;
  listeners: Set<AnimationListener>;
  levelListeners: Set<AnimationLevelListener>;
  timer: ReturnType<typeof setTimeout> | undefined;
}

// Never inspect or mutate v1: its scheduling closure belongs to legacy copies.
const registryKey = Symbol.for('thoth.pi-core.animation-clock.v2');
const shared = globalThis as typeof globalThis & { [registryKey]?: unknown };
const localClock = createClock();

function createClock(): AnimationClock {
  return {
    version: 2,
    level: 'full',
    tick: 0,
    listeners: new Set(),
    levelListeners: new Set(),
    timer: undefined,
  };
}

function isAnimationLevel(level: unknown): level is AnimationLevel {
  return (
    level === 'full' ||
    level === 'reduced' ||
    level === 'minimal' ||
    level === 'off'
  );
}

function animationClock(): AnimationClock {
  try {
    if (shared[registryKey] === undefined) shared[registryKey] = createClock();
    const clock = shared[registryKey] as AnimationClock | null;
    if (
      clock?.version === 2 &&
      isAnimationLevel(clock.level) &&
      Number.isSafeInteger(clock.tick) &&
      clock.tick >= 0 &&
      [clock.listeners, clock.levelListeners].every(
        (listeners) =>
          listeners instanceof Set &&
          [...listeners].every((listener) => typeof listener === 'function'),
      ) &&
      ['timer', 'level', 'tick'].every(
        (field) =>
          Object.getOwnPropertyDescriptor(clock, field)?.writable === true,
      ) &&
      (clock.timer === undefined ||
        (typeof clock.timer === 'object' &&
          clock.timer !== null &&
          typeof clock.timer.unref === 'function' &&
          typeof clock.timer.hasRef === 'function'))
    )
      return clock;
  } catch {
    // Incompatible copies and foreign accessors must not break extension loading.
  }
  return localClock;
}

/** Undefined at off; reading the cadence never starts a timer. */
export function getAnimationPeriodMs(
  level: AnimationLevel = getAnimationLevel(),
): number | undefined {
  switch (level) {
    case 'full':
      return 100;
    case 'reduced':
      return 200;
    case 'minimal':
      return 500;
    case 'off':
      return undefined;
  }
}

function scheduleTick(clock: AnimationClock): void {
  const period = getAnimationPeriodMs(clock.level);
  if (
    clock.timer !== undefined ||
    !clock.listeners.size ||
    period === undefined
  )
    return;
  // Preserve the +1 ms boundary nudge, capped at one period for provider refreshes.
  const delay = Math.min(period, period - (Date.now() % period) + 1);
  clock.timer = setTimeout(() => {
    clock.timer = undefined;
    const now = Date.now();
    const tick = ++clock.tick;
    scheduleTick(clock);
    for (const listener of [...clock.listeners]) {
      if (!clock.listeners.has(listener)) continue;
      try {
        listener(now, tick);
      } catch {
        // One surface must not prevent another surface from animating.
      }
    }
  }, delay);
  clock.timer.unref?.();
}

export function getAnimationLevel(): AnimationLevel {
  return animationClock().level;
}

/** Apply immediately, including cancelling or realigning an already pending tick. */
export function setAnimationLevel(level: AnimationLevel): void {
  const clock = animationClock();
  if (!isAnimationLevel(level) || clock.level === level) return;
  clock.level = level;
  clearTimeout(clock.timer);
  clock.timer = undefined;
  scheduleTick(clock);
  for (const listener of [...clock.levelListeners]) {
    if (!clock.levelListeners.has(listener)) continue;
    try {
      listener(level);
    } catch {
      // Level changes must reach other surfaces even when one owner fails.
    }
  }
}

/** No initial notification and no timer; the disposer is idempotent. */
export function subscribeAnimationLevel(
  listener: AnimationLevelListener,
): () => void {
  const clock = animationClock();
  const subscription: AnimationLevelListener = (level) => listener(level);
  clock.levelListeners.add(subscription);
  return () => {
    clock.levelListeners.delete(subscription);
  };
}

/**
 * Join the process-wide, period-boundary-aligned cadence (100/200/500 ms).
 * All listeners share one timestamp and a counter increasing by one per tick,
 * including after cadence changes or idle gaps. No immediate callback.
 * The unref'd timer exists only with subscribers and never at off.
 */
export function subscribeAnimationClock(
  listener: AnimationListener,
): () => void {
  const clock = animationClock();
  const subscription: AnimationListener = (now, tick) => listener(now, tick);
  clock.listeners.add(subscription);
  scheduleTick(clock);
  return () => {
    clock.listeners.delete(subscription);
    if (!clock.listeners.size) {
      clearTimeout(clock.timer);
      clock.timer = undefined;
    }
  };
}
