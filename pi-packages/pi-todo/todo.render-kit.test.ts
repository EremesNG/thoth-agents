import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it } from 'vitest';
import { createMockCtx, createMockPi, makeTheme } from './test/helpers.js';
import { registerTodoTool, setActiveRenderSession } from './todo.js';

let token: ReturnType<typeof registerRenderKit> | undefined;
afterEach(() => {
  if (token) withdrawRenderKit(token);
  token = undefined;
});

function setup() {
  setActiveRenderSession('test-session');
  const { pi, captured } = createMockPi();
  registerTodoTool(pi);
  const tool = captured.tools.get('todo');
  if (!tool?.renderCall || !tool.renderResult)
    throw new Error('missing renderers');
  return {
    ...tool,
    renderCall: tool.renderCall,
    renderResult: tool.renderResult,
  };
}

type RenderContext = Parameters<NonNullable<ToolDefinition['renderCall']>>[2];

function context(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    args: { action: 'create', subject: 'write tests' },
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
  };
}

it('renders a todo card with action, subject and task status through the registered kit', async () => {
  token = registerRenderKit(createTestRenderKit(), {});
  const tool = setup();
  const ctx = context();
  const result = await tool.execute(
    'tc',
    ctx.args,
    undefined,
    undefined,
    createMockCtx(),
  );
  const call = tool.renderCall(ctx.args, makeTheme(), ctx);
  const output = tool.renderResult(
    result,
    { expanded: false, isPartial: false },
    makeTheme(),
    ctx,
  );
  expect(tool.renderShell).toBe('self');
  expect(
    [...call.render(80), ...output.render(80)].map((row) => row.trimEnd()),
  ).toEqual([
    '╭─ todo',
    '+ write tests',
    '○ pending',
    '╰─ completed · completed',
  ]);
});

it.each([
  { isPartial: true, isError: false, role: 'toolPendingBg' },
  { isPartial: false, isError: false, role: 'toolSuccessBg' },
  { isPartial: false, isError: true, role: 'toolErrorBg' },
  { isPartial: true, isError: true, role: 'toolPendingBg' },
])('matches the SDK native shell for $role (partial=$isPartial, error=$isError)', async ({
  isPartial,
  isError,
  role,
}) => {
  const tool = setup();
  const ctx = context({ isPartial, isError });
  const theme = makeTheme({
    bg: (color, text) => `<${color}>${text}</${color}>`,
  });
  const result = await tool.execute(
    'tc',
    ctx.args,
    undefined,
    undefined,
    createMockCtx(),
  );
  const call = tool.renderCall(ctx.args, theme, ctx);
  const output = tool.renderResult(
    result,
    { expanded: false, isPartial },
    theme,
    ctx,
  );
  expect([...call.render(40), ...output.render(40)]).toEqual(
    ['', ' todo + write tests', ' ○ pending', ''].map(
      (row) => `<${role}>${row.padEnd(40)}</${role}>`,
    ),
  );
});

it('looks up the kit again on the same call and result components without invalidation', async () => {
  const tool = setup();
  const ctx = context();
  const result = await tool.execute(
    'tc',
    ctx.args,
    undefined,
    undefined,
    createMockCtx(),
  );
  const call = tool.renderCall(ctx.args, makeTheme(), ctx);
  const output = tool.renderResult(
    result,
    { expanded: false, isPartial: false },
    makeTheme(),
    ctx,
  );
  const nativeCall = call.render(80);
  const nativeResult = output.render(80);
  token = registerRenderKit(createTestRenderKit(), {});
  expect(call.render(80)[0]).toBe('╭─ todo');
  expect(output.render(80).at(-1)).toBe('╰─ completed · completed');
  withdrawRenderKit(token);
  expect(call.render(80)).toEqual(nativeCall);
  expect(output.render(80)).toEqual(nativeResult);
});

it('keeps one complete pending shell until a result slot is mounted', () => {
  const tool = setup();
  const ctx = context({ isPartial: true });
  const call = tool.renderCall(ctx.args, makeTheme(), ctx);
  expect(call.render(40).map((row) => row.trimEnd())).toEqual([
    '',
    ' todo + write tests',
    '',
  ]);
  token = registerRenderKit(createTestRenderKit(), {});
  expect(call.render(80).map((row) => row.trimEnd())).toEqual([
    '╭─ todo',
    '+ write tests',
    '╰─ running · running',
  ]);
});

it.each([
  {
    action: 'create',
    status: 'pending',
    glyph: '○',
    role: 'dim',
    label: 'pending',
  },
  {
    action: 'update',
    status: 'in_progress',
    glyph: '◐',
    role: 'warning',
    label: 'in progress',
  },
  {
    action: 'update',
    status: 'completed',
    glyph: '✓',
    role: 'success',
    label: 'completed',
  },
  {
    action: 'delete',
    status: 'deleted',
    glyph: '⊘',
    role: 'muted',
    label: 'deleted',
  },
])('uses the kit task glyph and $role role for $status', ({
  action,
  status,
  glyph,
  role,
  label,
}) => {
  token = registerRenderKit(createTestRenderKit(), {});
  const tool = setup();
  const theme = makeTheme({
    fg: (color, text) => `<${color}>${text}</${color}>`,
  });
  const result = {
    content: [],
    details: {
      action,
      params: { id: 1 },
      tasks: [{ id: 1, subject: 'task', status }],
      nextId: 2,
    },
  };
  const output = tool.renderResult(
    result,
    { expanded: false, isPartial: false },
    theme,
    context(),
  );
  expect(output.render(120)[0].trimEnd()).toBe(
    `<${role}>${glyph} ${label}</${role}>`,
  );
});

it('marks SDK errors in the card and footer rather than using the success frame', () => {
  token = registerRenderKit(createTestRenderKit(), {});
  const tool = setup();
  const ctx = context({ isError: true });
  const call = tool.renderCall(ctx.args, makeTheme(), ctx);
  const output = tool.renderResult(
    { content: [], details: undefined },
    { expanded: true, isPartial: false },
    makeTheme(),
    ctx,
  );
  expect(call.render(80)[0]).toBe('╭─ ! todo');
  expect(output.render(80).at(-1)).toBe('╰─ failed · failed');
});
