import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { expect, it, onTestFinished, vi } from 'vitest';
import { renderSubagentRunResult } from '../../src/render/tools/subagent-run.js';
import { renderSubagentStatusResult } from '../../src/render/tools/subagent-status.js';

const theme = {
  fg: (_role: string, text: string) => text,
  bold: (text: string) => text,
};

async function installThemeKit() {
  // Match the real-SDK tests: the theme owns its TS-extension compiler settings.
  const kitModule = new URL(
    '../../../pi-thoth-theme/src/render-kit/index.ts',
    import.meta.url,
  ).href;
  const tickerModule = new URL(
    '../../../pi-thoth-theme/src/tools/ticker.ts',
    import.meta.url,
  ).href;
  const { createRenderKit } = await import(kitModule);
  const {
    activateElapsedTickerOwner,
    releaseElapsedTickerOwner,
    stopElapsedTickers,
  } = await import(tickerModule);
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const owner = {};
  activateElapsedTickerOwner(owner);
  const token = registerRenderKit(createRenderKit(owner), owner);
  onTestFinished(() => {
    withdrawRenderKit(token);
    stopElapsedTickers(owner);
    releaseElapsedTickerOwner(owner);
    vi.useRealTimers();
  });
}

function footer(component: { render(width: number): string[] }) {
  return stripTerminalSequences(component.render(120).at(-1) ?? '');
}

it.each([
  {
    name: 'status query of a running task',
    renderResult: renderSubagentStatusResult,
    status: 'running',
    mode: 'task',
    isError: false,
    glyph: '✓',
    visibleStatus: 'running',
  },
  {
    name: 'failed launch with a running snapshot',
    renderResult: renderSubagentRunResult,
    status: 'running',
    mode: 'background',
    isError: true,
    glyph: '✗',
    visibleStatus: 'running',
  },
  {
    name: 'terminal error with a completed snapshot',
    renderResult: renderSubagentStatusResult,
    status: 'completed',
    mode: 'task',
    isError: true,
    glyph: '✗',
    visibleStatus: 'completed',
  },
  {
    name: 'successful background launch',
    renderResult: renderSubagentRunResult,
    status: 'running',
    mode: 'background',
    isError: false,
    glyph: '✓',
    visibleStatus: 'launched',
  },
])('stops the timer and freezes the $glyph footer for a $name', async ({
  renderResult,
  status,
  mode,
  isError,
  glyph,
  visibleStatus,
}) => {
  await installThemeKit();
  const result = {
    // The SDK render context wins over a stale payload error flag.
    isError: false,
    details: { task: { agent: 'worker', status, mode } },
  };
  const context = {
    executionStarted: true,
    isPartial: true,
    isError: false,
    state: {},
    invalidate: vi.fn(),
  };
  const running = renderResult(result, { isPartial: true }, theme, context);
  expect(footer(running)).toMatch(/^╰── △ · 0s /);
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(2250);
  expect(context.invalidate).toHaveBeenCalledTimes(2);
  context.isPartial = false;
  context.isError = isError;
  const finished = renderResult(result, { isPartial: false }, theme, context);
  const terminalFooter = footer(finished);
  expect(terminalFooter).toMatch(new RegExp(`^╰── ${glyph} · 2s `));
  expect(finished.render(120).join('\n')).toContain(`status: ${visibleStatus}`);
  expect(result.details.task.status).toBe(status);
  expect(vi.getTimerCount()).toBe(0);
  context.invalidate.mockClear();
  vi.advanceTimersByTime(5000);
  expect(context.invalidate).not.toHaveBeenCalled();
  finished.invalidate();
  expect(footer(finished)).toBe(terminalFooter);
});

it.each([
  { status: 'completed', isError: false },
  { status: 'completed', isError: true },
  { status: 'running', isError: false },
])('keeps a partial $status snapshot animated and ticking (error: $isError)', async ({
  status,
  isError,
}) => {
  await installThemeKit();
  const result = { details: { task: { agent: 'worker', status } } };
  const context = {
    executionStarted: true,
    isPartial: true,
    isError,
    state: {},
    invalidate: vi.fn(),
  };
  // Context lifecycle remains authoritative if options disagree.
  const running = renderSubagentStatusResult(
    result,
    { isPartial: false },
    theme,
    context,
  );
  expect(footer(running)).toMatch(/^╰── △ · 0s /);
  expect(running.render(120).join('\n')).toContain(`status: ${status}`);
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(2250);
  expect(context.invalidate).toHaveBeenCalledTimes(2);
  running.invalidate();
  expect(footer(running)).toMatch(/^╰── ▲ · 2s /);
  vi.advanceTimersByTime(1000);
  running.invalidate();
  expect(footer(running)).toMatch(/^╰── ◮ · 3s /);
  expect(context.invalidate).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(1);

  context.isPartial = false;
  const finished = renderSubagentStatusResult(result, {}, theme, context);
  expect(footer(finished)).toMatch(
    new RegExp(`^╰── ${isError ? '✗' : '✓'} · 3s `),
  );
  expect(vi.getTimerCount()).toBe(0);
});
