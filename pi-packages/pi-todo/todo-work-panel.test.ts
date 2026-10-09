import {
  ensureWorkPanel,
  registerRenderKit,
  registerWorkPanelProvider,
  TODO_STATE_CHANNEL,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { uiSession } from '../pi-core/test/work-panel-fixture.js';
import {
  clearActiveRenderSession,
  commitState,
  evictSession,
  replaceState,
  setActiveRenderSession,
} from './state/store.js';
import { createMockCtx, createMockPi } from './test/helpers.js';
import { registerTodoTool } from './todo.js';
import { createTodoWorkPanelProvider } from './todo-work-panel.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

it.each([
  false,
  true,
])('matches the v1 native and themed golden task rows with host-owned completion styling (render kit: %s)', async (themed) => {
  const session = uiSession();
  const styles: Array<[string, string]> = [];
  session.ui.theme.fg = (role, text) => {
    styles.push([role, text]);
    return text;
  };
  Object.assign(session.ui.theme, {
    strikethrough: (text: string) => `\u001b[9m${text}\u001b[29m`,
  });
  setActiveRenderSession('foreground');
  replaceState('foreground', {
    tasks: [
      { id: 1, subject: 'Review', status: 'pending' },
      {
        id: 2,
        subject: 'Build',
        status: 'in_progress',
        activeForm: 'Building',
      },
      { id: 3, subject: 'Explore', status: 'completed' },
      { id: 4, subject: 'Deleted', status: 'deleted' },
    ],
    nextId: 5,
  });
  if (themed) {
    const token = registerRenderKit(
      {
        ...createTestRenderKit(),
        fg: (theme, role, text) => theme.fg(role, text),
      },
      {},
    );
    cleanups.push(() => withdrawRenderKit(token));
  }
  cleanups.push(
    registerWorkPanelProvider(session.ctx, createTodoWorkPanelProvider()),
    await ensureWorkPanel(session.ctx),
  );

  // Captured from the unchanged provider through the HEAD v1 renderer before migration.
  const golden = themed
    ? [
        'Todos · 1/3 done',
        '  ├─ ○ Review',
        '  ├─ ◇ Build (Building)',
        '  └─ ✓ \u001b[9mExplore\u001b[29m',
        '← interact',
      ]
    : [
        '◆ Todos · 1/3 done',
        '  ○ Review',
        '  ◇ Build (Building)',
        '  ✓ \u001b[9mExplore\u001b[29m',
        '← interact',
      ];
  expect(session.render(100)).toEqual(golden);
  expect(session.render(40)).toEqual(golden);
  expect(styles).toContainEqual(['toolTitle', 'Review']);
  expect(styles).toContainEqual(['text', ' (Building)']);
  expect(styles).toContainEqual(['dim', 'Explore']);
  expect(styles).toContainEqual(['success', '✓']);
});

it.each([
  false,
  true,
])('keeps an all-done task list visible with its counter until the next prompt (render kit: %s)', async (themed) => {
  const session = uiSession();
  setActiveRenderSession('foreground');
  replaceState('foreground', {
    tasks: Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      subject: `Finished ${index + 1}`,
      status: 'completed' as const,
    })),
    nextId: 8,
  });
  if (themed) {
    const token = registerRenderKit(createTestRenderKit(), {});
    cleanups.push(() => withdrawRenderKit(token));
  }
  const provider = createTodoWorkPanelProvider();
  cleanups.push(registerWorkPanelProvider(session.ctx, provider));
  cleanups.push(await ensureWorkPanel(session.ctx));

  const lines: string[] = session.render();
  expect(lines[0]).toContain('Todos · 7/7 done');
  expect(lines.some((line) => line.includes('Finished 1'))).toBe(true);
  expect(provider.visibleCount()).toBe(7);
  expect(provider.summary()).toEqual({ completed: 7, total: 7 });
});
it('keeps a finished task list shown with completed rows marked as the last open task completes', async () => {
  const session = uiSession();
  setActiveRenderSession('foreground');
  replaceState('foreground', {
    tasks: [
      { id: 1, subject: 'Last open task', status: 'in_progress' },
      { id: 2, subject: 'Already finished', status: 'completed' },
    ],
    nextId: 3,
  });
  cleanups.push(
    registerWorkPanelProvider(session.ctx, createTodoWorkPanelProvider()),
  );
  cleanups.push(await ensureWorkPanel(session.ctx));
  expect(session.render()).toEqual([
    '◆ Todos · 1/2 done',
    '  ◇ Last open task',
    '  ✓ Already finished',
    '← interact',
  ]);

  commitState('foreground', {
    tasks: [
      { id: 1, subject: 'Last open task', status: 'completed' },
      { id: 2, subject: 'Already finished', status: 'completed' },
    ],
    nextId: 3,
  });
  expect(session.render()).toEqual([
    '◆ Todos · 2/2 done',
    '  ✓ Last open task',
    '  ✓ Already finished',
    '← interact',
  ]);
});

