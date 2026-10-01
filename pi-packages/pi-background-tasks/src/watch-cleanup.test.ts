import { EventEmitter } from "node:events";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lifecycleHost } from "./test-support/lifecycle-harness.js";
import { readMeta, writeMeta } from "./registry.js";

vi.mock("node:child_process", async (original) => ({
  ...await original<typeof import("node:child_process")>(),
  spawn: vi.fn(), spawnSync: vi.fn(), execFileSync: vi.fn(),
}));
const platform = process.platform;
const hosts: ReturnType<typeof lifecycleHost>[] = [];

afterEach(async () => {
  vi.useRealTimers();
  for (const host of hosts.splice(0)) await host.emit("session_shutdown", "quit");
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  vi.restoreAllMocks(); vi.clearAllMocks();
});

function faultInjectedTree() {
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  const live = new Set([930001, 930002]);
  const child = Object.assign(new EventEmitter(), {
    pid: 930001, stdout: new EventEmitter(), stderr: new EventEmitter(), unref() {},
  });
  vi.mocked(spawn).mockReturnValue(child as any);
  vi.mocked(execFileSync).mockImplementation(() => JSON.stringify([
    ...(live.has(930001) ? [{ ProcessId: 930001, ParentProcessId: process.pid }] : []),
    ...(live.has(930002) ? [{ ProcessId: 930002, ParentProcessId: live.has(930001) ? 930001 : 1 }] : []),
  ]));
  vi.spyOn(process, "kill").mockImplementation((pid) => {
    if (!live.has(pid)) throw Object.assign(new Error("gone"), { code: "ESRCH" });
    return true;
  });
  let fail = true;
  let closed = false;
  child.on("close", () => { closed = true; });
  vi.mocked(spawnSync).mockImplementation((_command, args) => {
    const pid = Number(args?.at(-1));
    if (fail && pid === 930002) {
      fail = false;
      return { status: 5, stderr: "Access is denied." } as any;
    }
    // Killing the parent first leaves an orphan if the descendant kill fails.
    live.delete(pid);
    if (!live.size && !closed) child.emit("close", 1, null);
    return { status: 0 } as any;
  });
  return { live, child, allowCleanup() { fail = false; } };
}

async function launchBlockedWatch(host: ReturnType<typeof lifecycleHost>, timeoutSeconds = 0, params: Record<string, unknown> = {}) {
  const controller = new AbortController();
  controller.abort(); // End only the tool's wait, not the watch poll.
  const text = await host.execute("bg_task_watch", {
    shell: false, argv: [process.execPath, "-e", "setInterval(() => {}, 10000)"],
    success_when: { type: "exit_code", equals: 0 }, timeout_seconds: timeoutSeconds, ...params,
  }, controller.signal);
  const id = text.match(/bg_[a-z0-9_]+/)![0];
  await expect.poll(() => vi.mocked(spawn).mock.calls.length).toBe(1);
  expect(spawn).toHaveBeenCalledWith(process.execPath, expect.any(Array),
    expect.objectContaining({ windowsHide: true, detached: true }));
  return id;
}

