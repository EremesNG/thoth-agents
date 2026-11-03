import { rmSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startCommandOnce } from "./process.js";
import { formatStatus } from "./output.js";
import { readMeta, taskDir, writeMeta } from "./registry.js";
import { resumeRunningTask, resumeScheduledWork, startWatchTask, suspendScheduledWork } from "./runtime.js";
import { observeBackgroundTaskStall } from "./stall.js";
import type { BackgroundTaskMeta, CommandResult } from "./types.js";

vi.mock("./process.js", async (original) => ({
  ...await original<typeof import("./process.js")>(),
  startCommandOnce: vi.fn(),
}));

const startedAt = Date.parse("2026-01-01T00:00:00Z");
const intervalMs = 30_000;
const pi = {} as ExtensionAPI;
const ids: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(startedAt);
  resumeScheduledWork(pi);
});
afterEach(() => {
  suspendScheduledWork(pi);
  for (const id of ids.splice(0)) rmSync(taskDir(id), { recursive: true, force: true });
  vi.useRealTimers();
  vi.clearAllMocks();
});

type Outcome = Partial<CommandResult> & { error?: string };
function watch(outcome: () => Outcome = () => ({})): BackgroundTaskMeta {
  vi.mocked(startCommandOnce).mockImplementation(() => ({
    result: Promise.resolve({ exitCode: 0, signal: null, stdout: '{"status":"pending"}\n', stderr: "",
      startedAt: Date.now(), endedAt: Date.now(), ...outcome() }),
    terminate: async () => {}, cleanupPending: false, cleanupVerified: true,
  }));
  const meta = startWatchTask(pi, {
    shell: "none", argv: [process.execPath], interval_seconds: intervalMs / 1000,
    timeout_seconds: 0, callback: false, blind_checks: 0,
    success_when: { type: "json_path_equals", path: "$.status", value: "done" },
  }, process.cwd());
  ids.push(meta.id);
  return meta;
}

function current(meta: BackgroundTaskMeta): BackgroundTaskMeta { return readMeta(meta.id)!; }

