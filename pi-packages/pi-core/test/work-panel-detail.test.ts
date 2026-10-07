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
const keys = {
  left: '\x1b[D',
  enter: '\r',
  up: '\x1b[A',
  down: '\x1b[B',
  escape: '\x1b',
};

it.each([
  false,
  true,
])('freezes the largest opened section card size and stops navigation at section ends (kit: %s)', async (withKit) => {
  const session = uiSession();
  if (withKit) {
    const token = registerRenderKit(createTestRenderKit(), {});
    cleanups.push(() => withdrawRenderKit(token));
  }
  let liveText = 'First long description line.\nSecond line.\nThird line.';
  const agentOpen = vi.fn();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, { ...provider(), open: agentOpen }),
  );
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider('todos', 'Todos', 20),
      armCloseLabel: () => '',
      listRows: () => ['short', 'long'].map((id) => ({ id, primary: id })),
      detail: (id) => ({
        id,
        title: id === 'short' ? 'Short' : 'Long description title',
        metadata: [],
        evidence: {
          label: 'Description',
          text: id === 'short' ? 'Brief.' : liveText,
        },
      }),
    }),
  );
  cleanups.push(
    registerWorkPanelProvider(
      session.ctx,
      provider('background', 'Background', 30),
    ),
  );
  cleanups.push(await ensureWorkPanel(session.ctx));
  session.key(keys.left);
  session.key(keys.down);
  session.key(keys.enter);
  const layout = session.ui.custom.mock.calls[0][1].overlayOptions;
  const initialWidth = layout().width;
  expect(initialWidth).toBeLessThan(100);
  const first: string[] = session.customRender(initialWidth);
  expect(first).toHaveLength(7);
  session.customKey(keys.up);
  expect(session.customRender(initialWidth)[0]).toContain('Short');
  session.customKey(keys.down);
  const second: string[] = session.customRender(layout().width);
  expect(second[0]).toContain('Long description title');
  expect(second.join('\n')).toContain('Third line.');
  expect(second).toHaveLength(first.length);
  expect(layout().width).toBe(initialWidth);
  expect(second.every((line) => visibleWidth(line) === initialWidth)).toBe(
    true,
  );
  session.customKey(keys.down);
  expect(session.customRender(initialWidth)[0]).toContain(
    'Long description title',
  );
  expect(agentOpen).not.toHaveBeenCalled();
  liveText =
    'New output that is much wider than the opening description.\n'.repeat(20);
  const refreshed: string[] = session.customRender(initialWidth);
  expect(refreshed).toHaveLength(first.length);
  expect(refreshed.at(-1)?.trimEnd()).toMatch(/^╰/);
  expect(layout().width).toBe(initialWidth);
});

it('closes the detail when its section becomes empty instead of falling through to an agent', async () => {
  const session = uiSession();
  let visible = true;
  cleanups.push(
    registerWorkPanelProvider(session.ctx, { ...provider(), open: vi.fn() }),
  );
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider('todos', 'Todos', 20),
      listRows: () => (visible ? [{ id: 'todo', primary: 'Todo' }] : []),
    }),
    await ensureWorkPanel(session.ctx),
  );
  session.key(keys.left);
  session.key(keys.down);
  session.key(keys.enter);
  visible = false;
  expect(session.customRender()).toEqual([]);
  expect(session.key(keys.up)).toBeUndefined();
  expect(session.render().join('\n')).not.toContain('› ');
});

