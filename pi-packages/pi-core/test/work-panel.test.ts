import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureWorkPanel,
  isWorkPanelRootEditorInputActive,
  registerRenderKit,
  registerWorkPanelProvider,
  withdrawRenderKit,
} from '../src/index.js';
import { createTestRenderKit } from '../src/testing.js';

import { provider, uiSession } from './work-panel-fixture.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

describe('work panel lifecycle', () => {
  it('shares a single concurrent installation across independently loaded copies and refcounts holders', async () => {
    const copy = await import(
      `${new URL('../src/work-panel.ts', import.meta.url).href}?copy`
    );
    const session = uiSession();
    cleanups.push(registerWorkPanelProvider(session.ctx, provider()));
    cleanups.push(
      copy.registerWorkPanelProvider(
        session.ctx,
        provider('todos', 'Todos', 20),
      ),
    );
    const [release, releaseCopy] = await Promise.all([
      ensureWorkPanel(session.ctx),
      copy.ensureWorkPanel({ ...session.ctx, ui: { ...session.ctx.ui } }),
    ]);
    cleanups.push(release, releaseCopy);
    expect(session.ui.setWidget).toHaveBeenCalledTimes(1);
    expect(session.ui.setWidget.mock.calls[0][0]).toBe('thoth-work-panel');
    expect(session.ui.setWidget.mock.calls[0][2]).toEqual({
      placement: 'aboveEditor',
    });
    expect(session.ui.onTerminalInput).toHaveBeenCalledTimes(1);
    expect(session.listenerCount()).toBe(1);
    expect(copy.isWorkPanelRootEditorInputActive(session.ctx)).toBe(true);
    session.setOverlay(true);
    expect(copy.isWorkPanelRootEditorInputActive(session.ctx)).toBe(false);
    session.setOverlay(false);
    expect(session.ui.setStatus).toHaveBeenCalledWith(
      'thoth-work-panel',
      '← work · 2',
    );
    release();
    release();
    expect(session.listenerCount()).toBe(1);
    releaseCopy();
    expect(session.listenerCount()).toBe(0);
    expect(session.ui.setWidget).toHaveBeenLastCalledWith(
      'thoth-work-panel',
      undefined,
    );
    expect(session.ui.getEditorComponent()).toBe(session.baseFactory);
  });

  it('installs after ensure-before-register and removes everything on last unregister or shutdown', async () => {
    const session = uiSession();
    const release = await ensureWorkPanel(session.ctx);
    cleanups.push(release);
    expect(session.listenerCount()).toBe(0);
    const shutdown = new Set<(event: unknown, ctx: ExtensionContext) => void>();
    const pi = {
      on: (_event: string, handler: any) => {
        shutdown.add(handler);
        return () => shutdown.delete(handler);
      },
    };
    const unregister = registerWorkPanelProvider(pi as any, provider());
    cleanups.push(unregister);
    expect(session.listenerCount()).toBe(1);
    unregister();
    expect(session.listenerCount()).toBe(0);
    expect(session.ui.setStatus).toHaveBeenLastCalledWith(
      'thoth-work-panel',
      undefined,
    );
    expect(shutdown.size).toBe(0);
    cleanups.push(registerWorkPanelProvider(pi as any, provider()));
    cleanups.push(await ensureWorkPanel(session.ctx));
    for (const handler of shutdown) handler({}, session.ctx);
    expect(session.listenerCount()).toBe(0);
    expect(session.ui.getEditorComponent()).toBe(session.baseFactory);
  });
});

describe('work panel rendering', () => {
  it('renders native compact sections in priority order with explicit counters and no unfocused hint', async () => {
    const session = uiSession();
    const agents = { ...provider(), summary: () => ({ running: 2 }) };
    const todos = {
      ...provider('todos', 'todos', 20),
      summary: () => ({ completed: 1, total: 4 }),
    };
    const background = {
      ...provider('background', 'background', 30),
      summary: () => ({ running: 3, failed: 2 }),
    };
    for (const item of [background, todos, agents])
      cleanups.push(registerWorkPanelProvider(session.ctx, item));
    cleanups.push(await ensureWorkPanel(session.ctx));
    expect(session.render()).toEqual([
      '◆ Agents · 2 running',
      '  ◐ Agents item',
      '◆ Todos · 1/4 done',
      '  ◐ todos item',
      '◆ Background · 3 running · 2 failed',
      '  ◐ background item',
    ]);
  });
});

