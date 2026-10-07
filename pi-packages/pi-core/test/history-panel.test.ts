import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createHistoryPanelKeyMatcher,
  HistoryPanel,
  type HistoryPanelAdapter,
} from '../src/history-panel.js';
import { registerRenderKit, withdrawRenderKit } from '../src/render-kit.js';
import { createTestRenderKit } from '../src/testing.js';

type Item = { id: string; name: string; lines: string[] };
const item = (id = 'a'): Item => ({
  id,
  name: `task ${id}`,
  lines: ['first', 'last'],
});
const adapter = (items: Item[]): HistoryPanelAdapter<Item> => ({
  items: () => items,
  id: (entry) => entry.id,
  renderItemLabel: (entry, context) =>
    `${context.selected ? '●' : '○'} ${entry.name}:running`,
  renderContent: (entry) => entry.lines,
  renderHeader: (entry) => ({
    badge: `${entry.name} · running`,
    wideRows: [`name: ${entry.name}`, 'metadata'],
    narrowRows: [`name: ${entry.name}`],
  }),
});
const panels: HistoryPanel<Item>[] = [];
const cleanups: Array<() => void> = [];
function panel(
  items = [item()],
  options: Partial<ConstructorParameters<typeof HistoryPanel<Item>>[1]> = {},
  overrides: Partial<HistoryPanelAdapter<Item>> = {},
) {
  const result = new HistoryPanel(
    { ...adapter(items), ...overrides },
    {
      title: 'history',
      listLabel: 'executions',
      maxLines: 14,
      onClose: vi.fn(),
      ...options,
    },
  );
  panels.push(result);
  return result;
}
const text = (value: HistoryPanel<Item>, width = 120) =>
  value.render(width).map(stripTerminalSequences).join('\n');
