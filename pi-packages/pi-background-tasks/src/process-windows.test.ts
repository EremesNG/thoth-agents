import { closeSync, existsSync, mkdtempSync, readFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveDefaultShell,
  spawnCommand,
  stopProcessGroup,
} from "./process.js";

vi.mock('@earendil-works/pi-coding-agent', () => ({
  SettingsManager: { create: () => ({ getShellPath: () => undefined }) },
  getShellConfig: (setting?: string) => ({ shell: setting || '/bin/bash', args: ['-c'] }),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    closeSync: vi.fn(actual.closeSync),
    existsSync: vi.fn(),
    writeSync: vi.fn(actual.writeSync),
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn(), spawnSync: vi.fn() };
});

const mockExists = vi.mocked(existsSync);
const mockClose = vi.mocked(closeSync);
const mockSpawn = vi.mocked(spawn);
const mockSpawnSync = vi.mocked(spawnSync);
const mockWrite = vi.mocked(writeSync);
const realPlatform = process.platform;

/** Normalize for assertions so Windows and POSIX joins compare equal. */
const norm = (value: string): string => value.replace(/\\/g, "/").toLowerCase();

function fakePlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

afterEach(() => {
  fakePlatform(realPlatform);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("POSIX shell selection",()=>{
 it("keeps the existing explicit POSIX override",()=>{fakePlatform("linux");vi.stubEnv("PI_BETTER_BACKGROUND_TASKS_SHELL","/custom/bash");expect(resolveDefaultShell()).toBe("/custom/bash");});
 it("uses Pi's /bin/bash resolution without PowerShell discovery on POSIX",()=>{fakePlatform("linux");vi.stubEnv("PI_BETTER_BACKGROUND_TASKS_SHELL","");expect(resolveDefaultShell()).toBe("/bin/bash");expect(mockExists).not.toHaveBeenCalled();});
});
describe("stopProcessGroup", () => {
  it.each(["SIGTERM", "SIGKILL"] as const)("refuses Windows PID cleanup (%s) without signalling any process", signal => {
    fakePlatform("win32");
    const kill = vi.spyOn(process, "kill");
    expect(() => stopProcessGroup(4242, undefined, signal)).toThrow(/owned Job Object/);
    expect(kill).not.toHaveBeenCalled();
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });
  it("signals only the POSIX group and never falls back to an unrelated PID", () => {
    fakePlatform("linux");
    const kill = vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("gone"), {code:"ESRCH"}); });
    expect(() => stopProcessGroup(500,500,"SIGKILL")).toThrow("gone");
    expect(kill).toHaveBeenCalledExactlyOnceWith(-500,"SIGKILL");
  });
});

describe("spawnCommand platform gating", () => {
  const fakeChild = { pid: 777, on: () => {}, unref: () => {} } as unknown as ChildProcess;

  it("keeps fd stdio and a verbatim command on POSIX", () => {
    vi.stubEnv("PI_BETTER_BACKGROUND_TASKS_SHELL", "");
    fakePlatform("linux");
    const log = join(mkdtempSync(join(tmpdir(), "bbt-gate-")), "gate.log");
    mockSpawn.mockImplementation((_file, _args, options) => {
      const stdio = options!.stdio as number[];
      writeSync(stdio[1]!, "stdout probe\n");
      writeSync(stdio[2]!, "stderr probe\n");
      return fakeChild;
    });

    spawnCommand({ shell: "bash" as const, command: "echo hi" }, log, true);

    const call = mockSpawn.mock.calls[0]!;
    expect(call[0]).toBe("/bin/bash");
    const args = call[1] as string[];
    const options = call[2] as { windowsHide: boolean; detached: boolean; stdio: unknown[] };
    expect(args).toEqual(["-c", "echo hi"]);
    expect(options).toMatchObject({ windowsHide: true, detached: true });
    expect(options.stdio[0]).toBe("ignore");
    expect(readFileSync(log, "utf8")).toContain("stdout probe\nstderr probe\n");
  });

  it("closes the POSIX log fd when writing the spawn marker fails", () => {
    fakePlatform("linux");
    const log = join(mkdtempSync(join(tmpdir(), "bbt-gate-")), "gate.log");
    mockSpawn.mockImplementation(() => fakeChild);
    mockWrite.mockImplementationOnce(() => { throw new Error("marker write failed"); });

    spawnCommand({ shell: "bash" as const, command: "echo hi" }, log, true);

    const fd = (mockSpawn.mock.calls.at(-1)?.[2] as { stdio: unknown[] }).stdio[1];
    expect(mockClose).toHaveBeenCalledWith(fd);
  });
});
