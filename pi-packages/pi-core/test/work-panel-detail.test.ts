import {
  compositeTuiLine,
  sliceByColumn,
  stripTerminalSequences,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ensureWorkPanel,
  registerRenderKit,
  registerWorkPanelProvider,
  withdrawRenderKit,
} from '../src/index.js';
import { createTestRenderKit } from '../src/testing.js';
import { provider, uiSession } from './work-panel-fixture.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
const keys = { left: '\x1b[D', enter: '\r' };

it('uses the registered card with a title and pads every themed row to its full width', async () => {
  const session = uiSession();
  const kit = createTestRenderKit();
  const card = vi.fn(kit.card);
  const token = registerRenderKit({ ...kit, card }, {});
  cleanups.push(() => withdrawRenderKit(token));
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      detail: () => ({
        id: 'agents-1',
        title: 'Themed detail',
        metadata: [],
        evidence: { label: 'Description', text: 'Short description' },
      }),
    }),
    await ensureWorkPanel(session.ctx),
  );
  session.key(keys.left);
  session.key(keys.enter);
  const lines: string[] = session.customRender(48);
  expect(card).toHaveBeenCalledWith(
    session.ui.theme,
    expect.objectContaining({ title: 'Themed detail' }),
    48,
  );
  expect(lines[0]).toContain('╭─ Themed detail');
  expect(lines.every((line) => visibleWidth(line) === 48)).toBe(true);
  expect(lines.join('\n')).toContain('Short description');
  for (const line of lines)
    expect(
      stripTerminalSequences(
        compositeTuiLine('T'.repeat(60), line, 6, 48, 60),
      ).slice(6, 54),
    ).toBe(stripTerminalSequences(line));
});

it('wraps themed content at the inner width supplied by the registered card', async () => {
  const session = uiSession();
  const token = registerRenderKit(
    {
      ...createTestRenderKit(),
      card: (_theme, options) => [
        '╭─ card',
        ...(typeof options.body === 'function'
          ? options.body(10)
          : (options.body ?? [])),
        '╰─',
      ],
    },
    {},
  );
  cleanups.push(() => withdrawRenderKit(token));
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      detail: () => ({
        id: 'agents-1',
        title: 'Wrapped',
        metadata: [],
        evidence: { label: 'Description', text: 'alpha beta gamma delta' },
      }),
    }),
    await ensureWorkPanel(session.ctx),
  );
  session.key(keys.left);
  session.key(keys.enter);
  expect(session.customRender(60).map((line: string) => line.trim())).toEqual([
    '╭─ card',
    'Description',
    'alpha beta',
    'gamma',
    'delta',
    '↑↓ move · x cancel · Esc back',
    '╰─',
  ]);
});

it.each([
  false,
  true,
])('enables log-tail rendering and keys only when the provider declares support (%s)', async (supportsLogTail) => {
  const session = uiSession();
  session.tui.terminal.rows = 60;
  const detail = vi.fn(() => ({
    id: 'agents-1',
    title: 'Output',
    metadata: [],
    evidence: {
      label: 'log',
      text: Array.from({ length: 30 }, (_, i) => `log ${i}`).join('\n'),
    },
  }));
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      supportsLogTail,
      detail,
    }),
    await ensureWorkPanel(session.ctx),
  );
  session.key(keys.left);
  session.key(keys.enter);
  const before = session.customRender(80).join('\n');
  expect(before.includes('l 10/25')).toBe(supportsLogTail);
  expect(before.includes('log 0 ')).toBe(!supportsLogTail);
  expect(before).toContain('log 29');
  session.customKey('l');
  expect(detail).toHaveBeenLastCalledWith('agents-1', expect.any(Number), {
    logTailLines: supportsLogTail ? 10 : 25,
  });
  const after = session.customRender(80).join('\n');
  if (supportsLogTail) {
    expect(after).not.toContain('log 19');
    expect(after).toContain('log 20');
    expect(after).toContain('x cancel');
  } else expect(after).toBe(before);
});

