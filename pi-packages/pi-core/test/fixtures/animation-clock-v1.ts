// Frozen legacy implementation for mixed-version clock lifecycle tests.
const WORK_PANEL_ANIMATION_INTERVAL_MS = 100;

type AnimationListener = (now: number) => void;

interface AnimationClock {
  version: 1;
  listeners: Set<AnimationListener>;
  timer: ReturnType<typeof setTimeout> | undefined;
}

const registryKey = Symbol.for('thoth.pi-core.animation-clock.v1');
const shared = globalThis as typeof globalThis & { [registryKey]?: unknown };
const localClock = createClock();

function createClock(): AnimationClock {
  return { version: 1, listeners: new Set(), timer: undefined };
}

function animationClock(): AnimationClock {
  try {
    if (shared[registryKey] === undefined) shared[registryKey] = createClock();
    const clock = shared[registryKey] as AnimationClock | null;
    if (
      clock?.version === 1 &&
      clock.listeners instanceof Set &&
      [...clock.listeners].every(
        (listener) => typeof listener === 'function',
      ) &&
      Object.getOwnPropertyDescriptor(clock, 'timer')?.writable === true &&
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

function scheduleTick(clock: AnimationClock): void {
  if (clock.timer !== undefined || !clock.listeners.size) return;
  const delay = Math.min(
    WORK_PANEL_ANIMATION_INTERVAL_MS,
    WORK_PANEL_ANIMATION_INTERVAL_MS -
      (Date.now() % WORK_PANEL_ANIMATION_INTERVAL_MS) +
      1,
  );
  clock.timer = setTimeout(() => {
    clock.timer = undefined;
    const now = Date.now();
    scheduleTick(clock);
    for (const listener of [...clock.listeners]) {
      if (!clock.listeners.has(listener)) continue;
      try {
        listener(now);
      } catch {
        // One surface must not prevent another surface from animating.
      }
    }
  }, delay);
  clock.timer.unref?.();
}

/**
 * Join the process-wide 100 ms wall-clock cadence. Target the next boundary
 * plus 1 ms to avoid early timers repeating floor(now / interval), but cap each
 * delay at 100 ms to keep scheduled provider-refresh deferral within one interval.
 * A boundary-aligned subscription therefore ticks on subsequent boundaries;
 * otherwise ticks land just after them, advancing the frame in the normal case.
 * Listeners share one timestamp per tick; there is no immediate callback.
 * The timer runs only while subscribed; the returned unsubscribe is idempotent.
 */
export function subscribeAnimationClock(
  listener: AnimationListener,
): () => void {
  const clock = animationClock();
  const subscription: AnimationListener = (now) => listener(now);
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
