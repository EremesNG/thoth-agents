import { rmSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startCommandOnce } from "./process.js";
import { readMeta, taskDir } from "./registry.js";
import { resumeRunningTask, resumeScheduledWork, startWatchTask, suspendScheduledWork } from "./runtime.js";
import type { BackgroundTaskMeta } from "./types.js";

vi.mock("./process.js", async (original) => ({
  ...await original<typeof import("./process.js")>(),
  startCommandOnce: vi.fn(),
}));

const intervalMs = 30_000;
const pi = {} as ExtensionAPI;
const ids: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-01-01T00:00:00Z"));
  resumeScheduledWork(pi);
  vi.mocked(startCommandOnce).mockImplementation(() => ({
    result: Promise.resolve({ exitCode: 0, signal: null, stdout: '{"status":"pending"}\n', stderr: "",
      startedAt: Date.now(), endedAt: Date.now() }),
    terminate: async () => {}, cleanupPending: false, cleanupVerified: true,
  }));
});
afterEach(() => {
  suspendScheduledWork(pi);
  for (const id of ids.splice(0)) rmSync(taskDir(id), { recursive: true, force: true });
  vi.useRealTimers();
  vi.clearAllMocks();
});

function watch(): BackgroundTaskMeta {
  const meta = startWatchTask(pi, {
    shell: "none", argv: [process.execPath], interval_seconds: intervalMs / 1000,
    timeout_seconds: 0, callback: false, blind_checks: 0,
    success_when: { type: "json_path_equals", path: "$.status", value: "done" },
  }, process.cwd());
  ids.push(meta.id);
  return meta;
}

describe("watch resume scheduling", () => {
  it("keeps the pending interval timer when an already scheduled watch is resumed", async () => {
    const task = watch();
    await vi.advanceTimersByTimeAsync(0);
    expect(startCommandOnce).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(intervalMs / 2);
    resumeRunningTask(pi, readMeta(task.id)!);
    await vi.advanceTimersByTimeAsync(0);
    expect(startCommandOnce).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(intervalMs / 2);
    expect(startCommandOnce).toHaveBeenCalledTimes(2);
  });

  it("still polls immediately when a watch has no pending timer", async () => {
    const task = watch();
    await vi.advanceTimersByTimeAsync(0);
    suspendScheduledWork(pi);
    resumeScheduledWork(pi);
    resumeRunningTask(pi, readMeta(task.id)!);
    await vi.advanceTimersByTimeAsync(0);
    expect(startCommandOnce).toHaveBeenCalledTimes(2);
  });
});
