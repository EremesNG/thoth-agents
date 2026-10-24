import type { Theme } from '@earendil-works/pi-coding-agent';
import { subscribe, TODO_STATE_CHANNEL } from '@thoth-agents/pi-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockCtx, createMockPi, makeTheme } from './test/helpers.js';
import {
  __resetState,
  getNextId,
  getTodos,
  registerTodoTool,
  setActiveRenderSession,
  type TaskDetails,
  TOOL_NAME,
} from './todo.js';

const theme = makeTheme() as unknown as Theme;

function setup() {
  __resetState();
  setActiveRenderSession('test-session');
  const { pi, captured } = createMockPi();
  registerTodoTool(pi);
  const tool = captured.tools.get(TOOL_NAME);
  if (!tool) throw new Error('tool not registered');
  return { pi, tool, captured };
}

async function call(
  tool: ReturnType<typeof setup>['tool'],
  params: Record<string, unknown>,
) {
  return tool.execute?.(
    'tc',
    params as never,
    undefined as never,
    undefined as never,
    createMockCtx() as never,
  );
}

beforeEach(() => {
  __resetState();
});
afterEach(() => {
  __resetState();
});

describe('registerTodoTool — registration shape', () => {
  it("registers under the tool name 'todo' with the expected label and guidelines", () => {
    const { tool } = setup();
    expect(tool.name).toBe('todo');
    expect(tool.label).toBe('Todo');
    expect(tool.promptSnippet).toContain('task list');
    expect(Array.isArray(tool.promptGuidelines)).toBe(true);
    expect((tool.promptGuidelines as string[]).length).toBeGreaterThan(0);
  });

  it('puts proactive usage and status timing in the description for bridge consumers', () => {
    const { tool } = setup();
    expect(tool.description).toContain(
      'Use for 3+ steps, user task lists, delegated units or SDD phases; capture requirements immediately after new instructions.',
    );
    expect(tool.description).toContain(
      'Create items up front; mark in_progress BEFORE starting, complete immediately when done. Parallel in_progress allowed.',
    );
    expect(tool.description).toContain(
      'Skip trivial single tasks and conversation.',
    );
    for (const action of [
      'create',
      'update',
      'list',
      'get',
      'delete',
      'clear',
      'batch',
    ]) {
      expect(tool.description).toContain(action);
    }
    expect(tool.description).toContain('pending → in_progress → completed');
    const guidance = [
      tool.description,
      tool.promptSnippet,
      ...(tool.promptGuidelines ?? []),
      JSON.stringify(tool.parameters),
    ].join(' ');
    expect(guidance).toContain('refs');
    expect(guidance).toContain('50');
    expect(guidance).not.toMatch(/exactly one|never batch completions/);
    expect(guidance).toContain('"action":"batch"');
  });

  it('exposes a typebox parameters schema declaring the seven actions', () => {
    const { tool } = setup();
    const raw = JSON.stringify(tool.parameters);
    for (const action of [
      'create',
      'update',
      'list',
      'get',
      'delete',
      'clear',
      'batch',
    ]) {
      expect(raw).toContain(action);
    }
  });
});

describe('registerTodoTool — execute mutates module state', () => {
  it('create → list returns the seeded row', async () => {
    const { tool } = setup();
    const r1 = await call(tool, { action: 'create', subject: 'first' });
    expect((r1.details as TaskDetails).action).toBe('create');
    const r2 = await call(tool, { action: 'list' });
    expect(r2?.content[0]).toMatchObject({
      text: expect.stringContaining('first'),
    });
  });

  it('clear resets module state and nextId', async () => {
    const { tool } = setup();
    await call(tool, { action: 'create', subject: 'a' });
    await call(tool, { action: 'create', subject: 'b' });
    const r = await call(tool, { action: 'clear' });
    const d = r?.details as TaskDetails;
    expect(d.tasks).toEqual([]);
    expect(d.nextId).toBe(1);
  });
});

