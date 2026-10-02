import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { scheduleFailureAttention } from "./failures.js";
import { processExists } from "./process.js";
import { lifecycleHost } from "./test-support/lifecycle-harness.js";

const idle = { shell: false, argv: [process.execPath, "-e", "setInterval(() => {}, 10000)"] };

async function startTree(host: ReturnType<typeof lifecycleHost>) {
  const marker = join(mkdtempSync(join(tmpdir(), "bg-lifecycle-")), "pids.json");
  const id = await host.spawn({ shell: false, argv: [process.execPath, "-e", `
    const fs = require('node:fs');
    const child = require('node:child_process').spawn(process.execPath,
      ['-e', 'setInterval(() => {}, 10000)'], {stdio: 'inherit', windowsHide: true});
    fs.writeFileSync(process.argv[1], JSON.stringify([process.pid, child.pid]));
    setInterval(() => {}, 10000);
  `, marker] });
  let pids: number[] = [];
  await expect.poll(() => { try { pids = JSON.parse(readFileSync(marker, "utf8")); return pids.length; } catch { return 0; } }, { timeout: 10000 }).toBe(2);
  return { id, pids };
}

describe("session-owned background work lifecycle", () => {
  it.each(["process", "watch"])("a natural %s exit 0 verifies a contained grandchild before recording succeeded", async (kind) => {
    const host = lifecycleHost(`natural-detached-${kind}`);
    await host.emit("session_start");
    const directory = mkdtempSync(join(tmpdir(), "bg-natural-detached-"));
    const marker = join(directory, "pids.json");
    const release = join(directory, "release");
    const descendant = "const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 10000)'], {stdio: 'ignore', detached: process.platform === 'win32', windowsHide: true}); child.unref(); require('node:fs').writeFileSync(process.argv[1], JSON.stringify([Number(process.argv[2]), process.pid, child.pid])); setInterval(() => {}, 10000)";
    const argv = [process.execPath, "-e", `
      const child = require('node:child_process').spawn(process.execPath,
        ['-e', ${JSON.stringify(descendant)}, process.argv[1], String(process.pid)],
        {stdio: 'inherit', windowsHide: true});
      child.unref();
      setInterval(() => {
        if (require('node:fs').existsSync(process.argv[2])) process.exit(0);
      }, 25);
    `, marker, release];
    const controller = new AbortController(); controller.abort();
    const id = kind === "process" ? await host.spawn({ shell: false, argv }) :
      (await host.execute("bg_task_watch", { shell: false, argv, timeout_seconds: 0,
        success_when: { type: "exit_code", equals: 0 } }, controller.signal)).match(/bg_[a-z0-9_]+/)![0];
    let pids: number[] = [];
    const live = (pid: number) => {
      if (process.platform === "win32") return processExists(pid);
      try { return !execFileSync("ps", ["-p", String(pid), "-o", "stat="], {encoding: "utf8", windowsHide: true}).trim().startsWith("Z"); }
      catch { return false; }
    };
    try {
      await expect.poll(() => { try { pids = JSON.parse(readFileSync(marker, "utf8")); return pids.length; } catch { return 0; } }, { timeout: 10000 }).toBe(3);
      expect(pids.map(live)).toEqual([true, true, true]);
      // Exit immediately after all descendants start; no census grace is needed.
      writeFileSync(release, "finish");
      await expect.poll(() => host.status(id).then((meta) => meta.status), { timeout: 10000 }).toBe("succeeded");
      expect(pids.map(live)).toEqual([false, false, false]);
      expect((await host.status(id)).lastExitCode).toBe(0);
    } finally {
      for (const pid of pids) if (live(pid)) await import("./process-termination.js").then((p) => p.terminateProcessTree(pid, pid));
      await host.emit("session_shutdown", "quit");
    }
  }, 20000);

  it.each(["quit", "new", "resume", "fork"])("%s stops and verifies the origin's process tree before recording cancelled", async (reason) => {
    const host = lifecycleHost(`ending-${reason}`);
    await host.emit("session_start");
    const { id, pids } = await startTree(host);
    try {
      await host.emit("session_shutdown", reason);
      expect((await host.status(id)).status).toBe("cancelled");
      expect(pids.map(processExists)).toEqual([false, false]);
      expect(host.messages).toEqual([]);
    } finally { await host.execute("bg_task_stop", { id }); }
  }, 20000);

  it("two concurrent origins keep independent scheduling and callbacks when one quits", async () => {
    const root = lifecycleHost("concurrent-root");
    await root.emit("session_start");
    const id = await root.spawn({ shell: false, argv: [process.execPath, "-e", "setTimeout(() => console.log('done'), 1800)"] });
    const child = lifecycleHost("concurrent-child");
    await child.emit("session_start");
    const childId = await child.spawn(idle);
    try {
      await child.emit("session_shutdown", "quit");
      expect((await child.status(childId)).status).toBe("cancelled");
      await expect.poll(() => root.status(id).then((meta) => meta.status), {timeout: 10000}).toBe("succeeded");
      await expect.poll(() => root.messages.length, {timeout: 3000}).toBe(1);
      expect(child.messages).toEqual([]);
    } finally { await root.emit("session_shutdown", "quit"); }
  }, 20000);

  it("a headless second instance loading and ending leaves root UI and callbacks unchanged", async () => {
    const root = lifecycleHost("ui-root", true);
    await root.emit("session_start");
    const id = await root.spawn({ shell: false, argv: [process.execPath, "-e", "setTimeout(() => console.log('done'), 1800)"] });
    const calls = root.uiCalls.length;
    const editor = root.editor;
    const child = lifecycleHost("ui-child");
    await child.emit("session_start");
    await child.emit("session_before_switch");
    await child.emit("session_shutdown", "quit");
    try {
      expect(root.uiCalls.length).toBe(calls);
      expect(root.editor).toBe(editor);
      expect(root.statuses.get("background-work-nav")).toBe("← work · 1");
      await expect.poll(() => root.messages.length, {timeout: 10000}).toBe(1);
      expect(child.messages).toEqual([]);
    } finally { await root.emit("session_shutdown", "quit"); }
  }, 20000);

  it("reload during a blocked poll adopts one poll, then quit kills its descendants and delivers no duplicate callback", async () => {
    const before = lifecycleHost("blocked-reload");
    await before.emit("session_start");
    const directory = mkdtempSync(join(tmpdir(), "bg-blocked-reload-"));
    const marker = join(directory, "polls.jsonl");
    const controller = new AbortController();
    const launch = before.execute("bg_task_watch", { shell: false, argv: [process.execPath, "-e", `
      const child = require('node:child_process').spawn(process.execPath,
        ['-e', 'setInterval(() => {}, 10000)'], {stdio: 'inherit', windowsHide: true});
      require('node:fs').appendFileSync(process.argv[1], JSON.stringify([process.pid, child.pid]) + '\\n');
      setInterval(() => {}, 10000);
    `, marker], success_when: { type: "exit_code", equals: 0 }, timeout_seconds: 0 }, controller.signal);
    await expect.poll(() => { try { return readFileSync(marker, "utf8").trim().split("\n").length; } catch { return 0; } }, {timeout: 10000}).toBe(1);
    await before.emit("session_shutdown", "reload");
    const id = (await launch).match(/bg_[a-z0-9_]+/)![0];
    const after = lifecycleHost("blocked-reload");
    try {
      await after.emit("session_start");
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(readFileSync(marker, "utf8").trim().split("\n")).toHaveLength(1);
      await after.emit("session_shutdown", "quit");
      const pids = JSON.parse(readFileSync(marker, "utf8").trim()) as number[];
      expect(pids.map(processExists)).toEqual([false, false]);
      expect((await after.status(id)).status).toBe("cancelled");
      expect([...before.messages, ...after.messages]).toEqual([]); // Cancellation is intentionally quiet.
    } finally {
      for (const line of readFileSync(marker, "utf8").trim().split("\n")) for (const pid of JSON.parse(line))
        if (processExists(pid)) await import("./process-termination.js").then((p) => p.terminateProcessTree(pid));
      await after.emit("session_shutdown", "quit");
    }
  }, 20000);

  it.each([false, true])("an adopted watch poll completes once without overlapping execution or duplicate delivery (settles in reload gap=%s)", async (settlesInGap) => {
    const before = lifecycleHost("completed-poll-reload");
    await before.emit("session_start");
    const directory = mkdtempSync(join(tmpdir(), "bg-completed-poll-"));
    const marker = join(directory, "polls");
    const release = join(directory, "release");
    const pidFile = join(directory, "pid");
    const launch = before.execute("bg_task_watch", { shell: false, argv: [process.execPath, "-e", `
      const fs = require('node:fs'); fs.writeFileSync(process.argv[3], String(process.pid)); fs.appendFileSync(process.argv[1], 'poll\\n');
      const timer = setInterval(() => {
        if (fs.existsSync(process.argv[2])) { clearInterval(timer); console.log('ready'); }
      }, 25);
    `, marker, release, pidFile], success_when: {type: "stdout_contains", value: "ready"}, timeout_seconds: 0 });
    await expect.poll(() => { try { return readFileSync(marker, "utf8"); } catch { return ""; } }, {timeout: 10000}).toBe("poll\n");
    await before.emit("session_shutdown", "reload");
    const id = (await launch).match(/bg_[a-z0-9_]+/)![0];
    const after = lifecycleHost("completed-poll-reload");
    try {
      if (settlesInGap) {
        writeFileSync(release, "finish");
        const pid = Number(readFileSync(pidFile, "utf8"));
        await expect.poll(() => processExists(pid), {timeout: 10000}).toBe(false);
        // Let the exited command's verified settlement run while no instance can consume it.
        await new Promise((resolve) => setTimeout(resolve, 750));
        expect((await before.status(id)).status).toBe("running");
        expect(before.messages).toEqual([]);
      }
      await after.emit("session_start");
      writeFileSync(release, "finish");
      await expect.poll(() => after.messages.length, {timeout: 10000}).toBe(1);
      await after.emit("session_start");
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(readFileSync(marker, "utf8")).toBe("poll\n");
      expect((await after.status(id)).status).toBe("succeeded");
      expect(before.messages).toEqual([]);
      expect(after.messages).toHaveLength(1);
    } finally { await after.emit("session_shutdown", "quit"); }
  }, 20000);

  it("ending a child does not suspend the root's running failure-attention state", async () => {
    const root = lifecycleHost("attention-root");
    await root.emit("session_start");
    const launch = await root.execute("bg_task_watch", {shell: false,
      argv: [process.execPath, "-e", "console.error('broken check'); process.exitCode = 7"],
      success_when: {type: "stdout_contains", value: "ready"}, interval_seconds: 60, timeout_seconds: 0});
    const id = launch.match(/bg_[a-z0-9_]+/)![0];
    const child = lifecycleHost("attention-child");
    await child.emit("session_start");
    await child.emit("session_shutdown", "quit");
    const now = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => now() + 61000);
    try {
      scheduleFailureAttention(root.pi, id, () => ({cwd: root.ctx.cwd, sessionId: "attention-root"}));
      await expect.poll(() => root.messages.length, {timeout: 3000}).toBe(1);
      expect(root.messages[0]).toContain("Watch poll exited with code 7");
      expect(child.messages).toEqual([]);
    } finally { vi.restoreAllMocks(); await root.emit("session_shutdown", "quit"); }
  }, 20000);

  it("an overdue adopted watch poll is terminated before it is recorded timed out", async () => {
    const before = lifecycleHost("overdue-poll-reload");
    await before.emit("session_start");
    const marker = join(mkdtempSync(join(tmpdir(), "bg-overdue-poll-")), "pid");
    const launch = before.execute("bg_task_watch", {shell: false, argv: [process.execPath, "-e",
      "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 10000)", marker],
      success_when: {type: "exit_code", equals: 0}, timeout_seconds: 120});
    let pid = 0;
    await expect.poll(() => { try { return pid = Number(readFileSync(marker, "utf8")); } catch { return 0; } }, {timeout: 10000}).toBeGreaterThan(0);
    await before.emit("session_shutdown", "reload");
    const id = (await launch).match(/bg_[a-z0-9_]+/)![0];
    const after = lifecycleHost("overdue-poll-reload");
    const now = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => now() + 121000);
    try {
      await after.emit("session_start");
      await expect.poll(() => after.status(id).then((meta) => meta.status), {timeout: 10000}).toBe("timed_out");
      expect(processExists(pid)).toBe(false);
    } finally {
      vi.restoreAllMocks();
      if (processExists(pid)) await import("./process-termination.js").then((p) => p.terminateProcessTree(pid));
      await after.emit("session_shutdown", "quit");
    }
  }, 20000);

  it("reload keeps a process alive and the new instance delivers its result once", async () => {
    const before = lifecycleHost("process-reload");
    await before.emit("session_start");
    const release = join(mkdtempSync(join(tmpdir(), "bg-process-reload-")), "release");
    const id = await before.spawn({ shell: false, argv: [process.execPath, "-e", `
      const timer = setInterval(() => {
        if (require('node:fs').existsSync(process.argv[1])) { clearInterval(timer); console.log('done'); }
      }, 25);
    `, release] });
    const pid = (await before.status(id)).pid;
    await before.emit("session_shutdown", "reload");
    expect(processExists(pid)).toBe(true);
    const after = lifecycleHost("process-reload");
    try {
      await after.emit("session_start");
      writeFileSync(release, "finish");
      await expect.poll(() => after.messages.length, {timeout: 10000}).toBe(1);
      await after.emit("session_start");
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(before.messages).toEqual([]);
      expect(after.messages).toHaveLength(1);
      expect((await after.status(id)).status).toBe("succeeded");
    } finally { await after.emit("session_shutdown", "quit"); }
  }, 20000);

  // POSIX TERM handlers/process groups do not exist on Windows; Windows tree verification runs above.
  it.skipIf(process.platform === "win32").each([false, true])("quit escalates TERM-resistant descendants in the owned group (leader resistant=%s)", async (leaderResistant) => {
    const host = lifecycleHost(`term-resistant-${leaderResistant}`);
    await host.emit("session_start");
    const marker = join(mkdtempSync(join(tmpdir(), "bg-term-resistant-")), "pids");
    const id = await host.spawn({ shell: false, argv: [process.execPath, "-e", `
      if (process.argv[2] === 'true') process.on('SIGTERM', () => {});
      const child = require('node:child_process').spawn(process.execPath, ['-e',
        "process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 10000)"],
        {stdio: ['ignore', 'ignore', 'ignore', 'ipc'], detached: false, windowsHide: true});
      child.on('message', () => require('node:fs').writeFileSync(process.argv[1], JSON.stringify([process.pid, child.pid])));
      setInterval(() => {}, 10000);
    `, marker, String(leaderResistant)] });
    let pids: number[] = [];
    await expect.poll(() => { try { pids = JSON.parse(readFileSync(marker, "utf8")); return pids.length; } catch { return 0; } }, {timeout: 10000}).toBe(2);
    const live = (pid: number) => {
      try { return !execFileSync("ps", ["-p", String(pid), "-o", "stat="], {encoding: "utf8", windowsHide: true}).trim().startsWith("Z"); } catch { return false; }
    };
    try {
      await host.emit("session_shutdown", "quit");
      expect(pids.map(live)).toEqual([false, false]);
      expect((await host.status(id)).status).toBe("cancelled");
    } finally {
      for (const pid of pids) if (live(pid)) await import("./process-termination.js").then((p) => p.terminateProcessTree(pid, pid));
    }
  }, 20000);

  it("stopping a watch aborts and awaits its in-flight poll tree", async () => {
    const host = lifecycleHost("watch-abort");
    await host.emit("session_start");
    const marker = join(mkdtempSync(join(tmpdir(), "bg-watch-abort-")), "pids.json");
    const controller = new AbortController();
    const launch = host.execute("bg_task_watch", { shell: false, argv: [process.execPath, "-e", `
      const child = require('node:child_process').spawn(process.execPath,
        ['-e', 'setInterval(() => {}, 10000)'], {stdio: 'inherit', windowsHide: true});
      require('node:fs').writeFileSync(process.argv[1], JSON.stringify([process.pid, child.pid]));
      setInterval(() => {}, 10000);
    `, marker], success_when: { type: "exit_code", equals: 0 }, timeout_seconds: 0 }, controller.signal);
    let pids: number[] = [];
    await expect.poll(() => { try { pids = JSON.parse(readFileSync(marker, "utf8")); return pids.length; } catch { return 0; } }, {timeout: 10000}).toBe(2);
    controller.abort();
    const id = (await launch).match(/bg_[a-z0-9_]+/)![0];
    try {
      await host.execute("bg_task_stop", { id });
      expect(pids.map(processExists)).toEqual([false, false]);
      expect((await host.status(id)).status).toBe("cancelled");
    } finally {
      for (const pid of pids) if (processExists(pid)) await import("./process-termination.js").then((p) => p.terminateProcessTree(pid));
      await host.emit("session_shutdown", "quit");
    }
  }, 20000);
});
