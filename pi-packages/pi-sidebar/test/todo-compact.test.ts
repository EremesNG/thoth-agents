import {
  registerRenderKit,
  registerWorkPanelProvider,
  type WorkPanelRow,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it } from 'vitest';
import registerTodo from '../../pi-todo/index.js';
import {
  evictSession,
  replaceState,
  setActiveRenderSession,
} from '../../pi-todo/state/store.js';
import { createMockCtx, createMockPi } from '../../pi-todo/test/helpers.js';
import { createTodoWorkPanelProvider } from '../../pi-todo/todo-work-panel.js';
import { sidebar, source, strip } from './fixture.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const off of cleanup.splice(0).reverse()) off();
});
const group = { key: 'plan', label: 'plan' };
const rows: WorkPanelRow[] = [
  {
    id: 'group',
    primary: 'plan',
    compact: {
      heading: true,
      group,
      depth: 0,
      counts: { running: 0, queued: 0, completed: 0 },
    },
  },
  {
    id: '1',
    primary: 'Live',
    status: 'in_progress',
    compact: {
      group,
      depth: 1,
      taskId: 1,
      counts: { running: 1, queued: 0, completed: 0 },
    },
  },
  {
    id: '4',
    primary: 'Latest pending',
    status: 'pending',
    compact: {
      group,
      depth: 1,
      taskId: 4,
      counts: { running: 0, queued: 1, completed: 0 },
    },
  },
  {
    id: '5',
    primary: 'Recent done',
    status: 'completed',
    dropFirst: true,
    compact: {
      group,
      depth: 1,
      counts: { running: 0, queued: 0, completed: 1 },
    },
  },
  {
    id: '2',
    primary: 'Older pending',
    status: 'pending',
    compact: {
      depth: 0,
      taskId: 2,
      counts: { running: 0, queued: 1, completed: 0 },
    },
  },
  {
    id: 'done-group',
    primary: 'old (8)',
    status: 'completed',
    dropFirst: true,
    compact: { depth: 0, counts: { running: 0, queued: 0, completed: 8 } },
  },
];

it.each([
  false,
  true,
])('uses provider order and the whole completed set; headings stay in place at narrow width (kit: %s)', (themed) => {
  if (themed) {
    const token = registerRenderKit(createTestRenderKit(), {});
    cleanup.push(() => withdrawRenderKit(token));
  }
  cleanup.push(
    source('todos', 'Todos', rows, { running: 1, queued: 2, completed: 9 }),
  );
  const panel = sidebar([{ id: 'todos', visible: true }]);
  const lines = panel.renderAt(32, 40).map(strip);
  expect(lines[0]).toContain('◐1 ✓9');
  expect(lines[0]).not.toContain('○2');
  expect(lines[1]).toContain('plan');
  expect(lines[2]).toContain('Live');
  if (themed) expect(lines[4]).toContain('    └─');
  expect(lines.join('\n')).toContain('old (8)');
  expect(lines.join('\n')).not.toContain('+');
});

it('retains headings, hides completed first then the newest pending and counts represented tasks', () => {
  cleanup.push(
    source('todos', 'Todos', rows, { running: 1, queued: 2, completed: 9 }),
  );
  const panel = sidebar([{ id: 'todos', visible: true }]);
  const text = panel.renderAt(50, 7).map(strip).join('\n');
  expect(text).toContain('plan');
  expect(text).toContain('Live');
  expect(text).toContain('Older pending');
  expect(text).not.toContain('old (8)');
  expect(text).toContain('+9 done');
  const tighter = panel.renderAt(50, 6).map(strip).join('\n');
  expect(tighter).toContain('plan');
  expect(tighter).toContain('Live');
  expect(tighter).toContain('Older pending');
  expect(tighter).not.toContain('Latest pending');
  expect(tighter).toContain('+1 pending');
  expect(tighter).toContain('+9 done');
});

it('refreshes a cached Todos snapshot at a recognized prompt epoch archiving revision, without losing historical heading counts', async () => {
  const { pi, captured } = createMockPi();
  registerTodo(pi);
  const ctx = createMockCtx({ sessionId: 'sidebar-epoch', hasUI: false });
  const dispatch = async (name: string, event = {}) => {
    for (const handler of captured.events.get(name) ?? [])
      await handler(event as never, ctx as never);
  };
  await dispatch('session_start');
  setActiveRenderSession('sidebar-epoch');
  cleanup.push(() => evictSession('sidebar-epoch'));
  const tasks = [
    { id: 1, subject: 'Still live', status: 'in_progress' as const },
    {
      id: 2,
      subject: 'Epoch completion',
      status: 'completed' as const,
      completedAt: 10,
    },
  ];
  replaceState('sidebar-epoch', { tasks, nextId: 3 });
  cleanup.push(
    registerWorkPanelProvider(
      { on() {} } as never,
      createTodoWorkPanelProvider(),
    ),
  );
  const panel = sidebar([{ id: 'todos', visible: true }]);
  expect(panel.renderAt(50, 20).map(strip).join('\n')).toContain(
    'Epoch completion',
  );
  await dispatch('input', { source: 'interactive', text: 'next epoch' });
  await dispatch('before_agent_start', {
    prompt: 'next epoch',
    systemPrompt: '',
  });
  const next = panel.renderAt(50, 20).map(strip).join('\n');
  expect(next).not.toContain('Epoch completion');
  expect(next).toContain('Still live');
  expect(next).toContain('✓1');
  expect(next).not.toContain('+1 done');
  await dispatch('session_shutdown');
});
