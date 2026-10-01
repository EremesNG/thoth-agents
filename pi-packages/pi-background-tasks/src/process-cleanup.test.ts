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
  const live = new Set([940001, 940002]);
  const child = Object.assign(new EventEmitter(), { pid: 940001, unref() {} });
  vi.mocked(spawn).mockReturnValue(child as any);
  vi.mocked(execFileSync).mockImplementation(() => JSON.stringify([
    ...(live.has(940001) ? [{ ProcessId: 940001, ParentProcessId: process.pid, CreationDate: "leader-original" }] : []),
    ...(live.has(940002) ? [{ ProcessId: 940002, ParentProcessId: live.has(940001) ? 940001 : 1, CreationDate: "child-original" }] : []),
  ]));
  vi.spyOn(process, "kill").mockImplementation((pid) => {
    if (!live.has(pid)) throw Object.assign(new Error("gone"), { code: "ESRCH" });
    return true;
  });
  let fail = true;
  vi.mocked(spawnSync).mockImplementation((_command, args) => {
    const pid = Number(args?.at(-1));
    if (fail && pid === 940002) {
      fail = false;
      return { status: 5, stderr: "Access is denied." } as any;
    }
    live.delete(pid);
    return { status: 0 } as any;
  });
  return { live, child, allowCleanup() { fail = false; } };
}

async function launchProcess(host: ReturnType<typeof lifecycleHost>, timeoutSeconds = 0) {
  const id = await host.spawn({ shell: false, argv: [process.execPath, "-e", "setInterval(() => {}, 10000)"], timeout_seconds: timeoutSeconds });
  expect(spawn).toHaveBeenCalledWith(expect.any(String), expect.any(Array),
    expect.objectContaining({ windowsHide: true, detached: true }));
  return id;
}