it.each([
  false,
  true,
])('shows an empty task description dim without irrelevant controls (kit: %s)', async (withKit) => {
  const session = uiSession();
  const styles: Array<[string, string]> = [];
  session.ui.theme.fg = (role, text) => {
    styles.push([role, text]);
    return text;
  };
  if (withKit) {
    const token = registerRenderKit(createTestRenderKit(), {});
    cleanups.push(() => withdrawRenderKit(token));
  }
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider('todos', 'Todos', 20),
      armCloseLabel: () => '',
      detail: () => ({
        id: 'todos-1',
        title: 'Write tests',
        metadata: [],
        evidence: {
          label: 'Description',
          text: '',
          emptyText: '(no description)',
        },
      }),
    }),
    await ensureWorkPanel(session.ctx),
  );
  session.key(keys.left);
  session.key(keys.enter);
  const lines: string[] = session.customRender(60);
  expect(lines.join('\n')).toContain('(no description)');
  expect(styles).toContainEqual(['dim', '(no description)']);
  expect(lines.join('\n')).not.toMatch(/folded|Enter|l 10\/25|x |unavailable/);
  expect(lines.every((line) => visibleWidth(line) === 60)).toBe(true);
});

it('offers folding only for oversized content, expands it on Enter and keeps short sections expanded after resize', async () => {
  const session = uiSession();
  session.tui.terminal.rows = 20;
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider('todos', 'Todos', 20),
      armCloseLabel: () => '',
      detail: () => ({
        id: 'todos-1',
        title: 'Description',
        metadata: [],
        foldedSections: [{ id: 'task', label: 'Task', text: 'Short task' }],
        evidence: {
          label: 'Description',
          text: Array.from({ length: 20 }, (_, i) => `description ${i}`).join(
            '\n',
          ),
        },
      }),
    }),
    await ensureWorkPanel(session.ctx),
  );
  session.key(keys.left);
  session.key(keys.enter);
  const folded = session.customRender(80).join('\n');
  expect(folded).toContain('Short task');
  expect(folded).toContain('folded');
  expect(folded).toContain('Enter expand/collapse');
  expect(folded).not.toContain('description 1 ');
  session.customKey(keys.enter);
  const expanded = session.customRender(80);
  expect(expanded.join('\n')).toContain('description 1 ');
  expect(expanded.length).toBeLessThanOrEqual(16);
  expect(expanded.at(-1)).toMatch(/^╰─+╯$/);
  session.customKey(keys.enter);
  expect(session.customRender(80).join('\n')).toBe(folded);
  session.customKey(keys.enter);
  session.customKey(keys.enter);
  expect(session.customRender(80).join('\n')).toBe(folded);
  session.tui.terminal.rows = 40;
  const short = session.customRender(80).join('\n');
  expect(short).toContain('description 19');
  expect(short).not.toMatch(/folded|Enter/);
  session.customKey(keys.enter);
  expect(session.customRender(80).join('\n')).toBe(short);
});

it('centers the overlay at at most 100 columns or 90% and keeps its frame inside the 80% height on resize', async () => {
  const session = uiSession();
  session.tui.terminal.columns = 200;
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      supportsLogTail: true,
      detail: () => ({
        id: 'agents-1',
        title: 'Long output',
        metadata: Array.from({ length: 10 }, (_, i) => ({
          label: `Field ${i}`,
          value: 'value',
        })),
        evidence: {
          label: 'log',
          text: Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n'),
        },
      }),
    }),
    await ensureWorkPanel(session.ctx),
  );
  session.key(keys.left);
  session.key(keys.enter);
  const customOptions = session.ui.custom.mock.calls[0][1];
  const layout = () =>
    typeof customOptions.overlayOptions === 'function'
      ? customOptions.overlayOptions()
      : customOptions.overlayOptions;
  expect(layout()).toMatchObject({
    width: 100,
    maxHeight: '80%',
    anchor: 'center',
  });
  for (const [columns, rows, width, height] of [
    [200, 40, 100, 32],
    [60, 20, 54, 16],
    [20, 10, 18, 8],
  ]) {
    session.tui.terminal.columns = columns;
    session.tui.terminal.rows = rows;
    expect(layout().width).toBe(width);
    const lines: string[] = session.customRender(width);
    expect(lines.length).toBeLessThanOrEqual(height);
    expect(lines.at(-1)).toMatch(/^╰─+╯$/);
    expect(lines.join('\n')).toContain('line 29');
    expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
  }
});

