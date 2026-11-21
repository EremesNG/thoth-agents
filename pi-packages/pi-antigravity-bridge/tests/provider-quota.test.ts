// agy-upstream-safety-sync AC-4 (upstream 9d20772, issue #16): agy streams the
// account quota notice as agent text and ends the turn OK, so a notice-only OK
// handle must settle as a RETRYABLE pi error (the provider-failover signal) -
// at the main settlement AND the late-result redelivery settlement - before
// fallback output and before any binding mutation. Turns with tool activity,
// ordinary text about quotas, aborts and the existing 429 carrier retry keep
// their behavior.
//
// Run: npm test

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { isRetryableAssistantError } from "@earendil-works/pi-ai/utils/retry";
import {
	normalizeContext,
	type Api,
	type AssistantMessage,
	type Message,
	type Model,
	type SimpleStreamOptions,
	type TranscriptContext,
} from "@earendil-works/pi-ai";
import { ToolRoundTrips, createStreamSimple } from "../src/provider.js";
import { SessionStore } from "../src/sessions.js";
import { classifyQuotaOutcome, detectQuotaNotice, quotaErrorMessage } from "../src/quota-notice.js";
import type { StreamDriver, DriverTurnRequest } from "../src/driver.js";
import type { DriverActivity, TurnOutcome } from "../src/driver-types.js";

const model: Model<Api> = {
	id: "gemini-flash",
	name: "Gemini 3.6 Flash (Medium)",
	api: "agy-bridge" as Api,
	provider: "antigravity",
	baseUrl: "agy-bridge://antigravity",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 1_000_000,
	maxTokens: 65_536,
};

const NOTICE = "⚠ Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 153h38m14s";

const outcomeOf = (over: Partial<TurnOutcome>): TurnOutcome => ({
	status: "OK",
	response: NOTICE,
	finished: true,
	aborted: false,
	conversationId: "conv-q",
	modelOutputSeen: true,
	sawResult: true,
	...over,
});

interface Script {
	outcome: TurnOutcome;
	activities?: DriverActivity[];
}

function makeHarness(scripted: Script[]) {
	let call = 0;
	const seen: DriverTurnRequest[] = [];
	const fakeHandleFor = (script: Script) => {
		const activities = [...(script.activities ?? [])];
		return {
			id: `fake-turn-${call}`,
			outcome: Promise.resolve(script.outcome),
			conversationId: script.outcome.conversationId,
			next: async (): Promise<DriverActivity | null> => activities.shift() ?? null,
			pushExternal: (_a: DriverActivity) => {},
		};
	};
	// Bridge parks need an owner handle before the first run (late-result tombstones).
	let active: ReturnType<typeof fakeHandleFor> = fakeHandleFor({ outcome: outcomeOf({ conversationId: "owner-conversation" }) });
	const driver = {
		get activeHandle() { return active; },
		kickIdle: () => {},
		reentry: () => null,
		run: async (request: DriverTurnRequest) => {
			seen.push(request);
			const script = scripted[Math.min(call, scripted.length - 1)]!;
			active = fakeHandleFor(script);
			call += 1;
			return active;
		},
	} as unknown as StreamDriver;
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-quota-"));
	const store = new SessionStore(path.join(dir, "sessions.json"));
	const roundTrips = new ToolRoundTrips(driver);
	const streamSimple = createStreamSimple({
		entries: [{ id: "gemini-flash", full: "gemini-3.6-flash" }],
		store,
		driver,
		roundTrips,
	});
	return { seen, store, streamSimple, roundTrips, dir, driver };
}

interface Terminal {
	type: string;
	reason?: string;
	message?: string;
	text: string;
}

async function run(h: ReturnType<typeof makeHarness>, context: TranscriptContext, options: Record<string, unknown> = {}): Promise<Terminal> {
	const stream = h.streamSimple(model, context, { cwd: h.dir, ...options } as unknown as SimpleStreamOptions);
	let last: Terminal = { type: "none", text: "" };
	for await (const ev of stream) {
		if (ev.type === "done" || ev.type === "error") {
			const evt = ev as { reason?: string; message?: AssistantMessage; error?: AssistantMessage };
			const msg = (evt.error ?? evt.message)!;
			const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
			last = { type: ev.type, reason: evt.reason, message: msg.errorMessage, text };
		}
	}
	return last;
}

const userContext = (prompt: string): TranscriptContext =>
	normalizeContext({ messages: [{ role: "user", content: prompt, timestamp: Date.now() }] });

