import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import backgroundTasksExtension from "./index.js";
import { getBackgroundTasksNavigator } from "./navigator-provider.js";
import { workPanelUI } from "./test-support/work-panel-ui.js";
import { recordFailure } from "./failures.js";
import { getCallbackBatcher } from "./shared-callback-batcher.js";
import { metaPathFor, readMeta, taskDir, writeMeta } from "./registry.js";

type JsonSchema = {
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

type RegisteredTool = {
  name: string;
  description?: string;
  promptGuidelines?: string[];
  parameters?: JsonSchema;
  execute: (...args: any[]) => Promise<{ content: Array<{ type: string; text: string }>; details?: unknown }>;
};

const harnesses: ExtensionAPI[] = [];
afterEach(() => {
  for (const pi of harnesses.splice(0)) getBackgroundTasksNavigator(pi).dispose();
});

describe("extension e2e", () => {
  it("registers the public background task tools", () => {
    const harness = createHarness();

    expect(Array.from(harness.tools.keys()).sort()).toEqual([
      "bg_status",
      "bg_task",
      "bg_task_list",
      "bg_task_log",
      "bg_task_spawn",
      "bg_task_status",
      "bg_task_stop",
      "bg_task_watch",
    ].sort());
  });

  it("documents compact default payloads in the tool registry", () => {
    const harness = createHarness();

    expect(harness.tools.get("bg_task_status")?.description).toContain("compact model-facing summary");
    expect(harness.tools.get("bg_task_status")?.description).toContain("verbose:true only");
    expect(harness.tools.get("bg_task_log")?.description).toContain("compact 10-line terminal-aware tail");
    expect(harness.tools.get("bg_task_log")?.description).toContain("lines:0 pages the retained raw log");
    expect(harness.tools.get("bg_task")?.description).toContain("action:status");
    expect(harness.tools.get("bg_status")?.description).toContain("explicit full-data recovery");
  });

  it("coordinates long-running work with the parent plan", () => {
    const harness = createHarness();

    for (const name of ["bg_task_spawn", "bg_task_watch", "bg_task"]) {
      const guidelines = harness.tools.get(name)?.promptGuidelines ?? [];
      expect(guidelines.some((line) => line.includes("genuinely long-running"))).toBe(true);
      expect(guidelines.some((line) => line.includes("coordinator ledger"))).toBe(true);
      expect(guidelines.some((line) => line.includes("continue unblocked foreground work without polling"))).toBe(true);
      expect(guidelines.some((line) => line.includes("terminal, inspected, and integrated"))).toBe(true);
    }
  });

  it("#359 tells the model how to write a watch check and exposes blind_checks on both watch entry points", async () => {
    const harness = createHarness();
    for (const name of ["bg_task_watch", "bg_task"]) {
      const tool = harness.tools.get(name);
      expect(tool?.description).toContain("do not end it with `exit 0` or `|| true`");
      expect(tool?.description).toContain("Map an unknown or unparseable state to failure");
      expect(tool?.description).toContain("jq -er");
      expect(tool?.parameters?.properties?.blind_checks?.description).toContain("0 turns it off");
    }
    // The wrapper's watch action goes through the same first-check wait as bg_task_watch.
    const launch = await harness.execute("bg_task", {
      action: "watch",
      command: "echo STILL_UNKNOWN; echo 'ERROR: broken format' >&2; exit 0",
      interval_seconds: 60,
      timeout_seconds: 5,
      callback: false,
      success_when: { type: "stdout_contains", value: "TERMINAL_SUCCESS" },
    });
    expect(launch).toContain("First check: exit 0");
    expect(launch).toContain("ERROR: broken format");
    await harness.execute("bg_task", { action: "stop", id: extractTaskId(launch) });
  });

  it("starts a watcher through bg_task_watch and inspects it through status/log tools", async () => {
    const harness = createHarness();

    const launch = await harness.execute("bg_task_watch", {
      name: "e2e watch",
      command: "node -e 'console.log(JSON.stringify({status:\"done\", source:\"e2e\"}))'",
      interval_seconds: 1,
      timeout_seconds: 5,
      callback: false,
      success_when: { type: "json_path_equals", path: "$.status", value: "done" },
    });
    const id = extractTaskId(launch);

    await waitForMeta(id, (meta) => meta?.status === "succeeded");

    const statusText = await harness.execute("bg_task_status", { id });
    expect(statusText).toContain(`Background task ${id}`);
    expect(statusText).toContain("is succeeded");
    expect(statusText).toContain("Condition matched");
    expect(statusText).toContain("$.status");
    expect(statusText).not.toContain("success_when");

    const verboseStatusText = await harness.execute("bg_task_status", { id, verbose: true });
    expect(JSON.parse(verboseStatusText)).toMatchObject({ id, kind: "command_watch", status: "succeeded" });

    const logText = await harness.execute("bg_task_log", { id, tail_lines: 20 });
    expect(logText).toContain('"source":"e2e"');
  });

  it("replays an undelivered terminal failure through the real session-start handler", async () => {
    const sessionId = `failure-replay-${Date.now()}`;
    const harness = createHarness({ sessionId });
    const id = `bg_failure_replay_${Date.now()}`;
    const meta = {
      id, kind: "process" as const, status: "failed" as const,
      startedAt: Date.now() - 1000, endedAt: Date.now(),
      logPath: `${taskDir(id)}/output.log`, callback: true,
      callbackOrigin: { cwd: process.cwd(), sessionId },
      command: "build", cwd: process.cwd(), spawnPid: process.pid,
    };
    writeMeta(meta);
    recordFailure(meta, "execution", "build exited 9", "exit", { category: "exit" });
    try {
      await harness.fireSessionStart();
      writeFileSync(metaPathFor(id), "{broken");
      expect(await getCallbackBatcher(harness.pi).flush()).toBe(false);
      expect(harness.messages).toHaveLength(0);
      writeMeta(meta);
      await getCallbackBatcher(harness.pi).flush();
      expect(harness.messages).toHaveLength(1);
      expect(harness.messages[0]).toContain("build exited 9");
      expect(readMeta(id)?.callbackSentAt).toBeDefined();
      await harness.fireSessionStart();
      await getCallbackBatcher(harness.pi).flush();
      expect(harness.messages).toHaveLength(1);
    } finally { rmSync(taskDir(id), { recursive: true, force: true }); }
  });

  it("shows unresolved sidecar evidence ahead of task progress on every inspection surface", async () => {
    const sessionId = "failure-surface-session";
    const harness = createHarness({ sessionId, mode: "tui", hasUI: true });
    const id = `bg_failure_surface_${Date.now()}`;
    const meta = {
      id, kind: "process" as const, status: "failed" as const,
      startedAt: Date.now() - 1000, endedAt: Date.now(),
      logPath: `${taskDir(id)}/output.log`, callback: false,
      callbackOrigin: { cwd: process.cwd(), sessionId },
      command: "background-build", cwd: process.cwd(), spawnPid: process.pid,
    };
    writeMeta(meta);
    recordFailure(meta, "execution", "build failed with exit 9", "exit", { category: "exit" });
    try {
      const list = await harness.execute("bg_task_list", { status: ["failed"], limit: 100 });
      const status = await harness.execute("bg_task_status", { id });
      const verbose = await harness.execute("bg_task_status", { id, verbose: true });
      const log = await harness.execute("bg_task_log", { id });
      await harness.fireSessionStart();
      const opened = harness.command('bg');
      const panel = harness.panel.detailRender(160).join("\n");
      harness.panel.detailKey('q');
      await opened;
      for (const text of [list, status, log]) {
        expect(text).toMatch(/^Action required.*build failed with exit 9/);
        expect(text.indexOf("Action required")).toBeLessThan(text.indexOf(id));
      }
      expect(JSON.parse(verbose)).toMatchObject({
        failureSummary: expect.stringContaining("build failed with exit 9"), id,
        failureJournal: expect.stringContaining("failures.jsonl"),
        failureObservations: [expect.objectContaining({ status: "unresolved", summary: "build failed with exit 9" })],
      });
      expect(verbose.indexOf("failureSummary")).toBeLessThan(verbose.indexOf('"status"'));
      expect(panel).toContain("build failed with exit 9");
    } finally {
      rmSync(taskDir(id), { recursive: true, force: true });
    }
  });

  it("supports the action-wrapper tools for watch, log, and stop", async () => {
    const harness = createHarness();

    const launch = await harness.execute("bg_task", {
      action: "watch",
      name: "e2e wrapper watch",
      command: "node -e 'console.log(\"ready from wrapper\")'",
      interval_seconds: 1,
      timeout_seconds: 5,
      callback: false,
      success_when: { type: "stdout_contains", value: "ready from wrapper" },
    });
    const watchId = extractTaskId(launch);
    await waitForMeta(watchId, (meta) => meta?.status === "succeeded");

    const logText = await harness.execute("bg_status", { action: "log", id: watchId, tail_lines: 20 });
    expect(logText).toContain("ready from wrapper");

    const spawn = await harness.execute("bg_task", {
      action: "spawn",
      name: "e2e wrapper process",
      command: "node -e 'setTimeout(() => {}, 10000)'",
      callback: false,
    });
    const processId = extractTaskId(spawn);

    const stopped = await harness.execute("bg_status", { action: "stop", id: processId });
    expect(stopped).toContain(`Background task ${processId} is cancelled.`);
  });

  it("queues exactly one terminal callback for callback-enabled tasks", async () => {
    const harness = createHarness();

    const launch = await harness.execute("bg_task_watch", {
      name: "e2e callback watch",
      command: "node -e 'console.log(\"done\")'",
      interval_seconds: 1,
      timeout_seconds: 5,
      success_when: { type: "stdout_contains", value: "done" },
    });
    const id = extractTaskId(launch);

    await waitForMeta(id, (meta) => meta?.status === "succeeded" && typeof meta.callbackSentAt === "number");

    expect(harness.messages).toHaveLength(1);
    expect(harness.messages[0]).toContain(id);
    expect(harness.messages[0]).toContain("bg_task_status");
    expect(harness.messages[0]).toContain("Full results and logs are intentionally omitted");

    await harness.fireSessionStart();
    expect(harness.messages).toHaveLength(1);
  });

  it("does not inspect or mutate terminal callbacks from a different session", async () => {
    const originHarness = createHarness({ sessionId: "session-a", failUserMessage: true });

    const launch = await originHarness.execute("bg_task_watch", {
      name: "e2e callback isolation",
      command: "node -e 'console.log(\"done\")'",
      interval_seconds: 1,
      timeout_seconds: 5,
      success_when: { type: "stdout_contains", value: "done" },
    });
    const id = extractTaskId(launch);

    await waitForMeta(id, (meta) => meta?.status === "succeeded" && originHarness.messageAttempts.length === 1);
    expect(readMeta(id)?.callbackSentAt).toBeUndefined();

    const otherHarness = createHarness({ sessionId: "session-b" });
    await otherHarness.fireSessionStart();

    expect(otherHarness.messages.join("\n")).not.toContain(id);
    expect(readMeta(id)?.callbackSuppressedAt).toBeUndefined();
  });

  it("keeps Work panel rows scoped to the active session", async () => {
    const sessionA = createHarness({ sessionId: "session-a", mode: "tui", hasUI: true });
    await sessionA.fireSessionStart();
    const launch = await sessionA.execute("bg_task_spawn", {
      name: "session-a-task",
      shell: "none" as const,
      argv: [process.execPath, "-e", "setTimeout(() => {}, 30_000)"],
      callback: false,
    });
    const id = extractTaskId(launch);

    try {
      expect(sessionA.panel.render().join("\n")).toContain("session-a-task");

      const sessionB = createHarness({ sessionId: "session-b", mode: "tui", hasUI: true });
      await sessionB.fireSessionStart();

      expect(sessionB.panel.render().join("\n")).not.toContain("session-a-task");
      expect(sessionB.panel.render().join("\n")).not.toContain(id);
    } finally {
      await sessionA.execute("bg_task_stop", { id });
    }
  });

  it("keeps older and dismissed terminal tasks in history while collapsing idle Work panel rows", async () => {
    const harness = createHarness({ sessionId: "session-a", mode: "tui", hasUI: true });
    const failedLaunch = await harness.execute("bg_task_spawn", {
      name: "recent-failure",
      shell: "none" as const,
      argv: [process.execPath, "-e", "process.exit(1)"],
      callback: false,
    });
    const failedId = extractTaskId(failedLaunch);
    const succeededLaunch = await harness.execute("bg_task_spawn", {
      name: "recent-success",
      shell: "none" as const,
      argv: [process.execPath, "-e", "process.exit(0)"],
      callback: false,
    });
    const succeededId = extractTaskId(succeededLaunch);

    const failed = await waitForMeta(failedId, (meta) => meta?.status === "failed" && typeof meta.endedAt === "number");
    const succeeded = await waitForMeta(succeededId, (meta) => meta?.status === "succeeded" && typeof meta.endedAt === "number");
    await harness.fireSessionStart();
    let list = harness.panel.render().join("\n");
    expect(list).toContain('Background');
    expect(list).not.toContain("recent-failure");
    expect(list).not.toContain("recent-success");

    writeMeta({ ...failed!, endedAt: Date.now() - 31_000 });
    writeMeta({ ...succeeded!, endedAt: Date.now() - 31_000, dismissedAt: Date.now() });
    await harness.fireSessionStart();

    list = harness.panel.render().join("\n");
    expect(list).not.toContain("recent-failure");
    expect(list).not.toContain("recent-success");
    expect(readMeta(failedId)?.status).toBe("failed");
    expect(readMeta(succeededId)?.status).toBe("succeeded");
    const opened = harness.command('bg');
    const history = harness.panel.detailRender(160).join('\n');
    expect(history).toContain('recent-failure');
    expect(history).toContain('recent-success');
    harness.panel.detailKey('q');
    await opened;
  });

  it("clears terminal tasks for the active session without touching running or other-session tasks", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "bg-clear-test-"));
    const harness = createHarness({ cwd, sessionId: "session-a" });
    const failedLaunch = await harness.execute("bg_task_spawn", {
      name: "clearable-failure",
      shell: "none" as const,
      argv: [process.execPath, "-e", "process.exit(1)"],
      callback: false,
    });
    const failedId = extractTaskId(failedLaunch);
    const runningLaunch = await harness.execute("bg_task_spawn", {
      name: "keep-running",
      shell: "none" as const,
      argv: [process.execPath, "-e", "setTimeout(() => {}, 30_000)"],
      callback: false,
    });
    const runningId = extractTaskId(runningLaunch);
    const otherSessionLaunch = await createHarness({ cwd, sessionId: "session-b" }).execute("bg_task_spawn", {
      name: "other-session-failure",
      shell: "none" as const,
      argv: [process.execPath, "-e", "process.exit(1)"],
      callback: false,
    });
    const otherSessionId = extractTaskId(otherSessionLaunch);

    try {
      await waitForMeta(failedId, (meta) => meta?.status === "failed");
      await waitForMeta(otherSessionId, (meta) => meta?.status === "failed");

      const cleared = await harness.execute("bg_status", { action: "clear" });

      expect(cleared).toContain("Dismissed 1 terminal background task");
      expect(readMeta(failedId)?.dismissedAt).toBeTypeOf("number");
      expect(readMeta(runningId)?.dismissedAt).toBeUndefined();
      expect(readMeta(otherSessionId)?.dismissedAt).toBeUndefined();
    } finally {
      await harness.execute("bg_task_stop", { id: runningId });
    }
  });

  it("stops another session's running task only with all:true (#322)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "bg-stop-owner-"));
    const owner = createHarness({ cwd, sessionId: "owner-session" });
    const other = createHarness({ cwd, sessionId: "other-session" });
    const launch = await owner.execute("bg_task_spawn", {
      name: "owned-sleeper",
      shell: "none" as const,
      argv: [process.execPath, "-e", "setTimeout(() => {}, 30_000)"],
      callback: false,
    });
    const id = extractTaskId(launch);
    try {
      const refused = await other.execute("bg_task_stop", { id });
      expect(refused).toContain("not stopped");
      expect(readMeta(id)?.status).toBe("running");
      expect(readMeta(id)?.stopRequestedAt).toBeUndefined();
      const stopped = await other.execute("bg_task_stop", { id, all: true });
      expect(stopped).toContain("cancelled");
      await waitForMeta(id, (meta) => meta?.status === "cancelled");
    } finally {
      await owner.execute("bg_task_stop", { id });
    }
  });
});

