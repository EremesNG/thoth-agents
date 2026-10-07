import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  ensureWorkPanel,
  resolveIcon,
  registerWorkPanelProvider,
  WORK_PANEL_VERSION,
  type WorkPanelDetail,
  type WorkPanelProvider,
  type WorkPanelRow,
} from "@thoth-agents/pi-core";
import { actionableFailures, failureLabel, readFailureState } from "./shared-failure-observations.js";
import { failurePath, failureView } from "./failures.js";
import { formatDuration } from "./format-duration.js";
import { showBackgroundTasksHistory } from './history-panel.js';
import { readLog } from "./logs.js";
import { belongsToOrigin, listMetasForOrigin, onMetaChanged, readMeta, writeMeta } from "./registry.js";
import { stopTask } from "./runtime.js";
import { observeBackgroundTaskStall } from "./stall.js";
import type { BackgroundTaskCallbackOrigin, BackgroundTaskMeta, BackgroundTaskStatus } from "./types.js";

const DEFAULT_LOG_TAIL_ROWS = 25;

function createBackgroundTasksNavigator(pi: ExtensionAPI) {
  let unregister: (() => void) | undefined;
  let releasePanel: (() => void) | undefined;
  let notifyChanged: (() => void) | undefined;
  let activeOrigin: BackgroundTaskCallbackOrigin | undefined;
  let generation = 0;

  async function ensureBackgroundTasksNavigator(ctx: ExtensionContext): Promise<void> {
    const current = ++generation;
    releasePanel?.();
    releasePanel = undefined;
    activeOrigin = getNavigatorOrigin(ctx);
    // Headless instances must not replace the root session's registered UI provider.
    if (ctx.hasUI && ctx.mode === "tui" && !unregister) {
      unregister = registerWorkPanelProvider(pi, provider);
    }
    notifyChanged?.();
    const release = await ensureWorkPanel(ctx);
    // Disposal or another session start can overtake the host's lazy installation.
    if (current !== generation) release();
    else releasePanel = release;
  }

  const provider: WorkPanelProvider = {
    version: WORK_PANEL_VERSION,
    id: "background-tasks",
    label: "Background",
    priority: 30,
    retention: 'prompt',
    refreshIntervalMs: 1000,
    supportsLogTail: true,
    open: (id, ctx) => openHistory(ctx, id),
    openHistory: (ctx) => openHistory(ctx),
    summary: () => {
      const metas = sessionMetas();
      return {
        running: metas.filter((meta) => meta.status === "running").length,
        failed: metas.filter((meta) => meta.status === "failed" || meta.status === "timed_out").length,
        completed: metas.filter((meta) => meta.status === "succeeded" || meta.status === "cancelled").length,
      };
    },
    visibleCount: () => visibleMetas().filter((meta) => meta.status === "running").length,
    listRows: (now) => visibleMetas().map((meta) => rowFromMeta(meta, now)),
    detail: (id, now, options) => detailFromMeta(readActiveMeta(id), now, options),
    armCloseLabel: (row) => row.status === "running" ? "stop" : "dismiss",
    close: (id) => {
      const meta = readActiveMeta(id);
      if (!meta) return { action: "missing", providerId: "background-tasks", id };
      if (meta.status === "running") {
        void stopTask(pi, id, () => activeOrigin);
        return { action: "stopped", providerId: "background-tasks", id, status: "stopping" };
      }
      meta.dismissedAt = Date.now();
      writeMeta(meta);
      return { action: "dismissed", providerId: "background-tasks", id, status: meta.status };
    },
    onVisibleChanged: (notify) => {
      notifyChanged = notify;
      const unsubscribe = onMetaChanged(notify);
      return () => {
        unsubscribe();
        if (notifyChanged === notify) notifyChanged = undefined;
      };
    },
  };

  function readActiveMeta(id: string): BackgroundTaskMeta | undefined {
    const meta = readMeta(id);
    return meta && activeOrigin && belongsToOrigin(meta, activeOrigin) ? meta : undefined;
  }

  function sessionMetas(): BackgroundTaskMeta[] {
    return activeOrigin ? listMetasForOrigin(activeOrigin) : [];
  }

  function visibleMetas(): BackgroundTaskMeta[] {
    return sessionMetas().filter((meta) => meta.dismissedAt === undefined);
  }

  function openHistory(ctx: ExtensionContext, selectedTaskId?: string): Promise<void> {
    return showBackgroundTasksHistory(pi, ctx, getNavigatorOrigin(ctx), selectedTaskId);
  }

  return {
    ensure: ensureBackgroundTasksNavigator,
    openHistory,
    refresh(_ctx?: ExtensionContext) { notifyChanged?.(); },
    provider,
    dispose() {
      generation += 1;
      activeOrigin = undefined;
      releasePanel?.();
      releasePanel = undefined;
      unregister?.();
      unregister = undefined;
    },
  };
}
const navigators = new WeakMap<ExtensionAPI, ReturnType<typeof createBackgroundTasksNavigator>>();
export function getBackgroundTasksNavigator(pi: ExtensionAPI) {
  let navigator = navigators.get(pi);
  if (!navigator) { navigator = createBackgroundTasksNavigator(pi); navigators.set(pi, navigator); }
  return navigator;
}

