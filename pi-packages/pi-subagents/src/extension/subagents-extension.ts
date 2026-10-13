import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
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
import { applyProfileOrchestrator } from '../model-profiles/orchestrator.js';
import { SessionModelProfile } from '../model-profiles/session.js';
import { ModelProfileStore } from '../model-profiles/store.js';
import { runSubagentModelsCommand } from '../model-profiles-ui.js';
import {
  renderSubagentAttentionMessage,
  sendSubagentAttentionMessage,
} from '../render/attention-message.js';
import {
  renderSubagentCompletionMessage,
  sendSubagentCompletionMessage,
} from '../render/completion-message.js';
import {
  renderSubagentQuestionMessage,
  sendSubagentQuestionMessage,
} from '../render/question-message.js';
import { SubagentsStatePublisher } from '../task-state-events.js';
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
import { SubagentProviderLimitCache } from '../ui/provider-limit-cache.js';
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
  // Capture is extension-owned, never gated by UI readiness or row subscriptions.
  const providerLimits = new SubagentProviderLimitCache();
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
    'subagent-attention',
    renderSubagentAttentionMessage,
  );
  pi.registerMessageRenderer?.(
    'subagent-question',
    renderSubagentQuestionMessage,
  );
  let activeSessionId: string | undefined;
  let rootRunActive = false;
  let notificationCtx: ExtensionContext | undefined;
  // Pi followUps cannot be selectively cancelled once queued during a turn.
  const notificationOutbox: Array<() => void> = [];
  const deliverNotification = (send: () => void) => {
    // signal is live before our agent_start handler, unlike the event-owned flag.
    // Compaction/tree controllers are separate and do not appear in ctx.signal.
    if (rootRunActive || notificationCtx?.signal) notificationOutbox.push(send);
    else send();
  };
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
      deliverNotification(() => {
        if (taskSessionId && taskSessionId !== activeSessionId) return;
        if (manager.isResultAcknowledged(task)) return;
        try {
          sendSubagentCompletionMessage(pi, task, cwd);
        } catch (error) {
          if (!isStaleContextError(error)) throw error;
        }
      });
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
      deliverNotification(() => {
        if (task.session_id !== activeSessionId) return;
        if (!manager.isQuestionPending(task.id, question.request_id)) return;
        try {
          sendSubagentQuestionMessage(pi, task, question);
        } catch (error) {
          if (isStaleContextError(error))
            throw new Error(
              'Parent Pi session shutdown or replacement prevents question delivery.',
            );
          throw error;
        }
      });
    },
    (task, _cwd, attempt, generation) => {
      const sessionId = task.session_id;
      if (!sessionId || sessionId !== activeSessionId) return;
      deliverNotification(() => {
        if (
          sessionId !== activeSessionId ||
          task.session_id !== sessionId ||
          !manager.isAttentionCurrent(task.id, attempt, generation)
        )
          return;
        try {
          sendSubagentAttentionMessage(pi, task);
        } catch (error) {
          if (!isStaleContextError(error)) throw error;
        }
      });
    },
  );
  const sessionModelProfile = new SessionModelProfile(
    typeof pi.appendEntry === 'function'
      ? (type, data) => pi.appendEntry(type, data)
      : undefined,
  );
  const setSessionModelProfile = (profile?: string) => {
    sessionModelProfile.set(profile);
    manager.setSessionModelProfile(sessionModelProfile.get());
  };
  registerSubagentTools(pi, manager, process.cwd());
  const taskStateEvents = pi.events
    ? new SubagentsStatePublisher(pi.events, manager)
    : undefined;

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
      providerLimits,
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

  // turn_end carries final tool messages after every message_end interceptor.
  pi.on?.('turn_end', (event: any, ctx: ExtensionContext) => {
    if (currentSessionId(ctx) === activeSessionId)
      manager.confirmResultAcknowledgments(event.toolResults ?? []);
  });

  pi.on?.('agent_start', (_event: unknown, ctx: ExtensionContext) => {
    if (currentSessionId(ctx) === activeSessionId) rootRunActive = true;
  });

  pi.on?.('agent_settled', (_event: unknown, ctx: ExtensionContext) => {
    if (currentSessionId(ctx) !== activeSessionId) return;
    manager.clearResultAcknowledgmentCandidates();
    while (notificationOutbox.length) {
      const send = notificationOutbox.shift();
      try {
        send?.();
      } catch (error) {
        console.error(
          '[pi-subagents] Failed to deliver parent notification:',
          error,
        );
      }
    }
    rootRunActive = false;
  });

  pi.on?.('session_start', async (event: any, ctx: any) => {
    notificationOutbox.length = 0;
    rootRunActive = false;
    notificationCtx = ctx;
    manager.resetResultAcknowledgments();
    sessionModelProfile.restore(
      ctx?.sessionManager?.getBranch?.() ??
        ctx?.sessionManager?.getEntries?.() ??
        [],
    );
    manager.setSessionModelProfile(sessionModelProfile.get());
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
    taskStateEvents?.startSession(cwd, sessionId);
    const store = new ModelProfileStore({ cwd, agentDir: ctx?.agentDir });
    for (const warning of [
      ...subagentSourceWarnings(cwd),
      ...store.resolve(sessionModelProfile.get()).warnings,
    ])
      ctx?.ui?.notify?.(warning, 'warning');
    // Full history matters: a branch reset can hide existing messages.
    const history = ctx?.sessionManager?.getEntries?.();
    const isNew =
      event?.reason === 'new' ||
      (event?.reason === 'startup' &&
        Array.isArray(history) &&
        !history.some((entry: any) => entry.type === 'message'));
    if (isNew) {
      const outcome = await applyProfileOrchestrator(
        pi,
        ctx,
        store.resolve().profile,
      );
      if (outcome.status === 'unavailable' || outcome.status === 'clamped')
        ctx?.ui?.notify?.(outcome.message, 'warning');
    }
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
        listSessionTasks: () => manager.listSessionTasks(cwd, sessionId),
        persistedCounts: manager.snapshotSessionTaskCounts(cwd, sessionId),
        providerLimits,
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
    notificationOutbox.length = 0;
    rootRunActive = false;
    notificationCtx = undefined;
    manager.resetResultAcknowledgments();
    publication?.withdraw();
    publication = undefined;
    activeSessionId = undefined;
    activeSessionOwner = undefined;
    registerSubagentsPanelOpener(undefined);
    clearWorkPanel();
    taskStateEvents?.dispose();
    try {
      await manager.close();
    } catch (error) {
      console.error(
        '[pi-subagents] Failed to close subagent history during session shutdown:',
        error,
      );
    } finally {
      // Keep capture installed through the final child report during shutdown.
      providerLimits.dispose();
      usageEvents?.dispose();
    }
  });

  if (taskStateEvents) {
    for (const event of ['session_tree', 'session_compact'])
      pi.on?.(event, (_event: unknown, ctx: ExtensionContext) => {
        taskStateEvents.startSession(
          ctx?.cwd ?? process.cwd(),
          currentSessionId(ctx),
        );
      });
  }

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
      // Preserve native context getters instead of freezing them with a spread.
      runSubagentModelsCommand(
        Object.assign(Object.create(ctx), {
          pi,
          getSessionModel: () => ctx.model,
          getSessionThinkingLevel: () => pi.getThinkingLevel(),
          getSessionModelProfile: () => sessionModelProfile.get(),
          setSessionModelProfile,
          applyEffectiveProfileOrchestrator: () => {
            const store = new ModelProfileStore({
              cwd: ctx.cwd ?? process.cwd(),
              agentDir: ctx.agentDir,
            });
            return applyProfileOrchestrator(
              pi,
              ctx,
              store.resolve(sessionModelProfile.get()).profile,
            );
          },
        }),
      ),
  });
  const checkToolsOwnership = registerToolsCommand(pi);
}
