import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import * as childProcess from "node:child_process";
import * as ownedProcess from "../src/owned-process.js";
import * as termination from "../src/process-termination.js";
import { runWebAgent } from "../src/web-tools.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, test, vi } from "vitest";
import { StreamDriver } from "../src/driver.js";
import { AcpDriver } from "../src/acp/driver.js";
import { AcpConnection } from "../src/acp/connection.js";
import { registerAskAntigravityTool } from "../src/ask-tool.js";

// Approved caller seams. Deliberately model Node's legal exit -> data -> close
// ordering; real pipe/job coverage lives in caller-drain-integration.test.ts.
function exitBeforeDrain(output: string) {
	const child = Object.assign(new EventEmitter(), {
		jobBacked: true, pid: undefined, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
		exitCode: null as number | null, signalCode: null, kill: () => true,
	});
	queueMicrotask(() => {
		child.exitCode = 0;
		child.emit("exit", 0, null);
		setImmediate(() => {
			child.stdout.end(output); child.stderr.end();
			setImmediate(() => child.emit("close", 0, null));
		});
	});
	return child;
}
function launch(output: string) {
	const spawn = () => exitBeforeDrain(output) as any;
	vi.spyOn(childProcess, "spawn").mockImplementation(spawn);
	vi.spyOn(ownedProcess, "spawnOwnedProcess").mockImplementation(spawn);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

test("AskAntigravity delivers result text arriving after leader exit", async () => {
	launch("last answer");
	vi.stubEnv("AGY_BIN", "offline-agy");
	let tool: any;
	await registerAskAntigravityTool({ registerTool: (t: unknown) => { tool = t; } } as unknown as ExtensionAPI, [], undefined, "private");
	const result = await tool.execute("drain", { prompt: "hello", conversationId: "drain" }, undefined, undefined, { cwd: process.cwd() });
	assert.match(result.content[0].text, /^last answer(?:\n|$)/);
});

test("stream driver delivers its final stream-json event after leader exit", async () => {
	launch(JSON.stringify({ event: "result", result: { status: "SUCCESS", response: "last response" } }) + "\n");
	const driver = new StreamDriver();
	try {
		const handle = await driver.run({ cwd: process.cwd(), model: "gemini-3.6-flash", mode: "accept-edits", skipPermissions: true, prompt: "hi", timeoutMin: 0, inactivityMin: 0 });
		const outcome = await handle.outcome;
		assert.equal(outcome.status, "OK");
		assert.equal(outcome.response, "last response");
	} finally { await driver.close("shutdown"); }
});

test("ACP delivers its final JSON-RPC reply after leader exit", async () => {
	launch(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: 1, agentCapabilities: {}, authMethods: [] } }) + "\n");
	const conn = new AcpConnection({ cwd: process.cwd(), bin: "offline-acp", log: () => {}, onUpdate: () => {}, onExit: () => {} });
	try { await conn.start(); } finally { await conn.kill(); }
});

for (const caller of ["AskAntigravity", "web"] as const) test(`${caller} abort settles when pending-launch fencing suppresses close`, async () => {
	const child = Object.assign(new EventEmitter(), { pid: undefined, stdin: null,
		stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, signalCode: null, kill: () => true });
	vi.spyOn(ownedProcess, "spawnOwnedProcess").mockReturnValue(child);
	const stop = vi.spyOn(termination, "terminateProcessTree").mockResolvedValue();
	const controller = new AbortController();
	let run: Promise<any>;
	if (caller === "AskAntigravity") {
		let tool: any;
		await registerAskAntigravityTool({ registerTool: (t: unknown) => { tool = t; } } as unknown as ExtensionAPI, [], undefined, "private");
		run = tool.execute("pending-abort", { prompt: "hello", conversationId: "pending-abort" }, controller.signal, undefined, { cwd: process.cwd() });
	} else {
		run = runWebAgent({ prompt: "hello", gatedTool: "search_web", signal: controller.signal });
	}
	controller.abort();
	const result = await run;
	assert.equal(stop.mock.calls.length, 1);
	if (caller === "AskAntigravity") {
		assert.equal(result.details.aborted, true);
		assert.equal(result.content[0].text, "agy was aborted before producing output.");
	} else assert.deepEqual(result, { ok: false, error: "web run aborted" });
}, 1_000);

for (const engine of ["stream-json", "acp"] as const) test(`${engine} abort during a fenced pending launch settles without terminal process events`, async () => {
	const child = Object.assign(new EventEmitter(), { pid: undefined, stdin: new PassThrough(),
		stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, signalCode: null, kill: () => true });
	vi.spyOn(ownedProcess, "spawnOwnedProcess").mockReturnValue(child);
	vi.spyOn(termination, "terminateProcessTree").mockResolvedValue();
	const driver = engine === "stream-json" ? new StreamDriver() : new AcpDriver({ bin: "offline-acp" });
	const controller = new AbortController();
	try {
		const handle = await driver.run({ cwd: process.cwd(), model: "gemini-3.6-flash", mode: "accept-edits", skipPermissions: true, prompt: "hi", timeoutMin: 0, inactivityMin: 0, signal: controller.signal });
		controller.abort();
		assert.equal((await handle.outcome).aborted, true);
	} finally { await driver.close("shutdown"); }
}, 1_000);

for (const caller of ["stream", "AskAntigravity", "ACP"] as const) test(`${caller} non-job leader exit settles without inherited pipe close`, async () => {
	const child = Object.assign(new EventEmitter(), { pid: undefined, stdin: new PassThrough(),
		stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null as number | null, signalCode: null, kill: () => true });
	vi.spyOn(ownedProcess, "spawnOwnedProcess").mockReturnValue(child);
	let run: Promise<any>;
	let cleanup = async () => {};
	if (caller === "stream") {
		const driver = new StreamDriver();
		cleanup = () => driver.close("shutdown");
		const handle = await driver.run({ cwd: process.cwd(), model: "gemini-3.6-flash", mode: "accept-edits", skipPermissions: true, prompt: "hi", timeoutMin: 0, inactivityMin: 0 });
		run = handle.outcome;
	} else if (caller === "ACP") {
		const conn = new AcpConnection({ cwd: process.cwd(), bin: "offline", log: () => {}, onUpdate: () => {}, onExit: () => {} });
		cleanup = () => conn.kill();
		run = conn.start().then(() => "unexpected success", () => "exited");
	} else {
		let tool: any;
		await registerAskAntigravityTool({ registerTool: (t: unknown) => { tool = t; } } as unknown as ExtensionAPI, [], undefined, "private");
		run = tool.execute("inherited", { prompt: "hi", conversationId: "inherited" }, undefined, undefined, { cwd: process.cwd() });
	}
	try {
		child.exitCode = 0;
		child.emit("exit", 0, null);
		const result = await Promise.race([run, new Promise((resolve) => setTimeout(() => resolve("unsettled"), 150))]);
		assert.notEqual(result, "unsettled");
		if (caller === "stream") assert.equal(result.status, "ERROR");
		if (caller === "ACP") assert.equal(result, "exited");
	} finally { child.emit("close", 0, null); await cleanup(); }
}, 1_000);
