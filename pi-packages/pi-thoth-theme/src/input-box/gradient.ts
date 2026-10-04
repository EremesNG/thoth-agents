import {
  getTerminalColorMode,
  mixColors,
  parseColor,
  stripTerminalSequences,
  styleText,
  type TerminalColorMode,
} from '@earendil-works/pi-tui';

const GOLD = parseColor('#D4AF37');
const BRIGHT_GOLD = parseColor('#F2C94C');
const MUTED = parseColor('#A89A78');
const DIM = parseColor('#736850');
const SHIMMER_LAP_MS = 2400;
const SHIMMER_BAND_CELLS = 3;
const COMET_LAP_MS = 3500;
const COMET_TAIL_CELLS = 30;
const CORNER_AFTERGLOW_MS = 700;
const HEAVY_INTENSITY = 0.6;
const HEAVY_BORDER_GLYPHS: Record<string, string> = {
  '─': '━',
  '│': '┃',
  '╭': '┏',
  '╮': '┓',
  '╰': '┗',
  '╯': '┛',
};

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
    const heavyGlyph = HEAVY_BORDER_GLYPHS[glyph];
    const tail =
      index !== undefined && heavyGlyph
        ? cometIntensity(index, length, frame.now)
        : 0;
    const afterglow =
      index !== undefined && '╭╮╰╯'.includes(glyph)
        ? cornerAfterglowIntensity(index, length, frame.now)
        : 0;
    const intensity = Math.max(tail, afterglow);
    if (intensity === 0) {
      base += glyph;
      continue;
    }
    if (base) output += styleBase(base);
    base = '';
    // Hold a heavy corner at bright gold, then fade without weakening its tail.
    const colorIntensity = Math.max(
      tail,
      Math.min(1, afterglow / HEAVY_INTENSITY),
    );
    output += styleText(
      intensity > HEAVY_INTENSITY ? heavyGlyph : glyph,
      { fg: cometColor(colorIntensity), bold: intensity >= 0.85 },
      frame.mode,
    );
  }
  return output + (base ? styleBase(base) : '');
}

function cornerAfterglowIntensity(
  index: number,
  length: number,
  now: number,
): number {
  const phase = ((now % COMET_LAP_MS) + COMET_LAP_MS) % COMET_LAP_MS;
  const crossedAt = (index * COMET_LAP_MS) / length;
  // Modulo also covers the most recent crossing in the previous lap.
  const age = (phase - crossedAt + COMET_LAP_MS) % COMET_LAP_MS;
  return Math.max(0, 1 - age / CORNER_AFTERGLOW_MS);
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
  return intensity <= 0.5
    ? mixColors(DIM, GOLD, intensity * 2, 'srgb')
    : mixColors(GOLD, BRIGHT_GOLD, (intensity - 0.5) * 2, 'srgb');
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
  return mixColors(MUTED, BRIGHT_GOLD, intensity, 'srgb');
}

export function renderWorkingIndicator(
  native: string,
  now: number,
  mode = getTerminalColorMode(),
): string {
  const plain = stripTerminalSequences(native);
  const pyramid = plain.match(/^([△◭▲◮])(\s*)/u);
  const prefix = pyramid
    ? styleText(pyramid[1], { fg: BRIGHT_GOLD, bold: true }, mode) + pyramid[2]
    : '';
  const letters = Array.from(plain.slice(pyramid?.[0].length ?? 0));
  const label = letters
    .map((letter, index) => {
      const intensity = shimmerIntensity(index, letters.length, now);
      return styleText(
        letter,
        { fg: shimmerColor(intensity), bold: intensity >= 0.65 },
        mode,
      );
    })
    .join('');
  return prefix + label;
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