const keys = {
  left: '\x1b[D',
  right: '\x1b[C',
  up: '\x1b[A',
  down: '\x1b[B',
  enter: '\r',
  escape: '\x1b',
};
describe('work panel input', () => {
  it('leaves history keys alone until left focuses, traverses sections with one cursor, confirms close and releases', async () => {
    const session = uiSession();
    const agents = provider();
    const todos = provider('todos', 'Todos', 20);
    cleanups.push(
      registerWorkPanelProvider(session.ctx, agents),
      registerWorkPanelProvider(session.ctx, todos),
    );
    cleanups.push(await ensureWorkPanel(session.ctx));
    expect(session.key(keys.up)).toBeUndefined();
    expect(session.key(keys.down)).toBeUndefined();
    expect(session.key('x')).toBeUndefined();
    expect(session.key(keys.enter)).toBeUndefined();
    expect(session.key(keys.left)).toEqual({ consume: true });
    expect(
      session.render().filter((line: string) => line.startsWith('› ')),
    ).toEqual(['› ◐ Agents item']);
    expect(session.render().at(-1)).toBe(
      '↑↓ move · Enter open · x cancel · Esc back',
    );
    expect(session.key(keys.down)).toEqual({ consume: true });
    expect(
      session.render().filter((line: string) => line.startsWith('› ')),
    ).toEqual(['› ◐ Todos item']);
    expect(session.key(keys.up)).toEqual({ consume: true });
    expect(session.key('x')).toEqual({ consume: true });
    expect(agents.close).not.toHaveBeenCalled();
    expect(session.ui.setStatus).toHaveBeenCalledWith(
      'thoth-work-panel-close',
      'Press x again to cancel Agents item',
    );
    session.key('X');
    expect(agents.close).toHaveBeenCalledExactlyOnceWith('agents-1');
    expect(todos.close).not.toHaveBeenCalled();
    expect(session.key('a')).toBeUndefined();
    expect(session.key(keys.escape)).toEqual({ consume: true });
    expect(session.render().some((line: string) => line.includes('↑↓'))).toBe(
      false,
    );
    expect(session.key(keys.left)).toEqual({ consume: true });
    expect(session.key(keys.right)).toEqual({ consume: true });
    expect(session.key(keys.up)).toBeUndefined();
  });
});

