import { afterEach, expect, it, vi } from 'vitest';
import registerTodo from './index.js';
import { getActiveRenderSession, getState } from './state/store.js';
import {
  buildSessionEntries,
  createMockCtx,
  createMockPi,
  makeTodoToolResult,
} from './test/helpers.js';
import { panel } from './test/work-panel-fixture.js';

vi.mock('@thoth-agents/pi-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@thoth-agents/pi-core')>();
  const { panel } = await import('./test/work-panel-fixture.js');
  return {
    ...actual,
    registerWorkPanelProvider: panel.register,
    ensureWorkPanel: panel.ensure,
  };
});

afterEach(() => panel.reset());

it('registers a Todos section for the foreground and removes the old collapse shortcut', async () => {
  const { pi, captured } = createMockPi();
  registerTodo(pi);
  const ctx = createMockCtx({ sessionId: 'foreground' });
  for (const handler of captured.events.get('session_start') ?? [])
    await handler({} as never, ctx as never);
  expect(panel.registrations[0]?.provider).toMatchObject({
    version: 2,
    label: 'Todos',
    priority: 20,
  });
  expect(panel.ensure).toHaveBeenCalledWith(ctx);
  expect(captured.shortcuts.has('ctrl+shift+t')).toBe(false);
});

function setup() {
  const { pi, captured } = createMockPi();
  registerTodo(pi);
  const current = createMockCtx({ sessionId: 'foreground' });
  const child = createMockCtx({ sessionId: 'child' });
  const tool = captured.tools.get('todo');
  if (!tool) throw new Error('todo not registered');
  const emit = async (event: string, ctx = current) => {
    for (const handler of captured.events.get(event) ?? [])
      await handler({} as never, ctx as never);
  };
  return { current, child, tool, emit, captured };
}

it('refreshes immediately after todo mutations while child sessions cannot rebind or contaminate the section', async () => {
  const { current, child, tool, emit } = setup();
  await emit('session_start');
  const { provider, changed } = panel.registrations[0];
  await tool.execute(
    'root',
    { action: 'create', subject: 'Current work' },
    undefined,
    undefined,
    current,
  );
  expect(changed).toHaveBeenCalled();
  changed.mockClear();
  await emit('session_start', child);
  await tool.execute(
    'child',
    { action: 'create', subject: 'Other work' },
    undefined,
    undefined,
    child,
  );
  await emit('session_shutdown', child);
  expect(changed).not.toHaveBeenCalled();
  expect(panel.ensure).toHaveBeenCalledTimes(1);
  expect(panel.registrations).toHaveLength(1);
  expect(provider.listRows(0).map((row) => row.primary)).toEqual([
    'Current work',
  ]);
  expect(panel.registrations[0].unregister).not.toHaveBeenCalled();
  expect(panel.releases[0]).not.toHaveBeenCalled();
});

it.each([
  'session_tree',
  'session_compact',
])('refreshes foreground replay on %s without replaying child work into the section', async (event) => {
  const { emit } = setup();
  await emit('session_start');
  const { provider, changed } = panel.registrations[0];
  const branch = buildSessionEntries([
    makeTodoToolResult({
      tasks: [
        {
          id: 1,
          subject: 'Restored work',
          status: 'pending',
          description: 'Restored description',
        },
      ],
      nextId: 2,
    }),
  ]);
  const replayed = createMockCtx({ sessionId: 'foreground', branch });
  await emit(event, replayed);
  expect(changed).toHaveBeenCalled();
  expect(provider.listRows(0).map((row) => row.primary)).toEqual([
    'Restored work',
  ]);
  changed.mockClear();
  await emit(event, createMockCtx({ sessionId: 'child', branch: [] }));
  expect(changed).not.toHaveBeenCalled();
  expect(provider.listRows(0).map((row) => row.primary)).toEqual([
    'Restored work',
  ]);
});

it('releases the foreground host and subscription on shutdown and lets the next UI session claim ownership', async () => {
  const { current, tool, emit } = setup();
  await emit('session_start');
  await tool.execute(
    'root',
    { action: 'create', subject: 'Old work' },
    undefined,
    undefined,
    current,
  );
  const registration = panel.registrations[0];
  const release = panel.releases[0];
  await emit('session_shutdown');
  expect(registration.unregister).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
  expect(getActiveRenderSession()).toBe('');
  expect(getState('foreground').tasks).toEqual([]);
  registration.changed.mockClear();
  const next = createMockCtx({ sessionId: 'replacement' });
  await emit('session_start', next);
  await tool.execute(
    'next',
    { action: 'create', subject: 'New work' },
    undefined,
    undefined,
    next,
  );
  expect(
    panel.registrations[1].provider.listRows(0).map((row) => row.primary),
  ).toEqual(['New work']);
  expect(registration.changed).not.toHaveBeenCalled();
});

