import { statSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendLine, appendWatchResult, retainLogTail, resolveMaxLogBytes } from "./logs.js";
import { evaluateCondition, validateCondition } from "./conditions.js";
import { CommandTerminationError, processExists, startCommandOnce, spawnCommand, type RunningCommand } from "./process.js";
import { currentProcessStartToken, readProcessStartToken } from "./process-identity.js";
import { ensureTaskDir, logPathFor, nextTaskId, readMeta, writeMeta } from "./registry.js";
import { failurePath, readTaskIntent, recordExitFailure, recordFailure, recoverDeclaredOperation, recoverFailure, resumeFailureAttention, scheduleFailureAttention, stopFailureAttention, suspendFailureAttention, terminalFailureAttention } from "./failures.js";
import { markFailureAttentionDelivered } from "./shared-failure-observations.js";
import { getCallbackBatcher } from "./shared-callback-batcher.js";
import { formatCallbackFacts } from "./output.js";
import type {
  BackgroundTaskCallbackOrigin,
  BackgroundTaskMeta,
  CommandResult,
  CommandSpec,
  Condition,
  FirstWatchCheck,
  TerminalResult,
} from "./types.js";
import { isTerminalStatus } from "./types.js";

export const DEFAULT_WATCH_TIMEOUT_SECONDS = 15 * 60;
/** Consecutive blind checks (exit 0, stderr, no condition matched) before a watch is flagged (#359). */
export const DEFAULT_BLIND_CHECKS = 3;
/** How long bg_task_watch waits for the first check before returning (#359). */
export const FIRST_WATCH_CHECK_WAIT_MS = 15_000;
/** How to fix a false alarm: some tools write progress or warnings to stderr on success. */
export const BLIND_CHECK_HINT = "If the stderr is expected (progress or warnings), redirect it (2>/dev/null) or set blind_checks:0.";

/**
 * Why the launch stopped waiting before the first check finished (#359): the bounded wait
 * ran out, the tool call was aborted (Esc), or the session shut down.
 */
export type FirstCheckWaitEnd = "timeout" | "aborted" | "suspended";
/** A first check's outcome, or why it is not known yet; undefined when the watch ended without one. */
export type FirstCheckOutcome = FirstWatchCheck | { pending: FirstCheckWaitEnd; waitedMs: number } | undefined;

export type ActiveSessionProvider = () => BackgroundTaskCallbackOrigin | undefined;

/** Structured intent (#325), declared by the launching agent and shared by spawns and watchers. */
export interface TaskIntentParams {
  /** Stable id shared by modified retries of one operation. */
  operation_id?: string | null;
  /** Non-zero exit codes declared intentional before launch. */
  expected_exit_codes?: number[] | null;
}

export interface SpawnTaskParams extends CommandSpec, TaskIntentParams {
  name?: string;
  callback?: boolean;
  timeout_seconds?: number;
  max_log_bytes?: number;
}

export interface WatchTaskParams extends CommandSpec, TaskIntentParams {
  name?: string;
  callback?: boolean;
  interval_seconds?: number;
  timeout_seconds?: number;
  max_log_bytes?: number;
  success_when: Condition;
  failure_when?: Condition;
  /** Consecutive blind checks before the watch is flagged (#359). Default 3; 0 turns it off. */
  blind_checks?: number;
}
interface InFlightPoll extends RunningCommand { origin: string }
const POLL_HANDOFF_KEY = Symbol.for("thoth-agents.background-tasks.poll-handoff");
interface OwnedProcessTree {
  origin: string;
  terminate(): Promise<void>;
  readonly cleanupPending: boolean;
  readonly cleanupVerified: boolean;
  readonly terminationRequested: boolean;
}
const PROCESS_HANDOFF_KEY = Symbol.for("thoth-agents.background-tasks.process-handoff");
const shared = globalThis as typeof globalThis & {
  [POLL_HANDOFF_KEY]?: Map<string, InFlightPoll>;
  [PROCESS_HANDOFF_KEY]?: Map<string, OwnedProcessTree>;
};
const inFlightPolls = shared[POLL_HANDOFF_KEY] ??= new Map<string, InFlightPoll>();
const processTrees = shared[PROCESS_HANDOFF_KEY] ??= new Map<string, OwnedProcessTree>();
const pollOrigin = (meta: BackgroundTaskMeta) => JSON.stringify([meta.logPath, meta.callbackOrigin?.cwd ?? meta.cwd, meta.callbackOrigin?.sessionId]);

/** Reattach opaque launch-time authority; persisted PID/PGID never grants ownership. */
function processTreeFor(meta: BackgroundTaskMeta, terminateTree?: () => Promise<void>): OwnedProcessTree | undefined {
  let tree = processTrees.get(meta.id);
  if (tree && tree.origin !== pollOrigin(meta)) throw new Error("Process tree belongs to another origin");
  if (!tree && terminateTree) {
    let termination: Promise<void> | undefined;
    let cleanupPending = true;
    let cleanupVerified = false;
    let terminationRequested = false;
    tree = {
      origin: pollOrigin(meta),
      get cleanupPending() { return cleanupPending; },
      get cleanupVerified() { return cleanupVerified; },
      get terminationRequested() { return terminationRequested; },
      terminate() {
        if (termination) return termination;
        terminationRequested = cleanupPending = true;
        termination = terminateTree().then(() => { cleanupPending = false; cleanupVerified = true; }, (error) => {
          termination = undefined;
          throw error;
        });
        return termination;
      },
    };
    processTrees.set(meta.id, tree);
  }
  return tree;
}

