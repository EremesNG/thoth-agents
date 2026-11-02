import { stripVTControlCharacters } from 'node:util';
import { visibleWidth } from '@earendil-works/pi-tui';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ensureWorkPanel,
  type RenderStatus,
  registerRenderKit,
  registerUIPreferences,
  registerWorkPanelProvider,
  type WorkPanelProvider,
  withdrawRenderKit,
  withdrawUIPreferences,
} from '../src/index.js';
import { registerEditorSlot } from '../src/panel.js';
import { createTestRenderKit } from '../src/testing.js';
import { provider, uiSession } from './work-panel-fixture.js';

const registryKey = Symbol.for('thoth.pi-core.editor-slot');
const cleanups: Array<() => void> = [];
function useRegistryRecord(value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, registryKey);
  Object.defineProperty(globalThis, registryKey, {
    configurable: true,
    writable: true,
    value,
  });
  cleanups.push(() => {
    if (previous) Object.defineProperty(globalThis, registryKey, previous);
    else Reflect.deleteProperty(globalThis, registryKey);
  });
}
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

const replacement = { render: () => ['Question'], invalidate() {} };

function occupy(session: ReturnType<typeof uiSession>) {
  const slot = registerEditorSlot(session.ctx, {
    key: 'question',
    replacement: () => replacement,
  });
  if (!slot) throw new Error('Missing editor slot');
  cleanups.push(() => slot.dispose());
  return slot;
}

it('summarizes visible sections in priority order with compact counts and no hint', async () => {
  const session = uiSession();
  for (const source of [
    {
      ...provider('background', 'Background', 30),
      summary: () => ({ running: 0, failed: 0, completed: 4 }),
    },
    {
      ...provider('todos', 'Todos', 20),
      summary: () => ({ completed: 53, total: 54 }),
      listRows: () => [
        { id: 'pending', primary: 'Pending', status: 'pending' },
      ],
    },
    {
      ...provider(),
      summary: () => ({ running: 2, failed: 1, completed: 34 }),
    },
  ])
    cleanups.push(registerWorkPanelProvider(session.ctx, source));
  cleanups.push(await ensureWorkPanel(session.ctx));
  occupy(session);

  expect(session.render(120)).toEqual([
    'Agents ◐2 ✗1 ✓34 · Todos ✓53/54 · Background ✓4',
  ]);
  const narrow = session.render(48);
  expect(narrow).toHaveLength(1);
  expect(visibleWidth(narrow[0])).toBe(47);
  for (const label of ['Agents', 'Todos', 'Background'])
    expect(narrow[0]).toContain(label);
  expect(narrow[0]).not.toContain('...');
  expect(stripVTControlCharacters(narrow[0])).toBe(
    'Agents ◐2 ✗1 ✓34 · Todos ✓53/54 · Background ✓4',
  );
});

it('uses real-provider numeric taxonomy counts without changing normal headings', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      retention: 'prompt',
      summary: () => ({
        text: '1 running · 2 queued · 30 completed · 1 failed · 1 cancelled',
        segments: [{ text: 'provider wording', role: 'meta' }],
        running: 1,
        queued: 2,
        failed: 1,
        cancelled: 1,
        completed: 30,
        total: 35,
      }),
      listRows: () => [
        {
          id: 'running',
          primary: 'Running',
          status: 'running',
          state: 'running',
        },
        { id: 'queued', primary: 'Queued', status: 'queued', state: 'running' },
        {
          id: 'cancelled',
          primary: 'Cancelled',
          statusGlyph: 'cancelled',
          state: 'failed',
        },
        {
          id: 'timeout',
          primary: 'Timeout',
          statusGlyph: 'timedOut',
          state: 'failed',
        },
        { id: 'done', primary: 'Done', status: 'completed', state: 'done' },
      ],
    }),
    registerWorkPanelProvider(session.ctx, {
      ...provider('background', 'Background', 30),
      retention: 'prompt',
      summary: () => ({ running: 0, failed: 0, cancelled: 0, completed: 1 }),
      listRows: () => [
        {
          id: 'expected',
          primary: 'Expected exit',
          status: 'failed',
          statusGlyph: 'expectedExit',
          statusTone: 'muted',
          state: 'failed',
          endedAt: Date.now(),
        },
        {
          id: 'resolved',
          primary: 'Recovered',
          status: 'failed',
          statusGlyph: 'resolved',
          statusTone: 'muted',
          state: 'failed',
          endedAt: Date.now(),
        },
      ],
    }),
    await ensureWorkPanel(session.ctx),
  );
  const full = session.render(160);
  const slot = occupy(session);
  expect(session.render(160)).toEqual([
    'Agents ◐1 ○2 ✗1 ■1 ✓30/35 · Background ✓1',
  ]);
  slot.dispose();
  expect(session.render(160)).toEqual(full);
});

