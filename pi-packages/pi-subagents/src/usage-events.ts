import type { EventBus } from '@earendil-works/pi-coding-agent';
import type { SubagentAssistantAccountingMessage } from './types.js';

/** Cumulative snapshot: consumers replace previous values, never add them. */
export type SubagentUsageSnapshot = {
  parentSessionId: string;
  totalCost: number;
  /** Distinct child tasks with assistant messages; continuations share a task. */
  runCount: number;
};

function messageIdentity(
  message: SubagentAssistantAccountingMessage,
): string | undefined {
  if (message.id) return `id:${message.id}`;
  // Equal usage alone cannot distinguish a replay from another priced message.
  if (message.timestamp === undefined) return undefined;
  const usage = message.usage;
  return `timestamp:${JSON.stringify([
    message.timestamp,
    usage?.input,
    usage?.output,
    usage?.cacheRead,
    usage?.cacheWrite,
    usage?.totalTokens,
    usage?.cost?.total,
  ])}`;
}

function messageTimestamp(
  message: SubagentAssistantAccountingMessage,
): number | undefined {
  const timestamp =
    typeof message.timestamp === 'string'
      ? Date.parse(message.timestamp)
      : message.timestamp;
  return typeof timestamp === 'number' && Number.isFinite(timestamp)
    ? timestamp
    : undefined;
}

const usageEntryType = 'thoth:subagent-usage';
const persistIntervalMs = 5_000;

type RunUsage = {
  totalCost: number;
  seen: Set<string>;
  throughTimestamp: number | null;
  throughKeys: Set<string>;
  untimedKeys: Set<string>;
  restoredThroughTimestamp: number | null;
};
type ParentUsage = {
  totalCost: number;
  runs: Map<string, RunUsage>;
  dirty: boolean;
};
type PersistedUsage = SubagentUsageSnapshot & {
  version: 1;
  runs: {
    runId: string;
    totalCost: number;
    throughTimestamp: number | null;
    throughKeys: string[];
    untimedKeys: string[];
  }[];
};
type UsageEntry = { type: string; customType?: string; data?: unknown };

function isNonNegativeCost(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((key) => typeof key === 'string' && key.length > 0)
  );
}

function isPersistedUsage(
  value: unknown,
  parentSessionId: string,
): value is PersistedUsage {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<PersistedUsage>;
  if (
    data.version !== 1 ||
    data.parentSessionId !== parentSessionId ||
    !isNonNegativeCost(data.totalCost) ||
    !Array.isArray(data.runs) ||
    data.runCount !== data.runs.length
  )
    return false;
  const runIds = new Set<string>();
  return data.runs.every((run) => {
    if (
      !run ||
      typeof run.runId !== 'string' ||
      !run.runId ||
      runIds.has(run.runId) ||
      !isNonNegativeCost(run.totalCost) ||
      (run.throughTimestamp !== null &&
        (typeof run.throughTimestamp !== 'number' ||
          !Number.isFinite(run.throughTimestamp))) ||
      !isStringArray(run.throughKeys) ||
      !isStringArray(run.untimedKeys)
    )
      return false;
    runIds.add(run.runId);
    return true;
  });
}

export class SubagentUsageEvents {
  private readonly parents = new Map<string, ParentUsage>();
  private activeSessionId: string | undefined;
  private lastPersistedAt = Number.NEGATIVE_INFINITY;
  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  private sessionReady: boolean;
  private readonly pendingRequests = new Set<string>();
  private readonly offRequest: () => void;

  constructor(
    private readonly events: EventBus,
    private readonly appendEntry?: (customType: string, data: unknown) => void,
  ) {
    this.sessionReady = !appendEntry;
    this.offRequest = events.on('thoth:subagent-usage:request', (data) => {
      if (!data || typeof data !== 'object') return;
      const { parentSessionId } = data as { parentSessionId?: unknown };
      if (typeof parentSessionId !== 'string' || !parentSessionId) return;
      if (this.sessionReady) this.publish(parentSessionId);
      else this.pendingRequests.add(parentSessionId);
    });
  }

