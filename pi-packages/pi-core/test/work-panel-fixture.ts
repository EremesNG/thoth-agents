// biome-ignore-all lint/suspicious/noExplicitAny: Pi boundary fixture also models missing hooks and foreign UIs.
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { vi } from 'vitest';
import { WORK_PANEL_VERSION, type WorkPanelProvider } from '../src/index.js';

// Pi is the system boundary: drive the real registered widget and input listener.
export function uiSession() {
  let editorFactory: any;
  let editor: any;
  let focused: any;
  let overlay = false;
  let text = '';
  let widget: any;
  let customComponent: any;
  let finishCustom: (() => void) | undefined;
  const listeners = new Set<(data: string) => any>();
  const tui = {
    terminal: { rows: 40, columns: 120 },
    requestRender: vi.fn(),
    getFocusedComponent: () => focused,
    hasOverlay: () => overlay,
  };
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
    }),
    onTerminalInput: vi.fn((handler: (data: string) => any) => {
      listeners.add(handler);
      return vi.fn(() => listeners.delete(handler));
    }),
    notify: vi.fn(),
    custom: vi.fn(
      (factory: any, _options?: any) =>
        new Promise<void>((resolve) => {
          const done = () => {
            overlay = false;
            focused = editor;
            resolve();
          };
          customComponent = factory(tui, theme, {}, done);
          overlay = true;
          focused = customComponent;
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
