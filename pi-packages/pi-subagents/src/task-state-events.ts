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

export class SubagentsStatePublisher {
  private session: { cwd: string; sessionId: string } | undefined;
  private readonly offRequest: () => void;
  private readonly offTaskUpdate: () => void;

  constructor(
    private readonly events: EventBus,
    private readonly source: TaskStateSource,
  ) {
    this.offTaskUpdate = source.onTaskUpdate(() => this.publish());
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
    this.session = undefined;
  }

  private publish(): void {
    if (!this.session) return;
    const { cwd, sessionId } = this.session;
    const tasks = this.source
      .listActiveSessionTasks(cwd, sessionId)
      .map(summarizeTask);
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
    publish(this.events, SUBAGENTS_STATE_CHANNEL, {
      sessionId,
      source: '@thoth-agents/pi-subagents',
      data: { tasks, history, counts, totals },
    });
  }
}
