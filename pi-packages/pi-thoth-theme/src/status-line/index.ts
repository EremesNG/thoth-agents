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
 * model name and effort, git branch, context usage and session + subagent cost.
 * Session data and subscription marking are read only on events, never per frame,
 * and the rendered row is cached by input digest and width. Never calls
 * setEditorComponent.
 */
export function registerStatusLine(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  config: ThemeConfig,
): void {
  const subscriptionProviders = config.statusLine.subscriptionProviders ?? [
    'claude-bridge',
  ];
  ctx.ui.setFooter((tui, theme, footerData) => {
    const unsubs: Array<() => void> = [];
    let disposed = false;
    let session = readSession();
    let subagentCost = 0;
    let cachedKey = '';
    let cachedLines: string[] = [];

    function readSession() {
      const usage = ctx.getContextUsage?.();
      const provider = ctx.model?.provider;
      return {
        cost: calculateSessionCost(ctx.sessionManager),
        isSubscription:
          provider !== undefined && subscriptionProviders.includes(provider),
        contextTokens: usage?.tokens ?? null,
        contextPercent: usage?.percent ?? null,
        contextWindow: usage?.contextWindow,
      };
    }

    const requestRender = () => {
      if (!disposed) tui.requestRender?.();
    };
    const refreshSession = () => {
      if (disposed) return;
      session = readSession();
      requestRender();
    };

    unsubs.push(
      pi.events.on('thoth:subagent-usage', (data) => {
        if (disposed || !data || typeof data !== 'object') return;
        const { parentSessionId, totalCost } = data as {
          parentSessionId?: unknown;
          totalCost?: unknown;
        };
        if (
          parentSessionId !== ctx.sessionManager.getSessionId() ||
          typeof totalCost !== 'number' ||
          !Number.isFinite(totalCost) ||
          totalCost < 0
        )
          return;
        // The publisher sends a cumulative snapshot, not a delta.
        subagentCost = totalCost;
        requestRender();
      }),
    );

    if (footerData?.onBranchChange) {
      unsubs.push(footerData.onBranchChange(requestRender));
    }

    const requestSubagentUsage = () => {
      pi.events.emit('thoth:subagent-usage:request', {
        parentSessionId: ctx.sessionManager.getSessionId(),
      });
    };

    if (pi?.on) {
      unsubs.push(
        pi.on('session_start', () => {
          if (disposed) return;
          subagentCost = 0;
          refreshSession();
          requestSubagentUsage();
        }),
      );
      unsubs.push(pi.on('message_end', refreshSession));
      unsubs.push(pi.on('turn_end', refreshSession));
      unsubs.push(pi.on('agent_end', refreshSession));
      unsubs.push(pi.on('session_compact', refreshSession));
      unsubs.push(pi.on('model_select', refreshSession));
      unsubs.push(pi.on('thinking_level_select', requestRender));
    }

    // Subscribe first: a request responder can publish synchronously.
    requestSubagentUsage();

    return {
      render(width: number): string[] {
        if (width <= 0) return [];

        const data: StatusData = {
          modelName: ctx.model?.name,
          modelId: ctx.model?.id,
          thinkingLevel: ctx.thinkingLevel,
          gitBranch: footerData?.getGitBranch?.() ?? null,
          ...session,
          subagentCost,
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
        // Pi may have snapshotted lifecycle handlers before replacing the footer.
        disposed = true;
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
