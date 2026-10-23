import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  for (const pi of harnesses.splice(0)) {
    getCallbackBatcher(pi).cancel();
    getBackgroundTasksNavigator(pi).dispose();
  }
  vi.useRealTimers();
});

describe("extension e2e", () => {
  it("registers the public background task tools", () => {
    const harness = createHarness();

    expect(Array.from(harness.tools.keys()).sort()).toEqual([
      "bg_task_clear",
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
    expect(harness.tools.get("bg_task_clear")?.description).toContain("without deleting their history");
  });

  it("coordinates long-running work with the parent plan", () => {
    const harness = createHarness();

    const guidelines = harness.tools.get("bg_task_spawn")?.promptGuidelines ?? [];
    expect(guidelines.some((line) => line.includes("genuinely long-running"))).toBe(true);
    expect(guidelines.some((line) => line.includes("coordinator ledger"))).toBe(true);
    expect(guidelines.some((line) => line.includes("continue unblocked foreground work without polling"))).toBe(true);
    expect(guidelines.some((line) => line.includes("terminal, inspected, and integrated"))).toBe(true);
  });

  it("#359 documents watch checks and blind detection only on bg_task_watch", async () => {
    const harness = createHarness();
    const tool = harness.tools.get("bg_task_watch");
    expect(tool?.description).toContain("do not end it with `exit 0` or `|| true`");
    expect(tool?.description).toContain("Map an unknown or unparseable state to failure");
    expect(tool?.description).toContain("jq -er");
    expect(tool?.parameters?.properties?.blind_checks?.description).toContain("0 turns it off");
    const definitions = JSON.stringify([...harness.tools.values()]);
    expect(definitions.match(/do not end it with/g)).toHaveLength(1);
    expect(definitions.match(/possibly-blind incident/g)).toHaveLength(1);
    expect([...harness.tools.values()].filter(tool => tool.promptGuidelines?.length).map(tool => tool.name)).toEqual(["bg_task_spawn"]);
    const launch = await harness.execute("bg_task_watch", {
      command: "echo STILL_UNKNOWN; echo 'ERROR: broken format' >&2; exit 0",
      interval_seconds: 60,
      timeout_seconds: 5,
      callback: false,
      success_when: { type: "stdout_contains", value: "TERMINAL_SUCCESS" },
    });
    expect(launch).toContain("First check: exit 0");
    expect(launch).toContain("ERROR: broken format");
    await harness.execute("bg_task_stop", { id: extractTaskId(launch) });
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

    const logText = await harness.execute("bg_task_log", { id, lines: 20 });
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

  it("#409 holds time-separated completions while busy and drains once after agent_settled", async () => {
    vi.useFakeTimers();
    const sessionId = "availability-gated-completions";
    const harness = createHarness({ sessionId });
    const ids = ["bg_availability_first", "bg_availability_second"];
    try {
      await harness.fireSessionStart();
      await harness.fireAgentStart();
      for (const id of ids) {
        writeMeta({ id, kind: "process", status: "succeeded", startedAt: Date.now() - 1_000, endedAt: Date.now(),
          logPath: `${taskDir(id)}/output.log`, callback: true,
          callbackOrigin: { cwd: process.cwd(), sessionId },
          command: "build", cwd: process.cwd(), spawnPid: process.pid });
        await harness.fireSessionStart();
        await vi.advanceTimersByTimeAsync(200);
        expect(harness.messages).toHaveLength(0);
        expect(readMeta(id)?.callbackSentAt).toBeUndefined();
      }
      expect(getCallbackBatcher(harness.pi).pendingCount()).toBe(2);
      await harness.fireAgentSettled();
      expect(harness.messages).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(100);
      expect(harness.messages).toHaveLength(1);
      expect(harness.messages[0]).toContain("2 background completions are ready");
      for (const id of ids) {
        expect(harness.messages[0]).toContain(id);
        expect(readMeta(id)?.callbackSentAt).toBeDefined();
      }
      await harness.fireAgentSettled();
      await vi.advanceTimersByTimeAsync(200);
      expect(harness.messages).toHaveLength(1);
    } finally {
      getCallbackBatcher(harness.pi).cancel();
      for (const id of ids) rmSync(taskDir(id), { recursive: true, force: true });
    }
  });

  it.each(["session_start", "agent_start"])("holds callbacks without a live context until %s refreshes it", async (lifecycle) => {
    vi.useFakeTimers();
    const harness = createHarness();
    const batcher = getCallbackBatcher(harness.pi);
    batcher.enqueue({ source: "background-task", id: "before-context", label: "build", status: "succeeded", detailTool: "bg_task_status" });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(harness.messages).toEqual([]);
    await harness.fire(lifecycle); // An idle context refresh, not a foreground run.
    await vi.advanceTimersByTimeAsync(100);
    expect(harness.messages).toHaveLength(1);
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

  it("stops a spawned process and dismisses it through bg_task_clear", async () => {
    const harness = createHarness();
    const spawn = await harness.execute("bg_task_spawn", {
      name: "e2e stoppable process",
      command: "node -e 'setTimeout(() => {}, 10000)'",
      callback: false,
    });
    const id = extractTaskId(spawn);
    const stopped = await harness.execute("bg_task_stop", { id });
    expect(stopped).toContain(`Background task ${id} is cancelled.`);
    const cleared = await harness.execute("bg_task_clear", { id });
    expect(cleared).toContain(`Dismissed terminal background task ${id}`);
    expect(readMeta(id)?.dismissedAt).toBeTypeOf("number");
    expect(await harness.execute("bg_task_clear", { id })).toContain("was already dismissed");
  });

  it("queues exactly one terminal callback for callback-enabled tasks", async () => {
    const harness = createHarness();
    await harness.fireSessionStart();

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
    await originHarness.fireSessionStart();

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

  it("lingers recent idle Work panel rows and keeps older and manually dismissed terminal tasks in history", async () => {
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
    await waitForMeta(succeededId, (meta) => meta?.status === "succeeded" && typeof meta.endedAt === "number");
    await harness.fireSessionStart();
    let list = harness.panel.render().join("\n");
    expect(list).toContain('Background');
    expect(list).toContain("recent-failure");
    expect(list).toContain("recent-success");
    getBackgroundTasksNavigator(harness.pi).provider.close(succeededId);
    expect(readMeta(succeededId)?.dismissedAt).toBeTypeOf("number");
    list = harness.panel.render().join("\n");
    expect(list).toContain("recent-failure");
    expect(list).not.toContain("recent-success");

    writeMeta({ ...failed!, endedAt: Date.now() - 31_000 });
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

      const cleared = await harness.execute("bg_task_clear", {});

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
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();
  let idle = true;
  const messages: string[] = [];
  const messageAttempts: string[] = [];
  const commands = new Map<string, any>();
  const panel = workPanelUI();
  const events = new EventEmitter();
  const cwd = options.cwd ?? process.cwd();
  const sessionId = options.sessionId ?? "test-session";
  const context = {
    cwd,
    isIdle: () => idle,
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
      const list = handlers.get(eventName) ?? [];
      list.push(handler);
      handlers.set(eventName, list);
      return () => { const index = list.indexOf(handler); if (index >= 0) list.splice(index, 1); };
    },
    sendMessage(message: { content: string }) {
      messageAttempts.push(message.content);
      if (options.failUserMessage) throw new Error("simulated send failure");
      messages.push(message.content);
    },
  } as unknown as ExtensionAPI;

  backgroundTasksExtension(pi);
  harnesses.push(pi);
  const fire = async (eventName: string) => {
    for (const handler of [...handlers.get(eventName) ?? []]) await handler({ type: eventName }, context);
  };

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
    fire,
    async fireSessionStart() { await fire("session_start"); },
    async fireAgentStart() { idle = false; await fire("agent_start"); },
    async fireAgentSettled() { idle = true; await fire("agent_settled"); },
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