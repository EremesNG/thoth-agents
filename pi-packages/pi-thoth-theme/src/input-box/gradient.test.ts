import {
  getCapabilities,
  setCapabilities,
  stripTerminalSequences,
  visibleWidth,
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

  it('uses public terminal capabilities to quantize the breath and shimmer to 256 colors', () => {
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
          (text) => `\x1b[38;5;138m${text}\x1b[39m`,
        );
        expect(border).toBe(`${color}╭──╮\x1b[39m`);
        expect(label.startsWith(`${color}△\x1b[39m `)).toBe(true);
        if (now === 1200) {
          expect(label).toContain('\x1b[38;5;221m\x1b[1mi\x1b[22m\x1b[39m');
        }
        expect(border + label).not.toContain('\x1b[38;2;');
        expect(stripTerminalSequences(border)).toBe('╭──╮');
        expect(stripTerminalSequences(label)).toBe('△ working…');
        expect(visibleWidth(label)).toBe(10);
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
  ])('pulses native pyramid %s in the border color without bold while its label shimmers', (pyramid) => {
    const frame = createBreathingFrame(1200, 'truecolor');
    const native = `\x1b[1m${pyramid}\x1b[0m \x1b[36mworking…\x1b[0m`;
    const muted = (text: string) => `\x1b[38;2;168;154;120m${text}\x1b[39m`;
    const label = renderWorkingIndicator(native, frame, muted);

    expect(label.startsWith(`\x1b[38;2;242;201;76m${pyramid}\x1b[39m `)).toBe(
      true,
    );
    expect(label).toContain('\x1b[38;2;242;201;76m\x1b[1mi\x1b[22m\x1b[39m');
    expect(label).toContain(muted('w'));
    expect(stripTerminalSequences(label)).toBe(`${pyramid} working…`);
  });

  it('sweeps a wider bold bright-gold band across working… on the original 2.4-second timing', () => {
    const muted = (text: string) => `\x1b[38;2;168;154;120m${text}\x1b[39m`;
    const bright = '\x1b[38;2;242;201;76m';
    const render = (now: number) =>
      renderWorkingIndicator(
        '\x1b[36m△ working…\x1b[0m',
        createBreathingFrame(now, 'truecolor'),
        muted,
      );
    const base = Array.from('working…').map(muted).join('');

    // Half a lap: i is the peak, k/n are bold, r/g fade into the muted ends.
    expect(render(1200)).toBe(
      `${bright}△\x1b[39m ${muted('w')}${muted('o')}` +
        '\x1b[38;2;193;170;105mr\x1b[39m' +
        '\x1b[38;2;217;185;91m\x1b[1mk\x1b[22m\x1b[39m' +
        `${bright}\x1b[1mi\x1b[22m\x1b[39m` +
        '\x1b[38;2;217;185;91m\x1b[1mn\x1b[22m\x1b[39m' +
        `\x1b[38;2;193;170;105mg\x1b[39m${muted('…')}`,
    );
    for (const [now, peak, unlit] of [
      [3600 / 7, 'w', '…'],
      [1200, 'i', 'w'],
      [12000 / 7, '…', 'w'],
    ] as const) {
      const label = render(now);
      expect(label).toContain(`${bright}\x1b[1m${peak}\x1b[22m\x1b[39m`);
      expect(label).toContain(muted(unlit));
      expect(stripTerminalSequences(label)).toBe('△ working…');
      expect(visibleWidth(label)).toBe(10);
    }
    expect(render(0)).toBe(`\x1b[38;2;115;104;80m△\x1b[39m ${base}`);
    expect(render(2400)).toBe(render(0));
    expect(render(2401200)).toBe(render(1200));
  });

  it.each([
    ['truecolor', '\x1b[38;2;168;154;120m', '\x1b[38;2;242;201;76m'],
    ['256color', '\x1b[38;5;138m', '\x1b[38;5;221m'],
  ] as const)('shimmers a label without a pyramid in the captured %s mode rather than redetecting capabilities', (mode, muted, bright) => {
    const capabilities = getCapabilities();
    setCapabilities({ ...capabilities, trueColor: mode !== 'truecolor' });
    try {
      const label = renderWorkingIndicator(
        '\x1b[36mworking…\x1b[0m',
        createBreathingFrame(1200, mode),
        (text) => `${muted}${text}\x1b[39m`,
      );
      expect(label).toContain(`${bright}\x1b[1mi\x1b[22m\x1b[39m`);
      expect(label.startsWith(`${muted}w\x1b[39m`)).toBe(true);
      expect(stripTerminalSequences(label)).toBe('working…');
      expect(visibleWidth(label)).toBe(8);
      if (mode === '256color') expect(label).not.toContain('\x1b[38;2;');
    } finally {
      setCapabilities(capabilities);
    }
  });
});