function createHarness(options: { cwd?: string; sessionId?: string; failUserMessage?: boolean; mode?: string; hasUI?: boolean } = {}) {
  const tools = new Map<string, RegisteredTool>();
  const sessionStartHandlers: Array<(event: unknown, ctx: unknown) => unknown> = [];
  const messages: string[] = [];
  const messageAttempts: string[] = [];
  const commands = new Map<string, any>();
  const panel = workPanelUI();
  const events = new EventEmitter();
  const cwd = options.cwd ?? process.cwd();
  const sessionId = options.sessionId ?? "test-session";
  const context = {
    cwd,
    mode: options.mode ?? "print",
    hasUI: options.hasUI ?? false,
    ui: panel.ui,
    sessionManager: {
      getSessionId: () => sessionId,
    },
  };
  const pi = {
    events,
    registerCommand(name: string, command: any) { commands.set(name, command); },
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
    on(eventName: string, handler: (event: unknown, ctx: unknown) => unknown) {
      if (eventName === "session_start") sessionStartHandlers.push(handler);
    },
    sendMessage(message: { content: string }) {
      messageAttempts.push(message.content);
      if (options.failUserMessage) throw new Error("simulated send failure");
      messages.push(message.content);
    },
  } as unknown as ExtensionAPI;

  backgroundTasksExtension(pi);
  harnesses.push(pi);

  return {
    pi,
    tools,
    messages,
    messageAttempts,
    panel,
    events,
    command(name: string) { return commands.get(name).handler('', context); },
    async execute(name: string, params: Record<string, unknown>) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`tool not registered: ${name}`);
      const result = await tool.execute(
        "test-call",
        params,
        new AbortController().signal,
        undefined,
        context,
      );
      return result.content.map((part) => part.text).join("\n");
    },
    async fireSessionStart() {
      for (const handler of sessionStartHandlers) await handler({ type: "session_start" }, context);
    },
  };
}

function extractTaskId(text: string): string {
  const match = text.match(/bg_[a-z0-9_]+/);
  if (!match) throw new Error(`no task id in text: ${text}`);
  return match[0]!;
}

async function waitForMeta(
  id: string,
  done: (meta: ReturnType<typeof readMeta>) => boolean,
  timeoutMs = 5000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const meta = readMeta(id);
    if (done(meta)) return meta;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const meta = readMeta(id);
  if (!done(meta)) throw new Error(`task ${id} did not reach expected state: ${JSON.stringify(meta)}`);
  return meta;
}