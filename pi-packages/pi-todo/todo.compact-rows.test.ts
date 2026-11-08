import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { afterEach, expect, it, vi } from 'vitest';
import { createRenderKit } from '../pi-thoth-theme/src/render-kit/index.ts';
import type { ToolDensity } from '../pi-thoth-theme/src/shared/config.ts';
import { createMockCtx, createMockPi, makeTheme } from './test/helpers.js';
import { registerTodoTool, setActiveRenderSession } from './todo.js';

let token: ReturnType<typeof registerRenderKit> | undefined;
afterEach(() => {
  if (token) withdrawRenderKit(token);
  token = undefined;
  vi.restoreAllMocks();
});

type RenderContext = Parameters<NonNullable<ToolDefinition['renderCall']>>[2];

function setup(density: ToolDensity) {
  token = registerRenderKit(
    createRenderKit({}, undefined, 'unicode', density),
    {},
  );
  setActiveRenderSession('compact-session');
  const { pi, captured } = createMockPi();
  registerTodoTool(pi);
  const tool = captured.tools.get('todo');
  if (!tool?.renderCall || !tool.renderResult) throw new Error('no renderers');
  return { tool, renderCall: tool.renderCall, renderResult: tool.renderResult };
}

function context(
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

async function rows(
  density: ToolDensity,
  args: Record<string, unknown>,
  setupTasks: Record<string, unknown>[] = [],
  expanded = false,
  overrides: Partial<RenderContext> = {},
) {
  const { tool, renderCall, renderResult } = setup(density);
  const mock = createMockCtx();
  for (const task of setupTasks)
    await tool.execute('s', task as never, undefined, undefined, mock);
  const result = await tool.execute(
    'tc',
    args as never,
    undefined,
    undefined,
    mock,
  );
  const ctx = context(args, { ...overrides, expanded });
  const call = renderCall(args as never, makeTheme(), ctx);
  const out = renderResult(
    result,
    { expanded, isPartial: false },
    makeTheme(),
    ctx,
  );
  return [...call.render(100), ...out.render(100)].map((r) =>
    stripTerminalSequences(r).trimEnd(),
  );
}

const create = { action: 'create', subject: 'write tests' };

it('line: add renders exactly one row', async () => {
  const out = await rows('line', create);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatch(
    /^✓ todo {2}create #1 .* write tests {2}2s · ctrl\+o to expand$/,
  );
});

it('compact: list adds the first task as continuation', async () => {
  const out = await rows('compact', { action: 'list' }, [create]);
  expect(out).toHaveLength(2);
  expect(out[0]).toMatch(/^✓ todo {2}list/);
  expect(out[1]).toMatch(/^ {2}└ .*#1.*write tests · ctrl\+o to expand$/);
});

it('compact: batch shows counts and first op line', async () => {
  const out = await rows('compact', {
    action: 'batch',
    ops: [
      { action: 'create', subject: 'a' },
      { action: 'create', subject: 'b' },
    ],
  });
  expect(out).toHaveLength(2);
  expect(out[0]).toMatch(/^✓ todo {2}batch/);
});

it('compact: failure renders two rows with the first error line', async () => {
  const out = await rows('compact', { action: 'get', id: 99 }, [], false, {
    isError: true,
  });
  expect(out).toHaveLength(2);
  expect(out[0]).toMatch(/^✗ todo {2}get {2}2s/);
  expect(out[1]).toMatch(/^ {2}└ .+/);
});

it('running call renders one row and no result row', async () => {
  const { renderCall } = setup('compact');
  const ctx = context(create, { isPartial: true, state: {} });
  const out = renderCall(create as never, makeTheme(), ctx)
    .render(100)
    .map((r) => stripTerminalSequences(r));
  expect(out).toHaveLength(1);
  expect(out[0]).toMatch(/todo {2}create write tests {2}\d+s/);
  expect(out[0]).not.toContain('expand');
});

it('expanded or frame density keeps the framed card', async () => {
  const expanded = await rows('compact', { action: 'list' }, [create], true);
  expect(expanded[0]).toMatch(/^╭─+ todo/);
  const frame = await rows('frame', { action: 'list' }, [create]);
  expect(frame[0]).toMatch(/^╭─+ todo/);
});

it('running call at narrow width keeps elapsed and truncates the argument first', async () => {
  const { renderCall } = setup('compact');
  const args = {
    action: 'create',
    subject: 'a very long subject that cannot possibly fit',
  };
  const ctx = context(args, {
    isPartial: true,
    state: { startedAtMs: Date.now() - 2000 },
  });
  const out = renderCall(args as never, makeTheme(), ctx)
    .render(42)
    .map((r) => stripTerminalSequences(r).trimEnd());
  expect(out).toHaveLength(1);
  expect(out[0]).toContain('todo');
  expect(out[0]).toMatch(/\d+s/);
  expect(out[0]).toContain('…');
  expect(out[0]).not.toContain('cannot possibly fit');
});
