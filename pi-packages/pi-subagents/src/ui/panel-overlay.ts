import {
  getPublishedToolDefinition,
  getRenderKit,
  openOwnedOverlay,
} from '@thoth-agents/pi-core';
import { readSubagentsConfig } from '../config.js';
import type { SubagentManager } from '../manager.js';
import { truncateToWidth, visibleWidth } from '../render/text-width.js';
import { createSubagentsRenderLogger } from '../render-debug.js';
import { resolveSubagentExternalToolDefinitionFromInfo } from '../thread-view.js';
import type { SubagentTask } from '../types.js';
import {
  classifySubagentsPanelInput,
  createSubagentsPanelKeyMatcher,
} from './panel-input.js';
import type { SubagentProviderLimitCache } from './provider-limit-cache.js';
import { SubagentsHistoryPanel } from './subagents-history-panel.js';

function currentSessionId(ctx: any): string | undefined {
  const direct = ctx?.sessionManager?.getSessionId?.() ?? ctx?.sessionId;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const file = ctx?.sessionManager?.getSessionFile?.();
  return typeof file === 'string' && file.length > 0 ? file : undefined;
}

function contextWindowForTask(
  ctx: any,
  task: SubagentTask,
): number | undefined {
  const label = task.model;
  const current = ctx?.model;
  const currentLabel =
    current?.provider && current?.id
      ? `${current.provider}/${current.id}`
      : undefined;
  let model =
    !label || label === 'default/current' || label === currentLabel
      ? current
      : undefined;
  if (!model && label) {
    const separator = label.indexOf('/');
    if (separator > 0)
      model = ctx?.modelRegistry?.find?.(
        label.slice(0, separator),
        label.slice(separator + 1),
      );
  }
  const contextWindow = Number(model?.contextWindow);
  return Number.isFinite(contextWindow) && contextWindow > 0
    ? contextWindow
    : undefined;
}

function setMouseTracking(tui: any, enabled: boolean): void {
  // In Pi fullscreen mode (TuiAltScreen), the host TUI already enables and owns
  // full mouse tracking (ENABLE_BUTTON_MOTION_MOUSE / SGR mode). Emitting raw
  // disabling escapes like \u001b[?1000l can break the terminal mouse mode in
  // fullscreen or regular scroll mode upon closing or refocusing the overlay.
  if (tui?.mode === 'fullscreen') return;
  const write = tui?.terminal?.write?.bind(tui.terminal);
  if (typeof write !== 'function') return;
  write(enabled ? '\u001b[?1000h\u001b[?1006h' : '\u001b[?1006l\u001b[?1000l');
}

function toolFromRegistry(registry: any, name: string): unknown {
  if (!registry) return undefined;
  if (typeof registry.get === 'function') return registry.get(name);
  if (Array.isArray(registry))
    return registry.find((tool) => tool?.name === name);
  if (typeof registry === 'object') return registry[name];
  return undefined;
}

function toolsFromAccessor(owner: any, name: string): unknown {
  if (typeof owner?.getAllTools !== 'function') return undefined;
  try {
    const info = toolFromRegistry(owner.getAllTools(), name);
    if (getRenderKit()) return info;
    return info
      ? (resolveSubagentExternalToolDefinitionFromInfo(name, info) ?? info)
      : undefined;
  } catch {
    return undefined;
  }
}

function hasToolRenderers(tool: unknown): boolean {
  if (!tool || typeof tool !== 'object') return false;
  const definition = tool as Record<string, unknown>;
  return (
    typeof definition.renderCall === 'function' ||
    typeof definition.renderResult === 'function' ||
    definition.renderShell === 'self'
  );
}

