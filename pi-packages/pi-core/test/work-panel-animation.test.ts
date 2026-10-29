import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureWorkPanel,
  registerWorkPanelProvider,
  subscribeAnimationClock,
} from '../src/index.js';
import { provider, uiSession } from './work-panel-fixture.js';

const cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1042);
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

describe('work panel shared animation', () => {
  it('defers provider refreshes while animating, publishes the latest rows on the next tick, then refreshes idle changes immediately', async () => {
    const session = uiSession();
    let primary = 'first';
    let status = 'running';
    let notify = () => {};
    const listRows = vi.fn(() => [{ id: 'task', primary, status }]);
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        listRows,
        onVisibleChanged(listener) {
          notify = listener;
          return () => {};
        },
      }),
      await ensureWorkPanel(session.ctx),
    );
    session.tui.requestRender.mockClear();
    listRows.mockClear();
    primary = 'intermediate';
    notify();
    vi.advanceTimersByTime(20);
    primary = 'latest';
    notify();
    notify();
    expect(session.tui.requestRender).not.toHaveBeenCalled();
    expect(listRows).not.toHaveBeenCalled();
    vi.advanceTimersByTime(39);
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(session.render()).toContain('  ◐ latest');

    status = 'completed';
    notify();
    expect(vi.getTimerCount()).toBe(1);
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(session.tui.requestRender).toHaveBeenCalledTimes(2);
    expect(session.render()).toContain('  ✓ latest');
    expect(vi.getTimerCount()).toBe(0);
    primary = 'idle update';
    notify();
    expect(session.tui.requestRender).toHaveBeenCalledTimes(3);
    expect(session.render()).toContain('  ✓ idle update');
    expect(vi.getTimerCount()).toBe(0);

    status = 'running';
    notify();
    expect(session.tui.requestRender).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('renders completion within 100 ms immediately after a boundary-aligned subscription', async () => {
    vi.setSystemTime(1000);
    const session = uiSession();
    let status = 'running';
    let notify = () => {};
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        listRows: () => [{ id: 'task', primary: 'Task', status }],
        onVisibleChanged(listener) {
          notify = listener;
          return () => {};
        },
      }),
      await ensureWorkPanel(session.ctx),
    );
    const frames: Array<{ at: number; lines: string[] }> = [];
    session.tui.requestRender.mockClear();
    session.tui.requestRender.mockImplementation(() => {
      frames.push({ at: Date.now(), lines: session.render() });
    });

    status = 'completed';
    notify();
    expect(frames).toEqual([]);
    vi.advanceTimersByTime(99);
    expect(frames).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(frames).toHaveLength(1);
    expect(frames[0].at).toBe(1100);
    expect(frames[0].lines).toContain('  ✓ Task');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(100);
    expect(frames).toHaveLength(1);
  });

  it('coalesces completion at an animation boundary into one frame and retains the exact linger deadline', async () => {
    const session = uiSession();
    let running = true;
    let notify = () => {};
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        retention: 'prompt',
        listRows: () => [
          {
            id: 'task',
            primary: 'Task',
            status: running ? 'running' : 'completed',
            state: running ? 'running' : 'done',
            endedAt: running ? undefined : 1100,
          },
        ],
        onVisibleChanged(listener) {
          notify = listener;
          return () => {};
        },
      }),
      await ensureWorkPanel(session.ctx),
    );
    const frames: Array<{ at: number; lines: string[] }> = [];
    session.tui.requestRender.mockClear();
    session.tui.requestRender.mockImplementation(() => {
      frames.push({ at: Date.now(), lines: session.render() });
    });

    // A mid-interval subscription retains the 1 ms nudge after the boundary.
    vi.advanceTimersByTime(58);
    running = false;
    notify();
    expect(frames).toEqual([]);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(frames).toHaveLength(1);
    expect(frames[0].at).toBe(1101);
    expect(frames[0].lines).toContain('  ✓ Task');
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(9998);
    expect(frames).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(frames).toHaveLength(2);
    expect(frames[1].at).toBe(11100);
    expect(frames[1].lines.join(' ')).toContain('Agents · 1 done · 0 failed');
    expect(frames[1].lines.join(' ')).not.toContain('Task');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(frames).toHaveLength(2);
  });

  it('keeps input refreshes immediate even when a provider update is pending', async () => {
    const session = uiSession();
    let notify = () => {};
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        onVisibleChanged(listener) {
          notify = listener;
          return () => {};
        },
      }),
      await ensureWorkPanel(session.ctx),
    );
    session.tui.requestRender.mockClear();
    notify();
    expect(session.tui.requestRender).not.toHaveBeenCalled();
    expect(session.key('\x1b[D')).toEqual({ consume: true });
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(session.render()).toContain('› ◐ Agents item');
  });

  it('retains exact expiry deadlines between animation ticks, including when a provider refresh is pending', async () => {
    const session = uiSession();
    let notify = () => {};
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        listRows: () => [
          { id: 'live', primary: 'Live', status: 'running' },
          {
            id: 'expired',
            primary: 'Transient',
            status: 'completed',
            expiresAt: 1080,
          },
        ],
        onVisibleChanged(listener) {
          notify = listener;
          return () => {};
        },
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(vi.getTimerCount()).toBe(2);
    expect(session.render()).toContain('  ✓ Transient');
    session.tui.requestRender.mockClear();
    notify();
    vi.advanceTimersByTime(37);
    expect(session.tui.requestRender).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(session.render().join('\n')).not.toContain('Transient');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(21);
    expect(session.tui.requestRender).toHaveBeenCalledTimes(2);
  });

  it('ticks multiple hosts in the shared clock callback and leaves no timer after teardown', async () => {
    const first = uiSession();
    const second = uiSession();
    const ticks = vi.fn();
    const offClock = subscribeAnimationClock(ticks);
    cleanups.push(offClock);
    cleanups.push(registerWorkPanelProvider(first.ctx, provider()));
    const releaseFirst = await ensureWorkPanel(first.ctx);
    cleanups.push(releaseFirst);
    vi.advanceTimersByTime(20);
    const releaseSecond = await ensureWorkPanel(second.ctx);
    cleanups.push(releaseSecond);
    first.tui.requestRender.mockClear();
    second.tui.requestRender.mockClear();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(38);
    expect(first.tui.requestRender).not.toHaveBeenCalled();
    expect(second.tui.requestRender).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(ticks).toHaveBeenCalledExactlyOnceWith(1101);
    expect(first.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(second.tui.requestRender).toHaveBeenCalledTimes(1);
    releaseFirst();
    releaseSecond();
    expect(vi.getTimerCount()).toBe(1);
    offClock();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(first.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(second.tui.requestRender).toHaveBeenCalledTimes(1);
  });
});
