import {
  type ExtensionContext,
  SessionManager,
} from '@earendil-works/pi-coding-agent';
import {
  bindWorkPanelLifecycle,
  listWorkPanelSources,
  subscribe,
  TODO_STATE_CHANNEL,
} from '@thoth-agents/pi-core';
import { afterEach, expect, it, vi } from 'vitest';
import { ownedOverlaySession } from '../pi-core/test/owned-overlay-fixture.js';
import registerTodo from './index.js';
import { __resetState, getState } from './state/store.js';
import { createMockCtx, createMockPi, makeTheme } from './test/helpers.js';
import { showTodoPanel, type TodoPanel } from './todo-panel.js';
import { STATE_ENTRY_TYPE } from './tool/types.js';

vi.mock('@thoth-agents/pi-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@thoth-agents/pi-core')>()),
  ensureWorkPanel: async () => () => {},
}));

afterEach(() => vi.restoreAllMocks());

async function setup(hasUI = true, prebound = false) {
  const sessionManager = SessionManager.inMemory();
  sessionManager.appendCustomEntry(STATE_ENTRY_TYPE, {
    action: 'create',
    params: {},
    nextId: 3,
    tasks: [
      { id: 1, subject: 'Legacy completed', status: 'completed' },
      { id: 2, subject: 'Still pending', status: 'pending' },
    ],
  });
  const { pi, captured } = createMockPi();
  const append = pi.appendEntry.bind(pi);
  pi.appendEntry = (type, data) => {
    append(type, data);
    sessionManager.appendCustomEntry(type, data);
  };
  let idle = true;
  const ctx = {
    ...createMockCtx({ hasUI }),
    sessionManager,
    isIdle: () => idle,
  };
  if (prebound) bindWorkPanelLifecycle(pi, ctx);
  registerTodo(pi);
  const emit = async (
    name: string,
    event: unknown = {},
    context: ExtensionContext = ctx,
  ) => {
    for (const handler of [...(captured.events.get(name) ?? [])])
      await handler(event as never, context as never);
  };
  await emit('session_start');
  const tool = captured.tools.get('todo');
  if (!tool) throw new Error('todo not registered');
  const prompt = async (text: string, source = 'interactive') => {
    await emit('input', { source, text });
    await emit('before_agent_start', { prompt: text, systemPrompt: '' });
  };
  const call = (params: Record<string, unknown>) =>
    tool.execute('test', params as never, undefined, undefined, ctx);
  return {
    pi,
    captured,
    ctx,
    emit,
    prompt,
    call,
    setIdle: (value: boolean) => {
      idle = value;
    },
    state: () => getState(sessionManager.getSessionId()),
  };
}

it('persists and publishes one archiving snapshot only on a newly recognized epoch, refreshing the provider revision', async () => {
  const app = await setup();
  const onSnapshot = vi.fn();
  const off = subscribe(app.pi.events, TODO_STATE_CHANNEL, { onSnapshot });
  try {
    await app.emit('before_agent_start', {
      prompt: 'unobserved',
      systemPrompt: '',
    });
    await app.prompt('extension text', 'extension');
    app.setIdle(false);
    await app.prompt('queued while busy');
    app.setIdle(true);
    expect(app.captured.entries).toHaveLength(0);
    expect(app.state().tasks[0]).not.toHaveProperty('archivedAt');
    const revision = listWorkPanelSources().find(
      (source) => source.id === 'todos',
    )?.revision;
    vi.spyOn(Date, 'now').mockReturnValue(4000);
    await app.prompt('next job');
    expect(app.state().tasks).toEqual([
      {
        id: 1,
        subject: 'Legacy completed',
        status: 'completed',
        archivedAt: 4000,
      },
      { id: 2, subject: 'Still pending', status: 'pending' },
    ]);
    expect(app.captured.entries).toEqual([
      {
        customType: STATE_ENTRY_TYPE,
        data: {
          action: 'archive',
          params: {},
          tasks: app.state().tasks,
          nextId: 3,
        },
      },
    ]);
    expect(
      listWorkPanelSources().find((source) => source.id === 'todos')?.revision,
    ).toBe((revision ?? 0) + 1);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onSnapshot.mock.calls[0][0]).toMatchObject({
      data: {
        tasks: [
          { id: 1, status: 'completed', archivedAt: 4000 },
          { id: 2, status: 'pending' },
        ],
      },
    });
    await app.emit('before_agent_start', {
      prompt: 'next job',
      systemPrompt: '',
    });
    await app.emit('agent_start');
    await app.prompt('no more to archive', 'rpc');
    expect(app.captured.entries).toHaveLength(1);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  } finally {
    off();
    await app.emit('session_shutdown');
  }
});

