// Adapted from upstream PR #225: the SDK splits a non-streaming response into
// one assistant message per block and can park waiting for Pi's tool results.
import assert from "node:assert/strict";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { once } from "node:events";
import { it } from "node:test";
import { setImmediate, setTimeout } from "node:timers/promises";
import { QueryContext } from "../src/query-state.js";

const { default: activate, __test } = await import("../src/index.js");
const model = { api: "anthropic-messages", provider: "anthropic", id: "test-model" };
const name = "mcp__custom-tools__bash";
const tools = new Map([[name, "bash"]]);
const streamEvent = (event) => ({ type: "stream_event", event });
const block = (id, content, messageId = "msg_fallback") => ({
	type: "assistant", parent_tool_use_id: null, uuid: `sdk_${id}`,
	message: { id: messageId, stop_reason: "tool_use", content: [content] },
});
const toolUse = (id) => ({ type: "tool_use", id, name, input: { command: "ls" } });
const ids = ["toolu_a", "toolu_b", "toolu_c"];
const fallback = ids.map((id) => block(id, toolUse(id)));
// Claude Code can fabricate a stop with no message_delta for the dead stream.
const deadStream = [
	streamEvent({ type: "message_start", message: { id: "msg_dead" } }),
	streamEvent({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } }),
	streamEvent({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Partial thought" } }),
	streamEvent({ type: "content_block_stop", index: 0 }),
	streamEvent({ type: "message_stop" }),
];

function run(messages, { wasAborted = () => false, onResponse, expectedSessionId } = {}) {
	const c = new QueryContext();
	const events = [];
	const ended = Promise.withResolvers();
	const stream = { push: (e) => events.push(e), end: () => { events.push({ type: "end" }); ended.resolve(); } };
	c.currentPiStream = stream;
	c.currentOnResponse = onResponse;
	c.resetTurnState(model);
	async function* gen() { yield* messages; }
	const done = __test.consumeQuery(gen(), tools, model, wasAborted, c, undefined, expectedSessionId);
	return { c, done, events, ended: ended.promise, stream };
}

function assertToolTurn(events, expectedIds) {
	const done = events.find((event) => event.type === "done");
	assert.equal(done?.reason, "toolUse", JSON.stringify(events));
	assert.deepEqual(done.message.content.filter((b) => b.type === "toolCall").map((b) => b.id), expectedIds);
	assert.deepEqual(events.filter((event) => event.type.startsWith("toolcall_") || event.type === "done" || event.type === "end").map((event) => event.type),
		[...expectedIds.flatMap(() => ["toolcall_start", "toolcall_end"]), "done", "end"]);
	assert.deepEqual(events.slice(-2).map((event) => event.type), ["done", "end"]);
}

const servedTool = { name: "bash", description: "bash", parameters: { type: "object", properties: {} } };

async function assertWhileParked(messages, expectedIds, { userReceipts = [], afterDispatch, beforeFence, expectedError, ...options } = {}) {
	const gate = Promise.withResolvers();
	const reduced = Promise.withResolvers();
	const afterFence = Promise.withResolvers();
	async function* parked() {
		yield* messages;
		reduced.resolve();
		await afterFence.promise;
		yield afterDispatch ?? { type: "user", uuid: "after-fence", parent_tool_use_id: null, isReplay: true, message: { content: "queued after dispatch" } };
		await gate.promise;
	}
	const { c, done, ended, events } = run(parked(), options);
	for (const [index, uuid] of userReceipts.entries()) {
		const users = Array.from({ length: index + 1 }, () => ({ role: "user", content: "replayed", timestamp: 1 }));
		c.recording.users(users, index, uuid, false, index !== 0);
		if (index !== 0) c.pendingSteerUuids.add(uuid);
	}
	const requests = new Map();
	let reducedWatermark = 0;
	let ingressWatermark = 0;
	c.fallbackQualified = true;
	c.queryProcess = {
		get reducedWatermark() { return reducedWatermark; },
		get ingressWatermark() { return ingressWatermark; },
		acknowledge() { ingressWatermark = ++reducedWatermark; return reducedWatermark; },
		getMcpCall: (server, id) => server === "custom-tools" ? requests.get(id) : undefined,
	};
	const server = __test.buildMcpServers([servedTool], c)["custom-tools"].instance;
	const transport = { start: async () => {}, close: async () => {}, send: async () => {} };
	await server.connect(transport);
	const deadline = new AbortController();
	const dispatch = (id, toolId, queuedFrame = false) => {
		requests.set(id, { sequence: ++ingressWatermark, controlRequestId: `test-control-${id}` });
		reducedWatermark = ingressWatermark;
		if (queuedFrame) ++ingressWatermark;
		transport.onmessage({ jsonrpc: "2.0", id, method: "tools/call", params: {
			name: "bash", arguments: {}, _meta: { "claudecode/toolUseId": toolId },
		} });
	};
	try {
		await Promise.race([reduced.promise, ended.then(() => assert.fail(JSON.stringify(events)))]);
		assert.ok(events.every((event) => !event.type.startsWith("toolcall_") && event.type !== "done"), "a staged batch is invisible to Pi");
		assert.equal(c.turnOutput.content.some((b) => b.type === "toolCall"), false);
		assert.equal(c.assistantSteps.has("msg_fallback"), false);
		assert.deepEqual(c.recording.recorded.uuids, userReceipts);
		assert.equal(c.pendingSteerUuids.size, 0);
		await setTimeout(130);
		assert.ok(events.every((event) => event.type !== "done"), "silence is not a fence");
		beforeFence?.(c);
		dispatch(17, expectedIds[0], true); // SDK has not yet yielded the already-ingressed replay.
		await setImmediate();
		assert.ok(events.every((event) => event.type !== "done"), "dispatch cannot outrun a pending raw frame");
		afterFence.resolve();
		await Promise.race([ended, setTimeout(2000, undefined, { signal: deadline.signal }).then(() => assert.fail("Pi stream did not end"))]);
		if (expectedError) {
			assert.deepEqual(events.map((e) => e.type), ["error", "end"]);
			assert.match(events[0].error.errorMessage, expectedError);
			return;
		}
		assertToolTurn(events, expectedIds);
		return events.find((event) => event.type === "done").message.content;
	} finally {
		deadline.abort();
		afterFence.resolve();
		gate.resolve();
		c.releasePendingToolCalls("replay ended");
		await done;
		await server.close();
	}
}

it("publishes three delayed same-ID calls with thinking/text and interleaved user replays only at the fence", async () => {
	const thinking = { type: "thinking", thinking: "Plan", signature: "sig" };
	const replay = (uuid) => ({ type: "user", uuid, parent_tool_use_id: null, isReplay: true, message: { content: "replayed" } });
	async function* delayed() {
		yield* deadStream;
		yield block("thinking", thinking);
		yield replay("prompt");
		yield fallback[0];
		await setTimeout(140);
		yield replay("steer");
		yield fallback[1];
		yield block("text", { type: "text", text: "Between calls" });
		yield fallback[2];
	}
	const content = await assertWhileParked(delayed(), ids, { userReceipts: ["prompt", "steer"] });
	assert.deepEqual(content.slice(-5).map((part) => part.id ?? part.thinking ?? part.text), ["Plan", ids[0], ids[1], "Between calls", ids[2]]);
});

it("still ends a parked single-tool fallback on toolUse at its fence", async () => {
	await assertWhileParked([...deadStream, fallback[0]], ids.slice(0, 1));
});

it("clean EOF fails instead of publishing an unfenced fallback", async () => {
	const { c, done, events } = run(fallback);
	assert.match((await done).failure?.message, /ended.*fallback.*fence/i);
	// Exactly one terminal event, never a tool call or toolUse completion for Pi to run.
	assert.deepEqual(events.map((event) => event.type), ["error", "end"]);
	assert.deepEqual(events[0].error.content, []);
	assert.deepEqual(c.recording.recorded.uuids, []);
});

it("success result does not publish an unfenced fallback", async () => {
	const { done, events } = run([...fallback, { type: "result", subtype: "success", result: "not a fence", is_error: false }]);
	assert.match((await done).failure?.message, /result.*fallback.*fence/i);
	assert.equal(events.filter((event) => event.type === "error").length, 1);
	assert.equal(events.some((event) => event.type.startsWith("toolcall_") || event.type === "done"), false);
});

it("does not expose an assistant tool call without an API message identity", async () => {
	const malformed = { ...fallback[0], message: { ...fallback[0].message, id: undefined } };
	const { done, events } = run([malformed]);
	assert.match((await done).failure?.message, /fallback.*missing.*message id/i);
	assert.deepEqual(events.map((event) => event.type), ["error", "end"]);
});

it("a different assistant id is not a completion fence", async () => {
	const { done, events } = run([...fallback, block("new", toolUse("toolu_new"), "msg_next")]);
	assert.match((await done).failure?.message, /fallback.*fence/i);
	assert.equal(events.some((event) => event.type === "done"), false);
});

it("the watchdog fails a parked fallback with no fence", { timeout: 2000 }, async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const gate = Promise.withResolvers();
	const ready = Promise.withResolvers();
	async function* parked() { yield* fallback; ready.resolve(); await gate.promise; }
	const { done, ended, events } = run(parked());
	try {
		await ready.promise;
		t.mock.timers.tick(120_000);
		await ended;
		assert.match(events.find((event) => event.type === "error")?.error.errorMessage, /watchdog.*fence/i);
		assert.equal(events.some((event) => event.type === "done"), false);
	} finally { gate.resolve(); await done; }
});

const apiRetry = {
	type: "system", subtype: "api_retry", attempt: 1, max_retries: 3, retry_delay_ms: 100,
	error_status: 529, error: "unknown", uuid: "api-retry", session_id: "test-session",
};
const refusalRetry = {
	type: "system", subtype: "model_refusal_fallback", trigger: "refusal", direction: "retry", scope: "session",
	original_model: "test-model", fallback_model: "test-replacement", request_id: null,
	content: "retrying", uuid: "refusal-retry", session_id: "test-session",
};
const replacementId = "toolu_replacement";
const replacementStream = [
	streamEvent({ type: "message_start", message: { id: "msg_replacement" } }),
	streamEvent({ type: "content_block_start", index: 0, content_block: toolUse(replacementId) }),
	streamEvent({ type: "content_block_stop", index: 0 }),
	streamEvent({ type: "message_stop" }),
];
const unparsedToolInput = { __unparsedToolInput: { raw: "malformed-args", len: 14 } };
const unparsedStreamingEcho = block(replacementId, { ...toolUse(replacementId), input: unparsedToolInput }, "msg_replacement");

for (const [label, prefix] of [
	["ambiguous api_retry during a staged batch", [fallback[0], apiRetry]],
	["main-thread refusal retry during a staged batch", [fallback[0], refusalRetry]],
	["api_retry with no staged batch", [apiRetry]],
]) {
	it(`${label} allows streaming tool calls to end normally at message_stop`, async () => {
		async function* streaming() {
			yield* prefix;
			yield* replacementStream;
			assertToolTurn(events, [replacementId]);
		}
		const { c, done, events } = run(streaming());
		let stopped = 0;
		c.stopProcess = () => { stopped++; };
		assert.equal((await done).failure, undefined);
		assert.equal(stopped, 0);
		assertToolTurn(events, [replacementId]);
		assert.equal(c.assistantSteps.has("msg_fallback"), false);
	});
}

it("api_retry rejects retired assistant frames once its non-streaming replacement stages", async () => {
	const replacement = block("replacement", toolUse(replacementId), "msg_replacement");
	const { done, events } = run([fallback[0], apiRetry, replacement, fallback[1]]);
	assert.match((await done).failure?.message, /retired fallback message/);
	assert.deepEqual(events.map((event) => event.type), ["error", "end"]);
});

const narration = block("narration", { type: "text", text: "Preparing to call bash" }, "msg_replacement");
it("a valid replacement with narration publishes at its fence", async () => {
	const replacement = block("replacement", toolUse(replacementId), narration.message.id);
	const content = await assertWhileParked([fallback[0], apiRetry, narration, replacement], [replacementId]);
	assert.deepEqual(content.map((part) => part.text ?? part.id), ["Preparing to call bash", replacementId]);
});