it('pads ANSI-styled rows containing wide characters by terminal columns', async () => {
  const session = uiSession();
  session.ui.theme.fg = (_role, text) => `\x1b[36m${text}\x1b[0m`;
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      detail: () => ({
        id: 'agents-1',
        title: '检查任务🙂',
        metadata: [],
        evidence: { label: 'Description', text: '説明🙂' },
      }),
    }),
    await ensureWorkPanel(session.ctx),
  );
  session.key(keys.left);
  session.key(keys.enter);
  for (const width of [12, 24, 60]) {
    const lines: string[] = session.customRender(width);
    expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
    for (const line of lines) {
      const composite = compositeTuiLine(
        'T'.repeat(width + 10),
        line,
        5,
        width,
        width + 10,
      );
      expect(stripTerminalSequences(sliceByColumn(composite, 5, width))).toBe(
        stripTerminalSequences(line),
      );
    }
  }
});

it.each([
  false,
  true,
])('keeps both frame edges when only two rows fit and returns nothing at zero size (kit: %s)', async (withKit) => {
  const session = uiSession();
  session.tui.terminal.rows = 3;
  if (withKit) {
    const token = registerRenderKit(createTestRenderKit(), {});
    cleanups.push(() => withdrawRenderKit(token));
  }
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider()),
    await ensureWorkPanel(session.ctx),
  );
  session.key(keys.left);
  session.key(keys.enter);
  const lines: string[] = session.customRender(60);
  expect(lines).toHaveLength(2);
  expect(lines.at(-1)).toMatch(/^╰/);
  expect(session.customRender(0)).toEqual([]);
  session.tui.terminal.rows = 0;
  expect(session.customRender(60)).toEqual([]);
});

it('opens a content-sized opaque native card with expanded short sections and applicable controls only', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider('todos', 'Todos', 20),
      armCloseLabel: () => '',
      detail: () => ({
        id: 'todos-1',
        title: 'Write tests',
        status: 'pending',
        metadata: [],
        foldedSections: [{ id: 'task', label: 'Task', text: 'A short task' }],
        evidence: {
          label: 'Description',
          text: 'Cover ordering.\nCover replay.',
        },
      }),
    }),
    await ensureWorkPanel(session.ctx),
  );
  session.key(keys.left);
  session.key(keys.enter);
  const lines: string[] = session.customRender(60);
  expect(lines[0]).toMatch(/^╭.*Write tests.*╮$/);
  expect(lines.at(-1)).toMatch(/^╰─+╯$/);
  expect(lines).toHaveLength(9);
  expect(lines.every((line) => visibleWidth(line) === 60)).toBe(true);
  expect(lines.join('\n')).toContain('A short task');
  expect(lines.join('\n')).toContain('Cover replay.');
  expect(lines.join('\n')).not.toMatch(/folded|Enter|l 10\/25|x |unavailable/);
  expect(lines.at(-2)).toContain('↑↓ move · Esc back');
  session.customKey(keys.enter);
  expect(session.customRender(60)).toEqual(lines);
  // Exercise Pi's installed compositor, not an imitation of its space handling.
  for (const line of lines) {
    const composite = stripTerminalSequences(
      compositeTuiLine('T'.repeat(80), line, 10, 60, 80),
    );
    expect(composite.slice(0, 10)).toBe('T'.repeat(10));
    expect(composite.slice(10, 70)).toBe(stripTerminalSequences(line));
    expect(composite.slice(70)).toBe('T'.repeat(10));
  }
});