function assertRetryable(t: Terminal): void {
	assert.equal(t.type, "error");
	assert.equal(isRetryableAssistantError({ stopReason: "error", errorMessage: t.message } as AssistantMessage), true);
	assert.doesNotMatch(t.message ?? "", /quota exceeded|billing|available balance|out of budget/i);
	assert.match(t.message ?? "", /rate limit/i);
	assert.match(t.message ?? "", /153h38m14s/);
}

test("detectQuotaNotice/classify: notice shapes, ordinary text, tool activity and abort", () => {
	assert.equal(detectQuotaNotice(NOTICE)?.resetsIn, "153h38m14s");
	assert.equal(detectQuotaNotice("Daily quota reached for this model.")?.resetsIn, undefined);
	assert.ok(detectQuotaNotice("Daily quota reached for this model. Try again tomorrow."), "attested upstream variant");
	assert.equal(detectQuotaNotice("⚠ Quota exhausted. Resets in 2h5s")?.resetsIn, "2h5s", "attested upstream variant");
	assert.equal(detectQuotaNotice("Daily quota reached.")?.resetsIn, undefined, "attested upstream variant");
	assert.equal(detectQuotaNotice("The quota resets every week; here is how to check it."), undefined);
	assert.equal(detectQuotaNotice(`${"Your account quota resets daily. ".repeat(30)}${NOTICE}`), undefined, "long answers never match");
	assert.equal(detectQuotaNotice(""), undefined);
	for (const prose of [
		"Quota exceeded is an error message you might see when calling the API.",
		"Quota reached means the limit was hit; retry later.",
		"Quota exceeded errors are common. Here is how to debug them with exponential backoff.",
		"Quota exceeded. That is a common quota error in the API; use exponential backoff.",
		"Quota reached. Please upgrade your Python runtime to increase your limits.",
		"Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 153h38m14s. Also, see the docs.",
		"Daily quota reached for this model. Try again tomorrow. Meanwhile, here is how rate limits work.",
		"Quota exhausted. Resets in soon",
	]) {
		assert.equal(detectQuotaNotice(prose), undefined, `ordinary prose is not a notice: ${prose}`);
	}
	for (const prose of [
		"Storage quota limit reached.",
		"Storage quota limit reached. Please upgrade your subscription to increase your limits.",
		"Disk quota exceeded.",
		"API quota limit reached.",
		"API quota exceeded. Resets in 2h5s",
		"Memory quota reached.",
		"Team quota reached. Please upgrade your subscription to increase your limits.",
		"Daily quota limit reached.",
		"quota limit reached",
		"Monthly quota exhausted. Try again tomorrow.",
		"Individual API quota reached.",
	]) {
		assert.equal(detectQuotaNotice(prose), undefined, `non-account quota sentence stays ordinary text: ${prose}`);
	}
	for (const notice of [
		"Individual quota reached.",
		"individual QUOTA reached for this model. Resets in 5m1s",
		"⚠ Daily quota reached for this model. Try again tomorrow.",
		"Quota exhausted.",
	]) assert.ok(detectQuotaNotice(notice), `attested headline: ${notice}`);
	assert.ok(classifyQuotaOutcome({ status: "OK", aborted: false, response: NOTICE }, false));
	assert.equal(classifyQuotaOutcome({ status: "OK", aborted: false, response: NOTICE }, true), undefined, "tool activity");
	assert.equal(classifyQuotaOutcome({ status: "OK", aborted: true, response: NOTICE }, false), undefined, "aborted");
	assert.equal(classifyQuotaOutcome({ status: "ERROR", aborted: false, response: NOTICE }, false), undefined, "errors keep their own path");
});

test("quotaErrorMessage satisfies Pi 1.6.0's retry classifier without non-retryable wording", () => {
	for (const notice of [{ resetsIn: "153h38m14s" }, {}]) {
		const message = quotaErrorMessage(notice);
		assert.equal(isRetryableAssistantError({ stopReason: "error", errorMessage: message } as AssistantMessage), true, message);
		assert.doesNotMatch(message, /quota exceeded|billing|available balance|out of budget|insufficient_quota/i);
	}
});

test.each([
	["stream-json style (modelOutputSeen true)", {}],
	["ACP style (no stream-json evidence fields)", { modelOutputSeen: undefined, sawResult: undefined }],
])("main settlement: a notice-only OK handle settles as a retryable error - %s", async (_label, over) => {
	const h = makeHarness([{ outcome: outcomeOf(over), activities: [{ type: "text", delta: NOTICE }] }]);
	assertRetryable(await run(h, userContext("hello")));
});

test("main settlement: the notice arriving only as the final response (no streamed text) is classified before fallback output", async () => {
	const h = makeHarness([{ outcome: outcomeOf({}) }]);
	const t = await run(h, userContext("hello"));
	assertRetryable(t);
	assert.equal(t.text.includes("Individual quota reached"), false, "the raw notice is never appended as fallback output");
});

