import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  registerRenderKit,
  registerWorkPanelProvider,
  WORK_PANEL_VERSION,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import {
  renderWorkPanelRow,
  truncatePanelText,
} from '@thoth-agents/pi-core/panel';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import type { SidebarConfig } from '../src/config.js';
import { SidebarPanels } from '../src/panels/sidebar.js';

const disposers: Array<() => void> = [];
afterEach(() => {
  for (const off of disposers.splice(0).reverse()) off();
  vi.useRealTimers();
});
const theme = { fg: (_role: string, value: string) => value };
function context() {
  return {
    cwd: '/project',
    model: { id: 'test-model', provider: 'claude-bridge' },
    thinkingLevel: 'high',
    getContextUsage: () => ({
      tokens: 12345,
      percent: 12.345,
      contextWindow: 100000,
    }),
    sessionManager: {
      getEntries: () => [
        {
          type: 'message',
          message: { role: 'assistant', usage: { cost: { total: 1.25 } } },
        },
      ],
    },
  } as unknown as ExtensionContext;
}

it('stacks configured panels in order, uses fresh discovered rows and kit, bounds height and hides disabled panels', () => {
  let primary = 'First task';
  let changed = () => {};
  const off = registerWorkPanelProvider(
    { on() {} } as any,
    {
      version: WORK_PANEL_VERSION,
      id: 'test-source',
      onVisibleChanged: (listener: () => void) => {
        changed = listener;
        return () => {};
      },
      label: 'Tasks',
      priority: 10,
      visibleCount: () => 1,
      listRows: () => [{ id: 'one', primary, status: 'running' }],
      detail: () => undefined,
      armCloseLabel: () => '',
      close: () => {},
    } as any,
  );
  disposers.push(off);
  const config: SidebarConfig = {
    startup: 'auto',
    panels: [
      { id: 'test-source', visible: true },
      { id: 'workspace', visible: true },
      { id: 'session', visible: true },
    ],
  };
  const panel = new SidebarPanels({
    config,
    context: context,
    theme,
    thinking: () => 'off',
    subscriptionProviders: [],
    subagentCost: () => 0,
    workspace: () => ({ cwd: '/project', branch: 'main' }),
    height: () => 30,
  });
  const token = registerRenderKit(createTestRenderKit(), {});
  disposers.push(() => withdrawRenderKit(token));
  const text = panel.render(44).join('\n');
  expect(text.indexOf('TASKS')).toBeLessThan(text.indexOf('WORKSPACE'));
  expect(text.indexOf('WORKSPACE')).toBeLessThan(text.indexOf('SESSION'));
  expect(text).toContain('First task');
  primary = 'Updated task';
  changed();
  expect(panel.render(44).join('\n')).toContain('Updated task');
  expect(panel.sourceIds()).toEqual(['test-source']);
  config.panels[0].visible = false;
  expect(panel.render(44).join('\n')).not.toContain('Updated task');
  expect(panel.sourceIds()).toEqual([]);
  config.panels[0].visible = true;
  for (let height = 0; height < 20; height++) {
    const lines = panel.renderAt(28, height);
    expect(lines.length).toBeLessThanOrEqual(height);
  }
  // Panels fill in configured order; the second collapses to its title line.
  const short = panel.renderAt(44, 6).join('\n');
  expect(short).toContain('TASKS');
  expect(short).toContain('WORKSPACE');
  expect(short).not.toContain('SESSION');
  withdrawRenderKit(token);
  expect(panel.render(44).join('\n')).toContain('SESSION');
});

function sourcePanel(
  rows: import('@thoth-agents/pi-core').WorkPanelRow[],
  customTheme: import('@thoth-agents/pi-core').RenderKitTheme = theme,
) {
  disposers.push(
    registerWorkPanelProvider(
      { on() {} } as any,
      {
        version: WORK_PANEL_VERSION,
        id: 'retention',
        label: 'Background',
        priority: 10,
        rowCap: 2,
        visibleCount: () => rows.length,
        listRows: () => rows,
        detail: () => undefined,
        armCloseLabel: () => '',
        close() {},
      } as any,
    ),
  );
  return new SidebarPanels({
    config: { startup: 'auto', panels: [{ id: 'retention', visible: true }] },
    context,
    theme: customTheme,
    thinking: () => 'off',
    subscriptionProviders: [],
    subagentCost: () => 0,
    workspace: () => ({ cwd: '/project' }),
    height: () => 100,
  });
}

