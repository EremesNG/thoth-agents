// Unit tests for buildContextDigest (src/provider.ts).
//
// G1: the digest injects pi-side context agy was not spawned for (compaction
// summaries, other-provider turns, pi-tool results) WITHOUT replaying agy's
// own turns (already in its resumed --conversation DB). Pure function: no I/O.
// Run: npm test

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, vi } from "vitest";
import { normalizeContext, type Api, type Model, type Message, type Usage } from "@earendil-works/pi-ai";
import type { DriverActivity, DriverTurnRequest, TurnDriver, TurnOutcome } from "../src/driver-types.js";
import { SessionStore } from "../src/sessions.js";
import { buildContextDigest, createStreamSimple, rotateAgySession, ToolRoundTrips } from "../src/provider.js";

// pi wraps compaction summaries with this boilerplate (core/messages.js).
const COMP_PREFIX = "The conversation history before this point was compacted into the following summary:\n\n<summary>\n";
const COMP_SUFFIX = "\n</summary>";

function zeroUsage(): Usage {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function user(content: string, timestamp = 0): Message {
	return { role: "user", content, timestamp };
}
function compaction(summary: string): Message {
	return user(COMP_PREFIX + summary + COMP_SUFFIX);
}
function asst(provider: string, text: string, timestamp = 0): Message {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "anthropic-messages" as never,
		provider: provider as never,
		model: "m",
		usage: zeroUsage(),
		stopReason: "stop",
		timestamp,
	};
}
function toolResult(toolName: string, text: string, isError = false, timestamp = 0): Message {
	return {
		role: "toolResult",
		toolCallId: "c",
		toolName,
		content: [{ type: "text", text }],
		isError,
		timestamp,
	};
}

test("empty messages -> empty digest", () => {
	assert.equal(buildContextDigest([], 0), "");
});

test("no compaction and nothing past the watermark -> empty digest", () => {
	// trailing user prompt is always excluded; watermark already covers the rest
	const msgs = [user("hi"), asst("claude", "hello"), user("again")];
	assert.equal(buildContextDigest(msgs, msgs.length), "");
});

test("trailing current prompt is never injected", () => {
	assert.equal(buildContextDigest([user("current prompt")], 0), "");
});

test("compaction summary is injected and its boilerplate wrapper stripped", () => {
	const digest = buildContextDigest([compaction("we decided to use sqlite"), user("now")], 0);
	assert.match(digest, /\[pi compaction summary\]/);
	assert.match(digest, /we decided to use sqlite/);
	assert.doesNotMatch(digest, /<summary>/);
	assert.doesNotMatch(digest, /compacted into the following summary/);
});

test("other-provider assistant turn since watermark is injected", () => {
	const digest = buildContextDigest([asst("claude", "their analysis"), user("now")], 0);
	assert.match(digest, /\[assistant turn from claude\]/);
	assert.match(digest, /their analysis/);
});

test("own (antigravity) assistant turn is skipped to avoid double-counting", () => {
	const msgs = [user("q"), asst("antigravity", "my prior answer"), user("q2")];
	// watermark 1: agy already saw idx 0; idx 1 is its own response -> skipped,
	// and the pre-watermark user msg is not re-injected either.
	assert.equal(buildContextDigest(msgs, 1), "");
	// watermark 0 (fresh session): the prior user msg is legit context agy never
	// saw, so it IS injected, but the antigravity assistant turn never is.
	const d0 = buildContextDigest(msgs, 0);
	assert.match(d0, /\[earlier user message\]/);
	assert.doesNotMatch(d0, /my prior answer/);
});

test("toolResult since watermark is injected, with error label when isError", () => {
	const ok = buildContextDigest([toolResult("read", "file body"), user("now")], 0);
	assert.match(ok, /\[tool result: read\]/);
	assert.match(ok, /file body/);

	const err = buildContextDigest([toolResult("bash", "boom", true), user("now")], 0);
	assert.match(err, /\[tool result: bash \(error\)\]/);
});

test("earlier user message since watermark is injected", () => {
	const digest = buildContextDigest([user("an earlier note"), user("now")], 0);
	assert.match(digest, /\[earlier user message\]/);
	assert.match(digest, /an earlier note/);
});

test("messages before the watermark are excluded", () => {
	const msgs = [user("old"), asst("claude", "old resp"), user("now")];
	// watermark 2 => idx 0 and 1 (the claude turn) are pre-watermark, excluded
	assert.equal(buildContextDigest(msgs, 2), "");
});

test("compaction clamps the window: pre-compaction messages are dropped", () => {
	const msgs = [user("pre-compaction detail"), compaction("the summary"), asst("claude", "post"), user("now")];
	const digest = buildContextDigest(msgs, 0);
	assert.match(digest, /the summary/);
	assert.match(digest, /\[assistant turn from claude\]/);
	assert.match(digest, /post/);
	assert.doesNotMatch(digest, /pre-compaction detail/);
});

test("compaction summary as the immediate predecessor of the prompt injects only the summary", () => {
	const msgs = [user("older"), compaction("just summarized"), user("now")];
	const digest = buildContextDigest(msgs, 0);
	assert.match(digest, /just summarized/);
	assert.doesNotMatch(digest, /older/); // pre-compaction, dropped
	// no delta after the summary (the prompt is excluded), so no delta labels
	assert.doesNotMatch(digest, /\[earlier user message\]/);
});

