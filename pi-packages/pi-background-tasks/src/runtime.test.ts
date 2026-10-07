import { readFileSync, rmSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getCallbackBatcher } from "./shared-callback-batcher.js";
import { readMeta, taskDir, writeMeta } from "./registry.js";
import { resumeRunningTask, spawnTask, startWatchTask, stopTask } from "./runtime.js";
import { formatLaunch } from "./tools.js";

const fakePi = {
  sendUserMessage: async () => undefined,
} as unknown as ExtensionAPI;

describe("runtime", () => {
  it.each(["success_when", "failure_when"] as const)("rejects malformed %s paths before starting", (field) => {
    expect(() => startWatchTask(fakePi, {
      command: "echo must-not-run",
      success_when: { type: "stdout_contains", value: "done" },
      [field]: { type: "json_path_equals", path: "terminalFailure", value: true },
    }, process.cwd())).toThrow(/unsupported JSON path.*terminalFailure/);
  });

  it("fails a restored watcher with malformed persisted conditions", async () => {
    const meta = startWatchTask(fakePi, {
      command: 'node -e \'console.log(JSON.stringify({status:"FAILURE",terminalFailure:true}))\'',
      interval_seconds: 60,
      callback: false,
      success_when: { type: "json_path_equals", path: "$.status", value: "SUCCESS" },
      failure_when: { type: "json_path_equals", path: "$.terminalFailure", value: true },
    }, process.cwd());
    meta.failureWhen = { type: "json_path_equals", path: "terminalFailure", value: true };
    writeMeta(meta);
    resumeRunningTask(fakePi, meta);
    const terminal = await waitForMeta(meta.id, (m) => m?.status === "failed");
    expect(terminal?.error).toMatch(/failure_when.*unsupported JSON path/);
  });

  it("reports retryable evaluation errors and clears them after recovery", async () => {
    const meta = startWatchTask(fakePi, {
      command: 'node -e \'console.log(JSON.stringify({status:"pending"}))\'',
      interval_seconds: 1,
      callback: false,
      success_when: { type: "json_path_equals", path: "$.missing", value: true },
    }, process.cwd());
    const waiting = await waitForMeta(meta.id, (m) => Boolean(m?.error));
    expect(waiting?.status).toBe("running");
    expect(waiting?.error).toContain("JSON path not found");
    writeMeta({ ...waiting!, successWhen: { type: "json_path_equals", path: "$.status", value: "pending" } });
    const terminal = await waitForMeta(meta.id, (m) => m?.status === "succeeded");
    expect(terminal?.error).toBeUndefined();
  });
  it("counts a terminal poll's capture overflow once", async () => {
    const meta = startWatchTask(fakePi, {
      shell: "none" as const,
      argv: [process.execPath, "-e", "process.stdout.write('x'.repeat(1200012))"],
      interval_seconds: 60,
      callback: false,
      success_when: { type: "exit_code", equals: 0 },
    }, process.cwd());
    try {
      const terminal = await waitForMeta(meta.id, (m) => m?.status === "succeeded", 15_000);
      expect(terminal?.captureDiscardedBytes).toBe(1_200_012 - 1024 * 1024);
      expect(terminal?.stdoutDiscardedBytes).toBe(1_200_012 - 1024 * 1024);
      expect(terminal?.captureOverflowEvents).toBe(1);
    } finally {
      rmSync(taskDir(meta.id), { recursive: true, force: true });
    }
  });

  it("defaults command watchers to a 15 minute timeout", () => {
    const before = Date.now();
    const meta = startWatchTask(fakePi, {
      name: "default timeout watcher",
      command: "node -e 'console.log(JSON.stringify({status:\"pending\"}))'",
      interval_seconds: 60,
      callback: false,
      success_when: { type: "json_path_equals", path: "$.status", value: "done" },
    }, process.cwd());
    const after = Date.now();

    expect(meta.deadlineAt).toBeGreaterThanOrEqual(before + 15 * 60 * 1000);
    expect(meta.deadlineAt).toBeLessThanOrEqual(after + 15 * 60 * 1000);
  });

  it("keeps explicit watcher timeouts and lets zero disable the default", () => {
    const explicit = startWatchTask(fakePi, {
      name: "explicit timeout watcher",
      command: "node -e 'console.log(JSON.stringify({status:\"pending\"}))'",
      interval_seconds: 60,
      timeout_seconds: 42,
      callback: false,
      success_when: { type: "json_path_equals", path: "$.status", value: "done" },
    }, process.cwd());
    const disabled = startWatchTask(fakePi, {
      name: "disabled timeout watcher",
      command: "node -e 'console.log(JSON.stringify({status:\"pending\"}))'",
      interval_seconds: 60,
      timeout_seconds: 0,
      callback: false,
      success_when: { type: "json_path_equals", path: "$.status", value: "done" },
    }, process.cwd());

    expect(explicit.deadlineAt).toBeDefined();
    expect(Math.round(((explicit.deadlineAt ?? 0) - explicit.startedAt) / 1000)).toBe(42);
    expect(disabled.deadlineAt).toBeUndefined();
  });

  // @characterizes background-task.local-watch
  // @covers background-task.local-watch
  // @level integration
  it("runs a command watcher to success", async () => {
    const meta = startWatchTask(fakePi, {
      name: "test watcher",
      command: "node -e 'console.log(JSON.stringify({status:\"done\"}))'",
      interval_seconds: 1,
      timeout_seconds: 5,
      callback: false,
      success_when: { type: "json_path_equals", path: "$.status", value: "done" },
    }, process.cwd());

    const terminal = await waitForMeta(meta.id, (m) => m?.status === "succeeded");
    expect(terminal?.result).toMatchObject({ reason: "success condition matched", exitCode: 0 });
  });

  // @characterizes background-task.local-watch
  // @covers background-task.local-watch
  // @level integration
  it("finalizes a command watcher when failure_when matches", async () => {
    const meta = startWatchTask(fakePi, {
      name: "test failing watcher",
      command: "node -e 'console.log(JSON.stringify({status:\"failed\"}))'",
      interval_seconds: 1,
      timeout_seconds: 5,
      callback: false,
      success_when: { type: "json_path_equals", path: "$.status", value: "done" },
      failure_when: { type: "json_path_equals", path: "$.status", value: "failed" },
    }, process.cwd());

    const terminal = await waitForMeta(meta.id, (m) => m?.status === "failed");
    expect(terminal?.result).toMatchObject({ reason: "failure condition matched", exitCode: 0 });
  });

  // @characterizes background-task.local-watch
  // @covers background-task.local-watch
  // @level integration
  it("times out a command watcher", async () => {
    const meta = startWatchTask(fakePi, {
      name: "test timeout watcher",
      shell: "none" as const,
      argv: [process.execPath, "-e", "console.log(JSON.stringify({status:'pending'}))"],
      interval_seconds: 1,
      timeout_seconds: 0.1,
      callback: false,
      success_when: { type: "json_path_equals", path: "$.status", value: "done" },
    }, process.cwd());

    const terminal = await waitForMeta(meta.id, (m) => m?.status === "timed_out", 2500);
    expect(terminal?.result).toMatchObject({ reason: "timeout" });
  });

  it("finalizes a short spawned process", async () => {
    const meta = spawnTask(fakePi, {
      name: "test process",
      shell: "none" as const,
      argv: [process.execPath, "-e", "process.exit(0)"],
      callback: false,
    }, process.cwd());

    const terminal = await waitForMeta(meta.id, (m) => m?.status === "succeeded", 30_000);
    expect(terminal?.lastExitCode).toBe(0);
  }, 30_000);

  it("retains bounded output from a noisy spawned process", async () => {
    const meta = spawnTask(fakePi, {
      name: "bounded process log",
      shell: "none" as const,
      argv: [process.execPath, "-e", "process.stdout.write('x'.repeat(200000))"],
      max_log_bytes: 64 * 1024,
      callback: false,
    }, process.cwd());

    const terminal = await waitForMeta(meta.id, (m) => m?.status === "succeeded" && Boolean(m.logDiscardedBytes), 30_000);

    expect(terminal?.maxLogBytes).toBe(64 * 1024);
    expect(terminal?.logDiscardedBytes).toBeGreaterThan(0);
    expect(statSync(meta.logPath).size).toBeLessThanOrEqual(64 * 1024);
    expect(readFileSync(meta.logPath, "utf8")).toContain("x".repeat(100));
    expect(terminal?.logRetentionEvents).toBe(1);
  }, 30_000);

  it("callback completion does not embed process output", async () => {
    const messages: Array<{ message: string; options: unknown }> = [];
    const pi = {
      sendMessage: (message: { content: string }, options: unknown) => { messages.push({ message: message.content, options }); },
    } as unknown as ExtensionAPI;
    const origin = { cwd: process.cwd(), sessionId: "session-a" };
    const sentinel = "UNIQUE_BACKGROUND_LOG_PAYLOAD_SHOULD_NOT_DISPLAY";
    const meta = spawnTask(pi, {
      name: "callback process",
      shell: "none" as const,
      argv: [process.execPath, "-e", `console.log(${JSON.stringify(sentinel)})`],
      callback: true,
    }, process.cwd(), origin, () => origin);

    const terminal = await waitForMeta(meta.id, (m) => m?.status === "succeeded" && Boolean(m.callbackSentAt), 30_000);

    expect(terminal?.status).toBe("succeeded");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("bg_task_status");
    expect(messages[0]?.message).toContain("Full results and logs are intentionally omitted");
    expect(messages[0]?.message).not.toContain(sentinel);
    expect(messages[0]?.options).toMatchObject({ deliverAs: "followUp" });
  }, 30_000);

  // @covers background-task.terminal-callback
  // @level integration
  // @fails-without-fix background-task.terminal-callback
  it("batches terminal metadata replay, excludes callback:false and raw payloads, then marks successful handoff", async () => {
    const messages: string[] = [];
    const pi = {
      sendMessage: (message: { content: string }) => { messages.push(message.content); },
    } as unknown as ExtensionAPI;
    const origin = { cwd: process.cwd(), sessionId: "batch-session" };
    const ids = [`bg_batch_a_${Date.now()}`, `bg_batch_b_${Date.now()}`, `bg_batch_quiet_${Date.now()}`];
    const metas = [
      terminalMeta(ids[0]!, origin, { name: "build", status: "succeeded", result: { raw: "RESULT_SENTINEL_A" } }),
      terminalMeta(ids[1]!, origin, { name: "test", status: "failed", result: { raw: "RAW_LOG_SENTINEL_B" } }),
      terminalMeta(ids[2]!, origin, { name: "quiet", status: "succeeded", callback: false }),
    ];

    try {
      for (const meta of metas) writeMeta(meta);
      for (const meta of metas) resumeRunningTask(pi, meta, () => origin);
      expect(await getCallbackBatcher(pi).flush()).toBe(true);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("2 background completions are ready");
      expect(messages[0]).toContain(ids[0]);
      expect(messages[0]).toContain(ids[1]);
      expect(messages[0]).not.toContain(ids[2]);
      expect(messages[0]).toContain("bg_task_status");
      expect(messages[0]).not.toMatch(/RESULT_SENTINEL_A|RAW_LOG_SENTINEL_B/);
      expect(readMeta(ids[0]!)?.callbackSentAt).toBeTypeOf("number");
      expect(readMeta(ids[1]!)?.callbackSentAt).toBeTypeOf("number");
      expect(readMeta(ids[2]!)?.callbackSentAt).toBeUndefined();
    } finally {
      for (const id of ids) rmSync(taskDir(id), { recursive: true, force: true });
    }
  });

  // @covers background-task.terminal-callback
  // @level integration
  // @fails-without-fix background-task.terminal-callback
  it("keeps a failed batch retryable, writes no early markers, and suppresses a foreign session", async () => {
    let failNext = true;
    const messages: string[] = [];
    const pi = {
      sendMessage: (message: { content: string }) => {
        if (failNext) {
          failNext = false;
          throw new Error("simulated batch handoff failure");
        }
        messages.push(message.content);
      },
    } as unknown as ExtensionAPI;
    const active = { cwd: process.cwd(), sessionId: "session-b" };
    const foreign = { cwd: process.cwd(), sessionId: "session-a" };
    const ids = [`bg_retry_a_${Date.now()}`, `bg_retry_b_${Date.now()}`, `bg_foreign_${Date.now()}`];
    const metas = [
      terminalMeta(ids[0]!, active, { name: "retry-a" }),
      terminalMeta(ids[1]!, active, { name: "retry-b" }),
      terminalMeta(ids[2]!, foreign, { name: "foreign" }),
    ];

    try {
      for (const meta of metas) writeMeta(meta);
      for (const meta of metas) resumeRunningTask(pi, meta, () => active);
      const batcher = getCallbackBatcher(pi);

      expect(await batcher.flush()).toBe(false);
      expect(readMeta(ids[0]!)?.callbackSentAt).toBeUndefined();
      expect(readMeta(ids[1]!)?.callbackSentAt).toBeUndefined();
      expect(readMeta(ids[2]!)?.callbackSentAt).toBeUndefined();
      expect(readMeta(ids[2]!)?.callbackSuppressedAt).toBeTypeOf("number");

      expect(await batcher.flush()).toBe(true);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain(ids[0]);
      expect(messages[0]).toContain(ids[1]);
      expect(messages[0]).not.toContain(ids[2]);
      expect(readMeta(ids[0]!)?.callbackSentAt).toBeTypeOf("number");
      expect(readMeta(ids[1]!)?.callbackSentAt).toBeTypeOf("number");
    } finally {
      for (const id of ids) rmSync(taskDir(id), { recursive: true, force: true });
    }
  });

  it("cancels a spawned process", async () => {
    const meta = spawnTask(fakePi, {
      name: "test cancellable process",
      command: "node -e 'setTimeout(() => {}, 10000)'",
      callback: false,
    }, process.cwd());

    const stopped = await stopTask(fakePi, meta.id);

    expect(stopped?.status).toBe("cancelled");
    expect(readMeta(meta.id)?.result).toMatchObject({ reason: "cancelled" });
  });

  it("queues no terminal callback for a cancelled task", async () => {
    const messages: Array<{ message: string; options: unknown }> = [];
    const pi = {
      sendMessage: (message: { content: string }, options: unknown) => { messages.push({ message: message.content, options }); },
    } as unknown as ExtensionAPI;
    const meta = spawnTask(pi, {
      name: "cancelled callback task",
      command: "node -e 'setTimeout(() => {}, 10000)'",
      callback: true,
    }, process.cwd());

    const stopped = await stopTask(pi, meta.id);
    expect(stopped?.status).toBe("cancelled");

    // Flush any queued callback so silence does not depend on the batch timer.
    await getCallbackBatcher(pi).flush();
    expect(messages).toHaveLength(0);

    const terminal = readMeta(meta.id);
    expect(terminal?.callbackSentAt).toBeUndefined();
    expect(terminal?.callbackSuppressedAt).toBeTypeOf("number");
    expect(terminal?.callbackSuppressedReason).toContain("cancelled");
  });
});

function terminalMeta(
  id: string,
  callbackOrigin: { cwd: string; sessionId?: string },
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    name: "terminal fixture",
    kind: "process" as const,
    status: "succeeded" as const,
    startedAt: Date.now() - 1_000,
    endedAt: Date.now(),
    lastProgressAt: Date.now(),
    logPath: `${taskDir(id)}/output.log`,
    callback: true,
    callbackOrigin,
    cwd: callbackOrigin.cwd,
    spawnPid: process.pid,
    result: { reason: "fixture" },
    ...overrides,
  };
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
  throw new Error(`task ${id} did not reach the expected state: ${JSON.stringify(readMeta(id))}`);
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}
