import {
  CURSOR_MARKER,
  foregroundAnsi,
  rgbColor,
  stripTerminalSequences,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';
import {
  renderInputBottom,
  renderInputTop,
  renderPlaceholder,
  wrapContentRow,
} from './frame.ts';
import { createCometFrame } from './gradient.ts';

const theme = { fg: vi.fn((_token: string, text: string) => text) };

function borderGeometry(line: string): string {
  return stripTerminalSequences(line).replace(/[━┃┏┓┗┛]/gu, (glyph) =>
    '─│╭╮╰╯'.charAt('━┃┏┓┗┛'.indexOf(glyph)),
  );
}

describe('input-box frame', () => {
  it('dims the working border but keeps labels and scroll counts muted', () => {
    const contrastTheme = {
      fg: (token: string, text: string) =>
        `\x1b[${token === 'dim' ? '2' : '33'}m${text}\x1b[0m`,
    };
    const label = '\x1b[33mstatus ─ ╭\x1b[0m';
    const frame = createCometFrame(80, 4, 875, 'truecolor');
    const top = renderInputTop(80, contrastTheme, label, 12, frame);
    const content = wrapContentRow(
      'unchanged ─ │ ╭ ╮ ╰ ╯',
      80,
      contrastTheme,
      frame,
      1,
    );
    const bottom = renderInputBottom(80, contrastTheme, 34, frame);
    expect(top.startsWith('\x1b[2m╭─ \x1b[0m')).toBe(true);
    expect(content.startsWith('\x1b[2m│\x1b[0m')).toBe(true);
    expect(content.endsWith('\x1b[2m│\x1b[0m')).toBe(true);
    expect(bottom.startsWith('\x1b[2m╰─ \x1b[0m')).toBe(true);
    expect(bottom.endsWith('─╯\x1b[0m')).toBe(true);
    expect(top).toContain(label);
    expect(top).toContain('\x1b[33m↑ 12 more\x1b[0m');
    expect(bottom).toContain('\x1b[33m↓ 34 more\x1b[0m');
    expect(content).toContain('unchanged ─ │ ╭ ╮ ╰ ╯');
  });

  it('colors every perimeter edge without changing labels, content, cursor, or line widths', () => {
    const mutedTheme = {
      fg: (_token: string, text: string) => `\x1b[33m${text}\x1b[0m`,
    };
    const label = '\x1b[36m╭ status ─\x1b[0m';
    const cursor = `${CURSOR_MARKER}\x1b[7m界\x1b[0m`;
    const idle = [
      renderInputTop(40, mutedTheme, label, 12),
      wrapContentRow(cursor, 40, mutedTheme),
      wrapContentRow('content ─ │ ╭ ╮ ╰ ╯', 40, mutedTheme),
      renderInputBottom(40, mutedTheme, 34),
    ];
    const head = `${foregroundAnsi(rgbColor(242, 201, 76), 'truecolor')}\x1b[1m`;
    // Independent worked perimeter: top 0..39, right 40..41,
    // bottom 42..81 (right to left), left 82..83 (bottom to top).
    for (const [index, row, glyph] of [
      [0, 0, '┏'],
      [39, 0, '┓'],
      [40, 1, '┃'],
      [41, 2, '┃'],
      [42, 3, '┛'],
      [81, 3, '┗'],
      [82, 2, '┃'],
      [83, 1, '┃'],
    ] as const) {
      const frame = createCometFrame(
        40,
        4,
        Math.ceil((index * 3500) / 84),
        'truecolor',
      );
      const animated = [
        renderInputTop(40, mutedTheme, label, 12, frame),
        wrapContentRow(cursor, 40, mutedTheme, frame, 1),
        wrapContentRow('content ─ │ ╭ ╮ ╰ ╯', 40, mutedTheme, frame, 2),
        renderInputBottom(40, mutedTheme, 34, frame),
      ];
      expect(animated[row]).toContain(`${head}${glyph}`);
      expect(animated.map(borderGeometry)).toEqual(
        idle.map(stripTerminalSequences),
      );
      expect(animated.map(visibleWidth)).toEqual([40, 40, 40, 40]);
      expect(animated[0]).toContain(label);
      expect(animated[0]).toContain('\x1b[33m↑ 12 more');
      expect(animated[3]).toContain('\x1b[33m↓ 34 more');
      expect(animated[1]).toContain(cursor);
      expect(animated[2]).toContain('content ─ │ ╭ ╮ ╰ ╯');
    }
  });

  it('lets the head pass behind status and scroll labels without rewriting their glyphs', () => {
    const contrastTheme = {
      fg: (token: string, text: string) =>
        `\x1b[${token === 'dim' ? '2' : '33'}m${text}\x1b[0m`,
    };
    const label = '\x1b[36m╭ status ─\x1b[0m';
    const idle = [
      renderInputTop(40, contrastTheme, label, 12),
      renderInputBottom(40, contrastTheme, 34),
    ];
    // These cells lie inside the status, top scroll count, and bottom scroll count.
    for (const index of [8, 18, 76]) {
      const frame = createCometFrame(
        40,
        3,
        Math.ceil((index * 3500) / 82),
        'truecolor',
      );
      const animated = [
        renderInputTop(40, contrastTheme, label, 12, frame),
        renderInputBottom(40, contrastTheme, 34, frame),
      ];
      expect(animated[0]).toContain(label);
      expect(animated[0]).toContain('\x1b[33m↑ 12 more\x1b[0m');
      expect(animated[1]).toContain('\x1b[33m↓ 34 more\x1b[0m');
      expect(animated.map(borderGeometry)).toEqual(
        idle.map(stripTerminalSequences),
      );
      expect(animated.map(visibleWidth)).toEqual([40, 40]);
    }
  });

  it('renders a muted rounded box with a top-left label and cursor intact', () => {
    const cursor = `${CURSOR_MARKER}\x1b[7mA\x1b[0m`;
    const lines = [
      renderInputTop(24, theme, '☥ thoth · ready'),
      wrapContentRow(cursor, 24, theme),
      renderInputBottom(24, theme),
    ];

    expect(lines[0]).toBe('╭─ ☥ thoth · ready ────╮');
    expect(lines[1]).toBe(`│${cursor}${' '.repeat(21)}│`);
    expect(lines[2]).toBe('╰──────────────────────╯');
    expect(lines.map(visibleWidth)).toEqual([24, 24, 24]);
    expect(theme.fg.mock.calls.every(([token]) => token === 'muted')).toBe(
      true,
    );
  });

  it('colors the full-width plain bottom rule and its native scroll indicator in muted', () => {
    const mutedTheme = {
      fg: (token: string, text: string) =>
        token === 'muted' ? `\x1b[33m${text}\x1b[0m` : text,
    };
    expect(renderInputBottom(24, mutedTheme)).toBe(
      '\x1b[33m╰──────────────────────╯\x1b[0m',
    );
    const scrolled = renderInputBottom(24, mutedTheme, 34);
    expect(scrolled).toContain('\x1b[33m↓ 34 more\x1b[0m');
    expect(scrolled.startsWith('\x1b[33m╰─ ')).toBe(true);
    expect(scrolled.endsWith('─╯\x1b[0m')).toBe(true);
    expect(visibleWidth(scrolled)).toBe(24);
  });

  it('inserts a dim placeholder after the empty cursor without moving it or widening the row', () => {
    const dimTheme = {
      fg: (token: string, text: string) =>
        token === 'dim' ? `\x1b[2m${text}\x1b[0m` : text,
    };
    const cursor = `${CURSOR_MARKER}\x1b[7m \x1b[0m`;
    const line = `  ${cursor}${' '.repeat(27)}`;
    const rendered = renderPlaceholder(line, 30, dimTheme, '');

    expect(rendered).toBe(
      `  ${cursor}\x1b[2mtype or / for commands\x1b[0m${' '.repeat(5)}`,
    );
    expect(visibleWidth(rendered)).toBe(30);
    expect(renderPlaceholder(line, 30, dimTheme, 'hello')).toBe(line);
    expect(renderPlaceholder(line, 30, dimTheme, ' ')).toBe(line);
    const narrow = renderPlaceholder(line, 8, dimTheme, '');
    expect(narrow).toContain(`  ${cursor}\x1b[2mtype `);
    expect(visibleWidth(narrow)).toBe(8);
    const unfocused = renderPlaceholder('\x1b[7m \x1b[0m   ', 4, dimTheme, '');
    expect(unfocused).toContain('\x1b[7m \x1b[0m\x1b[2mtyp');
    expect(visibleWidth(unfocused)).toBe(4);
    expect(renderPlaceholder('no cursor', 30, dimTheme, '')).toBe('no cursor');
  });

  it('keeps scroll counts visible without overflowing ANSI or wide-character labels', () => {
    for (const width of [0, 1, 2, 5, 6, 16, 24, 40, 80]) {
      const lines = [
        renderInputTop(width, theme, '\x1b[33m☥ thoth · ready\x1b[0m', 12),
        renderInputBottom(width, theme, 34),
        wrapContentRow(
          `${CURSOR_MARKER}\x1b[7m界\x1b[0m followed by long text`,
          width,
          theme,
        ),
      ];
      const frame = createCometFrame(width, 3, 0, 'truecolor');
      const animated = [
        renderInputTop(
          width,
          theme,
          '\x1b[33m☥ thoth · ready\x1b[0m',
          12,
          frame,
        ),
        renderInputBottom(width, theme, 34, frame),
        wrapContentRow(
          `${CURSOR_MARKER}\x1b[7m界\x1b[0m followed by long text`,
          width,
          theme,
          frame,
        ),
      ];
      expect(animated.map(borderGeometry)).toEqual(
        lines.map(stripTerminalSequences),
      );
      expect(animated.map(visibleWidth)).toEqual(lines.map(visibleWidth));
      expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
      if (width >= 16) {
        expect(lines[0]).toContain('↑ 12 more');
        expect(lines[1]).toContain('↓ 34 more');
        expect(lines[0]).toMatch(/^╭/);
        expect(lines[0]).toMatch(/╮$/);
        expect(lines[1]).toMatch(/^╰/);
        expect(lines[1]).toMatch(/╯$/);
      }
    }
  });
});
