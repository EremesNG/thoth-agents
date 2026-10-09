import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureWorkPanel,
  isWorkPanelRootEditorInputActive,
  registerRenderKit,
  registerWorkPanelProvider,
  withdrawRenderKit,
} from '../src/index.js';
import { createTestRenderKit } from '../src/testing.js';
import {
  panelOverflowEntries,
  panelSections,
  renderPanel,
} from '../src/work-panel-render.js';

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
  it.each([
    false,
    true,
  ])('keeps a summary-only section informational without interaction cues (render kit: %s)', async (themed) => {
    const session = uiSession();
    if (themed) {
      const token = registerRenderKit(createTestRenderKit(), {});
      cleanups.push(() => withdrawRenderKit(token));
    }
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('archive', 'Archive', 15),
        summary: () => ({ completed: 7, total: 7 }),
        listRows: () => [{ id: 'done', primary: '+7 done', summary: true }],
      }),
    );
    cleanups.push(await ensureWorkPanel(session.ctx));

    for (const key of [...Object.values(keys), 'x'])
      expect(session.key(key)).toBeUndefined();
    const expected = themed
      ? ['Archive · 7/7 done', '  └─ +7 done']
      : ['◆ Archive · 7/7 done', '  +7 done'];
    expect(session.render()).toEqual(expected);
    session.tui.terminal.rows = 4;
    expect(session.render()).toEqual(expected);
    expect(session.ui.setStatus).toHaveBeenLastCalledWith(
      'thoth-work-panel',
      undefined,
    );
  });

  it('renders native compact sections in priority order with explicit counters and no unfocused full hint', async () => {
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
      '← interact',
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
  it.each([
    false,
    true,
  ])('selects provider headings and summaries and opens the provider UI without row actions (kit: %s)', async (themed) => {
    const session = uiSession();
    const openHistory = vi.fn();
    if (themed) {
      const token = registerRenderKit(createTestRenderKit(), {});
      cleanups.push(() => withdrawRenderKit(token));
    }
    const source = {
      ...provider('todos', 'Todos', 20),
      selectableHeading: true,
      selectableSummary: true,
      openHistory,
      open: vi.fn(),
      listRows: () => [
        { id: 'open', primary: 'Open task', status: 'pending' },
        { id: 'done', primary: '+4 done', summary: true },
      ],
    };
    cleanups.push(
      registerWorkPanelProvider(session.ctx, source),
      await ensureWorkPanel(session.ctx),
    );
    session.key(keys.left);
    expect(session.render()[0]).toBe(
      themed ? '› Todos · 2 items' : '› ◆ Todos · 2 items',
    );
    expect(session.render().at(-1)).toBe('↑↓ move · Enter open · Esc back');
    expect(session.key('x')).toBeUndefined();
    session.key(keys.enter);
    expect(openHistory).toHaveBeenCalledExactlyOnceWith(session.ctx);
    expect(source.open).not.toHaveBeenCalled();
    await Promise.resolve();
    session.key(keys.left);
    session.key(keys.down);
    expect(
      session
        .render()
        .some(
          (line: string) => line.startsWith('› ') && line.includes('Open task'),
        ),
    ).toBe(true);
    session.key(keys.down);
    expect(
      session
        .render()
        .some(
          (line: string) => line.startsWith('› ') && line.includes('+4 done'),
        ),
    ).toBe(true);
    expect(session.render().at(-1)).toBe('↑↓ move · Enter open · Esc back');
    session.key(keys.enter);
    expect(openHistory).toHaveBeenCalledTimes(2);
    expect(source.close).not.toHaveBeenCalled();
    expect(session.ui.custom).not.toHaveBeenCalled();
  });
  it('selects exact overflow summaries, keeps their provider visible, and opens the provider UI', async () => {
    const session = uiSession();
    const openHistory = vi.fn();
    cleanups.push(
      registerWorkPanelProvider(session.ctx, provider()),
      registerWorkPanelProvider(session.ctx, {
        ...provider('todos', 'Todos', 20),
        selectableHeading: true,
        selectableSummary: true,
        droppedSummary: (count) => `+${count} done`,
        openHistory,
        listRows: () => [
          ...Array.from({ length: 6 }, (_, i) => ({
            id: `done-${i}`,
            primary: `Done ${i}`,
            status: 'completed',
            dropFirst: true,
          })),
          ...Array.from({ length: 4 }, (_, i) => ({
            id: `open-${i}`,
            primary: `Open ${i}`,
            status: 'pending',
          })),
        ],
      }),
      registerWorkPanelProvider(
        session.ctx,
        provider('background', 'Background', 30),
      ),
      await ensureWorkPanel(session.ctx),
    );
    session.key(keys.left);
    for (let i = 0; i < 12; i++) session.key(keys.down);
    expect(session.render()).toContain('› +5 done');
    expect(session.render().at(-1)).toBe('↑↓ move · Enter open · Esc back');
    expect(session.key('x')).toBeUndefined();
    expect(session.key(keys.enter)).toEqual({ consume: true });
    expect(openHistory).toHaveBeenCalledExactlyOnceWith(session.ctx);
    expect(session.ui.custom).not.toHaveBeenCalled();
  });

  it.each([
    false,
    true,
  ])('keeps exact labelled and ordinary overflow counts independently selectable (kit: %s)', async (themed) => {
    const session = uiSession();
    const openHistory = vi.fn();
    if (themed) {
      const token = registerRenderKit(createTestRenderKit(), {});
      cleanups.push(() => withdrawRenderKit(token));
    }
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('todos', 'Todos', 20),
        selectableHeading: true,
        selectableSummary: true,
        droppedSummary: (count) => `+${count} done`,
        openHistory,
        listRows: () => [
          ...Array.from({ length: 5 }, (_, i) => ({
            id: `done-${i}`,
            primary: `Done ${i}`,
            status: 'completed',
            dropFirst: true,
          })),
          ...Array.from({ length: 10 }, (_, i) => ({
            id: `open-${i}`,
            primary: `Open ${i}`,
            status: 'pending',
          })),
        ],
      }),
      await ensureWorkPanel(session.ctx),
    );
    session.key(keys.left);
    for (let i = 0; i < 16; i++) session.key(keys.down);
    const lines = session.render();
    expect(lines).toHaveLength(12);
    expect(lines).toContain('› +5 done');
    expect(lines).toContain('  +2 more');
    expect(lines.filter((line: string) => line.includes('Open '))).toHaveLength(
      8,
    );
    expect(lines.some((line: string) => line.includes('Done '))).toBe(false);
    session.key(keys.down);
    expect(session.render()).toContain('› +2 more');
    session.key(keys.enter);
    expect(openHistory).toHaveBeenCalledExactlyOnceWith(session.ctx);
  });

  it('omits unavailable actions from opted-in headings and summary hints', async () => {
    const session = uiSession();
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('todos', 'Todos', 20),
        selectableHeading: true,
        selectableSummary: true,
        listRows: () => [{ id: 'done', primary: '+4 done', summary: true }],
      }),
      await ensureWorkPanel(session.ctx),
    );
    session.key(keys.left);
    expect(session.render().at(-1)).toBe('↑↓ move · Esc back');
    expect(session.key(keys.enter)).toBeUndefined();
    expect(session.key('x')).toBeUndefined();
    session.key(keys.down);
    expect(session.render()).toContain('› +4 done');
    expect(session.render().at(-1)).toBe('↑↓ move · Esc back');
    expect(session.key(keys.enter)).toBeUndefined();
    expect(session.key('x')).toBeUndefined();
    expect(session.ui.custom).not.toHaveBeenCalled();
  });

  it('offers interaction for a failed background item even when no active work is reported', async () => {
    const session = uiSession();
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('background-tasks', 'Background', 30),
        visibleCount: () => 0,
        listRows: () => [
          { id: 'failed', primary: 'Failed task', status: 'failed' },
        ],
        armCloseLabel: () => 'dismiss',
      }),
    );
    cleanups.push(await ensureWorkPanel(session.ctx));

    expect(session.render()).toEqual([
      '◆ Background · 1 items',
      '  ✗ Failed task',
      '← interact',
    ]);
    expect(session.ui.setStatus).toHaveBeenLastCalledWith(
      'thoth-work-panel',
      '← work · 1',
    );
    expect(session.key(keys.left)).toEqual({ consume: true });
    expect(session.render()).toEqual([
      '◆ Background · 1 items',
      '› ✗ Failed task',
      '↑↓ move · Enter open · x dismiss · Esc back',
    ]);
  });

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
  it('drops provider-marked rows first across mixed sections and labels the exact omitted count', async () => {
    const session = uiSession();
    cleanups.push(
      registerWorkPanelProvider(session.ctx, provider()),
      registerWorkPanelProvider(session.ctx, {
        ...provider('todos', 'Todos', 20),
        listRows: () => [
          ...Array.from({ length: 6 }, (_, i) => ({
            id: `done-${i}`,
            primary: `Done ${i}`,
            status: 'completed',
            dropFirst: true,
          })),
          ...Array.from({ length: 4 }, (_, i) => ({
            id: `open-${i}`,
            primary: `Open ${i}`,
            status: 'pending',
          })),
        ],
        droppedSummary: (count) => `+${count} done`,
      }),
      registerWorkPanelProvider(
        session.ctx,
        provider('background', 'Background', 30),
      ),
      await ensureWorkPanel(session.ctx),
    );
    const lines = session.render();
    expect(lines).toHaveLength(12);
    expect(lines).toContain('  +5 done');
    expect(lines.filter((line: string) => line.includes('Done '))).toHaveLength(
      1,
    );
    for (let i = 0; i < 4; i++) expect(lines).toContain(`  ○ Open ${i}`);
    expect(lines).toContain('  ◐ Agents item');
    expect(lines).toContain('  ◐ Background item');
  });
  it('combines labelled and ordinary overflow at small heights without undercounting hidden items', async () => {
    const session = uiSession();
    session.tui.terminal.rows = 8;
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('todos', 'Todos', 20),
        selectableHeading: true,
        selectableSummary: true,
        droppedSummary: (count) => `+${count} done`,
        openHistory: vi.fn(),
        listRows: () => [
          ...Array.from({ length: 5 }, (_, i) => ({
            id: `done-${i}`,
            primary: `Done ${i}`,
            status: 'completed',
            dropFirst: true,
          })),
          ...Array.from({ length: 10 }, (_, i) => ({
            id: `open-${i}`,
            primary: `Open ${i}`,
            status: 'pending',
          })),
        ],
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(session.render()).toEqual([
      '◆ Todos · 15 items',
      '  ○ Open 0',
      '  +5 done · +9 more',
      '← interact',
    ]);
    session.key(keys.left);
    for (let i = 0; i < 16; i++) session.key(keys.down);
    expect(session.render()).toContain('› +5 done · +9 more');
  });

  it('uses spare height for ordinary items in any section before drop-first items', async () => {
    const session = uiSession();
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        listRows: () =>
          Array.from({ length: 6 }, (_, i) => ({
            id: `live-${i}`,
            primary: `Live ${i}`,
            status: 'running',
          })),
      }),
      registerWorkPanelProvider(session.ctx, {
        ...provider('todos', 'Todos', 20),
        droppedSummary: (count) => `+${count} done`,
        listRows: () => [
          { id: 'open-1', primary: 'Open 1', status: 'pending' },
          { id: 'open-2', primary: 'Open 2', status: 'pending' },
          {
            id: 'done-1',
            primary: 'Done 1',
            status: 'completed',
            dropFirst: true,
          },
          {
            id: 'done-2',
            primary: 'Done 2',
            status: 'completed',
            dropFirst: true,
          },
        ],
      }),
      await ensureWorkPanel(session.ctx),
    );
    const lines = session.render();
    expect(lines).toHaveLength(12);
    expect(lines.filter((line: string) => line.includes('Live '))).toHaveLength(
      6,
    );
    expect(lines).toContain('  +2 done');
    expect(lines.some((line: string) => line.includes('Done '))).toBe(false);
  });

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
    ).toHaveLength(2);
    expect(
      lines.filter((line: string) => line.includes('+6 more')),
    ).toHaveLength(1);
    expect(lines.at(-1)).toBe('← interact');
    expect(lines.some((line: string) => !line.trim())).toBe(false);
    expect(lines.every((line: string) => visibleWidth(line) <= width)).toBe(
      true,
    );
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

  it('lays out data groups within body width for inline metrics or narrow-width continuation rows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const session = uiSession();
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        rowCap: 2,
        listRows: () =>
          Array.from({ length: 4 }, (_, index) => ({
            id: `agent-${index}`,
            primary: 'Task label',
            statusGlyph: 'running' as const,
            identity: [
              { text: 'Agent', role: 'primary' as const },
              { text: ' · task', role: 'secondary' as const },
            ],
            metrics: [
              { segments: [{ text: '4 tools', role: 'meta' as const }] },
              {
                segments: [{ text: '2k tok', role: 'meta' as const }],
                continuation: [{ text: '2k', role: 'meta' as const }],
              },
              { segments: [{ text: '20%', role: 'meta' as const }] },
            ],
          })),
      }),
    );
    cleanups.push(await ensureWorkPanel(session.ctx));
    expect(session.render(80)).toEqual([
      '◆ Agents · 4 items',
      ...Array(4).fill('  ⠋ Agent · task · 4 tools · 2k tok · 20%'),
      '← interact',
    ]);
    expect(session.render(24)).toEqual([
      '◆ Agents · 4 items',
      ...Array(4).fill(['  ⠋ Agent · task', '    4 tools · 2k · 20%']).flat(),
      '← interact',
    ]);
  });
});

