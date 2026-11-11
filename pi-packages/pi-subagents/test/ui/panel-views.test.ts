import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { afterEach, expect, it, vi } from 'vitest';
import { truncateToWidth, visibleWidth } from '../../src/render/text-width.js';
import * as thread from '../../src/thread-view.js';
import type { SubagentTask } from '../../src/types.js';
import { SubagentsHistoryPanel } from '../../src/ui/subagents-history-panel.js';

const panels: SubagentsHistoryPanel[] = [];
afterEach(() => {
  for (const panel of panels.splice(0)) panel.dispose();
  vi.restoreAllMocks();
});
const task = (overrides: Partial<SubagentTask> = {}): SubagentTask => ({
  id: 'task',
  agent: 'worker',
  mode: 'background',
  status: 'completed',
  task: 'Original task',
  context: 'Original context',
  result: 'Final result',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});
function mount(current = task()) {
  const panel = new SubagentsHistoryPanel(
    [current],
    {},
    () => {},
    (a, b) => a === b,
    visibleWidth,
    truncateToWidth,
    {},
    42,
  );
  panels.push(panel);
  return panel;
}
const text = (panel: SubagentsHistoryPanel) =>
  panel.render(160).map(stripTerminalSequences).join('\n');
it.each([
  'completed',
  'failed',
  'cancelled',
  'interrupted',
  'queued',
  'running',
  'stopping',
] as const)('defaults %s to its status view without rendering the transcript for Result', (status) => {
  const render = vi.spyOn(thread, 'renderThreadBodyItems');
  const panel = mount(
    task({
      status,
      error: 'Oops',
      thread_snapshot: {
        version: 1,
        source: 'events',
        updated_at: '',
        items: [],
      },
    }),
  );
  const terminal = ['completed', 'failed', 'cancelled', 'interrupted'].includes(
    status,
  );
  expect(text(panel)).toContain(terminal ? '[1 Result]' : '[2 Transcript]');
  if (terminal) expect(render).not.toHaveBeenCalled();
});
it('shows retained Result and Prompt, failed Result and explicit unavailable execution detail', () => {
  const current = task();
  const panel = mount(current);
  expect(text(panel)).toContain('Final result');
  panel.handleInput('2');
  expect(text(panel)).toContain('Execution detail no longer retained');
  panel.handleInput('3');
  expect(text(panel)).toContain('Original task');
  expect(text(panel)).toContain('Original context');
  panel.handleInput('4');
  expect(text(panel)).toContain('Result (1), Prompt (3) and Metrics (5)');
  panel.handleInput('5');
  expect(text(panel)).toContain('Task id       task');
  current.status = 'failed';
  current.error = 'Failure reason';
  panel.handleInput('1');
  expect(text(panel)).toContain('✗ Failed — Failure reason');
  current.result = 'Updated result';
  current.error = undefined;
  expect(text(panel)).toContain('✗ Failed — Updated result');
});
it('preserves retained legacy execution text in Transcript without a structured snapshot', () => {
  const panel = mount(
    task({
      transcript: '# execution\nread retained.ts\nretained execution marker',
    }),
  );
  panel.handleInput('2');
  expect(text(panel)).toContain('retained execution marker');
  expect(text(panel)).not.toContain('Execution detail no longer retained');
  panel.handleInput('4');
  expect(text(panel)).toContain('Execution detail no longer retained');
});
it('shows a read-only live question and running placeholder in Result', () => {
  const panel = mount(
    task({
      status: 'running',
      pending_questions: [
        { message: 'Which branch?', request_id: 'q', created_at: '' },
      ],
    }),
  );
  panel.handleInput('1');
  expect(text(panel)).toContain('Waiting for an answer from the main chat');
  expect(text(panel)).toContain('Which branch?');
  expect(text(panel)).toContain(
    'Reply in the main chat with root — this panel is read-only.',
  );
  expect(text(panel)).toContain('Still running — no result yet.');
});
it('shows failures first, bash exit codes and missing durations in Tools', () => {
  const panel = mount(
    task({
      thread_snapshot: {
        version: 1,
        source: 'events',
        updated_at: '',
        items: [
          {
            type: 'tool',
            name: 'read',
            arguments: { path: 'file.ts' },
            status: 'completed',
            started_at: '2026-01-01T00:00:00Z',
            ended_at: '2026-01-01T00:00:02Z',
          },
          { type: 'bash', command: 'exit 7', status: 'failed', exitCode: 7 },
          {
            type: 'bash',
            command: 'echo ok',
            status: 'completed',
            exitCode: 0,
          },
        ],
      },
    }),
  );
  panel.handleInput('4');
  const output = text(panel);
  expect(output).toContain('[4 Tools (3 ✗1)]');
  expect(output.indexOf('exit 7')).toBeLessThan(output.indexOf('file.ts'));
  expect(output).toMatch(/exit 7\s+—\s+7/);
  expect(output).toMatch(/echo ok\s+—\s+0/);
  expect(output).toMatch(/file.ts\s+2s/);
});

it('limits the help footer to modal bindings instead of views, details and actions', () => {
  const panel = mount();
  text(panel);
  panel.handleInput('?');
  const footer = panel.render(160).map(stripTerminalSequences).at(-1)!;
  expect(footer).toContain('Esc close help');
  expect(footer).toContain('? close help');
  expect(footer).not.toMatch(/details|copy|filter|view/);
});

it.each([
  '1',
  '2',
  '3',
  '4',
  '5',
])('toggles details at the top of view %s without transcript processing for retained metadata', (view) => {
  const render = vi.spyOn(thread, 'renderThreadBodyItems');
  const panel = mount(task({ session_id: 'details-session' }));
  text(panel);
  panel.handleInput(view);
  expect(panel.render(160).map(stripTerminalSequences).at(-1)).toContain(
    'i details',
  );
  panel.handleInput('i');
  const expanded = text(panel);
  expect(expanded).toContain('Input       0');
  expect(expanded).toContain('Session     details-session');
  if (view === '2')
    expect(expanded).toContain('Execution detail no longer retained');
  expect(render).not.toHaveBeenCalled();
  panel.handleInput('i');
  expect(text(panel)).not.toContain('Session     details-session');
});
