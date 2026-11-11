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
    expect(onClose).toHaveBeenCalledTimes(1);
    value.handleInput('q');
    expect(onClose).toHaveBeenCalledTimes(2);
    value.dispose();
    value.handleInput('q');
    expect(onClose).toHaveBeenCalledTimes(2);
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
  ])('selects linked content with raw clicks (%j) plus the top close button', (click) => {
    const onClose = vi.fn();
    const value = panel(
      [item('a'), item('b')],
      { onClose },
      { renderContent: () => [{ text: 'linked b', itemId: 'b' }] },
    );
    text(value);
    value.handleInput(click);
    expect(value.selectedItem()?.id).toBe('b');
    value.handleMouse({ type: 'click', row: 0, col: 119 });
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
  it('anchors opted-in content at the top on open and after keyboard or mouse selection', () => {
    const entries = ['a', 'b'].map((id) => ({
      ...item(id),
      lines: Array.from({ length: 30 }, (_, index) => `${id}-line-${index}`),
    }));
    const value = panel(entries, { contentScroll: 'top', maxLines: 24 });
    expect(text(value)).toContain('a-line-0');
    expect(text(value)).not.toContain('a-line-29');
    value.handleInput('\u001b[B');
    expect(text(value)).toContain('a-line-1');
    expect(text(value)).not.toContain('a-line-0');
    value.handleInput('\u001b[F');
    expect(text(value)).toContain('a-line-29');
    value.handleInput('\u001b[C');
    expect(text(value)).toContain('b-line-0');
    expect(text(value)).not.toContain('b-line-29');
    value.handleInput('\u001b[F');
    value.handleMouse({ type: 'click', row: 4, col: 5 });
    expect(text(value)).toContain('a-line-0');
    expect(text(value)).not.toContain('a-line-29');
  });
  it('resets top-anchored content when a refresh removes or reorders the selected item', () => {
    const entries = ['a', 'b'].map((id) => ({
      ...item(id),
      lines: Array.from({ length: 30 }, (_, index) => `${id}-line-${index}`),
    }));
    const value = panel(entries, {
      contentScroll: 'top',
      initialSelectedId: 'b',
    });
    expect(text(value)).toContain('b-line-0');
    value.handleInput('\u001b[F');
    expect(text(value)).toContain('b-line-29');
    entries.pop();
    expect(text(value)).toContain('a-line-0');
    value.handleInput('\u001b[F');
    entries.unshift({ ...item('c'), lines: ['c-first', ...entries[0].lines] });
    expect(text(value)).toContain('c-first');
  });

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
  it.each([
    40, 60, 120,
  ])('resolves every shell border, divider and close mark through an ASCII kit at width %i', (width) => {
    for (const entries of [[], [item('a'), item('b')]]) {
      const value = panel(
        entries,
        {},
        { renderItemLabel: (entry) => entry.name },
      );
      const native = text(value, width);
      const icons: Record<string, string> = {
        agent: '@',
        arrowLeft: '<',
        arrowRight: '>',
        arrowUp: '^',
        arrowDown: 'v',
        scrollUp: '^',
        scrollDown: 'v',
        separator: '|',
        ellipsis: '...',
        close: 'x',
        boxTopLeft: '+',
        boxTopRight: '+',
        boxBottomLeft: '+',
        boxBottomRight: '+',
        boxHorizontal: '-',
        boxVertical: '|',
        boxTDown: '+',
        boxTUp: '+',
        boxTRight: '+',
        boxTLeft: '+',
        boxCross: '+',
      };
      const token = registerRenderKit(
        createTestRenderKit({ icon: (name) => icons[name] ?? '' }),
        {},
      );
      cleanups.push(() => withdrawRenderKit(token));
      const rendered = text(value, width);
      expect(rendered).toContain('x Close');
      expect(rendered).not.toMatch(/[╭╮╰╯─│┬┴├┤┼✕]/);
      expect(value.getRenderDebugState().widthViolationCount).toBe(0);
      withdrawRenderKit(token);
      expect(text(value, width)).toBe(native);
    }
  });
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
    expect(text(value)).toContain('L/R select | U/D scroll');
    expect(invalidate).toHaveBeenCalledOnce();
    text(themed);
    expect(nativeClip).not.toHaveBeenCalled();
    withdrawRenderKit(token);
    expect(text(value)).toContain('←/→ select · ↑/↓ scroll');
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
    expect(rows[0]).toContain('✕ Close');
    expect(rows[1]).toContain('executions 1-1/1');
    expect(rows[3]).toContain('┼');
    expect(rows[4]).toContain('● task a:running');
    expect(rows[4]).toContain('first');
    expect(rows.at(-1)).toContain('╰─');
    expect(rows.every((row) => visibleWidth(row) <= 120)).toBe(true);
  });
});

