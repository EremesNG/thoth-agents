import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  type EditorComponent,
  stripTerminalSequences,
  type TUI,
} from '@earendil-works/pi-tui';
import { hasBlockingOverlay } from '@thoth-agents/pi-core';
import { registerEditorSlot } from '@thoth-agents/pi-core/panel';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createInlineAdapter,
  PlaceholderSidebar,
} from '../../src/layout/index.js';
import {
  createInteractiveTuiReference,
  fullscreen,
  inline,
} from './fixture.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

it('patches the concrete main-screen render through the real proxy and reserves right columns without capturing editor focus', () => {
  const { tui, proxy, widths, editor } = inline();
  expect(proxy.render).not.toBe(proxy.render);
  const original = tui.render;
  const sidebar = new PlaceholderSidebar();
  const adapter = createInlineAdapter(proxy, vi.fn());
  cleanups.push(() => adapter.dispose());
  expect(adapter.mount(sidebar, 32)).toBe(true);
  tui.renderNow(true);
  expect(widths.at(-1)).toBe(88);
  expect(sidebar.widths.at(-1)).toBe(32);
  expect(tui.getFocusedComponent()).toBe(editor);
  expect(hasBlockingOverlay(proxy)).toBe(false);
  adapter.dispose();
  expect(tui.render).toBe(original);
  tui.renderNow(true);
  expect(widths.at(-1)).toBe(120);
  expect(tui.hasOverlay()).toBe(false);
});

it('composes exactly terminal.rows sidebar rows at the top right of the visible viewport as the document grows, with differential rendering intact', () => {
  const { tui, proxy, terminal, grow } = inline();
  const sidebar = {
    render: () => Array.from({ length: 40 }, (_, i) => `SIDE${i}`),
    invalidate() {},
  };
  const adapter = createInlineAdapter(proxy, vi.fn());
  cleanups.push(() => adapter.dispose());
  adapter.mount(sidebar, 32);
  for (const count of [4, 8, 9, 12]) {
    grow(count);
    terminal.output = '';
    tui.renderNow();
    const { previousLines, previousViewportTop } = tui.captureRenderState();
    const viewport = previousLines.slice(
      previousViewportTop,
      previousViewportTop + terminal.rows,
    );
    expect(viewport).toHaveLength(6);
    for (const [row, line] of viewport.entries())
      expect(line).toContain(`SIDE${row}`);
    expect(previousLines.filter((line) => line.includes('SIDE'))).toHaveLength(
      6,
    );
    expect(viewport.join('\n')).not.toContain('SIDE6');
  }
  const redraws = tui.fullRedraws;
  terminal.output = '';
  tui.renderNow();
  expect(tui.fullRedraws).toBe(redraws);
  expect(terminal.output).toBe('');
  grow(13);
  tui.renderNow();
  expect(tui.fullRedraws).toBe(redraws);
  expect(terminal.output).not.toContain('\x1b[3J');
  terminal.rows = 7;
  tui.renderNow();
  const state = tui.captureRenderState();
  expect(
    state.previousLines
      .slice(state.previousViewportTop)
      .filter((line) => line.includes('SIDE')),
  ).toHaveLength(7);
});

it('pads a short sidebar to terminal height and honors hidden/narrow visibility in both main width and overlay classification', () => {
  const { tui, proxy, terminal, widths } = inline();
  const adapter = createInlineAdapter(proxy, vi.fn());
  cleanups.push(() => adapter.dispose());
  adapter.mount(new PlaceholderSidebar(), 32);
  tui.renderNow();
  expect(tui.captureRenderState().previousLines).toHaveLength(6);
  expect(hasBlockingOverlay(tui)).toBe(false);
  adapter.setVisible(false);
  tui.renderNow();
  expect(widths.at(-1)).toBe(120);
  expect(tui.hasOverlay()).toBe(false);
  adapter.setVisible(true);
  adapter.setWidth(40);
  tui.renderNow();
  expect(widths.at(-1)).toBe(80);
  terminal.columns = 90;
  tui.renderNow();
  expect(widths.at(-1)).toBe(90);
  expect(tui.hasOverlay()).toBe(false);
  expect(hasBlockingOverlay(proxy)).toBe(false);
  terminal.columns = 140;
  adapter.setWidth(100);
  tui.renderNow();
  expect(widths.at(-1)).toBe(68);
  expect(tui.hasOverlay()).toBe(true);
});

