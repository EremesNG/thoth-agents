import {
  getCapabilities,
  setCapabilities,
  stripTerminalSequences,
} from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';
import {
  colorBreathingBorder,
  createBreathingFrame,
  renderWorkingIndicator,
} from './gradient.ts';

describe('input-box breathing animation', () => {
  it('breathes uniformly from dim sand through gold to bright gold over 2.4 seconds with light glyphs', () => {
    const border = '╭──╮││╰──╯';
    const render = (now: number) =>
      colorBreathingBorder(border, createBreathingFrame(now, 'truecolor'));

    expect(render(0)).toBe(`\x1b[38;2;115;104;80m${border}\x1b[39m`);
    expect(render(600)).toBe(`\x1b[38;2;212;175;55m${border}\x1b[39m`);
    expect(render(1200)).toBe(`\x1b[38;2;242;201;76m${border}\x1b[39m`);
    expect(render(1800)).toBe(render(600));
    expect(render(2400)).toBe(render(0));
    expect(render(-600)).toBe(render(1800));
    expect(render(0)).not.toBe(render(1200));
  });

  it('uses sinusoidal easing with a symmetric rise and fall, including distant cycles', () => {
    const render = (now: number) =>
      colorBreathingBorder('─', createBreathingFrame(now, 'truecolor'));

    // At one sixth and one third of the cycle, brightness is 25% and 75%.
    expect(render(400)).toBe('\x1b[38;2;164;140;68m─\x1b[39m');
    expect(render(800)).toBe('\x1b[38;2;227;188;66m─\x1b[39m');
    expect(render(1600)).toBe(render(800));
    expect(render(2000)).toBe(render(400));
    expect(render(2400400)).toBe(render(400));
  });

  it('uses public terminal capabilities to quantize the whole breath to 256 colors', () => {
    const capabilities = getCapabilities();
    setCapabilities({ images: null, trueColor: false, hyperlinks: false });
    try {
      for (const [now, color] of [
        [0, '\x1b[38;5;59m'],
        [600, '\x1b[38;5;179m'],
        [1200, '\x1b[38;5;221m'],
      ] as const) {
        const frame = createBreathingFrame(now);
        const border = colorBreathingBorder('╭──╮', frame);
        const label = renderWorkingIndicator(
          '△ working…',
          frame,
          (text) => text,
        );
        expect(border).toBe(`${color}╭──╮\x1b[39m`);
        expect(label).toBe(`${color}△\x1b[39m working…`);
        expect(border + label).not.toContain('\x1b[38;2;');
        expect(stripTerminalSequences(border)).toBe('╭──╮');
        expect(stripTerminalSequences(label)).toBe('△ working…');
      }
    } finally {
      setCapabilities(capabilities);
    }
  });

  it.each([
    '△',
    '◭',
    '▲',
    '◮',
  ])('pulses native pyramid %s without animating its label', (pyramid) => {
    const frame = createBreathingFrame(600, 'truecolor');
    const native = `\x1b[1m${pyramid}\x1b[0m \x1b[36mworking…\x1b[0m`;
    const muted = (text: string) => `\x1b[38;2;168;154;120m${text}\x1b[39m`;

    expect(renderWorkingIndicator(native, frame, muted)).toBe(
      `\x1b[38;2;212;175;55m${pyramid}\x1b[39m ${muted('working…')}`,
    );
  });

  it('keeps a working label without a native pyramid entirely muted', () => {
    expect(
      renderWorkingIndicator(
        '\x1b[36mworking…\x1b[0m',
        createBreathingFrame(1200, 'truecolor'),
        (text) => `\x1b[33m${text}\x1b[39m`,
      ),
    ).toBe('\x1b[33mworking…\x1b[39m');
  });
});
