import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderKit } from '../pi-thoth-theme/src/render-kit/index.ts';
import type { ToolDensity } from '../pi-thoth-theme/src/shared/config.ts';
import { createMockCtx, createMockPi, makeTheme } from './test/helpers.js';
import { registerTodoTool, setActiveRenderSession } from './todo.js';

type RenderContext = Parameters<NonNullable<ToolDefinition['renderCall']>>[2];
type Mode = 'nerd' | 'unicode' | 'ascii';

let token: ReturnType<typeof registerRenderKit> | undefined;
afterEach(() => {
  if (token) withdrawRenderKit(token);
  token = undefined;
  vi.restoreAllMocks();
});

const LONG = 'a very long subject that cannot possibly fit in the row';
const create = { action: 'create', subject: LONG };
const list = { action: 'list' };
const batch = {
  action: 'batch',
  ops: [
    { action: 'create', subject: 'a' },
    { action: 'create', subject: 'b' },
  ],
};
const getMissing = { action: 'get', id: 99 };

interface Case {
  name: string;
  args: Record<string, unknown>;
  setup: Record<string, unknown>[];
  primary: string;
  /** Collapsed `compact` success row count; `line` is always one row. */
  compactRows: number;
}
const CASES: Case[] = [
  {
    name: 'create',
    args: create,
    setup: [],
    primary: 'create',
    compactRows: 1,
  },
  {
    name: 'list',
    args: list,
    setup: [create],
    primary: 'list',
    compactRows: 2,
  },
  { name: 'batch', args: batch, setup: [], primary: 'batch', compactRows: 2 },
];

function ctx(
  args: Record<string, unknown>,
  overrides: Partial<RenderContext> = {},
): RenderContext {
  return {
    keyText: () => 'ctrl+o',
    args,
    toolCallId: 'tc',
    state: { completedElapsedMs: 2000 },
    cwd: '.',
    invalidate() {},
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    isError: false,
    expanded: false,
    showImages: false,
    ...overrides,
  } as RenderContext;
}

function setup(density: ToolDensity, mode: Mode) {
  token = registerRenderKit(createRenderKit({}, undefined, mode, density), {});
  setActiveRenderSession('matrix-session');
  const { pi, captured } = createMockPi();
  registerTodoTool(pi);
  const tool = captured.tools.get('todo');
  if (!tool?.renderCall || !tool.renderResult) throw new Error('no renderers');
  return { tool, renderCall: tool.renderCall, renderResult: tool.renderResult };
}

const plain = (rows: string[]) =>
  rows.map((r) => stripTerminalSequences(r).trimEnd());

/** Exactly one leading glyph: the second token is the title, not a glyph. */
function expectOneGlyph(row: string) {
  const [glyph, title] = row.split(' ');
  expect(glyph).toBeTruthy();
  expect(title).toBe('todo');
}

async function collapsed(
  density: ToolDensity,
  mode: Mode,
  c: { args: Record<string, unknown>; setup: Record<string, unknown>[] },
  state: 'running' | 'partial' | 'success' | 'error',
  width: number,
) {
  const { tool, renderCall, renderResult } = setup(density, mode);
  const mock = createMockCtx();
  for (const task of c.setup)
    await tool.execute('s', task as never, undefined, undefined, mock);
  if (state === 'running') {
    const context = ctx(c.args, { isPartial: true, state: {} });
    return plain(
      renderCall(c.args as never, makeTheme(), context).render(width),
    );
  }
  const result = await tool.execute(
    'tc',
    c.args as never,
    undefined,
    undefined,
    mock,
  );
  const isPartial = state === 'partial';
  const context = ctx(c.args, {
    isPartial,
    isError: state === 'error',
    state: isPartial ? {} : { completedElapsedMs: 2000 },
  });
  const call = renderCall(c.args as never, makeTheme(), context);
  const out = renderResult(
    result,
    { expanded: false, isPartial },
    makeTheme(),
    context,
  );
  return plain([...call.render(width), ...out.render(width)]);
}

const MODES: Mode[] = ['nerd', 'unicode', 'ascii'];
const DENSITIES: ToolDensity[] = ['line', 'compact'];

describe.each(MODES)('todo compact matrix (%s icons)', (mode) => {
  describe.each(DENSITIES)('%s', (density) => {
    describe.each(CASES)('$name', (c) => {
      it.each([
        80, 42,
      ])('running: one row with primary summary @%i', async (w) => {
        const out = await collapsed(density, mode, c, 'running', w);
        expect(out).toHaveLength(1);
        expectOneGlyph(out[0]);
        expect(out[0]).toContain(c.primary);
        expect(out[0]).toMatch(/\b\d+s\b/);
      });

      it.each([
        80, 42,
      ])('partial result: one row with primary summary @%i', async (w) => {
        const out = await collapsed(density, mode, c, 'partial', w);
        expect(out).toHaveLength(1);
        expectOneGlyph(out[0]);
        expect(out[0]).toContain(c.primary);
        expect(out[0]).toMatch(/\b\d+s\b/);
      });

      it.each([
        80, 42,
      ])('success: CRC rows with primary summary @%i', async (w) => {
        const out = await collapsed(density, mode, c, 'success', w);
        expect(out).toHaveLength(density === 'line' ? 1 : c.compactRows);
        expectOneGlyph(out[0]);
        expect(out[0]).toContain(c.primary);
        expect(out[0]).toMatch(/\b\d+s\b/);
        expect(out.join(' ')).toContain('ctrl+o');
        if (w === 42 && c.name === 'create') expect(out[0]).toMatch(/…|\.\.\./);
      });
    });

    it('get error: two rows, row 2 is the first error line', async () => {
      const c = { args: getMissing, setup: [] };
      const out = await collapsed(density, mode, c, 'error', 80);
      expect(out).toHaveLength(2);
      expectOneGlyph(out[0]);
      expect(out[1]).toMatch(/^ {2}\S+ .*#?99|not found/i);
    });
  });
});
