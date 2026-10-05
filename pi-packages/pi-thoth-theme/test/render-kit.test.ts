import { visibleWidth } from '@earendil-works/pi-tui';
import type { RenderKitTheme } from '@thoth-agents/pi-core';
import { describe, expect, it } from 'vitest';
import { createRenderKit } from '../src/render-kit/index.ts';

const theme: RenderKitTheme = { fg: (_role, text) => text };
const kit = createRenderKit({});
const styledTheme: RenderKitTheme = {
  fg: (role, text) => `<${role}>${text}</${role}>`,
  bold: (text) => `<bold>${text}</bold>`,
};

describe('theme render kit', () => {
  it('draws the existing rounded card with content width, dividers and bottom footer', () => {
    const widths: number[] = [];
    expect(
      kit.card(
        theme,
        {
          title: 'Tool',
          body: (width) => {
            widths.push(width);
            return ['args'];
          },
          sections: [{ title: 'Output', rows: ['result'] }],
          footer: 'Done',
        },
        24,
      ),
    ).toEqual([
      '╭── Tool ──────────────╮',
      '│ args                 │',
      '├── Output ────────────┤',
      '│ result               │',
      '╰── Done ──────────────╯',
    ]);
    expect(widths).toEqual([20]);
    expect(kit.card(theme, {}, 8)).toEqual(['╭──────╮', '╰──────╯']);
    for (const width of [0, 1, 4, 5, 12.9, 80]) {
      expect(
        kit
          .card(theme, { title: 'Long title', body: ['Long output'] }, width)
          .every((line) => visibleWidth(line) <= Math.floor(width)),
      ).toBe(true);
    }
  });

  it('joins split tool frames without nested borders and wraps at the body width', () => {
    const start = kit.card(
      theme,
      { title: 'Tool', body: ['call'], part: 'start' },
      16,
    );
    const end = kit.card(
      theme,
      {
        body: ['one two three four'],
        wrap: true,
        part: 'end',
        status: 'completed',
        footer: 'Done',
      },
      16,
    );
    expect([...start, ...end]).toEqual([
      '╭── Tool ──────╮',
      '│ call         │',
      '│ one two      │',
      '│ three four   │',
      '╰── ✓ Done ────╯',
    ]);
    const styled = kit
      .card(
        styledTheme,
        {
          title: 'Failed',
          body: ['error output'],
          isError: true,
          status: 'failed',
        },
        80,
      )
      .join('\n');
    expect(styled).toContain('<error>╭──</error>');
    expect(styled).toContain('<error>✗</error>');
    expect(styled).not.toContain('<accent>');
  });

  it('uses the built-in eight-row collapse budget and lets callers expand or override it', () => {
    const rows = [
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
      'ten',
    ];
    expect(kit.collapse(theme, rows)).toEqual([
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      '… 2 more lines · ctrl+o to expand',
    ]);
    expect(kit.collapse(theme, rows, { expanded: true })).toEqual(rows);
    expect(kit.collapse(theme, rows, { budget: Infinity })).toEqual(rows);
    expect(
      kit.collapse(theme, rows, { budget: 0, expandHint: 'open details' }),
    ).toEqual(['… 10 more lines · open details']);
    expect(kit.collapse(styledTheme, ['one', 'two'], { budget: 1 })).toEqual([
      'one',
      '<dim>… 1 more lines · ctrl+o to expand</dim>',
    ]);
  });

  it('caches each width independently and clears all widths when invalidated', () => {
    let value = 'initial';
    const component = kit.cachedComponent((width) => [`${value} ${width}`]);
    const wide = component.render(80);
    const narrow = component.render(40);
    expect(component.render(80)).toBe(wide);
    expect(component.render(40)).toBe(narrow);
    value = 'updated';
    component.invalidate();
    expect(component.render(80)).toEqual(['updated 80']);
    expect(component.render(40)).toEqual(['updated 40']);
  });

  it('styles status glyphs and widget rails using theme roles, not fixed colors', () => {
    expect(kit.statusGlyph(styledTheme, 'completed')).toBe(
      '<success>✓</success>',
    );
    expect(kit.statusGlyph(styledTheme, 'failed')).toBe('<error>✗</error>');
    expect(kit.statusGlyph(styledTheme, 'running')).toBe('<accent>◭</accent>');
    expect(kit.fg(styledTheme, 'warning', 'blocked')).toBe(
      '<warning>blocked</warning>',
    );
    expect(
      kit.widgetHeading(
        theme,
        {
          title: 'Tasks',
          counts: { completed: 1, total: 3 },
          suffix: 'active',
        },
        80,
      ),
    ).toBe('▲ Tasks 1/3 active');
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
    expect(kit.treeRow(theme, { text: 'Task' }, 80)).toBe('  ├─ Task');
    for (const width of [0, 1, 4, 16]) {
      expect(
        visibleWidth(
          kit.widgetHeading(theme, { title: 'Tasks 界界界界' }, width),
        ),
      ).toBeLessThanOrEqual(width);
      expect(
        visibleWidth(kit.treeRow(theme, { text: 'Task 界界界界' }, width)),
      ).toBeLessThanOrEqual(width);
    }
  });

  it('exposes measurable rail and content widths independent of selection and ANSI styling', () => {
    const ansiTheme: RenderKitTheme = {
      fg: (_role, text) => `\u001b[33m${text}\u001b[39m`,
    };
    for (const selected of [false, true]) {
      for (const width of [46, 50]) {
        const rail = kit.treeRow(
          ansiTheme,
          { text: '', depth: 1, selected },
          width,
        );
        expect(visibleWidth(rail)).toBe(7);
        expect(width - visibleWidth(rail)).toBe(width === 46 ? 39 : 43);
        const content = 'x'.repeat(width - visibleWidth(rail));
        expect(
          visibleWidth(
            kit.treeRow(
              ansiTheme,
              { text: content, depth: 1, selected },
              width,
            ),
          ),
        ).toBe(width);
      }
    }
    expect(visibleWidth(kit.treeRow(ansiTheme, { text: '' }, 80))).toBe(5);
    expect(
      visibleWidth(
        kit.treeRow(ansiTheme, { text: '', depth: 1, status: 'completed' }, 80),
      ),
    ).toBe(9);
  });

  it('animates caller-owned braille frames with the running theme role, independent of elapsed time', () => {
    const context = { isPartial: true };
    expect(
      kit.indicator(styledTheme, context, {
        status: 'running',
        elapsedMs: 2250,
        frame: 0,
      }).glyph,
    ).toBe('<accent>⠋</accent>');
    expect(
      kit.indicator(styledTheme, context, {
        status: 'running',
        elapsedMs: 2250,
        frame: 1,
      }).glyph,
    ).toBe('<accent>⠙</accent>');
    expect(
      kit.indicator(theme, context, { status: 'running', frame: 10 }).glyph,
    ).toBe('⠋');
    expect(
      kit.indicator(theme, context, { status: 'running', frame: -1 }).glyph,
    ).toBe('⠏');
    expect(
      kit.indicator(theme, context, { status: 'running', frame: 1.9 }).glyph,
    ).toBe('⠙');
    expect(
      kit.indicator(theme, context, { status: 'queued', frame: 1 }).glyph,
    ).toBe('○');
    expect(
      kit.indicator(theme, context, { status: 'completed', frame: 1 }).glyph,
    ).toBe('✓');
  });

  it('accepts explicit elapsed time and keeps absent elapsed values out of footers', () => {
    expect(
      kit.indicator(theme, undefined, { status: 'running', elapsedMs: 2250 }),
    ).toEqual({
      glyph: '▲',
      elapsedMs: 2250,
      elapsed: '2s',
      text: 'running… · 2s',
    });
    expect(
      kit.indicator(theme, undefined, {
        status: 'completed',
        elapsedMs: 2250,
        label: 'Exit 0',
      }),
    ).toEqual({
      glyph: '✓',
      elapsedMs: 2250,
      elapsed: '2.3s',
      text: 'Exit 0 · 2.3s',
    });
    expect(kit.indicator(theme).elapsed).toBe('');
    expect(kit.indicator(theme).text).toBe('pending');
  });
});
