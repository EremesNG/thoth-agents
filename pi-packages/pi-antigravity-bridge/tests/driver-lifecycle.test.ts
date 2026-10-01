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
