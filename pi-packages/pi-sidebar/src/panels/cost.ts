import type {
  RenderKitTheme,
  SubagentsSnapshot,
  SubagentTaskSummary,
} from '@thoth-agents/pi-core';
import { padPanelText, panelFg } from '@thoth-agents/pi-core/panel';
import { isAsciiMode } from './chrome.js';
import { type BarGlyphs, type BarStyle, barGlyphs } from './meter.js';
import { clean } from './rows.js';
import { paintSeries, seriesMarker } from './series.js';

export interface CostSample {
  /** Absolute Unix ms of the state snapshot (not task-relative). */
  at: number;
  cost: number;
}

export interface CostTask {
  id: string;
  agent: string;
  label: string;
  cost: number;
  /** Unix ms; startedAt, falling back to createdAt until the task starts. */
  start: number;
  end?: number;
  /** Cumulative cost observed in state snapshots; empty for history-only tasks. */
  samples: CostSample[];
  /** In the latest live snapshot with a non-terminal status. */
  running: boolean;
}

/** Curves retain ten tasks; the sidebar legend shows at most five entries. */
export const COST_TOP = 10;
const MAX_TASKS = 200;
const MAX_SAMPLES = 120;
const SETTLED: ReadonlySet<SubagentTaskSummary['status']> = new Set([
  'completed',
  'failed',
  'cancelled',
  'interrupted',
]);

function label(task: SubagentTaskSummary): string {
  return clean(task.displayName?.trim() || task.agent || task.id);
}

/**
 * Session subagent costs from `thoth:subagents:state` snapshots. Updated by the
 * event handler only; renders read the cached ranking and the revision.
 */
export class CostTracker {
  revision = 0;
  private readonly tasks = new Map<string, CostTask>();
  private top: CostTask[] = [];
  private sum = 0;
  private anyRunning = false;
  private hiddenRunning = false;

  /** Live tasks win over history entries with the same id. */
  update(snapshot: SubagentsSnapshot, at: number): void {
    const merged = new Map<string, SubagentTaskSummary>();
    for (const task of snapshot.history) merged.set(task.id, task);
    for (const task of snapshot.tasks) merged.set(task.id, task);
    const running = new Set(
      snapshot.tasks
        .filter((task) => !SETTLED.has(task.status))
        .map((task) => task.id),
    );
    let changed = false;
    for (const task of merged.values()) {
      const cost = task.usage?.cost;
      if (cost === undefined || !(cost > 0)) continue;
      const name = label(task);
      const agent = clean(task.agent || '');
      const start = task.startedAt ?? task.createdAt;
      const known = this.tasks.get(task.id);
      if (!known) {
        // A task already finished on first sight has no observed progression.
        this.tasks.set(task.id, {
          id: task.id,
          agent,
          label: name,
          cost,
          start,
          end: task.endedAt,
          samples: task.endedAt === undefined ? [{ at, cost }] : [],
          running: running.has(task.id),
        });
        changed = true;
        continue;
      }
      if (
        known.cost === cost &&
        known.start === start &&
        known.label === name &&
        known.agent === agent &&
        known.end === task.endedAt
      )
        continue;
      changed = true;
      known.label = name;
      known.agent = agent;
      known.start = start;
      known.end = task.endedAt;
      if (cost !== known.cost) {
        known.cost = cost;
        const previous = known.samples.at(-1)?.at ?? 0;
        known.samples.push({
          at: Math.max(previous, Math.min(at, task.endedAt ?? at)),
          cost,
        });
        // Keep the first and newest samples when the bound is reached.
        if (known.samples.length > MAX_SAMPLES) known.samples.splice(1, 1);
      }
    }
    // A task absent from the live snapshot has stopped, whatever its end time says.
    for (const known of this.tasks.values()) {
      const now = running.has(known.id);
      if (known.running === now) continue;
      known.running = now;
      changed = true;
    }
    if (!changed) return;
    if (this.tasks.size > MAX_TASKS)
      for (const [id] of [...this.tasks]
        .sort((a, b) => a[1].cost - b[1].cost)
        .slice(0, this.tasks.size - MAX_TASKS))
        this.tasks.delete(id);
    const all = [...this.tasks.values()];
    this.sum = all.reduce((total, task) => total + task.cost, 0);
    this.anyRunning = all.some((task) => task.running);
    all.sort((a, b) => b.cost - a.cost || a.label.localeCompare(b.label));
    this.hiddenRunning = all.some(
      (task, rank) => rank >= LEGEND_ENTRIES - 1 && task.running,
    );
    this.top = all.slice(0, COST_TOP);
    this.revision++;
  }

