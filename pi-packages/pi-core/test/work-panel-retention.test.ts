import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bindWorkPanelLifecycle,
  ensureWorkPanel,
  getWorkPanelLifecycle,
  registerRenderKit,
  registerWorkPanelProvider,
  type WorkPanelProvider,
  type WorkPanelRow,
  withdrawRenderKit,
} from '../src/index.js';
import { createTestRenderKit } from '../src/testing.js';
import { panelSections, renderPanel } from '../src/work-panel-render.js';
import { provider, uiSession } from './work-panel-fixture.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

const lifecycle = { epoch: 1, epochStartedAt: 1000, busy: true };
function retained(rows: WorkPanelRow[]): WorkPanelProvider {
  return { ...provider(), retention: 'prompt', listRows: () => rows };
}
const row = (
  id: string,
  state: WorkPanelRow['state'],
  endedAt?: number,
): WorkPanelRow => ({
  id,
  primary: id,
  state,
  endedAt,
  status: state === 'done' ? 'completed' : state,
});
const ids = (source: WorkPanelProvider, busy = true) =>
  panelSections([source], 2000, { ...lifecycle, busy }).flatMap((section) =>
    section.rows.map(({ row }) => row.id),
  );

describe('prompt-retained work panel eligibility', () => {
  it('keeps all running and current failed rows, only the three newest current completions, and no old terminal rows', () => {
    const source = retained([
      row('old done', 'done', 999),
      row('running', 'running'),
      row('done 1', 'done', 1100),
      row('failed 1', 'failed', 1000),
      row('done 4', 'done', 1400),
      row('old failed', 'failed', 900),
      row('done 2', 'done', 1200),
      row('done 3', 'done', 1300),
      row('failed 2', 'failed', 1500),
      row('other running', 'running'),
    ]);
    expect(ids(source)).toEqual([
      'running',
      'failed 1',
      'done 4',
      'done 2',
      'done 3',
      'failed 2',
      'other running',
    ]);
  });

  it('keeps queued/stopping and running rows even when idle or carrying legacy expiry metadata', () => {
    const source = retained([
      { ...row('queued', 'running'), status: 'queued', expiresAt: 100 },
      { ...row('stopping', 'running'), status: 'stopping' },
      row('failed', 'failed', 1001),
      row('done', 'done', 1002),
    ]);
    expect(ids(source, false)).toEqual([
      'queued',
      'stopping',
      'failed',
      'done',
    ]);
  });

  it('caps completions stably for equal endedAt and excludes terminal rows without a finite completion time', () => {
    const source = retained([
      row('first', 'done', 1000),
      row('second', 'done', 1000),
      row('third', 'done', 1000),
      row('fourth', 'done', 1000),
      row('missing', 'failed'),
      row('invalid', 'done', Number.NaN),
    ]);
    expect(ids(source)).toEqual(['first', 'second', 'third']);
  });

  it('counts overflow only from eligible rows, never old failures or completions outside the hard cap', () => {
    const source = retained([
      ...Array.from({ length: 55 }, (_, i) => row(`old ${i}`, 'done', 900)),
      row('old failure', 'failed', 999),
      ...Array.from({ length: 5 }, (_, i) =>
        row(`done ${i}`, 'done', 1100 + i),
      ),
      row('running', 'running'),
      row('failed', 'failed', 1200),
    ]);
    const sections = panelSections([source], 2000, lifecycle);
    expect(
      renderPanel(
        sections,
        100,
        2000,
        { fg: (_role, text) => text },
        (text) => text,
        { budget: 5, hint: '← interact' },
      ),
    ).toEqual([
      '◆ Agents · 5 items',
      '  ✓ done 2',
      '  ✓ done 3',
      '  +3 more',
      '← interact',
    ]);
    expect(
      renderPanel(
        sections,
        100,
        2000,
        { fg: (_role, text) => text },
        (text) => text,
        { budget: 12 },
      ).join('\n'),
    ).not.toContain('more');
  });
});