for (const [label, frames, expected] of [
	["api_retry without replacement", [fallback[0], apiRetry], /watchdog.*replacement/i],
	["replacement narration followed by silence", [fallback[0], apiRetry, narration], /watchdog/i],
	["initial narration followed by silence", [narration], /watchdog/i],
]) it(`${label} produces only the watchdog error`, { timeout: 2000 }, async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const gate = Promise.withResolvers();
	const ready = Promise.withResolvers();
	async function* parked() {
		yield frames[0];
		t.mock.timers.tick(30_000);
		yield* frames.slice(1);
		ready.resolve();
		await gate.promise;
	}
	const { c, done, ended, events } = run(parked());
	let stopped = 0;
	c.stopProcess = () => { stopped++; };
	try {
		await Promise.race([ready.promise, ended.then(() => assert.fail(JSON.stringify(events)))]);
		assert.equal(stopped, 0, "staging and retry never stop the child");
		assert.deepEqual(events, []);
		t.mock.timers.tick(89_999);
		assert.deepEqual(events, []);
		t.mock.timers.tick(1);
		assert.deepEqual(events.map((event) => event.type), ["error", "end"]);
		assertFailedFallback(events.slice(0, -1), expected);
		assert.equal(stopped, 1);
	} finally { gate.resolve(); await done; }
});

const laterNarration = block("later_narration", { type: "text", text: "Still preparing" }, "msg_later");
it("successive narration ids keep the original 120-second deadline", { timeout: 2000 }, async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const ready = Promise.withResolvers();
	const release = Promise.withResolvers();
	async function* parked() {
		yield narration;
		t.mock.timers.tick(119_000);
		yield laterNarration;
		ready.resolve();
		await release.promise;
	}
	const { c, done, ended, events } = run(parked());
	let stopped = 0;
	c.stopProcess = () => { stopped++; };
	try {
		await Promise.race([ready.promise, ended.then(() => assert.fail(JSON.stringify(events)))]);
		assert.equal(c.pendingFallback?.messageId, laterNarration.message.id);
		t.mock.timers.tick(999);
		assert.equal(events.filter((event) => event.type === "error" || event.type === "done").length, 0);
		assert.equal(stopped, 0);
		t.mock.timers.tick(1);
		assert.deepEqual(events.filter((event) => event.type === "error" || event.type === "done" || event.type === "end").map(({ type }) => type), ["error", "end"]);
		assert.match(events.at(-2).error.errorMessage, /watchdog/i);
		assert.equal(events.some((event) => event.type.startsWith("toolcall_")), false);
		assert.equal(stopped, 1);
	} finally { release.resolve(); await done; }
});

it("successive unconfirmed narration ids remain private and retry discards both", async () => {
	let replay;
	async function* messages() {
		yield narration;
		yield laterNarration;
		assertPrivate();
		yield apiRetry;
		assertPrivate();
		yield narration; // Late frame from the first discarded id.
		yield laterNarration;
		assertPrivate();
		yield block("confirmed_text", { type: "text", text: replacementText }, "msg_confirmed");
		yield textReplacement[1];
	}
	function assertPrivate() {
		assert.deepEqual(replay.events.map(({ type }) => type), []);
		assert.deepEqual(replay.c.turnOutput.content, []);
		assert.equal(replay.c.assistantSteps.has(narration.message.id), false);
		assert.equal(replay.c.assistantSteps.has(laterNarration.message.id), false);
	}
	replay = run(messages());
	assert.equal((await replay.done).failure, undefined);
	assert.deepEqual(replay.c.turnOutput.content, [{ type: "text", text: replacementText }]);
});

for (const [exit, boundary] of [
	["confirmed text result", { type: "result", subtype: "success", is_error: false, result: "Still preparing" }],
	["ordinary streaming replacement", streamEvent({ type: "message_start", message: { id: "msg_streamed" } })],
]) it(`${exit} ends staging after successive narration ids`, { timeout: 2000 }, async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const ready = Promise.withResolvers();
	const release = Promise.withResolvers();
	async function* parked() {
		yield narration;
		t.mock.timers.tick(119_000);
		yield laterNarration;
		yield boundary;
		ready.resolve();
		await release.promise;
	}
	const { c, done, ended, events } = run(parked());
	try {
		await Promise.race([ready.promise, ended.then(() => assert.fail(JSON.stringify(events)))]);
		assert.equal(c.pendingFallback, undefined);
		t.mock.timers.tick(120_000);
		assert.equal(events.some((event) => event.type === "error"), false);
		assert.deepEqual(c.turnBlocks.map(({ text }) => text), ["Preparing to call bash", "Still preparing"]);
	} finally { release.resolve(); await done; }
});

const sideRetry = { type: "system", subtype: "control_request_progress", request_id: "side", status: "api_retry", attempt: 1 };
const subagentRetry = {
	type: "tool_progress", tool_use_id: "toolu_agent", parent_tool_use_id: "toolu_parent",
	tool_name: "Agent", elapsed_time_seconds: 1,
	subagent_retry: { agent_id: "agent", attempt: 1, max_retries: 3, retry_delay_ms: 100, error_status: 529, error_category: "overloaded" },
};

it("does not emit a tool turn when the SDK reports an error during fallback collection", async () => {
	const failed = { type: "result", subtype: "success", is_error: true, result: "API Error: 529 overloaded" };
	const { done, events, c } = run([...deadStream, ...fallback, failed]);
	const { failure } = await done;
	assert.equal(failure?.message, "API Error: 529 overloaded");
	assert.equal(events.find((event) => event.type === "done"), undefined);
	assert.equal(c.currentPiStream, null);
	assert.equal(events.filter((event) => event.type === "error").length, 1);
	assert.equal(c.turnOutput.stopReason, "error");
});

const rateLimit = { type: "rate_limit_event", rate_limit_info: { status: "allowed" } };
const hardQuotaDenial = { type: "rate_limit_event", rate_limit_info: {
	status: "rejected", errorCode: "credits_required", isUsingOverage: false,
} };
const refusalFrame = (frame) => ({ ...frame, message: { ...frame.message, stop_reason: "refusal" } });

it("preserves an ordinary text-only refusal", { timeout: 6000 }, async (t) => {
	const refusal = "I cannot help.";
	const stream = startProvider(t, async function* ({ options }) {
		yield { type: "system", subtype: "init", session_id: options.sessionId };
		yield refusalFrame(block("refusal_text", { type: "text", text: refusal }));
		yield { type: "result", subtype: "success", is_error: false, stop_reason: "refusal", result: refusal };
	});
	const events = await Array.fromAsync(stream);
	assert.deepEqual(events.filter(({ type }) => type === "done" || type === "error").map(({ type, reason }) => [type, reason]), [["done", "stop"]]);
	assert.deepEqual(events.at(-1).message.content.map(({ text }) => text), [refusal]);
});
const slowResponse = { onResponse: () => setTimeout(175) };

it("honors an SDK error queued behind a slow rate-limit response hook", async () => {
	const failed = { type: "result", subtype: "success", is_error: true, result: "API Error: 529 overloaded" };
	const { done, events, c } = run([...fallback, rateLimit, failed], slowResponse);
	assert.equal((await done).failure?.message, "API Error: 529 overloaded");
	assert.equal(events.some((event) => event.type === "done"), false);
	assert.equal(c.turnOutput.stopReason, "error");
});

it("honors a local tool rejection queued behind a slow rate-limit response hook", async () => {
	const rejected = { type: "user", parent_tool_use_id: null, message: { content: [
		{ type: "tool_result", tool_use_id: ids[1], content: "Permission denied by hook" },
	] } };
	const { done, events } = run([...fallback, rateLimit, rejected], slowResponse);
	await done;
	assert.equal(events.some((event) => event.type === "done"), false);
	assert.match(events.find((event) => event.type === "error")?.error.errorMessage, /before pi started running it.*Permission denied by hook/);
});

it("includes a same-ID tool block queued behind a slow rate-limit response hook", async () => {
	await assertWhileParked([...fallback.slice(0, 2), rateLimit, fallback[2]], ids, slowResponse);
});

it("reaches the fence after a slow rate-limit response hook when the SDK parks", async () => {
	await assertWhileParked([...fallback, rateLimit], ids, slowResponse);
});

it("does not emit fallback tools after the response hook itself rejects", async () => {
	const onResponse = async () => { await setTimeout(175); throw new Error("test response hook failed"); };
	const { done, events } = run([fallback[0], rateLimit, fallback[1]], { onResponse });
	assert.match((await done).failure?.message, /test response hook failed/);
	assert.equal(events.filter((event) => event.type === "error").length, 1);
	assert.equal(events.some((event) => event.type === "done"), false);
});

it("does not emit a tool turn after the SDK iterator throws", async () => {
	async function* broken() { yield* fallback; throw new Error("SDK disconnected"); }
	const { done, events } = run(broken());
	assert.match((await done).failure?.message, /SDK disconnected/);
	assert.equal(events.filter((event) => event.type === "error").length, 1);
	await setTimeout(150);
	assert.equal(events.find((event) => event.type === "done"), undefined);
});

it("delivers the stream recording error before iterator cleanup and catches a later cleanup rejection", { timeout: 2000 }, async () => {
	const key = "CLAUDE_BRIDGE_RECORD_STREAM";
	const previous = process.env[key];
	const closing = Promise.withResolvers();
	const release = Promise.withResolvers();
	async function* broken() {
		try {
			yield* fallback;
			process.env[key] = new URL(".", import.meta.url).pathname;
			yield rateLimit;
		} finally {
			closing.resolve();
			await release.promise;
			throw new Error("secondary iterator.return failure");
		}
	}
	const { done, events } = run(broken());
	const settled = done.catch((e) => e);
	try {
		await closing.promise;
		assert.deepEqual(events.map((event) => event.type), ["error", "end"]);
		assert.match(events[0].error.errorMessage, /EISDIR|ENOENT|EPERM/);
	} finally {
		release.resolve();
		if (previous === undefined) delete process.env[key];
		else process.env[key] = previous;
		await settled;
	}
});

it("the same rejected response-hook prefix fails fallback and allows ordinary streaming", async () => {
	const onResponse = async () => { throw new Error("rejected before first block"); };
	const failed = run([rateLimit, fallback[0]], { onResponse });
	assert.match((await failed.done).failure?.message, /rejected before first block/);
	assert.deepEqual(failed.events.map((e) => e.type), ["error", "end"]);
	const normal = run([rateLimit,
		streamEvent({ type: "message_start", message: { id: "streaming" } }),
		streamEvent({ type: "content_block_start", index: 0, content_block: toolUse(ids[0]) }),
		streamEvent({ type: "content_block_stop", index: 0 }),
		streamEvent({ type: "message_stop" }),
	], { onResponse });
	await normal.done;
	assertToolTurn(normal.events, ids.slice(0, 1));
});

for (const [message, expected] of [
	[{ type: "result", subtype: "error_during_execution", is_error: true, errors: ["execution failed"] }, /execution failed/],
	[{ type: "conversation_reset", new_conversation_id: "different" }, /reset.*conversation/i],
	[{ type: "system", subtype: "session_writes_lost", lost: ["transcript"], transcript_session_ids: ["target"], error_code: "ENOSPC" }, /lost transcript.*ENOSPC/i],
]) it(`immediately ends fallback on ${message.subtype ?? message.type}`, async () => {
	const { done, events } = run([fallback[0], message], { expectedSessionId: "target" });
	assert.match((await done).failure?.message, expected);
	assert.deepEqual(events.map((event) => event.type), ["error", "end"]);
});

// A tool-use result ends the Pi stream, not the resident SDK query/child.
function spawnReplay(t, spawn, options, script) {
	const child = spawn({ ...options, command: process.execPath, args: ["-e", script] });
	const closed = once(child, "close");
	t.after(async () => {
		if (child.exitCode === null && child.signalCode === null) child.kill();
		await closed;
	});
	return child;
}

let provider;
function startProvider(t, queryImpl, onResponse, controller = new AbortController(), sessionId) {
	t.after(() => { controller.abort(); __test.setQuery(null); });
	__test.setQuery(queryImpl);
	if (!provider) activate({ on() {}, registerProvider: (_id, value) => { provider = value; } });
	return provider.streamSimple(provider.models[0], {
		messages: [{ role: "user", content: "run bash", timestamp: 1 }],
		tools: [{ name: "bash", description: "bash", parameters: { type: "object", properties: { command: { type: "string" } } } }],
	}, { signal: controller.signal, onResponse, sessionId });
}

const authError = { type: "auth_status", isAuthenticating: false, error: "no credentials" };
for (const [label, frame, expected] of [
	["auth error", authError, /no credentials/],
	["aborted tool-bearing assistant", { ...fallback[0], aborted: true }, /aborted/],
	["error-marked tool-bearing assistant", { ...fallback[0], error: "server_error" }, /server_error/],
]) {
	it(`ordinary streaming still publishes on message_stop after ${label}`, async () => {
		const [start, tool, stopBlock, stopMessage] = replacementStream;
		const ordinary = frame.type === "assistant" ? { ...frame, ...block("echo", toolUse(replacementId), "msg_replacement") } : frame;
		const { done, events } = run([start, tool, stopBlock, ordinary, stopMessage]);
		assert.equal((await done).failure, undefined);
		assertToolTurn(events, [replacementId]);
	});
	it(`${label} before or during fallback staging prevents hand-over`, async () => {
		for (const prefix of [[], [lateText]]) {
			const { done, events } = run([...prefix, frame, fallback[1]]);
			assert.match((await done).failure?.message, expected);
			assert.deepEqual(events.map((event) => event.type), ["error", "end"]);
		}
	});
}

