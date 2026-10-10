import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { createMockCtx, createMockPi, makeTheme } from './test/helpers.js';
import { registerTodoTool, setActiveRenderSession } from './todo.js';

let token: ReturnType<typeof registerRenderKit> | undefined;
afterEach(() => {
  if (token) withdrawRenderKit(token);
  token = undefined;
  vi.restoreAllMocks();
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
  ).toEqual(['╭─ todo', 'create #1 ○ write tests', '╰─ ✓']);
});

it('uses the plain standard footer for a legacy kit and recomputes elapsed on invalidate', () => {
  const kit = createTestRenderKit();
  delete kit.toolFooter;
  token = registerRenderKit(kit, {});
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const tool = setup();
  const ctx = context({ isPartial: true });
  const call = tool.renderCall(ctx.args, makeTheme(), ctx);
  expect(call.render(80).at(-1)).toBe('╰─ running · 0s');
  now.mockReturnValue(6500);
  call.invalidate();
  expect(call.render(80).at(-1)).toBe('╰─ running · 5s');

  ctx.isPartial = false;
  const result = tool.renderResult(
    { content: [], details: undefined },
    { expanded: false, isPartial: false },
    makeTheme(),
    ctx,
  );
  call.invalidate();
  expect(
    [...call.render(80), ...result.render(80)].filter((row) =>
      row.startsWith('╰─'),
    ),
  ).toEqual(['╰─ ✓ · 5s']);
  now.mockReturnValue(9000);
  result.invalidate();
  expect(result.render(80).at(-1)).toBe('╰─ ✓ · 5s');
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
  const summary =
    role === 'toolErrorBg'
      ? ' Created #1: write tests (pending)'
      : ' create #1 ○ write tests';
  expect([...call.render(40), ...output.render(40)]).toEqual(
    ['', ' todo', summary, ''].map(
      (row) => `<${role}>${row.padEnd(40)}</${role}>`,
    ),
  );
});

it.each([
  'call',
  'result',
])('reuses %s KIT lines until width, invalidation or registration changes', async (slot) => {
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
  const component = slot === 'call' ? call : output;
  const native = component.render(80);
  const kit = createTestRenderKit();
  const card = vi.spyOn(kit, 'card');
  token = registerRenderKit(kit, {});
  const lines = component.render(80);
  expect(lines.map((row) => row.trimEnd())).toEqual(
    slot === 'call' ? ['╭─ todo'] : ['create #1 ○ write tests', '╰─ ✓'],
  );
  expect(component.render(80)).toBe(lines);
  expect(card).toHaveBeenCalledTimes(1);
  component.render(40);
  expect(card).toHaveBeenCalledTimes(2);
  component.invalidate();
  component.render(40);
  expect(card).toHaveBeenCalledTimes(3);
  expect(component.render(80)).toEqual(lines);
  expect(card).toHaveBeenCalledTimes(4);

  const replacement = createTestRenderKit();
  const replacementCard = vi.spyOn(replacement, 'card');
  token = registerRenderKit(replacement, {});
  expect(component.render(80)).toEqual(lines);
  expect(replacementCard).toHaveBeenCalledTimes(1);
  expect(component.render(80)).toEqual(lines);
  expect(replacementCard).toHaveBeenCalledTimes(1);
  withdrawRenderKit(token);
  expect(component.render(80)).toEqual(native);
  component.invalidate();
  expect(component.render(80)).toEqual(native);
  token = registerRenderKit(kit, {});
  expect(component.render(80)).toEqual(lines);
  expect(card).toHaveBeenCalledTimes(5);
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
  expect(output.render(80).at(-1)).toBe('╰─ ✓');
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
    ' todo create write tests',
    '',
  ]);
  token = registerRenderKit(createTestRenderKit(), {});
  expect(call.render(80).map((row) => row.trimEnd())).toEqual([
    '╭─ todo',
    'create write tests',
    '╰─ running',
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
    action: 'get',
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
  expect(output.render(120)[0]).toContain(`<${role}>${glyph}</${role}>`);
  expect(label).toBeTruthy();
});

