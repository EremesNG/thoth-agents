import type {
  ExtensionContext,
  KeybindingsManager,
  Theme,
} from '@earendil-works/pi-coding-agent';
import type { Component, EditorComponent, TUI } from '@earendil-works/pi-tui';
import { hasBlockingOverlay } from './decorative-overlay.js';
import {
  acquireEditorSlotFocus,
  focusedForeignOverlay,
  preservingOverlayFocus,
} from './owned-overlay.js';

type EditorFactory = NonNullable<
  ReturnType<ExtensionContext['ui']['getEditorComponent']>
>;
type InputHandler = Parameters<ExtensionContext['ui']['onTerminalInput']>[0];
type WidgetFactory = (tui: TUI, theme: Theme) => Component;

export interface EditorSlotContribution {
  key: string;
  aboveEditor?: WidgetFactory;
  /** The last active replacement occupies the editor; the retained editor stays intact. */
  replacement?: () => Component | undefined;
  handleInput?: InputHandler;
}

export interface EditorSlotHandle {
  readonly tui: TUI;
  readonly keybindings: KeybindingsManager;
  refresh(): void;
  acquireFocus(): void;
  releaseFocus(): void;
  isRootEditorInputActive(): boolean;
  dispose(): void;
}

interface Owner {
  supportsDecorativeOverlays?: true;
  register(contribution: EditorSlotContribution): EditorSlotHandle;
  focusTarget(): Component | undefined;
}
interface Registry {
  version: 1;
  sessions: WeakMap<object, Owner>;
  tuis: WeakMap<TUI, Owner>;
}
// Unversioned arbitration key: incompatible owners are never overwritten.
const registryKey = Symbol.for('thoth.pi-core.editor-slot');
const shared = globalThis as typeof globalThis & { [registryKey]?: unknown };
function registry(): Registry | undefined {
  try {
    shared[registryKey] ??= {
      version: 1,
      sessions: new WeakMap(),
      tuis: new WeakMap(),
    };
    const value = shared[registryKey] as Registry | null;
    if (
      value?.version === 1 &&
      value.sessions instanceof WeakMap &&
      value.tuis instanceof WeakMap
    )
      return value;
  } catch {
    // A foreign record/accessor must not break extension activation.
  }
  return undefined;
}

/** Do not upgrade old first-owner closures merely because their registry is compatible. */
export function editorSlotSupportsDecorativeOverlays(tui: TUI): boolean {
  const state = registry();
  if (!state) return false;
  const owner = state.tuis.get(tui);
  return !owner || owner.supportsDecorativeOverlays === true;
}

/** Used by owned-overlay close repair, including independently bundled copies. */
export function editorSlotFocusTarget(tui: TUI): Component | undefined {
  return registry()?.tuis.get(tui)?.focusTarget();
}

/** One factory and terminal listener per session; contributors never chain SDK factories. */
export function registerEditorSlot(
  ctx: Pick<ExtensionContext, 'ui'> &
    Partial<Pick<ExtensionContext, 'sessionManager'>>,
  contribution: EditorSlotContribution,
  defaultFactory?: EditorFactory,
): EditorSlotHandle | undefined {
  const state = registry();
  if (!state) return undefined;
  const session = ctx.sessionManager ?? ctx.ui;
  const existing = state.sessions.get(session);
  if (existing) return existing.register(contribution);
  const ui = ctx.ui;
  if (
    typeof ui.getEditorComponent !== 'function' ||
    typeof ui.setEditorComponent !== 'function' ||
    typeof ui.onTerminalInput !== 'function' ||
    typeof ui.setWidget !== 'function'
  )
    return undefined;
  const previousFactory = ui.getEditorComponent();
  const baseFactory = previousFactory ?? defaultFactory;
  if (!baseFactory) return undefined;
  const contributions = new Map<string, EditorSlotContribution>();
  let runtime:
    | { tui: TUI; keybindings: KeybindingsManager; mounted: EditorComponent }
    | undefined;
  let invocations = 0;
  const replacement = () => {
    for (const entry of [...contributions.values()].reverse()) {
      const component = entry.replacement?.();
      if (component) return component;
    }
    return undefined;
  };
  const factory: EditorFactory = (liveTui, theme, keys) => {
    invocations++;
    if (runtime) return runtime.mounted;
    const retained = baseFactory(liveTui, theme, keys);
    const mounted = new Proxy(retained, {
      get(target, property) {
        if (property === 'render')
          return (width: number) => (replacement() ?? target).render(width);
        if (property === 'handleInput')
          return (data: string) =>
            (replacement() ?? target).handleInput?.(data);
        if (property === 'invalidate')
          return () => {
            target.invalidate();
            replacement()?.invalidate();
          };
        const value = Reflect.get(target, property, target);
        // SDK callback assignments and app-level actions belong to the retained editor.
        return typeof value === 'function' &&
          !(typeof property === 'string' && property.startsWith('on'))
          ? value.bind(target)
          : value;
      },
      set(target, property, value) {
        return Reflect.set(target, property, value, target);
      },
    });
    runtime = { tui: liveTui, keybindings: keys, mounted };
    return mounted;
  };
  ui.setEditorComponent(factory);
  // RPC exposes no-op hooks: no factory invocation means no mountable slot.
  if (!runtime) {
    if (ui.getEditorComponent() === factory)
      ui.setEditorComponent(previousFactory);
    return undefined;
  }
  const { tui, keybindings, mounted } = runtime;
  const active = () => ui.getEditorComponent() === factory && invocations === 1;
  const owner: Owner = {
    supportsDecorativeOverlays: true,
    focusTarget: () => (active() ? mounted : undefined),
    register(entry) {
      if (contributions.has(entry.key))
        throw new Error(
          `Editor slot contribution already registered: ${entry.key}`,
        );
      contributions.set(entry.key, entry);
      let disposed = false;
      const handle: EditorSlotHandle = {
        tui,
        keybindings,
        refresh: () => tui.requestRender(),
        acquireFocus: () => {
          if (active()) acquireEditorSlotFocus(tui, mounted);
        },
        releaseFocus: () => {
          if (active() && !focusedForeignOverlay(tui))
            acquireEditorSlotFocus(tui, mounted);
        },
        isRootEditorInputActive: () =>
          active() &&
          !replacement() &&
          (
            tui as TUI & { getFocusedComponent?(): Component | null }
          ).getFocusedComponent?.() === mounted &&
          !hasBlockingOverlay(tui),
        dispose() {
          if (disposed) return;
          disposed = true;
          contributions.delete(entry.key);
          try {
            if (entry.aboveEditor) ui.setWidget(entry.key, undefined);
          } finally {
            if (contributions.size) tui.requestRender();
            else {
              removeInput();
              state.sessions.delete(session);
              state.tuis.delete(tui);
              if (ui.getEditorComponent() === factory)
                preservingOverlayFocus(tui, () =>
                  ui.setEditorComponent(previousFactory),
                );
            }
          }
        },
      };
      try {
        if (entry.aboveEditor)
          ui.setWidget(entry.key, entry.aboveEditor, {
            placement: 'aboveEditor',
          });
        return handle;
      } catch (error) {
        handle.dispose();
        throw error;
      }
    },
  };
  state.sessions.set(session, owner);
  state.tuis.set(tui, owner);
  const removeInput = ui.onTerminalInput((data) => {
    for (const entry of [...contributions.values()].reverse()) {
      const result = entry.handleInput?.(data);
      if (result?.consume || result?.data !== undefined) return result;
    }
    return undefined;
  });
  return owner.register(contribution);
}
