import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Component, TUI } from '@earendil-works/pi-tui';
import { type EditorSlotHandle, registerEditorSlot } from './editor-slot.js';
import { openOwnedOverlay } from './owned-overlay.js';
import { matchesPanelKey } from './panel-key.js';
import { resolveIcon } from './render-kit.js';
import type { WorkPanelProvider } from './work-panel.js';
import { createWorkPanelDetail } from './work-panel-detail.js';
import {
  getWorkPanelLifecycle,
  onWorkPanelLifecycleChanged,
} from './work-panel-lifecycle.js';
import {
  isSelectablePanelRow,
  type PanelRow,
  panelCloseLabel,
  panelLingerEndsAt,
  panelOverflowEntries,
  panelSections,
  renderPanel,
  safely,
  singleLine,
  WORK_PANEL_ANIMATION_INTERVAL_MS,
  workPanelRenderStatus,
} from './work-panel-render.js';
import { workPanelRegistry } from './work-panel-state.js';

const WIDGET_KEY = 'thoth-work-panel';
const CLOSE_KEY = 'thoth-work-panel-close';
const CLOSE_ARM_MS = 3000;
type FocusTUI = TUI & { getFocusedComponent?(): Component | null };
type EditorFactory = NonNullable<
  ReturnType<ExtensionContext['ui']['getEditorComponent']>
>;

export interface WorkPanelHost {
  sessionId: string;
  holders: number;
  ready: Promise<void>;
  isRootEditorInputActive(): boolean | undefined;
  refresh(): void;
  dispose(): void;
}

