import type { Theme } from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';
import type { ThemeConfig, ToolDensity } from '../shared/config.ts';
import { createCodemodeRenderer } from './codemode.ts';
import { createCustomEditTool } from './edit.ts';
import { createCustomFindTool } from './find.ts';
import { createCustomGrepTool } from './grep.ts';
import { createCustomLsTool } from './ls.ts';
import { createCustomReadTool } from './read.ts';
import { createCustomWriteTool } from './write.ts';

const COLORS: Record<string, number> = { error: 31, success: 32, dim: 90 };
const theme = {
  fg: (role: string, text: string) =>
    `${String.fromCharCode(27)}[${COLORS[role] ?? 37}m${text}${String.fromCharCode(27)}[39m`,
  bold: (text: string) => text,
} as unknown as Theme;

function config(collapsed?: ToolDensity): ThemeConfig {
  return {
    icons: 'unicode',
    statusLine: { enabled: true, subscriptionProviders: [] },
    tools: { enabled: true, collapsed },
    welcome: { enabled: true },
  };
}

const plain = (rows: string[]) => rows.map((r) => stripTerminalSequences(r));
const text = (output: string, details: unknown = {}) => ({
  content: [{ type: 'text' as const, text: output }],
  details,
});

function ctx(args: unknown, over: Record<string, unknown> = {}) {
  return {
    keyText: () => 'ctrl+o',
    args,
    state: {} as Record<string, unknown>,
    executionStarted: true,
    isPartial: false,
    expanded: false,
    isError: false,
    ...over,
  };
}

interface Case {
  name: string;
  make: (c: ThemeConfig) => any;
  args: unknown;
  output: string;
  details?: unknown;
  summary: string;
  tail: string;
  continuation: string;
  title: string;
}

const diff = '--- a\n+++ b\n@@ -1 +1,2 @@\n-old\n+new\n+more';
const cases: Case[] = [
  {
    name: 'read',
    make: (c) => createCustomReadTool('.', c),
    args: { path: 'a.ts', offset: 5, limit: 10 },
    output: 'first\nsecond\nthird',
    title: 'Read',
    summary: 'a.ts:5-14',
    tail: '3 lines',
    continuation: 'first',
  },
  {
    name: 'edit',
    make: (c) => createCustomEditTool('.', c),
    args: { path: 'a.ts' },
    output: 'done',
    details: { diff },
    title: 'Edit',
    summary: 'a.ts',
    tail: '+2 −1',
    continuation: '-old',
  },
  {
    name: 'write',
    make: (c) => createCustomWriteTool('.', c),
    args: { path: 'a.ts', content: 'one\ntwo\n' },
    output: 'ok',
    title: 'Write',
    summary: 'a.ts',
    tail: '2 lines written',
    continuation: 'one',
  },
  {
    name: 'ls',
    make: (c) => createCustomLsTool('.', c),
    args: { path: 'src' },
    output: 'a.ts\nb/\nc.ts',
    title: 'List',
    summary: 'src',
    tail: '3 entries',
    continuation: 'a.ts',
  },
  {
    name: 'find',
    make: (c) => createCustomFindTool('.', c),
    args: { pattern: '*.ts', path: 'src' },
    output: 'src/a.ts\nsrc/b.ts',
    title: 'Find',
    summary: '"*.ts" in src',
    tail: '2 files',
    continuation: 'src/a.ts',
  },
  {
    name: 'grep',
    make: (c) => createCustomGrepTool('.', c),
    args: { pattern: 'foo', path: 'src' },
    output: 'src/a.ts:3: foo()\nsrc/a.ts:9: foo(1)\nsrc/b.ts:1: foo',
    title: 'Grep',
    summary: '"foo" in src',
    tail: '3 matches',
    continuation: 'src/a.ts:3: foo()',
  },
  {
    name: 'codemode',
    make: (c) => createCodemodeRenderer(c),
    args: { code: 'x' },
    output: 'result',
    details: {
      calls: [
        { name: 'read', status: 'ok', durationMs: 5 },
        { name: 'grep', status: 'ok', durationMs: 7 },
      ],
    },
    title: 'codemode',
    summary: '2 calls',
    tail: '',
    continuation: 'read, grep',
  },
];