describe('work panel input isolation', () => {
  it.each([
    'typed text',
    'whitespace',
    'non-editor focus',
    'overlay',
    'native dialog',
    'foreign custom UI',
    'replaced editor',
    'recreated editor',
  ])('never consumes keys for %s', async (guard) => {
    const session = uiSession();
    cleanups.push(registerWorkPanelProvider(session.ctx, provider()));
    cleanups.push(await ensureWorkPanel(session.ctx));
    session.key(keys.left);
    if (guard === 'typed text') session.setText('hello');
    if (guard === 'whitespace') session.setText(' ');
    if (
      ['non-editor focus', 'native dialog', 'foreign custom UI'].includes(guard)
    )
      session.focusOther();
    if (guard === 'overlay') session.setOverlay(true);
    if (guard === 'replaced editor')
      session.ui.setEditorComponent(session.baseFactory);
    if (guard === 'recreated editor')
      session.ui.setEditorComponent(session.ui.getEditorComponent());
    for (const key of [...Object.values(keys), 'x', 'X', 'a'])
      expect(session.key(key)).toBeUndefined();
    expect(session.render().some((line: string) => line.startsWith('› '))).toBe(
      false,
    );
  });

  it('suspends synchronously around provider.open and releases focus on resolve or reject', async () => {
    const session = uiSession();
    let resolve: () => void = () => {};
    const open = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    cleanups.push(
      registerWorkPanelProvider(session.ctx, { ...provider(), open }),
    );
    cleanups.push(await ensureWorkPanel(session.ctx));
    session.key(keys.left);
    expect(session.key(keys.enter)).toEqual({ consume: true });
    expect(open).toHaveBeenCalledExactlyOnceWith('agents-1', session.ctx);
    // No overlay/focus change: suspension must cover preloading and asynchronous UI factories too.
    for (const key of [...Object.values(keys), 'x'])
      expect(session.key(key)).toBeUndefined();
    resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(session.key(keys.up)).toBeUndefined();
    expect(session.key(keys.left)).toEqual({ consume: true });
    open.mockImplementationOnce(() => Promise.reject(new Error('open failed')));
    session.key(keys.enter);
    await Promise.resolve();
    await Promise.resolve();
    expect(session.key(keys.down)).toBeUndefined();
    expect(session.key(keys.left)).toEqual({ consume: true });
  });

  it('opens host detail without intercepting its keys and releases focus when it closes', async () => {
    const session = uiSession();
    const detail = vi.fn(() => ({
      id: 'agents-1',
      title: 'Agent detail',
      status: 'running',
      metadata: [{ label: 'model', value: 'test-model' }],
      evidence: { label: 'description', text: 'The requested task' },
    }));
    cleanups.push(
      registerWorkPanelProvider(session.ctx, { ...provider(), detail }),
    );
    cleanups.push(await ensureWorkPanel(session.ctx));
    session.key(keys.left);
    expect(session.key(keys.enter)).toEqual({ consume: true });
    expect(session.ui.custom).toHaveBeenCalledTimes(1);
    expect(session.ui.custom.mock.calls[0][1]).toMatchObject({ overlay: true });
    expect(session.customRender().join('\n')).toContain('Agent detail');
    expect(session.customRender().join('\n')).toContain('test-model');
    for (const key of [...Object.values(keys), 'x'])
      expect(session.key(key)).toBeUndefined();
    session.customKey(keys.enter);
    expect(session.customRender().join('\n')).toContain('The requested task');
    session.customKey(keys.escape);
    await Promise.resolve();
    await Promise.resolve();
    expect(session.key(keys.up)).toBeUndefined();
    expect(session.render().some((line: string) => line.startsWith('› '))).toBe(
      false,
    );
  });
});

describe('work panel root editor input guard query', () => {
  it('is undefined without an installed session host and accepts a focused editor even with typed text', async () => {
    const session = uiSession();
    expect(isWorkPanelRootEditorInputActive(session.ctx)).toBeUndefined();
    const release = await ensureWorkPanel(session.ctx);
    cleanups.push(release);
    expect(isWorkPanelRootEditorInputActive(session.ctx)).toBeUndefined();
    const unregister = registerWorkPanelProvider(session.ctx, provider());
    cleanups.push(unregister);
    expect(isWorkPanelRootEditorInputActive(session.ctx)).toBe(true);
    session.setText('a nonempty prompt');
    expect(isWorkPanelRootEditorInputActive(session.ctx)).toBe(true);
    expect(isWorkPanelRootEditorInputActive(uiSession().ctx)).toBeUndefined();
    const sessionId = vi
      .spyOn(session.ctx.sessionManager, 'getSessionId')
      .mockReturnValue('different-session');
    expect(isWorkPanelRootEditorInputActive(session.ctx)).toBeUndefined();
    sessionId.mockRestore();
    unregister();
    expect(isWorkPanelRootEditorInputActive(session.ctx)).toBeUndefined();
  });

  it.each([
    'non-editor focus',
    'overlay',
    'native dialog',
    'foreign custom UI',
    'replaced editor',
    'recreated editor',
  ])('reports inactive input for %s without mutating host focus', async (guard) => {
    const session = uiSession();
    cleanups.push(registerWorkPanelProvider(session.ctx, provider()));
    cleanups.push(await ensureWorkPanel(session.ctx));
    session.key(keys.left);
    const focusedRows = session.render();
    if (
      ['non-editor focus', 'native dialog', 'foreign custom UI'].includes(guard)
    )
      session.focusOther();
    if (guard === 'overlay') session.setOverlay(true);
    if (guard === 'replaced editor')
      session.ui.setEditorComponent(session.baseFactory);
    if (guard === 'recreated editor')
      session.ui.setEditorComponent(session.ui.getEditorComponent());
    expect(isWorkPanelRootEditorInputActive(session.ctx)).toBe(false);
    expect(session.render()).toEqual(focusedRows);
  });

  it('reports suspension before custom UI acquires focus and recovers when open completes', async () => {
    const session = uiSession();
    let done!: () => void;
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        open: () =>
          new Promise<void>((resolve) => {
            done = resolve;
          }),
      }),
    );
    cleanups.push(await ensureWorkPanel(session.ctx));
    session.key(keys.left);
    session.key(keys.enter);
    expect(isWorkPanelRootEditorInputActive(session.ctx)).toBe(false);
    done();
    await Promise.resolve();
    expect(isWorkPanelRootEditorInputActive(session.ctx)).toBe(true);
  });
});

