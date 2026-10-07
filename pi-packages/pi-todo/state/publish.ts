import {
  type EventBus,
  onRequest,
  publish,
  TODO_STATE_CHANNEL,
  TODO_STATE_REQUEST,
  type TodoSnapshot,
} from '@thoth-agents/pi-core';
import { getState } from './store.js';

/** Publish an isolated full snapshot, including deleted tombstones. */
export function publishTodoState(events: EventBus, sessionId: string): void {
  if (!sessionId) return;
  const state = getState(sessionId);
  const tasks = structuredClone(state.tasks).map((task) => ({
    ...task,
    blockedBy: task.blockedBy ?? [],
  }));
  const counts: TodoSnapshot['counts'] = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    deleted: 0,
  };
  for (const task of tasks) counts[task.status]++;
  publish(events, TODO_STATE_CHANNEL, {
    sessionId,
    source: '@thoth-agents/pi-todo',
    data: { tasks, nextId: state.nextId, counts },
  });
}

/** Requests must not expose an empty placeholder before branch replay finishes. */
export class TodoStatePublisher {
  private readonly readySessions = new Set<string>();
  private readonly pendingRequests = new Set<string>();
  private offRequest: (() => void) | undefined;

  constructor(private readonly events: EventBus) {
    this.connect();
  }

  replayed(sessionId: string): void {
    if (!sessionId) return;
    this.connect();
    this.readySessions.add(sessionId);
    // This broadcast also answers all queued requests for the replayed session,
    // coalescing them like pi-subagents' startup publication.
    publishTodoState(this.events, sessionId);
    this.pendingRequests.delete(sessionId);
  }

  evict(sessionId: string): void {
    this.readySessions.delete(sessionId);
    this.pendingRequests.delete(sessionId);
    if (this.readySessions.size === 0) this.dispose();
  }

  dispose(): void {
    this.offRequest?.();
    this.offRequest = undefined;
    this.readySessions.clear();
    this.pendingRequests.clear();
  }

  private connect(): void {
    this.offRequest ??= onRequest(this.events, TODO_STATE_REQUEST, {
      onRequest: ({ sessionId }) => {
        if (this.readySessions.has(sessionId))
          publishTodoState(this.events, sessionId);
        else this.pendingRequests.add(sessionId);
      },
    });
  }
}
