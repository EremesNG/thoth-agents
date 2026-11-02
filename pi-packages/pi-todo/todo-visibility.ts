import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { getWorkPanelLifecycle } from '@thoth-agents/pi-core';
import { selectTodoCounts, selectVisibleTasks } from './state/selectors.js';
import type { TaskState } from './state/state.js';
import { getState, sid } from './state/store.js';
import type { Task } from './tool/types.js';

/**
 * A fully completed list stays shown for the prompt epoch in which it finished
 * and is hidden from the Todos section, panel and `/todos` once a newer epoch
 * starts. Presentation only: task state is never touched.
 */
const completedAtEpoch = new Map<string, number>();

/** Read the prompt epoch; a stale context keeps the last known value. */
export function currentEpoch(ctx: ExtensionContext, fallback = 0): number {
  try {
    return getWorkPanelLifecycle(ctx).epoch;
  } catch {
    return fallback;
  }
}

/**
 * Observe only recognized epochs from pi-core, never raw inputs. Register after
 * bindWorkPanelLifecycle so its before_agent_start handler advances the epoch
 * first (including when another extension owns that binding).
 */
export function onPromptEpochChanged(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  onEpoch: () => void,
): () => void {
  const sessionId = sid(ctx);
  let observed = currentEpoch(ctx);
  return pi.on('before_agent_start', (_event, eventCtx) => {
    if (
      eventCtx.sessionManager !== ctx.sessionManager ||
      sid(eventCtx) !== sessionId
    )
      return;
    const epoch = currentEpoch(eventCtx, observed);
    const advanced = epoch > observed;
    observed = epoch;
    if (advanced) onEpoch();
  });
}

/** Records the completion epoch on first sight and reports whether the list is now hidden. */
export function isCompletedListHidden(
  sessionId: string,
  state: TaskState,
  epoch: number,
): boolean {
  const { total, completed } = selectTodoCounts(state);
  if (total === 0 || completed < total) {
    completedAtEpoch.delete(sessionId);
    return false;
  }
  const recorded = completedAtEpoch.get(sessionId) ?? epoch;
  completedAtEpoch.set(sessionId, recorded);
  return epoch > recorded;
}

export function forgetCompletedList(sessionId: string): void {
  completedAtEpoch.delete(sessionId);
}

/** The session's current list as the user may see it (empty once hidden). */
export function listCurrentTasks(ctx: ExtensionContext): readonly Task[] {
  const id = sid(ctx);
  const state = getState(id);
  return isCompletedListHidden(id, state, currentEpoch(ctx))
    ? []
    : selectVisibleTasks(state);
}
