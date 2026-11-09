import { createAdaptiveToolRegistrar } from "@thoth-agents/pi-core";
import { Type } from "typebox";
import { detectShells } from './shell.js';
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getBackgroundTasksNavigator } from "./navigator-provider.js";
import {
  classifyOwnership,
  formatLaunch,
  formatList,
  formatLog,
  formatMissingTask,
  formatMutationRefusal,
  formatStatus,
  formatStopResult,
  type OutputOptions,
} from "./output.js";
import { backgroundToolRenderers } from "./render/tools.js";
import { cancelCallbackBatch, getCallbackBatcher, setCallbackBatchContext } from "./shared-callback-batcher.js";
import { inspectMeta, listMetasForOrigin, readMeta, writeMeta } from "./registry.js";
import { awaitFirstWatchCheck, FIRST_WATCH_CHECK_WAIT_MS, resumeRunningTask, spawnTask, startWatchTask, stopTask, type WatchTaskParams } from "./runtime.js";
import { runTaskMaintenance } from "./maintenance.js";
import type { BackgroundTaskCallbackOrigin, BackgroundTaskMeta, Condition } from "./types.js";
import { isTerminalStatus } from "./types.js";

export { renderBackgroundTaskLogDisplay } from "./render/tools.js";
export { formatLaunch } from "./output.js";

const JsonPathSchema = Type.String({
  pattern: "^\\$",
  description: "JSON path from $; no bare keys/wildcards.",
});

// Runtime validates per-kind fields before launch; retain the discriminated TypeScript API.
const ConditionSchema = Type.Unsafe<Condition>(Type.Object({
  type: Type.String({ enum: ["exit_code", "stdout_contains", "stderr_contains", "json_path_equals", "json_path_exists"] }),
  equals: Type.Optional(Type.Number({ description: "Required for exit_code." })),
  value: Type.Optional(Type.Any({ description: "contains: string; json_path_equals: JSON." })),
  path: Type.Optional(JsonPathSchema),
}));

/**
 * String-to-string map declared with additionalProperties. Equivalent to
 * Type.Record(Type.String(), Type.String()) for accepted values; kept as the
 * plainer JSON Schema form.
 */
function StringMap(description: string) {
  return Type.Unsafe<Record<string, string>>({ type: "object", additionalProperties: { type: "string" }, description });
}

// Structured intent (#325). Validated in code before launch (no uniqueItems/pattern: some providers reject them).
// Each field also admits null, which means "not declared": models send optional fields as explicit
// null, and readTaskIntent treats null exactly like an omitted field on every Pi version. Plain
// JSON Schema `anyOf` (Type.Unsafe), not Type.Union: Pi 0.82 converts a null to "" or [] through a
// TypeBox union, and a Null-first union reports a malformed array as "must be null".
const IntentFields = {
  operation_id: Type.Optional(Type.Unsafe<string | null>({ anyOf: [{ type: "null" }, { type: "string" }], description: "Retry-stable id: letters/digits . _ : / -; max 64. Same-session success recovers prior failures, even with changed inputs." })),
  expected_exit_codes: Type.Optional(Type.Unsafe<number[] | null>({ anyOf: [{ type: "array", items: { type: "integer", minimum: 0, maximum: 255 }, minItems: 1, maxItems: 16 }, { type: "null" }], description: "Intentional distinct exit codes: expected, not actionable. 0 ignored; signals/timeouts never expected." })),
};

const SHELL_GUIDANCE = 'shell: bash (default), powershell, or none (argv, no parsing). Unavailable shells fail without fallback.';

const CommandFields = {
  name: Type.Optional(Type.String({ description: "Task label." })),
  argv: Type.Optional(Type.Array(Type.String(), { description: 'Arguments for shell:none.' })),
  cwd: Type.Optional(Type.String({ description: "Directory; default pi cwd." })),
  env: Type.Optional(StringMap("Extra environment.")),
  max_log_bytes: Type.Optional(Type.Number({ description: "Log retention bytes; default 4194304; older output compacted." })),
  callback: Type.Optional(Type.Boolean({ description: "Terminal callback; default true." })),
  timeout_seconds: Type.Optional(Type.Number({ description: "Seconds; watch default 900, spawn unlimited; 0 disables." })),
  ...IntentFields,
};