for (const fallbackTool of [false, true]) it(`initial prompt rejection before assistant content ${fallbackTool ? "vetoes fallback" : "leaves ordinary streaming alone"}`, { timeout: 4000 }, async (t) => {
	const stream = startProvider(t, ({ prompt }) => {
		const owner = [...__test.activeQueryContexts].findLast((c) => c.currentPiStream);
		const gen = (async function* () {
			assert.equal((await prompt.next()).done, false);
			await prompt.return(); // the pump abandons its acknowledgement
			await setImmediate();
			assert.match(owner.fallbackViolation?.message, /prompt stream closed/);
			assert.equal(owner.observedFailure, undefined, "the rejection is provisional before staging");
			if (fallbackTool) yield fallback[0];
			else yield* replacementStream;
		})();
		gen.close = () => {};
		gen.interrupt = async () => {};
		return gen;
	});
	const events = await Array.fromAsync(stream);
	if (fallbackTool) assertFailedFallback(events, /prompt stream closed/);
	else assertToolTurn([...events, { type: "end" }], [replacementId]);
});

it("late initial prompt rejection does not poison a replacement attempt", { timeout: 4000 }, async (t) => {
	const stream = startProvider(t, ({ prompt }) => {
		const owner = [...__test.activeQueryContexts].findLast((c) => c.currentPiStream);
		const gen = (async function* () {
			assert.equal((await prompt.next()).done, false);
			yield lateText;
			yield apiRetry;
			await prompt.return();
			await setImmediate();
			assert.equal(owner.fallbackViolation, undefined);
			yield* textReplacement;
		})();
		gen.close = () => {};
		gen.interrupt = async () => {};
		return gen;
	});
	assert.equal((await stream.result()).stopReason, "stop");
});

for (const [message, expected] of [
	[{ type: "rate_limit_event", rate_limit_info: { status: "rejected", overageStatus: "rejected" } }, /rate limit/],
	[{ type: "system", subtype: "permission_denied", tool_name: name, tool_use_id: ids[0] }, /denied.*bash/],
	[{ type: "assistant", message: { id: "msg_error", model: "<synthetic>", content: [{ type: "text", text: "API Error: overloaded" }] } }, /overloaded/],
	[{ ...fallback[1], aborted: true }, /aborted/],
]) it(`suppresses fallback tools after ${message.subtype ?? message.type} reports failure`, async () => {
	const { done, events } = run([fallback[0], message, fallback[1]]);
	assert.match((await done).failure?.message, expected);
	assert.deepEqual(events.map((event) => event.type), ["error", "end"]);
});

for (const trigger of ["MCP protocol", "MCP send", "MCP disconnect", "prompt pump"]) it(`a parked fallback fails after ${trigger} failure`, { timeout: 4000 }, async (t) => {
	const gate = Promise.withResolvers();
	const staged = Promise.withResolvers();
	let fail;
	const stream = startProvider(t, ({ prompt, options }) => {
		const gen = (async function* () {
			if (trigger === "prompt pump") {
				await prompt.next();
				fail = () => prompt.return(); // drops the in-flight input acknowledgment
			} else {
				const instance = options.mcpServers["custom-tools"].instance;
				const server = instance.server;
				if (trigger.startsWith("MCP send")) {
					const transport = { start: async () => {}, close: async () => {}, send: async () => { throw new Error("test MCP send failed"); } };
					await instance.connect(transport);
					fail = () => transport.onmessage({ jsonrpc: "2.0", id: 7, method: "tools/list" });
				} else fail = trigger === "MCP protocol" ? () => server.onerror?.(new Error("test MCP protocol error")) : () => server.onclose?.();
			}
			yield fallback[0];
			yield rateLimit;
			await gate.promise;
		})();
		gen.close = gate.resolve;
		gen.interrupt = async () => {};
		return gen;
	}, staged.resolve);
	await staged.promise;
	await fail();
	const output = await stream.result();
	assert.equal(output.stopReason, "error");
	assert.match(output.errorMessage, /test MCP protocol error|test MCP send failed|MCP server disconnected|prompt stream closed/);
});

for (const scenario of ["stdout error", "stderr error", "unexpected stdin close", "stdout EOF before failure", "stdout EOF before clean exit", "clean EOF after narration", "stdout EOF after narration with live child", "abnormal exit"]) it(`SDK transport: ${scenario}`, { timeout: 8000 }, async (t) => {
	const liveNarrationEOF = scenario === "stdout EOF after narration with live child";
	if (liveNarrationEOF) t.mock.timers.enable({ apis: ["setTimeout"] });
	let child;
	let exited = false;
	const staged = Promise.withResolvers();
	// Run the pinned SDK over the production spawn hook and local Node pipes.
	const fragment = scenario === "clean EOF after narration" || liveNarrationEOF ? narration : fallback[0];
	const stream = startProvider(t, ({ prompt, options }) => {
		const spawn = options.spawnClaudeCodeProcess;
		const newline = String.fromCharCode(10);
		const jsonl = [fragment, rateLimit].map((frame) => JSON.stringify({ ...frame, session_id: options.sessionId }) + newline).join("");
		return query({ prompt, options: {
			...options, hooks: undefined, mcpServers: undefined,
			pathToClaudeCodeExecutable: process.execPath,
			spawnClaudeCodeProcess: (spawnOptions) => {
				const script = `process.stdin.once('data', () => {
					process.stdout.write(${JSON.stringify(jsonl)});
					process.stdin.once('data', () => process.exit(${scenario === "abnormal exit" ? 23 : 0}));
				}); process.stdin.resume(); setInterval(() => {}, 1000);`;
				child = spawnReplay(t, spawn, spawnOptions, script);
				child.once("close", () => { exited = true; });
				return child;
			},
		} });
	}, staged.resolve);
	await staged.promise;
	let finished = false;
	const events = Array.fromAsync(stream);
	const result = stream.result().then((output) => { finished = true; return output; });
	if (scenario === "stdout error") {
		child.stdio[1].destroy(new Error("test SDK stdout failed"));
		await setTimeout(175);
		assert.equal(finished, true, "error must be visible without waiting for child exit");
		child.kill();
	} else if (scenario === "stderr error") {
		// An error event with no listener throws. The bridge must own this pipe's failure.
		child.stderr.emit("error", new Error("test SDK stderr failed"));
	} else if (scenario === "unexpected stdin close") {
		child.stdin.destroy();
	} else if (scenario === "abnormal exit" || scenario === "clean EOF after narration") {
		child.stdin.write("finish\n");
	} else if (liveNarrationEOF) {
		const c = [...__test.activeQueryContexts].findLast((candidate) => candidate.pendingFallback?.messageId === narration.message.id);
		assert.ok(c);
		child.stdio[1].emit("end");
		assert.equal(c.outputEnded, true);
		assert.equal(exited, false, "raw EOF must not require child exit");
		t.mock.timers.tick(120_000);
		await setImmediate();
		assert.equal(finished, true, "the deadline must end the staged turn even with a live child");
	} else {
		child.stdio[1].emit("end"); // clean EOF is not evidence the process succeeded
		await setTimeout(175);
		assert.equal(exited, false);
		assert.equal(finished, false);
		if (scenario === "stdout EOF before clean exit") child.stdin.write("finish\n");
		else child.kill();
	}
	const output = await result;
	if (scenario === "stdout EOF before clean exit" || scenario === "clean EOF after narration" || liveNarrationEOF) {
		assert.equal(output.stopReason, "error");
		assert.match(output.errorMessage, fragment === narration ? /ended.*fallback.*result/i : /ended before the fallback completion fence/);
		assert.deepEqual((await events).map((event) => event.type), ["error"]);
		assert.deepEqual(output.content, []);
	} else {
		assert.equal(output.stopReason, "error");
		const diagnostic = scenario === "stderr error" ? /test SDK stderr failed/
			: scenario === "unexpected stdin close" ? /stdin closed unexpectedly/
			: scenario === "abnormal exit" ? /exited with code 23/ : /test SDK stdout failed|Claude Code process/;
		assert.match(output.errorMessage, diagnostic);
	}
});