it.each([
  undefined,
  'prompt',
] as const)('derives fallback counts from semantic status, not retention state (%s)', async (retention) => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      retention,
      selectableHeading: true,
      summary: () => ({ segments: [{ text: 'custom wording', role: 'meta' }] }),
      parentRow: () => ({ id: 'parent', primary: 'Parent', status: 'running' }),
      listRows: () => [
        { id: 'queued', primary: 'Queued', status: 'queued', state: 'running' },
        { id: 'stopping', primary: 'Stopping', status: 'stopping' },
        { id: 'running', primary: 'Running', status: 'running' },
        { id: 'working', primary: 'Working', status: 'in_progress' },
        { id: 'failed', primary: 'Failed', status: 'failed' },
        {
          id: 'timeout',
          primary: 'Timeout',
          status: 'failed',
          statusGlyph: 'timedOut',
          state: 'failed',
        },
        { id: 'timeout-no-state', primary: 'Timeout', status: 'timedOut' },
        { id: 'timeout-raw', primary: 'Timeout', status: 'timed_out' },
        {
          id: 'cancelled',
          primary: 'Cancelled',
          status: 'failed',
          statusGlyph: 'cancelled',
          state: 'failed',
        },
        {
          id: 'interrupted',
          primary: 'Interrupted',
          status: 'interrupted',
          state: 'failed',
        },
        { id: 'done', primary: 'Done', statusTone: 'success' },
        {
          id: 'summary',
          primary: '+9 done',
          status: 'completed',
          summary: true,
        },
      ],
    }),
    registerWorkPanelProvider(session.ctx, {
      ...provider('background', 'Background', 30),
      retention,
      summary: () => 'Custom background wording',
      listRows: () => [
        {
          id: 'expected',
          primary: 'Expected exit',
          status: 'failed',
          statusGlyph: 'expectedExit',
          statusTone: 'muted',
          state: 'failed',
          endedAt: Date.now(),
        },
        {
          id: 'expected-no-state',
          primary: 'Expected exit',
          status: 'expectedExit',
        },
        {
          id: 'resolved',
          primary: 'Recovered',
          status: 'failed',
          statusGlyph: 'resolved',
          statusTone: 'muted',
          state: 'failed',
          endedAt: Date.now(),
        },
      ],
    }),
    await ensureWorkPanel(session.ctx),
  );
  const full = session.render(160);
  const slot = occupy(session);
  expect(session.render(160)).toEqual([
    'Agents ◐3 ○1 ✗4 ■2 ✓1 · Background ✓2',
  ]);
  slot.dispose();
  expect(session.render(160)).toEqual(full);
});

it('reports only queued and cancelled counters when provider done and failure counts are zero', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      retention: 'prompt',
      summary: () => ({
        running: 0,
        queued: 2,
        failed: 0,
        cancelled: 1,
        completed: 0,
        total: 3,
      }),
      listRows: () => [
        { id: 'queued', primary: 'Queued', status: 'queued', state: 'running' },
      ],
    }),
    await ensureWorkPanel(session.ctx),
  );
  occupy(session);
  expect(session.render()).toEqual(['Agents ○2 ■1']);
});