describe('work panel render kit', () => {
  it('discovers kit changes on every render and uses its headings, rows, indicators and colors', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
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
      '← interact',
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
      'Agents · 1 running',
      '  └─ ⠋ Agents item',
      '← interact',
    ]);
    session.key(keys.left);
    expect(
      session.render().filter((line: string) => line.startsWith('› ')),
    ).toEqual(['› └─ ⠋ Agents item']);
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
  it('animates running background items every 100ms despite a 1000ms provider interval and stops when idle', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const token = registerRenderKit(createTestRenderKit(), {});
    cleanups.push(() => withdrawRenderKit(token));
    const session = uiSession();
    let running = true;
    let notify = () => {};
    const unsubscribe = vi.fn();
    const unregister = registerWorkPanelProvider(session.ctx, {
      ...provider('background', 'Background', 30),
      refreshIntervalMs: 1000,
      listRows: () => [
        {
          id: 'animated',
          primary: 'Background task',
          status: running ? 'running' : 'completed',
        },
      ],
      onVisibleChanged: (listener) => {
        notify = listener;
        return unsubscribe;
      },
    });
    cleanups.push(unregister, await ensureWorkPanel(session.ctx));
    expect(session.render()[1]).toBe('  └─ ⠋ Background task');
    session.tui.requestRender.mockClear();
    vi.advanceTimersByTime(99);
    expect(session.tui.requestRender).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(session.render()[1]).toBe('  └─ ⠙ Background task');
    vi.advanceTimersByTime(100);
    expect(session.tui.requestRender).toHaveBeenCalledTimes(2);
    expect(session.render()[1]).toBe('  └─ ⠹ Background task');
    running = false;
    notify();
    expect(vi.getTimerCount()).toBe(0);
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

  it('redraws in-progress items without a provider interval and leaves initially idle items untimed', async () => {
    vi.useFakeTimers();
    const session = uiSession();
    let status = 'completed';
    let notify = () => {};
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        listRows: () => [{ id: 'item', primary: 'Task', status }],
        onVisibleChanged: (listener) => {
          notify = listener;
          return () => {};
        },
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(vi.getTimerCount()).toBe(0);
    session.tui.requestRender.mockClear();
    vi.advanceTimersByTime(1000);
    expect(session.tui.requestRender).not.toHaveBeenCalled();

    status = 'in_progress';
    notify();
    session.tui.requestRender.mockClear();
    vi.advanceTimersByTime(100);
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
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
    expect(session.ui.setStatus).toHaveBeenLastCalledWith(
      'thoth-work-panel',
      '← work · 2',
    );
    session.tui.requestRender.mockClear();
    vi.advanceTimersByTime(1000);
    expect(session.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(session.render().join('\n')).not.toContain('Transient');
    expect(session.ui.setStatus).toHaveBeenLastCalledWith(
      'thoth-work-panel',
      '← work · 1',
    );
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
    expect(session.render()).toEqual([
      '◆ Agents · 1 items',
      '  ◐ Agents item',
      '← interact',
    ]);
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
    expect(session.ui.setStatus).toHaveBeenLastCalledWith(
      'thoth-work-panel',
      '← work · 1',
    );
    session.key(keys.left);
    empty = true;
    notify();
    expect(session.render()).toEqual([]);
    expect(session.ui.setStatus).toHaveBeenLastCalledWith(
      'thoth-work-panel',
      undefined,
    );
    for (const key of [...Object.values(keys), 'x'])
      expect(session.key(key)).toBeUndefined();
  });
});

describe('work panel detail actions', () => {
  it('lets the overlay navigate, toggle supported log tails, confirm close and cleanly dismiss', async () => {
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
      supportsLogTail: true,
      listRows: () =>
        items.map((id) => ({ id, primary: id, status: 'running' })),
      detail,
      close,
    });
    cleanups.push(unregister, await ensureWorkPanel(session.ctx));
    session.key(keys.left);
    session.key(keys.enter);
    session.customKey(keys.down);
    expect(session.customRender()[0]).toContain('second');
    session.customKey(keys.up);
    expect(session.customRender()[0]).toContain('first');
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
    expect(session.customRender()[0]).toContain('second');
    session.customKey(keys.right);
    await Promise.resolve();
    expect(session.key(keys.up)).toBeUndefined();
    // The remaining running row still owns the panel animation timer.
    expect(vi.getTimerCount()).toBe(1);
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

describe('work panel semantic hierarchy', () => {
  it('styles segments, overridden state glyphs and failure counters without coloring the whole row', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const session = uiSession();
    const styled: Array<[string, string]> = [];
    session.ui.theme.fg = (role, text) => {
      styled.push([role, text]);
      return text;
    };
    const token = registerRenderKit(
      {
        ...createTestRenderKit(),
        fg: (theme, role, text) => theme.fg(role, text),
        widgetHeading: (theme, options) =>
          `▲ ${theme.fg('toolTitle', options.title)} ${theme.fg('dim', options.suffix ?? '')}`,
      },
      {},
    );
    cleanups.push(() => withdrawRenderKit(token));
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(),
        summary: () => ({ running: 1, failed: 2 }),
        listRows: () => [
          {
            id: 'one',
            primary: 'fallback',
            status: 'running',
            statusGlyph: 'running',
            segments: [
              { text: 'worker', role: 'primary' },
              { text: ' · inspect', role: 'secondary' },
              { text: ' · tools 5', role: 'meta' },
              { text: ' · ⚠ 2 dropped', role: 'warning' },
            ],
          },
        ],
      }),
    );
    cleanups.push(await ensureWorkPanel(session.ctx));
    const lines = session.render();
    expect(lines[0]).toContain('▲ Agents');
    expect(lines[0]).not.toContain('◆');
    expect(lines[1]).toContain('⠋ worker · inspect · tools 5 · ⚠ 2 dropped');
    expect(styled).toEqual(
      expect.arrayContaining([
        ['accent', '⠋'],
        ['toolTitle', 'worker'],
        ['text', ' · inspect'],
        ['dim', ' · tools 5'],
        ['warning', ' · ⚠ 2 dropped'],
        ['error', '2 failed'],
      ]),
    );
  });
});

