import { EventEmitter } from "node:events";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCommandOnce, spawnCommand } from "./process.js";
import { terminateProcessTree } from "./process-termination.js";

vi.mock("node:child_process", async (original) => ({
  ...await original<typeof import("node:child_process")>(),
  spawn: vi.fn(), spawnSync: vi.fn(), execFileSync: vi.fn(),
}));
const realPlatform = process.platform;
afterEach(() => {
  Object.defineProperty(process, "platform", { value: realPlatform, configurable: true });
  vi.restoreAllMocks(); vi.clearAllMocks();
});

function child() {
  const value = Object.assign(new EventEmitter(), {
    pid: 777777, stdout: new EventEmitter(), stderr: new EventEmitter(), unref() {},
  });
  vi.mocked(spawn).mockReturnValue(value as any);
  return value;
}

describe("hidden Windows process launches", () => {
  it("jobs and one-shot watches hide their detached consoles on win32", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    child();
    spawnCommand({ shell: false, argv: [process.execPath, "-e", "process.exit(0)"] },
      join(mkdtempSync(join(tmpdir(), "bg-hide-")), "log"), true);
    expect(spawn).toHaveBeenLastCalledWith(expect.any(String), expect.any(Array),
      expect.objectContaining({ detached: true, windowsHide: true }));
    const watchChild = child();
    const result = runCommandOnce({ shell: false, argv: [process.execPath, "-e", "process.exit(0)"] });
    expect(spawn).toHaveBeenLastCalledWith(process.execPath, expect.any(Array),
      expect.objectContaining({ detached: true, windowsHide: true }));
    watchChild.emit("close", 0, null);
    await result;
  });

  it("process census and awaited tree kill hide their helper consoles on win32", async () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    vi.mocked(execFileSync).mockReturnValue("[]");
    let alive = true;
    vi.spyOn(process, "kill").mockImplementation(() => {
      if (!alive) throw Object.assign(new Error("gone"), { code: "ESRCH" });
      return true;
    });
    vi.mocked(spawnSync).mockImplementation(() => { alive = false; return { status: 0 } as any; });
    await terminateProcessTree(777777);
    expect(execFileSync).toHaveBeenCalledWith("powershell.exe", expect.any(Array),
      expect.objectContaining({ windowsHide: true }));
    expect(spawnSync).toHaveBeenCalledWith("taskkill", expect.any(Array),
      expect.objectContaining({ windowsHide: true }));
  });

  it("Node descendant fixtures explicitly hide consoles, including embedded scripts", () => {
    for (const file of ["lifecycle.test.ts", "process.test.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      const launches = [...source.matchAll(/require\('node:child_process'\)\.spawn\([\s\S]*?\{([^}]+)\}/g)];
      expect(launches.length).toBeGreaterThan(0);
      for (const launch of launches) expect(launch[1], file).toMatch(/windowsHide:\s*true/);
    }
  });
});
