import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "vitest";
import { spawnOwnedProcess } from "../src/owned-process.js";

test.skipIf(process.platform !== "win32")("job facade delivers final UTF-8 and Buffer output before close", async () => {
	const child = spawnOwnedProcess(process.execPath, ["-e", "process.stdout.write('final λ');process.stderr.write('last');"], { stdio: ["ignore", "pipe", "pipe"] });
	assert.equal(child.stdin, null);
	child.stdout.setEncoding("utf8");
	let stdout = "", stderr = Buffer.alloc(0);
	const events: string[] = [];
	child.on("spawn", () => events.push("spawn"));
	child.on("exit", () => events.push("exit"));
	child.stdout.on("data", (data) => { stdout += data; });
	child.stderr.on("data", (data) => { assert.ok(Buffer.isBuffer(data)); stderr = Buffer.concat([stderr, data]); });
	await once(child, "close");
	assert.equal(stdout, "final λ");
	assert.equal(stderr.toString(), "last");
	assert.deepEqual(events, ["spawn", "exit"]);
	assert.equal(child.exitCode, 0);
}, 30_000);
