import { sep } from 'node:path';
import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';
import {
  type FooterData,
  formatBranchSegment,
  formatContextSegments,
  formatCwd,
  formatCwdSegments,
  formatModelSegments,
  formatTokens,
  renderStatusLine,
  type StatusData,
} from './layout.ts';

const mockTheme = {
  fg: (token: string, text: string) => `[${token}]${text}[/${token}]`,
};

describe('formatCwd', () => {
  it.each([
    { cwd: '/home/test', expected: '~' },
    {
      cwd: '/home/test/project/src',
      expected: `~${sep}project${sep}src`,
    },
    {
      cwd: '/home/test/project/../other',
      expected: `~${sep}other`,
    },
  ])('shortens $cwd inside home like the native footer', ({
    cwd,
    expected,
  }) => {
    expect(formatCwd(cwd, '/home/test')).toBe(expected);
  });

  it.each([
    '/home/test-other/project',
    '/home',
    '/home/test/../other',
    '/workspace/project/../src',
  ])('preserves %s outside home without normalization', (cwd) => {
    expect(formatCwd(cwd, '/home/test')).toBe(cwd);
  });

  it('preserves cwd when home is missing or empty', () => {
    expect(formatCwd('/workspace/project/../src')).toBe(
      '/workspace/project/../src',
    );
    expect(formatCwd('/workspace/project/../src', '')).toBe(
      '/workspace/project/../src',
    );
  });

  it('handles trailing separators and dot-prefixed child directories', () => {
    expect(formatCwd('/home/test/', '/home/test/')).toBe('~');
    expect(formatCwd('/home/test/..cache', '/home/test/')).toBe(
      `~${sep}..cache`,
    );
  });

  it.runIf(process.platform === 'win32')(
    'shortens native Windows paths and preserves paths on another drive',
    () => {
      expect(
        formatCwd(
          'C:\\Users\\EremesNG\\orca\\workspaces\\thoth-agents\\thoth-theme',
          'C:\\Users\\EremesNG',
        ),
      ).toBe('~\\orca\\workspaces\\thoth-agents\\thoth-theme');
      expect(
        formatCwd('c:/users/eremesng/project', 'C:\\Users\\EremesNG\\'),
      ).toBe('~\\project');
      expect(formatCwd('D:\\project', 'C:\\Users\\EremesNG')).toBe(
        'D:\\project',
      );
    },
  );
});

describe('formatTokens', () => {
  it('formats counts under 1K as plain numbers', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(500)).toBe('500');
    expect(formatTokens(999)).toBe('999');
  });

  it('formats counts in thousands with uppercase K and single decimal or integer', () => {
    expect(formatTokens(1000)).toBe('1K');
    expect(formatTokens(30000)).toBe('30K');
    expect(formatTokens(200000)).toBe('200K');
    expect(formatTokens(425900)).toBe('425.9K');
  });

  it('formats counts in millions with uppercase M and single decimal or integer', () => {
    expect(formatTokens(1000000)).toBe('1M');
    expect(formatTokens(1500000)).toBe('1.5M');
    expect(formatTokens(2000000)).toBe('2M');
  });
});

describe('renderStatusLine - subscription cost', () => {
  it.each([
    'nerd',
    'ascii',
  ] as const)('appends (sub) only for subscription cost in %s mode', (mode) => {
    const marked = renderStatusLine(
      { cost: 1.234, isSubscription: true },
      { width: 100, mode, theme: mockTheme },
    );
    expect(marked).toBe('[accent]$1.234 (sub)[/accent]');

    const unmarked = renderStatusLine(
      { cost: 1.234, isSubscription: false },
      { width: 100, mode },
    );
    expect(unmarked).toBe('$1.234');
    expect(renderStatusLine({ cost: 1.234 }, { width: 100, mode })).toBe(
      '$1.234',
    );
  });

  it.each([
    'nerd',
    'ascii',
  ] as const)('prioritizes summed subscription cost within narrow widths in %s mode', (mode) => {
    const data: StatusData = {
      modelName: 'A very long model display name',
      cost: 0.3,
      subagentCost: 0.7,
      isSubscription: true,
    };
    for (let width = 1; width <= 60; width++) {
      const rendered = renderStatusLine(data, { width, mode });
      expect(visibleWidth(rendered)).toBeLessThanOrEqual(width);
      if (width >= 12) expect(rendered).toContain('$1.000 (sub)');
    }
  });
});

