import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it, onTestFinished, vi } from 'vitest';
import { truncateToWidth, visibleWidth } from '../../src/render/text-width.js';
import type { SubagentTask } from '../../src/types.js';
import { SubagentsHistoryPanel } from '../../src/ui/subagents-history-panel.js';

const panels: SubagentsHistoryPanel[] = [];
afterEach(() => {
  for (const panel of panels.splice(0)) panel.dispose();
  vi.useRealTimers();
});
const task = (overrides: Partial<SubagentTask> = {}): SubagentTask => ({
  id: 'task',
  agent: 'worker',
  display_name: 'Review',
  mode: 'background',
  status: 'completed',
  task: 'inspect',
  result: 'done',
  thread_snapshot: { version: 1, source: 'events', items: [] },
  created_at: '2026-01-01T00:00:00Z',
  ended_at: '2026-01-01T00:04:00Z',
  model: 'provider/model-name',
  effort: 'high',
  usage: {
    input: 127000,
    output: 184000,
    cacheRead: 26100000,
    cacheWrite: 352000,
    turns: 9,
    cost: 0.38,
    contextTokens: 383000,
  },
  ...overrides,
});
function mount(tasks = [task()], options = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:08:00Z'));
  const fg = vi.fn((role: string, text: string) => {
    if (
      ![
        'accent',
        'border',
        'borderMuted',
        'dim',
        'muted',
        'text',
        'success',
        'warning',
        'error',
        'mdHeading',
        'toolTitle',
      ].includes(role)
    )
      throw new Error(`Unknown theme color: ${role}`);
    return text;
  });
  const panel = new SubagentsHistoryPanel(
    tasks,
    { fg },
    () => {},
    (data, key) => data === key,
    visibleWidth,
    truncateToWidth,
    {},
    42,
    undefined,
    undefined,
    undefined,
    'x',
    options,
  );
  panels.push(panel);
  return { panel, fg };
}
const rows = (panel: SubagentsHistoryPanel, width = 160) =>
  panel.render(width).map(stripTerminalSequences);
const header = (panel: SubagentsHistoryPanel, width = 160) =>
  rows(panel, width).slice(1, 3).join('\n');
