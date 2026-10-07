vi.mock('./powershell.js', async original => ({...await original<typeof import('./powershell.js')>(), resolvePowerShell: () => 'pwsh.exe'}));
import { spawn } from "node:child_process";
import { fakeJobHelper } from "./test-support/job-helper-fixture.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lifecycleHost } from "./test-support/lifecycle-harness.js";
import { readMeta, writeMeta } from "./registry.js";

vi.mock("node:child_process", async (original) => ({
  ...await original<typeof import("node:child_process")>(),
  spawn: vi.fn(),
}));
const platform = process.platform;
const hosts: ReturnType<typeof lifecycleHost>[] = [];
let fixture: ReturnType<typeof fakeJobHelper>;

afterEach(async () => {
  vi.useRealTimers();
  fixture?.allowCleanup();
  for (const host of hosts.splice(0)) await host.emit("session_shutdown", "quit");
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  vi.restoreAllMocks(); vi.clearAllMocks();
});

function faultInjectedTree() { return fixture = fakeJobHelper(930001); }

async function launchBlockedWatch(host: ReturnType<typeof lifecycleHost>, timeoutSeconds = 0, params: Record<string, unknown> = {}) {
  const controller = new AbortController();
  controller.abort(); // End only the tool's wait, not the watch poll.
  const text = await host.execute("bg_task_watch", {
    shell: "none" as const, argv: [process.execPath, "-e", "setInterval(() => {}, 10000)"],
    success_when: { type: "exit_code", equals: 0 }, timeout_seconds: timeoutSeconds, ...params,
  }, controller.signal);
  const id = text.match(/bg_[a-z0-9_]+/)![0];
  await expect.poll(() => fixture.launchCount).toBe(1);
  expect(spawn).toHaveBeenCalledWith(expect.any(String), expect.any(Array),
    expect.objectContaining({ windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }));
  return id;
}

describe("watch cleanup ownership after termination failure", () => {
  it("helper crash mid-cleanup never authorizes a terminal status or another poll", async () => {
    faultInjectedTree();
    const host=lifecycleHost("watch-helper-crash");
    await host.emit("session_start"); const id=await launchBlockedWatch(host);
    await host.execute("bg_task_stop",{id});
    fixture.helper.kill(); // Actual transport failure; the client cannot query native emptiness.
    for(let retry=0;retry<2;retry++) {
      await expect(host.emit("session_shutdown","quit")).rejects.toThrow("cleanup failed");
      expect(await host.status(id)).toMatchObject({status:"running",stopError:expect.stringContaining("helper exited")});
      expect((await host.status(id)).endedAt).toBeUndefined();
    }
    expect(fixture.launchCount).toBe(1);expect(host.messages).toEqual([]);
    await host.emit("session_shutdown","reload"); // Suspend this synthetic unrecoverable owner; no real process was started.
  });
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

  it("successful TerminateJobObject is not verification while ActiveProcesses remains nonzero", async () => {
    const { live, child, allowCleanup } = faultInjectedTree();
    allowCleanup();
    const host = lifecycleHost("watch-kill-not-verification"); hosts.push(host);
    await host.emit("session_start");
    const id = await launchBlockedWatch(host, 0, { success_when: { type: "exit_code", equals: 7 }, interval_seconds: 1 });
    fixture.leaveActive(); // Terminate responds successfully but queries still report active work.
    live.delete(930001);
    child.emit("close", 0, null);
    await expect.poll(async () => !!(await host.status(id)).stopError, {timeout: 5000}).toBe(true);
    expect(await host.status(id)).toMatchObject({ status: "running", stopError: expect.stringContaining("active processes") });
    expect((await host.status(id)).endedAt).toBeUndefined();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect([...live]).toEqual([930002]);
    fixture.allowCleanup();
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
        await expect.poll(() => fixture.launchCount, { timeout: 3000 }).toBe(2);
        expect(fixture.requests.findIndex(r => r.op === "release")).toBeLessThan(fixture.requests.map(r => r.op).lastIndexOf("launch"));
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

  it.each(["win32", "linux"])("failed timeout cleanup stays running and owned until a later non-reload shutdown verifies termination (entry platform %s)", async (entryPlatform) => {
    Object.defineProperty(process, "platform", { value: entryPlatform, configurable: true });
    const { live } = faultInjectedTree();
    fixture.failCleanup();
    const host = lifecycleHost("failed-watch-timeout"); hosts.push(host);
    await host.emit("session_start");
    const id = await launchBlockedWatch(host, 0.05);

    await expect.poll(async () => {
      const meta = await host.status(id);
      return meta.status !== "running" || !!meta.stopError;
    }).toBe(true);
    // The helper reports leader exit after the timeout's failed termination;
    // wait for close-driven cleanup too, rather than racing its next query.
    await expect.poll(() => fixture.requests.filter(r => r.op === "terminate").length).toBe(2);
    expect(await host.status(id)).toMatchObject({ status: "running", stopError: "TerminateJobObject: Access is denied" });
    expect((await host.status(id)).endedAt).toBeUndefined();
    expect([...live]).toEqual([930002]);
    expect(host.messages).toEqual([]);
    expect(fixture.requests.filter(r => r.op === "release")).toHaveLength(0);

    fixture.allowCleanup();
    await host.emit("session_shutdown", "quit");
    expect(fixture.requests.filter(r => r.op === "terminate")).toHaveLength(3);
    expect(fixture.requests.filter(r => r.op === "release")).toHaveLength(1);
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
    expect(await host.status(id)).toMatchObject({ status: "running", stopError: "TerminateJobObject: Access is denied" });
    expect([...live]).toEqual([930002]);
    expect(host.messages).toEqual([]);

    await host.execute("bg_task_stop", { id });
    expect([...live]).toEqual([]);
    expect(await host.status(id)).toMatchObject({ status: "cancelled" });
    expect((await host.status(id)).stopError).toBeUndefined();
    expect(fixture.requests.filter(r => r.op === "terminate")).toHaveLength(2);
    expect(fixture.requests.filter(r => r.op === "release")).toHaveLength(1);
  });
});
