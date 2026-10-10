import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRenderKit } from '../pi-thoth-theme/src/render-kit/index.ts';
import { createMockCtx, createMockPi, makeTheme } from './test/helpers.js';
import {
  __resetState,
  registerTodoTool,
  setActiveRenderSession,
} from './todo.js';

type RenderContext = Parameters<NonNullable<ToolDefinition['renderCall']>>[2];

let token: ReturnType<typeof registerRenderKit> | undefined;
beforeEach(() => {
  __resetState();
  token = registerRenderKit(createTestRenderKit(), {});
});
afterEach(() => {
  if (token) withdrawRenderKit(token);
  token = undefined;
  __resetState();
});

function setup() {
  setActiveRenderSession('test-session');
  const { pi, captured } = createMockPi();
  registerTodoTool(pi);
  const tool = captured.tools.get('todo');
  if (!tool?.renderCall || !tool.renderResult) throw new Error('no renderers');
  const ctx = createMockCtx();
  const run = (params: Record<string, unknown>) =>
    tool.execute('tc', params as never, undefined, undefined, ctx);
  return { tool, run };
}

function context(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    args: {},
    toolCallId: 'tc',
    state: {},
    cwd: '.',
    invalidate() {},
    lastComponent: undefined,
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    isError: false,
    expanded: false,
    showImages: false,
    ...overrides,
  } as RenderContext;
}

async function seeded() {
  const s = setup();
  await s.run({ action: 'create', subject: 'first' });
  await s.run({ action: 'create', subject: 'second' });
  await s.run({ action: 'create', subject: 'third' });
  await s.run({ action: 'update', id: 2, status: 'in_progress' });
  await s.run({ action: 'update', id: 3, status: 'completed' });
  return s;
}

function rows(
  tool: ReturnType<typeof setup>['tool'],
  result: unknown,
  { expanded = false, width = 80, ctx = context({ expanded }) } = {},
): string[] {
  return tool
    .renderResult?.(
      result as never,
      { expanded, isPartial: false },
      makeTheme(),
      ctx,
    )
    .render(width)
    .map((row) => row.trimEnd()) as string[];
}

describe('todo result summary — collapsed', () => {
  it('create shows id, status glyph and subject', async () => {
    const { tool, run } = setup();
    const r = await run({ action: 'create', subject: 'Revisar render' });
    expect(rows(tool, r)).toEqual(['create #1 ○ Revisar render', '╰─ ✓']);
  });

  it('update shows old → new status when it changed', async () => {
    const { tool, run } = await seeded();
    const r = await run({ action: 'update', id: 1, status: 'in_progress' });
    expect(rows(tool, r)[0]).toBe('update #1 ○ → ◐ first');
    const done = await run({ action: 'update', id: 1, status: 'completed' });
    expect(rows(tool, done)[0]).toBe('update #1 ◐ → ✓ first');
  });

  it('update lists changed fields when status did not change', async () => {
    const { tool, run } = await seeded();
    const r = await run({
      action: 'update',
      id: 1,
      owner: 'me',
      addBlockedBy: [2],
    });
    expect(rows(tool, r)[0]).toBe('update #1 first · owner, blockedBy');
  });

  it('update reports a no-op', async () => {
    const { tool, run } = await seeded();
    const r = await run({ action: 'update', id: 2, status: 'in_progress' });
    expect(rows(tool, r)[0]).toBe('update #2 second · no change');
  });

  it('get and delete resolve the subject from the result snapshot', async () => {
    const { tool, run } = await seeded();
    expect(rows(tool, await run({ action: 'get', id: 2 }))[0]).toBe(
      'get #2 ◐ second',
    );
    expect(rows(tool, await run({ action: 'delete', id: 2 }))[0]).toBe(
      'delete #2 second',
    );
  });

  it('list shows status counts with zero counts omitted and an expand hint', async () => {
    const { tool, run } = await seeded();
    expect(rows(tool, await run({ action: 'list' }))).toEqual([
      'list · ○ 1  ◐ 1  ✓ 1',
      '… 3 more lines · ctrl+o to expand',
      '╰─ ✓',
    ]);
    await run({ action: 'update', id: 1, status: 'completed' });
    expect(rows(tool, await run({ action: 'list' }))[0]).toBe(
      'list · ◐ 1  ✓ 2',
    );
  });

  it('list with a status filter shows glyph and count', async () => {
    const { tool, run } = await seeded();
    expect(
      rows(tool, await run({ action: 'list', status: 'in_progress' }))[0],
    ).toBe('list ◐ · 1');
  });

  it('empty list has no hint', async () => {
    const { tool, run } = setup();
    expect(rows(tool, await run({ action: 'list' }))).toEqual([
      'list · no tasks',
      '╰─ ✓',
    ]);
  });

  it('clear shows the removed count', async () => {
    const { tool, run } = await seeded();
    expect(rows(tool, await run({ action: 'clear' }))).toEqual([
      'clear · 3 removed',
      '╰─ ✓',
    ]);
  });

  it('errors keep the failed footer and a single message line', async () => {
    const { tool, run } = await seeded();
    const r = await run({ action: 'update', id: 99, status: 'completed' });
    const out = rows(tool, r, { ctx: context({ isError: true }) });
    expect(out).toHaveLength(2);
    expect(out[0]).toBe('#99 not found');
    expect(out[1]).toBe('╰─ ✗');
  });

  it('error details without an SDK error flag still render the message', async () => {
    const { tool } = setup();
    const out = rows(tool, {
      content: [{ type: 'text', text: 'Error: nope' }],
      details: {
        action: 'get',
        params: { id: 1 },
        tasks: [],
        nextId: 1,
        error: 'nope',
      },
    });
    expect(out[0]).toBe('nope');
  });
});