describe('work panel compact budget', () => {
  it.each([
    100, 60, 24,
  ])('caps each section and the whole panel at width %i, keeping a selected hidden item visible', async (width) => {
    const session = uiSession();
    for (const [id, label, priority] of [
      ['agents', 'Agents', 10],
      ['todos', 'Todos', 20],
      ['background', 'Background', 30],
    ] as const) {
      const source = provider(id, label, priority);
      cleanups.push(
        registerWorkPanelProvider(session.ctx, {
          ...source,
          visibleCount: () => 7,
          listRows: () =>
            Array.from({ length: 7 }, (_, index) => ({
              id: `${id}-${index}`,
              primary: `${label} item ${index}`,
              status: 'completed',
            })),
        }),
      );
    }
    cleanups.push(await ensureWorkPanel(session.ctx));
    const lines = session.render(width);
    expect(lines).toHaveLength(12);
    expect(
      lines.filter((line: string) => line.includes('+5 more')),
    ).toHaveLength(3);
    expect(lines.some((line: string) => !line.trim())).toBe(false);
    expect(lines.every((line: string) => [...line].length <= width)).toBe(true);
    session.key(keys.left);
    for (let i = 0; i < 13; i += 1) session.key(keys.down);
    const focused = session.render(width);
    expect(focused.length).toBeLessThanOrEqual(12);
    expect(focused.filter((line: string) => line.startsWith('› '))).toEqual([
      '› ✓ Todos item 6',
    ]);
    expect(focused.at(-1)).toContain('↑↓ move');
    session.tui.terminal.rows = 12;
    expect(session.render(width).length).toBeLessThanOrEqual(6);
  });

  it('gives providers body width for inline metrics or narrow-width continuation rows', async () => {
    const session = uiSession();
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        rowCap: 2,
        listRows: () =>
          Array.from({ length: 4 }, (_, index) => ({
            id: `agent-${index}`,
            primary: 'Task label',
            statusGlyph: '⠋',
            render: (width: number) =>
              width >= 40
                ? { text: 'Agent · task · 4 tools · 2k tok · 20%' }
                : { text: 'Agent · task', extraRows: ['4 tools · 2k · 20%'] },
          })),
      }),
    );
    cleanups.push(await ensureWorkPanel(session.ctx));
    expect(session.render(80)).toEqual([
      '◆ Agents · 4 items',
      '  ⠋ Agent · task · 4 tools · 2k tok · 20%',
      '  ⠋ Agent · task · 4 tools · 2k tok · 20%',
      '  +2 more',
    ]);
    expect(session.render(24)).toEqual([
      '◆ Agents · 4 items',
      '  ⠋ Agent · task',
      '    4 tools · 2k · 20%',
      '  ⠋ Agent · task',
      '    4 tools · 2k · 20%',
      '  +2 more',
    ]);
  });
});