test("compaction is detected even when watermark points past older messages", () => {
	// watermark 3 would normally start at idx 3, but compaction is at idx 1 =>
	// start clamps to 2, surfacing the post-compaction other-provider turn
	const msgs = [user("a"), compaction("sum"), asst("claude", "after"), user("now")];
	const digest = buildContextDigest(msgs, 3);
	assert.match(digest, /the summary|sum/); // summary always injected
});

test("maxChars keeps the NEWEST delta and marks truncation", () => {
	const msgs = [
		user("old delta line that should be dropped when over budget"),
		user("newest delta line that must survive the cap"),
		user("now"),
	];
	const digest = buildContextDigest(msgs, 0, { maxChars: 90 });
	assert.match(digest, /^\[truncated\]/); // something was cut from the front
	assert.match(digest, /must survive the cap/); // newest kept
	assert.doesNotMatch(digest, /should be dropped/); // oldest dropped first
});

test("maxChars 0 disables the cap", () => {
	const long = "y".repeat(10_000);
	const digest = buildContextDigest([user(long), user("now")], 0, { maxChars: 0 });
	assert.equal(digest.length, `[earlier user message]\n${long}`.length);
});

test("ownProvider override changes which assistant turns are skipped", () => {
	// pretend the bridge registered as "gemini" instead of "antigravity"
	const digest = buildContextDigest([asst("antigravity", "now-foreign turn"), user("now")], 0, {
		ownProvider: "gemini",
	});
	assert.match(digest, /\[assistant turn from antigravity\]/);
});

const model = { id: "test", name: "test", api: "agy-bridge", provider: "antigravity", baseUrl: "", reasoning: false,
	input: ["text"], cost: zeroUsage().cost, contextWindow: 1_000_000, maxTokens: 65536 } as Model<Api>;
const worked: TurnOutcome = { status: "OK", response: "answer", finished: true, aborted: false,
	conversationId: "fresh", modelOutputSeen: true };
const transcript = () => [compaction("latest-summary"),
	asst("antigravity", "kept-agent-answer"), toolResult("read", "kept-tool-output")];

