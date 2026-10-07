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

const NERD_COST = '\uf155 ';
const costFor = (mode: 'nerd' | 'ascii') => (mode === 'nerd' ? NERD_COST : '$');

describe('renderStatusLine - subscription cost', () => {
  it.each([
    'nerd',
    'ascii',
  ] as const)('appends (sub) only for subscription cost in %s mode', (mode) => {
    const marked = renderStatusLine(
      { cost: 1.234, isSubscription: true },
      { width: 100, mode, theme: mockTheme },
    );
    expect(marked).toBe(`[accent]${costFor(mode)}1.234 (sub)[/accent]`);

    const unmarked = renderStatusLine(
      { cost: 1.234, isSubscription: false },
      { width: 100, mode },
    );
    expect(unmarked).toBe(`${costFor(mode)}1.234`);
    expect(renderStatusLine({ cost: 1.234 }, { width: 100, mode })).toBe(
      `${costFor(mode)}1.234`,
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
      if (width >= 14)
        expect(rendered).toContain(`${costFor(mode)}1.000 (sub)`);
    }
  });
});

const NERD_FOOTER = [
  '\uf155 1.234',
  '\uf062100K \uf0633.4K',
  '\u{f01bc} 80%',
  '\u{f04c5} 42 tok/s',
].join(' · ');

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
    tokenTotals: {
      input: 12_300,
      output: 3_400,
      cacheRead: 80_000,
      cacheWrite: 7_700,
    },
    tokensPerSecond: 42.46,
  };

  it('shows total input sent including cache-read and cache-write in priority order', () => {
    expect(renderStatusLine(data, { width: 200, mode: 'nerd' })).toBe(
      NERD_FOOTER,
    );
  });

  it('renders ASCII labels with a cache hit percentage of total input sent', () => {
    expect(renderStatusLine(data, { width: 200, mode: 'ascii' })).toBe(
      '$1.234 | ^100K v3.4K | cache 80% | 42 tok/s',
    );
  });

  it.each([
    'nerd',
    'ascii',
  ] as const)('shows an unavailable cache hit ratio when total input is zero in %s mode', (mode) => {
    expect(
      renderStatusLine(
        { tokenTotals: { input: 0, output: 12, cacheRead: 0, cacheWrite: 0 } },
        { width: 200, mode },
      ),
    ).toBe(
      mode === 'nerd' ? '\uf0620 \uf06312 · \u{f01bc} —' : '^0 v12 | cache —',
    );
  });

  it.each([
    { input: 5, cacheRead: 0, cacheWrite: 0, expected: '0%' },
    { input: 0, cacheRead: 5, cacheWrite: 0, expected: '100%' },
    { input: 0, cacheRead: 0, cacheWrite: 5, expected: '0%' },
    { input: 1, cacheRead: 1, cacheWrite: 1, expected: '33%' },
    { input: 0, cacheRead: 2, cacheWrite: 1, expected: '67%' },
  ])('rounds cache hits to $expected for $input uncached, $cacheRead read and $cacheWrite written tokens', ({
    expected,
    ...totals
  }) => {
    for (const mode of ['nerd', 'ascii'] as const) {
      expect(
        renderStatusLine(
          { tokenTotals: { ...totals, output: 999 } },
          { width: 200, mode },
        ),
      ).toContain(`${mode === 'nerd' ? '\u{f01bc}' : 'cache'} ${expected}`);
    }
  });

  it('never renders model, effort, branch, cwd or context', () => {
    const rendered = renderStatusLine(data, { width: 200, mode: 'nerd' });
    for (const text of [
      'Claude',
      '◐',
      'med',
      'feature',
      '\ue0a0',
      '~/project',
      '43%',
      '425',
      '●',
    ])
      expect(rendered).not.toContain(text);
  });

  it.each([
    'nerd',
    'ascii',
  ] as const)('shows a dash for unmeasured tok/s and formats slow rates with one decimal in %s mode', (mode) => {
    expect(
      renderStatusLine(
        { ...data, tokensPerSecond: null },
        { width: 200, mode },
      ),
    ).toBe(
      mode === 'nerd'
        ? NERD_FOOTER.replace('42', '—')
        : '$1.234 | ^100K v3.4K | cache 80% | — tok/s',
    );
    expect(
      renderStatusLine(
        { ...data, tokensPerSecond: 7.25 },
        { width: 200, mode },
      ),
    ).toContain(mode === 'nerd' ? '\u{f04c5} 7.3 tok/s' : '7.3 tok/s');
  });

  it('omits rate and tokens when the snapshot has none', () => {
    expect(renderStatusLine({ cost: 0.5 }, { width: 200, mode: 'nerd' })).toBe(
      '\uf155 0.500',
    );
    expect(renderStatusLine({}, { width: 200, mode: 'nerd' })).toBe('');
  });

  it('adds subagent cost and applies thoth palette tokens', () => {
    const rendered = renderStatusLine(
      { ...data, subagentCost: 0.766, isSubscription: true },
      { width: 200, mode: 'nerd', theme: mockTheme },
    );
    expect(rendered).toContain('[accent]\uf155 2.000 (sub)[/accent]');
    expect(rendered).toContain('[muted]\uf062100K \uf0633.4K[/muted]');
    expect(rendered).toContain('[muted]\u{f01bc} 80%[/muted]');
    expect(rendered).toContain('[muted]\u{f04c5} 42 tok/s[/muted]');
  });

  it.each([
    {
      mode: 'nerd' as const,
      full: NERD_FOOTER,
      cost: '\uf155 1.234',
      tokens: '\uf062100K \uf0633.4K',
      cache: '\u{f01bc} 80%',
      separator: ' · ',
      fullWidth: 42,
      cacheWidth: 29,
      tokensWidth: 21,
      costWidth: 7,
      truncatedCost: '\uf155 1.',
    },
    {
      mode: 'ascii' as const,
      full: '$1.234 | ^100K v3.4K | cache 80% | 42 tok/s',
      cost: '$1.234',
      tokens: '^100K v3.4K',
      cache: 'cache 80%',
      separator: ' | ',
      fullWidth: 43,
      cacheWidth: 32,
      tokensWidth: 20,
      costWidth: 6,
      truncatedCost: '$1.2',
    },
  ])('drops tok/s, then cache, then tokens, then truncates cost as width shrinks in $mode mode', ({
    mode,
    full,
    cost,
    tokens,
    cache,
    separator,
    fullWidth,
    cacheWidth,
    tokensWidth,
    costWidth,
    truncatedCost,
  }) => {
    const at = (width: number) => renderStatusLine(data, { width, mode });
    expect(at(fullWidth)).toBe(full);
    expect(at(fullWidth - 1)).toBe([cost, tokens, cache].join(separator));
    expect(at(cacheWidth)).toBe([cost, tokens, cache].join(separator));
    expect(at(cacheWidth - 1)).toBe([cost, tokens].join(separator));
    expect(at(tokensWidth)).toBe([cost, tokens].join(separator));
    expect(at(tokensWidth - 1)).toBe(cost);
    expect(at(costWidth)).toBe(cost);
    expect(stripTerminalSequences(at(4))).toBe(truncatedCost);
    expect(at(0)).toBe('');
  });

  it('stays within every width from 1 to 200, including ANSI themes and subagent cost', () => {
    const wide: FooterData = {
      ...data,
      subagentCost: 12.3456,
      isSubscription: true,
      tokenTotals: {
        input: 123_456_789,
        output: 9_999_999,
        cacheRead: 5e9,
        cacheWrite: 1e6,
      },
    };
    for (const mode of ['nerd', 'ascii'] as const) {
      for (const theme of [undefined, mockTheme]) {
        let previousSegments = 0;
        for (let width = 1; width <= 200; width++) {
          const rendered = renderStatusLine(wide, { width, mode, theme });
          expect(visibleWidth(rendered)).toBeLessThanOrEqual(width);
          expect(rendered.includes(String.fromCharCode(10))).toBe(false);
          // Lower-priority segments only return as the width grows.
          const segments = rendered.split(mode === 'ascii' ? ' | ' : ' · ');
          expect(segments.length).toBeGreaterThanOrEqual(previousSegments);
          previousSegments = segments.length;
        }
        expect(
          renderStatusLine(wide, { width: 200, mode, theme }).replace(
            /\[\/?[a-zA-Z]+\]/g,
            '',
          ),
        ).toContain(mode === 'ascii' ? 'tok/s' : '\u{f04c5}');
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
    expect(formatBranchSegment(data)).toBe('· \ue0a0 feature/x');
    expect(formatBranchSegment({}, { mode: 'ascii' })).toBe('');
    expect(formatBranchSegment(data, { mode: 'ascii' })).toBe(
      '| git feature/x',
    );
    expect(formatModelSegments(data)).toEqual([
      '\u{f06a9} Opus',
      '· \u{f09d1} med',
    ]);
    expect(formatModelSegments(data, { mode: 'ascii' })).toEqual([
      '* Opus',
      '| o med',
    ]);
    expect(formatModelSegments({ modelId: 'id' })).toEqual(['\u{f06a9} id']);
    expect(formatModelSegments({ ...data, thinkingLevel: 'off' })).toEqual([
      '\u{f06a9} Opus',
    ]);
    expect(
      formatModelSegments({ thinkingLevel: 'high' }, { theme: mockTheme }),
    ).toEqual(['[thinkingHigh]\u{f09d1} high[/thinkingHigh]']);
  });

  it('offers cwd then a compact leaf', () => {
    expect(formatCwdSegments(data)).toEqual([
      '\u{f07c} ~/work/project',
      '\u{f07c} …/project',
    ]);
    expect(formatCwdSegments({ cwd: '~' })).toEqual(['\u{f07c} ~']);
    expect(formatCwdSegments({})).toEqual([]);
    expect(formatCwdSegments({ cwd: '/work/b' })).toEqual([
      '\u{f07c} /work/b',
      '\u{f07c} …/b',
    ]);
  });

  it('uses the ASCII ellipsis in compact cwd variants', () => {
    expect(formatCwdSegments(data, { mode: 'ascii' })).toEqual([
      'dir ~/work/project',
      'dir .../project',
    ]);
  });

  it.each([
    ['~\\orca\\workspaces\\thoth-theme', '…\\thoth-theme'],
    ['C:\\Users\\me\\thoth-theme', '…\\thoth-theme'],
    ['C:\\thoth-theme', '…\\thoth-theme'],
    ['~/work/project', '…/project'],
    ['/work/b/', '…/b'],
  ])('compacts %s keeping its native separator', (cwd, compact) => {
    expect(formatCwdSegments({ cwd })).toEqual([
      `\u{f07c} ${cwd}`,
      `\u{f07c} ${compact}`,
    ]);
    expect(formatCwdSegments({ cwd }, { mode: 'ascii' })).toEqual([
      `dir ${cwd}`,
      `dir ${compact.replace('…', '...')}`,
    ]);
  });

  it.each([
    'C:\\',
    'C:',
    '/',
    '\\',
    '~\\',
  ])('offers no compact variant for root-like %s', (cwd) => {
    expect(formatCwdSegments({ cwd })).toEqual([`\u{f07c} ${cwd}`]);
    expect(formatCwdSegments({ cwd }, { mode: 'ascii' })).toEqual([
      `dir ${cwd}`,
    ]);
  });

  it('offers context richest first and a dash when usage is absent', () => {
    expect(formatContextSegments(data)).toEqual([
      '\uf2db [████░░░░░░] 43% 425.9K/1M',
      '\uf2db 43% 425.9K/1M',
      '\uf2db 425.9K/1M',
    ]);
    expect(formatContextSegments(data, { mode: 'ascii' })[0]).toBe(
      'ctx [####------] 43% 425.9K/1M',
    );
    expect(
      formatContextSegments({
        contextTokens: null,
        contextPercent: null,
        contextWindow: 200_000,
      }),
    ).toEqual(['\uf2db —/200K']);
    expect(formatContextSegments({})).toEqual(['—']);
    expect(
      formatContextSegments({ contextPercent: 0, contextTokens: 0 })[0],
    ).toBe('\uf2db [░░░░░░░░░░] 0% 0');
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
