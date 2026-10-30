import {
  foregroundAnsi,
  getCapabilities,
  rgbColor,
  setCapabilities,
  stripTerminalSequences,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { setAnimationLevel } from '@thoth-agents/pi-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkingState } from './state.ts';

afterEach(() => {
  setAnimationLevel('full');
  vi.useRealTimers();
});

describe('input-box working status', () => {
  it.each([
    ['full', 200, 100, 24],
    ['reduced', 200, 200, 12],
    ['minimal', 500, 500, 5],
  ] as const)('steps every working glyph in order at %s and gives breathing/shimmer an evenly spaced cycle', (level, glyphMs, tickMs, cycleSteps) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    setAnimationLevel(level);
    const state = createWorkingState(() => {});
    try {
      state.setPendingBackground(1);
      const glyphs: string[] = [];
      for (let step = 0; step < 8; step++) {
        glyphs.push(stripTerminalSequences(state.status(undefined, 40))[0]);
        vi.advanceTimersByTime(glyphMs);
      }
      expect(glyphs).toEqual(['△', '◭', '▲', '◮', '△', '◭', '▲', '◮']);
      const phases: number[] = [];
      for (let step = 0; step <= cycleSteps; step++) {
        phases.push(state.breathingFrame().phase);
        vi.advanceTimersByTime(tickMs);
      }
      expect(phases[cycleSteps]).toBe(phases[0]);
      expect(new Set(phases.slice(0, cycleSteps)).size).toBe(cycleSteps);
      expect(
        phases
          .slice(1)
          .map((phase, index) =>
            Math.round(((phase - phases[index] + 1) % 1) * cycleSteps),
          ),
      ).toEqual(Array(cycleSteps).fill(1));
      const before = state.status(undefined, 40);
      vi.setSystemTime(123456789);
      expect(state.status(undefined, 40)).toBe(before);
    } finally {
      state.dispose();
    }
  });

  it('refreshes quiet root elapsed every second at off without animating, then stops when root work ends', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    setAnimationLevel('off');
    const indicator = { kind: 'working', renderInBorder: () => '◐ working' };
    const painted: string[] = [];
    const effects: Array<{ phase: number; foreground: string }> = [];
    const render = vi.fn(() => {
      painted.push(state.status(indicator, 40));
      const { phase, foreground } = state.breathingFrame();
      effects.push({ phase, foreground });
    });
    const state = createWorkingState(render);
    try {
      expect(vi.getTimerCount()).toBe(0);
      state.start();
      expect(painted.map(stripTerminalSequences)).toEqual(['◐ working · 0s']);
      vi.advanceTimersByTime(999);
      expect(render).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(painted.map(stripTerminalSequences)).toEqual([
        '◐ working · 0s',
        '◐ working · 1s',
      ]);
      expect(render).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1000);
      expect(painted.map(stripTerminalSequences)).toEqual([
        '◐ working · 0s',
        '◐ working · 1s',
        '◐ working · 2s',
      ]);
      expect(render).toHaveBeenCalledTimes(3);
      expect(effects.map(({ phase }) => phase)).toEqual([0, 0, 0]);
      expect(
        effects.every(({ foreground }) => foreground === effects[0].foreground),
      ).toBe(true);
      expect(painted[1].replace('1s', '0s')).toBe(painted[0]);
      expect(painted[2].replace('2s', '0s')).toBe(painted[0]);
      state.setPendingBackground(2);
      expect(vi.getTimerCount()).toBe(1);
      state.end();
      expect(vi.getTimerCount()).toBe(0);
      render.mockClear();
      vi.advanceTimersByTime(3000);
      expect(render).not.toHaveBeenCalled();
    } finally {
      state.dispose();
    }
  });

  it('switches off→full→off while working with one refresh and resumes at the next glyph', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    setAnimationLevel('off');
    const render = vi.fn();
    const state = createWorkingState(render);
    const glyph = () => stripTerminalSequences(state.status(undefined, 40))[0];
    try {
      state.setPendingBackground(1);
      state.start();
      expect(vi.getTimerCount()).toBe(1);
      expect(glyph()).toBe('◐');
      render.mockClear();
      vi.advanceTimersByTime(2000);
      expect(render).toHaveBeenCalledTimes(2);

      setAnimationLevel('full');
      expect(vi.getTimerCount()).toBe(1);
      expect(glyph()).toBe('△');
      render.mockClear();
      vi.advanceTimersByTime(200);
      expect(render).toHaveBeenCalledTimes(2);
      expect(glyph()).toBe('◭');

      setAnimationLevel('off');
      expect(vi.getTimerCount()).toBe(1);
      expect(glyph()).toBe('◐');
      const { phase, foreground } = state.breathingFrame();
      expect(phase).toBe(0);
      render.mockClear();
      vi.advanceTimersByTime(999);
      expect(render).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(render).toHaveBeenCalledTimes(1);
      expect(glyph()).toBe('◐');
      expect(state.breathingFrame()).toMatchObject({ phase, foreground });

      setAnimationLevel('full');
      expect(vi.getTimerCount()).toBe(1);
      const resumed = [glyph()];
      for (let step = 0; step < 3; step++) {
        vi.advanceTimersByTime(200);
        resumed.push(glyph());
      }
      expect(resumed).toEqual(['◭', '▲', '◮', '△']);
      setAnimationLevel('off');
      expect(vi.getTimerCount()).toBe(1);
      state.end();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      state.dispose();
    }
  });

  it('disposes the off elapsed refresh and level subscription without later renders', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    setAnimationLevel('off');
    const render = vi.fn();
    const state = createWorkingState(render);
    state.start();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(render).toHaveBeenCalledTimes(2);
    state.dispose();
    state.dispose();
    expect(vi.getTimerCount()).toBe(0);
    render.mockClear();
    setAnimationLevel('full');
    setAnimationLevel('off');
    vi.advanceTimersByTime(3000);
    expect(render).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'nerd',
    'unicode',
    'ascii',
  ] as const)('has no input timer for background-only work at off, uses a static %s glyph and repaints immediately on changes', (mode) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const render = vi.fn();
    const state = createWorkingState(render);
    try {
      state.setPendingBackground(2);
      setAnimationLevel('off');
      expect(vi.getTimerCount()).toBe(0);
      state.start();
      expect(vi.getTimerCount()).toBe(1);
      const native = {
        kind: 'working',
        renderInBorder: () => `${mode === 'ascii' ? '.' : '△'} working`,
      };
      expect(
        stripTerminalSequences(
          state.status(native, 40, undefined, undefined, mode),
        ).startsWith(mode === 'ascii' ? '* working' : '◐ working'),
      ).toBe(true);
      expect(state.breathingFrame().phase).toBe(0);
      state.end();
      const before = state.status(undefined, 40, undefined, undefined, mode);
      expect(stripTerminalSequences(before)).toBe(
        `${mode === 'ascii' ? '*' : '◐'} working${mode === 'ascii' ? '...' : '…'} ${mode === 'ascii' ? '|' : '·'} 2 bg`,
      );
      render.mockClear();
      vi.advanceTimersByTime(5000);
      expect(render).not.toHaveBeenCalled();
      expect(state.status(undefined, 40, undefined, undefined, mode)).toBe(
        before,
      );
      setAnimationLevel('minimal');
      expect(render).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(1);
      setAnimationLevel('off');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      state.dispose();
    }
    render.mockClear();
    setAnimationLevel('full');
    expect(render).not.toHaveBeenCalled();
  });
  it('pulses the native pyramid and shimmers the label while preserving native text and muted elapsed seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const capabilities = getCapabilities();
    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    const state = createWorkingState(() => {});
    const native = '\x1b[1m△\x1b[0m \x1b[38:2::212:175:55mworking…\x1b[0m';
    const indicator = { kind: 'working', renderInBorder: () => native };
    try {
      expect(state.status(indicator, 30)).toBe(native);
      state.start();
      vi.advanceTimersByTime(1200);
      state.start();
      const muted = (text: string) => `\x1b[38;2;168;154;120m${text}\x1b[39m`;
      const first = state.status(indicator, 30, muted);
      const bright = foregroundAnsi(rgbColor(242, 201, 76), 'truecolor');
      expect(first.startsWith(`${bright}△\x1b[39m `)).toBe(true);
      expect(first).toContain(`${bright}\x1b[1mi\x1b[22m\x1b[39m`);
      expect(first).toContain(muted('w'));
      expect(first).not.toContain('\x1b[38:2::212:175:55m');
      expect(first.endsWith(muted(' · 0s'))).toBe(true);
      expect(stripTerminalSequences(first)).toBe('△ working… · 0s');
      vi.advanceTimersByTime(1200);
      const next = state.status(indicator, 30, muted);
      const dim = foregroundAnsi(rgbColor(115, 104, 80), 'truecolor');
      expect(next.startsWith(`${dim}△\x1b[39m `)).toBe(true);
      expect(next).toContain(muted('g'));
      expect(next).not.toContain('\x1b[1m');
      expect(next.endsWith(muted(' · 1s'))).toBe(true);
      expect(next).not.toBe(first);
      expect(stripTerminalSequences(next)).toBe('△ working… · 1s');
      for (const width of [0, 1, 2, 3, 10, 14]) {
        expect(
          visibleWidth(state.status(indicator, width)),
        ).toBeLessThanOrEqual(width);
      }
      state.end();
      expect(state.status(indicator, 30)).toBe(native);
    } finally {
      state.dispose();
      setCapabilities(capabilities);
    }
  });

  it('animates pending background work without a native indicator and returns to ready when it settles', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const requestRender = vi.fn();
    const state = createWorkingState(requestRender);
    try {
      state.setPendingBackground(3);
      expect(state.isWorking).toBe(true);
      const first = state.status(undefined, 40);
      expect(stripTerminalSequences(first)).toBe('△ working… · 3 bg');
      requestRender.mockClear();
      vi.advanceTimersByTime(250);
      expect(requestRender).toHaveBeenCalledTimes(2);
      const next = state.status(undefined, 40);
      expect(next).not.toBe(first);
      expect(stripTerminalSequences(next)).toContain('working… · 3 bg');
      for (const indicator of [null, {}, { renderInBorder: () => '' }]) {
        expect(stripTerminalSequences(state.status(indicator, 40))).toContain(
          'working… · 3 bg',
        );
      }
      for (const width of [0, 1, 2, 3, 10, 14]) {
        expect(
          visibleWidth(state.status(undefined, width)),
        ).toBeLessThanOrEqual(width);
      }
      state.setPendingBackground(0);
      expect(state.isWorking).toBe(false);
      expect(state.status(undefined, 40)).toBe('▲ ready');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      state.dispose();
    }
  });

  it('preserves native working, retry and compaction rendering regardless of pending background work', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const state = createWorkingState(() => {});
    try {
      state.start();
      vi.advanceTimersByTime(1500);
      for (const kind of ['working', 'retry', 'compaction', 'extension']) {
        const indicator = { kind, renderInBorder: () => '△ native message' };
        const native = state.status(indicator, 40);
        state.setPendingBackground(2);
        expect(state.status(indicator, 40)).toBe(native);
        state.setPendingBackground(0);
        expect(state.status(indicator, 40)).toBe(native);
      }
      state.setPendingBackground(2);
      state.end();
      expect(state.isWorking).toBe(true);
      expect(stripTerminalSequences(state.status(undefined, 40))).toContain(
        'working… · 2 bg',
      );
      expect(
        state.status({ kind: 'working', renderInBorder: () => 'native' }, 40),
      ).toBe('native');
      state.start();
      state.setPendingBackground(0);
      expect(vi.getTimerCount()).toBe(1);
      expect(
        stripTerminalSequences(
          state.status(
            { kind: 'working', renderInBorder: () => '△ working…' },
            40,
          ),
        ),
      ).toBe('△ working… · 0s');
      state.end();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      state.dispose();
    }
  });

  it('renders on shared clock boundaries while active and displays only whole elapsed seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const requestRender = vi.fn();
    const state = createWorkingState(requestRender);
    const indicator = {
      kind: 'working',
      renderInBorder: vi.fn(() => '△ working…'),
    };

    try {
      expect(state.isWorking).toBe(false);
      expect(state.status(undefined, 30)).toBe('▲ ready');
      expect(vi.getTimerCount()).toBe(0);
      state.start();
      expect(requestRender).toHaveBeenCalledExactlyOnceWith();
      expect(state.isWorking).toBe(true);
      expect(stripTerminalSequences(state.status(indicator, 30))).toBe(
        '△ working… · 0s',
      );
      expect(indicator.renderInBorder).toHaveBeenLastCalledWith(25);
      requestRender.mockClear();
      // The 100 ms delay cap keeps a boundary-aligned start on exact boundaries.
      vi.advanceTimersByTime(99);
      expect(requestRender).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(requestRender).toHaveBeenCalledExactlyOnceWith();
      vi.advanceTimersByTime(2899);
      expect(stripTerminalSequences(state.status(indicator, 30))).toBe(
        '△ working… · 2s',
      );
      expect(requestRender).toHaveBeenCalledTimes(29);
      vi.advanceTimersByTime(1);
      expect(requestRender).toHaveBeenCalledTimes(30);
      expect(stripTerminalSequences(state.status(indicator, 30))).toBe(
        '△ working… · 3s',
      );
      vi.advanceTimersByTime(1);
      expect(requestRender).toHaveBeenCalledTimes(30);
      expect(requestRender).toHaveBeenLastCalledWith();
      state.end();
      expect(requestRender).toHaveBeenCalledTimes(31);
      expect(state.isWorking).toBe(false);
      expect(state.status(undefined, 30)).toBe('▲ ready');
      requestRender.mockClear();
      vi.advanceTimersByTime(3000);
      expect(requestRender).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      state.dispose();
    }
  });

  it.each([
    [-1000, '0s'],
    [999, '0s'],
    [12345, '12s'],
    [45000, '45s'],
    [59999, '59s'],
    [60000, '1m 00s'],
    [845999, '14m 05s'],
    [3599999, '59m 59s'],
    [3600000, '1h 00m'],
    [7439999, '2h 03m'],
  ])('keeps elapsed duration muted and floored at %s ms within the status width', (now, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const state = createWorkingState(() => {});
    const indicator = { kind: 'working', renderInBorder: () => '△ working…' };
    const muted = (text: string) => `\x1b[2m${text}\x1b[22m`;
    try {
      state.start();
      vi.setSystemTime(now);
      const status = state.status(indicator, 40, muted);
      expect(stripTerminalSequences(status)).toBe(`△ working… · ${expected}`);
      expect(status.endsWith(muted(` · ${expected}`))).toBe(true);
      for (const width of [0, 1, 2, 3, 10, 14, 20, 40]) {
        expect(
          visibleWidth(state.status(indicator, width, muted)),
        ).toBeLessThanOrEqual(width);
      }
    } finally {
      state.dispose();
    }
  });

  it('preserves retry and compaction messages and falls back for unsupported or empty indicators', () => {
    vi.useFakeTimers();
    const state = createWorkingState(() => {});
    try {
      state.start();
      vi.advanceTimersByTime(1500);
      for (const kind of ['retry', 'compaction', 'extension']) {
        expect(
          state.status(
            { kind, renderInBorder: () => '\x1b[31mnative message\x1b[0m' },
            30,
          ),
        ).toBe('\x1b[31mnative message\x1b[0m');
      }
      for (const indicator of [
        null,
        {},
        { renderInBorder: 1 },
        { renderInBorder: () => '' },
      ]) {
        expect(state.status(indicator, 30)).toBe('▲ ready');
      }
    } finally {
      state.dispose();
    }
  });

  it('renders lifecycle changes immediately and stays subscribed until both working sources settle', () => {
    vi.useFakeTimers();
    const requestRender = vi.fn();
    const state = createWorkingState(requestRender);
    try {
      state.start();
      state.start();
      expect(requestRender).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(1);
      state.setPendingBackground(2);
      expect(requestRender).toHaveBeenCalledTimes(3);
      state.setPendingBackground(2);
      expect(requestRender).toHaveBeenCalledTimes(3);
      state.end();
      expect(requestRender).toHaveBeenCalledTimes(4);
      expect(state.isWorking).toBe(true);
      expect(vi.getTimerCount()).toBe(1);
      state.start();
      state.setPendingBackground(0);
      expect(requestRender).toHaveBeenCalledTimes(6);
      expect(state.isWorking).toBe(true);
      expect(vi.getTimerCount()).toBe(1);
      state.end();
      expect(requestRender).toHaveBeenCalledTimes(7);
      expect(state.isWorking).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      state.setPendingBackground(1);
      expect(requestRender).toHaveBeenCalledTimes(8);
      expect(vi.getTimerCount()).toBe(1);
      state.dispose();
      state.dispose();
      expect(state.isWorking).toBe(false);
      requestRender.mockClear();
      state.start();
      state.end();
      state.setPendingBackground(2);
      vi.advanceTimersByTime(2000);
      expect(vi.getTimerCount()).toBe(0);
      expect(requestRender).not.toHaveBeenCalled();
    } finally {
      state.dispose();
    }
  });

  it('shares aligned ticks across working states and releases only its own subscription', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const parentRender = vi.fn();
    const backgroundRender = vi.fn();
    const parent = createWorkingState(parentRender);
    const background = createWorkingState(backgroundRender);
    try {
      parent.start();
      vi.advanceTimersByTime(50);
      background.setPendingBackground(1);
      expect(vi.getTimerCount()).toBe(1);
      parentRender.mockClear();
      backgroundRender.mockClear();
      vi.advanceTimersByTime(49);
      expect(parentRender).not.toHaveBeenCalled();
      expect(backgroundRender).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(parentRender).toHaveBeenCalledExactlyOnceWith();
      expect(backgroundRender).toHaveBeenCalledExactlyOnceWith();

      parent.end();
      parentRender.mockClear();
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(100);
      expect(parentRender).not.toHaveBeenCalled();
      expect(backgroundRender).toHaveBeenCalledTimes(2);
      background.setPendingBackground(0);
      expect(backgroundRender).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      parent.dispose();
      background.dispose();
    }
  });
});
