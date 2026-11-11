import { stripVTControlCharacters } from 'node:util';
import { wrapTextWithAnsi } from '@earendil-works/pi-tui';
import {
  getRenderKit,
  resolveIcon,
  resolveStatusGlyph,
} from '@thoth-agents/pi-core';
import {
  HistoryPanel,
  type HistoryPanelAction,
  type HistoryPanelAdapter,
  type HistoryPanelContext,
  type HistoryPanelHeader,
  type HistoryPanelLine,
  type HistoryPanelMouseEvent,
} from '@thoth-agents/pi-core/history-panel';
import { copyToClipboardOsc52 } from '@thoth-agents/pi-core/panel';
import { truncateToWidth as terminalTruncateToWidth } from '../render/text-width.js';
import { formatDuration } from '../render/tools/formatting.js';
import {
  isValidThreadSnapshot,
  renderThreadBodyItems,
  toolArgumentSummary,
} from '../thread-view.js';
import type {
  SubagentTask,
  SubagentThreadRenderContext,
  SubagentThreadSnapshot,
  UsageStats,
} from '../types.js';
import { isTerminalStatus } from '../types.js';
import type { SubagentProviderLimitCache } from './provider-limit-cache.js';
import { agentIcon, BOX_CHARS, themeDim, themeFg } from './theme.js';

const statusRoles = {
  queued: 'dim',
  running: 'accent',
  stopping: 'warning',
  completed: 'success',
  failed: 'error',
  cancelled: 'muted',
  interrupted: 'warning',
} as const;

