import { defineChannel } from './channels.js';
import { isNonNegativeInteger, isRecord } from './validation.js';

const todoStatuses = [
  'pending',
  'in_progress',
  'completed',
  'deleted',
] as const;
export type TodoStatus = (typeof todoStatuses)[number];

export type TodoTask = {
  id: number;
  subject: string;
  description?: string;
  activeForm?: string;
  status: TodoStatus;
  blockedBy: number[];
  owner?: string;
};

export type TodoCounts = Record<TodoStatus, number>;

/** Session identity belongs to the envelope, not the task-list data. */
export type TodoSnapshot = {
  tasks: TodoTask[];
  nextId: number;
  counts: TodoCounts;
};

export function isTodoSnapshot(value: unknown): value is TodoSnapshot {
  try {
    if (!isRecord(value)) return false;
    const { tasks, nextId, counts } = value;
    if (!Array.isArray(tasks) || !isTaskId(nextId) || !isRecord(counts))
      return false;
    for (const task of tasks) {
      if (!isTodoTask(task)) return false;
    }
    return todoStatuses.every((status) => isNonNegativeInteger(counts[status]));
  } catch {
    return false;
  }
}

function isTaskId(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isTodoTask(value: unknown): value is TodoTask {
  if (
    !isRecord(value) ||
    !isTaskId(value.id) ||
    typeof value.subject !== 'string' ||
    !todoStatuses.some((status) => status === value.status) ||
    !Array.isArray(value.blockedBy) ||
    !isOptionalString(value.description) ||
    !isOptionalString(value.activeForm) ||
    !isOptionalString(value.owner)
  )
    return false;
  for (const id of value.blockedBy) {
    if (!isTaskId(id)) return false;
  }
  return true;
}

export const TODO_STATE_CHANNEL = defineChannel<TodoSnapshot>({
  name: 'thoth:todo:state',
  version: 1,
  validate: isTodoSnapshot,
});

/** No request-specific data; the target session is carried by the envelope. */
export type TodoStateRequest = Record<string, never>;

export function isTodoStateRequest(value: unknown): value is TodoStateRequest {
  try {
    if (!isRecord(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return (
      (prototype === Object.prototype || prototype === null) &&
      Reflect.ownKeys(value).length === 0
    );
  } catch {
    return false;
  }
}

export const TODO_STATE_REQUEST = defineChannel<TodoStateRequest>({
  name: 'thoth:todo:state:request',
  version: 1,
  validate: isTodoStateRequest,
});
