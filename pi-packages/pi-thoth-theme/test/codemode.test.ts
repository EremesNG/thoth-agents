import type { Theme, ToolRenderers } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import { createToolRendererResolver } from '../src/tools/index.ts';

type ToolRenderContext = Parameters<
  NonNullable<ToolRenderers['renderResult']>
>[3];
const theme = { fg: (_role: string, text: string) => text } as Theme;
function renderContext(
  overrides: Partial<ToolRenderContext> = {},
): ToolRenderContext {
  return {
    args: {},
    toolCallId: 'codemode-1',
    invalidate: () => {},
    lastComponent: undefined,
    state: {},
    cwd: process.cwd(),
    executionStarted: false,
    argsComplete: true,
    isPartial: false,
    expanded: false,
    showImages: false,
    isError: false,
    ...overrides,
  };
}
function renderer() {
  const next = vi.fn(() => undefined);
  const resolve = createToolRendererResolver(
    { getAllTools: () => [] },
    {
      icons: 'unicode',
      tools: { enabled: true },
      statusLine: { enabled: false },
      welcome: { enabled: false },
    },
  );
  const result = resolve('codemode', next);
  expect(next).not.toHaveBeenCalled();
  if (!result?.renderCall || !result.renderResult) {
    throw new Error('Missing codemode renderers');
  }
  return {
    ...result,
    renderCall: result.renderCall,
    renderResult: result.renderResult,
  };
}
const calls = Array.from({ length: 10 }, (_, i) => ({
  id: String(i),
  name: `nested_${i}`,
  args: '{}',
  status: 'ok',
  durationMs: 1250,
}));

