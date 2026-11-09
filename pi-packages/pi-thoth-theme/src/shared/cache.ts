import type { Component } from '@earendil-works/pi-tui';
import { settingsRevision } from './settings-revision.ts';

/** Cache lines per instance, settings revision and width. */
export function cachedComponent(
  renderFn: (width: number) => string[],
): Component {
  const cache = new Map<number, string[]>();
  let revision = settingsRevision();
  return {
    render(width: number): string[] {
      if (revision !== settingsRevision()) {
        cache.clear();
        revision = settingsRevision();
      }
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

/** Re-select presentation (including density branches) when live settings change.
 * Build eagerly to preserve the SDK's call/result bookkeeping; subsequent builds
 * happen at render time, never replaying execution or result-state transitions.
 */
export function settingsComponent(build: () => Component): Component {
  let revision = settingsRevision();
  let component = build();
  return {
    render(width) {
      if (revision !== settingsRevision()) {
        component = build();
        revision = settingsRevision();
      }
      return component.render(width);
    },
    invalidate() {
      component.invalidate();
    },
  };
}