it('keeps semantic fallback counts after retention collapses without rewriting the history heading', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider('background', 'Background', 30),
      retention: 'prompt',
      listRows: () => [
        {
          id: 'expected',
          primary: 'Expected exit',
          status: 'failed',
          statusGlyph: 'expectedExit',
          state: 'failed',
          endedAt: 0,
        },
        {
          id: 'resolved',
          primary: 'Recovered',
          status: 'failed',
          statusGlyph: 'resolved',
          state: 'failed',
          endedAt: 0,
        },
      ],
    }),
    await ensureWorkPanel(session.ctx),
  );
  const full = ['◆ Background · 0 done · 2 failed', '← interact'];
  expect(session.render()).toEqual(full);
  const slot = occupy(session);
  expect(session.render()).toEqual(['Background ✓1']);
  slot.dispose();
  expect(session.render()).toEqual(full);
});

it('keeps session counts after retained rows collapse and isolates a failing summary', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      retention: 'prompt',
      summary: () => ({ completed: 34, failed: 1 }),
      listRows: () => [],
    }),
    registerWorkPanelProvider(session.ctx, {
      ...provider('background', 'Background', 30),
      summary: () => {
        throw new Error('Unavailable');
      },
      listRows: () => [{ id: 'done', primary: 'Done', status: 'completed' }],
    }),
    await ensureWorkPanel(session.ctx),
  );
  occupy(session);
  expect(session.render()).toEqual(['Agents ✗1 ✓34 · Background ✓1']);
});

it.each(
  [
    {
      mode: 'Unicode',
      glyphs: {
        running: '◐',
        queued: '○',
        failed: '✗',
        cancelled: '■',
        completed: '✓',
      },
      expected: 'Agents ◐1 ○1 ✗1 ■1 ✓1',
    },
    {
      mode: 'Nerd',
      glyphs: {
        running: '◐',
        queued: '\u{f051f}',
        failed: '\u{f00d}',
        cancelled: '\u{f05e}',
        completed: '\u{f00c}',
      },
      expected: 'Agents ◐1 \u{f051f}1 \u{f00d}1 \u{f05e}1 \u{f00c}1',
    },
    {
      mode: 'ASCII',
      glyphs: {
        running: '*',
        queued: '~',
        failed: 'x',
        cancelled: '#',
        completed: '+',
      },
      expected: 'Agents *1 ~1 x1 #1 +1',
    },
  ].flatMap((example) =>
    ['numeric', 'fallback'].map((path) => ({ ...example, path })),
  ),
)('uses $mode render-kit glyphs and semantic roles for $path counts', async ({
  glyphs,
  expected,
  path,
}) => {
  const session = uiSession();
  const kit = createTestRenderKit();
  const statuses: Partial<Record<RenderStatus, string>> = glyphs;
  kit.statusGlyph = (_theme, status) => statuses[status] ?? '?';
  kit.fg = vi.fn((_theme, _role, text) => text);
  const token = registerRenderKit(kit, {});
  cleanups.push(() => withdrawRenderKit(token));
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      summary:
        path === 'numeric'
          ? () => ({
              running: 1,
              queued: 1,
              failed: 1,
              cancelled: 1,
              completed: 1,
            })
          : undefined,
      listRows: () => [
        { id: 'running', primary: 'Running', status: 'running' },
        { id: 'queued', primary: 'Queued', status: 'queued', state: 'running' },
        {
          id: 'cancelled',
          primary: 'Cancelled',
          statusGlyph: 'cancelled',
          state: 'failed',
        },
        {
          id: 'timeout',
          primary: 'Timeout',
          statusGlyph: 'timedOut',
          state: 'failed',
        },
        {
          id: 'expected',
          primary: 'Expected exit',
          statusGlyph: 'expectedExit',
          state: 'failed',
        },
        {
          id: 'resolved',
          primary: 'Resolved failure',
          statusGlyph: 'resolved',
          state: 'failed',
        },
      ],
    }),
    await ensureWorkPanel(session.ctx),
  );
  occupy(session);
  expect(session.render()).toEqual([expected]);
  for (const [role, text] of [
    ['toolTitle', 'Agents'],
    ['accent', glyphs.running],
    ['dim', `${glyphs.queued}1`],
    ['error', `${glyphs.failed}1`],
    ['muted', `${glyphs.cancelled}1`],
    ['success', glyphs.completed],
    ['dim', '1'],
  ])
    expect(kit.fg).toHaveBeenCalledWith(session.ui.theme, role, text);
});

