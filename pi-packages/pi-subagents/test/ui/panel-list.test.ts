import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  frames,
  icon,
  statusIcon,
} from '../../../pi-thoth-theme/src/shared/icons.js';
import { truncateToWidth, visibleWidth } from '../../src/render/text-width.js';
import type { SubagentTask } from '../../src/types.js';
import { SubagentsHistoryPanel } from '../../src/ui/subagents-history-panel.js';

const task = (overrides: Partial<SubagentTask> = {}): SubagentTask => ({
  id: 'task',
  agent: 'worker',
  display_name: 'Review',
  mode: 'background',
  status: 'completed',
  task: 'inspect',
  result: 'done',
  created_at: '2026-01-01T00:00:00Z',
  ended_at: '2026-01-01T00:00:45Z',
  ...overrides,
});
const panels: SubagentsHistoryPanel[] = [];
afterEach(() => {
  for (const panel of panels.splice(0)) panel.dispose();
  vi.useRealTimers();
});
function mount(tasks: SubagentTask[], height = 25) {
  const fg = vi.fn((_role: string, text: string) => text);
  const panel = new SubagentsHistoryPanel(
    tasks,
    { fg, bold: (text: string) => text },
    () => {},
    () => false,
    visibleWidth,
    truncateToWidth,
    {},
    height,
  );
  panels.push(panel);
  return { panel, fg };
}
function leftCells(panel: SubagentsHistoryPanel, width = 120) {
  return panel
    .render(width)
    .map(stripTerminalSequences)
    .map((row) => row.split('│')[1]?.slice(1, -1) ?? '');
}

describe('status-first execution list', () => {
  it.each([
    [90, '›✓ shared-prefix…  45s'],
    [120, '›✓ shared-prefix-w…  45s $0.38'],
  ])('end-truncates only the name and aligns duration/cost at width %i', (width, expected) => {
    const { panel } = mount([
      task({
        display_name: 'shared-prefix-worker-with-a-long-name',
        usage: { cost: 0.38 } as SubagentTask['usage'],
      }),
    ]);
    expect(leftCells(panel, width)).toContain(expected);
  });

  it.each([
    [92, false],
    [96, true],
  ] as const)('shows five-column cost only at inner width >=24 (%i)', (width, shown) => {
    const { panel } = mount([
      task({ usage: { cost: 12.4 } as SubagentTask['usage'] }),
    ]);
    const row = leftCells(panel, width).find((row) => row.startsWith('›✓'))!;
    expect(row.includes('$12.4')).toBe(shown);
    expect(row.endsWith(shown ? ' 45s $12.4' : ' 45s')).toBe(true);
  });

  it.each([
    [9.999, '$10.0'],
    [99.99, ' $100'],
    [9999.9, ' $10k'],
  ])('keeps rounded cost %s inside five columns', (cost, expected) => {
    const { panel } = mount([
      task({ usage: { cost } as SubagentTask['usage'] }),
    ]);
    const row = leftCells(panel).find((row) => row.startsWith('›✓')) ?? '';
    expect(row.slice(-5)).toBe(expected);
    expect(row.slice(-10, -6)).toBe(' 45s');
  });

  it('measures wide names in cells and preserves metrics at every supported layout width', () => {
    const { panel } = mount([
      task({
        display_name: '日本語🚀'.repeat(20),
        usage: { cost: 0.38 } as SubagentTask['usage'],
      }),
    ]);
    for (const width of [40, 60, 80, 90, 96, 120, 160]) {
      const rows = panel.render(width);
      expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
      const row = leftCells(panel, width).find((row) => row.startsWith('›✓'))!;
      expect(row).toContain('…');
      expect(row).toContain('45s');
    }
  });

  it.each([
    ['2026-01-01T00:00:45Z', ' 45s'],
    ['2026-01-01T00:04:59Z', '  4m'],
    ['2026-01-01T00:12:30Z', ' 12m'],
    ['2026-01-01T01:05:30Z', '1h5m'],
  ])('uses a four-column compact duration ending at %s', (ended_at, duration) => {
    const { panel } = mount([task({ ended_at })]);
    expect(
      leftCells(panel, 90)
        .find((row) => row.startsWith('›✓'))
        ?.slice(-4),
    ).toBe(duration);
  });

  it('leaves queued duration and unknown/zero cost blank and uses the same full-width narrow row', () => {
    const { panel } = mount([
      task({ status: 'queued' }),
      task({ id: 'other', usage: { cost: 0 } as SubagentTask['usage'] }),
    ]);
    const cells = leftCells(panel, 60);
    expect(cells.find((row) => row.startsWith('›○ Review'))).toBe(
      `›○ Review${' '.repeat(47)}`,
    );
    expect(cells.find((row) => row.startsWith(' ✓ Review'))).toBe(
      ` ✓ Review${' '.repeat(37)} 45s      `,
    );
  });
  it.each([
    ['queued', '○', 'dim'],
    ['running', '◐', 'accent'],
    ['stopping', '▲', 'warning'],
    ['completed', '✓', 'success'],
    ['failed', '✗', 'error'],
    ['cancelled', '■', 'muted'],
    ['interrupted', '◷', 'warning'],
  ] as const)('renders %s with its static semantic glyph and role', (status, glyph, role) => {
    const { panel, fg } = mount([task({ status })]);
    const cells = leftCells(panel);
    expect(cells.some((row) => row.startsWith(`›${glyph} Review`))).toBe(true);
    expect(fg).toHaveBeenCalledWith(role, glyph);
    expect(cells.some((row) => row.includes(`Review:${status}`))).toBe(false);
  });
});

