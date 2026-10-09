import {
  bindWorkPanelLifecycle,
  ensureWorkPanel,
  publishToolDefinitions,
  registerWorkPanelProvider,
  type ToolDefinitionHandle,
  type ToolDefinitionLike,
} from '@thoth-agents/pi-core';
import {
  AtelierMetadataWriter,
  type AtelierSessionOwner,
  captureAtelierSessionOwner,
} from '../atelier-metadata.js';
import { readSubagentsConfig, subagentSourceWarnings } from '../config.js';
import { SubagentManager } from '../manager.js';
import { runSubagentModelsCommand } from '../model-profiles-ui.js';
import {
  renderSubagentCompletionMessage,
  sendSubagentCompletionMessage,
} from '../render/completion-message.js';
import {
  renderSubagentQuestionMessage,
  sendSubagentQuestionMessage,
} from '../render/question-message.js';
import {
  preloadPiComponentsForSubagentRendering,
  registerSubagentExternalToolDefinition,
} from '../thread-view.js';
import {
  registerSubagentTools,
  triggerClaudeBackgroundHandoff,
} from '../tools.js';
import { registerToolsCommand } from '../tools-panel/command.js';
import {
  registerSubagentsPanelOpener,
  showSubagentsPanel,
} from '../ui/panel-overlay.js';
import { createSubagentsWorkPanelProvider } from '../ui/work-panel-provider.js';
import { SubagentUsageEvents } from '../usage-events.js';

function currentSessionId(ctx: any): string | undefined {
  const direct = ctx?.sessionManager?.getSessionId?.() ?? ctx?.sessionId;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const file = ctx?.sessionManager?.getSessionFile?.();
  return typeof file === 'string' && file.length > 0 ? file : undefined;
}

function isStaleContextError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('extension ctx is stale') ||
    message.includes('stale after session replacement or reload')
  );
}

