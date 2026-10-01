import { EventEmitter } from "node:events";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lifecycleHost } from "./test-support/lifecycle-harness.js";

vi.mock("node:child_process", async (original) => ({
  ...await original<typeof import("node:child_process")>(),
  spawn: vi.fn(), spawnSync: vi.fn(), execFileSync: vi.fn(),
}));
const platform = process.platform;
const hosts: ReturnType<typeof lifecycleHost>[] = [];

afterEach(async () => {
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
  vi.mocked(spawnSync).mockImplementation((_command, args) => {
    const pid = Number(args?.at(-1));
    if (fail && pid === 930002) {
      fail = false;
      return { status: 5, stderr: "Access is denied." } as any;
    }
    // Killing the parent first leaves an orphan if the descendant kill fails.
    live.delete(pid);
    if (!live.size) child.emit("close", 1, null);
    return { status: 0 } as any;
  });
  return { live };
}

async function launchBlockedWatch(host: ReturnType<typeof lifecycleHost>, timeoutSeconds = 0) {
  const controller = new AbortController();
  controller.abort(); // End only the tool's wait, not the watch poll.
  const text = await host.execute("bg_task_watch", {
    shell: false, argv: [process.execPath, "-e", "setInterval(() => {}, 10000)"],
    success_when: { type: "exit_code", equals: 0 }, timeout_seconds: timeoutSeconds,
  }, controller.signal);
  const id = text.match(/bg_[a-z0-9_]+/)![0];
  await expect.poll(() => vi.mocked(spawn).mock.calls.length).toBe(1);
  expect(spawn).toHaveBeenCalledWith(process.execPath, expect.any(Array),
    expect.objectContaining({ windowsHide: true, detached: true }));
  return id;
}

describe("watch cleanup ownership after termination failure", () => {
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
