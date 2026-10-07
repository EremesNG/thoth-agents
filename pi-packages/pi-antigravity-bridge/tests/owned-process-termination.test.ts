import assert from "node:assert/strict";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { test } from "vitest";
import { registerAskAntigravityTool } from "../src/ask-tool.js";
import { spawnAgyRaw } from "../src/models.js";
import { checkAgyCliVersion } from "../src/agy-version.js";
import { runWebAgent } from "../src/web-tools.js";
import path from "node:path";
import { assertTreeExited, makeProcessTreeFixture, pidAlive, within } from "./helpers/process-tree.js";

type AskTool = {
	execute: (id: string, params: Record<string, unknown>, signal: AbortSignal | undefined, update: undefined, ctx: Record<string, unknown>) => Promise<{
		content: Array<{ text: string }>;
		details: { aborted: boolean; timedOut: boolean };
	}>;
};

// Approved seams: the registered delegation tool and public listing probe.
// Real subprocesses and survivor checks, with no shell or provider/network.
test("AskAntigravity abort awaits parent and grandchild exit and preserves the abort outcome", async () => {
	const fixture = makeProcessTreeFixture();
	const previousBin = process.env.AGY_BIN;
	process.env.AGY_BIN = fixture.bin;
	let run: ReturnType<AskTool["execute"]> | undefined;
	try {
		let tool: AskTool | undefined;
		await registerAskAntigravityTool({ registerTool: (value: AskTool) => { tool = value; } } as unknown as ExtensionAPI, [], undefined, "private");
		const controller = new AbortController();
		run = tool!.execute("abort-tree", {
			prompt: "offline process tree", conversationId: "process-tree", timeoutMinutes: 1,
		}, controller.signal, undefined, { cwd: process.cwd() });
		const pids = await fixture.ready();
		controller.abort();
		const result = await within(run);
		assert.equal(result.details.aborted, true);
		assert.equal(result.details.timedOut, false);
		assert.equal(result.content[0].text, "agy was aborted before producing output.");
		await assertTreeExited(pids);
	} finally {
		fixture.cleanup();
		if (previousBin === undefined) delete process.env.AGY_BIN;
		else process.env.AGY_BIN = previousBin;
		if (run) await within(run);
	}
}, 20_000);

test("AskAntigravity timeout awaits parent and grandchild exit and preserves the timeout message", async () => {
	const fixture = makeProcessTreeFixture("partial answer");
	const previousBin = process.env.AGY_BIN;
	process.env.AGY_BIN = fixture.bin;
	let run: ReturnType<AskTool["execute"]> | undefined;
	try {
		let tool: AskTool | undefined;
		await registerAskAntigravityTool({ registerTool: (value: AskTool) => { tool = value; } } as unknown as ExtensionAPI, [], undefined, "private");
		run = tool!.execute("timeout-tree", {
			prompt: "offline process tree", conversationId: "process-tree", timeoutMinutes: 0.05,
		}, undefined, undefined, { cwd: process.cwd() });
		const pids = await fixture.ready();
		const result = await within(run);
		assert.equal(result.details.aborted, false);
		assert.equal(result.details.timedOut, true);
		assert.equal(result.content[0].text, "partial answer\n\n[agy exceeded the 0.05m timeout and was killed]");
		await assertTreeExited(pids);
	} finally {
		fixture.cleanup();
		if (previousBin === undefined) delete process.env.AGY_BIN;
		else process.env.AGY_BIN = previousBin;
		if (run) await within(run);
	}
}, 20_000);

test("listing probe timeout awaits parent and grandchild exit and returns the empty fallback", async () => {
	const fixture = makeProcessTreeFixture("partial model listing");
	let run: Promise<string> | undefined;
	try {
		run = spawnAgyRaw(fixture.bin, ["models"], 1_500);
		const pids = await fixture.ready();
		assert.equal(await within(run), "");
		assert.equal(pidAlive(pids[0]), false, "probe result must await parent exit");
		await assertTreeExited(pids);
	} finally {
		fixture.cleanup();
		if (run) await within(run);
	}
}, 20_000);

test("listing probe output cap awaits the tree exit and cannot return a partial catalog", async () => {
	const fixture = makeProcessTreeFixture("runaway model listing");
	let run: Promise<string> | undefined;
	try {
		run = spawnAgyRaw(fixture.bin, ["models"], 5_000, 4);
		const pids = await fixture.ready(false);
		assert.equal(await within(run), "");
		await assertTreeExited(pids);
	} finally {
		fixture.cleanup();
		if (run) await within(run);
	}
}, 20_000);

test("version probe timeout remains unavailable even when its output is a valid version", async () => {
	const fixture = makeProcessTreeFixture("1.2.10");
	let run: ReturnType<typeof checkAgyCliVersion> | undefined;
	try {
		run = checkAgyCliVersion(fixture.bin);
		const pids = await fixture.ready();
		const result = await run;
		assert.deepEqual(result, { status: "unavailable", raw: "1.2.10" });
		await assertTreeExited(pids);
	} finally {
		fixture.cleanup();
		if (run) await within(run);
	}
}, 20_000);

test("web run abort awaits parent and grandchild exit and preserves its abort error", async () => {
	const fixture = makeProcessTreeFixture();
	const controller = new AbortController();
	let run: ReturnType<typeof runWebAgent> | undefined;
	try {
		run = runWebAgent({
			prompt: "offline process tree", gatedTool: "search_web", bin: fixture.bin,
			agentsRoot: path.join(path.dirname(fixture.bin), "agents"), signal: controller.signal,
		});
		const pids = await fixture.ready();
		controller.abort();
		assert.deepEqual(await within(run), { ok: false, error: "web run aborted" });
		await assertTreeExited(pids);
	} finally {
		fixture.cleanup();
		if (run) await within(run);
	}
}, 20_000);
