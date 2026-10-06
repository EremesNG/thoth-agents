import {
  ensureWorkPanel,
  registerRenderKit,
  registerWorkPanelProvider,
  TODO_STATE_CHANNEL,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it } from 'vitest';
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
])('hides an all-done task list with no widget lines (render kit: %s)', async (themed) => {
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

  expect(session.render()).toEqual([]);
  expect(provider.listRows(0)).toEqual([]);
  expect(provider.visibleCount()).toBe(0);
  expect(provider.summary()).toEqual({ completed: 7, total: 7 });
  expect(session.key('\x1b[D')).toBeUndefined();
  expect(session.ui.setStatus).toHaveBeenLastCalledWith(
    'thoth-work-panel',
    undefined,
  );
});

it('removes the Todos section and releases focus as soon as the last open task completes', async () => {
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
    '  +1 done',
    '← interact',
  ]);
  expect(session.ui.setStatus).toHaveBeenLastCalledWith(
    'thoth-work-panel',
    '← work · 1',
  );
  expect(session.key('\x1b[D')).toEqual({ consume: true });

  commitState('foreground', {
    tasks: [
      { id: 1, subject: 'Last open task', status: 'completed' },
      { id: 2, subject: 'Already finished', status: 'completed' },
    ],
    nextId: 3,
  });
  expect(session.render()).toEqual([]);
  expect(session.ui.setStatus).toHaveBeenLastCalledWith(
    'thoth-work-panel',
    undefined,
  );
  for (const key of ['\x1b[D', '\x1b[A', '\x1b[B', '\r', 'x'])
    expect(session.key(key)).toBeUndefined();
});

it('lists in-progress work with its active form before pending work and a trailing done count', () => {
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
      { id: 4, subject: 'Pending last', status: 'pending' },
      { id: 5, subject: 'Deleted task', status: 'deleted' },
    ],
    nextId: 6,
  });
  const provider = createTodoWorkPanelProvider();
  expect(provider).toMatchObject({
    version: 1,
    id: 'todos',
    label: 'Todos',
    priority: 20,
  });
  expect(provider.summary()).toEqual({ completed: 1, total: 4 });
  expect(provider.listRows(0).map((row) => row.primary)).toEqual([
    'Implement feature (Implementing feature)',
    'Pending first',
    'Pending last',
    '+1 done',
  ]);
  expect(provider.visibleCount()).toBe(3);
});

it('provides host detail with the subject, status and multiline description, without a close action', () => {
  setActiveRenderSession('foreground');
  replaceState('foreground', {
    tasks: [
      {
        id: 7,
        subject: 'Write tests',
        status: 'in_progress',
        description: 'Cover ordering.\nCover replay.',
        activeForm: 'Writing tests',
      },
    ],
    nextId: 8,
  });
  const provider = createTodoWorkPanelProvider();
  expect(provider.detail('7', 0)).toMatchObject({
    id: '7',
    title: 'Write tests',
    status: 'in_progress',
    evidence: { label: 'Description', text: 'Cover ordering.\nCover replay.' },
  });
  const row = provider.listRows(0)[0];
  expect(provider.armCloseLabel(row)).toBe('');
  expect('supportsLogTail' in provider).toBe(false);
  provider.close('7');
  expect(provider.listRows(0)[0]).toEqual(row);
  expect(provider.detail('missing', 0)).toBeNull();
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

it('keeps model-controlled row and detail text terminal-safe', () => {
  setActiveRenderSession('foreground');
  replaceState('foreground', {
    tasks: [
      {
        id: 1,
        subject: 'Safe\u001b[31m subject\u001b[0m\nline',
        status: 'in_progress',
        activeForm: 'Working\twell\u202e',
        description:
          'First\u001b]52;c;secret\u0007 line\nSecond\u001b[31m line\u001b[0m',
      },
    ],
    nextId: 2,
  });
  const provider = createTodoWorkPanelProvider();
  expect(provider.listRows(0)[0].primary).toBe(
    'Safe subject line (Working well)',
  );
  expect(provider.detail('1', 0)).toMatchObject({
    title: 'Safe subject line',
    evidence: { text: 'First line\nSecond line' },
  });
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

it('hides completed-only lists and excludes pending active forms', () => {
  setActiveRenderSession('foreground');
  replaceState('foreground', {
    tasks: [
      { id: 1, subject: 'Finished one', status: 'completed' },
      { id: 2, subject: 'Finished two', status: 'completed' },
    ],
    nextId: 3,
  });
  const provider = createTodoWorkPanelProvider();
  expect(provider.listRows(0)).toEqual([]);
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
  expect(provider.detail('1', 0)?.evidence).toEqual({
    label: 'Description',
    text: '',
    emptyText: '(no description)',
  });
});

it('publishes distinct todo glyphs and semantic subject, active-form and done-summary hierarchy', () => {
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
      { id: 3, subject: 'Finished', status: 'completed' },
    ],
    nextId: 4,
  });
  const rows = createTodoWorkPanelProvider().listRows(0);
  expect(rows[0]).toMatchObject({
    statusGlyph: '◇',
    statusGlyphRole: 'accent',
    segments: [
      { text: 'Verify', role: 'primary' },
      { text: ' (Verifying)', role: 'secondary' },
    ],
  });
  expect(rows[1]).toMatchObject({
    statusGlyph: '○',
    statusGlyphRole: 'secondary',
    segments: [{ text: 'Archive', role: 'primary' }],
  });
  expect(rows[2]).toMatchObject({
    summary: true,
    segments: [{ text: '+1 done', role: 'dim' }],
  });
});