it('composes a centered modal over the sidebar and restores editor focus while the sidebar remains decorative', () => {
  const { tui, proxy, editor } = inline();
  const adapter = createInlineAdapter(proxy, vi.fn());
  cleanups.push(() => adapter.dispose());
  adapter.mount(new PlaceholderSidebar(), 32);
  const modal = {
    render: (width: number) => ['P'.repeat(width), 'P'.repeat(width)],
    invalidate() {},
    handleInput: vi.fn(),
    focused: false,
  };
  const modalHandle = tui.showOverlay(modal, {
    anchor: 'center',
    width: '96%',
    maxHeight: '90%',
  });
  cleanups.push(() => modalHandle.hide());
  tui.renderNow();
  expect(tui.getFocusedComponent()).toBe(modal);
  expect(hasBlockingOverlay(proxy)).toBe(true);
  const lines = tui.captureRenderState().previousLines;
  expect(stripTerminalSequences(lines[2]).slice(88, 116)).toBe('P'.repeat(28));
  modalHandle.hide();
  expect(tui.getFocusedComponent()).toBe(editor);
  expect(hasBlockingOverlay(proxy)).toBe(false);
  expect(hasBlockingOverlay(tui)).toBe(false);
});

it('restores a pre-existing render property exactly, but leaves a foreign replacement untouched through the real proxy', () => {
  const { tui, proxy } = inline();
  const original = vi.fn(() => ['Original']);
  tui.render = original;
  const adapter = createInlineAdapter(proxy, vi.fn());
  adapter.mount(new PlaceholderSidebar(), 32);
  adapter.dispose();
  expect(tui.render).toBe(original);
  const next = createInlineAdapter(proxy, vi.fn());
  next.mount(new PlaceholderSidebar(), 32);
  const foreign = vi.fn(() => ['Foreign']);
  proxy.render = foreign;
  next.dispose();
  next.dispose();
  expect(tui.render).toBe(foreign);
  expect(tui.hasOverlay()).toBe(false);
});

it('notifies display loss during render after a foreign patch and removes only its own overlay', () => {
  const { tui, proxy } = inline();
  const original = tui.render;
  const changed = vi.fn();
  const adapter = createInlineAdapter(proxy, vi.fn(), changed);
  cleanups.push(() => adapter.dispose());
  adapter.mount(new PlaceholderSidebar(), 32);
  expect(adapter.isDisplayed()).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1);
  const foreignOverlay = tui.showOverlay({
    render: () => ['Foreign'],
    invalidate() {},
  });
  cleanups.push(() => foreignOverlay.hide());
  proxy.render = original;
  tui.renderNow();
  expect(changed).toHaveBeenCalledTimes(2);
  expect(adapter.isDisplayed()).toBe(false);
  expect(tui.render).toBe(original);
  expect(tui.hasOverlay()).toBe(true);
  foreignOverlay.hide();
  expect(tui.hasOverlay()).toBe(false);
});

it.each([
  'hidden',
  'removed',
])('notifies display loss and stops column reservation when its overlay is externally %s', (state) => {
  const { tui, proxy, widths } = inline();
  const handles: ReturnType<typeof tui.showOverlay>[] = [];
  const showOverlay = tui.showOverlay.bind(tui);
  tui.showOverlay = (...args) => {
    const handle = showOverlay(...args);
    handles.push(handle);
    return handle;
  };
  const changed = vi.fn();
  const adapter = createInlineAdapter(proxy, vi.fn(), changed);
  cleanups.push(() => adapter.dispose());
  adapter.mount(new PlaceholderSidebar(), 32);
  expect(adapter.isDisplayed()).toBe(true);
  if (state === 'hidden') handles[0].setHidden(true);
  else handles[0].hide();
  tui.renderNow();
  expect(adapter.isDisplayed()).toBe(false);
  expect(changed).toHaveBeenCalledTimes(2);
  expect(widths.at(-1)).toBe(120);
  adapter.setVisible(false);
  adapter.setVisible(true);
  expect(adapter.isDisplayed()).toBe(state === 'hidden');
});

it.each([
  'reference',
  'renderer',
])('disables the inline overlay when registration rejects an old first-owner closure on the %s (without upgrading it)', (identity) => {
  const { tui, proxy, widths } = inline();
  const original = tui.render;
  const key = Symbol.for('thoth.pi-core.editor-slot');
  const shared = globalThis as unknown as Record<
    symbol,
    {
      version: number;
      sessions: WeakMap<object, unknown>;
      tuis: WeakMap<object, unknown>;
    }
  >;
  shared[key] ??= { version: 1, sessions: new WeakMap(), tuis: new WeakMap() };
  const target = identity === 'reference' ? proxy : tui;
  shared[key].tuis.set(target, {
    register: vi.fn(),
    focusTarget: () => undefined,
  });
  cleanups.push(() => {
    shared[key].tuis.delete(target);
  });
  const report = vi.fn();
  const adapter = createInlineAdapter(proxy, report);
  cleanups.push(() => adapter.dispose());
  expect(adapter.mount(new PlaceholderSidebar(), 32)).toBe(false);
  expect(adapter.mount(new PlaceholderSidebar(), 32)).toBe(false);
  expect(report).toHaveBeenCalledOnce();
  expect(tui.hasOverlay()).toBe(false);
  expect(tui.render).toBe(original);
  tui.renderNow();
  expect(widths.at(-1)).toBe(120);
});