function bindSession(session: ReturnType<typeof uiSession>) {
  let idle = true;
  session.ctx.isIdle = () => idle;
  const listeners = new Map<
    string,
    Set<(event: any, ctx: ExtensionContext) => void>
  >();
  const pi = {
    on(name: string, handler: (event: any, ctx: ExtensionContext) => void) {
      const handlers = listeners.get(name) ?? new Set();
      listeners.set(name, handlers);
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  } as unknown as ExtensionAPI;
  cleanups.push(bindWorkPanelLifecycle(pi, session.ctx));
  return {
    emit(name: string, event: Record<string, unknown> = {}) {
      for (const handler of [...(listeners.get(name) ?? [])])
        handler({ type: name, ...event }, session.ctx);
    },
    setIdle(value: boolean) {
      idle = value;
    },
  };
}

describe('idle retained section summaries', () => {
  it.each([
    false,
    true,
  ])('renders exactly one selectable heading with session counts, not terminal rows (kit: %s)', async (themed) => {
    const session = uiSession();
    session.ctx.isIdle = () => true;
    if (themed) {
      const token = registerRenderKit(createTestRenderKit(), {});
      cleanups.push(() => withdrawRenderKit(token));
    }
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...retained([row('history', 'done', 10), row('failed', 'failed', 20)]),
        summary: () => ({ completed: 55, failed: 3 }),
        openHistory: vi.fn(),
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(session.render()).toEqual([
      themed ? 'Agents · 55 done · 3 failed' : '◆ Agents · 55 done · 3 failed',
      '← interact',
    ]);
    expect(session.ui.setStatus).toHaveBeenLastCalledWith(
      'thoth-work-panel',
      '← work · 1',
    );
    session.key('\x1b[D');
    expect(session.render()[0]).toBe(
      themed
        ? '› Agents · 55 done · 3 failed'
        : '› ◆ Agents · 55 done · 3 failed',
    );
    expect(session.render().at(-1)).toBe('Enter history · Esc back');
    session.tui.terminal.rows = 4;
    expect(session.render()).toHaveLength(2);
  });

  it('retains empty opted-in sections and session counts even when every panel row was dismissed', () => {
    const source = {
      ...retained([]),
      summary: () => ({ completed: 4, failed: 1 }),
    };
    const sections = panelSections([source], 2000, {
      ...lifecycle,
      busy: false,
    });
    expect(
      renderPanel(
        sections,
        100,
        2000,
        { fg: (_role, text) => text },
        (text) => text,
      ),
    ).toEqual(['◆ Agents · 4 done · 1 failed']);
    expect(
      panelSections([{ ...source, showSection: () => false }], 2000, lifecycle),
    ).toEqual([]);
  });

  it('expands on lifecycle events and running items, advances retention on matching prompts, and collapses only on settlement without running work', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const session = uiSession();
    const bridge = bindSession(session);
    let items = [
      row('old done', 'done', 900),
      row('old failed', 'failed', 800),
    ];
    let notify = () => {};
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...retained([]),
        listRows: () => items,
        onVisibleChanged(callback) {
          notify = callback;
          return () => {};
        },
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(session.render()).toEqual([
      '◆ Agents · 1 done · 1 failed',
      '← interact',
    ]);
    bridge.emit('input', { source: 'interactive', text: 'first prompt' });
    vi.setSystemTime(2000);
    bridge.emit('before_agent_start', { prompt: 'first prompt' });
    bridge.setIdle(false);
    bridge.emit('agent_start');
    items = [
      ...items,
      row('live', 'running'),
      row('new done', 'done', 2001),
      row('new failed', 'failed', 2002),
    ];
    notify();
    expect(session.render()).toEqual([
      '◆ Agents · 3 items',
      '  ◐ live',
      '  ✓ new done',
      '  ✗ new failed',
      '← interact',
    ]);
    bridge.setIdle(true);
    bridge.emit('agent_end');
    expect(getWorkPanelLifecycle(session.ctx).busy).toBe(true);
    bridge.emit('agent_settled');
    expect(session.render().join('\n')).toContain('live'); // Idle is insufficient while section work runs.
    items = items.map((item) =>
      item.id === 'live' ? row('live', 'done', 2003) : item,
    );
    notify();
    expect(session.render()).toEqual([
      '◆ Agents · 3 done · 2 failed',
      '← interact',
    ]);
    expect(session.tui.requestRender).toHaveBeenCalled();
    vi.setSystemTime(3000);
    bridge.emit('input', { source: 'rpc', text: 'next prompt' });
    bridge.emit('before_agent_start', { prompt: 'next prompt' });
    bridge.setIdle(false);
    bridge.emit('agent_start');
    items.push(row('next live', 'running'));
    notify();
    expect(session.render()).toEqual([
      '◆ Agents · 1 items',
      '  ◐ next live',
      '← interact',
    ]);
  });

  it('keeps task-list rows, counters, informational summaries and custom actions unchanged without opt-in', async () => {
    const session = uiSession();
    const bridge = bindSession(session);
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('todos', 'Todos', 20),
        summary: () => ({ completed: 4, total: 5 }),
        listRows: () => [
          { id: 'one', primary: 'Open todo', status: 'pending' },
          { id: 'done', primary: '+4 done', summary: true },
        ],
        armCloseLabel: () => '',
      }),
      await ensureWorkPanel(session.ctx),
    );
    const unchanged = [
      '◆ Todos · 4/5 done',
      '  ○ Open todo',
      '  +4 done',
      '← interact',
    ];
    expect(session.render()).toEqual(unchanged);
    bridge.emit('input', { source: 'interactive', text: 'new prompt' });
    bridge.emit('before_agent_start', { prompt: 'new prompt' });
    bridge.setIdle(false);
    bridge.emit('agent_start');
    expect(session.render()).toEqual(unchanged);
    bridge.setIdle(true);
    bridge.emit('agent_settled');
    expect(session.render()).toEqual(unchanged);
    session.key('\x1b[D');
    expect(session.render().at(-1)).toBe('↑↓ move · Enter open · Esc back');
  });
});