describe('registerTodoTool — execute persists state changes', () => {
  it('publishes the committed snapshot even when appendEntry throws, then rejects with that error', async () => {
    const { pi, tool } = setup();
    const error = new Error('Session persistence failed');
    vi.spyOn(pi, 'appendEntry').mockImplementation(() => {
      throw error;
    });
    const onSnapshot = vi.fn();
    subscribe(pi.events, TODO_STATE_CHANNEL, { onSnapshot });

    await expect(
      call(tool, { action: 'create', subject: 'Committed' }),
    ).rejects.toBe(error);

    expect(getTodos('test-session')).toEqual([
      { id: 1, subject: 'Committed', status: 'pending' },
    ]);
    expect(getNextId('test-session')).toBe(2);
    expect(onSnapshot).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        sessionId: 'test-session',
        source: '@thoth-agents/pi-todo',
        data: {
          tasks: [
            { id: 1, subject: 'Committed', status: 'pending', blockedBy: [] },
          ],
          nextId: 2,
          counts: { pending: 1, in_progress: 0, completed: 0, deleted: 0 },
        },
      }),
    );
  });

  it('commits before appending, then publishes before returning', async () => {
    const { pi, tool, captured } = setup();
    const order: string[] = [];
    const appendEntry = pi.appendEntry;
    vi.spyOn(pi, 'appendEntry').mockImplementation((customType, data) => {
      expect(getTodos('test-session')).toEqual([
        { id: 1, subject: 'Ordered', status: 'pending' },
      ]);
      order.push('append');
      appendEntry(customType, data);
    });
    subscribe(pi.events, TODO_STATE_CHANNEL, {
      onSnapshot: () => {
        order.push('publish');
      },
    });

    const result = await call(tool, { action: 'create', subject: 'Ordered' });
    order.push('return');

    expect(order).toEqual(['append', 'publish', 'return']);
    expect(captured.entries).toEqual([
      { customType: 'rpiv-todo-state', data: result.details },
    ]);
  });

  it('appends exactly one full details snapshot per create / update / delete / clear', async () => {
    const { tool, captured } = setup();
    const results = [
      await call(tool, { action: 'create', subject: 'a' }),
      await call(tool, { action: 'update', id: 1, status: 'in_progress' }),
      await call(tool, { action: 'delete', id: 1 }),
      await call(tool, { action: 'clear' }),
    ];
    expect(captured.entries).toEqual(
      results.map((result) => ({
        customType: 'rpiv-todo-state',
        data: result.details,
      })),
    );
    expect(captured.entries.at(-1)?.data).toMatchObject({
      tasks: [],
      nextId: 1,
    });
  });

  it('appends nothing for reads, errors, unchanged updates or rolled-back batches', async () => {
    const { tool, captured } = setup();
    await call(tool, { action: 'create', subject: 'a' });
    captured.entries.length = 0;
    await call(tool, { action: 'list' });
    await call(tool, { action: 'get', id: 1 });
    await call(tool, { action: 'update', id: 99, status: 'completed' });
    await call(tool, { action: 'create', subject: '' });
    await call(tool, { action: 'delete', id: 99 });
    await call(tool, { action: 'update', id: 1, status: 'pending' });
    await call(tool, { action: 'update', id: 1, subject: 'a' });
    const rolledBack = await call(tool, {
      action: 'batch',
      ops: [
        { action: 'create', subject: 'Must not persist', ref: 'new' },
        { action: 'update', id: 'missing', subject: 'Rejected' },
      ],
    });
    expect(rolledBack.details).toMatchObject({
      error: expect.stringContaining('op[1]'),
      tasks: [{ id: 1, subject: 'a', status: 'pending' }],
      nextId: 2,
    });
    expect(captured.entries).toEqual([]);
  });

  it('appends one full snapshot for every successful batch, even an unchanged batch', async () => {
    const { tool, captured } = setup();
    const created = await call(tool, {
      action: 'batch',
      ops: [{ action: 'create', subject: 'a', ref: 'a' }],
    });
    const unchanged = await call(tool, {
      action: 'batch',
      ops: [{ action: 'update', id: 1, subject: 'a' }],
    });
    expect(captured.entries).toEqual([
      { customType: 'rpiv-todo-state', data: created.details },
      { customType: 'rpiv-todo-state', data: unchanged.details },
    ]);
  });
});

