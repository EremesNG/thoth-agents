import { getRenderKit } from '@thoth-agents/pi-core';

interface RenderComponent {
  render(width: number): string[];
  invalidate(): void;
  handleMouse?(event: unknown): unknown;
}

/** Rebuild generated UI text only when kit ownership changes; keep card memos intact. */
export function iconAwareRenderer<Args extends unknown[]>(
  build: (...args: Args) => RenderComponent,
) {
  return (...args: Args) => {
    let kit = getRenderKit();
    let component = build(...args);
    const current = () => {
      const next = getRenderKit();
      if (next !== kit) {
        kit = next;
        component = build(...args);
      }
      return component;
    };
    return {
      render(width: number) {
        return current().render(width);
      },
      invalidate() {
        current().invalidate();
      },
      handleMouse(event: unknown) {
        return current().handleMouse?.(event);
      },
    };
  };
}
