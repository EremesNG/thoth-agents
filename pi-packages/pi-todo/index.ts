/** Thoth session task-list extension, forked from rpiv-todo 2.12.0. */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  bindWorkPanelLifecycle,
  ensureWorkPanel,
  publishToolDefinitions,
  registerWorkPanelProvider,
  type ToolDefinitionHandle,
  type ToolDefinitionLike,
} from '@thoth-agents/pi-core';
import { TodoStatePublisher } from './state/publish.js';
import { reinjectOpenTasks } from './state/reinjection.js';
import { replayFromBranch } from './state/replay.js';
import {
  clearActiveRenderSession,
  evictSession,
  getActiveRenderSession,
  getState,
  replaceState,
  setActiveRenderSession,
  sid,
} from './state/store.js';
import { registerTodosCommand, registerTodoTool } from './todo.js';
import { forgetCompletedList } from './todo-visibility.js';
import { createTodoWorkPanelProvider } from './todo-work-panel.js';

// Pi invalidates ctx proxies after session replacement. Only this known race
// is ignored; genuine branch replay errors must still propagate.
function isStaleCtxError(e: unknown): boolean {
  return /stale after session replacement/.test(String(e));
}

export default function (pi: ExtensionAPI) {
  const definitions: ToolDefinitionLike[] = [];
  let publication: ToolDefinitionHandle | undefined;
  const registerTool = pi.registerTool.bind(pi);
  pi.registerTool = (tool) => {
    const result = registerTool(tool);
    definitions.push(tool);
    publication?.publish([tool]);
    return result;
  };
  const statePublisher = new TodoStatePublisher(pi.events);
  let unregisterProvider: (() => void) | undefined;
  let releaseWorkPanel: (() => void) | undefined;
  let releaseLifecycle: (() => void) | undefined;
  let lifecycleGeneration = 0;

  registerTodoTool(pi);
  registerTodosCommand(pi);

  // Store observers refresh only the foreground; child replay stays isolated.
  const replaySession = (
    ctx: Parameters<typeof sid>[0] & Parameters<typeof replayFromBranch>[0],
  ): void => {
    try {
      const id = sid(ctx);
      replaceState(id, replayFromBranch(ctx));
      statePublisher.replayed(id);
    } catch (e) {
      if (!isStaleCtxError(e)) throw e;
    }
  };

  pi.on('session_start', async (_event, ctx) => {
    let id: string;
    try {
      id = sid(ctx);
      replaceState(id, replayFromBranch(ctx));
    } catch (e) {
      if (!isStaleCtxError(e)) throw e;
      return;
    }
    statePublisher.replayed(id);
    if (!ctx.hasUI) return;
    publication ??= publishToolDefinitions(definitions);
    // The first UI session owns the foreground. A child with a distinct sid
    // must never install a host or rebind the provider to its own tasks.
    if (getActiveRenderSession() === '') setActiveRenderSession(id);
    if (id !== getActiveRenderSession()) return;
    const generation = ++lifecycleGeneration;
    // Bind before the host so the prompt epoch is tracked even when Todos is the only provider.
    releaseLifecycle?.();
    releaseLifecycle = bindWorkPanelLifecycle(pi, ctx);
    forgetCompletedList(id);
    unregisterProvider ??= registerWorkPanelProvider(
      ctx,
      createTodoWorkPanelProvider({ ctx }),
    );
    const release = await ensureWorkPanel(ctx);
    if (generation !== lifecycleGeneration) {
      release();
      return;
    }
    releaseWorkPanel?.();
    releaseWorkPanel = release;
  });

  pi.on('session_compact', async (_event, ctx) => {
    replaySession(ctx);
  });

  pi.on('session_tree', async (_event, ctx) => {
    replaySession(ctx);
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    publication?.withdraw();
    publication = undefined;
    let s: string;
    try {
      s = sid(ctx);
    } catch (e) {
      if (!isStaleCtxError(e)) throw e;
      s = '';
    }
    evictSession(s);
    forgetCompletedList(s);
    if (s === '') statePublisher.dispose();
    else statePublisher.evict(s);
    if (s === '' || s === getActiveRenderSession()) {
      lifecycleGeneration++;
      try {
        releaseLifecycle?.();
        releaseLifecycle = undefined;
        releaseWorkPanel?.();
      } finally {
        releaseWorkPanel = undefined;
        try {
          unregisterProvider?.();
        } finally {
          unregisterProvider = undefined;
          clearActiveRenderSession();
        }
      }
    }
  });

  pi.on('before_agent_start', (event, ctx) => {
    reinjectOpenTasks(event, getState(sid(ctx)));
  });
}