it("clean iterator EOF still completes an ordinary streaming text turn without a result", { timeout: 4000 }, async (t) => {
	const stream = startProvider(t, () => {
		const gen = (async function* () {
			yield streamEvent({ type: "message_start", message: { id: "msg_stream" } });
			yield streamEvent({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
			yield streamEvent({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "complete text" } });
			yield streamEvent({ type: "content_block_stop", index: 0 });
			yield streamEvent({ type: "message_stop" });
		})();
		gen.close = () => {};
		gen.interrupt = async () => {};
		return gen;
	});
	const events = await Array.fromAsync(stream);
	assert.deepEqual(events.filter((event) => event.type === "error" || event.type === "done").map((event) => event.type), ["done"]);
	const output = await stream.result();
	assert.equal(output.stopReason, "stop");
	assert.deepEqual(output.content, [{ type: "text", text: "complete text" }]);
});

it("does not emit a parked fallback after abort", async () => {
	const abort = new AbortController();
	const gate = Promise.withResolvers();
	async function* parked() { yield* fallback; await gate.promise; }
	const { done, events, c } = run(parked(), { wasAborted: () => abort.signal.aborted });
	try {
		await setImmediate();
		abort.abort();
		__test.drainForAbort(c, { fail() {} });
		await setTimeout(150);
		assert.equal(events.find((event) => event.type === "done"), undefined);
	} finally {
		gate.resolve();
		await done;
	}
});

it("still ends normal streaming tool calls at message_stop, before any assistant echo", async () => {
	async function* streaming() {
		yield streamEvent({ type: "message_start", message: { id: "msg_stream" } });
		yield streamEvent({ type: "content_block_start", index: 0, content_block: toolUse(ids[0]) });
		yield streamEvent({ type: "content_block_stop", index: 0 });
		assert.equal(events.find((event) => event.type === "done"), undefined);
		yield streamEvent({ type: "message_stop" });
		assertToolTurn(events, ids.slice(0, 1));
		yield block(ids[0], toolUse(ids[0]), "msg_stream");
	}
	const { done, events } = run(streaming());
	await done;
	assertToolTurn(events, ids.slice(0, 1));
});

it("fails precommit recording preparation without exposing staged blocks", async () => {
	await assertWhileParked(fallback, ids, {
		beforeFence(c) { c.recording.assistant = () => { throw new Error("precommit recording unavailable"); }; },
		expectedError: /precommit recording unavailable/,
	});
});

it("a staged served id rejected by CC after handler entry never publishes", async () => {
	await assertWhileParked(fallback, ids, {
		afterDispatch: { type: "user", parent_tool_use_id: null, message: { content: [
			{ type: "tool_result", tool_use_id: ids[0], is_error: true, content: "CC denied after dispatch" },
		] } }, expectedError: /CC denied after dispatch/,
	});
});

const mcpRequest = (id, method, params, requestId = `ctrl-${id}`) => ({
	type: "control_request", request_id: requestId,
	request: { subtype: "mcp_message", server_name: "custom-tools", message: { jsonrpc: "2.0", ...(id === null ? {} : { id }), method, params } },
});
const call = (id, toolId, name = "bash", args = {}) => mcpRequest(id, "tools/call", { name, arguments: args, _meta: { "claudecode/toolUseId": toolId } });
const hostIdle = { type: "system", subtype: "session_state_changed", state: "idle", sdk_host_only: true };
const replacementFence = [block("replacement", toolUse(replacementId), "msg_replacement"), call(3, replacementId)];
const cancelFirstCall = mcpRequest(null, "notifications/cancelled", { requestId: 1, reason: "stop this call" });
const reuseFirstCallId = (toolId) => ({ ...call(1, toolId), request_id: "ctrl-reuses-1" });
const lateText = block("late_text", { type: "text", text: "late" });
const missingToolUseId = mcpRequest(8, "tools/call", { name: "bash", arguments: {} });
const unsolicitedResponse = { ...mcpRequest(null, "", {}), request: {
	subtype: "mcp_message", server_name: "custom-tools", message: { jsonrpc: "2.0", id: 8, result: {} },
} };
const malformedMcp = mcpRequest(null, "tools/list", "invalid params");
const malformedControlResponse = { type: "control_response", response: null };
const orphanControlResponse = { type: "control_response", response: { subtype: "success", request_id: "never-sent", response: {} } };
const userReplay = { type: "user", uuid: "never-sent-user", parent_tool_use_id: null, isReplay: true, message: { role: "user", content: "queued steer" } };
const malformedResult = { type: "result", subtype: "error_during_execution", is_error: true, errors: null };
const malformedUncorrelatedCall = mcpRequest(8, "tools/call", { name: "bash", arguments: "not an object" });
for (const [label, fault] of [["missing metadata", missingToolUseId], ["malformed message", malformedMcp]]) {
	it(`parked ordinary query survives MCP ${label} and can answer a valid call`, { timeout: 6000 }, async (t) => {
		let child, ctx;
		const delivered = Promise.withResolvers();
		const stream = startProvider(t, ({ prompt, options }) => {
			const script = `
				const send = (...frames) => process.stdout.write(frames.map(f => JSON.stringify(f) + "\\n").join(""));
				require("node:readline").createInterface({ input: process.stdin }).on("line", line => {
					const frame = JSON.parse(line);
					if (frame.type === "user") send(...${JSON.stringify(replacementStream)});
					else if (frame.testFault) send(...${JSON.stringify(fault === missingToolUseId ? [fault] : [fault, call(9, replacementId)])});
					else if (frame.response?.request_id === "ctrl-8" && line.includes("claudecode/toolUseId")) send(${JSON.stringify(call(9, replacementId))});
					else if (frame.response?.request_id === "ctrl-9" && line.includes("valid MCP result")) send({type:"result", subtype:"success", is_error:false, result:"finished"});
				});`;
			return query({ prompt, options: { ...options, hooks: undefined, pathToClaudeCodeExecutable: process.execPath,
				spawnClaudeCodeProcess(spawnOptions) {
					child = spawnReplay(t, options.spawnClaudeCodeProcess, spawnOptions, script);
					ctx = [...__test.activeQueryContexts].findLast((c) => c.queryProcess);
					const set = ctx.pendingToolCalls.set.bind(ctx.pendingToolCalls);
					t.mock.method(ctx.pendingToolCalls, "set", (id, handler) => {
						const result = set(id, handler);
						if (id === replacementId) delivered.resolve(handler);
						return result;
					});
					return child;
				},
			} });
		});
		assertToolTurn([...(await Array.fromAsync(stream)), { type: "end" }], [replacementId]);
		assert.equal(ctx.currentPiStream, null);
		child.stdin.write('{"testFault":true}\n');
		const handler = await Promise.race([delivered.promise, once(child, "close").then(() => null)]);
		assert.equal(ctx.observedFailure, undefined, "a parked query must not fail from MCP-layer traffic");
		assert.ok(handler, "the subsequent valid tool call must dispatch");
		const closed = once(child, "close");
		handler.resolve({ content: [{ type: "text", text: "valid MCP result" }] });
		await closed;
		assert.equal(ctx.sawResult, true, "the MCP reply let Claude finish");
	});
}
const misroutedCall = (toolId) => {
	const frame = call(9, toolId);
	frame.request.server_name = "not-registered";
	return frame;
};

const permissionDenied = (toolId) => ({ type: "system", subtype: "permission_denied", tool_name: name, tool_use_id: toolId });
const rejectedToolResult = (toolId) => ({
	type: "user", parent_tool_use_id: null,
	message: { content: [{ type: "tool_result", tool_use_id: toolId, is_error: true, content: "CC denied before assistant" }] },
});

for (const [label, framesAfterAssistant, expectedError, expectedIds = ids, initialFence = true, beforeAssistant = [], assistant = fallback, expectedArguments] of [
	...[
		["a regular __unparsedToolInput field", { __unparsedToolInput: false, value: 1 }],
		["a sole non-marker field", { __unparsedToolInput: false }],
		["a marker-shaped field alongside another field", { ...unparsedToolInput, value: 1 }],
		["a marker-like field with nonnumeric len", { __unparsedToolInput: { raw: "value", len: "5" } }],
		["a marker-like field with nonstring raw", { __unparsedToolInput: { raw: 1, len: 1 } }],
	].map(([label, input]) => [
		`round 20 publishes ${label}`, [], null, ids.slice(0, 2), true, [],
		[fallback[0], block(ids[1], { ...toolUse(ids[1]), input })], input,
	]),
	...[
		["CLI parse-failure marker", unparsedToolInput],
		["CLI parse-failure marker with extra inner data", { __unparsedToolInput: { ...unparsedToolInput.__unparsedToolInput, extra: true } }],
		["string", "malformed-args"], ["array", []], ["null", null], ["number", 42], ["boolean", false], ["missing input", undefined],
	].map(([label, input]) => [
		`rejects ${label} in a fallback tool block`, [], /(?:unparsed|non-object).*toolu_b/i, ids.slice(0, 2), true, [],
		[fallback[0], block(ids[1], { ...toolUse(ids[1]), input })],
	]),
	...[
		["numeric ID", { id: 123 }, /invalid fallback tool id/i],
		["missing ID", { id: undefined }, /invalid fallback tool id/i],
		["empty ID", { id: "" }, /invalid fallback tool id/i],
		["missing name", { name: undefined }, /invalid fallback tool name/i],
		["non-string name", { name: 42 }, /invalid fallback tool name/i],
		["duplicate ID", { id: ids[0] }, /duplicate fallback tool id/i],
	].map(([label, toolFields, error]) => [
		`round 19 rejects a fallback tool block with ${label}`, [], error, ids.slice(0, 2), true, [],
		[fallback[0], block(ids[1], { ...toolUse(ids[1]), ...toolFields })],
	]),
	...[false, true].map((unknownFirst) => {
		const unknown = block(ids[1], { ...toolUse(ids[1]), name: "mcp__custom-tools__missing" });
		return [`round 19 rejects an unknown tool ${unknownFirst ? "before" : "after"} a served tool block`, [], /unserved.*missing/i,
			[ids[0]], true, [], unknownFirst ? [unknown, fallback[0]] : [fallback[0], unknown]];
	}),
	["round 7 E1: old dispatch cannot mask replacement rejection", [
		call(2, ids[1]), apiRetry, rejectedToolResult(ids[1]), block(ids[1], toolUse(ids[1]), "msg_replacement"), call(3, ids[1]),
	], /before its assistant frame|CC denied before assistant/, [ids[1]], false, [], [fallback[0]]],
	["round 8 R: terminal refusal on fallback assistant frames", [], /refus/i, ids, true, [], [lateText, ...fallback].map(refusalFrame)],
	["round 8 audit: context exhaustion cannot hand off a fallback tool batch", [], /context window/i, ids, true, [],
		fallback.map((frame) => ({ ...frame, message: { ...frame.message, stop_reason: "model_context_window_exceeded" } }))],
	["round 8 audit: a typed assistant error latches even on a narration fragment", [], /billing_error/i, ids, true, [], [{ ...lateText, error: "billing_error", message: { ...lateText.message, content: [{ type: "text", text: "" }] } }, ...fallback]],
	["round 8 Q: hard quota denial after the raw fence", [hardQuotaDenial], /rate limit/i],
	["round 8 Q: hard quota denial before silent fallback", [], /rate limit/i, ids, true, [deadStream[0], hardQuotaDenial]],
	["round 8 Q: overage billing alone does not make plan rejection informational", [
		{ type: "rate_limit_event", rate_limit_info: { status: "rejected", overageInUse: true } },
	], /rate limit/i],
	["unlisted SDK frame fails closed", [{ type: "arbitrary_sdk_frame" }], /arbitrary_sdk_frame/],
	["unlisted SDK frame cannot masquerade as an inert adapter fact", [{ type: "arbitrary_sdk_frame", kind: "keep_alive" }], /arbitrary_sdk_frame/],
	["orphan success control response before staging vetoes the batch", [], /uncorrelatable control_response.*never-sent/, ids, true, [orphanControlResponse]],
	["malformed host-only session state before staging vetoes the batch", [], /malformed.*session_state_changed/, ids, true, [{ ...hostIdle, state: "not-a-state" }]],
	["malformed transcript mirror before staging vetoes the batch", [], /malformed.*transcript_mirror/, ids, true, [{ type: "transcript_mirror", entries: [] }]],
	["unrecognized SDK category before staging vetoes the batch", [], /unlisted.*arbitrary_sdk_frame/, ids, true, [{ type: "arbitrary_sdk_frame" }]],
	["malformed api_retry cannot open a new attempt", [], /malformed.*api_retry/, ids, true, [{ type: "system", subtype: "api_retry" }]],
	["orphan side-question progress before staging vetoes the batch", [], /uncorrelatable.*control_request_progress/, ids, true, [sideRetry]],
	["orphan user replay before staging vetoes the batch", [], /uncorrelatable user replay/, ids, true, [userReplay]],
	["malformed subagent retry cannot masquerade as progress", [], /malformed SDK tool_progress/, ids, true, [{ ...subagentRetry, subagent_retry: {} }]],
	["malformed command lifecycle before staging vetoes the batch", [], /malformed command_lifecycle/, ids, true, [{ type: "command_lifecycle", state: "started" }]],
	["no-id schema failure before any staged frame vetoes the batch", [], /Invalid.*tools\/call/i, ids, true, [malformedUncorrelatedCall]],
	["no-id schema failure in AwaitReplacement vetoes the batch", [apiRetry, malformedUncorrelatedCall, ...replacementFence], /Invalid.*tools\/call/i, [replacementId], false],
	["no-id schema failure survives silent fallback from a stream", [], /Invalid.*tools\/call/i, ids, true, [malformedUncorrelatedCall, deadStream[0]]],
	...[ // Each inert entry runs through the installed SDK, after the raw fence.
		["keep-alive", { type: "keep_alive" }],
		["blank wire delimiter", ""],
		["informational rate limit", rateLimit],
		["informational rate-limit warning", { type: "rate_limit_event", rate_limit_info: { status: "allowed_warning" } }],
		["informational overage", { type: "rate_limit_event", rate_limit_info: { status: "rejected", isUsingOverage: true } }],


		["subagent API retry", subagentRetry],
		["local refusal retry", { ...refusalRetry, scope: "local" }],
	].map(([label, frame]) => [`inert ${label} leaves the batch intact after the fence`, [frame], null]),
	...[
		["permission_denied", permissionDenied, /denied.*bash/],
		["unknown name", (id) => call(2, id, "unknown"), /Unknown tool: unknown/],
		["unregistered route", misroutedCall, /SDK MCP server not found: not-registered/],
		["invalid schema", (id) => call(2, id, "bash", "not an object"), /Invalid.*tools\/call/i],
		["rejected tool_result", rejectedToolResult, /CC denied before assistant/],
	].flatMap(([label, reject, error]) => [
		[`${label} before the second tool is staged`, [reject(ids[1]), fallback[1], call(1, ids[0])], error, ids.slice(0, 2), false, [], [fallback[0]]],
		[`${label} for a never-staged id vetoes publication`, [reject(ids[1]), call(1, ids[0])], error, [ids[0]], false, [], [fallback[0]]],
		...(label === "permission_denied" || label === "rejected tool_result"
			? [[`${label} for a retired id is inert while awaiting replacement`, [apiRetry, reject(ids[0]), fallback[1], ...replacementFence], null, [replacementId], false, [], [fallback[0]]]]
			: [[`${label} for a retired id vetoes publication if its SDK reply arrives after replacement staging`,
				[apiRetry, reject(ids[0]), fallback[1], ...replacementFence], /SDK control reply/, [replacementId], false, [], [fallback[0]]]]),
		[`${label} for a retired id is rejected after replacement stages`, [apiRetry, ...replacementFence, reject(ids[0])], error, [replacementId], false, [], [fallback[0]]],
	]),
	["denial before the first assistant frame", [call(1, ids[0])], /denied.*bash/, [ids[0]], false, [permissionDenied(ids[0])], [fallback[0]]],
	["a denial after a served tool wins even before a later retry", [permissionDenied(replacementId), apiRetry, ...replacementFence], /denied.*bash/, [replacementId], false, [], [fallback[0]]],
	["retry clears a provisional rejection in the old narration-only attempt", [permissionDenied(replacementId), apiRetry, ...replacementFence], null, [replacementId], false, [], [lateText]],
	["a dispatch for a non-staged id wins even before a later retry", [
		call(2, replacementId), apiRetry, ...replacementFence,
	], /before its assistant frame/, [replacementId], false, [], [fallback[0]]],
	["a cancelled pre-staging dispatch cannot disappear when its nested id is reused", [
		call(2, ids[1]), { type: "control_cancel_request", request_id: "ctrl-2" },
		{ ...call(2, "unrelated"), request_id: "ctrl-reuses-2" }, fallback[1], call(1, ids[0]),
	], /cancelled|before its assistant frame/, ids.slice(0, 2), false, [], [fallback[0]]],
	["host-only idle before retry defeats the replacement fence", [hostIdle, apiRetry, ...replacementFence], /became idle before the fallback completion fence/, ids, false],
	["host-only idle while awaiting replacement defeats the replacement fence", [apiRetry, hostIdle, ...replacementFence], /became idle before a replacement response after retry/, ids, false],
	["host-only idle precedes MCP cancellation", [hostIdle, cancelFirstCall], /became idle|stop this call/],
	["MCP cancellation precedes host-only idle", [cancelFirstCall, hostIdle], /became idle|stop this call/],
	["missing MCP tool-use metadata after the fence", [missingToolUseId], /missing _meta/],
	["malformed MCP message after the fence", [malformedMcp], /Unknown message type/],
	["missing MCP tool-use metadata precedes idle", [missingToolUseId, hostIdle], /became idle|missing _meta/],
	["idle precedes missing MCP tool-use metadata", [hostIdle, missingToolUseId], /became idle|missing _meta/],
	["unsolicited MCP response precedes idle", [unsolicitedResponse, hostIdle], /became idle|unknown message ID/],
	["idle precedes unsolicited MCP response", [hostIdle, unsolicitedResponse], /became idle|unknown message ID/],
	["malformed MCP frame precedes idle", [malformedMcp, hostIdle], /became idle|Unknown message type/],
	["idle precedes malformed MCP frame", [hostIdle, malformedMcp], /became idle|Unknown message type/],
	["malformed SDK control response precedes idle", [malformedControlResponse, hostIdle], /became idle|malformed control_response/],
	["idle precedes malformed SDK control response", [hostIdle, malformedControlResponse], /became idle|malformed control_response/],
	["host-only idle before the batch is unrelated", [], null, ids, true, [hostIdle]],
	["SDK error on the far side", [{ type: "result", subtype: "success", is_error: true, result: "queued SDK error" }], /queued SDK error/],
	["SDK error on the near side", [], /queued SDK error/],
	["unknown-name rejection", [call(2, ids[1], "unknown")], /Unknown tool: unknown/],
	["SDK schema rejection", [call(2, ids[1], "bash", "not an object")], /Invalid.*tools\/call/i],
	["uncorrelatable schema rejection before the fence", [malformedUncorrelatedCall, call(1, ids[0])], /Invalid.*tools\/call/i, ids, false],
	["uncorrelatable schema rejection after the fence", [malformedUncorrelatedCall], /Invalid.*tools\/call/i],
	["uncorrelatable schema rejection after idle", [hostIdle, malformedUncorrelatedCall], /became idle|Invalid.*tools\/call/i],
	["routing rejection before the fence for a staged id", [misroutedCall(ids[1]), call(1, ids[0])], /SDK MCP server not found: not-registered/, ids, false],
	["routing rejection after the fence for a staged id", [misroutedCall(ids[1])], /SDK MCP server not found: not-registered/],
	["routing rejection for an unrelated id vetoes publication", [misroutedCall("unrelated")], /SDK MCP server not found: not-registered/],
	["routing rejection for a retired id vetoes staged replacement", [apiRetry, ...replacementFence, misroutedCall(ids[1])], /SDK MCP server not found: not-registered/, [replacementId], false],
	["malformed schema for an unrelated id vetoes publication", [call(2, "unrelated", "bash", "not an object")], /Invalid.*tools\/call/i],
	["malformed schema for a retired id vetoes staged replacement", [apiRetry, ...replacementFence, call(2, ids[1], "bash", "not an object")], /Invalid.*tools\/call/i, [replacementId], false],
	["inverted dispatch cannot be replaced by a later fence", [call(2, ids[1]), fallback[1], call(1, ids[0])], /dispatched.*toolu_b.*before its assistant frame/, ids, false, [], [fallback[0]]],
	["inverted dispatch precedes a later idle", [call(2, ids[1]), fallback[1], hostIdle, call(1, ids[0])], /became idle|dispatched.*toolu_b.*before its assistant frame/, ids, false, [], [fallback[0]]],
	["earliest valid dispatch is the fence even if another dispatch follows late text", [call(2, ids[1]), lateText, call(1, ids[0])], /blocks after the completion fence/, ids, false, [], fallback.slice(0, 2)],
	["dispatch order may differ from assistant order when only one request fences", [call(2, ids[1])], null, ids.slice(0, 2), false, [], fallback.slice(0, 2)],
	["a second dispatch after the fence is outside the allowlist", [call(2, ids[1]), call(1, ids[0])], /second MCP tools\/call/, ids.slice(0, 2), false, [], fallback.slice(0, 2)],
	["SDK permission_denied for a staged id", [{ type: "system", subtype: "permission_denied", tool_name: name, tool_use_id: ids[0] }], /denied.*bash/],
	["JSON-RPC cancellation", [cancelFirstCall], /stop this call/],
	["distinct nested ids preserve cancellation despite later dispatches", [call(2, ids[1]), cancelFirstCall, call(3, ids[2])], /stop this call|second MCP tools\/call/],
	["nested id reuse cannot hide cancellation", [reuseFirstCallId(ids[1]), cancelFirstCall, call(2, ids[2])], /reused MCP request id 1|stop this call/],
	["nested id reuse alone fails a staged dispatch even if the new call is unrelated", [reuseFirstCallId("unrelated"), call(2, ids[1])], /reused MCP request id 1/],
	["a staged dispatch cannot take an unrelated in-flight nested id", [call(1, "unrelated"), reuseFirstCallId(ids[0]), call(2, ids[1])], /reused MCP request id 1|before its assistant frame/, ids, false],
	["nested id reuse cannot move the first fence past a late fragment", [lateText, reuseFirstCallId(ids[1]), call(2, ids[2])], /reused MCP request id 1|blocks after the completion fence/],
	["nested id reuse before a staged id's assistant frame cannot hide its inverted dispatch", [call(1, ids[1]), reuseFirstCallId("unrelated"), fallback[1], call(2, ids[0])], /reused MCP request id 1|before its assistant frame/, ids.slice(0, 2), false, [], [fallback[0]]],
	["unrelated calls and nested id reuse block the batch", [call(8, "unrelated-a"), { ...call(8, "unrelated-b"), request_id: "ctrl-reuses-8" }], /before its assistant frame|reused MCP request id 8/],
	["control cancellation", [{ type: "control_cancel_request", request_id: "ctrl-1" }], /cancelled/i],
	["control cancellation still targets the in-flight owner after a duplicate outer id", [
		{ ...call(2, "unrelated"), request_id: "ctrl-1" }, { type: "control_cancel_request", request_id: "ctrl-1" },
	], /MCP call toolu_a cancelled|reused control request id/i],
	["unrelated unserved rejection vetoes publication", [call(2, "unserved", "unknown")], /Unknown tool: unknown/],
	["ambiguous api_retry invalidates the earlier fence", [apiRetry,
		block("replacement", toolUse(replacementId), "msg_replacement"), call(2, replacementId)], null, [replacementId]],
	...[
		["a stale cancellation in AwaitReplacement is inert but the SDK reply after replacement staging vetoes publication", "after", "cancel", /SDK control reply/],
		["cancellation before api_retry still fails", "before", "cancel", /retired call cancelled/],
		["a stale call in AwaitReplacement is inert but the SDK reply after replacement staging vetoes publication", "after", "valid", /SDK control reply/],
		["a stale rejection in AwaitReplacement is inert but the SDK reply after replacement staging vetoes publication", "after", "reject", /SDK control reply/],
		["raw rejection before api_retry still fails", "before", "reject", /Unknown tool: unknown/],
	].map(([label, order, disposition, error]) => {
		const stale = [call(2, ids[1], disposition === "reject" ? "unknown" : "bash")];
		if (disposition === "cancel") stale.push(mcpRequest(null, "notifications/cancelled", { requestId: 2, reason: "retired call cancelled" }));
		const attempt = order === "after" ? [apiRetry, ...stale] : [...stale, apiRetry];
		return [label, [...attempt, block("replacement", toolUse(replacementId), "msg_replacement"), call(3, replacementId)],
			error, [replacementId], false];
	}),
]) it(`ordered fallback: ${label} in the fence chunk`, { timeout: 6000 }, async (t) => {
	const stream = startProvider(t, ({ prompt, options }) => {
		const spawn = options.spawnClaudeCodeProcess;
		const frames = [{ type: "system", subtype: "init", session_id: options.sessionId, claude_code_version: "2.1.321" },
			...beforeAssistant, ...assistant,
			...(label === "SDK error on the near side" ? [{ type: "result", subtype: "success", is_error: true, result: "queued SDK error" }] : []),
			...(initialFence ? [call(1, ids[0])] : []), ...framesAfterAssistant];
		return query({ prompt, options: { ...options, hooks: undefined,
			pathToClaudeCodeExecutable: process.execPath,
			spawnClaudeCodeProcess(spawnOptions) {
				const jsonl = frames.map((frame) => (frame === "" ? "" : JSON.stringify(frame)) + "\n").join("");
				const script = `process.stdin.once('data', () => process.stdout.write(${JSON.stringify(jsonl)})); process.stdin.resume(); setInterval(() => {}, 1000);`;
				const child = spawnReplay(t, spawn, spawnOptions, script);
				// This replay exercises the production transport/gate, substituting only the already-probed executor identity.
				const ctx = [...__test.activeQueryContexts].findLast((c) => c.queryProcess);
				ctx.qualifiedFallbackRuntime = true;
				return child;
			},
		} });
	});
	const events = [];
	for await (const event of stream) events.push(event);
	if (expectedError) assertFailedFallback(events, expectedError);
	else {
		assertToolTurn([...events, { type: "end" }], expectedIds);
		if (expectedArguments) {
			assert.deepEqual(events.find((e) => e.type === "toolcall_end" && e.toolCall.id === ids[1])?.toolCall.arguments, expectedArguments);
		}
	}
});

const warning = { type: "rate_limit_event", rate_limit_info: { status: "allowed_warning" } };
const replacementText = "Replacement completed without tools";
const textReplacement = [
	block("replacement_text", { type: "text", text: replacementText }, "msg_replacement"),
	{ type: "result", subtype: "success", is_error: false, result: replacementText },
];
for (const [label, payload, prefix, error] of [
	["ordinary streaming after an orphan reply", [...replacementStream, textReplacement[1]], "orphan"],
	["ordinary streaming with an unparsed input echo", [...replacementStream.slice(0, 2), unparsedStreamingEcho, ...replacementStream.slice(2), textReplacement[1]]],
	["text-only completion after an orphan reply", textReplacement, "orphan"],
	["fallback after a duplicate reply to initialization", [...fallback, call(1, ids[0])], "duplicate", /uncorrelatable control_response/],
	["fallback after a single correlated reply to initialization", [...fallback, call(1, ids[0])]],
	["fallback with live side-question progress after the fence", [...fallback, call(1, ids[0])], "side"],
	["fallback with a correlated Pi prompt replay after the fence", [...fallback, call(1, ids[0])], "replay"],
]) it(`installed SDK control response: ${label}`, { timeout: 6000 }, async (t) => {
	const stream = startProvider(t, ({ prompt, options }) => {
		const sdk = query({ prompt, options: { ...options, hooks: undefined,
			pathToClaudeCodeExecutable: process.execPath,
			spawnClaudeCodeProcess(spawnOptions) {
				const init = { type: "system", subtype: "init", session_id: options.sessionId, claude_code_version: "2.1.321" };
				const script = `
					const send = (...frames) => process.stdout.write(frames.map((f) => JSON.stringify(f)).join("\\n") + "\\n");
					require("node:readline").createInterface({ input: process.stdin }).on("line", line => {
						const frame = JSON.parse(line);
						const payload = ${JSON.stringify(payload)};
						if (frame.request?.subtype === "initialize") {
							const ready = { type: "control_response", response: { subtype: "success", request_id: frame.request_id, response: {} } };
							const prefix = ${JSON.stringify(prefix ?? null)};
							const extra = prefix === "duplicate" ? [ready] : prefix === "orphan" ? [${JSON.stringify(orphanControlResponse)}] : [];
							send(ready, ${JSON.stringify(init)}, ...extra, ...(prefix === "side" || prefix === "replay" ? [] : payload));
						} else if (frame.request?.subtype === "side_question") {
							send(...payload, { ...${JSON.stringify(sideRetry)}, request_id: frame.request_id });
						} else if (${prefix === "replay"} && frame.type === "user") {
							send(...payload, { ...${JSON.stringify(userReplay)}, uuid: frame.uuid });
						}
					});`;
				const child = spawnReplay(t, options.spawnClaudeCodeProcess, spawnOptions, script);
				[...__test.activeQueryContexts].findLast((c) => c.queryProcess).qualifiedFallbackRuntime = true;
				return child;
			},
		} });
		// The pinned SDK has no public side-question API. Exercise its actual
		// outbound request write only in the replay; production never calls it.
		if (prefix === "side") void sdk.request({ subtype: "side_question" }).catch(() => {});
		return sdk;
	});
	const events = await Array.fromAsync(stream);
	if (error) assertFailedFallback(events, error);
	else if (payload === textReplacement) assert.equal(events.find((e) => e.type === "done")?.reason, "stop", JSON.stringify(events));
	else {
		assertToolTurn([...events, { type: "end" }], payload[0] === replacementStream[0] ? [replacementId] : ids);
		if (payload.includes(unparsedStreamingEcho)) {
			assert.deepEqual(events.find((event) => event.type === "toolcall_end").toolCall.arguments, unparsedToolInput);
		}
	}
});

const hookRejection = "replacement replay onResponse rejected";

for (const [label, prefixFrames, suffix, { textOnly, queued, streaming } = {}] of [
	["before the first raw fallback frame vetoes a later valid fence", [], replacementFence],
	["during AwaitReplacement allows a confirmed text-only reply", [fallback[0], apiRetry], textReplacement, { textOnly: true }],
	["during AwaitReplacement vetoes the replacement when a tool stages", [fallback[0], apiRetry], replacementFence.slice(0, 1)],
	["after queued retry and parked replacement fence vetoes replacement tools", [lateText], [apiRetry, ...replacementFence], { queued: true }],
	["after queued retry leaves the text-only replacement unaffected", [fallback[0]], [apiRetry, ...textReplacement], { queued: true, textOnly: true }],
	["during AwaitReplacement leaves ordinary streaming completion unchanged", [fallback[0], apiRetry], replacementStream, { streaming: true }],
]) it(`genuine MCP disconnect ${label}`, { timeout: 6000 }, async (t) => {
	const entered = Promise.withResolvers();
	const resume = Promise.withResolvers();
	const parked = Promise.withResolvers();
	let instance, child, ctx;
	const stream = startProvider(t, ({ prompt, options }) => {
		instance = options.mcpServers["custom-tools"].instance;
		const prefix = [{ type: "system", subtype: "init", session_id: options.sessionId, claude_code_version: "2.1.321" },
			...prefixFrames, warning];
		const script = `
			const send = (...frames) => process.stdout.write(frames.map(f => JSON.stringify(f) + "\\n").join(""));
			require("node:readline").createInterface({ input: process.stdin }).on("line", line => {
				const frame = JSON.parse(line);
				if (frame.request?.subtype === "initialize") {
					send({type:"control_response", response:{subtype:"success", request_id:frame.request_id, response:{}}}, ...${JSON.stringify(prefix)});
				} else if (frame.testFinish) send(...${JSON.stringify(suffix)});
			});`;
		return query({ prompt, options: { ...options, hooks: undefined, pathToClaudeCodeExecutable: process.execPath,
			spawnClaudeCodeProcess(spawnOptions) {
				child = spawnReplay(t, options.spawnClaudeCodeProcess, spawnOptions, script);
				ctx = [...__test.activeQueryContexts].findLast((c) => c.queryProcess);
				ctx.qualifiedFallbackRuntime = true;
				if (queued && !textOnly) {
					const set = ctx.pendingToolCalls.set.bind(ctx.pendingToolCalls);
					t.mock.method(ctx.pendingToolCalls, "set", (id, handler) => {
						const result = set(id, handler);
						if (id === replacementId) parked.resolve();
						return result;
					});
				}
				return child;
			},
		} });
	}, () => { entered.resolve(); return resume.promise; });
	const events = Array.fromAsync(stream);
	const sendSuffix = () => child.stdin.write('{"testFinish":true}\n');
	try {
		await entered.promise;
		const expectedState = queued ? "Collecting" : prefixFrames.length ? "AwaitReplacement" : undefined;
		assert.equal(ctx.pendingFallback?.state, expectedState);
		assert.deepEqual([...(ctx.pendingFallback?.tools.keys() ?? [])], queued && textOnly ? [ids[0]] : []);
		if (queued) {
			const process = ctx.queryProcess;
			const reducedBeforeRetry = process.reducedWatermark;
			const suffixEnd = process.ingressWatermark + suffix.length;
			// Observe ingress without releasing the held onResponse. For the tool
			// replay also require the actual SDK MCP handler to be parked.
			const ingressed = Promise.withResolvers();
			const checkIngress = () => {
				if (process.ingressWatermark < suffixEnd) return;
				child.stdout.off("data", checkIngress);
				ingressed.resolve();
			};
			child.stdout.on("data", checkIngress);
			sendSuffix();
			await ingressed.promise;
			if (!textOnly) await parked.promise;
			assert.equal(process.reducedWatermark, reducedBeforeRetry, "retry remains unreduced at close");
		}
		if (prefixFrames.length) {
			assert.ok(instance.server.transport, "close a connected MCP Server");
			await instance.server.close();
			assert.equal(instance.server.transport, undefined);
		} else {
			assert.equal(ctx.fallbackWatchdog, undefined, "no fallback evidence has arrived");
			// Deliver the disconnect callback without breaking the transport, so the later fence is valid.
			instance.server.onclose();
		}
		if (!queued) {
			assert.equal(ctx.observedFailure, undefined, "the disconnect is provisional without staged tools");
			sendSuffix();
		}
	} finally { resume.resolve(); }
	const collected = await events;
	if (textOnly) {
		assert.deepEqual(collected.filter(({ type }) => type === "done" || type === "error").map(({ type, reason }) => [type, reason]), [["done", "stop"]]);
		assert.deepEqual(collected.at(-1).message.content, [{ type: "text", text: replacementText }]);
	} else if (streaming) assertToolTurn([...collected, { type: "end" }], [replacementId]);
	else assertFailedFallback(collected, /MCP server disconnected/);
});

for (const outcome of ["still held", "late rejection", "early rejection", "early resolution", "ordinary streaming echo",
	"MCP disconnect before tool reduction", "MCP disconnect before text-only completion"]) it(`raw fallback deadline with an onResponse hook: ${outcome}`, { timeout: 6000 }, async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
	const ordinary = outcome === "ordinary streaming echo";
	const disconnect = outcome.startsWith("MCP disconnect");
	const textOnly = outcome.endsWith("text-only completion");
	const expectedId = ordinary ? replacementId : ids[0];
	const controller = new AbortController();
	const hook = Promise.withResolvers();
	const entered = Promise.withResolvers();
	const parked = Promise.withResolvers();
	let ctx, finishText, disconnectMcp;
	const stream = startProvider(t, ({ prompt, options }) => {
		const server = options.mcpServers["custom-tools"].instance.server;
		disconnectMcp = () => server.onclose();
		const fragments = ordinary ? [...replacementStream, block(replacementId, toolUse(replacementId), "msg_replacement")] : [fallback[0]];
		const frames = [{ type: "system", subtype: "init", session_id: options.sessionId, claude_code_version: "2.1.321" }, warning,
			...(textOnly ? [textReplacement[0]] : [...fragments, call(1, expectedId)])];
		const script = `
			require("node:readline").createInterface({ input: process.stdin }).on("line", line => {
				const frame = JSON.parse(line);
				if (frame.testFinishText) process.stdout.write(JSON.stringify(${JSON.stringify(textReplacement[1])}) + "\\n", () => process.exit(0));
				if (frame.request?.subtype !== "initialize") return;
				const ready = { type: "control_response", response: { subtype: "success", request_id: frame.request_id, response: {} } };
				process.stdout.write([ready, ...${JSON.stringify(frames)}].map(f => JSON.stringify(f) + "\\n").join(""));
			});`;
		return query({ prompt, options: { ...options, hooks: undefined, pathToClaudeCodeExecutable: process.execPath,
			spawnClaudeCodeProcess(spawnOptions) {
				const child = spawnReplay(t, options.spawnClaudeCodeProcess, spawnOptions, script);
				ctx = [...__test.activeQueryContexts].findLast((c) => c.queryProcess);
				finishText = () => child.stdin.write('{"testFinishText":true}\n');
				ctx.qualifiedFallbackRuntime = true;
				const set = ctx.pendingToolCalls.set.bind(ctx.pendingToolCalls);
				t.mock.method(ctx.pendingToolCalls, "set", (id, handler) => {
					const result = set(id, handler);
					if (id === expectedId) parked.resolve();
					return result;
				});
				return child;
			},
		} });
	}, () => { entered.resolve(); return hook.promise; }, controller);
	const events = [];
	const collected = (async () => { for await (const event of stream) events.push(event); })();
	try {
		await entered.promise;
		if (!textOnly) await parked.promise;
		assert.ok(ctx.queryProcess.ingressWatermark > ctx.queryProcess.reducedWatermark);
		assert.equal(ctx.pendingFallback, undefined, "the reducer is still awaiting the hook before the first fragment");
		assert.equal(Boolean(ctx.fallbackWatchdog), !ordinary, "a matched streaming echo never arms the fallback watchdog");
		t.mock.timers.tick(ordinary ? 120_001 : 119_999);
		assert.deepEqual(events, [], "neither raw ingress nor MCP dispatch publishes past the hook");
		if (disconnect) {
			disconnectMcp();
			assert.deepEqual(events, [], "a disconnect is provisional until a served tool stages");
			hook.resolve();
			if (textOnly) finishText();
		} else if (outcome === "early rejection") hook.reject(new Error(hookRejection));
		else if (outcome === "early resolution" || ordinary) hook.resolve();
		else {
			t.mock.timers.tick(2);
			assert.match(ctx.observedFailure?.message ?? "", /fallback watchdog/i, `watchdog not fired at simulated ${Date.now()} ms`);
			await setImmediate();
			assertFailedFallback(events, /fallback watchdog/i);
			if (outcome === "late rejection") hook.reject(new Error(hookRejection));
		}
		await collected;
		await setImmediate();
		if (outcome === "early resolution" || ordinary) assertToolTurn([...events, { type: "end" }], [expectedId]);
		else if (textOnly) {
			assert.deepEqual(events.filter(({ type }) => type === "done" || type === "error").map(({ type, reason }) => [type, reason]), [["done", "stop"]]);
			assert.deepEqual(events.at(-1).message.content, [{ type: "text", text: replacementText }]);
		} else assertFailedFallback(events, disconnect ? /MCP server disconnected/ : outcome === "early rejection" ? /replacement replay onResponse rejected/ : /fallback watchdog/i);
	} finally {
		hook.resolve();
		controller.abort();
	}
});

