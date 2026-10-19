import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type {
  BackgroundSnapshot,
  BackgroundTaskStatus,
  SubagentStatus,
  SubagentsSnapshot,
} from '@thoth-agents/pi-core';

type Child = {
  id: string;
  live: boolean;
  status: SubagentStatus | BackgroundTaskStatus;
  agent: string;
  description?: string;
};

const memoryKey = Symbol.for('@thoth-agents/pi-thoth-theme/orca-child-holds');

export function createOrcaChildHold(events: ExtensionAPI['events']) {
  const processState = globalThis as typeof globalThis & {
    [memoryKey]?: Map<string, Set<string>>;
  };
  processState[memoryKey] ??= new Map();
  const sessions = processState[memoryKey];
  let announced = new Set<string>();
  let subagents: Child[] = [];
  let background: Child[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  function reconcile(prefix: string, tasks: Child[]) {
    const live = new Set<string>();
    const byId = new Map<string, Child>();
    for (const task of tasks) {
      if (disposed) return;
      const id = `${prefix}${task.id}`;
      // Current tasks precede retained history when looking up terminal status.
      if (!byId.has(id)) byId.set(id, task);
      if (!task.live) continue;
      live.add(id);
      if (announced.has(id)) continue;
      announced.add(id);
      events.emit('task:subagent:lifecycle', {
        id,
        status: 'started',
        agent: task.agent,
        ...(task.description ? { description: task.description } : {}),
      });
    }
    for (const id of announced) {
      if (disposed) return;
      if (!id.startsWith(prefix) || live.has(id)) continue;
      announced.delete(id);
      const status = byId.get(id)?.status;
      events.emit('task:subagent:lifecycle', {
        id,
        status:
          status === 'failed' || status === 'timed_out'
            ? 'failed'
            : status === 'cancelled' || status === 'interrupted'
              ? 'aborted'
              : 'completed',
      });
    }
  }

  return {
    startSession(sessionId: string) {
      if (disposed) return;
      if (timer !== undefined) clearTimeout(timer);
      announced = sessions.get(sessionId) ?? new Set();
      sessions.set(sessionId, announced);
      subagents = [];
      background = [];
      // Orca restores parked children later in the same session_start dispatch.
      timer = setTimeout(() => {
        timer = undefined;
        if (disposed) return;
        reconcile('thoth:subagent:', subagents);
        reconcile('thoth:bg:', background);
      }, 0);
      timer.unref?.();
    },
    updateSubagents(data: SubagentsSnapshot) {
      if (disposed) return;
      subagents = [
        ...data.tasks.map((task) => ({
          id: task.id,
          live:
            task.mode === 'background' &&
            (task.status === 'queued' ||
              task.status === 'running' ||
              task.status === 'stopping'),
          status: task.status,
          agent: task.agent,
          description: task.displayName,
        })),
        ...data.history.map((task) => ({
          id: task.id,
          live: false,
          status: task.status,
          agent: task.agent,
        })),
      ];
      if (timer === undefined) reconcile('thoth:subagent:', subagents);
    },
    updateBackground(data: BackgroundSnapshot) {
      if (disposed) return;
      background = data.tasks.map((task) => ({
        id: task.id,
        live: task.status === 'running',
        status: task.status,
        agent: task.kind === 'command_watch' ? 'watch' : 'process',
        description: task.name,
      }));
      if (timer === undefined) reconcile('thoth:bg:', background);
    },
    dispose() {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
