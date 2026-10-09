import {
  type RenderKitTheme,
  resolveIcon,
  WORK_PANEL_VERSION,
  type WorkPanelItemState,
  type WorkPanelProvider,
  type WorkPanelRow,
  type WorkPanelSegment,
} from '@thoth-agents/pi-core';
import type { SubagentSessionTaskCounts } from '../history.js';
import {
  formatDuration,
  formatTokens,
  generationSpeed,
} from '../render/tools/formatting.js';
import type { SubagentTask } from '../types.js';
import { formatTaskSummary } from './background-widget.js';
import type { SubagentProviderLimitCache } from './provider-limit-cache.js';

function taskState(task: SubagentTask): WorkPanelItemState {
  if (['queued', 'stopping', 'running'].includes(task.status)) return 'running';
  return task.status === 'completed' ? 'done' : 'failed';
}

function completionTime(task: SubagentTask): number | undefined {
  const endedAt = task.ended_at ? Date.parse(task.ended_at) : NaN;
  return Number.isFinite(endedAt) ? endedAt : undefined;
}

function finiteNonnegative(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Snapshot domain metrics here; the host owns styling, animation and width. */
function taskRow(
  task: SubagentTask,
  now: number,
  limitWarning?: string,
): WorkPanelRow {
  const summary = formatTaskSummary(task);
  const separator = ` ${resolveIcon('separator', '·')} `;
  const metrics = task.runtime_metrics;
  const speed = generationSpeed(metrics);
  const started = task.started_at ? Date.parse(task.started_at) : NaN;
  const ended = task.ended_at ? Date.parse(task.ended_at) : NaN;
  const end =
    task.status === 'running' || task.status === 'stopping' ? now : ended;
  const parts = [
    `tools ${finiteNonnegative(metrics?.toolUses) ? metrics.toolUses : '?'}`,
    `${resolveIcon('tokensIn', '↑')}${finiteNonnegative(task.usage?.input) ? formatTokens(task.usage.input) : '?'} ${resolveIcon('tokensOut', '↓')}${finiteNonnegative(task.usage?.output) ? formatTokens(task.usage.output) : '?'}`,
    `ctx ${finiteNonnegative(metrics?.contextPercent) ? `${metrics.contextPercent.toFixed(1)}%` : '?'}`,
    `${speed !== undefined ? Math.round(speed) : '?'} tok/s`,
    `elapsed ${Number.isFinite(started) && Number.isFinite(end) ? formatDuration(Math.floor(Math.max(0, end - started) / 1000) * 1000) : '?'}`,
  ];
  const warning =
    (task.status === 'running' || task.status === 'queued') &&
    task.dropped_tools?.length
      ? `${resolveIcon('warning', '⚠')} ${task.dropped_tools.length} dropped`
      : '';
  return {
    id: task.id,
    name: task.agent,
    primary: summary,
    status: task.status,
    state: taskState(task),
    endedAt: completionTime(task),
    statusGlyph: task.status,
    identity: [
      { text: task.agent.replace(/\s+/g, ' ').trim(), role: 'primary' },
      ...(summary
        ? [{ text: `${separator}${summary}`, role: 'secondary' as const }]
        : []),
      ...(warning
        ? [{ text: `${separator}${warning}`, role: 'warning' as const }]
        : []),
      ...(limitWarning
        ? [{ text: `${separator}${limitWarning}`, role: 'warning' as const }]
        : []),
    ],
    metrics: parts.map((text) => ({ segments: [{ text, role: 'meta' }] })),
  };
}

export function createSubagentsWorkPanelProvider(source: {
  listTasks(): SubagentTask[];
  /** Bounded session metadata read, cached here outside the render path. */
  listSessionTasks?(): SubagentTask[];
  persistedCounts?: SubagentSessionTaskCounts;
  providerLimits?: Pick<SubagentProviderLimitCache, 'warningText' | 'onChange'>;
  onTaskUpdate(notify: () => void): () => void;
  cancel(id: string, reason: string): unknown;
  open: NonNullable<WorkPanelProvider['open']>;
  openHistory?: WorkPanelProvider['openHistory'];
  theme?: () => RenderKitTheme;
}): WorkPanelProvider {
  let historyTasks = source.listSessionTasks?.() ?? [];
  const terminalSignature = () =>
    JSON.stringify(
      source
        .listTasks()
        .filter((task) => taskState(task) !== 'running')
        .map((task) => [task.id, task.status, task.ended_at]),
    );
  let lastTerminalSignature = terminalSignature();
  const refreshHistory = () => {
    const signature = terminalSignature();
    if (signature === lastTerminalSignature) return;
    lastTerminalSignature = signature;
    historyTasks = source.listSessionTasks?.() ?? [];
  };
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
  const discoveryTasks = () => {
    const live = visibleTasks();
    const liveIds = new Set(source.listTasks().map((task) => task.id));
    const merged = [
      ...live,
      ...historyTasks.filter(
        (task) =>
          !liveIds.has(task.id) &&
          !dismissed.has(task.id) &&
          taskState(task) !== 'running',
      ),
    ];
    return [
      ...merged.filter((task) => taskState(task) === 'running'),
      ...merged
        .filter((task) => taskState(task) !== 'running')
        .sort(
          (a, b) =>
            (completionTime(b) ?? 0) - (completionTime(a) ?? 0) ||
            b.id.localeCompare(a.id),
        )
        .slice(0, 5),
    ];
  };
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
    listRows: (now, options) =>
      (options?.includeHistory
        ? discoveryTasks()
        : visibleTasks().sort(
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
      ).map((task) =>
        taskRow(task, now, source.providerLimits?.warningText(task.id, now)),
      ),
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
      const unsubscribe = source.onTaskUpdate(() => {
        refreshHistory();
        notify();
      });
      const unsubscribeLimits = source.providerLimits?.onChange(notify);
      return () => {
        listeners.delete(notify);
        unsubscribeLimits?.();
        unsubscribe();
      };
    },
  };
}