describe('work panel render kit', () => {
  it('discovers kit changes on every render and uses its headings, rows, indicators and colors', async () => {
    const session = uiSession();
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        summary: () => '1 running',
      }),
    );
    cleanups.push(await ensureWorkPanel(session.ctx));
    expect(session.render()).toEqual([
      '◆ Agents · 1 running',
      '  ◐ Agents item',
    ]);
    const kit = createTestRenderKit();
    const themed = {
      ...kit,
      widgetHeading: vi.fn(kit.widgetHeading),
      treeRow: vi.fn(kit.treeRow),
      indicator: vi.fn(kit.indicator),
      fg: vi.fn(kit.fg),
    };
    const token = registerRenderKit(themed, {});
    cleanups.push(() => withdrawRenderKit(token));
    expect(session.render()).toEqual([
      '◆ Agents · 1 running',
      '  └─ ◐ Agents item',
    ]);
    session.key(keys.left);
    expect(
      session.render().filter((line: string) => line.startsWith('› ')),
    ).toEqual(['› └─ ◐ Agents item']);
    expect(themed.widgetHeading).toHaveBeenCalled();
    expect(themed.treeRow).toHaveBeenCalled();
    expect(themed.indicator).toHaveBeenCalled();
    expect(themed.fg).toHaveBeenCalled();
    withdrawRenderKit(token);
    expect(session.render()[1]).toBe('› ◐ Agents item');
    expect(session.ui.setWidget).toHaveBeenCalledTimes(1);
  });
});

describe('work panel updates and animation lifecycle', () => {
  it('requests periodic renders only for providers with running items and cleans up notifications and timers', async () => {
    vi.useFakeTimers();
    const session = uiSession();
    let running = true;
    let notify = () => {};
    const unsubscribe = vi.fn();
    const unregister = registerWorkPanelProvider(session.ctx, {
      ...provider(),
      refreshIntervalMs: 100,
      listRows: () => [
        {
          id: 'animated',
          primary: 'Animated agent',
          status: running ? 'running' : 'completed',
          statusGlyph: (now) => (now % 200 < 100 ? '⠋' : '⠙'),
        },
      ],
      onVisibleChanged: (listener) => {
        notify = listener;
        return unsubscribe;
      },
    });
    cleanups.push(unregister, await ensureWorkPanel(session.ctx));
    const first = session.render()[1];
    session.tui.requestRender.mockClear();
    vi.advanceTimersByTime(100);
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(session.render()[1]).not.toBe(first);
    running = false;
    notify();
    session.tui.requestRender.mockClear();
    vi.advanceTimersByTime(1000);
    expect(session.tui.requestRender).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    running = true;
    notify();
    expect(vi.getTimerCount()).toBe(1);
    unregister();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('expires transient items once and resets close confirmation after timeout or selection changes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const session = uiSession();
    const source = provider();
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...source,
        listRows: () => [
          { id: 'first', primary: 'First', status: 'completed' },
          {
            id: 'transient',
            primary: 'Transient',
            status: 'completed',
            expiresAt: 2000,
          },
        ],
      }),
    );
    cleanups.push(await ensureWorkPanel(session.ctx));
    expect(session.render().join('\n')).toContain('Transient');
    session.tui.requestRender.mockClear();
    vi.advanceTimersByTime(1000);
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(session.render().join('\n')).not.toContain('Transient');
    expect(vi.getTimerCount()).toBe(0);
    session.key(keys.left);
    session.key('x');
    vi.advanceTimersByTime(3000);
    session.key('x');
    expect(source.close).not.toHaveBeenCalled();
    session.key(keys.down);
    session.key('x');
    expect(source.close).not.toHaveBeenCalled();
    session.key('x');
    expect(source.close).toHaveBeenCalledExactlyOnceWith('first');
  });
});

