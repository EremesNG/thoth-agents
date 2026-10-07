// Per-state elapsed invalidation adapted from pi-omp-theme (MIT).
// Only public renderer context APIs are used; no viewport-dependent freezing.

import type {
  RenderIndicatorContext,
  RenderStatus,
} from '@thoth-agents/pi-core';
import { getToolElapsedMs } from '@thoth-agents/pi-core';

export type ElapsedRenderState = NonNullable<
  RenderIndicatorContext['state']
> & {
  elapsedTicker?: ReturnType<typeof setInterval>;
};

export interface ElapsedRenderContext extends RenderIndicatorContext {
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

function legacyElapsedOverride(
  state: ElapsedRenderState | undefined,
): number | undefined {
  // Legacy duration formatting displays malformed producer-owned durations as 0s.
  return typeof state?.completedElapsedMs === 'number' &&
    !Number.isFinite(state.completedElapsedMs)
    ? 0
    : undefined;
}

/** Legacy built-ins can read the same timing state until they use toolFooter. */
export function getElapsedMs(
  state: ElapsedRenderState | undefined,
): number | undefined {
  return getToolElapsedMs({
    status: 'running',
    context: { state },
    elapsedMs: legacyElapsedOverride(state),
  });
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
    getToolElapsedMs({ status: 'interrupted', context: { state } });
    stopElapsedTicker(state);
  }
}

/** Keep one invalidation interval per state; explicit status wins over partial/error flags. */
export function syncElapsedTicker(
  context: ElapsedRenderContext,
  owner = activeOwner,
  status?: RenderStatus,
): void {
  const state = context?.state;
  if (!state) return;
  const resolvedStatus =
    status ??
    (context.isPartial ? 'running' : context.isError ? 'failed' : 'completed');
  getToolElapsedMs({
    status: resolvedStatus,
    context,
    elapsedMs: status === undefined ? legacyElapsedOverride(state) : undefined,
  });
  if (
    !context.executionStarted ||
    (resolvedStatus !== 'running' && resolvedStatus !== 'in_progress') ||
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
