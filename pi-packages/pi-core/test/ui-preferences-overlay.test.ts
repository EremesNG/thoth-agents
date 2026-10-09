import type { TUI } from '@earendil-works/pi-tui';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ensureWorkPanel,
  hasBlockingOverlay,
  isWorkPanelRootEditorInputActive,
  registerDecorativeOverlay,
  registerWorkPanelProvider,
} from '../src/index.js';
import { registerEditorSlot } from '../src/panel.js';
import {
  inputComponent,
  ownedOverlaySession,
} from './owned-overlay-fixture.js';
import { provider, uiSession } from './work-panel-fixture.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});
function session() {
  vi.useFakeTimers();
  const result = ownedOverlaySession();
  cleanups.push(() => result.tui.stop());
  return result;
}
it('classifies before first render across copies and restores blocking classification on dispose', async () => {
  const { tui } = session();
  const sidebar = inputComponent('Sidebar');
  const handle = tui.showOverlay(sidebar, { nonCapturing: true });
  cleanups.push(() => handle.hide());
  expect(hasBlockingOverlay(tui)).toBe(true);
  vi.resetModules();
  const copy = await import('../src/index.js');
  const dispose = copy.registerDecorativeOverlay(tui, sidebar);
  expect(dispose).toBeTypeOf('function');
  cleanups.push(() => dispose?.());
  expect(hasBlockingOverlay(tui)).toBe(false);
  dispose?.();
  dispose?.();
  expect(hasBlockingOverlay(tui)).toBe(true);
});
it.each([
  false,
  true,
])('yields to every visible foreign overlay (nonCapturing %s), honoring hidden and visible callbacks', (nonCapturing) => {
  const { tui } = session();
  const sidebar = inputComponent('Sidebar');
  const dispose = registerDecorativeOverlay(tui, sidebar);
  cleanups.push(() => dispose?.());
  const sideHandle = tui.showOverlay(sidebar, { nonCapturing: true });
  cleanups.push(() => sideHandle.hide());
  let visible = true;
  const foreign = tui.showOverlay(inputComponent('Foreign'), {
    nonCapturing,
    visible: (columns, rows) => visible && columns === 120 && rows === 40,
  });
  cleanups.push(() => foreign.hide());
  expect(hasBlockingOverlay(tui)).toBe(true);
  foreign.setHidden(true);
  expect(hasBlockingOverlay(tui)).toBe(false);
  foreign.setHidden(false);
  visible = false;
  expect(hasBlockingOverlay(tui)).toBe(false);
  visible = true;
  expect(hasBlockingOverlay(tui)).toBe(true);
});
it('keeps overlapping registrations owner-safe until the last disposer releases', () => {
  const { tui } = session();
  const sidebar = inputComponent('Sidebar');
  const first = registerDecorativeOverlay(tui, sidebar);
  const second = registerDecorativeOverlay(tui, sidebar);
  cleanups.push(
    () => first?.(),
    () => second?.(),
  );
  const overlay = tui.showOverlay(sidebar, { nonCapturing: true });
  cleanups.push(() => overlay.hide());
  first?.();
  expect(hasBlockingOverlay(tui)).toBe(false);
  second?.();
  expect(hasBlockingOverlay(tui)).toBe(true);
});

it('retains left navigation and question dock replacement focus with a decorative overlay', async () => {
  const { tui } = session();
  const work = uiSession(tui);
  cleanups.push(
    registerWorkPanelProvider(work.ctx, provider()),
    await ensureWorkPanel(work.ctx),
  );
  const sidebar = inputComponent('Sidebar');
  const dispose = registerDecorativeOverlay(tui, sidebar);
  cleanups.push(() => dispose?.());
  const overlay = tui.showOverlay(sidebar, { nonCapturing: true });
  cleanups.push(() => overlay.hide());
  expect(isWorkPanelRootEditorInputActive(work.ctx)).toBe(true);
  expect(work.key('\x1b[D')).toEqual({ consume: true });
  const question = inputComponent('Question');
  let expanded = true;
  const slot = registerEditorSlot(work.ctx, {
    key: 'question',
    replacement: () => (expanded ? question : undefined),
  });
  cleanups.push(() => slot?.dispose());
  slot?.acquireFocus();
  expect(slot?.isRootEditorInputActive()).toBe(false);
  tui.getFocusedComponent()?.handleInput?.('answer');
  expect(question.handleInput).toHaveBeenCalledExactlyOnceWith('answer');
  expanded = false;
  expect(slot?.isRootEditorInputActive()).toBe(true);
  const foreign = inputComponent('Foreign');
  const foreignOverlay = tui.showOverlay(foreign);
  cleanups.push(() => foreignOverlay.hide());
  expect(slot?.isRootEditorInputActive()).toBe(false);
  expect(tui.getFocusedComponent()).toBe(foreign);
  expect(work.key('\x1b[D')).toBeUndefined();
});
it.each([
  undefined,
  [{ component: {} }],
  [
    {
      component: inputComponent('Unknown'),
      hidden: false,
      options: { visible: true },
    },
  ],
])('falls back and rejects decorative registration for unsupported private shapes: %j', (overlayStack) => {
  const hasOverlay = vi.fn(() => true);
  const tui = { overlayStack, hasOverlay } as unknown as TUI;
  expect(hasBlockingOverlay(tui)).toBe(true);
  expect(hasOverlay).toHaveBeenCalledOnce();
  expect(
    registerDecorativeOverlay(tui, inputComponent('Sidebar')),
  ).toBeUndefined();
  hasOverlay.mockReturnValue(false);
  expect(hasBlockingOverlay(tui)).toBe(false);
});
it('does not upgrade an old first-owner closure; mixed versions reject decorative registration', () => {
  const { tui } = session();
  const key = Symbol.for('thoth.pi-core.editor-slot');
  const shared = globalThis as unknown as Record<
    symbol,
    { tuis: WeakMap<object, unknown> }
  >;
  // Model the still-compatible v1 registry with a pre-feature owner closure.
  registerEditorSlot(uiSession(tui).ctx, { key: 'new' })?.dispose();
  shared[key].tuis.set(tui, {
    register: vi.fn(),
    focusTarget: () => undefined,
  });
  cleanups.push(() => {
    shared[key].tuis.delete(tui);
  });
  expect(
    registerDecorativeOverlay(tui, inputComponent('Sidebar')),
  ).toBeUndefined();
});
