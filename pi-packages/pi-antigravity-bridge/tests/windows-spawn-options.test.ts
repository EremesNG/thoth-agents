import assert from "node:assert/strict";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, test, vi } from "vitest";
import { registerAskAntigravityTool } from "../src/ask-tool.js";
import { checkAgyCliVersion, resetAgyVersionCache } from "../src/agy-version.js";
import { spawnAgyModelsRaw } from "../src/models.js";
import { fetchAgyQuota } from "../src/usage.js";

// Observe the OS launch boundary without opening real consoles during the
// regression's red phase. Keep real tool registration and execution.
function fakeChild(output: string) {
	const child = Object.assign(new EventEmitter(), {
		stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
		exitCode: null as number | null, signalCode: null,
		kill: vi.fn(), unref: vi.fn(),
	});
	queueMicrotask(() => {
		child.stdout.write(output);
		child.exitCode = 0;
		child.emit("exit", 0);
		child.emit("close", 0);
	});
	return child as unknown as childProcess.ChildProcessWithoutNullStreams;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	resetAgyVersionCache();
});

test("AskAntigravity hides the detached delegation console", async () => {
	const spawn = vi.spyOn(childProcess, "spawn").mockImplementation(() => fakeChild("offline answer"));
	vi.stubEnv("AGY_BIN", "offline-agy");
	let tool: any;
	await registerAskAntigravityTool({ registerTool: (value: unknown) => { tool = value; } } as unknown as ExtensionAPI, [], undefined, "private");
	const result = await tool.execute("console-test", {
		prompt: "offline delegation", conversationId: "console-test",
	}, undefined, undefined, { cwd: process.cwd() });
	assert.match(result.content[0].text, /offline answer/);
	assert.equal(spawn.mock.calls[0][2]?.windowsHide, true);
	assert.equal(spawn.mock.calls[0][2]?.detached, true);
});

test("the CLI version probe hides its console", async () => {
	const spawn = vi.spyOn(childProcess, "spawn").mockImplementation(() => fakeChild("1.2.14"));
	assert.equal((await checkAgyCliVersion("offline-agy")).status, "ok");
	assert.equal(spawn.mock.calls[0][2]?.windowsHide, true);
});

test("quota uses a hidden direct spawn, without a Windows detached console or shell", async () => {
	const spawn = vi.spyOn(childProcess, "spawn").mockImplementation(() => fakeChild(JSON.stringify({
		status: "SUCCESS", command: { name: "usage", data: { groups: [{ name: "Gemini", buckets: [] }] } },
	})));
	assert.ok(await fetchAgyQuota("C:\\agy\\agy.exe"));
	assert.equal(spawn.mock.calls[0][0], "C:\\agy\\agy.exe");
	assert.deepEqual(spawn.mock.calls[0][1], ["--print", "/usage", "--output-format", "json", "--print-timeout", "30s"]);
	assert.deepEqual(spawn.mock.calls[0][2], {
		stdio: ["ignore", "pipe", "ignore"], shell: false,
		detached: process.platform !== "win32", windowsHide: true,
	});
});

test("the model catalog probe hides its console", async () => {
	const spawn = vi.spyOn(childProcess, "spawn").mockImplementation(() => fakeChild("gemini-3.6-flash-low Gemini 3.6 Flash (Low)"));
	assert.match(await spawnAgyModelsRaw("offline-agy"), /gemini-3.6-flash-low/);
	assert.equal(spawn.mock.calls[0][2]?.windowsHide, true);
});