const BlindChecksField = Type.Optional(Type.Integer({ minimum: 0, description: "Consecutive exit-zero checks with stderr/no match before a possibly-blind incident (latest stderr). Continues; match/no stderr recovers. Default 3; 0 disables. Redirect expected stderr." }));

// A check that swallows its own errors can report pending forever.
const WATCH_CHECK_GUIDANCE = "Waits up to 15s for first-check exit/tails; else reports running. "
  + "Never mask check errors with `exit 0`/`|| true`; non-zero exits escalate. "
  + "Unknown/unparseable states must fail, not stay pending. Prefer structured output (JSON/jq -er), not fragile format strings.";

const CursorFields = {
  cursor: Type.Optional(Type.String({ description: "Caller-owned, session-scoped; same cursor replays page/change notice, nextCursor continues. Independent callers." })),
  max_bytes: Type.Optional(Type.Number({ description: "UTF-8 page budget: default 1 KiB (raw 16 KiB); caps: status 2 KiB, log/list 4 KiB, raw 64 KiB." })),
  all: Type.Optional(Type.Boolean({ description: "Include other sessions; default false. Unverifiable ownership is reported as a gap." })),
};
const VerboseField = Type.Optional(Type.Boolean({ description: "Raw metadata without environment values; cursor-paged. Default false." }));
const IdParams = Type.Object({
  id: Type.String({ description: "Background task id." }),
  verbose: VerboseField,
  ...CursorFields,
});
const StatusParams = Type.Object({
  ...IdParams.properties,
  history: Type.Optional(Type.Boolean({ description: "Include expected/recovered/superseded failures; default: actionable incidents plus counts of the rest." })),
});
const ListParams = Type.Object({
  status: Type.Optional(Type.Array(Type.String({ description: "Statuses to include." }))),
  limit: Type.Optional(Type.Number({ description: "Maximum tasks to show. Default 10, max 100." })),
  ...CursorFields,
});
const LogParams = Type.Object({
  id: Type.String({ description: "Background task id." }),
  lines: Type.Optional(Type.Number({ description: "Trailing display rows; default 10. Set 0 to page raw bytes from the oldest retained offset." })),
  raw: Type.Optional(Type.Boolean({ description: "Page retained raw bytes instead of a compact tail." })),
  ...CursorFields,
});
const ClearParams = Type.Object({
  id: Type.Optional(Type.String({ description: "Terminal task to dismiss; omit to dismiss all owned terminal tasks." })),
  status: Type.Optional(Type.Array(Type.String(), { description: "Filter bulk clear by status; omitted or empty means all terminal statuses. Ignored with id." })),
  max_bytes: Type.Optional(Type.Number({ description: "UTF-8 budget for missing-task or ownership diagnostics; default 1 KiB, cap 2 KiB." })),
  all: Type.Optional(Type.Boolean({ description: "Allow another session's task by id. Bulk clear stays current-session only." })),
});

const BACKGROUND_ORCHESTRATION_GUIDELINES = [
  "Use background tasks for genuinely long-running processes/repeated checks; short commands stay in the foreground.",
  "When a structured plan is active, use it as coordinator ledger: launch relevant background work early, continue unblocked foreground work without polling, and update the plan after inspecting each terminal result/failure.",
  "Launch is not parent-milestone completion: relevant background work must be terminal, inspected, and integrated before verification/completion.",
];