describe('work panel ownership edges', () => {
  it('does not let a stale registration or disposer tear down replacement ownership', async () => {
    const session = uiSession();
    const stale = registerWorkPanelProvider(session.ctx, provider());
    cleanups.push(stale);
    const current = registerWorkPanelProvider(session.ctx, {
      ...provider(),
      summary: () => 'replacement',
    });
    cleanups.push(current);
    const oldRelease = await ensureWorkPanel(session.ctx);
    cleanups.push(oldRelease);
    stale();
    expect(session.render()[0]).toBe('◆ Agents · replacement');
    current();
    expect(session.listenerCount()).toBe(0);
    cleanups.push(registerWorkPanelProvider(session.ctx, provider()));
    cleanups.push(await ensureWorkPanel(session.ctx));
    oldRelease();
    expect(session.listenerCount()).toBe(1);
    expect(session.ui.getEditorComponent()).not.toBe(session.baseFactory);
  });

  it('cancels an in-flight install when the last provider unregisters', async () => {
    const session = uiSession();
    const unregister = registerWorkPanelProvider(session.ctx, provider());
    const pending = ensureWorkPanel(session.ctx);
    unregister();
    cleanups.push(await pending);
    expect(session.ui.setWidget).not.toHaveBeenCalled();
    expect(session.ui.onTerminalInput).not.toHaveBeenCalled();
    expect(session.ui.getEditorComponent()).toBe(session.baseFactory);
  });

  it('isolates failing providers and subscriptions from healthy sections and teardown', async () => {
    const session = uiSession();
    const broken = registerWorkPanelProvider(session.ctx, {
      ...provider('broken', 'Broken', 0),
      listRows: () => {
        throw new Error('list failed');
      },
      visibleCount: () => {
        throw new Error('count failed');
      },
      onVisibleChanged: () => {
        throw new Error('subscribe failed');
      },
    });
    cleanups.push(broken, registerWorkPanelProvider(session.ctx, provider()));
    cleanups.push(await ensureWorkPanel(session.ctx));
    expect(session.render()).toEqual(['◆ Agents · 1 items', '  ◐ Agents item']);
    broken();
    expect(session.listenerCount()).toBe(1);
  });
});

describe('work panel continuation budget', () => {
  it('keeps narrow metrics attached to the selected item rather than clipping them to make room for other sections', async () => {
    const session = uiSession();
    for (const [id, label, priority] of [
      ['agents', 'Agents', 10],
      ['todos', 'Todos', 20],
      ['background', 'Background', 30],
    ] as const) {
      cleanups.push(
        registerWorkPanelProvider(session.ctx, {
          ...provider(id, label, priority),
          listRows: () =>
            Array.from({ length: 4 }, (_, i) => ({
              id: `${id}-${i}`,
              primary: `${label} ${i}`,
              extraRows: ['4 tools · 2k · 20%'],
            })),
        }),
      );
    }
    cleanups.push(await ensureWorkPanel(session.ctx));
    session.key(keys.left);
    const lines = session.render(24);
    const selected = lines.findIndex((line: string) => line.startsWith('› '));
    expect(selected).toBeGreaterThan(0);
    expect(lines[selected + 1]).toBe('    4 tools · 2k · 20%');
    expect(lines.length).toBeLessThanOrEqual(12);
  });
});

describe('work panel fail-closed focus observation', () => {
  it.each([
    'getFocusedComponent',
    'hasOverlay',
    'getEditorText',
  ])('does not guess editor focus or emptiness when %s is unavailable', async (method) => {
    const session = uiSession();
    cleanups.push(registerWorkPanelProvider(session.ctx, provider()));
    cleanups.push(await ensureWorkPanel(session.ctx));
    delete (method === 'getEditorText' ? session.ui : (session.tui as any))[
      method
    ];
    for (const key of [...Object.values(keys), 'x'])
      expect(session.key(key)).toBeUndefined();
  });

  it('hides empty/suppressed sections and leaves all keys alone when no items remain', async () => {
    const session = uiSession();
    let empty = false;
    let notify = () => {};
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        listRows: () => (empty ? [] : [{ id: 'one', primary: 'Agent' }]),
        onVisibleChanged: (callback) => {
          notify = callback;
          return () => {};
        },
      }),
    );
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('hidden', 'Hidden', 0),
        showSection: () => false,
      }),
    );
    cleanups.push(await ensureWorkPanel(session.ctx));
    expect(
      session.render().some((line: string) => line.includes('Hidden')),
    ).toBe(false);
    session.key(keys.left);
    empty = true;
    notify();
    expect(session.render()).toEqual([]);
    for (const key of [...Object.values(keys), 'x'])
      expect(session.key(key)).toBeUndefined();
  });
});

