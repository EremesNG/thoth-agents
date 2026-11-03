import type { Task, TaskDetails, TaskStatus } from '../tool/types.js';
import { EMPTY_STATE, type TaskState } from './state.js';

const TASK_STATUSES: ReadonlySet<unknown> = new Set<TaskStatus>([
  'pending',
  'in_progress',
  'completed',
  'deleted',
]);

const optional = (value: unknown, valid: (v: unknown) => boolean): boolean =>
  value === undefined || valid(value);
const isString = (value: unknown): boolean => typeof value === 'string';

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== 'object') return false;
  const task = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(task.id) &&
    typeof task.subject === 'string' &&
    TASK_STATUSES.has(task.status) &&
    optional(task.description, isString) &&
    optional(task.activeForm, isString) &&
    optional(task.owner, isString) &&
    optional(task.group, isString) &&
    optional(
      task.blockedBy,
      (ids) => Array.isArray(ids) && ids.every(Number.isSafeInteger),
    ) &&
    optional(
      task.metadata,
      (metadata) =>
        typeof metadata === 'object' &&
        metadata !== null &&
        !Array.isArray(metadata),
    ) &&
    optional(task.createdAt, Number.isFinite) &&
    optional(task.completedAt, Number.isFinite) &&
    optional(task.archivedAt, Number.isFinite)
  );
}

/**
 * Discriminator for persisted snapshots, down to every task. A malformed
 * snapshot is skipped whole so replay keeps the last valid one.
 */
export function isTaskDetails(value: unknown): value is TaskDetails {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.tasks) &&
    v.tasks.every(isTask) &&
    Number.isSafeInteger(v.nextId)
  );
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
