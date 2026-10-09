import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { resolveIcon } from '@thoth-agents/pi-core';
import { openPanelOverlay } from '@thoth-agents/pi-core/panel';
import {
  createHistoryPanelKeyMatcher,
  HistoryPanel,
  type HistoryPanelOptions,
} from '@thoth-agents/pi-core/history-panel';
import { failureView } from './failures.js';
import { formatDuration } from './format-duration.js';
import { pageTaskLog } from './logs.js';
import { listMetasForOrigin } from './registry.js';
import { stopTask } from './runtime.js';
import {
  lifecycleContentRevision,
  type PageResult,
  terminalDisplayRows,
} from './shared-log-utils.js';
import type {
  BackgroundTaskCallbackOrigin,
  BackgroundTaskMeta,
} from './types.js';

const LOG_PAGE_BYTES = 64 * 1024;

export async function showBackgroundTasksHistory(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  origin: BackgroundTaskCallbackOrigin,
  selectedTaskId?: string,
): Promise<void> {
  if (!ctx.hasUI || ctx.mode !== 'tui') return;
  let panel: BackgroundTasksHistoryPanel | undefined;
  try {
    await openPanelOverlay<void>(
      ctx,
      (tui, theme, keybindings, done) => {
        panel = new BackgroundTasksHistoryPanel(pi, origin, {
          theme,
          onClose: done,
          initialSelectedId: selectedTaskId,
          matchesKey: createHistoryPanelKeyMatcher({
            matches: (data, key) =>
              keybindings.matches(
                data,
                key as Parameters<typeof keybindings.matches>[1],
              ),
          }),
          maxLines: () => Math.max(12, tui.terminal.rows ?? 42),
          requestRender: () => tui.requestRender(),
        });
        return panel;
      },
      {
        overlayOptions: {
          anchor: 'top-left',
          width: '100%',
          maxHeight: '100%',
          margin: 0,
        },
      },
    );
  } finally {
    panel?.dispose();
  }
}

function lossNotices(page: PageResult): string[] {
  return page.gaps.map((gap) =>
    gap.kind === 'read'
      ? `Log unavailable: ${gap.detail ?? 'read failed'}`
      : `Notice: ${gap.kind} output lost (${gap.bytes ?? 0} bytes)${gap.detail ? ` ${resolveIcon('separator', '·')} ${gap.detail}` : ''}`,
  );
}

function contentFor(
  meta: BackgroundTaskMeta,
  width: number,
  page: PageResult,
): string[] {
  const command =
    meta.command || meta.argv?.join(' ') || '(no command recorded)';
  const rows = [
    `Status: ${meta.status}${meta.dismissedAt !== undefined ? ` ${resolveIcon('separator', '·')} dismissed` : ''}`,
    `Command: ${command}`,
    `Started: ${new Date(meta.startedAt).toISOString()}`,
    `Ended: ${meta.endedAt === undefined ? '(running)' : new Date(meta.endedAt).toISOString()}`,
    `Elapsed: ${formatDuration((meta.endedAt ?? Date.now()) - meta.startedAt)}`,
    `Cwd: ${meta.cwd}`,
    ...(meta.pid !== undefined ? [`Pid: ${meta.pid}`] : []),
    ...(meta.lastExitCode !== undefined ? [`Exit: ${meta.lastExitCode}`] : []),
    ...(meta.lastSignal ? [`Signal: ${meta.lastSignal}`] : []),
    ...(meta.error ? [`Error: ${meta.error}`] : []),
    ...(meta.stopError ? [`Stop error: ${meta.stopError}`] : []),
    ...terminalDisplayRows(failureView(meta.id).text),
    `Log: ${meta.logPath}`,
    ...lossNotices(page),
    ...(page.reset ? [`Log reset: ${page.reset}`] : []),
    `Retained log ${resolveIcon('separator', '·')} bytes ${page.startByte}-${page.endByte}/${page.totalBytes}`,
    ...(page.text ? terminalDisplayRows(page.text) : ['(log is empty)']),
  ];
  return rows.flatMap((row) => wrapTextWithAnsi(row, Math.max(1, width)));
}

