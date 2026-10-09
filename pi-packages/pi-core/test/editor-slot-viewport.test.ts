import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  Container,
  type EditorComponent,
  type Terminal,
  TuiAltScreen,
} from '@earendil-works/pi-tui';
import { expect, it, vi } from 'vitest';
import { registerEditorSlot } from '../src/panel.js';
import { inputComponent } from './owned-overlay-fixture.js';

it('fullscreen PgUp/PgDn reach the SDK transcript viewport while the question occupies the editor slot', () => {
  vi.useFakeTimers();
  let input = (_data: string) => {};
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
  const tui = new TuiAltScreen(terminal);
  const editorContainer = new Container();
  tui.addChild(editorContainer);
  const editor = inputComponent('Editor');
  const question = inputComponent('Question');
  let factory: Parameters<ExtensionContext['ui']['setEditorComponent']>[0] =
    () => editor as EditorComponent;
  const ctx = {
    ui: {
      getEditorComponent: () => factory,
      setEditorComponent(next: typeof factory) {
        factory = next;
        editorContainer.clear();
        const mounted = next?.(tui, {} as never, {} as never) ?? editor;
        editorContainer.addChild(mounted);
        tui.setFocus(mounted);
      },
      setWidget() {},
      onTerminalInput: tui.addInputListener.bind(tui),
    },
  } as unknown as ExtensionContext;
  const slot = registerEditorSlot(ctx, {
    key: 'question',
    replacement: () => question,
  });
  if (!slot) throw new Error('Editor slot unavailable');
  const scroll = vi.spyOn(tui, 'scrollBy');
  try {
    tui.start();
    slot.acquireFocus();
    expect(tui.hasOverlay()).toBe(false);
    input('\x1b[5~');
    input('\x1b[6~');
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll.mock.calls[0][0]).toBeLessThan(0);
    expect(scroll.mock.calls[1][0]).toBeGreaterThan(0);
    expect(question.handleInput).not.toHaveBeenCalled();
    input('answer');
    expect(question.handleInput).toHaveBeenCalledExactlyOnceWith('answer');
  } finally {
    slot.dispose();
    tui.stop();
    vi.useRealTimers();
  }
});
