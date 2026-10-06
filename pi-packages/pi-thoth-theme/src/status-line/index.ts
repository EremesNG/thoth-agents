import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import {
  decorateEditor,
  type EditorDecoration,
} from '../input-box/decorate.ts';
import { createWorkingState } from '../input-box/state.ts';
import type { ThemeConfig } from '../shared/config.ts';
import { calculateSessionCost } from './cost.ts';
import { type ActiveThemeLike, formatCwd, renderStatusLine } from './layout.ts';
import type { StatusSnapshot, StatusSnapshotProvider } from './snapshot.ts';
import { createThroughputTracker } from './throughput.ts';
import { calculateSessionTokens } from './tokens.ts';

export { calculateSessionCost, formatCost } from './cost.ts';
export {
  type ActiveThemeLike,
  type ContextUsageInfo,
  formatCwd,
  formatTokens,
  type RenderStatusLineOptions,
  renderStatusLine,
  type StatusData,
} from './layout.ts';
export type { StatusSnapshot, StatusSnapshotProvider } from './snapshot.ts';
export { calculateSessionTokens, type SessionTokenTotals } from './tokens.ts';

/**
 * Renders the cached status row below the input box and discovers editors in place.
 * Session aggregation is cached until an event or session leaf change; this
 * extension never registers an editor factory with setEditorComponent.
 */
export function registerStatusLine(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  config: ThemeConfig,
): void {
  const subscriptionProviders = config.statusLine.subscriptionProviders ?? [
    'claude-bridge',
  ];
  const inputBoxEnabled = config.inputBox?.enabled !== false;
  ctx.ui.setFooter((tui, theme, footerData) => {
    const unsubs: Array<() => void> = [];
    let disposed = false;
    const throughput = createThroughputTracker();
    let sessionLeafId = ctx.sessionManager.getLeafId();
    let session = readSession();
    let sessionDirty = false;
    let subagentCost = 0;
    let cachedKey = '';
    let cachedLines: string[] = [];
    let snapshotKey = '';
    let snapshot: Readonly<StatusSnapshot>;

    // Cheap live fields are sampled by either consumer, never by footer order.
    // Checking the leaf is O(1); unchanged frames do not copy/aggregate entries.
    const getStatusSnapshot: StatusSnapshotProvider = () => {
      if (!disposed) {
        const leafId = ctx.sessionManager.getLeafId();
        if (sessionDirty || leafId !== sessionLeafId) {
          session = readSession();
          sessionLeafId = leafId;
          sessionDirty = false;
        }
      }
      const data: StatusSnapshot = {
        modelName: ctx.model?.name,
        modelId: ctx.model?.id,
        thinkingLevel: ctx.thinkingLevel,
        gitBranch: footerData?.getGitBranch?.() ?? null,
        cwd: formatCwd(ctx.cwd, process.env.HOME || process.env.USERPROFILE),
        ...session,
        subagentCost,
        tokensPerSecond: throughput.tokensPerSecond,
      };
      const key = JSON.stringify(data);
      if (key !== snapshotKey) {
        snapshotKey = key;
        snapshot = data;
      }
      return snapshot;
    };

    function readSession() {
      const usage = ctx.getContextUsage?.();
      const provider = ctx.model?.provider;
      const entries = ctx.sessionManager.getEntries();
      return {
        cost: calculateSessionCost(entries),
        tokenTotals: calculateSessionTokens(entries),
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
    const invalidateRender = () => {
      if (disposed) return;
      cachedKey = '';
      requestRender();
    };
    const working = createWorkingState(invalidateRender);
    const editorDecorations = new Set<EditorDecoration>();
    const refreshSession = () => {
      if (disposed) return;
      // message_end reaches extensions before Pi persists the entry. An early
      // consumer may read now; the leaf key still detects the later append.
      sessionDirty = true;
      invalidateRender();
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
      unsubs.push(footerData.onBranchChange(invalidateRender));
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
          throughput.reset();
          if (inputBoxEnabled) working.end();
          refreshSession();
          requestSubagentUsage();
        }),
      );
      if (inputBoxEnabled) {
        unsubs.push(pi.on('agent_start', working.start));
        unsubs.push(pi.on('agent_end', working.end));
      }
      unsubs.push(
        pi.on('message_start', (event) => {
          if (!disposed && event) throughput.observe(event);
        }),
      );
      unsubs.push(
        pi.on('message_end', (event) => {
          if (disposed) return;
          if (event) throughput.observe(event);
          refreshSession();
        }),
      );
      unsubs.push(pi.on('turn_end', refreshSession));
      unsubs.push(pi.on('agent_end', refreshSession));
      unsubs.push(pi.on('session_compact', refreshSession));
      unsubs.push(pi.on('model_select', refreshSession));
      unsubs.push(pi.on('thinking_level_select', invalidateRender));
    }

    // Subscribe first: a request responder can publish synchronously.
    requestSubagentUsage();

    return {
      getStatusSnapshot,
      render(width: number): string[] {
        if (!disposed && inputBoxEnabled) {
          // Discovery must precede cached-row returns: focus and editor identity
          // can change without any status data changing.
          const focusedTui = tui as typeof tui & {
            getFocusedComponent?: () => unknown;
          };
          const editor = focusedTui.getFocusedComponent?.();
          const decoration = decorateEditor(editor, {
            theme: theme as ActiveThemeLike,
            working,
            getStatusSnapshot,
            get iconMode() {
              return config.icons;
            },
          });
          if (decoration && !editorDecorations.has(decoration)) {
            editorDecorations.add(decoration);
            requestRender();
          }
        }
        if (width <= 0) return [];
        const data = getStatusSnapshot();
        const key = `${width}\u0000${JSON.stringify(data)}`;
        if (key === cachedKey) return cachedLines;
        const line = renderStatusLine(data, {
          width,
          mode: config.icons,
          theme: theme as ActiveThemeLike,
        });
        cachedKey = key;
        // Working ticks invalidate styling, but unchanged footer output keeps
        // its identity and avoids needless downstream updates.
        if (line !== cachedLines[0]) cachedLines = line ? [line] : [];
        return cachedLines;
      },
      invalidate: invalidateRender,
      dispose() {
        // Pi may have snapshotted lifecycle handlers before replacing the footer.
        disposed = true;
        working.dispose();
        for (const decoration of editorDecorations) decoration.dispose();
        editorDecorations.clear();
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
