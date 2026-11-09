import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { setAnimationLevel } from '@thoth-agents/pi-core';
import { applyNativeAnimation } from '../animation.ts';
import type { ThemeConfig, ThemeConfigPatch } from './config.ts';
import { advanceSettingsRevision } from './settings-revision.ts';

const publishers = new WeakMap<ThemeConfig, () => void>();

/** The extension owns publication/token lifetime, not the settings panel. */
export function bindLiveSettings(
  config: ThemeConfig,
  republish: () => void,
): void {
  publishers.set(config, republish);
}

export interface LiveSettingsEffects {
  requestRender(): void;
  context?: ExtensionContext;
}

/** Apply only AFTER persistence succeeds. Module flags are stored but mounting
 * remains session-start-only. Retain the shared config and nested object identities.
 */
export function applyLiveSettings(
  config: ThemeConfig,
  patch: ThemeConfigPatch,
  effects: LiveSettingsEffects,
): void {
  if (patch.icons !== undefined) config.icons = patch.icons;
  if (patch.animation !== undefined) config.animation = patch.animation;
  if (patch.statusLine) Object.assign(config.statusLine, patch.statusLine);
  if (patch.tools) Object.assign(config.tools, patch.tools);
  if (patch.welcome) Object.assign(config.welcome, patch.welcome);
  if (patch.inputBox) {
    config.inputBox ??= { enabled: true };
    Object.assign(config.inputBox, patch.inputBox);
  }
  setAnimationLevel(config.animation ?? 'full');
  advanceSettingsRevision();
  publishers.get(config)?.();
  if (effects.context) applyNativeAnimation(config, effects.context);
  effects.requestRender();
}
