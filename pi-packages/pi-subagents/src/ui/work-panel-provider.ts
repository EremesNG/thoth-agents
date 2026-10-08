import {
  getRenderKit,
  type RenderKitTheme,
  resolveIcon,
  resolveStatusGlyph,
  WORK_PANEL_VERSION,
  type WorkPanelItemState,
  type WorkPanelProvider,
  type WorkPanelSegment,
} from '@thoth-agents/pi-core';
import type { SubagentSessionTaskCounts } from '../history.js';
import { statusGlyph } from '../render/tools/progress.js';
import type { SubagentTask } from '../types.js';
import {
  formatTaskSummary,
  renderSubagentWorkRow,
} from './background-widget.js';

function taskState(task: SubagentTask): WorkPanelItemState {
  if (['queued', 'stopping', 'running'].includes(task.status)) return 'running';
  return task.status === 'completed' ? 'done' : 'failed';
}

function completionTime(task: SubagentTask): number | undefined {
  const endedAt = task.ended_at ? Date.parse(task.ended_at) : NaN;
  return Number.isFinite(endedAt) ? endedAt : undefined;
}

export function createSubagentsWorkPanelProvider(source: {
  listTasks(): SubagentTask[];
  persistedCounts?: SubagentSessionTaskCounts;
  onTaskUpdate(notify: () => void): () => void;
  cancel(id: string, reason: string): unknown;
  open: NonNullable<WorkPanelProvider['open']>;
  openHistory?: WorkPanelProvider['openHistory'];
  theme?: () => RenderKitTheme;
}): WorkPanelProvider {
  const dismissed = new Set<string>();
  const listeners = new Set<() => void>();
  const taskById = (id: string) =>
    source.listTasks().find((task) => task.id === id);
  const visibleTasks = () =>
    source.listTasks().filter((task) => {
      // Continuing an existing task starts new work, not a dismissed outcome.
      if (taskState(task) === 'running') dismissed.delete(task.id);
      return !dismissed.has(task.id);
    });
  const rank = (task: SubagentTask) =>
    task.status === 'running' ? 0 : task.status === 'queued' ? 1 : 2;
  return {
    version: WORK_PANEL_VERSION,
    id: 'subagents',
    label: 'Agents',
    priority: 10,
    retention: 'prompt',
    visibleCount: () => visibleTasks().length,
    refreshIntervalMs: 100,
    summary: () => {
      const tasks = source.listTasks();
      const counts = { ...source.persistedCounts?.counts };
      for (const task of tasks) {
        const persistedStatus = source.persistedCounts?.statusesById.get(
          task.id,
        );
        if (persistedStatus)
          counts[persistedStatus] = (counts[persistedStatus] ?? 0) - 1;
        counts[task.status] = (counts[task.status] ?? 0) + 1;
      }
      const count = (status: SubagentTask['status']) => counts[status] ?? 0;
      const parts: WorkPanelSegment[] = [
        { text: `${count('running')} running`, role: 'meta' },
      ];
      for (const status of [
        'queued',
        'stopping',
        'completed',
        'failed',
        'cancelled',
        'interrupted',
      ] as const) {
        const total = count(status);
        if (total)
          parts.push(
            { text: ` ${resolveIcon('separator', '·')} `, role: 'meta' },
            {
              text: `${total} ${status}`,
              role: status === 'failed' ? 'error' : 'meta',
            },
          );
      }
      return {
        text: parts.map(({ text }) => text).join(''),
        segments: parts,
        running: count('running') + count('queued') + count('stopping'),
        completed: count('completed'),
        failed: count('failed') + count('cancelled') + count('interrupted'),
        total: Object.values(counts).reduce((sum, total) => sum + total, 0),
      };
    },
    listRows: () =>
      visibleTasks()
        .sort(
          (a, b) =>
            rank(a) - rank(b) ||
            Buffer.compare(
              Buffer.from(b.created_at ?? '', 'utf8'),
              Buffer.from(a.created_at ?? '', 'utf8'),
            ) ||
            Buffer.compare(
              Buffer.from(b.id, 'utf8'),
              Buffer.from(a.id, 'utf8'),
            ),
        )
        .map((task) => ({
          id: task.id,
          name: task.agent,
          primary: formatTaskSummary(task),
          status: task.status,
          state: taskState(task),
          endedAt: completionTime(task),
          statusGlyph: (now) => {
            const frame = Math.floor(now / 100);
            if (task.status === 'running') {
              const kit = getRenderKit();
              return kit
                ? kit.indicator(
                    source.theme?.() ?? { fg: (_role, text) => text },
                    undefined,
                    { status: 'running', frame },
                  ).glyph
                : statusGlyph('running', frame);
            }
            return resolveStatusGlyph(
              task.status,
              statusGlyph(task.status, 0, false),
            );
          },
          render: (width, now) =>
            renderSubagentWorkRow(task, width, now, source.theme?.()),
        })),
    detail: () => null,
    armCloseLabel: (row) => {
      const task = taskById(row.id);
      if (!task) return '';
      if (task.status === 'running') return 'cancel';
      return taskState(task) === 'running' ? '' : 'dismiss';
    },
    close: (id) => {
      const task = taskById(id);
      if (!task) return;
      if (task.status === 'running') {
        source.cancel(id, 'cancelled from work panel');
        return { action: 'cancel', providerId: 'subagents', id };
      }
      if (taskState(task) === 'running' || dismissed.has(id)) return;
      dismissed.add(id);
      for (const notify of listeners) notify();
      return { action: 'dismissed', providerId: 'subagents', id };
    },
    open: source.open,
    openHistory: source.openHistory,
    onVisibleChanged: (notify) => {
      listeners.add(notify);
      const unsubscribe = source.onTaskUpdate(notify);
      return () => {
        listeners.delete(notify);
        unsubscribe();
      };
    },
  };
}
