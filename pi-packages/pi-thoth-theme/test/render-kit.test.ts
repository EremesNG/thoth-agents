import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
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
  it('renders standard running and terminal tool footers with whole-second elapsed time', () => {
    expect(
      kit.toolFooter?.(styledTheme, {
        status: 'running',
        elapsedMs: 2250,
        summary: 'ignored while running',
      }),
    ).toBe('<accent>▲</accent><dim> · </dim><dim>2s</dim>');
    expect(
      kit.toolFooter?.(styledTheme, {
        status: 'completed',
        elapsedMs: 5250,
        summary: ['Exit 0', '', '1 line'],
      }),
    ).toBe(
      '<success>\uf00c</success><dim> · </dim><dim>5s</dim><dim> · </dim><dim>Exit 0</dim><dim> · </dim><dim>1 line</dim>',
    );
  });

  it('keeps untimed and nonterminal footers free of invented elapsed values or terminal summaries', () => {
    expect(kit.toolFooter?.(theme, { status: 'running' })).toBe('△');
    expect(
      kit.toolFooter?.(theme, { status: 'completed', summary: '1 line' }),
    ).toBe('\uf00c · 1 line');
    expect(kit.toolFooter?.(theme, { status: 'failed' })).toBe('\uf00d');
    for (const status of [
      'pending',
      'queued',
      'stopping',
      'unknown',
    ] as const) {
      expect(
        kit.toolFooter?.(theme, {
          status,
          elapsedMs: 2250,
          summary: 'ignored',
        }),
      ).toBe(`${status} · 2s`);
    }
  });

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
      '╰── \uf00c Done ────╯',
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
    expect(styled).toContain('<error>\uf00d</error>');
    expect(styled).not.toContain('<accent>');
  });

  it.each([
    'running',
    'in_progress',
  ] as const)('uses an indicator footer without a static %s glyph or a running label', (status) => {
    const indicator = kit.indicator(theme, undefined, {
      status,
      elapsedMs: 5000,
      label: 'Claude Code',
    });
    for (const options of [
      {},
      { sections: [{ rows: ['output'] }] },
      { part: 'end' as const },
    ]) {
      const lines = kit.card(
        theme,
        { ...options, status, footer: indicator.text },
        24,
      );
      expect(lines.at(-1)).toBe('╰── ◭ · 5s ────────────╯');
      expect(lines.at(-1)).not.toMatch(/◐|Claude Code|running/);
    }
    expect(kit.card(theme, { status }, 24).at(-1)).toContain('╰── ◐ ');
    expect(
      kit.indicator(theme, undefined, {
        status: 'completed',
        label: 'Claude Code',
        elapsedMs: 5000,
      }).text,
    ).toBe('Claude Code · 5s');
  });

  it('uses the standard context footer in full, sectioned and split cards without duplicating explicit footers', () => {
    for (const options of [
      {},
      { sections: [{ rows: ['output'] }] },
      { part: 'end' as const },
    ]) {
      const context = {
        executionStarted: true,
        isPartial: true,
        state: { startedAt: Date.now() - 5250 },
      };
      expect(
        kit.card(theme, { ...options, status: 'running', context }, 40).at(-1),
      ).toContain('╰── ◭ · 5s ');
      expect(
        kit
          .card(
            theme,
            {
              ...options,
              status: 'completed',
              context,
              summary: ['Exit 0', '1 line'],
            },
            40,
          )
          .at(-1),
      ).toContain('╰── \uf00c · 5s · Exit 0 · 1 line ');
      for (const [status, footer] of [
        ['completed', '\uf00c · 5s · Exit 0'],
        ['failed', '\uf00d · 5s · Exit 1'],
      ] as const) {
        expect(
          kit.card(theme, { ...options, status, context, footer }, 40).at(-1),
        ).toContain(`╰── ${footer} `);
      }
      expect(
        kit
          .card(
            theme,
            {
              ...options,
              status: 'completed',
              context,
              footer: '',
            },
            40,
          )
          .at(-1),
      ).toContain('╰── \uf00c ');
    }
  });

  it('recognizes ANSI-styled self-contained terminal footers while preserving legacy plain decoration', () => {
    const ansiTheme: RenderKitTheme = {
      fg: (_role, text) => `\u001b[32m${text}\u001b[39m`,
    };
    for (const status of ['completed', 'failed', 'cancelled'] as const) {
      const footer =
        kit.toolFooter?.(ansiTheme, { status, elapsedMs: 2250 }) ?? '';
      const bottom = stripTerminalSequences(
        kit.card(ansiTheme, { status, footer }, 24).at(-1) ?? '',
      );
      expect(bottom).toContain(
        status === 'completed' ? '╰── \uf00c · 2s ' : '╰── \uf00d · 2s ',
      );
      expect(bottom.match(/[\uf00c\uf00d]/g)).toHaveLength(1);
      expect(
        stripTerminalSequences(
          kit.card(ansiTheme, { status, footer: 'Done' }, 24).at(-1) ?? '',
        ),
      ).toContain(
        status === 'completed'
          ? '\uf00c Done'
          : status === 'failed'
            ? '\uf00d Done'
            : '\uf05e Done',
      );
    }
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
      '<success>\uf00c</success>',
    );
    expect(kit.statusGlyph(styledTheme, 'failed')).toBe(
      '<error>\uf00d</error>',
    );
    expect(kit.statusGlyph(styledTheme, 'running')).toBe('<accent>◐</accent>');
    expect(kit.statusGlyph(styledTheme, 'in_progress')).toBe(
      '<accent>◐</accent>',
    );
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
    ).toBe('›   └─ \uf00c Task');
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
    ).toBe('\u{f051f}');
    expect(
      kit.indicator(theme, context, { status: 'completed', frame: 1 }).glyph,
    ).toBe('\uf00c');
  });

  it('uses elapsed pyramid frames in footer text without changing caller-owned working prefixes', () => {
    expect(
      kit.indicator(
        styledTheme,
        { isPartial: true },
        {
          status: 'running',
          elapsedMs: 5000,
          frame: 1,
        },
      ),
    ).toEqual({
      glyph: '<accent>⠙</accent>',
      elapsedMs: 5000,
      elapsed: '5s',
      text: '<accent>◭</accent><dim> · </dim><dim>5s</dim>',
    });
    expect(kit.indicator(theme, undefined, { status: 'running' }).text).toBe(
      '△',
    );
  });

  it('accepts explicit elapsed time and keeps absent elapsed values out of footers', () => {
    for (const status of ['running', 'in_progress'] as const) {
      expect(
        kit.indicator(theme, undefined, { status, elapsedMs: 1250 }).glyph,
      ).toBe('◭');
    }
    expect(
      kit.indicator(theme, undefined, { status: 'running', elapsedMs: 2250 }),
    ).toEqual({
      glyph: '▲',
      elapsedMs: 2250,
      elapsed: '2s',
      text: '▲ · 2s',
    });
    expect(
      kit.indicator(theme, undefined, {
        status: 'completed',
        elapsedMs: 2250,
        label: 'Exit 0',
      }),
    ).toEqual({
      glyph: '\uf00c',
      elapsedMs: 2250,
      elapsed: '2.3s',
      text: 'Exit 0 · 2.3s',
    });
    expect(kit.indicator(theme).elapsed).toBe('');
    expect(kit.indicator(theme).text).toBe('pending');
  });
});
