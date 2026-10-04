import {
  foregroundAnsi,
  getTerminalColorMode,
  mixColors,
  parseColor,
  stripTerminalSequences,
  type TerminalColorMode,
} from '@earendil-works/pi-tui';

const GOLD = parseColor('#D4AF37');
const BRIGHT_GOLD = parseColor('#F2C94C');
const SHIMMER_BASE = mixColors(parseColor('#A89A78'), GOLD, 0.35, 'srgb');
const SHIMMER_LAP_MS = 2400;
const SHIMMER_BAND_CELLS = 2;
const COMET_LAP_MS = 4000;
const COMET_TAIL_CELLS = 16;

export interface CometFrame {
  width: number;
  height: number;
  now: number;
  mode: TerminalColorMode;
}

export function createCometFrame(
  width: number,
  height: number,
  now: number,
  mode = getTerminalColorMode(),
): CometFrame {
  return { width, height, now, mode };
}

// Only call with generated border segments, never label or editor content.
export function colorCometBorder(
  text: string,
  column: number,
  row: number,
  frame: CometFrame,
  styleBase: (text: string) => string,
): string {
  let output = '';
  let base = '';
  const length = perimeterLength(frame.width, frame.height);
  for (const glyph of text) {
    const index = perimeterIndex(column++, row, frame.width, frame.height);
    const intensity =
      index !== undefined && '─│╭╮╰╯'.includes(glyph)
        ? cometIntensity(index, length, frame.now)
        : 0;
    if (intensity === 0) {
      base += glyph;
      continue;
    }
    if (base) output += styleBase(base);
    base = '';
    output += `${foregroundAnsi(cometColor(intensity), frame.mode)}${glyph}\x1b[39m`;
  }
  return output + (base ? styleBase(base) : '');
}

export function cometIntensity(
  index: number,
  length: number,
  now: number,
): number {
  if (length <= 0) return 0;
  const head = Math.floor(((now % COMET_LAP_MS) / COMET_LAP_MS) * length);
  const distance = (((head - index) % length) + length) % length;
  return Math.max(0, 1 - distance / COMET_TAIL_CELLS);
}

export function cometColor(intensity: number) {
  return mixColors(GOLD, BRIGHT_GOLD, intensity, 'srgb');
}

export function shimmerIntensity(
  index: number,
  length: number,
  now: number,
): number {
  const head =
    ((now % SHIMMER_LAP_MS) / SHIMMER_LAP_MS) *
      (length + SHIMMER_BAND_CELLS * 2) -
    SHIMMER_BAND_CELLS;
  return Math.max(0, 1 - Math.abs(index - head) / SHIMMER_BAND_CELLS);
}

export function shimmerColor(intensity: number) {
  return mixColors(SHIMMER_BASE, BRIGHT_GOLD, intensity, 'srgb');
}

export function renderWorkingIndicator(
  native: string,
  now: number,
  mode = getTerminalColorMode(),
): string {
  const plain = stripTerminalSequences(native);
  const pyramid = plain.match(/^([△◭▲◮])(\s*)/u);
  const prefix = pyramid
    ? `${foregroundAnsi(BRIGHT_GOLD, mode)}${pyramid[1]}\x1b[39m${pyramid[2]}`
    : '';
  const letters = Array.from(plain.slice(pyramid?.[0].length ?? 0));
  const label = letters
    .map(
      (letter, index) =>
        `${foregroundAnsi(shimmerColor(shimmerIntensity(index, letters.length, now)), mode)}${letter}`,
    )
    .join('');
  return prefix + label + (letters.length ? '\x1b[39m' : '');
}

export function perimeterLength(width: number, height: number): number {
  return width >= 2 && height >= 2 ? 2 * (width + height) - 4 : 0;
}

export function perimeterIndex(
  column: number,
  row: number,
  width: number,
  height: number,
): number | undefined {
  if (
    perimeterLength(width, height) === 0 ||
    column < 0 ||
    column >= width ||
    row < 0 ||
    row >= height
  )
    return undefined;
  if (row === 0) return column;
  if (column === width - 1) return width + row - 1;
  if (row === height - 1) return 2 * width + height - 3 - column;
  if (column === 0) return perimeterLength(width, height) - row;
  return undefined;
}