function getNavigatorOrigin(ctx: ExtensionContext): BackgroundTaskCallbackOrigin {
  let sessionId: string | undefined;
  try {
    sessionId = ctx.sessionManager?.getSessionId();
  } catch {
    sessionId = undefined;
  }
  return { cwd: ctx.cwd, sessionId };
}

function rowFromMeta(meta: BackgroundTaskMeta, now: number): WorkPanelRow {
  const facts = factsForMeta(meta, now);
  const statusText = facts.join(` ${resolveIcon('separator', '·')} `) || statusLabel(meta);
  const elapsed = formatDuration(Math.round(((meta.endedAt ?? now) - meta.startedAt) / 1000) * 1000);
  return {
    providerId: "background-tasks",
    id: meta.id,
    name: meta.name,
    status: meta.status,
    state: meta.status === 'running' ? 'running' : meta.status === 'failed' || meta.status === 'timed_out' ? 'failed' : 'done',
    endedAt: meta.endedAt,
    statusTone: toneForStatus(meta.status),
    kind: meta.kind === "command_watch" ? "watch" : "process",
    elapsed,
    primary: statusText,
    segments: [
      { text: meta.name || meta.id, role: "primary" },
      { text: ` ${resolveIcon('separator', '·')} ${statusText}`, role: "secondary" },
      { text: ` ${resolveIcon('separator', '·')} ${elapsed}`, role: "meta" },
    ],
    command: commandLabel(meta),
    tool: compactCommandLabel(meta),
    secondary: secondaryLabel(meta),
    facts,
    sortStartedAt: meta.startedAt,
  };
}