/** Internal host: optional runtime peers are loaded only after a TUI is requested. */
export function createWorkPanelHost(
  ctx: ExtensionContext,
  providers: () => WorkPanelProvider[],
  onDispose: () => void,
): WorkPanelHost {
  let agent: typeof import('@earendil-works/pi-coding-agent') | undefined;
  let toolkit: typeof import('@earendil-works/pi-tui') | undefined;
  let primitives: typeof import('./panel-primitives.js') | undefined;
  let loaded = false;
  let disposed = false;
  let installed = false;
  let requestRender: (() => void) | undefined;
  let slot: EditorSlotHandle | undefined;
  let removeLifecycle: (() => void) | undefined;
  let tui: FocusTUI | undefined;
  let focused = false;
  let selectedKey: string | undefined;
  let closeArm: { key: string; at: number } | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let suspended = false;
  let dismissDetail: (() => void) | undefined;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  let statusCue: string | undefined;
  let panelWidth: number | undefined;
  let panelTui: TUI | undefined;
  const panelBudget = () =>
    Math.min(
      12,
      Math.max(
        0,
        Math.floor((panelTui?.terminal.rows ?? tui?.terminal.rows ?? 24) / 2),
      ),
    );

  function refreshStatusCue(count: number, force = false): void {
    const next =
      count > 0 && !focused && !suspended
        ? `${resolveIcon('arrowLeft', '←')} work ${resolveIcon('separator', '·')} ${count}`
        : undefined;
    if (!force && next === statusCue) return;
    statusCue = next;
    ctx.ui.setStatus(WIDGET_KEY, next);
  }

  const clip = (text: string, width: number) =>
    toolkit?.truncateToWidth(
      text,
      Math.max(0, width),
      resolveIcon('ellipsis', '...'),
    ) ?? [...text].slice(0, Math.max(0, width)).join('');
  const measure = (text: string) =>
    primitives?.panelVisibleWidth(text) ??
    toolkit?.visibleWidth(text) ??
    [...text].length;
  const pad = (text: string, width: number) => {
    // Clip first to retain the work panel's native '...' ellipsis.
    const clipped = clip(text, width);
    const cells = measure(clipped);
    if (primitives && cells <= width && !/[\r\n\t]/.test(clipped))
      return primitives.padPanelText(clipped, width);
    return clipped + ' '.repeat(Math.max(0, width - cells));
  };
  const sections = () =>
    panelSections(providers(), Date.now(), getWorkPanelLifecycle(ctx));
  function rows(): PanelRow[] {
    const current = sections();
    const overflow = current.some(({ provider }) => provider.selectableSummary)
      ? panelOverflowEntries(
          current,
          panelWidth ??
            panelTui?.terminal.columns ??
            tui?.terminal.columns ??
            100,
          Date.now(),
          panelBudget(),
          focused ? selectedKey : undefined,
        )
      : new Map<string, PanelRow[]>();
    const all = current
      .flatMap((section) => [
        ...section.rows,
        ...(overflow.get(section.provider.id) ?? []),
      ])
      .filter(isSelectablePanelRow);
    if (!all.some((entry) => entry.key === selectedKey))
      selectedKey = all[0]?.key;
    if (!all.length) releaseFocus();
    return all;
  }
  const selected = () => rows().find((entry) => entry.key === selectedKey);

  function clearCloseArm(): void {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = undefined;
    if (!closeArm) return;
    closeArm = undefined;
    ctx.ui.setStatus(CLOSE_KEY, undefined);
  }
  function releaseFocus(): void {
    focused = false;
    clearCloseArm();
  }
  function handleClose(entry: PanelRow): void {
    const label = panelCloseLabel(entry);
    if (!label) return;
    const now = Date.now();
    if (
      closeArm?.key === entry.key &&
      now >= closeArm.at &&
      now < closeArm.at + CLOSE_ARM_MS
    ) {
      clearCloseArm();
      safely(() => entry.provider.close(entry.row.id), undefined);
      host.refresh();
      return;
    }
    clearCloseArm();
    closeArm = { key: entry.key, at: now };
    ctx.ui.setStatus(
      CLOSE_KEY,
      `Press x again to ${label} ${singleLine(entry.row.name ?? entry.row.primary)}`,
    );
    closeTimer = setTimeout(() => {
      clearCloseArm();
      host.refresh();
    }, CLOSE_ARM_MS);
    closeTimer.unref?.();
  }

  const matches = (
    data: string,
    key: 'left' | 'right' | 'up' | 'down' | 'enter' | 'escape',
  ) => matchesPanelKey(data, key, toolkit?.matchesKey);
  function open(entry: PanelRow): void {
    if (suspended || (entry.sectionSummary && !entry.provider.openHistory))
      return;
    suspended = true;
    releaseFocus();
    host.refresh();
    const sectionRows = () =>
      rows().filter(
        (row) => row.provider.id === entry.provider.id && !row.sectionSummary,
      );
    const sectionSelected = () => {
      const all = sectionRows();
      const current = all.find((row) => row.key === selectedKey) ?? all[0];
      if (current) selectedKey = current.key;
      return current;
    };
    let detailComponent: ReturnType<typeof createWorkPanelDetail> | undefined;
    let detailFinished = false;
    const show = () => {
      if (entry.sectionSummary) return entry.provider.openHistory?.(ctx);
      if (entry.provider.open) return entry.provider.open(entry.row.id, ctx);
      return openOwnedOverlay<void>(
        ctx,
        (detailTui, theme, _keybindings, close) => {
          const component = createWorkPanelDetail({
            rows: sectionRows,
            selected: sectionSelected,
            select(next) {
              selectedKey = next.key;
              host.refresh();
            },
            closeItem: handleClose,
            clearCloseArm,
            done: () => {
              try {
                close();
              } finally {
                finished();
              }
            },
            onFocusLost: () => {
              if ((detailTui as FocusTUI).getFocusedComponent?.() !== component)
                component.dismiss();
            },
            requestRender: () => detailTui.requestRender(),
            theme,
            height: () =>
              Math.max(0, Math.floor(detailTui.terminal.rows * 0.8)),
            width: () =>
              Math.min(100, Math.floor(detailTui.terminal.columns * 0.9)),
            clip,
            pad,
            wrap: (text, width) =>
              toolkit?.wrapTextWithAnsi(text, Math.max(1, width)) ??
              text.split(/\r?\n/),
            measure,
            matches,
          });
          detailComponent = component;
          dismissDetail = () => component.dismiss();
          return component;
        },
        {
          overlayOptions: () => ({
            width: detailComponent?.width ?? 0,
            maxHeight: '80%',
            anchor: 'center',
          }),
        },
      );
    };
    const finished = () => {
      if (detailFinished) return;
      detailFinished = true;
      suspended = false;
      dismissDetail = undefined;
      releaseFocus();
      host.refresh();
    };
    try {
      void Promise.resolve(show()).then(finished, finished);
    } catch {
      finished();
    }
  }

  function rootEditorInputActive(): boolean {
    return !disposed && !suspended && slot?.isRootEditorInputActive() === true;
  }

  function handleInput(data: string): { consume: true } | undefined {
    if (!rootEditorInputActive() || ctx.ui.getEditorText?.() !== '') {
      if (focused) {
        releaseFocus();
        host.refresh();
      }
      return undefined;
    }
    const all = rows();
    if (!all.length) return undefined;
    if (!focused) {
      if (!matches(data, 'left')) return undefined;
      focused = true;
    } else if (matches(data, 'up') || matches(data, 'down')) {
      clearCloseArm();
      const index = all.findIndex((entry) => entry.key === selectedKey);
      selectedKey =
        all[
          Math.max(
            0,
            Math.min(all.length - 1, index + (matches(data, 'up') ? -1 : 1)),
          )
        ]?.key;
    } else if (matches(data, 'escape') || matches(data, 'right')) {
      releaseFocus();
    } else if (matches(data, 'enter')) {
      const entry = selected();
      if (entry?.sectionSummary && !entry.provider.openHistory)
        return undefined;
      if (entry) open(entry);
    } else if (data === 'x' || data === 'X') {
      const entry = selected();
      if (entry?.sectionSummary) return undefined;
      if (entry) handleClose(entry);
    } else return undefined;
    host.refresh();
    return { consume: true };
  }

  function stopRenderTimer(): void {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = undefined;
  }
  function scheduleRender(): void {
    stopRenderTimer();
    const now = Date.now();
    let delay = Infinity;
    for (const { provider, rows } of sections()) {
      if (
        rows.some(({ row }) =>
          ['running', 'in_progress'].includes(workPanelRenderStatus(row)),
        )
      ) {
        delay = Math.min(delay, WORK_PANEL_ANIMATION_INTERVAL_MS);
      }
      for (const { row } of rows) {
        const expiresAt =
          provider.retention === 'prompt'
            ? panelLingerEndsAt(row)
            : row.expiresAt;
        if (expiresAt !== undefined && expiresAt > now)
          delay = Math.min(delay, expiresAt - now);
      }
    }
    if (Number.isFinite(delay)) {
      renderTimer = setTimeout(() => host.refresh(), delay);
      renderTimer.unref?.();
    }
  }

  const host: WorkPanelHost = {
    sessionId: ctx.sessionManager.getSessionId(),
    holders: 0,
    ready: Promise.resolve(),
    isRootEditorInputActive: () =>
      installed ? rootEditorInputActive() : undefined,
    refresh() {
      if (disposed) return;
      if (!installed && loaded && providers().length) install();
      if (!installed) return;
      const count = rows().length;
      scheduleRender();
      refreshStatusCue(count, true);
      requestRender?.();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseFocus();
      stopRenderTimer();
      dismissDetail?.();
      slot?.dispose();
      removeLifecycle?.();
      if (installed) {
        ctx.ui.setStatus(WIDGET_KEY, undefined);
      }
      onDispose();
    },
  };
  function install(): void {
    if (
      disposed ||
      workPanelRegistry(false)?.hosts.get(ctx.sessionManager) !== host ||
      !providers().length
    )
      return;
    const DefaultEditor = agent?.CustomEditor;
    const defaultFactory: EditorFactory | undefined = DefaultEditor
      ? (liveTui, theme, keybindings) =>
          new DefaultEditor(liveTui, theme, keybindings, {
            embedWorkingStatus: true,
          })
      : undefined;
    slot = registerEditorSlot(
      ctx,
      {
        key: WIDGET_KEY,
        handleInput,
        aboveEditor: (widgetTui, theme) => {
          panelTui = widgetTui;
          requestRender = () => widgetTui.requestRender();
          return {
            render(width) {
              panelWidth = width;
              refreshStatusCue(rows().length);
              const entry = selected();
              const label = panelCloseLabel(entry);
              return renderPanel(sections(), width, Date.now(), theme, clip, {
                measure: primitives?.panelVisibleWidth ?? toolkit?.visibleWidth,
                selectedKey: focused ? selectedKey : undefined,
                budget: panelBudget(),
                hint: focused
                  ? [
                      !entry?.sectionSummary || rows().length > 1
                        ? `${resolveIcon('arrowUp', '↑')}${resolveIcon('arrowDown', '↓')} move`
                        : '',
                      entry?.sectionSummary
                        ? entry.provider.openHistory
                          ? entry.provider.retention === 'prompt'
                            ? 'Enter history'
                            : 'Enter open'
                          : ''
                        : 'Enter open',
                      label ? `x ${label}` : '',
                      'Esc back',
                    ]
                      .filter(Boolean)
                      .join(` ${resolveIcon('separator', '·')} `)
                  : `${resolveIcon('arrowLeft', '←')} interact`,
              });
            },
            invalidate() {},
          };
        },
      },
      defaultFactory,
    );
    if (!slot) return;
    tui = slot.tui;
    installed = true;
  }
  removeLifecycle = onWorkPanelLifecycleChanged(ctx, () => host.refresh());
  host.ready = (async () => {
    [agent, toolkit, primitives] = await Promise.all([
      import('@earendil-works/pi-coding-agent').catch(() => undefined),
      import('@earendil-works/pi-tui').catch(() => undefined),
      import('./panel-primitives.js').catch(() => undefined),
    ]);
    loaded = true;
    host.refresh();
  })().catch(() => {
    // An absent optional SDK or UI hook must not fail extension loading.
    host.dispose();
  });
  return host;
}
