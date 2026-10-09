import type { Component, OverlayOptions, TUI } from '@earendil-works/pi-tui';
import { editorSlotSupportsDecorativeOverlays } from './editor-slot.js';
import { workPanelRegistry } from './work-panel-state.js';

interface Entry {
  component: Component;
  hidden: boolean;
  options?: OverlayOptions;
}
interface Decorations {
  components: WeakSet<Component>;
  owners: WeakMap<Component, number>;
}
const key = Symbol.for('thoth.pi-core.decorative-overlays.v1');
const shared = globalThis as typeof globalThis & {
  [key]?: WeakMap<TUI, Decorations>;
};
function decorations(tui: TUI): Decorations {
  shared[key] ??= new WeakMap();
  const registry = shared[key];
  let state = registry.get(tui);
  if (!state) {
    state = { components: new WeakSet(), owners: new WeakMap() };
    registry.set(tui, state);
  }
  return state;
}

/** Guard only the fields used below; bounds do not exist before the first render. */
function overlayEntries(tui: TUI): Entry[] | undefined {
  const stack: unknown = (tui as TUI & { overlayStack?: unknown }).overlayStack;
  if (!Array.isArray(stack)) return undefined;
  if (
    !stack.every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        entry.component &&
        typeof entry.component.render === 'function' &&
        typeof entry.component.invalidate === 'function' &&
        typeof entry.hidden === 'boolean' &&
        (entry.options === undefined ||
          (entry.options &&
            typeof entry.options === 'object' &&
            (entry.options.visible === undefined ||
              typeof entry.options.visible === 'function'))),
    )
  )
    return undefined;
  return stack;
}

/** Undefined means the caller must disable its decorative overlay, not mount it. */
export function registerDecorativeOverlay(
  tui: TUI,
  component: Component,
): (() => void) | undefined {
  try {
    if (!overlayEntries(tui) || !editorSlotSupportsDecorativeOverlays(tui))
      return undefined;
    // An old host owns pre-feature closures even when its registry is compatible.
    if (
      [...(workPanelRegistry(false)?.hosts.values() ?? [])].some(
        (host) => !host.supportsUIPreferences,
      )
    )
      return undefined;
    const state = decorations(tui);
    state.components.add(component);
    state.owners.set(component, (state.owners.get(component) ?? 0) + 1);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const count = (state.owners.get(component) ?? 1) - 1;
      if (count) state.owners.set(component, count);
      else {
        state.owners.delete(component);
        state.components.delete(component);
      }
    };
  } catch {
    return undefined;
  }
}

/** Every visible unregistered overlay blocks, even non-capturing foreign ones. */
export function hasBlockingOverlay(tui: TUI): boolean {
  try {
    const stack = overlayEntries(tui);
    if (stack)
      return stack.some(
        (entry) =>
          !entry.hidden &&
          (!entry.options?.visible ||
            entry.options.visible(tui.terminal.columns, tui.terminal.rows)) &&
          !decorations(tui).components.has(entry.component),
      );
  } catch {
    // Private shape/accessors or a visibility callback may be unsupported.
  }
  try {
    return tui.hasOverlay?.() !== false;
  } catch {
    return true;
  }
}
