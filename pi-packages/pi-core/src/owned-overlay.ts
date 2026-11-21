import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Component, OverlayHandle, TUI } from '@earendil-works/pi-tui';
import { editorSlotFocusTarget } from './editor-slot.js';
import {
  guardedTuiRead,
  isTuiComponent,
  readTuiChildren,
  readTuiFocus,
  readTuiOverlays,
  readTuiParent,
  readVisibleTuiOverlays,
  tuiMethod,
  UNKNOWN_TUI,
} from './tui-read.js';

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

const handlesKey = Symbol.for('thoth.pi-core.owned-overlay-handles');
const sessionsKey = Symbol.for('thoth.pi-core.owned-overlay-sessions');
const shared = globalThis as typeof globalThis & {
  [handlesKey]?: unknown;
  [sessionsKey]?: unknown;
};

function ownedSessions():
  | WeakMap<ExtensionContext['ui'], Set<() => void>>
  | undefined {
  try {
    shared[sessionsKey] ??= { version: 1, sessions: new WeakMap() };
    const value = shared[sessionsKey] as {
      version?: unknown;
      sessions?: unknown;
    } | null;
    if (value?.version === 1 && value.sessions instanceof WeakMap)
      return value.sessions;
  } catch {
    // Incompatible bundled owners are left untouched.
  }
  return undefined;
}

/** The shared UI context identifies the extension session across bundled copies. */
export function settleOwnedOverlays(ctx: Pick<ExtensionContext, 'ui'>): void {
  const sessions = ownedSessions();
  const ui = ctx.ui;
  const pending = sessions?.get(ui);
  sessions?.delete(ui);
  for (const cancel of pending ?? []) cancel();
}
type HandleRegistry = WeakMap<TUI, Map<Component, OverlayHandle>>;
// Establish a known empty registry once. Do not recreate it during a focus
// decision: missing state could conceal a live owned overlay.
guardedTuiRead(() => {
  if (!(handlesKey in shared))
    shared[handlesKey] = { version: 1, tuis: new WeakMap() };
});

function ownedHandles() {
  return guardedTuiRead<HandleRegistry>(() => {
    const value = shared[handlesKey] as {
      version?: unknown;
      tuis?: unknown;
    } | null;
    const tuis = value?.version === 1 ? value.tuis : undefined;
    return tuis instanceof WeakMap ? tuis : UNKNOWN_TUI;
  });
}

function readHandleMap(tui: TUI) {
  const handles = ownedHandles();
  if (handles === UNKNOWN_TUI) return UNKNOWN_TUI;
  return guardedTuiRead<Map<Component, OverlayHandle> | undefined>(() => {
    const map: unknown = handles.get(tui);
    return map === undefined || map instanceof Map ? map : UNKNOWN_TUI;
  });
}

function readHandle(
  map: Map<Component, OverlayHandle> | undefined,
  component: Component,
) {
  return guardedTuiRead<OverlayHandle | undefined>(() => {
    const value = map?.get(component);
    return value === undefined || (typeof value === 'object' && value !== null)
      ? value
      : UNKNOWN_TUI;
  });
}

function setTuiFocus(tui: TUI, target: Component): void {
  const set = tuiMethod(tui, 'setFocus');
  if (set !== UNKNOWN_TUI) guardedTuiRead(() => set.call(tui, target));
}

// Component-local metadata crosses independently bundled pi-core copies without
// a registry. The SDK replaces the editor inside this same retained container.
const EDITOR_SLOT = Symbol.for('thoth.pi-core.owned-overlay.v1');