it('clips ANSI-styled wide characters by terminal cells with an ellipsis', async () => {
  const session = uiSession();
  session.ui.theme.fg = (_role, text) => `\x1b[36m${text}\x1b[39m`;
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider('wide', '界'.repeat(30))),
    await ensureWorkPanel(session.ctx),
  );
  occupy(session);
  const lines = session.render(48);
  expect(lines).toHaveLength(1);
  expect(visibleWidth(lines[0])).toBe(47);
  expect(stripVTControlCharacters(lines[0])).toBe(`${'界'.repeat(22)}...`);
  expect(session.render(0)).toEqual([]);
});

it.each([
  'empty',
  'hidden',
  'expired',
  'absorbed',
] as const)('renders zero summary rows for a section that is %s', async (kind) => {
  const session = uiSession();
  const source: WorkPanelProvider = {
    ...provider(),
    ...(kind === 'empty' ? { listRows: () => [] } : {}),
    ...(kind === 'hidden' ? { showSection: () => false } : {}),
    ...(kind === 'expired'
      ? { listRows: () => [{ id: 'old', primary: 'Old', expiresAt: 0 }] }
      : {}),
  };
  if (kind === 'absorbed') {
    const token = registerUIPreferences({
      absorbedWorkPanelSources: ['agents'],
    });
    cleanups.push(() => withdrawUIPreferences(token));
  }
  cleanups.push(
    registerWorkPanelProvider(session.ctx, source),
    await ensureWorkPanel(session.ctx),
  );
  occupy(session);
  expect(session.render()).toEqual([]);
});

it('restores the full budget on the render requested by real slot collapse, re-expansion and disposal', async () => {
  const session = uiSession();
  session.tui.terminal.rows = 47;
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      listRows: () =>
        Array.from({ length: 20 }, (_, i) => ({
          id: String(i),
          primary: `Task ${i}`,
          status: 'pending',
        })),
    }),
    await ensureWorkPanel(session.ctx),
  );
  const full = session.render(48);
  expect(full).toHaveLength(12);
  expect(full.at(-1)).toBe('← interact');
  expect(full).toContain('  +11 more');
  let expanded = false;
  const slot = registerEditorSlot(session.ctx, {
    key: 'question',
    replacement: () => (expanded ? replacement : undefined),
  });
  if (!slot) throw new Error('Missing editor slot');
  cleanups.push(() => slot.dispose());

  for (const active of [true, false, true]) {
    expanded = active;
    const requests = session.tui.requestRender.mock.calls.length;
    slot.refresh();
    expect(session.tui.requestRender).toHaveBeenCalledTimes(requests + 1);
    expect(session.render(48)).toEqual(active ? ['Agents'] : full);
  }
  const requests = session.tui.requestRender.mock.calls.length;
  slot.dispose();
  expect(session.tui.requestRender).toHaveBeenCalledTimes(requests + 1);
  expect(session.render(48)).toEqual(full);
});

it.each([
  'answered',
  'cancelled',
] as const)('restores immediately when a real replacement is %s', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider()),
    await ensureWorkPanel(session.ctx),
  );
  const full = session.render();
  let active = true;
  const slot = registerEditorSlot(session.ctx, {
    key: 'question',
    replacement: () => (active ? replacement : undefined),
  });
  if (!slot) throw new Error('Missing editor slot');
  cleanups.push(() => slot.dispose());
  slot.refresh();
  expect(session.render()).toEqual(['Agents ◐1']);
  active = false;
  slot.refresh();
  expect(session.render()).toEqual(full);
});

