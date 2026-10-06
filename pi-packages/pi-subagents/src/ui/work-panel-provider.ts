import {
  type RenderKitTheme,
  WORK_PANEL_VERSION,
  type WorkPanelProvider,
} from '@thoth-agents/pi-core';
import { statusGlyph } from '../render/tools/progress.js';
import type { SubagentTask } from '../types.js';
import {
  formatTaskSummary,
  renderSubagentWorkRow,
} from './background-widget.js';

export function createSubagentsWorkPanelProvider(source: {
  listTasks(): SubagentTask[];
  onTaskUpdate(notify: () => void): () => void;
  cancel(id: string, reason: string): unknown;
  open: NonNullable<WorkPanelProvider['open']>;
  theme?: () => RenderKitTheme;
}): WorkPanelProvider {
  const runningTask = (id: string) =>
    source
      .listTasks()
      .find((task) => task.id === id && task.status === 'running');
  const rank = (task: SubagentTask) =>
    task.status === 'running' ? 0 : task.status === 'queued' ? 1 : 2;
  return {
    version: WORK_PANEL_VERSION,
    id: 'subagents',
    label: 'Agents',
    priority: 10,
    visibleCount: () => source.listTasks().length,
    refreshIntervalMs: 100,
    summary: () => {
      const tasks = source.listTasks();
      const count = (status: SubagentTask['status']) =>
        tasks.filter((task) => task.status === status).length;
      const parts = [`${count('running')} running`];
      for (const status of [
        'queued',
        'stopping',
        'completed',
        'failed',
        'cancelled',
        'interrupted',
      ] as const) {
        const total = count(status);
        if (total) parts.push(`${total} ${status}`);
      }
      return { text: parts.join(' · ') };
    },
    listRows: () =>
      [...source.listTasks()]
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
          statusGlyph:
            task.status === 'running'
              ? (now) => statusGlyph('running', Math.floor(now / 100))
              : statusGlyph(task.status),
          render: (width, now) =>
            renderSubagentWorkRow(task, width, now, source.theme?.()),
        })),
    detail: () => null,
    armCloseLabel: (row) => (runningTask(row.id) ? 'cancel' : ''),
    close: (id) => {
      if (!runningTask(id)) return;
      source.cancel(id, 'cancelled from work panel');
      return { action: 'cancel', providerId: 'subagents', id };
    },
    open: source.open,
    onVisibleChanged: (notify) => source.onTaskUpdate(notify),
  };
}