it('reserves the last row for a bottom-left dim entry hint and only advertises available focused actions', async () => {
  const session = uiSession();
  const roles: Array<[string, string]> = [];
  session.ui.theme.fg = (role, text) => {
    roles.push([role, text]);
    return text;
  };
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider()),
    registerWorkPanelProvider(session.ctx, {
      ...provider('todos', 'Todos', 20),
      armCloseLabel: () => '',
    }),
  );
  cleanups.push(await ensureWorkPanel(session.ctx));
  expect(session.render(80)[0]).toBe('◆ Agents · 1 items');
  for (const width of [80, 24, 10])
    expect(session.render(width).at(-1)).toBe('← interact');
  expect(roles).toContainEqual(['dim', '← interact']);
  expect(
    session.render().filter((line: string) => line.includes('← interact')),
  ).toHaveLength(1);
  session.key(keys.left);
  expect(session.render().join('\n')).not.toContain('← interact');
  expect(session.render().at(-1)).toBe(
    '↑↓ move · Enter open · x cancel · Esc back',
  );
  session.key(keys.down);
  expect(session.render().at(-1)).toBe('↑↓ move · Enter open · Esc back');
  session.key('x');
  expect(session.ui.setStatus).not.toHaveBeenCalledWith(
    'thoth-work-panel-close',
    expect.any(String),
  );
  session.tui.terminal.rows = 6;
  expect(session.render()).toHaveLength(3);
  expect(session.render().at(-1)).toBe('↑↓ move · Enter open · Esc back');
});