function compactionHarness(engine: "stream-json" | "acp", first: TurnOutcome | "dispatch failure" | "park" = worked, beforeStart?: () => Promise<void>, summary: string | null = "latest-summary", rotateInitially = true) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-compaction-test-"));
	const store = new SessionStore(path.join(dir, "sessions.json"));
	const requests: DriverTurnRequest[] = [];
	let activeHandle: import("../src/driver-types.js").TurnHandle | undefined;
	let nextOutcome: TurnOutcome | undefined;
	let nextHandle: (() => NonNullable<typeof activeHandle>) | undefined;
	const driver = { reentry: () => activeHandle, get activeHandle() { return activeHandle; }, run: async (request: DriverTurnRequest) => {
		requests.push(request);
		request.assertPromptCurrent?.();
		if (nextHandle) {
			const makeHandle = nextHandle;
			nextHandle = undefined;
			return makeHandle();
		}
		const script = nextOutcome ?? (requests.length === 1 ? first : worked);
		nextOutcome = undefined;
		if (script === "dispatch failure") throw new Error("pipe failure");
		const activities: DriverActivity[] = script === "park" ? [{ type: "bridge_call", name: "read", callId: "test", args: {} }] : [];
		return { id: `turn-${requests.length}`, conversationId: script === "park" ? "fresh" : script.conversationId,
			outcome: Promise.resolve(script === "park" ? worked : script), next: async () => activities.shift() ?? null };
	} } as unknown as TurnDriver;
	const sessionId = "compaction-test";
	const key = `sid:${sessionId}${engine === "acp" ? "@acp" : ""}`;
	const roundTrips = new ToolRoundTrips(driver);
	const simple = createStreamSimple({ entries: [], store, driver, acpDriver: engine === "acp" ? driver : undefined,
		engine, roundTrips, beforeStart });
	const rotate = (trusted: string | null = summary) => rotateAgySession(store, sessionId, dir, engine,
		trusted === null ? undefined : { summary: trusted, timestamp: new Date(0).toISOString() });
	if (rotateInitially) rotate();
	return { requests, roundTrips, useNextHandle: (make: NonNullable<typeof nextHandle>) => { nextHandle = make; }, respondNext: (outcome: TurnOutcome) => { nextOutcome = outcome; }, own: (handle: typeof activeHandle) => { activeHandle = handle; }, binding: () => store.get(key), rotate, run: (messages: Message[]) =>
		simple(model, normalizeContext({ messages }), { sessionId }).result(),
		cleanup: () => { roundTrips.clearReplayTurns(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

for (const engine of ["stream-json", "acp"] as const) {
	test(`${engine} delivers latest summary and retained tail once even with digest disabled`, async () => {
		const h = compactionHarness(engine);
		try {
			assert.equal((await h.run(transcript())).stopReason, "stop");
			const request = h.requests[0]!;
			assert.equal(request.conversationId, null);
			const handoff = engine === "acp" ? request.contextBlock!.text : request.prompt;
			assert.match(handoff, /latest-summary/);
			assert.match(handoff, /kept-agent-answer/);
			assert.match(handoff, /kept-tool-output/);
			assert.doesNotMatch(handoff, /superseded-old-summary|discarded/);
			assert.match(request.prompt, /continue/i);
			if (engine === "acp") assert.doesNotMatch(request.prompt, /latest-summary|kept-tool-output/);
			await h.run([...transcript(), user("next")]);
			assert.equal(h.requests[1]!.conversationId, "fresh");
			assert.doesNotMatch(JSON.stringify(h.requests[1]), /latest-summary|kept-tool-output/);
		} finally { h.cleanup(); }
	});

	test(`${engine} refuses a competing handoff before dispatch`, async () => {
		let release!: () => void;
		const wait = new Promise<void>(resolve => { release = resolve; });
		const h = compactionHarness(engine, worked, () => wait);
		try {
			const first = h.run(transcript());
			const second = await h.run([...transcript(), user("competing")]);
			assert.equal(second.stopReason, "error");
			assert.match(second.errorMessage!, /compaction handoff.*retry/i);
			assert.equal(h.requests.length, 0);
			assert.equal(h.binding(), null);
			release();
			assert.equal((await first).stopReason, "stop");
			assert.equal(h.requests.length, 1);
			assert.equal(h.binding()?.conversationId, "fresh");
		} finally { release(); h.cleanup(); }
	}, 2500);

	const notice = "⚠ Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 153h38m14s";
	test.each<[string, TurnOutcome | "dispatch failure" | "park", boolean]>([
		["first park", "park", true],
		["OK with output", worked, true],
		["ERROR with output", { ...worked, status: "ERROR", error: "after output" }, true],
		["OK without output", { ...worked, response: "", modelOutputSeen: false }, false],
		["ERROR without output", { ...worked, status: "ERROR", response: "", modelOutputSeen: false }, false],
		["UNKNOWN", { ...worked, status: "UNKNOWN" }, false],
		["abort", { ...worked, aborted: true }, false],
		["quota", { ...worked, response: notice }, false],
		["no conversation id", { ...worked, conversationId: undefined }, false],
		["dispatch failure", "dispatch failure", false],
	])(`${engine} resolves a handoff after %s`, async (_label, outcome, commit) => {
		const h = compactionHarness(engine, outcome);
		try {
			await h.run([...transcript(), user("first")]);
			assert.match(JSON.stringify(h.requests[0]), /latest-summary/);
			assert.equal(h.binding()?.conversationId, commit ? "fresh" : undefined);
			await h.run([...transcript(), user("next")]);
			assert.equal(h.requests[1]!.conversationId, commit ? "fresh" : null);
			assert.equal(JSON.stringify(h.requests[1]).includes("latest-summary"), !commit);
		} finally { h.cleanup(); }
	});
}

for (const engine of ["stream-json", "acp"] as const) {
	test(`${engine} budgets multibyte handoff bytes including framing`, async () => {
		const h = compactionHarness(engine, worked, undefined, "summary-prefix-" + "🍍".repeat(3000));
		try {
			const response = await h.run([compaction("summary-prefix-" + "🍍".repeat(3000)),
				asst("antigravity", "🌱".repeat(3000) + "most recent tail"), user("fresh input")]);
			assert.equal(response.stopReason, "stop");
			const request = h.requests[0];
			const wire = engine === "acp" ? request.contextBlock!.text : request.prompt;
			const suffix = "fresh input";
			assert.ok(Buffer.byteLength(engine === "acp" ? wire : wire.slice(0, -suffix.length)) <= 8000);
			assert.match(wire, /summary-prefix-/);
			assert.match(wire, /most recent tail/);
			assert.doesNotMatch(wire, /�/);
		} finally { h.cleanup(); }
	});

	test(`${engine} discards an empty handoff even when dispatch fails`, async () => {
		const h = compactionHarness(engine, "dispatch failure", undefined, null);
		try {
			await h.run([user("no retained context")]);
			assert.equal(h.binding(), null);
			await h.run([...transcript(), user("retry")]);
			assert.doesNotMatch(JSON.stringify(h.requests[1]), /latest-summary/);
		} finally { h.cleanup(); }
	});

	test(`${engine} superseding compaction rejects old claims without publishing them`, async () => {
		let release!: () => void;
		const wait = new Promise<void>(resolve => { release = resolve; });
		let first = true;
		const h = compactionHarness(engine, worked, async () => { if (first) { first = false; await wait; } });
		try {
			const old = h.run([...transcript(), user("old request")]);
			h.rotate("new-summary");
			assert.equal((await h.run([compaction("new-summary"), user("new request")])).stopReason, "stop");
			release();
			assert.match((await old).errorMessage!, /compaction handoff.*retry/i);
			assert.equal(h.binding()?.conversationId, "fresh");
			assert.match(JSON.stringify(h.requests[0]), /new-summary/);
			assert.doesNotMatch(JSON.stringify(h.requests[0]), /latest-summary/);
		} finally { release(); h.cleanup(); }
	});
}

test.each(["stream-json", "acp"] as const)("%s fresh input carrying a retained replay result cannot bypass a claimed handoff", async engine => {
	let release!: () => void;
	const wait = new Promise<void>(resolve => { release = resolve; });
	const h = compactionHarness(engine, worked, () => wait);
	const oldResult = toolResult("read", "old replay tool result");
	try {
		h.roundTrips.track("c", "read", { id: "abandoned", bindingOrigin: { key: engine === "acp" ? "sid:compaction-test@acp" : "sid:compaction-test", generation: 0 },
			outcome: Promise.resolve({ ...worked, response: "abandoned answer", conversationId: "abandoned" }), next: async () => null, pushExternal() {} });
		const first = h.run([compaction("latest-summary"), user("claimer")]);
		const competing = await h.run([compaction("latest-summary"), oldResult, user("new user input")]);
		assert.equal(competing.stopReason, "error");
		assert.match(competing.errorMessage!, /compaction handoff.*retry/i);
		assert.equal(h.requests.length, 0);
		assert.equal(h.binding(), null);
		release();
		assert.equal((await first).stopReason, "stop");
		assert.equal(h.requests.length, 1);
	} finally { release(); h.cleanup(); }
}, 2500);

test.each(["stream-json", "acp"] as const)("%s saturated synthetic-resume handoff fits 8000 UTF-8 bytes across prompt and context", async engine => {
	const h = compactionHarness(engine, worked, undefined, "start of summary " + "🍍".repeat(3000));
	try {
		const response = await h.run([compaction("start of summary " + "🍍".repeat(3000)),
			asst("antigravity", "🌱".repeat(3000) + "latest tail")]);
		assert.equal(response.stopReason, "stop");
		const { prompt, contextBlock } = h.requests[0];
		const wire = `${contextBlock?.text ?? ""}${prompt}`;
		assert.ok(Buffer.byteLength(wire) <= 8000, `handoff is ${Buffer.byteLength(wire)} bytes`);
		assert.match(wire, /start of summary/);
		assert.match(wire, /latest tail/);
		assert.match(prompt, /continue/i);
		assert.doesNotMatch(wire, /�/);
	} finally { h.cleanup(); }
});

for (const engine of ["stream-json", "acp"] as const) {
	test(`${engine} handoff retains the actual summary and sends a user quoting the summary marker`, async () => {
		const h = compactionHarness(engine, worked, undefined, "actual-checkpoint");
		try {
			const prompt = 'Please explain the phrase "compacted into the following summary" in these logs.';
			assert.equal((await h.run([compaction("actual-checkpoint"), user(prompt)])).stopReason, "stop");
			const req = h.requests[0];
			assert.ok(req.prompt.endsWith(prompt));
			assert.match(engine === "acp" ? req.contextBlock!.text : req.prompt, /actual-checkpoint/);
		} finally { h.cleanup(); }
	});

	test(`${engine} handoff excludes a rotated result after ordinary poll-registry eviction`, async () => {
		const h = compactionHarness(engine, worked, undefined, "safe-checkpoint");
		vi.useFakeTimers();
		try {
			h.own({ id: "old-owner", bindingOrigin: { key: engine === "acp" ? "sid:compaction-test@acp" : "sid:compaction-test", generation: 0 },
				outcome: Promise.resolve({ ...worked, conversationId: "old-conversation" }), next: async () => null, pushExternal() {} });
			const payload = "distinctive-evicted-result-6b2faa";
			const pending = Array.from({ length: 65 }, (_, i) => h.roundTrips.onToolCall(i === 0 ? "c" : `filler-${i}`, "read", {}, new AbortController().signal));
			await vi.advanceTimersByTimeAsync(120_000);
			await Promise.all(pending);
			h.own(undefined);
			assert.equal(h.roundTrips.resolve("c", payload, false), true);
			assert.equal(h.roundTrips.poll("c"), undefined, "ordinary registry still evicts");
			for (let i = 1; i < pending.length; i++) h.roundTrips.resolve(`filler-${i}`, "filler", false);
			assert.equal((await h.run([compaction("safe-checkpoint"), toolResult("read", payload), user("go")])).stopReason, "stop");
			assert.doesNotMatch(JSON.stringify(h.requests), new RegExp(payload));
		} finally { vi.useRealTimers(); h.cleanup(); }
	});
}

for (const engine of ["stream-json", "acp"] as const) {
	const oldOrigin = { key: engine === "acp" ? "sid:compaction-test@acp" : "sid:compaction-test", generation: 0 };
	const oldHandle = () => ({ id: "inactive-old-turn", bindingOrigin: oldOrigin,
		outcome: Promise.resolve({ ...worked, response: "abandoned answer", conversationId: "abandoned" }), next: async () => null, pushExternal() {} });

	test(`${engine} pending handoff wins over inactive replay before fresh user input`, async () => {
		const h = compactionHarness(engine);
		try {
			h.roundTrips.track("c", "read", oldHandle());
			const reply = await h.run([compaction("latest-summary"), toolResult("read", "old replay result"), user("fresh request")]);
			assert.equal(reply.stopReason, "stop");
			assert.equal(h.requests.length, 1);
			assert.equal(h.requests[0].conversationId, null);
			assert.match(JSON.stringify(h.requests[0]), /latest-summary/);
			assert.match(h.requests[0].prompt, /fresh request$/);
			assert.equal(h.binding()?.conversationId, "fresh");
		} finally { h.cleanup(); }
	});

	test(`${engine} exact Pi summary framing in a later user prompt cannot replace the checkpoint`, async () => {
		const h = compactionHarness(engine);
		try {
			const quoted = COMP_PREFIX + "user's fully framed quotation" + COMP_SUFFIX;
			const reply = await h.run([compaction("latest-summary"), asst("antigravity", "AUTHENTIC-RETAINED-ASSISTANT"), user(quoted, 5)]);
			assert.equal(reply.stopReason, "stop");
			const request = h.requests[0];
			assert.ok(request.prompt.endsWith(quoted));
			const digest = engine === "acp" ? request.contextBlock!.text : request.prompt.slice(0, -quoted.length);
			assert.match(digest, /latest-summary/);
			assert.match(digest, /AUTHENTIC-RETAINED-ASSISTANT/);
			assert.doesNotMatch(digest, /fully framed quotation/);
		} finally { h.cleanup(); }
	});

	test(`${engine} rejected handoff competitor settles a rotated result without delivering it`, async () => {
		let release!: () => void;
		const waiting = new Promise<void>(resolve => { release = resolve; });
		const h = compactionHarness(engine, worked, () => waiting);
		vi.useFakeTimers();
		try {
			h.own(oldHandle());
			const pending = h.roundTrips.onToolCall("c", "read", {}, new AbortController().signal);
			await vi.advanceTimersByTimeAsync(120_000);
			assert.ok("escalated" in await pending);
			h.own(undefined);
			const first = h.run([compaction("latest-summary"), user("claimer")]);
			const rejected = await h.run([compaction("latest-summary"), toolResult("read", "result-now-complete"), user("competitor")]);
			assert.equal(rejected.stopReason, "error");
			assert.match(rejected.errorMessage!, /compaction handoff.*retry/i);
			assert.equal(h.requests.length, 0);
			assert.equal(h.roundTrips.poll("c")?.state, "done");
			assert.equal(h.roundTrips.poll("c")?.text, "result-now-complete");
			assert.notEqual(h.roundTrips.poll("c")?.delivered, true);
			release();
			assert.equal((await first).stopReason, "stop");
			assert.equal(h.requests.length, 1);
		} finally { release(); h.roundTrips.clearEscalations("fixture cleanup"); vi.useRealTimers(); h.cleanup(); }
	});
}

for (const engine of ["stream-json", "acp"] as const) {
	const oldOrigin = { key: `sid:compaction-test${engine === "acp" ? "@acp" : ""}`, generation: 0 };
	test.each(["pending", "claimed"] as const)(`${engine} %s handoff excludes inactive old replay on tool-result tail`, async state => {
		let release!: () => void;
		const waiting = new Promise<void>(resolve => { release = resolve; });
		const h = compactionHarness(engine, worked, state === "claimed" ? () => waiting : undefined);
		let replayReads = 0;
		try {
			h.roundTrips.track("c", "read", { id: "old-tail", bindingOrigin: oldOrigin,
				outcome: Promise.resolve({ ...worked, response: "OLD ANSWER", conversationId: "old" }),
				next: async () => { replayReads++; return null; }, pushExternal() {} });
			const first = state === "claimed" ? h.run([compaction("latest-summary"), user("claimer")]) : undefined;
			const answer = await h.run([compaction("latest-summary"), toolResult("read", "OLD RESULT")]);
			assert.equal(answer.stopReason, state === "claimed" ? "error" : "stop");
			if (state === "claimed") {
				assert.match(answer.errorMessage!, /compaction handoff.*retry/i);
				assert.equal(h.requests.length, 0);
				release();
				await first;
			} else {
				assert.equal(h.requests.length, 1);
				assert.equal(h.requests[0].conversationId, null);
				assert.match(h.requests[0].prompt, /continue/i);
			}
			assert.equal(replayReads, 0);
			assert.equal(h.requests.length, 1);
			assert.match(JSON.stringify(h.requests), /latest-summary/);
			assert.doesNotMatch(JSON.stringify(h.requests), /OLD RESULT/);
		} finally { release(); h.cleanup(); }
	});

	test.each([true, false])(`${engine} committed checkpoint is not resent with digest=%s`, async digest => {
		vi.stubEnv("AGY_DIGEST", digest ? "on" : "off");
		const h = compactionHarness(engine, { ...worked, status: "ERROR", error: "after model output" });
		try {
			assert.equal((await h.run([compaction("latest-summary"), user("initial input")])).stopReason, "error");
			const followUp = digest ? [...transcript(), user("next input")] : [compaction("latest-summary"), user("initial input")];
			assert.equal((await h.run(followUp)).stopReason, "stop");
			assert.equal(h.requests[1].conversationId, "fresh");
			assert.doesNotMatch(JSON.stringify(h.requests[1]), /latest-summary/);
			assert.match(h.requests[1].prompt, digest ? /next input$/ : /initial input$/);
			const sameText = COMP_PREFIX + "latest-summary" + COMP_SUFFIX;
			await h.run([compaction("latest-summary"), user(sameText, 1)]);
			assert.ok(h.requests[2].prompt.endsWith(sameText), "a later user quotation is not the checkpoint");
		} finally { h.cleanup(); vi.unstubAllEnvs(); }
	});
}

for (const engine of ["stream-json", "acp"] as const) {
	test(`${engine} fresh contender with an unresolved old live replay fails fast while handoff is claimed`, async () => {
		let release!: () => void;
		const wait = new Promise<void>(resolve => { release = resolve; });
		const h = compactionHarness(engine, worked, () => wait);
		let finishOld!: (outcome: TurnOutcome) => void;
		const old = { id: "old-live", bindingOrigin: { key: `sid:compaction-test${engine === "acp" ? "@acp" : ""}`, generation: 0 },
			outcome: new Promise<TurnOutcome>(resolve => { finishOld = resolve; }), next: async () => null, pushExternal() {} };
		try {
			h.own(old);
			h.roundTrips.track("c", "read", old);
			const first = h.run([compaction("latest-summary"), user("claimer")]);
			const contender = h.run([compaction("latest-summary"), toolResult("read", "acknowledged old result"), user("fresh contender")]);
			const answer = await Promise.race([contender, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("contender waited for old owner")), 200))]);
			assert.equal(answer.stopReason, "error");
			assert.match(answer.errorMessage!, /compaction handoff.*retry/i);
			assert.equal(h.requests.length, 0);
			assert.equal(h.roundTrips.pendingIds.includes("c"), false, "the result was acknowledged without reading the old reply");
			release();
			assert.equal((await first).stopReason, "stop");
		} finally { finishOld(worked); release(); h.cleanup(); }
	});
}

