import {
  getRenderKit,
  type RenderKitTheme,
  type RenderStatus,
  resolveIcon,
  type SemanticGlyphName,
  WORK_PANEL_VERSION,
  type WorkPanelItemState,
  type WorkPanelMetricGroup,
  type WorkPanelMetricKey,
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

function taskRenderStatus(task: SubagentTask): RenderStatus {
  if (task.status === 'cancelled' || task.status === 'interrupted')
    return 'cancelled';
  if (
    task.status === 'failed' &&
    task.error_metadata?.category === 'total_timeout'
  )
    return 'timedOut';
  return task.status;
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
  const status = taskRenderStatus(task);
  const separator = ` ${resolveIcon('separator', '·')} `;
  const metrics = task.runtime_metrics;
  const speed = generationSpeed(metrics);
  const started = task.started_at ? Date.parse(task.started_at) : NaN;
  const ended = task.ended_at ? Date.parse(task.ended_at) : NaN;
  const end =
    task.status === 'running' || task.status === 'stopping' ? now : ended;
  // Token arrows distinguish ASCII; the tool glyph is '*' in Unicode too.
  const kit = getRenderKit();
  const ascii = resolveIcon('tokensIn', '↑') === '^';
  const label = (icon: SemanticGlyphName, text: string) =>
    ascii || !kit ? text : resolveIcon(icon);
  const live = taskState(task) === 'running';
  const parts: WorkPanelMetricGroup[] = [];
  if (task.model?.trim()) {
    const modelId = task.model.trim().split('/').at(-1) ?? task.model.trim();
    const model =
      modelId.match(/(?:^|-)claude-(sonnet|opus|haiku)(?:-|$)/i)?.[1] ??
      modelId;
    const effort =
      task.effort &&
      {
        off: 'off',
        minimal: 'min',
        low: 'lo',
        medium: 'med',
        high: 'hi',
        xhigh: 'xhi',
        max: 'max',
      }[task.effort];
    parts.push({
      key: 'model',
      columnsOnly: true,
      segments: [{ text: effort ? `${model}·${effort}` : model, role: 'meta' }],
    });
  }
  // `pending` marks a live metric with no real data yet; the sidebar blanks it at width.
  const add = (
    key: WorkPanelMetricKey,
    prefix: string,
    value: string,
    pending = false,
  ) => {
    parts.push({
      key,
      ...(pending ? { pending } : {}),
      segments: [
        { text: prefix, role: 'meta' },
        { text: value, role: 'meta' },
      ],
    });
  };
  if (finiteNonnegative(metrics?.toolUses))
    add('tools', `${label('tool', 'tools')} `, String(metrics.toolUses));
  else if (live) add('tools', `${label('tool', 'tools')} `, '?', true);
  const tokens: WorkPanelSegment[] = [];
  for (const [value, icon, text, direction] of [
    [task.usage?.input, 'tokensIn', 'in ', 'in'],
    [task.usage?.output, 'tokensOut', 'out ', 'out'],
  ] as const) {
    if (!finiteNonnegative(value) && !live) continue;
    if (tokens.length) tokens.push({ text: ' ', role: 'meta' });
    // The direction marker, not the glyph or position, drives the host's token colors.
    tokens.push(
      { text: ascii ? text : resolveIcon(icon), role: 'meta', direction },
      {
        text: finiteNonnegative(value) ? formatTokens(value) : '?',
        role: 'meta',
        direction,
      },
    );
  }
  if (tokens.length)
    parts.push({
      key: 'tokens',
      ...(live && !task.usage?.input && !task.usage?.output
        ? { pending: true }
        : {}),
      segments: tokens,
    });
  if (finiteNonnegative(metrics?.contextPercent))
    add(
      'context',
      `${label('context', 'ctx')} `,
      `${metrics.contextPercent.toFixed(1)}%`,
    );
  else if (live) add('context', `${label('context', 'ctx')} `, '?', true);
  if (speed !== undefined || live) {
    const value = speed === undefined ? '?' : String(Math.round(speed));
    if (!kit)
      parts.push({
        key: 'speed',
        ...(speed === undefined ? { pending: true } : {}),
        segments: [{ text: `${value} tok/s`, role: 'meta' }],
      });
    else
      add(
        'speed',
        `${label('throughput', 'tok/s')} `,
        value,
        speed === undefined,
      );
  }
  if (finiteNonnegative(task.usage?.cost))
    add(
      'cost',
      label('cost', '$'),
      task.usage.cost.toFixed(2),
      live && task.usage.cost === 0,
    );
  if (Number.isFinite(started) && Number.isFinite(end))
    add(
      'elapsed',
      `${label('elapsed', 'elapsed')} `,
      formatDuration(Math.floor(Math.max(0, end - started) / 1000) * 1000),
    );
  else if (live) add('elapsed', `${label('elapsed', 'elapsed')} `, '?');
  const agentName = task.agent.replace(/\s+/g, ' ').trim();
  const compactName = agentName.replace(/^thoth-(?=.)/, '');
  const warning =
    (task.status === 'running' || task.status === 'queued') &&
    task.dropped_tools?.length
      ? `${resolveIcon('warning', '⚠')} ${task.dropped_tools.length} dropped`
      : '';
  return {
    id: task.id,
    name: task.agent,
    primary: summary,
    status,
    state: taskState(task),
    endedAt: completionTime(task),
    sortStartedAt: Date.parse(task.created_at),
    statusGlyph: status,
    identity: [
      {
        text: agentName,
        // The sidebar drops the redundant bundled-specialist prefix; the host keeps `text`.
        ...(compactName && compactName !== agentName
          ? { compact: compactName }
          : {}),
        role: 'primary',
      },
      ...(summary
        ? [
            { text: separator, role: 'meta' as const },
            { text: summary, role: 'secondary' as const },
          ]
        : []),
      ...[warning, limitWarning].flatMap((text) =>
        text
          ? [
              { text: separator, role: 'meta' as const },
              { text, role: 'warning' as const },
            ]
          : [],
      ),
    ],
    metrics: parts,
  };
}

export function createSubagentsWorkPanelProvider(source: {
  listTasks(): SubagentTask[];
  /** Bounded completion-ranked terminal metadata read, cached outside the render path. */
  listCompletionRankedSessionTasks?(): SubagentTask[];
  persistedCounts?: SubagentSessionTaskCounts;
  providerLimits?: Pick<SubagentProviderLimitCache, 'warningText' | 'onChange'>;
  onTaskUpdate(notify: () => void): () => void;
  cancel(id: string, reason: string): unknown;
  open: NonNullable<WorkPanelProvider['open']>;
  openHistory?: WorkPanelProvider['openHistory'];
  theme?: () => RenderKitTheme;
}): WorkPanelProvider {
  let historyTasks = source.listCompletionRankedSessionTasks?.() ?? [];
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
    historyTasks = source.listCompletionRankedSessionTasks?.() ?? [];
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
            Buffer.compare(
              Buffer.from(b.id, 'utf8'),
              Buffer.from(a.id, 'utf8'),
            ),
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
        running: count('running') + count('stopping'),
        queued: count('queued'),
        completed: count('completed'),
        failed: count('failed'),
        cancelled: count('cancelled') + count('interrupted'),
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