it('rejects unsupported overlay stack shape without leaving a render patch or overlay', () => {
  const { tui, proxy } = inline();
  const original = tui.render;
  (tui as any).overlayStack = {};
  const report = vi.fn();
  const adapter = createInlineAdapter(proxy, report);
  expect(adapter.mount(new PlaceholderSidebar(), 32)).toBe(false);
  adapter.dispose();
  expect(tui.render).toBe(original);
  expect(report).toHaveBeenCalledOnce();
  expect((tui as any).overlayStack).toEqual({});
});

it('does not patch fullscreen renderers or unsupported references, and reports only once', () => {
  const { proxy: fullscreenProxy } = fullscreen();
  for (const unsupported of [fullscreenProxy, {} as TUI]) {
    const report = vi.fn();
    const adapter = createInlineAdapter(unsupported, report);
    expect(adapter.mount(new PlaceholderSidebar(), 32)).toBe(false);
    expect(adapter.mount(new PlaceholderSidebar(), 32)).toBe(false);
    adapter.setVisible(false);
    adapter.setWidth(40);
    adapter.dispose();
    expect(report).toHaveBeenCalledOnce();
  }
});

it('cleans up the owned renderer when Pi retargets the real proxy and leaves the new renderer intact', () => {
  const first = inline();
  const second = inline();
  let current = first.tui;
  const proxy = createInteractiveTuiReference(() => current);
  const original = first.tui.render;
  const adapter = createInlineAdapter(proxy, vi.fn());
  adapter.mount(new PlaceholderSidebar(), 32);
  current = second.tui;
  adapter.dispose();
  expect(first.tui.render).toBe(original);
  expect(second.tui.render).toBe(original);
  expect(first.tui.hasOverlay()).toBe(false);
  expect(second.tui.hasOverlay()).toBe(false);
});

it('rolls back its render patch and decorations if the overlay cannot be mounted', () => {
  const { tui, proxy, widths } = inline();
  const original = tui.render;
  tui.showOverlay = () => {
    throw new Error('unsupported overlay');
  };
  const report = vi.fn();
  const adapter = createInlineAdapter(proxy, report);
  expect(adapter.mount(new PlaceholderSidebar(), 32)).toBe(false);
  adapter.dispose();
  expect(report).toHaveBeenCalledOnce();
  expect(tui.render).toBe(original);
  expect(tui.hasOverlay()).toBe(false);
  tui.renderNow();
  expect(widths.at(-1)).toBe(120);
});

it('keeps real editor-slot question replacement input and root-input guards working with the decorative sidebar', () => {
  const { tui, proxy, editor } = inline();
  type Factory = NonNullable<
    ReturnType<ExtensionContext['ui']['getEditorComponent']>
  >;
  const baseFactory: Factory = () => editor as unknown as EditorComponent;
  let factory: Factory | undefined = baseFactory;
  let mounted: EditorComponent = editor as unknown as EditorComponent;
  const ctx = {
    ui: {
      getEditorComponent: () => factory,
      setEditorComponent(next: Factory | undefined) {
        factory = next;
        tui.removeChild(mounted);
        mounted = (next ?? baseFactory)(proxy, {} as never, {} as never);
        tui.addChild(mounted);
        tui.setFocus(mounted);
      },
      onTerminalInput: proxy.addInputListener,
      setWidget() {},
    },
  } as unknown as ExtensionContext;
  const adapter = createInlineAdapter(proxy, vi.fn());
  cleanups.push(() => adapter.dispose());
  adapter.mount(new PlaceholderSidebar(), 32);
  const question = {
    render: () => ['Question'],
    invalidate() {},
    handleInput: vi.fn(),
  };
  let expanded = true;
  const slot = registerEditorSlot(ctx, {
    key: 'question',
    replacement: () => (expanded ? question : undefined),
  });
  expect(slot).toBeDefined();
  cleanups.push(() => slot?.dispose());
  slot?.acquireFocus();
  expect(slot?.isRootEditorInputActive()).toBe(false);
  tui.getFocusedComponent()?.handleInput?.('answer');
  expect(question.handleInput).toHaveBeenCalledExactlyOnceWith('answer');
  tui.renderNow();
  expect(tui.captureRenderState().previousLines.join('\n')).toContain(
    'Question',
  );
  expanded = false;
  adapter.setVisible(false);
  adapter.setVisible(true);
  expect(slot?.isRootEditorInputActive()).toBe(true);
  const modal = { render: () => ['Modal'], invalidate() {}, handleInput() {} };
  const overlay = proxy.showOverlay(modal);
  expect(slot?.isRootEditorInputActive()).toBe(false);
  overlay.hide();
  expect(slot?.isRootEditorInputActive()).toBe(true);
});