function detailFromMeta(meta: BackgroundTaskMeta | undefined, now: number, options?: { logTailLines?: number }): WorkPanelDetail | null {
  if (!meta) return null;
  const view = failureView(meta.id);
  const failure = view.text;
  const log = readLog(meta.logPath, options?.logTailLines ?? DEFAULT_LOG_TAIL_ROWS);
  const command = commandLabel(meta);
  const metadata = [
    { label: "provider", value: "Background Tasks" },
    { label: "kind", value: meta.kind === "command_watch" ? "watch" : "process" },
    { label: "elapsed", value: formatDuration(Math.round(((meta.endedAt ?? now) - meta.startedAt) / 1000) * 1000) },
    { label: "cwd", value: meta.cwd },
    ...(meta.pid != null ? [{ label: "pid", value: String(meta.pid) }] : []),
    ...(meta.pgid != null ? [{ label: "pgid", value: String(meta.pgid) }] : []),
    { label: "log", value: meta.logPath },
  ];
  if (meta.deadlineAt) metadata.push({ label: "deadline", value: formatDuration(Math.round((meta.deadlineAt - now) / 1000) * 1000) });
  if (meta.lastCheckedAt) metadata.push({ label: "checked", value: `${formatDuration(Math.round((now - meta.lastCheckedAt) / 1000) * 1000)} ago` });
  if (meta.status === "running") {
    const stall = observeBackgroundTaskStall(meta, now);
    if (stall.state !== "healthy") metadata.push({ label: "activity", value: stall.state });
  }
  if (meta.lastExitCode !== undefined) metadata.push({ label: "exit", value: String(meta.lastExitCode) });
  if (meta.error) metadata.push({ label: "error", value: meta.error });
  if (meta.logDiscardedBytes) {
    const count = meta.logRetentionEvents ?? 1;
    metadata.push({ label: "log dropped", value: `${formatBytes(meta.logDiscardedBytes)} in ${count} compaction${count === 1 ? "" : "s"}` });
  }
  return {
    providerId: "background-tasks",
    id: meta.id,
    title: meta.name || meta.id,
    status: meta.status,
    statusTone: toneForStatus(meta.status),
    metadata,
    foldedSections: [{
      id: "command",
      label: "Command",
      text: command,
      collapsedText: compactCommandLabel(meta),
      expandedByDefault: true,
    }],
    evidence: {
      label: log.truncated ? "Log tail" : "Log",
      text: [failure, log.text || "(log is empty)"].filter(Boolean).join("\n"),
    },
    footerActions: [meta.status === "running" ? "x stop" : "x dismiss"],
  };
}

function toneForStatus(status: BackgroundTaskStatus): WorkPanelRow["statusTone"] {
  switch (status) {
    case "running": return "running";
    case "succeeded": return "success";
    case "failed":
    case "timed_out": return "failed";
    case "cancelled": return "muted";
    default: return "muted";
  }
}

function statusLabel(meta: BackgroundTaskMeta): string {
  if (meta.status === "running") return meta.kind === "command_watch" ? "watching condition" : "process running";
  if (meta.status === "succeeded") return "completed";
  if (meta.status === "failed" || meta.status === "timed_out") return "failed, inspect log";
  return meta.status;
}

function commandLabel(meta: BackgroundTaskMeta): string {
  if (meta.command) return meta.command;
  if (meta.argv?.length) return meta.argv.join(" ");
  return "(no command recorded)";
}

function compactCommandLabel(meta: BackgroundTaskMeta): string {
  const value = commandLabel(meta).trim();
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length <= 3) return value;
  return parts.slice(0, 3).join(" ");
}

function secondaryLabel(meta: BackgroundTaskMeta): string | undefined {
  const parts = [];
  if (meta.cwd) parts.push(meta.cwd);
  if (meta.pid != null) parts.push(`pid ${meta.pid}`);
  if (meta.lastExitCode !== undefined) parts.push(`exit ${meta.lastExitCode}`);
  return parts.length ? parts.join(` ${resolveIcon('separator', '·')} `) : undefined;
}

function factsForMeta(meta: BackgroundTaskMeta, now: number): string[] {
  const facts: string[] = [];
  const incident = actionableFailures(readFailureState(failurePath(meta.id)))[0];
  if (incident) facts.push(`${failureLabel(incident)}: ${incident.summary}`);
  if (meta.status === "running") {
    const stall = observeBackgroundTaskStall(meta, now);
    if (stall.state === "stalled") facts.push("stalled");
    else if (stall.state === "quiet") facts.push("quiet");
  }
  if (meta.kind === "command_watch" && meta.intervalMs) facts.push(`every ${formatDuration(Math.round(meta.intervalMs / 1000) * 1000)}`);
  if (meta.deadlineAt && meta.status === "running") facts.push(`${formatDuration(Math.round((meta.deadlineAt - now) / 1000) * 1000)} left`);
  if (meta.result && meta.status !== "running") {
    const reason = typeof meta.result === "object" && meta.result && "reason" in meta.result
      ? String((meta.result as { reason?: unknown }).reason)
      : "result";
    facts.push(reason);
  }
  return facts;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