describe('execution list summary', () => {
  const entries = () => [
    task({
      id: 'running',
      status: 'running',
      usage: { cost: 1.21 } as SubagentTask['usage'],
    }),
    ...Array.from({ length: 18 }, (_, i) =>
      task({
        id: `done-${i}`,
        usage: { cost: i === 0 ? 3 : 0 } as SubagentTask['usage'],
      }),
    ),
    ...(['failed', 'cancelled', 'interrupted'] as const).map((status) =>
      task({ id: status, status }),
    ),
  ];
  it('counts live/completed/unsuccessful groups and sums known costs with semantic roles', () => {
    const { panel, fg } = mount(entries());
    const cells = leftCells(panel);
    expect(cells.map((row) => row.trimEnd())).toContain('◐1 ✓18 ✗3 · $4.21');
    expect(fg).toHaveBeenCalledWith('accent', '◐1');
    expect(fg).toHaveBeenCalledWith('success', '✓18');
    expect(fg).toHaveBeenCalledWith('error', '✗3');
  });
  it('counts queued as live and stopping as attention, omits zeros and refreshes from current tasks', () => {
    const tasks = [
      task({ status: 'queued' }),
      task({ id: 'stopping', status: 'stopping' }),
    ];
    const { panel } = mount(tasks);
    expect(leftCells(panel).map((row) => row.trimEnd())).toContain('◐1 ⚠1');
    tasks.splice(0, tasks.length, task());
    expect(leftCells(panel).map((row) => row.trimEnd())).toContain('✓1');
  });
  it('sits immediately above the narrow list and hides below sixteen rows', () => {
    const { panel } = mount([task()]);
    const cells = leftCells(panel, 60);
    expect(
      cells[
        cells.findIndex((row) => row.includes('↓ Completed')) - 1
      ]?.trimEnd(),
    ).toBe('✓1');
    const small = mount([task()], 15).panel;
    expect(leftCells(small, 60).map((row) => row.trimEnd())).not.toContain(
      '✓1',
    );
  });
  it.each([
    ['run', 'done', 'fail', 'run1 done18 fail3'],
    ['running', 'completed', 'failed', 'running1 failed3'],
    ['running', 'completed', 'unsuccessful-end', 'unsuccessful-end3'],
  ])('drops cost then completed then live, retaining failures (%s)', (running, completed, failed, expected) => {
    const kit = createTestRenderKit();
    kit.statusGlyph = (_theme, status) =>
      ({ running, completed, failed })[status as 'running'] ?? '?';
    const token = registerRenderKit(kit, {});
    onTestFinished(() => withdrawRenderKit(token));
    const { panel } = mount(entries());
    const cells = leftCells(panel, 90).map((row) => row.trimEnd());
    expect(cells).toContain(expected);
    expect(cells.find((row) => row === expected)).not.toContain('$');
  });
});