it('shows a two-line completed card without activity/stall or duplicated usage metadata', () => {
  const { panel } = mount(
    [
      task({
        last_activity: 'working',
        last_activity_at: '2026-01-01T00:01:00Z',
      }),
    ],
    { stallTimeoutMs: 60000, contextWindowForTask: () => 1000000 },
  );
  const text = header(panel);
  expect(text).toContain('✓ Review  worker · completed 4m ago · 4m');
  expect(text).toContain('$0.38');
  expect(text).toContain(
    'provider/model-name · high · 9 turns · ctx ████░░░░░░ 38%',
  );
  expect(text).not.toMatch(/stall|activity|usage:|agent:|status:/);
});
it.each([
  'running',
] as const)('shows %s activity, switching to a warning only after the stall threshold', (status) => {
  const current = task({
    status,
    ended_at: undefined,
    last_activity_at: '2026-01-01T00:06:00Z',
  });
  const { panel, fg } = mount([current], { stallTimeoutMs: 180000 });
  expect(header(panel)).toContain('last activity 2m ago');
  expect(header(panel)).not.toContain('stalled');
  current.last_activity_at = '2026-01-01T00:04:00Z';
  panel.invalidate();
  expect(header(panel)).toContain('⚠ stalled 4m');
  expect(fg).toHaveBeenCalledWith('warning', '⚠ stalled 4m');
});
it('toggles labeled details in the scrollable body and keeps the state across selection', () => {
  const { panel } = mount(
    [
      task({
        session_id: 'full-session-id',
        timeout_deadline_at: Date.parse('2026-01-01T00:10:20Z'),
        timeout_extensions_used: 1,
        timeout_max_extensions: 3,
      }),
      task({ id: 'second', display_name: 'Second', task: 'second task' }),
    ],
    { timeoutMs: 600000, contextWindowForTask: () => 1000000 },
  );
  expect(rows(panel).join('\n')).not.toContain('Cache read');
  panel.handleInput('2');
  panel.handleInput('i');
  panel.handleInput('home');
  const text = rows(panel).join('\n');
  expect(text).toContain('Input       127k');
  expect(text).toContain('Output      184k');
  expect(text).toContain('Cache read  26.1M');
  expect(text).toContain('Cache write 352k');
  expect(text).toContain('Context     383k / 1.0M (38%)');
  expect(text).toContain('Timeout     10m · 2m 20s left · extended 1/3');
  expect(text).toContain('Session     full-session-id');
  panel.handleInput('right');
  panel.handleInput('2');
  panel.handleInput('home');
  expect(rows(panel).join('\n')).toContain('Task        second task');
  panel.handleInput('2');
  panel.handleInput('i');
  expect(rows(panel).join('\n')).not.toContain('Cache read');
  panel.handleInput('?');
  expect(rows(panel).join('\n')).toMatch(/i\s+details/);
});
it.each([
  60, 90, 160,
])('keeps essential header tokens cell-bounded at width %i', (width) => {
  const { panel } = mount(
    [
      task({
        display_name: 'A-very-long-review-name-that-must-be-ellipsized'.repeat(
          4,
        ),
      }),
    ],
    { contextWindowForTask: () => 1000000 },
  );
  const text = header(panel, width);
  expect(text).toContain('completed');
  expect(text).toContain('4m');
  expect(text).toContain('$0.38');
  expect(text).toContain('…');
  expect(rows(panel, width).every((row) => visibleWidth(row) <= width)).toBe(
    true,
  );
});
it.each([
  [70, 'success'],
  [71, 'warning'],
  [90, 'warning'],
  [91, 'error'],
] as const)('colors context at %i percent with %s', (percent, role) => {
  const { panel, fg } = mount(
    [task({ usage: { ...task().usage!, contextTokens: percent * 10000 } })],
    { contextWindowForTask: () => 1000000 },
  );
  expect(header(panel)).toContain(`${percent}%`);
  expect(
    fg.mock.calls.some(
      ([color, text]) =>
        color === role && text.endsWith(`${percent}%`) && text.includes('█'),
    ),
  ).toBe(true);
});
it('renders context cells from measured runtime tokens and window without fabricated usage fields', () => {
  const { panel } = mount([
    task({
      usage: undefined,
      runtime_metrics: { contextTokens: 750, contextWindow: 1000 },
    }),
  ]);
  expect(header(panel)).toContain('ctx ████████░░ 75%');
});
it('shows measured runtime percent when the context window is unknown', () => {
  const { panel } = mount([task({ runtime_metrics: { contextPercent: 38 } })]);
  expect(header(panel)).toContain('ctx 38%');
  expect(header(panel)).not.toContain('█');
});
it('preserves a provider warning as a separate warning-role header row', () => {
  const { panel, fg } = mount(undefined, {
    providerLimits: { warningText: () => 'Rate limited: retry in 2m' },
  });
  expect(rows(panel)[3]).toContain('limit: Rate limited: retry in 2m');
  expect(fg).toHaveBeenCalledWith(
    'warning',
    'limit: Rate limited: retry in 2m',
  );
});
it('uses one details column in narrow layouts and two at inner width 70 or more', () => {
  const { panel } = mount();
  panel.handleInput('2');
  panel.handleInput('i');
  const narrow = rows(panel, 90);
  const wide = rows(panel, 160);
  expect(narrow.find((row) => row.includes('Input       127k'))).not.toContain(
    'Output',
  );
  expect(wide.find((row) => row.includes('Input       127k'))).toContain(
    'Output      184k',
  );
  expect(wide.join('\n')).not.toMatch(/ left|extended/);
});
it('wraps the entire task and full session id in the scrollable details with no cap', () => {
  const fullTask =
    Array.from({ length: 160 }, (_, i) => `word${i}`).join(' ') +
    ' FINAL_TASK_SENTINEL';
  const { panel } = mount([
    task({ task: fullTask, session_id: 'session-' + 'x'.repeat(140) + '-END' }),
  ]);
  panel.handleInput('2');
  panel.handleInput('i');
  const observed: string[] = [];
  for (let i = 0; i < 80; i++) {
    observed.push(...rows(panel, 60));
    panel.handleInput('down');
  }
  expect(observed.join('\n')).toContain('FINAL_TASK_SENTINEL');
  expect(observed.join('\n')).toContain('-END');
  expect(
    observed
      .filter((row) => row.includes('Task        '))
      .some((row) => row.includes('word0')),
  ).toBe(true);
});
it('uses ASCII context cells with an ASCII render kit', () => {
  const token = registerRenderKit(
    createTestRenderKit({
      icon: (name) =>
        name === 'boxHorizontal' ? '-' : name === 'ellipsis' ? '...' : name,
    }),
    {},
  );
  onTestFinished(() => withdrawRenderKit(token));
  const { panel } = mount(undefined, { contextWindowForTask: () => 1000000 });
  expect(header(panel)).toContain('ctx ####------ 38%');
  expect(header(panel)).not.toMatch(/[█░]/);
});
it('drops in order: shrink bar, relative end, turns, effort before shortening model', () => {
  const { panel } = mount(
    [task({ model: 'provider/very-long-model-identifier' })],
    { contextWindowForTask: () => 1000000 },
  );
  const wide = header(panel, 160);
  expect(wide).toContain('4m ago');
  expect(wide).toContain('high · 9 turns · ctx ████░░░░░░ 38%');
  const medium = header(panel, 90);
  expect(medium).not.toContain('4m ago');
  expect(medium).not.toContain('9 turns');
  expect(medium).toContain('high · ctx ██░░░░ 38%');
  const narrow = header(panel, 60);
  expect(narrow).not.toContain('high');
  expect(narrow).toContain('provider/very-long-model-identifier');
  expect(narrow).toContain('ctx ██░░░░ 38%');
});
it('preserves a stall warning ahead of a long name at narrow width', () => {
  const { panel } = mount(
    [
      task({
        status: 'running',
        ended_at: undefined,
        display_name: 'LongName'.repeat(30),
        last_activity_at: '2026-01-01T00:04:00Z',
      }),
    ],
    { stallTimeoutMs: 60000 },
  );
  expect(header(panel, 60)).toContain('⚠ stalled 4m');
  expect(header(panel, 60)).toContain('…');
});

