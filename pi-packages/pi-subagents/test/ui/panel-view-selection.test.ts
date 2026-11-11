import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { afterEach, expect, it } from 'vitest';
import { truncateToWidth, visibleWidth } from '../../src/render/text-width.js';
import type { SubagentTask } from '../../src/types.js';
import { SubagentsHistoryPanel } from '../../src/ui/subagents-history-panel.js';

const panels: SubagentsHistoryPanel[] = [];
afterEach(() => {
  for (const panel of panels.splice(0)) panel.dispose();
});
const makeTask = (
  id: string,
  status: SubagentTask['status'],
): SubagentTask => ({
  id,
  status,
  agent: id,
  mode: 'background',
  task: `prompt ${id}`,
  result: `result ${id}`,
  created_at: '2026-01-01T00:00:00Z',
  thread_snapshot: {
    version: 1,
    source: 'events',
    items: Array.from({ length: 80 }, (_, i) => ({
      type: 'status',
      text: `${id} transcript ${i}`,
    })),
  },
});
const mount = (tasks: SubagentTask[]) => {
  const panel = new SubagentsHistoryPanel(
    tasks,
    {},
    () => {},
    (data, key) => data === key,
    visibleWidth,
    truncateToWidth,
    {},
    24,
  );
  panels.push(panel);
  return panel;
};
const text = (panel: SubagentsHistoryPanel) =>
  panel.render(160).map(stripTerminalSequences).join('\n');
it('resets defaults on selection changes, but keeps an explicit choice during status refresh', () => {
  const tasks = [makeTask('a', 'running'), makeTask('b', 'completed')];
  const panel = mount(tasks);
  expect(text(panel)).toContain('[2 Transcript]');
  panel.handleInput('3');
  expect(text(panel)).toContain('prompt a');
  tasks[0].status = 'completed';
  expect(text(panel)).toContain('[3 Prompt]');
  panel.handleInput('right');
  expect(text(panel)).toContain('[1 Result]');
  panel.handleInput('left');
  expect(text(panel)).toContain('[1 Result]');
});
it('changes the automatic default after completion and preserves transcript tail-follow across view switches', () => {
  const current = makeTask('a', 'running');
  const panel = mount([current]);
  expect(text(panel)).toContain('a transcript 79');
  panel.handleInput('g');
  expect(text(panel)).toContain('a transcript 0');
  panel.handleInput('1');
  expect(panel.render(160).at(-1)).not.toContain(' live');
  current.thread_snapshot?.items.push({
    type: 'status',
    text: 'a transcript NEW',
  });
  panel.handleInput('2');
  expect(text(panel)).toContain('a transcript 0');
  expect(text(panel)).toContain('1 new');
  panel.handleInput('G');
  expect(text(panel)).toContain('a transcript NEW');
  expect(text(panel)).toContain(' live');
  const automatic = mount([current]);
  expect(text(automatic)).toContain('[2 Transcript]');
  current.status = 'completed';
  expect(text(automatic)).toContain('[1 Result]');
  expect(text(automatic)).toContain('result a');
});
