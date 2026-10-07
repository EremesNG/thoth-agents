import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { test } from "vitest";
import { terminateProcessTree } from "../src/process-termination.js";

function alive(pid: number): boolean {
	try { process.kill(pid, 0); return true; } catch { return false; }
}

test.skipIf(process.platform !== "win32")("Windows termination awaits the parent and grandchild exiting", async () => {
	const child = spawn(process.execPath, ["-e", `
const {spawn} = require('node:child_process');
const grandchild = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {stdio:'ignore',windowsHide:true});
console.log(grandchild.pid);
setInterval(()=>{},1000);
`], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
	let grandchildPid: number | undefined;
	try {
		grandchildPid = await new Promise<number>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("fixture startup timed out")), 5_000);
			child.stdout!.once("data", (data) => { clearTimeout(timer); resolve(Number(String(data).trim())); });
			child.once("error", (error) => { clearTimeout(timer); reject(error); });
		});
		assert.ok(alive(child.pid!));
		assert.ok(alive(grandchildPid));
		await terminateProcessTree(child);
		assert.equal(alive(child.pid!), false);
		assert.equal(alive(grandchildPid), false, "descendant must not survive teardown");
	} finally {
		await terminateProcessTree(child);
		if (grandchildPid && alive(grandchildPid)) process.kill(grandchildPid);
	}
}, 12_000);

test("termination gives up within its bound and warns if exit never arrives", async () => {
	const child = Object.assign(new EventEmitter(), { pid: undefined, exitCode: null, signalCode: null, kill: () => true }) as unknown as ChildProcess;
	const warnings: string[] = [];
	const started = Date.now();
	await terminateProcessTree(child, { timeoutMs: 40, log: (message) => warnings.push(message) });
	assert.ok(Date.now() - started < 1_000);
	assert.deepEqual(warnings, ["termination-warning"]);
	assert.equal(child.listenerCount("exit"), 0);
});

test("already exited children do not wait or warn", async () => {
	const child = Object.assign(new EventEmitter(), { exitCode: 0, signalCode: null }) as unknown as ChildProcess;
	await terminateProcessTree(child, { log: () => assert.fail("unexpected warning") });
});
