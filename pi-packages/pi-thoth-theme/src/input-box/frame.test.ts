import {
  CURSOR_MARKER,
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
import { createBreathingFrame } from './gradient.ts';

const theme = { fg: vi.fn((_token: string, text: string) => text) };

describe('input-box frame', () => {
  it.each([
    ['truecolor', 0, '\x1b[38;2;115;104;80m'],
    ['truecolor', 600, '\x1b[38;2;212;175;55m'],
    ['truecolor', 1200, '\x1b[38;2;242;201;76m'],
    ['256color', 0, '\x1b[38;5;59m'],
    ['256color', 600, '\x1b[38;5;179m'],
    ['256color', 1200, '\x1b[38;5;221m'],
  ] as const)('colors every border cell uniformly in %s at %i ms without changing labels, content, cursor, or widths', (mode, now, color) => {
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
    const frame = createBreathingFrame(now, mode);
    const animated = [
      renderInputTop(40, mutedTheme, label, 12, frame),
      wrapContentRow(cursor, 40, mutedTheme, frame),
      wrapContentRow('content ─ │ ╭ ╮ ╰ ╯', 40, mutedTheme, frame),
      renderInputBottom(40, mutedTheme, 34, frame),
    ];

    expect(animated[0]).toBe(
      `${color}╭─ \x1b[39m${label}${color} ─ \x1b[39m\x1b[33m↑ 12 more\x1b[0m${color} ${'─'.repeat(13)}╮\x1b[39m`,
    );
    expect(animated[1]).toBe(
      `${color}│\x1b[39m${cursor}${' '.repeat(36)}${color}│\x1b[39m`,
    );
    expect(animated[2]).toBe(
      `${color}│\x1b[39mcontent ─ │ ╭ ╮ ╰ ╯${' '.repeat(19)}${color}│\x1b[39m`,
    );
    expect(animated[3]).toBe(
      `${color}╰─ \x1b[39m\x1b[33m↓ 34 more\x1b[0m${color} ${'─'.repeat(26)}╯\x1b[39m`,
    );
    expect(animated.join('\n')).not.toMatch(/[━┃┏┓┗┛]/u);
    expect(animated.map(stripTerminalSequences)).toEqual(
      idle.map(stripTerminalSequences),
    );
    expect(animated.map(visibleWidth)).toEqual([40, 40, 40, 40]);
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
      const frame = createBreathingFrame(0, 'truecolor');
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
      expect(animated.map(stripTerminalSequences)).toEqual(
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