afterEach(() => {
  for (const value of panels.splice(0)) value.dispose();
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

describe('history panel refresh lifecycle', () => {
  it('requests periodic/input/mouse refresh and disposes the timer on close or external teardown', () => {
    vi.useFakeTimers();
    const requestRender = vi.fn();
    const invalidate = vi.fn();
    const entries = [item()];
    const value = panel(entries, { requestRender }, { invalidate });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(requestRender).toHaveBeenCalledTimes(1);
    entries[0].lines.push('live output');
    expect(text(value)).toContain('live output');
    value.handleInput('\u001b[H');
    expect(requestRender).toHaveBeenCalledTimes(2);
    value.handleMouse({ type: 'wheel', wheelDelta: -1 });
    expect(requestRender).toHaveBeenCalledTimes(3);
    value.invalidate();
    expect(invalidate).toHaveBeenCalledOnce();
    value.handleInput('q');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(requestRender).toHaveBeenCalledTimes(3);
    const external = panel(entries, { requestRender });
    external.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('lets an embedding owner reuse close callbacks until explicit disposal when opted in', () => {
    const onClose = vi.fn();
    const value = panel([item()], { onClose, disposeOnClose: false });
    const rows = value.render(60);
    value.handleMouse({ type: 'click', row: 0, col: 55 });
    value.handleMouse({ type: 'click', row: rows.length - 1, col: 55 });
    expect(onClose).toHaveBeenCalledTimes(2);
    value.handleInput('q');
    expect(onClose).toHaveBeenCalledTimes(3);
    value.dispose();
    value.handleInput('q');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('supports an externally owned refresh loop without installing a second timer', () => {
    vi.useFakeTimers();
    const requestRender = vi.fn();
    panel([item()], { requestRender, refreshMs: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('history panel item closing', () => {
  it('requires x twice on the same closable item, expires confirmation, and clears it on navigation', () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const entries = [item('a'), item('b')];
    const value = panel(
      entries,
      {},
      { close, canClose: (entry) => entry.id === 'a' },
    );
    text(value);
    value.handleInput('x');
    expect(close).not.toHaveBeenCalled();
    expect(text(value)).toContain('x again to close');
    value.handleInput('\u001b[C');
    value.handleInput('x');
    value.handleInput('x');
    expect(close).not.toHaveBeenCalled();
    value.handleInput('\u001b[D');
    value.handleInput('x');
    vi.advanceTimersByTime(2001);
    value.handleInput('x');
    expect(close).not.toHaveBeenCalled();
    value.handleInput('x');
    expect(close).toHaveBeenCalledExactlyOnceWith(entries[0]);
    expect(text(value)).not.toContain('x again to close');
  });
  it('allows a legacy adapter to retain one-press cancellation with a configured key', () => {
    const close = vi.fn();
    const value = panel(
      [item()],
      {
        closeKey: 'detailCancel',
        confirmClose: false,
        matchesKey: (data, key) => data === '\u0017' && key === 'detailCancel',
      },
      { close },
    );
    value.handleInput('x');
    expect(close).not.toHaveBeenCalled();
    value.handleInput('\u0017');
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('history panel mouse', () => {
  it.each([
    '\u001b[<64;10;5M',
    '\u001b[96;10;5M',
    `\u001b[M${String.fromCharCode(96)}!!`,
  ])('scrolls the content with raw wheel input (%j)', (up) => {
    const value = panel([
      {
        ...item(),
        lines: Array.from({ length: 20 }, (_, index) => `row-${index}`),
      },
    ]);
    expect(text(value)).toContain('row-19');
    value.handleInput(up);
    expect(text(value)).not.toContain('row-19');
    expect(text(value)).toContain('row-18');
  });
  it('routes normalized wheel events to the sidebar or body and selects clickable rows', () => {
    const entries = Array.from({ length: 15 }, (_, index) =>
      item(String(index)),
    );
    entries[0].lines = Array.from(
      { length: 20 },
      (_, index) => `body-${index}`,
    );
    const value = panel(entries);
    text(value);
    expect(
      value.handleMouse({ type: 'wheel', col: 5, row: 4, wheelDelta: 3 }),
    ).toEqual({ handled: true, render: true });
    expect(text(value)).not.toContain('● task 0:running');
    expect(text(value)).toContain('○ task 3:running');
    expect(text(value)).toContain('body-19');
    value.handleMouse({ type: 'wheel', col: 100, row: 4, wheelDelta: -1 });
    expect(text(value)).not.toContain('body-19');
    expect(value.handleMouse({ type: 'click', row: 4, col: 5 })).toEqual({
      handled: true,
      focus: true,
      render: true,
    });
    expect(text(value)).toContain('● task 3:running');
    value.render(60);
    const rows = value.render(60);
    const listRow = rows.findIndex((row) => row.includes('● task 3:running'));
    value.handleMouse({ type: 'wheel', x: 5, y: listRow, wheelDelta: 1 });
    expect(text(value, 60)).toContain('○ task 4:running');
    expect(value.handleMouse({ type: 'wheel', wheelDelta: 0 })).toBeUndefined();
    expect(value.handleMouse({ type: 'move' })).toBeUndefined();
    expect(
      value.handleMouse({ type: 'press', button: 'left' }),
    ).toBeUndefined();
  });
  it.each([
    '\u001b[<0;80;5M',
    `\u001b[M${String.fromCharCode(32, 112, 37)}`,
    `\u001b[M${String.fromCharCode(36, 112, 37)}`,
  ])('selects linked content with raw clicks (%j) plus the footer close button', (click) => {
    const onClose = vi.fn();
    const value = panel(
      [item('a'), item('b')],
      { onClose },
      { renderContent: () => [{ text: 'linked b', itemId: 'b' }] },
    );
    text(value);
    value.handleInput(click);
    expect(value.selectedItem()?.id).toBe('b');
    value.handleMouse({ type: 'click', row: 13, col: 119 });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('history panel keys', () => {
  it('uses injected keybinding actions, raw fallbacks, and adapter-owned display keys', () => {
    const bindings = {
      matches: (data: string, action: string) =>
        ({
          'tui.editor.cursorRight': 'next',
          'tui.editor.cursorLineStart': 'start',
          'app.tools.expand': 'expand',
        })[action] === data,
    };
    const matchesKey = createHistoryPanelKeyMatcher(bindings, {
      'ctrl+o': ['app.tools.expand'],
    });
    let expanded = false;
    const value = panel(
      [item('a'), item('b')],
      { matchesKey },
      {
        handleInput: (data, shell) => {
          if (!matchesKey(data, 'ctrl+o')) return false;
          expanded = !expanded;
          expect(shell.selectedItem()?.id).toBe('b');
          return true;
        },
        renderContent: (entry) => [expanded ? 'expanded content' : entry.name],
      },
    );
    value.handleInput('next');
    expect(text(value)).toContain('● task b:running');
    value.handleInput('expand');
    expect(text(value)).toContain('expanded content');
    value.handleInput('\u000f');
    expect(text(value)).not.toContain('expanded content');
    value.handleInput('\u001b[D');
    expect(text(value)).toContain('● task a:running');
    expect(matchesKey('\u001bOH', 'home')).toBe(true);
    expect(matchesKey('\u001bOF', 'end')).toBe(true);
    expect(matchesKey('unknown', 'down')).toBe(false);
  });
  it.each([
    '\u001b',
    '\u0003',
    'q',
    'Q',
    'quit',
  ])('closes once and ignores input after disposal (%j)', (key) => {
    const onClose = vi.fn();
    const value = panel([item()], {
      onClose,
      matchesKey: (data, name) => data === 'quit' && name === 'escape',
    });
    value.handleInput(key);
    value.handleInput(key);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('history panel navigation', () => {
  it('initially selects by id, bounds selection when refreshed items disappear, and exposes render metrics', () => {
    const entries = [item('a'), item('b')];
    const value = panel(entries, { initialSelectedId: 'b' });
    text(value);
    expect(value.getRenderDebugState()).toMatchObject({
      itemCount: 2,
      selectedIndex: 1,
      selectedId: 'b',
      followTail: true,
      configuredMaxLines: 14,
      renderedLineCount: 14,
      bodyHeight: 9,
      widthViolationCount: 0,
      clickableRowCount: 2,
    });
    value.handleInput('\u001b[C');
    expect(value.selectedItem()?.id).toBe('b');
    entries.pop();
    text(value);
    expect(value.selectedItem()?.id).toBe('a');
    expect(value.selectItem('missing')).toBe(false);
    entries.pop();
    text(value);
    expect(value.getRenderDebugState()).toMatchObject({
      itemCount: 0,
      selectedIndex: -1,
      clickableRowCount: 0,
      widthViolationCount: 0,
    });
  });
  it('scrolls physical content rows, follows new tail output only at the end, and resets on selection', () => {
    const first = {
      ...item('a'),
      lines: Array.from(
        { length: 30 },
        (_, index) => `line-${String(index).padStart(2, '0')}`,
      ),
    };
    const value = panel([first, item('b')]);
    expect(text(value)).toContain('line-29');
    value.handleInput('\u001b[H');
    expect(text(value)).toContain('line-00');
    value.handleInput('\u001b[B');
    expect(text(value)).not.toContain('line-00');
    expect(text(value)).toContain('line-01');
    value.handleInput('\u001b[6~');
    expect(text(value)).toContain('line-13');
    value.handleInput('\u001b[5~');
    expect(text(value)).toContain('line-01');
    value.handleInput('\u001b[A');
    first.lines.push('new-tail');
    expect(text(value)).toContain('line-00');
    expect(text(value)).not.toContain('new-tail');
    value.handleInput('\u001b[F');
    expect(text(value)).toContain('new-tail');
    first.lines.push('newer-tail');
    expect(text(value)).toContain('newer-tail');
    value.handleInput('\u001b[C');
    expect(text(value)).toContain('● task b:running');
    expect(text(value)).toContain('first');
    value.handleInput('\u001b[D');
    expect(text(value)).toContain('newer-tail');
  });
});

describe('history panel layout', () => {
  it('preserves visually fitting ANSI rows without calling a raw embedding truncator', () => {
    const line =
      '\u001b[42m│\u001b[0m \u001b[42mread\u001b[0m    \u001b[42mAGENTS.md\u001b[0m \u001b[42m│\u001b[0m';
    const clip = vi.fn((text: string, width: number) => text.slice(0, width));
    const value = panel([{ ...item(), lines: [line] }], {
      visibleWidth,
      truncateToWidth: clip,
    });
    expect(value.render(40).join('\n')).toContain(line);
    expect(clip.mock.calls.some(([text]) => text === line)).toBe(false);
  });
  it('honors the embedding measurement for styled clipped rows and frame padding', () => {
    const plain = (text: string) => text.replace(/FG\([^:]+:|\)/g, '');
    const value = panel(
      [{ ...item(), lines: [`FG(body:${'z'.repeat(200)})`] }],
      {
        theme: { fg: (role, text) => `FG(${role}:${text})` },
        visibleWidth: (text) => plain(text).length,
        truncateToWidth: (text, width) =>
          `FG(clipped:${plain(text).slice(0, width)})`,
      },
    );
    const rows = value.render(60);
    expect(rows.join('\n')).toContain(`FG(clipped:${'z'.repeat(56)})`);
    expect(rows.every((row) => plain(row).length <= 60)).toBe(true);
    expect(value.getRenderDebugState().widthViolationCount).toBe(0);
  });

  it('reserves no more than two narrow metadata rows so the content/selector keep their height budget', () => {
    const value = panel(
      [item()],
      { maxLines: 12 },
      {
        renderHeader: () => ({
          narrowRows: Array.from(
            { length: 20 },
            (_, index) => `metadata ${index}`,
          ),
        }),
      },
    );
    const rows = value.render(60);
    expect(rows).toHaveLength(12);
    expect(rows[1]).toContain('metadata 0');
    expect(rows[2]).toContain('metadata 1');
    expect(rows.join('\n')).not.toContain('metadata 2');
    expect(rows.join('\n')).toContain('first');
    expect(rows.join('\n')).toContain('● task a:running');
  });
  it('resolves render-kit icons dynamically and invalidates adapter caches when the kit changes', () => {
    const invalidate = vi.fn();
    const value = panel([item()], {}, { invalidate });
    text(value);
    const nativeClip = vi.fn((text: string, width: number) =>
      text.slice(0, width),
    );
    const icons: Record<string, string> = {
      agent: 'A',
      arrowLeft: 'L',
      arrowRight: 'R',
      arrowUp: 'U',
      arrowDown: 'D',
      separator: '|',
      ellipsis: '~',
    };
    const kit = createTestRenderKit({
      icon: (name) => {
        const icon = icons[name];
        if (!icon) throw new Error('unsupported icon');
        return icon;
      },
    });
    const token = registerRenderKit(kit, {});
    cleanups.push(() => withdrawRenderKit(token));
    const themed = panel([item()], { truncateToWidth: nativeClip });
    expect(text(value)).toContain('A history');
    expect(text(value)).toContain('L/R exec | U/D scroll');
    expect(invalidate).toHaveBeenCalledOnce();
    text(themed);
    expect(nativeClip).not.toHaveBeenCalled();
    withdrawRenderKit(token);
    expect(text(value)).toContain('←/→ exec · ↑/↓ scroll');
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
  it('accepts embedding terminal helpers but falls back safely if measurement throws or clipping overflows', () => {
    const measure = vi.fn(() => {
      throw new Error('unavailable');
    });
    const clip = vi.fn((text: string) => text);
    const value = panel([{ ...item(), lines: ['漢'.repeat(200)] }], {
      visibleWidth: measure,
      truncateToWidth: clip,
    });
    const rows = value.render(60);
    expect(measure).toHaveBeenCalled();
    expect(clip).toHaveBeenCalled();
    expect(rows.every((row) => visibleWidth(row) <= 60)).toBe(true);
  });
  it.each([
    0, 1, 12, 39, 40, 55, 89, 90, 120,
  ])('keeps ANSI/wide-character content and metadata in physical rows within width %i', (width) => {
    const value = panel(
      [
        {
          ...item(),
          lines: [
            '\u001b[31mwide 漢字 😀\ttext\r\nsecond physical row\u001b[0m',
            'z'.repeat(200),
          ],
        },
      ],
      {},
      {
        renderItemLabel: () => '● name\nwith newline',
        renderHeader: () => ({
          badge: 'badge\nwith newline',
          wideRows: ['meta\nwith newline'],
          narrowRows: ['meta\nwith newline'],
        }),
      },
    );
    const rows = value.render(width);
    expect(rows).toHaveLength(14);
    expect(rows.every((row) => !/[\r\n\t]/.test(row))).toBe(true);
    expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
  });
  it('renders the empty state full-width and clamps invalid height input', () => {
    const value = panel([], {
      maxLines: Number.NaN,
      emptyText: 'No tasks yet.',
    });
    const rows = value.render(120);
    expect(rows).toHaveLength(42);
    expect(rows[1]).toContain('No tasks yet.');
    expect(rows.every((row) => visibleWidth(row) === 120)).toBe(true);
    value.handleInput('\u001b[C');
    expect(value.selectedItem()).toBeUndefined();
  });

  it('puts the selector below content at narrow widths and preserves the height budget', () => {
    const value = panel([item('a'), item('b')]);
    const rows = value.render(60);
    expect(rows).toHaveLength(14);
    expect(rows[0]).not.toContain('┬');
    expect(rows[1]).toContain('name: task a');
    const divider = rows.findIndex((row) => row.includes('executions [1-2/2]'));
    expect(divider).toBeGreaterThan(3);
    expect(rows.slice(3, divider).join('\n')).toContain('first');
    expect(rows[divider + 1]).toContain('● task a:running');
    expect(rows[divider + 2]).toContain('○ task b:running');
    expect(rows.at(-1)).toContain('←/→ select · ↑/↓ scroll');
    expect(rows.every((row) => visibleWidth(row) <= 60)).toBe(true);
  });
  it('frames a wide split list/content viewport with the existing rounded visuals', () => {
    const value = panel();
    const rows = value.render(120);
    expect(rows).toHaveLength(14);
    expect(rows[0]).toContain('╭─');
    expect(rows[0]).toContain('history');
    expect(rows[0]).toContain('┬');
    expect(rows[0]).toContain('[✕ Cerrar]');
    expect(rows[1]).toContain('executions 1-1/1');
    expect(rows[3]).toContain('┼');
    expect(rows[4]).toContain('● task a:running');
    expect(rows[4]).toContain('first');
    expect(rows.at(-1)).toContain('┴');
    expect(rows.every((row) => visibleWidth(row) <= 120)).toBe(true);
  });
});