for (const engine of ["stream-json", "acp"] as const) {
	test(`${engine} blank canonical checkpoint without retained turns writes no prompt or binding`, async () => {
		const h = compactionHarness(engine, worked, undefined, "");
		try {
			await h.run([compaction("")]);
			assert.equal(h.requests.length, 0);
			assert.equal(h.binding(), null);
			await h.run([compaction(""), user("real next input")]);
			assert.equal(h.requests.length, 1);
			assert.equal(h.requests[0].prompt, "real next input");
		} finally { h.cleanup(); }
	});
}

for (const engine of ["stream-json", "acp"] as const) {
	test(`${engine} nonblank checkpoint without real input waits, and a published binding resumes retry tails`, async () => {
		const h = compactionHarness(engine);
		const checkpoint = compaction("latest-summary");
		try {
			for (const messages of [[checkpoint], [checkpoint, user("  ")], []]) await h.run(messages);
			assert.equal(h.requests.length, 0);
			await h.run([checkpoint, user("real input")]);
			assert.equal(h.requests.length, 1);
			assert.match(JSON.stringify(h.requests[0]), /latest-summary/);
			for (const messages of [[checkpoint], [checkpoint, user("  ")], []]) await h.run(messages);
			assert.equal(h.requests.length, 1);
			await h.run([checkpoint, user("real input"), asst("antigravity", "in progress"), { ...toolResult("read", "current-result"), toolCallId: "retry-dropped-tool" } as Message]);
			assert.equal(h.requests.length, 2);
			assert.equal(h.requests[1].conversationId, "fresh");
			assert.match(h.requests[1].prompt, /continue/i);
		} finally { h.cleanup(); }
	});
}