describe('collapsed section navigation', () => {
  it('moves one selection across summary lines and item rows and opens the selected history with suspension', async () => {
    const session = uiSession();
    bindSession(session);
    let finish!: () => void;
    const openHistory = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const agents = {
      ...retained([row('history', 'done', 10)]),
      openHistory: vi.fn(),
      open: vi.fn(),
    };
    const background = {
      ...retained([row('bg old', 'failed', 20)]),
      id: 'background',
      label: 'Background',
      priority: 30,
      openHistory,
    };
    for (const source of [background, provider('todos', 'Todos', 20), agents])
      cleanups.push(registerWorkPanelProvider(session.ctx, source));
    cleanups.push(await ensureWorkPanel(session.ctx));
    for (const key of ['\x1b[A', '\x1b[B', '\r', 'x'])
      expect(session.key(key)).toBeUndefined();
    session.key('\x1b[D');
    expect(
      session.render().filter((line: string) => line.startsWith('› ')),
    ).toEqual(['› ◆ Agents · 1 done · 0 failed']);
    expect(session.render().at(-1)).toBe('↑↓ move · Enter history · Esc back');
    session.key('\x1b[B');
    expect(
      session.render().filter((line: string) => line.startsWith('› ')),
    ).toEqual(['› ◐ Todos item']);
    expect(session.render().at(-1)).toBe(
      '↑↓ move · Enter open · x cancel · Esc back',
    );
    session.key('\x1b[B');
    session.key('x');
    session.key('X');
    expect(background.close).not.toHaveBeenCalled();
    expect(session.render().at(-1)).toBe('↑↓ move · Enter history · Esc back');
    session.key('\x1b[A');
    session.key('\x1b[B');
    session.key('\r');
    expect(openHistory).toHaveBeenCalledExactlyOnceWith(session.ctx);
    expect(agents.open).not.toHaveBeenCalled();
    expect(session.ui.custom).not.toHaveBeenCalled();
    for (const key of ['\x1b[D', '\x1b[A', '\x1b[B', '\r', 'x', '\x1b'])
      expect(session.key(key)).toBeUndefined();
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(session.key('\x1b[A')).toBeUndefined();
    session.key('\x1b[D');
    session.key('\x1b[C');
    expect(session.key('\x1b[B')).toBeUndefined();
    session.key('\x1b[D');
    session.key('\x1b');
    expect(session.key('\x1b[A')).toBeUndefined();
  });

  it('advertises only available actions when a summary has no history opener', async () => {
    const session = uiSession();
    bindSession(session);
    cleanups.push(
      registerWorkPanelProvider(session.ctx, retained([])),
      await ensureWorkPanel(session.ctx),
    );
    session.key('\x1b[D');
    expect(session.render()).toEqual([
      '› ◆ Agents · 0 done · 0 failed',
      'Esc back',
    ]);
    expect(session.key('\r')).toBeUndefined();
    expect(session.key('x')).toBeUndefined();
    expect(session.ui.custom).not.toHaveBeenCalled();
  });

  it.each([
    'typed text',
    'overlay',
    'foreign focus',
  ])('leaves keys alone on collapsed summaries for %s', async (guard) => {
    const session = uiSession();
    bindSession(session);
    const openHistory = vi.fn();
    cleanups.push(
      registerWorkPanelProvider(session.ctx, { ...retained([]), openHistory }),
      await ensureWorkPanel(session.ctx),
    );
    session.key('\x1b[D');
    if (guard === 'typed text') session.setText('not empty');
    if (guard === 'overlay') session.setOverlay(true);
    if (guard === 'foreign focus') session.focusOther();
    for (const key of ['\x1b[D', '\x1b[A', '\x1b[B', '\r', 'x', '\x1b'])
      expect(session.key(key)).toBeUndefined();
    expect(openHistory).not.toHaveBeenCalled();
  });

  it('keeps a selected lower-priority summary visible under a mixed-section budget', async () => {
    const session = uiSession();
    bindSession(session);
    for (const [id, label, priority] of [
      ['agents', 'Agents', 10],
      ['background', 'Background', 30],
    ] as const)
      cleanups.push(
        registerWorkPanelProvider(session.ctx, {
          ...retained([]),
          id,
          label,
          priority,
          openHistory: vi.fn(),
        }),
      );
    cleanups.push(
      registerWorkPanelProvider(session.ctx, provider('todos', 'Todos', 20)),
      await ensureWorkPanel(session.ctx),
    );
    session.tui.terminal.rows = 6;
    expect(session.render()).toEqual([
      '◆ Agents · 0 done · 0 failed',
      '← interact',
    ]);
    session.key('\x1b[D');
    session.key('\x1b[B');
    session.key('\x1b[B');
    expect(
      session
        .render()
        .some((line: string) => line.startsWith('› ◆ Background')),
    ).toBe(true);
    expect(session.render().length).toBeLessThanOrEqual(3);
  });
});
