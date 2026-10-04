import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkingState } from './state.ts';

afterEach(() => vi.useRealTimers());

describe('input-box working status', () => {
  it('renders ready or the native indicator with whole seconds only while working', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    const requestRender = vi.fn();
    const state = createWorkingState(requestRender);
    const indicator = {
      kind: 'working',
      renderInBorder: vi.fn(() => '△ working…'),
    };

    expect(state.status(undefined, 30)).toBe('▲ ready');
    state.start();
    expect(state.status(indicator, 30)).toBe('△ working… · 0s');
    expect(indicator.renderInBorder).toHaveBeenLastCalledWith(25);
    requestRender.mockClear();
    vi.advanceTimersByTime(2999);
    expect(state.status(indicator, 30)).toBe('△ working… · 2s');
    expect(requestRender).toHaveBeenCalledTimes(2);
    state.end();
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
        state.status({ kind, renderInBorder: () => 'native message' }, 30),
      ).toBe('native message');
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
    requestRender.mockClear();
    state.start();
    state.end();
    vi.advanceTimersByTime(2000);
    expect(vi.getTimerCount()).toBe(0);
    expect(requestRender).not.toHaveBeenCalled();
  });
});