describe("watch cleanup ownership after termination failure", () => {
  it("a naturally settled poll cannot succeed while descendant cleanup is unverified", async () => {
    const { live, child } = faultInjectedTree();
    const host = lifecycleHost("natural-watch-close"); hosts.push(host);
    await host.emit("session_start");
    const id = await launchBlockedWatch(host);
    live.delete(930001);
    child.emit("close", 0, null);
    await expect.poll(async () => !!(await host.status(id)).stopError).toBe(true);
    expect(await host.status(id)).toMatchObject({ status: "running" });
    expect((await host.status(id)).endedAt).toBeUndefined();
    expect([...live]).toEqual([930002]);
    expect(host.messages).toEqual([]);
    await host.emit("session_shutdown", "quit");
    expect([...live]).toEqual([]);
    expect(await host.status(id)).toMatchObject({ status: "cancelled" });
  });

  it("a successful taskkill is not verification and cannot start another poll while a descendant remains alive", async () => {
    const { live, child, allowCleanup } = faultInjectedTree();
    allowCleanup();
    const host = lifecycleHost("watch-kill-not-verification"); hosts.push(host);
    await host.emit("session_start");
    const id = await launchBlockedWatch(host, 0, { success_when: { type: "exit_code", equals: 7 }, interval_seconds: 1 });
    const kill = vi.mocked(spawnSync).getMockImplementation()!;
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any); // OS reports success but does not kill.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    live.delete(930001);
    child.emit("close", 0, null);
    await vi.advanceTimersByTimeAsync(4500);
    expect(await host.status(id)).toMatchObject({ status: "running", stopError: expect.stringContaining("did not terminate") });
    expect((await host.status(id)).endedAt).toBeUndefined();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect([...live]).toEqual([930002]);
    vi.mocked(spawnSync).mockImplementation(kill);
    await host.emit("session_shutdown", "quit");
    expect([...live]).toEqual([]);
    expect(await host.status(id)).toMatchObject({ status: "cancelled" });
  });

  it.each(["success", "failure", "invalid condition", "nonmatching", "evaluation error"])(
    "%s results settle the tree before terminalizing or allowing the next poll", async (path) => {
      const { live, child, allowCleanup } = faultInjectedTree();
      allowCleanup();
      const host = lifecycleHost(`watch-settle-${path}`); hosts.push(host);
      await host.emit("session_start");
      const params = path === "failure" ? { failure_when: { type: "exit_code", equals: 0 } } :
        path === "evaluation error" ? { success_when: { type: "json_path_equals", path: "$.ok", value: true } } :
        path === "nonmatching" ? { success_when: { type: "exit_code", equals: 7 } } : {};
      const id = await launchBlockedWatch(host, 0, { ...params, interval_seconds: 1 });
      if (path === "invalid condition") writeMeta({ ...readMeta(id)!, successWhen: { type: "json_path_exists", path: "invalid" } });
      live.delete(930001);
      child.emit("close", 0, null);
      await expect.poll(() => [...live].length).toBe(0);
      const terminal = path === "success" ? "succeeded" : path === "failure" || path === "invalid condition" ? "failed" : "running";
      await expect.poll(async () => (await host.status(id)).status).toBe(terminal);
      if (terminal === "running") {
        await expect.poll(async () => !!(await host.status(id)).lastCheckedAt).toBe(true);
        // Only after the first tree is verified may a new poll be launched.
        await expect.poll(() => vi.mocked(spawn).mock.calls.length, { timeout: 3000 }).toBe(2);
      }
    });

  it("a known-PID command error fails only after successful tree verification, even when close races cleanup", async () => {
    const { live, child, allowCleanup } = faultInjectedTree();
    allowCleanup();
    const host = lifecycleHost("watch-known-pid-error-verified"); hosts.push(host);
    await host.emit("session_start");
    const id = await launchBlockedWatch(host);
    child.emit("error", new Error("pipe failed"));
    await expect.poll(async () => (await host.status(id)).status).toBe("failed");
    expect([...live]).toEqual([]);
    expect(await host.status(id)).toMatchObject({ result: { reason: "pipe failed" } });
  });

  it("a known-PID command error retains failed cleanup through reload until quit retries", async () => {
    const { live, child } = faultInjectedTree();
    const before = lifecycleHost("watch-known-pid-error"); hosts.push(before);
    await before.emit("session_start");
    const id = await launchBlockedWatch(before);
    child.emit("error", new Error("pipe failed"));
    await expect.poll(async () => !!(await before.status(id)).stopError).toBe(true);
    expect(await before.status(id)).toMatchObject({ status: "running" });
    expect([...live]).toEqual([930002]);
    await before.emit("session_shutdown", "reload");
    const after = lifecycleHost("watch-known-pid-error"); hosts.push(after);
    await after.emit("session_start");
    await after.emit("session_shutdown", "quit");
    expect(spawn).toHaveBeenCalledTimes(1);
    expect([...live]).toEqual([]);
    expect(await after.status(id)).toMatchObject({ status: "cancelled" });
    expect([...before.messages, ...after.messages]).toEqual([]);
  });

  it("a suspended instance verifies a naturally completed poll before releasing it", async () => {
    const { live, child } = faultInjectedTree();
    const before = lifecycleHost("suspended-watch-settlement"); hosts.push(before);
    await before.emit("session_start");
    const id = await launchBlockedWatch(before);
    await before.emit("session_shutdown", "reload");
    live.delete(930001);
    child.emit("close", 0, null);
    await expect.poll(async () => !!(await before.status(id)).stopError).toBe(true);
    const after = lifecycleHost("suspended-watch-settlement"); hosts.push(after);
    await after.emit("session_start");
    await after.emit("session_shutdown", "quit");
    expect([...live]).toEqual([]);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(await after.status(id)).toMatchObject({ status: "cancelled" });
  });

  it("failed timeout cleanup stays running and owned until a later non-reload shutdown verifies termination", async () => {
    const { live } = faultInjectedTree();
    const host = lifecycleHost("failed-watch-timeout"); hosts.push(host);
    await host.emit("session_start");
    const id = await launchBlockedWatch(host, 0.05);

    await expect.poll(async () => {
      const meta = await host.status(id);
      return meta.status !== "running" || !!meta.stopError;
    }).toBe(true);
    expect(await host.status(id)).toMatchObject({ status: "running", stopError: "taskkill failed with exit 5 for PID 930002: Access is denied." });
    expect((await host.status(id)).endedAt).toBeUndefined();
    expect([...live]).toEqual([930002]);
    expect(host.messages).toEqual([]);

    await host.emit("session_shutdown", "quit");
    expect([...live]).toEqual([]);
    expect(await host.status(id)).toMatchObject({ status: "cancelled" });
    expect(host.messages).toEqual([]);
  });

  it("a failed stop keeps the tree retriable and records cancelled only after the orphaned descendant is verified gone", async () => {
    const { live } = faultInjectedTree();
    const host = lifecycleHost("failed-watch-stop"); hosts.push(host);
    await host.emit("session_start");
    const id = await launchBlockedWatch(host);

    await host.execute("bg_task_stop", { id });
    expect(await host.status(id)).toMatchObject({ status: "running", stopError: "taskkill failed with exit 5 for PID 930002: Access is denied." });
    expect([...live]).toEqual([930002]);
    expect(host.messages).toEqual([]);

    await host.execute("bg_task_stop", { id });
    expect([...live]).toEqual([]);
    expect(await host.status(id)).toMatchObject({ status: "cancelled" });
    expect((await host.status(id)).stopError).toBeUndefined();
    expect(spawnSync).toHaveBeenCalledWith("taskkill", ["/T", "/F", "/PID", "930002"],
      expect.objectContaining({ windowsHide: true }));
    expect(execFileSync).toHaveBeenCalledWith("powershell.exe", expect.any(Array),
      expect.objectContaining({ windowsHide: true }));
  });
});
