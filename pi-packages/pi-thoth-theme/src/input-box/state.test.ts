import {
  foregroundAnsi,
  getCapabilities,
  rgbColor,
  setCapabilities,
  stripTerminalSequences,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkingState } from './state.ts';

afterEach(() => vi.useRealTimers());

describe('input-box working status', () => {
  it('pulses the native pyramid while keeping the working label and elapsed seconds muted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1200);
    const capabilities = getCapabilities();
    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    const state = createWorkingState(() => {});
    const native = '\x1b[1m△\x1b[0m \x1b[38:2::212:175:55mworking…\x1b[0m';
    const indicator = { kind: 'working', renderInBorder: () => native };
    try {
      expect(state.status(indicator, 30)).toBe(native);
      state.start();
      const muted = (text: string) => `\x1b[38;2;168;154;120m${text}\x1b[39m`;
      const first = state.status(indicator, 30, muted);
      const bright = foregroundAnsi(rgbColor(242, 201, 76), 'truecolor');
      expect(first).toBe(
        `${bright}△\x1b[39m ${muted('working…')}${muted(' · 0s')}`,
      );
      expect(stripTerminalSequences(first)).toBe('△ working… · 0s');
      vi.advanceTimersByTime(1200);
      const next = state.status(indicator, 30, muted);
      const dim = foregroundAnsi(rgbColor(115, 104, 80), 'truecolor');
      expect(next).toBe(
        `${dim}△\x1b[39m ${muted('working…')}${muted(' · 1s')}`,
      );
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

  it('renders at twenty fps while active and displays only whole elapsed seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const requestRender = vi.fn();
    const state = createWorkingState(requestRender);
    const indicator = {
      kind: 'working',
      renderInBorder: vi.fn(() => '△ working…'),
    };

    expect(state.isWorking).toBe(false);
    expect(state.status(undefined, 30)).toBe('▲ ready');
    state.start();
    expect(state.isWorking).toBe(true);
    expect(stripTerminalSequences(state.status(indicator, 30))).toBe(
      '△ working… · 0s',
    );
    expect(indicator.renderInBorder).toHaveBeenLastCalledWith(25);
    requestRender.mockClear();
    vi.advanceTimersByTime(2999);
    expect(stripTerminalSequences(state.status(indicator, 30))).toBe(
      '△ working… · 2s',
    );
    expect(requestRender).toHaveBeenCalledTimes(59);
    vi.advanceTimersByTime(1);
    expect(requestRender).toHaveBeenCalledTimes(60);
    expect(stripTerminalSequences(state.status(indicator, 30))).toBe(
      '△ working… · 3s',
    );
    state.end();
    expect(state.isWorking).toBe(false);
    expect(state.status(undefined, 30)).toBe('▲ ready');
    requestRender.mockClear();
    vi.advanceTimersByTime(3000);
    expect(requestRender).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves retry and compaction messages and falls back for unsupported or empty indicators', () => {
    vi.useFakeTimers();
    const state = createWorkingState(() => {});
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
    state.dispose();
  });

  it('owns one ticker across restarts and ignores lifecycle callbacks after disposal', () => {
    vi.useFakeTimers();
    const requestRender = vi.fn();
    const state = createWorkingState(requestRender);
    state.start();
    state.start();
    expect(vi.getTimerCount()).toBe(1);
    state.dispose();
    expect(state.isWorking).toBe(false);
    requestRender.mockClear();
    state.start();
    state.end();
    vi.advanceTimersByTime(2000);
    expect(vi.getTimerCount()).toBe(0);
    expect(requestRender).not.toHaveBeenCalled();
  });
});