describe('execution groups and filtering', () => {
  it('groups live attention before running, completed and failed, newest first, and retains selection across regrouping', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:01:25Z'));
    const tasks = [
      task({
        id: 'done',
        display_name: 'Old done',
        created_at: '2026-01-01T00:00:01Z',
      }),
      task({
        id: 'new',
        display_name: 'New done',
        created_at: '2026-01-01T00:00:02Z',
      }),
      task({
        id: 'run',
        status: 'running',
        display_name: 'Healthy',
        started_at: '2026-01-01T00:00:00Z',
        timeout_deadline_at: Date.parse('2026-01-01T00:02:00Z'),
      }),
      task({
        id: 'near',
        status: 'running',
        display_name: 'Near',
        started_at: '2026-01-01T00:00:00Z',
        timeout_deadline_at: Date.parse('2026-01-01T00:01:40Z'),
      }),
      task({ id: 'stop', status: 'stopping', display_name: 'Stopping' }),
      task({ id: 'fail', status: 'failed', display_name: 'Failure' }),
      task({
        id: 'historical',
        display_name: 'History',
        timeout_deadline_at: 1,
        pending_questions: [
          {
            request_id: 'q',
            message: 'Help',
            created_at: '2026-01-01T00:01:00Z',
          },
        ],
      }),
      task({
        id: 'ask',
        status: 'running',
        display_name: 'Question',
        pending_questions: [
          {
            request_id: 'q',
            message: 'Help',
            created_at: '2026-01-01T00:01:00Z',
          },
        ],
      }),
    ];
    const { panel, fg } = mount(tasks, 36);
    const cells = leftCells(panel);
    const rendered = cells.join('\n');
    expect(rendered).toContain('Needs attention');
    expect(
      cells
        .filter((row) =>
          /↓ (Needs attention|Running|Completed|Failed)/.test(row),
        )
        .map((row) => row.trim()),
    ).toEqual([
      '↓ Needs attention            3',
      '↓ Running                    1',
      '↓ Completed                  3',
      '↓ Failed                     1',
    ]);
    expect(rendered.indexOf('New done')).toBeLessThan(
      rendered.indexOf('Old done'),
    );
    expect(rendered).toContain('⚠ Near');
    expect(rendered).toContain('⚠ Question');
    expect(rendered).toContain('▲ Stopping');
    expect(rendered).toContain('◐ Healthy');
    expect(rendered).toContain('✓ History');
    expect(fg).toHaveBeenCalledWith('warning', '⚠');
    expect(rendered).toContain('⚠3');
    const nearRow = panel
      .render(120)
      .findIndex((row) => row.includes('⚠ Near'));
    panel.handleMouse({ type: 'click', row: nearRow, col: 5 });
    tasks.find((entry) => entry.id === 'near')!.status = 'completed';
    // The selected near-deadline item moves groups without selecting its neighbour.
    expect(panel.render(120).map(stripTerminalSequences).join('\n')).toContain(
      '›✓ Near',
    );
  });

  it.each([
    'REVIEW',
    'WORKER',
    'COMPLETED',
  ])('filters case-insensitive name/agent/status substring %s', (query) => {
    const { panel } = mount([
      task(),
      task({
        id: 'other',
        display_name: 'Different',
        agent: 'builder',
        status: 'failed',
      }),
    ]);
    panel.handleInput('/');
    panel.handleInput(query);
    const rendered = panel.render(120).map(stripTerminalSequences).join('\n');
    expect(rendered).toContain('1/2');
    expect(rendered).toContain('Review');
    expect(rendered).not.toContain('Different');
  });
});