it('opens the panel from the heading, a row and the dropped-done summary, and drops completed rows first with an exact count', async () => {
  const session = uiSession();
  setActiveRenderSession('foreground');
  replaceState('foreground', {
    tasks: [
      ...Array.from({ length: 14 }, (_, index) => ({
        id: index + 1,
        subject: `Done ${index + 1}`,
        status: 'completed' as const,
      })),
      { id: 15, subject: 'Open one', status: 'in_progress' as const },
      { id: 16, subject: 'Open two', status: 'pending' as const },
    ],
    nextId: 17,
  });
  const provider = createTodoWorkPanelProvider();
  const open = vi.fn();
  const openHistory = vi.fn();
  provider.open = open;
  provider.openHistory = openHistory;
  cleanups.push(registerWorkPanelProvider(session.ctx, provider));
  cleanups.push(await ensureWorkPanel(session.ctx));

  const lines: string[] = session.render();
  expect(lines[0]).toBe('◆ Todos · 14/16 done');
  expect(lines.some((line) => line.includes('Open one'))).toBe(true);
  expect(lines.some((line) => line.includes('Open two'))).toBe(true);
  const dropped = lines.find((line) => /\+\d+ done/.test(line));
  expect(dropped).toBeDefined();
  const hidden = Number(/\+(\d+) done/.exec(dropped ?? '')?.[1]);
  expect(lines.filter((line) => line.includes('✓')).length + hidden).toBe(14);

  session.key('\x1b[D');
  session.key('\r');
  expect(openHistory).toHaveBeenCalledTimes(1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  session.key('\x1b[D');
  session.key('\x1b[B');
  session.key('\r');
  expect(open).toHaveBeenCalledTimes(1);
  expect(open.mock.calls[0][0]).toBe(
    String(open.mock.calls[0][0] && Number(open.mock.calls[0][0])),
  );
});
it('keeps exact completed counts selectable in a three-line widget and stays bounded below it', async () => {
  const session = uiSession();
  session.tui.terminal.rows = 6;
  setActiveRenderSession('foreground');
  replaceState('foreground', {
    tasks: [
      ...Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        subject: `Done ${index + 1}`,
        status: 'completed' as const,
      })),
      { id: 11, subject: 'Pending', status: 'pending' as const },
    ],
    nextId: 12,
  });
  const provider = createTodoWorkPanelProvider();
  const openHistory = vi.fn();
  provider.openHistory = openHistory;
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider),
    await ensureWorkPanel(session.ctx),
  );
  expect(session.render()).toEqual([
    '◆ Todos · 10/11 done',
    '  +10 done · +1 more',
    '← interact',
  ]);
  session.key('\x1b[D');
  for (let index = 0; index < 12; index++) session.key('\x1b[B');
  expect(session.render()).toContain('› +10 done · +1 more');
  session.key('\r');
  expect(openHistory).toHaveBeenCalledExactlyOnceWith(session.ctx);
  for (const height of [0, 2, 4]) {
    session.tui.terminal.rows = height;
    expect(session.render().length).toBeLessThanOrEqual(height / 2);
  }
});

