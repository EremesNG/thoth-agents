import type { TUI } from '@earendil-works/pi-tui';

/** Pi's proxy wraps every function read, so proxy.render identity is unusable.
 * A short-lived forwarded method lets us read the concrete receiver and later
 * compare/restore its own render property without touching a foreign patch.
 */
export function concreteRenderer(tui: TUI): TUI {
  const key = Symbol('sidebar-renderer-receiver');
  const reference = tui as TUI & { [key]?: () => TUI };
  let renderer: TUI | undefined;
  try {
    reference[key] = function (this: TUI) {
      return this;
    };
    renderer = reference[key]?.();
    if (!renderer) throw new Error('Renderer proxy did not forward assignment');
    return renderer;
  } finally {
    if (renderer) Reflect.deleteProperty(renderer, key);
    else Reflect.deleteProperty(reference, key);
  }
}