const BACKGROUND_NAMESPACE = {
  name: "bg_tasks",
  description: "Background processes and watches; discover bg_task_list (inventory), bg_task_log (output), bg_task_stop (cancel), bg_task_clear (dismiss).",
  instructions: [
    ...BACKGROUND_ORCHESTRATION_GUIDELINES,
    "Deferred tools: use tool_search, or codemode searchTools/describeTool, to discover and call them.",
    "bg_task_list lists newest tasks without blocking; nextCursor pages inventory, statusCursor tracks changes/failures.",
    "After a terminal callback, inspect bg_task_status first. Use bg_task_log only if insufficient: default 10-line tail; lines:0 pages retained raw bytes. Retention/capture loss cannot be recovered.",
    "bg_task_stop cancels a watcher or terminates an owned process; foreign/unverifiable ownership requires all:true.",
    "bg_task_clear dismisses terminal tasks without deleting history; stop running tasks first. Bulk clear stays current-session only.",
    "Cursors are caller-owned/session-scoped: replay with the same cursor, continue with nextCursor. Default scope is the current session; all:true includes others where supported.",
  ].join(" "),
};

export function registerTools(pi: ExtensionAPI): void {
  const occasional = createAdaptiveToolRegistrar(pi);
  const detection = detectShells(undefined, { registration: true });
  const detected = [...detection.available.map(shell => shell.label), ...Object.keys(detection.unavailable).map(kind => `${kind} unavailable`)];
  const shellGuidance = `Detected shells at registration: ${detected.join('; ')}. ${detection.available.some(shell => shell.edition === 'Desktop') ? 'Desktop 5.1 lacks &&/||.' : ''} Revalidated at launch.`;
  const fields = {
    ...CommandFields,
    command: Type.Optional(Type.String({ description: 'Shell command; required unless shell:none with argv.' })),
    shell: Type.Optional(Type.Union([Type.Literal('bash'), Type.Literal('powershell'), Type.Literal('none')], { default: 'bash', description: SHELL_GUIDANCE })),
  };
  const SpawnParams = Type.Object(fields);
  const WatchParams = Type.Object({
    ...fields,
    interval_seconds: Type.Optional(Type.Number({ description: "Poll seconds; default 30." })),
    success_when: ConditionSchema,
    failure_when: Type.Optional(ConditionSchema),
    blind_checks: BlindChecksField,
  });
  let activeSession: BackgroundTaskCallbackOrigin | undefined;
  const getActiveSession = () => activeSession;
  // No live context exists until a lifecycle event supplies one.
  getCallbackBatcher(pi).setAvailability(() => false);

  pi.on("session_start", async (_event, ctx) => {
    setCallbackBatchContext(pi, ctx);
    activeSession = getCallbackOrigin(ctx);
    for (const meta of listMetasForOrigin(activeSession)) {
      if (meta.status === "running" || (meta.callback !== false && !meta.callbackSentAt && !meta.callbackSuppressedAt)) {
        resumeRunningTask(pi, meta, getActiveSession);
      }
    }
    runTaskMaintenance({ activeOrigin: activeSession });
  });
  pi.on("agent_start", (_event, ctx) => { setCallbackBatchContext(pi, ctx); });
  pi.on("agent_settled", (_event, ctx) => { setCallbackBatchContext(pi, ctx); });
  pi.on("session_before_switch", () => {
    activeSession = undefined;
    cancelCallbackBatch(pi);
  });
  pi.on("session_shutdown", () => {
    activeSession = undefined;
    cancelCallbackBatch(pi);
  });

  pi.registerTool({
    name: "bg_task_spawn",
    exposure: "direct",
    namespace: BACKGROUND_NAMESPACE,
    ...backgroundToolRenderers("bg_task_spawn"),
    label: "BG Spawn",
    description: `Start a long process; return task id immediately. ${shellGuidance}`,
    promptGuidelines: BACKGROUND_ORCHESTRATION_GUIDELINES,
    parameters: SpawnParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      activeSession = getCallbackOrigin(ctx);
      const launched = launchResult(spawnTask(pi, params, ctx.cwd, activeSession, getActiveSession));
      getBackgroundTasksNavigator(pi).refresh(ctx);
      return launched;
    },
  });

  pi.registerTool({
    name: "bg_task_watch",
    exposure: "direct",
    namespace: BACKGROUND_NAMESPACE,
    ...backgroundToolRenderers("bg_task_watch"),
    label: "BG Watch",
    description: `Poll a command until success_when, failure_when, or timeout. ${WATCH_CHECK_GUIDANCE} ${shellGuidance}`,
    parameters: WatchParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      activeSession = getCallbackOrigin(ctx);
      const launched = await launchWatchResult(pi, params, ctx.cwd, activeSession, getActiveSession, FIRST_WATCH_CHECK_WAIT_MS, signal);
      getBackgroundTasksNavigator(pi).refresh(ctx);
      return launched;
    },
  });

  occasional.register({
    name: "bg_task_list",
    namespace: BACKGROUND_NAMESPACE,
    ...backgroundToolRenderers("bg_task_list"),
    label: "BG List",
    description: "List durable tasks as compact rows, newest first, nonblocking. nextCursor pages all tasks; statusCursor gives no-change/failure-only updates. Increase limit/max_bytes for larger pages.",
    parameters: ListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      activeSession = getCallbackOrigin(ctx);
      return text(formatList(listOptions(params, activeSession)));
    },
  });

  pi.registerTool({
    name: "bg_task_status",
    exposure: "direct",
    namespace: BACKGROUND_NAMESPACE,
    ...backgroundToolRenderers("bg_task_status"),
    label: "BG Status",
    description: "Inspect a compact model-facing summary: matched condition, exit/signal, stop error, failure counts before progress. Use verbose:true only for metadata recovery. Accepts raw-log nextCursor or incidentCursor as cursor. After a terminal callback, call this first; bg_task_log only if insufficient.",
    parameters: StatusParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      activeSession = getCallbackOrigin(ctx);
      return text(formatStatus(inspectMeta(params.id), statusOptions(params, activeSession)));
    },
  });

  occasional.register({
    name: "bg_task_log",
    namespace: BACKGROUND_NAMESPACE,
    ...backgroundToolRenderers("bg_task_log"),
    label: "BG Log",
    description: "Read a compact 10-line terminal-aware tail, nonblocking; lines:0 pages the retained raw log. Capture/retention loss is disclosed, not recoverable as full history.",
    parameters: LogParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      activeSession = ctx ? getCallbackOrigin(ctx) : activeSession;
      return logText(params.id, logOptions(params, activeSession));
    },
  });

  occasional.register({
    name: "bg_task_stop",
    namespace: BACKGROUND_NAMESPACE,
    ...backgroundToolRenderers("bg_task_stop"),
    label: "BG Stop",
    description: "Cancel a watcher or terminate a task owned by this session; foreign/unverifiable ownership requires all:true.",
    parameters: StatusParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      activeSession = getCallbackOrigin(ctx);
      const result = await formatStop(pi, params.id, ctx, getActiveSession, statusOptions(params, activeSession));
      getBackgroundTasksNavigator(pi).refresh(ctx);
      return text(result);
    },
  });

  occasional.register({
    name: "bg_task_clear",
    namespace: BACKGROUND_NAMESPACE,
    ...backgroundToolRenderers("bg_task_clear"),
    label: "BG Clear",
    description: "Dismiss terminal tasks without deleting their history; stop running tasks first.",
    parameters: ClearParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      activeSession = getCallbackOrigin(ctx);
      const result = formatClear(params, statusOptions(params, activeSession));
      getBackgroundTasksNavigator(pi).refresh(ctx);
      return text(result);
    },
  });
}