export default function subagentsExtension(pi: any): void {
  const definitions: ToolDefinitionLike[] = [];
  let publication: ToolDefinitionHandle | undefined;
  const originalRegisterTool =
    typeof pi.registerTool === 'function'
      ? pi.registerTool.bind(pi)
      : undefined;
  if (originalRegisterTool) {
    pi.registerTool = (tool: any) => {
      registerSubagentExternalToolDefinition(tool?.name, tool);
      const result = originalRegisterTool(tool);
      definitions.push(tool);
      publication?.publish([tool]);
      return result;
    };
  }
  pi.registerMessageRenderer?.(
    'subagent-completion',
    renderSubagentCompletionMessage,
  );
  pi.registerMessageRenderer?.(
    'subagent-question',
    renderSubagentQuestionMessage,
  );
  let activeSessionId: string | undefined;
  let activeSessionOwner: AtelierSessionOwner | undefined;
  const usageEvents = pi.events
    ? new SubagentUsageEvents(
        pi.events,
        typeof pi.appendEntry === 'function'
          ? (customType, data) => pi.appendEntry(customType, data)
          : undefined,
      )
    : undefined;
  const manager = new SubagentManager(
    undefined,
    undefined,
    (task, cwd) => {
      const taskSessionId =
        typeof task?.session_id === 'string' && task.session_id.length > 0
          ? task.session_id
          : undefined;
      if (taskSessionId && taskSessionId !== activeSessionId) return;
      try {
        sendSubagentCompletionMessage(pi, task, cwd);
      } catch (error) {
        if (!isStaleContextError(error)) throw error;
      }
    },
    undefined,
    new AtelierMetadataWriter({
      appendEntry: (customType, data) => {
        pi.appendEntry?.(customType, data);
      },
      getCurrentOwner: () => activeSessionOwner,
    }),
    (parentSessionId, taskId, message) =>
      usageEvents?.recordAssistantMessage(parentSessionId, taskId, message),
    (task, question) => {
      if (!task.session_id || task.session_id !== activeSessionId)
        throw new Error(
          'The originating parent Pi session is no longer active.',
        );
      try {
        sendSubagentQuestionMessage(pi, task, question);
      } catch (error) {
        if (isStaleContextError(error))
          throw new Error(
            'Parent Pi session shutdown or replacement prevents question delivery.',
          );
        throw error;
      }
    },
  );
  registerSubagentTools(pi, manager, process.cwd());

  let panelCtx: any;
  let unregisterWorkPanel: (() => void) | undefined;
  let releaseWorkPanel: (() => void) | undefined;
  let releaseWorkPanelLifecycle: (() => void) | undefined;
  let workPanelGeneration = 0;
  let activePanelCancelSelected: (() => void) | undefined;
  let activePanelRequestRender: (() => void) | undefined;

  const openPanel = async (
    ctx: any,
    selectedTaskId?: string,
  ): Promise<void> => {
    await preloadPiComponentsForSubagentRendering();
    await showSubagentsPanel({
      ctx,
      pi,
      manager,
      selectedTaskId,
      setActivePanelCancelSelected: (fn) => {
        activePanelCancelSelected = fn;
      },
      setActivePanelRequestRender: (fn) => {
        activePanelRequestRender = fn;
      },
    });
  };

  const clearWorkPanel = () => {
    workPanelGeneration += 1;
    unregisterWorkPanel?.();
    unregisterWorkPanel = undefined;
    releaseWorkPanel?.();
    releaseWorkPanel = undefined;
    releaseWorkPanelLifecycle?.();
    releaseWorkPanelLifecycle = undefined;
    panelCtx = undefined;
  };

  pi.on?.('session_start', async (_event: unknown, ctx: any) => {
    checkToolsOwnership(ctx);
    if (ctx.hasUI && !publication)
      publication = publishToolDefinitions(definitions);
    void preloadPiComponentsForSubagentRendering();
    clearWorkPanel();
    const sessionId = currentSessionId(ctx);
    activeSessionId = sessionId;
    activeSessionOwner = captureAtelierSessionOwner(ctx);
    usageEvents?.startSession(
      activeSessionId,
      ctx?.sessionManager?.getEntries?.() ??
        ctx?.sessionManager?.getBranch?.() ??
        [],
    );
    const cwd = ctx?.cwd ?? process.cwd();
    manager.reconcileOrphanedTasks(cwd);
    for (const warning of subagentSourceWarnings(cwd))
      ctx?.ui?.notify?.(warning, 'warning');
    panelCtx = ctx;
    registerSubagentsPanelOpener((taskId?: string) =>
      openPanel(panelCtx ?? ctx, taskId),
    );
    if (!ctx.hasUI || ctx.mode !== 'tui') return;
    releaseWorkPanelLifecycle = bindWorkPanelLifecycle(pi, ctx);
    const generation = workPanelGeneration;
    unregisterWorkPanel = registerWorkPanelProvider(
      ctx,
      createSubagentsWorkPanelProvider({
        listTasks: () => manager.listActiveSessionTasks(cwd, sessionId),
        persistedCounts: manager.snapshotSessionTaskCounts(cwd, sessionId),
        onTaskUpdate: (notify) => manager.onTaskUpdate(notify),
        cancel: (id, reason) => manager.cancel(id, reason),
        open: (id, liveCtx) => openPanel(liveCtx, id),
        openHistory: (liveCtx) => openPanel(liveCtx),
        theme: () => ctx.ui.theme,
      }),
    );
    const release = await ensureWorkPanel(ctx);
    // A replacement or shutdown may finish while the host loads its optional peers.
    if (generation !== workPanelGeneration) release();
    else releaseWorkPanel = release;
  });

  if (usageEvents && typeof pi.appendEntry === 'function')
    pi.on?.('agent_end', () => usageEvents.flush());

  pi.on?.('session_shutdown', async () => {
    publication?.withdraw();
    publication = undefined;
    activeSessionId = undefined;
    activeSessionOwner = undefined;
    registerSubagentsPanelOpener(undefined);
    clearWorkPanel();
    try {
      await manager.close();
    } catch (error) {
      console.error(
        '[pi-subagents] Failed to close subagent history during session shutdown:',
        error,
      );
    } finally {
      usageEvents?.dispose();
    }
  });

  const historyPanelShortcut =
    readSubagentsConfig(process.cwd()).history_panel_shortcut ?? 'ctrl+,';
  pi.registerShortcut?.(historyPanelShortcut, {
    description: 'Show subagent history panel',
    handler: (ctx: any) => openPanel(ctx),
  });

  const detailCancelShortcut =
    readSubagentsConfig(process.cwd()).detail_cancel_shortcut ?? 'x';
  if (detailCancelShortcut.startsWith('ctrl+')) {
    pi.registerShortcut?.(detailCancelShortcut, {
      description:
        'Cancel selected running subagent from the active subagents detail panel',
      handler: async () => {
        activePanelCancelSelected?.();
        activePanelRequestRender?.();
      },
    });
  }

  const backgroundHandoffShortcut =
    readSubagentsConfig(process.cwd()).background_handoff_shortcut ?? 'ctrl+h';
  pi.registerShortcut?.(backgroundHandoffShortcut, {
    description: 'Send running subagent task to background',
    handler: async () => {
      triggerClaudeBackgroundHandoff();
    },
  });

  pi.registerCommand?.('subagents', {
    description: 'Show subagent history panel',
    handler: (_args: string, ctx: any) => openPanel({ ...ctx, pi }),
  });

  pi.registerCommand?.('subagents-model', {
    description: 'Configure subagent model profiles',
    handler: async (_args: string, ctx: any) =>
      runSubagentModelsCommand({ ...ctx, pi }),
  });
  const checkToolsOwnership = registerToolsCommand(pi);
}
