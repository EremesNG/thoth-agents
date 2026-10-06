// biome-ignore-all lint/suspicious/noExplicitAny: Pi boundary fixture also models missing hooks and foreign UIs.
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { TuiMainScreen } from '@earendil-works/pi-tui';
import { vi } from 'vitest';
import { WORK_PANEL_VERSION, type WorkPanelProvider } from '../src/index.js';

// Pi is the system boundary: drive the real registered widget and input listener.
export function uiSession(realTui?: TuiMainScreen) {
  let editorFactory: any;
  let editor: any;
  let focused: any;
  let overlay = false;
  let text = '';
  let widget: any;
  let customComponent: any;
  let finishCustom: (() => void) | undefined;
  const listeners = new Set<(data: string) => any>();
  const mockTui = {
    terminal: { rows: 40, columns: 120 },
    requestRender: vi.fn(),
    getFocusedComponent: () => focused,
    hasOverlay: () => overlay,
    hideOverlay: () => {
      overlay = false;
      focused = editor;
    },
  };
  const tui = realTui ? (realTui as unknown as typeof mockTui) : mockTui;
  const theme = { fg: (_role: string, value: string) => value };
  const baseFactory = vi.fn(() => ({
    render: () => [],
    invalidate() {},
    handleInput() {},
  }));
  editorFactory = baseFactory;
  const setWidget = vi.fn((_key: string, factory: any, _options?: any) => {
    widget?.dispose?.();
    widget = factory?.(tui, theme);
  });
  const ui = {
    theme,
    setWidget,
    setStatus: vi.fn(),
    getEditorText: () => text,
    getEditorComponent: () => editorFactory,
    setEditorComponent: vi.fn((factory: any) => {
      editorFactory = factory;
      editor = factory?.(tui, theme, {});
      focused = editor;
      if (realTui && editor) {
        realTui.addChild(editor);
        realTui.setFocus(editor);
      }
    }),
    onTerminalInput: vi.fn((handler: (data: string) => any) => {
      listeners.add(handler);
      const remove = realTui?.addInputListener(handler);
      return vi.fn(() => {
        listeners.delete(handler);
        remove?.();
      });
    }),
    notify: vi.fn(),
    custom: vi.fn(
      (factory: any, options?: any) =>
        new Promise<void>((resolve) => {
          let closed = false;
          let component: any;
          const done = () => {
            if (closed) return;
            closed = true;
            // coding-agent 1.0.2 closes overlays by popping the top, not by handle.
            if (realTui) realTui.hideOverlay();
            else {
              overlay = false;
              focused = editor;
            }
            resolve();
            component?.dispose?.();
          };
          component = factory(tui, theme, {}, done);
          customComponent = component;
          if (realTui) {
            Promise.resolve(component).then((component) => {
              if (closed) return;
              if (options?.overlay) {
                const handle = realTui.showOverlay(
                  component,
                  typeof options.overlayOptions === 'function'
                    ? options.overlayOptions()
                    : options.overlayOptions,
                );
                options.onHandle?.(handle);
              } else {
                realTui.addChild(component);
                realTui.setFocus(component);
                realTui.requestRender();
              }
            });
          } else {
            overlay = true;
            focused = customComponent;
            options?.onHandle?.({
              hide: () => {
                overlay = false;
                focused = editor;
              },
            });
          }
          finishCustom = done;
        }),
    ),
  };
  const ctx = {
    ui,
    hasUI: true,
    mode: 'tui',
    sessionManager: { getSessionId: () => 'test-session' },
  } as unknown as ExtensionContext;
  return {
    ctx,
    ui,
    tui,
    baseFactory,
    render: (width = 100) => widget?.render(width) ?? [],
    key: (data: string) => [...listeners][0]?.(data),
    setText: (value: string) => {
      text = value;
    },
    setOverlay: (value: boolean) => {
      overlay = value;
    },
    focusEditor: () => {
      focused = editor;
    },
    focusOther: () => {
      focused = {};
    },
    listenerCount: () => listeners.size,
    closeCustom: () => finishCustom?.(),
    get customComponent() {
      return customComponent;
    },
    customKey: (data: string) => customComponent?.handleInput(data),
    customRender: (width = 100) => customComponent?.render(width) ?? [],
  };
}

export function provider(
  id = 'agents',
  label = 'Agents',
  priority = 10,
): WorkPanelProvider {
  return {
    version: WORK_PANEL_VERSION,
    id,
    label,
    priority,
    visibleCount: () => 1,
    listRows: () => [
      { id: `${id}-1`, primary: `${label} item`, status: 'running' },
    ],
    detail: () => null,
    armCloseLabel: () => 'cancel',
    close: vi.fn(() => ({ action: 'cancel', providerId: id, id: `${id}-1` })),
  };
}