export function text(textValue: string, details?: unknown) {
  return { content: [{ type: "text" as const, text: textValue }], details };
}

/** Requested canonical UTF-8 byte budget. */
function requestedMaxBytes(params: Record<string, unknown>): number | undefined {
  const value = params.max_bytes;
  return typeof value === "number" ? value : undefined;
}

function statusOptions(params: Record<string, unknown>, origin?: BackgroundTaskCallbackOrigin): OutputOptions {
  return {
    verbose: params.verbose === true,
    history: params.history === true,
    cursor: typeof params.cursor === "string" ? params.cursor : undefined,
    maxBytes: requestedMaxBytes(params),
    all: params.all === true,
    ...scopeOptions(origin),
  };
}

function logOptions(params: Record<string, unknown>, origin?: BackgroundTaskCallbackOrigin): OutputOptions {
  const lines = params.lines;
  return {
    tailLines: typeof lines === "number" ? lines : undefined,
    raw: params.raw === true,
    cursor: typeof params.cursor === "string" ? params.cursor : undefined,
    maxBytes: requestedMaxBytes(params),
    all: params.all === true,
    ...scopeOptions(origin),
  };
}

function listOptions(params: Record<string, unknown>, origin?: BackgroundTaskCallbackOrigin): OutputOptions {
  return {
    statuses: params.status as string[] | undefined,
    limit: typeof params.limit === "number" ? params.limit : undefined,
    cursor: typeof params.cursor === "string" ? params.cursor : undefined,
    maxBytes: requestedMaxBytes(params),
    all: params.all === true,
    ...scopeOptions(origin),
  };
}

