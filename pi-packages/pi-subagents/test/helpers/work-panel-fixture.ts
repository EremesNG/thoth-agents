// biome-ignore-all lint/suspicious/noExplicitAny: SDK boundary models editor factories and foreign custom UI.
import { vi } from 'vitest';

/** Pi UI boundary: drive the real shared widget/listener and custom panel. */
export function workPanelSession(cwd: string, sessionId = 'work-session') {
  let widget: any;
  let component: any;
  let editor: any;
  let focused: any;
  let overlay = false;
  let text = '';
  let factory: any = () => ({
    handleInput: vi.fn(),
    render: () => [],
    invalidate() {},
  });
  const listeners = new Set<(data: string) => any>();
  const tui = {
    mode: 'fullscreen',
    terminal: { rows: 40 },
    requestRender: vi.fn(),
    getFocusedComponent: () => focused,
    hasOverlay: () => overlay,
  };
  const theme = { fg: (_role: string, value: string) => value };
  const ui = {
    setWidget: vi.fn((_key: string, next: any) => {
      widget = next?.(tui, theme);
    }),
    setStatus: vi.fn(),
    notify: vi.fn(),
    getEditorText: () => text,
    getEditorComponent: () => factory,
    setEditorComponent: vi.fn((next: any) => {
      factory = next;
      editor = next?.(tui, theme, {});
      focused = editor;
    }),
    onTerminalInput: vi.fn((listener: (data: string) => any) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    custom: vi.fn(
      (create: any, _options?: any) =>
        new Promise<void>((resolve) => {
          const done = () => {
            focused = editor;
            overlay = false;
            resolve();
          };
          component = create(tui, theme, {}, done);
          focused = component;
          overlay = true;
        }),
    ),
  };
  return {
    theme,
    ctx: {
      cwd,
      hasUI: true,
      mode: 'tui',
      sessionManager: { getSessionId: () => sessionId },
      ui,
    },
    ui,
    tui,
    render: (width = 100) => widget?.render(width) ?? [],
    key: (data: string) => {
      for (const listener of listeners) {
        const result = listener(data);
        if (result?.consume) return result;
      }
      focused?.handleInput?.(data);
      return undefined;
    },
    panelRender: (width = 160) => component?.render(width) ?? [],
    focusEditor: () => {
      focused = editor;
    },
    focusOther: () => {
      focused = { handleInput: vi.fn() };
    },
    focusPanel: () => {
      focused = component;
      overlay = true;
    },
    setOverlay: (value: boolean) => {
      overlay = value;
    },
    setText: (value: string) => {
      text = value;
    },
    listenerCount: () => listeners.size,
  };
}