describe('codemode compact card', () => {
  it('overrides downstream rendering and shows eight calls plus the remainder', () => {
    const tools = renderer();
    const component = tools.renderResult(
      {
        content: [{ type: 'text', text: 'script output' }],
        details: { calls },
      },
      { expanded: false, isPartial: false },
      theme,
      renderContext(),
    );
    const text = component.render(100).join('\n');
    for (let i = 0; i < 8; i++) expect(text).toContain(`nested_${i}`);
    expect(text).not.toContain('nested_8');
    expect(text).toContain('+2 more');
    expect(text).toContain('✓');
    expect(text).toContain('1.3s');
    expect(text).not.toContain('script output');
  });

  it.each([
    undefined,
    null,
    {},
    { calls: 'invalid' },
    { calls: [null, {}, { name: 'bad', status: 'nope' }] },
  ])('falls back to output when details are absent or malformed: %j', (details) => {
    const component = renderer().renderResult(
      { content: [{ type: 'text', text: 'fallback output' }], details },
      { expanded: false, isPartial: false },
      theme,
      renderContext(),
    );
    expect(component.render(100).join('\n')).toContain('fallback output');
  });

  it('shows running, error and cancelled nested statuses without inventing durations', () => {
    const component = renderer().renderResult(
      {
        content: [],
        details: {
          calls: [
            {
              ...calls[0],
              name: 'running',
              status: 'running',
              durationMs: undefined,
            },
            { ...calls[0], name: 'failed', status: 'error', durationMs: 0 },
            {
              ...calls[0],
              name: 'cancelled',
              status: 'cancelled',
              durationMs: 500,
            },
          ],
        },
      },
      { expanded: false, isPartial: true },
      theme,
      renderContext(),
    );
    const text = component.render(100).join('\n');
    expect(text).toContain('◐ running');
    expect(text).toContain('✗ failed · 0s');
    expect(text).toContain('■ cancelled · 500ms');
    expect(text).not.toContain('running ·');
  });

  it('reuses unchanged frames and invalidates the call frame when results arrive', () => {
    const tools = renderer();
    const context = renderContext();
    const call = tools.renderCall({}, theme, context);
    const pending = call.render(100);
    expect(call.render(100)).toBe(pending);
    expect(pending.join('\n')).toContain('╰');
    const result = tools.renderResult(
      { content: [], details: { calls: calls.slice(0, 8) } },
      { expanded: false, isPartial: false },
      theme,
      context,
    );
    const completedCall = call.render(100);
    expect(completedCall).not.toBe(pending);
    expect(completedCall.join('\n')).not.toContain('╰');
    const frame = result.render(100);
    expect(result.render(100)).toBe(frame);
    expect(frame.join('\n')).not.toContain('+');
    result.invalidate();
    expect(result.render(100)).not.toBe(frame);
    expect(result.render(100)).toEqual(frame);
    expect(result.render(30)).not.toEqual(frame);
  });

  it.each([
    { isError: false, role: 'success' },
    { isError: true, role: 'error' },
  ])('keeps both card parts $role after a cached running frame', ({
    isError,
    role,
  }) => {
    const colorTheme = {
      fg: (role: string, text: string) => `<${role}>${text}`,
    } as Theme;
    const tools = renderer();
    const context = renderContext({ executionStarted: true, isPartial: true });
    const call = tools.renderCall({}, colorTheme, context);
    const pending = call.render(100);
    expect(pending.join('\n')).toContain('<accent>╭');
    const runningResult = tools.renderResult(
      { content: [{ type: 'text', text: 'output' }], details: {} },
      { expanded: false, isPartial: true },
      colorTheme,
      { ...context, isError: true },
    );
    const runningCall = call.render(100);
    expect(runningCall.join('\n')).toContain('<accent>╭');
    expect(runningResult.render(100).join('\n')).toContain('<accent>╰');
    expect(call.render(100)).toBe(runningCall);

    const terminalResult = tools.renderResult(
      { content: [{ type: 'text', text: 'output' }], details: {} },
      { expanded: false, isPartial: false },
      colorTheme,
      { ...context, isPartial: false, isError },
    );
    const terminalCall = call.render(100);
    expect(terminalCall).not.toBe(runningCall);
    expect(terminalCall.join('\n')).toContain(`<${role}>╭`);
    expect(terminalResult.render(100).join('\n')).toContain(`<${role}>╰`);
    const borders = [...terminalCall, ...terminalResult.render(100)]
      .join('\n')
      .matchAll(/<(accent|success|error)>[╭│╰─]/g);
    expect(new Set(Array.from(borders, (match) => match[1]))).toEqual(
      new Set([role]),
    );
    expect(call.render(100)).toBe(terminalCall);
  });

  it('labels output and script even when no nested calls were made', () => {
    const component = renderer().renderResult(
      { content: [{ type: 'text', text: 'hello' }], details: { calls: [] } },
      { expanded: true, isPartial: false },
      theme,
      renderContext({ args: { code: 'console.log("hello");' } }),
    );
    const text = component.render(100).join('\n');
    expect(text).toContain('Script');
    expect(text).toContain('Output');
    expect(text).toContain('console.log("hello");');
    expect(text).toContain('hello');
  });

  it('expands the script, full output and nested errors', () => {
    const tools = renderer();
    const context = renderContext({
      args: { code: 'await tools.read({ path: "a" });' },
      expanded: true,
    });
    const call = tools.renderCall(context.args, theme, context);
    const result = tools.renderResult(
      {
        content: [{ type: 'text', text: 'line one\nline two' }],
        details: {
          calls: [{ ...calls[0], status: 'error', error: 'permission denied' }],
        },
      },
      { expanded: true, isPartial: false },
      theme,
      { ...context, isError: true },
    );
    const text = [...call.render(100), ...result.render(100)].join('\n');
    expect(text).toContain('Script');
    expect(text).toContain('await tools.read');
    expect(text).toContain('Output');
    expect(text).toContain('line one');
    expect(text).toContain('line two');
    expect(text).toContain('Errors');
    expect(text).toContain('nested_0: permission denied');
  });
});
