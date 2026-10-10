import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { RenderKitTheme } from '@thoth-agents/pi-core';
import {
  normalizePanelKey,
  openPanelOverlay,
  type PanelRowInput,
  padPanelText,
  panelFg,
  panelHintRow,
  renderPanelFrame,
} from '@thoth-agents/pi-core/panel';
import { isAsciiMode, type PanelRole } from './panels/chrome.js';
import { type CostTask, type CostTracker, formatUsd } from './panels/cost.js';

export interface CurvePoint {
  /** Elapsed ms since this task's start. */
  at: number;
  /** Cumulative cost. */
  cost: number;
}

export interface CurveSeries {
  label: string;
  cost: number;
  points: CurvePoint[];
}

/** Observed samples when present; otherwise one straight segment start to end. */
export function curveSeries(
  tasks: readonly CostTask[],
  now = Date.now(),
): CurveSeries[] {
  return tasks.map((task) => {
    const duration = Math.max(0, (task.end ?? now) - task.start);
    const first = task.samples[0];
    const points: CurvePoint[] = [];
    if (first) {
      if (first.at > task.start) points.push({ at: 0, cost: 0 });
      points.push(
        ...task.samples.map((sample) => ({
          at: Math.max(0, Math.min(duration, sample.at - task.start)),
          cost: sample.cost,
        })),
      );
      if (points[points.length - 1].at < duration)
        points.push({ at: duration, cost: task.cost });
    } else {
      points.push({ at: 0, cost: 0 }, { at: duration, cost: task.cost });
    }
    return { label: task.label, cost: task.cost, points };
  });
}

const PALETTE: readonly PanelRole[] = [
  'warning',
  'success',
  'mdLink',
  'mdCode',
  'error',
  'accent',
  'syntaxNumber',
  'thinkingHigh',
  'toolDiffAdded',
  'mdHeading',
];

interface Cell {
  glyph: string;
  series: number;
}

function valueAt(points: readonly CurvePoint[], at: number): number | null {
  const last = points[points.length - 1];
  if (at < points[0].at || at > last.at) return null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (at <= b.at)
      return b.at === a.at
        ? b.cost
        : a.cost + ((b.cost - a.cost) * (at - a.at)) / (b.at - a.at);
  }
  return last.cost;
}

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 90 ? `${minutes}m` : `${(minutes / 60).toFixed(1)}h`;
}

/** Box-drawing (or ASCII) cumulative lines, one color per series. */
export function renderCurvePlot(
  series: readonly CurveSeries[],
  width: number,
  height: number,
  theme: RenderKitTheme,
): string[] {
  const ascii = isAsciiMode();
  const g = ascii
    ? { h: '-', v: '|', up: '+', down: '+', rise: '+', fall: '+', end: '*' }
    : { h: '─', v: '│', up: '╯', down: '╮', rise: '╭', fall: '╰', end: '●' };
  const top = formatUsd(Math.max(...series.map((s) => s.cost), 0));
  const bottom = formatUsd(0);
  const margin = Math.max(top.length, bottom.length);
  const plotW = Math.max(2, width - margin - 1);
  const plotH = Math.max(2, height - 2);
  const max = Math.max(
    ...series.map((s) => s.points[s.points.length - 1].at),
    0,
  );
  const yMax = Math.max(...series.map((s) => s.cost)) || 1;
  const grid: (Cell | undefined)[][] = Array.from(
    { length: plotH },
    () => new Array<Cell | undefined>(plotW),
  );
  const rowOf = (value: number) =>
    plotH - 1 - Math.round((value / yMax) * (plotH - 1));
  series.forEach((line, index) => {
    let previous: number | undefined;
    let lastColumn = -1;
    for (let col = 0; col < plotW; col++) {
      const value = valueAt(line.points, (max * col) / Math.max(1, plotW - 1));
      if (value === null) {
        previous = undefined;
        continue;
      }
      const row = rowOf(value);
      const put = (r: number, glyph: string) => {
        grid[r][col] = { glyph, series: index };
      };
      if (previous === undefined || previous === row) put(row, g.h);
      else {
        const rising = row < previous;
        put(previous, rising ? g.up : g.down);
        for (
          let r = Math.min(row, previous) + 1;
          r < Math.max(row, previous);
          r++
        )
          put(r, g.v);
        put(row, rising ? g.rise : g.fall);
      }
      previous = row;
      lastColumn = col;
    }
    if (lastColumn >= 0) {
      const row = rowOf(line.cost);
      grid[row][lastColumn] = { glyph: g.end, series: index };
    }
  });
  const colored = (cell: Cell | undefined) =>
    cell
      ? panelFg(theme, PALETTE[cell.series % PALETTE.length], cell.glyph)
      : ' ';
  const rows = grid.map((cells, r) => {
    const label = r === 0 ? top : r === plotH - 1 ? bottom : '';
    return `${label.padStart(margin)}${ascii ? '|' : '┤'}${cells.map(colored).join('')}`;
  });
  const axis = `${' '.repeat(margin)}${ascii ? '+' : '└'}${g.h.repeat(plotW)}`;
  const end = duration(max);
  const scale = `${' '.repeat(margin + 1)}0${' '.repeat(Math.max(1, plotW - end.length - 1))}${end}`;
  return [...rows, axis, scale];
}

/** Plot, then legend, then the close hint; short terminals lose the legend first. */
export function renderCurvesView(
  tasks: readonly CostTask[],
  width: number,
  maxHeight: number,
  theme: RenderKitTheme,
): string[] {
  const inner = Math.max(1, width - 4);
  const rows: PanelRowInput[] = [];
  const series = curveSeries(tasks);
  const hint = panelHintRow('q/Esc close');
  if (!series.length) rows.push(panelHintRow('No subagent cost recorded yet.'));
  else {
    const body = Math.max(1, maxHeight - 2 - 1);
    const legend = Math.max(0, Math.min(series.length, body - 8));
    const plot = renderCurvePlot(
      series,
      inner,
      Math.min(16, body - legend),
      theme,
    );
    rows.push(...plot);
    series.slice(0, legend).forEach((line, index) => {
      const marker = isAsciiMode() ? '*' : '●';
      const color = PALETTE[index % PALETTE.length];
      rows.push(
        `${panelFg(theme, color, marker)} ${padPanelText(line.label, Math.max(1, inner - 10))} ${formatUsd(line.cost).padStart(7)}`,
      );
    });
  }
  rows.push(hint);
  return renderPanelFrame({
    title: 'Subagent cost curves',
    rows,
    width,
    maxHeight,
    theme,
  });
}

export function openCostCurves(
  ctx: Pick<ExtensionContext, 'ui'>,
  tracker: CostTracker,
): Promise<void> {
  return openPanelOverlay<void>(ctx, (_tui, theme, _keys, close, host) => ({
    render: (width) =>
      renderCurvesView(tracker.ranked(), width, host.maxHeight(), theme),
    handleInput(data) {
      const key = normalizePanelKey(data);
      if (key === 'escape' || key === 'q') close(undefined);
    },
    invalidate() {},
  }));
}