  /** Most expensive tasks, highest first. */
  ranked(): readonly CostTask[] {
    return this.top;
  }

  /** Sum over every tracked task. */
  total(): number {
    return this.sum;
  }

  /** Number of tracked tasks, including those beyond the ranking. */
  count(): number {
    return this.tasks.size;
  }

  /** Whether any tracked task is running. */
  active(): boolean {
    return this.anyRunning;
  }

  /** Whether a running tracked task ranks below the top four. */
  remainderActive(): boolean {
    return this.hiddenRunning;
  }
}

export function formatUsd(value: number): string {
  return `$${value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)}`;
}

/** Legend entries: five tasks, or four plus a remainder (see `legendEntries`). */
const LEGEND_ENTRIES = 5;
/** Untracked cost below half a cent is rounding noise, not a remainder. */
const UNTRACKED_MIN = 0.005;
const SHARE_WIDTH = 4;
/** Narrowest inner width that keeps the share column beside a 14-cell label. */
const SHARE_MIN_INNER = 28;

export interface CostRows {
  /** One full-width segmented bar, a segment per legend entry. */
  bar: string;
  /** Legend lines in rank order; a remainder entry comes last. */
  entries: string[];
  /** Tasks behind each legend line; a remainder entry counts every task it hides. */
  tasks: number[];
}

interface LegendEntry {
  label: string;
  cost: number;
  tasks: number;
  running: boolean;
  /** Position in the shared palette; undefined for the remainder entry. */
  rank?: number;
}

/** The top tasks, or the top four and a remainder when some cost is not shown. */
function legendEntries(tracker: CostTracker, total: number): LegendEntry[] {
  const ranked = tracker.ranked();
  const count = tracker.count();
  const collapse =
    count > LEGEND_ENTRIES || total - tracker.total() >= UNTRACKED_MIN;
  const shown = ranked.slice(0, collapse ? LEGEND_ENTRIES - 1 : LEGEND_ENTRIES);
  const entries = shown.map((task, rank) => ({
    label: task.label,
    cost: task.cost,
    tasks: 1,
    running: task.running,
    rank,
  }));
  if (!collapse) return entries;
  const hidden = count - shown.length;
  const spent = shown.reduce((sum, task) => sum + task.cost, 0);
  const label =
    hidden === 0 ? 'other' : `+${hidden} more task${hidden === 1 ? '' : 's'}`;
  return [
    ...entries,
    {
      label,
      cost: Math.max(0, total - spent),
      tasks: hidden,
      running: tracker.remainderActive(),
    },
  ];
}

/** Largest-remainder cells per weight, at least one each, summing to `cells`. */
function allocate(weights: readonly number[], cells: number): number[] {
  const sum = weights.reduce((total, weight) => total + weight, 0);
  const quotas = weights.map((weight) => (weight / sum) * cells);
  const sizes = quotas.map((quota) => Math.max(1, Math.floor(quota)));
  let spare = cells - sizes.reduce((total, size) => total + size, 0);
  // Entries lifted to the one-cell minimum already exceed their quota.
  const byRemainder = [...quotas.keys()]
    .filter((index) => sizes[index] === Math.floor(quotas[index]))
    .sort((a, b) => (quotas[b] % 1) - (quotas[a] % 1) || a - b);
  for (const index of byRemainder) {
    if (spare <= 0) break;
    sizes[index]++;
    spare--;
  }
  for (; spare < 0; spare++) sizes[sizes.indexOf(Math.max(...sizes))]--;
  return sizes;
}