it('archives fresh completions only on the next epoch and isolates other sessions even with an existing lifecycle owner', async () => {
  const app = await setup(false, true);
  try {
    await app.prompt('first epoch');
    vi.spyOn(Date, 'now').mockReturnValue(6000);
    await app.call({ action: 'update', id: 2, status: 'completed' });
    expect(app.state().tasks[1]).toMatchObject({ completedAt: 6000 });
    expect(app.state().tasks[1]).not.toHaveProperty('archivedAt');
    const child = createMockCtx({ sessionId: 'child', hasUI: false });
    await app.emit('session_start', {}, child);
    await app.emit(
      'input',
      { source: 'interactive', text: 'child job' },
      child,
    );
    await app.emit(
      'before_agent_start',
      { prompt: 'child job', systemPrompt: '' },
      child,
    );
    expect(app.state().tasks[1]).not.toHaveProperty('archivedAt');
    await app.emit('session_shutdown', {}, child);
    await app.prompt('second epoch', 'rpc');
    expect(app.state().tasks[1]).toMatchObject({
      completedAt: 6000,
      archivedAt: 6000,
    });
    expect(
      app.captured.entries.filter(
        (entry) => (entry.data as { action: string }).action === 'archive',
      ),
    ).toHaveLength(2);
  } finally {
    await app.emit('session_shutdown');
  }
});

it('restores the archival marker when navigating away from and back to the archived branch', async () => {
  const app = await setup(false);
  try {
    const beforeArchive = app.ctx.sessionManager.getLeafId();
    if (!beforeArchive) throw new Error('missing branch point');
    await app.prompt('archive branch');
    const archivedLeaf = app.ctx.sessionManager.getLeafId();
    if (!archivedLeaf) throw new Error('missing archived leaf');
    const archivedAt = app.state().tasks[0].archivedAt;
    expect(archivedAt).toBeTypeOf('number');
    app.ctx.sessionManager.branch(beforeArchive);
    await app.emit('session_tree');
    expect(app.state().tasks[0]).not.toHaveProperty('archivedAt');
    await app.call({ action: 'update', id: 2, subject: 'Sibling work' });
    app.ctx.sessionManager.branch(archivedLeaf);
    await app.emit('session_tree');
    expect(app.state().tasks[0].archivedAt).toBe(archivedAt);
    expect(app.state().tasks[1].subject).toBe('Still pending');
  } finally {
    await app.emit('session_shutdown');
  }
});

it.each([
  'session_start',
  'session_tree',
  'session_compact',
])('restores persisted archivedAt on %s with the real branch', async (event) => {
  const app = await setup(false);
  try {
    vi.spyOn(Date, 'now').mockReturnValue(4500);
    await app.call({
      action: 'create',
      subject: 'Shipped',
      group: 'release',
      status: 'completed',
    });
    vi.mocked(Date.now).mockReturnValue(5000);
    await app.prompt('archive history');
    if (event === 'session_compact')
      app.ctx.sessionManager.appendCompaction('summary', null, 100);
    if (event === 'session_start') await app.emit('session_shutdown');
    __resetState();
    await app.emit(event);
    expect(app.state().tasks[0]).toEqual({
      id: 1,
      subject: 'Legacy completed',
      status: 'completed',
      archivedAt: 5000,
    });
    expect(app.state().tasks[1]).toEqual({
      id: 2,
      subject: 'Still pending',
      status: 'pending',
    });
    expect(app.state().tasks[2]).toEqual({
      id: 3,
      subject: 'Shipped',
      group: 'release',
      status: 'completed',
      createdAt: 4500,
      completedAt: 4500,
      archivedAt: 5000,
    });
    expect(app.state().nextId).toBe(4);
    expect(app.captured.entries).toHaveLength(2);
  } finally {
    await app.emit('session_shutdown');
  }
});

it('keeps every completed task in /todos and the overlay after archival epochs, without the compact cap', async () => {
  const app = await setup();
  const { ctx: sdkCtx, tui } = ownedOverlaySession();
  let history: TodoPanel | undefined;
  let opening: Promise<void> | undefined;
  try {
    await app.call({ action: 'update', id: 2, status: 'completed' });
    for (let id = 3; id <= 7; id++)
      await app.call({
        action: 'create',
        subject: `Completed task ${id}`,
        status: 'completed',
      });
    await app.prompt('archive all');
    await app.prompt('another epoch');
    expect(app.state().tasks).toHaveLength(7);
    expect(
      app.state().tasks.every((task) => task.archivedAt !== undefined),
    ).toBe(true);
    const command = app.captured.commands.get('todos');
    if (!command) throw new Error('missing /todos command');
    await command.handler('', app.ctx as never);
    const notify = vi.mocked(app.ctx.ui.notify);
    const text = notify.mock.calls.at(-1)?.[0] ?? '';
    expect(text).toContain('7/7 completed');
    for (const task of app.state().tasks) expect(text).toContain(task.subject);

    const custom: typeof sdkCtx.ui.custom = (factory, options) =>
      sdkCtx.ui.custom(
        (tui, _theme, _keys, done) =>
          factory(tui, makeTheme(), { matches: () => false } as never, done),
        options,
      );
    const overlayCtx = {
      ...app.ctx,
      mode: 'tui' as const,
      ui: { ...sdkCtx.ui, custom },
    };
    opening = showTodoPanel(overlayCtx, '7');
    await Promise.resolve();
    history = tui.getFocusedComponent() as TodoPanel;
    const overlay = history.render(120).join('\n');
    expect(history.getRenderDebugState().selectedId).toBe('7');
    expect(overlay).toContain('7/7 completed');
    for (const task of app.state().tasks)
      expect(overlay).toContain(task.subject);
  } finally {
    history?.handleInput('q');
    await opening;
    tui.stop();
    await app.emit('session_shutdown');
  }
});
