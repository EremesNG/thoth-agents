import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { describeTaskCounts, groupTasks, TodoPanel } from './todo-panel.js';
import type { Task } from './tool/types.js';

const tasks: Task[] = [
  { id: 1, subject: 'Design', status: 'completed', description: 'Sketch it.' },
  {
    id: 2,
    subject: 'Build',
    status: 'in_progress',
    activeForm: 'Building',
    description: 'Write the code.\nKeep it small.',
    blockedBy: [1],
  },
  { id: 3, subject: 'Ship', status: 'pending' },
  { id: 4, subject: 'Announce', status: 'pending' },
];

const theme = {
  fg: (_role: string, text: string) => text,
  bold: (text: string) => text,
  strikethrough: (text: string) => `~${text}~`,
} as never;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function open(list: readonly Task[], selected?: string, width = 120) {
  const panel = new TodoPanel(() => list, {
    theme,
    onClose: vi.fn(),
    initialSelectedId: selected,
    refreshMs: 0,
    maxLines: 40,
  });
  cleanups.push(() => panel.dispose());
  return { panel, lines: () => panel.render(width) };
}

it('orders tasks in progress, not started, then completed and counts them', () => {
  expect(groupTasks(tasks).map((task) => task.id)).toEqual([2, 3, 4, 1]);
  expect(describeTaskCounts(tasks)).toBe(
    '1/4 completed · 1 in progress · 2 not started',
  );
  expect(describeTaskCounts([tasks[2]])).toBe('0/1 completed · 1 not started');
});

it('shows the completed header, grouped sections and the selected description', () => {
  const lines = open(tasks, '2').lines();
  const text = lines.join('\n');
  expect(text).toContain('1/4 completed · 1 in progress · 2 not started');
  expect(text).toContain('Keep it small.');
  expect(text).toContain('Building');
  expect(text).toContain('blocked by #1');
  const order = ['In progress', 'Not started', 'Completed'].map((label) =>
    lines.findIndex((line) => line.includes(`── ${label}`)),
  );
  expect(order.every((index) => index >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(text).toContain('~Design~');
});

it('shows the selected description on open and after selection in a 120x24 panel with twenty tasks', () => {
  const list: Task[] = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    subject: `Task ${index + 1}`,
    status: 'pending',
    description: `Description for task ${index + 1}.`,
  }));
  const panel = new TodoPanel(() => list, {
    theme,
    onClose: vi.fn(),
    initialSelectedId: '10',
    refreshMs: 0,
    maxLines: 24,
  });
  cleanups.push(() => panel.dispose());
  expect(panel.render(120).join('\n')).toContain('Description for task 10.');
  panel.handleInput('\u001b[B'); // Down remains content scrolling.
  expect(panel.render(120).join('\n')).toContain('Description for task 10.');
  panel.handleInput('\u001b[F');
  expect(panel.render(120).join('\n')).not.toContain(
    'Description for task 10.',
  );
  panel.handleInput('\u001b[C');
  expect(panel.getRenderDebugState().selectedId).toBe('11');
  expect(panel.render(120).join('\n')).toContain('Description for task 11.');
});

it('selects the task the panel was opened on, including a completed one', () => {
  const { panel, lines } = open(tasks, '1');
  const text = lines().join('\n');
  expect(panel.getRenderDebugState().selectedId).toBe('1');
  expect(text).toContain('Sketch it.');
});

it('degrades gracefully when the selected task has no description', () => {
  expect(open(tasks, '3').lines().join('\n')).toContain('No description.');
});

it('keeps terminal-unsafe model text out of the panel', () => {
  const unsafe: Task[] = [
    {
      id: 1,
      subject: 'Safe\u001b[31m title',
      status: 'pending',
      description: 'Line\u001b]52;c;secret\u0007 one',
    },
  ];
  const text = open(unsafe, '1').lines().join('\n');
  expect(text).toContain('Safe title');
  expect(text).toContain('Line one');
  expect(text).not.toContain('secret');
});

it('renders an empty current list and never exceeds the width', () => {
  expect(open([]).lines().join('\n')).toContain('No active task list.');
  for (const width of [40, 60, 120]) {
    const { panel, lines } = open(tasks, '2', width);
    lines();
    expect(panel.getRenderDebugState().widthViolationCount).toBe(0);
  }
});

it('resolves glyphs through the render kit semantic names', () => {
  const kit = createTestRenderKit({
    icon: (name) =>
      ({ taskInProgress: 'IP', selection: '>>', boxHorizontal: '=' })[
        name as string
      ] ?? name,
  });
  kit.statusGlyph = (_theme, status) =>
    status === 'completed' ? 'DONE' : 'TODO';
  const token = registerRenderKit(kit, {});
  cleanups.push(() => withdrawRenderKit(token));
  const text = open(tasks, '2').lines().join('\n');
  expect(text).toContain('IP');
  expect(text).toContain('DONE');
  expect(text).toContain('TODO');
  expect(text).toContain('>>');
  expect(text).toContain('== Completed');
});
