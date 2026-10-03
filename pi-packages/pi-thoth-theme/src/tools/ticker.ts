// Per-state elapsed invalidation adapted from pi-omp-theme (MIT).
// Only public renderer context APIs are used; no viewport-dependent freezing.

export interface ElapsedRenderState {
  startedAt?: number;
  completedElapsedMs?: number;
  elapsedTicker?: ReturnType<typeof setInterval>;
  [key: string]: unknown;
}

export interface ElapsedRenderContext {
  executionStarted?: boolean;
  isPartial?: boolean;
  isError?: boolean;
  invalidate?: () => void;
  state?: ElapsedRenderState;
}

const tickerStates = new Set<ElapsedRenderState>();

function freezeElapsed(state: ElapsedRenderState): void {
  if (
    state.completedElapsedMs === undefined &&
    typeof state.startedAt === 'number'
  ) {
    state.completedElapsedMs = Date.now() - state.startedAt;
  }
}

export function getElapsedMs(
  state: ElapsedRenderState | undefined,
): number | undefined {
  if (typeof state?.completedElapsedMs === 'number') {
    return state.completedElapsedMs;
  }
  return typeof state?.startedAt === 'number'
    ? Date.now() - state.startedAt
    : undefined;
}

function stopElapsedTicker(state: ElapsedRenderState): void {
  if (state.elapsedTicker !== undefined) clearInterval(state.elapsedTicker);
  delete state.elapsedTicker;
  tickerStates.delete(state);
}

/** Freeze interrupted rows too: Pi may drop them without a terminal render. */
export function stopAllElapsedTickers(): void {
  for (const state of tickerStates) {
    freezeElapsed(state);
    stopElapsedTicker(state);
  }
}

/** Keep one public renderer invalidation interval per running tool state. */
export function syncElapsedTicker(context: ElapsedRenderContext): void {
  const state = context?.state;
  if (!state) return;
  if (context.executionStarted && state.startedAt === undefined) {
    state.startedAt = Date.now();
  }
  if (!context.isPartial || context.isError) freezeElapsed(state);
  if (
    !context.executionStarted ||
    !context.isPartial ||
    state.completedElapsedMs !== undefined
  ) {
    stopElapsedTicker(state);
    return;
  }
  if (context.invalidate && state.elapsedTicker === undefined) {
    state.elapsedTicker = setInterval(context.invalidate, 1000);
    tickerStates.add(state);
  }
}