it('includes occupancy in provider change detection even when both modes render no lines', async () => {
  const session = uiSession();
  let notify = () => {};
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      listRows: () => [],
      onVisibleChanged(changed) {
        notify = changed;
        return () => {};
      },
    }),
    await ensureWorkPanel(session.ctx),
  );
  expect(session.render()).toEqual([]);
  occupy(session);
  const requests = session.tui.requestRender.mock.calls.length;
  notify();
  expect(session.tui.requestRender).toHaveBeenCalledTimes(requests + 1);
  expect(session.render()).toEqual([]);
});

const keys = [
  '\x1b[D',
  '\x1b[C',
  '\x1b[A',
  '\x1b[B',
  '\r',
  '\x1b',
  'x',
  'text',
];

it('ignores focus and consumes no keys while occupied, restoring normal input afterwards', async () => {
  const session = uiSession();
  const source = { ...provider(), open: vi.fn() };
  cleanups.push(
    registerWorkPanelProvider(session.ctx, source),
    await ensureWorkPanel(session.ctx),
  );
  const slot = occupy(session);
  expect(session.render()).toEqual(['Agents ◐1']);
  for (const key of keys) expect(session.key(key)).toBeUndefined();
  expect(source.open).not.toHaveBeenCalled();
  expect(source.close).not.toHaveBeenCalled();
  expect(session.ui.setStatus).toHaveBeenLastCalledWith(
    'thoth-work-panel',
    undefined,
  );
  slot.dispose();
  expect(session.key('\x1b[D')).toEqual({ consume: true });
  expect(session.render().at(-1)).toBe(
    '↑↓ move · Enter open · x cancel · Esc back',
  );
});

it('releases focused panel state and its close arm on render without touching an open overlay', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider()),
    await ensureWorkPanel(session.ctx),
  );
  expect(session.key('\x1b[D')).toEqual({ consume: true });
  session.key('x');
  session.setOverlay(true);
  const focus = session.tui.getFocusedComponent();
  const hide = vi.spyOn(session.tui, 'hideOverlay');
  const slot = occupy(session);
  slot.refresh();
  expect(session.render()).toEqual(['Agents ◐1']);
  expect(session.ui.setStatus).toHaveBeenCalledWith(
    'thoth-work-panel-close',
    undefined,
  );
  expect(session.tui.hasOverlay()).toBe(true);
  expect(session.tui.getFocusedComponent()).toBe(focus);
  expect(hide).not.toHaveBeenCalled();
  slot.dispose();
  session.setOverlay(false);
  expect(session.render().some((line: string) => line.startsWith('› '))).toBe(
    false,
  );
  expect(session.render().at(-1)).toBe('← interact');
  expect(session.key('\x1b[A')).toBeUndefined();
});

it('does not dismiss a detail card merely because summary mode renders', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider()),
    await ensureWorkPanel(session.ctx),
  );
  session.key('\x1b[D');
  session.key('\r');
  const card = session.customComponent;
  const fullCard = session.customRender();
  expect(fullCard.join('\n')).toContain('Agents item');
  const slot = occupy(session);
  slot.refresh();
  expect(session.render()).toEqual(['Agents ◐1']);
  for (const key of keys) expect(session.key(key)).toBeUndefined();
  expect(session.customComponent).toBe(card);
  expect(session.customRender()).toEqual(fullCard);
  expect(session.tui.hasOverlay()).toBe(true);
  expect(session.tui.getFocusedComponent()).toBe(card);
  slot.dispose();
  expect(session.customRender()).toEqual(fullCard);
  session.closeCustom();
  await Promise.resolve();
});

it.each([
  0, 3,
])('omits explicit zero counts, including done with total %s, instead of deriving counts from rows', async (total) => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, {
      ...provider(),
      summary: () => ({
        running: 0,
        queued: 0,
        failed: 0,
        cancelled: 0,
        completed: 0,
        total,
      }),
      listRows: () =>
        ['running', 'queued', 'failed', 'cancelled', 'completed'].map(
          (status) => ({ id: status, primary: status, status }),
        ),
    }),
    await ensureWorkPanel(session.ctx),
  );
  occupy(session);
  expect(session.render()).toEqual(['Agents']);
});