/** Legend marker; the remainder uses its own fill, and ascii segments reuse it. */
function marker(entry: LegendEntry, ascii: boolean, bars: BarGlyphs): string {
  if (entry.rank !== undefined) return seriesMarker(entry.rank, ascii);
  return ascii ? '.' : bars.remainder;
}

/** Segments end in a half cell, so neighbours stay distinct even without color. */
function segment(
  entry: LegendEntry,
  cells: number,
  last: boolean,
  ascii: boolean,
  bars: BarGlyphs,
): string {
  if (ascii) return marker(entry, ascii, bars).repeat(cells);
  if (entry.rank === undefined) return bars.track.repeat(cells);
  return `${bars.fill.repeat(cells - 1)}${last ? bars.fill : bars.cap}`;
}

/** Rank color for tasks, the style's remainder tone for the remainder. */
function paint(
  theme: RenderKitTheme,
  entry: LegendEntry,
  text: string,
  bars: BarGlyphs,
): string {
  return entry.rank === undefined
    ? panelFg(theme, bars.tone, text)
    : paintSeries(theme, entry.rank, text);
}

const runningArrow = () => (isAsciiMode() ? '^' : '↑');

/** Header total, with the running arrow while any task runs. */
export function costSummary(
  total: number,
  running: boolean,
  theme: RenderKitTheme,
): string {
  return `${formatUsd(total)}${running ? panelFg(theme, 'accent', runningArrow()) : ''}`;
}

function shareText(cost: number, total: number): string {
  const percent = total > 0 ? (cost / total) * 100 : 0;
  return percent < 1 ? '<1%' : `${Math.round(percent)}%`;
}

/**
 * The share bar and its legend. Segments split the inner width by each entry's
 * share of `total`; the legend keys them by rank color or digit. ASCII mode
 * draws the same bar whatever the style.
 */
export function renderCostRows(
  tracker: CostTracker,
  total: number,
  width: number,
  theme: RenderKitTheme,
  style: BarStyle,
): CostRows {
  const entries = legendEntries(tracker, total);
  if (!entries.length) return { bar: '', entries: [], tasks: [] };
  const ascii = isAsciiMode();
  const bars = barGlyphs(style);
  const inner = Math.max(0, width - 4);
  // Normalizing by the shown sum keeps the bar full when a half cent is untracked.
  const cells = allocate(
    entries.map((entry) => entry.cost),
    inner,
  );
  const bar = entries
    .map((entry, index) =>
      paint(
        theme,
        entry,
        segment(entry, cells[index], index === entries.length - 1, ascii, bars),
        bars,
      ),
    )
    .join('');
  const amounts = entries.map((entry) => formatUsd(entry.cost));
  const amountWidth = Math.max(...amounts.map((text) => text.length));
  const showShare = inner >= SHARE_MIN_INNER;
  // Marker, label, [share], amount, then the column reserved for the running arrow.
  const labelWidth = Math.max(
    1,
    inner - (2 + (showShare ? SHARE_WIDTH + 1 : 0) + amountWidth + 2),
  );
  const muted = (text: string) => panelFg(theme, 'muted', text);
  const lines = entries.map((entry, index) => {
    const tone = entry.rank === undefined ? muted : (text: string) => text;
    const share = showShare
      ? ` ${muted(shareText(entry.cost, total).padStart(SHARE_WIDTH))}`
      : '';
    const arrow = entry.running
      ? panelFg(theme, 'accent', runningArrow())
      : ' ';
    return `${paint(theme, entry, marker(entry, ascii, bars), bars)} ${tone(padPanelText(entry.label, labelWidth))}${share} ${tone(amounts[index].padStart(amountWidth))}${arrow}`;
  });
  return { bar, entries: lines, tasks: entries.map((entry) => entry.tasks) };
}