describe("ordinary process cleanup ownership after termination failure", () => {
  it.each([0, 7])("a natural leader exit %s keeps captured descendants owned until retry verifies cleanup", async (exitCode) => {
    const { live, child } = faultInjectedTree();
    const host = lifecycleHost(`natural-process-close-${exitCode}`); hosts.push(host);
    await host.emit("session_start");
    const id = await launchProcess(host);
    live.delete(940001);
    child.emit("close", exitCode, null);

    await expect.poll(async () => !!(await host.status(id)).stopError).toBe(true);
    expect(await host.status(id)).toMatchObject({ status: "running", lastExitCode: exitCode });
    expect((await host.status(id)).endedAt).toBeUndefined();
    expect([...live]).toEqual([940002]);
    expect(host.messages).toEqual([]);
    await host.emit("session_shutdown", "quit");
    expect([...live]).toEqual([]);
    expect(await host.status(id)).toMatchObject({ status: "cancelled" });
  });

  it("a failed process census is not verification, and shutdown retries retained identities", async () => {
    const { live, child, allowCleanup } = faultInjectedTree();
    allowCleanup();
    const host = lifecycleHost("natural-process-census-failure"); hosts.push(host);
    await host.emit("session_start");
    const id = await launchProcess(host);
    const census = vi.mocked(execFileSync).getMockImplementation()!;
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error("census unavailable"); });
    live.delete(940001);
    child.emit("close", 0, null);
    await expect.poll(async () => !!(await host.status(id)).stopError).toBe(true);
    expect(await host.status(id)).toMatchObject({ status: "running", stopError: "census unavailable" });
    expect([...live]).toEqual([940002]);
    await expect(host.emit("session_shutdown", "quit")).rejects.toThrow("cleanup failed");
    expect(await host.status(id)).toMatchObject({ status: "running" });
    vi.mocked(execFileSync).mockImplementation(census);
    await host.emit("session_shutdown", "quit");
    expect([...live]).toEqual([]);
    expect(await host.status(id)).toMatchObject({ status: "cancelled" });
  });

  it("a reused descendant PID is not killed or mistaken for the captured process", async () => {
    const { live, child } = faultInjectedTree();
    const host = lifecycleHost("natural-process-pid-reuse"); hosts.push(host);
    await host.emit("session_start");
    const id = await launchProcess(host);
    live.delete(940001);
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify([
      { ProcessId: 940002, ParentProcessId: 1, CreationDate: "unrelated-replacement" },
    ]));
    child.emit("close", 0, null);
    await expect.poll(async () => (await host.status(id)).status).toBe("succeeded");
    expect(spawnSync).not.toHaveBeenCalled();
    expect([...live]).toEqual([940002]); // An unrelated process is not owned work.
  });

  it.each(["restoration", "same-process grace"])("%s verifies an identifiable lost leader's tree before releasing ownership", async (path) => {
    const { live } = faultInjectedTree();
    const before = lifecycleHost(`lost-tree-${path}`); hosts.push(before);
    await before.emit("session_start");
    const id = await launchProcess(before);
    await before.emit("session_shutdown", "reload");
    live.delete(940001);
    if (path === "restoration") writeMeta({ ...readMeta(id)!, spawnPid: 999999 });
    const after = lifecycleHost(`lost-tree-${path}`); hosts.push(after);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    await after.emit("session_start");
    await vi.advanceTimersByTimeAsync(6000);
    expect(await after.status(id)).toMatchObject({ status: "running", stopError: expect.stringContaining("Access is denied") });
    expect((await after.status(id)).endedAt).toBeUndefined();
    expect([...live]).toEqual([940002]);
    await after.emit("session_shutdown", "quit");
    expect([...live]).toEqual([]);
    expect(await after.status(id)).toMatchObject({ status: "cancelled" });
  });

  it("a failed partial stop records cancelled only after retry verifies the orphan is gone", async () => {
    const { live } = faultInjectedTree();
    const host = lifecycleHost("failed-process-stop"); hosts.push(host);
    await host.emit("session_start");
    const id = await launchProcess(host);

    await host.execute("bg_task_stop", { id });
    expect(await host.status(id)).toMatchObject({ status: "running", stopError: expect.stringContaining("Access is denied") });
    expect([...live]).toEqual([940002]);
    expect((await host.status(id)).endedAt).toBeUndefined();

    await host.execute("bg_task_stop", { id });
    expect([...live]).toEqual([]);
    expect(await host.status(id)).toMatchObject({ status: "cancelled" });
    expect((await host.status(id)).stopError).toBeUndefined();
    expect(host.messages).toEqual([]);
  });

  it("a delayed leader close after a failed partial stop stays running until shutdown verifies one terminal state", async () => {
    const { live, child } = faultInjectedTree();
    const host = lifecycleHost("failed-process-stop-close"); hosts.push(host);
    await host.emit("session_start");
    const id = await launchProcess(host);

    await host.execute("bg_task_stop", { id });
    child.emit("close", 1, "SIGTERM");
    expect(await host.status(id)).toMatchObject({ status: "running", lastExitCode: 1, lastSignal: "SIGTERM" });
    expect((await host.status(id)).endedAt).toBeUndefined();
    expect([...live]).toEqual([940002]);

    await host.emit("session_shutdown", "quit");
    expect([...live]).toEqual([]);
    const terminal = await host.status(id);
    expect(terminal).toMatchObject({ status: "cancelled", lastExitCode: 1, lastSignal: "SIGTERM" });
    child.emit("close", 1, "SIGTERM");
    await host.emit("session_shutdown", "quit");
    expect((await host.status(id)).endedAt).toBe(terminal.endedAt);
    expect(host.messages).toEqual([]);
  });

  it("a failed ordinary deadline cleanup survives leader close and reload until shutdown retries the orphan", async () => {
    const { live, child } = faultInjectedTree();
    const before = lifecycleHost("failed-process-deadline"); hosts.push(before);
    await before.emit("session_start");
    const id = await launchProcess(before, 0.05);
    await expect.poll(async () => !!(await before.status(id)).stopError).toBe(true);
    child.emit("close", 0, null);
    expect(await before.status(id)).toMatchObject({ status: "running", lastExitCode: 0 });
    expect((await before.status(id)).endedAt).toBeUndefined();
    expect([...live]).toEqual([940002]);

    await before.emit("session_shutdown", "reload");
    const after = lifecycleHost("failed-process-deadline"); hosts.push(after);
    await after.emit("session_start");
    await after.emit("session_shutdown", "quit");
    expect([...live]).toEqual([]);
    expect(await after.status(id)).toMatchObject({ status: "cancelled", lastExitCode: 0 });
    expect([...before.messages, ...after.messages]).toEqual([]);
  });

  it("a fresh module reload keeps failed-stop orphan ownership beyond the lost-leader grace period", async () => {
    const { live, child } = faultInjectedTree();
    const before = lifecycleHost("failed-process-module-reload"); hosts.push(before);
    await before.emit("session_start");
    const id = await launchProcess(before);
    await before.execute("bg_task_stop", { id });
    await before.emit("session_shutdown", "reload");
    vi.resetModules();
    const fresh = await import("./test-support/lifecycle-harness.js");
    const after = fresh.lifecycleHost("failed-process-module-reload"); hosts.push(after);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    await after.emit("session_start");
    child.emit("close", 1, "SIGTERM");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await after.status(id)).toMatchObject({ status: "running", lastExitCode: 1 });
    expect([...live]).toEqual([940002]);
    await after.emit("session_shutdown", "quit");
    expect([...live]).toEqual([]);
    expect(await after.status(id)).toMatchObject({ status: "cancelled", lastExitCode: 1 });
    expect([...before.messages, ...after.messages]).toEqual([]);
  });

  it("a leader close during successful deadline termination cannot replace timed_out with failed", async () => {
    const { live, child, allowCleanup } = faultInjectedTree();
    allowCleanup();
    const kill = vi.mocked(spawnSync).getMockImplementation()!;
    vi.mocked(spawnSync).mockImplementation((...args) => {
      const result = kill(...args);
      if (Number(args[1]?.at(-1)) === 940001) child.emit("close", 1, "SIGTERM");
      return result;
    });
    const host = lifecycleHost("process-deadline-close-race"); hosts.push(host);
    await host.emit("session_start");
    const id = await launchProcess(host, 0.05);
    await expect.poll(async () => (await host.status(id)).status).toBe("timed_out");
    expect([...live]).toEqual([]);
    expect(await host.status(id)).toMatchObject({ lastExitCode: 1, lastSignal: "SIGTERM" });
  });
});
