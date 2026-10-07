import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as childProcess from "node:child_process";
import { test, vi } from "vitest";
import { StreamDriver } from "../src/driver.js";
import { AcpDriver } from "../src/acp/driver.js";
import type { DriverTurnRequest } from "../src/driver-types.js";

for (const engine of ["stream-json", "acp"] as const) {
	test(`${engine}: an invalidated queued launch cannot respawn after owned shutdown`, async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-queue-lifecycle-"));
		const bin = path.join(dir, "agy.mjs");
		fs.writeFileSync(bin, `// pi-test-node-fixture
import readline from 'node:readline';
for await (const line of readline.createInterface({input:process.stdin})) {
 console.log(JSON.stringify({event:'init',init:{conversation_id:'queued-conversation'}}));
}
`);
		vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH}`);
		const spawn = vi.spyOn(childProcess, "spawn");
		const driver = engine === "stream-json" ? new StreamDriver(path.join(dir, "private")) : new AcpDriver({
			bin: process.execPath,
			binArgs: [path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs")],
			extraEnv: { ACP_FAKE_SCENARIO: "slow" },
		});
		let current = true;
		const request: DriverTurnRequest = {
			cwd: dir, model: "gemini-3.6-flash", mode: "accept-edits", skipPermissions: true,
			prompt: "hi", timeoutMin: 0, inactivityMin: 0,
			assertCurrent: () => { if (!current) throw new Error("owner session shut down"); },
		};
		try {
			const active = await driver.run(request);
			const queued = driver.run(request);
			// Attach the rejection assertion before close releases the active turn.
			const rejected = assert.rejects(queued, /owner session shut down/);
			current = false;
			await driver.close("recycle", "owned session shutdown");
			await rejected;
			assert.equal((await active.outcome).status, "ERROR");
			const launches = spawn.mock.calls.flatMap(([command], index) => command === (engine === "stream-json" ? "agy" : process.execPath) ? [index] : []);
			assert.equal(launches.length, 1, "queued turn must not launch a replacement process");
			const child = spawn.mock.results[launches[0]].value as childProcess.ChildProcess;
			assert.ok(child.exitCode !== null || child.signalCode !== null, "the original child was terminated");
		} finally {
			await driver.close("shutdown");
			vi.restoreAllMocks();
			vi.unstubAllEnvs();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
}

for (const engine of ["stream-json", "acp"] as const) {
	test(`${engine}: queue deadline fails only the requester and fences its late launch`, async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-queue-deadline-"));
		fs.writeFileSync(path.join(dir, "agy.mjs"), `// pi-test-node-fixture
import readline from 'node:readline';
for await (const line of readline.createInterface({input:process.stdin})) {
 console.log(JSON.stringify({event:'init',init:{conversation_id:'healthy'}}));
}
`);
		vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH}`);
		const driver = engine === "stream-json" ? new StreamDriver(path.join(dir, "private")) : new AcpDriver({
			bin: process.execPath, binArgs: [path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs")], extraEnv: { ACP_FAKE_SCENARIO: "slow" },
		});
		const request: DriverTurnRequest = { cwd: dir, model: "gemini-3.6-flash", mode: "accept-edits", skipPermissions: true, prompt: "healthy", timeoutMin: 0, inactivityMin: 0 };
		try {
			const active = await driver.run(request);
			let settled = false;
			void active.outcome.then(() => { settled = true; });
			const expired = driver.run({ ...request, prompt: "expired", queueTimeoutMs: 20 });
			let followerStarted = false;
			const follower = driver.run({ ...request, prompt: "follower", queueTimeoutMs: 2000 }).then(h => { followerStarted = true; return h; });
			await Promise.race([
				assert.rejects(expired, /run queue.*20ms/),
				new Promise((_, reject) => setTimeout(() => reject(new Error("queue wait remained silent")), 200)),
			]);
			assert.equal(settled, false, "request expiry must not terminate the predecessor");
			assert.equal(driver.activeHandle?.id, active.id);
			assert.equal(followerStarted, false, "expired slot must not advance serialization past the predecessor");
			await driver.close("recycle", "test complete");
			const next = await follower;
			assert.notEqual(next.id, active.id);
			assert.equal(driver.snapshot().stats.turns, 2, "expired requester never launches after predecessor settles");
		} finally {
			await driver.close("shutdown");
			vi.unstubAllEnvs();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
}

test("stream-json: exclusive termination wait expires and cannot launch later", async () => {
	const dir = path.join(import.meta.dirname, "helpers", "fake-agy-bin");
	vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH}`);
	const actualSpawn = childProcess.spawn;
	const { EventEmitter } = await import("node:events");
	vi.spyOn(childProcess, "spawn").mockImplementation((...args: any[]) => {
		if (args[0] === "taskkill") return Object.assign(new EventEmitter(), { kill: () => true }) as any;
		return (actualSpawn as any)(...args);
	});
	const driver = new StreamDriver();
	const request: DriverTurnRequest = { cwd: process.cwd(), model: "gemini-3.6-flash", mode: "accept-edits", skipPermissions: true, prompt: "KEEP-ALIVE", timeoutMin: 0, inactivityMin: 0 };
	let closing: Promise<void> | undefined;
	try {
		const first = await driver.run(request);
		await first.outcome;
		closing = driver.close("recycle", "test termination");
		await Promise.race([
			assert.rejects(driver.run({ ...request, startupTimeoutMs: 20 }), /termination.*20ms/),
			new Promise((_, reject) => setTimeout(() => reject(new Error("termination wait remained silent")), 200)),
		]);
		await closing;
		assert.equal(driver.snapshot().stats.spawns, 1, "expired exclusive startup cannot spawn once termination finishes");
	} finally {
		await closing;
		await driver.close("shutdown");
		vi.restoreAllMocks(); vi.unstubAllEnvs();
	}
});

test("acp: exclusive startup deadline fails a silent session setup", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-startup-deadline-"));
	const bin = path.join(dir, "server.mjs");
	fs.writeFileSync(bin, `// pi-test-node-fixture
import readline from 'node:readline';
for await (const line of readline.createInterface({input:process.stdin})) {
 const r = JSON.parse(line);
 if (r.method === 'initialize') console.log(JSON.stringify({jsonrpc:'2.0',id:r.id,result:{protocolVersion:1,agentCapabilities:{},authMethods:[]}}));
}
`);
	const driver = new AcpDriver({ bin: process.execPath, binArgs: [bin] });
	try {
		const handle = await driver.run({ cwd: dir, model: "gemini-3.6-flash", mode: "accept-edits", skipPermissions: true, prompt: "hello", timeoutMin: 0, inactivityMin: 0, startupTimeoutMs: 100 });
		const outcome = await Promise.race([
			handle.outcome,
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error("ACP startup remained silent")), 2000)),
		]);
		assert.equal(outcome.status, "ERROR");
		assert.match(outcome.error ?? "", /startup|termination/);
		assert.equal(driver.activeHandle, null);
	} finally {
		await driver.close("shutdown");
		fs.rmSync(dir, { recursive: true, force: true });
	}
});