describe('attention deadline boundaries', () => {
  it.each([
    [79_999, false],
    [80_000, false],
    [80_001, true],
    [100_001, true],
  ])('uses strictly less than 20 percent remaining at elapsed %i', (elapsed, attention) => {
    vi.useFakeTimers();
    const start = Date.parse('2026-01-01T00:00:00Z');
    vi.setSystemTime(start + elapsed);
    const { panel } = mount([
      task({
        status: 'running',
        started_at: new Date(start).toISOString(),
        ended_at: undefined,
        timeout_deadline_at: start + 100_000,
      }),
    ]);
    const rendered = leftCells(panel).join('\n');
    expect(rendered.includes('Needs attention')).toBe(attention);
    expect(rendered.includes('⚠ Review')).toBe(attention);
  });
  it('uses the current deadline start after an attempt restart and ignores invalid deadlines', () => {
    vi.useFakeTimers();
    const start = Date.parse('2026-01-01T00:00:00Z');
    vi.setSystemTime(start + 85_000);
    const { panel } = mount([
      task({
        id: 'restart',
        status: 'running',
        started_at: new Date(start).toISOString(),
        timeout_started_at: start + 80_000,
        timeout_deadline_at: start + 100_000,
      }),
      task({
        id: 'invalid',
        status: 'running',
        timeout_deadline_at: Number.NaN,
      }),
    ]);
    expect(leftCells(panel).join('\n')).not.toContain('Needs attention');
  });
});

describe('group overview and compact attention summary', () => {
  it('renders label, status counts and total cost instead of an execution body when a header is selected', () => {
    const { panel } = mount([
      task({ usage: { cost: 1.25 } as SubagentTask['usage'] }),
    ]);
    panel.render(120);
    panel.handleInput('\u001b[D');
    const rendered = panel.render(120).map(stripTerminalSequences).join('\n');
    expect(rendered).toContain('Completed');
    expect(rendered).toContain('Total: 1');
    expect(rendered).toContain('completed: 1');
    expect(rendered).toContain('Total cost: $1.25');
    expect(rendered).not.toContain('delegated task');
  });
  it('retains attention and failures after dropping cost, completed and live counts', () => {
    const kit = createTestRenderKit();
    kit.statusGlyph = (_theme, status) =>
      status === 'failed' ? '✗' : 'a-very-long-status';
    const token = registerRenderKit(kit, {});
    onTestFinished(() => withdrawRenderKit(token));
    const { panel } = mount([
      task({ id: 'stop', status: 'stopping' }),
      task({ id: 'fail', status: 'failed' }),
      task({ id: 'run', status: 'running' }),
      task({ id: 'done', usage: { cost: 1 } as SubagentTask['usage'] }),
    ]);
    expect(leftCells(panel, 90).map((row) => row.trimEnd())).toContain('✗1 ⚠1');
  });
});

it.each([
  'nerd',
  'unicode',
  'ascii',
] as const)('uses pairwise-distinct status and attention glyphs in %s mode', (mode) => {
  const kit = createTestRenderKit({
    icon: (name) =>
      name === 'spinnerFrames' || name === 'workingFrames'
        ? frames(name, mode)
        : icon(name, mode),
  });
  kit.statusGlyph = (_theme, status) => statusIcon(status, mode);
  const token = registerRenderKit(kit, {});
  onTestFinished(() => withdrawRenderKit(token));
  const glyphs = (
    [
      'queued',
      'running',
      'stopping',
      'completed',
      'failed',
      'cancelled',
      'interrupted',
      'attention',
    ] as const
  ).map((status) => {
    const { panel } = mount([
      task({
        status: status === 'attention' ? 'running' : status,
        pending_questions:
          status === 'attention'
            ? [{ request_id: 'q', message: 'Help', created_at: '' }]
            : undefined,
      }),
    ]);
    const row = panel
      .render(160)
      .map(stripTerminalSequences)
      .find((row) => row.includes('Review') && !row.includes('worker'))!;
    const glyph = row
      .split(icon('boxVertical', mode))[1]
      .trim()
      .slice(icon('selection', mode).length)
      .trim()
      .split(' ')[0];
    expect(glyph?.length).toBeGreaterThan(0);
    return glyph;
  });
  expect(new Set(glyphs).size).toBe(8);
});
