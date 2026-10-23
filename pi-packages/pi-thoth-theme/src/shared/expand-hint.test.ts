import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';
import { compactExpandHint, fitExpandHint } from './expand-hint.ts';
import { icon } from './icons.ts';

const dim = (text: string) => `\x1b[2m${text}\x1b[22m`;

describe('expansion hint fitting', () => {
  it.each([
    '3 matches in 2 files · ctrl+o to expand',
    dim('3 matches in 2 files · ctrl+o to expand'),
    `${dim('3 matches in 2 files')}${dim(' · ctrl+o to expand')}`,
  ])('keeps fitting rows byte-identical and compacts only when needed: %s', (row) => {
    expect(fitExpandHint(row, 80)).toBe(row);
    expect(stripTerminalSequences(fitExpandHint(row, 31))).toBe(
      '3 matches in 2 files · ctrl+o',
    );
    expect(compactExpandHint(row)).toBe(
      row.replace('ctrl+o to expand', 'ctrl+o'),
    );
  });

  it.each([
    dim('3 matches in 2 files · ctrl+o to expand'),
    `${dim('3 matches in 2 files')}${dim(' · ctrl+o to expand')}`,
  ])('truncates the prefix and replays the hint styling: %s', (row) => {
    const narrow = fitExpandHint(row, 20);
    expect(stripTerminalSequences(narrow)).toBe('3 matches … · ctrl+o');
    expect(visibleWidth(narrow)).toBe(20);
    expect(narrow.endsWith('\x1b[2m · ctrl+o\x1b[22m')).toBe(true);
  });

  it('keeps a separately styled key, without mistaking its SGR for key text', () => {
    const row = `3 matches in 2 files · ${dim('ctrl+o to expand')}`;
    const narrow = fitExpandHint(row, 20);
    expect(stripTerminalSequences(narrow)).toBe('3 matches … · ctrl+o');
    expect(narrow.endsWith(' · \x1b[2mctrl+o\x1b[22m')).toBe(true);
    expect(visibleWidth(narrow)).toBe(20);
    expect(compactExpandHint(row)).toBe(
      `3 matches in 2 files · ${dim('ctrl+o')}`,
    );
  });

  it.each([
    `3 matches in 2 files · ${dim('ctrl+o')} to expand`,
    `3 matches in 2 files · ctrl+${dim('o')} to expand`,
  ])('keeps styling within the key token: %s', (row) => {
    const narrow = fitExpandHint(row, 20);
    expect(stripTerminalSequences(narrow)).toBe('3 matches … · ctrl+o');
    expect(visibleWidth(narrow)).toBe(20);
    expect(compactExpandHint(row)).toBe(row.replace(' to expand', ''));
  });

  it('does not mistake an SGR-only span for a key', () => {
    const row = `3 matches in 2 files · \x1b[2m to expand`;
    expect(fitExpandHint(row, 20)).toBe(row);
    expect(compactExpandHint(row)).toBe(row);
  });

  it('preserves trailing SGR resets and whitespace', () => {
    const row = `${dim('3 matches in 2 files · ctrl+o to expand')}  \x1b[0m`;
    const narrow = fitExpandHint(row, 22);
    expect(stripTerminalSequences(narrow)).toBe('3 matches … · ctrl+o  ');
    expect(narrow.endsWith('\x1b[2m · ctrl+o\x1b[22m  \x1b[0m')).toBe(true);
    expect(visibleWidth(narrow)).toBe(22);
  });

  it('replays only styling after the last full reset', () => {
    const row = `\x1b[31mold\x1b[0m\x1b[2m matches in 2 files · ctrl+o to expand\x1b[22m`;
    const narrow = fitExpandHint(row, 20);
    expect(narrow.endsWith('\x1b[2m · ctrl+o\x1b[22m')).toBe(true);
    expect(narrow).not.toContain('\x1b[31m\x1b[2m ·');
  });

  it('keeps a whitespace separator, as in the upstream footer example', () => {
    expect(
      stripTerminalSequences(
        fitExpandHint('2.23s · ~8 words   Ctrl+O to expand', 14),
      ),
    ).toBe('2.23…   Ctrl+O');
  });

  it.each([
    'nerd',
    'unicode',
    'ascii',
  ] as const)('recognizes the %s separator and ellipsis', (mode) => {
    const separator = icon('separator', mode);
    const ellipsis = icon('ellipsis', mode);
    expect(
      stripTerminalSequences(
        fitExpandHint(
          `3 matches in 2 files ${separator} ctrl+o to expand`,
          20,
          ellipsis,
        ),
      ),
    ).toBe(`3 matche${mode === 'ascii' ? '...' : 's …'} ${separator} ctrl+o`);
    expect(
      stripTerminalSequences(
        fitExpandHint(
          `3 matches in 2 files${separator}ctrl+o to expand`,
          20,
          ellipsis,
        ),
      ),
    ).toBe(`3 matches ${mode === 'ascii' ? '...' : 'in…'}${separator}ctrl+o`);
  });

  it.each([
    'no hint on this row',
    'ctrl+o to expand, then read on',
    '… 12 more lines · open details',
  ])('does not change absent, non-trailing or free-form hints: %s', (row) => {
    expect(fitExpandHint(row, 10)).toBe(row);
    expect(compactExpandHint(row)).toBe(row);
  });

  it('recognizes rebound keys without consulting live keybindings', () => {
    expect(fitExpandHint('… +26 earlier lines · Alt+X to expand', 28)).toBe(
      '… +26 earlier lines · Alt+X',
    );
  });

  it.each([
    0, 1, 6, 7, 8, 9, -1,
  ])('leaves rows unchanged at or below the key budget: %i', (width) => {
    const row = '120 more lines · ctrl+o to expand';
    expect(fitExpandHint(row, width)).toBe(row);
  });

  it('leaves a hint without substantive preceding text unchanged', () => {
    expect(fitExpandHint(' · ctrl+o to expand', 7)).toBe(' · ctrl+o to expand');
  });

  it('measures wide glyphs in display columns', () => {
    const row = '漢字漢字漢字漢字 · ctrl+o to expand';
    const narrow = fitExpandHint(row, 20);
    expect(stripTerminalSequences(narrow)).toBe('漢字漢字漢… · ctrl+o');
    expect(visibleWidth(narrow)).toBeLessThanOrEqual(20);
  });

  it('accepts the trailing-token heuristic even for literal output that looks like data', () => {
    // No metadata distinguishes this literal data from a producer's hint.
    expect(fitExpandHint('literal output token to expand', 20)).toBe(
      'literal output token',
    );
  });
});
