import { getAnimationLevel, type RenderKitTheme } from '@thoth-agents/pi-core';
import type { IconMode } from '../shared/config.ts';
import { formatDuration } from '../shared/duration.ts';
import { frames, icon, statusIcon } from '../shared/icons.ts';

export function workingFrame(
  frame: unknown = 0,
  mode: IconMode = 'nerd',
): string {
  if (getAnimationLevel() === 'off') return statusIcon('running', mode);
  const step =
    typeof frame === 'number' && Number.isFinite(frame)
      ? Math.max(0, Math.floor(frame))
      : 0;
  const working = frames('workingFrames', mode);
  return working[step % working.length];
}

export function runningFooter(
  theme: RenderKitTheme,
  elapsedMs: number | undefined,
  mode: IconMode,
  frame?: unknown,
): string {
  return [
    theme.fg('accent', workingFrame(frame, mode)),
    elapsedMs === undefined
      ? ''
      : theme.fg('dim', formatDuration(Math.floor(elapsedMs / 1000) * 1000)),
  ]
    .filter(Boolean)
    .join(theme.fg('dim', ` ${icon('separator', mode)} `));
}