it('keeps live rows and only the five newest terminal items, independently of provider caps', () => {
  const panel = sourcePanel([
    { id: 'live', primary: 'live item', state: 'running', status: 'running' },
    ...Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      primary: `finished ${i}`,
      state: (i % 2 ? 'failed' : 'done') as 'failed' | 'done',
      status: i % 2 ? 'failed' : 'completed',
      endedAt: i * 1000,
    })),
    { id: 'pending', primary: 'pending item', status: 'pending' },
    { id: 'summary', primary: '+99 stale summary', summary: true },
  ]);
  const text = panel.render(60).join('\n');
  expect(text).toContain('live item');
  expect(text).toContain('pending item');
  expect(text.indexOf('live item')).toBeLessThan(text.indexOf('pending item'));
  expect(text.indexOf('pending item')).toBeLessThan(text.indexOf('finished 7'));
  expect(text).not.toContain('finished 2');
  expect(text).not.toContain('stale summary');
  for (const i of [7, 6, 5, 4])
    expect(text.indexOf(`finished ${i}`)).toBeLessThan(
      text.indexOf(`finished ${i - 1}`),
    );
  expect(text).not.toContain('+3 more'); // discarded history is not height overflow
});

it.each([
  {
    sequence: ['finished-A', 'pending-B', 'finished-C', 'running-D'],
    retained: ['finished-A', 'pending-B', 'finished-C', 'running-D'],
  },
  {
    sequence: [
      'finished-A',
      'pending-B',
      'finished-C',
      'running-D',
      'finished-E',
      'finished-F',
      'finished-G',
      'finished-H',
      'finished-I',
    ],
    retained: [
      'pending-B',
      'running-D',
      'finished-E',
      'finished-F',
      'finished-G',
      'finished-H',
      'finished-I',
    ],
  },
])('keeps the full untimestamped provider sequence, retaining the last five finished rows: $sequence', ({
  sequence,
  retained,
}) => {
  const rows = sequence.map((primary) => ({
    id: primary,
    primary,
    status: primary.startsWith('finished')
      ? 'completed'
      : primary.startsWith('pending')
        ? 'pending'
        : 'running',
  }));
  const panel = sourcePanel(rows);
  const text = panel.render(60).join('\n');
  const renderedOrder = sequence
    .filter((primary) => text.includes(primary))
    .sort((a, b) => text.indexOf(a) - text.indexOf(b));
  expect(renderedOrder).toEqual(retained);
  expect(rows.map((row) => row.primary)).toEqual(sequence);
});

it.each([
  ['running', 'running', '◐'],
  ['succeeded', 'success', '✓'],
  ['failed', 'failed', '✗'],
  ['timed_out', 'failed', '✗'],
  ['cancelled', 'muted', '■'],
])('matches the host renderer for Background status %s', async (status, statusTone, glyph) => {
  const { renderWorkPanelRow } = await import('@thoth-agents/pi-core/panel');
  const row = {
    id: 'one',
    primary: 'build',
    status,
    statusTone: statusTone as any,
    identity: [{ text: 'build', role: 'primary' as const }],
    metrics: [{ segments: [{ text: 'elapsed 12s', role: 'meta' as const }] }],
  };
  const panel = sourcePanel([row]);
  // Terminal statuses are stable; freeze the animation clock for running parity.
  const { vi } = await import('vitest');
  vi.useFakeTimers();
  vi.setSystemTime(0);
  try {
    for (const width of [28, 44, 72]) {
      const expected = renderWorkPanelRow(row, {
        width: width - 4,
        now: 0,
        theme,
        clip: (text, size) => text.slice(0, size),
      });
      const rendered = panel.render(width).join('\n');
      expect(rendered).toContain(glyph);
      for (const line of expected) expect(rendered).toContain(line.trimEnd());
    }
  } finally {
    vi.useRealTimers();
  }
});

