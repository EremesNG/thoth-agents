import { afterEach, expect, it, vi } from 'vitest';
import {
  ensureWorkPanel,
  registerWorkPanelProvider,
  type WorkPanelSummary,
} from '../src/index.js';
import { provider, uiSession } from './work-panel-fixture.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

it.each([
  false,
  true,
])('uses authoritative numeric counts instead of provider words in normal headings (collapsed: %s)', async (collapsed) => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      retention: 'prompt',
      summary: () => ({
        running: 1,
        queued: 2,
        completed: 30,
        failed: 1,
        cancelled: 1,
        total: 35,
        text: 'Old provider words',
        segments: [{ text: 'Old provider segments', role: 'meta' }],
      }),
      listRows: () =>
        collapsed ? [] : [{ id: 'live', primary: 'Live', status: 'running' }],
    }),
    await ensureWorkPanel(session.ctx),
  );
  expect(session.render(160)[0]).toBe('◆ Agents · ◐1 ○2 ✓30 ✗1 ■1');
});

it('derives semantic history counts before retention rather than using coarse done/failed states', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider('background', 'Background', 30),
      retention: 'prompt',
      listRows: () => [
        {
          id: 'expected',
          primary: 'Expected',
          statusGlyph: 'expectedExit',
          state: 'failed',
          endedAt: 0,
        },
        {
          id: 'resolved',
          primary: 'Resolved',
          statusGlyph: 'resolved',
          state: 'failed',
          endedAt: 0,
        },
        {
          id: 'timeout',
          primary: 'Timeout',
          status: 'timed_out',
          state: 'done',
          endedAt: 0,
        },
        {
          id: 'cancelled',
          primary: 'Cancelled',
          statusGlyph: 'cancelled',
          state: 'done',
          endedAt: 0,
        },
        {
          id: 'interrupted',
          primary: 'Interrupted',
          status: 'interrupted',
          state: 'failed',
          endedAt: 0,
        },
      ],
    }),
    await ensureWorkPanel(session.ctx),
  );
  expect(session.render()).toEqual(['◆ Background · ✓1 ✗1 ■2', '← interact']);
});

it.each([
  ['string', (): string => 'Custom text', 'Custom text'],
  ['text', (): WorkPanelSummary => ({ text: 'Custom text' }), 'Custom text'],
  [
    'segments',
    (): WorkPanelSummary => ({
      segments: [{ text: 'Custom segments', role: 'warning' as const }],
    }),
    'Custom segments',
  ],
] as const)('preserves nonnumeric provider %s in normal headings', async (_kind, summary, expected) => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, { ...provider(), summary }),
    await ensureWorkPanel(session.ctx),
  );
  expect(session.render()[0]).toBe(`◆ Agents · ${expected}`);
});

it('uses shared todo glyph counts and keeps queued separate from running in semantic fallback', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      listRows: () => [
        { id: 'queued', primary: 'Queued', status: 'queued', state: 'running' },
        { id: 'stopping', primary: 'Stopping', status: 'stopping' },
        { id: 'working', primary: 'Working', status: 'in_progress' },
      ],
    }),
    registerWorkPanelProvider(session.ctx, {
      ...provider('todos', 'Todos', 20),
      summary: () => ({ running: 1, queued: 2, completed: 12, total: 15 }),
    }),
    await ensureWorkPanel(session.ctx),
  );
  expect(session.render(120)).toContain('◆ Agents · ◐2 ○1');
  expect(session.render(120)).toContain('◆ Todos · ◐1 ○2 ✓12');
  expect(session.render(35)[0]).toBe('◆ Agents · ◐2');
});

it('uses the room remaining after actual heading chrome, reserving selection only when selected', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider('agents', 'Long Agent Panel'),
      retention: 'prompt',
      summary: () => ({
        running: 1,
        queued: 2,
        completed: 30,
        failed: 1,
        cancelled: 1,
      }),
      listRows: () => [],
    }),
    await ensureWorkPanel(session.ctx),
  );
  expect(session.render(36)[0]).toBe('◆ Long Agent Panel · ◐1 ○2 ✓30 ✗1 ■1');
  session.key('\x1b[D');
  expect(session.render(38)[0]).toBe('› ◆ Long Agent Panel · ◐1 ○2 ✓30 ✗1 ■1');
  expect(session.render(36)[0]).toBe('› ◆ Long Agent Panel · ◐1 ○2 ✓30 ✗1');
});
