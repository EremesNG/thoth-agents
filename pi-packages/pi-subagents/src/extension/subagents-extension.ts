import { CustomEditor } from '@earendil-works/pi-coding-agent';
import {
  publishToolDefinitions,
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
import {
  ClaudeBackgroundWidget,
  ClaudeBackgroundWidgetState,
} from '../ui/background-widget.js';
import {
  registerSubagentsPanelOpener,
  showSubagentsPanel,
} from '../ui/panel-overlay.js';
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
  const widgetInputSuspensions = new Set<string>();
  let activeSessionId: string | undefined;
  let activeSessionOwner: AtelierSessionOwner | undefined;
  const setWidgetInputSuspended = (reason: string, active: boolean): void => {
    if (active) widgetInputSuspensions.add(reason);
    else widgetInputSuspensions.delete(reason);
  };
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
    (active) => {
      setWidgetInputSuspended('interaction', active);
    },
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

  let widgetCtx: any;
  let widgetRequestRender: (() => void) | undefined;
  let widgetTimer: ReturnType<typeof setInterval> | undefined;
  let removeTerminalInputListener: (() => void) | undefined;
  let removeTaskUpdateListener: (() => void) | undefined;
  let widgetState: ClaudeBackgroundWidgetState | undefined;
  let activePanelCancelSelected: (() => void) | undefined;
  let activePanelRequestRender: (() => void) | undefined;
  // Unwrap our own prior session factory instead of nesting stale identity guards.
  const editorFactories = new WeakMap<Function, any>();

  const installClaudeBackgroundWidget = (ctx: any): boolean => {
    if (typeof ctx?.ui?.setWidget !== 'function') return false;
    const cwd = ctx?.cwd ?? process.cwd();
    const sessionId = currentSessionId(ctx);
    let widgetTui: any;
    let editorInstance: any;
    let editorInvocations = 0;
    let editorIdentityLost = false;
    const loseEditorIdentity = () => {
      if (editorIdentityLost) return;
      editorIdentityLost = true;
      ctx.ui.notify?.(
        'Subagents widget navigation is unavailable: the editor was replaced. Restart the session to restore navigation.',
        'warning',
      );
    };
    let configuredFactory = ctx.ui.getEditorComponent?.();
    if (configuredFactory && editorFactories.has(configuredFactory))
      configuredFactory = editorFactories.get(configuredFactory);
    const editorFactory = (tui: any, theme: any, keybindings: any) => {
      const instance = configuredFactory
        ? configuredFactory(tui, theme, keybindings)
        : new CustomEditor(tui, theme, keybindings, {
            embedWorkingStatus: true,
          });
      editorInvocations += 1;
      if (editorInvocations === 1) editorInstance = instance;
      else loseEditorIdentity();
      return instance;
    };
    editorFactories.set(editorFactory, configuredFactory);
    if (
      typeof ctx.ui.getEditorComponent === 'function' &&
      typeof ctx.ui.setEditorComponent === 'function'
    )
      ctx.ui.setEditorComponent(editorFactory);
    widgetState = new ClaudeBackgroundWidgetState(
      () => manager.listActiveSessionTasks(cwd, sessionId),
      () => widgetRequestRender?.(),
    );
    const syncWidgetTimer = () => {
      const hasRunningTask = manager
        .listActiveSessionTasks(cwd, sessionId)
        .some((task) => task.status === 'running');
      if (hasRunningTask && !widgetTimer) {
        widgetTimer = setInterval(() => {
          widgetRequestRender?.();
          syncWidgetTimer();
        }, 100);
        widgetTimer.unref?.();
      } else if (!hasRunningTask && widgetTimer) {
        clearInterval(widgetTimer);
        widgetTimer = undefined;
      }
    };
    removeTaskUpdateListener = manager.onTaskUpdate(() => {
      widgetRequestRender?.();
      syncWidgetTimer();
    });
    syncWidgetTimer();
    if (typeof ctx?.ui?.onTerminalInput === 'function') {
      removeTerminalInputListener = ctx.ui.onTerminalInput((data: string) => {
        if (ctx.ui.getEditorComponent?.() !== editorFactory)
          loseEditorIdentity();
        const editorFocused =
          !editorIdentityLost &&
          editorInstance !== undefined &&
          widgetTui?.getFocusedComponent?.() === editorInstance &&
          widgetTui?.hasOverlay?.() === false &&
          widgetInputSuspensions.size === 0;
        const editorText =
          typeof ctx.ui.getEditorText === 'function'
            ? String(ctx.ui.getEditorText() ?? '')
            : '';
        const result = widgetState?.handleTerminalInput(data, {
          editorFocused,
          allowActivate: !editorText.trim(),
        });
        if (
          (result?.action?.type === 'open-task' ||
            result?.action?.type === 'open-history') &&
          widgetCtx
        ) {
          const selectedTaskId =
            result.action.type === 'open-task'
              ? result.action.taskId
              : undefined;
          void (async () => {
            await preloadPiComponentsForSubagentRendering();
            await showSubagentsPanel({
              ctx: widgetCtx,
              pi,
              manager,
              selectedTaskId,
              setWidgetInputSuspended: (value) => {
                setWidgetInputSuspended('panel', value);
              },
              setActivePanelCancelSelected: (fn) => {
                activePanelCancelSelected = fn;
              },
              setActivePanelRequestRender: (fn) => {
                activePanelRequestRender = fn;
              },
            });
          })();
        }
        return result;
      });
    }
    ctx.ui.setWidget(
      'subagents-claude-background',
      (tui: any, theme: any) => {
        widgetTui = tui;
        widgetRequestRender = () => tui?.requestRender?.();
        return new ClaudeBackgroundWidget(widgetState!, theme);
      },
      { placement: 'aboveEditor' },
    );
    return true;
  };

  const clearClaudeBackgroundWidget = () => {
    if (widgetTimer) clearInterval(widgetTimer);
    widgetTimer = undefined;
    widgetRequestRender = undefined;
    removeTaskUpdateListener?.();
    removeTaskUpdateListener = undefined;
    removeTerminalInputListener?.();
    removeTerminalInputListener = undefined;
    widgetState = undefined;
    widgetInputSuspensions.clear();
    widgetCtx?.ui?.setWidget?.('subagents-claude-background', undefined);
    widgetCtx = undefined;
  };

  pi.on?.('session_start', (_event: unknown, ctx: any) => {
    if (ctx.hasUI && !publication)
      publication = publishToolDefinitions(definitions);
    void preloadPiComponentsForSubagentRendering();
    clearClaudeBackgroundWidget();
    activeSessionId = currentSessionId(ctx);
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
    widgetCtx = ctx;
    registerSubagentsPanelOpener(async (taskId?: string) => {
      const currentCtx = widgetCtx ?? ctx;
      if (!currentCtx) return;
      await preloadPiComponentsForSubagentRendering();
      await showSubagentsPanel({
        ctx: currentCtx,
        pi,
        manager,
        selectedTaskId: taskId,
        setWidgetInputSuspended: (value) => {
          setWidgetInputSuspended('panel', value);
        },
        setActivePanelCancelSelected: (fn) => {
          activePanelCancelSelected = fn;
        },
        setActivePanelRequestRender: (fn) => {
          activePanelRequestRender = fn;
        },
      });
    });
    if (typeof ctx?.ui?.setWidget !== 'function') return;
    if (!installClaudeBackgroundWidget(ctx)) return;
  });

  if (usageEvents && typeof pi.appendEntry === 'function')
    pi.on?.('agent_end', () => usageEvents.flush());

  pi.on?.('session_shutdown', async () => {
    publication?.withdraw();
    publication = undefined;
    activeSessionId = undefined;
    activeSessionOwner = undefined;
    registerSubagentsPanelOpener(undefined);
    clearClaudeBackgroundWidget();
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
    handler: async (ctx: any) => {
      await preloadPiComponentsForSubagentRendering();
      await showSubagentsPanel({
        ctx,
        pi,
        manager,
        setWidgetInputSuspended: (value) => {
          setWidgetInputSuspended('panel', value);
        },
        setActivePanelCancelSelected: (fn) => {
          activePanelCancelSelected = fn;
        },
        setActivePanelRequestRender: (fn) => {
          activePanelRequestRender = fn;
        },
      });
    },
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
    handler: async (_args: string, ctx: any) => {
      await preloadPiComponentsForSubagentRendering();
      return showSubagentsPanel({
        ctx: { ...ctx, pi },
        pi,
        manager,
        setWidgetInputSuspended: (value) => {
          setWidgetInputSuspended('panel', value);
        },
        setActivePanelCancelSelected: (fn) => {
          activePanelCancelSelected = fn;
        },
        setActivePanelRequestRender: (fn) => {
          activePanelRequestRender = fn;
        },
      });
    },
  });

  pi.registerCommand?.('subagents-model', {
    description: 'Configure subagent model profiles',
    handler: async (_args: string, ctx: any) =>
      runSubagentModelsCommand({ ...ctx, pi }),
  });
}
