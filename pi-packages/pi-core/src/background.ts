import { defineChannel } from './channels.js';
import {
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
} from './validation.js';

const backgroundStatuses = [
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
] as const;
export type BackgroundTaskStatus = (typeof backgroundStatuses)[number];
export type BackgroundTaskKind = 'process' | 'command_watch';

export const BACKGROUND_PROGRESS_MAX_LENGTH = 200;

/** Lightweight projection only; all lifecycle times are Unix milliseconds. */
export type BackgroundTaskSummary = {
  id: string;
  name?: string;
  kind: BackgroundTaskKind;
  status: BackgroundTaskStatus;
  createdAt: number;
  startedAt: number;
  endedAt?: number;
  deadlineAt?: number;
  lastCheckedAt?: number;
  lastProgressAt?: number;
  stopRequestedAt?: number;
  dismissedAt?: number;
  exitCode?: number | null;
  signal?: string | null;
  progress?: number | string;
  dismissed?: boolean;
};

export type BackgroundCounts = Record<BackgroundTaskStatus, number>;

/** Complete current-origin state; session identity belongs to the envelope. */
export type BackgroundSnapshot = {
  tasks: BackgroundTaskSummary[];
  counts: BackgroundCounts;
};

export function isBackgroundSnapshot(
  value: unknown,
): value is BackgroundSnapshot {
  try {
    if (
      !isExactRecord(value, ['tasks', 'counts']) ||
      !Array.isArray(value.tasks)
    )
      return false;
    for (const task of value.tasks) {
      if (!isBackgroundTask(task)) return false;
    }
    const { counts } = value;
    return (
      isExactRecord(counts, backgroundStatuses) &&
      backgroundStatuses.every((status) => isNonNegativeInteger(counts[status]))
    );
  } catch {
    return false;
  }
}

function isExactRecord(
  value: unknown,
  allowedKeys: readonly string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Reflect.ownKeys(value).every(
      (key) => typeof key === 'string' && allowedKeys.includes(key),
    )
  );
}

function isOptionalTimestamp(value: unknown): value is number | undefined {
  return value === undefined || isNonNegativeInteger(value);
}

function isProgress(value: unknown): value is number | string {
  return (
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' &&
      value.length <= BACKGROUND_PROGRESS_MAX_LENGTH)
  );
}

function isBackgroundTask(value: unknown): value is BackgroundTaskSummary {
  return (
    isExactRecord(value, [
      'id',
      'name',
      'kind',
      'status',
      'createdAt',
      'startedAt',
      'endedAt',
      'deadlineAt',
      'lastCheckedAt',
      'lastProgressAt',
      'stopRequestedAt',
      'dismissedAt',
      'exitCode',
      'signal',
      'progress',
      'dismissed',
    ]) &&
    isNonEmptyString(value.id) &&
    (value.name === undefined || typeof value.name === 'string') &&
    (value.kind === 'process' || value.kind === 'command_watch') &&
    backgroundStatuses.some((status) => status === value.status) &&
    isNonNegativeInteger(value.createdAt) &&
    isNonNegativeInteger(value.startedAt) &&
    isOptionalTimestamp(value.endedAt) &&
    isOptionalTimestamp(value.deadlineAt) &&
    isOptionalTimestamp(value.lastCheckedAt) &&
    isOptionalTimestamp(value.lastProgressAt) &&
    isOptionalTimestamp(value.stopRequestedAt) &&
    isOptionalTimestamp(value.dismissedAt) &&
    (value.exitCode === undefined ||
      value.exitCode === null ||
      (typeof value.exitCode === 'number' &&
        Number.isSafeInteger(value.exitCode))) &&
    (value.signal === undefined ||
      value.signal === null ||
      isNonEmptyString(value.signal)) &&
    (value.progress === undefined || isProgress(value.progress)) &&
    (value.dismissed === undefined || typeof value.dismissed === 'boolean')
  );
}

export const BACKGROUND_STATE_CHANNEL = defineChannel<BackgroundSnapshot>({
  name: 'thoth:background:state',
  version: 1,
  validate: isBackgroundSnapshot,
});

/** Empty request data; the target session belongs to the envelope. */
export type BackgroundStateRequest = Record<string, never>;

export function isBackgroundStateRequest(
  value: unknown,
): value is BackgroundStateRequest {
  try {
    return isExactRecord(value, []);
  } catch {
    return false;
  }
}

export const BACKGROUND_STATE_REQUEST = defineChannel<BackgroundStateRequest>({
  name: 'thoth:background:state:request',
  version: 1,
  validate: isBackgroundStateRequest,
});
