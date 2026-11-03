import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { getWorkPanelLifecycle } from '@thoth-agents/pi-core';
import { sid } from './state/store.js';

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
