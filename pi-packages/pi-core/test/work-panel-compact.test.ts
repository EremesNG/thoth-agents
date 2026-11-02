import { afterEach, expect, it } from 'vitest';
import {
  ensureWorkPanel,
  registerRenderKit,
  registerWorkPanelProvider,
  type WorkPanelRow,
  withdrawRenderKit,
} from '../src/index.js';
import { createTestRenderKit } from '../src/testing.js';
import { provider, uiSession } from './work-panel-fixture.js';

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
])('renders group headings in place and nested rows without counting collapsed members as hidden (kit: %s)', async (themed) => {
  const session = uiSession();
  if (themed) {
    const token = registerRenderKit(createTestRenderKit(), {});
    cleanup.push(() => withdrawRenderKit(token));
  }
  cleanup.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider('todos', 'Todos'),
      listRows: () => rows,
      summary: () => ({ running: 1, queued: 2, completed: 9 }),
    }),
    await ensureWorkPanel(session.ctx),
  );
  const full: string[] = session.render(32);
  expect(full[0]).toContain('Todos · ◐1 ✓9');
  expect(full.findIndex((line) => line.includes('plan'))).toBe(1);
  expect(full.findIndex((line) => line.includes('Live'))).toBe(2);
  expect(full.findIndex((line) => line.includes('old (8)'))).toBeGreaterThan(2);
  expect(full.join('\n')).not.toMatch(/\+\d+ done/);
  expect(full[2]).toContain(themed ? '    ├─' : '    ');
  if (themed) expect(full[4]).toContain('    └─');
});

it('hides completed tasks then latest-created pending across groups, retaining headings and exact task overflow', async () => {
  const session = uiSession();
  session.tui.terminal.rows = 14; // Seven widget lines, including its hint.
  cleanup.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider('todos', 'Todos'),
      selectableSummary: true,
      listRows: () => rows,
      summary: () => ({ running: 1, queued: 2, completed: 9 }),
    }),
    await ensureWorkPanel(session.ctx),
  );
  const text = session.render().join('\n');
  expect(text).toContain('plan');
  expect(text).toContain('Live');
  expect(text).toContain('Older pending');
  expect(text).not.toContain('old (8)');
  expect(text).toContain('+9 done');
  session.tui.terminal.rows = 12;
  const tight = session.render().join('\n');
  expect(tight).toContain('plan');
  expect(tight).toContain('Live');
  expect(tight).toContain('Older pending');
  expect(tight).not.toContain('Latest pending');
  expect(tight).toContain('+1 pending');
  expect(tight).toContain('+9 done');
});
