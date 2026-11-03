import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, test, vi } from "vitest";
import { normalizeContext, type Api, type Message, type Model } from "@earendil-works/pi-ai";
import { createStreamSimple, ToolRoundTrips } from "../src/provider.js";
import type { DriverTurnRequest, TurnDriver, TurnHandle } from "../src/driver-types.js";
import { SessionStore } from "../src/sessions.js";
import { StreamDriver } from "../src/driver.js";
import { AcpDriver } from "../src/acp/driver.js";
import { warmJobLauncher } from "./helpers/warm-job-launcher.js";

beforeAll(warmJobLauncher, 60_000);

const model = { id: "gemini-flash", name: "Gemini Flash", api: "agy-bridge", provider: "antigravity",
	baseUrl: "agy-bridge://antigravity", reasoning: false, input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_000_000, maxTokens: 65_536 } as Model<Api>;
const dirs: string[] = [];
afterEach(() => {
	vi.unstubAllEnvs();
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
const user = (content: string): Message => ({ role: "user", content, timestamp: 0 });
const assistant = (text: string, provider = "antigravity"): Message => ({ role: "assistant", provider,
	content: [{ type: "text", text }], timestamp: 0 }) as Message;
const result = (toolCallId: string, text: string): Message => ({ role: "toolResult", toolCallId,
	toolName: "read", content: [{ type: "text", text }], isError: false, timestamp: 0 });

function harness(engine: "stream-json" | "acp", bound = true) {
	vi.stubEnv("AGY_SYSTEM_PROMPT", "off");
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-resume-"));
	dirs.push(dir);
	const store = new SessionStore(path.join(dir, "sessions.json"));
	const key = `sid:resume${engine === "acp" ? "@acp" : ""}`;
	if (bound) store.set(key, { conversationId: "current", lastStepIdx: -1, lastMessageCount: 1 });
	const requests: DriverTurnRequest[] = [];
	let owner: TurnHandle = { id: "owner", outcome: Promise.resolve({ status: "OK", response: "ok",
		finished: true, aborted: false }), next: async () => null, pushExternal() {} };
	const driver = { get activeHandle() { return owner; }, kickIdle() {}, reentry: () => null,
		run: async (request: DriverTurnRequest) => { requests.push(request); return { ...owner,
			outcome: Promise.resolve({ status: "OK", response: "ok", finished: true, aborted: false,
				conversationId: request.conversationId ?? undefined }) }; } } as unknown as TurnDriver;
	const rt = new ToolRoundTrips(driver, undefined, { escalateAfterMs: 1 });
	const simple = createStreamSimple({ entries: [], store, driver, acpDriver: engine === "acp" ? driver : undefined,
		engine, roundTrips: rt });
	return { requests, rt, store, key,
		own(conversationId: string) { owner = { ...owner, id: conversationId, outcome: Promise.resolve({
			status: "OK", response: "ok", finished: true, aborted: false, conversationId }) }; },
		async run(messages: Message[]) {
			const events = [];
			for await (const event of simple(model, normalizeContext({ messages }), { sessionId: "resume" })) events.push(event);
			return events;
		},
	};
}

test.each(["stream-json", "acp"] as const)("%s resumes a bound retry-dropped tool-result tail", async engine => {
	const h = harness(engine);
	const events = await h.run([user("ORIGINAL TASK"), assistant("working"), result("lost", "TOOL OUTPUT")]);
	assert.equal(events.at(-1)?.type, "done");
	assert.equal(h.requests.length, 1);
	assert.equal(h.requests[0].conversationId, "current");
	assert.match(h.requests[0].prompt, /Check your conversation history/);
	assert.match(h.requests[0].prompt, /Do not repeat completed actions/);
	assert.doesNotMatch(h.requests[0].prompt, /ORIGINAL TASK|TOOL OUTPUT/);
});

test.each(["stream-json", "acp"] as const)("%s synthetic assistant-tail resumes skip the digest, ordinary user turns retain it", async engine => {
	vi.stubEnv("AGY_DIGEST", "1");
	const h = harness(engine);
	const prefix = [user("original"), assistant("OTHER PROVIDER NOTE", "other"), result("external", "EXTERNAL RESULT")];
	await h.run([...prefix, assistant("partial answer")]);
	assert.equal(h.requests.length, 1);
	assert.match(h.requests[0].prompt, /Check your conversation history/);
	assert.doesNotMatch(h.requests[0].prompt, /OTHER PROVIDER NOTE|EXTERNAL RESULT|broader pi session/);
	assert.equal(h.requests[0].contextBlock, undefined);
	const control = harness(engine);
	await control.run([...prefix, user("NEW USER INPUT")]);
	assert.match(JSON.stringify(control.requests[0]), /OTHER PROVIDER NOTE/);
	assert.match(JSON.stringify(control.requests[0]), /EXTERNAL RESULT/);
	assert.match(control.requests[0].prompt, /NEW USER INPUT/);
});

test.each(["stream-json", "acp"] as const)("%s empty or unbound retry tails retain the hard error", async engine => {
	for (const bound of [false, true]) {
		const h = harness(engine, bound);
		for (const messages of bound ? [[]] : [[assistant("partial")], [result("lost", "output")], []]) {
			const events = await h.run(messages);
			const error = events.find(event => event.type === "error");
			assert.equal(error?.error.errorMessage, "No user message to send to agy.");
		}
		assert.equal(h.requests.length, 0);
	}
});

test.each(["stream-json", "acp"] as const)("%s image-only and plain user input never use a synthetic resume", async engine => {
	const h = harness(engine);
	await h.run([{ role: "user", content: [{ type: "image", data: "aWNvbg==", mimeType: "image/png" }], timestamp: 0 }]);
	assert.equal(h.requests[0].prompt, "");
	assert.equal(h.requests[0].images?.length, 1);
	await h.run([user("FRESH INPUT")]);
	assert.equal(h.requests[1].prompt, "FRESH INPUT");
});

test.each(["stream-json", "acp"] as const)("%s recovery suppresses resume only for the recovered conversation; unknown owners stay pollable", async engine => {
	for (const origin of ["current", "other", undefined]) {
		const h = harness(engine);
		if (origin) h.own(origin);
		await h.rt.onToolCall("late", "read", {}, new AbortController().signal);
		h.rt.resolve("late", "PRIVATE LATE OUTPUT", false);
		const events = await h.run([assistant("partial"), result("late", "PRIVATE LATE OUTPUT")]);
		assert.equal(events.at(-1)?.type, "done");
		assert.deepEqual(h.requests.map(request => request.conversationId),
			origin === "other" ? ["other", "current"] : origin === "current" ? ["current"] : []);
		if (origin) {
			assert.match(h.requests[0].prompt, /Late tool delivery/);
			assert.match(h.requests[0].prompt, /PRIVATE LATE OUTPUT/);
			assert.equal(h.rt.poll("late")?.delivered, true);
		}
		if (origin === "other") {
			assert.match(h.requests.at(-1)!.prompt, /Check your conversation history/);
			assert.doesNotMatch(h.requests.at(-1)!.prompt, /PRIVATE LATE OUTPUT/);
		}
		if (!origin) {
			assert.equal(h.rt.poll("late")?.text, "PRIVATE LATE OUTPUT");
			assert.equal(h.rt.poll("late")?.delivered, false);
			assert.ok(h.rt.claimUndelivered("late"), "unknown owner remains claimable, not consumed");
		}
	}
});

const driverRequest = { cwd: process.cwd(), model: "gemini-3.8-flash", mode: "accept-edits",
	skipPermissions: true, timeoutMin: 0, inactivityMin: 0, startupTimeoutMs: 5_000 };

test("stream-json handles expose only their own live identity, never a prior turn's global binding", async () => {
	vi.stubEnv("PATH", `${path.join(import.meta.dirname, "helpers", "fake-agy-bin")}${path.delimiter}${process.env.PATH}`);
	const driver = new StreamDriver();
	try {
		const first = await driver.run({ ...driverRequest, prompt: "HANG" });
		await vi.waitFor(() => assert.equal(first.conversationId, "conv-hang"));
		assert.equal(driver.activeHandle?.conversationId, "conv-hang");
		await driver.close("recycle", "new turn");
		await first.outcome;
		// This process reports no identity, even though the requested/global
		// binding belongs to the prior turn. It must stay unavailable.
		const second = await driver.run({ ...driverRequest, prompt: "CHECKPOINT-PROGRESS", conversationId: "conv-hang" });
		assert.equal(second.conversationId, undefined);
		await second.outcome;
		assert.equal(second.conversationId, undefined);
		assert.equal(first.conversationId, "conv-hang", "retained handles do not track later driver state");
	} finally { await driver.close("shutdown"); }
}, 15_000);

test("ACP handles expose the session observed during their own setup, including recreation", async () => {
	const env = { ACP_FAKE_SCENARIO: "load-fails" };
	const driver = new AcpDriver({ bin: process.execPath,
		binArgs: [path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs")], extraEnv: env });
	try {
		const handle = await driver.run({ ...driverRequest, prompt: "hello", conversationId: "stale-requested-session" });
		assert.equal(handle.conversationId, "fake-session-0001");
		assert.equal(driver.activeHandle?.conversationId, "fake-session-0001");
		await handle.outcome;
		await driver.close("recycle", "later state must not replace handle identity");
		env.ACP_FAKE_SCENARIO = "slow";
		const later = await driver.run({ ...driverRequest, prompt: "later", conversationId: "loaded-other" });
		assert.equal(later.conversationId, "loaded-other");
		assert.equal(driver.activeHandle?.conversationId, "loaded-other");
		assert.equal(handle.conversationId, "fake-session-0001");
	} finally { await driver.close("shutdown"); }
}, 15_000);