// HEAD controls are explicit for both bound and unbound sessions. Compare
// rotation paths to this contract, not to the same implementation's output.
const retryTailShapes = ["assistant", "tool-result", "user", "checkpoint-only", "empty", "system-only", "old-completion-only"] as const;
const retryTailOutcomes = {
	"unrotated-bound": ["resume", "resume", "user", "user", "error", "error", "redelivery"],
	"unrotated-unbound": ["error", "error", "user", "user", "error", "error", "redelivery"],
	"committed-bound": ["resume", "resume", "user", "stop", "stop", "stop", "stop"],
	"discarded-empty-unbound": ["error", "error", "user", "stop", "stop", "stop", "stop"],
	pending: ["handoff-resume", "handoff-resume", "handoff-user", "stop", "stop", "stop", "stop"],
} as const;

for (const engine of ["stream-json", "acp"] as const) {
	const cases = Object.entries(retryTailOutcomes).flatMap(([state, outcomes]) => retryTailShapes.map((shape, i) => ({ state, shape, expected: outcomes[i] })));
	test.each(cases)(`${engine} retry/no-input parity: $state × $shape → $expected`, async ({ state, shape, expected }) => {
		const old = shape === "old-completion-only";
		const rotated = !state.startsWith("unrotated");
		const summary = state === "discarded-empty-unbound" ? "" : "parity-checkpoint";
		const h = compactionHarness(engine, worked, undefined, summary, false);
		try {
			if (old) {
				vi.useFakeTimers();
				h.own({ id: "escrow", conversationId: "fresh", bindingOrigin: { key: `sid:compaction-test${engine === "acp" ? "@acp" : ""}`, generation: 0 },
					outcome: Promise.resolve(worked), next: async () => null, pushExternal() {} });
				const pending = h.roundTrips.onToolCall("c", "read", {}, new AbortController().signal);
				await vi.advanceTimersByTimeAsync(120_000);
				assert.ok("escalated" in await pending);
				h.own(undefined);
			}
			if (rotated) h.rotate();
			const checkpoint = compaction(summary);
			if (state === "discarded-empty-unbound") await h.run([checkpoint]);
			if (state === "committed-bound") await h.run([checkpoint, user("prime the binding")]);
			if (state === "unrotated-bound") await h.run([user("prime the binding")]);
			const before = h.requests.length;
			const input = user("parity user input", 1);
			const partial = asst("antigravity", "parity partial reply", 2);
			const messages: Record<typeof shape, Message[]> = {
				assistant: [checkpoint, input, partial],
				"tool-result": [checkpoint, input, partial, toolResult("read", "current retry result")],
				user: [checkpoint, input],
				"checkpoint-only": [checkpoint],
				empty: [],
				"system-only": [{ role: "system", content: "system bookkeeping", timestamp: 0 }],
				"old-completion-only": [checkpoint, input, partial, toolResult("read", "completed old result")],
			};
			const outcome = await h.run(messages[shape]);
			const request = h.requests.slice(before);
			assert.equal(outcome.stopReason, expected === "error" ? "error" : "stop");
			assert.equal(request.length, expected === "stop" || expected === "error" ? 0 : 1);
			if (expected === "error") assert.match(outcome.errorMessage!, /No user message/);
			if (expected === "resume") assert.match(request[0].prompt, /Check your conversation history/);
			if (expected === "handoff-resume") assert.match(request[0].prompt, /Continue from the supplied compaction handoff/);
			if (expected === "redelivery") assert.match(request[0].prompt, /completed old result/);
			if (expected.endsWith("user") && shape === "user") assert.match(request[0].prompt, /parity user input$/);
			if (expected.startsWith("handoff")) assert.match(JSON.stringify(request[0]), /parity-checkpoint/);
			if (state === "committed-bound" || state === "discarded-empty-unbound") assert.doesNotMatch(JSON.stringify(request), /parity-checkpoint|<summary>/);
			if (old) {
				assert.equal(h.roundTrips.poll("c")?.state, "done");
				assert.equal(Boolean(h.roundTrips.poll("c")?.delivered), !rotated);
			}
		} finally { h.roundTrips.clearEscalations("fixture cleanup"); vi.useRealTimers(); h.cleanup(); }
	});
}

