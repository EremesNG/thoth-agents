import {
  colorToHex,
  getCapabilities,
  setCapabilities,
  stripTerminalSequences,
} from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';
import {
  colorCometBorder,
  cometColor,
  cometIntensity,
  createCometFrame,
  perimeterIndex,
  perimeterLength,
  renderWorkingIndicator,
  shimmerColor,
  shimmerIntensity,
} from './gradient.ts';

describe('input-box animation gradients', () => {
  it('uses public terminal capabilities to quantize the comet and shimmer to 256 colors', () => {
    const capabilities = getCapabilities();
    setCapabilities({ images: null, trueColor: false, hyperlinks: false });
    try {
      const frame = createCometFrame(4, 3, 0);
      const border = colorCometBorder('╭──╮', 0, 0, frame, (text) => text);
      const label = renderWorkingIndicator('△ working…', 400);
      expect(frame.mode).toBe('256color');
      expect(border.startsWith('\x1b[38;5;221m\x1b[1m╭')).toBe(true);
      expect(label.startsWith('\x1b[38;5;221m\x1b[1m△')).toBe(true);
      expect(border).not.toContain('\x1b[38;2;');
      expect(label).not.toContain('\x1b[38;2;');
      expect(stripTerminalSequences(border)).toBe('╭──╮');
      expect(stripTerminalSequences(label)).toBe('△ working…');
    } finally {
      setCapabilities(capabilities);
    }
  });

  it('sweeps a wider shimmer with a bright peak and unblended muted base using injected time', () => {
    expect(shimmerIntensity(0, 8, 0)).toBe(0);
    expect(shimmerIntensity(0, 8, 3600 / 7)).toBeCloseTo(1);
    // Half a 2.4-second lap: the band peaks on working… cell 4 (i).
    expect(shimmerIntensity(4, 8, 1200)).toBe(1);
    expect(shimmerIntensity(3, 8, 1200)).toBeCloseTo(2 / 3);
    expect(shimmerIntensity(2, 8, 1200)).toBeCloseTo(1 / 3);
    expect(shimmerIntensity(1, 8, 1200)).toBe(0);
    expect(shimmerIntensity(7, 8, 12000 / 7)).toBeCloseTo(1);
    expect(shimmerIntensity(0, 8, 2400)).toBe(0);
    expect(colorToHex(shimmerColor(0))).toBe('#a89a78');
    expect(colorToHex(shimmerColor(1))).toBe('#f2c94c');
  });

  it('moves a bright head and a twenty-cell bright-gold, gold, sand tail once per 3.5 seconds at any width', () => {
    expect(cometIntensity(0, 100, 0)).toBe(1);
    expect(cometIntensity(99, 100, 0)).toBe(19 / 20);
    expect(cometIntensity(90, 100, 0)).toBe(0.5);
    expect(cometIntensity(80, 100, 0)).toBe(0);
    expect(cometIntensity(1, 100, 0)).toBe(0);
    expect(cometIntensity(25, 100, 875)).toBe(1);
    expect(cometIntensity(50, 200, 875)).toBe(1);
    expect(cometIntensity(0, 100, 3500)).toBe(1);
    expect(cometIntensity(0, 0, 0)).toBe(0);
    expect(colorToHex(cometColor(0))).toBe('#a89a78');
    expect(colorToHex(cometColor(0.25))).toBe('#bea558');
    expect(colorToHex(cometColor(0.5))).toBe('#d4af37');
    expect(colorToHex(cometColor(0.75))).toBe('#e3bc42');
    expect(colorToHex(cometColor(1))).toBe('#f2c94c');
  });

  it.each([
    [
      'truecolor',
      '\x1b[38;2;168;154;120m',
      '\x1b[38;2;212;175;55m',
      '\x1b[38;2;242;201;76m',
    ],
    ['256color', '\x1b[38;5;138m', '\x1b[38;5;179m', '\x1b[38;5;221m'],
  ] as const)('renders a bold bright head, a gold midpoint, and a muted end without leaking bold in %s', (mode, muted, gold, bright) => {
    // At 875 ms the head is top cell 21 on this 84-cell perimeter.
    const frame = createCometFrame(40, 4, 875, mode);
    const border = colorCometBorder(
      '─'.repeat(22),
      0,
      0,
      frame,
      (text) => `${muted}${text}\x1b[39m`,
    );
    expect(border.startsWith(`${muted}──\x1b[39m`)).toBe(true);
    expect(border).toContain(`${gold}─\x1b[39m`);
    expect(border.endsWith(`${bright}\x1b[1m─\x1b[22m\x1b[39m`)).toBe(true);
    expect(stripTerminalSequences(border)).toBe('─'.repeat(22));
    expect(border.split('\x1b[1m')).toHaveLength(5);
    expect(border.split('\x1b[22m')).toHaveLength(5);
  });

  it('indexes the whole perimeter clockwise, with each corner visited once', () => {
    const clockwise = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [4, 1],
      [4, 2],
      [4, 3],
      [3, 3],
      [2, 3],
      [1, 3],
      [0, 3],
      [0, 2],
      [0, 1],
    ];
    expect(perimeterLength(5, 4)).toBe(14);
    expect(clockwise.map(([x, y]) => perimeterIndex(x, y, 5, 4))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
    expect(perimeterIndex(2, 1, 5, 4)).toBeUndefined();
    expect(perimeterIndex(-1, 0, 5, 4)).toBeUndefined();
    expect(perimeterIndex(5, 0, 5, 4)).toBeUndefined();
    expect(perimeterLength(1, 4)).toBe(0);
    expect(perimeterIndex(0, 0, 1, 4)).toBeUndefined();
  });
});
