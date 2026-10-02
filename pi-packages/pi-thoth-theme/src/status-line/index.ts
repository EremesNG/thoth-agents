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
 * Registers the single-row footer status line in the pi-omp-theme `claude` preset style:
 * model name and effort, git branch, context usage and cumulative session cost.
 * Session data (cost, context usage) is read only on session events, never per
 * frame, and the rendered row is cached by input digest and width. Never calls
 * setEditorComponent.
 */
export function registerStatusLine(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  config: ThemeConfig,
): void {
  ctx.ui.setFooter((tui, theme, footerData) => {
    const unsubs: Array<() => void> = [];
    let session = readSession();
    let cachedKey = '';
    let cachedLines: string[] = [];

    function readSession() {
      const usage = ctx.getContextUsage?.();
      return {
        cost: calculateSessionCost(ctx.sessionManager),
        contextTokens: usage?.tokens ?? null,
        contextPercent: usage?.percent ?? null,
        contextWindow: usage?.contextWindow,
      };
    }

    const requestRender = () => {
      tui.requestRender?.();
    };
    const refreshSession = () => {
      session = readSession();
      requestRender();
    };

    if (footerData?.onBranchChange) {
      unsubs.push(footerData.onBranchChange(requestRender));
    }

    if (pi?.on) {
      unsubs.push(pi.on('message_end', refreshSession));
      unsubs.push(pi.on('turn_end', refreshSession));
      unsubs.push(pi.on('agent_end', refreshSession));
      unsubs.push(pi.on('session_compact', refreshSession));
      unsubs.push(pi.on('model_select', refreshSession));
      unsubs.push(pi.on('thinking_level_select', requestRender));
    }

    return {
      render(width: number): string[] {
        if (width <= 0) return [];

        const data: StatusData = {
          modelName: ctx.model?.name,
          modelId: ctx.model?.id,
          thinkingLevel: ctx.thinkingLevel,
          gitBranch: footerData?.getGitBranch?.() ?? null,
          ...session,
        };
        const key = `${width}\u0000${JSON.stringify(data)}`;
        if (key === cachedKey) return cachedLines;

        const line = renderStatusLine(data, {
          width,
          mode: config.icons,
          theme: theme as ActiveThemeLike,
        });
        cachedKey = key;
        cachedLines = line ? [line] : [];
        return cachedLines;
      },
      invalidate() {
        cachedKey = '';
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
