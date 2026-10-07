import {
  registerRenderKit,
  renderToolFooter,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { expect, it, onTestFinished, vi } from 'vitest';
import { boxedComponent } from '../../src/render/tools/components.js';
import { renderSubagentRunResult } from '../../src/render/tools/subagent-run.js';

const theme = {
  fg: (_role: string, text: string) => text,
  bold: (text: string) => text,
};

function installTimedKit() {
  const kit = createTestRenderKit();
  // Exercise context timing through pi-core's fallback, not the theme's ticker.
  kit.toolFooter = (renderTheme, options) =>
    renderToolFooter(undefined, renderTheme, options);
  const footer = vi.spyOn(kit, 'toolFooter');
  const token = registerRenderKit(kit, {});
  onTestFinished(() => withdrawRenderKit(token));
  return footer;
}

it('delegates a running footer with its context and recomputes it after same-width invalidation', () => {
  vi.useFakeTimers();
  vi.setSystemTime(5000);
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const footer = installTimedKit();
  const context = {
    executionStarted: true,
    isPartial: true,
    isError: true,
    state: { startedAt: 0 },
  };
  const component = boxedComponent(['output'], {
    title: 'Running',
    status: 'running',
    context,
    theme,
  });
  const initial = component.render(80);
  expect(initial.at(-1)).toBe('╰─ running · 5s');
  expect(footer).toHaveBeenCalledWith(
    theme,
    expect.objectContaining({ status: 'running', context }),
  );
  vi.advanceTimersByTime(1000);
  expect(component.render(80)).toBe(initial);
  component.invalidate();
  expect(component.render(80).at(-1)).toBe('╰─ running · 6s');
});

it.each([
  'running',
  'completed',
  'failed',
] as const)('preserves the native title/body shell without a %s footer or timing effects', (status) => {
  vi.useFakeTimers();
  vi.setSystemTime(5000);
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const state = { startedAt: 0 };
  const component = boxedComponent(['output'], {
    title: 'Title',
    status,
    context: {
      executionStarted: true,
      isPartial: status === 'running',
      isError: status === 'failed',
      state,
    },
    theme,
  });
  const lines = component.render(80);
  expect(lines).toHaveLength(4);
  expect(lines.map((line) => line.trim())).toEqual(['', 'Title', 'output', '']);
  vi.advanceTimersByTime(2000);
  component.invalidate();
  expect(component.render(80)).toEqual(lines);
  expect(state).toEqual({ startedAt: 0 });
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps the running background title timer-free and puts elapsed in the standard footer', () => {
  vi.useFakeTimers();
  vi.setSystemTime(5000);
  onTestFinished(() => {
    vi.useRealTimers();
  });
  installTimedKit();
  const lines = renderSubagentRunResult(
    {
      details: {
        task: {
          agent: 'worker',
          status: 'running',
          mode: 'background',
          started_at: '1970-01-01T00:00:00Z',
        },
      },
    },
    { isPartial: true },
    theme,
    { executionStarted: true, isPartial: true, state: { startedAt: 0 } },
  ).render(120);
  expect(lines[0]).toBe('╭─ ◐ subagent · worker · running (background)');
  expect(lines.at(-1)).toBe('╰─ running · 5s');
});

it.each([
  false,
  true,
])('keeps finalized launch cards stable rather than timing the live background task (kit: %s)', (withKit) => {
  vi.useFakeTimers();
  vi.setSystemTime(5000);
  onTestFinished(() => {
    vi.useRealTimers();
  });
  if (withKit) installTimedKit();
  const task = {
    agent: 'worker',
    status: 'running',
    mode: 'background',
    started_at: '1970-01-01T00:00:00Z',
  };
  const component = renderSubagentRunResult({ details: { task } }, {}, theme, {
    executionStarted: true,
    isPartial: false,
    isError: false,
    state: { startedAt: 4000 },
  });
  const lines = component.render(120);
  expect(lines.join('\n')).toContain('launched (background)');
  if (withKit) expect(lines.at(-1)).toBe('╰─ ✓ · 1s');
  else expect(lines.join('\n')).not.toContain('✓ · 1s');
  vi.advanceTimersByTime(3000);
  component.invalidate();
  expect(component.render(120)).toEqual(lines);
  expect(task.status).toBe('running');
  expect(vi.getTimerCount()).toBe(0);
});

it('uses the plain contract fallback when a legacy kit has no footer member', () => {
  vi.useFakeTimers();
  vi.setSystemTime(5000);
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const kit = createTestRenderKit();
  delete kit.toolFooter;
  const token = registerRenderKit(kit, {});
  onTestFinished(() => withdrawRenderKit(token));
  expect(
    boxedComponent(['output'], {
      status: 'in_progress',
      context: { executionStarted: true, state: { startedAt: 0 } },
      theme,
    })
      .render(80)
      .at(-1),
  ).toBe('╰─ running · 5s');
});
