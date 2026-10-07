import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Component, OverlayHandle, TUI } from '@earendil-works/pi-tui';
import { resolveIcon } from './render-kit.js';
import type { WorkPanelProvider } from './work-panel.js';
import { createWorkPanelDetail } from './work-panel-detail.js';
import {
  getWorkPanelLifecycle,
  onWorkPanelLifecycleChanged,
} from './work-panel-lifecycle.js';
import {
  type PanelRow,
  panelCloseLabel,
  panelSections,
  renderPanel,
  safely,
  singleLine,
  workPanelRenderStatus,
} from './work-panel-render.js';

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

/**
 * coding-agent 1.0.2's custom-overlay done() calls TUI.hideOverlay(), popping the
 * top entry even when a newer UI has focus. Reroute only that synchronous call
 * to the owned handle so settling the card cannot remove the newer UI.
 * With incomplete hooks, hide only the owned handle and release host state;
 * never call the unsafe top-of-stack closer.
 */
function closeOwnedDetailOverlay(
  tui: TUI,
  handle: OverlayHandle | undefined,
  done: () => void,
  release: () => void,
): void {
  const originalHide = tui.hideOverlay;
  if (
    typeof originalHide !== 'function' ||
    typeof handle?.hide !== 'function'
  ) {
    try {
      if (typeof handle?.hide === 'function') handle.hide();
    } finally {
      release();
    }
    return;
  }
  tui.hideOverlay = () => handle.hide();
  try {
    done();
  } finally {
    tui.hideOverlay = originalHide;
    release();
  }
}

