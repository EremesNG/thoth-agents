import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import type { ThemeConfig } from '../shared/config.ts';
import { calculateSessionCost } from './cost.ts';
import {
  type ActiveThemeLike,
  renderStatusLine,
  type StatusData,
} from './layout.ts';

export { calculateSessionCost, formatCost } from './cost.ts';
export {
  type ActiveThemeLike,
  type ContextUsageInfo,
  formatTokens,
  type RenderStatusLineOptions,
  renderStatusLine,
  type StatusData,
} from './layout.ts';

/**
 * Registers the single-row footer status line in the pi-omp-theme `claude` preset style.
 * Displays: model+effort, git branch, context usage, cumulative session cost,
 * and compact extension statuses (lowest priority). Never calls setEditorComponent.
 */
export function registerStatusLine(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  config: ThemeConfig,
): void {
  ctx.ui.setFooter((tui, theme, footerData) => {
    const unsubs: Array<() => void> = [];

    const requestRender = () => {
      tui.requestRender?.();
    };

    if (footerData?.onBranchChange) {
      unsubs.push(footerData.onBranchChange(requestRender));
    }

    if (pi?.on) {
      unsubs.push(pi.on('message_end', requestRender));
      unsubs.push(pi.on('turn_end', requestRender));
      unsubs.push(pi.on('model_select', requestRender));
      unsubs.push(pi.on('thinking_level_select', requestRender));
      unsubs.push(pi.on('session_compact', requestRender));
    }

    return {
      render(width: number): string[] {
        if (width <= 0) return [];

        const gitBranch = footerData?.getGitBranch
          ? footerData.getGitBranch()
          : null;
        const extensionStatuses = footerData?.getExtensionStatuses
          ? footerData.getExtensionStatuses()
          : undefined;
        const contextUsage = ctx.getContextUsage?.();
        const cost = calculateSessionCost(ctx.sessionManager);

        const data: StatusData = {
          model: ctx.model?.id,
          thinkingLevel: ctx.thinkingLevel,
          gitBranch,
          contextUsage,
          cost,
          extensionStatuses,
        };

        const line = renderStatusLine(data, {
          width,
          mode: config.icons,
          theme: theme as ActiveThemeLike,
        });

        return line ? [line] : [];
      },
      invalidate() {
        requestRender();
      },
      dispose() {
        for (const unsub of unsubs) {
          try {
            unsub();
          } catch {
            // ignore disposal errors during cleanup
          }
        }
        unsubs.length = 0;
      },
    };
  });
}
