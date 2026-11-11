import type { Theme } from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';
import type { ThemeConfig, ToolDensity } from '../shared/config.ts';
import { createCustomBashTool } from './bash.ts';
import { buildCompactRows, type CompactRowInput } from './compact-row.ts';
import { createGenericTool } from './generic.ts';

const COLORS: Record<string, number> = {
  error: 31,
  success: 32,
  accent: 36,
  dim: 90,
};
const theme = {
  fg: (role: string, text: string) => `[${COLORS[role] ?? 37}m${text}[39m`,
  bold: (text: string) => text,
} as unknown as Theme;

const plain = (rows: string[]) =>
  rows.map((row) => stripTerminalSequences(row));

function base(over: Partial<CompactRowInput> = {}): CompactRowInput {
  return {
    density: 'line',
    state: 'success',
    mode: 'unicode',
    title: 'Bash',
    summary: 'pnpm test',
    tail: ['2s', 'Exit 0', '3 lines'],
    continuation: 'all green',
    errorLine: 'boom',
    expandHint: 'ctrl+o to expand',
    ...over,
  };
}

describe('buildCompactRows', () => {
  it('renders one row for line success', () => {
    const rows = buildCompactRows(theme, base(), 80);
    expect(plain(rows)).toEqual([
      '✓ Bash  pnpm test  2s · Exit 0 · 3 lines · ctrl+o to expand',
    ]);
    expect(rows[0]).toContain('[32m✓[39m');
    expect(rows[0]).toContain('[90m2s[39m');
  });

  it.each([
    'compact',
    'line',
  ] as const)('colors diff stats and exit status in %s tails', (density) => {
    for (const minus of ['-', '−']) {
      const [row] = buildCompactRows(
        theme,
        base({
          density,
          tail: ['2s', `+13 ${minus}10`, 'Exit 0', 'exit 7', '3 lines'],
        }),
        120,
      );
      expect(row).toContain(theme.fg('success', '+13'));
      expect(row).toContain(theme.fg('error', `${minus}10`));
      expect(row).toContain(theme.fg('success', 'Exit 0'));
      expect(row).toContain(theme.fg('error', 'exit 7'));
      expect(row).toContain(theme.fg('dim', '2s'));
      expect(row).toContain(theme.fg('dim', ' · '));
      expect(row).toContain(theme.fg('dim', '3 lines'));
    }
  });

  it.each([
    'compact',
    'line',
  ] as const)('fits colored tails with wide summaries in %s', (density) => {
    for (let width = 1; width <= 100; width++) {
      const rows = buildCompactRows(
        theme,
        base({
          density,
          summary: '文件'.repeat(30),
          tail: ['2s', '+13 -10', 'Exit 7'],
        }),
        width,
      );
      for (const row of rows) {
        expect(visibleWidth(row)).toBeLessThanOrEqual(width);
        expect(stripTerminalSequences(row)).not.toContain('\x1b');
      }
    }
  });

  it('keeps non-stat tail text dim', () => {
    const [row] = buildCompactRows(
      theme,
      base({ tail: ['+13 files', 'path-10', 'Exit 0 pending', '~7 words'] }),
      120,
    );
    for (const part of ['+13 files', 'path-10', 'Exit 0 pending', '~7 words']) {
      expect(row).toContain(theme.fg('dim', part));
    }
  });

  it('adds a dim tree continuation in compact success', () => {
    const rows = buildCompactRows(theme, base({ density: 'compact' }), 80);
    expect(plain(rows)).toEqual([
      '✓ Bash  pnpm test  2s · Exit 0 · 3 lines',
      '  └ all green · ctrl+o to expand',
    ]);
    expect(rows[1]).toContain('[90mall green[39m');
  });

  it('uses an ascii tree glyph in ascii mode', () => {
    const rows = buildCompactRows(
      theme,
      base({ density: 'compact', mode: 'ascii' }),
      80,
    );
    expect(plain(rows)[1]).toBe('  ` all green | ctrl+o to expand');
  });

  it('keeps compact to one row without continuation', () => {
    const rows = buildCompactRows(
      theme,
      base({ density: 'compact', continuation: '' }),
      80,
    );
    expect(rows).toHaveLength(1);
    expect(plain(rows)[0]).toContain('ctrl+o to expand');
  });

  it.each([
    'line',
    'compact',
  ] as const)('renders running as one row without hint in %s', (density) => {
    const rows = buildCompactRows(
      theme,
      base({ density, state: 'running', tail: ['1s'] }),
      80,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('[36m');
    expect(plain(rows)[0]).not.toContain('expand');
  });

  it.each([
    'line',
    'compact',
  ] as const)('renders exactly two rows for a terminal error in %s', (density) => {
    const rows = buildCompactRows(
      theme,
      base({ density, state: 'error', tail: ['2s', 'Exit 2'] }),
      80,
    );
    expect(plain(rows)).toEqual([
      '✗ Bash  pnpm test  2s · Exit 2',
      '  └ boom · ctrl+o to expand',
    ]);
    expect(rows[0]).toContain('[31m✗[39m');
    expect(rows[1]).toContain('[31mboom[39m');
  });

  it('escapes control characters in every input', () => {
    const rows = buildCompactRows(
      theme,
      base({ summary: 'a\x1b[31mb', title: 'T\x07' }),
      80,
    );
    expect(plain(rows)[0]).not.toContain('\x1b');
    expect(plain(rows)[0]).toContain('a␛[31mb');
  });

  it.each([
    60, 40, 24, 16, 12,
  ])('fits width %i and keeps the expand key', (width) => {
    for (const density of ['line', 'compact'] as const) {
      const rows = buildCompactRows(
        theme,
        base({
          density,
          summary: 'pnpm run a-very-long-command --with --many --arguments',
          continuation: 'a very long continuation line of output text',
        }),
        width,
      );
      for (const row of rows) {
        expect(visibleWidth(row)).toBeLessThanOrEqual(width);
      }
      expect(plain(rows).at(-1)).toContain('ctrl+o');
    }
  });

  it('returns no rows at zero width', () => {
    expect(buildCompactRows(theme, base(), 0)).toEqual([]);
  });
});

function config(collapsed?: ToolDensity): ThemeConfig {
  return {
    icons: 'unicode',
    statusLine: { enabled: true, subscriptionProviders: [] },
    tools: { enabled: true, collapsed },
    welcome: { enabled: true },
  };
}

function ctx(over: Record<string, unknown> = {}) {
  return {
    keyText: () => 'ctrl+o',
    args: { command: 'echo hi' },
    state: {} as Record<string, unknown>,
    executionStarted: true,
    isPartial: false,
    expanded: false,
    isError: false,
    ...over,
  };
}

const text = (output: string) => ({
  content: [{ type: 'text', text: output }],
});
const strip = (rows: string[]) => rows.map((r) => stripTerminalSequences(r));

function renderAll(
  tool: any,
  args: unknown,
  result: unknown,
  c: any,
  opts: any,
) {
  const call = tool.renderCall(args, theme, c);
  const before: string[] = call.render(80);
  const res = tool.renderResult(result, opts, theme, c);
  return {
    before,
    call: call.render(80) as string[],
    result: res.render(80) as string[],
  };
}

const done = { expanded: false, isPartial: false };

describe.each([
  [
    'bash',
    (c: ThemeConfig) => createCustomBashTool('.', c),
    { command: 'echo hi' },
  ],
  [
    'generic',
    (c: ThemeConfig) => createGenericTool('mcp__x__y', c),
    { q: 'hi' },
  ],
] as const)('%s collapsed rendering', (name, make, args) => {
  it.each([
    'line',
    'compact',
  ] as const)('renders the running row in the call slot (%s)', (density) => {
    const tool: any = make(config(density));
    const rows = strip(
      tool.renderCall(args, theme, ctx({ args, isPartial: true })).render(80),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(name === 'bash' ? 'echo hi' : 'q="hi"');
  });

  if (name === 'bash') {
    it.each([
      'compact',
      'line',
    ] as const)('colors shell exit codes in %s', (density) => {
      for (const exitCode of [0, 7]) {
        const tool: any = make(config(density));
        const out = renderAll(
          tool,
          args,
          text(
            exitCode === 0
              ? 'hello'
              : `hello\nCommand exited with code ${exitCode}`,
          ),
          ctx({ args, isError: exitCode !== 0 }),
          done,
        );
        expect(out.result[0]).toContain(
          theme.fg(exitCode === 0 ? 'success' : 'error', `Exit ${exitCode}`),
        );
      }
    });
  }

  it('line success: empty call slot, one result row', () => {
    const tool: any = make(config('line'));
    const out = renderAll(
      tool,
      args,
      text('hello\nworld'),
      ctx({ args }),
      done,
    );
    expect(out.before).toHaveLength(1);
    expect(out.call).toEqual([]);
    const rows = plain(strip(out.result));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('2 lines');
    expect(rows[0]).toContain('ctrl+o to expand');
  });

  it('compact success: two result rows with the first output line', () => {
    const tool: any = make(config('compact'));
    const out = renderAll(
      tool,
      args,
      text('hello\nworld'),
      ctx({ args }),
      done,
    );
    const rows = strip(out.result);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatch(/^ {2}└ hello · ctrl\+o to expand$/);
  });

  it.each([
    'line',
    'compact',
  ] as const)('partial result with an error flag stays one running row (%s)', (density) => {
    const tool: any = make(config(density));
    const out = renderAll(
      tool,
      args,
      text('working'),
      ctx({ args, isPartial: true, isError: true }),
      { expanded: false, isPartial: true },
    );
    expect(out.result).toHaveLength(1);
    expect(strip(out.result)[0]).not.toContain('✗');
  });

  it.each([
    'line',
    'compact',
  ] as const)('terminal error renders two rows with the first error line (%s)', (density) => {
    const tool: any = make(config(density));
    const out = renderAll(
      tool,
      args,
      text(
        name === 'bash' ? 'bad thing\nCommand exited with code 3' : 'bad thing',
      ),
      ctx({ args, isError: true }),
      done,
    );
    const rows = strip(out.result);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('✗');
    expect(rows[1]).toContain('bad thing');
  });

  it.each([
    'line',
    'compact',
  ] as const)('expanded output is identical to frame (%s)', (density) => {
    const opts = { expanded: true, isPartial: false };
    const frame = renderAll(
      make(config('frame')) as any,
      args,
      text('x\ny'),
      ctx({ args, expanded: true }),
      opts,
    );
    const collapsed = renderAll(
      make(config(density)) as any,
      args,
      text('x\ny'),
      ctx({ args, expanded: true }),
      opts,
    );
    expect(collapsed).toEqual(frame);
  });

  it('frame and unset density render the framed card', () => {
    for (const d of ['frame', undefined] as const) {
      const tool: any = make(config(d));
      const out = renderAll(tool, args, text('x'), ctx({ args }), done);
      expect(out.before.length).toBeGreaterThan(1);
      expect(out.before[0]).toContain('╭');
    }
  });

  it('keeps the expand key at a narrow width', () => {
    const tool: any = make(config('line'));
    const long = { command: 'x'.repeat(80), q: 'y'.repeat(80) };
    const c = ctx({ args: long });
    tool.renderCall(long, theme, c);
    const rows: string[] = tool
      .renderResult(text('x'), done, theme, c)
      .render(30);
    expect(rows).toHaveLength(1);
    expect(visibleWidth(rows[0])).toBeLessThanOrEqual(30);
    expect(stripTerminalSequences(rows[0])).toContain('ctrl+o');
  });
});

describe('buildCompactRows narrow priority', () => {
  const row = (over: Partial<CompactRowInput>, width: number) =>
    plain(
      buildCompactRows(
        theme,
        base({
          state: 'error',
          summary: 'pnpm test --run',
          tail: ['2s', 'Exit 2'],
          ...over,
        }),
        width,
      ),
    );

  it('shortens the summary first and keeps the bare key', () => {
    const [first] = row({ state: 'success', density: 'line' }, 38);
    expect(first).toBe('✓ Bash  pnpm te…  2s · Exit 2 · ctrl+o');
    expect(row({}, 24)[0]).toBe('✗ Bash  pn…  2s · Exit 2');
    expect(visibleWidth(first)).toBeLessThanOrEqual(38);
  });

  it('keeps full rows unchanged', () => {
    expect(row({ tail: ['2s'] }, 80)[0]).toBe('✗ Bash  pnpm test --run  2s');
  });

  it.each([
    ['unicode', '·', '✗'],
    ['ascii', '|', 'x'],
  ] as const)('drops summary, then tail, then title (%s)', (mode, sep, glyph) => {
    const at = (width: number) =>
      row(
        { mode, density: 'line', state: 'success', summary: 'pnpm test' },
        width,
      )[0];
    const okGlyph = glyph === '✗' ? '✓' : '+';
    const dropSummary = at(28);
    expect(dropSummary).toBe(`${okGlyph} Bash 2s ${sep} Exit 2 ${sep} ctrl+o`);
    const dropTail = at(17);
    expect(dropTail).toBe(`${okGlyph} Bash ${sep} ctrl+o`);
    const cutTitle = row(
      { mode, state: 'success', title: 'LongToolName' },
      14,
    )[0];
    expect(cutTitle).toBe(
      mode === 'ascii' ? '+ | ctrl+o' : `${okGlyph} Lo… ${sep} ctrl+o`,
    );
    for (const w of [28, 17, 14, 6]) {
      expect(visibleWidth(at(w))).toBeLessThanOrEqual(w);
    }
  });

  it('truncates the error line first and keeps tree and key', () => {
    const rows = row({ errorLine: 'something went badly wrong' }, 24);
    expect(rows[1]).toBe('  └ something … · ctrl+o');
    expect(visibleWidth(rows[1])).toBeLessThanOrEqual(24);
    expect(visibleWidth(row({ errorLine: 'abc' }, 9)[1])).toBeLessThanOrEqual(
      9,
    );
  });

  it('truncates the compact continuation first (ascii)', () => {
    const rows = plain(
      buildCompactRows(
        theme,
        base({
          density: 'compact',
          mode: 'ascii',
          continuation: 'all tests passed on every target',
        }),
        26,
      ),
    );
    expect(rows[1]).toBe('  ` all tests ... | ctrl+o');
  });

  it('keeps running rows without a key and shortens the summary', () => {
    const [first] = row({ state: 'running', summary: 'pnpm test --watch' }, 24);
    expect(first).not.toContain('ctrl+o');
    expect(first).toContain('Bash');
    expect(visibleWidth(first)).toBeLessThanOrEqual(24);
  });
});