it('keeps all open items when space permits and a dim done summary outside caps, overflow and selection', async () => {
  const session = uiSession();
  const roles: Array<[string, string]> = [];
  session.ui.theme.fg = (role, text) => {
    roles.push([role, text]);
    return text;
  };
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider('todos', 'Todos', 20),
      rowCap: 2,
      listRows: () => [
        ...Array.from({ length: 3 }, (_, index) => ({
          id: `${index}`,
          primary: `Open ${index}`,
          status: 'pending',
        })),
        {
          id: 'done',
          primary: '+4 done',
          summary: true,
          segments: [{ text: '+4 done', role: 'dim' }],
        },
      ],
    }),
  );
  cleanups.push(await ensureWorkPanel(session.ctx));
  const lines = session.render();
  expect(lines.join('\n')).toContain('Open 2');
  expect(lines.join('\n')).not.toContain('more');
  expect(lines.at(-2)).toBe('  +4 done');
  expect(lines.at(-1)).toBe('← interact');
  expect(roles).toContainEqual(['dim', '+4 done']);
  expect(session.ui.setStatus).toHaveBeenLastCalledWith(
    'thoth-work-panel',
    '← work · 3',
  );
  session.key(keys.left);
  for (let i = 0; i < 5; i++) session.key(keys.down);
  expect(
    session.render().filter((line: string) => line.startsWith('› ')),
  ).toEqual(['› ○ Open 2']);
  session.tui.terminal.rows = 10;
  const compact = session.render();
  expect(compact.join('\n')).toContain('+2 more');
  expect(compact.join('\n')).not.toContain('+3 more');
  expect(compact.join('\n')).toContain('+4 done');
});

