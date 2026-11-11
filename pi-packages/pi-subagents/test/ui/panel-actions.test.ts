import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { afterEach, expect, it, vi } from 'vitest';
import { truncateToWidth, visibleWidth } from '../../src/render/text-width.js';
import type { SubagentTask } from '../../src/types.js';
import { SubagentsHistoryPanel } from '../../src/ui/subagents-history-panel.js';

const panels: SubagentsHistoryPanel[] = [];
afterEach(() => {
  for (const panel of panels.splice(0)) panel.dispose();
});
const task = (overrides: Partial<SubagentTask> = {}): SubagentTask => ({
  id: 't',
  display_name: 'Worker one',
  agent: 'worker',
  mode: 'background',
  status: 'running',
  task: 'Do work',
  created_at: '2026-01-01',
  session_id: 'session',
  timeout_deadline_at: Date.now() + 60000,
  timeout_max_extensions: 2,
  ...overrides,
});
function mount(
  current: SubagentTask,
  options = {},
  cancel = vi.fn(),
  key = 'x',
) {
  const panel = new SubagentsHistoryPanel(
    [current],
    {
      fg(role: string, value: string) {
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
        return value;
      },
    },
    vi.fn(),
    (a, b) => a === b,
    visibleWidth,
    truncateToWidth,
    {},
    42,
    undefined,
    undefined,
    cancel,
    key,
    options,
  );
  panels.push(panel);
  return panel;
}
const text = (panel: SubagentsHistoryPanel) =>
  panel.render(160).map(stripTerminalSequences).join('\n');
it.each([
  'queued',
  'running',
  'stopping',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
] as const)('cancel eligibility for %s', (status) => {
  const cancel = vi.fn();
  const panel = mount(task({ status }), {}, cancel);
  const eligible = status === 'queued' || status === 'running';
  expect(text(panel).includes('x cancel')).toBe(eligible);
  panel.handleInput('x');
  if (eligible) {
    expect(text(panel)).toContain(
      '⚠ Cancel Worker one? Stops the running task. Enter confirm · Esc keep',
    );
    expect(cancel).not.toHaveBeenCalled();
    panel.handleInput('\r');
    expect(cancel).toHaveBeenCalledWith('t');
  } else expect(cancel).not.toHaveBeenCalled();
});
it.each([
  {},
  { session_id: 'other' },
  { status: 'queued' },
  { timeout_deadline_at: undefined },
  { timeout_extensions_used: 2 },
] as Partial<SubagentTask>[])('extends only eligible current-session tasks: %j', (overrides) => {
  const extend = vi.fn();
  const panel = mount(task(overrides), {
    currentSessionId: 'session',
    extensionForTask: () => ({
      incrementMs: 120000,
      remaining: 2 - (overrides.timeout_extensions_used ?? 0),
    }),
    extendDeadline: extend,
  });
  const eligible = Object.keys(overrides).length === 0;
  expect(text(panel).includes('e extend')).toBe(eligible);
  panel.handleInput('e');
  if (!eligible) {
    expect(extend).not.toHaveBeenCalled();
    return;
  }
  expect(text(panel)).toContain(
    '⚠ Extend Worker one by 2m? 2 extensions left. Enter confirm · Esc back',
  );
  panel.handleInput('\x1b');
  expect(extend).not.toHaveBeenCalled();
  panel.handleInput('e');
  panel.handleInput('\r');
  expect(extend).toHaveBeenCalledExactlyOnceWith('t', undefined, 'session');
});
it('copies the unwrapped plain Result, including failed Result decoration', () => {
  const write = vi.fn();
  const current = task({
    status: 'failed',
    error: '\x1b[31mOops\x1b[0m\nnext',
  });
  const panel = mount(current, { clipboardWrite: write });
  expect(text(panel)).toContain('y copy');
  panel.handleInput('y');
  expect(write).toHaveBeenCalledExactlyOnceWith(
    '\x1b]52;c;4pyXIEZhaWxlZCDigJQgT29wcwpuZXh0\x07',
  );
  expect(text(panel)).toContain('✓ Result copied');
});
it.each([
  [undefined, 'small', '⚠ Copy not supported by this terminal'],
  [vi.fn(), 'x'.repeat(100001), '⚠ Result too large to copy'],
] as const)('reports clipboard limitations', (clipboardWrite, result, notice) => {
  const panel = mount(task({ status: 'completed', result }), {
    clipboardWrite,
  });
  panel.handleInput('y');
  expect(text(panel)).toContain(notice);
});
it('hides copy without terminal Result text', () => {
  for (const current of [task(), task({ status: 'completed' })]) {
    const panel = mount(current);
    expect(text(panel)).not.toContain('y copy');
  }
});
it.each([
  'throw',
  'reject',
] as const)('shows extension %s inline', async (mode) => {
  const panel = mount(task(), {
    currentSessionId: 'session',
    extensionForTask: () => ({ incrementMs: 120000, remaining: 2 }),
    extendDeadline: () => {
      if (mode === 'throw') throw new Error('deadline elapsed');
      return Promise.reject(new Error('deadline elapsed'));
    },
  });
  panel.handleInput('e');
  panel.handleInput('\r');
  await Promise.resolve();
  await Promise.resolve();
  expect(text(panel)).toContain('✗ Extend failed: deadline elapsed');
});

it('does not interpret the manager cancel task result as a notice', () => {
  const current = task();
  const panel = mount(
    current,
    {},
    vi.fn(() => ({ ...current, status: 'stopping' })),
  );
  text(panel);
  panel.handleInput('x');
  expect(text(panel)).toContain('Cancel Worker one?');
  panel.handleInput(String.fromCharCode(13));
  expect(text(panel)).not.toContain('undefined');
});

it('refreshes effective timeout in header, Metrics and details after extension completes', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:04:00Z'));
  const current = task({
    started_at: '2026-01-01T00:00:00Z',
    timeout_started_at: Date.parse('2026-01-01T00:00:00Z'),
    timeout_deadline_at: Date.parse('2026-01-01T00:30:00Z'),
    timeout_extensions_used: 0,
    timeout_max_extensions: 3,
  });
  const requestRender = vi.fn();
  const panel = mount(current, {
    timeoutMs: 1800000,
    currentSessionId: 'session',
    requestRender,
    extensionForTask: () => ({ incrementMs: 1800000, remaining: 3 }),
    extendDeadline: async () => {
      await Promise.resolve();
      current.timeout_deadline_at! += 1800000;
      current.timeout_extensions_used = 1;
      return current;
    },
  });
  try {
    expect(text(panel)).toContain('running 4m / 30m');
    panel.handleInput('e');
    panel.handleInput('\r');
    requestRender.mockClear();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(requestRender).toHaveBeenCalled();
    expect(text(panel)).toContain('running 4m / 1h');
    panel.handleInput('5');
    expect(text(panel)).toMatch(/Timeout\s+1h/);
    expect(text(panel)).toMatch(/Extensions\s+1\/3/);
    panel.handleInput('2');
    panel.handleInput('i');
    expect(text(panel)).toContain('1h · 56m left · extended 1/3');
  } finally {
    vi.useRealTimers();
  }
});