it('summarizes replacements registered by a reloaded copy with a compatible legacy registry', async () => {
  const legacy = { version: 1, sessions: new WeakMap(), tuis: new WeakMap() };
  useRegistryRecord(legacy);
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider()),
    await ensureWorkPanel(session.ctx),
  );
  const full = session.render();
  expect(full.at(-1)).toBe('← interact');
  vi.resetModules();
  const { registerEditorSlot: registerCopy } = await import('../src/panel.js');
  let expanded = true;
  const slot = registerCopy(session.ctx, {
    key: 'question',
    replacement: () => (expanded ? replacement : undefined),
  });
  if (!slot) throw new Error('Missing editor slot');
  cleanups.push(() => slot.dispose());
  expect(session.render()).toEqual(['Agents ◐1']);
  expect(Reflect.get(globalThis, registryKey)).toBe(legacy);
  expect(Reflect.has(legacy, 'isEditorReplaced')).toBe(true);
  expanded = false;
  slot.refresh();
  expect(session.render()).toEqual(full);
  expanded = true;
  slot.refresh();
  expect(session.render()).toEqual(['Agents ◐1']);
  slot.dispose();
  expect(session.render()).toEqual(full);
});

it('keeps the full panel for a legacy owner even when the registry has an occupancy query', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider()),
    await ensureWorkPanel(session.ctx),
  );
  const full = session.render();
  const slot = occupy(session);
  expect(session.render()).toEqual(['Agents ◐1']);
  const record = Reflect.get(globalThis, registryKey) as {
    sessions: WeakMap<object, object>;
    tuis: WeakMap<object, object>;
  };
  const owner = record.tuis.get(slot.tui);
  if (!owner) throw new Error('Missing editor-slot owner');
  const legacyOwner = { ...owner };
  Reflect.deleteProperty(legacyOwner, 'isEditorReplaced');
  Object.freeze(legacyOwner);
  record.sessions.set(session.ctx.sessionManager, legacyOwner);
  record.tuis.set(slot.tui, legacyOwner);
  const extra = registerEditorSlot(session.ctx, { key: 'extra' });
  cleanups.push(() => extra?.dispose());
  expect(session.tui.getFocusedComponent().render(80)).toEqual(['Question']);
  expect(session.render()).toEqual(full);
  expect(full.at(-1)).toBe('← interact');
  expect(record.tuis.get(slot.tui)).toBe(legacyOwner);
  expect(legacyOwner).not.toHaveProperty('isEditorReplaced');
});

it.each([
  {
    name: 'incompatible',
    record: { version: 2, sessions: new WeakMap(), tuis: new WeakMap() },
  },
  { name: 'foreign', record: { isEditorReplaced: () => true } },
])('keeps the full panel for an $name editor-slot record without modifying it', async ({
  record,
}) => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider()),
    await ensureWorkPanel(session.ctx),
  );
  const full = session.render();
  occupy(session);
  expect(session.render()).toEqual(['Agents ◐1']);
  const descriptors = Object.getOwnPropertyDescriptors(record);
  useRegistryRecord(record);
  expect(session.render()).toEqual(full);
  expect(full.at(-1)).toBe('← interact');
  expect(Reflect.get(globalThis, registryKey)).toBe(record);
  expect(Object.getOwnPropertyDescriptors(record)).toEqual(descriptors);
});

it('excludes only absorbed sources from a mixed summary', async () => {
  const session = uiSession();
  const token = registerUIPreferences({ absorbedWorkPanelSources: ['agents'] });
  cleanups.push(() => withdrawUIPreferences(token));
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider()),
    registerWorkPanelProvider(session.ctx, provider('todos', 'Todos', 20)),
    await ensureWorkPanel(session.ctx),
  );
  occupy(session);
  expect(session.render()).toEqual(['Todos ◐1']);
});
