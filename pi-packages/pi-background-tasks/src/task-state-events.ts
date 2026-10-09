import { type FSWatcher, statSync, watch } from 'node:fs';
import { basename, dirname } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import {
  BACKGROUND_STATE_CHANNEL,
  BACKGROUND_STATE_REQUEST,
  type BackgroundSnapshot,
  type BackgroundTaskSummary,
  isBackgroundSnapshot,
  onRequest,
  publish,
} from '@thoth-agents/pi-core';
import {
  baseDir,
  belongsToOrigin,
  listTaskRecords,
  onMetaChanged,
} from './registry.js';
import type {
  BackgroundTaskCallbackOrigin,
  BackgroundTaskMeta,
} from './types.js';

function summarize(meta: BackgroundTaskMeta): BackgroundTaskSummary {
  return {
    id: meta.id,
    name: meta.name,
    kind: meta.kind,
    status: meta.status,
    // The registry has no separate creation timestamp.
    createdAt: meta.startedAt,
    startedAt: meta.startedAt,
    endedAt: meta.endedAt,
    deadlineAt: meta.deadlineAt,
    lastCheckedAt: meta.lastCheckedAt,
    lastProgressAt: meta.lastProgressAt,
    stopRequestedAt: meta.stopRequestedAt,
    dismissedAt: meta.dismissedAt,
    exitCode: meta.lastExitCode,
    signal: meta.lastSignal,
    dismissed: meta.dismissedAt !== undefined,
  };
}

/** Watch directories, not meta.json inodes or indexes: writers replace files atomically. */
function watchRegistry(onChange: () => void): () => void {
  const directory = baseDir();
  let registryWatch: FSWatcher | undefined;
  let parentWatch: FSWatcher | undefined;

  function refresh(): void {
    let exists = false;
    try {
      exists = statSync(directory).isDirectory();
    } catch {
      /* Not created yet. */
    }
    if (!exists) {
      registryWatch?.close();
      registryWatch = undefined;
      return;
    }
    if (registryWatch) return;
    try {
      registryWatch = watch(
        directory,
        { recursive: true, persistent: false },
        (_event, filename) => {
          const path = filename?.toString().replaceAll('\\', '/');
          if (
            !path ||
            path === 'tasks' ||
            (path.startsWith('tasks/') &&
              (path.split('/').length === 2 || path.endsWith('/meta.json')))
          ) {
            onChange();
          }
        },
      );
      registryWatch.on('error', () => {
        registryWatch?.close();
        registryWatch = undefined;
      });
    } catch {
      /* The parent watch can retry after a directory change. */
    }
  }

  // A nonrecursive parent watch covers an empty registry without scanning the OS temp tree.
  try {
    parentWatch = watch(
      dirname(directory),
      { persistent: false },
      (_event, filename) => {
        if (filename && filename.toString() !== basename(directory)) return;
        refresh();
        onChange();
      },
    );
    parentWatch.on('error', () => {
      parentWatch?.close();
      parentWatch = undefined;
    });
  } catch {
    /* An unavailable registry must not break extension startup. */
  }
  refresh();
  return () => {
    registryWatch?.close();
    parentWatch?.close();
  };
}

export function registerBackgroundTaskStateEvents(pi: ExtensionAPI): void {
  if (!pi.events) return;
  let origin: BackgroundTaskCallbackOrigin | undefined;
  let lastSnapshot: string | undefined;
  let pendingChange: ReturnType<typeof setTimeout> | undefined;
  let offMeta: (() => void) | undefined;
  let offWatch: (() => void) | undefined;
  let offRequest: (() => void) | undefined;
  const pendingRequests = new Set<string>();

  function connectRequests(): void {
    offRequest ??= onRequest(pi.events, BACKGROUND_STATE_REQUEST, {
      onRequest: ({ sessionId }) => {
        if (!origin) pendingRequests.add(sessionId);
        else if (sessionId === origin.sessionId) publishCurrent(true);
      },
    });
  }

  function publishCurrent(force = false): void {
    if (!origin?.sessionId) return;
    const currentOrigin = origin;
    const { sessionId } = origin;
    const counts: BackgroundSnapshot['counts'] = {
      running: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      timed_out: 0,
    };
    // listTaskRecords reads meta.json afresh; listMetasForOrigin uses the owned-meta cache.
    const tasks = listTaskRecords().records.flatMap(({ meta }) => {
      if (!meta || !belongsToOrigin(meta, currentOrigin)) return [];
      const task = summarize(meta);
      return isBackgroundSnapshot({ tasks: [task], counts }) ? [task] : [];
    });
    for (const task of tasks) counts[task.status]++;
    const data = { tasks, counts };
    const serialized = JSON.stringify(data);
    if (!force && serialized === lastSnapshot) return;
    lastSnapshot = serialized;
    publish(pi.events, BACKGROUND_STATE_CHANNEL, {
      sessionId,
      source: '@thoth-agents/pi-background-tasks',
      data,
    });
  }

  function scheduleChange(): void {
    if (!origin || pendingChange) return;
    pendingChange = setTimeout(() => {
      pendingChange = undefined;
      publishCurrent();
    }, 25);
    pendingChange.unref();
  }

  function unbind(): void {
    offMeta?.();
    offMeta = undefined;
    offWatch?.();
    offWatch = undefined;
    if (pendingChange) clearTimeout(pendingChange);
    pendingChange = undefined;
    origin = undefined;
    lastSnapshot = undefined;
  }

  function bind(ctx: ExtensionContext): void {
    unbind();
    let sessionId: string | undefined;
    try {
      sessionId = ctx.sessionManager?.getSessionId();
    } catch {
      return;
    }
    if (!sessionId?.trim() || !ctx.cwd?.trim()) return;
    origin = { cwd: ctx.cwd, sessionId };
    connectRequests();
    offMeta = onMetaChanged(scheduleChange);
    offWatch = watchRegistry(scheduleChange);
    // The readiness broadcast answers all queued requests once, never with a placeholder.
    publishCurrent(true);
    pendingRequests.clear();
  }

  connectRequests();
  pi.on('session_start', (_event, ctx) => bind(ctx));
  // session_before_switch is cancelable; keep the active binding until shutdown.
  pi.on('session_shutdown', () => {
    unbind();
    if (typeof offRequest === 'function') offRequest();
    offRequest = undefined;
    pendingRequests.clear();
  });
}
