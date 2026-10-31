import {
  foregroundAnsi,
  getTerminalColorMode,
  mixColors,
  parseColor,
  stripTerminalSequences,
  styleText,
  type TerminalColorMode,
} from '@earendil-works/pi-tui';
import {
  getAnimationCycleSteps,
  isAnimationEffectEnabled,
} from '@thoth-agents/pi-core';
import { frames } from '../shared/icons.ts';

const GOLD = parseColor('#D4AF37');
const BRIGHT_GOLD = parseColor('#F2C94C');
const DIM = parseColor('#736850');
const MUTED = parseColor('#A89A78');
const BREATHING_CYCLE_MS = 2400;
const SHIMMER_BAND_CELLS = 3;

export interface BreathingFrame {
  now: number;
  phase: number;
  foreground: string;
  mode: TerminalColorMode;
}

export function createBreathingFrame(
  step: number,
  mode = getTerminalColorMode(),
  now = Date.now(),
): BreathingFrame {
  if (!isAnimationEffectEnabled('ambient')) {
    return {
      now,
      phase: 0,
      foreground: foregroundAnsi(BRIGHT_GOLD, mode),
      mode,
    };
  }
  const steps = getAnimationCycleSteps(BREATHING_CYCLE_MS);
  const phase =
    steps === undefined ? 0 : (((step % steps) + steps) % steps) / steps;
  const intensity = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
  const color =
    intensity <= 0.5
      ? mixColors(DIM, GOLD, intensity * 2, 'srgb')
      : mixColors(GOLD, BRIGHT_GOLD, (intensity - 0.5) * 2, 'srgb');
  return { now, phase, foreground: foregroundAnsi(color, mode), mode };
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
  glyphs: readonly string[] = frames('workingFrames', 'nerd'),
): string {
  const plain = stripTerminalSequences(native);
  const glyph = glyphs.find(
    (candidate) =>
      plain.startsWith(candidate) &&
      (plain.length === candidate.length ||
        /^\s/u.test(plain.slice(candidate.length))),
  );
  const spacing =
    glyph === undefined
      ? ''
      : (/^\s*/u.exec(plain.slice(glyph.length))?.[0] ?? '');
  const text = plain.slice(
    glyph === undefined ? 0 : glyph.length + spacing.length,
  );
  if (!isAnimationEffectEnabled('ambient')) {
    const active = foregroundAnsi(GOLD, frame.mode);
    const prefix =
      glyph === undefined ? '' : `${active}${glyph}\x1b[39m${spacing}`;
    return `${prefix}${active}${text}\x1b[39m`;
  }
  const prefix =
    glyph === undefined ? '' : `${frame.foreground}${glyph}[39m${spacing}`;
  const letters = Array.from(text);
  const head =
    frame.phase * (letters.length + SHIMMER_BAND_CELLS * 2) -
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
