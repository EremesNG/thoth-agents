import { type FSWatcher, readdirSync, statSync, watch } from 'node:fs';
import { basename, dirname, join } from 'node:path';
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

/** Use nonrecursive directory watches: Linux recursive fs.watch tracks file
 * inodes and may silently miss subsequent atomic replacements of meta.json. */
function watchRegistry(onChange: () => void): () => void {
  const directory = baseDir();
  const tasksDirectory = join(directory, 'tasks');
  const watches = new Map<string, { watcher: FSWatcher; identity: string }>();
  let parentWatch: FSWatcher | undefined;

  function attach(path: string): void {
    let identity: string | undefined;
    try {
      const stat = statSync(path);
      if (stat.isDirectory()) identity = `${stat.dev}:${stat.ino}`;
    } catch {
      /* Removed or not created yet. */
    }
    const existing = watches.get(path);
    if (existing && existing.identity === identity) return;
    existing?.watcher.close();
    watches.delete(path);
    if (!identity) return;
    try {
      const watcher = watch(path, { persistent: false }, (_event, filename) => {
        const name = filename?.toString();
        if (path === directory) {
          if (name && name !== 'tasks') return;
          refresh();
        } else if (path === tasksDirectory) {
          refresh();
        } else if (name && name !== 'meta.json') {
          return;
        }
        onChange();
      });
      watches.set(path, { watcher, identity });
      watcher.on('error', () => {
        watcher.close();
        if (watches.get(path)?.watcher === watcher) watches.delete(path);
      });
    } catch {
      /* A parent directory notification can retry. */
    }
  }

  function refresh(): void {
    // Attach parents before scanning, including recovery after watcher errors.
    // A child created during the scan is then covered by a parent notification.
    attach(directory);
    attach(tasksDirectory);
    const directories = new Set([directory, tasksDirectory]);
    try {
      for (const entry of readdirSync(tasksDirectory, {
        withFileTypes: true,
      })) {
        if (entry.isDirectory()) {
          const path = join(tasksDirectory, entry.name);
          directories.add(path);
          attach(path);
        }
      }
    } catch {
      /* Not created yet. */
    }
    for (const [path, { watcher }] of watches) {
      if (directories.has(path)) continue;
      watcher.close();
      watches.delete(path);
    }
  }

  // Cover an absent registry without scanning or watching the OS temp tree recursively.
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
    for (const { watcher } of watches.values()) watcher.close();
    watches.clear();
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
