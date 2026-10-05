import type { Theme } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type BoxOptions, renderBox } from './box.ts';

// Observe the external SDK boundary without changing its truncation behavior.
vi.mock('@earendil-works/pi-tui', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@earendil-works/pi-tui')>();
  return { ...actual, truncateToWidth: vi.fn(actual.truncateToWidth) };
});

const BOX_HORIZONTAL = '─';
const BOX_VERTICAL = '│';
const BOX_ROUND_TOP_LEFT = '╭';
const BOX_ROUND_TOP_RIGHT = '╮';
const BOX_ROUND_BOTTOM_LEFT = '╰';
const BOX_ROUND_BOTTOM_RIGHT = '╯';

// Frozen pre-AC-2 implementation: keep every original truncation pass as the
// byte-equivalence oracle, independent of production fast-path changes.
function renderBoxReference(
  theme: Pick<Theme, 'fg'>,
  bodyLines: string[],
  width: number,
  options: BoxOptions = {},
): string[] {
  const safeWidth = Math.max(0, Math.floor(width));
  const borderColor = options.isError ? 'error' : 'accent';

  if (safeWidth <= 0) {
    return [];
  }

  if (safeWidth <= 4) {
    const raw = [options.title, ...bodyLines, options.footer].filter(
      (l): l is string => typeof l === 'string' && l.length > 0,
    );
    const lines = raw.length > 0 ? raw : bodyLines;
    return lines.map((l) => truncateToWidth(l, safeWidth));
  }

  const result: string[] = [];
  const innerWidth = Math.max(1, safeWidth - 2);

  // Header / Top border
  if (options.title) {
    const rawTitle = ` ${options.title} `;
    const maxTitleWidth = Math.max(1, innerWidth - 4);
    const fitTitle =
      visibleWidth(rawTitle) > maxTitleWidth
        ? ` ${truncateToWidth(options.title, Math.max(1, maxTitleWidth - 2))} `
        : rawTitle;
    const titleWidth = visibleWidth(fitTitle);
    const remainingDashes = Math.max(1, innerWidth - 2 - titleWidth);
    const top = `${theme.fg(borderColor, `${BOX_ROUND_TOP_LEFT}${BOX_HORIZONTAL}${BOX_HORIZONTAL}`)}${fitTitle}${theme.fg(
      borderColor,
      `${BOX_HORIZONTAL.repeat(remainingDashes)}${BOX_ROUND_TOP_RIGHT}`,
    )}`;
    result.push(truncateToWidth(top, safeWidth));
  } else {
    const top = `${theme.fg(borderColor, `${BOX_ROUND_TOP_LEFT}${BOX_HORIZONTAL.repeat(innerWidth)}${BOX_ROUND_TOP_RIGHT}`)}`;
    result.push(truncateToWidth(top, safeWidth));
  }

  // Body lines
  const contentWidth = Math.max(1, innerWidth - 2);
  for (const line of bodyLines) {
    const truncated = truncateToWidth(line, contentWidth);
    const pad = Math.max(0, contentWidth - visibleWidth(truncated));
    const framed = `${theme.fg(borderColor, `${BOX_VERTICAL} `)}${truncated}${' '.repeat(pad)}${theme.fg(borderColor, ` ${BOX_VERTICAL}`)}`;
    result.push(truncateToWidth(framed, safeWidth));
  }

  // Footer / Bottom border
  if (options.footer) {
    const rawFooter = ` ${options.footer} `;
    const maxFooterWidth = Math.max(1, innerWidth - 4);
    const fitFooter =
      visibleWidth(rawFooter) > maxFooterWidth
        ? ` ${truncateToWidth(options.footer, Math.max(1, maxFooterWidth - 2))} `
        : rawFooter;
    const footerWidth = visibleWidth(fitFooter);
    const remainingDashes = Math.max(1, innerWidth - 2 - footerWidth);
    const bottom = `${theme.fg(borderColor, `${BOX_ROUND_BOTTOM_LEFT}${BOX_HORIZONTAL}${BOX_HORIZONTAL}`)}${fitFooter}${theme.fg(
      borderColor,
      `${BOX_HORIZONTAL.repeat(remainingDashes)}${BOX_ROUND_BOTTOM_RIGHT}`,
    )}`;
    result.push(truncateToWidth(bottom, safeWidth));
  } else {
    const bottom = `${theme.fg(
      borderColor,
      `${BOX_ROUND_BOTTOM_LEFT}${BOX_HORIZONTAL.repeat(innerWidth)}${BOX_ROUND_BOTTOM_RIGHT}`,
    )}`;
    result.push(truncateToWidth(bottom, safeWidth));
  }

  return result.map((l) => truncateToWidth(l, safeWidth));
}

