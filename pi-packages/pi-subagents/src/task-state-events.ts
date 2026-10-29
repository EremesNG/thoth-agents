import {
  type EventBus,
  onRequest,
  publish,
  SUBAGENT_PREVIEW_MAX_LENGTH,
  SUBAGENTS_STATE_CHANNEL,
  SUBAGENTS_STATE_REQUEST,
  type SubagentsCounts,
  type SubagentTaskSummary,
} from '@thoth-agents/pi-core';
import type { SubagentManager } from './manager.js';
import type { SubagentTask } from './types.js';
import { formatTaskSummary } from './ui/background-widget.js';

const ACTIVITY_PUBLICATION_INTERVAL_MS = 150;
// All other summary fields, including future additions, publish immediately.
const COALESCIBLE_SUMMARY_KEYS = new Set<keyof SubagentTaskSummary>([
  'lastActivityAt',
  'usage',
  'preview',
]);

type TaskStateSource = Pick<
  SubagentManager,
  | 'listActiveSessionTasks'
  | 'listSessionHistoryByCost'
  | 'snapshotSessionTaskCounts'
  | 'onTaskUpdate'
>;

function completeCounts(
  counts: Partial<SubagentsCounts> = {},
): SubagentsCounts {
  return {
    queued: counts.queued ?? 0,
    running: counts.running ?? 0,
    stopping: counts.stopping ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    cancelled: counts.cancelled ?? 0,
    interrupted: counts.interrupted ?? 0,
  };
}

function timestamp(value: string | undefined): number | undefined {
  return value === undefined ? undefined : Date.parse(value);
}

function summarizeTask(task: SubagentTask): SubagentTaskSummary {
  return {
    id: task.id,
    agent: task.agent,
    displayName: task.display_name?.trim()
      ? task.display_name
      : formatTaskSummary(task) || task.agent,
    mode: task.mode,
    status: task.status,
    model: task.model,
    effort: task.effort,
    createdAt: Date.parse(task.created_at),
    startedAt: timestamp(task.started_at),
    endedAt: timestamp(task.ended_at),
    lastActivityAt: timestamp(task.last_activity_at),
    usage:
      task.usage === undefined
        ? undefined
        : {
            input: task.usage.input,
            output: task.usage.output,
            cost: task.usage.cost,
          },
    preview: task.output_preview?.slice(0, SUBAGENT_PREVIEW_MAX_LENGTH),
  };
}

function hasImmediateSummaryChange(
  current: SubagentTaskSummary,
  previous: SubagentTaskSummary | undefined,
): boolean {
  if (!previous) return true;
  const keys = Object.keys({ ...previous, ...current }) as Array<
    keyof SubagentTaskSummary
  >;
  return keys.some(
    (key) =>
      !COALESCIBLE_SUMMARY_KEYS.has(key) &&
      !Object.is(current[key], previous[key]),
  );
}

export class SubagentsStatePublisher {
  private session: { cwd: string; sessionId: string } | undefined;
  private readonly offRequest: () => void;
  private readonly offTaskUpdate: () => void;
  private publishedTasks = new Map<string, SubagentTaskSummary>();
  private lastPublishedAt = 0;
  private publicationTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly events: EventBus,
    private readonly source: TaskStateSource,
  ) {
    this.offTaskUpdate = source.onTaskUpdate(() => this.onTaskUpdate());
    this.offRequest = onRequest(events, SUBAGENTS_STATE_REQUEST, {
      // Unready requests are answered together by the next readiness broadcast;
      // never read another session's tasks to answer them early.
      onRequest: ({ sessionId }) => {
        if (this.session?.sessionId === sessionId) this.publish();
      },
    });
  }

  startSession(cwd: string, sessionId: string | undefined): void {
    this.session = sessionId ? { cwd, sessionId } : undefined;
    // The readiness broadcast also answers all queued requests for this session.
    this.publish();
  }

  dispose(): void {
    this.offRequest();
    this.offTaskUpdate();
    this.clearPublicationTimer();
    this.session = undefined;
  }

  private onTaskUpdate(): void {
    if (!this.session) return;
    const { cwd, sessionId } = this.session;
    const tasks = this.source
      .listActiveSessionTasks(cwd, sessionId)
      .map(summarizeTask);
    const immediateChange =
      tasks.length !== this.publishedTasks.size ||
      tasks.some((task) =>
        hasImmediateSummaryChange(task, this.publishedTasks.get(task.id)),
      );
    if (immediateChange) {
      this.publish(tasks);
      return;
    }
    if (this.publicationTimer !== undefined) return;
    const delay =
      this.lastPublishedAt + ACTIVITY_PUBLICATION_INTERVAL_MS - Date.now();
    if (delay <= 0) {
      this.publish(tasks);
      return;
    }
    this.publicationTimer = setTimeout(() => this.publish(), delay);
    this.publicationTimer.unref?.();
  }

  private clearPublicationTimer(): void {
    if (this.publicationTimer === undefined) return;
    clearTimeout(this.publicationTimer);
    this.publicationTimer = undefined;
  }

  private publish(activeTasks?: SubagentTaskSummary[]): void {
    this.clearPublicationTimer();
    if (!this.session) return;
    const { cwd, sessionId } = this.session;
    const tasks =
      activeTasks ??
      this.source.listActiveSessionTasks(cwd, sessionId).map(summarizeTask);
    const liveIds = new Set(tasks.map(({ id }) => id));
    const history = this.source
      .listSessionHistoryByCost(cwd, sessionId)
      .filter((task) => !liveIds.has(task.id))
      .map(summarizeTask);
    const counts = completeCounts();
    for (const task of tasks) counts[task.status]++;
    const persistedCounts = completeCounts(
      this.source.snapshotSessionTaskCounts(cwd, sessionId).counts,
    );
    const totals = {
      ...persistedCounts,
      total: Object.values(persistedCounts).reduce(
        (sum, count) => sum + count,
        0,
      ),
    };
    this.publishedTasks = new Map(tasks.map((task) => [task.id, task]));
    this.lastPublishedAt = Date.now();
    publish(this.events, SUBAGENTS_STATE_CHANNEL, {
      sessionId,
      source: '@thoth-agents/pi-subagents',
      data: { tasks, history, counts, totals },
    });
  }
}
