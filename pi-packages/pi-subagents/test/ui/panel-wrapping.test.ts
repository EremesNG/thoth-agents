import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { afterEach, expect, it } from 'vitest';
import { truncateToWidth, visibleWidth } from '../../src/render/text-width.js';
import type { SubagentTask } from '../../src/types.js';
import { SubagentsHistoryPanel } from '../../src/ui/subagents-history-panel.js';

const panels: SubagentsHistoryPanel[] = [];
afterEach(() => {
  for (const panel of panels.splice(0)) panel.dispose();
});
function mount(overrides: Partial<SubagentTask>) {
  const panel = new SubagentsHistoryPanel(
    [
      {
        id: 'task',
        agent: 'worker',
        mode: 'background',
        status: 'completed',
        task: 'Original task',
        result: 'Final result',
        created_at: '',
        ...overrides,
      },
    ],
    {},
    () => {},
    (a, b) => a === b,
    visibleWidth,
    truncateToWidth,
    {},
    18,
  );
  panels.push(panel);
  return panel;
}
const rows = (panel: SubagentsHistoryPanel) =>
  panel.render(80).map(stripTerminalSequences);

it.each([
  '1',
  '3',
])('preserves an initial over-width token through scrolling in view %s', (view) => {
  const content = `${'A'.repeat(4000)}_TAIL_SENTINEL`;
  const panel = mount({ result: content, task: content });
  rows(panel);
  panel.handleInput(view);
  panel.handleInput('g');
  expect(rows(panel).join('\n')).toContain('A'.repeat(60));
  expect(rows(panel).join('\n')).not.toContain('_TAIL_SENTINEL');
  panel.handleInput('G');
  expect(rows(panel).join('\n')).toContain('_TAIL_SENTINEL');
});

it.each([
  [
    'mid-line',
    `prefix ${'A'.repeat(180)}_TAIL_SENTINEL`,
    'prefix' + 'A'.repeat(180) + '_TAIL_SENTINEL',
  ],
  [
    'ANSI and wide graphemes',
    `prefix \x1b[31m${'界🙂'.repeat(45)}_TAIL_SENTINEL\x1b[0m`,
    'prefix' + '界🙂'.repeat(45) + '_TAIL_SENTINEL',
  ],
  ['exact width', 'A'.repeat(76), 'A'.repeat(76)],
])('preserves all visible content for %s without clipping', (_name, result, expected) => {
  const panel = mount({ result });
  const output = rows(panel);
  const body = output
    .slice(5, 13)
    .map((row) => row.slice(2, -2).trim())
    .join('');
  expect(body.replace(/\s/g, '')).toBe(expected);
  expect(output.every((row) => visibleWidth(row) <= 80)).toBe(true);
});

it('preserves ANSI-styled task details across cell-width boundaries', () => {
  const value = `${'A'.repeat(62)}\x1b[31m${'界🙂'.repeat(12)}_TAIL_SENTINEL\x1b[0m`;
  const panel = mount({ task: value });
  rows(panel);
  panel.handleInput('i');
  // Details are above Result; scroll past the usage fields to the task.
  panel.handleInput('G');
  const body = rows(panel)
    .slice(5, 13)
    .map((row) => row.slice(2, -2).trim())
    .join('');
  expect(body.replace(/\s/g, '')).toContain(
    'Task' + 'A'.repeat(62) + '界🙂'.repeat(12) + '_TAIL_SENTINEL',
  );
  expect(body).not.toMatch(/\[31m|\[0m|�/);
});

it.each([
  'metrics',
  'pending question',
  'details',
])('preserves an initial long token in %s', (block) => {
  const content = `${'A'.repeat(4000)}_TAIL_SENTINEL`;
  const panel = mount({
    session_id: block === 'metrics' ? content : undefined,
    task: block === 'details' ? content : 'Original task',
    ...(block === 'pending question'
      ? {
          status: 'running',
          pending_questions: [
            { message: content, request_id: 'q', created_at: '' },
          ],
        }
      : {}),
  });
  rows(panel);
  panel.handleInput(block === 'metrics' ? '5' : '1');
  if (block === 'details') panel.handleInput('i');
  rows(panel);
  panel.handleInput('G');
  expect(rows(panel).join('\n')).toContain('_TAIL_SENTINEL');
});
