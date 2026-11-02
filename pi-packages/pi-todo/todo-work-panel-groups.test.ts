import { expect, it } from 'vitest';
import { replaceState, setActiveRenderSession } from './state/store.js';
import { createTodoWorkPanelProvider } from './todo-work-panel.js';

it('publishes ordered nested groups, distinct styles, collapsed represented counts and archived heading counts as data', () => {
  setActiveRenderSession('compact-groups');
  replaceState('compact-groups', {
    tasks: [
      { id: 1, subject: 'plan: Waiting', status: 'pending' },
      {
        id: 2,
        subject: 'plan: Building',
        status: 'in_progress',
        activeForm: 'Working',
      },
      {
        id: 3,
        subject: 'plan: Finished',
        status: 'completed',
        completedAt: 10,
      },
      { id: 4, subject: 'Blocked', status: 'pending', blockedBy: [2] },
      { id: 5, subject: 'old: One', status: 'completed', completedAt: 20 },
      { id: 6, subject: 'old: Two', status: 'completed', completedAt: 30 },
      { id: 7, subject: 'Archived', status: 'completed', archivedAt: 40 },
    ],
    nextId: 8,
  });
  const provider = createTodoWorkPanelProvider();
  expect(provider.summary()).toEqual({
    running: 1,
    queued: 2,
    completed: 4,
    total: 7,
  });
  const rows = provider.listRows(0);
  expect(rows.map((row) => row.primary)).toEqual([
    'plan',
    'Building (Working)',
    'Waiting',
    'Finished',
    'Blocked ⊘ #2',
    'old (2)',
  ]);
  expect(rows[0].compact).toMatchObject({
    heading: true,
    group: { key: 'plan', label: 'plan' },
    depth: 0,
  });
  expect(rows[1]).toMatchObject({
    compact: { depth: 1, counts: { running: 1, queued: 0, completed: 0 } },
    segments: [
      { text: 'Building', role: 'accent' },
      { text: ' (Working)', role: 'secondary' },
    ],
  });
  expect(rows[2].segments).toEqual([{ text: 'Waiting', role: 'muted' }]);
  expect(rows[3].segments).toEqual([{ text: 'Finished', role: 'completed' }]);
  expect(rows[4].segments).toEqual([{ text: 'Blocked ⊘ #2', role: 'dim' }]);
  expect(rows[5]).toMatchObject({
    statusGlyph: 'completed',
    compact: { counts: { running: 0, queued: 0, completed: 2 } },
  });
  expect(provider.visibleCount()).toBe(6);
  expect(structuredClone(rows)).toEqual(rows);
});
