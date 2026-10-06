import type { RenderKitTheme } from '@thoth-agents/pi-core';
import { formatDuration } from '../shared/duration.ts';

const WORKING_FRAMES = ['△', '◭', '▲', '◮'];

export function workingFrame(elapsedMs = 0): string {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  return WORKING_FRAMES[Math.floor(elapsed / 1000) % WORKING_FRAMES.length];
}

export function runningFooter(
  theme: RenderKitTheme,
  elapsedMs?: number,
): string {
  return [
    theme.fg('accent', workingFrame(elapsedMs)),
    elapsedMs === undefined
      ? ''
      : theme.fg('dim', formatDuration(Math.floor(elapsedMs / 1000) * 1000)),
  ]
    .filter(Boolean)
    .join(theme.fg('dim', ' · '));
}
