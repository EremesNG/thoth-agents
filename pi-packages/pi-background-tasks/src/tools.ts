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
import type { BackgroundTaskCallbackOrigin, BackgroundTaskMeta } from "./types.js";
import { isTerminalStatus } from "./types.js";

export { renderBackgroundTaskLogDisplay } from "./render/tools.js";
export { formatLaunch } from "./output.js";

const JsonPathSchema = Type.String({
  pattern: "^\\$",
  description: "Root-prefixed JSON path, e.g. $.status or $.steps[0].status; no bare keys or wildcards.",
});

const ConditionSchema = Type.Union([
  Type.Object({ type: Type.Literal("exit_code"), equals: Type.Number() }),
  Type.Object({ type: Type.Literal("stdout_contains"), value: Type.String() }),
  Type.Object({ type: Type.Literal("stderr_contains"), value: Type.String() }),
  Type.Object({ type: Type.Literal("json_path_equals"), path: JsonPathSchema, value: Type.Any() }),
  Type.Object({ type: Type.Literal("json_path_exists"), path: JsonPathSchema }),
]);

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
  operation_id: Type.Optional(Type.Unsafe<string | null>({ anyOf: [{ type: "null" }, { type: "string" }], description: "Optional stable id (letters, digits, . _ : / -; up to 64) for one logical operation. Reuse it when you retry with a changed command, scope, or timeout: when a later task with the same operation_id succeeds, earlier failures of that operation in this session are recovered." })),
  expected_exit_codes: Type.Optional(Type.Unsafe<number[] | null>({ anyOf: [{ type: "array", items: { type: "integer", minimum: 0, maximum: 255 }, minItems: 1, maxItems: 16 }, { type: "null" }], description: "Optional distinct non-zero exit codes that are intentional for this command (e.g. [1] for a no-match probe). 0 is allowed and ignored: exit 0 is already success. Declared before launch; recorded as expected failures, not incidents needing action. Signals and timeouts are never expected." })),
};

const SHELL_GUIDANCE = 'Declare shell:"bash" (default, Pi bash syntax), shell:"powershell" (PowerShell syntax), or shell:"none" with argv for direct execution. An unavailable requested shell fails without fallback.';

const CommandFields = {
  name: Type.Optional(Type.String({ description: "Human-readable task label." })),
  argv: Type.Optional(Type.Array(Type.String(), { description: 'Argument vector. Use with shell:"none" to avoid shell parsing.' })),
  cwd: Type.Optional(Type.String({ description: "Working directory. Defaults to the current pi cwd." })),
  env: Type.Optional(StringMap("Extra environment variables.")),
  max_log_bytes: Type.Optional(Type.Number({ description: "Maximum retained raw-log bytes. Default 4194304 (4 MiB). Older output is compacted while the task runs." })),
  callback: Type.Optional(Type.Boolean({ description: "Queue a follow-up when the task reaches a terminal state. Default true." })),
  timeout_seconds: Type.Optional(Type.Number({ description: "Optional timeout in seconds. Command watchers default to 900 seconds when omitted; pass 0 to disable. Spawned processes have no default timeout." })),
  ...IntentFields,
};

const BlindChecksField = Type.Optional(Type.Integer({ minimum: 0, description: "Consecutive exit-zero checks with stderr and no matched condition before flagging an actionable possibly-blind incident with the latest stderr line. Watch continues; no stderr or a matched condition recovers it. Default 3; 0 turns it off. Redirect expected stderr instead if appropriate." }));

// A check that swallows its own errors can report pending forever.
const WATCH_CHECK_GUIDANCE = "Waits up to 15s for the first check and returns its exit code with stdout and stderr tails; if it is still running, says so. "
  + "Write the check so a broken check is visible: do not end it with `exit 0` or `|| true`, because a check that exits non-zero is recorded and escalates. "
  + "Map an unknown or unparseable state to failure (exit non-zero), not to pending. Prefer structured output, e.g. `--format=json | jq -er '.status'`, over fragile format strings.";