it('uses the task-list diamond and dim strikethrough, including with a render kit', () => {
  const token = registerRenderKit(createTestRenderKit(), {});
  disposers.push(() => withdrawRenderKit(token));
  const panel = sourcePanel(
    [
      {
        id: 'active',
        primary: 'active todo',
        status: 'in_progress',
        statusGlyph: 'taskInProgress',
      },
      {
        id: 'done',
        primary: 'done todo',
        status: 'completed',
        segments: [{ text: 'done todo', role: 'completed' }],
      },
    ],
    { ...theme, strikethrough: (text: string) => `~${text}~` },
  );
  const rendered = panel.render(44).join('\n');
  expect(rendered).toContain('◇ active todo');
  expect(rendered).toContain('✓ ~done todo~');
});

it('counts hidden retained items, not metric continuation lines or discarded history', () => {
  const panel = sourcePanel(
    Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      primary: `task ${i}`,
      status: 'completed',
      endedAt: i,
      identity: [{ text: `task ${i}`, role: 'primary' }],
      metrics: [
        {
          segments: [{ text: 'a very long metric continuation', role: 'meta' }],
        },
      ],
    })),
  );
  const rendered = panel.renderAt(28, 6).join('\n');
  expect(rendered).toContain('task 7');
  expect(rendered).toContain('+4 more');
  expect(rendered).not.toContain('+7 more');
});

it('shows resumed Agent history and uses the exact host clock frame for animated rows', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1200);
  const row = {
    id: 'active',
    primary: 'work',
    status: 'running',
    statusGlyph: 'running' as const,
  };
  disposers.push(
    registerWorkPanelProvider({ on() {} } as any, {
      version: WORK_PANEL_VERSION,
      id: 'resumed',
      label: 'Agents',
      priority: 10,
      visibleCount: () => 1,
      listRows: (_now, options) =>
        options?.includeHistory
          ? [
              row,
              {
                id: 'old',
                primary: 'Resumed finished',
                status: 'completed',
                state: 'done',
                endedAt: 1000,
              },
            ]
          : [row],
      detail: () => null,
      armCloseLabel: () => '',
      close: () => {},
    }),
  );
  const panel = new SidebarPanels({
    config: { startup: 'auto', panels: [{ id: 'resumed', visible: true }] },
    context,
    theme,
    thinking: () => 'off',
    subscriptionProviders: [],
    subagentCost: () => 0,
    workspace: () => ({ cwd: '/project' }),
    height: () => 30,
  });
  const lines = panel.render(44).join(String.fromCharCode(10));
  expect(lines).toContain('Resumed finished');
  expect(lines).toContain(
    renderWorkPanelRow(row, {
      width: 40,
      now: 1200,
      theme,
      clip: truncatePanelText,
    })[0].trim(),
  );
});

it.each<{
  label: string;
  status: Partial<import('@thoth-agents/pi-core').WorkPanelRow>;
  animated: boolean;
}>([
  {
    label: 'semantic in_progress override',
    status: { status: 'pending', statusGlyph: 'in_progress' },
    animated: true,
  },
  {
    label: 'running tone',
    status: { status: 'pending', statusTone: 'running' },
    animated: true,
  },
  {
    label: 'running state and status',
    status: { state: 'running', status: 'running' },
    animated: true,
  },
  {
    label: 'running state alone is not presentation',
    status: { state: 'running' },
    animated: false,
  },
  {
    label: 'queued live row',
    status: { state: 'running', status: 'queued' },
    animated: false,
  },
  {
    label: 'stopping live row',
    status: { state: 'running', status: 'stopping' },
    animated: false,
  },
  {
    label: 'static semantic override beats running tone',
    status: {
      state: 'running',
      status: 'running',
      statusTone: 'running',
      statusGlyph: 'queued',
    },
    animated: false,
  },
  {
    label: 'completed row',
    status: { state: 'done', status: 'completed' },
    animated: false,
  },
  {
    label: 'failed row',
    status: { state: 'failed', status: 'failed' },
    animated: false,
  },
  { label: 'cancelled row', status: { status: 'cancelled' }, animated: false },
])('ticks only for animated host presentation: $label', ({
  status,
  animated,
}) => {
  const panel = sourcePanel([{ id: 'one', primary: 'work', ...status }]);
  expect(panel.hasAnimation()).toBe(animated);
});
