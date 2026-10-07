import { afterEach, expect, it, vi } from 'vitest';
import registerTodo from '../index.js';
import { createMockCtx, createMockPi, createMockUI } from './helpers.js';
import { panel } from './work-panel-fixture.js';

vi.mock('@thoth-agents/pi-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@thoth-agents/pi-core')>();
  const { panel } = await import('./work-panel-fixture.js');
  return {
    ...actual,
    registerWorkPanelProvider: panel.register,
    ensureWorkPanel: panel.ensure,
  };
});

afterEach(() => panel.reset());

it('owns no widget or editor replacement and preserves peer surfaces through changes and shutdown', async () => {
  const subagents = () => ({ render: () => ['Subagents'] });
  const backgroundTasks = () => ({ render: () => ['Background tasks'] });
  const widgets = new Map<string, unknown>([
    ['peer-subagents', subagents],
    ['peer-background-tasks', backgroundTasks],
  ]);
  const onTerminalInput = vi.fn(() => vi.fn());
  const ui = createMockUI({
    onTerminalInput,
    setWidget: vi.fn((key, content) => {
      if (content === undefined) widgets.delete(key);
      else widgets.set(key, content);
    }),
  });
  const current = createMockCtx({ sessionId: 'current', ui });
  const child = createMockCtx({ sessionId: 'other', hasUI: true });
  const { pi, captured } = createMockPi();
  registerTodo(pi);
  const tool = captured.tools.get('todo');
  if (!tool) throw new Error('todo not registered');
  async function emit(type: string, ctx = current) {
    for (const handler of captured.events.get(type) ?? [])
      await handler({} as never, ctx as never);
  }
  await emit('session_start');
  await tool.execute(
    'root',
    { action: 'create', subject: 'Current work' },
    undefined,
    undefined,
    current,
  );
  await emit('session_start', child);
  await tool.execute(
    'child',
    { action: 'create', subject: 'Other work' },
    undefined,
    undefined,
    child,
  );

  const provider = panel.registrations[0].provider;
  expect(provider.listRows(0).map((row) => row.primary)).toEqual([
    'Current work',
  ]);
  expect(panel.ensure).toHaveBeenCalledTimes(1);
  expect(panel.ensure).toHaveBeenCalledWith(current);
  await tool.execute(
    'clear',
    { action: 'clear' },
    undefined,
    undefined,
    current,
  );
  expect(provider.listRows(0)).toEqual([]);
  await emit('session_shutdown', child);
  await emit('session_shutdown');

  expect([...widgets.keys()]).toEqual([
    'peer-subagents',
    'peer-background-tasks',
  ]);
  expect(widgets.get('peer-subagents')).toBe(subagents);
  expect(widgets.get('peer-background-tasks')).toBe(backgroundTasks);
  for (const ctx of [current, child]) {
    expect(ctx.ui.setWidget).not.toHaveBeenCalled();
    expect(ctx.ui.setEditorComponent).not.toHaveBeenCalled();
    expect(ctx.ui.setFooter).not.toHaveBeenCalled();
  }
  expect(onTerminalInput).not.toHaveBeenCalled();
  expect(captured.shortcuts.size).toBe(0);
});

it('does not install or decorate any UI surface in a headless session', async () => {
  const { pi, captured } = createMockPi();
  registerTodo(pi);
  const ui = createMockUI();
  const ctx = createMockCtx({ hasUI: false, ui });
  for (const handler of captured.events.get('session_start') ?? [])
    await handler({} as never, ctx as never);
  const tool = captured.tools.get('todo');
  if (!tool) throw new Error('todo not registered');
  await tool.execute(
    'headless',
    { action: 'create', subject: 'Headless work' },
    undefined,
    undefined,
    ctx,
  );
  expect(panel.register).not.toHaveBeenCalled();
  expect(panel.ensure).not.toHaveBeenCalled();
  expect(ui.setWidget).not.toHaveBeenCalled();
  expect(ui.setEditorComponent).not.toHaveBeenCalled();
  expect(ui.setFooter).not.toHaveBeenCalled();
});
