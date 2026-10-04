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
      expect(border.startsWith('\x1b[38;5;221m╭')).toBe(true);
      expect(label.startsWith('\x1b[38;5;221m△')).toBe(true);
      expect(border).not.toContain('\x1b[38;2;');
      expect(label).not.toContain('\x1b[38;2;');
      expect(stripTerminalSequences(border)).toBe('╭──╮');
      expect(stripTerminalSequences(label)).toBe('△ working…');
    } finally {
      setCapabilities(capabilities);
    }
  });

  it('sweeps a narrow shimmer from the first to the last letter using injected time', () => {
    expect(shimmerIntensity(0, 8, 0)).toBe(0);
    expect(shimmerIntensity(0, 8, 400)).toBe(1);
    expect(shimmerIntensity(1, 8, 400)).toBe(0.5);
    expect(shimmerIntensity(2, 8, 400)).toBe(0);
    expect(shimmerIntensity(7, 8, 1800)).toBe(1);
    expect(shimmerIntensity(0, 8, 2400)).toBe(0);
    expect(colorToHex(shimmerColor(0))).toBe('#b7a161');
    expect(colorToHex(shimmerColor(1))).toBe('#f2c94c');
  });

  it('moves a bright head and a sixteen-cell fading tail once per four seconds at any width', () => {
    expect(cometIntensity(0, 100, 0)).toBe(1);
    expect(cometIntensity(99, 100, 0)).toBe(15 / 16);
    expect(cometIntensity(92, 100, 0)).toBe(0.5);
    expect(cometIntensity(84, 100, 0)).toBe(0);
    expect(cometIntensity(1, 100, 0)).toBe(0);
    expect(cometIntensity(25, 100, 1000)).toBe(1);
    expect(cometIntensity(50, 200, 1000)).toBe(1);
    expect(cometIntensity(0, 100, 4000)).toBe(1);
    expect(cometIntensity(0, 0, 0)).toBe(0);
    expect(colorToHex(cometColor(0))).toBe('#d4af37');
    expect(colorToHex(cometColor(0.5))).toBe('#e3bc42');
    expect(colorToHex(cometColor(1))).toBe('#f2c94c');
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
