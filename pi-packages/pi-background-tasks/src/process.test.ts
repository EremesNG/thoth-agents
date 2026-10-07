import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCommandOnce } from "./process.js";

const originalShell = process.env.SHELL;
const tempDirs: string[] = [];

afterEach(() => {
  if (originalShell === undefined) {
    Reflect.deleteProperty(process.env, "SHELL");
  } else {
    process.env.SHELL = originalShell;
  }
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("process shell execution", () => {
  // @level integration
  it("terminates a command that exceeds its run-once timeout", async () => {
    const startedAt = Date.now();

    const result = await runCommandOnce({
      shell: "none" as const,
      argv: [process.execPath, "-e", "setInterval(() => {}, 10_000)"],
    }, undefined, 25);

    expect(result.timedOut).toBe(true);
    expect(result.signal).toBe(process.platform === "win32" ? null : "SIGTERM");
    // Verified Windows cleanup includes a bounded process census and awaited tree kill.
    expect(Date.now() - startedAt).toBeLessThan(process.platform === "win32" ? 10_000 : 2_000);
  });

  // @level integration
  it("times a command out when its real work outlives the process that was spawned", async () => {
    // rather than exec'ing it, so the spawned pid is a wrapper and the work —
    // along with the output pipes `close` waits on — belongs to a process a
    // signal to that pid never reaches. Reproduced here with a plain shell,
    const startedAt = Date.now();

    const result = await runCommandOnce({ shell: "none" as const, argv: [process.execPath, "-e", "require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 10000)'], {stdio: 'inherit', windowsHide: true}); setInterval(() => {}, 10000)"] }, undefined, 25);

    expect(result.timedOut).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  it("uses a deterministic bash-compatible shell instead of the user's login shell", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-bg-shell-"));
    tempDirs.push(dir);
    const fakeShell = join(dir, "fake-shell");
    writeFileSync(fakeShell, "#!/bin/sh\necho unexpected login shell >&2\nexit 42\n");
    chmodSync(fakeShell, 0o755);
    process.env.SHELL = fakeShell;

    const result = await runCommandOnce({ command: "status=ok; printf '%s\\n' \"$status\"" });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("ok\n");
    expect(result.stderr).not.toContain("unexpected login shell");
  });

  it("counts capture overflow above 1 MiB instead of silently dropping the tail", async () => {
    const result = await runCommandOnce({
      argv: [process.execPath, "-e", "process.stdout.write('x'.repeat(1_200_012) + 'END_MARKER')"],
      shell: "none" as const,
    });
    expect(result.captureTruncated).toBe(true);
    expect(result.stdoutDiscardedBytes).toBeGreaterThan(1_200_012 - 1024 * 1024);
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(1024 * 1024);
    expect(result.stdout).not.toContain("END_MARKER");
    expect(result.stdout.startsWith("x")).toBe(true);
  });

  it("discards a code point split across chunks at the cap instead of decoding U+FFFD", async () => {
    const script = [
      "process.stdout.write(Buffer.from([0x61, 0xf0, 0x9f]));",
      "setTimeout(() => process.stdout.write(Buffer.from([0x98, 0x80, 0x62])), 60);",
    ].join("");
    const result = await runCommandOnce({ argv: [process.execPath, "-e", script], shell: "none" as const }, 4);
    expect(result.stdout).toBe("a");
    expect(result.stdout).not.toContain("\uFFFD");
    expect(result.stdoutDiscardedBytes).toBe(5);
    expect(result.captureTruncated).toBe(true);
  });

  it("does not split a multibyte UTF-8 character at the capture cap", async () => {
    const { utf8PrefixLength } = await import("./process.js");
    const buffer = Buffer.from("é");
    expect(utf8PrefixLength(buffer, 1)).toBe(0);
    expect(utf8PrefixLength(buffer, 2)).toBe(2);
  });
});