it('lists every visible task in order as plain data with completed rows marked and dropped first', () => {
  setActiveRenderSession('foreground');
  replaceState('foreground', {
    tasks: [
      { id: 1, subject: 'Pending first', status: 'pending' },
      { id: 2, subject: 'Finished task', status: 'completed' },
      {
        id: 3,
        subject: 'Implement feature',
        status: 'in_progress',
        activeForm: 'Implementing feature',
      },
      { id: 5, subject: 'Deleted task', status: 'deleted' },
    ],
    nextId: 6,
  });
  const provider = createTodoWorkPanelProvider();
  expect(provider).toMatchObject({
    version: 2,
    id: 'todos',
    label: 'Todos',
    priority: 20,
    selectableHeading: true,
    selectableSummary: true,
  });
  expect(provider.droppedSummary(4)).toBe('+4 done');
  expect(provider.summary()).toEqual({ completed: 1, total: 3 });
  const rows = provider.listRows(0);
  expect(rows.map((row) => row.id)).toEqual(['1', '2', '3']);
  expect(rows.map((row) => row.dropFirst)).toEqual([
    undefined,
    true,
    undefined,
  ]);
  expect(rows[1]).toMatchObject({
    statusGlyph: 'completed',
    statusGlyphRole: 'success',
    segments: [{ text: 'Finished task', role: 'completed' }],
  });
  expect(structuredClone(rows)).toEqual(rows);
  expect(JSON.parse(JSON.stringify(rows))).toEqual(rows);
  expect(rows[2].primary).toBe('Implement feature (Implementing feature)');
  expect(provider.visibleCount()).toBe(3);
});
it('has no generic detail card and no close action; rows open the panel instead', () => {
  setActiveRenderSession('foreground');
  replaceState('foreground', {
    tasks: [{ id: 7, subject: 'Write tests', status: 'in_progress' }],
    nextId: 8,
  });
  const provider = createTodoWorkPanelProvider();
  const row = provider.listRows(0)[0];
  expect(provider.detail('7', 0)).toBeNull();
  expect(provider.armCloseLabel(row)).toBe('');
  expect(typeof provider.open).toBe('function');
  expect(typeof provider.openHistory).toBe('function');
  expect('supportsLogTail' in provider).toBe(false);
  provider.close('7');
  expect(provider.listRows(0)[0]).toEqual(row);
});
it('notifies on every foreground commit, replay and eviction, but not child changes, and unsubscribes cleanly', () => {
  setActiveRenderSession('foreground');
  const provider = createTodoWorkPanelProvider();
  const updates: string[][] = [];
  const unsubscribe = provider.onVisibleChanged(() =>
    updates.push(provider.listRows(0).map((row) => row.primary)),
  );
  commitState('foreground', {
    tasks: [{ id: 1, subject: 'Created', status: 'pending' }],
    nextId: 2,
  });
  commitState('child', {
    tasks: [{ id: 1, subject: 'Child task', status: 'pending' }],
    nextId: 2,
  });
  replaceState('child', { tasks: [], nextId: 1 });
  evictSession('child');
  replaceState('foreground', {
    tasks: [{ id: 2, subject: 'Replayed', status: 'pending' }],
    nextId: 3,
  });
  evictSession('foreground');
  expect(updates).toEqual([['Created'], ['Replayed'], []]);
  unsubscribe();
  commitState('foreground', {
    tasks: [{ id: 3, subject: 'After disposal', status: 'pending' }],
    nextId: 4,
  });
  expect(updates).toEqual([['Created'], ['Replayed'], []]);
});

it('keeps model-controlled row text terminal-safe', () => {
  setActiveRenderSession('foreground');
  replaceState('foreground', {
    tasks: [
      {
        id: 1,
        subject: 'Safe\u001b[31m subject\u001b[0m\nline',
        status: 'in_progress',
        activeForm: 'Working\twell\u202e',
      },
    ],
    nextId: 2,
  });
  const provider = createTodoWorkPanelProvider();
  expect(provider.listRows(0)[0].primary).toBe(
    'Safe subject line (Working well)',
  );
});
it('refreshes when foreground ownership changes or clears', () => {
  replaceState('first', {
    tasks: [{ id: 1, subject: 'First', status: 'pending' }],
    nextId: 2,
  });
  replaceState('second', {
    tasks: [{ id: 1, subject: 'Second', status: 'pending' }],
    nextId: 2,
  });
  const provider = createTodoWorkPanelProvider();
  const updates: string[][] = [];
  const unsubscribe = provider.onVisibleChanged(() =>
    updates.push(provider.listRows(0).map((row) => row.primary)),
  );
  setActiveRenderSession('first');
  setActiveRenderSession('second');
  clearActiveRenderSession();
  unsubscribe();
  expect(updates).toEqual([['First'], ['Second'], []]);
});

it('does not let a stale panel refresh break tool execution or state publication', async () => {
  setActiveRenderSession('foreground');
  const provider = createTodoWorkPanelProvider();
  const unsubscribe = provider.onVisibleChanged(() => {
    throw new Error('stale UI');
  });
  const { pi, captured } = createMockPi();
  const snapshots: unknown[] = [];
  const offState = pi.events.on(TODO_STATE_CHANNEL.name, (snapshot) =>
    snapshots.push(snapshot),
  );
  registerTodoTool(pi);
  const tool = captured.tools.get('todo');
  if (!tool) throw new Error('todo not registered');
  try {
    await expect(
      tool.execute(
        'call',
        { action: 'create', subject: 'Preserved work' },
        undefined,
        undefined,
        createMockCtx({ sessionId: 'foreground' }),
      ),
    ).resolves.toMatchObject({
      details: { tasks: [{ subject: 'Preserved work' }] },
    });
    expect(snapshots).toMatchObject([
      {
        sessionId: 'foreground',
        data: { tasks: [{ subject: 'Preserved work' }] },
      },
    ]);
  } finally {
    unsubscribe();
    offState();
  }
});

