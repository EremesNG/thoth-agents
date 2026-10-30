import { isAsciiMode } from './chrome.js';

/** Bar looks: hairlines by default, or the classic blocks. */
export const BAR_STYLES = ['thin', 'classic'] as const;
export type BarStyle = (typeof BAR_STYLES)[number];
export const DEFAULT_BAR_STYLE: BarStyle = 'thin';

export const isBarStyle = (value: unknown): value is BarStyle =>
  BAR_STYLES.some((style) => style === value);

/** ASCII mode ignores the style: it keeps the classic geometry and roles. */
export const effectiveBarStyle = (style: BarStyle): BarStyle =>
  isAsciiMode() ? 'classic' : style;

export interface BarGlyphs {
  /** One cell of a segment. */
  fill: string;
  /** Ends a segment in a half cell, so neighbours stay distinct without color. */
  cap: string;
  /** The remainder segment, where nothing is attributed to a task. */
  track: string;
  /** Legend marker of the remainder entry. */
  remainder: string;
  /** Theme role of the remainder segment and its marker. */
  tone: 'dim' | 'muted';
}

const GLYPHS: Record<BarStyle, BarGlyphs> = {
  thin: { fill: '━', cap: '╸', track: '─', remainder: '○', tone: 'dim' },
  classic: { fill: '█', cap: '▌', track: '░', remainder: '░', tone: 'muted' },
};

export const barGlyphs = (style: BarStyle): BarGlyphs =>
  GLYPHS[effectiveBarStyle(style)];

/** Longest Context meter per style, in cells. */
const METER_CELLS: Record<BarStyle, number> = { thin: 16, classic: 10 };
/** A hairline meter marks a trailing half cell with its heavy-left half. */
const HALF = '╾';
const EIGHTHS = ' ▏▎▍▌▋▊▉';

export const meterCells = (style: BarStyle): number =>
  METER_CELLS[effectiveBarStyle(style)];

export interface Meter {
  /** Filled cells, including a trailing partial cell. */
  fill: string;
  /** Unfilled cells; the thin style draws them dim, so they are kept apart. */
  track: string;
}

/**
 * Context meter of `cells` cells: eighth blocks in the classic style, half
 * cells in the thin one, and whole `#`/`-` cells in ASCII mode.
 */
export function contextMeter(
  percent: number,
  cells: number,
  style: BarStyle,
): Meter {
  const ratio = Math.min(1, Math.max(0, percent / 100));
  if (isAsciiMode()) {
    const filled = Math.round(ratio * cells);
    return { fill: '#'.repeat(filled), track: '-'.repeat(cells - filled) };
  }
  const { fill, track } = barGlyphs(style);
  if (style === 'thin') {
    const halves = Math.round(ratio * cells * 2);
    const half = halves % 2 ? HALF : '';
    return {
      fill: fill.repeat(Math.floor(halves / 2)) + half,
      track: track.repeat(cells - Math.ceil(halves / 2)),
    };
  }
  const eighths = Math.round(ratio * cells * 8);
  const full = Math.floor(eighths / 8);
  const partial = EIGHTHS[eighths % 8].trim();
  return {
    fill: fill.repeat(full) + partial,
    track: track.repeat(cells - full - (partial ? 1 : 0)),
  };
}