const CursorFields = {
  cursor: Type.Optional(Type.String({ description: "Caller-owned, session-scoped cursor: replay the same page or change notice; nextCursor continues. Callers are independent." })),
  max_bytes: Type.Optional(Type.Number({ description: "UTF-8 page budget: default 1 KiB (raw 16 KiB); capped at status 2 KiB, log/list 4 KiB, raw 64 KiB." })),
  all: Type.Optional(Type.Boolean({ description: "Include other sessions. Default false; unverifiable ownership is reported as a gap." })),
};
const VerboseField = Type.Optional(Type.Boolean({ description: "Debug raw metadata, environment values omitted; paged with cursor (16 KiB default, 64 KiB cap). Default false." }));
const IdParams = Type.Object({
  id: Type.String({ description: "Background task id." }),
  verbose: VerboseField,
  ...CursorFields,
});
const StatusParams = Type.Object({
  ...IdParams.properties,
  history: Type.Optional(Type.Boolean({ description: "Include expected, recovered and superseded failure history; default shows only actionable incidents and counts the rest." })),
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
  "Use background tasks for genuinely long-running processes or repeated checks. Run short commands in the foreground.",
  "When a structured plan is active, keep it as the coordinator ledger: launch relevant background work early, continue unblocked foreground work without polling, and update the plan after inspecting each terminal result or failure.",
  "Do not treat launch as completion of the parent milestone; relevant background work must be terminal, inspected, and integrated before verification or completion.",
];

export function registerTools(pi: ExtensionAPI): void {
  const detection = detectShells();
  const detected = [...detection.available.map(shell => shell.label), ...Object.keys(detection.unavailable).map(kind => `${kind} unavailable`)];
  const shellGuidance = `${SHELL_GUIDANCE} Detected shells at registration: ${detected.join('; ')}. ${detection.available.some(shell => shell.edition === 'Desktop') ? 'Windows PowerShell 5.1 lacks &&/||; use PowerShell 5.1-compatible syntax.' : ''} Availability is revalidated at launch.`;
  const fields = {
    ...CommandFields,
    command: Type.Optional(Type.String({ description: 'Command in the declared shell syntax; required unless shell:"none" with argv.' })),
    shell: Type.Optional(Type.Union([Type.Literal('bash'), Type.Literal('powershell'), Type.Literal('none')], { default: 'bash', description: 'Command shell; use none for direct argv execution.' })),
  };
  const SpawnParams = Type.Object(fields);
  const WatchParams = Type.Object({
    ...fields,
    interval_seconds: Type.Optional(Type.Number({ description: "Polling interval in seconds. Default 30." })),
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
    ...backgroundToolRenderers("bg_task_spawn"),
    label: "BG Spawn",
    description: `Start a long-running background process and return immediately with its task id. ${shellGuidance}`,
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
    ...backgroundToolRenderers("bg_task_watch"),
    label: "BG Watch",
    description: `Poll a command in the background until success_when, failure_when, or timeout matches. ${WATCH_CHECK_GUIDANCE} ${shellGuidance}`,
    parameters: WatchParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      activeSession = getCallbackOrigin(ctx);
      const launched = await launchWatchResult(pi, params, ctx.cwd, activeSession, getActiveSession, FIRST_WATCH_CHECK_WAIT_MS, signal);
      getBackgroundTasksNavigator(pi).refresh(ctx);
      return launched;
    },
  });

  pi.registerTool({
    name: "bg_task_list",
    ...backgroundToolRenderers("bg_task_list"),
    label: "BG List",
    description: "List durable tasks newest first as compact rows. Nonblocking. Use nextCursor to reach every task, or statusCursor for no-change/failure-only updates; limit/max_bytes requests a larger page.",
    parameters: ListParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      activeSession = getCallbackOrigin(ctx);
      return text(formatList(listOptions(params, activeSession)));
    },
  });

  pi.registerTool({
    name: "bg_task_status",
    ...backgroundToolRenderers("bg_task_status"),
    label: "BG Status",
    description: "Inspect a task: compact model-facing summary with matched condition, exit/signal, stop error and failure counts before progress. Use verbose:true only for explicit metadata recovery. Accepts raw log nextCursor or incidentCursor as cursor. After a terminal callback, call this first; use bg_task_log only if insufficient.",
    parameters: StatusParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      activeSession = getCallbackOrigin(ctx);
      return text(formatStatus(inspectMeta(params.id), statusOptions(params, activeSession)));
    },
  });

  pi.registerTool({
    name: "bg_task_log",
    ...backgroundToolRenderers("bg_task_log"),
    label: "BG Log",
    description: "Read a compact 10-line terminal-aware tail. Nonblocking; lines:0 pages the retained raw log. Capture and retention loss are disclosed, never recovered as full history.",
    parameters: LogParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      activeSession = ctx ? getCallbackOrigin(ctx) : activeSession;
      return logText(params.id, logOptions(params, activeSession));
    },
  });

  pi.registerTool({
    name: "bg_task_stop",
    ...backgroundToolRenderers("bg_task_stop"),
    label: "BG Stop",
    description: "Cancel a watcher or terminate a background task. Only a task owned by the current session stops; a foreign-session or unverifiable task is refused unless all:true.",
    parameters: StatusParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      activeSession = getCallbackOrigin(ctx);
      const result = await formatStop(pi, params.id, ctx, getActiveSession, statusOptions(params, activeSession));
      getBackgroundTasksNavigator(pi).refresh(ctx);
      return text(result);
    },
  });

  pi.registerTool({
    name: "bg_task_clear",
    ...backgroundToolRenderers("bg_task_clear"),
    label: "BG Clear",
    description: "Dismiss terminal tasks without deleting their history. Running tasks must be stopped first.",
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