it('never registers a provider or requests a host for headless sessions', async () => {
  const { tool, emit } = setup();
  const ctx = createMockCtx({ sessionId: 'headless', hasUI: false });
  await emit('session_start', ctx);
  await tool.execute(
    'headless',
    { action: 'create', subject: 'Headless work' },
    undefined,
    undefined,
    ctx,
  );
  await emit('session_shutdown', ctx);
  expect(panel.registrations).toEqual([]);
  expect(panel.ensure).not.toHaveBeenCalled();
  expect(getActiveRenderSession()).toBe('');
});

it('releases a late host installation after shutdown instead of retaining a stale session', async () => {
  let finish!: (release: () => void) => void;
  panel.ensure.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { emit } = setup();
  const start = emit('session_start');
  await emit('session_shutdown');
  const staleRelease = vi.fn();
  finish(staleRelease);
  await start;
  expect(staleRelease).toHaveBeenCalledTimes(1);
  expect(panel.registrations[0].unregister).toHaveBeenCalledTimes(1);
  expect(getActiveRenderSession()).toBe('');
  await emit('session_start', createMockCtx({ sessionId: 'replacement' }));
  expect(panel.registrations[1].provider.listRows(0)).toEqual([]);
});

it('still clears foreground ownership and unsubscribes when host disposal throws', async () => {
  const { current, tool, emit } = setup();
  await emit('session_start');
  await tool.execute(
    'root',
    { action: 'create', subject: 'Old work' },
    undefined,
    undefined,
    current,
  );
  panel.releases[0].mockImplementation(() => {
    throw new Error('stale UI proxy');
  });
  await expect(emit('session_shutdown')).rejects.toThrow('stale UI proxy');
  expect(panel.registrations[0].unregister).toHaveBeenCalledTimes(1);
  expect(getActiveRenderSession()).toBe('');
  expect(getState('foreground').tasks).toEqual([]);
});

it('hides a fully completed list after the next recognized prompt, keeping task state and reinjection untouched', async () => {
  const { current, tool, emit, captured } = setup();
  await emit('session_start');
  const { provider, changed } = panel.registrations[0];
  await tool.execute(
    'a',
    { action: 'create', subject: 'Only task' },
    undefined,
    undefined,
    current,
  );
  await tool.execute(
    'b',
    { action: 'update', id: 1, status: 'completed' },
    undefined,
    undefined,
    current,
  );
  expect(provider.listRows(0).map((row) => row.primary)).toEqual(['Only task']);

  // A prompt queued while streaming or typed elsewhere is not a recognized prompt.
  const ctx = current as never;
  const dispatch = async (name: string, event: unknown) => {
    for (const handler of captured.events.get(name) ?? [])
      await handler(event as never, ctx);
  };
  await dispatch('before_agent_start', {
    prompt: 'unobserved',
    systemPrompt: '',
  });
  expect(provider.listRows(0)).toHaveLength(1);

  changed.mockClear();
  await dispatch('input', { source: 'interactive', text: 'next job' });
  await dispatch('before_agent_start', {
    prompt: 'next job',
    systemPrompt: '',
  });
  expect(provider.listRows(0)).toEqual([]);
  expect(provider.visibleCount()).toBe(0);
  expect(getState('foreground').tasks).toMatchObject([
    { subject: 'Only task', status: 'completed' },
  ]);

  const notify = current.ui.notify as ReturnType<typeof vi.fn>;
  await captured.commands.get('todos')?.handler('', current);
  expect(notify).toHaveBeenLastCalledWith(
    expect.stringContaining('No todos'),
    'info',
  );

  // New work shows the list again; a later completion waits for its own prompt.
  await tool.execute(
    'c',
    { action: 'create', subject: 'Fresh task' },
    undefined,
    undefined,
    current,
  );
  expect(provider.listRows(0).map((row) => row.primary)).toEqual([
    'Only task',
    'Fresh task',
  ]);
});

it('leaves an open task list visible across prompts and unbinds the lifecycle on shutdown', async () => {
  const { current, tool, emit, captured } = setup();
  await emit('session_start');
  const { provider } = panel.registrations[0];
  await tool.execute(
    'a',
    { action: 'create', subject: 'Still open' },
    undefined,
    undefined,
    current,
  );
  for (const handler of captured.events.get('input') ?? [])
    await handler(
      { source: 'interactive', text: 'again' } as never,
      current as never,
    );
  for (const handler of captured.events.get('before_agent_start') ?? [])
    await handler(
      { prompt: 'again', systemPrompt: '' } as never,
      current as never,
    );
  expect(provider.listRows(0).map((row) => row.primary)).toEqual([
    'Still open',
  ]);
  expect(captured.events.get('input')).toHaveLength(1);
  await emit('session_shutdown');
  expect(captured.events.get('input')).toHaveLength(0);
});
