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
import { failurePath, failureView, isDeclaredExpectedExit } from "./failures.js";
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
  let unsubscribeRegistry: (() => void) | undefined;
  let snapshot: Array<{ meta: BackgroundTaskMeta; classification: TaskClassification }> | undefined;

  async function ensureBackgroundTasksNavigator(ctx: ExtensionContext): Promise<void> {
    const current = ++generation;
    releasePanel?.();
    releasePanel = undefined;
    activeOrigin = getNavigatorOrigin(ctx);
    snapshot = undefined;
    // A successful retry can recover another task's journal without rewriting its metadata.
    // Treat every registry notification as a new classification generation for the whole session.
    unsubscribeRegistry ??= onMetaChanged(() => {
      snapshot = undefined;
      notifyChanged?.();
    });
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
      const tasks = sessionSnapshot();
      return {
        running: tasks.filter(({ meta }) => meta.status === "running").length,
        failed: tasks.filter(({ classification }) => classification.glyph === "failed" || classification.glyph === "timedOut").length,
        completed: tasks.filter(({ classification }) => classification.glyph === "completed" || classification.glyph === "expectedExit").length,
        cancelled: tasks.filter(({ classification }) => classification.glyph === "cancelled").length,
      };
    },
    visibleCount: () => sessionSnapshot().filter(({ meta }) => meta.dismissedAt === undefined && meta.status === "running").length,
    listRows: (now) => sessionSnapshot().filter(({ meta }) => meta.dismissedAt === undefined)
      .map(({ meta, classification }) => rowFromMeta(meta, now, classification)),
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
      return () => {
        if (notifyChanged === notify) notifyChanged = undefined;
      };
    },
  };

  function readActiveMeta(id: string): BackgroundTaskMeta | undefined {
    const meta = readMeta(id);
    return meta && activeOrigin && belongsToOrigin(meta, activeOrigin) ? meta : undefined;
  }

  function sessionSnapshot() {
    return snapshot ??= (activeOrigin ? listMetasForOrigin(activeOrigin) : [])
      .sort((a, b) => b.startedAt - a.startedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(meta => ({ meta, classification: classifyTask(meta) }));
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
      snapshot = undefined;
      unsubscribeRegistry?.();
      unsubscribeRegistry = undefined;
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

interface TaskClassification {
  glyph: WorkPanelRow["statusGlyph"];
  incidentFact?: string;
}

function classifyTask(meta: BackgroundTaskMeta): TaskClassification {
  const state = readFailureState(failurePath(meta.id));
  const incident = actionableFailures(state)[0];
  let glyph: TaskClassification["glyph"] = meta.status === 'running' ? 'running'
    : meta.status === 'succeeded' ? 'completed' : meta.status === 'timed_out' ? 'timedOut'
    : meta.status === 'cancelled' ? 'cancelled' : 'failed';
  if (meta.status === 'failed') {
    const incidents = [...Object.values(state.observations), ...Object.values(state.history ?? {})];
    if (incidents.some(x => x.status === 'unresolved')) glyph = 'failed';
    else if (isDeclaredExpectedExit(meta, meta.lastExitCode) || (incidents.length > 0 && incidents.every(x => x.status === 'expected'))) glyph = 'expectedExit';
    else if (incidents.some(x => x.status === 'resolved' || x.status === 'superseded')) glyph = 'resolved';
  }
  return { glyph, incidentFact: incident ? `${failureLabel(incident)}: ${incident.summary}` : undefined };
}

function rowFromMeta(meta: BackgroundTaskMeta, now: number, classification: TaskClassification): WorkPanelRow {
  const facts = factsForMeta(meta, now, classification);
  const statusText = facts.join(` ${resolveIcon('separator', '·')} `) || statusLabel(meta);
  const elapsed = formatDuration(Math.round(((meta.endedAt ?? now) - meta.startedAt) / 1000) * 1000);
  return {
    providerId: "background-tasks",
    id: meta.id,
    name: meta.name,
    status: meta.status,
    statusGlyph: classification.glyph,
    state: meta.status === 'running' ? 'running' : meta.status === 'succeeded' ? 'done' : 'failed',
    endedAt: meta.endedAt,
    statusTone: classification.glyph === 'expectedExit' || classification.glyph === 'resolved' ? 'muted' : toneForStatus(meta.status),
    kind: meta.kind === "command_watch" ? "watch" : "process",
    elapsed,
    primary: statusText,
    identity: [
      { text: meta.name || meta.id, role: "primary" },
      { text: ` ${resolveIcon('separator', '·')} `, role: "meta" },
      { text: statusText, role: "secondary" },
    ],
    metrics: [{ key: "elapsed", segments: [{ text: elapsed, role: "meta" }] }],
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

function factsForMeta(meta: BackgroundTaskMeta, now: number, classification: TaskClassification): string[] {
  const facts: string[] = [];
  if (classification.glyph === 'timedOut') facts.push('timed out');
  else if (classification.glyph === 'expectedExit') facts.push(meta.lastExitCode == null ? 'expected exit' : `exit ${meta.lastExitCode} expected`);
  else if (classification.glyph === 'resolved') facts.push('failed, resolved');
  else if (classification.incidentFact) facts.push(classification.incidentFact);
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