it('truncates secondary labels before names and preserves metrics and dropped-tools warnings', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      listRows: () => [
        {
          id: 'one',
          primary: 'fallback',
          status: 'running',
          segments: [
            { text: 'worker', role: 'primary' },
            {
              text: ' · a long task label that must shrink first',
              role: 'secondary',
            },
            { text: ' · tools 5', role: 'meta' },
            { text: ' · ⚠ 2 dropped', role: 'warning' },
          ],
        },
      ],
    }),
  );
  cleanups.push(await ensureWorkPanel(session.ctx));
  const row = session.render(40)[1];
  expect(row).toContain('worker');
  expect(row).toContain('tools 5');
  expect(row).toContain('⚠ 2 dropped');
  expect(row).not.toContain('long task');
  expect(visibleWidth(row)).toBeLessThanOrEqual(40);
});

it('shares spare height across three sections without hiding open Todos or their done summary', async () => {
  const session = uiSession();
  for (const [id, label, priority, count] of [
    ['agents', 'Agents', 10, 2],
    ['todos', 'Todos', 20, 3],
    ['background', 'Background', 30, 2],
  ] as const) {
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(id, label, priority),
        rowCap: 2,
        listRows: () => [
          ...Array.from({ length: count }, (_, i) => ({
            id: `${i}`,
            primary: `${label} ${i}`,
            status: 'running',
          })),
          ...(id === 'todos'
            ? [{ id: 'done', primary: '+4 done', summary: true }]
            : []),
        ],
      }),
    );
  }
  cleanups.push(await ensureWorkPanel(session.ctx));
  const lines = session.render();
  expect(lines).toHaveLength(12);
  expect(lines.join('\n')).toContain('Todos 2');
  expect(lines.join('\n')).toContain('+4 done');
  expect(lines.join('\n')).not.toContain('more');
});