for (const engine of ["stream-json", "acp"] as const) {
	const key = `sid:compaction-test${engine === "acp" ? "@acp" : ""}`;
	const oldPayload = "ROTATED-ESCROW-4A8C";
	const currentPayload = "CURRENT-ESCROW-6F20";
	const checkpoint = compaction("latest-summary");
	async function escrow(h: ReturnType<typeof compactionHarness>, id: string, generation: number, conversationId: string) {
		h.own({ id: `owner-${id}`, conversationId, bindingOrigin: { key, generation },
			outcome: Promise.resolve({ ...worked, conversationId }), next: async () => null, pushExternal() {} });
		const call = h.roundTrips.onToolCall(id, "read", {}, new AbortController().signal);
		await vi.advanceTimersByTimeAsync(120_000);
		assert.ok("escalated" in await call);
		h.own(undefined);
	}

	test(`${engine} old completion bookkeeping sweeps a done current-generation strand exactly once`, async () => {
		const h = compactionHarness(engine);
		vi.useFakeTimers();
		try {
			await escrow(h, "c", 0, "old");
			await h.run([checkpoint, user("commit handoff")]);
			assert.equal(h.binding()?.conversationId, "fresh");
			await escrow(h, "current-call", 1, "fresh");
			assert.ok(h.roundTrips.resolve("current-call", currentPayload, false));
			const pass = [checkpoint, asst("antigravity", "previous answer"), toolResult("read", oldPayload)];
			assert.equal((await h.run(pass)).stopReason, "stop");
			assert.equal(h.requests.length, 2);
			assert.equal(h.requests[1].conversationId, "fresh");
			assert.match(h.requests[1].prompt, new RegExp(currentPayload));
			assert.doesNotMatch(JSON.stringify(h.requests), new RegExp(oldPayload));
			assert.equal(h.roundTrips.poll("current-call")?.delivered, true);
			assert.equal(h.roundTrips.poll("c")?.text, oldPayload);
			assert.notEqual(h.roundTrips.poll("c")?.delivered, true);
			await h.run(pass);
			assert.equal(h.requests.length, 2);
		} finally { h.roundTrips.clearEscalations("fixture cleanup"); vi.useRealTimers(); h.cleanup(); }
	});

	test(`${engine} rotated completion stays silent before and after a replacement binding`, async () => {
		const h = compactionHarness(engine);
		vi.useFakeTimers();
		try {
			await escrow(h, "c", 0, "old");
			await h.run([checkpoint, user("commit handoff")]);
			assert.equal(h.binding()?.conversationId, "fresh");
			h.respondNext({ ...worked, conversationId: "changed-id" });
			await h.run([checkpoint, user("changed ID turn")]);
			assert.equal(h.binding(), null);
			const pass = [checkpoint, asst("antigravity", "previous answer"), toolResult("read", oldPayload)];
			const completion = await h.run(pass);
			assert.equal(completion.stopReason, "stop");
			assert.equal(completion.content.length, 0, "old completion must not emit a bridge notice");
			assert.equal(h.requests.length, 2);
			h.respondNext({ ...worked, conversationId: "replacement" });
			await h.run([checkpoint, user("establish replacement")]);
			assert.equal(h.binding()?.conversationId, "replacement");
			assert.equal((await h.run(pass)).stopReason, "stop");
			assert.equal(h.requests.length, 3, "retained old result cannot prompt a replacement binding");
			assert.doesNotMatch(JSON.stringify(h.requests), new RegExp(oldPayload));
			assert.equal(h.roundTrips.poll("c")?.text, oldPayload);
			assert.notEqual(h.roundTrips.poll("c")?.delivered, true);
		} finally { h.roundTrips.clearEscalations("fixture cleanup"); vi.useRealTimers(); h.cleanup(); }
	});
}

