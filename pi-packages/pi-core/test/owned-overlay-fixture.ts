import {
  type ExtensionContext,
  InteractiveMode,
} from '@earendil-works/pi-coding-agent';
import {
  Container,
  type Terminal,
  TuiMainScreen,
} from '@earendil-works/pi-tui';
import { vi } from 'vitest';

type Custom = ExtensionContext['ui']['custom'];
type EditorFactory = Parameters<
  ExtensionContext['ui']['setEditorComponent']
>[0];
type SdkMode = {
  showExtensionCustom: Custom;
  setCustomEditorComponent(factory: EditorFactory): void;
  editorComponentFactory?: EditorFactory;
};

export function inputComponent(label: string) {
  let text = '';
  return {
    focused: false,
    render: () => [label],
    invalidate() {},
    handleInput: vi.fn(),
    getText: () => text,
    setText(value: string) {
      text = value;
    },
  };
}

/** Real SDK UI methods, without constructing the unrelated agent runtime. */
export function ownedOverlaySession(options: { introspection?: boolean } = {}) {
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
  const editor = inputComponent('Editor');
  const editorContainer = new Container();
  editorContainer.addChild(editor);
  tui.addChild(editorContainer);
  tui.setFocus(editor);
  // A public-only facade models an SDK runtime without inspectable internals.
  const uiTui =
    options.introspection === false
      ? {
          children: tui.children,
          terminal,
          getFocusedComponent: () => tui.getFocusedComponent(),
          setFocus: tui.setFocus.bind(tui),
          showOverlay: tui.showOverlay.bind(tui),
          hideOverlay: tui.hideOverlay.bind(tui),
          requestRender: tui.requestRender.bind(tui),
        }
      : tui;
  const mode = Object.assign(Object.create(InteractiveMode.prototype), {
    ui: uiTui,
    editor,
    defaultEditor: editor,
    editorContainer,
    keybindings: {},
  }) as SdkMode;
  const completions = vi.fn();
  const custom: Custom = (factory, options) =>
    mode.showExtensionCustom(
      (tui, theme, keys, done) =>
        factory(tui, theme, keys, (result) => {
          completions(result);
          done(result);
        }),
      options,
    );
  const ctx = {
    ui: {
      custom,
      setEditorComponent: (factory: EditorFactory) =>
        mode.setCustomEditorComponent(factory),
      getEditorComponent: () => mode.editorComponentFactory,
    },
  } as unknown as ExtensionContext;
  tui.start();
  return {
    ctx,
    tui,
    editor,
    editorContainer,
    completions,
    input: (data: string) => input(data),
  };
}
