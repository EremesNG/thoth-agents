import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Component, OverlayHandle, TUI } from '@earendil-works/pi-tui';
import { editorSlotFocusTarget } from './editor-slot.js';

type CustomFactory = Parameters<ExtensionContext['ui']['custom']>[0];
type FactoryArgs = Parameters<CustomFactory>;

export type OwnedOverlayFactory<T> = (
  tui: FactoryArgs[0],
  theme: FactoryArgs[1],
  keybindings: FactoryArgs[2],
  close: (result: T) => void,
) => ReturnType<CustomFactory>;

export type OwnedOverlayOptions = Omit<
  NonNullable<Parameters<ExtensionContext['ui']['custom']>[1]>,
  'overlay'
>;

type OverlayEntry = {
  component: Component;
  preFocus: Component | null;
  hidden?: boolean;
};

const handlesKey = Symbol.for('thoth.pi-core.owned-overlay-handles');
const shared = globalThis as typeof globalThis & { [handlesKey]?: unknown };
function ownedHandles():
  | WeakMap<TUI, Map<Component, OverlayHandle>>
  | undefined {
  try {
    shared[handlesKey] ??= { version: 1, tuis: new WeakMap() };
    const value = shared[handlesKey] as {
      version?: unknown;
      tuis?: unknown;
    } | null;
    if (value?.version === 1 && value.tuis instanceof WeakMap)
      return value.tuis;
  } catch {
    // Incompatible bundled owners are left untouched.
  }
  return undefined;
}

function isComponent(value: unknown): value is Component {
  return (
    typeof value === 'object' &&
    value !== null &&
    'render' in value &&
    typeof value.render === 'function' &&
    'invalidate' in value &&
    typeof value.invalidate === 'function'
  );
}

/**
 * pi-tui 1.0.2 keeps overlays outside `children`. Read its private stack only
 * here, so unavailable/changed internals disable repair rather than steal focus.
 */
function readTuiFocus(tui: TUI): {
  focused?: Component;
  overlays?: OverlayEntry[];
} {
  try {
    const runtime = tui as TUI & {
      getFocusedComponent?(): unknown;
      focusedComponent?: unknown;
      overlayStack?: unknown;
    };
    const value = runtime.getFocusedComponent
      ? runtime.getFocusedComponent()
      : runtime.focusedComponent;
    const focused = isComponent(value) ? value : undefined;
    const stack = runtime.overlayStack;
    if (
      !Array.isArray(stack) ||
      !stack.every(
        (entry) =>
          typeof entry === 'object' &&
          entry !== null &&
          isComponent(entry.component) &&
          (entry.preFocus === null || isComponent(entry.preFocus)),
      )
    )
      return { focused };
    return { focused, overlays: stack };
  } catch {
    return {};
  }
}

function children(component: Component): Component[] {
  const value = (component as Component & { children?: Component[] }).children;
  return Array.isArray(value) ? value : [];
}

function parentOf(root: Component, target: Component): Component | undefined {
  for (const child of children(root)) {
    if (child === target) return root;
    const parent = parentOf(child, target);
    if (parent) return parent;
  }
  return undefined;
}

// Component-local metadata crosses independently bundled pi-core copies without
// a registry. The SDK replaces the editor inside this same retained container.
const EDITOR_SLOT = Symbol.for('thoth.pi-core.owned-overlay.v1');

function editorSlotAtOpen(tui: TUI): Component | undefined {
  const { focused, overlays } = readTuiFocus(tui);
  const visited = new Set<Component>();
  let current: Component | null = focused ?? null;
  while (current && !visited.has(current)) {
    visited.add(current);
    const parent = parentOf(tui, current);
    if (parent) return parent;
    const overlay = overlays?.find(({ component }) => component === current);
    if (!overlay) return undefined;
    try {
      const metadata = (current as Component & { [EDITOR_SLOT]?: unknown })[
        EDITOR_SLOT
      ];
      if (
        typeof metadata === 'object' &&
        metadata !== null &&
        'version' in metadata &&
        metadata.version === 1 &&
        'tui' in metadata &&
        metadata.tui === tui &&
        'editorSlot' in metadata &&
        isComponent(metadata.editorSlot) &&
        parentOf(tui, metadata.editorSlot)
      )
        return metadata.editorSlot;
    } catch {
      return undefined;
    }
    current = overlay.preFocus;
  }
  return undefined;
}

function retainEditorSlot(
  component: Component,
  tui: TUI,
  editorSlot: Component | undefined,
): void {
  if (!editorSlot) return;
  try {
    Object.defineProperty(component, EDITOR_SLOT, {
      configurable: true,
      value: { version: 1, tui, editorSlot },
    });
  } catch {
    // Frozen components still open/settle safely, but cannot pass on slot metadata.
  }
}

