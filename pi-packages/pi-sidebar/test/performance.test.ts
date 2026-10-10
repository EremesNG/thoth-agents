import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  registerRenderKit,
  registerWorkPanelProvider,
  WORK_PANEL_VERSION,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { renderWorkPanelRow } from '@thoth-agents/pi-core/panel';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@thoth-agents/pi-core/panel', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@thoth-agents/pi-core/panel')>();
  return {
    ...original,
    renderWorkPanelRow: vi.fn(original.renderWorkPanelRow),
  };
});

import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { SidebarPanels } from '../src/panels/sidebar.js';

const releases: (() => void)[] = [];
afterEach(() => {
  for (const off of releases.splice(0).reverse()) off();
  vi.useRealTimers();
  vi.clearAllMocks();
});
it('shares one bounded plan per frame and never scans session entries on render', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const entries = vi.fn(() => []);
  const rows = vi.fn(() =>
    Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      primary: `task ${i}`,
      status: i === 1 ? 'completed' : 'running',
    })),
  );
  releases.push(
    registerWorkPanelProvider(
      { on() {} } as any,
      {
        version: WORK_PANEL_VERSION,
        id: 'perf',
        label: 'Tasks',
        priority: 10,
        listRows: rows,
        visibleCount: () => 1000,
      } as any,
    ),
  );
  const panel = new SidebarPanels({
    config: {
      startup: 'auto',
      panels: [
        { id: 'session', visible: true },
        { id: 'perf', visible: true },
      ],
    },
    context: () =>
      ({
        model: { provider: 'test', id: 'test' },
        getContextUsage: () => undefined,
        sessionManager: { getEntries: entries },
      }) as unknown as ExtensionContext,
    theme: { fg: (_role, text) => text },
    thinking: () => 'off',
    subscriptionProviders: [],
    subagentCost: () => 0,
    workspace: () => ({ cwd: '.' }),
    height: () => 14, // Session chrome is two rows taller than before.
  });
  const first = panel.render(44);
  expect(
    vi.mocked(renderWorkPanelRow).mock.calls.map(([row]) => row.id),
  ).toEqual(['0', '1', '2']);
  const renderCount = vi.mocked(renderWorkPanelRow).mock.calls.length;
  const baseline = entries.mock.calls.length;
  for (let i = 0; i < 20; i++) {
    panel.hasAnimation(44);
    panel.sourceIds(44);
    expect(panel.render(44)).toBe(first);
  }
  expect(renderWorkPanelRow).toHaveBeenCalledTimes(renderCount);
  expect(rows).toHaveBeenCalledTimes(1);
  expect(entries).toHaveBeenCalledTimes(baseline);
  vi.advanceTimersByTime(100);
  panel.hasAnimation(44);
  panel.sourceIds(44);
  const second = panel.render(44);
  expect(rows).toHaveBeenCalledTimes(2);
  expect(entries).toHaveBeenCalledTimes(baseline);
  expect(
    second.filter(
      (line) => !line.includes('task 0') && !line.includes('task 2'),
    ),
  ).toEqual(
    first.filter(
      (line) => !line.includes('task 0') && !line.includes('task 2'),
    ),
  );
});

it('keeps static output cached across frames, and invalidates on kit replacement/withdrawal and explicit invalidation', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const rows = vi.fn(() => [
    { id: 'static', primary: 'stable', status: 'pending' },
    { id: 'hidden', primary: 'offscreen', status: 'running' },
    { id: 'hidden-too', primary: 'offscreen too', status: 'running' },
  ]);
  releases.push(
    registerWorkPanelProvider(
      { on() {} } as any,
      {
        version: WORK_PANEL_VERSION,
        id: 'static',
        label: 'Tasks',
        priority: 10,
        listRows: rows,
        visibleCount: () => 3,
      } as any,
    ),
  );
  const panel = new SidebarPanels({
    config: { startup: 'auto', panels: [{ id: 'static', visible: true }] },
    context: () =>
      ({
        getContextUsage: () => undefined,
        sessionManager: { getEntries: () => [] },
      }) as unknown as ExtensionContext,
    theme: { fg: (_role, text) => text },
    thinking: () => 'off',
    subscriptionProviders: [],
    subagentCost: () => 0,
    workspace: () => ({ cwd: '.' }),
    height: () => 4,
  });
  const first = panel.render(44);
  expect(panel.hasAnimation(44)).toBe(false);
  expect(
    vi.mocked(renderWorkPanelRow).mock.calls.map(([row]) => row.id),
  ).toEqual(['static']);
  for (let i = 0; i < 10; i++) {
    vi.advanceTimersByTime(100);
    expect(panel.render(44)).toBe(first);
  }
  expect(rows).toHaveBeenCalledTimes(1);
  const token = registerRenderKit(createTestRenderKit(), {});
  releases.push(() => withdrawRenderKit(token));
  const kitLines = panel.render(44);
  expect(kitLines).not.toBe(first);
  const replacement = registerRenderKit(createTestRenderKit(), {});
  releases.push(() => withdrawRenderKit(replacement));
  expect(panel.render(44)).not.toBe(kitLines);
  withdrawRenderKit(replacement);
  const fallback = panel.render(44);
  expect(fallback).toEqual(first);
  panel.invalidate();
  expect(panel.render(44)).not.toBe(fallback);
});