it('shows stopping status without activity or stall diagnostics', () => {
  const current = task({
    status: 'stopping',
    ended_at: undefined,
    last_activity_at: '2026-01-01T00:06:00Z',
  });
  const { panel } = mount([current], { stallTimeoutMs: 180000 });
  expect(header(panel)).toContain('stopping');
  expect(header(panel)).not.toMatch(/last activity|stalled/);
  current.last_activity_at = '2026-01-01T00:04:00Z';
  panel.invalidate();
  expect(header(panel)).not.toMatch(/last activity|stalled/);
});

it.each([
  [Date.parse('2026-01-01T00:10:00Z'), false],
  [Date.parse('2026-01-01T00:09:00Z'), true],
])('colors deadline %i with warning %s only below 20 percent remaining', (deadline, warning) => {
  const { panel, fg } = mount([
    task({
      status: 'running',
      ended_at: undefined,
      started_at: '2026-01-01T00:00:00Z',
      timeout_started_at: Date.parse('2026-01-01T00:00:00Z'),
      timeout_deadline_at: deadline,
    }),
  ]);
  expect(header(panel)).toContain('running 8m / ');
  expect(
    fg.mock.calls.some(
      ([role, value]) => role === 'warning' && value.startsWith('/ '),
    ),
  ).toBe(warning);
});
it('omits timeout for terminal tasks and drops it before live status/duration at narrow width', () => {
  const { panel } = mount([
    task({
      display_name: 'A-long-running-worker-name',
      status: 'running',
      ended_at: undefined,
      started_at: '2026-01-01T00:00:00Z',
      timeout_started_at: Date.parse('2026-01-01T00:00:00Z'),
      timeout_deadline_at: Date.parse('2026-01-01T01:00:00Z'),
    }),
  ]);
  expect(header(panel)).toContain('running 8m / 1h');
  expect(header(panel, 40)).toContain('running 8m');
  expect(header(panel, 40)).not.toContain('/ 1h');
  const terminal = mount([
    task({ timeout_deadline_at: Date.parse('2026-01-01T01:00:00Z') }),
  ]).panel;
  expect(header(terminal)).toContain('completed 4m ago · 4m');
  expect(header(terminal)).not.toContain('/ 1h');
});
