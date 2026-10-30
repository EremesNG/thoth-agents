import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  registerRenderKit,
  registerWorkPanelProvider,
  setAnimationLevel,
  WORK_PANEL_VERSION,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import {
  createWorkPanelColumnPlan,
  renderWorkPanelRow,
} from '@thoth-agents/pi-core/panel';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@thoth-agents/pi-core/panel', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@thoth-agents/pi-core/panel')>();
  return {
    ...original,
    createWorkPanelColumnPlan: vi.fn(original.createWorkPanelColumnPlan),
    renderWorkPanelRow: vi.fn(original.renderWorkPanelRow),
  };
});

import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import type { SidebarConfig } from '../src/config.js';
import type { BarStyle } from '../src/panels/meter.js';
import { SidebarPanels } from '../src/panels/sidebar.js';

const releases: (() => void)[] = [];
afterEach(() => {
  for (const off of releases.splice(0).reverse()) off();
  setAnimationLevel('full');
  vi.useRealTimers();
  vi.restoreAllMocks();
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
  ).toEqual(['997', '998', '999']);
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
  panel.stepAnimation(0);
  panel.hasAnimation(44);
  panel.sourceIds(44);
  const second = panel.render(44);
  expect(rows).toHaveBeenCalledTimes(2);
  expect(entries).toHaveBeenCalledTimes(baseline);
  expect(second.filter((line) => !/task 99[789]/.test(line))).toEqual(
    first.filter((line) => !/task 99[789]/.test(line)),
  );
});

