import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  type OwnedOverlayFactory,
  type OwnedOverlayOptions,
  openOwnedOverlay,
} from './owned-overlay.js';

export interface PanelOverlayHost {
  /** Resolve on every render: Pi's maxHeight clips rather than scrolls. */
  maxHeight(): number;
  requestRender(): void;
}

export type PanelOverlayFactory<T> = (
  ...args: [...Parameters<OwnedOverlayFactory<T>>, PanelOverlayHost]
) => ReturnType<OwnedOverlayFactory<T>>;

// Terminal-local leases also work across independently bundled pi-core copies.
const MOUSE_USERS = Symbol.for('thoth.pi-core.panel-mouse.v1');

function acquireMouse(
  tui: Parameters<OwnedOverlayFactory<unknown>>[0],
): () => void {
  const terminal = tui.terminal as typeof tui.terminal & {
    [MOUSE_USERS]?: number;
  };
  if (tui.mode === 'fullscreen' || typeof terminal?.write !== 'function')
    return () => {};
  const users = terminal[MOUSE_USERS] ?? 0;
  if (!users) terminal.write('\x1b[?1000h\x1b[?1006h');
  terminal[MOUSE_USERS] = users + 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    terminal[MOUSE_USERS] = Math.max(0, (terminal[MOUSE_USERS] ?? 1) - 1);
    if (!terminal[MOUSE_USERS] && tui.mode !== 'fullscreen')
      terminal.write('\x1b[?1006l\x1b[?1000l');
  };
}

/** Owned panel host; inline mouse reporting is released on every exit path. */
export async function openPanelOverlay<T>(
  ctx: Pick<ExtensionContext, 'ui'>,
  factory: PanelOverlayFactory<T>,
  options?: OwnedOverlayOptions,
): Promise<T> {
  let releaseMouse = () => {};
  try {
    return await openOwnedOverlay<T>(
      ctx,
      (tui, theme, keys, close) => {
        releaseMouse = acquireMouse(tui);
        const created = factory(
          tui,
          theme,
          keys,
          (result) => {
            try {
              close(result);
            } finally {
              releaseMouse();
            }
          },
          {
            maxHeight: () => Math.max(1, Math.floor(tui.terminal.rows * 0.9)),
            requestRender: () => tui.requestRender(),
          },
        );
        const retain = (component: Awaited<typeof created>) => {
          const dispose = component.dispose;
          component.dispose = () => {
            try {
              dispose?.call(component);
            } finally {
              releaseMouse();
            }
          };
          return component;
        };
        return created instanceof Promise
          ? created.then(retain)
          : retain(created);
      },
      {
        ...options,
        overlayOptions: options?.overlayOptions ?? {
          anchor: 'center',
          width: '96%',
          maxHeight: '90%',
        },
      },
    );
  } finally {
    releaseMouse();
  }
}