for (const engine of ["stream-json", "acp"] as const) {
	test(`${engine} a published retry cannot write after rotation during bridge startup`, async () => {
		let block = false;
		let release!: () => void;
		const wait = new Promise<void>(resolve => { release = resolve; });
		const h = compactionHarness(engine, worked, async () => { if (block) await wait; });
		try {
			await h.run([compaction("latest-summary"), user("publish")]);
			block = true;
			const retry = h.run([compaction("latest-summary"), user("prior work"), asst("antigravity", "partial reply")]);
			h.rotate("new checkpoint");
			release();
			const reply = await retry;
			assert.equal(reply.stopReason, "error");
			assert.match(reply.errorMessage!, /compaction handoff.*retry/i);
			assert.equal(h.requests.length, 1);
			assert.equal(h.binding(), null);
		} finally { release(); h.cleanup(); }
	});

	test(`${engine} live replay on a recreated carrier drains with steering without reverting the binding fence`, async () => {
		const h = compactionHarness(engine);
		const key = `sid:compaction-test${engine === "acp" ? "@acp" : ""}`;
		let reads = 0;
		try {
			await h.run([compaction("latest-summary"), user("publish")]);
			const owner = { id: "live-recreated", conversationId: "recreated", bindingOrigin: { key, generation: 1 },
				outcome: Promise.resolve({ ...worked, response: "original replay reply", conversationId: "recreated" }),
				next: async () => { reads++; return null; }, pushExternal() {} };
			h.own(owner);
			h.roundTrips.track("c", "read", owner);
			const reply = await h.run([compaction("latest-summary"), toolResult("read", "completed replay"), user("steering")]);
			assert.equal(reply.stopReason, "stop");
			assert.match(JSON.stringify(reply.content), /original replay reply/);
			assert.equal(reads, 1);
			assert.equal(h.requests.length, 1);
			assert.equal(h.binding(), null, "changed-ID settlement drops rather than overwrites the prior binding");
		} finally { h.cleanup(); }
	});
}

