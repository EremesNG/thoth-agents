import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { beforeAll, test, vi } from "vitest";
import { warmJobLauncher } from "./helpers/warm-job-launcher.js";
import { spawnOwnedProcess } from "../src/owned-process.js";
import { terminateProcessTree } from "../src/process-termination.js";

// Each isolated file owns a fresh Windows job helper.
beforeAll(warmJobLauncher, 60_000);

const windows = test.skipIf(process.platform !== "win32");
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

for (const mode of ["normal exit", "abort", "deadline"]) windows(`job cleans persistent descendants on ${mode} and spares a foreign process`, async () => {
	// Mirror AskCodex's foreign-process regression: disjoint real job membership.
	// Actual stale equal PPID needs PID reuse or a privileged parent-attribute
	// launcher; never fake ancestry or select cleanup targets by parent PID.
	const foreign = spawn(process.execPath, ["-e", "console.log('ready');setInterval(()=>{},1000)"], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
	await once(foreign.stdout!, "data");
	const child = spawnOwnedProcess(process.execPath, ["-e", `
const {spawn}=require('node:child_process');
const script="const {spawn}=require('node:child_process');const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore',windowsHide:true});console.log(p.pid);setInterval(()=>{},1000)";
const descendant=spawn(process.execPath,['-e',script],{detached:true,windowsHide:true,stdio:['ignore','pipe','ignore']});
descendant.stdout.once('data',d=>{console.log(JSON.stringify([descendant.pid,Number(String(d).trim())])); ${mode === "normal exit" ? "process.exit(0)" : "setInterval(()=>{},1000)"}});
`], { stdio: ["ignore", "pipe", "pipe"] });
	let pids: number[] = [];
	const closed = mode === "deadline" ? undefined : once(child, "close");
	try {
		pids = JSON.parse(String((await once(child.stdout, "data"))[0]).trim());
		if (mode !== "normal exit") await terminateProcessTree(child, { timeoutMs: mode === "deadline" ? 1 : 3_000, log: () => {} });
		if (closed) await closed;
		else await vi.waitFor(() => { for (const pid of [child.pid!, ...pids]) assert.equal(alive(pid), false); }, { timeout: 10_000 });
		for (const pid of [child.pid!, ...pids]) assert.equal(alive(pid), false, `PID ${pid} must be gone`);
		assert.ok(alive(foreign.pid!));
	} finally {
		await terminateProcessTree(child);
		foreign.kill();
		for (const pid of pids) if (alive(pid)) process.kill(pid);
	}
}, 30_000);

windows("job stdin accepts JSON writes before spawn and drains large final output", async () => {
	const child = spawnOwnedProcess(process.execPath, ["-e", "process.stdin.once('data',d=>{const x=JSON.parse(String(d));process.stdout.write(x.value+'λ'.repeat(100000));})"]);
	let output = "";
	child.stdout.setEncoding("utf8");
	child.stdout.on("data", (chunk) => { output += chunk; });
	child.stdin!.end(JSON.stringify({ value: "input:" }));
	await once(child, "close");
	assert.equal(output, `input:${"λ".repeat(100000)}`);
}, 30_000);

windows("console descendant of a job stand-in has no visible console window", async () => {
	const snippet = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class ConsoleProbe { [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow(); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h); }'; $h=[ConsoleProbe]::GetConsoleWindow(); Write-Output ([ConsoleProbe]::IsWindowVisible($h))`;
	const script = `const {spawn}=require('node:child_process');const p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',${JSON.stringify(snippet)}],{stdio:['ignore','pipe','pipe']});p.stdout.pipe(process.stdout);p.stderr.pipe(process.stderr);p.once('close',c=>process.exitCode=c);`;
	const child = spawnOwnedProcess(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "pipe"] });
	let output = "", error = "";
	child.stdout.on("data", (chunk) => { output += String(chunk); });
	child.stderr.on("data", (chunk) => { error += String(chunk); });
	await once(child, "close");
	assert.equal(child.exitCode, 0, error);
	assert.equal(output.trim(), "False", "VISIBLE CONSOLE: stop and reassess before changing pi-core");
}, 30_000);

windows("awaited job termination includes exit, drained close and releases cwd", async () => {
 const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-job-awaited-"));
 const child = spawnOwnedProcess(process.execPath, ["-e", "console.log('ready');setInterval(()=>{},1000)"], { cwd });
 const events: string[] = [];
 child.on("exit", () => events.push("exit"));
 child.on("close", () => events.push("close"));
 try {
  await once(child.stdout, "data");
  await terminateProcessTree(child);
  assert.deepEqual(events, ["exit", "close"]);
  fs.rmSync(cwd, { recursive: true, force: true });
 } finally {
  await terminateProcessTree(child);
  await fs.promises.rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
 }
}, 30_000);