describe('todo result summary — expanded', () => {
  it('list shows one row per non-deleted task and no hint', async () => {
    const { tool, run } = await seeded();
    await run({ action: 'delete', id: 1 });
    expect(
      rows(tool, await run({ action: 'list' }), { expanded: true }),
    ).toEqual(['list · ◐ 1  ✓ 1', '◐ #2 second', '✓ #3 third', '╰─ ✓']);
  });

  it('list includes deleted tasks only with includeDeleted', async () => {
    const { tool, run } = await seeded();
    await run({ action: 'delete', id: 1 });
    expect(
      rows(tool, await run({ action: 'list', includeDeleted: true }), {
        expanded: true,
      }),
    ).toEqual([
      'list · ◐ 1  ✓ 1  ⊘ 1',
      '⊘ #1 first',
      '◐ #2 second',
      '✓ #3 third',
      '╰─ ✓',
    ]);
  });

  it('filtered list expands to the matching tasks', async () => {
    const { tool, run } = await seeded();
    expect(
      rows(tool, await run({ action: 'list', status: 'completed' }), {
        expanded: true,
      }),
    ).toEqual(['list ✓ · 1', '✓ #3 third', '╰─ ✓']);
  });

  it('single-row actions are unchanged when expanded', async () => {
    const { tool, run } = await seeded();
    const r = await run({ action: 'clear' });
    expect(rows(tool, r, { expanded: true })).toEqual([
      'clear · 3 removed',
      '╰─ ✓',
    ]);
  });

  it('truncates long subjects with an ellipsis at narrow widths', async () => {
    const { tool, run } = setup();
    await run({ action: 'create', subject: 'x'.repeat(60) });
    const r = await run({ action: 'list' });
    const out = rows(tool, r, { expanded: true, width: 24 });
    const row = stripTerminalSequences(out[1]);
    expect(row).toBe(`○ #1 ${'x'.repeat(14)}…`);
    expect(row).toHaveLength(20);
  });
});

describe('todo call phase', () => {
  const callRows = (
    tool: ReturnType<typeof setup>['tool'],
    args: Record<string, unknown>,
    ctx = context({ isPartial: true }),
  ) =>
    tool
      .renderCall?.(args as never, makeTheme(), ctx)
      .render(80)
      .map((row) => row.trimEnd()) as string[];

  it.each([
    [{ action: 'create', subject: 'Revisar' }, 'create Revisar'],
    [{ action: 'update', id: 4 }, 'update #4'],
    [{ action: 'get', id: 4 }, 'get #4'],
    [{ action: 'delete', id: 4 }, 'delete #4'],
    [{ action: 'list' }, 'list'],
    [{ action: 'list', status: 'in_progress' }, 'list ◐'],
    [{ action: 'clear' }, 'clear'],
  ])('%j → %s', async (args, expected) => {
    const { tool, run } = await seeded();
    expect(callRows(tool, args)).toEqual(['╭─ todo', expected, '╰─ running']);
    expect(run).toBeDefined();
  });

  it('does not resolve subjects from foreground state', async () => {
    const { tool } = await seeded();
    expect(callRows(tool, { action: 'get', id: 2 })[1]).toBe('get #2');
  });

  it('keeps only the title once the result slot is mounted', async () => {
    const { tool, run } = await seeded();
    const ctx = context();
    const call = tool.renderCall?.(
      { action: 'get', id: 2 } as never,
      makeTheme(),
      ctx,
    );
    const r = await run({ action: 'get', id: 2 });
    tool.renderResult?.(
      r as never,
      { expanded: false, isPartial: false },
      makeTheme(),
      ctx,
    );
    expect(call?.render(80).map((row) => row.trimEnd())).toEqual(['╭─ todo']);
  });
});

describe('todo glyph modes', () => {
  it.each([
    ['unicode', ['○', '◐', '✓']],
    ['nerd', null],
    ['ascii', null],
  ] as const)('respects %s glyphs in the list summary', async (mode, expected) => {
    if (token) withdrawRenderKit(token);
    token = registerRenderKit(createRenderKit({}, undefined, mode), {});
    const { tool, run } = await seeded();
    const r = await run({ action: 'list' });
    const out = tool
      .renderResult?.(
        r as never,
        { expanded: false, isPartial: false },
        makeTheme(),
        context(),
      )
      .render(80)
      .join('\n') as string;
    if (expected) {
      for (const glyph of expected) expect(out).toContain(glyph);
    } else {
      expect(out).toContain('list');
      // The theme kit supplies mode-specific status glyphs, not the unicode defaults.
      if (mode === 'ascii') {
        for (const glyph of ['○', '◐', '✓']) expect(out).not.toContain(glyph);
      }
    }
  });
});