describe('work panel detail actions', () => {
  it('lets the overlay navigate, toggle folded evidence/log tails, confirm close and cleanly dismiss', async () => {
    vi.useFakeTimers();
    const session = uiSession();
    let items = ['first', 'second'];
    const source = provider();
    const detail = vi.fn(
      (id: string, _now: number, _opts?: { logTailLines?: number }) => ({
        id,
        title: id,
        status: 'running',
        metadata: [],
        foldedSections: [
          {
            id: 'task',
            label: 'task',
            text: 'complete task description',
            collapsedText: 'preview',
          },
        ],
        evidence: {
          label: 'logs',
          text: Array.from({ length: 30 }, (_, i) => `log ${i}`).join('\n'),
        },
      }),
    );
    const close = vi.fn((id: string) => {
      items = items.filter((item) => item !== id);
    });
    const unregister = registerWorkPanelProvider(session.ctx, {
      ...source,
      listRows: () =>
        items.map((id) => ({ id, primary: id, status: 'running' })),
      detail,
      close,
    });
    cleanups.push(unregister, await ensureWorkPanel(session.ctx));
    session.key(keys.left);
    session.key(keys.enter);
    session.customKey(keys.down);
    expect(session.customRender()[0]).toBe('second');
    session.customKey(keys.up);
    expect(session.customRender()[0]).toBe('first');
    session.customKey(keys.enter);
    expect(session.customRender().join('\n')).toContain(
      'complete task description',
    );
    session.customKey('l');
    expect(detail).toHaveBeenLastCalledWith('first', expect.any(Number), {
      logTailLines: 10,
    });
    session.customKey('x');
    expect(close).not.toHaveBeenCalled();
    session.customKey('x');
    expect(close).toHaveBeenCalledExactlyOnceWith('first');
    expect(session.customRender()[0]).toBe('second');
    session.customKey(keys.right);
    await Promise.resolve();
    expect(session.key(keys.up)).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    session.key(keys.left);
    session.key(keys.enter);
    unregister();
    await Promise.resolve();
    expect(session.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows the footer cue only outside panel focus or its own detail UI', async () => {
    const session = uiSession();
    cleanups.push(registerWorkPanelProvider(session.ctx, provider()));
    cleanups.push(await ensureWorkPanel(session.ctx));
    session.key(keys.left);
    expect(session.ui.setStatus).toHaveBeenLastCalledWith(
      'thoth-work-panel',
      undefined,
    );
    session.key(keys.enter);
    expect(session.ui.setStatus).toHaveBeenLastCalledWith(
      'thoth-work-panel',
      undefined,
    );
    session.customKey(keys.escape);
    await Promise.resolve();
    expect(session.ui.setStatus).toHaveBeenLastCalledWith(
      'thoth-work-panel',
      '← work · 1',
    );
  });
});

it('stops a running detail refresh when its last item disappears between overlay frames', async () => {
  vi.useFakeTimers();
  const session = uiSession();
  let visible = true;
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      listRows: () =>
        visible ? [{ id: 'one', primary: 'One', status: 'running' }] : [],
      detail: () => ({
        id: 'one',
        title: 'One',
        status: 'running',
        metadata: [],
        evidence: { label: 'logs', text: 'output' },
      }),
    }),
  );
  cleanups.push(await ensureWorkPanel(session.ctx));
  session.key(keys.left);
  session.key(keys.enter);
  visible = false;
  vi.advanceTimersByTime(10_000);
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
  expect(session.key(keys.up)).toBeUndefined();
});
