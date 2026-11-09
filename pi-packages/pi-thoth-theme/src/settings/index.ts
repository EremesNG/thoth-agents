import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { openPanelOverlay } from '@thoth-agents/pi-core/panel';
import { saveThemeConfig, type ThemeConfig } from '../shared/config.ts';
import { applyLiveSettings } from '../shared/live-settings.ts';
import {
  createThemeSettingsPanel,
  draftFromConfig,
  needsReload,
} from './panel.ts';

/** Opens the panel; resolves with whether a reload-only setting was saved. */
async function openThemeSettings(
  ctx: ExtensionContext,
  config: ThemeConfig,
): Promise<boolean> {
  let reload = false;
  await openPanelOverlay<boolean>(ctx, (_tui, theme, _keys, close, host) =>
    createThemeSettingsPanel({
      initial: draftFromConfig(config),
      save: (patch) => {
        if (Object.keys(patch).length === 0) return;
        if (Object.keys(patch).length === 0) return;
        // Persist first: a failure leaves the in-memory config untouched.
        saveThemeConfig(patch);
        applyLiveSettings(config, patch, {
          requestRender: host.requestRender,
          context: ctx,
        });
        reload = needsReload(patch);
      },
      theme,
      maxHeight: host.maxHeight,
      requestRender: host.requestRender,
      onDone: close,
    }),
  );
  return reload;
}

export function registerThemeSettings(
  pi: ExtensionAPI,
  config: ThemeConfig,
): void {
  pi.registerCommand('thoth-theme', {
    description:
      'Edit Thoth theme settings — icons, animation, tool density, modules',
    async handler(_args, ctx) {
      if (ctx.mode !== 'tui' || !ctx.hasUI) {
        ctx.ui.notify('/thoth-theme requires the interactive TUI.', 'error');
        return;
      }
      try {
        if (await openThemeSettings(ctx, config))
          ctx.ui.notify(
            'Module changes (status line, input box, tool cards, welcome) apply after /reload.',
            'info',
          );
      } catch (error) {
        ctx.ui.notify(
          `Thoth theme settings failed: ${error instanceof Error ? error.message : String(error)}`,
          'error',
        );
      }
    },
  });
}