function sessionFixture() {
  const entries: any[] = [];
  const getEntries = vi.fn(() => entries.slice());
  const getBranch = vi.fn(() => entries.slice());
  const getContextUsage = vi.fn(() => {
    const branch = getBranch();
    return {
      tokens: branch.length * 100,
      percent: branch.length,
      contextWindow: 10000,
    };
  });
  const ctx = {
    model: { provider: 'paid', id: 'model' },
    getContextUsage,
    sessionManager: {
      getEntries,
      getBranch,
      getLeafId: () => entries.at(-1)?.id ?? null,
    },
  } as unknown as ExtensionContext;
  const panel = new SidebarPanels({
    config: {
      startup: 'auto',
      panels: [
        { id: 'session', visible: true },
        { id: 'regression', visible: true },
      ],
    },
    context: () => ctx,
    theme: { fg: (_role, text) => text },
    thinking: () => 'off',
    subscriptionProviders: [],
    subagentCost: () => 0,
    workspace: () => ({ cwd: '.' }),
    height: () => 20,
  });
  return { panel, entries, getEntries, getBranch, getContextUsage };
}
function regressionProvider(rows: () => any[]) {
  const read = vi.fn(rows);
  releases.push(
    registerWorkPanelProvider(
      { on() {} } as any,
      {
        version: WORK_PANEL_VERSION,
        id: 'regression',
        label: 'Tasks',
        priority: 10,
        listRows: read,
        visibleCount: () => 1,
      } as any,
    ),
  );
  return read;
}
it('does zero native usage calls or session traversals across 60 unchanged renders', () => {
  const fixture = sessionFixture();
  fixture.panel.render(44);
  fixture.getEntries.mockClear();
  fixture.getBranch.mockClear();
  fixture.getContextUsage.mockClear();
  for (let i = 0; i < 60; i++) fixture.panel.render(44);
  expect(fixture.getContextUsage).toHaveBeenCalledTimes(0);
  expect(fixture.getEntries).toHaveBeenCalledTimes(0);
  expect(fixture.getBranch).toHaveBeenCalledTimes(0);
});
it('detects persistence after message_end even if rendered before the append', () => {
  const { panel, entries } = sessionFixture();
  panel.render(44);
  panel.refreshSessionCost();
  expect(panel.render(44).join('\n')).toContain('$0.000');
  entries.push({
    id: 'persisted',
    type: 'message',
    message: { role: 'assistant', usage: { cost: { total: 1.25 } } },
  });
  const lines = panel.render(44).join('\n');
  expect(lines).toContain('$1.250');
  expect(lines).toMatch(/Context\s.*1%/);
});
it('refreshes re-exposed animated provider text before the first visible frame', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const read = regressionProvider(() => [
    {
      id: 'active',
      status: 'running',
      primary: `elapsed ${Date.now() / 1000}s`,
    },
  ]);
  const { panel } = sessionFixture();
  expect(panel.renderAt(44, 20).join('\n')).toContain('elapsed 1s');
  panel.renderAt(44, 3);
  vi.setSystemTime(10000);
  panel.renderAt(44, 3);
  expect(read).toHaveBeenCalledTimes(1);
  expect(panel.renderAt(44, 20).join('\n')).toContain('elapsed 10s');
  expect(read).toHaveBeenCalledTimes(2);
});
it.each([
  'pending',
  'running',
])('does not reread %s providers on unrelated session cost invalidation', (status) => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const read = regressionProvider(() => [
    { id: 'static', status, primary: 'stable' },
  ]);
  const { panel } = sessionFixture();
  panel.render(44);
  panel.refreshSessionCost();
  panel.render(44);
  expect(read).toHaveBeenCalledTimes(1);
});

it('reuses the plan across renders and replans only when the cost data revision changes', async () => {
  const { CostTracker } = await import('../src/panels/cost.js');
  const data = new CostTracker();
  const ranked = vi.spyOn(data, 'ranked');
  const panel = new SidebarPanels({
    config: { startup: 'auto', panels: [{ id: 'cost', visible: true }] },
    context: () =>
      ({
        model: { provider: 'test', id: 'test' },
        getContextUsage: () => undefined,
        sessionManager: { getEntries: () => [] },
      }) as unknown as ExtensionContext,
    theme: { fg: (_role, text) => text },
    thinking: () => 'off',
    subscriptionProviders: [],
    subagentCost: () => 0,
    workspace: () => ({ cwd: '.' }),
    cost: () => data,
    height: () => 20,
  });
  const first = panel.render(44);
  const calls = ranked.mock.calls.length;
  for (let i = 0; i < 20; i++) expect(panel.render(44)).toBe(first);
  expect(ranked).toHaveBeenCalledTimes(calls);
  data.update(
    {
      tasks: [
        {
          id: 'a',
          agent: 'worker',
          displayName: 'Arrived',
          mode: 'task',
          status: 'running',
          createdAt: 0,
          usage: { cost: 1 },
        },
      ],
      history: [],
      counts: {} as never,
      totals: {} as never,
    },
    1000,
  );
  const second = panel.render(44);
  expect(ranked.mock.calls.length).toBeGreaterThan(calls);
  expect(second.join('\n')).toContain('Arrived');
  const settled = ranked.mock.calls.length;
  for (let i = 0; i < 20; i++) expect(panel.render(44)).toBe(second);
  expect(ranked).toHaveBeenCalledTimes(settled);
});
