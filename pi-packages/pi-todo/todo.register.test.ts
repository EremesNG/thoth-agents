import type { Theme } from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockCtx, createMockPi, makeTheme } from './test/helpers.js';
import {
  __resetState,
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
  return { tool, captured };
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

  it('exposes a typebox parameters schema declaring the six actions', () => {
    const { tool } = setup();
    const raw = JSON.stringify(tool.parameters);
    for (const action of [
      'create',
      'update',
      'list',
      'get',
      'delete',
      'clear',
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