function createTaskRuntime(owner: ExtensionAPI) {

  const watcherTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const processTimeoutTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const activeProcessTimeouts = new Set<string>();

  const activePolls = new Set<string>();

  const logRetentionTimers = new Map<string, ReturnType<typeof setInterval>>();
  const LOG_RETENTION_CHECK_MS = 1000;
  const handoffTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // The handoff check backs off from 250 ms to 4 s while the task keeps running,
  // and returns to 250 ms once its process is gone so the grace period is timed closely.
  const HANDOFF_CHECK_MS = 250;
  const HANDOFF_MAX_CHECK_MS = 4_000;
  const HANDOFF_LOST_GRACE_MS = 5_000;
  let scheduledWorkSuspended = false;
  const BLIND_OPERATION = "watch-blind";

  /** In-flight first checks of watches launched by this instance, keyed by task id. */
  const firstCheckWaiters = new Map<string, { promise: Promise<FirstWatchCheck | "suspended" | undefined>; resolve: (check: FirstWatchCheck | "suspended" | undefined) => void }>();

  /**
   * Wait for a watch's first check, bounded by `timeoutMs` and `signal` (#359). Resolves a pending
   * outcome when the wait ends first, and undefined when this instance did not launch the watch
   * or the watch ended without a check.
   */
  async function awaitFirstWatchCheck(id: string, timeoutMs = FIRST_WATCH_CHECK_WAIT_MS, signal?: AbortSignal): Promise<FirstCheckOutcome> {
    const waiter = firstCheckWaiters.get(id);
    if (!waiter) return undefined;
    const started = Date.now();
    const pending = (reason: FirstCheckWaitEnd) => ({ pending: reason, waitedMs: Date.now() - started });
    if (signal?.aborted) return pending("aborted");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      // Kept referenced: the launching tool call is waiting on it, and the watch timers are
      // unref'd, so an unref'd wait could let the event loop drain before the first check.
      timer = setTimeout(() => resolve("timeout"), Math.max(0, timeoutMs));
    });
    const aborted = new Promise<"aborted">((resolve) => {
      onAbort = () => resolve("aborted");
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const outcome = await Promise.race([waiter.promise, timeout, aborted]);
      if (outcome === "timeout" || outcome === "aborted" || outcome === "suspended") return pending(outcome);
      return outcome;
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) signal?.removeEventListener("abort", onAbort);
    }
  }

  function settleFirstCheck(id: string, check: FirstWatchCheck | "suspended" | undefined): void {
    const waiter = firstCheckWaiters.get(id);
    if (!waiter) return;
    firstCheckWaiters.delete(id);
    taskRuntimes.delete(id);
    waiter.resolve(check);
  }

  function suspendScheduledWork(): void {
    scheduledWorkSuspended = true;
    for (const timer of watcherTimers.values()) clearTimeout(timer);
    for (const timer of processTimeoutTimers.values()) clearTimeout(timer);
    for (const timer of logRetentionTimers.values()) clearInterval(timer);
    for (const timer of handoffTimers.values()) clearTimeout(timer);
    handoffTimers.clear();
    watcherTimers.clear();
    processTimeoutTimers.clear();
    logRetentionTimers.clear();
    // A launch still waiting on a first check that will not run here reports it as still running.
    for (const id of [...firstCheckWaiters.keys()]) settleFirstCheck(id, "suspended");
    suspendFailureAttention(owner);
  }

  /** Allow scheduling again; called at session_start before running tasks are resumed. */
  function resumeScheduledWork(): void {
    scheduledWorkSuspended = false;
    resumeFailureAttention(owner);
  }

  function spawnTask(
    pi: ExtensionAPI,
    params: SpawnTaskParams,
    defaultCwd: string,
    callbackOrigin?: BackgroundTaskCallbackOrigin,
    getActiveSession?: ActiveSessionProvider,
  ): BackgroundTaskMeta {
    // Validate intent before creating artifacts or launching the command.
    const intent = readTaskIntent(params);
    const id = nextTaskId();
    const cwd = params.cwd ?? defaultCwd;
    const logPath = logPathFor(id);
    ensureTaskDir(id);
    const commandSpec: CommandSpec = { ...params, cwd, shell: params.shell ?? true };
    const spawned = spawnCommand(commandSpec, logPath, true);
    const now = Date.now();
    const meta: BackgroundTaskMeta = {
      id,
      name: params.name,
      kind: "process",
      status: "running",
      startedAt: now,
      lastProgressAt: now,
      deadlineAt: params.timeout_seconds ? now + params.timeout_seconds * 1000 : undefined,
      logPath,
      callback: params.callback,
      callbackOrigin,
      command: params.command,
      argv: commandSpec.argv,
      shell: commandSpec.shell,
      cwd,
      env: params.env,
      maxLogBytes: resolveMaxLogBytes(params.max_log_bytes),
      pid: spawned.child.pid,
      pidStartTime: spawned.child.pid ? readProcessStartToken(spawned.child.pid) : undefined,
      pgid: spawned.pgid,
      spawnPid: process.pid,
      spawnPidStartTime: currentProcessStartToken(),
      ...intent,
    };
    writeMeta(meta);
    processTreeFor(meta, spawned.terminate);
    scheduleLogRetention(id);
    spawned.child.on("spawn", () => {
      const latest = readMeta(id);
      if (!latest) return;
      latest.pid = meta.pid = spawned.child.pid;
      writeMeta(latest);
    });
    spawned.child.unref();
    spawned.child.on("close", (exitCode, signal) => {
      void settleProcessExit(pi, id, exitCode, signal, getActiveSession);
    });
    if (meta.deadlineAt) scheduleProcessTimeout(pi, id, meta.deadlineAt, getActiveSession);
    return meta;
  }

  async function settleProcessExit(
    pi: ExtensionAPI, id: string, exitCode: number | null, signal: NodeJS.Signals | null,
    getActiveSession?: ActiveSessionProvider,
  ): Promise<void> {
    const meta = readMeta(id);
    if (!meta || isTerminalStatus(meta.status)) return;
    meta.lastExitCode = exitCode;
    meta.lastSignal = signal;
    writeMeta(meta);
    // Requested stop/deadline cleanup owns its final state, even if the leader exits first.
    if (meta.stopRequestedAt || processTrees.get(id)?.terminationRequested) return;
    try { await processTreeFor(meta)?.terminate(); } catch (error) {
      recordStopError(meta, readableError(error));
      return;
    }
    const latest = readMeta(id);
    if (!latest || isTerminalStatus(latest.status) || latest.stopRequestedAt) return;
    enforceLogRetention(latest);
    if (exitCode !== 0) recordExitFailure(latest, "execution", `Process exited with code ${exitCode ?? "unknown"}${signal ? ` (${signal})` : ""}`, exitCode, "close", { at: Date.now() });
    else recoverFailure(latest, "execution", "close");
    finalize(latest, { status: exitCode === 0 ? "succeeded" : "failed", reason: "process exited",
      commandResult: { exitCode, signal, stdout: "", stderr: "", startedAt: latest.startedAt, endedAt: Date.now() } }, pi, getActiveSession);
  }

  function startWatchTask(
    pi: ExtensionAPI,
    params: WatchTaskParams,
    defaultCwd: string,
    callbackOrigin?: BackgroundTaskCallbackOrigin,
    getActiveSession?: ActiveSessionProvider,
  ): BackgroundTaskMeta {
    for (const [name, condition] of [["success_when", params.success_when], ["failure_when", params.failure_when]] as const) {
      const error = condition && validateCondition(condition);
      if (error) throw new Error(`${name}: ${error}`);
    }
    const blindChecks = readBlindChecks(params.blind_checks);
    const intent = readTaskIntent(params);
    const id = nextTaskId();
    const cwd = params.cwd ?? defaultCwd;
    const now = Date.now();
    const timeoutSeconds = resolveWatchTimeoutSeconds(params.timeout_seconds);
    const commandSpec: CommandSpec = { ...params, cwd, shell: params.shell ?? true };
    const meta: BackgroundTaskMeta = {
      id,
      name: params.name,
      kind: "command_watch",
      status: "running",
      startedAt: now,
      lastProgressAt: now,
      deadlineAt: timeoutSeconds ? now + timeoutSeconds * 1000 : undefined,
      intervalMs: Math.max(1, params.interval_seconds ?? 30) * 1000,
      logPath: logPathFor(id),
      callback: params.callback,
      callbackOrigin,
      command: params.command,
      argv: commandSpec.argv,
      shell: commandSpec.shell,
      cwd,
      env: params.env,
      maxLogBytes: resolveMaxLogBytes(params.max_log_bytes),
      spawnPid: process.pid,
      spawnPidStartTime: currentProcessStartToken(),
      successWhen: params.success_when,
      failureWhen: params.failure_when,
      ...(blindChecks !== undefined ? { blindChecks } : {}),
      notifyOn: "terminal",
      ...intent,
    };
    ensureTaskDir(id);
    appendLine(meta.logPath, `--- watch ${new Date(now).toISOString()} interval_ms=${meta.intervalMs} ---`);
    writeMeta(meta);
    let resolveFirst!: (check: FirstWatchCheck | "suspended" | undefined) => void;
    const firstCheck = new Promise<FirstWatchCheck | "suspended" | undefined>((resolve) => { resolveFirst = resolve; });
    firstCheckWaiters.set(id, { promise: firstCheck, resolve: resolveFirst });
    scheduleWatch(pi, id, 0, getActiveSession);
    return meta;
  }

  function readBlindChecks(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new Error("blind_checks must be a non-negative integer (0 turns the blind-check rule off).");
    }
    return value;
  }

  function resolveWatchTimeoutSeconds(timeoutSeconds: number | undefined): number | undefined {
    if (timeoutSeconds === undefined) return DEFAULT_WATCH_TIMEOUT_SECONDS;
    if (timeoutSeconds <= 0) return undefined;
    return timeoutSeconds;
  }

  function resumeRunningTask(
    pi: ExtensionAPI,
    meta: BackgroundTaskMeta,
    getActiveSession?: ActiveSessionProvider,
  ): BackgroundTaskMeta {
    if (meta.status !== "running") {
      void notifyTerminal(pi, meta, getActiveSession);
      return meta;
    }
    scheduleFailureAttention(pi, meta.id, getActiveSession);

    // Same Pi process: an earlier (reloaded or switched-away) extension instance may
    const ownedByThisProcess = meta.spawnPid === process.pid && meta.spawnPidStartTime === currentProcessStartToken();
    if (!ownedByThisProcess) {
      // A process restart never reconstructs launch authority from stored PIDs.
      meta.stopError = "Container ownership is unavailable in this Pi process";
      writeMeta(meta);
      return meta;
    }

    if (meta.kind === "command_watch") {
      scheduleWatch(pi, meta.id, 0, getActiveSession);
      return meta;
    }

    processTreeFor(meta);
    scheduleLogRetention(meta.id);
    if (ownedByThisProcess) {
      // A dead pid is not yet "lost" here: the earlier instance's close listener may
      // still record the real exit. The handoff marks it lost after a grace period.
      scheduleHandoff(pi, meta.id, getActiveSession);
    } else if (meta.pid && !processExists(meta.pid)) {
      void markProcessLost(pi, meta, getActiveSession);
      return meta;
    }
    if (meta.deadlineAt) scheduleProcessTimeout(pi, meta.id, meta.deadlineAt, getActiveSession);
    return meta;
  }

  function scheduleHandoff(
    pi: ExtensionAPI,
    id: string,
    getActiveSession?: ActiveSessionProvider,
  ): void {
    stopHandoff(id);
    if (scheduledWorkSuspended) return;
    let deadSince: number | undefined;
    let delayMs = HANDOFF_CHECK_MS;
    const check = () => {
      handoffTimers.delete(id);
      const meta = readMeta(id);
      if (!meta) {
        stopHandoff(id);
        return;
      }
      if (meta.status !== "running") {
        stopHandoff(id);
        clearProcessTimeout(id);
        stopLogRetention(id);
        void notifyTerminal(pi, meta, getActiveSession);
        return;
      }
      if (processTrees.get(id)?.terminationRequested || meta.stopRequestedAt) {
        // The leader may be gone while a captured orphan still needs cleanup.
        deadSince = undefined;
        delayMs = Math.min(HANDOFF_MAX_CHECK_MS, delayMs * 2);
      } else if (meta.pid && !processExists(meta.pid)) {
        deadSince ??= Date.now();
        if (Date.now() - deadSince >= HANDOFF_LOST_GRACE_MS) {
          stopHandoff(id);
          void markProcessLost(pi, meta, getActiveSession);
          return;
        }
        delayMs = HANDOFF_CHECK_MS;
      } else {
        delayMs = Math.min(HANDOFF_MAX_CHECK_MS, delayMs * 2);
      }
      arm();
    };
    const arm = () => {
      if (scheduledWorkSuspended) return;
      const timer = setTimeout(check, delayMs);
      timer.unref();
      handoffTimers.set(id, timer);
    };
    arm();
  }

  function stopHandoff(id: string): void {
    const timer = handoffTimers.get(id);
    if (timer) clearTimeout(timer);
    handoffTimers.delete(id);
  }

  async function markProcessLost(pi: ExtensionAPI, meta: BackgroundTaskMeta, getActiveSession?: ActiveSessionProvider): Promise<void> {
    if (processTrees.get(meta.id)?.terminationRequested || meta.stopRequestedAt) return;
    // Absence of the leader cannot release captured identities or a surviving POSIX group.
    try { await processTreeFor(meta)?.terminate(); } catch (error) {
      recordStopError(meta, readableError(error));
      return;
    }
    const latest = readMeta(meta.id);
    if (!latest || latest.status !== "running" || latest.stopRequestedAt) return;
    latest.error = "process is no longer alive; exit result was not captured by this pi session";
    recordFailure(latest, "execution", latest.error, "lost", { incomplete: true });
    finalize(latest, { status: "failed", reason: latest.error }, pi, getActiveSession);
  }

  async function stopTask(
    pi: ExtensionAPI,
    id: string,
    getActiveSession?: ActiveSessionProvider,
  ): Promise<BackgroundTaskMeta | undefined> {
    const meta = readMeta(id);
    if (!meta) return undefined;
    if (isTerminalStatus(meta.status)) return meta;

    meta.stopRequestedAt = Date.now();
    writeMeta(meta);
    clearWatchTimer(id);
    clearProcessTimeout(id);

    const poll = inFlightPolls.get(id);
    if (poll) {
      try { await poll.terminate(); } catch (error) {
        recordStopError(meta, readableError(error));
        return meta;
      }
      if (inFlightPolls.get(id) === poll) inFlightPolls.delete(id);
    }

    if (meta.kind === "process") {
      try {
        const container = processTreeFor(meta);
        if (!container) throw new Error("Container ownership is unavailable; refusing PID-based termination");
        await container.terminate();
      } catch (error) {
        recordStopError(meta, error instanceof Error ? error.message : String(error));
        if (meta.deadlineAt && meta.deadlineAt > Date.now()) {
          scheduleProcessTimeout(pi, id, meta.deadlineAt, getActiveSession);
        }
        return meta;
      }
    }

    const latest = readMeta(id);
    if (!latest || isTerminalStatus(latest.status)) return latest;
    processTrees.delete(id);
    stopFailureAttention(id, owner);
    latest.status = "cancelled";
    latest.stopError = undefined;
    latest.endedAt = Date.now();
    latest.result = { reason: "cancelled" };
    writeMeta(latest);
    stopLogRetention(id);
    void notifyTerminal(pi, latest, getActiveSession);
    return latest;
  }

  function recordStopError(meta: BackgroundTaskMeta, message: string): void {
    // Preserve leader exit facts written while termination was in flight.
    const latest = readMeta(meta.id) ?? meta;
    Object.assign(meta, latest);
    meta.stopRequestedAt = undefined;
    meta.stopError = message;
    meta.error = message;
    writeMeta(meta);
  }

  function scheduleWatch(
    pi: ExtensionAPI,
    id: string,
    delayMs: number,
    getActiveSession?: ActiveSessionProvider,
  ): void {
    clearWatchTimer(id);
    if (scheduledWorkSuspended) return;
    const timer = setTimeout(() => void pollWatch(pi, id, getActiveSession), delayMs);
    timer.unref();
    watcherTimers.set(id, timer);
  }

  function clearWatchTimer(id: string): void {
    const timer = watcherTimers.get(id);
    if (timer) clearTimeout(timer);
    watcherTimers.delete(id);
  }

  async function pollWatch(
    pi: ExtensionAPI,
    id: string,
    getActiveSession?: ActiveSessionProvider,
  ): Promise<void> {
    if (activePolls.has(id)) return;
    activePolls.add(id);
    let checked: FirstWatchCheck | undefined;
    let poll: InFlightPoll | undefined;
    try {
      const meta = readMeta(id);
      if (!meta || meta.status !== "running" || meta.kind !== "command_watch") return;
      const now = Date.now();
      if (meta.deadlineAt && now >= meta.deadlineAt) {
        poll = inFlightPolls.get(id);
        if (poll) {
          if (poll.origin !== pollOrigin(meta)) throw new Error("Watch poll belongs to another origin");
          try { await poll.terminate(); } catch (error) {
            recordStopError(meta, readableError(error));
            return;
          }
        }
        finalize(meta, { status: "timed_out", reason: watchTimeoutReason(meta) }, pi, getActiveSession);
        return;
      }
      const timeoutMs = remainingDeadlineMs(meta.deadlineAt);
      poll = inFlightPolls.get(id);
      if (poll && poll.origin !== pollOrigin(meta)) throw new Error("Watch poll belongs to another origin");
      if (!poll) {
        const command = startCommandOnce(commandSpecFromMeta(meta), undefined, timeoutMs);
        poll = Object.assign(command, { origin: pollOrigin(meta) });
        inFlightPolls.set(id, poll);
      }
      const result = await poll.result;
      checked = {
        exitCode: result.exitCode, signal: result.signal, durationMs: Math.max(0, result.endedAt - result.startedAt),
        ...(result.timedOut ? { timedOut: true } : {}), stdout: result.stdout, stderr: result.stderr,
      };
      // A poll that was in flight when the session shut down belongs to a stale instance.
      if (scheduledWorkSuspended) return;
      appendWatchResult(meta.logPath, result);
      const latest = readMeta(id);
      if (!latest || latest.status !== "running" || latest.stopRequestedAt) return;
      applyCaptureOverflow(latest, result);
      enforceLogRetention(latest);
      latest.lastCheckedAt = Date.now();
      latest.lastProgressAt = latest.lastCheckedAt;
      latest.lastExitCode = result.exitCode;
      latest.lastSignal = result.signal;
      latest.lastState = extractLastState(result);

      const pollKey = result.startedAt;
      if (result.timedOut) {
        finalize(latest, { status: "timed_out", reason: watchTimeoutReason(latest), commandResult: result }, pi, getActiveSession);
        return;
      }

      const conditionErrors: string[] = [];
      delete latest.error;
      for (const [name, condition] of [["success_when", latest.successWhen], ["failure_when", latest.failureWhen]] as const) {
        const error = condition && validateCondition(condition);
        if (error) {
          latest.error = `${name}: ${error}`;
          if (result.exitCode !== 0) recordExitFailure(latest, "watch-poll", `Watch poll exited with code ${result.exitCode ?? "unknown"}`, result.exitCode, pollKey,
            { at: result.endedAt });
          recordFailure(latest, name, latest.error, pollKey, { incomplete: true, at: result.endedAt });
          finalize(latest, { status: "failed", reason: latest.error, commandResult: result }, pi, getActiveSession);
          return;
        }
      }

      // Evaluate both conditions before deciding whether either can terminate the watch.
      const failure = latest.failureWhen ? evaluateCondition(latest.failureWhen, result) : undefined;
      const success = latest.successWhen ? evaluateCondition(latest.successWhen, result) : undefined;
      for (const [name, match] of [["failure_when", failure], ["success_when", success]] as const) {
        if (match?.error) {
          conditionErrors.push(`${name}: ${match.error}`);
          recordFailure(latest, name, `${name}: ${match.error}`, pollKey, { incomplete: true, at: result.endedAt });
        } else if (match) {
          recoverFailure(latest, name, pollKey, result.endedAt);
        }
      }
      const expectedPollExit = !conditionErrors.length && failure?.matched !== true &&
        success?.matched === true && latest.successWhen?.type === "exit_code";
      if (expectedPollExit) recoverFailure(latest, "watch-poll", pollKey, result.endedAt);
      if (result.exitCode !== 0) recordExitFailure(latest, "watch-poll", `Watch poll exited with code ${result.exitCode ?? "unknown"}`, result.exitCode, pollKey,
        { expected: expectedPollExit, at: result.endedAt });
      else recoverFailure(latest, "watch-poll", pollKey, result.endedAt);
      observeBlindCheck(latest, result, pollKey, {
        clean: !conditionErrors.length,
        matched: failure?.matched === true || success?.matched === true,
      });
      if (conditionErrors.length) latest.error = conditionErrors.join("; ");
      if (failure?.matched) {
        recordFailure(latest, "failure_when", "failure condition matched", pollKey, { category: "condition", at: result.endedAt });
        finalize(latest, {
          status: "failed",
          reason: "failure condition matched",
          matchedCondition: latest.failureWhen,
          matchedValue: failure.value,
          commandResult: result,
        }, pi, getActiveSession);
        return;
      }
      if (conditionErrors.length) {
        writeMeta(latest);
        scheduleFailureAttention(pi, id, getActiveSession);
        scheduleWatch(pi, id, nextWatchDelayMs(latest), getActiveSession);
        return;
      }
      if (success?.matched) {
        finalize(latest, {
          status: "succeeded",
          reason: "success condition matched",
          matchedCondition: latest.successWhen,
          matchedValue: success.value,
          commandResult: result,
        }, pi, getActiveSession);
        return;
      }
      writeMeta(latest);
      scheduleFailureAttention(pi, id, getActiveSession);
      scheduleWatch(pi, id, nextWatchDelayMs(latest), getActiveSession);
    } catch (error) {
      const meta = readMeta(id);
      if (meta && meta.status === "running" && (error instanceof CommandTerminationError || poll?.cleanupPending)) {
        recordStopError(meta, readableError(error));
      } else if (meta && meta.status === "running" && !meta.stopRequestedAt) {
        const detail = readableError(error);
        const reason = detail;
        recordFailure(meta, "watch-poll", reason, `throw:${meta.lastCheckedAt ?? meta.startedAt}`, { category: "execution" });
        finalize(meta, { status: "failed", reason }, pi, getActiveSession);
        checked ??= { exitCode: null, signal: null, durationMs: 0, stdout: "", stderr: "", error: reason };
      }
    } finally {
      activePolls.delete(id);
      // A rejected result does not prove cleanup: retain the handle for stop/shutdown/reload.
      if (poll?.cleanupVerified && inFlightPolls.get(id) === poll) inFlightPolls.delete(id);
      if (firstCheckWaiters.has(id)) {
        if (checked) settleFirstCheck(id, checked);
        else if (readMeta(id)?.status !== "running") settleFirstCheck(id, undefined);
      }
    }
  }

  function observeBlindCheck(meta: BackgroundTaskMeta, result: CommandResult, pollKey: unknown,
    check: { clean: boolean; matched: boolean }): void {
    const threshold = meta.blindChecks ?? DEFAULT_BLIND_CHECKS;
    const stderr = result.stderr.trim();
    const blind = threshold > 0 && check.clean && !check.matched && result.exitCode === 0 && stderr.length > 0;
    if (!blind) {
      meta.blindCheckStreak = 0;
      if (!stderr || check.matched) recoverFailure(meta, BLIND_OPERATION, pollKey, result.endedAt);
      return;
    }
    const streak = (meta.blindCheckStreak ?? 0) + 1;
    meta.blindCheckStreak = streak;
    if (streak !== threshold) return;
    const lastLine = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? "";
    const clipped = lastLine.length > 240 ? `${lastLine.slice(0, 239)}…` : lastLine;
    // The summary is capped in compact rows; the stderr line rides as evidence, which rows show whole.
    recordFailure(meta, BLIND_OPERATION,
      `Blind watch check: ${streak} checks in a row exited 0 with stderr and matched no condition; the check may be broken. The watch keeps running.`,
      pollKey, { category: "blind-check", at: result.endedAt, evidence: `latest stderr: ${clipped} · ${BLIND_CHECK_HINT}` });
  }

  function finalize(
    meta: BackgroundTaskMeta,
    terminal: TerminalResult,
    pi: ExtensionAPI,
    getActiveSession?: ActiveSessionProvider,
  ): void {
    // No result, deadline, or stale close handler may outrun tree verification.
    if (isTerminalStatus(readMeta(meta.id)?.status ?? meta.status) ||
        (processTrees.has(meta.id) && !processTrees.get(meta.id)!.cleanupVerified) ||
        (inFlightPolls.has(meta.id) && !inFlightPolls.get(meta.id)!.cleanupVerified)) return;
    stopFailureAttention(meta.id, owner);
    if (terminal.status === "timed_out") recordFailure(meta, "timeout", terminal.reason, "deadline", { category: "timeout" });
    if (terminal.status === "succeeded") recoverDeclaredOperation(meta);
    meta.status = terminal.status;
    meta.endedAt = Date.now();
    meta.result = meta.kind === "process" && terminal.commandResult
      ? { exitCode: terminal.commandResult.exitCode, signal: terminal.commandResult.signal }
      : {
        reason: terminal.reason,
        matchedCondition: terminal.matchedCondition,
        matchedValue: terminal.matchedValue,
        exitCode: terminal.commandResult?.exitCode,
        signal: terminal.commandResult?.signal,
      };
    if (terminal.commandResult) {
      applyCaptureOverflow(meta, terminal.commandResult);
      meta.lastExitCode = terminal.commandResult.exitCode;
      meta.lastSignal = terminal.commandResult.signal;
      if (meta.kind === "command_watch") {
        meta.lastCheckedAt = terminal.commandResult.endedAt;
        meta.lastState = extractLastState(terminal.commandResult);
      }
    }
    writeMeta(meta);
    processTrees.delete(meta.id);
    clearWatchTimer(meta.id);
    clearProcessTimeout(meta.id);
    stopLogRetention(meta.id);
    stopHandoff(meta.id);
    void notifyTerminal(pi, meta, getActiveSession);
  }

  function readableError(error: unknown): string {
    const value = error instanceof Error ? error.message : String(error);
    return value.replace(/\s+/g, " ").trim().slice(0, 500);
  }

  function watchTimeoutReason(meta: BackgroundTaskMeta): string {
    return "timeout";
  }

  function nextWatchDelayMs(meta: BackgroundTaskMeta): number {
    const intervalMs = meta.intervalMs ?? 30_000;
    if (!meta.deadlineAt) return intervalMs;
    return Math.max(0, Math.min(intervalMs, meta.deadlineAt - Date.now()));
  }

  function remainingDeadlineMs(deadlineAt: number | undefined): number | undefined {
    if (deadlineAt === undefined) return undefined;
    return Math.max(1, deadlineAt - Date.now());
  }

  function scheduleProcessTimeout(
    pi: ExtensionAPI,
    id: string,
    deadlineAt: number,
    getActiveSession?: ActiveSessionProvider,
  ): void {
    clearProcessTimeout(id);
    if (scheduledWorkSuspended) return;
    const delay = Math.max(0, deadlineAt - Date.now());
    const timer = setTimeout(() => void timeoutProcess(pi, id, getActiveSession), delay);
    timer.unref();
    processTimeoutTimers.set(id, timer);
  }

  function clearProcessTimeout(id: string): void {
    const timer = processTimeoutTimers.get(id);
    if (timer) clearTimeout(timer);
    processTimeoutTimers.delete(id);
  }

  async function timeoutProcess(
    pi: ExtensionAPI,
    id: string,
    getActiveSession?: ActiveSessionProvider,
  ): Promise<void> {
    if (activeProcessTimeouts.has(id)) return;
    activeProcessTimeouts.add(id);
    try {
      await finalizeProcessTimeout(pi, id, getActiveSession);
    } finally {
      activeProcessTimeouts.delete(id);
    }
  }

  async function finalizeProcessTimeout(
    pi: ExtensionAPI,
    id: string,
    getActiveSession?: ActiveSessionProvider,
  ): Promise<void> {
    const meta = readMeta(id);
    if (!meta || meta.status !== "running" || meta.kind !== "process") return;

    let reason = "timeout";
    {
      if (processTrees.has(meta.id) || meta.pid) {
        try {
          await processTreeFor(meta)!.terminate();
        } catch (error) {
          reason = `timeout; could not terminate local process tree: ${readableError(error)}`;
          // The task is still running: this is a stop failure, reported as such.
          recordStopError(meta, reason);
          return;
        }
      }
    }

    const latest = readMeta(id);
    if (!latest || latest.status !== "running" || latest.stopRequestedAt) return;
    latest.error = meta.error;
    finalize(latest, { status: "timed_out", reason }, pi, getActiveSession);
  }

  async function notifyTerminal(
    pi: ExtensionAPI,
    meta: BackgroundTaskMeta,
    getActiveSession?: ActiveSessionProvider,
  ): Promise<void> {
    // A suspended instance has no active session: delivering or suppressing here would
    // be wrong either way. The instance that resumes the task delivers it (#324).
    if (scheduledWorkSuspended) return;
    if (meta.callback === false || meta.callbackSentAt || meta.callbackSuppressedAt) return;
    const latest = readMeta(meta.id) ?? meta;
    if (latest.callback === false || latest.callbackSentAt || latest.callbackSuppressedAt) return;
    // Cancellation is an explicit action by the agent or user, so a completion
    // wakeup would be noise. Record the suppression durably so the session_start
    // replay path never fires a callback for a cancelled task either.
    if (latest.status === "cancelled") {
      latest.callbackSuppressedAt = Date.now();
      latest.callbackSuppressedReason = "task was cancelled; no completion callback is needed";
      writeMeta(latest);
      return;
    }
    const pending = terminalFailureAttention(latest.id);
    const label = latest.name ? `${latest.name} (${latest.id})` : latest.id;
    const facts = formatCallbackFacts(latest);
    getCallbackBatcher(pi).enqueue({
      source: "background-task",
      id: latest.id,
      label,
      // Lifecycle plus an attention count; the incident text rides failureRows
      // with exact counts, so the status field is never a clipped summary (#323).
      status: pending
        ? `${latest.status}; ${pending.incidents.length} incident${pending.incidents.length === 1 ? "" : "s"} need${pending.incidents.length === 1 ? "s" : ""} attention`
        : latest.status,
      detailTool: "bg_task_status",
      outcome: facts.outcome,
      failureRows: facts.failureRows,
      decision: facts.decision,
      incidentCount: facts.incidentCount,
      callback: true,
      isDelivered: () => {
        const current = readMeta(latest.id);
        return current?.callbackSentAt !== undefined || current?.callbackSuppressedAt !== undefined;
      },
      getSuppressionReason: () => {
        const current = readMeta(latest.id);
        if (!current) throw new Error("Background task metadata is unavailable; defer completion");
        return getCallbackSuppressionReason(current, getActiveSession?.());
      },
      onDelivered: (at) => {
        const current = readMeta(latest.id);
        if (!current || current.callbackSentAt !== undefined || current.callbackSuppressedAt !== undefined) return;
        current.callbackSentAt = at;
        writeMeta(current);
        if (pending) markFailureAttentionDelivered(failurePath(latest.id), pending, at);
      },
      onSuppressed: (reason, at) => {
        const current = readMeta(latest.id);
        if (!current || current.callbackSentAt !== undefined || current.callbackSuppressedAt !== undefined) return;
        current.callbackSuppressedAt = at;
        current.callbackSuppressedReason = reason;
        writeMeta(current);
      },
    });
  }

  function getCallbackSuppressionReason(
    meta: BackgroundTaskMeta,
    activeSession: BackgroundTaskCallbackOrigin | undefined,
  ): string | undefined {
    const origin = meta.callbackOrigin;
    if (origin) {
      if (!activeSession) return "active session identity is unavailable";
      if (origin.cwd !== activeSession.cwd) return `origin cwd ${origin.cwd} does not match active cwd ${activeSession.cwd}`;
      if (origin.sessionId && origin.sessionId !== activeSession.sessionId) {
        return `origin session ${origin.sessionId} does not match active session ${activeSession.sessionId ?? "unknown"}`;
      }
      return undefined;
    }

    if (activeSession && meta.cwd !== activeSession.cwd) {
      return `legacy task cwd ${meta.cwd} does not match active cwd ${activeSession.cwd}`;
    }
    return undefined;
  }

  function commandSpecFromMeta(meta: BackgroundTaskMeta): CommandSpec {
    return {
      command: meta.command,
      argv: meta.argv,
      shell: meta.shell,
      cwd: meta.cwd,
      env: meta.env,
    };
  }

  function scheduleLogRetention(id: string): void {
    stopLogRetention(id);
    if (scheduledWorkSuspended) return;
    const timer = setInterval(() => {
      const meta = readMeta(id);
      if (!meta || meta.status !== "running" || meta.kind !== "process") {
        stopLogRetention(id);
        return;
      }
      enforceLogRetention(meta);
    }, LOG_RETENTION_CHECK_MS);
    timer.unref();
    logRetentionTimers.set(id, timer);
  }

  function stopLogRetention(id: string): void {
    const timer = logRetentionTimers.get(id);
    if (timer) clearInterval(timer);
    logRetentionTimers.delete(id);
  }

  function enforceLogRetention(meta: BackgroundTaskMeta): void {
    try {
      const mtimeMs = Math.trunc(statSync(meta.logPath).mtimeMs);
      if (mtimeMs > (meta.lastProgressAt ?? meta.startedAt)) {
        meta.lastProgressAt = mtimeMs;
        writeMeta(meta);
      }
    } catch {
      // Logs are optional progress evidence; retention still proceeds if absent.
    }
    const compacted = retainLogTail(meta.logPath, resolveMaxLogBytes(meta.maxLogBytes));
    if (!compacted) return;
    meta.logDiscardedBytes = (meta.logDiscardedBytes ?? 0) + compacted.discardedBytes;
    meta.logRetentionEvents = (meta.logRetentionEvents ?? 0) + 1;
    meta.logGeneration = (meta.logGeneration ?? 0) + 1;
    writeMeta(meta);
  }

  /** Results whose capture loss is already counted; one poll result is counted once. */
  const countedCaptureResults = new WeakSet<CommandResult>();

  function applyCaptureOverflow(meta: BackgroundTaskMeta, result: CommandResult): void {
    const stdout = result.stdoutDiscardedBytes ?? 0;
    const stderr = result.stderrDiscardedBytes ?? 0;
    if (!result.captureTruncated && stdout === 0 && stderr === 0) return;
    // pollWatch counts a result before evaluating conditions, and finalize sees
    // the same result again when that poll ends the watch.
    if (countedCaptureResults.has(result)) return;
    countedCaptureResults.add(result);
    meta.stdoutDiscardedBytes = (meta.stdoutDiscardedBytes ?? 0) + stdout;
    meta.stderrDiscardedBytes = (meta.stderrDiscardedBytes ?? 0) + stderr;
    meta.captureDiscardedBytes = (meta.captureDiscardedBytes ?? 0) + stdout + stderr;
    meta.captureOverflowEvents = (meta.captureOverflowEvents ?? 0) + 1;
  }

  function extractLastState(result: { stdout: string }): unknown {
    try {
      return JSON.parse(result.stdout);
    } catch {
      return result.stdout.slice(0, 4000);
    }
  }
  return { awaitFirstWatchCheck, suspendScheduledWork, resumeScheduledWork, spawnTask, startWatchTask, resumeRunningTask, stopTask };
}