it('keeps static output cached across frames, and invalidates on kit replacement/withdrawal and explicit invalidation', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const rows = vi.fn(() => [
    { id: 'static', primary: 'stable', status: 'pending', sortStartedAt: 3 },
    { id: 'hidden', primary: 'offscreen', status: 'running', sortStartedAt: 1 },
    {
      id: 'hidden-too',
      primary: 'offscreen too',
      status: 'running',
      sortStartedAt: 2,
    },
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
    panel.stepAnimation(i);
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
it('builds once per revision input set across animation, source and render queries', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  let changed = () => {};
  const rows = vi.fn(() => [
    { id: 'active', status: 'running', primary: 'active task' },
  ]);
  releases.push(
    registerWorkPanelProvider(
      { on() {} } as any,
      {
        version: WORK_PANEL_VERSION,
        id: 'keyed',
        label: 'Tasks',
        priority: 10,
        listRows: rows,
        onVisibleChanged: (notify: () => void) => {
          changed = notify;
          return () => {};
        },
      } as any,
    ),
  );
  const config = {
    startup: 'auto' as const,
    panels: [
      { id: 'session', visible: true },
      { id: 'workspace', visible: true },
      { id: 'keyed', visible: true },
    ],
  };
  const workspace = { cwd: '.', branch: 'main' };
  let leaf = 'first';
  let width = 44;
  let height = 40;
  const ctx = {
    model: { provider: 'paid', id: 'model' },
    getContextUsage: () => undefined,
    sessionManager: { getEntries: () => [], getLeafId: () => leaf },
  } as unknown as ExtensionContext;
  const panel = new SidebarPanels({
    config,
    context: () => ctx,
    theme: { fg: (_role, text) => text },
    thinking: () => 'off',
    subscriptionProviders: [],
    subagentCost: () => 0,
    workspace: () => ({ ...workspace }), // Value-equivalent snapshots are hits.
    height: () => height,
  });
  const query = () => {
    panel.hasAnimation(width);
    panel.sourceIds(width);
    return panel.render(width);
  };
  let builds = vi.mocked(createWorkPanelColumnPlan).mock.calls.length;
  const mutations = [
    () => {},
    () => changed(),
    () => {
      config.panels[0].visible = false;
    },
    () => {
      workspace.branch = 'feature';
    },
    () => {
      width++;
    },
    () => {
      height++;
    },
    () => {
      vi.advanceTimersByTime(100);
      panel.stepAnimation(0);
    },
    () => panel.refreshSessionCost(),
    () => {
      leaf = 'appended';
    },
  ];
  for (const mutate of mutations) {
    mutate();
    const lines = query();
    expect(createWorkPanelColumnPlan).toHaveBeenCalledTimes(++builds);
    for (let index = 0; index < 5; index++) expect(query()).toBe(lines);
    expect(createWorkPanelColumnPlan).toHaveBeenCalledTimes(builds);
  }
  expect(rows).toHaveBeenCalledTimes(3); // Initial, source revision, animation frame.
});

it('does not serialize rows or snapshots on unchanged query and render cache hits', () => {
  regressionProvider(() => [
    { id: 'static', status: 'pending', primary: 'stable' },
  ]);
  const { panel } = sessionFixture();
  const first = panel.render(44);
  const stringify = vi.spyOn(JSON, 'stringify');
  for (let index = 0; index < 20; index++) {
    panel.hasAnimation(44);
    panel.sourceIds(44);
    expect(panel.render(44)).toBe(first);
  }
  expect(stringify).not.toHaveBeenCalled();
});

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
it.each(
  (['full', 'off'] as const).flatMap((level) =>
    [
      { hidden: 'height', width: 44, height: 3 },
      { hidden: 'width', width: 20, height: 20 },
      { hidden: 'zero', width: 44, height: 0 },
    ].map((size) => ({ level, ...size })),
  ),
)('refreshes re-exposed running provider text at $level after hiding by $hidden before the first visible frame', ({
  level,
  width,
  height,
}) => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  setAnimationLevel(level);
  const read = regressionProvider(() => [
    {
      id: 'active',
      status: 'running',
      primary: `elapsed ${Date.now() / 1000}s`,
    },
  ]);
  const { panel } = sessionFixture();
  expect(panel.renderAt(44, 20).join('\n')).toContain('elapsed 1s');
  const hide = () => panel.renderAt(width, height);
  hide();
  vi.setSystemTime(10000);
  hide();
  expect(read).toHaveBeenCalledTimes(1);
  expect(panel.renderAt(44, 20).join('\n')).toContain('elapsed 10s');
  expect(read).toHaveBeenCalledTimes(2);
});
it('caches by stepped frame and level, not wall-clock time, including static elapsed refreshes', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const read = regressionProvider(() => [
    {
      id: 'active',
      status: 'running',
      statusGlyph: 'running',
      primary: `elapsed ${Date.now() / 1000}s`,
    },
  ]);
  const { panel } = sessionFixture();
  const first = panel.render(44);
  expect(first.join('\n')).toContain('⠋ elapsed 1s');
  vi.setSystemTime(10000);
  expect(panel.render(44)).toBe(first);
  expect(read).toHaveBeenCalledTimes(1);
  panel.stepAnimation(0);
  expect(panel.render(44).join('\n')).toContain('⠋ elapsed 10s');
  panel.stepAnimation(1);
  const second = panel.render(44);
  expect(second.join('\n')).toContain('⠙ elapsed 10s');
  expect(panel.render(44)).toBe(second);
  setAnimationLevel('off');
  expect(panel.render(44).join('\n')).toContain('◐ elapsed 10s');
  vi.setSystemTime(11000);
  panel.stepAnimation(undefined);
  expect(panel.render(44).join('\n')).toContain('◐ elapsed 11s');
  setAnimationLevel('full');
  expect(panel.render(44).join('\n')).toContain('⠙ elapsed 11s');
  expect(read).toHaveBeenCalledTimes(4);
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

// biome-ignore lint/suspicious/noControlCharactersInRegex: SGR stripping
const stripSgr = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '');
const liveTask = (
  id: string,
  cost: number,
  status: 'running' | 'completed',
) => ({
  id,
  agent: 'worker',
  displayName: `Task ${id}`,
  mode: 'task' as const,
  status,
  createdAt: 0,
  usage: { cost },
});
const stateOf = (...tasks: ReturnType<typeof liveTask>[]) => ({
  tasks,
  history: [],
  counts: {} as never,
  totals: {} as never,
});

async function costFixture(
  options: {
    panels?: string[];
    usage?: ReturnType<ExtensionContext['getContextUsage']>;
    bars?: BarStyle;
  } = {},
) {
  const { CostTracker } = await import('../src/panels/cost.js');
  const config: SidebarConfig = {
    startup: 'auto',
    panels: (options.panels ?? ['cost']).map((id) => ({ id, visible: true })),
    ...(options.bars ? { bars: options.bars } : {}),
  };
  const data = new CostTracker();
  const reads = {
    ranked: vi.spyOn(data, 'ranked'),
    total: vi.spyOn(data, 'total'),
    count: vi.spyOn(data, 'count'),
    active: vi.spyOn(data, 'active'),
    remainderActive: vi.spyOn(data, 'remainderActive'),
  };
  const entries = vi.fn(() => []);
  const panel = new SidebarPanels({
    config,
    context: () =>
      ({
        model: { provider: 'test', id: 'test' },
        getContextUsage: () => options.usage,
        sessionManager: { getEntries: entries },
      }) as unknown as ExtensionContext,
    theme: { fg: (_role, text) => text },
    thinking: () => 'off',
    subscriptionProviders: [],
    subagentCost: () => 0,
    workspace: () => ({ cwd: '.' }),
    cost: () => data,
    height: () => 20,
  });
  const readCount = () =>
    Object.values(reads).map((spy) => spy.mock.calls.length);
  return { config, data, panel, entries, readCount };
}

it('renders Cost from cached tracker state only, with no reads while the revision is unchanged', async () => {
  const { data, panel, entries, readCount } = await costFixture();
  data.update(
    stateOf(liveTask('a', 1, 'running'), liveTask('b', 0.5, 'completed')),
    1000,
  );
  const first = panel.render(50);
  expect(first.join('\n')).toContain('↑');
  const settled = readCount();
  const sessionReads = entries.mock.calls.length;
  for (let i = 0; i < 20; i++) expect(panel.render(50)).toBe(first);
  expect(readCount()).toEqual(settled);
  // An identical snapshot changes nothing, so it neither bumps nor replans.
  const revision = data.revision;
  data.update(
    stateOf(liveTask('a', 1, 'running'), liveTask('b', 0.5, 'completed')),
    2000,
  );
  expect(data.revision).toBe(revision);
  expect(panel.render(50)).toBe(first);
  expect(readCount()).toEqual(settled);
  expect(entries.mock.calls.length).toBe(sessionReads);
});

it('replans Cost once when only a hidden running state changes, reading cached values', async () => {
  const { data, panel, entries, readCount } = await costFixture();
  const tasks = Array.from({ length: 12 }, (_, i) =>
    liveTask(`t${i}`, 12 - i, i === 0 || i === 10 ? 'running' : 'completed'),
  );
  data.update(stateOf(...tasks), 1000);
  const running = panel.render(50);
  expect(running.find((row) => row.includes('+8 more tasks'))).toContain('↑');
  const before = readCount();
  const revision = data.revision;
  const sessionReads = entries.mock.calls.length;
  // Same costs and names; rank eleven stops while rank one keeps running.
  tasks[10] = liveTask('t10', 2, 'completed');
  data.update(stateOf(...tasks), 2000);
  expect(data.revision).toBe(revision + 1);
  const idle = panel.render(50);
  expect(idle).not.toBe(running);
  expect(idle[0]).toBe(running[0]);
  expect(idle.find((row) => row.includes('+8 more tasks'))).not.toContain('↑');
  // One plan reads each cached value once.
  expect(readCount().map((n, i) => n - before[i])).toEqual([1, 1, 1, 1, 1]);
  expect(entries.mock.calls.length).toBe(sessionReads);
  const settled = readCount();
  for (let i = 0; i < 20; i++) expect(panel.render(50)).toBe(idle);
  expect(readCount()).toEqual(settled);
  data.update(stateOf(...tasks), 3000);
  expect(data.revision).toBe(revision + 1);
  expect(panel.render(50)).toBe(idle);
  expect(readCount()).toEqual(settled);
});

const STYLES = ['thin', 'classic'] as const;
const LEGEND = { thin: '●○', classic: '●░' } as const;

it.each(
  STYLES,
)('bounds the work behind a Cost replan by the legend, not by the tracked tasks (%s)', async (bars) => {
  const { data, panel, readCount } = await costFixture({ bars });
  data.update(
    stateOf(
      ...Array.from({ length: 200 }, (_, i) =>
        liveTask(`t${i}`, 0.01 + i / 1000, i % 2 ? 'running' : 'completed'),
      ),
    ),
    1000,
  );
  const lines = panel.render(50);
  expect(data.count()).toBe(200);
  expect(data.ranked()).toHaveLength(10);
  // Four ranked tasks and one remainder, however many tasks are tracked.
  const legend = lines
    .map(stripSgr)
    .filter((line) => new RegExp(`^│ [${LEGEND[bars]}] `).test(line));
  expect(legend).toHaveLength(5);
  expect(legend.at(-1)).toMatch(/\+196 more tasks.*↑ │$/);
  expect(Math.max(...readCount())).toBeLessThanOrEqual(3);
});

it('replans once when the bar style changes and rebuilds Cost and Context from cached state', async () => {
  const { config, data, panel, entries, readCount } = await costFixture({
    panels: ['session', 'cost'],
    usage: { tokens: 52000, percent: 52, contextWindow: 100000 },
  });
  data.update(
    stateOf(liveTask('a', 1, 'running'), liveTask('b', 0.5, 'completed')),
    1000,
  );
  const lines = (style: 'thin' | 'classic') =>
    panel
      .render(50)
      .map(stripSgr)
      .filter((line) =>
        style === 'thin'
          ? /^│ [━╸]+ │$|Context +━+╾?─* 52%/.test(line)
          : /^│ [█▌]+ │$|Context +█+[▏▎▍▌▋▊▉]?░+ 52%/.test(line),
      );
  // No saved style draws the default hairlines.
  const thin = panel.render(50);
  expect(lines('thin')).toHaveLength(2);
  const sessionReads = entries.mock.calls.length;
  const settled = readCount();
  for (let i = 0; i < 20; i++) expect(panel.render(50)).toBe(thin);
  expect(readCount()).toEqual(settled);
  // The settings overlay mutates the shared config in place and nothing else.
  config.bars = 'classic';
  const classic = panel.render(50);
  expect(classic).not.toBe(thin);
  expect(lines('classic')).toHaveLength(2);
  expect(lines('thin')).toHaveLength(0);
  const replanned = readCount().map((n, i) => n - settled[i]);
  expect(replanned.slice(0, 4).every((n) => n >= 1)).toBe(true);
  expect(replanned[4]).toBe(0); // No remainder to read for these two tasks.
  expect(entries.mock.calls.length).toBe(sessionReads);
  const classicSettled = readCount();
  for (let i = 0; i < 20; i++) expect(panel.render(50)).toBe(classic);
  expect(readCount()).toEqual(classicSettled);
  // Switching back replans once more and restores the first rendering.
  config.bars = 'thin';
  expect(panel.render(50).map(stripSgr)).toEqual(thin.map(stripSgr));
  expect(entries.mock.calls.length).toBe(sessionReads);
});
