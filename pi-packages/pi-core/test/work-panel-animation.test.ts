import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureWorkPanel,
  registerRenderKit,
  registerUIPreferences,
  registerWorkPanelProvider,
  setAnimationLevel,
  subscribeAnimationClock,
  withdrawRenderKit,
  withdrawUIPreferences,
} from '../src/index.js';
import { createTestRenderKit } from '../src/testing.js';
import { provider, uiSession } from './work-panel-fixture.js';

const cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1042);
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  setAnimationLevel('full');
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

describe('work panel shared animation', () => {
  it.each([
    ['full', 100],
    ['reduced', 200],
    ['minimal', 500],
  ] as const)('renders every braille frame in order at %s, not from wall-clock time', async (level, period) => {
    vi.setSystemTime(0);
    setAnimationLevel(level);
    const session = uiSession();
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        listRows: () => [
          {
            id: 'task',
            primary: 'Task',
            status: 'running',
            statusGlyph: 'running',
          },
        ],
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(session.render()).toContain('  ⠋ Task');
    const frames: string[] = [];
    for (let step = 0; step < 10; step++) {
      vi.advanceTimersByTime(period);
      frames.push(
        session.render().find((line: string) => line.includes('Task')) ?? '',
      );
    }
    expect(frames).toEqual([
      '  ⠙ Task',
      '  ⠹ Task',
      '  ⠸ Task',
      '  ⠼ Task',
      '  ⠴ Task',
      '  ⠦ Task',
      '  ⠧ Task',
      '  ⠇ Task',
      '  ⠏ Task',
      '  ⠋ Task',
    ]);
    // Wall-clock changes and extra renders do not advance the animation.
    const last = session.render();
    vi.setSystemTime(999999);
    expect(session.render()).toEqual(last);
  });

  it.each([
    'native',
    'themed',
    'ascii',
  ] as const)('at off renders static %s rows immediately, change-gates provider updates and refreshes data every second', async (mode) => {
    if (mode !== 'native') {
      const kit = createTestRenderKit();
      const token = registerRenderKit(
        { ...kit, statusGlyph: () => (mode === 'ascii' ? '*' : '◐') },
        {},
      );
      cleanups.push(() => withdrawRenderKit(token));
    }
    setAnimationLevel('off');
    const session = uiSession();
    let primary = 'first';
    let notify = () => {};
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        listRows: () => [
          { id: 'task', primary, status: 'running', statusGlyph: 'running' },
        ],
        onVisibleChanged(listener) {
          notify = listener;
          return () => {};
        },
      }),
      await ensureWorkPanel(session.ctx),
    );
    const glyph = mode === 'ascii' ? '*' : '◐';
    expect(session.render().join(' ')).toContain(`${glyph} first`);
    session.tui.requestRender.mockClear();
    expect(vi.getTimerCount()).toBe(1);
    primary = 'latest';
    notify();
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    notify();
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(session.render().join(' ')).toContain(`${glyph} latest`);
    vi.advanceTimersByTime(2000);
    expect(session.tui.requestRender).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(1);
    setAnimationLevel('minimal');
    expect(session.tui.requestRender).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(459);
    expect(session.render().join(' ')).toMatch(/⠙ latest/);
    setAnimationLevel('off');
    expect(session.render().join(' ')).toContain(`${glyph} latest`);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('flushes a deferred provider update immediately when animation is turned off', async () => {
    const session = uiSession();
    let primary = 'first';
    let notify = () => {};
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        listRows: () => [{ id: 'task', primary, status: 'running' }],
        onVisibleChanged(listener) {
          notify = listener;
          return () => {};
        },
      }),
      await ensureWorkPanel(session.ctx),
    );
    session.tui.requestRender.mockClear();
    primary = 'latest';
    notify();
    expect(session.tui.requestRender).not.toHaveBeenCalled();
    setAnimationLevel('off');
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(session.render()).toContain('  ◐ latest');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('at off refreshes render-time elapsed data every second, keeps the glyph static and stops when running rows end', async () => {
    vi.setSystemTime(0);
    setAnimationLevel('off');
    const session = uiSession();
    let running = true;
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        listRows: (now) => [
          {
            id: 'task',
            primary: `Task · ${Math.floor(now / 1000)}s`,
            status: running ? 'running' : 'completed',
            statusGlyph: running ? 'running' : 'completed',
          },
        ],
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(session.render()).toContain('  ◐ Task · 0s');
    const rendered: string[][] = [];
    session.tui.requestRender.mockClear();
    session.tui.requestRender.mockImplementation(() =>
      rendered.push(session.render()),
    );
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(999);
    expect(rendered).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toContain('  ◐ Task · 1s');
    vi.advanceTimersByTime(1000);
    expect(rendered[1]).toContain('  ◐ Task · 2s');
    running = false;
    vi.advanceTimersByTime(1000);
    expect(rendered[2]).toContain('  ✓ Task · 3s');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(rendered).toHaveLength(3);
  });

  it('at off stops the data refresh immediately when a provider reports completion', async () => {
    setAnimationLevel('off');
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
    expect(vi.getTimerCount()).toBe(1);
    session.tui.requestRender.mockClear();
    status = 'completed';
    notify();
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(session.render()).toContain('  ✓ Task');
    expect(vi.getTimerCount()).toBe(0);
    notify();
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
  });

  it.each([
    'absorbed',
    'hidden',
  ])('does not invalidate the UI for notifications from a source that is %s', async (visibility) => {
    const session = uiSession();
    let primary = 'first';
    let notify = () => {};
    if (visibility === 'absorbed') {
      const token = registerUIPreferences({
        absorbedWorkPanelSources: ['agents'],
      });
      cleanups.push(() => withdrawUIPreferences(token));
    }
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        listRows: () => [{ id: 'task', primary, status: 'running' }],
        showSection: () => visibility !== 'hidden',
        onVisibleChanged(listener) {
          notify = listener;
          return () => {};
        },
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(session.render()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    session.tui.requestRender.mockClear();
    session.ui.setStatus.mockClear();

    primary = 'latest';
    notify();
    notify();
    notify();

    expect(session.render()).toEqual([]);
    expect(session.tui.requestRender).not.toHaveBeenCalled();
    expect(session.ui.setStatus).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('renders idle changes immediately and coalesces unchanged notifications even before Pi renders', async () => {
    const session = uiSession();
    let primary = 'first';
    let notify = () => {};
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        listRows: () => [{ id: 'task', primary, status: 'completed' }],
        onVisibleChanged(listener) {
          notify = listener;
          return () => {};
        },
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(session.render()).toContain('  ✓ first');
    session.tui.requestRender.mockClear();
    session.ui.setStatus.mockClear();
    notify();
    notify();
    expect(session.tui.requestRender).not.toHaveBeenCalled();
    expect(session.ui.setStatus).not.toHaveBeenCalled();

    primary = 'latest';
    notify();
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    notify();
    notify();
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(session.render()).toContain('  ✓ latest');
    notify();
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('renders a changed status cue even when the widget lines are unchanged', async () => {
    const session = uiSession();
    let count = 1;
    let notify = () => {};
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        listRows: () =>
          Array.from({ length: count }, (_, index) => ({
            id: `${index}`,
            primary: 'Task',
            status: 'completed',
          })),
        onVisibleChanged(listener) {
          notify = listener;
          return () => {};
        },
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(session.render(0)).toEqual([]);
    session.tui.requestRender.mockClear();
    count = 2;
    notify();
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(session.ui.setStatus).toHaveBeenLastCalledWith(
      'thoth-work-panel',
      '← work · 2',
    );
    expect(session.render(0)).toEqual([]);
    notify();
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
  });

  it('ignores absorbed updates beside a visible idle source and restores the source when its owner becomes inactive', async () => {
    const session = uiSession();
    let active = true;
    let notify = () => {};
    const token = registerUIPreferences({
      absorbedWorkPanelSources: ['agents'],
      isActive: () => active,
    });
    cleanups.push(() => withdrawUIPreferences(token));
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('todos', 'Todos'),
        listRows: () => [{ id: 'todo', primary: 'Todo', status: 'completed' }],
      }),
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        onVisibleChanged(listener) {
          notify = listener;
          return () => {};
        },
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(session.render()).toContain('  ✓ Todo');
    session.tui.requestRender.mockClear();
    session.ui.setStatus.mockClear();
    notify();
    expect(session.tui.requestRender).not.toHaveBeenCalled();
    expect(session.ui.setStatus).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    active = false;
    notify();
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(session.render()).toContain('  ◐ Agents item');
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each([
    'expiry',
    'linger',
  ])('reschedules an unchanged row at its updated %s deadline without rendering early', async (deadline) => {
    const session = uiSession();
    let endsAt = 1080;
    let notify = () => {};
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        retention: deadline === 'linger' ? 'prompt' : undefined,
        listRows: () => [
          {
            id: 'task',
            primary: 'Task',
            status: 'completed',
            ...(deadline === 'linger'
              ? { endedAt: endsAt - 10_000 }
              : { expiresAt: endsAt }),
          },
        ],
        onVisibleChanged(listener) {
          notify = listener;
          return () => {};
        },
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(session.render()).toContain('  ✓ Task');
    session.tui.requestRender.mockClear();
    endsAt = 1120;
    notify();
    expect(session.tui.requestRender).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(38);
    expect(session.tui.requestRender).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(session.render().join('\n')).not.toContain('Task');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refreshes an open detail when provider evidence changes but host lines do not', async () => {
    const session = uiSession();
    let evidence = 'first output';
    let notify = () => {};
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        listRows: () => [{ id: 'task', primary: 'Task', status: 'completed' }],
        detail: () => ({
          id: 'task',
          title: 'Task',
          metadata: [],
          evidence: { label: 'Output', text: evidence },
        }),
        onVisibleChanged(listener) {
          notify = listener;
          return () => {};
        },
      }),
      await ensureWorkPanel(session.ctx),
    );
    session.key('\x1b[D');
    session.key('\r');
    const hostLines = session.render();
    expect(session.customRender().join('\n')).toContain('first output');
    session.tui.requestRender.mockClear();

    evidence = 'latest output';
    notify();
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(session.render()).toEqual(hostLines);
    expect(session.customRender().join('\n')).toContain('latest output');
    session.closeCustom();
    await Promise.resolve();
    await Promise.resolve();
  });

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
    expect(ticks).toHaveBeenCalledExactlyOnceWith(1101, expect.any(Number));
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
