import {
  truncateToWidth,
  visibleWidth,
  wrapLineToWidth,
} from '../render/text-width.js';
import { toolSelectionWarning } from '../render/tool-selection-warning.js';
import {
  formatDuration,
  formatTokens,
  generationSpeed,
} from '../render/tools/formatting.js';
import { statusGlyph } from '../render/tools/progress.js';
import type { SubagentTask } from '../types.js';
import {
  ARCH_ICON,
  themeAccent,
  themeBold,
  themeDim,
  themeTitle,
  themeWarning,
} from './theme.js';

type ClaudeBackgroundWidgetEntry = {
  key: string;
  line: string;
  status?: string;
  activity?: string;
  warning?: string;
  metrics?: string[];
};

export type ClaudeBackgroundTerminalAction =
  | { type: 'focus-editor' }
  | { type: 'open-task'; taskId: string }
  | { type: 'open-history' };

export type ClaudeBackgroundTerminalInputResult =
  | {
      consume?: boolean;
      data?: string;
      action?: ClaudeBackgroundTerminalAction;
    }
  | undefined;

function matchesKey(data: string, key: string): boolean {
  const keys: Record<string, string[]> = {
    escape: ['\u001b'],
    q: ['q', 'Q'],
    up: ['\u001b[A'],
    down: ['\u001b[B'],
    right: ['\u001b[C'],
    left: ['\u001b[D'],
  };
  return keys[key]?.includes(data) ?? data === key;
}