it.each([
  { tasks: [] },
  { tasks: [{ id: 1, subject: 'Deleted', status: 'deleted' as const }] },
])('hides an empty or tombstone-only list from the host', ({ tasks }) => {
  setActiveRenderSession('foreground');
  replaceState('foreground', { tasks, nextId: 2 });
  const provider = createTodoWorkPanelProvider();
  expect(provider.listRows(0)).toEqual([]);
  expect(provider.summary()).toEqual({ completed: 0, total: 0 });
  expect(provider.visibleCount()).toBe(0);
});

it('shows completed-only lists and excludes pending active forms', () => {
  setActiveRenderSession('foreground');
  replaceState('foreground', {
    tasks: [
      { id: 1, subject: 'Finished one', status: 'completed' },
      { id: 2, subject: 'Finished two', status: 'completed' },
    ],
    nextId: 3,
  });
  const provider = createTodoWorkPanelProvider();
  expect(provider.listRows(0).map((row) => row.primary)).toEqual([
    'Finished one',
    'Finished two',
  ]);
  expect(provider.summary()).toEqual({ completed: 2, total: 2 });
  replaceState('foreground', {
    tasks: [
      {
        id: 1,
        subject: 'Pending',
        status: 'pending',
        activeForm: 'Not active yet',
      },
    ],
    nextId: 2,
  });
  expect(provider.listRows(0).map((row) => row.primary)).toEqual(['Pending']);
});
it('publishes distinct todo glyphs and semantic subject and active-form hierarchy', () => {
  setActiveRenderSession('foreground');
  replaceState('foreground', {
    tasks: [
      {
        id: 1,
        subject: 'Verify',
        status: 'in_progress',
        activeForm: 'Verifying',
      },
      { id: 2, subject: 'Archive', status: 'pending' },
    ],
    nextId: 3,
  });
  const rows = createTodoWorkPanelProvider().listRows(0);
  expect(rows[0]).toMatchObject({
    statusGlyph: 'taskInProgress',
    statusGlyphRole: 'accent',
    segments: [
      { text: 'Verify', role: 'primary' },
      { text: ' (Verifying)', role: 'secondary' },
    ],
  });
  expect(rows[1]).toMatchObject({
    statusGlyph: 'pending',
    statusGlyphRole: 'secondary',
    segments: [{ text: 'Archive', role: 'primary' }],
  });
});
it('todo semantic overrides let the host use the registered kit and restore native glyphs on withdrawal without changing row data', async () => {
  const session = uiSession();
  setActiveRenderSession('glyph-test');
  cleanups.push(() => evictSession('glyph-test'));
  replaceState('glyph-test', {
    tasks: [
      { id: 1, subject: 'active', status: 'in_progress' },
      { id: 2, subject: 'waiting', status: 'pending' },
    ],
    nextId: 3,
  });
  const provider = createTodoWorkPanelProvider();
  const rows = provider.listRows(0);
  expect(rows.map((row) => row.statusGlyph)).toEqual([
    'taskInProgress',
    'pending',
  ]);
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider),
    await ensureWorkPanel(session.ctx),
  );
  expect(session.render()).toEqual([
    '◆ Todos · 0/2 done',
    '  ◇ active',
    '  ○ waiting',
    '← interact',
  ]);
  const kit = createTestRenderKit();
  kit.icon = (name) => (name === 'taskInProgress' ? '*' : name);
  kit.statusGlyph = (_theme, status) => (status === 'pending' ? '-' : '+');
  const token = registerRenderKit(kit, {});
  cleanups.push(() => withdrawRenderKit(token));
  expect(session.render()).toEqual([
    'Todos separator 0/2 done',
    '  ├─ * active',
    '  └─ - waiting',
    'arrowLeft interact',
  ]);
  expect(provider.listRows(0)).toEqual(rows);
  withdrawRenderKit(token);
  expect(session.render()).toEqual([
    '◆ Todos · 0/2 done',
    '  ◇ active',
    '  ○ waiting',
    '← interact',
  ]);
  expect(provider.listRows(0)).toEqual(rows);
});
