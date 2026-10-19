import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { afterEach, test, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { launchInJob, type LaunchedJob } from "@thoth-agents/pi-core/windows-job";
import * as owned from "../src/owned-process.js";
import * as resolver from "../src/windows-executable.js";
import { StreamDriver } from "../src/driver.js";
import { AcpConnection } from "../src/acp/connection.js";
import { registerAskAntigravityTool } from "../src/ask-tool.js";
import { runWebAgent } from "../src/web-tools.js";

vi.mock("@thoth-agents/pi-core/windows-job", async (original) => ({
	...await original<typeof import("@thoth-agents/pi-core/windows-job")>(), launchInJob: vi.fn(),
}));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

for (const caller of ["stream", "ACP", "AskAntigravity", "web"] as const) {
	test.skipIf(process.platform !== "win32")(`${caller} existing startup bound cancels a hung job launch`, async () => {
		vi.useFakeTimers();
		vi.spyOn(resolver, "resolveWindowsExecutable").mockReturnValue(process.execPath);
		let complete!: (job: LaunchedJob) => void;
		vi.mocked(launchInJob).mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
		const events: string[] = [];
		const spawn = owned.spawnOwnedProcess;
		vi.spyOn(owned, "spawnOwnedProcess").mockImplementation((...args) => {
			const child = spawn(...args);
			for (const event of ["spawn", "exit", "close", "error"]) child.on(event, () => events.push(event));
			return child;
		});
		let settled = false;
		let result: any;
		let cleanup = async () => {};
		let run: Promise<unknown>;
		let connection: AcpConnection | undefined;
		if (caller === "stream") {
			const driver = new StreamDriver();
			cleanup = () => driver.close("shutdown");
			const handle = await driver.run({ cwd: process.cwd(), model: "gemini-3.6-flash", mode: "accept-edits", skipPermissions: true, prompt: "hi", startupTimeoutMs: 25, timeoutMin: 0, inactivityMin: 0 });
			run = handle.outcome;
		} else if (caller === "ACP") {
			const conn = new AcpConnection({ cwd: process.cwd(), bin: process.execPath, log: () => {}, onUpdate: () => {}, onExit: () => {} });
			connection = conn;
			cleanup = () => conn.kill();
			run = conn.start();
		} else if (caller === "AskAntigravity") {
			vi.stubEnv("AGY_BIN", process.execPath);
			let tool: any;
			await registerAskAntigravityTool({ registerTool: (t: unknown) => { tool = t; } } as unknown as ExtensionAPI, [], undefined, "private");
			run = tool.execute("pending", { prompt: "hi", conversationId: "pending", timeoutMinutes: 25 / 60_000 }, undefined, undefined, { cwd: process.cwd() });
		} else run = runWebAgent({ bin: process.execPath, prompt: "hi", gatedTool: "search_web", timeoutMs: 25 });
		void run.then((value) => { result = value; settled = true; }, (error) => { result = error; settled = true; });
		try {
			await vi.advanceTimersByTimeAsync(caller === "ACP" ? 33_100 : 3_100);
			assert.equal(settled, true, "caller must settle without any launcher notifications");
			assert.ok(vi.mocked(launchInJob).mock.calls.length > 0);
			if (caller === "stream") { assert.equal(result.status, "ERROR"); assert.match(result.error, /launch.*deadline/); }
			else if (caller === "ACP") { assert.match(result.message, /timed out.*initialize/i); assert.equal(connection!.alive, false); }
			else if (caller === "AskAntigravity") assert.equal(result.details.timedOut, true);
			else { assert.equal(result.ok, false); assert.match(result.error, /timed out|timeout/i); }
			const stdin = new PassThrough(), stdout = new PassThrough(), stderr = new PassThrough();
			let exit!: (value: { code: number }) => void;
			const exited = new Promise<{ code: number }>((resolve) => { exit = resolve; });
			const terminate = vi.fn(async () => { stdin.destroy(); stdout.end(); stderr.end(); exit({ code: 1 }); });
			const release = vi.fn(async () => {});
			complete({ pid: 12345, stdin, stdout, stderr, exited, terminate, release });
			await vi.advanceTimersByTimeAsync(1);
			assert.equal(terminate.mock.calls.length, 1, "late job must still be terminated");
			assert.equal(release.mock.calls.length, 1, "late job must still be released");
			assert.deepEqual(events, [], "expired launch must not notify callers");
		} finally {
			const done = cleanup();
			await vi.advanceTimersByTimeAsync(3_100);
			await done;
		}
	});
}
