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
      {
        id: 7,
        subject: 'plan: Archived',
        status: 'completed',
        archivedAt: 40,
      },
      { id: 8, subject: 'plan: Also finished', status: 'completed' },
    ],
    nextId: 9,
  });
  const provider = createTodoWorkPanelProvider();
  expect(provider.summary()).toEqual({
    running: 1,
    queued: 2,
    completed: 5,
    total: 8,
  });
  const rows = provider.listRows(0);
  expect(rows.map((row) => row.primary)).toEqual([
    'plan',
    'Building (Working)',
    'Waiting',
    '2 done',
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
  expect(rows[3]).toMatchObject({
    status: 'completed',
    statusGlyph: 'completed',
    statusGlyphRole: 'success',
    dropFirst: true,
    segments: [{ text: '2 done', role: 'completed' }],
    compact: {
      group: { key: 'plan', label: 'plan' },
      depth: 1,
      counts: { running: 0, queued: 0, completed: 2 },
    },
  });
  expect(rows[4].segments).toEqual([{ text: 'Blocked ⊘ #2', role: 'dim' }]);
  expect(rows[5]).toMatchObject({
    statusGlyph: 'completed',
    compact: { counts: { running: 0, queued: 0, completed: 2 } },
  });
  expect(provider.visibleCount()).toBe(7);
  expect(structuredClone(rows)).toEqual(rows);
});

it('caps top-level completed entries at the two newest and counts hidden collapsed groups as tasks', () => {
  setActiveRenderSession('compact-cap');
  const input = {
    tasks: [
      { id: 1, subject: 'Legacy', status: 'completed' as const },
      {
        id: 2,
        subject: 'Old one',
        group: 'old',
        status: 'completed' as const,
        completedAt: 10,
      },
      {
        id: 3,
        subject: 'Old two',
        group: 'old',
        status: 'completed' as const,
        completedAt: 20,
      },
      {
        id: 4,
        subject: 'Old three',
        group: 'old',
        status: 'completed' as const,
        completedAt: 30,
      },
      {
        id: 5,
        subject: 'Recent one',
        group: 'recent',
        status: 'completed' as const,
        completedAt: 100,
      },
      {
        id: 6,
        subject: 'Recent two',
        group: 'recent',
        status: 'completed' as const,
        completedAt: 200,
      },
      {
        id: 7,
        subject: 'Newest',
        status: 'completed' as const,
        completedAt: 300,
      },
      {
        id: 8,
        subject: 'Archived newest',
        status: 'completed' as const,
        completedAt: 400,
        archivedAt: 0,
      },
    ],
    nextId: 9,
  };
  replaceState('compact-cap', input);
  const before = structuredClone(input);
  const provider = createTodoWorkPanelProvider();
  const rows = provider.listRows(0);
  expect(rows.map((row) => row.primary)).toEqual([
    'Newest',
    'recent (2)',
    '+4 done',
  ]);
  expect(rows.map((row) => row.compact?.counts.completed)).toEqual([1, 2, 4]);
  expect(rows[2]).toMatchObject({ status: 'completed', dropFirst: true });
  expect(provider.visibleCount()).toBe(7);
  expect(provider.listRows(999999)).toEqual(rows);
  expect(input).toEqual(before);
});