describe('shared history chrome', () => {
  it('renders eligible adapter bindings once in the footer, never the header', () => {
    const value = panel(
      [item()],
      {},
      {
        hints: () => [
          { key: 'ctrl+o', label: 'expand', group: 'views' },
          { key: 'x', label: 'stop', group: 'actions', eligible: false },
        ],
        renderHeader: () => ({ shortcuts: 'legacy duplicate' }),
      },
    );
    const rows = value.render(120).map(stripTerminalSequences);
    expect(rows.at(-1)).toContain('ctrl+o expand');
    expect(rows.at(-1)).toContain('? help');
    expect(rows.join('\n')).not.toContain('legacy duplicate');
    expect(rows.join('\n')).not.toContain('x stop');
    expect(rows.slice(0, -1).join('\n')).not.toContain('ctrl+o');
  });
  it('keeps English close on the top only, including compact widths and mouse hit testing', () => {
    const onClose = vi.fn();
    const value = panel([item()], { onClose, disposeOnClose: false });
    const rows = value.render(60).map(stripTerminalSequences);
    expect(rows[0]).toContain('─ ✕ Close ─');
    expect(rows.slice(1).join('\n')).not.toContain('Close');
    expect(rows.join('\n')).not.toContain('Cerrar');
    value.handleMouse({ type: 'click', row: rows.length - 1, col: 58 });
    expect(onClose).not.toHaveBeenCalled();
    value.handleMouse({ type: 'click', row: 0, col: 58 });
    expect(onClose).toHaveBeenCalledOnce();
    expect(text(value, 29).split('\n')[0]).toMatch(/─ ✕ ─/);
  });
});

