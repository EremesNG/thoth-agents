import {
  foregroundAnsi,
  getTerminalColorMode,
  mixColors,
  parseColor,
  stripTerminalSequences,
  styleText,
  type TerminalColorMode,
} from '@earendil-works/pi-tui';

const GOLD = parseColor('#D4AF37');
const BRIGHT_GOLD = parseColor('#F2C94C');
const DIM = parseColor('#736850');
const MUTED = parseColor('#A89A78');
const BREATHING_CYCLE_MS = 2400;
const SHIMMER_LAP_MS = 2400;
const SHIMMER_BAND_CELLS = 3;

export interface BreathingFrame {
  now: number;
  foreground: string;
  mode: TerminalColorMode;
}

export function createBreathingFrame(
  now: number,
  mode = getTerminalColorMode(),
): BreathingFrame {
  const phase = ((now % BREATHING_CYCLE_MS) / BREATHING_CYCLE_MS) * 2 * Math.PI;
  const intensity = (1 - Math.cos(phase)) / 2;
  const color =
    intensity <= 0.5
      ? mixColors(DIM, GOLD, intensity * 2, 'srgb')
      : mixColors(GOLD, BRIGHT_GOLD, (intensity - 0.5) * 2, 'srgb');
  return { now, foreground: foregroundAnsi(color, mode), mode };
}

// Only call with generated border segments, never label or editor content.
export function colorBreathingBorder(
  text: string,
  frame: BreathingFrame,
): string {
  return `${frame.foreground}${text}\x1b[39m`;
}

export function renderWorkingIndicator(
  native: string,
  frame: BreathingFrame,
  styleMuted: (text: string) => string,
): string {
  const plain = stripTerminalSequences(native);
  const pyramid = plain.match(/^([△◭▲◮])(\s*)/u);
  const prefix = pyramid
    ? `${frame.foreground}${pyramid[1]}\x1b[39m${pyramid[2]}`
    : '';
  const letters = Array.from(plain.slice(pyramid?.[0].length ?? 0));
  const head =
    ((frame.now % SHIMMER_LAP_MS) / SHIMMER_LAP_MS) *
      (letters.length + SHIMMER_BAND_CELLS * 2) -
    SHIMMER_BAND_CELLS;
  const label = letters
    .map((letter, index) => {
      const intensity = Math.max(
        0,
        1 - Math.abs(index - head) / SHIMMER_BAND_CELLS,
      );
      return intensity === 0
        ? styleMuted(letter)
        : styleText(
            letter,
            {
              fg: mixColors(MUTED, BRIGHT_GOLD, intensity, 'srgb'),
              bold: intensity >= 0.65,
            },
            frame.mode,
          );
    })
    .join('');
  return prefix + label;
}