// Changed-ID replay is a second dimension of the bound HEAD parity contract.
// Pending and discarded-unbound passes have no dispatch binding to recreate.
for (const engine of ["stream-json", "acp"] as const) {
	const cases = [false, true].flatMap(committed => [false, true].flatMap(settled => [false, true].map(steering => ({ committed, settled, steering }))));
	test.each(cases)(`${engine} recreated-carrier parity: committed=$committed settled=$settled steering=$steering`, async ({ committed, settled, steering }) => {
		const h = compactionHarness(engine, worked, undefined, "latest-summary", committed);
		const prefix = committed ? [compaction("latest-summary")] : [];
		let finish!: (outcome: TurnOutcome) => void;
		let drains = 0;
		const outcome = new Promise<TurnOutcome>(resolve => { finish = resolve; });
		const recreated = { ...worked, conversationId: "recreated", response: "buffered reply on recreated carrier" };
		const owner = { id: "recreated-owner", conversationId: "recreated", outcome, pushExternal() {},
			next: async (): Promise<DriverActivity | null> => ++drains === 1 ? { type: "bridge_call", name: "antigravity", callId: "c", args: {} } : null };
		try {
			await h.run([...prefix, user("bind")]);
			h.useNextHandle(() => owner);
			const park = await h.run([...prefix, user("recreate")]);
			assert.equal(park.stopReason, "toolUse");
			assert.equal(h.requests[1].conversationId, "fresh");
			h.roundTrips.track("c", "antigravity", owner);
			if (settled) { finish(recreated); await outcome; }
			else h.own(owner);
			const result = h.run([...prefix, park, toolResult("antigravity", "already executed"), ...(steering ? [user("steering")] : [])]);
			if (!settled) finish(recreated);
			const answer = await result;
			assert.equal(answer.stopReason, "stop");
			assert.match(JSON.stringify(answer.content), /buffered reply on recreated carrier/);
			assert.equal(h.requests.length, 2);
			assert.equal(drains, 2);
			assert.equal(h.binding(), null);
		} finally { finish(recreated); h.cleanup(); }
	});
}

for (const engine of ["stream-json", "acp"] as const) {
	test(`${engine} a settled replay from the first handoff park matches its published binding`, async () => {
		const h = compactionHarness(engine);
		const checkpoint = compaction("latest-summary");
		let finish!: (outcome: TurnOutcome) => void;
		const outcome = new Promise<TurnOutcome>(resolve => { finish = resolve; });
		let firstActivity = true;
		const owner = { id: "handoff-publisher", conversationId: "fresh", outcome, pushExternal() {},
			next: async (): Promise<DriverActivity | null> => {
				if (!firstActivity) return null;
				firstActivity = false;
				return { type: "bridge_call", name: "antigravity", callId: "c", args: {} };
			} };
		try {
			h.useNextHandle(() => owner);
			const park = await h.run([checkpoint, user("first dispatch")]);
			assert.equal(park.stopReason, "toolUse");
			assert.equal(h.requests[0].conversationId, null);
			assert.equal(h.binding()?.conversationId, "fresh");
			h.roundTrips.track("c", "antigravity", owner);
			finish({ ...worked, response: "original reply after the handoff park" });
			await outcome;
			const reply = await h.run([checkpoint, park, toolResult("antigravity", "done"), user("steering")]);
			assert.match(JSON.stringify(reply.content), /original reply after the handoff park/);
			assert.equal(h.requests.length, 1);
			assert.equal(h.binding()?.conversationId, "fresh");
		} finally { finish(worked); h.cleanup(); }
	});
}
