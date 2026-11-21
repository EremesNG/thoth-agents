import type { Component, TUI } from '@earendil-works/pi-tui';

export const UNKNOWN_TUI = Symbol('unknown TUI state');
type UnknownTui = typeof UNKNOWN_TUI;

// Covers pi-core's introspection and focus repairs, not native SDK focus side
// effects of installing/removing an editor factory or opening/hiding an overlay.
export function guardedTuiRead<T>(read: () => T | UnknownTui): T | UnknownTui {
  try {
    return read();
  } catch {
    return UNKNOWN_TUI;
  }
}

type RuntimeMethod = (this: object, ...args: unknown[]) => unknown;
export function tuiMethod(receiver: object, key: PropertyKey) {
  return guardedTuiRead<RuntimeMethod>(() => {
    const value: unknown = Reflect.get(receiver, key);
    return typeof value === 'function' ? (value as RuntimeMethod) : UNKNOWN_TUI;
  });
}

export function isTuiComponent(value: unknown): value is Component {
  return (
    typeof value === 'object' &&
    value !== null &&
    'render' in value &&
    typeof value.render === 'function' &&
    'invalidate' in value &&
    typeof value.invalidate === 'function'
  );
}

export function readTuiFocus(tui: TUI) {
  return guardedTuiRead<Component | null>(() => {
    const method: unknown = Reflect.get(tui, 'getFocusedComponent');
    let value: unknown;
    if (typeof method === 'function') value = Reflect.apply(method, tui, []);
    else {
      if (method !== undefined || !Reflect.has(tui, 'focusedComponent'))
        return UNKNOWN_TUI;
      value = Reflect.get(tui, 'focusedComponent');
    }
    return value == null ? null : isTuiComponent(value) ? value : UNKNOWN_TUI;
  });
}

interface OverlayEntry {
  source: object;
  component: Component;
  preFocus: Component | null;
}

/** Snapshot all fields used by us or Pi's visibility predicate. */
export function readTuiOverlays(tui: TUI) {
  return guardedTuiRead<OverlayEntry[]>(() => {
    const stack: unknown = Reflect.get(tui, 'overlayStack');
    if (!Array.isArray(stack)) return UNKNOWN_TUI;
    const entries: OverlayEntry[] = [];
    for (const source of stack) {
      if (typeof source !== 'object' || source === null) return UNKNOWN_TUI;
      const { component, preFocus, hidden, options } = source;
      if (
        !isTuiComponent(component) ||
        (preFocus !== null && !isTuiComponent(preFocus)) ||
        typeof hidden !== 'boolean'
      )
        return UNKNOWN_TUI;
      if (options !== undefined) {
        if (typeof options !== 'object' || options === null) return UNKNOWN_TUI;
        const visible: unknown = options.visible;
        if (visible !== undefined && typeof visible !== 'function')
          return UNKNOWN_TUI;
      }
      entries.push({ source, component, preFocus });
    }
    return entries;
  });
}

export function readVisibleTuiOverlays(
  tui: TUI,
  entries = readTuiOverlays(tui),
) {
  if (entries === UNKNOWN_TUI || !entries.length) return entries;
  const isVisible = tuiMethod(tui, 'isOverlayVisible');
  if (isVisible === UNKNOWN_TUI) return UNKNOWN_TUI;
  return guardedTuiRead<OverlayEntry[]>(() => {
    const visible: OverlayEntry[] = [];
    for (const entry of entries) {
      const value = isVisible.call(tui, entry.source);
      if (typeof value !== 'boolean') return UNKNOWN_TUI;
      if (value) visible.push(entry);
    }
    return visible;
  });
}

export function readTuiChildren(component: Component, required = false) {
  return guardedTuiRead<Component[]>(() => {
    // An absent children property is valid on a leaf, not on a container.
    if (!Reflect.has(component, 'children'))
      return required || Reflect.has(component, 'addChild') ? UNKNOWN_TUI : [];
    const value: unknown = Reflect.get(component, 'children');
    if (!Array.isArray(value)) return UNKNOWN_TUI;
    const children: Component[] = [];
    for (const child of value) {
      if (!isTuiComponent(child)) return UNKNOWN_TUI;
      children.push(child);
    }
    return children;
  });
}

export function readTuiParent(
  root: Component,
  target: Component,
  required = false,
): Component | undefined | UnknownTui {
  const seen = new Set<Component>();
  const pending = [root];
  for (;;) {
    const parent = pending.pop();
    if (!parent) return undefined;
    if (seen.has(parent)) return UNKNOWN_TUI;
    seen.add(parent);
    const children = readTuiChildren(parent, parent === root && required);
    if (children === UNKNOWN_TUI) return UNKNOWN_TUI;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child === target) return parent;
      pending.push(child);
    }
  }
}

export function readTerminalDimension(
  tui: TUI | undefined,
  key: 'rows' | 'columns',
) {
  return guardedTuiRead<number>(() => {
    const value = tui?.terminal[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : UNKNOWN_TUI;
  });
}
