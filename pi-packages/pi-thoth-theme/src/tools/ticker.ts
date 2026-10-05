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

const tickerStates = new Map<ElapsedRenderState, object>();
let activeOwner: object | undefined;

/** Only interactive session_start callbacks may claim the rendering ticker owner. */
export function activateElapsedTickerOwner(owner: object): void {
  activeOwner = owner;
}

export function releaseElapsedTickerOwner(owner: object): void {
  if (activeOwner === owner) activeOwner = undefined;
}

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

/** Freeze only this owner's interrupted rows: children share the module state. */
export function stopElapsedTickers(owner: object): void {
  for (const [state, stateOwner] of tickerStates) {
    if (stateOwner !== owner) continue;
    freezeElapsed(state);
    stopElapsedTicker(state);
  }
}

/** Keep one public renderer invalidation interval per running tool state. */
export function syncElapsedTicker(
  context: ElapsedRenderContext,
  owner = activeOwner,
): void {
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
  if (
    owner === activeOwner &&
    owner !== undefined &&
    context.invalidate &&
    state.elapsedTicker === undefined
  ) {
    state.elapsedTicker = setInterval(context.invalidate, 1000);
    tickerStates.set(state, owner);
  }
}