it.each([
  {
    isPartial: false,
    executionStarted: true,
    completed: true,
    status: 'completed',
  },
  {
    isPartial: true,
    executionStarted: true,
    completed: false,
    status: 'running',
  },
  {
    isPartial: true,
    executionStarted: false,
    completed: false,
    status: 'pending',
  },
  {
    isPartial: false,
    executionStarted: false,
    completed: false,
    status: 'completed',
  },
  {
    isPartial: false,
    executionStarted: true,
    isError: true,
    completed: false,
    status: 'failed',
  },
  {
    isPartial: true,
    executionStarted: true,
    isError: true,
    completed: false,
    status: 'running',
  },
])('preserves the todo footer while signaling execution success on both parts (%j)', ({
  isPartial,
  executionStarted,
  isError = false,
  completed,
  status,
}) => {
  const kit = createTestRenderKit();
  const card = vi.spyOn(kit, 'card');
  token = registerRenderKit(kit, {});
  const tool = setup();
  const ctx = context({ isPartial, executionStarted, isError });
  const call = tool.renderCall(ctx.args, makeTheme(), ctx);
  const result = tool.renderResult(
    {
      content: [],
      details: {
        action: 'create',
        params: {},
        tasks: [{ id: 1, subject: 'task', status: 'pending' }],
        nextId: 2,
      },
    },
    { expanded: false, isPartial },
    makeTheme(),
    ctx,
  );
  call.render(80);
  const footer =
    status === 'completed' ? '✓' : status === 'failed' ? '✗' : status;
  expect(result.render(80).at(-1)).toBe(`╰─ ${footer}`);
  expect(card.mock.calls.map(([, options]) => options.part)).toEqual([
    'start',
    'end',
  ]);
  for (const [, options] of card.mock.calls) {
    expect(options.status).toBe(status);
    expect(options.footer).toBe(footer);
    expect(options.context).toBe(ctx);
    expect(options.isSuccess).toBe(completed);
    expect(Boolean(options.isError)).toBe(isError);
  }
});

it('does not infer todo success before any execution or result context exists', () => {
  const kit = createTestRenderKit();
  const card = vi.spyOn(kit, 'card');
  token = registerRenderKit(kit, {});
  const tool = setup();
  tool
    .renderCall(
      { action: 'list' },
      makeTheme(),
      context({
        executionStarted: false,
        isPartial: false,
      }),
    )
    .render(80);
  tool.renderCall({ action: 'list' }, makeTheme(), context()).render(80);
  for (const [, options] of card.mock.calls) {
    expect(options.status).toBe('completed');
    expect(options.footer).toBe('✓');
    expect(options.isSuccess).not.toBe(true);
  }
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
  expect(output.render(80).at(-1)).toBe('╰─ ✗');
});

it('mounted todo action and result glyphs follow kit replacement and preserve tool payloads', async () => {
  const tool = setup();
  const ctx = context();
  const payload = await tool.execute(
    'tc',
    ctx.args,
    undefined,
    undefined,
    createMockCtx(),
  );
  const before = JSON.stringify(payload);
  const call = tool.renderCall(
    { action: 'get', id: 1 },
    makeTheme(),
    context(),
  );
  const output = tool.renderResult(
    { content: [], details: undefined },
    { expanded: false, isPartial: false },
    makeTheme(),
    ctx,
  );
  expect(call.render(80).join('\n')).toContain('get #1');
  const kit = createTestRenderKit({
    icon: (name) => name,
  });
  kit.statusGlyph = (_theme, status) => (status === 'completed' ? '+' : '-');
  token = registerRenderKit(kit, {});
  expect(call.render(80).join('\n')).toContain('get #1');
  expect(output.render(80)[0].trimEnd()).toBe('+');
  expect(JSON.stringify(payload)).toBe(before);
  withdrawRenderKit(token);
  token = undefined;
  expect(call.render(80).join('\n')).toContain('get #1');
  expect(output.render(80).join('\n')).toContain('✓');
});