it.each([
  ['running', 'accent', '◐'],
  ['failed', 'error', '✗'],
  ['completed', 'success', '✓'],
  ['cancelled', 'muted', '■'],
  ['pending', 'text', '○'],
])('uses the state color for native %s glyphs', async (status, role, glyph) => {
  const session = uiSession();
  const styles: Array<[string, string]> = [];
  session.ui.theme.fg = (color, text) => {
    styles.push([color, text]);
    return text;
  };
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      listRows: () => [{ id: 'one', primary: 'Item', status }],
    }),
  );
  cleanups.push(await ensureWorkPanel(session.ctx));
  session.render();
  expect(styles).toContainEqual([role, glyph]);
});

it.each([
  0, 1, 2, 3, 4,
])('preserves exact selectable drop-first counts within a budget of %i', (budget) => {
  const source = {
    ...provider('todos', 'Todos', 20),
    selectableHeading: true,
    selectableSummary: true,
    droppedSummary: (count: number) => `+${count} done`,
    listRows: () => [
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `done-${index}`,
        primary: `Done ${index}`,
        status: 'completed',
        dropFirst: true,
      })),
      { id: 'pending', primary: 'Pending', status: 'pending' },
    ],
  };
  const sections = panelSections([source], 0);
  const selectedKey = JSON.stringify(['todos', 'pending']);
  const lines = renderPanel(
    sections,
    120,
    0,
    { fg: (_role, text) => text },
    (text) => text,
    { budget, hint: 'hint', selectedKey },
  );
  expect(lines.length).toBeLessThanOrEqual(budget);
  const overflow = panelOverflowEntries(
    sections,
    120,
    0,
    budget,
    selectedKey,
  ).get('todos');
  if (budget < 3) {
    expect(lines).toEqual(budget ? ['hint'] : []);
    expect(overflow).toBeUndefined();
  } else {
    expect(lines).toContain(
      budget === 3 ? '  +10 done · +1 more' : '  +10 done',
    );
    expect(overflow?.[0]).toMatchObject({
      sectionSummary: true,
      row: { primary: budget === 3 ? '+10 done · +1 more' : '+10 done' },
    });
    const summaryKey = overflow?.[0].key;
    expect(
      renderPanel(
        sections,
        120,
        0,
        { fg: (_role, text) => text },
        (text) => text,
        { budget, hint: 'hint', selectedKey: summaryKey },
      ),
    ).toContain(budget === 3 ? '› +10 done · +1 more' : '› +10 done');
  }
});

