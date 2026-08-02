import type { PluginInput } from '@opencode-ai/plugin';
import { log } from '../../utils/logger';
import {
  extractChannel,
  findPluginEntry,
  getCachedVersion,
  getLatestVersion,
  getLocalDevVersion,
} from './checker';
import type { AutoUpdateCheckerOptions } from './types';

/**
 * Creates an OpenCode hook that checks for plugin updates when a new session is created.
 * @param ctx The plugin input context.
 * @param options Configuration options for the update checker.
 * @returns A hook object for the session.created event.
 */
export function createAutoUpdateCheckerHook(
  ctx: PluginInput,
  options: AutoUpdateCheckerOptions = {},
) {
  const { showStartupToast = true } = options;

  let hasChecked = false;

  return {
    event: ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type !== 'session.created') return;
      if (hasChecked) return;

      const props = event.properties as
        | { info?: { parentID?: string } }
        | undefined;
      if (props?.info?.parentID) return;

      hasChecked = true;

      setTimeout(async () => {
        const cachedVersion = getCachedVersion();
        const localDevVersion = getLocalDevVersion(ctx.directory);
        const displayVersion = localDevVersion ?? cachedVersion;

        if (localDevVersion) {
          if (showStartupToast) {
            showToast(
              ctx,
              `thoth-agents ${displayVersion} (dev)`,
              'Running in local development mode.',
              'info',
            );
          }
          log('[auto-update-checker] Local development mode');
          return;
        }

        if (showStartupToast) {
          showToast(
            ctx,
            `thoth-agents ${displayVersion ?? 'unknown'}`,
            'thoth-agents is active.',
            'info',
          );
        }

        runBackgroundUpdateCheck(ctx).catch((err) => {
          log('[auto-update-checker] Background update check failed:', err);
        });
      }, 0);
    },
  };
}

/**
 * Checks registry availability and notifies without mutating installed state.
 * @param ctx The plugin input context.
 */
async function runBackgroundUpdateCheck(ctx: PluginInput): Promise<void> {
  const pluginInfo = findPluginEntry(ctx.directory);
  if (!pluginInfo) {
    log('[auto-update-checker] Plugin not found in config');
    return;
  }

  const cachedVersion = getCachedVersion();
  const currentVersion = cachedVersion ?? pluginInfo.pinnedVersion;
  if (!currentVersion) {
    log('[auto-update-checker] No version found (cached or pinned)');
    return;
  }

  const channel = extractChannel(pluginInfo.pinnedVersion ?? currentVersion);
  const latestVersion = await getLatestVersion(channel);
  if (!latestVersion) {
    log(
      '[auto-update-checker] Failed to fetch latest version for channel:',
      channel,
    );
    return;
  }

  if (currentVersion === latestVersion) {
    log(
      '[auto-update-checker] Already on latest version for channel:',
      channel,
    );
    return;
  }

  log(
    `[auto-update-checker] Update available (${channel}): ${currentVersion} → ${latestVersion}`,
  );

  showToast(
    ctx,
    `thoth-agents ${latestVersion} available`,
    `v${currentVersion} → v${latestVersion}. Run npx thoth-agents@latest install --agent=opencode or use interactive CLI Update.`,
    'info',
    10_000,
  );
  log('[auto-update-checker] Notification only; explicit CLI update required');
}

/**
 * Helper to display a toast notification in the OpenCode TUI.
 * @param ctx The plugin input context.
 * @param title The toast title.
 * @param message The toast message.
 * @param variant The visual style of the toast.
 * @param duration How long to show the toast in milliseconds.
 */
function showToast(
  ctx: PluginInput,
  title: string,
  message: string,
  variant: 'info' | 'success' | 'error' = 'info',
  duration = 3000,
): void {
  ctx.client.tui
    .showToast({
      body: { title, message, variant, duration },
    })
    .catch(() => {});
}

export type { AutoUpdateCheckerOptions } from './types';
