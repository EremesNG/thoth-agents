import assert from "node:assert/strict";
import * as childProcess from "node:child_process";
import * as ownedProcess from "../src/owned-process.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, test, vi } from "vitest";
import { registerAskAntigravityTool } from "../src/ask-tool.js";
import { checkAgyCliVersion, resetAgyVersionCache } from "../src/agy-version.js";
import { spawnAgyModelsRaw } from "../src/models.js";
import { fetchAgyQuota } from "../src/usage.js";
import { listAgyAgents } from "../src/agents.js";
import { completedChild as fakeChild, makeAgyRuntimeFixture } from "./helpers/agy-runtime-fixture.js";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	resetAgyVersionCache();
});

test("provider fixtures do not inherit the operator's agy binary or Orca identity", () => {
	assert.equal(process.env.AGY_BIN, undefined);
	assert.equal(process.env.ORCA_PANE_KEY, undefined);
	assert.equal(process.env.ORCA_TERMINAL_HANDLE, undefined);
});

test.each(["win32", "linux", "darwin"])("AskAntigravity uses the hidden owned launch with platform-specific detachment on %s", async (platform) => {
	const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
	Object.defineProperty(process, "platform", { value: platform });
	try {
		const spawn = vi.spyOn(ownedProcess, "spawnOwnedProcess").mockImplementation(() => fakeChild("offline answer") as unknown as ownedProcess.OwnedProcess);
		vi.stubEnv("AGY_BIN", "offline-agy");
		let tool: any;
		await registerAskAntigravityTool({ registerTool: (value: unknown) => { tool = value; } } as unknown as ExtensionAPI, [], undefined, "private");
		const result = await tool.execute("console-test", {
			prompt: "offline delegation", conversationId: "console-test",
		}, undefined, undefined, { cwd: process.cwd() });
		assert.match(result.content[0].text, /offline answer/);
		assert.equal(spawn.mock.calls[0][2]?.windowsHide, true);
		assert.equal(spawn.mock.calls[0][2]?.shell, false);
		assert.equal(spawn.mock.calls[0][2]?.detached, platform !== "win32");
	} finally {
		Object.defineProperty(process, "platform", platformDescriptor);
	}
});

test.each([false, true])("AskAntigravity uses AGY_BIN and the child cwd for its neutral runtime executable inside Orca (bare=%s)", async (bare) => {
	const f = makeAgyRuntimeFixture({ bare });
	const spawn = vi.spyOn(ownedProcess, "spawnOwnedProcess").mockImplementation(() => fakeChild("offline answer") as unknown as ownedProcess.OwnedProcess);
	try {
		let tool: any;
		await registerAskAntigravityTool({ registerTool: (value: unknown) => { tool = value; } } as unknown as ExtensionAPI, [], undefined, "private");
		const result = await tool.execute("alias-test", { prompt: "offline", conversationId: "alias-test" }, undefined, undefined, { cwd: f.root });
		assert.match(result.content[0].text, /offline answer/);
		f.assertAlias(spawn.mock.calls[0][0]);
		assert.equal(spawn.mock.calls[0][2]?.windowsHide, true);
	} finally { spawn.mockRestore(); f.cleanup(); }
});

test("quota and agent listing share the neutral runtime executable inside Orca", async () => {
	const f = makeAgyRuntimeFixture();
	const spawn = vi.spyOn(childProcess, "spawn")
		.mockImplementationOnce(() => fakeChild(JSON.stringify({ command: { name: "usage", data: { groups: [{ name: "Gemini", buckets: [] }] } } })))
		.mockImplementationOnce(() => fakeChild("reviewer\n"));
	try {
		assert.ok(await fetchAgyQuota(f.binary));
		assert.deepEqual(await listAgyAgents(f.binary), ["reviewer"]);
		for (const call of spawn.mock.calls) f.assertAlias(call[0]);
		assert.equal(spawn.mock.calls[0][0], spawn.mock.calls[1][0]);
	} finally { spawn.mockRestore(); f.cleanup(); }
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
