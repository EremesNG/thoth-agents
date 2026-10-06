import {
  type Component,
  type Terminal,
  TuiMainScreen,
} from '@earendil-works/pi-tui';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ensureWorkPanel,
  isWorkPanelRootEditorInputActive,
  registerWorkPanelProvider,
} from '../src/index.js';
import { provider, uiSession } from './work-panel-fixture.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

// Use the installed TUI's focus, overlay stack and terminal input dispatcher.
function liveSession() {
  vi.useFakeTimers();
  let input: (data: string) => void = () => {};
  const terminal: Terminal = {
    columns: 120,
    rows: 40,
    kittyProtocolActive: false,
    start(onInput) {
      input = onInput;
    },
    stop() {},
    drainInput: async () => {},
    write() {},
    moveBy() {},
    hideCursor() {},
    showCursor() {},
    clearLine() {},
    clearFromCursor() {},
    clearScreen() {},
    setTitle() {},
    setProgress() {},
  };
  const tui = new TuiMainScreen(terminal);
  const session = uiSession(tui);
  tui.start();
  cleanups.push(() => tui.stop());
  return Object.assign(session, {
    liveTui: tui,
    input: (data: string) => input(data),
  });
}

it.each([
  'overlay',
  'custom overlay',
  'custom UI',
  'native dialog',
  'replaced editor',
])('closes its own card without closing or stealing focus from a foreign %s', async (kind) => {
  const session = liveSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider('todos', 'Todos', 20)),
    await ensureWorkPanel(session.ctx),
  );
  session.input('\x1b[D');
  session.input('\r');
  await Promise.resolve();
  const card = session.customComponent;
  const cardRender = () => card.render(100);
  expect(cardRender().join('\n')).toContain('Todos item');
  const originalHide = session.liveTui.hideOverlay;
  const other: Component = {
    render: () => ['Question dialog'],
    invalidate() {},
    handleInput: vi.fn(),
  };
  if (kind === 'overlay') session.liveTui.showOverlay(other);
  if (kind === 'custom overlay')
    void session.ui.custom(() => other, { overlay: true });
  if (kind === 'custom UI') void session.ui.custom(() => other);
  if (kind === 'native dialog') {
    session.liveTui.addChild(other);
    session.liveTui.setFocus(other);
  }
  if (kind === 'replaced editor') session.ui.setEditorComponent(() => other);
  await Promise.resolve();
  await Promise.resolve();
  expect(cardRender()).toEqual([]);
  expect(session.liveTui.getFocusedComponent()).toBe(other);
  expect(session.liveTui.hasOverlay()).toBe(
    ['overlay', 'custom overlay'].includes(kind),
  );
  expect(session.liveTui.hideOverlay).toBe(originalHide);
  expect(isWorkPanelRootEditorInputActive(session.ctx)).toBe(false);
  session.input('\x1b');
  expect(other.handleInput).toHaveBeenCalledExactlyOnceWith('\x1b');
  expect(session.render().some((line: string) => line.startsWith('› '))).toBe(
    false,
  );
});

it.each([
  'hideOverlay',
  'onHandle',
])('fails safely without %s instead of popping the foreign UI', async (missing) => {
  const session = liveSession();
  if (missing === 'onHandle') {
    const custom = session.ui.custom.getMockImplementation();
    if (!custom) throw new Error('Missing Pi custom UI fixture');
    session.ui.custom.mockImplementation((factory, options) =>
      custom(factory, { ...options, onHandle: undefined }),
    );
  }
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider('todos', 'Todos', 20)),
    await ensureWorkPanel(session.ctx),
  );
  session.input('\x1b[D');
  session.input('\r');
  await Promise.resolve();
  const card = session.customComponent;
  const originalHide = session.liveTui.hideOverlay;
  if (missing === 'hideOverlay')
    session.liveTui.hideOverlay = undefined as unknown as typeof originalHide;
  const other: Component = {
    render: () => ['Question'],
    invalidate() {},
    handleInput: vi.fn(),
  };
  session.liveTui.showOverlay(other);
  await Promise.resolve();
  await Promise.resolve();
  expect(card.render(100)).toEqual([]);
  expect(session.liveTui.getFocusedComponent()).toBe(other);
  expect(session.liveTui.hasOverlay()).toBe(true);
  session.input('\x1b');
  expect(other.handleInput).toHaveBeenCalledExactlyOnceWith('\x1b');
  session.liveTui.hideOverlay = originalHide;
  if (missing === 'hideOverlay') {
    session.liveTui.hideOverlay();
    expect(session.liveTui.hasOverlay()).toBe(false);
    expect(isWorkPanelRootEditorInputActive(session.ctx)).toBe(true);
    expect(session.key('\x1b[A')).toBeUndefined();
  }
});

it('restores the TUI closer and releases host state even if the custom completion throws', async () => {
  const session = liveSession();
  const custom = session.ui.custom.getMockImplementation();
  if (!custom) throw new Error('Missing Pi custom UI fixture');
  session.ui.custom.mockImplementation((factory, options) =>
    custom(
      (tui: unknown, theme: unknown, keys: unknown, done: () => void) =>
        factory(tui, theme, keys, () => {
          done();
          throw new Error('UI completion failed');
        }),
      options,
    ),
  );
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider('todos', 'Todos', 20)),
    await ensureWorkPanel(session.ctx),
  );
  session.input('\x1b[D');
  session.input('\r');
  await Promise.resolve();
  const originalHide = session.liveTui.hideOverlay;
  expect(() => session.customKey('\x1b')).toThrow('UI completion failed');
  expect(session.liveTui.hideOverlay).toBe(originalHide);
  expect(session.liveTui.hasOverlay()).toBe(false);
  expect(isWorkPanelRootEditorInputActive(session.ctx)).toBe(true);
  expect(session.key('\x1b[A')).toBeUndefined();
});
