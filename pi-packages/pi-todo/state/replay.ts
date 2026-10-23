import type { TaskDetails } from '../tool/types.js';
import { EMPTY_STATE, type TaskState } from './state.js';

/**
 * Discriminator for `details` envelopes that match the persisted `TaskDetails`
 * shape. Defensive — branch entries from older or corrupt sessions are
 * skipped silently.
 */
export function isTaskDetails(value: unknown): value is TaskDetails {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.tasks) && typeof v.nextId === 'number';
}

/** Clone tasks so replay never aliases the persisted snapshot's task objects. */
function stateOf(details: TaskDetails): TaskState {
  return {
    tasks: details.tasks.map((task) => ({ ...task })),
    nextId: details.nextId,
  };
}

/**
 * Replay the latest valid snapshot from the current branch. Custom state
 * entries are authoritative: nested calls have no standalone toolResult, and
 * a direct call's result may land after a newer nested call's committed entry.
 * With no valid state entry, fall back to legacy todo toolResults, then empty.
 *
 * "rpiv-todo-state" mirrors STATE_ENTRY_TYPE in tool/types.ts; keep the literal
 * here so the state layer has no runtime import of the Pi-aware tool layer.
 * Pure of module state — index.ts owns writing the returned snapshot.
 */
export function replayFromBranch(ctx: {
  sessionManager: { getBranch(): Iterable<unknown> };
}): TaskState {
  let fromEntries: TaskState | undefined;
  let fromToolResults: TaskState | undefined;
  for (const entry of ctx.sessionManager.getBranch()) {
    const e = entry as {
      type?: string;
      customType?: string;
      data?: unknown;
      message?: { role?: string; toolName?: string; details?: unknown };
    };
    if (e.type === 'custom') {
      if (e.customType === 'rpiv-todo-state' && isTaskDetails(e.data))
        fromEntries = stateOf(e.data);
      continue;
    }
    if (e.type !== 'message') continue;
    const msg = e.message;
    if (msg?.role !== 'toolResult' || msg.toolName !== 'todo') continue;
    if (!isTaskDetails(msg.details)) continue;
    fromToolResults = stateOf(msg.details);
  }
  return (
    fromEntries ??
    fromToolResults ?? {
      tasks: [...EMPTY_STATE.tasks],
      nextId: EMPTY_STATE.nextId,
    }
  );
}
