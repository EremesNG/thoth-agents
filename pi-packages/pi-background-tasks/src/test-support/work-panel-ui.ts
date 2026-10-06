import type { Component } from "@earendil-works/pi-tui";

// Pi UI is the system boundary; tests drive the real pi-core host and provider.
export function workPanelUI() {
  const widgets = new Map<string, unknown>();
  const statuses = new Map<string, unknown>();
  const uiCalls: unknown[] = [];
  const listeners = new Set<(data: string) => { consume?: boolean } | undefined>();
  let editorFactory: any;
  let editor: Component | undefined;
  let focused: unknown;
  let overlay = false;
  let text = "";
  let detail: Component | undefined;
  let finishDetail: (() => void) | undefined;
  const tui = {
    terminal: { rows: 50 },
    requestRender() {},
    getFocusedComponent: () => focused,
    hasOverlay: () => overlay,
  };
  const ui = {
    theme: { fg: (_role: string, value: string) => value },
    setStatus(key: string, value: unknown) { statuses.set(key, value); uiCalls.push([key, value]); },
    setWidget(key: string, value: unknown) { widgets.set(key, value); uiCalls.push([key, value]); },
    getEditorText: () => text,
    getEditorComponent: () => editorFactory,
    setEditorComponent(factory: any) {
      editorFactory = factory;
      editor = factory?.(tui, ui.theme, { matches: () => false });
      focused = editor;
      uiCalls.push(factory);
    },
    onTerminalInput(handler: (data: string) => { consume?: boolean } | undefined) {
      listeners.add(handler);
      return () => { listeners.delete(handler); };
    },
    custom(factory: any) {
      return new Promise<void>((resolve) => {
        const done = () => { overlay = false; focused = editor; resolve(); };
        detail = factory(tui, ui.theme, {}, done);
        focused = detail;
        overlay = true;
        finishDetail = done;
      });
    },
  };
  const renderWidget = (key: string, width = 120) => {
    const factory = widgets.get(key);
    return typeof factory === "function" ? factory(tui, ui.theme).render(width) as string[] : [];
  };
  return {
    ui, widgets, statuses, uiCalls,
    get editor() { return editorFactory; },
    render: (width = 120) => renderWidget("thoth-work-panel", width),
    key: (data: string) => [...listeners][0]?.(data),
    listenerCount: () => listeners.size,
    setText(value: string) { text = value; },
    setOverlay(value: boolean) { overlay = value; },
    detailRender: (width = 120) => detail?.render(width) ?? [],
    detailKey: (data: string) => detail?.handleInput?.(data),
    closeDetail: () => finishDetail?.(),
  };
}