/** Internal host: optional runtime peers are loaded only after a TUI is requested. */
export function createWorkPanelHost(
  ctx: ExtensionContext,
  providers: () => WorkPanelProvider[],
  onDispose: () => void,
): WorkPanelHost {
  let agent: typeof import('@earendil-works/pi-coding-agent') | undefined;
  let toolkit: typeof import('@earendil-works/pi-tui') | undefined;
  let loaded = false;
  let disposed = false;
  let installed = false;
  let requestRender: (() => void) | undefined;
  let removeInput: (() => void) | undefined;
  let removeLifecycle: (() => void) | undefined;
  let previousFactory: EditorFactory | undefined;
  let factory: EditorFactory | undefined;
  let editor: Component | undefined;
  let tui: FocusTUI | undefined;
  let editorInvocations = 0;
  let focused = false;
  let selectedKey: string | undefined;
  let closeArm: { key: string; at: number } | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let suspended = false;
  let dismissDetail: (() => void) | undefined;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  let statusCue: string | undefined;

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
  const sections = () =>
    panelSections(providers(), Date.now(), getWorkPanelLifecycle(ctx));
  function rows(): PanelRow[] {
    const all = sections()
      .flatMap((section) => section.rows)
      .filter(({ row }) => !row.summary);
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

  const keyCodes = {
    left: '\x1b[D',
    right: '\x1b[C',
    up: '\x1b[A',
    down: '\x1b[B',
    enter: '\r',
    escape: '\x1b',
  };
  const matches = (data: string, key: keyof typeof keyCodes) =>
    toolkit?.matchesKey(data, key) ?? data === keyCodes[key];
  function open(entry: PanelRow): void {
    if (suspended || (entry.sectionSummary && !entry.provider.openHistory))
      return;
    suspended = true;
    releaseFocus();
    host.refresh();
    const sectionRows = () =>
      rows().filter((row) => row.provider.id === entry.provider.id);
    const sectionSelected = () => {
      const all = sectionRows();
      const current = all.find((row) => row.key === selectedKey) ?? all[0];
      if (current) selectedKey = current.key;
      return current;
    };
    let detailComponent: ReturnType<typeof createWorkPanelDetail> | undefined;
    let detailHandle: OverlayHandle | undefined;
    let detailFinished = false;
    const show = () => {
      if (entry.sectionSummary) return entry.provider.openHistory?.(ctx);
      if (entry.provider.open) return entry.provider.open(entry.row.id, ctx);
      return ctx.ui.custom<void>(
        (detailTui, theme, _keybindings, done) => {
          const component = createWorkPanelDetail({
            rows: sectionRows,
            selected: sectionSelected,
            select(next) {
              selectedKey = next.key;
              host.refresh();
            },
            closeItem: handleClose,
            clearCloseArm,
            done: () =>
              closeOwnedDetailOverlay(
                detailTui,
                detailHandle,
                () => done(),
                finished,
              ),
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
            wrap: (text, width) =>
              toolkit?.wrapTextWithAnsi(text, Math.max(1, width)) ??
              text.split(/\r?\n/),
            measure: (text) => toolkit?.visibleWidth(text) ?? [...text].length,
            matches,
          });
          detailComponent = component;
          dismissDetail = () => component.dismiss();
          return component;
        },
        {
          overlay: true,
          onHandle(handle) {
            detailHandle = handle;
            if (detailFinished) handle.hide();
          },
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
    return (
      !disposed &&
      !suspended &&
      editorInvocations === 1 &&
      editor !== undefined &&
      ctx.ui.getEditorComponent?.() === factory &&
      tui?.getFocusedComponent?.() === editor &&
      tui?.hasOverlay?.() === false
    );
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
      const interval = provider.refreshIntervalMs;
      if (
        interval !== undefined &&
        Number.isFinite(interval) &&
        interval > 0 &&
        rows.some(({ row }) =>
          ['running', 'in_progress'].includes(workPanelRenderStatus(row)),
        )
      ) {
        delay = Math.min(delay, Math.max(100, interval));
      }
      for (const { row } of rows)
        if (row.expiresAt !== undefined && row.expiresAt > now)
          delay = Math.min(delay, row.expiresAt - now);
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
      removeInput?.();
      removeLifecycle?.();
      if (installed) {
        ctx.ui.setWidget(WIDGET_KEY, undefined);
        ctx.ui.setStatus(WIDGET_KEY, undefined);
      }
      if (factory && ctx.ui.getEditorComponent() === factory)
        ctx.ui.setEditorComponent(previousFactory);
      onDispose();
    },
  };
  function install(): void {
    if (disposed || !providers().length) return;
    previousFactory = ctx.ui.getEditorComponent?.();
    if (
      typeof ctx.ui.setWidget !== 'function' ||
      typeof ctx.ui.onTerminalInput !== 'function' ||
      typeof ctx.ui.setEditorComponent !== 'function' ||
      typeof ctx.ui.getEditorComponent !== 'function' ||
      (!previousFactory && !agent?.CustomEditor)
    )
      return;
    const DefaultEditor = agent?.CustomEditor;
    const baseFactory: EditorFactory | undefined =
      previousFactory ??
      (DefaultEditor
        ? (liveTui, theme, keybindings) =>
            new DefaultEditor(liveTui, theme, keybindings, {
              embedWorkingStatus: true,
            })
        : undefined);
    if (!baseFactory) return;
    factory = (liveTui, theme, keybindings) => {
      tui = liveTui;
      editorInvocations += 1;
      const instance = baseFactory(liveTui, theme, keybindings);
      if (editorInvocations === 1) editor = instance;
      return instance;
    };
    ctx.ui.setEditorComponent(factory);
    ctx.ui.setWidget(
      WIDGET_KEY,
      (widgetTui, theme) => {
        requestRender = () => widgetTui.requestRender();
        return {
          render(width) {
            refreshStatusCue(rows().length);
            const entry = selected();
            const label = panelCloseLabel(entry);
            return renderPanel(sections(), width, Date.now(), theme, clip, {
              measure: toolkit?.visibleWidth,
              selectedKey: focused ? selectedKey : undefined,
              budget: Math.min(
                12,
                Math.max(0, Math.floor(widgetTui.terminal.rows / 2)),
              ),
              hint: focused
                ? [
                    !entry?.sectionSummary || rows().length > 1
                      ? `${resolveIcon('arrowUp', '↑')}${resolveIcon('arrowDown', '↓')} move`
                      : '',
                    entry?.sectionSummary
                      ? entry.provider.openHistory
                        ? 'Enter history'
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
      { placement: 'aboveEditor' },
    );
    removeInput = ctx.ui.onTerminalInput(handleInput);
    installed = true;
  }
  removeLifecycle = onWorkPanelLifecycleChanged(ctx, () => host.refresh());
  host.ready = (async () => {
    [agent, toolkit] = await Promise.all([
      import('@earendil-works/pi-coding-agent').catch(() => undefined),
      import('@earendil-works/pi-tui').catch(() => undefined),
    ]);
    loaded = true;
    host.refresh();
  })().catch(() => {
    // An absent optional SDK or UI hook must not fail extension loading.
    host.dispose();
  });
  return host;
}