function launchResult(meta: BackgroundTaskMeta, firstCheck?: Parameters<typeof formatLaunch>[1]) {
  return text(formatLaunch(meta, firstCheck), { shell: meta.shellUsed ?? { kind: meta.shell, label: `${meta.shell ?? 'unknown'} (launch details unknown)` } });
}

/**
 * Start a watch and wait, bounded by `waitMs`, for its first check, so the launch result
 * shows what the check really prints (#359). Local watches use this path.
 */
export async function launchWatch(...args: Parameters<typeof launchWatchResult>): Promise<string> {
  return (await launchWatchResult(...args)).content[0]!.text;
}

async function launchWatchResult(
  pi: ExtensionAPI,
  params: WatchTaskParams,
  cwd: string,
  callbackOrigin: BackgroundTaskCallbackOrigin | undefined,
  getActiveSession: () => BackgroundTaskCallbackOrigin | undefined,
  waitMs = FIRST_WATCH_CHECK_WAIT_MS,
  signal?: AbortSignal,
) {
  const meta = startWatchTask(pi, params, cwd, callbackOrigin, getActiveSession);
  // Esc (the tool's abort signal) ends the wait at once; the watch itself keeps running.
  const outcome = await awaitFirstWatchCheck(meta.id, waitMs, signal);
  const latest = readMeta(meta.id) ?? meta;
  if (outcome && !("pending" in outcome && isTerminalStatus(latest.status))) return launchResult(latest, outcome);
  return launchResult(latest);
}

/** Origins whose session identity could not be read (the host threw). */
const unavailableSessionOrigins = new WeakSet<BackgroundTaskCallbackOrigin>();

function getCallbackOrigin(ctx: ExtensionContext | undefined): BackgroundTaskCallbackOrigin {
  let sessionId: string | undefined;
  let unavailable = false;
  try {
    sessionId = ctx?.sessionManager?.getSessionId();
  } catch {
    sessionId = undefined;
    unavailable = true;
  }
  const origin = { cwd: ctx?.cwd ?? "", sessionId };
  if (unavailable) unavailableSessionOrigins.add(origin);
  return origin;
}

function scopeOptions(origin?: BackgroundTaskCallbackOrigin): Pick<OutputOptions, "origin" | "sessionUnavailable"> {
  return {
    origin,
    ...(origin && unavailableSessionOrigins.has(origin) ? { sessionUnavailable: true } : {}),
  };
}

function logText(id: string, options: OutputOptions) {
  const body = formatLog(id, options);
  if (!inspectMeta(id).meta) return text(body);
  return text(body, buildBackgroundTaskLogDisplayDetails(body));
}

export function buildBackgroundTaskLogDisplayDetails(body: string) {
  const fullLines = String(body ?? "").split(/\r?\n/);
  const head = fullLines[0] || "bg_task_log";
  const rest = fullLines.slice(1);
  const compactLines = nonEmptyPreviewLines(rest);
  return {
    kind: "background-task-log-display",
    head,
    fullLineCount: fullLines.length,
    compactLines,
    foldedLineCount: Math.max(0, rest.length - compactLines.length),
  };
}

