import { visibleWidth } from '@earendil-works/pi-tui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureWorkPanel,
  getWorkPanelSourceRows,
  registerRenderKit,
  registerWorkPanelProvider,
  type WorkPanelRow,
  withdrawRenderKit,
} from '../src/index.js';
import { createTestRenderKit } from '../src/testing.js';
import { provider, uiSession } from './work-panel-fixture.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

// Reference: the v1 subagents provider/renderSubagentWorkRow, sampled before migration.
const agentRow: WorkPanelRow = {
  id: 'worker',
  primary: 'inspect',
  status: 'running',
  statusGlyph: 'running',
  identity: [
    { text: 'worker', role: 'primary' },
    { text: ' · inspect', role: 'secondary' },
    { text: ' · ⚠ 1 dropped', role: 'warning' },
  ],
  metrics: ['tools 5', '↑20k ↓10k', 'ctx 62.0%', '75 tok/s', 'elapsed 12s'].map(
    (text) => ({ segments: [{ text, role: 'meta' }] }),
  ),
};

describe('data-only work panel rendering', () => {
  it.each([
    false,
    true,
  ])('reproduces subagents identity, warning and responsive metric golden rows (kit: %s)', async (themed) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const session = uiSession();
    if (themed) {
      const token = registerRenderKit(createTestRenderKit(), {});
      cleanups.push(() => withdrawRenderKit(token));
    }
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('golden-agents'),
        listRows: () => [agentRow],
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(session.render(100)).toEqual([
      themed ? 'Agents · 1 items' : '◆ Agents · 1 items',
      `${themed ? '  └─ ' : '  '}⠋ worker · inspect · ⚠ 1 dropped · tools 5 · ↑20k ↓10k · ctx 62.0% · 75 tok/s · elapsed 12s`,
      '← interact',
    ]);
    expect(session.render(40)).toEqual([
      themed ? 'Agents · 1 items' : '◆ Agents · 1 items',
      `${themed ? '  └─ ' : '  '}⠋ worker · inspect · ⚠ 1 dropped`,
      `${themed ? '       ' : '    '}tools 5 · ↑20k ↓10k · ctx 62.0%`,
      `${themed ? '       ' : '    '}75 tok/s · elapsed 12s`,
      '← interact',
    ]);
    vi.setSystemTime(100);
    expect(session.render(100)[1]).toContain('⠙ worker');
    expect(getWorkPanelSourceRows('golden-agents', { maxRows: 1 })).toEqual([
      agentRow,
    ]);
    const narrow = session.render(24);
    expect(narrow[1]).toBe(
      themed ? '  └─ ⠙ wo… · ⚠ 1 dropped' : '  ⠙ worker · ⚠ 1 dropped',
    );
    for (const width of [1, 8, 12, 24, 40, 100]) {
      const lines = session.render(width);
      expect(lines.length).toBeLessThanOrEqual(12);
      expect(lines.every((line: string) => visibleWidth(line) <= width)).toBe(
        true,
      );
    }
  });

  it.each([
    false,
    true,
  ])('reproduces background and task-list golden rows with semantic status and completed styling (kit: %s)', async (themed) => {
    const session = uiSession();
    const styles: Array<[string, string]> = [];
    session.ui.theme.fg = (role, text) => {
      styles.push([role, text]);
      return text;
    };
    Object.assign(session.ui.theme, {
      strikethrough: (text: string) => `~${text}~`,
    });
    if (themed) {
      const token = registerRenderKit(
        {
          ...createTestRenderKit(),
          fg: (theme, role, text) => theme.fg(role, text),
        },
        {},
      );
      cleanups.push(() => withdrawRenderKit(token));
    }
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('golden-todos', 'Todos', 20),
        summary: () => ({ completed: 1, total: 3 }),
        listRows: () => [
          {
            id: 'pending',
            primary: 'Review',
            status: 'pending',
            statusGlyph: 'pending',
            segments: [{ text: 'Review', role: 'primary' }],
          },
          {
            id: 'active',
            primary: 'Build',
            status: 'in_progress',
            statusGlyph: 'taskInProgress',
            segments: [
              { text: 'Build', role: 'primary' },
              { text: ' (Building)', role: 'secondary' },
            ],
          },
          {
            id: 'done',
            primary: 'Explore',
            status: 'completed',
            statusGlyph: 'completed',
            segments: [{ text: 'Explore', role: 'completed' }],
            dropFirst: true,
          },
        ],
      }),
      registerWorkPanelProvider(session.ctx, {
        ...provider('golden-background', 'Background', 30),
        summary: () => ({ running: 0, failed: 1 }),
        listRows: () => [
          {
            id: 'failed',
            primary: 'exit 1',
            status: 'failed',
            segments: [
              { text: 'compile', role: 'primary' },
              { text: ' · exit 1', role: 'secondary' },
              { text: ' · 3s', role: 'meta' },
            ],
          },
        ],
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(session.render()).toEqual(
      themed
        ? [
            'Todos · 1/3 done',
            '  ├─ ○ Review',
            '  ├─ ◇ Build (Building)',
            '  └─ ✓ ~Explore~',
            'Background · 0 running · 1 failed',
            '  └─ ✗ compile · exit 1 · 3s',
            '← interact',
          ]
        : [
            '◆ Todos · 1/3 done',
            '  ○ Review',
            '  ◇ Build (Building)',
            '  ✓ ~Explore~',
            '◆ Background · 0 running · 1 failed',
            '  ✗ compile · exit 1 · 3s',
            '← interact',
          ],
    );
    expect(styles).toContainEqual(['dim', 'Explore']);
    expect(styles).toContainEqual(['error', '✗']);
  });

  it.each([
    false,
    true,
  ])('shrinks the subagent task label before inline metrics with the former Unicode ellipsis (kit: %s)', async (themed) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const session = uiSession();
    if (themed) {
      const token = registerRenderKit(createTestRenderKit(), {});
      cleanups.push(() => withdrawRenderKit(token));
    }
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('long-identity'),
        listRows: () => [
          {
            ...agentRow,
            identity: [
              { text: 'worker', role: 'primary' },
              {
                text: ' · A long task label that must shrink first',
                role: 'secondary',
              },
            ],
          },
        ],
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(session.render(80)[1]).toBe(
      `${themed ? '  └─ ' : '  '}⠋ worker · ${themed ? 'A lo…' : 'A long …'} · tools 5 · ↑20k ↓10k · ctx 62.0% · 75 tok/s · elapsed 12s`,
    );
  });

  it('keeps wide Unicode identity and metric groups cell-bounded with semantic continuation roles', async () => {
    const session = uiSession();
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('unicode'),
        listRows: () => [
          {
            id: 'one',
            primary: 'inspect',
            identity: [
              { text: 'worker-🚀', role: 'primary' },
              { text: ' · 調査', role: 'secondary' },
            ],
            metrics: [
              { segments: [{ text: '工具 5', role: 'meta' }] },
              { segments: [{ text: '🚀🚀🚀', role: 'warning' }] },
            ],
          },
        ],
      }),
      await ensureWorkPanel(session.ctx),
    );
    for (const width of [1, 8, 12, 24, 40])
      expect(
        session
          .render(width)
          .every((line: string) => visibleWidth(line) <= width),
      ).toBe(true);
  });

  it('falls back from an invalid semantic glyph without executing functions or leaking them through discovery', async () => {
    const session = uiSession();
    const glyph = vi.fn(() => 'bad');
    const render = vi.fn(() => ({ text: 'bad' }));
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('invalid-data'),
        listRows: () => [
          {
            id: 'one',
            primary: 'Item',
            status: 'completed',
            statusGlyph: glyph,
            render,
          } as unknown as WorkPanelRow,
        ],
      }),
      await ensureWorkPanel(session.ctx),
    );
    expect(session.render()[1]).toBe('  ✓ Item');
    expect(
      getWorkPanelSourceRows('invalid-data', { maxRows: 1 }),
    ).toMatchObject([{ statusGlyph: 'completed' }]);
    expect(
      getWorkPanelSourceRows('invalid-data', { maxRows: 1 })[0],
    ).not.toHaveProperty('render');
    expect(glyph).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });
});
