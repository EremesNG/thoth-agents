import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import registerTodo from '../index.js';
import {
  createMockCtx,
  createMockPi,
  createMockUI,
  makeTheme,
} from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it('renders only the foreground session with its own above-editor widget while preserving peer widgets, editor and footer', async () => {
  // Representative distinct keys from other editor/widget extensions. Existing
  // factories must survive registration, refresh, clearing, and shutdown.
  const subagents = () => ({ render: () => ['Subagents'] });
  const backgroundTasks = () => ({ render: () => ['Background tasks'] });
  const widgets = new Map<string, unknown>([
    ['peer-subagents', subagents],
    ['peer-background-tasks', backgroundTasks],
  ]);
  const ui = createMockUI({
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
    for (const handler of captured.events.get(type) ?? []) {
      await handler(
        { toolName: 'todo', isError: false } as never,
        ctx as never,
      );
    }
  }
  await emit('session_start');
  await tool.execute(
    'root',
    { action: 'create', subject: 'Current work' },
    undefined,
    undefined,
    current,
  );
  await emit('tool_execution_end');
  await emit('session_start', child);
  await tool.execute(
    'child',
    { action: 'create', subject: 'Other work' },
    undefined,
    undefined,
    child,
  );
  await emit('tool_execution_end', child);

  const factory = widgets.get('thoth-todos') as Exclude<
    Parameters<ExtensionUIContext['setWidget']>[1],
    string[] | undefined
  >;
  const widget = factory({ requestRender: vi.fn() } as never, makeTheme());
  const output = widget.render(100).join('\n');
  expect(output).toContain('Current work');
  expect(output).not.toContain('Other work');
  expect(ui.setWidget).toHaveBeenCalledWith(
    'thoth-todos',
    expect.any(Function),
    { placement: 'aboveEditor' },
  );
  expect(child.ui.setWidget).not.toHaveBeenCalled();

  await tool.execute(
    'clear',
    { action: 'clear' },
    undefined,
    undefined,
    current,
  );
  await emit('tool_execution_end');
  await emit('session_shutdown', child);
  await emit('session_shutdown');
  expect([...widgets.keys()]).toEqual([
    'peer-subagents',
    'peer-background-tasks',
  ]);
  expect(widgets.get('peer-subagents')).toBe(subagents);
  expect(widgets.get('peer-background-tasks')).toBe(backgroundTasks);
  expect(
    vi.mocked(ui.setWidget).mock.calls.every(([key]) => key === 'thoth-todos'),
  ).toBe(true);
  expect(ui.setEditorComponent).not.toHaveBeenCalled();
  expect(ui.setFooter).not.toHaveBeenCalled();
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
  for (const handler of captured.events.get('tool_execution_end') ?? [])
    await handler({ toolName: 'todo', isError: false } as never, ctx as never);
  expect(ui.setWidget).not.toHaveBeenCalled();
  expect(ui.setEditorComponent).not.toHaveBeenCalled();
  expect(ui.setFooter).not.toHaveBeenCalled();
});