function relativeTime(timestamp: string | undefined): string {
  const elapsed = Date.now() - Date.parse(timestamp ?? '');
  if (!Number.isFinite(elapsed)) return '';
  const seconds = Math.max(0, Math.floor(elapsed / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function formatListDuration(task: SubagentTask, roundSeconds = false): string {
  if (task.status === 'queued') return '';
  const start = Date.parse(task.started_at ?? task.created_at);
  const end = task.ended_at ? Date.parse(task.ended_at) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '';
  const seconds = Math.max(
    0,
    Math[roundSeconds ? 'round' : 'floor']((end - start) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const label = `${hours}h${minutes % 60 || ''}${minutes % 60 ? 'm' : ''}`;
  return label.length <= 4 ? label : `${hours}h`.slice(0, 4);
}

function formatListCost(cost: number | undefined): string {
  if (cost === undefined || !Number.isFinite(cost) || cost <= 0) return '';
  for (const decimals of [2, 1, 0]) {
    const label = `$${cost.toFixed(decimals)}`;
    if (label.length <= 5) return label;
  }
  for (const [divisor, suffix] of [
    [1e3, 'k'],
    [1e6, 'm'],
    [1e9, 'b'],
  ] as const) {
    const label = `$${Math.round(cost / divisor)}${suffix}`;
    if (label.length <= 5) return label;
  }
  return '>$99b';
}

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

function formatTimeout(milliseconds: number | undefined): string | undefined {
  if (
    !Number.isFinite(milliseconds) ||
    milliseconds === undefined ||
    milliseconds <= 0
  )
    return undefined;
  let seconds = Math.max(1, Math.round(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return [
    hours ? `${hours}h` : '',
    minutes ? `${minutes}m` : '',
    seconds ? `${seconds}s` : '',
  ]
    .filter(Boolean)
    .join('');
}

function formatUsage(usage?: UsageStats): string {
  if (!usage) return '';
  const parts: string[] = [];
  if (usage.turns)
    parts.push(`${usage.turns} turn${usage.turns > 1 ? 's' : ''}`);
  if (usage.input)
    parts.push(`${resolveIcon('tokensIn', '↑')}${formatTokens(usage.input)}`);
  if (usage.output)
    parts.push(`${resolveIcon('tokensOut', '↓')}${formatTokens(usage.output)}`);
  if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  if (usage.contextTokens)
    parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
  return parts.join(' ');
}

type SubagentsHistoryPanelDisplayOptions = {
  providerLimits?: Pick<SubagentProviderLimitCache, 'warningText'>;
  currentSessionId?: string;
  extensionForTask?: (
    id: string,
  ) => { incrementMs: number; remaining: number } | undefined;
  extendDeadline?: (id: string, extra: undefined, session: string) => unknown;
  clipboardWrite?: (data: string) => void;
  requestRender?: () => void;
  timeoutMs?: number;
  stallTimeoutMs?: number;
  contextWindowForTask?: (task: SubagentTask) => number | undefined;
};

function normalizeTerminalErrorText(text: string | undefined): string {
  return text?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
}

function hasEquivalentSnapshotError(
  snapshot: SubagentThreadSnapshot,
  errorText: string,
): boolean {
  const normalized = normalizeTerminalErrorText(errorText);
  if (!normalized) return false;
  return snapshot.items.some((item) => {
    if (item.type === 'error')
      return normalizeTerminalErrorText(item.text) === normalized;
    if (item.type === 'assistant')
      return (
        normalizeTerminalErrorText(item.message.errorMessage) === normalized
      );
    return false;
  });
}

function snapshotHasActiveTools(
  snapshot: SubagentThreadSnapshot | undefined,
): boolean {
  if (!snapshot?.items?.length) return false;
  return snapshot.items.some(
    (item) =>
      (item.type === 'tool' &&
        ['pending', 'running', 'partial'].includes(item.status)) ||
      (item.type === 'bash' &&
        (item.status === undefined || item.status === 'running')),
  );
}

export class SubagentsHistoryPanel {
  private readonly panel: HistoryPanel<SubagentTask>;
  private toolOutputExpanded = false;
  private hideThinkingBlock = false;
  private detailsExpanded = false;
  private hydratedTasks = new Map<
    string,
    { signature: string; task: SubagentTask }
  >();
  private bodyCache = new Map<
    string,
    Array<{ text: string; taskId?: string }>
  >();

  constructor(
    private tasksProvider: SubagentTask[] | (() => SubagentTask[]),
    private theme: any,
    done: () => void,
    matchesKey: (data: string, key: string) => boolean,
    private visibleWidth: (text: string) => number,
    private nativeTruncateToWidth: (text: string, width: number) => string,
    private renderContext: Partial<SubagentThreadRenderContext> = {},
    maxLinesProvider: number | (() => number) = 42,
    private taskResolver?: (id: string) => SubagentTask | undefined,
    initialSelectedTaskId?: string,
    cancelSelectedTask?: (id: string) => void,
    private detailCancelShortcut = 'x',
    private displayOptions: SubagentsHistoryPanelDisplayOptions = {},
  ) {
    const adapter: HistoryPanelAdapter<SubagentTask> = {
      actions: (task) => this.actionsFor(task, cancelSelectedTask),
      views: (task) => {
        const tools = this.toolsFor(this.resolveTaskForBody(task));
        return [
          { id: 'result', label: 'Result' },
          { id: 'transcript', label: 'Transcript', followTail: true },
          { id: 'prompt', label: 'Prompt' },
          {
            id: 'tools',
            label: `Tools (${tools.length} ✗${tools.filter((tool) => this.toolFailed(tool)).length})`,
          },
          { id: 'metrics', label: 'Metrics' },
        ];
      },
      defaultView: (task) =>
        isTerminalStatus(task.status) ? 'result' : 'transcript',
      renderView: (task, view, width) => this.viewFor(task, view, width),
      items: () =>
        [...this.tasks()].sort(
          (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
        ),
      id: (task) => task.id,
      groupOf: (task) => this.groupFor(task),
      renderGroupOverview: (tasks) => {
        const counts = new Map<string, number>();
        let cost = 0;
        for (const task of tasks) {
          counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
          const taskCost = task.usage?.cost ?? 0;
          if (Number.isFinite(taskCost) && taskCost > 0) cost += taskCost;
        }
        return [
          [...counts]
            .map(([status, count]) => `${status}: ${count}`)
            .join(' · '),
          `Total cost: $${cost.toFixed(2)}`,
        ];
      },
      matchesFilter: (task, query) =>
        [task.display_name ?? '', task.agent, task.status].some((value) =>
          value.toLowerCase().includes(query.toLowerCase()),
        ),
      renderItemLabel: (task, context) => this.itemLabel(task, context),
      renderListSummary: (width) => this.listSummary(width),
      renderHeader: (task, context) => this.headerFor(task, context),
      hints: (task, state) => [
        {
          key: 'i',
          label: 'details',
          group: 'views',
          priority: 100,
          eligible: task !== undefined,
        },
        {
          key: 'ctrl+o',
          label: 'expand',
          group: 'views',
          eligible: state.viewId === 'transcript',
        },
        {
          key: 'ctrl+t',
          label: 'thinking',
          group: 'views',
          eligible: state.viewId === 'transcript',
        },
      ],
      renderContent: (task, width) => this.contentFor(task, width),
      handleInput: (data, panel) => {
        if (data === 'i' && panel.selectedItem()) {
          this.detailsExpanded = !this.detailsExpanded;
          if (this.detailsExpanded) panel.handleInput('[H');
          return true;
        }
        if (panel.getRenderDebugState().viewId !== 'transcript') return false;
        if (matchesKey(data, 'ctrl+o') || data === '\u000f') {
          this.toolOutputExpanded = !this.toolOutputExpanded;
          return true;
        }
        if (matchesKey(data, 'ctrl+t') || data === '\u0014') {
          this.hideThinkingBlock = !this.hideThinkingBlock;
          return true;
        }
        return false;
      },
      invalidate: () => {
        this.bodyCache.clear();
        this.hydratedTasks.clear();
      },
    };
    this.panel = new HistoryPanel(adapter, {
      title: 'subagents',
      listLabel: 'executions',
      emptyText: 'No subagent tasks recorded in this session yet.',
      theme: {
        fg: (role, text) => theme?.fg?.(role, text) ?? text,
        bold: (text) => theme?.bold?.(text) ?? text,
        bg: (role, text) => theme?.bg?.(role, text) ?? text,
      },
      onClose: done,
      disposeOnClose: false,
      maxLines: maxLinesProvider,
      initialSelectedId: initialSelectedTaskId ?? this.tasks()[0]?.id,
      matchesKey: (data, key) =>
        (key === this.detailCancelShortcut &&
          matchesKey(data, 'detailCancel')) ||
        matchesKey(data, key),
      visibleWidth,
      truncateToWidth: this.truncateToWidth,
      closeKey: this.detailCancelShortcut,
      // The overlay host owns its refresh timer and render requests.
      refreshMs: 0,
      requestRender: this.displayOptions.requestRender,
      titleIcon: agentIcon,
    });
  }

  private truncateToWidth = (text: string, width: number): string =>
    getRenderKit()?.icon
      ? terminalTruncateToWidth(text, width, resolveIcon('ellipsis', '…'))
      : this.nativeTruncateToWidth(text, width);

  invalidate(): void {
    this.panel.invalidate();
  }
  dispose(): void {
    this.panel.dispose();
  }
  handleMouse(event: HistoryPanelMouseEvent) {
    return this.panel.handleMouse(event);
  }
  handleInput(data: string): void {
    this.panel.handleInput(data);
  }
  render(width: number): string[] {
    return this.panel.render(width);
  }
  cancelSelectedActiveTask(): void {
    this.panel.closeSelectedItem();
  }

  getRenderDebugState() {
    const state = this.panel.getRenderDebugState();
    const task = this.panel.selectedItem();
    return {
      taskCount: state.itemCount,
      selectedIndex: state.selectedIndex,
      selectedStatus: task?.status,
      scrollOffset: state.scrollOffset,
      followTail: state.followTail,
      hasUsage: Boolean(task?.usage),
      configuredMaxLines: state.configuredMaxLines,
      renderWidth: state.renderWidth,
      renderedLineCount: state.renderedLineCount,
      bodyHeight: state.bodyHeight,
      maxVisibleWidth: state.maxVisibleWidth,
      widthViolationCount: state.widthViolationCount,
      clickableRowCount: state.clickableRowCount,
    };
  }

  private effectiveTimeoutMs(task: SubagentTask): number | undefined {
    const start = task.timeout_started_at ?? Date.parse(task.started_at ?? '');
    const deadline = task.timeout_deadline_at;
    if (
      deadline !== undefined &&
      Number.isFinite(deadline) &&
      Number.isFinite(start) &&
      deadline > start
    )
      return deadline - start;
    const configured = this.displayOptions.timeoutMs;
    const increment = this.displayOptions.extensionForTask?.(
      task.id,
    )?.incrementMs;
    return configured === undefined
      ? undefined
      : configured + (task.timeout_extensions_used ?? 0) * (increment ?? 0);
  }

  private needsAttention(task: SubagentTask): boolean {
    if (isTerminalStatus(task.status)) return false;
    if (task.pending_questions?.length || task.status === 'stopping')
      return true;
    if (task.status !== 'running') return false;
    const start = task.timeout_started_at ?? Date.parse(task.started_at ?? '');
    const deadline = task.timeout_deadline_at;
    return (
      deadline !== undefined &&
      Number.isFinite(deadline) &&
      Number.isFinite(start) &&
      deadline > start &&
      deadline - Date.now() < (deadline - start) * 0.2
    );
  }

  private groupFor(task: SubagentTask) {
    if (this.needsAttention(task))
      return { id: 'attention', label: 'Needs attention', order: 0 };
    if (task.status === 'running' || task.status === 'queued')
      return { id: 'running', label: 'Running', order: 1 };
    if (task.status === 'completed')
      return { id: 'completed', label: 'Completed', order: 2 };
    return { id: 'failed', label: 'Failed', order: 3 };
  }

  private listSummary(width: number): string {
    let attention = 0;
    let live = 0;
    let completed = 0;
    let failed = 0;
    let cost = 0;
    for (const task of this.tasks()) {
      if (this.needsAttention(task)) attention++;
      if (task.status === 'completed') completed++;
      else if (
        task.status === 'failed' ||
        task.status === 'cancelled' ||
        task.status === 'interrupted'
      )
        failed++;
      else if (!this.needsAttention(task)) live++;
      const taskCost = task.usage?.cost ?? 0;
      if (Number.isFinite(taskCost) && taskCost > 0) cost += taskCost;
    }
    const groups = [
      { count: live, status: 'running' as const, role: 'accent' as const },
      {
        count: completed,
        status: 'completed' as const,
        role: 'success' as const,
      },
      { count: failed, status: 'failed' as const, role: 'error' as const },
    ];
    const parts = groups.map(({ count, status, role }) =>
      count
        ? themeFg(this.theme, role, `${resolveStatusGlyph(status)}${count}`)
        : '',
    );
    parts.push(
      attention
        ? themeFg(
            this.theme,
            'warning',
            `${resolveIcon('warning')}${attention}`,
          )
        : '',
    );
    let costText = cost > 0 ? `$${cost.toFixed(2)}` : '';
    const join = () =>
      [parts.filter(Boolean).join(' '), costText]
        .filter(Boolean)
        .join(` ${resolveIcon('separator', '·')} `);
    if (this.visibleWidth(join()) > width) costText = '';
    for (const index of [1, 0]) {
      if (this.visibleWidth(join()) <= width) break;
      parts[index] = '';
    }
    return join();
  }

  private itemLabel(task: SubagentTask, context: HistoryPanelContext): string {
    const selection = context.selected ? resolveIcon('selection', '›') : ' ';
    // Reuse distinct kit glyphs: stop/cancel and blocked overlap in some modes.
    const statusGlyph =
      task.status === 'stopping'
        ? resolveIcon('ready', '▲')
        : task.status === 'interrupted'
          ? resolveIcon('elapsed', '◷')
          : resolveStatusGlyph(task.status);
    const attention = this.needsAttention(task) && task.status !== 'stopping';
    const glyph = themeFg(
      this.theme,
      attention ? 'warning' : (statusRoles[task.status] ?? 'dim'),
      attention ? resolveIcon('warning') : statusGlyph,
    );
    const name = task.display_name?.trim() || task.agent;
    const prefix = `${selection}${glyph} `;
    const duration = formatListDuration(task).padStart(4);
    const cost =
      context.width >= 24
        ? ` ${formatListCost(task.usage?.cost).padStart(5)}`
        : '';
    const nameWidth = Math.max(
      0,
      context.width - this.visibleWidth(prefix) - 5 - cost.length,
    );
    const clippedName = terminalTruncateToWidth(
      name,
      nameWidth,
      resolveIcon('ellipsis', '…'),
    );
    const padding = ' '.repeat(
      Math.max(0, nameWidth - this.visibleWidth(clippedName)),
    );
    return `${prefix}${clippedName}${padding} ${duration}${cost}`;
  }

  private contextFor(task: SubagentTask) {
    let window = task.runtime_metrics?.contextWindow;
    try {
      window ??= this.displayOptions.contextWindowForTask?.(task);
    } catch {}
    if (window === undefined || !Number.isFinite(window) || window <= 0)
      window = undefined;
    const tokens =
      task.runtime_metrics?.contextTokens ?? task.usage?.contextTokens;
    const measuredPercent = task.runtime_metrics?.contextPercent;
    const percent =
      window !== undefined && tokens !== undefined
        ? (tokens / window) * 100
        : measuredPercent !== undefined && Number.isFinite(measuredPercent)
          ? measuredPercent
          : undefined;
    return { window, tokens, percent };
  }

  private headerFor(
    task: SubagentTask,
    context: HistoryPanelContext,
  ): HistoryPanelHeader {
    const current = this.resolveTaskForBody(task);
    const width = context.width;
    const fg = (role: Parameters<typeof themeFg>[1], text: string) =>
      themeFg(this.theme, role, text);
    const sep = ` ${resolveIcon('separator', '·')} `;
    const role = statusRoles[current.status] ?? 'dim';
    const glyph = fg(
      role,
      resolveStatusGlyph(
        current.status === 'interrupted' ? 'blocked' : current.status,
      ),
    );
    const usage = current.usage;
    const { window, percent } = this.contextFor(current);
    const knownWindow = window !== undefined && percent !== undefined;
    const percentText = percent === undefined ? '' : `${Math.round(percent)}%`;
    const contextRole =
      (percent ?? 0) > 90
        ? 'error'
        : (percent ?? 0) > 70
          ? 'warning'
          : 'success';
    const ascii = resolveIcon('boxHorizontal', '─') === '-';
    let barCells = knownWindow ? 10 : 0;
    let relative =
      isTerminalStatus(current.status) && current.ended_at
        ? relativeTime(current.ended_at)
        : '';
    let turns = usage?.turns === undefined ? '' : `${usage.turns} turns`;
    let effort = current.effort ?? 'default/current';
    let model = current.model ?? 'default/current';
    let agent = current.agent;
    let name = current.display_name?.trim() || current.agent;
    const cost = `$${(usage?.cost ?? 0).toFixed(2)}`;
    const duration = formatListDuration(current, true) || '0s';
    const active = current.status === 'running';
    const effectiveMs = this.effectiveTimeoutMs(current);
    const timeout = formatTimeout(effectiveMs);
    const nearDeadline =
      current.timeout_deadline_at !== undefined &&
      effectiveMs !== undefined &&
      current.timeout_deadline_at - Date.now() < effectiveMs * 0.2;
    let timeoutSuffix =
      active && timeout
        ? ` ${fg(nearDeadline ? 'warning' : 'dim', `/ ${timeout}`)}`
        : '';
    const activityAge = active ? relativeTime(current.last_activity_at) : '';
    const elapsedActivity =
      Date.now() - Date.parse(current.last_activity_at ?? '');
    const stalled =
      active &&
      this.displayOptions.stallTimeoutMs !== undefined &&
      elapsedActivity > this.displayOptions.stallTimeoutMs;
    let activity = activityAge
      ? stalled
        ? fg('warning', `${resolveIcon('warning', '⚠')} stalled ${activityAge}`)
        : fg('dim', `last activity ${activityAge} ago`)
      : '';
    const line1 = () =>
      `${glyph} ${name}${agent ? `  ${agent}` : ''}${sep}${fg(role, current.status)}${relative ? ` ${relative} ago` : ''}${active ? ' ' : sep}${duration}${timeoutSuffix}${activity ? sep + activity : ''}`;
    const line2 = () => {
      const filled = Math.max(
        0,
        Math.min(barCells, Math.round(((percent ?? 0) / 100) * barCells)),
      );
      const bar = barCells
        ? (ascii ? '#' : '█').repeat(filled) +
          (ascii ? '-' : '░').repeat(barCells - filled)
        : '';
      const ctx = [bar, percentText].filter(Boolean).join(' ');
      return ` ${[model, effort, turns, ctx ? `ctx ${fg(contextRole, ctx)}` : ''].filter(Boolean).join(sep)}`;
    };
    const fits = () =>
      this.visibleWidth(line1()) + 1 + this.visibleWidth(cost) <= width &&
      this.visibleWidth(line2()) <= width;
    while (!fits() && barCells > 6) barCells--;
    if (!fits()) relative = '';
    if (!fits()) turns = '';
    if (!fits()) effort = '';
    while (!fits() && this.visibleWidth(model) > 12) {
      model = terminalTruncateToWidth(
        model,
        this.visibleWidth(model) - 1,
        resolveIcon('ellipsis', '…'),
      );
    }
    if (!fits()) agent = '';
    if (!fits()) barCells = 0;
    if (!fits()) timeoutSuffix = '';
    // Prefer shortening the name to hiding live diagnostics.
    if (
      this.visibleWidth(line1()) -
        this.visibleWidth(name) +
        this.visibleWidth(resolveIcon('ellipsis', '…')) +
        1 +
        this.visibleWidth(cost) >
      width
    )
      activity = '';
    const availableName = Math.max(
      1,
      width -
        this.visibleWidth(line1()) +
        this.visibleWidth(name) -
        1 -
        this.visibleWidth(cost),
    );
    name = terminalTruncateToWidth(
      name,
      availableName,
      resolveIcon('ellipsis', '…'),
    );
    const first = line1();
    const rows = [
      first +
        ' '.repeat(
          Math.max(
            1,
            width - this.visibleWidth(first) - this.visibleWidth(cost),
          ),
        ) +
        cost,
      line2(),
    ];
    const warning = this.displayOptions.providerLimits?.warningText(current.id);
    if (warning) rows.push(fg('warning', `limit: ${warning}`));
    return { variableRows: true, wideRows: rows, narrowRows: rows };
  }

  private detailsFor(task: SubagentTask, width: number): HistoryPanelLine[] {
    const usage = task.usage;
    const fields: [string, string][] = [
      ['Input', formatTokens(usage?.input ?? 0)],
      ['Output', formatTokens(usage?.output ?? 0)],
      ['Cache read', formatTokens(usage?.cacheRead ?? 0)],
      ['Cache write', formatTokens(usage?.cacheWrite ?? 0)],
    ];
    const lines: string[] = [];
    const field = (label: string, value: string, columns: number) => {
      const valueWidth = Math.max(1, columns - 12);
      // Wrap, never cap or truncate: IDs and even unbroken task tokens retain every character.
      const wrapped = this.wrap(value, valueWidth);
      return wrapped.map(
        (value, index) =>
          themeDim(this.theme, (index ? '' : label).padEnd(12)) + value,
      );
    };
    const columns = width >= 70 ? 2 : 1;
    const columnWidth = columns === 2 ? Math.floor((width - 2) / 2) : width;
    const cells = fields.map(([label, value]) =>
      field(label, value, columnWidth),
    );
    for (let i = 0; i < cells.length; i += columns) {
      const left = cells[i] ?? [];
      const right = columns === 2 ? (cells[i + 1] ?? []) : [];
      for (let row = 0; row < Math.max(left.length, right.length); row++) {
        const text = left[row] ?? '';
        lines.push(
          columns === 1
            ? text
            : text +
                ' '.repeat(
                  Math.max(0, columnWidth - this.visibleWidth(text)) + 2,
                ) +
                (right[row] ?? ''),
        );
      }
    }
    const { window: contextWindow, tokens, percent } = this.contextFor(task);
    const context = `${formatTokens(tokens ?? 0)}${contextWindow ? ` / ${formatTokens(contextWindow)}` : ''}${percent === undefined ? '' : ` (${Math.round(percent)}%)`}`;
    lines.push(...field('Context', context, width));
    const timeout = formatTimeout(this.effectiveTimeoutMs(task));
    const remaining =
      task.timeout_deadline_at === undefined
        ? undefined
        : task.timeout_deadline_at <= Date.now()
          ? '0s'
          : formatTimeout(task.timeout_deadline_at - Date.now());
    const extensions =
      task.timeout_extensions_used === undefined
        ? undefined
        : `extended ${task.timeout_extensions_used}${task.timeout_max_extensions === undefined ? '' : `/${task.timeout_max_extensions}`}`;
    const timeoutParts = [
      timeout,
      remaining
        ? `${remaining.replace(/(?<=[hm])(?=\d)/g, ' ')} left`
        : undefined,
      extensions,
    ].filter(Boolean);
    if (timeoutParts.length)
      lines.push(
        ...field(
          'Timeout',
          timeoutParts.join(` ${resolveIcon('separator', '·')} `),
          width,
        ),
      );
    if (task.session_id)
      lines.push(...field('Session', task.session_id, width));
    lines.push(...field('Task', task.task, width), '');
    return lines.map((text) => ({ text }));
  }

  private toolsFor(task: SubagentTask) {
    return isValidThreadSnapshot(task.thread_snapshot)
      ? task.thread_snapshot.items.filter(
          (item) => item.type === 'tool' || item.type === 'bash',
        )
      : [];
  }

  private toolFailed(
    tool: ReturnType<SubagentsHistoryPanel['toolsFor']>[number],
  ): boolean {
    return (
      tool.status === 'failed' ||
      tool.status === 'cancelled' ||
      (tool.type === 'bash'
        ? (tool.exitCode !== undefined && tool.exitCode !== 0) ||
          tool.cancelled === true
        : tool.result?.isError === true)
    );
  }

  /** Shared unwrapped Result text: rendering and clipboard must never diverge. */
  private resultText(task: SubagentTask): string {
    if (!isTerminalStatus(task.status))
      return 'Still running — no result yet. Press 2 for the live Transcript.';
    return ['failed', 'cancelled', 'interrupted'].includes(task.status)
      ? `✗ Failed — ${task.error || task.result || task.status}`
      : task.result || 'No result recorded.';
  }

  private actionsFor(
    task: SubagentTask,
    cancel?: (id: string) => void,
  ): HistoryPanelAction<SubagentTask>[] {
    const current = this.resolveTaskForBody(task);
    const name = current.display_name || current.agent;
    const extension = this.displayOptions.extensionForTask?.(current.id);
    const session = this.displayOptions.currentSessionId;
    return [
      ...(this.detailCancelShortcut
        ? [
            {
              key: this.detailCancelShortcut,
              label: 'cancel active',
              eligible:
                current.status === 'queued' || current.status === 'running',
              confirm: () =>
                `⚠ Cancel ${name}? Stops the running task. Enter confirm · Esc keep`,
              run: () => {
                cancel?.(current.id);
              },
            },
          ]
        : []),
      {
        key: 'e',
        label: 'extend',
        eligible:
          current.status === 'running' &&
          !!session &&
          current.session_id === session &&
          current.timeout_deadline_at !== undefined &&
          !!extension &&
          extension.remaining > 0 &&
          !!this.displayOptions.extendDeadline,
        confirm: () =>
          `⚠ Extend ${name} by ${formatTimeout(extension?.incrementMs)}? ${extension?.remaining} extensions left. Enter confirm · Esc back`,
        run: () =>
          Promise.resolve(
            this.displayOptions.extendDeadline?.(
              current.id,
              undefined,
              session!,
            ),
          ).then(() => {}),
      },
      {
        key: 'y',
        label: 'copy',
        eligible:
          isTerminalStatus(current.status) &&
          !!stripVTControlCharacters(
            current.error || current.result || '',
          ).trim(),
        run: () => {
          const result = copyToClipboardOsc52(
            this.displayOptions.clipboardWrite,
            this.resultText(current),
          );
          return result === 'ok'
            ? { text: '✓ Result copied', role: 'success' }
            : {
                text:
                  result === 'too-large'
                    ? '⚠ Result too large to copy'
                    : '⚠ Copy not supported by this terminal',
                role: 'warning',
              };
        },
      },
    ];
  }

  private viewFor(
    task: SubagentTask,
    view: string,
    width: number,
  ): HistoryPanelLine[] {
    const current = this.resolveTaskForBody(task);
    return [
      ...(this.detailsExpanded ? this.detailsFor(current, width) : []),
      ...this.viewBodyFor(current, view, width),
    ];
  }

  private viewBodyFor(
    current: SubagentTask,
    view: string,
    width: number,
  ): HistoryPanelLine[] {
    const lines = (text: string, role?: Parameters<typeof themeFg>[1]) =>
      this.wrap(text, width).map((text) => ({
        text: role ? themeFg(this.theme, role, text) : text,
      }));
    if (view === 'result') {
      const questions = !isTerminalStatus(current.status)
        ? (current.pending_questions ?? [])
        : [];
      const pending = questions.length
        ? [
            '⚠ Waiting for an answer from the main chat',
            ...questions.map((question) => question.message),
            'Reply in the main chat with root — this panel is read-only.',
          ].flatMap((text) =>
            this.wrap(text, Math.max(1, width - 2)).map((text) => ({
              text: themeFg(
                this.theme,
                'warning',
                `${resolveIcon('boxVertical', '│')} ${text}`,
              ),
            })),
          )
        : [];
      const failed = ['failed', 'cancelled', 'interrupted'].includes(
        current.status,
      );
      return [
        ...pending,
        ...lines(this.resultText(current), failed ? 'error' : undefined),
      ];
    }
    if (view === 'prompt')
      return lines(
        [
          current.task,
          current.context
            ? `
Context
${current.context}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    if (view === 'metrics') {
      const {
        window: contextWindow,
        tokens,
        percent,
      } = this.contextFor(current);
      const fields: [string, string][] = [
        ['Status', current.status],
        ['Agent', current.agent],
        ['Model', current.model ?? 'default/current'],
        ['Effort', current.effort ?? 'default/current'],
        [
          'Turns',
          String(current.usage?.turns ?? current.runtime_metrics?.turns ?? 0),
        ],
        ['Started', current.started_at ?? '—'],
        ['Ended', current.ended_at ?? '—'],
        ['Duration', formatListDuration(current) || '—'],
        ['Timeout', formatTimeout(this.effectiveTimeoutMs(current)) ?? '—'],
        [
          'Extensions',
          `${current.timeout_extensions_used ?? 0}/${current.timeout_max_extensions ?? '—'}`,
        ],
        ['Input', formatTokens(current.usage?.input ?? 0)],
        ['Output', formatTokens(current.usage?.output ?? 0)],
        ['Cache read', formatTokens(current.usage?.cacheRead ?? 0)],
        ['Cache write', formatTokens(current.usage?.cacheWrite ?? 0)],
        ['Cost', `$${(current.usage?.cost ?? 0).toFixed(4)}`],
        [
          'Context',
          `${formatTokens(tokens ?? 0)}${contextWindow ? ` / ${formatTokens(contextWindow)}` : ''}${percent === undefined ? '' : ` (${Math.round(percent)}%)`}`,
        ],
        ['Session', current.session_id ?? '—'],
        ['Task id', current.id],
      ];
      return fields.flatMap(([label, value]) =>
        this.wrap(value, Math.max(1, width - 14)).map((text, index) => ({
          text: themeDim(this.theme, (index ? '' : label).padEnd(14)) + text,
        })),
      );
    }
    // A retained textual transcript is execution detail too; only Tools requires a structured snapshot.
    if (view === 'transcript' && current.transcript?.trim())
      return this.contentFor(current, width);
    if (!isValidThreadSnapshot(current.thread_snapshot))
      return [
        ...lines(
          `${resolveStatusGlyph('deleted')} Execution detail no longer retained`,
          'warning',
        ),
        ...lines(
          'It was pruned by history retention or never recorded.',
          'dim',
        ),
        ...lines(
          'Result (1), Prompt (3) and Metrics (5) show what was kept.',
          'dim',
        ),
      ];
    if (view === 'transcript') return this.contentFor(current, width);
    const tools = this.toolsFor(current).map((tool, index) => ({
      tool,
      index,
    }));
    const started = (entry: (typeof tools)[number]) => {
      const timestamp =
        entry.tool.type === 'tool'
          ? Date.parse(entry.tool.started_at ?? '')
          : NaN;
      return Number.isFinite(timestamp) ? timestamp : Infinity;
    };
    tools.sort(
      (a, b) =>
        Number(this.toolFailed(b.tool)) - Number(this.toolFailed(a.tool)) ||
        started(a) - started(b) ||
        a.index - b.index,
    );
    const targetWidth = Math.max(1, width - 30);
    const cell = (text: string, cells: number) => {
      const clipped = this.truncateToWidth(text.replace(/\s+/g, ' '), cells);
      return (
        clipped + ' '.repeat(Math.max(0, cells - this.visibleWidth(clipped)))
      );
    };
    const row = (
      status: string,
      name: string,
      target: string,
      duration: string,
      exit: string,
    ) =>
      `${cell(status, 2)} ${cell(name, 12)} ${cell(target, targetWidth)} ${duration.padStart(7)} ${exit.padStart(5)}`;
    return [
      {
        text: themeDim(
          this.theme,
          row('St', 'Tool', 'Target', 'Duration', 'Exit'),
        ),
      },
      {
        text: themeDim(
          this.theme,
          resolveIcon('boxHorizontal', '─').repeat(width),
        ),
      },
      ...tools.map(({ tool }) => {
        const failed = this.toolFailed(tool);
        const duration =
          tool.type === 'tool' &&
          Number.isFinite(Date.parse(tool.started_at ?? '')) &&
          Number.isFinite(Date.parse(tool.ended_at ?? ''))
            ? formatDuration(
                Math.max(
                  0,
                  Date.parse(tool.ended_at ?? '') -
                    Date.parse(tool.started_at ?? ''),
                ),
              )
            : '—';
        const name = tool.type === 'bash' ? 'bash' : tool.name;
        const target = toolArgumentSummary(
          name,
          tool.type === 'bash' ? { command: tool.command } : tool.arguments,
        );
        const status = resolveStatusGlyph(
          failed
            ? 'failed'
            : tool.status === 'partial'
              ? 'running'
              : (tool.status ?? 'running'),
        );
        const prefix = `${themeFg(this.theme, failed ? 'error' : tool.status === 'completed' ? 'success' : 'accent', cell(status, 2))} ${cell(name, 12)} ${themeDim(this.theme, cell(target, targetWidth))} ${duration.padStart(7)} `;
        const exit =
          tool.type === 'bash' && tool.exitCode !== undefined
            ? themeFg(
                this.theme,
                tool.exitCode === 0 ? 'success' : 'error',
                String(tool.exitCode).padStart(5),
              )
            : ' '.repeat(5);
        return { text: prefix + exit };
      }),
    ];
  }

  private contentFor(task: SubagentTask, width: number): HistoryPanelLine[] {
    const currentTask = this.resolveTaskForBody(task);
    const structured = isValidThreadSnapshot(currentTask.thread_snapshot);
    const body = this.bodyEntriesFor(currentTask, width);
    const entries = structured ? body : this.wrapWithTaskIds(body, width);
    return [
      ...entries.map(({ text, taskId }) => ({
        text: structured ? text : this.renderFlowLine(text, width),
        itemId: taskId,
      })),
    ];
  }

  private tasks(): SubagentTask[] {
    return typeof this.tasksProvider === 'function'
      ? this.tasksProvider()
      : this.tasksProvider;
  }

  private renderFlowLine(raw: string, width: number): string {
    const th = this.theme;
    if (raw.startsWith('Preparing for response') || /^\*\*.+\*\*$/.test(raw)) {
      const clipped = this.truncateToWidth(raw, width);
      const text = th?.bold?.(clipped) ?? clipped;
      return th?.fg?.('dim', text) ?? text;
    }
    if (this.isToolLikeLine(raw)) {
      const border = (t: string) => themeFg(th, 'accent', t);
      const prefix = border(`${BOX_CHARS.vertical} `);
      const maxTextWidth = Math.max(0, width - 2);
      const clipped = this.truncateToWidth(raw, maxTextWidth);
      const text = th?.fg?.('toolTitle', clipped) ?? clipped;
      return `${prefix}${text}`;
    }
    if (raw.startsWith('done') || raw.startsWith('completed')) {
      const clipped = this.truncateToWidth(raw, width);
      return th?.fg?.('success', clipped) ?? clipped;
    }
    if (raw.startsWith('failed') || raw.startsWith('error')) {
      const clipped = this.truncateToWidth(raw, width);
      return th?.fg?.('error', clipped) ?? clipped;
    }
    if (
      raw.startsWith('# ') ||
      raw.startsWith('## ') ||
      raw.startsWith('### ')
    ) {
      const border = (t: string) => themeFg(th, 'accent', t);
      const titleText = raw.replace(/^#+\s*/, '');
      const maxTitle = Math.max(4, width - 8);
      const clippedTitle = this.truncateToWidth(titleText, maxTitle);
      const heading =
        th?.bold?.(th?.fg?.('mdHeading', clippedTitle) ?? clippedTitle) ??
        clippedTitle;
      const leftFrame = `${border(BOX_CHARS.topLeft + BOX_CHARS.horizontal + ' ')}${heading} `;
      const leftVisWidth = this.visibleWidth(leftFrame);
      const rightCorner = border(BOX_CHARS.topRight);
      const rightVisWidth = this.visibleWidth(rightCorner);
      const filler = Math.max(0, width - leftVisWidth - rightVisWidth);
      const framed = `${leftFrame}${border(BOX_CHARS.horizontal.repeat(filler))}${rightCorner}`;
      return framed;
    }
    if (raw.startsWith('  ')) {
      const clipped = this.truncateToWidth(raw, width);
      return th?.fg?.('dim', clipped) ?? clipped;
    }
    return this.truncateToWidth(raw, width);
  }

  private taskSignature(task: SubagentTask): string {
    const {
      thread_snapshot: snapshot,
      transcript: _transcript,
      ...metadata
    } = task;
    return JSON.stringify([
      metadata,
      snapshot?.updated_at,
      snapshot?.items?.length,
    ]);
  }

  private resolveTaskForBody(task: SubagentTask): SubagentTask {
    if (task.thread_snapshot || !this.taskResolver) return task;
    const signature = this.taskSignature(task);
    const cached = this.hydratedTasks.get(task.id);
    if (cached?.signature === signature) return cached.task;
    const hydrated = this.taskResolver(task.id) ?? task;
    this.hydratedTasks.set(task.id, { signature, task: hydrated });
    return hydrated;
  }

  private bodyCacheKey(task: SubagentTask, width: number): string {
    return [
      'transcript',
      JSON.stringify(task),
      width,
      this.toolOutputExpanded ? 'expanded' : 'collapsed',
      this.hideThinkingBlock ? 'thinking-hidden' : 'thinking-visible',
    ].join('|');
  }

  private resolveTaskIdFromSnapshotItem(
    item: any,
    tasks: SubagentTask[],
  ): string | undefined {
    if (!item) return undefined;
    const directId =
      item.taskId ?? item.task_id ?? item.subagentTaskId ?? item.subtaskId;
    if (typeof directId === 'string' && directId.trim()) return directId.trim();

    const details = item.result?.details;
    if (details) {
      if (typeof details.task?.id === 'string' && details.task.id.trim())
        return details.task.id.trim();
      if (typeof details.task_id === 'string' && details.task_id.trim())
        return details.task_id.trim();
      if (typeof details.taskId === 'string' && details.taskId.trim())
        return details.taskId.trim();
      if (Array.isArray(details.tasks) && details.tasks[0]?.id)
        return String(details.tasks[0].id).trim();
      if (Array.isArray(details.task_ids) && details.task_ids[0])
        return String(details.task_ids[0]).trim();
    }

    const resultTaskId =
      item.result?.task_id ?? item.result?.taskId ?? item.result?.task?.id;
    if (typeof resultTaskId === 'string' && resultTaskId.trim())
      return resultTaskId.trim();

    const argsTaskId =
      item.arguments?.task_id ??
      item.arguments?.taskId ??
      item.arguments?.task?.id;
    if (typeof argsTaskId === 'string' && argsTaskId.trim())
      return argsTaskId.trim();

    const toolName = typeof item.name === 'string' ? item.name : '';
    const isSubagentTool =
      toolName === 'subagent_run' ||
      toolName === 'subagent_continue' ||
      toolName === 'subagent' ||
      toolName.startsWith('subagent');

    if (isSubagentTool || item.type === 'subagent') {
      const agentCandidate = item.arguments?.agent ?? item.arguments?.name;
      if (typeof agentCandidate === 'string' && agentCandidate.trim()) {
        const found = tasks.find(
          (t) =>
            t.id === agentCandidate ||
            t.agent === agentCandidate ||
            t.display_name === agentCandidate,
        );
        if (found) return found.id;
      }
      const taskCandidate = item.arguments?.task;
      if (typeof taskCandidate === 'string' && taskCandidate.trim()) {
        const found = tasks.find(
          (t) => t.task === taskCandidate || t.display_name === taskCandidate,
        );
        if (found) return found.id;
      }
    }

    return undefined;
  }

  private resolveTaskIdFromFlowLine(
    line: string,
    tasks: SubagentTask[],
  ): { cleanLine: string; taskId?: string } {
    const trimmed = line.trim();
    if (!trimmed) return { cleanLine: line };

    if (
      trimmed.startsWith('subagent:') ||
      trimmed.startsWith('model:') ||
      trimmed.startsWith('usage:') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('Preparing for response') ||
      trimmed.startsWith('done') ||
      trimmed.startsWith('completed') ||
      trimmed.startsWith('failed') ||
      trimmed.startsWith('error')
    ) {
      return { cleanLine: line };
    }

    let cleanLine = line;
    let taskId: string | undefined;

    const rawIdMatch = line.match(/\b(subtask_[a-zA-Z0-9_-]+)\b/);
    if (rawIdMatch) {
      taskId = rawIdMatch[1];
      cleanLine = cleanLine
        .replace(/\s*[([]?subtask_[a-zA-Z0-9_-]+[)\]]?/g, '')
        .replace(/\s{2,}/g, ' ')
        .trimEnd();
    }

    if (!taskId) {
      if (trimmed === 'main') {
        const found = tasks.find((t) => t.id === 'main' || t.agent === 'main');
        if (found) taskId = found.id;
      }

      const subagentMatch = trimmed.match(/^subagent\s+([^\s:]+)/);
      if (subagentMatch) {
        const agentName = subagentMatch[1]!;
        const found = tasks.find(
          (t) =>
            t.id === agentName ||
            t.agent === agentName ||
            t.display_name === agentName,
        );
        if (found) taskId = found.id;
      }

      const bulletMatch = trimmed.match(/^(?:󰣇|●|○)\s+([^\s:]+)/);
      if (bulletMatch) {
        const agentName = bulletMatch[1]!;
        const found = tasks.find(
          (t) =>
            t.id === agentName ||
            t.agent === agentName ||
            t.display_name === agentName,
        );
        if (found) taskId = found.id;
      }

      if (!taskId) {
        for (const t of tasks) {
          if (
            t.agent &&
            (trimmed.startsWith(`${t.agent} `) ||
              trimmed.startsWith(`${t.agent}:`) ||
              trimmed === t.agent)
          ) {
            taskId = t.id;
            break;
          }
          if (
            t.display_name &&
            (trimmed.startsWith(`${t.display_name} `) ||
              trimmed.startsWith(`${t.display_name}:`) ||
              trimmed === t.display_name)
          ) {
            taskId = t.id;
            break;
          }
        }
      }
    }

    return { cleanLine, taskId };
  }

  private wrapWithTaskIds(
    entries: Array<{ text: string; taskId?: string }>,
    width: number,
  ): Array<{ text: string; taskId?: string }> {
    const out: Array<{ text: string; taskId?: string }> = [];
    for (const entry of entries) {
      const wrappedTexts = this.wrap(entry.text, width);
      for (const text of wrappedTexts) {
        out.push({ text, taskId: entry.taskId });
      }
    }
    return out;
  }

  private executionFlowEntriesFor(
    task: SubagentTask,
  ): Array<{ text: string; taskId?: string }> {
    const rawFlow = this.executionFlowFor(task);
    const rawLines = rawFlow.split('\n');
    const tasks = this.tasks();
    return rawLines.map((line) => {
      const { cleanLine, taskId } = this.resolveTaskIdFromFlowLine(line, tasks);
      return { text: cleanLine, taskId };
    });
  }

  private bodyEntriesFor(
    task: SubagentTask,
    width: number,
  ): Array<{ text: string; taskId?: string }> {
    const activeSnapshot = isValidThreadSnapshot(task.thread_snapshot)
      ? task.thread_snapshot
      : undefined;
    const allowCache = !snapshotHasActiveTools(activeSnapshot);
    const cacheKey = this.bodyCacheKey(task, width);
    if (allowCache) {
      const cached = this.bodyCache.get(cacheKey);
      if (cached) return cached;
    }
    let entries: Array<{ text: string; taskId?: string }>;
    if (activeSnapshot) {
      const snapshotItems = [...activeSnapshot.items];
      const delegatedPromptIndex = snapshotItems.findIndex((item) => {
        if (item.type !== 'user') return false;
        const label = item.label;
        return item.id === 'delegated-prompt' || label === 'delegated_task';
      });
      if (delegatedPromptIndex >= 0) {
        const item = snapshotItems[delegatedPromptIndex];
        if (item?.type === 'user') {
          snapshotItems[delegatedPromptIndex] = {
            ...item,
            label: 'delegated_task',
            text: task.task,
          };
        }
      } else {
        let insertionIndex = snapshotItems[0]?.type === 'attempt' ? 1 : 0;
        while (true) {
          const item = snapshotItems[insertionIndex];
          if (item?.type !== 'user' || item.label !== 'context') break;
          insertionIndex++;
        }
        snapshotItems.splice(insertionIndex, 0, {
          type: 'user',
          id: 'delegated-prompt',
          label: 'delegated_task',
          text: task.task,
        });
      }
      const snapshotToRender = {
        ...activeSnapshot,
        items: snapshotItems,
      };

      const context = {
        ...this.renderContext,
        theme: this.renderContext.theme ?? this.theme,
        cwd: this.renderContext.cwd ?? process.cwd(),
        taskId: task.id,
        visibleWidth: this.renderContext.visibleWidth ?? this.visibleWidth,
        truncateToWidth: getRenderKit()?.icon
          ? this.truncateToWidth
          : (this.renderContext.truncateToWidth ?? this.truncateToWidth),
        renderWidth: width,
        toolOutputExpanded: this.toolOutputExpanded,
        hideThinkingBlock: this.hideThinkingBlock,
        includeFullDelegatedTask: true,
      };
      const renderedItems = renderThreadBodyItems(snapshotToRender, context);
      const renderedLines = renderedItems.flatMap((item) => item.lines);
      const rawLines = renderedLines.length ? renderedLines : [''];
      const knownTasks = this.tasks();

      if (renderedItems.length <= 1) {
        const taskId = renderedItems[0]
          ? this.resolveTaskIdFromSnapshotItem(
              renderedItems[0].item,
              knownTasks,
            )
          : undefined;
        entries = rawLines.map((text) => {
          const resolved = taskId
            ? { cleanLine: text, taskId }
            : this.resolveTaskIdFromFlowLine(text, knownTasks);
          return { text: resolved.cleanLine, taskId: resolved.taskId };
        });
      } else {
        const itemSlices = renderedItems.map(({ item, lines }) => ({
          lines,
          taskId: this.resolveTaskIdFromSnapshotItem(item, knownTasks),
        }));
        const flatLines = itemSlices.flatMap((slice) => slice.lines);
        if (
          flatLines.length === rawLines.length &&
          flatLines.join('\n') === rawLines.join('\n')
        ) {
          entries = itemSlices.flatMap((slice) =>
            slice.lines.map((text) => {
              const resolved = slice.taskId
                ? { cleanLine: text, taskId: slice.taskId }
                : this.resolveTaskIdFromFlowLine(text, knownTasks);
              return { text: resolved.cleanLine, taskId: resolved.taskId };
            }),
          );
        } else {
          entries = rawLines.map((lineText) => {
            const resolved = this.resolveTaskIdFromFlowLine(
              lineText,
              knownTasks,
            );
            return { text: resolved.cleanLine, taskId: resolved.taskId };
          });
        }
      }

      if (
        (task.status === 'failed' || task.status === 'cancelled') &&
        task.error &&
        !hasEquivalentSnapshotError(activeSnapshot, task.error)
      ) {
        entries.push({ text: '' }, { text: '# error' }, { text: task.error });
      }
      // Cache physical rows so both layouts use the same scroll offsets.
      entries = entries.flatMap((entry) =>
        entry.text.split(/\r?\n|\r/).map((text) => ({
          ...entry,
          text: terminalTruncateToWidth(text.replace(/\t/g, '  '), width),
        })),
      );
    } else {
      entries = this.executionFlowEntriesFor(task);
    }
    if (!allowCache) return entries;
    this.bodyCache.set(cacheKey, entries);
    if (this.bodyCache.size > 50) {
      const oldest = this.bodyCache.keys().next().value;
      if (oldest !== undefined) this.bodyCache.delete(oldest);
    }
    return entries;
  }

  private executionFlowFor(task: SubagentTask): string {
    const usage = formatUsage(task.usage);
    const hasResp =
      typeof task.result === 'string' && task.result.trim().length > 0;
    const parts = [
      `subagent: ${task.agent} ${resolveIcon('separator', '·')} status: ${task.status} ${resolveIcon('separator', '·')} attempt: ${task.attempt ?? 1} ${resolveIcon('separator', '·')} effort: ${task.effort ?? 'default/current'}`,
      `model: ${task.model ?? 'default/current'}`,
      usage ? `usage: ${usage}` : undefined,
      '',
      hasResp ? 'Preparing for response' : undefined,
      hasResp ? '' : undefined,
      ['# delegated task', task.task].join('\n'),
      task.context ? ['', '# context', task.context].join('\n') : undefined,
      task.continuation_prompt
        ? ['', '# continuation prompt', task.continuation_prompt].join('\n')
        : undefined,
      usage ? ['', '# usage', usage].join('\n') : undefined,
      task.transcript
        ? ['', '# execution', this.cleanTranscript(task.transcript)].join('\n')
        : undefined,
      task.error ? ['', '# error', task.error].join('\n') : undefined,
      isTerminalStatus(task.status) && !task.thread_snapshot && !task.transcript
        ? 'execution detail expired (final response and task metadata retained)'
        : undefined,
      hasResp
        ? ['', '# response sent to orchestrator', task.result].join('\n')
        : undefined,
      !task.transcript && !hasResp && !task.error
        ? [
            '',
            '# activity',
            `${task.last_activity ?? 'queued'}${task.output_preview ? `\n${task.output_preview}` : ''}`,
          ].join('\n')
        : undefined,
    ].filter(Boolean);
    return parts.join('\n').trim();
  }

  private cleanTranscript(transcript: string): string {
    return transcript
      .replace(/^# orchestrator prompt[\s\S]*?## delegated task\n/m, '')
      .replace(/\n# final assistant text[\s\S]*$/m, '')
      .replace(/\n# response sent to orchestrator[\s\S]*$/m, '')
      .split('\n')
      .filter((line) => !this.isNoiseLine(line))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private isToolLikeLine(raw: string): boolean {
    return (
      raw.startsWith('subagent ') ||
      raw.startsWith('memory_') ||
      raw.startsWith('read ') ||
      raw.startsWith('bash ') ||
      raw.startsWith('edit ') ||
      raw.startsWith('write ') ||
      raw.startsWith('tool ')
    );
  }

  private isNoiseLine(raw: string): boolean {
    const line = raw.trim();
    if (!line) return false;
    if (
      [
        'agent_start',
        'message_start',
        'message_update',
        'message_end',
        'turn_start',
        'turn_end',
      ].includes(line)
    )
      return true;
    if (/^\{.*\}$/.test(line)) return true;
    return false;
  }

  private wrap(text: string, width: number): string[] {
    return wrapTextWithAnsi(text.replace(/\t/g, '  '), Math.max(1, width));
  }
}
