import {
  type Component,
  HStack,
  isViewportTUI,
  type TUI,
  type ViewportTUI,
} from '@earendil-works/pi-tui';
import {
  diagnosticOnce,
  type LayoutAdapter,
  type LayoutDiagnostic,
  observeDisplay,
  readOnlySidebar,
  sidebarWidth,
} from './adapter.js';

import { concreteRenderer } from './renderer.js';

type LayoutOwner = ViewportTUI & { layoutRoot: Component };
function layoutOwner(tui: TUI): LayoutOwner | undefined {
  if (
    !isViewportTUI(tui) ||
    tui.mode !== 'fullscreen' ||
    typeof tui.setLayoutRoot !== 'function'
  )
    return undefined;
  const root: unknown = (tui as TUI & { layoutRoot?: unknown }).layoutRoot;
  if (
    !root ||
    typeof root !== 'object' ||
    !('render' in root) ||
    typeof root.render !== 'function' ||
    !('invalidate' in root) ||
    typeof root.invalidate !== 'function'
  )
    return undefined;
  return tui as LayoutOwner;
}

export function createFullscreenAdapter(
  tui: TUI,
  diagnostic: LayoutDiagnostic,
  onDisplayChange: () => void = () => {},
): LayoutAdapter {
  const report = diagnosticOnce(diagnostic);
  const token = Symbol('sidebar-layout-owner');
  let owner: LayoutOwner | undefined;
  let original: Component | undefined;
  let split: (HStack & { ownerToken?: symbol }) | undefined;
  let sidebar: Component | undefined;
  let width = 44;
  let visible = true;
  let disposed = false;
  const ownsRoot = () => {
    try {
      return (
        !!owner &&
        layoutOwner(owner)?.layoutRoot === split &&
        split?.ownerToken === token
      );
    } catch {
      // Private root access can disappear after a foreign renderer takeover.
      return false;
    }
  };
  const isDisplayed = observeDisplay(
    () =>
      !disposed &&
      visible &&
      ownsRoot() &&
      (owner?.terminal.columns ?? 0) >= 64 + width,
    onDisplayChange,
  );
  const updateEntries = () => {
    if (!split || !original || !sidebar) return;
    split.clear();
    split.addChild(original, { basis: 0, grow: 1, minSize: 64 });
    split.addChild(sidebar, {
      basis: width,
      shrink: 0,
      visible: (viewport) => viewport.width >= 64 + width,
    });
  };
  return {
    isDisplayed,
    mount(component, requestedWidth) {
      if (disposed || split) return false;
      try {
        // Validate before asking the supported reference for its receiver.
        owner = layoutOwner(tui)
          ? layoutOwner(concreteRenderer(tui))
          : undefined;
        if (!owner) {
          report('Sidebar disabled: unsupported fullscreen layout root.');
          return false;
        }
        original = owner.layoutRoot;
        sidebar = readOnlySidebar(component);
        width = sidebarWidth(requestedWidth);
        split = new HStack();
        split.ownerToken = token;
        const render = split.render.bind(split);
        split.render = (renderWidth) => {
          isDisplayed();
          return render(renderWidth);
        };
        updateEntries();
        if (visible) owner.setLayoutRoot(split);
        isDisplayed();
        return true;
      } catch {
        report('Sidebar disabled: unsupported fullscreen layout root.');
        return false;
      }
    },
    setWidth(requestedWidth) {
      if (disposed) return;
      width = sidebarWidth(requestedWidth);
      updateEntries();
      isDisplayed();
      if (ownsRoot()) owner?.requestRender();
    },
    setVisible(nextVisible) {
      if (disposed) return;
      if (visible !== nextVisible) {
        visible = nextVisible;
        if (owner && original && split) {
          if (!visible && ownsRoot()) owner.setLayoutRoot(original);
          else if (visible && owner.layoutRoot === original)
            owner.setLayoutRoot(split);
        }
      }
      isDisplayed();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (ownsRoot()) owner?.setLayoutRoot(original);
      isDisplayed();
    },
  };
}
