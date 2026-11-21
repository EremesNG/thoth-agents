import type { Component, TUI } from '@earendil-works/pi-tui';
import { editorSlotSupportsDecorativeOverlays } from './editor-slot.js';
import {
  guardedTuiRead,
  readTuiOverlays,
  readVisibleTuiOverlays,
  tuiMethod,
  UNKNOWN_TUI,
} from './tui-read.js';
import { workPanelRegistry } from './work-panel-state.js';

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

/** Undefined means the caller must disable its decorative overlay, not mount it. */
export function registerDecorativeOverlay(
  tui: TUI,
  component: Component,
): (() => void) | undefined {
  try {
    if (
      readTuiOverlays(tui) === UNKNOWN_TUI ||
      !editorSlotSupportsDecorativeOverlays(tui)
    )
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
export function readBlockingOverlay(tui: TUI, entries = readTuiOverlays(tui)) {
  return guardedTuiRead<boolean>(() => {
    const visible = readVisibleTuiOverlays(tui, entries);
    if (visible === UNKNOWN_TUI) return UNKNOWN_TUI;
    return visible.some(
      (entry) => !decorations(tui).components.has(entry.component),
    );
  });
}

export function hasBlockingOverlay(tui: TUI): boolean {
  const entries = readTuiOverlays(tui);
  if (entries !== UNKNOWN_TUI)
    return readBlockingOverlay(tui, entries) !== false;
  // Compatibility for public-only runtimes; editor-input eligibility uses the
  // strict snapshot above and does not infer focus eligibility from this fallback.
  const hasOverlay = tuiMethod(tui, 'hasOverlay');
  return (
    hasOverlay === UNKNOWN_TUI ||
    guardedTuiRead(() => hasOverlay.call(tui)) !== false
  );
}
