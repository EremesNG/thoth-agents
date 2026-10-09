import {
  type Component,
  type OverlayHandle,
  type OverlayOptions,
  type TUI,
  TuiMainScreen,
  truncateToWidth,
} from '@earendil-works/pi-tui';
import { registerDecorativeOverlay } from '@thoth-agents/pi-core';
import {
  diagnosticOnce,
  type LayoutAdapter,
  type LayoutDiagnostic,
  observeDisplay,
  readOnlySidebar,
  sidebarWidth,
} from './adapter.js';
import { concreteRenderer } from './renderer.js';

export function createInlineAdapter(
  tui: TUI,
  diagnostic: LayoutDiagnostic,
  onDisplayChange: () => void = () => {},
): LayoutAdapter {
  const report = diagnosticOnce(diagnostic);
  let renderer: TUI | undefined;
  let original: PropertyDescriptor | undefined;
  let patch: Component['render'] | undefined;
  let overlay: OverlayHandle | undefined;
  let sidebar: Component | undefined;
  const registrations: Array<() => void> = [];
  let width = 44;
  let visible = true;
  let disposed = false;
  const options: OverlayOptions = {
    anchor: 'top-right',
    width,
    maxHeight: '100%',
    margin: 0,
    nonCapturing: true,
    visible: () => isDisplayed(),
  };
  const restore = () => {
    const handle = overlay;
    overlay = undefined;
    handle?.hide();
    if (renderer && patch && renderer.render === patch) {
      if (original) Object.defineProperty(renderer, 'render', original);
      else Reflect.deleteProperty(renderer, 'render');
      renderer.requestRender();
    }
    for (const unregister of registrations.splice(0).reverse()) unregister();
  };
  const isDisplayed = observeDisplay(() => {
    if (renderer && patch && renderer.render !== patch) restore();
    if (
      disposed ||
      !visible ||
      !renderer ||
      !patch ||
      renderer.render !== patch ||
      !overlay ||
      overlay.isHidden() ||
      registrations.length === 0 ||
      renderer.terminal.columns < 64 + width
    )
      return false;
    // The handle's isHidden() does not detect removal from the overlay stack.
    // Guard this private seam just as decorative-overlay registration does.
    const stack: unknown = (renderer as TUI & { overlayStack?: unknown })
      .overlayStack;
    return (
      Array.isArray(stack) &&
      stack.some(
        (entry) =>
          entry?.component === sidebar &&
          entry.options === options &&
          entry.hidden === false,
      )
    );
  }, onDisplayChange);
  return {
    isDisplayed,
    mount(component, requestedWidth) {
      if (disposed || patch) return false;
      try {
        if (!(tui instanceof TuiMainScreen) || tui.mode !== 'regular')
          throw new Error('Unsupported renderer');
        renderer = concreteRenderer(tui);
        if (
          !(renderer instanceof TuiMainScreen) ||
          typeof renderer.render !== 'function'
        )
          throw new Error('Unsupported renderer proxy');
        original = Object.getOwnPropertyDescriptor(renderer, 'render');
        if (original && (!('value' in original) || !original.writable))
          throw new Error('Unpatchable renderer');
        width = sidebarWidth(requestedWidth);
        options.width = width;
        sidebar = {
          ...readOnlySidebar(component),
          render(renderWidth) {
            const rows = renderer?.terminal.rows ?? 0;
            const lines = component.render(renderWidth);
            return Array.from({ length: rows }, (_, row) =>
              truncateToWidth(lines[row] ?? '', renderWidth),
            );
          },
        };
        // Register both the extension's stable reference and the concrete TUI:
        // input guards may receive either identity. Both must accept ownership.
        for (const target of new Set([tui, renderer])) {
          const unregister = registerDecorativeOverlay(target, sidebar);
          if (!unregister)
            throw new Error('Decorative overlay registration refused');
          registrations.push(unregister);
        }
        patch = function (this: TUI, renderWidth: number) {
          return TuiMainScreen.prototype.render.call(
            this,
            isDisplayed() ? renderWidth - width : renderWidth,
          );
        };
        tui.render = patch;
        if (renderer.render !== patch)
          throw new Error('Renderer proxy did not forward render assignment');
        overlay = renderer.showOverlay(sidebar, options);
        isDisplayed();
        return true;
      } catch {
        restore();
        report(
          'Sidebar disabled: unsupported regular renderer or decorative overlay owner.',
        );
        return false;
      }
    },
    setWidth(requestedWidth) {
      if (disposed) return;
      width = sidebarWidth(requestedWidth);
      options.width = width;
      isDisplayed();
      if (overlay) renderer?.requestRender();
    },
    setVisible(nextVisible) {
      if (disposed) return;
      if (visible !== nextVisible) {
        visible = nextVisible;
        overlay?.setHidden(!visible);
        if (overlay) renderer?.requestRender();
      }
      isDisplayed();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      restore();
      isDisplayed();
    },
  };
}