const ansiTheme: Pick<Theme, 'fg'> = {
  fg: (color, text) =>
    `\x1b[${color === 'error' ? '31' : '33'}m${text}\x1b[39m`,
};
const plainTheme: Pick<Theme, 'fg'> = { fg: (_color, text) => text };
const widths = [-1, 0, 0.9, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 20.9, 40, 120];
const splitZwj = 'xx👩\x1b[31m\u200d💻\x1b[0m';
const splitFlag = 'xx🇺\x1b[31m🇸\x1b[0m';
const printableAscii = String.fromCharCode(
  ...Array.from({ length: 95 }, (_, index) => index + 0x20),
);
const bodyCases = [
  { name: 'no body', lines: [] },
  { name: 'empty line', lines: [''] },
  { name: 'multiple empty lines', lines: ['', '', ''] },
  {
    name: 'ASCII at fitting and overflowing widths',
    lines: ['a', 'ab', 'abcd', 'hello world', 'x'.repeat(130)],
  },
  { name: 'all printable ASCII characters', lines: [printableAscii] },
  { name: 'whitespace and empty rows', lines: ['', ' ', '   ', 'a  ', ''] },
  {
    name: 'ANSI-colored ASCII',
    lines: ['\x1b[31mred\x1b[0m', `\x1b[1m${'long text '.repeat(8)}\x1b[22m`],
  },
  { name: 'wide CJK', lines: ['中', '中文测试', 'a中b文c'] },
  { name: 'emoji', lines: ['🙂', 'x🙂y', '👍🏽', '👩\u200d💻'] },
  { name: 'escape-split ZWJ cluster', lines: [splitZwj] },
  { name: 'flags', lines: ['🇺🇸', 'x🇺🇸🇨🇦y', splitFlag] },
  { name: 'tabs', lines: ['\t', 'a\tb', '\t\t', 'abc\tdef'] },
  { name: 'combining marks', lines: ['e\u0301', 'x\u0301y', '\u0301'] },
  {
    name: 'controls are not printable ASCII',
    lines: ['a\nb', 'abc\n', '\r', '\x00', '\x7f', '\x9b31mred\x9b0m'],
  },
  {
    name: 'terminal escapes',
    lines: [
      '\x1b[2Ktext',
      '\x1b]8;;https://example.test\x07link\x1b]8;;\x07',
      '\x1b',
    ],
  },
  {
    name: 'mixed rows',
    lines: [
      '',
      'ASCII',
      '\x1b[32mgreen\x1b[0m',
      '中文',
      splitZwj,
      splitFlag,
      'a\tb',
      '',
    ],
  },
];
const optionCases: BoxOptions[] = [
  {},
  { title: 'Title' },
  { footer: 'Footer' },
  { title: '', footer: '' },
  {
    title: 'A long ASCII title that must be truncated',
    footer: 'A long ASCII footer that must be truncated',
  },
  {
    title: '\x1b[32mTitle\x1b[0m',
    footer: '\x1b[31mFooter\x1b[0m',
    isError: true,
  },
  { title: '标题🙂', footer: '结束🇺🇸' },
  { title: splitZwj, footer: splitFlag },
  { title: 'a\tb', footer: 'a\nb' },
];

beforeEach(() => {
  vi.mocked(truncateToWidth).mockClear();
});

describe('renderBox byte equivalence', () => {
  it.each(bodyCases)('matches the original bytes for $name', ({ lines }) => {
    for (const theme of [ansiTheme, plainTheme]) {
      for (const options of optionCases) {
        for (const width of widths) {
          expect(
            renderBox(theme, lines, width, options),
            JSON.stringify({
              width,
              options,
              ansiBorders: theme === ansiTheme,
            }),
          ).toEqual(renderBoxReference(theme, lines, width, options));
          vi.mocked(truncateToWidth).mockClear();
        }
      }
    }
  });
});

describe('renderBox SDK truncation fast path', () => {
  it.each([
    ['ANSI', ansiTheme],
    ['plain', plainTheme],
  ] as const)('skips fitting plain body lines while retaining every framed and final pass (%s borders)', (_name, theme) => {
    const body = ['', 'a', 'abcd'];
    const expected = renderBoxReference(theme, body, 8);
    const originalCalls = [...vi.mocked(truncateToWidth).mock.calls];
    vi.mocked(truncateToWidth).mockClear();

    expect(renderBox(theme, body, 8)).toEqual(expected);
    expect(vi.mocked(truncateToWidth).mock.calls).toEqual(
      originalCalls.filter(([line]) => !body.includes(line)),
    );
  });

  it.each([
    ['over-width ASCII', 'abcde'],
    ['ANSI-colored ASCII', '\x1b[31ma\x1b[0m'],
    ['CJK', '中'],
    ['emoji', '🙂'],
    ['escape-split ZWJ', splitZwj],
    ['flag', '🇺🇸'],
    ['escape-split flag', splitFlag],
    ['tab', '\t'],
    ['trailing newline', 'a\n'],
    ['carriage return', '\r'],
    ['NUL', '\x00'],
    ['DEL', '\x7f'],
    ['combining mark', 'e\u0301'],
    ['bare escape', '\x1b'],
  ])('retains every original SDK pass for %s', (_name, line) => {
    const expected = renderBoxReference(ansiTheme, [line], 8);
    const originalCalls = [...vi.mocked(truncateToWidth).mock.calls];
    vi.mocked(truncateToWidth).mockClear();

    expect(renderBox(ansiTheme, [line], 8)).toEqual(expected);
    expect(vi.mocked(truncateToWidth).mock.calls).toEqual(originalCalls);
  });

  it.each([
    1, 2, 3, 4,
  ])('skips only fitting ASCII in the unframed width-%s fallback', (width) => {
    const body = ['a', 'abcd', '\t', '\x1b[31ma\x1b[0m', '中'];
    const options = { title: 'T', footer: 'F' };
    const expected = renderBoxReference(ansiTheme, body, width, options);
    const originalCalls = [...vi.mocked(truncateToWidth).mock.calls];
    const fittingLines =
      width === 4 ? ['T', 'a', 'abcd', 'F'] : ['T', 'a', 'F'];
    vi.mocked(truncateToWidth).mockClear();

    expect(renderBox(ansiTheme, body, width, options)).toEqual(expected);
    expect(vi.mocked(truncateToWidth).mock.calls).toEqual(
      originalCalls.filter(([line]) => !fittingLines.includes(line)),
    );
  });
});