export class BackgroundTasksHistoryPanel extends HistoryPanel<BackgroundTaskMeta> {
  constructor(
    pi: ExtensionAPI,
    origin: BackgroundTaskCallbackOrigin,
    options: Omit<HistoryPanelOptions, 'title'>,
  ) {
    // Retain only the selected page's content, not an eagerly hydrated whole log.
    let selectedId: string | undefined;
    let cursors: Array<string | undefined> = [undefined];
    let index = 0;
    let page: PageResult | undefined;
    let revision: string | undefined;
    let hasNext = false;
    let actionError: { id: string; message: string } | undefined;
    const currentPage = (meta: BackgroundTaskMeta): PageResult => {
      if (selectedId !== meta.id) {
        selectedId = meta.id;
        cursors = [undefined];
        index = 0;
        page = undefined;
      }
      const currentRevision = lifecycleContentRevision(
        [
          meta.logGeneration,
          meta.logDiscardedBytes,
          meta.captureDiscardedBytes,
          meta.stdoutDiscardedBytes,
          meta.stderrDiscardedBytes,
        ],
        meta.logPath,
      );
      if (!page || revision !== currentRevision) {
        page = pageTaskLog(meta, {
          cursor: cursors[index],
          maxBytes: LOG_PAGE_BYTES,
        });
        if (page.reset) {
          cursors = [page.cursor];
          index = 0;
        } else cursors[index] = page.cursor;
        revision = currentRevision;
        // An append-ready cursor sees output written after the page's snapshot.
        hasNext =
          page.hasMore ||
          pageTaskLog(meta, { cursor: page.nextCursor, maxBytes: 0 }).hasMore;
      }
      return page;
    };
    super(
      {
        items: () => listMetasForOrigin(origin),
        id: (meta) => meta.id,
        renderItemLabel: (meta, context) =>
          `${context.selected ? resolveIcon('selection', '›') : ' '} ${meta.name || meta.id}`,
        renderContent: (meta, width) => [
          ...contentFor(meta, width, currentPage(meta)),
          ...(actionError?.id === meta.id
            ? [`Stop error: ${actionError.message}`]
            : []),
        ],
        canClose: (meta) => meta.status === 'running',
        close: (meta) => {
          actionError = undefined;
          void stopTask(pi, meta.id, () => origin).catch((error) => {
            actionError = {
              id: meta.id,
              message: error instanceof Error ? error.message : String(error),
            };
            options.requestRender?.();
          });
        },
        renderHeader: (meta) => {
          const current = currentPage(meta);
          const metadata = [
            `${meta.name || meta.id} ${resolveIcon('separator', '·')} ${meta.status}`,
            lossNotices(current).join(` ${resolveIcon('separator', '·')} `) ||
              `Command: ${meta.command || meta.argv?.join(' ') || '(no command recorded)'}`,
          ];
          return {
            badge: meta.status,
            shortcuts: meta.status === 'running' ? `x stop ${resolveIcon('separator', '·')} ` : '',
            wideRows: metadata,
            narrowRows: metadata,
          };
        },
        handleInput: (data, panel) => {
          if (data !== '[' && data !== ']') return false;
          const meta = panel.selectedItem();
          if (!meta) return true;
          const current = currentPage(meta);
          if (data === ']' && hasNext) {
            cursors[++index] = current.nextCursor;
          } else if (data === '[' && index > 0) index--;
          else return true;
          page = undefined;
          panel.selectItem(meta.id);
          return true;
        },
        invalidate: () => {
          revision = undefined;
        },
      },
      {
        ...options,
        title: 'Background',
        listLabel: 'tasks',
        emptyText: 'No background tasks recorded in this session yet.',
        closeConfirmationHint: 'x again to stop',
        footerActions: () => '[/] log page',
      },
    );
  }
}