export function resolveRegisteredToolDefinition(
  ctx: any,
  pi: any,
  name: string,
): unknown {
  const published = getPublishedToolDefinition(name);
  const kit = getRenderKit();
  if (published && (!kit || hasToolRenderers(published))) return published;
  if (kit) {
    const candidates = [
      published,
      ctx?.pi?.getToolDefinition?.(name),
      pi?.getToolDefinition?.(name),
      ctx?.getToolDefinition?.(name),
      toolFromRegistry(ctx?.pi?.tools, name),
      toolFromRegistry(pi?.tools, name),
      toolFromRegistry(ctx?.tools, name),
      toolsFromAccessor(ctx?.pi, name),
      toolsFromAccessor(pi, name),
      toolsFromAccessor(ctx, name),
    ];
    const rendered = candidates.find(hasToolRenderers);
    if (published && rendered) {
      const { renderCall, renderResult, renderShell } = rendered;
      return { ...published, renderCall, renderResult, renderShell };
    }
    return rendered ?? candidates.find(Boolean);
  }
  return (
    ctx?.pi?.getToolDefinition?.(name) ??
    pi?.getToolDefinition?.(name) ??
    ctx?.getToolDefinition?.(name) ??
    toolsFromAccessor(ctx?.pi, name) ??
    toolsFromAccessor(pi, name) ??
    toolsFromAccessor(ctx, name) ??
    toolFromRegistry(ctx?.pi?.tools, name) ??
    toolFromRegistry(pi?.tools, name) ??
    toolFromRegistry(ctx?.tools, name)
  );
}

export type SubagentsPanelOpener = (taskId?: string) => Promise<void> | void;
let activePanelOpener: SubagentsPanelOpener | undefined;
let lastPanelOpenTime = 0;

export function registerSubagentsPanelOpener(
  opener: SubagentsPanelOpener | undefined,
): void {
  activePanelOpener = opener;
  lastPanelOpenTime = 0;
}

export function resetSubagentsPanelOpenerStateForTests(): void {
  lastPanelOpenTime = 0;
}

export function openSubagentsPanel(taskId?: string): void {
  const now = Date.now();
  if (now - lastPanelOpenTime < 600) return;
  lastPanelOpenTime = now;
  if (activePanelOpener) {
    void activePanelOpener(taskId);
  }
}

export function getPanelTasks(
  manager: {
    listSessionTasks: (cwd?: string, sessionId?: string) => SubagentTask[];
  },
  cwd?: string,
  sessionId?: string,
  completedLimit = 100,
): SubagentTask[] {
  const all = manager.listSessionTasks(cwd, sessionId);
  const active = all.filter(
    (t) =>
      t.status === 'running' ||
      t.status === 'queued' ||
      t.status === 'stopping',
  );
  const completed = all.filter(
    (t) =>
      t.status !== 'running' &&
      t.status !== 'queued' &&
      t.status !== 'stopping',
  );
  const activeIds = new Set(active.map((t) => t.id));
  const completedCapped = completed.slice(0, completedLimit);
  const includedIds = new Set([
    ...activeIds,
    ...completedCapped.map((t) => t.id),
  ]);
  return all.filter((t) => includedIds.has(t.id));
}

