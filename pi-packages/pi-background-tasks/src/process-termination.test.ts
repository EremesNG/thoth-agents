import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { terminateProcessTree } from "./process-termination.js";

vi.mock("node:child_process", async (original) => ({
  ...await original<typeof import("node:child_process")>(), execFileSync: vi.fn(), spawnSync: vi.fn(),
}));
const platform = process.platform;
afterEach(() => {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  vi.restoreAllMocks(); vi.clearAllMocks();
});

describe("verified tree termination", () => {
  it("does not treat a permission-denied liveness probe as verified termination", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify([{ ProcessId: 950001, ParentProcessId: process.pid }]));
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("Access is denied"), { code: "EPERM" });
    });
    vi.mocked(spawnSync).mockReturnValue({ status: 5, stderr: "Access is denied." } as any);
    await expect(terminateProcessTree(950001)).rejects.toThrow("taskkill failed with exit 5 for PID 950001");
  });


  it("escalates orphaned group members and their TERM-resistant descendants in separate groups after the leader exits", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    const live = new Set([910001, 910002]);
    vi.mocked(execFileSync).mockImplementation(() => {
      // Leader 910000 has exited; its group member owns a descendant in a new group.
      return `910001 1 910000 ${live.has(910001) ? "S" : "Z"}\n910002 910001 910002 ${live.has(910002) ? "S" : "Z"}\n`;
    });
    const kill = vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (signal === "SIGKILL") {
        if (pid === -910000 || pid === 910001) live.delete(910001);
        if (pid === -910002 || pid === 910002) live.delete(910002);
      }
      return true;
    });
    await terminateProcessTree(910000, 910000);
    expect([...live]).toEqual([]);
    expect(kill).toHaveBeenCalledWith(-910000, "SIGTERM");
    expect(kill).toHaveBeenCalledWith(-910002, "SIGKILL");
  });

  it("checks descendants created in a new group by a TERM handler before declaring termination", async () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    let parentAlive = true;
    let descendantAlive = false;
    vi.mocked(execFileSync).mockImplementation(() =>
      `920001 1 920001 ${parentAlive ? "S" : "Z"}\n` +
      (descendantAlive ? "920002 920001 920002 S\n" : ""));
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (signal === "SIGTERM" && parentAlive) descendantAlive = true;
      if (signal === "SIGKILL") {
        if (pid === -920001 || pid === 920001) parentAlive = false;
        if (pid === -920002 || pid === 920002) descendantAlive = false;
      }
      return true;
    });
    await terminateProcessTree(920001, 920001);
    expect(parentAlive).toBe(false);
    expect(descendantAlive).toBe(false);
  });
});