type TaskRuntime = ReturnType<typeof createTaskRuntime>;
const runtimes = new WeakMap<ExtensionAPI, TaskRuntime>();
const knownRuntimes = new Set<WeakRef<TaskRuntime>>();
const taskRuntimes = new Map<string, WeakRef<TaskRuntime>>();
function runtimeFor(pi: ExtensionAPI): TaskRuntime {
  let runtime = runtimes.get(pi);
  if (!runtime) { runtime = createTaskRuntime(pi); runtimes.set(pi, runtime); knownRuntimes.add(new WeakRef(runtime)); }
  return runtime;
}
export async function awaitFirstWatchCheck(id: string, timeoutMs = FIRST_WATCH_CHECK_WAIT_MS, signal?: AbortSignal): Promise<FirstCheckOutcome> {
  return await taskRuntimes.get(id)?.deref()?.awaitFirstWatchCheck(id, timeoutMs, signal);
}

export function suspendScheduledWork(pi?: ExtensionAPI): void {
  if (pi) runtimeFor(pi).suspendScheduledWork();
  else for (const ref of knownRuntimes) { const runtime = ref.deref(); if (runtime) runtime.suspendScheduledWork(); else knownRuntimes.delete(ref); }
}

export function resumeScheduledWork(pi?: ExtensionAPI): void {
  if (pi) runtimeFor(pi).resumeScheduledWork();
  else for (const ref of knownRuntimes) { const runtime = ref.deref(); if (runtime) runtime.resumeScheduledWork(); else knownRuntimes.delete(ref); }
}
export function spawnTask(
  pi: ExtensionAPI,
  params: SpawnTaskParams,
  defaultCwd: string,
  callbackOrigin?: BackgroundTaskCallbackOrigin,
  getActiveSession?: ActiveSessionProvider,
): BackgroundTaskMeta {
  const runtime = runtimeFor(pi);
  const result = runtime.spawnTask(pi, params, defaultCwd, callbackOrigin, getActiveSession);
  return result;
}
export function startWatchTask(
  pi: ExtensionAPI,
  params: WatchTaskParams,
  defaultCwd: string,
  callbackOrigin?: BackgroundTaskCallbackOrigin,
  getActiveSession?: ActiveSessionProvider,
): BackgroundTaskMeta {
  const runtime = runtimeFor(pi);
  const result = runtime.startWatchTask(pi, params, defaultCwd, callbackOrigin, getActiveSession);
  taskRuntimes.set(result.id, new WeakRef(runtime));
  return result;
}
export function resumeRunningTask(
  pi: ExtensionAPI,
  meta: BackgroundTaskMeta,
  getActiveSession?: ActiveSessionProvider,
): BackgroundTaskMeta {
  const runtime = runtimeFor(pi);
  const result = runtime.resumeRunningTask(pi, meta, getActiveSession);
  return result;
}
export async function stopTask(
  pi: ExtensionAPI,
  id: string,
  getActiveSession?: ActiveSessionProvider,
): Promise<BackgroundTaskMeta | undefined> {
  const runtime = runtimeFor(pi);
  const result = runtime.stopTask(pi, id, getActiveSession);
  return result;
}