function editorSlotAtOpen(tui: TUI): Component | undefined {
  const focused = readTuiFocus(tui);
  const overlays = readTuiOverlays(tui);
  if (focused === UNKNOWN_TUI || overlays === UNKNOWN_TUI) return undefined;
  const visited = new Set<Component>();
  let current = focused;
  while (current && !visited.has(current)) {
    visited.add(current);
    const parent = readTuiParent(tui, current, true);
    if (parent === UNKNOWN_TUI) return undefined;
    if (parent) return parent;
    const overlay = overlays.find(({ component }) => component === current);
    if (!overlay) return undefined;
    const slot = guardedTuiRead(() => {
      const metadata: unknown = Reflect.get(overlay.component, EDITOR_SLOT);
      if (typeof metadata !== 'object' || metadata === null) return undefined;
      const {
        version,
        tui: owner,
        editorSlot,
      } = metadata as Record<string, unknown>;
      return version === 1 && owner === tui && isTuiComponent(editorSlot)
        ? editorSlot
        : undefined;
    });
    if (slot === UNKNOWN_TUI) return undefined;
    if (slot) {
      const parent = readTuiParent(tui, slot, true);
      if (parent === UNKNOWN_TUI) return undefined;
      if (parent) return slot;
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

type VisibleOverlays = Exclude<
  ReturnType<typeof readVisibleTuiOverlays>,
  typeof UNKNOWN_TUI
>;

function overlayContaining(
  overlays: VisibleOverlays,
  focused: Component | null,
) {
  if (!focused) return undefined;
  for (const entry of overlays) {
    if (entry.component === focused) return entry;
    const parent = readTuiParent(entry.component, focused);
    if (parent === UNKNOWN_TUI) return UNKNOWN_TUI;
    if (parent) return entry;
  }
  return undefined;
}

/** An explicit unfocus disables SDK next-key recapture. */
export function acquireEditorSlotFocus(
  tui: TUI,
  target: Component,
): (() => void) | undefined {
  const focused = readTuiFocus(tui);
  const visible = readVisibleTuiOverlays(tui);
  if (
    focused === UNKNOWN_TUI ||
    visible === UNKNOWN_TUI ||
    readTuiChildren(tui, true) === UNKNOWN_TUI
  )
    return undefined;
  const displaced = overlayContaining(visible, focused);
  const map = readHandleMap(tui);
  const setFocus = tuiMethod(tui, 'setFocus');
  if (
    displaced === UNKNOWN_TUI ||
    map === UNKNOWN_TUI ||
    setFocus === UNKNOWN_TUI
  )
    return undefined;

  // Resolve every handle and method before modifying any overlay's focus.
  const unfocus = [];
  let displacedHandle: OverlayHandle | undefined;
  for (const entry of visible.reverse()) {
    const handle = readHandle(map, entry.component);
    if (handle === UNKNOWN_TUI) return undefined;
    if (!handle) continue;
    const release = tuiMethod(handle, 'unfocus');
    if (release === UNKNOWN_TUI) return undefined;
    unfocus.push(() => release.call(handle, { target }));
    if (entry === displaced) displacedHandle = handle;
  }
  try {
    for (const release of unfocus) release();
    // The blocked branch of unfocus only changes the resume target.
    setFocus.call(tui, target);
  } catch {
    // A previous unfocus may already have moved focus away from its owner.
    if (readTuiFocus(tui) !== focused)
      guardedTuiRead(() => setFocus.call(tui, focused));
    return undefined;
  }
  if (!displaced || !displacedHandle) return undefined;
  const handle = displacedHandle;
  return () => {
    if (
      readTuiFocus(tui) !== target ||
      readTuiChildren(tui, true) === UNKNOWN_TUI
    )
      return;
    const current = readVisibleTuiOverlays(tui);
    const handles = readHandleMap(tui);
    if (
      current === UNKNOWN_TUI ||
      handles === UNKNOWN_TUI ||
      readHandle(handles, displaced.component) !== handle ||
      !current.some((entry) => entry.source === displaced.source)
    )
      return;
    const isHidden = tuiMethod(handle, 'isHidden');
    const focus = tuiMethod(handle, 'focus');
    if (
      isHidden !== UNKNOWN_TUI &&
      focus !== UNKNOWN_TUI &&
      guardedTuiRead(() => isHidden.call(handle)) === false
    )
      guardedTuiRead(() => focus.call(handle));
  };
}

export function focusedForeignOverlay(tui: TUI) {
  const focused = readTuiFocus(tui);
  const overlays = readVisibleTuiOverlays(tui);
  if (focused === UNKNOWN_TUI || overlays === UNKNOWN_TUI) return UNKNOWN_TUI;
  const overlay = overlayContaining(overlays, focused);
  return overlay === UNKNOWN_TUI ? UNKNOWN_TUI : overlay ? focused : undefined;
}

/** Capture before SDK editor factory installation/teardown changes focus. */
export function overlayFocusRestorer(tui: TUI): () => void {
  const focused = focusedForeignOverlay(tui);
  return () => {
    if (
      !focused ||
      focused === UNKNOWN_TUI ||
      readTuiFocus(tui) === UNKNOWN_TUI ||
      readTuiChildren(tui, true) === UNKNOWN_TUI
    )
      return;
    const overlays = readVisibleTuiOverlays(tui);
    if (overlays === UNKNOWN_TUI) return;
    const owner = overlayContaining(overlays, focused);
    if (owner && owner !== UNKNOWN_TUI) setTuiFocus(tui, focused);
  };
}

/** SDK factory teardown itself focuses the editor; preserve a visible foreign owner. */
export function preservingOverlayFocus(tui: TUI, action: () => void): void {
  const restore = overlayFocusRestorer(tui);
  try {
    action();
  } finally {
    restore();
  }
}

function repairFocus(tui: TUI, editorSlot: Component | undefined): void {
  const focused = readTuiFocus(tui);
  if (!focused || focused === UNKNOWN_TUI || !editorSlot || focused === tui)
    return;
  // A found parent and an unknown tree both forbid repair.
  if (readTuiParent(tui, focused, true) !== undefined) return;
  const overlays = readTuiOverlays(tui);
  if (
    overlays === UNKNOWN_TUI ||
    overlayContaining(overlays, focused) !== undefined
  )
    return;
  const target = editorSlotFocusTarget(tui);
  if (target) {
    acquireEditorSlotFocus(tui, target);
    return;
  }
  if (readVisibleTuiOverlays(tui, overlays) === UNKNOWN_TUI) return;
  const candidates = guardedTuiRead(() => {
    const children = readTuiChildren(editorSlot, true);
    if (children === UNKNOWN_TUI) return UNKNOWN_TUI;
    return children.filter(
      (component) => typeof component.handleInput === 'function',
    );
  });
  const parent = readTuiParent(tui, editorSlot, true);
  if (
    candidates === UNKNOWN_TUI ||
    candidates.length !== 1 ||
    !parent ||
    parent === UNKNOWN_TUI
  )
    return;
  setTuiFocus(tui, candidates[0]);
}

/** Open a custom overlay whose completion removes only its own handle. */
export function openOwnedOverlay<T>(
  ctx: Pick<ExtensionContext, 'ui'>,
  factory: OwnedOverlayFactory<T>,
  options?: OwnedOverlayOptions,
): Promise<T> {
  const ui = ctx.ui;
  let handle: OverlayHandle | undefined;
  let closed = false;
  let hidden = false;
  let liveTui: TUI | undefined;
  let liveComponent: Component | undefined;
  let hideOwned = () => {};
  let cancelOwned = () => {};
  let untrack = () => {};
  const result = ui.custom<T>(
    (tui, theme, keybindings, done) => {
      liveTui = tui;
      const editorSlot = editorSlotAtOpen(tui);
      hideOwned = () => {
        if (!handle || hidden) return;
        hidden = true;
        const component = liveComponent;
        const map = readHandleMap(tui);
        if (component && map !== UNKNOWN_TUI)
          guardedTuiRead(() => map?.delete(component));
        try {
          handle.hide();
        } finally {
          repairFocus(tui, editorSlot);
        }
      };
      const close = (result: T) => {
        if (closed) return;
        closed = true;
        untrack();
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
      };
      // Match SDK custom-UI cancellation: undefined, regardless of result type.
      cancelOwned = () => close(undefined as T);
      const sessions = ownedSessions();
      if (sessions) {
        const pending = sessions.get(ui) ?? new Set<() => void>();
        sessions.set(ui, pending);
        pending.add(cancelOwned);
        untrack = () => {
          pending.delete(cancelOwned);
          if (!pending.size && sessions.get(ui) === pending)
            sessions.delete(ui);
        };
      }
      const created = factory(tui, theme, keybindings, close);
      const retain = (component: Component & { dispose?(): void }) => {
        liveComponent = component;
        retainEditorSlot(component, tui, editorSlot);
        return component;
      };
      return isTuiComponent(created) ? retain(created) : created.then(retain);
    },
    {
      ...options,
      overlay: true,
      onHandle(ownedHandle) {
        const hide = tuiMethod(ownedHandle, 'hide');
        if (hide === UNKNOWN_TUI) return;
        const wrapped = guardedTuiRead(() => {
          ownedHandle.hide = () => {
            if (closed) hide.call(ownedHandle);
            else cancelOwned();
          };
        });
        if (wrapped === UNKNOWN_TUI) return;
        handle = ownedHandle;
        const tui = liveTui;
        const component = liveComponent;
        if (tui && component)
          guardedTuiRead(() => {
            const registry = ownedHandles();
            if (registry === UNKNOWN_TUI) return;
            let handles = readHandleMap(tui);
            if (handles === UNKNOWN_TUI) return;
            if (!handles) {
              handles = new Map();
              registry.set(tui, handles);
            }
            handles.set(component, ownedHandle);
          });
        if (closed) hideOwned();
        options?.onHandle?.(handle);
      },
    },
  );
  void result.then(
    () => untrack(),
    () => untrack(),
  );
  return result;
}