it('keeps the selected item instead of an overflow counter when a tiny terminal only has room for one body row', async () => {
  const session = uiSession();
  session.tui.terminal.rows = 6;
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      listRows: () => [
        { id: 'first', primary: 'First', status: 'running' },
        { id: 'second', primary: 'Second', status: 'running' },
        { id: 'third', primary: 'Third', status: 'running' },
      ],
    }),
  );
  cleanups.push(await ensureWorkPanel(session.ctx));
  session.key(keys.left);
  const lines = session.render();
  expect(lines[1]).toBe('› ◐ First');
  expect(lines).toHaveLength(3);
});

it('resolves work-panel statuses, separators and navigation on mounted kit changes', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      listRows: () => [
        {
          id: 'one',
          name: 'worker',
          primary: 'inspect',
          elapsed: '1s',
          status: 'completed',
        },
      ],
      summary: () => ({ running: 1, failed: 1 }),
    }),
    await ensureWorkPanel(session.ctx),
  );
  const native = session.render();
  const kit = createTestRenderKit({
    icon: (name) =>
      new Map([
        ['separator', '|'],
        ['arrowLeft', '<'],
        ['arrowUp', '^'],
        ['arrowDown', 'v'],
      ]).get(name) ?? '',
  });
  kit.statusGlyph = () => '+';
  const token = registerRenderKit(kit, {});
  cleanups.push(() => withdrawRenderKit(token));
  expect(session.render().join('\n')).toContain('+ worker | inspect | 1s');
  expect(session.render()[0]).toBe('Agents | 1 running | 1 failed');
  expect(session.render().at(-1)).toBe('< interact');
  expect(session.ui.setStatus).toHaveBeenLastCalledWith(
    'thoth-work-panel',
    '< work | 1',
  );
  session.key(keys.left);
  expect(session.render().at(-1)).toBe(
    '^v move | Enter open | x cancel | Esc back',
  );
  for (const width of [1, 8, 20, 80])
    expect(
      session
        .render(width)
        .every((line: string) => visibleWidth(line) <= width),
    ).toBe(true);
  session.key(keys.escape);
  withdrawRenderKit(token);
  expect(session.render()).toEqual(native);
});

it('preserves the native toolkit three-dot truncation without a kit', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      listRows: () => [
        { id: 'one', primary: 'abcdefghijklmnop', status: 'running' },
      ],
    }),
    await ensureWorkPanel(session.ctx),
  );
  // Baseline toolkit truncation includes its ANSI reset around three dots.
  expect(session.render(12)[1]).toBe('  ◐ abcde\u001b[0m...\u001b[0m');
});

it('keeps themed running rows animated rather than resolving a static status glyph', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const session = uiSession();
  const kit = createTestRenderKit();
  const indicator = kit.indicator;
  kit.statusGlyph = () => '*';
  kit.indicator = (theme, context, options) => ({
    ...indicator(theme, context, options),
    glyph: options?.frame === 1 ? '/' : '|',
  });
  const token = registerRenderKit(kit, {});
  cleanups.push(
    () => withdrawRenderKit(token),
    registerWorkPanelProvider(session.ctx, provider()),
    await ensureWorkPanel(session.ctx),
  );
  expect(session.render()[1]).toBe('  └─ | Agents item');
  vi.setSystemTime(100);
  expect(session.render()[1]).toBe('  └─ / Agents item');
  withdrawRenderKit(token);
  expect(session.render()[1]).toBe('  ◐ Agents item');
});