describe('footer row - cost, tokens, cache and tok/s only', () => {
  const data: FooterData = {
    modelName: 'Claude 3.5 Sonnet',
    thinkingLevel: 'medium',
    gitBranch: 'feature/ac-2',
    cwd: '~/project',
    contextPercent: 43,
    contextTokens: 425900,
    contextWindow: 1000000,
    cost: 1.234,
    tokenTotals: { input: 12_300, output: 3_400, cacheRead: 80_000 },
    tokensPerSecond: 42.46,
  };

  it('renders cost, ↑input ↓output, cache read and tok/s in priority order', () => {
    expect(renderStatusLine(data, { width: 200, mode: 'nerd' })).toBe(
      '$1.234 ◆ ↑12.3K ↓3.4K ◆ cache 80K ◆ 42 tok/s',
    );
  });

  it('renders ASCII glyphs', () => {
    expect(renderStatusLine(data, { width: 200, mode: 'ascii' })).toBe(
      '$1.234 | ^12.3K v3.4K | cache 80K | 42 tok/s',
    );
  });

  it('never renders model, effort, branch, cwd or context', () => {
    const rendered = renderStatusLine(data, { width: 200, mode: 'nerd' });
    for (const text of [
      'Claude',
      '◐',
      'med',
      'feature',
      '⑂',
      '~/project',
      '%',
      '425',
      '●',
    ])
      expect(rendered).not.toContain(text);
  });

  it('shows a dash for unmeasured tok/s and formats slow rates with one decimal', () => {
    expect(
      renderStatusLine(
        { ...data, tokensPerSecond: null },
        { width: 200, mode: 'nerd' },
      ),
    ).toBe('$1.234 ◆ ↑12.3K ↓3.4K ◆ cache 80K ◆ — tok/s');
    expect(
      renderStatusLine(
        { ...data, tokensPerSecond: 7.25 },
        { width: 200, mode: 'nerd' },
      ),
    ).toContain('7.3 tok/s');
  });

  it('omits rate and tokens when the snapshot has none', () => {
    expect(renderStatusLine({ cost: 0.5 }, { width: 200, mode: 'nerd' })).toBe(
      '$0.500',
    );
    expect(renderStatusLine({}, { width: 200, mode: 'nerd' })).toBe('');
  });

  it('adds subagent cost and applies thoth palette tokens', () => {
    const rendered = renderStatusLine(
      { ...data, subagentCost: 0.766, isSubscription: true },
      { width: 200, mode: 'nerd', theme: mockTheme },
    );
    expect(rendered).toContain('[accent]$2.000 (sub)[/accent]');
    expect(rendered).toContain('[muted]↑12.3K ↓3.4K[/muted]');
    expect(rendered).toContain('[muted]cache 80K[/muted]');
    expect(rendered).toContain('[muted]42 tok/s[/muted]');
  });

  it('drops tok/s, then cache, then tokens, then truncates cost as width shrinks', () => {
    const at = (width: number) =>
      renderStatusLine(data, { width, mode: 'nerd' });
    expect(at(44)).toBe('$1.234 ◆ ↑12.3K ↓3.4K ◆ cache 80K ◆ 42 tok/s');
    expect(at(43)).toBe('$1.234 ◆ ↑12.3K ↓3.4K ◆ cache 80K');
    expect(at(33)).toBe('$1.234 ◆ ↑12.3K ↓3.4K ◆ cache 80K');
    expect(at(32)).toBe('$1.234 ◆ ↑12.3K ↓3.4K');
    expect(at(21)).toBe('$1.234 ◆ ↑12.3K ↓3.4K');
    expect(at(20)).toBe('$1.234');
    expect(at(6)).toBe('$1.234');
    expect(stripTerminalSequences(at(4))).toBe('$1.2');
    expect(at(0)).toBe('');
  });

  it('stays within every width from 1 to 200, including ANSI themes and subagent cost', () => {
    const wide: FooterData = {
      ...data,
      subagentCost: 12.3456,
      isSubscription: true,
      tokenTotals: { input: 123_456_789, output: 9_999_999, cacheRead: 5e9 },
    };
    for (const mode of ['nerd', 'ascii'] as const) {
      for (const theme of [undefined, mockTheme]) {
        let previousSegments = 0;
        for (let width = 1; width <= 200; width++) {
          const rendered = renderStatusLine(wide, { width, mode, theme });
          expect(visibleWidth(rendered)).toBeLessThanOrEqual(width);
          expect(rendered.includes(String.fromCharCode(10))).toBe(false);
          // Lower-priority segments only return as the width grows.
          const segments = rendered.split(mode === 'ascii' ? ' | ' : ' ◆ ');
          expect(segments.length).toBeGreaterThanOrEqual(previousSegments);
          previousSegments = segments.length;
        }
        expect(
          renderStatusLine(wide, { width: 200, mode, theme }).replace(
            /\[\/?[a-zA-Z]+\]/g,
            '',
          ),
        ).toContain('tok/s');
      }
    }
  });
});

