import { afterEach, beforeEach, describe, expect, it, type vi } from 'vitest';
import registerTodo from './index.js';
import { EMPTY_STATE } from './state/state.js';
import { getRenderState, getState } from './state/store.js';
import { createMockCtx, createMockPi } from './test/helpers.js';
import { __resetState } from './todo.js';

// Capture the extension's registered handlers + tool + command. Each registerTodo()
// call builds a fresh extension lifecycle, so isolation
// between tests is automatic given __resetState() clears the store.
function setup() {
  __resetState();
  const { pi, captured } = createMockPi();
  registerTodo(pi);
  const sessionStart = captured.events.get('session_start')?.[0];
  const sessionShutdown = captured.events.get('session_shutdown')?.[0];
  const tool = captured.tools.get('todo');
  const cmd = captured.commands.get('todos');
  if (!sessionStart) throw new Error('session_start handler not registered');
  if (!sessionShutdown)
    throw new Error('session_shutdown handler not registered');
  if (!tool) throw new Error('todo tool not registered');
  if (!cmd) throw new Error('todos command not registered');
  return { sessionStart, sessionShutdown, tool, cmd };
}

beforeEach(() => __resetState());
afterEach(() => __resetState());

describe('rpiv-todo — per-session todo store isolation (Phase 1 baseline)', () => {
  it("a child session_start (empty branch) leaves the parent's committed task intact", async () => {
    const { sessionStart, tool } = setup();
    const parent = createMockCtx({ sessionId: 'parent', hasUI: true });
    const child = createMockCtx({ sessionId: 'child', hasUI: true });

    // Parent comes online (empty branch → EMPTY_STATE in the parent slot) and
    // creates a task.
    await sessionStart({} as never, parent as never);
    await tool.execute?.(
      'tc',
      { action: 'create', subject: 'parent-task' } as never,
      undefined as never,
      undefined as never,
      parent as never,
    );
    expect(getState('parent').tasks.map((t) => t.subject)).toEqual([
      'parent-task',
    ]);

    // A child session starts (empty branch). Its replay writes the CHILD slot
    // only — the parent slot is untouched.
    await sessionStart({} as never, child as never);
    expect(getState('parent').tasks.map((t) => t.subject)).toEqual([
      'parent-task',
    ]);
    expect(getState('child').tasks).toEqual([]);
  });

  it("a child todo call mutates only the child's slot; the parent's /todos still shows only the parent's task", async () => {
    const { sessionStart, tool, cmd } = setup();
    const parent = createMockCtx({ sessionId: 'parent', hasUI: true });
    const child = createMockCtx({ sessionId: 'child', hasUI: true });

    await sessionStart({} as never, parent as never);
    await tool.execute?.(
      'tc',
      { action: 'create', subject: 'parent-task' } as never,
      undefined as never,
      undefined as never,
      parent as never,
    );
    await sessionStart({} as never, child as never);

    // Child creates its own task → lands in the CHILD slot only.
    await tool.execute?.(
      'tc',
      { action: 'create', subject: 'child-task' } as never,
      undefined as never,
      undefined as never,
      child as never,
    );
    expect(getState('child').tasks.map((t) => t.subject)).toEqual([
      'child-task',
    ]);
    expect(getState('parent').tasks.map((t) => t.subject)).toEqual([
      'parent-task',
    ]);

    // Parent's /todos reads the parent slot — shows only the parent's task.
    await cmd.handler('', parent as never);
    const parentNotify = parent.ui.notify as ReturnType<typeof vi.fn>;
    expect(parentNotify).toHaveBeenCalledTimes(1);
    expect(parentNotify.mock.calls[0][1]).toBe('info');
    expect(parentNotify.mock.calls[0][0]).toContain('parent-task');
    expect(parentNotify.mock.calls[0][0]).not.toContain('child-task');

    // Child's /todos reads the child slot — shows only the child's task.
    await cmd.handler('', child as never);
    const childNotify = child.ui.notify as ReturnType<typeof vi.fn>;
    expect(childNotify.mock.calls[0][0]).toContain('child-task');
    expect(childNotify.mock.calls[0][0]).not.toContain('parent-task');
  });

  it('the render pointer stays on the parent slot even after a child creates tasks (creator-ownership)', async () => {
    const { sessionStart, tool } = setup();
    const parent = createMockCtx({ sessionId: 'parent', hasUI: true });
    const child = createMockCtx({ sessionId: 'child', hasUI: true });

    await sessionStart({} as never, parent as never);
    await tool.execute?.(
      'tc',
      { action: 'create', subject: 'parent-task' } as never,
      undefined as never,
      undefined as never,
      parent as never,
    );

    // Child comes online and creates a task in its own slot.
    await sessionStart({} as never, child as never);
    await tool.execute?.(
      'tc',
      { action: 'create', subject: 'child-task' } as never,
      undefined as never,
      undefined as never,
      child as never,
    );

    // Creator-ownership: the render slot is still the parent's. The first UI
    // session claims the pointer before work-panel installation, and a child cannot
    // re-set it.
    expect(getRenderState().tasks.map((t) => t.subject)).toEqual([
      'parent-task',
    ]);
    // Sanity: the child's task DID land in its own slot.
    expect(getState('child').tasks.map((t) => t.subject)).toEqual([
      'child-task',
    ]);
  });

  it("session_shutdown evicts the shutting-down session's own slot (fresh EMPTY_STATE copy)", async () => {
    const { sessionStart, sessionShutdown, tool } = setup();
    const parent = createMockCtx({ sessionId: 'parent', hasUI: true });

    await sessionStart({} as never, parent as never);
    await tool.execute?.(
      'tc',
      { action: 'create', subject: 'parent-task' } as never,
      undefined as never,
      undefined as never,
      parent as never,
    );
    expect(getState('parent').tasks).toHaveLength(1);

    await sessionShutdown({} as never, parent as never);

    // Slot evicted; a subsequent read returns a fresh EMPTY_STATE copy.
    const after = getState('parent');
    expect(after.tasks).toEqual([]);
    expect(after.nextId).toBe(1);
    expect(after.tasks).not.toBe(EMPTY_STATE.tasks);
  });
});