for (const [label, frames, outcome, rejectHook = true] of [
	["hook rejection while awaiting a streaming replacement is provisional", [fallback[0], apiRetry, warning, ...replacementStream], "toolUse"],
	["hook rejection while awaiting a text-only replacement is provisional", [fallback[0], apiRetry, warning, ...textReplacement], "stop"],
	["retry discards a provisional hook rejection from old narration", [lateText, warning, apiRetry, ...replacementFence], "toolUse"],
	["hook rejection while awaiting replacement vetoes that attempt when it stages a served tool", [fallback[0], apiRetry, warning, ...replacementFence], "error"],
	["a resolving hook while awaiting replacement leaves its fallback fence intact", [fallback[0], apiRetry, warning, ...replacementFence], "toolUse", false],
]) it(label, { timeout: 6000 }, async (t) => {
	let hookCalls = 0;
	const stream = startProvider(t, ({ prompt, options }) => {
		const initial = [{ type: "system", subtype: "init", session_id: options.sessionId, claude_code_version: "2.1.321" }, ...frames];
		const script = `
			require("node:readline").createInterface({ input: process.stdin }).on("line", line => {
				const frame = JSON.parse(line);
				if (frame.request?.subtype !== "initialize") return;
				const ready = { type: "control_response", response: { subtype: "success", request_id: frame.request_id, response: {} } };
				process.stdout.write([ready, ...${JSON.stringify(initial)}].map(f => JSON.stringify(f) + "\\n").join(""), () => {
					if (${outcome === "stop"}) process.exit(0);
				});
			});`;
		return query({ prompt, options: { ...options, hooks: undefined, pathToClaudeCodeExecutable: process.execPath,
			spawnClaudeCodeProcess(spawnOptions) {
				const child = spawnReplay(t, options.spawnClaudeCodeProcess, spawnOptions, script);
				[...__test.activeQueryContexts].findLast((c) => c.queryProcess).qualifiedFallbackRuntime = true;
				return child;
			},
		} });
	}, async () => {
		hookCalls++;
		if (rejectHook) throw new Error(hookRejection);
	});
	const events = await Array.fromAsync(stream);
	assert.equal(hookCalls, 1);
	if (outcome === "error") assertFailedFallback(events, /replacement replay onResponse rejected/);
	else if (outcome === "stop") {
		assert.deepEqual(events.filter(({ type }) => type === "done" || type === "error").map(({ type, reason }) => [type, reason]), [["done", "stop"]]);
		assert.deepEqual(events.at(-1).message.content, [{ type: "text", text: replacementText }]);
	} else assertToolTurn([...events, { type: "end" }], [replacementId]);
});