describe.each(cases)('$name collapsed rendering', (c) => {
  it.each([
    'line',
    'compact',
  ] as const)('shows the running row in the call slot (%s)', (density) => {
    const tool = c.make(config(density));
    const rows = plain(
      tool
        .renderCall(c.args, theme, ctx(c.args, { isPartial: true }))
        .render(80),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(c.title);
  });

  it('line: empty call slot and one result row', () => {
    const tool = c.make(config('line'));
    const context = ctx(c.args);
    const call = tool.renderCall(c.args, theme, context);
    const result = tool.renderResult(
      text(c.output, c.details),
      { expanded: false, isPartial: false },
      theme,
      context,
    );
    expect(call.render(80)).toEqual([]);
    const rows = plain(result.render(100));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(c.title);
    expect(rows[0]).toContain(c.summary);
    expect(rows[0]).toContain(c.tail);
    expect(rows[0]).toContain('ctrl+o to expand');
  });

  it('compact: continuation row with the first result line', () => {
    const tool = c.make(config('compact'));
    const context = ctx(c.args);
    tool.renderCall(c.args, theme, context);
    const rows = plain(
      tool
        .renderResult(
          text(c.output, c.details),
          { expanded: false, isPartial: false },
          theme,
          context,
        )
        .render(100),
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain(c.continuation);
    expect(rows[1]).toContain('ctrl+o to expand');
  });

  it('terminal error renders two rows with the first error line', () => {
    const tool = c.make(config('line'));
    const context = ctx(c.args, { isError: true });
    tool.renderCall(c.args, theme, context);
    const result = tool.renderResult(
      text('boom\nmore', c.name === 'codemode' ? {} : c.details),
      { expanded: false, isPartial: false },
      theme,
      context,
    );
    const rows = result.render(100);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('[31m');
    expect(plain(rows)[1]).toContain(c.name === 'edit' ? '--- a' : 'boom');
  });

  it('a partial result with an error flag stays running', () => {
    const tool = c.make(config('compact'));
    const context = ctx(c.args, { isError: true });
    tool.renderCall(c.args, theme, context);
    const rows = tool
      .renderResult(
        text('boom', c.details),
        { expanded: false, isPartial: true },
        theme,
        context,
      )
      .render(100);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toContain('[31m');
  });

  it.each([
    undefined,
    'frame',
  ] as const)('keeps the framed output for density %s and expanded views', (density) => {
    const framed = c.make(config(density));
    const compact = c.make(config('compact'));
    const render = (tool: any, expanded: boolean) => {
      const context = ctx(c.args, { expanded });
      const call = tool.renderCall(c.args, theme, context).render(80);
      const result = tool
        .renderResult(
          text(c.output, c.details),
          { expanded, isPartial: false },
          theme,
          context,
        )
        .render(80);
      return { call, result };
    };
    const reference = render(framed, false);
    expect(plain(reference.call.concat(reference.result)).join('\n')).toMatch(
      /[╭│╰]/,
    );
    // Expanded compact cards equal frame expanded cards.
    expect(render(compact, true)).toEqual(render(framed, true));
  });
});

describe('codemode frame density', () => {
  it('keeps up to eight nested calls in frame', () => {
    const calls = Array.from({ length: 10 }, (_, i) => ({
      name: `n${i}`,
      status: 'ok',
      durationMs: 1,
    }));
    const tool = createCodemodeRenderer(config('frame'));
    const context = ctx({ code: 'x' });
    tool.renderCall?.({ code: 'x' }, theme, context as never);
    const rows = plain(
      tool
        .renderResult?.(
          text('out', { calls }) as never,
          { expanded: false, isPartial: false },
          theme,
          context as never,
        )
        .render(80) ?? [],
    ).join('\n');
    expect(rows).toContain('n7');
    expect(rows).not.toContain('n8');
    expect(rows).toContain('+2 more');
  });
});

describe('read edge cases', () => {
  it('shows an empty file continuation', () => {
    const tool = createCustomReadTool('.', config('compact'));
    const args = { path: 'e.ts' };
    const context = ctx(args);
    tool.renderCall(args, theme, context as never);
    const rows = plain(
      tool
        .renderResult(
          text(''),
          { expanded: false, isPartial: false },
          theme,
          context as never,
        )
        .render(80),
    );
    expect(rows[1]).toContain('(empty file)');
  });
});