test("main settlement: an existing binding is never deleted or replaced, even with a changed outcome conversation id", async () => {
	const h = makeHarness([{ outcome: outcomeOf({ conversationId: "conv-NEW" }) }]);
	h.store.set("sid:s-quota", { conversationId: "conv-OLD", lastStepIdx: -1, lastMessageCount: 3 });
	const t = await run(h, userContext("hello"), { sessionId: "s-quota" });
	assertRetryable(t);
	assert.equal(h.store.get("sid:s-quota")?.conversationId, "conv-OLD");
	assert.equal(h.store.get("sid:s-quota")?.lastMessageCount, 3, "watermark untouched");
});

test("main settlement: no binding is created from a quota-notice turn", async () => {
	const h = makeHarness([{ outcome: outcomeOf({}) }]);
	await run(h, userContext("hello"), { sessionId: "s-fresh" });
	assert.ok(!h.store.get("sid:s-fresh"), "no binding record");
});

test("ordinary text that discusses quotas keeps the normal reply and binding", async () => {
	const reply = "Your quota resets weekly; check the dashboard for the exact time.";
	const h = makeHarness([{ outcome: outcomeOf({ response: reply }), activities: [{ type: "text", delta: reply }] }]);
	const t = await run(h, userContext("hello"), { sessionId: "s-ok" });
	assert.equal(t.type, "done");
	assert.equal(t.text, reply);
	assert.equal(h.store.get("sid:s-ok")?.conversationId, "conv-q");
});

test("a turn with tool activity keeps the normal reply even when its text matches the notice", async () => {
	const h = makeHarness([{
		outcome: outcomeOf({}),
		activities: [{ type: "tool_start", name: "view_file", args: {}, stepId: 1 }, { type: "tool_done", name: "view_file", args: {}, stepId: 1, output: "x" }, { type: "text", delta: NOTICE }],
	}]);
	const t = await run(h, userContext("hello"));
	assert.equal(t.type, "done");
});

test("an aborted OK handle is never reclassified", async () => {
	const h = makeHarness([{ outcome: outcomeOf({ aborted: true }) }]);
	const t = await run(h, userContext("hello"));
	assert.equal(t.type, "error");
	assert.equal(t.message, "Operation aborted");
});

test("an ERROR outcome (the existing 429 carrier path) keeps its own error text", async () => {
	const h = makeHarness([{ outcome: outcomeOf({ status: "ERROR", error: "attempt failed (RESOURCE_EXHAUSTED: code 429)", response: "", modelOutputSeen: false }) }]);
	const t = await run(h, userContext("hello"));
	assert.equal(t.type, "error");
	assert.match(t.message ?? "", /RESOURCE_EXHAUSTED/);
	assert.doesNotMatch(t.message ?? "", /Antigravity quota exhausted/);
});

// --- late-result redelivery settlement ---------------------------------------

function toolResultMessage(callId: string, text: string): Message {
	return { role: "toolResult", toolCallId: callId, content: [{ type: "text", text }], isError: false, timestamp: Date.now() } as unknown as Message;
}

async function strandResult(h: ReturnType<typeof makeHarness>, callId: string): Promise<void> {
	// A bridge park that dies with the tool still running leaves a tombstone;
	// the result arriving later is redelivered to agy as a new prompt.
	const parked = h.roundTrips.onToolCall(callId, "slow_tool", {}, new AbortController().signal).catch(() => {});
	h.roundTrips.failAll("agy disconnected before the tool result arrived");
	await parked;
}

test("late redelivery settlement: a notice-only redelivered turn is a retryable error before fallback output", async () => {
	const h = makeHarness([{ outcome: outcomeOf({ conversationId: "owner-conversation" }) }]);
	await strandResult(h, "call-1");
	const context = normalizeContext({ messages: [{ role: "user", content: "start", timestamp: Date.now() }, toolResultMessage("call-1", "RESULT")] });
	const t = await run(h, context);
	assertRetryable(t);
	assert.equal(t.text.includes("Individual quota reached"), false, "no fallback output of the raw notice");
	assert.match(h.seen[0]!.prompt, /Late tool delivery/);
});

test("late redelivery settlement: ordinary redelivered text keeps the normal reply", async () => {
	const h = makeHarness([{ outcome: outcomeOf({ conversationId: "owner-conversation", response: "Done: the tool finished." }) }]);
	await strandResult(h, "call-2");
	const context = normalizeContext({ messages: [{ role: "user", content: "start", timestamp: Date.now() }, toolResultMessage("call-2", "RESULT")] });
	const t = await run(h, context);
	assert.equal(t.type, "done");
	assert.match(t.text, /Done: the tool finished/);
});
