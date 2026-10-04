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
  it.each([
    ['─', '━', 20, 0, 20],
    ['│', '┃', 39, 1, 40],
    ['╭', '┏', 0, 0, 0],
    ['╮', '┓', 39, 0, 39],
    ['╰', '┗', 0, 3, 81],
    ['╯', '┛', 39, 3, 42],
  ] as const)('uses the single-width heavy %s → %s glyph at the bright head', (light, heavy, column, row, index) => {
    const frame = createCometFrame(
      40,
      4,
      Math.ceil((index * 3500) / 84),
      'truecolor',
    );
    const border = colorCometBorder(light, column, row, frame, (text) => text);
    expect(border).toBe(`\x1b[38;2;242;201;76m\x1b[1m${heavy}\x1b[22m\x1b[39m`);
  });

  it('thickens the bright leading cells but leaves the faint tail light', () => {
    const frame = createCometFrame(40, 4, 875, 'truecolor');
    expect(
      stripTerminalSequences(
        colorCometBorder('───', 19, 0, frame, (text) => text),
      ),
    ).toBe('━━━');
    expect(
      stripTerminalSequences(
        colorCometBorder('───', 0, 0, frame, (text) => text),
      ),
    ).toBe('───');
  });

  it('uses public terminal capabilities to quantize the comet and shimmer to 256 colors', () => {
    const capabilities = getCapabilities();
    setCapabilities({ images: null, trueColor: false, hyperlinks: false });
    try {
      const frame = createCometFrame(4, 3, 0);
      const border = colorCometBorder('╭──╮', 0, 0, frame, (text) => text);
      const label = renderWorkingIndicator('△ working…', 400);
      expect(frame.mode).toBe('256color');
      expect(border.startsWith('\x1b[38;5;221m\x1b[1m┏')).toBe(true);
      expect(label.startsWith('\x1b[38;5;221m\x1b[1m△')).toBe(true);
      expect(border).not.toContain('\x1b[38;2;');
      expect(label).not.toContain('\x1b[38;2;');
      expect(stripTerminalSequences(border)).toBe('┏━━┓');
      expect(stripTerminalSequences(label)).toBe('△ working…');
    } finally {
      setCapabilities(capabilities);
    }
  });

  it.each([
    ['╭', '┏', 0, 0, 0],
    ['╮', '┓', 399, 0, 399],
    ['╰', '┗', 0, 3, 801],
    ['╯', '┛', 399, 3, 402],
  ] as const)('keeps corner %s glowing independently of the tail for 700 ms, including across laps', (light, heavy, column, row, index) => {
    // This 804-cell perimeter carries the 30-cell tail past a corner in ~131 ms.
    const crossedAt = Math.ceil((index * 3500) / 804);
    const dim = (text: string) => `\x1b[38;2;115;104;80m${text}\x1b[39m`;
    const render = (now: number) =>
      colorCometBorder(
        light,
        column,
        row,
        createCometFrame(400, 4, now, 'truecolor'),
        dim,
      );
    const glow = render(crossedAt + 200);
    expect(glow).toBe(`\x1b[38;2;242;201;76m${heavy}\x1b[39m`);
    const fading = render(crossedAt + 500);
    expect(stripTerminalSequences(fading)).toBe(light);
    expect(fading).not.toBe(dim(light));
    expect(fading).not.toContain('\x1b[38;2;242;201;76m');
    expect(render(crossedAt + 700)).toBe(dim(light));
    expect(render(crossedAt + 701)).toBe(dim(light));
    expect(render(crossedAt + 3700)).toBe(glow);
  });

  it('quantizes the detached corner flash to the 256-color palette', () => {
    const dim = (text: string) => `\x1b[38;5;59m${text}\x1b[39m`;
    const render = (now: number) =>
      colorCometBorder(
        '╭',
        0,
        0,
        createCometFrame(400, 4, now, '256color'),
        dim,
      );
    expect(render(200)).toBe('\x1b[38;5;221m┏\x1b[39m');
    expect(render(700)).toBe(dim('╭'));
  });

  it('does not weaken the normal tail when a short box outlasts the corner flash', () => {
    const dim = (text: string) => `\x1b[38;2;115;104;80m${text}\x1b[39m`;
    const render = (now: number) =>
      colorCometBorder(
        '╭',
        0,
        0,
        createCometFrame(40, 4, now, 'truecolor'),
        dim,
      );
    expect(render(200)).toBe('\x1b[38;2;242;201;76m\x1b[1m┏\x1b[22m\x1b[39m');
    const tail = render(701);
    expect(stripTerminalSequences(tail)).toBe('╭');
    expect(tail).not.toBe(dim('╭'));
    expect(render(1500)).toBe(dim('╭'));
  });

  it('does not flash a corner before the head arrives', () => {
    const dim = (text: string) => `\x1b[38;2;115;104;80m${text}\x1b[39m`;
    expect(
      colorCometBorder(
        '╮',
        399,
        0,
        createCometFrame(400, 4, 1736, 'truecolor'),
        dim,
      ),
    ).toBe(dim('╮'));
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

  it('moves a bright head and a thirty-cell bright-gold, gold, dim tail once per 3.5 seconds at any width', () => {
    expect(cometIntensity(0, 100, 0)).toBe(1);
    expect(cometIntensity(99, 100, 0)).toBe(29 / 30);
    expect(cometIntensity(85, 100, 0)).toBe(0.5);
    expect(cometIntensity(71, 100, 0)).toBeCloseTo(1 / 30);
    expect(cometIntensity(70, 100, 0)).toBe(0);
    expect(cometIntensity(1, 100, 0)).toBe(0);
    expect(cometIntensity(25, 100, 875)).toBe(1);
    expect(cometIntensity(50, 200, 875)).toBe(1);
    expect(cometIntensity(0, 100, 3500)).toBe(1);
    expect(cometIntensity(0, 0, 0)).toBe(0);
    expect(colorToHex(cometColor(0))).toBe('#736850');
    expect(colorToHex(cometColor(0.25))).toBe('#a48c44');
    expect(colorToHex(cometColor(0.5))).toBe('#d4af37');
    expect(colorToHex(cometColor(0.75))).toBe('#e3bc42');
    expect(colorToHex(cometColor(1))).toBe('#f2c94c');
  });

  it.each([
    [
      'truecolor',
      '\x1b[38;2;115;104;80m',
      '\x1b[38;2;212;175;55m',
      '\x1b[38;2;242;201;76m',
    ],
    ['256color', '\x1b[38;5;59m', '\x1b[38;5;179m', '\x1b[38;5;221m'],
  ] as const)('renders a bold heavy head, a light gold midpoint, and a dim end without leaking bold in %s', (mode, dim, gold, bright) => {
    // At 875 ms the head is top cell 31 on this 124-cell perimeter.
    const frame = createCometFrame(60, 4, 875, mode);
    const border = colorCometBorder(
      '─'.repeat(32),
      0,
      0,
      frame,
      (text) => `${dim}${text}\x1b[39m`,
    );
    expect(border.startsWith(`${dim}──\x1b[39m`)).toBe(true);
    expect(border).toContain(`${gold}─\x1b[39m`);
    expect(border.endsWith(`${bright}\x1b[1m━\x1b[22m\x1b[39m`)).toBe(true);
    expect(stripTerminalSequences(border)).toBe(
      '─'.repeat(20) + '━'.repeat(12),
    );
    expect(border.split('\x1b[1m')).toHaveLength(6);
    expect(border.split('\x1b[22m')).toHaveLength(6);
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