export async function showSubagentsPanel(input: {
  ctx: any;
  pi: any;
  manager: SubagentManager;
  selectedTaskId?: string;
  providerLimits?: Pick<SubagentProviderLimitCache, 'warningText' | 'onChange'>;
  setActivePanelCancelSelected: (fn: (() => void) | undefined) => void;
  setActivePanelRequestRender: (fn: (() => void) | undefined) => void;
}) {
  const {
    ctx,
    pi,
    manager,
    selectedTaskId,
    providerLimits,
    setActivePanelCancelSelected,
    setActivePanelRequestRender,
  } = input;
  const cwd = ctx?.cwd ?? process.cwd();
  const sessionId = currentSessionId(ctx);
  let refresh: NodeJS.Timeout | undefined;
  let disposePanel: (() => void) | undefined;
  try {
    await openOwnedOverlay<void>(
      ctx,
      (tui: any, theme: any, _keybindings: any, closeOverlay: () => void) => {
        setMouseTracking(tui, true);
        const config = readSubagentsConfig(cwd);
        const renderLogger = createSubagentsRenderLogger({
          cwd,
          sessionId,
          config: config.render_debug,
        });
        let nextRenderReason = 'initial';
        let renderCycle = 0;
        const close = () => {
          disposePanel?.();
          if (refresh) clearInterval(refresh);
          renderLogger.log({ event: 'panel_disposed' });
          setMouseTracking(tui, false);
          closeOverlay();
        };
        const baseMatchesKey = createSubagentsPanelKeyMatcher(_keybindings);
        const panel = new SubagentsHistoryPanel(
          () => getPanelTasks(manager, cwd, sessionId),
          theme,
          close,
          (data: string, key: string) => {
            if (key !== 'detailCancel') return baseMatchesKey(data, key);
            const detailShortcut = config.detail_cancel_shortcut ?? 'x';
            return (
              baseMatchesKey(data, detailShortcut) ||
              baseMatchesKey(data, 'detailCancel') ||
              (detailShortcut === 'ctrl+w' &&
                _keybindings?.matches?.(data, 'tui.editor.deleteWordBackward'))
            );
          },
          visibleWidth,
          truncateToWidth,
          {
            theme,
            tui,
            cwd,
            visibleWidth,
            truncateToWidth,
            getToolDefinition: (name: string) =>
              resolveRegisteredToolDefinition(ctx, pi, name),
            getMessageRenderer: (customType: string) =>
              ctx?.pi?.getMessageRenderer?.(customType) ??
              ctx?.pi?.customMessageRenderers?.get?.(customType) ??
              ctx?.customMessageRenderers?.get?.(customType),
            showImages: ctx?.showImages,
            imageWidthCells: ctx?.imageWidthCells,
          },
          () => Math.max(12, tui?.terminal?.rows ?? process.stdout.rows ?? 42),
          (id: string) => manager.getTask(id, cwd),
          selectedTaskId,
          (id: string) =>
            manager.cancel(id, 'cancelled from subagents detail view'),
          config.detail_cancel_shortcut ?? 'x',
          {
            providerLimits,
            timeoutMs: config.timeout_ms,
            stallTimeoutMs: config.stall_timeout_ms,
            contextWindowForTask: (task: SubagentTask) =>
              contextWindowForTask(ctx, task),
          },
        );
        const unsubscribeLimits = providerLimits?.onChange(() =>
          tui.requestRender?.(),
        );
        disposePanel = () => {
          unsubscribeLimits?.();
          panel.dispose();
        };
        renderLogger.log({ event: 'panel_created' });
        renderLogger.log({
          event: 'render_requested',
          reason: nextRenderReason,
        });
        setActivePanelCancelSelected(
          () => () => panel.cancelSelectedActiveTask(),
        );
        setActivePanelRequestRender(() => () => {
          nextRenderReason = 'external';
          renderLogger.log({
            event: 'render_requested',
            reason: nextRenderReason,
          });
          tui.requestRender?.();
        });
        refresh = setInterval(() => {
          nextRenderReason = 'interval';
          renderLogger.log({
            event: 'render_requested',
            reason: nextRenderReason,
          });
          tui.requestRender?.();
        }, 1000);
        return {
          render: (width: number) => {
            const reason = nextRenderReason;
            const currentRenderCycle = ++renderCycle;
            renderLogger.log({
              event: 'render_started',
              reason,
              renderCycle: currentRenderCycle,
              dimensions: {
                stdoutColumns: process.stdout.columns,
                stdoutRows: process.stdout.rows,
                renderWidth: width,
              },
            });
            const startedAt = process.hrtime.bigint();
            const lines = panel.render(width);
            const durationMs =
              Number(process.hrtime.bigint() - startedAt) / 1_000_000;
            renderLogger.log({
              event: 'render_completed',
              reason,
              renderCycle: currentRenderCycle,
              durationMs,
              dimensions: {
                stdoutColumns: process.stdout.columns,
                stdoutRows: process.stdout.rows,
                renderWidth: width,
              },
              state: panel.getRenderDebugState(),
            });
            nextRenderReason = 'external';
            return lines;
          },
          invalidate: () => panel.invalidate(),
          handleMouse: (event: any) => {
            nextRenderReason = 'mouse';
            renderLogger.log({
              event: 'render_requested',
              reason: nextRenderReason,
            });
            const result = panel.handleMouse(event);
            if (result?.render !== false) tui.requestRender?.();
            return result;
          },
          handleInput: (data: string) => {
            renderLogger.log({
              event: 'input_received',
              input: classifySubagentsPanelInput(data, baseMatchesKey),
            });
            nextRenderReason = 'input';
            renderLogger.log({
              event: 'render_requested',
              reason: nextRenderReason,
            });
            panel.handleInput(data);
            tui.requestRender?.();
          },
        };
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
    disposePanel?.();
    setActivePanelCancelSelected(undefined);
    setActivePanelRequestRender(undefined);
    if (refresh) clearInterval(refresh);
  }
}