describe('registerTodoTool — renderCall', () => {
  it('create action emits the action word and includes the subject', () => {
    const { tool } = setup();
    const node = tool.renderCall?.(
      { action: 'create', subject: 'hello' } as never,
      theme,
      undefined as never,
    );
    const text = node?.render(120).join(' ');
    expect(text).toContain('todo ');
    expect(text).toContain('create');
    expect(text).toContain('hello');
  });

  it('update action renders the id even when seeded (subject comes from the result)', async () => {
    const { tool } = setup();
    await call(tool, { action: 'create', subject: 'seeded-subject' });
    const node = tool.renderCall?.(
      { action: 'update', id: 1 } as never,
      theme,
      undefined as never,
    );
    const text = node?.render(120).join(' ');
    expect(text).toContain('update #1');
    expect(text).not.toContain('seeded-subject');
  });

  it('list action with a status filter renders the status glyph', () => {
    const { tool } = setup();
    const node = tool.renderCall?.(
      { action: 'list', status: 'in_progress' } as never,
      theme,
      undefined as never,
    );
    expect(node?.render(120).join(' ')).toContain('list ◐');
  });

  it('clear action renders only the action word', () => {
    const { tool } = setup();
    const node = tool.renderCall?.(
      { action: 'clear' } as never,
      theme,
      undefined as never,
    );
    expect(node?.render(120).join(' ')).toMatch(/clear\s*$/);
  });
});

describe('registerTodoTool — renderResult', () => {
  async function summary(params: Record<string, unknown>, seed = true) {
    const { tool } = setup();
    if (seed) {
      await call(tool, { action: 'create', subject: 'a' });
      await call(tool, { action: 'create', subject: 'b' });
    }
    const r = await call(tool, params);
    const node = tool.renderResult?.(
      r as never,
      {} as never,
      theme,
      undefined as never,
    );
    return node?.render(120).join('\n') ?? '';
  }

  it('create renders id, status glyph and subject', async () => {
    expect(await summary({ action: 'create', subject: 'c' })).toContain(
      'create #3 ○ c',
    );
  });

  it('update renders the old → new status and the resolved subject', async () => {
    const text = await summary({
      action: 'update',
      id: 1,
      status: 'in_progress',
    });
    expect(text).toContain('update #1 ○ → ◐ a');
  });

  it('delete renders id and subject', async () => {
    expect(await summary({ action: 'delete', id: 2 })).toContain('delete #2 b');
  });

  it('list renders status counts, hint on collapse', async () => {
    const text = await summary({ action: 'list' });
    expect(text).toContain('list · ○ 2');
    expect(text).toContain('ctrl+o to expand');
  });

  it('get renders id, glyph and subject', async () => {
    expect(await summary({ action: 'get', id: 1 })).toContain('get #1 ○ a');
  });

  it('clear renders the removed count', async () => {
    expect(await summary({ action: 'clear' })).toContain('clear · 2 removed');
  });

  it("missing details falls back to plain '✓'", () => {
    const { tool } = setup();
    const node = tool.renderResult?.(
      { content: [], details: undefined } as never,
      {} as never,
      theme,
      undefined as never,
    );
    expect(node?.render(120).join(' ')).toContain('✓');
  });
});

describe('batch rendering', () => {
  it('renders batch op count and expands per-op outcomes under summary counts', async () => {
    const { tool } = setup();
    const args = {
      action: 'batch',
      ops: [
        {
          action: 'create',
          subject: 'Root',
          ref: 'root',
          status: 'in_progress',
        },
        { action: 'create', subject: 'Child', blockedBy: ['root'] },
        { action: 'update', id: 'root', subject: 'Updated root' },
        { action: 'delete', id: 2 },
      ],
    };
    expect(
      tool
        .renderCall?.(args as never, theme, undefined as never)
        ?.render(160)
        .join(' '),
    ).toContain('batch · 4 ops');
    const result = await call(tool, args);
    const collapsed = tool
      .renderResult?.(result as never, {} as never, theme, undefined as never)
      ?.render(160)
      .join('\n');
    expect(collapsed).toContain('batch · 2 created, 1 updated, 1 deleted');
    expect(collapsed).toContain('ctrl+o to expand');
    expect(collapsed).not.toContain('op[0]');
    const expanded = tool
      .renderResult?.(
        result as never,
        { expanded: true } as never,
        theme,
        undefined as never,
      )
      ?.render(160)
      .join('\n');
    expect(expanded).toContain('op[0] create #1 (ref: root)');
    expect(expanded).toContain('op[2] update #1');
    expect(expanded).toContain('op[3] delete #2');
  });
});