describe("watch outcome progress", () => {
  it("becomes stalled while identical outcomes keep polling, then recovers on a changed outcome", async () => {
    let status = "pending";
    const task = watch(() => ({ stdout: JSON.stringify({ status }) }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(11 * intervalMs);
    expect(current(task).lastCheckedAt).toBe(startedAt + 11 * intervalMs);
    expect(current(task).lastProgressAt).toBe(startedAt);
    expect(observeBackgroundTaskStall(current(task)).state).toBe("stalled");
    expect(formatStatus(current(task))).toContain("last check: 0s ago");

    status = "halfway";
    await vi.advanceTimersByTimeAsync(intervalMs);
    expect(current(task).lastProgressAt).toBe(startedAt + 12 * intervalMs);
    expect(observeBackgroundTaskStall(current(task)).state).toBe("healthy");
    expect(formatStatus(current(task))).toContain('last state: {"status":"halfway"}');
    await vi.advanceTimersByTimeAsync(10 * intervalMs);
    expect(observeBackgroundTaskStall(current(task)).state).toBe("stalled");
  });

  it("ignores JSON key order, formatting, and changing poll metadata", async () => {
    let count = 0;
    const task = watch(() => {
      count += 1;
      return { stdout: count % 2
        ? '{"status":"pending","detail":[{"b":2,"a":1},false]}'
        : ' { "detail": [ { "a": 1, "b": 2 }, false ], "status": "pending" }\n',
        startedAt: Date.now(), endedAt: Date.now() + count * 1_000 };
    });
    await vi.advanceTimersByTimeAsync(11 * intervalMs);
    expect(current(task).lastCheckedAt).toBe(startedAt + 11 * intervalMs);
    expect(current(task).lastProgressAt).toBe(startedAt);
    expect(observeBackgroundTaskStall(current(task)).state).toBe("stalled");
  });

  it("ignores terminal markup and redraws in text stdout and stderr", async () => {
    let count = 0;
    const task = watch(() => {
      count += 1;
      return count % 2
        ? { stdout: "pending\n", stderr: "step 1\n" }
        : { stdout: "\u001b]0;title\u0007\u001b[31mold\rpending\u001b[0m  \r\n", stderr: "\u001b[2Kstep 1\r\u001b[2Kstep 1\rstep 1\n" };
    });
    writeMeta({ ...task, successWhen: { type: "stdout_contains", value: "done" } });
    await vi.advanceTimersByTimeAsync(11 * intervalMs);
    expect(current(task).lastProgressAt).toBe(startedAt);
    expect(observeBackgroundTaskStall(current(task)).state).toBe("stalled");
  });

  it.each<[string, Outcome]>([
    ["stdout content", { stdout: '{"status":"halfway"}' }],
    ["JSON array order", { stdout: '{"status":"pending","items":[2,1]}' }],
    ["stderr content", { stderr: "new warning" }],
    ["exit code", { exitCode: 7 }],
    ["signal", { signal: "SIGTERM" }],
    ["reported error", { error: "cannot reach service" }],
  ])("counts changed %s as progress and not subsequent repetitions", async (_name, next) => {
    let changed = false;
    const task = watch(() => ({ stdout: '{"status":"pending","items":[1,2]}', ...(changed ? next : {}) }));
    await vi.advanceTimersByTimeAsync(11 * intervalMs);
    expect(current(task).lastProgressAt).toBe(startedAt);
    changed = true;
    await vi.advanceTimersByTimeAsync(intervalMs);
    expect(current(task).lastProgressAt).toBe(startedAt + 12 * intervalMs);
    await vi.advanceTimersByTimeAsync(intervalMs);
    expect(current(task).lastProgressAt).toBe(startedAt + 12 * intervalMs);
  });

  it("does not count repeated condition-evaluation errors as progress", async () => {
    const task = watch();
    writeMeta({ ...task, successWhen: { type: "json_path_equals", path: "$.missing", value: true } });
    await vi.advanceTimersByTimeAsync(11 * intervalMs);
    expect(current(task).error).toContain("JSON path not found");
    expect(current(task).lastProgressAt).toBe(startedAt);
    expect(observeBackgroundTaskStall(current(task)).state).toBe("stalled");
  });

  it("preserves its outcome comparison and clock across a resume", async () => {
    const task = watch();
    await vi.advanceTimersByTimeAsync(2 * intervalMs);
    const persisted = current(task);
    expect(persisted.watchFingerprint).toMatch(/^v1:[a-f0-9]{64}$/);
    suspendScheduledWork(pi);
    resumeScheduledWork(pi);
    resumeRunningTask(pi, persisted);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(intervalMs);
    expect(current(task).watchFingerprint).toBe(persisted.watchFingerprint);
    expect(current(task).lastProgressAt).toBe(startedAt);
    expect(current(task).lastCheckedAt).toBe(startedAt + 3 * intervalMs);
  });

  it.each([undefined, "v0:legacy"])("adopts an old fingerprint (%s) using its saved progress clock", async (fingerprint) => {
    const task = watch();
    await vi.advanceTimersByTimeAsync(0);
    const savedProgressAt = startedAt + intervalMs;
    writeMeta({ ...current(task), watchFingerprint: fingerprint, lastProgressAt: savedProgressAt });
    await vi.advanceTimersByTimeAsync(2 * intervalMs);
    expect(current(task).watchFingerprint).toMatch(/^v1:/);
    expect(current(task).lastProgressAt).toBe(savedProgressAt);
  });

  it.each([undefined, "v0:legacy"])("adopts a legacy clock from its last check without immediately stalling (%s)", async (fingerprint) => {
    const task = watch();
    await vi.advanceTimersByTimeAsync(0);
    suspendScheduledWork(pi);
    vi.setSystemTime(startedAt + 600_000);
    const legacy = { ...current(task), watchFingerprint: fingerprint, lastProgressAt: undefined, lastCheckedAt: Date.now() };
    writeMeta(legacy);
    expect(observeBackgroundTaskStall(legacy).state).toBe("healthy");
    resumeScheduledWork(pi);
    resumeRunningTask(pi, legacy);
    await vi.advanceTimersByTimeAsync(intervalMs);
    expect(current(task).watchFingerprint).toMatch(/^v1:/);
    expect(current(task).lastProgressAt).toBe(startedAt + 600_000);
    expect(current(task).lastCheckedAt).toBe(startedAt + 600_000 + intervalMs);
    await vi.advanceTimersByTimeAsync(9 * intervalMs);
    expect(current(task).lastProgressAt).toBe(startedAt + 600_000);
    expect(observeBackgroundTaskStall(current(task)).state).toBe("stalled");
  });

  it("adopts a legacy record without any clock using launch time", async () => {
    const task = watch();
    writeMeta({ ...task, lastProgressAt: undefined });
    await vi.advanceTimersByTimeAsync(intervalMs);
    expect(current(task).lastProgressAt).toBe(startedAt);
  });

  it.each<[string, Outcome, string]>([
    ["success", { stdout: '{"status":"done"}' }, "succeeded"],
    ["failure", { stdout: '{"status":"failed"}' }, "failed"],
    ["timeout", { timedOut: true }, "timed_out"],
  ])("still finishes on the poll observing %s", async (_name, next, status) => {
    let changed = false;
    const task = watch(() => changed ? next : {});
    writeMeta({ ...task, failureWhen: { type: "json_path_equals", path: "$.status", value: "failed" } });
    await vi.advanceTimersByTimeAsync(0);
    changed = true;
    await vi.advanceTimersByTimeAsync(intervalMs);
    expect(current(task).status).toBe(status);
    expect(current(task).lastProgressAt).toBe(startedAt + intervalMs);
  });
});
