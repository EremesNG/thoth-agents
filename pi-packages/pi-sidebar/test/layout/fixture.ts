import {
  ScrollView,
  type Terminal,
  Text,
  type TUI,
  TuiAltScreen,
  TuiMainScreen,
  VStack,
} from '@earendil-works/pi-tui';

// The public exports omit the renderer reference; resolve the installed SDK,
// not a copied proxy, so its get/set/prototype traps are part of these tests.
const rendererUrl = new URL(
  '../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/tui-renderer.js',
  import.meta.url,
);
export const { createInteractiveTuiReference } = (await import(
  rendererUrl.href
)) as {
  createInteractiveTuiReference(getTui: () => TUI): TUI;
};

export class MockTerminal implements Terminal {
  columns = 120;
  rows = 30;
  kittyProtocolActive = false;
  output = '';
  input: (data: string) => void = () => {};
  resize: () => void = () => {};
  start(input: (data: string) => void, resize: () => void) {
    this.input = input;
    this.resize = resize;
  }
  stop() {}
  async drainInput() {}
  write(data: string) {
    this.output += data;
  }
  hideCursor() {}
  showCursor() {}
  moveBy() {}
  clearLine() {}
  clearFromCursor() {}
  clearScreen() {}
  setTitle() {}
  setProgress() {}
}

export function fullscreen() {
  const terminal = new MockTerminal();
  const widths: number[] = [];
  const text = new Text(
    Array.from(
      { length: 100 },
      (_, i) => `line ${i} ${'chat '.repeat(40)}`,
    ).join('\n'),
    0,
    0,
  );
  const render = text.render.bind(text);
  text.render = (width) => {
    widths.push(width);
    return render(width);
  };
  const transcript = new ScrollView(text, { primary: true, follow: 'end' });
  const editor = {
    render: () => ['EDITOR'],
    invalidate() {},
    handleInput() {},
    focused: false,
  };
  const root = new VStack([
    { component: transcript, basis: 0, grow: 1 },
    { component: editor },
  ]);
  const tui = new TuiAltScreen(terminal, false, undefined, { mouse: true });
  tui.addChild(editor);
  tui.setLayoutRoot(root);
  tui.setFocus(editor);
  const proxy = createInteractiveTuiReference(() => tui);
  return { tui, proxy, terminal, root, transcript, editor, text, widths };
}

export function inline() {
  const terminal = new MockTerminal();
  terminal.rows = 6;
  const tui = new TuiMainScreen(terminal);
  // Render synchronously through the public API; avoid queued renders/timers.
  tui.requestRender = () => {};
  const widths: number[] = [];
  let count = 4;
  const editor = {
    focused: false,
    render: (width: number) => {
      widths.push(width);
      return Array.from(
        { length: count },
        (_, i) => `M${i} ${'x'.repeat(width - 4)}`,
      );
    },
    invalidate() {},
    handleInput() {},
  };
  tui.addChild(editor);
  tui.setFocus(editor);
  const proxy = createInteractiveTuiReference(() => tui);
  return {
    tui,
    proxy,
    terminal,
    widths,
    editor,
    grow: (n: number) => {
      count = n;
    },
  };
}