function isMouseClickInput(data: string): { isClick: boolean; row?: number } {
  // SGR mouse tracking: \u001b[<button;col;rowM
  const sgr = data.match(/^\u001b\[<(\d+);(\d+);(\d+)M$/);
  if (sgr) {
    const button = Number(sgr[1]);
    const row = Number(sgr[3]) - 1; // 1-based row in terminal to 0-based
    if (button === 0) return { isClick: true, row };
  }
  return { isClick: false };
}

function normalize(text: string | undefined): string {
  return text ? text.replace(/\s+/g, ' ').trim() : '';
}

export function formatTaskSummary(task: SubagentTask, maxLen = 60): string {
  const name = task.display_name?.trim();
  if (name) return truncateToWidth(name, maxLen, '…');
  const raw = task.task;
  if (!raw) return '';
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const firstContent =
    lines.find((l) => !/^#+\s*(?:delegated task|task)?$/i.test(l)) ??
    lines[0] ??
    '';
  const clean = firstContent
    .replace(/^#+\s*(?:delegated task:?|task:?)?\s*/i, '')
    .trim();
  const summary = normalize(clean || firstContent);
  if (!summary) return '';
  return truncateToWidth(summary, maxLen, '…');
}

function isActiveBackgroundTask(task: SubagentTask): boolean {
  return (
    task.mode === 'background' &&
    (task.status === 'queued' || task.status === 'running')
  );
}

export const MAX_VISIBLE_RUNNING_TASKS = 3;

function headerKeyboardHints(width = 80, navigationActive = false): string {
  if (navigationActive) {
    if (width >= 55) return '  (↑↓ navigate · ↵ open · esc dismiss)';
    if (width >= 38) return '  (↑↓ navigate · ↵ open)';
    if (width >= 25) return '  (↑↓/↵)';
    return '';
  }
  if (width >= 55) return '  (↑↓ navigate · ↵ open)';
  if (width >= 38) return '  (↑↓ navigate)';
  if (width >= 25) return '  (↑↓)';
  return '';
}

function overflowKeyboardHint(width = 80): string {
  if (width >= 45) return '  (↵ view all)';
  return '';
}

function buildClaudeBackgroundWidgetEntries(
  tasks: SubagentTask[],
  now = Date.now(),
): ClaudeBackgroundWidgetEntry[] {
  const active = tasks.filter(isActiveBackgroundTask);
  if (!active.length) return [];
  // Streaming activity must refresh content without moving cards or changing visibility.
  const running = active
    .filter((task) => task.status === 'running')
    .sort(
      (a, b) =>
        Buffer.compare(
          Buffer.from(b.created_at ?? '', 'utf8'),
          Buffer.from(a.created_at ?? '', 'utf8'),
        ) ||
        Buffer.compare(Buffer.from(b.id, 'utf8'), Buffer.from(a.id, 'utf8')),
    );
  const queued = active.filter((task) => task.status === 'queued');
  const entries: ClaudeBackgroundWidgetEntry[] = [
    { key: 'main', line: 'Agents' },
  ];

  const visibleRunning = running.slice(0, MAX_VISIBLE_RUNNING_TASKS);
  const hiddenActiveCount = running.length - visibleRunning.length;
  const hasOverflow = hiddenActiveCount > 0;
  const hasQueued = queued.length > 0;

  for (const task of visibleRunning) {
    const metrics = task.runtime_metrics;
    const summary = formatTaskSummary(task);
    const description =
      `${task.agent}${task.model ? ` [${task.model}]` : ''}${summary ? ` · ${summary}` : ''}`.trim();
    const speed = generationSpeed(metrics);
    const activity = task.pending_questions?.length
      ? 'awaiting orchestrator reply'
      : (task.live_activity?.current?.label ?? task.last_activity);
    const progress = task.progress_updates?.at(-1)?.message;
    const input = task.usage?.input;
    const output = task.usage?.output;
    const cost = task.usage?.cost;
    const started = task.started_at ? Date.parse(task.started_at) : NaN;
    const metricParts = [
      `⚙ tools ${finiteNonnegative(metrics?.toolUses) ? metrics.toolUses : '?'}`,
      `↑${finiteNonnegative(input) ? formatTokens(input) : '?'} ↓${finiteNonnegative(output) ? formatTokens(output) : '?'}`,
      `$${finiteNonnegative(cost) ? cost.toFixed(4) : '?'}`,
      `▣ context ${finiteNonnegative(metrics?.contextPercent) ? `${metrics.contextPercent.toFixed(1)}%` : '?'}`,
      `${speed !== undefined ? Math.round(speed) : '?'} tok/s`,
      `⧗ elapsed ${Number.isFinite(started) ? formatDuration(Math.max(0, now - started)) : '?'}`,
    ];
    if (finiteNonnegative(metrics?.compactions) && metrics.compactions > 0)
      metricParts.push(
        `≋ ${metrics.compactions} compaction${metrics.compactions === 1 ? '' : 's'}`,
      );
    entries.push({
      key: task.id,
      line: description,
      status: task.status,
      metrics: metricParts,
      warning: toolSelectionWarning(task, true),
      activity: normalize(
        [
          activity,
          progress && activity !== `progress: ${progress}`
            ? `progress: ${progress}`
            : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
      ),
    });
  }

  if (hasOverflow) {
    entries.push({
      key: 'overflow',
      line: `+${hiddenActiveCount} more active · /subagents`,
      status: 'overflow',
    });
  }

  if (hasQueued) {
    entries.push({
      key: queued[0]!.id,
      line: `○ ${queued.length} queued`,
      status: 'queued',
      warning: toolSelectionWarning(
        {
          dropped_tools: [
            ...new Set(queued.flatMap((task) => task.dropped_tools ?? [])),
          ],
        },
        true,
      ),
    });
  }

  return entries;
}

function finiteNonnegative(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function metricLines(
  parts: string[] = [],
  width = 80,
  prefixWidth = 5,
): string[] {
  const lines: string[] = [];
  const effectiveWidth = Math.max(10, width - prefixWidth);
  for (const part of parts) {
    const previous = lines.at(-1);
    const joined = previous ? `${previous} · ${part}` : part;
    if (previous && visibleWidth(joined) > effectiveWidth) {
      lines.push(part);
    } else if (previous) {
      lines[lines.length - 1] = joined;
    } else {
      lines.push(part);
    }
  }
  return lines;
}

function entryRowCount(
  entry: ClaudeBackgroundWidgetEntry,
  width: number,
): number {
  return (
    1 +
    (entry.metrics ? metricLines(entry.metrics, width).length : 0) +
    (entry.activity ? 1 : 0) +
    (entry.warning ? 1 : 0)
  );
}

function coerceClaudeBackgroundSelection(
  entries: ClaudeBackgroundWidgetEntry[],
  selectedKey: string | undefined,
  preferredIndex?: number,
): string {
  if (!entries.length) return 'main';
  if (selectedKey && entries.some((entry) => entry.key === selectedKey)) {
    return selectedKey;
  }
  if (typeof preferredIndex === 'number' && preferredIndex >= 0) {
    const clamped = Math.min(preferredIndex, entries.length - 1);
    return entries[clamped]?.key ?? entries[0]!.key;
  }
  return entries[0]!.key;
}

export function moveClaudeBackgroundWidgetSelection(
  tasks: SubagentTask[],
  selectedKey: string | undefined,
  direction: 'up' | 'down',
): string {
  const entries = buildClaudeBackgroundWidgetEntries(tasks);
  if (!entries.length) return 'main';
  const current = coerceClaudeBackgroundSelection(entries, selectedKey);
  const index = entries.findIndex((entry) => entry.key === current);
  const nextIndex =
    direction === 'down'
      ? Math.min(index + 1, entries.length - 1)
      : Math.max(index - 1, 0);
  return entries[nextIndex]?.key ?? current;
}

export function renderClaudeBackgroundWidgetLines(
  tasks: SubagentTask[],
  selectedKey?: string,
  options: {
    archIndicator?: boolean;
    neonRunning?: boolean;
    frame?: number;
    now?: number;
    width?: number;
    navigationActive?: boolean;
  } = {},
): string[] | undefined {
  const entries = buildClaudeBackgroundWidgetEntries(tasks, options.now);
  if (!entries.length) return undefined;
  const current =
    selectedKey === undefined
      ? undefined
      : coerceClaudeBackgroundSelection(entries, selectedKey);
  const useNeon = Boolean(options.archIndicator || options.neonRunning);
  const width = options.width ?? 80;
  const isNavActive = Boolean(
    options.navigationActive || (selectedKey && selectedKey !== 'main'),
  );

  return entries.flatMap((entry) => {
    const isSelected = entry.key === current;

    if (entry.key === 'main') {
      const bullet = isSelected && useNeon ? ARCH_ICON : '●';
      const hints = headerKeyboardHints(width, isNavActive);
      return [`${bullet} ${entry.line}${hints}`];
    }

    if (entry.status === 'overflow') {
      const prefix = isSelected ? '● ' : '  ';
      const hint = overflowKeyboardHint(width);
      return [`${prefix}${entry.line}${hint}`];
    }

    if (entry.status === 'queued') {
      const prefix = isSelected ? '● ' : '  ';
      return [
        `${prefix}${entry.line}`,
        ...(entry.warning ? [`  ╰─ ${entry.warning}`] : []),
      ];
    }

    // Running card
    const glyph = statusGlyph(
      'running',
      options.frame ?? Math.floor(Date.now() / 100),
    );
    const mLines = entry.metrics ? metricLines(entry.metrics, width) : [];
    const hasActivity = Boolean(entry.activity);

    const headerPrefix = isSelected ? '● ┏━ ' : '  ╭─ ';
    const middlePrefix = isSelected ? '  ┃  ' : '  │  ';
    const bottomPrefix = isSelected ? '  ┗━ ' : '  ╰─ ';
    const activityPrefix = isSelected ? '  ┗⎿ ' : '  ╰⎿ ';

    const headerLine = `${headerPrefix}${glyph} ${entry.line}`;

    if (hasActivity || entry.warning) {
      const metricRows = mLines.map((m) => `${middlePrefix}${m}`);
      const warningRows = entry.warning
        ? [`${hasActivity ? middlePrefix : bottomPrefix}${entry.warning}`]
        : [];
      const activityRows = hasActivity
        ? [`${activityPrefix}${entry.activity}`]
        : [];
      return [headerLine, ...metricRows, ...warningRows, ...activityRows];
    }

    if (mLines.length <= 1) {
      const bottomRow =
        mLines.length === 1 ? [`${bottomPrefix}${mLines[0]}`] : [];
      return [headerLine, ...bottomRow];
    }

    const intermediateMetricRows = mLines
      .slice(0, -1)
      .map((m) => `${middlePrefix}${m}`);
    const lastMetricRow = `${bottomPrefix}${mLines.at(-1)}`;
    return [headerLine, ...intermediateMetricRows, lastMetricRow];
  });
}

export class ClaudeBackgroundWidgetState {
  private selectedKey = 'main';
  private selectedIndex = 0;
  private navigationActive = false;
  private renderWidth = 80;

  constructor(
    private getTasks: () => SubagentTask[],
    private onChange?: () => void,
    private onAction?: (action: ClaudeBackgroundTerminalAction) => void,
    private options: {
      archIndicator?: boolean;
      neonRunning?: boolean;
      frame?: number;
    } = {},
  ) {}

  getSelectedKey(): string {
    const entries = buildClaudeBackgroundWidgetEntries(this.getTasks());
    if (this.navigationActive) {
      this.selectedKey = coerceClaudeBackgroundSelection(
        entries,
        this.selectedKey,
        this.selectedIndex,
      );
      this.selectedIndex = entries.findIndex(
        (entry) => entry.key === this.selectedKey,
      );
      if (this.selectedKey === 'main' && entries.length <= 1) {
        this.navigationActive = false;
      }
    } else {
      this.selectedKey = coerceClaudeBackgroundSelection(
        entries,
        this.selectedKey,
      );
      this.selectedIndex = entries.findIndex(
        (entry) => entry.key === this.selectedKey,
      );
    }
    return this.selectedKey;
  }

  renderLines(options?: {
    archIndicator?: boolean;
    neonRunning?: boolean;
    frame?: number;
    width?: number;
  }): string[] {
    this.renderWidth = options?.width ?? this.renderWidth;
    return (
      renderClaudeBackgroundWidgetLines(
        this.getTasks(),
        this.navigationActive ? this.getSelectedKey() : undefined,
        {
          ...this.options,
          ...options,
          navigationActive: this.navigationActive,
        },
      ) ?? []
    );
  }

  handleWidgetInput(data: string): void {
    this.handleTerminalInput(data);
  }

  handleMouseClick(event: {
    type?: string;
    button?: string;
    row?: number;
    y?: number;
    x?: number;
    col?: number;
  }): ClaudeBackgroundTerminalInputResult {
    const tasks = this.getTasks().filter(isActiveBackgroundTask);
    if (!tasks.length) return undefined;

    const entries = buildClaudeBackgroundWidgetEntries(this.getTasks());
    const row = event.row ?? event.y;

    let targetKey: string | undefined;
    if (
      typeof row === 'number' &&
      Number.isFinite(row) &&
      row >= 0 &&
      row <
        entries.reduce(
          (count, entry) => count + entryRowCount(entry, this.renderWidth),
          0,
        )
    ) {
      let offset = 0;
      for (const entry of entries) {
        const rowCount = entryRowCount(entry, this.renderWidth);
        if (row < offset + rowCount) {
          targetKey = entry.key;
          break;
        }
        offset += rowCount;
      }
    } else if (tasks.length === 1) {
      targetKey = tasks[0]?.id;
    } else {
      const running = tasks.find((t) => t.status === 'running');
      targetKey = running?.id ?? tasks[0]?.id;
    }

    if (!targetKey) return undefined;

    this.navigationActive = false;
    this.selectedKey = targetKey;
    this.selectedIndex = entries.findIndex((entry) => entry.key === targetKey);
    this.onChange?.();

    const action: ClaudeBackgroundTerminalAction =
      targetKey === 'main'
        ? { type: 'focus-editor' }
        : targetKey === 'overflow'
          ? { type: 'open-history' }
          : { type: 'open-task', taskId: targetKey };

    this.onAction?.(action);
    return { consume: true, action };
  }

  handleTerminalInput(
    data: string,
    options: { allowActivate?: boolean; editorFocused?: boolean } = {},
  ): ClaudeBackgroundTerminalInputResult {
    if (options.editorFocused === false) {
      if (this.navigationActive || this.selectedKey !== 'main') {
        this.navigationActive = false;
        this.selectedKey = 'main';
        this.selectedIndex = 0;
        this.onChange?.();
      }
      return undefined;
    }
    const mouse = isMouseClickInput(data);
    if (mouse.isClick) {
      return this.handleMouseClick({ type: 'click', row: mouse.row });
    }

    const tasks = this.getTasks();
    if (!tasks.some(isActiveBackgroundTask)) {
      if (this.navigationActive || this.selectedKey !== 'main') {
        this.selectedKey = 'main';
        this.selectedIndex = 0;
        this.navigationActive = false;
        this.onChange?.();
      }
      return undefined;
    }

    if (matchesKey(data, 'down')) {
      if (!this.navigationActive && options.allowActivate === false)
        return undefined;
      this.navigationActive = true;
      const next = moveClaudeBackgroundWidgetSelection(
        tasks,
        this.getSelectedKey(),
        'down',
      );
      if (next !== this.selectedKey) {
        this.selectedKey = next;
        const entries = buildClaudeBackgroundWidgetEntries(tasks);
        this.selectedIndex = entries.findIndex((e) => e.key === next);
        this.onChange?.();
      }
      return { consume: true };
    }

    if (matchesKey(data, 'up')) {
      if (!this.navigationActive) return undefined;
      if (this.getSelectedKey() === 'main') {
        this.navigationActive = false;
        this.selectedIndex = 0;
        this.onChange?.();
        return { consume: true };
      }
      const next = moveClaudeBackgroundWidgetSelection(
        tasks,
        this.selectedKey,
        'up',
      );
      if (next !== this.selectedKey) {
        this.selectedKey = next;
        const entries = buildClaudeBackgroundWidgetEntries(tasks);
        this.selectedIndex = entries.findIndex((e) => e.key === next);
        this.onChange?.();
      }
      return { consume: true };
    }

    if (this.navigationActive && (data === '\r' || data === '\n')) {
      const selectedKey = this.getSelectedKey();
      this.navigationActive = false;
      this.onChange?.();
      const action: ClaudeBackgroundTerminalAction =
        selectedKey === 'main'
          ? { type: 'focus-editor' }
          : selectedKey === 'overflow'
            ? { type: 'open-history' }
            : { type: 'open-task', taskId: selectedKey };
      this.onAction?.(action);
      return { consume: true, action };
    }

    if (
      this.navigationActive &&
      (matchesKey(data, 'left') ||
        matchesKey(data, 'right') ||
        matchesKey(data, 'escape'))
    ) {
      this.navigationActive = false;
      this.onChange?.();
      const action: ClaudeBackgroundTerminalAction = { type: 'focus-editor' };
      this.onAction?.(action);
      return { consume: true, action };
    }

    if (this.navigationActive) return { consume: true };
    return undefined;
  }
}

export class ClaudeBackgroundWidget {
  constructor(
    private state: ClaudeBackgroundWidgetState,
    private theme: any,
    private options: {
      archIndicator?: boolean;
      neonRunning?: boolean;
      frame?: number;
    } = {},
    private onAction?: (action: ClaudeBackgroundTerminalAction) => void,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    const isNeon = Boolean(
      this.options.archIndicator ||
        this.options.neonRunning ||
        typeof this.theme?.bg === 'function',
    );

    const renderOptions = isNeon
      ? { archIndicator: true, neonRunning: true, ...this.options }
      : this.options;

    const lines = isNeon
      ? this.state.renderLines({ ...renderOptions, width })
      : this.state.renderLines({ width });

    return lines.map((line) => truncateToWidth(this.decorate(line), width));
  }

  handleInput(data: string): void {
    this.state.handleWidgetInput(data);
  }

  handleMouse(event: {
    type?: string;
    button?: string;
    row?: number;
    y?: number;
    x?: number;
    col?: number;
  }): { handled: true; render?: boolean } | undefined {
    if (
      event.type === 'press' ||
      event.type === 'click' ||
      (!event.type && (event.button === 'left' || event.button === undefined))
    ) {
      const result = this.state.handleMouseClick(event);
      if (result?.action && this.onAction) {
        this.onAction(result.action);
      }
      if (result) {
        return { handled: true, render: true };
      }
    }
    return undefined;
  }

  private decorate(line: string): string {
    if (typeof this.theme?.fg !== 'function') {
      return line;
    }

    const isSelected =
      (line.startsWith('● ') && !line.startsWith('● Agents')) ||
      line.startsWith(`${ARCH_ICON} `);

    if (line.includes('⚠ Dropped tools:')) {
      return themeWarning(this.theme, line);
    }

    if (line.includes('Agents')) {
      return line
        .replace(/^[●󰣇]/u, (m) => themeAccent(this.theme, m))
        .replace(/\bAgents\b/, (m) => themeTitle(this.theme, m))
        .replace(/\(.*?\)/, (m) => themeDim(this.theme, m));
    }

    if (line.includes('more active · /subagents')) {
      if (isSelected) {
        return themeWarning(this.theme, themeBold(this.theme, line));
      }
      return themeDim(this.theme, line);
    }

    if (line.includes('queued')) {
      if (isSelected) {
        return themeWarning(this.theme, themeBold(this.theme, line));
      }
      return themeDim(this.theme, line);
    }

    // Selected card rows
    if (line.startsWith('● ┏━ ')) {
      return themeWarning(this.theme, themeBold(this.theme, line));
    }

    if (line.startsWith('  ┃  ')) {
      const rail = themeWarning(this.theme, '  ┃  ');
      const rest = line.slice(5);
      return `${rail}${themeWarning(this.theme, rest)}`;
    }

    if (line.startsWith('  ┗━ ')) {
      const rail = themeWarning(this.theme, '  ┗━ ');
      const rest = line.slice(5);
      return `${rail}${themeWarning(this.theme, rest)}`;
    }

    if (line.startsWith('  ┗⎿ ')) {
      const rail = themeWarning(this.theme, '  ┗⎿ ');
      const rest = line.slice(5);
      return `${rail}${themeWarning(this.theme, rest)}`;
    }

    if (isSelected) {
      return themeWarning(this.theme, themeBold(this.theme, line));
    }

    // Unselected card rows: theme hierarchy (less flat)
    if (line.startsWith('  ╭─ ')) {
      const rail = themeDim(this.theme, '  ╭─ ');
      const rest = line.slice(5);
      const match = rest.match(
        /^(\S+)\s+([^\s·[]+)(?:\s+\[(.*?)\])?(?:\s+·\s+(.*))?$/,
      );
      if (match) {
        const glyph = themeAccent(this.theme, match[1]!);
        const agent = themeBold(this.theme, match[2]!);
        const model = match[3]
          ? ` ${themeDim(this.theme, `[${match[3]}]`)}`
          : '';
        const summary = match[4]
          ? ` ${themeDim(this.theme, '·')} ${match[4]}`
          : '';
        return `${rail}${glyph} ${agent}${model}${summary}`;
      }
      return `${rail}${rest}`;
    }

    if (line.startsWith('  │  ')) {
      const rail = themeDim(this.theme, '  │  ');
      const rest = line.slice(5);
      return `${rail}${this.decorateMetrics(rest)}`;
    }

    if (line.startsWith('  ╰⎿ ')) {
      const rail = themeDim(this.theme, '  ╰⎿ ');
      const rest = line.slice(5);
      return `${rail}${themeDim(this.theme, rest)}`;
    }

    if (line.startsWith('  ╰─ ')) {
      const rail = themeDim(this.theme, '  ╰─ ');
      const rest = line.slice(5);
      return `${rail}${this.decorateMetrics(rest)}`;
    }

    return line;
  }

  private decorateMetrics(text: string): string {
    const parts = text.split(' · ');
    const sep = themeDim(this.theme, ' · ');
    const decoratedParts = parts.map((part) => {
      if (part.startsWith('↑'))
        return part.replace(/[↑↓]/gu, (arrow) => themeDim(this.theme, arrow));
      if (part.startsWith('$'))
        return `${themeDim(this.theme, '$')}${part.slice(1)}`;
      const speed = part.match(/^(\d+|\?) tok\/s$/);
      if (speed) return `${speed[1]} ${themeDim(this.theme, 'tok/s')}`;
      const match = part.match(/^([↻⚙▣⧗≋])\s+(.+)$/u);
      if (!match) return part;
      const icon = match[1]!;
      const rest = match[2]!;
      const tokens = rest.split(/\s+/);
      if (tokens.length === 2) {
        if (/^\d/.test(tokens[0]!)) {
          return `${icon} ${tokens[0]} ${themeDim(this.theme, tokens[1]!)}`;
        }
        return `${icon} ${themeDim(this.theme, tokens[0]!)} ${tokens[1]}`;
      }
      return `${icon} ${themeDim(this.theme, rest)}`;
    });
    return decoratedParts.join(sep);
  }
}