function visible(tui: TUI, entry: OverlayEntry): boolean {
  const runtime = tui as TUI & {
    isOverlayVisible?(entry: OverlayEntry): boolean;
  };
  return runtime.isOverlayVisible?.(entry) ?? entry.hidden !== true;
}

/** An explicit unfocus disables SDK 1.0.2's eligible/blocked next-key recapture. */
export function acquireEditorSlotFocus(tui: TUI, target: Component): void {
  const handles = ownedHandles()?.get(tui);
  for (const entry of (readTuiFocus(tui).overlays ?? []).slice().reverse()) {
    if (visible(tui, entry)) handles?.get(entry.component)?.unfocus({ target });
  }
  // In the blocked branch unfocus only changes the resume target, not focus itself.
  tui.setFocus?.(target);
}

export function focusedForeignOverlay(tui: TUI): Component | undefined {
  const { focused, overlays } = readTuiFocus(tui);
  return focused &&
    overlays?.some(
      (entry) =>
        visible(tui, entry) &&
        (entry.component === focused || parentOf(entry.component, focused)),
    )
    ? focused
    : undefined;
}

/** SDK factory teardown itself focuses the editor; preserve a visible foreign owner. */
export function preservingOverlayFocus(tui: TUI, action: () => void): void {
  const focused = focusedForeignOverlay(tui);
  try {
    action();
  } finally {
    if (
      focused &&
      readTuiFocus(tui).overlays?.some(
        (entry) =>
          visible(tui, entry) &&
          (entry.component === focused || parentOf(entry.component, focused)),
      )
    )
      tui.setFocus(focused);
  }
}

function repairFocus(tui: TUI, editorSlot: Component | undefined): void {
  const { focused, overlays } = readTuiFocus(tui);
  if (
    !focused ||
    !overlays ||
    !editorSlot ||
    focused === tui ||
    parentOf(tui, focused) ||
    overlays.some(
      ({ component }) => component === focused || parentOf(component, focused),
    )
  )
    return;
  const target = editorSlotFocusTarget(tui);
  if (target) {
    acquireEditorSlotFocus(tui, target);
    return;
  }
  const candidates = children(editorSlot).filter(
    (component) => typeof component.handleInput === 'function',
  );
  if (candidates.length !== 1 || !parentOf(tui, editorSlot)) return;
  tui.setFocus(candidates[0]);
}

/** Open a custom overlay whose completion removes only its own handle. */
export function openOwnedOverlay<T>(
  ctx: Pick<ExtensionContext, 'ui'>,
  factory: OwnedOverlayFactory<T>,
  options?: OwnedOverlayOptions,
): Promise<T> {
  let handle: OverlayHandle | undefined;
  let closed = false;
  let hidden = false;
  let liveTui: TUI | undefined;
  let liveComponent: Component | undefined;
  let hideOwned = () => {};
  return ctx.ui.custom<T>(
    (tui, theme, keybindings, done) => {
      liveTui = tui;
      const editorSlot = editorSlotAtOpen(tui);
      hideOwned = () => {
        if (!handle || hidden) return;
        hidden = true;
        if (liveComponent) ownedHandles()?.get(tui)?.delete(liveComponent);
        try {
          handle.hide();
        } finally {
          repairFocus(tui, editorSlot);
        }
      };
      const created = factory(tui, theme, keybindings, (result) => {
        if (closed) return;
        closed = true;
        // coding-agent 1.0.2's done pops the top overlay. Scope the redirect to
        // this synchronous call; absent/late handles must never pop a foreign UI.
        const originalHide = tui.hideOverlay;
        tui.hideOverlay = hideOwned;
        try {
          done(result);
        } finally {
          tui.hideOverlay = originalHide;
          hideOwned();
        }
      });
      const retain = (component: Component & { dispose?(): void }) => {
        liveComponent = component;
        retainEditorSlot(component, tui, editorSlot);
        return component;
      };
      return isComponent(created) ? retain(created) : created.then(retain);
    },
    {
      ...options,
      overlay: true,
      onHandle(ownedHandle) {
        handle = ownedHandle;
        if (liveTui && liveComponent) {
          const registry = ownedHandles();
          if (registry) {
            let handles = registry.get(liveTui);
            if (!handles) {
              handles = new Map();
              registry.set(liveTui, handles);
            }
            handles.set(liveComponent, ownedHandle);
          }
        }
        if (closed) hideOwned();
        options?.onHandle?.(handle);
      },
    },
  );
}
