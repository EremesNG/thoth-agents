import type { RenderKitTheme } from '@thoth-agents/pi-core';
import type { IconMode } from '../shared/config.ts';
import { formatDuration } from '../shared/duration.ts';
import { frames, icon } from '../shared/icons.ts';

export function workingFrame(elapsedMs = 0, mode: IconMode = 'nerd'): string {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const working = frames('workingFrames', mode);
  return working[Math.floor(elapsed / 1000) % working.length];
}

export function runningFooter(
  theme: RenderKitTheme,
  elapsedMs: number | undefined,
  mode: IconMode,
): string {
  return [
    theme.fg('accent', workingFrame(elapsedMs, mode)),
    elapsedMs === undefined
      ? ''
      : theme.fg('dim', formatDuration(Math.floor(elapsedMs / 1000) * 1000)),
  ]
    .filter(Boolean)
    .join(theme.fg('dim', ` ${icon('separator', mode)} `));
}