describe('history shortcut help', () => {
  it('centers grouped metadata and consumes help dismissal without closing or invoking actions', () => {
    const onClose = vi.fn();
    const handleInput = vi.fn();
    const value = panel(
      [item()],
      { onClose, maxLines: 30 },
      {
        handleInput,
        hints: () => [
          { key: 'x', label: 'stop', group: 'actions', eligible: false },
        ],
      },
    );
    value.handleInput('?');
    const rows = value.render(120).map(stripTerminalSequences);
    const title = rows.find((row) => row.includes('Keyboard shortcuts')) ?? '';
    expect(title).toBeDefined();
    expect(title.indexOf('╭')).toBe(32);
    expect(visibleWidth(title.trim())).toBe(56);
    for (const label of [
      'Navigate',
      'Actions',
      'Panel',
      'x',
      'stop',
      'PgUp/PgDn',
    ])
      expect(rows.join('\n')).toContain(label);
    value.handleInput('x');
    expect(handleInput).not.toHaveBeenCalled();
    value.handleInput('\u001b');
    expect(onClose).not.toHaveBeenCalled();
    expect(text(value)).not.toContain('Keyboard shortcuts');
    value.handleInput('?');
    value.handleInput('?');
    expect(text(value)).not.toContain('Keyboard shortcuts');
    value.handleInput('\u001b');
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('history footer position', () => {
  it('pins the position, tracks unseen appends, resumes live, and omits position when content fits', () => {
    const entry = {
      ...item(),
      lines: Array.from({ length: 30 }, (_, i) => `body ${i}`),
    };
    const value = panel([entry]);
    expect(value.render(60).at(-1)).toContain('line 30/30');
    expect(value.render(60).at(-1)).toContain('● live');
    value.handleInput('\u001b[H');
    entry.lines.push('new one', 'new two');
    let footer = stripTerminalSequences(value.render(60).at(-1) ?? '');
    expect(footer).toContain('line 1/32');
    expect(footer).toContain('↓ 2 new');
    expect(footer).not.toContain('live');
    expect(footer).toMatch(/line 1\/32 ↓ 2 new ─╯$/);
    expect(stripTerminalSequences(value.render(29).at(-1) ?? '')).toContain(
      'line 1/32 ↓ 2 new',
    );
    value.handleInput('\u001b[F');
    expect(value.render(60).at(-1)).toContain('● live');
    entry.lines = ['fits'];
    footer = value.render(60).at(-1) ?? '';
    expect(footer).not.toContain('line ');
    expect(footer).not.toContain('live');
    expect(footer).not.toContain(' new');
  });
});

describe('history adapter slots', () => {
  it.each([
    [60, 56],
    [90, 22],
    [120, 30],
  ])('passes the occupied summary width at panel width %i', (width, innerWidth) => {
    const renderListSummary = vi.fn(() => 'summary');
    const value = panel([item()], { maxLines: 20 }, { renderListSummary });
    value.render(width);
    expect(renderListSummary).toHaveBeenCalledExactlyOnceWith(innerWidth);
  });
  it.each([
    60, 120,
  ])('places the summary above the list and hides it below 16 rows (%i)', (width) => {
    const value = panel(
      [item()],
      { maxLines: 20 },
      { renderListSummary: () => 'summary slot' },
    );
    const rows = value.render(width).map(stripTerminalSequences);
    const summaryRow = rows.findIndex((row) => row.includes('summary slot'));
    const itemRow = rows.findIndex((row) => row.includes('● task a'));
    expect(summaryRow).toBeGreaterThan(0);
    expect(summaryRow).toBeLessThan(itemRow);
    if (width === 60) expect(summaryRow).toBe(itemRow - 1);
    expect(rows).toHaveLength(20);
    const small = panel(
      [item()],
      { maxLines: 15 },
      { renderListSummary: () => 'hidden summary' },
    );
    expect(text(small, width)).not.toContain('hidden summary');
  });
  it.each([
    60, 120,
  ])('allows N opted-in header rows within the height budget (%i)', (width) => {
    const value = panel(
      [item()],
      { maxLines: 20 },
      {
        renderHeader: () => ({
          variableRows: true,
          wideRows: ['one', 'two', 'three', 'four'],
          narrowRows: ['one', 'two', 'three', 'four'],
        }),
      },
    );
    const rows = value.render(width).map(stripTerminalSequences);
    for (const label of ['one', 'two', 'three', 'four'])
      expect(rows.join('\n')).toContain(label);
    expect(rows).toHaveLength(20);
    expect(rows[5]).toContain('├');
  });
});

it('keeps help available in empty panels with exactly one footer hint row', () => {
  const value = panel([]);
  const rows = value.render(60).map(stripTerminalSequences);
  expect(rows.at(-1)).toContain('? help');
  value.handleInput('?');
  expect(text(value, 60)).toContain('Keyboard shortcuts');
});

it('reserves the top close area even with oversized titles and badges', () => {
  const value = panel(
    [item()],
    { title: 'oversized title '.repeat(20) },
    {
      renderHeader: () => ({ badge: 'oversized badge '.repeat(20) }),
    },
  );
  for (const width of [29, 40, 60, 90, 120]) {
    const top = stripTerminalSequences(value.render(width)[0]);
    expect(top).toContain(width < 30 ? '─ ✕ ─' : '─ ✕ Close ─');
    expect(visibleWidth(top)).toBe(width);
  }
});

it('drops low-priority hints before actions/help and preserves theme roles in help and live position', () => {
  const theme = {
    fg: (role: string, label: string) =>
      `\u001b[${role === 'success' ? 32 : role === 'accent' ? 36 : 90}m${label}\u001b[0m`,
  };
  const value = panel(
    [{ ...item(), lines: Array.from({ length: 30 }, (_, i) => String(i)) }],
    { theme, maxLines: 30 },
    {
      hints: () => [
        {
          key: 'v',
          label: 'a low priority view',
          group: 'views',
          priority: -1,
        },
        { key: 'x', label: 'stop', group: 'actions' },
        { key: 'e', label: 'extend', group: 'actions', eligible: false },
      ],
    },
  );
  const footer = value.render(60).at(-1) ?? '';
  expect(stripTerminalSequences(footer)).toContain('x stop · ? help');
  expect(stripTerminalSequences(footer)).not.toContain('low priority');
  expect(footer).toContain('\u001b[32m● live');
  value.handleInput('?');
  const help = value.render(60).join('\n');
  expect(help).toContain('\u001b[36mx           ');
  expect(help).toContain('\u001b[90me           ');
  expect(help).toContain('extend');
});

describe('opt-in history groups', () => {
  it('selects headers, collapses via Enter/Space/click, skips hidden items and retains item identity on regroup', () => {
    const entries = [item('a'), item('b')];
    let moved = false;
    const value = panel(
      entries,
      { maxLines: 24 },
      {
        groupOf: (entry) =>
          entry.id === 'a' && !moved
            ? { id: 'live', label: 'Running', order: 0 }
            : { id: 'done', label: 'Completed', order: 1 },
      },
    );
    expect(text(value)).toContain('Running');
    expect(value.selectedItem()?.id).toBe('a');
    value.handleInput('\u001b[D');
    expect(text(value)).toContain('Total: 1');
    value.handleInput('\r');
    expect(text(value)).not.toContain('● task a:running');
    value.handleInput('\u001b[C');
    expect(value.selectedItem()).toBeUndefined();
    value.handleInput('\u001b[C');
    expect(value.selectedItem()?.id).toBe('b');
    value.selectItem('a');
    moved = true;
    expect(text(value)).not.toContain('Running');
    expect(value.selectedItem()?.id).toBe('a');
    value.handleInput('\u001b[D');
    value.handleInput(' ');
    expect(text(value)).not.toContain('task a:running');
    for (const width of [120, 60]) {
      const rows = value.render(width).map(stripTerminalSequences);
      const row = rows.findIndex(
        (line) => line.includes('Completed') && line.includes('→'),
      );
      expect(row).toBeGreaterThan(0);
      value.handleMouse({ type: 'click', row, col: 5 });
      expect(text(value, width)).toContain('task a:running');
      value.handleInput(' ');
    }
  });
});

describe('opt-in history filter', () => {
  it.each([
    120, 60,
  ])('isolates typing, keeps on Enter, clears before closing, and hit-tests filtered group rows at %i', (width) => {
    const onClose = vi.fn();
    const action = vi.fn(() => true);
    const entries = [item('a'), item('b'), { ...item('c'), name: 'ix1?' }];
    const value = panel(
      entries,
      { maxLines: 24, onClose },
      {
        groupOf: () => ({ id: 'all', label: 'All', order: 0 }),
        matchesFilter: (entry, query) =>
          entry.name.toLowerCase().includes(query.toLowerCase()),
        handleInput: action,
        renderListSummary: () => 'summary',
      },
    );
    text(value, width);
    value.handleInput('/');
    for (const key of ['i', 'x', '1', '?', 'z', '\u007f'])
      value.handleInput(key);
    expect(action).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    const filtered = text(value, width);
    expect(filtered).toContain('/ ix1?█');
    expect(filtered).toContain('1/3');
    expect(filtered).toContain('Enter keep · Esc clear · ↑/↓ results');
    expect(filtered).not.toContain('task b:running');
    value.handleInput('\r');
    expect(text(value, width)).toContain('/ ix1?');
    expect(text(value, width)).not.toContain('█');
    const rows = value.render(width).map(stripTerminalSequences);
    const headerRow = rows.findIndex((line) => line.includes('↓ All'));
    value.handleMouse({ type: 'click', row: headerRow, col: 5 });
    expect(text(value, width)).not.toContain('ix1?:running');
    expect(text(value, width)).toContain('Total: 1');
    value.handleInput('\u001b');
    expect(text(value, width)).not.toContain('/ ix1?');
    expect(onClose).not.toHaveBeenCalled();
    value.handleInput('\u001b');
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('shows No matches and recovers via Backspace or Escape without closing', () => {
    const onClose = vi.fn();
    const value = panel(
      [item()],
      { onClose },
      {
        matchesFilter: (entry, query) => entry.name.includes(query),
      },
    );
    value.handleInput('/');
    value.handleInput('z');
    expect(text(value)).toContain('No matches');
    expect(text(value)).toContain('0/1');
    value.handleInput('\u007f');
    expect(text(value)).toContain('task a:running');
    value.handleInput('q');
    value.handleInput('\u001b');
    expect(text(value)).toContain('task a:running');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('group and filter layout bounds', () => {
  it('keeps the narrow list at four physical rows and fits a filter with the tallest header at minimum height', () => {
    const value = panel(
      Array.from({ length: 10 }, (_, index) => item(String(index))),
      { maxLines: 12 },
      {
        groupOf: () => ({ id: 'all', label: 'All', order: 0 }),
        matchesFilter: () => true,
        renderHeader: () => ({
          variableRows: true,
          narrowRows: ['one', 'two', 'three', 'four'],
        }),
      },
    );
    value.handleInput('/');
    const rows = value.render(60);
    expect(rows.length).toBeLessThanOrEqual(12);
    expect(
      rows.filter((row) => row.includes(':running')).length,
    ).toBeLessThanOrEqual(4);
  });
});

describe('grouped history refresh and mouse boundaries', () => {
  it('retains an item that moves into a collapsed group and distinguishes header and content clicks on the same row', () => {
    const entries = [item('a'), item('b')];
    let moved = false;
    const renderContent = vi.fn(() => [{ text: 'linked b', itemId: 'b' }]);
    const value = panel(
      entries,
      { maxLines: 24, contentScroll: 'top' },
      {
        groupOf: (entry) => ({
          id: moved || entry.id === 'b' ? 'done' : 'live',
          label: moved || entry.id === 'b' ? 'Done' : 'Live',
          order: moved || entry.id === 'b' ? 1 : 0,
        }),
        renderContent,
      },
    );
    let rows = value.render(120).map(stripTerminalSequences);
    const liveHeader = rows.findIndex((row) => row.includes('↓ Live'));
    value.handleMouse({ type: 'click', row: liveHeader, col: 100 });
    expect(value.selectedItem()?.id).toBe('b');
    rows = value.render(120).map(stripTerminalSequences);
    value.handleMouse({
      type: 'click',
      row: rows.findIndex((row) => row.includes('↓ Done')),
      col: 5,
    });
    text(value);
    expect(value.selectedItem()).toBeUndefined();
    value.selectItem('a');
    moved = true;
    expect(text(value)).toContain('● task a:running');
    expect(value.selectedItem()?.id).toBe('a');
    value.handleInput('\u001b[D');
    renderContent.mockClear();
    expect(text(value)).toContain('Total: 2');
    expect(renderContent).not.toHaveBeenCalled();
  });
  it('uses render-kit ASCII disclosure icons, heading role and right-aligned counts at a narrow sidebar width', () => {
    const kit = createTestRenderKit();
    kit.icon = (name) => {
      if (name === 'arrowDown') return 'v';
      if (name === 'arrowRight') return '>';
      throw new Error('Use native fallback for other icons');
    };
    const token = registerRenderKit(kit, {});
    cleanups.push(() => withdrawRenderKit(token));
    const fg = vi.fn((_theme: unknown, _role: string, value: string) => value);
    kit.fg = fg;
    const value = panel(
      [item()],
      {},
      {
        groupOf: () => ({
          id: 'all',
          label: 'A very long group heading',
          order: 0,
        }),
      },
    );
    const rows = value.render(90).map(stripTerminalSequences);
    const groupRow = rows.find((row) => row.includes('v A very'))!;
    expect(groupRow.split('│')[1]).toMatch(/ 1 $/);
    expect(fg).toHaveBeenCalledWith(
      expect.anything(),
      'mdHeading',
      expect.any(String),
    );
    value.handleInput('\u001b[D');
    value.handleInput(' ');
    expect(text(value, 90)).toContain('> A very');
  });
});

describe('filter isolation from extension-owned shortcuts', () => {
  it('does not dispatch an externally invoked item close while editing the query', () => {
    const close = vi.fn();
    const value = panel(
      [item()],
      { confirmClose: false },
      { matchesFilter: () => true, close },
    );
    value.handleInput('/');
    value.closeSelectedItem();
    expect(close).not.toHaveBeenCalled();
    value.handleInput('\r');
    value.closeSelectedItem();
    expect(close).toHaveBeenCalledOnce();
  });
});

it('opts into numbered views with narrow tabs, filter-safe keys, mouse and per-view scrolling', () => {
  const renderContent = vi.fn(() => ['legacy']);
  const value = panel(
    [item()],
    { maxLines: 20 },
    {
      renderContent,
      matchesFilter: () => true,
      views: () => [
        { id: 'result', label: 'Result' },
        { id: 'transcript', label: 'Transcript', followTail: true },
      ],
      renderView: (_item, view) =>
        Array.from({ length: 40 }, (_, i) => `${view} ${i}`),
    },
  );
  expect(text(value)).toContain('[1 Result]');
  expect(text(value)).toContain('result 0');
  expect(text(value)).not.toContain(' live');
  expect(renderContent).not.toHaveBeenCalled();
  value.handleInput('2');
  expect(text(value)).toContain('transcript 39');
  expect(text(value)).toContain(' live');
  value.handleInput('g');
  expect(text(value)).toContain('transcript 0');
  value.handleInput('G');
  expect(text(value)).toContain('transcript 39');
  expect(text(value, 60)).not.toContain(' 1 Result ');
  value.handleInput('/');
  value.handleInput('1');
  value.handleInput('\r');
  expect(text(value)).toContain('[2 Transcript]');
  const rows = value.render(120).map(stripTerminalSequences);
  const row = rows.findIndex((line) => line.includes('[2 Transcript]'));
  const col = rows[row].indexOf('1 Result');
  value.handleMouse({ type: 'click', row, col });
  expect(text(value)).toContain('[1 Result]');
});

describe('opt-in item actions', () => {
  it('captures confirmation keys until Enter or Esc and rechecks eligibility', () => {
    const run = vi.fn();
    const onClose = vi.fn();
    let eligible = true;
    const value = panel(
      [item()],
      { onClose },
      {
        actions: () => [
          {
            key: 'e',
            label: 'extend',
            eligible,
            confirm: () => 'Extend task? Enter confirm · Esc back',
            run,
          },
        ],
      },
    );
    expect(text(value)).toContain('e extend');
    value.handleInput('e');
    value.handleInput('q');
    value.handleInput('?');
    expect(text(value)).toContain('Extend task?');
    expect(onClose).not.toHaveBeenCalled();
    value.handleInput('\x1b');
    expect(onClose).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    value.handleInput('e');
    eligible = false;
    value.handleInput('\r');
    expect(run).not.toHaveBeenCalled();
    eligible = true;
    value.handleInput('e');
    value.handleInput('\r');
    expect(run).toHaveBeenCalledOnce();
  });
});

it.each([
  'throw',
  'reject',
] as const)('surfaces action %s without crashing and expires notices using its clock', async (mode) => {
  let now = 100;
  const value = panel(
    [item()],
    { now: () => now },
    {
      actions: () => [
        {
          key: 'y',
          label: 'copy',
          eligible: true,
          run: () => {
            if (mode === 'throw') throw new Error('terminal broke');
            return Promise.reject(new Error('terminal broke'));
          },
        },
      ],
    },
  );
  value.handleInput('y');
  await Promise.resolve();
  expect(text(value)).toContain('✗ Copy failed: terminal broke');
  expect(value.render(120).at(-1)).not.toContain('y copy');
  now = 3100;
  expect(text(value)).not.toContain('Copy failed');
  expect(text(value)).toContain('y copy');
});
it('renders action outcomes with semantic roles and dims ineligible actions in help only', () => {
  const fg = vi.fn((_role: string, value: string) => value);
  const value = panel(
    [item()],
    { maxLines: 42, theme: { fg } },
    {
      actions: () => [
        { key: 'e', label: 'extend', eligible: false, run: vi.fn() },
        {
          key: 'y',
          label: 'copy',
          eligible: true,
          run: () => ({ text: '✓ Result copied', role: 'success' }),
        },
      ],
    },
  );
  expect(text(value)).not.toContain('e extend');
  value.handleInput('?');
  expect(text(value)).toContain('Actions');
  expect(text(value)).toContain('extend');
  expect(fg).toHaveBeenCalledWith('dim', expect.stringMatching(/^e\s+$/));
  value.handleInput('?');
  value.handleInput('y');
  expect(text(value)).toContain('✓ Result copied');
  expect(fg).toHaveBeenCalledWith('success', '✓ Result copied');
});

it('advertises only modal bindings while help is open and restores the footer on escape', () => {
  const value = panel(
    [item()],
    {},
    {
      matchesFilter: () => true,
      actions: () => [
        { key: 'x', label: 'cancel', eligible: true, run: () => {} },
      ],
    },
  );
  value.handleInput('?');
  const footer = value.render(160).map(stripTerminalSequences).at(-1)!;
  expect(footer).toContain('Esc close help');
  expect(footer).toContain('? close help');
  expect(footer).not.toMatch(/x cancel|\/ filter|select|Esc close ·/);
  expect(text(value, 160)).toContain('cancel');
  value.handleInput('\u001b');
  expect(value.render(160).map(stripTerminalSequences).at(-1)).toContain(
    'Esc close',
  );
});

describe('action results with a strict Pi theme', () => {
  const theme = {
    fg(role: string, value: string) {
      if (
        ![
          'accent',
          'border',
          'borderMuted',
          'dim',
          'muted',
          'text',
          'success',
          'warning',
          'error',
          'mdHeading',
          'toolTitle',
        ].includes(role)
      )
        throw new Error(`Unknown theme color: ${role}`);
      return value;
    },
  };
  it.each([
    [{ id: 'task', status: 'stopping' }, undefined],
    [true, undefined],
    [{ text: 'Updated', role: 'unknown' }, 'Updated'],
    [{ text: 'Updated' }, 'Updated'],
  ])('ignores command results and safely renders notice %j', (outcome, notice) => {
    const value = panel(
      [item()],
      { theme },
      {
        actions: () => [
          {
            key: 'x',
            label: 'cancel',
            eligible: true,
            confirm: () => 'Cancel?',
            run: () => outcome as never,
          },
        ],
      },
    );
    text(value);
    value.handleInput('x');
    expect(text(value)).toContain('Cancel?');
    value.handleInput('\r');
    const rendered = text(value);
    if (notice) expect(rendered).toContain(notice);
    expect(rendered).not.toContain('undefined');
  });
  it.each([
    'e',
    'y',
    'failure',
  ])('renders %s completion and failure', async (key) => {
    const value = panel(
      [item()],
      { theme },
      {
        actions: () => [
          {
            key,
            label: 'action',
            eligible: true,
            confirm: key === 'e' ? () => 'Extend?' : undefined,
            run: () => {
              if (key === 'failure') throw new Error('denied');
              return key === 'e'
                ? Promise.resolve({
                    text: 'Extended',
                    role: 'success' as const,
                  })
                : { text: 'Copied', role: 'success' as const };
            },
          },
        ],
      },
    );
    text(value);
    value.handleInput(key);
    if (key === 'e') value.handleInput('\r');
    await Promise.resolve();
    expect(text(value)).toContain(
      key === 'failure'
        ? 'Action failed: denied'
        : key === 'e'
          ? 'Extended'
          : 'Copied',
    );
  });
});