it.each([
  ['running', 'accent', false],
  ['failed', 'error', true],
  ['completed', 'success', false],
  ['cancelled', 'muted', true],
  ['in_progress', 'accent', true],
  ['pending', 'text', false],
] as const)('styles %s detail fields and headings with semantic roles (%s, kit: %s)', async (status, statusRole, withKit) => {
  const session = uiSession();
  const styles: Array<[string, string]> = [];
  session.ui.theme.fg = (role, text) => {
    styles.push([role, text]);
    return text;
  };
  if (withKit) {
    const token = registerRenderKit(
      {
        ...createTestRenderKit(),
        fg: (theme, role, text) => theme.fg(role, text),
      },
      {},
    );
    cleanups.push(() => withdrawRenderKit(token));
  }
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider('todos', 'Todos', 20),
      armCloseLabel: () => '',
      detail: () => ({
        id: 'todos-1',
        title: 'Detail',
        status,
        metadata: [
          { label: 'provider', value: 'Todos' },
          { label: 'pgid', value: '–' },
          { label: 'pid', value: '-' },
          { label: 'cwd', value: '   ' },
          { label: 'count', value: '0' },
        ],
        foldedSections: [
          { id: 'command', label: 'Command', text: 'echo hello' },
        ],
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
  styles.length = 0;
  const text = session.customRender(80).join('\n');
  expect(text).not.toMatch(/pgid|pid ·|cwd/);
  expect(text).toContain('count · 0');
  expect(styles).toEqual(
    expect.arrayContaining([
      ['dim', 'status · '],
      [statusRole, status],
      ['dim', 'provider · '],
      ['text', 'Todos'],
      ['accent', 'Command'],
      ['accent', 'Description'],
      ['text', 'echo hello'],
      ['dim', '(no description)'],
    ]),
  );
});

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
    const token = registerRenderKit(
      {
        ...createTestRenderKit(),
        fg: (theme, role, text) => theme.fg(role, text),
      },
      {},
    );
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

it('offers folding only for oversized content and keeps the opening height after terminal growth', async () => {
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
  expect(session.customRender(80).join('\n')).toBe(folded);
  session.customKey(keys.enter);
  const afterGrowth = session.customRender(80);
  expect(afterGrowth).toHaveLength(expanded.length);
  expect(afterGrowth.join('\n')).toContain('Short task');
  expect(afterGrowth.join('\n')).toContain('description 1 ');
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
        title: `Long output ${'.'.repeat(100)}`,
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

it('re-resolves detail metadata and hints after registration, replacement and withdrawal', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      detail: () => ({
        id: 'one',
        title: 'Detail',
        status: 'completed',
        metadata: [{ label: 'count', value: '0' }],
        evidence: { label: 'Output', text: 'done' },
      }),
    }),
    await ensureWorkPanel(session.ctx),
  );
  session.key(keys.left);
  session.key(keys.enter);
  const native = session.customRender(80);
  for (const separator of ['|', '/']) {
    const token = registerRenderKit(
      createTestRenderKit({
        icon: (name) =>
          new Map([
            ['separator', separator],
            ['arrowUp', '^'],
            ['arrowDown', 'v'],
          ]).get(name) ?? '',
      }),
      {},
    );
    cleanups.push(() => withdrawRenderKit(token));
    const lines: string[] = session.customRender(80);
    expect(lines.join('\n')).toContain(`count ${separator} 0`);
    expect(lines.join('\n')).toContain(
      `^v move ${separator} x cancel ${separator} Esc back`,
    );
    expect(lines.every((line) => visibleWidth(line) === 80)).toBe(true);
  }
  const token = registerRenderKit(createTestRenderKit(), {});
  withdrawRenderKit(token);
  expect(session.customRender(80)).toEqual(native);
});

it('measures folded preview separators using the registered glyph width', async () => {
  const session = uiSession();
  session.tui.terminal.rows = 15;
  const token = registerRenderKit(
    createTestRenderKit({ icon: (name) => (name === 'separator' ? '::' : '') }),
    {},
  );
  cleanups.push(() => withdrawRenderKit(token));
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      detail: () => ({
        id: 'one',
        title: 'Fold',
        metadata: [],
        foldedSections: [
          {
            id: 'task',
            label: 'Task',
            text: 'long\n'.repeat(30),
            collapsedText: 'a very long preview line',
          },
        ],
        evidence: { label: 'Output', text: 'done' },
      }),
    }),
    await ensureWorkPanel(session.ctx),
  );
  session.key(keys.left);
  session.key(keys.enter);
  const lines: string[] = session.customRender(32);
  expect(lines.join('\n')).toContain(' :: folded');
  expect(lines.every((line) => visibleWidth(line) === 32)).toBe(true);
});