for (const [label, withDenial, continuationOpen, withNarration] of [
	["without permission_denied", false, false, false],
	["with permission_denied", true, false, false],
	["on an open continuation without narration", false, true, false],
	["on an open continuation after narration", false, true, true],
]) it(`published tool rejection ${label} fails the matching continuation`, { timeout: 6000 }, async (t) => {
	const controller = new AbortController();
	const sessionId = `published-rejection-${label}`;
	const [id] = ids;
	const calls = [];
	let child;
	const stream = startProvider(t, ({ prompt, options }) => {
		calls.push(options.sessionId ?? options.resume);
		const init = { type: "system", subtype: "init", session_id: calls.at(-1), claude_code_version: "2.1.321" };
		const result = { type: "result", subtype: "success", is_error: false, result: "unexpected fresh query" };
		const initial = calls.length > 1 ? [init, result] : [init,
			streamEvent({ type: "message_start", message: { id: "msg_stream" } }),
			streamEvent({ type: "content_block_start", index: 0, content_block: { ...toolUse(id), input: {} } }),
			streamEvent({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"command":"ls"}' } }),
			streamEvent({ type: "content_block_stop", index: 0 }),
			streamEvent({ type: "message_stop" }),
			block(id, toolUse(id), "msg_stream"),
		];
		const denied = [
			...(withNarration ? [narration] : []),
			...(withDenial ? [{ type: "system", subtype: "permission_denied", tool_name: name, tool_use_id: id }] : []),
			{ type: "user", parent_tool_use_id: null, uuid: "rejection", message: { role: "user", content: [
				{ type: "tool_result", tool_use_id: id, is_error: true, content: "Permission denied by hook" },
			] } },
			...(continuationOpen ? [{ ...result, result: "unexpected success" }] : []),
		];
		const script = `
			const send = (frames) => process.stdout.write(frames.map(f => JSON.stringify(f) + "\\n").join(""));
			require("node:readline").createInterface({ input: process.stdin }).on("line", line => {
				const frame = JSON.parse(line);
				if (frame.request?.subtype === "initialize") send([
					{ type: "control_response", response: { subtype: "success", request_id: frame.request_id, response: {} } },
					...${JSON.stringify(initial)},
				]);
				if (frame.testRejectTool) {
					send(${JSON.stringify(denied)});
					if (${continuationOpen}) process.stdin.on("end", () => process.exit(0));
				}
			});`;
		return query({ prompt, options: { ...options, hooks: undefined,
			pathToClaudeCodeExecutable: process.execPath,
			spawnClaudeCodeProcess(spawnOptions) {
				child = spawnReplay(t, options.spawnClaudeCodeProcess, spawnOptions, script);
				return child;
			},
		} });
	}, undefined, controller, sessionId);
	const published = await stream.result();
	assert.equal(published.stopReason, "toolUse");
	assert.deepEqual(published.content.filter((block) => block.type === "toolCall").map((block) => block.id), [id]);
	const ctx = [...__test.activeQueryContexts].find((c) => c.piSessionId === sessionId);
	const { exited } = ctx.queryProcess;
	const rejectTool = () => child.stdin.write('{"testRejectTool":true}\n');
	if (!continuationOpen) {
		rejectTool();
		await exited;
	}
	const continuation = provider.streamSimple(provider.models[0], { messages: [
		{ role: "user", content: "run bash", timestamp: 1 }, published,
		{ role: "toolResult", toolCallId: id, toolName: "bash", content: [{ type: "text", text: "Pi tool output" }], isError: false, timestamp: 1 },
	], tools: [servedTool] }, { sessionId, signal: controller.signal });
	if (continuationOpen) {
		assert.ok(ctx.currentPiStream, "the matching continuation must be attached before CC replies");
		rejectTool();
	}
	const events = await Array.fromAsync(continuation);
	assertFailedFallback(events, /Claude Code rejected pi's tool call "bash".*Permission denied by hook/);
	assert.equal(calls.length, 1, "the rejected continuation cannot open a fresh query");
});

for (const [label, prefix, trigger, tail, outcome] of [
	["retired rejection and its SDK reply are inert until replacement stages", [fallback[0], apiRetry], call(1, ids[0], "unknown"), replacementFence, "replacement"],
	["round 7 E2: sequential nested id reuse cannot hide cancellation", [fallback[0], apiRetry], call(1, ids[0]), [
		block(ids[1], toolUse(ids[1]), "msg_replacement"), block(ids[2], toolUse(ids[2]), "msg_replacement"),
		reuseFirstCallId(ids[1]), cancelFirstCall, call(2, ids[2]),
	], /reused MCP request id 1|stop this call/],
	["round 7 E3: SDK schema reply after narration vetoes later tool", [lateText], malformedUncorrelatedCall, [fallback[0], call(1, ids[0])], /Invalid.*tools\/call/i],
	["schema reply after narration leaves text-only completion unchanged", [lateText], malformedUncorrelatedCall, [
		{ type: "result", subtype: "success", is_error: false, result: "late" },
	], "stop"],
	["schema reply before ordinary streaming leaves message_stop unchanged", [], malformedUncorrelatedCall, replacementStream, "toolUse"],
]) it(label, { timeout: 6000 }, async (t) => {
	let sawReply = false;
	const stream = startProvider(t, ({ prompt, options }) => {
		const initial = [{ type: "system", subtype: "init", session_id: options.sessionId, claude_code_version: "2.1.321" }, ...prefix, trigger];
		const script = `
			const send = (...frames) => process.stdout.write(frames.map(f => JSON.stringify(f) + "\\n").join(""));
			require("node:readline").createInterface({ input: process.stdin }).on("line", line => {
				const frame = JSON.parse(line);
				if (frame.request?.subtype === "initialize") {
					send({type:"control_response", response:{subtype:"success", request_id:frame.request_id, response:{}}}, ...${JSON.stringify(initial)});
				} else if (frame.response?.request_id === ${JSON.stringify(trigger.request_id)}) {
					if (!JSON.stringify(frame).match(/retried|error/i)) throw new Error("Expected MCP rejection: " + line);
					send(...${JSON.stringify(tail)});
					if (${outcome === "stop"}) process.exitCode = 0, process.stdin.pause();
				}
			});`;
		return query({ prompt, options: { ...options, hooks: undefined, pathToClaudeCodeExecutable: process.execPath,
			spawnClaudeCodeProcess(spawnOptions) {
				const child = spawnReplay(t, options.spawnClaudeCodeProcess, spawnOptions, script);
				[...__test.activeQueryContexts].findLast((c) => c.queryProcess).qualifiedFallbackRuntime = true;
				const write = child.stdin.write.bind(child.stdin);
				child.stdin.write = (data, ...args) => {
					if (typeof data === "string" && data.includes(JSON.stringify(trigger.request_id)) && data.includes('"type":"control_response"')) sawReply = true;
					return write(data, ...args);
				};
				return child;
			},
		} });
	});
	const events = await Array.fromAsync(stream);
	assert.ok(sawReply, "child must receive the SDK rejection before emitting the tail");
	if (outcome === "stop") {
		assert.equal(events.at(-1)?.reason, "stop", JSON.stringify(events));
		assert.deepEqual(events.at(-1).message.content.map((part) => part.text), ["late"]);
	} else if (outcome === "toolUse" || outcome === "replacement") assertToolTurn([...events, { type: "end" }], [replacementId]);
	else assertFailedFallback(events, outcome);
});

for (const [label, prefix, tail, expectedError] of [
	["before streaming", [], [lateText, { type: "result", subtype: "success", is_error: false, result: "late" }]],
	["after narration", [lateText], [{ type: "result", subtype: "success", is_error: false, result: "late" }]],
	["before a served fallback tool stages", [], [fallback[0], call(1, ids[0])], /test MCP tools\/list send failed/],
	["while awaiting replacement", [fallback[0], apiRetry], replacementFence, /test MCP tools\/list send failed/],
]) it(`one failed MCP tools/list reply ${label} is provisional`, { timeout: 6000 }, async (t) => {
	const firstList = mcpRequest(81, "tools/list", {});
	const secondList = mcpRequest(82, "tools/list", {});
	const failedSend = Promise.withResolvers();
	let child, sawSecondReply = false;
	const stream = startProvider(t, ({ prompt, options }) => {
		const instance = options.mcpServers["custom-tools"].instance;
		const connect = instance.connect.bind(instance);
		t.mock.method(instance, "connect", (transport) => {
			const send = transport.send.bind(transport);
			t.mock.method(transport, "send", async (message, ...args) => {
				if (message.id === 81) {
					failedSend.resolve();
					throw new Error("test MCP tools/list send failed");
				}
				return send(message, ...args);
			});
			return connect(transport);
		});
		const initial = [{ type: "system", subtype: "init", session_id: options.sessionId, claude_code_version: "2.1.321" }, ...prefix, firstList];
		const script = `
			const send = (...frames) => process.stdout.write(frames.map(f => JSON.stringify(f) + "\\n").join(""));
			require("node:readline").createInterface({ input: process.stdin }).on("line", line => {
				const frame = JSON.parse(line);
				if (frame.request?.subtype === "initialize") {
					send({type:"control_response", response:{subtype:"success", request_id:frame.request_id, response:{}}}, ...${JSON.stringify(initial)});
				} else if (frame.testRetryList) send(${JSON.stringify(secondList)});
				else if (frame.response?.request_id === ${JSON.stringify(secondList.request_id)}) {
					if (!frame.response.response?.mcp_response?.result?.tools?.some(tool => tool.name === "bash")) {
						throw new Error("Expected successful second tools/list reply: " + line);
					}
					send(...${JSON.stringify(tail)});
				}
			});`;
		return query({ prompt, options: { ...options, hooks: undefined, pathToClaudeCodeExecutable: process.execPath,
			spawnClaudeCodeProcess(spawnOptions) {
				child = spawnReplay(t, options.spawnClaudeCodeProcess, spawnOptions, script);
				[...__test.activeQueryContexts].findLast((c) => c.queryProcess).qualifiedFallbackRuntime = true;
				const write = child.stdin.write.bind(child.stdin);
				child.stdin.write = (data, ...args) => {
					if (typeof data === "string" && data.includes('"type":"control_response"') && data.includes(JSON.stringify(secondList.request_id))) sawSecondReply = true;
					return write(data, ...args);
				};
				return child;
			},
		} });
	});
	const collected = Array.fromAsync(stream);
	await failedSend.promise;
	await setImmediate(); // Let MCP report the rejected send before the child retries the request.
	if (!child.killed) child.stdin.write('{"testRetryList":true}\n');
	const events = await collected;
	if (expectedError) assertFailedFallback(events, expectedError);
	else {
		assert.deepEqual(events.filter(({ type }) => type === "done" || type === "error").map(({ type, reason }) => [type, reason]), [["done", "stop"]]);
		assert.deepEqual(events.at(-1).message.content, [{ type: "text", text: "late" }]);
	}
	assert.ok(sawSecondReply, "the SDK must answer the second tools/list before the child emits its final frames");
});

for (const [label, position, expectError] of [
	["a fresh Pi stream discards the old latch and accepts Pi's own error echo", "before", null],
	["a CC rejection for a never-delivered id remains a veto before staging", "never-delivered", /CC denied this call/],
	["a result for a never-delivered id without an error flag still vetoes fallback", "unmarked", /CC denied this call/],
	["a second reply for an acknowledged id stays a veto before staging", "duplicate", /CC denied this call/],
	["a Pi error echo is not inert after staging", "after", /before pi started running it/],
]) it(label, { timeout: 6000 }, async (t) => {
	const sessionId = "fallback-latch-continuation";
	const reply = (id, content, uuid) => ({ ...rejectedToolResult(id), uuid, message: { role: "user", content: [
		{ type: "tool_result", tool_use_id: id, ...(position !== "unmarked" ? { is_error: true } : {}), content },
	] } });
	const echo = reply(replacementId, "command failed", "pi-result-echo");
	const rejection = reply(position === "duplicate" ? replacementId : ids[0], "CC denied this call", "cc-rejection");
	const replies = position === "duplicate" ? [echo, rejection] : position === "before" ? [echo] : [rejection];
	const tail = [...(position === "after" ? [fallback[0], echo] : [...replies, fallback[0]]), call(2, ids[0])];
	const controller = new AbortController();
	let launches = 0;
	const oldCall = call(1, replacementId);
	const first = startProvider(t, ({ prompt, options }) => {
		++launches;
		const initial = [{ type: "system", subtype: "init", session_id: options.sessionId, claude_code_version: "2.1.321" },
			malformedUncorrelatedCall, ...replacementStream, oldCall];
		const script = `
			const send = (...frames) => process.stdout.write(frames.map(f => JSON.stringify(f) + "\\n").join(""));
			require("node:readline").createInterface({ input: process.stdin }).on("line", line => {
				const frame = JSON.parse(line);
				if (frame.request?.subtype === "initialize") {
					send({type:"control_response", response:{subtype:"success", request_id:frame.request_id, response:{}}}, ...${JSON.stringify(initial)});
				} else if (frame.response?.request_id === ${JSON.stringify(oldCall.request_id)}) {
					if (frame.response?.response?.mcp_response?.result?.isError !== true) throw new Error("Expected Pi's tool error: " + line);
					send(...${JSON.stringify(tail)});
				}
			});`;
		return query({ prompt, options: { ...options, hooks: undefined, pathToClaudeCodeExecutable: process.execPath,
			spawnClaudeCodeProcess(spawnOptions) {
				const child = spawnReplay(t, options.spawnClaudeCodeProcess, spawnOptions, script);
				[...__test.activeQueryContexts].findLast((c) => c.queryProcess).qualifiedFallbackRuntime = true;
				return child;
			},
		} });
	}, undefined, controller, sessionId);
	const published = await first.result();
	assert.equal(published.stopReason, "toolUse");
	const continuation = provider.streamSimple(provider.models[0], { messages: [
		{ role: "user", content: "run bash", timestamp: 1 }, published,
		{ role: "toolResult", toolCallId: replacementId, toolName: "bash", content: [{ type: "text", text: "command failed" }], isError: true, timestamp: 2 },
	], tools: [servedTool] }, { sessionId, signal: controller.signal });
	const events = await Array.fromAsync(continuation);
	if (expectError) assertFailedFallback(events, expectError);
	else assertToolTurn([...events, { type: "end" }], [ids[0]]);
	assert.equal(launches, 1, "the second Pi stream must reuse the same live SDK query");
});

function assertFailedFallback(events, cause) {
	assert.deepEqual(events.map((event) => event.type), ["error"]);
	assert.deepEqual(events[0].error.content, [], "failed fallback must not expose staged tool calls");
	assert.match(events[0].error.errorMessage, cause);
}

for (const [label, permissionToolIds, allow, expectedError, stageAfterReply = false, malformedPermission = false] of [
	["SDK permission error for a staged id", [ids[1]], false, /control_request:can_use_tool|toolu_b.*canUseTool callback is not provided/],
	["SDK permission error for an id not yet staged", [ids[1]], false, /control_request:can_use_tool|toolu_b.*canUseTool callback is not provided/, true],
	["SDK permission errors under same-chunk id reuse", ["unrelated", ids[1]], false, /control_request:can_use_tool|toolu_b.*canUseTool callback is not provided/],
	["SDK permission errors for unrelated ids", ["unrelated", "also-unrelated"], false, /control_request:can_use_tool|permission reply/],
	["even SDK permission allows for staged ids are outside the allowlist", ids.slice(0, 2), true, /control_request:can_use_tool|permission reply/],
	["valid SDK permission allow before staging does not latch", [ids[0]], true, undefined, true],
	["malformed SDK permission request before staging latches despite allow", [ids[0]], true, /malformed control_request/, true, true],
]) it(`serial fallback: ${label} before the fence`, { timeout: 6000 }, async (t) => {
	const stream = startProvider(t, ({ prompt, options }) => {
		const initial = [{ type: "system", subtype: "init", session_id: options.sessionId, claude_code_version: "2.1.321" },
			...fallback.slice(0, stageAfterReply ? (allow ? 0 : 1) : 2), ...permissionToolIds.map((id) => ({ type: "control_request", request_id: "ctrl-1", request: {
				subtype: "can_use_tool", tool_name: malformedPermission ? undefined : name, input: { command: "ls" }, tool_use_id: id,
			} }))];
		const script = `
			const send = (...frames) => process.stdout.write(frames.map(f => JSON.stringify(f) + "\\n").join(""));
			let replies = 0;
			require("node:readline").createInterface({ input: process.stdin }).on("line", line => {
				const frame = JSON.parse(line);
				if (frame.request?.subtype === "initialize") {
					send({type:"control_response", response:{subtype:"success", request_id:frame.request_id, response:{}}}, ...${JSON.stringify(initial)});
				} else if (frame.response?.request_id === "ctrl-1") {
					const valid = ${allow} ? frame.response.subtype === "success" && frame.response.response?.behavior === "allow"
						&& frame.response.response.toolUseID === ${JSON.stringify(permissionToolIds)}[replies]
						: frame.response.subtype === "error" && /canUseTool callback is not provided/.test(frame.response.error);
					if (!valid) send({type:"result", subtype:"success", is_error:true, result:"Invalid SDK permission reply: " + line});
					else if (++replies === ${permissionToolIds.length}) send(...${JSON.stringify([
						...(stageAfterReply ? fallback.slice(allow ? 0 : 1, 2) : []), call(1, ids[0]),
					])});
				}
			});`;
		return query({ prompt, options: { ...options, hooks: undefined,
			...(allow ? { permissionMode: "default", canUseTool: async (_tool, input) => ({ behavior: "allow", updatedInput: input }) } : {}),
			pathToClaudeCodeExecutable: process.execPath,
			spawnClaudeCodeProcess(spawnOptions) {
				const child = spawnReplay(t, options.spawnClaudeCodeProcess, spawnOptions, script);
				[...__test.activeQueryContexts].findLast((c) => c.queryProcess).qualifiedFallbackRuntime = true;
				return child;
			},
		} });
	});
	const events = await Array.fromAsync(stream);
	if (expectedError) assertFailedFallback(events, expectedError);
	else assertToolTurn([...events, { type: "end" }], ids.slice(0, 2));
});

for (const [label, frames, expectedError] of [
	["idle precedes malformed result", [hostIdle, malformedResult], /became idle|malformed error result/],
	["malformed result precedes idle", [malformedResult, hostIdle], /became idle|malformed error result/],
	["idle precedes malformed control response", [hostIdle, malformedControlResponse], /became idle|malformed control_response/],
]) it(`ordered SDK reader teardown: ${label} while the consumer is stalled`, { timeout: 6000 }, async (t) => {
	const stalled = Promise.withResolvers();
	const resume = Promise.withResolvers();
	const disconnected = Promise.withResolvers();
	let child;
	t.after(() => resume.resolve());
	const stream = startProvider(t, ({ prompt, options }) => {
		const server = options.mcpServers["custom-tools"].instance.server;
		const onclose = server.onclose;
		server.onclose = () => { onclose?.(); disconnected.resolve(); };
		const prefix = [{ type: "system", subtype: "init", session_id: options.sessionId, claude_code_version: "2.1.321" }, fallback[0], rateLimit];
		const send = (messages) => messages.map((message) => JSON.stringify(message) + "\n").join("");
		const script = `process.stdin.once('data', () => {
			process.stdout.write(${JSON.stringify(send(prefix))});
			process.stdin.once('data', () => process.stdout.write(${JSON.stringify(send(frames))}));
		}); process.stdin.resume(); setInterval(() => {}, 1000);`;
		return query({ prompt, options: { ...options, hooks: undefined,
			pathToClaudeCodeExecutable: process.execPath,
			spawnClaudeCodeProcess(spawnOptions) {
				child = spawnReplay(t, options.spawnClaudeCodeProcess, spawnOptions, script);
				return child;
			},
		} });
	}, () => { stalled.resolve(); return resume.promise; });
	const events = Array.fromAsync(stream);
	await stalled.promise;
	child.stdin.write("continue\n");
	await disconnected.promise;
	resume.resolve();
	assertFailedFallback(await events, expectedError);
});

for (const knownAtRetry of [true, false]) it(`serial fallback: stale ${knownAtRetry ? "known" : "late-discovered parked"} id releases the replacement`, { timeout: 6000 }, async (t) => {
	const staleId = ids[1];
	let parked = false;
	const stream = startProvider(t, ({ prompt, options }) => {
		const spawn = options.spawnClaudeCodeProcess;
		const initial = [{ type: "system", subtype: "init", session_id: options.sessionId, claude_code_version: "2.1.321" },
			fallback[0], ...(knownAtRetry ? [fallback[1]] : []), apiRetry, call(1, staleId)];
		const replacement = [block("replacement", toolUse(replacementId), "msg_replacement"), call(2, replacementId)];
		const script = `
			const send = (...frames) => process.stdout.write(frames.map(f => JSON.stringify(f) + "\\n").join(""));
			require("node:readline").createInterface({ input: process.stdin }).on("line", line => {
				const frame = JSON.parse(line);
				if (frame.request?.subtype === "initialize") {
					send({type:"control_response", response:{subtype:"success", request_id:frame.request_id, response:{}}}, ...${JSON.stringify(initial)});
				} else if (frame.testStaleCallParked) {
					send(${JSON.stringify(fallback[1])});
				} else if (frame.response?.request_id === "ctrl-1") {
					const reply = frame.response.response?.mcp_response;
					if (reply?.result?.isError !== true || !/retried/.test(reply.result.content[0].text)) {
						send({type:"result", subtype:"success", is_error:true, result:"Invalid stale MCP reply: " + line});
					} else send(...${JSON.stringify(replacement)});
				}
			});`;
		return query({ prompt, options: { ...options, hooks: undefined,
			pathToClaudeCodeExecutable: process.execPath,
			spawnClaudeCodeProcess(spawnOptions) {
				const child = spawnReplay(t, spawn, spawnOptions, script);
				const ctx = [...__test.activeQueryContexts].findLast((c) => c.queryProcess);
				ctx.qualifiedFallbackRuntime = true;
				const handlers = ctx.pendingToolCalls;
				const set = handlers.set.bind(handlers);
				handlers.set = (id, value) => {
					const result = set(id, value);
					if (id === staleId) {
						parked = true;
						// Emit the late frame only after the real handler has parked.
						if (!knownAtRetry) child.stdin.write('{"testStaleCallParked":true}\n');
					}
					return result;
				};
				return child;
			},
		} });
	});
	const events = [];
	for await (const event of stream) events.push(event);
	if (!knownAtRetry) assert.ok(parked, "the late frame must arrive after the stale handler parked");
	assertToolTurn([...events, { type: "end" }], [replacementId]);
});

for (const signal of ["abort", "discard", "SDK success-with-error", "SDK success-with-error after narration", "SDK success-with-error without staged content"]) it(`delivers ${signal} while iterator and close cleanup are blocked`, { timeout: 4000 }, async (t) => {
	const sdkError = signal.startsWith("SDK success-with-error");
	const fragment = signal.endsWith("without staged content") ? undefined : signal.endsWith("after narration") ? narration : fallback[0];
	const staged = Promise.withResolvers();
	const iteratorClosing = Promise.withResolvers();
	const releaseReader = Promise.withResolvers();
	const releaseClose = Promise.withResolvers();
	const controller = new AbortController();
	const stream = startProvider(t, ({ prompt }) => {
		const gen = (async function* () {
			try {
				await prompt.next();
				void prompt.next().catch(() => {}); // Acknowledge the initial write.
				if (fragment) yield fragment;
				yield rateLimit;
				if (sdkError) yield { type: "result", subtype: "success", is_error: true, result: "original SDK cause" };
				else await releaseReader.promise;
			} finally {
				iteratorClosing.resolve();
				await releaseReader.promise;
				throw new Error("secondary cleanup failure");
			}
		})();
		gen.interrupt = async () => {};
		gen.close = async () => { await releaseClose.promise; throw new Error("secondary SDK close rejection"); };
		return gen;
	}, staged.resolve, controller);
	try {
		await staged.promise;
		const owning = [...__test.activeQueryContexts].findLast((c) => c.currentPiStream === stream);
		assert.ok(owning, "the query owns the tested Pi stream");
		assert.equal(owning.pendingFallback?.frames[0], fragment);
		if (signal === "abort") controller.abort();
		if (signal === "discard") __test.discardRewrittenQuery(owning);
		if (sdkError) {
			const commit = owning.commitRecording;
			let commitAfterError;
			owning.commitRecording = (dirty) => {
				commitAfterError = owning.currentPiStream === null && dirty;
				commit(dirty);
			};
			let result;
			void stream.result().then((output) => { result = output; });
			await iteratorClosing.promise;
			await setImmediate();
			assert.equal(result?.stopReason, "error", "result must be delivered before blocked iterator.return() finishes");
			assert.equal(commitAfterError, true, "recording ownership is settled after emission and before reader cleanup");
		}
		const events = [];
		for await (const event of stream) events.push(event);
		assert.deepEqual(events.map((e) => e.type), ["error"]);
		assert.equal(__test.activeQueryContexts.has(owning), false, "a failed query cannot accept new tool results while teardown is blocked");
		assert.equal(events[0].reason, signal === "abort" ? "aborted" : "error");
		assert.match(events[0].error.errorMessage, signal === "abort" ? /aborted/ : signal === "discard" ? /Conversation replaced/ : /original SDK cause/);
	} finally {
		releaseReader.resolve();
		releaseClose.resolve();
		await setImmediate();
	}
});
