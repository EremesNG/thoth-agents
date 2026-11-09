import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { getAnimationLevel, setAnimationLevel } from '@thoth-agents/pi-core';
import type { ThemeConfig } from './shared/config.ts';
import { frames, icon, statusIcon } from './shared/icons.ts';

const nativeEnablement = new WeakMap<ThemeConfig, boolean>();

export function applyNativeAnimation(
  config: ThemeConfig,
  ctx: ExtensionContext,
): void {
  if (
    !ctx.hasUI ||
    !(
      nativeEnablement.get(config) ??
      (config.statusLine.enabled && config.inputBox?.enabled !== false)
    )
  )
    return;
  const level = getAnimationLevel();
  ctx.ui.setWorkingMessage?.(`working${icon('ellipsis', config.icons)}`);
  ctx.ui.setWorkingIndicator?.({
    frames:
      level === 'off'
        ? [statusIcon('running', config.icons)]
        : [...frames('workingFrames', config.icons)],
    intervalMs: level === 'off' ? 500 : 200,
  });
}

export function registerAnimation(pi: ExtensionAPI, config: ThemeConfig): void {
  // Enablement is reload-only, even while icons and animation stay live.
  nativeEnablement.set(
    config,
    config.statusLine.enabled && config.inputBox?.enabled !== false,
  );
  setAnimationLevel(config.animation ?? 'full');

  pi.on('session_start', (_event, ctx) => {
    setAnimationLevel(config.animation ?? 'full');
    applyNativeAnimation(config, ctx);
  });
}
