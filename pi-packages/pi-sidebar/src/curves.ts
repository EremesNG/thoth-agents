import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Color } from '@earendil-works/pi-tui';
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
    // State samples are cumulative levels at absolute Unix-ms timestamps,
    // not per-turn deltas. Normalize defensively without inventing extra spend.
    let last: CurvePoint = { at: 0, cost: 0 };
    const points: CurvePoint[] = [last];
    for (const sample of [...task.samples].sort((a, b) => a.at - b.at)) {
      if (!Number.isFinite(sample.at) || !Number.isFinite(sample.cost))
        continue;
      const at = Math.max(0, Math.min(duration, sample.at - task.start));
      const cost = Math.max(last.cost, Math.min(task.cost, sample.cost));
      if (at === last.at && cost === last.cost) continue;
      last = { at, cost };
      points.push(last);
    }
    if (last.at !== duration || last.cost !== task.cost)
      points.push({ at: duration, cost: task.cost });
    return { label: task.label, cost: task.cost, points };
  });
}

type SeriesPaint = PanelRole | { rgb: readonly [number, number, number] };

/**
 * Ten distinct hues. Theme roles that are hue-distinct in every shipped theme
 * come first; the rest are fixed hues, since many themes alias their remaining
 * roles to the same few colors (gold/amber/ochre collapse into one orange).
 */
export const SERIES_PALETTE: readonly SeriesPaint[] = [
  'error',
  'warning',
  'success',
  'mdCode',
  'mdLink',
  { rgb: [180, 142, 240] },
  { rgb: [240, 110, 170] },
  { rgb: [198, 224, 74] },
  { rgb: [150, 98, 40] },
  { rgb: [81, 72, 200] },
];

/** Distinct per-series glyphs keep ascii and no-color output distinguishable. */
export const ASCII_MARKERS = '1234567890';

export function seriesMarker(index: number, ascii: boolean): string {
  return ascii ? ASCII_MARKERS[index % ASCII_MARKERS.length] : '●';
}

/** Pi's Theme.style converts rgb to the theme's color mode (truecolor or 256). */
interface StyleCapable {
  style(text: string, options: { fg: Color }): string;
}

function paintSeries(
  theme: RenderKitTheme,
  index: number,
  text: string,
): string {
  const paint = SERIES_PALETTE[index % SERIES_PALETTE.length];
  if (typeof paint === 'string') return panelFg(theme, paint, text);
  const [r, g, b] = paint.rgb;
  const styled = (theme as Partial<StyleCapable>).style;
  // Themes without a mode-aware style (plain test doubles) get truecolor SGR.
  return typeof styled === 'function'
    ? styled.call(theme, text, { fg: { kind: 'rgb', r, g, b } })
    : `[38;2;${r};${g};${b}m${text}[39m`;
}

interface Cell {
  connections: number;
  /** Owner of the color: end markers beat lines, then the later series wins. */
  series: number;
  end: boolean;
}

const LEFT = 1;
const RIGHT = 2;
const UP = 4;
const DOWN = 8;

function lineGlyph(connections: number, ascii: boolean): string {
  if (ascii) {
    if (connections & 3 && connections & 12) return '+';
    return connections & 12 ? '|' : '-';
  }
  return (
    (
      {
        1: '─',
        2: '─',
        3: '─',
        4: '│',
        8: '│',
        12: '│',
        5: '╯',
        6: '└',
        9: '┐',
        10: '╭',
        7: '┴',
        11: '┬',
        13: '┤',
        14: '├',
        15: '┼',
      } as Record<number, string>
    )[connections] ?? '─'
  );
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
    ? { h: '-', v: '|', up: '+', down: '+', rise: '+', fall: '+' }
    : { h: '─', v: '│', up: '╯', down: '╮', rise: '╭', fall: '╰' };
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
  const grid: (Cell | undefined)[][] = Array.from({ length: plotH }, () =>
    new Array<Cell | undefined>(plotW).fill(undefined),
  );
  const rowOf = (value: number) =>
    plotH - 1 - Math.round((value / yMax) * (plotH - 1));
  series.forEach((line, index) => {
    const put = (
      row: number,
      col: number,
      connections: number,
      end = false,
    ) => {
      const cell = grid[row][col];
      // Union connectivity at crossings; never erase another curve's segments.
      if (cell) {
        cell.connections |= connections;
        if (end || !cell.end) {
          cell.series = index;
          cell.end = end || cell.end;
        }
      } else grid[row][col] = { connections, series: index, end };
    };
    const connect = (x: number, y: number, nx: number, ny: number) => {
      const direction = nx > x ? RIGHT : ny < y ? UP : DOWN;
      const opposite =
        direction === RIGHT ? LEFT : direction === UP ? DOWN : UP;
      put(y, x, direction);
      put(ny, nx, opposite);
    };
    const columnOf = (at: number) =>
      Math.round((at / (max || 1)) * (plotW - 1));
    let x = columnOf(line.points[0].at);
    let y = rowOf(line.points[0].cost);
    for (const point of line.points.slice(1)) {
      const nx = columnOf(point.at);
      const ny = rowOf(point.cost);
      const fromX = x;
      const fromY = y;
      // Rasterize each segment including its exact endpoint. Vertical edges
      // connect consecutive levels even when duration is less than one cell.
      for (let col = x; col <= nx; col++) {
        if (col > x) {
          connect(x, y, col, y);
          x = col;
        }
        const target =
          nx === fromX
            ? ny
            : Math.round(fromY + ((ny - fromY) * (col - fromX)) / (nx - fromX));
        while (y !== target) {
          const nextY = y + (target < y ? -1 : 1);
          connect(x, y, x, nextY);
          y = nextY;
        }
      }
    }
    put(y, x, 0, true);
  });
  const colored = (cell: Cell | undefined) =>
    cell
      ? paintSeries(
          theme,
          cell.series,
          cell.end
            ? seriesMarker(cell.series, ascii)
            : lineGlyph(cell.connections, ascii),
        )
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
      const marker = seriesMarker(index, isAsciiMode());
      rows.push(
        `${paintSeries(theme, index, marker)} ${padPanelText(line.label, Math.max(1, inner - 10))} ${formatUsd(line.cost).padStart(7)}`,
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