describe('border segments', () => {
  const data: StatusData = {
    modelName: 'Opus',
    modelId: 'opus-id',
    thinkingLevel: 'medium',
    gitBranch: 'feature/x',
    cwd: '~/work/project',
    contextPercent: 43,
    contextTokens: 425900,
    contextWindow: 1000000,
  };

  it('formats branch, model and effort pieces with droppable separators', () => {
    expect(formatBranchSegment(data)).toBe('· ⑂ feature/x');
    expect(formatBranchSegment({}, { mode: 'ascii' })).toBe('');
    expect(formatBranchSegment(data, { mode: 'ascii' })).toBe(
      '. git feature/x',
    );
    expect(formatModelSegments(data)).toEqual(['● Opus', '· ◐ med']);
    expect(formatModelSegments(data, { mode: 'ascii' })).toEqual([
      '* Opus',
      '. o med',
    ]);
    expect(formatModelSegments({ modelId: 'id' })).toEqual(['● id']);
    expect(formatModelSegments({ ...data, thinkingLevel: 'off' })).toEqual([
      '● Opus',
    ]);
    expect(
      formatModelSegments({ thinkingLevel: 'high' }, { theme: mockTheme }),
    ).toEqual(['[thinkingHigh]◐ high[/thinkingHigh]']);
  });

  it('offers cwd then a compact leaf', () => {
    expect(formatCwdSegments(data)).toEqual(['~/work/project', '…/project']);
    expect(formatCwdSegments({ cwd: '~' })).toEqual(['~']);
    expect(formatCwdSegments({})).toEqual([]);
    expect(formatCwdSegments({ cwd: '/work/b' })).toEqual(['/work/b', '…/b']);
  });

  it.each([
    ['~\\orca\\workspaces\\thoth-theme', '…\\thoth-theme'],
    ['C:\\Users\\me\\thoth-theme', '…\\thoth-theme'],
    ['C:\\thoth-theme', '…\\thoth-theme'],
    ['~/work/project', '…/project'],
    ['/work/b/', '…/b'],
  ])('compacts %s keeping its native separator', (cwd, compact) => {
    expect(formatCwdSegments({ cwd })).toEqual([cwd, compact]);
  });

  it.each([
    'C:\\',
    'C:',
    '/',
    '\\',
    '~\\',
  ])('offers no compact variant for root-like %s', (cwd) => {
    expect(formatCwdSegments({ cwd })).toEqual([cwd]);
  });

  it('offers context richest first and a dash when usage is absent', () => {
    expect(formatContextSegments(data)).toEqual([
      '[████░░░░░░] 43% 425.9K/1M',
      '43% 425.9K/1M',
      '425.9K/1M',
    ]);
    expect(formatContextSegments(data, { mode: 'ascii' })[0]).toBe(
      '[####------] 43% 425.9K/1M',
    );
    expect(
      formatContextSegments({
        contextTokens: null,
        contextPercent: null,
        contextWindow: 200_000,
      }),
    ).toEqual(['—/200K']);
    expect(formatContextSegments({})).toEqual(['—']);
    expect(
      formatContextSegments({ contextPercent: 0, contextTokens: 0 })[0],
    ).toBe('[░░░░░░░░░░] 0% 0');
  });

  it.each([
    [69, 'success'],
    [70, 'warning'],
    [90, 'error'],
  ])('colors %i%% context with %s', (percent, token) => {
    expect(
      formatContextSegments(
        { contextPercent: percent, contextTokens: 1 },
        { theme: mockTheme },
      )[1],
    ).toContain(`[${token}]${percent}%[/${token}]`);
  });
});