  startSession(
    parentSessionId: string | undefined,
    entries: readonly UsageEntry[],
  ): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    this.lastPersistedAt = Number.NEGATIVE_INFINITY;
    this.activeSessionId = parentSessionId;
    if (parentSessionId && !this.parents.has(parentSessionId))
      this.restoreParent(parentSessionId, entries);
    this.sessionReady = true;
    if (parentSessionId) this.publish(parentSessionId);
    for (const requestedParent of this.pendingRequests) {
      if (requestedParent !== parentSessionId) this.publish(requestedParent);
    }
    this.pendingRequests.clear();
  }

  flush(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    if (!this.appendEntry || !this.activeSessionId) return;
    const parent = this.parents.get(this.activeSessionId);
    if (!parent?.dirty) return;
    this.appendEntry(usageEntryType, {
      version: 1,
      parentSessionId: this.activeSessionId,
      totalCost: parent.totalCost,
      runCount: parent.runs.size,
      runs: Array.from(parent.runs, ([runId, run]) => ({
        runId,
        totalCost: run.totalCost,
        throughTimestamp: run.throughTimestamp,
        throughKeys: [...run.throughKeys],
        untimedKeys: [...run.untimedKeys],
      })),
    } satisfies PersistedUsage);
    parent.dirty = false;
    this.lastPersistedAt = Date.now();
  }

  recordAssistantMessage(
    parentSessionId: string | undefined,
    runId: string,
    message: SubagentAssistantAccountingMessage,
  ): void {
    if (!parentSessionId) return;
    let parent = this.parents.get(parentSessionId);
    if (!parent) {
      parent = { totalCost: 0, runs: new Map(), dirty: false };
      this.parents.set(parentSessionId, parent);
    }
    let run = parent.runs.get(runId);
    if (!run) {
      run = {
        totalCost: 0,
        seen: new Set(),
        throughTimestamp: null,
        throughKeys: new Set(),
        untimedKeys: new Set(),
        restoredThroughTimestamp: null,
      };
      parent.runs.set(runId, run);
    }
    const identity = messageIdentity(message);
    const timestamp = messageTimestamp(message);
    if (
      (identity && run.seen.has(identity)) ||
      (timestamp !== undefined &&
        run.restoredThroughTimestamp !== null &&
        timestamp < run.restoredThroughTimestamp)
    )
      return;
    if (identity) run.seen.add(identity);
    // SDK assistant messages are chronological and always timestamped. Keep
    // only the checkpoint boundary keys, not the whole run's message history.
    if (timestamp !== undefined) {
      if (run.throughTimestamp === null || timestamp > run.throughTimestamp) {
        run.throughTimestamp = timestamp;
        run.throughKeys.clear();
      }
      if (identity && timestamp === run.throughTimestamp)
        run.throughKeys.add(identity);
    } else if (identity) {
      // Non-SDK messages without a usable clock need exact fallback keys.
      run.untimedKeys.add(identity);
    }
    const cost = message.usage?.cost?.total;
    if (isNonNegativeCost(cost)) {
      parent.totalCost += cost;
      run.totalCost += cost;
    }
    parent.dirty = true;
    this.publish(parentSessionId);
    this.scheduleFlush(parentSessionId);
  }

  dispose(): void {
    try {
      this.flush();
    } finally {
      this.offRequest();
      this.pendingRequests.clear();
      this.parents.clear();
      this.activeSessionId = undefined;
    }
  }

  private restoreParent(
    parentSessionId: string,
    entries: readonly UsageEntry[],
  ): void {
    // The last valid checkpoint wins, even when it is off the active branch:
    // this cost is session-wide, not a sum of messages on the selected branch.
    for (let index = entries.length - 1; index >= 0; index--) {
      const entry = entries[index];
      if (entry.type !== 'custom' || entry.customType !== usageEntryType)
        continue;
      const data = entry.data;
      if (!isPersistedUsage(data, parentSessionId)) continue;
      this.parents.set(parentSessionId, {
        totalCost: data.totalCost,
        runs: new Map(
          data.runs.map((run) => [
            run.runId,
            {
              totalCost: run.totalCost,
              seen: new Set([...run.throughKeys, ...run.untimedKeys]),
              throughTimestamp: run.throughTimestamp,
              throughKeys: new Set(run.throughKeys),
              untimedKeys: new Set(run.untimedKeys),
              restoredThroughTimestamp: run.throughTimestamp,
            },
          ]),
        ),
        dirty: false,
      });
      return;
    }
  }

  private scheduleFlush(parentSessionId: string): void {
    if (!this.appendEntry || parentSessionId !== this.activeSessionId) return;
    const delay = this.lastPersistedAt + persistIntervalMs - Date.now();
    if (delay <= 0) this.flush();
    else if (!this.persistTimer) {
      this.persistTimer = setTimeout(() => this.flush(), delay);
      this.persistTimer.unref?.();
    }
  }

  private publish(parentSessionId: string): void {
    const parent = this.parents.get(parentSessionId);
    this.events.emit('thoth:subagent-usage', {
      parentSessionId,
      totalCost: parent?.totalCost ?? 0,
      runCount: parent?.runs.size ?? 0,
    } satisfies SubagentUsageSnapshot);
  }
}
