import type { Component } from '@earendil-works/pi-tui';

/** Cache lines per instance and width; invalidate when render inputs change. */
export function cachedComponent(
  renderFn: (width: number) => string[],
): Component {
  const cache = new Map<number, string[]>();
  return {
    render(width: number): string[] {
      let lines = cache.get(width);
      if (lines === undefined) {
        lines = renderFn(width);
        cache.set(width, lines);
      }
      return lines;
    },
    invalidate(): void {
      cache.clear();
    },
  };
}
