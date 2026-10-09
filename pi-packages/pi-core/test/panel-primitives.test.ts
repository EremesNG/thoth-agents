import { describe, expect, it } from 'vitest';
import { registerRenderKit, withdrawRenderKit } from '../src/index.js';
import {
  createPanelFrame,
  PanelDiscardConfirmation,
  padPanelText,
  panelHintRow,
  panelViewport,
  panelVisibleWidth,
  renderPanelFrame,
  truncatePanelText,
} from '../src/panel.js';
import { createTestRenderKit } from '../src/testing.js';

describe('panel frame', () => {
  it('composes padded columns, junction rules, titles and custom side content', () => {
    const frame = createPanelFrame({
      text: {
        clip: truncatePanelText,
        pad: padPanelText,
        measure: panelVisibleWidth,
      },
    });
    expect(
      frame.cells([
        { text: 'left', width: 4 },
        { text: '界', width: 6 },
      ]),
    ).toBe('│ left │ 界     │');
    expect(frame.rule([4, 6])).toBe('├──────┼────────┤');
    expect(frame.rule([4, 6], 'bottom')).toBe('╰──────┴────────╯');
    expect(frame.titled('Edit', 12, 1)).toBe('╭─ Edit ───╮');
    expect(
      frame.line(
        ['topLeft', 'horizontal'],
        ' title ',
        [{ horizontal: 2 }],
        ' [x] ',
        ['horizontal', 'topRight'],
      ),
    ).toBe('╭─ title ── [x] ─╮');
  });

  it('resolves theme frame glyphs and semantic ellipsis on each render', () => {
    const kit = createTestRenderKit();
    const glyphs: Record<string, string> = {
      boxTopLeft: '+',
      boxTopRight: '+',
      boxBottomLeft: '+',
      boxBottomRight: '+',
      boxVertical: '|',
      boxHorizontal: '-',
      ellipsis: '~',
    };
    const token = registerRenderKit(
      { ...kit, icon: (name) => glyphs[name] ?? '?' },
      {},
    );
    try {
      const themed = renderPanelFrame({
        title: 'Edit',
        rows: ['abcdefghij'],
        width: 12,
      });
      expect(themed[0]).toBe('+ Edit ----+');
      expect(themed[1].replaceAll('\u001b[0m', '')).toBe('| abcdefg~ |');
      expect(themed.at(-1)).toBe('+----------+');
    } finally {
      withdrawRenderKit(token);
    }
    expect(renderPanelFrame({ title: 'Edit', rows: [], width: 12 })[0]).toBe(
      '╭ Edit ────╮',
    );
  });

  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 3],
    [12, 1],
    [12, 2],
  ])('degrades safely at width %i / height %i', (width, height) => {
    const rows = renderPanelFrame({
      title: 'Editor',
      rows: ['first', 'second', 'third'],
      width,
      maxHeight: height,
    });
    expect(rows.length).toBeLessThanOrEqual(height);
    for (const row of rows)
      expect(panelVisibleWidth(row)).toBeLessThanOrEqual(width);
    if (height < 3) expect(rows).toHaveLength(1);
  });

  it('renders a titled rounded frame, hints and full-cell-width selected backgrounds', () => {
    const filled: string[] = [];
    const rows = renderPanelFrame({
      title: 'Edit',
      width: 12,
      rows: [{ text: '界', selected: true }, panelHintRow('enter edit')],
      theme: {
        fg: (_role, text) => text,
        bg: (_role, text) => {
          filled.push(text);
          return text;
        },
      },
    });
    expect(rows[0]).toBe('╭ Edit ────╮');
    expect(rows.at(-1)).toBe('╰──────────╯');
    expect(filled).toEqual(['界      ']);
    expect(rows.map(panelVisibleWidth)).toEqual([12, 12, 12, 12]);
  });
});

describe('panel viewport and dirty confirmation', () => {
  it('centers the cursor, reserves a range notice and clamps empty/tiny budgets', () => {
    expect(panelViewport(20, 10, 6)).toEqual({
      start: 8,
      end: 13,
      notice: 'Showing 9–13 of 20',
    });
    expect(panelViewport(20, 0, 6)).toEqual({
      start: 0,
      end: 5,
      notice: 'Showing 1–5 of 20',
    });
    expect(panelViewport(20, 99, 6)).toEqual({
      start: 15,
      end: 20,
      notice: 'Showing 16–20 of 20',
    });
    expect(panelViewport(20, 10, 1)).toEqual({ start: 10, end: 11 });
    expect(panelViewport(0, 10, 6)).toEqual({ start: 0, end: 0 });
    expect(panelViewport(20, 10, 0)).toEqual({ start: 0, end: 0 });
    expect(panelViewport(3, 1, Infinity)).toEqual({ start: 0, end: 3 });
  });

  it('requires d to discard a dirty draft; k, escape and Ctrl-C resume', () => {
    const confirm = new PanelDiscardConfirmation();
    expect(confirm.request(false)).toBe('cancel');
    expect(confirm.active).toBe(false);
    expect(confirm.request(true)).toBe('confirm');
    expect(confirm.handleInput('q')).toBeUndefined();
    expect(confirm.active).toBe(true);
    expect(confirm.handleInput('k')).toBe('resume');
    for (const key of ['\u001b', '\u0003']) {
      confirm.request(true);
      expect(confirm.handleInput(key)).toBe('resume');
    }
    confirm.request(true);
    expect(confirm.handleInput('D')).toBe('discard');
    expect(confirm.active).toBe(false);
  });
});

describe('panel cell widths', () => {
  it('clips and pads styled wide glyphs and combining characters in terminal cells', () => {
    const styled = '\u001b[31m界e\u0301ab\u001b[0m';
    expect(panelVisibleWidth(styled)).toBe(5);
    expect(panelVisibleWidth(truncatePanelText(styled, 4))).toBe(4);
    expect(
      truncatePanelText('界e\u0301ab', 4).replaceAll('\u001b[0m', ''),
    ).toBe('界e\u0301…');
    expect(padPanelText('\u001b[31m界\u001b[0m', 5)).toBe(
      '\u001b[31m界\u001b[0m   ',
    );
    expect(truncatePanelText(styled, 0)).toBe('');
    expect(truncatePanelText('a\nb\tc', 10)).toBe('a b  c');
    const link =
      '\u001b]8;;https://example.test\u0007界e\u0301ab\u001b]8;;\u0007';
    expect(panelVisibleWidth(link)).toBe(5);
    expect(panelVisibleWidth(truncatePanelText(link, 4))).toBe(4);
    expect(panelVisibleWidth(padPanelText(link, 8))).toBe(8);
  });
});