function nonEmptyPreviewLines(lines: string[]): string[] {
  const nonEmpty = lines.filter((line) => line.trim().length > 0).slice(0, 8);
  return nonEmpty.length ? nonEmpty : lines.slice(0, 3);
}

async function formatStop(
  pi: ExtensionAPI,
  id: string,
  _ctx: ExtensionContext,
  getActiveSession?: () => BackgroundTaskCallbackOrigin | undefined,
  options: OutputOptions = {},
): Promise<string> {
  const existing = inspectMeta(id);
  if (!existing.meta && !existing.found) return formatStopResult(existing, options);
  if (!existing.meta) return formatMissingTask(existing, options);
  // Same ownership rule as reads (#322): only a task owned by the current
  // session stops unless the caller passes all:true.
  const ownership = classifyOwnership(existing.meta, options);
  if (ownership !== "allow") return formatMutationRefusal(id, ownership, "stop", options);
  const meta = await stopTask(pi, id, getActiveSession);
  if (!meta) return formatStopResult({ id, found: existing.found, readable: false, error: existing.error }, options);
  return formatStopResult({ id: meta.id, meta, found: true, readable: true }, options);
}

/**
 * Dismiss terminal tasks with the same ownership rule as reads (#322). Bulk
 * clear never crosses the current session scope (stricter than reads, which
 * accept all:true for a list); clear with an id honours all:true like a read
 * by id. Tasks whose ownership cannot be verified are counted, not dismissed.
 */
function formatClear(params: Record<string, unknown>, options: OutputOptions): string {
  if (typeof params.id === "string" && params.id) return formatClearById(params.id, options);
  const statuses = params.status as string[] | undefined;
  const wanted = statuses && statuses.length > 0 ? new Set(statuses) : undefined;
  const statusLabel = wanted ? ` matching ${Array.from(wanted).join(",")}` : "";
  const origin = options.origin;
  if (!origin || options.sessionUnavailable) {
    return "Dismissed 0 terminal background tasks: the current session identity is unavailable, so no task's ownership can be verified. Clear one task with id and all:true.";
  }
  const scoped: OutputOptions = { ...options, all: false };
  const now = Date.now();
  let cleared = 0;
  let unverified = 0;
  for (const meta of listMetasForOrigin(origin)) {
    if (meta.dismissedAt !== undefined) continue;
    if (!isTerminalStatus(meta.status)) continue;
    if (wanted && !wanted.has(meta.status)) continue;
    if (classifyOwnership(meta, scoped) !== "allow") {
      unverified += 1;
      continue;
    }
    meta.dismissedAt = now;
    writeMeta(meta);
    cleared += 1;
  }
  const skipped = unverified
    ? ` ${unverified} terminal task${unverified === 1 ? "" : "s"} with unverifiable ownership ${unverified === 1 ? "was" : "were"} not dismissed; clear one with id and all:true.`
    : "";
  return `Dismissed ${cleared} terminal background task${cleared === 1 ? "" : "s"}${statusLabel}.${skipped}`;
}

function formatClearById(id: string, options: OutputOptions): string {
  const inspection = inspectMeta(id);
  if (!inspection.meta) return formatMissingTask(inspection, options);
  const meta = inspection.meta;
  const ownership = classifyOwnership(meta, options);
  if (ownership !== "allow") return formatMutationRefusal(id, ownership, "clear", options);
  if (!isTerminalStatus(meta.status)) return `Background task ${id} is ${meta.status}; only terminal tasks can be dismissed. Stop it first.`;
  if (meta.dismissedAt !== undefined) return `Background task ${id} was already dismissed.`;
  meta.dismissedAt = Date.now();
  writeMeta(meta);
  return `Dismissed terminal background task ${id} (${meta.status}).`;
}
