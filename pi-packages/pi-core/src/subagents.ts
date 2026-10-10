import { defineChannel } from './channels.js';
import {
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
} from './validation.js';

const subagentStatuses = [
  'queued',
  'running',
  'stopping',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
] as const;
export type SubagentStatus = (typeof subagentStatuses)[number];
export type SubagentMode = 'task' | 'background';
const subagentEfforts = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;
export type SubagentEffort = (typeof subagentEfforts)[number];

export const SUBAGENT_PREVIEW_MAX_LENGTH = 800;

export type SubagentTaskUsage = {
  input?: number;
  output?: number;
  cost?: number;
};

/** Lightweight projection only; all lifecycle times are Unix milliseconds. */
export type SubagentTaskSummary = {
  id: string;
  agent: string;
  displayName?: string;
  mode: SubagentMode;
  status: SubagentStatus;
  model?: string;
  effort?: SubagentEffort;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  lastActivityAt?: number;
  usage?: SubagentTaskUsage;
  preview?: string;
};

export type SubagentsCounts = Record<SubagentStatus, number>;
export type SubagentsTotals = SubagentsCounts & { total: number };

/** Active-session tasks plus persisted session totals; identity is in the envelope. */
export type SubagentsSnapshot = {
  tasks: SubagentTaskSummary[];
  /** Cost-ranked persisted session summaries, at most 100 entries. */
  history: SubagentTaskSummary[];
  counts: SubagentsCounts;
  totals: SubagentsTotals;
};

export function isSubagentsSnapshot(
  value: unknown,
): value is SubagentsSnapshot {
  try {
    if (
      !isExactRecord(value, ['tasks', 'history', 'counts', 'totals']) ||
      !Array.isArray(value.tasks) ||
      !Array.isArray(value.history) ||
      value.history.length > 100
    )
      return false;
    for (const tasks of [value.tasks, value.history]) {
      for (const task of tasks) {
        if (!isSubagentTask(task)) return false;
      }
    }
    const { counts, totals } = value;
    return (
      isCounts(counts) &&
      isExactRecord(totals, [...subagentStatuses, 'total']) &&
      isNonNegativeInteger(totals.total) &&
      subagentStatuses.every((status) => isNonNegativeInteger(totals[status]))
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

function isCounts(value: unknown): value is SubagentsCounts {
  return (
    isExactRecord(value, subagentStatuses) &&
    subagentStatuses.every((status) => isNonNegativeInteger(value[status]))
  );
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalTimestamp(value: unknown): value is number | undefined {
  return value === undefined || isNonNegativeInteger(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isTaskUsage(value: unknown): value is SubagentTaskUsage {
  return (
    isExactRecord(value, ['input', 'output', 'cost']) &&
    (value.input === undefined || isNonNegativeInteger(value.input)) &&
    (value.output === undefined || isNonNegativeInteger(value.output)) &&
    (value.cost === undefined || isNonNegativeNumber(value.cost))
  );
}

function isSubagentTask(value: unknown): value is SubagentTaskSummary {
  return (
    isExactRecord(value, [
      'id',
      'agent',
      'displayName',
      'mode',
      'status',
      'model',
      'effort',
      'createdAt',
      'startedAt',
      'endedAt',
      'lastActivityAt',
      'usage',
      'preview',
    ]) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.agent) &&
    isOptionalString(value.displayName) &&
    (value.mode === 'task' || value.mode === 'background') &&
    subagentStatuses.some((status) => status === value.status) &&
    isOptionalString(value.model) &&
    (value.effort === undefined ||
      subagentEfforts.some((effort) => effort === value.effort)) &&
    isNonNegativeInteger(value.createdAt) &&
    isOptionalTimestamp(value.startedAt) &&
    isOptionalTimestamp(value.endedAt) &&
    isOptionalTimestamp(value.lastActivityAt) &&
    (value.usage === undefined || isTaskUsage(value.usage)) &&
    (value.preview === undefined ||
      (typeof value.preview === 'string' &&
        value.preview.length <= SUBAGENT_PREVIEW_MAX_LENGTH))
  );
}

export const SUBAGENTS_STATE_CHANNEL = defineChannel<SubagentsSnapshot>({
  name: 'thoth:subagents:state',
  version: 2,
  validate: isSubagentsSnapshot,
});

/** Empty request data; the target session belongs to the envelope. */
export type SubagentsStateRequest = Record<string, never>;
export type SubagentsUsageRequest = Record<string, never>;

export function isSubagentsStateRequest(
  value: unknown,
): value is SubagentsStateRequest {
  try {
    return isExactRecord(value, []);
  } catch {
    return false;
  }
}

export function isSubagentsUsageRequest(
  value: unknown,
): value is SubagentsUsageRequest {
  return isSubagentsStateRequest(value);
}

export const SUBAGENTS_STATE_REQUEST = defineChannel<SubagentsStateRequest>({
  name: 'thoth:subagents:state:request',
  version: 1,
  validate: isSubagentsStateRequest,
});

/** Cumulative parent-session usage; session identity belongs to the envelope. */
export type SubagentsUsageSnapshot = {
  totalCost: number;
  runCount: number;
};

export function isSubagentsUsageSnapshot(
  value: unknown,
): value is SubagentsUsageSnapshot {
  try {
    return (
      isExactRecord(value, ['totalCost', 'runCount']) &&
      isNonNegativeNumber(value.totalCost) &&
      isNonNegativeInteger(value.runCount)
    );
  } catch {
    return false;
  }
}

export const SUBAGENTS_USAGE_CHANNEL = defineChannel<SubagentsUsageSnapshot>({
  name: 'thoth:subagents:usage',
  version: 1,
  validate: isSubagentsUsageSnapshot,
});

export const SUBAGENTS_USAGE_REQUEST = defineChannel<SubagentsUsageRequest>({
  name: 'thoth:subagents:usage:request',
  version: 1,
  validate: isSubagentsUsageRequest,
});
