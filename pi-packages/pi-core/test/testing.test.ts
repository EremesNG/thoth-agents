import {
  getRenderKit,
  registerRenderKit,
  resolveFrames,
  resolveIcon,
  type SemanticIconName,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { describe, expect, it, vi } from 'vitest';

const theme = { fg: (_role: string, text: string) => text };

describe('shared test render kit', () => {
  it('optionally supplies semantic icons and frames without changing the legacy fake', () => {
    const icon = (name: SemanticIconName) =>
      name === 'workingFrames' ? ['.', 'o', 'O', '0'] : `test:${name}`;
    const themed = createTestRenderKit({ icon });
    const token = registerRenderKit(themed, {});
    try {
      expect(getRenderKit()).toBe(themed);
      expect(resolveIcon('agent', 'native')).toBe('test:agent');
      expect(resolveFrames('workingFrames', ['native'])).toEqual([
        '.',
        'o',
        'O',
        '0',
      ]);
    } finally {
      withdrawRenderKit(token);
    }
    expect('icon' in createTestRenderKit()).toBe(false);
    expect('icon' in createTestRenderKit({ icon: undefined })).toBe(false);
    expect(resolveIcon('agent', 'native')).toBe('native');
    expect(resolveFrames('workingFrames', ['native'])).toEqual(['native']);
  });

  it('provides deterministic status, working/elapsed and widget primitives without timers', () => {
    const kit = createTestRenderKit();
    const state = {};
    const invalidate = vi.fn();
    expect(
      kit.indicator(
        theme,
        { state, invalidate, executionStarted: true, isPartial: true },
        { elapsedMs: 1250, label: 'Working' },
      ),
    ).toEqual({
      glyph: '◐',
      elapsedMs: 1250,
      elapsed: '1.3s',
      text: 'Working · 1.3s',
    });
    expect(kit.indicator(theme, { isError: true }).glyph).toBe('✗');
    expect(kit.indicator(theme).elapsed).toBe('');
    expect(state).toEqual({});
    expect(invalidate).not.toHaveBeenCalled();
    expect(kit.statusGlyph(theme, 'cancelled')).toBe('■');
    expect(kit.statusGlyph(theme, 'pending')).toBe('○');
    expect(kit.statusGlyph(theme, 'completed')).toBe('✓');
    expect(
      kit.widgetHeading(
        theme,
        {
          title: 'Todos',
          counts: { completed: 1, total: 3 },
          status: 'running',
        },
        80,
      ),
    ).toBe('◐ Todos (1/3)');
    expect(
      kit.treeRow(
        theme,
        {
          text: 'Task',
          depth: 1,
          last: true,
          selected: true,
          status: 'completed',
        },
        80,
      ),
    ).toBe('›   └─ ✓ Task');
    expect(kit.treeRow(theme, { text: 'Task' }, 2)).toBe('  ');
    expect(kit.fg(theme, 'accent', 'Title')).toBe('Title');
  });

  it('renders standard tool footers deterministically without context timing or timers', () => {
    const kit = createTestRenderKit();
    const state = { startedAt: 1, completedElapsedMs: 1234 };
    const invalidate = vi.fn();
    const context = {
      state,
      invalidate,
      executionStarted: true,
      isPartial: true,
    };
    expect(
      kit.toolFooter?.(theme, {
        status: 'running',
        context,
        elapsedMs: 5250,
        summary: 'partial output',
      }),
    ).toBe('running · 5s');
    expect(
      kit.toolFooter?.(theme, {
        status: 'completed',
        context,
        elapsedMs: 5250,
        summary: ['Exit 0', '1 line'],
      }),
    ).toBe('✓ · 5s · Exit 0 · 1 line');
    expect(kit.toolFooter?.(theme, { status: 'failed', context })).toBe('✗');
    expect(state).toEqual({ startedAt: 1, completedElapsedMs: 1234 });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('reserves the real adapter rail and selection gutter before clipping tree content', () => {
    const kit = createTestRenderKit();
    for (const selected of [false, true]) {
      expect(
        kit.treeRow(theme, { text: '', depth: 1, selected }, 50).length,
      ).toBe(7);
      expect(
        kit
          .treeRow(theme, { text: 'x'.repeat(50), depth: 1, selected }, 46)
          .slice(7),
      ).toBe('x'.repeat(39));
      expect(
        kit
          .treeRow(theme, { text: 'x'.repeat(50), depth: 1, selected }, 50)
          .slice(7),
      ).toBe('x'.repeat(43));
    }
    expect(kit.treeRow(theme, { text: '' }, 50)).toBe('  ├─ ');
  });

  it('matches caller-owned braille frames without mutating state or starting timers', () => {
    const kit = createTestRenderKit();
    const state = {};
    const context = { state, isPartial: true };
    expect(kit.indicator(theme, context, { frame: 0 }).glyph).toBe('⠋');
    expect(kit.indicator(theme, context, { frame: 1 }).glyph).toBe('⠙');
    expect(
      kit.indicator(theme, context, { status: 'in_progress', frame: 10 }).glyph,
    ).toBe('⠋');
    expect(kit.indicator(theme, context, { frame: -1 }).glyph).toBe('⠏');
    expect(kit.indicator(theme, context, { frame: 1.9 }).glyph).toBe('⠙');
    expect(
      kit.indicator(theme, context, { status: 'queued', frame: 1 }).glyph,
    ).toBe('○');
    expect(
      kit.indicator(theme, context, { status: 'completed', frame: 1 }).glyph,
    ).toBe('✓');
    expect(state).toEqual({});
  });

  it('caches per component and width until invalidated', () => {
    const kit = createTestRenderKit();
    const render = vi.fn((width: number) => [`width=${width}`]);
    const a = kit.cachedComponent(render);
    const b = kit.cachedComponent(render);
    expect(a.render(10)).toEqual(['width=10']);
    expect(a.render(10)).toEqual(['width=10']);
    expect(a.render(20)).toEqual(['width=20']);
    expect(a.render(10)).toEqual(['width=10']);
    expect(render).toHaveBeenCalledTimes(2);
    b.render(10);
    expect(render).toHaveBeenCalledTimes(3);
    a.invalidate();
    a.render(10);
    a.render(20);
    expect(render).toHaveBeenCalledTimes(5);
  });

  it('folds to a content budget and adds an expand hint only for hidden rows', () => {
    const kit = createTestRenderKit();
    const rows = ['a', 'b', 'c'];
    expect(kit.collapse(theme, rows, { budget: 1 })).toEqual([
      'a',
      '… 2 more lines · ctrl+o to expand',
    ]);
    expect(
      kit.collapse(theme, rows, { budget: 0, expandHint: 'alt+e to expand' }),
    ).toEqual(['… 3 more lines · alt+e to expand']);
    expect(kit.collapse(theme, rows, { budget: 1, expanded: true })).toEqual(
      rows,
    );
    expect(kit.collapse(theme, rows, { budget: Infinity })).toEqual(rows);
    expect(kit.collapse(theme, Array(10).fill('row'))).toHaveLength(9);
    expect(kit.collapse(theme, [], { budget: 0 })).toEqual([]);
  });

  it('uses the standard footer for tool-context cards without duplicating an explicit footer', () => {
    const kit = createTestRenderKit();
    const context = { executionStarted: true, state: {}, isPartial: true };
    expect(
      kit.card(
        theme,
        { status: 'running', context, summary: 'partial output' },
        60,
      ),
    ).toEqual(['╭─', '╰─ running']);
    expect(
      kit.card(
        theme,
        { status: 'completed', context, summary: ['+3 -1', '1 file'] },
        60,
      ),
    ).toEqual(['╭─', '╰─ ✓ · +3 -1 · 1 file']);
    expect(
      kit.card(
        theme,
        {
          status: 'completed',
          context,
          footer: '✓ · 2s · Done',
          summary: 'ignored',
        },
        60,
      ),
    ).toEqual(['╭─', '╰─ ✓ · 2s · Done']);
    expect(context.state).toEqual({});
  });

  it('renders distinguishable full and split cards with sections and footer status', () => {
    const kit = createTestRenderKit();
    const options = {
      title: 'Task',
      body: ['args'],
      sections: [
        { title: 'Result', rows: (width: number) => [`width=${width}`] },
      ],
      footer: '1s',
      status: 'completed' as const,
      isError: true,
    };
    expect(kit.card(theme, options, 30)).toEqual([
      '╭─ ! Task',
      'args',
      '├─ Result',
      'width=26',
      '╰─ completed · 1s',
    ]);
    expect(
      kit.card(theme, { title: 'Task', body: ['args'], part: 'start' }, 30),
    ).toEqual(['╭─ Task', 'args']);
    expect(kit.card(theme, { body: ['result'], part: 'end' }, 30)).toEqual([
      'result',
      '╰─',
    ]);
    expect(kit.card(theme, options, 0)).toEqual([]);
    expect(kit.card(theme, { title: 'Task' }, 2)).toEqual(['╭─', '╰─']);
  });
});
