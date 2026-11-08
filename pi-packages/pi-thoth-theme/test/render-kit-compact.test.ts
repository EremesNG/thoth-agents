import type { Theme } from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import type { RenderCardOptions } from '@thoth-agents/pi-core';
import { describe, expect, it } from 'vitest';
import { createRenderKit } from '../src/render-kit/index.ts';
import type { ToolDensity } from '../src/shared/config.ts';

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

function render(
  density: ToolDensity | undefined,
  options: RenderCardOptions,
  width = 80,
) {
  const kit = createRenderKit({}, undefined, 'unicode', density);
  return kit.card?.(theme as never, options, width) ?? [];
}

const opt: RenderCardOptions = {
  surface: 'tool',
  expanded: false,
  title: 'todo',
  status: 'completed',
  isSuccess: true,
  summary: ['2/3 done'],
  body: ['first task', 'second task'],
  context: {
    executionStarted: true,
    state: { completedElapsedMs: 2000 },
    keyText: () => 'ctrl+o',
  } as never,
};

describe('theme kit card() collapsed density', () => {
  it('line renders one row', () => {
    expect(plain(render('line', opt))).toEqual([
      '✓ todo 2s · 2/3 done · ctrl+o to expand',
    ]);
  });

  it('compact adds the first body row as continuation', () => {
    expect(plain(render('compact', opt))).toEqual([
      '✓ todo 2s · 2/3 done',
      '  └ first task · ctrl+o to expand',
    ]);
  });

  it('row overrides title, summary and body in collapsed density', () => {
    expect(
      plain(
        render('compact', {
          ...opt,
          row: {
            title: 'todo add',
            summary: 'batch',
            tail: ['3 added'],
            body: ['', 'row body'],
          },
        }),
      ),
    ).toEqual([
      '✓ todo add  batch  2s · 3 added',
      '  └ row body · ctrl+o to expand',
    ]);
  });

  it('running row keeps row.summary but hides row.tail and terminal options.summary', () => {
    const running = {
      ...opt,
      status: 'running' as const,
      isSuccess: undefined,
      row: { title: 'todo', summary: 'create tests', tail: ['3 added'] },
    };
    const rows = plain(render('compact', running));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('todo');
    expect(rows[0]).toContain('create tests');
    expect(rows[0]).not.toContain('3 added');
    expect(rows[0]).not.toContain('2/3 done');
  });

  it('row.summary truncates before elapsed at narrow widths', () => {
    const rows = plain(
      render(
        'compact',
        {
          ...opt,
          row: { title: 'todo', summary: 'create a very long subject here' },
        },
        24,
      ),
    );
    expect(rows[0]).toContain('todo');
    expect(rows[0]).toContain('2s');
  });

  it('row is ignored when expanded or framed', () => {
    const row = { title: 'other', summary: 'x', body: ['y'] };
    const framed = render('frame', { ...opt, surface: undefined });
    expect(render('compact', { ...opt, expanded: true, row })).toEqual(
      render('compact', { ...opt, expanded: true }),
    );
    expect(render('frame', { ...opt, row })).toEqual(
      render('frame', { ...opt }),
    );
    expect(framed[0]).toContain('╭');
  });

  it('start part renders zero rows', () => {
    expect(render('compact', { ...opt, part: 'start' })).toEqual([]);
  });

  it('end part renders rows from its own options', () => {
    expect(
      render('line', { ...opt, part: 'end', title: undefined }),
    ).toHaveLength(1);
  });

  it('running with an error flag stays one running row', () => {
    const rows = render('compact', {
      ...opt,
      status: 'running',
      isError: true,
      context: { executionStarted: true, isPartial: true, state: {} } as never,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toContain('✗');
  });

  it('terminal error renders two rows with the error color', () => {
    const rows = render('line', {
      ...opt,
      status: 'failed',
      isError: true,
      body: ['it broke'],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('[31m✗[39m');
    expect(rows[1]).toContain('[31mit broke[39m');
  });

  it('keeps the expand key at narrow width', () => {
    const rows = render('line', { ...opt, title: 'x'.repeat(60) }, 24);
    expect(visibleWidth(rows[0])).toBeLessThanOrEqual(24);
    expect(stripTerminalSequences(rows[0])).toContain('ctrl+o');
  });

  it.each([
    ['frame density', 'frame', opt],
    ['unset density', undefined, opt],
    ['no surface', 'compact', { ...opt, surface: undefined }],
    ['expanded', 'compact', { ...opt, expanded: true }],
    ['expanded omitted', 'compact', { ...opt, expanded: undefined }],
  ] as const)('is unchanged for %s', (_label, density, options) => {
    const framed = render('frame', {
      ...options,
      surface: undefined,
      expanded: undefined,
    } as RenderCardOptions);
    expect(render(density, options as RenderCardOptions)).toEqual(framed);
    expect(framed[0]).toContain('╭');
  });
});
