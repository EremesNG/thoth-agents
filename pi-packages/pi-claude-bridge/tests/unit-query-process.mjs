import { it } from "node:test";
import assert from "node:assert/strict";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { QueryProcess } from "../src/query-process.js";

it("a synchronous spawn failure leaves no child, so close resolves exited", { timeout: 2000 }, async () => {
	const child = new QueryProcess();
	assert.throws(() => child.spawn({ command: "", args: [], cwd: process.cwd(), env: process.env, signal: new AbortController().signal }), { code: "ERR_INVALID_ARG_VALUE" });
	child.terminate();
	await child.exited;
});

it("reports the first child failure once and removes its listeners at close", { timeout: 3000 }, async () => {
	const errors = [];
	const processObserver = new QueryProcess(undefined, (error) => errors.push(error));
	const child = processObserver.spawn({
		command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"],
		cwd: process.cwd(), env: process.env, signal: new AbortController().signal,
	});
	const first = new Error("first stderr failure");
	try {
		child.stderr.emit("error", first);
		child.stderr.emit("error", new Error("second stderr failure"));
		child.stdout.emit("error", new Error("stdout failure"));
	} finally {
		processObserver.terminate();
		await processObserver.exited;
	}
	assert.deepEqual(errors, [first]);
	for (const pipe of [child.stdin, child.stdout, child.stderr]) assert.equal(pipe.listenerCount("error"), 0);
	assert.equal(child.stderr.listenerCount("data"), 0);
	assert.equal(child.listenerCount("error"), 0);
	assert.equal(child.listenerCount("exit"), 0);
});

const assistant = { type: "assistant", uuid: "assistant", message: { id: "msg_a", content: [{ type: "text", text: "before α" }] } };
const errorResult = { type: "result", subtype: "error_during_execution", is_error: true, errors: ["queued failure"] };
const call = { type: "control_request", request_id: "sdk-request", request: {
	subtype: "mcp_message", server_name: "tools",
	message: { jsonrpc: "2.0", method: "tools/call", id: 7, params: { name: "alpha", arguments: {} } },
} };
const consumed = { type: "system", subtype: "session_state_changed", state: "requires_action", sdk_host_only: true };

async function withSdkChild(input, check, { split = false, onFact, onRawFrame, replyEcho } = {}) {
	const processObserver = new QueryProcess(undefined, undefined, undefined, () => processObserver.reduceConsumed(), onFact, onRawFrame);
	processObserver.enableOrderedIngress();
	const mcp = new McpServer({ name: "tools", version: "1.0.0" }, { capabilities: { tools: {} } });
	const { promise: dispatched, resolve: onDispatch } = Promise.withResolvers();
	mcp.server.setRequestHandler(CallToolRequestSchema, async (_request, { requestId }) => {
		onDispatch({ requestId, ingressAtDispatch: processObserver.ingressWatermark, ingress: processObserver.getMcpCall("tools", requestId) });
		return { content: [{ type: "text", text: "ok" }] };
	});
	const script = `
		const readline = require("node:readline");
		const lines = ${JSON.stringify(input)};
		readline.createInterface({ input: process.stdin }).on("line", (line) => {
			const frame = JSON.parse(line);
			const echo = ${JSON.stringify(replyEcho ?? null)};
			if (echo && frame.response?.request_id === "sdk-request") {
				const response = echo === "exact" ? frame : { ...frame, response: { ...frame.response, response: {} } };
				const frames = echo === "exact" ? [response, response] : [response];
				process.stdout.write([...frames, ${JSON.stringify(assistant)}].map(f => JSON.stringify(f)).join("\\n") + "\\n");
			}
			if (frame.request?.subtype !== "initialize") return;
			const init = { type: "control_response", response: { subtype: "success", request_id: frame.request_id, response: {} } };
			const batch = Buffer.from(JSON.stringify(init) + "\\n" + lines.join("\\n") + "\\n");
			if (${split}) {
				const at = batch.indexOf(Buffer.from("α")) + 1;
				process.stdout.write(batch.subarray(0, at));
				setTimeout(() => process.stdout.write(batch.subarray(at)), 30);
			} else process.stdout.write(batch);
		});
		setInterval(() => {}, 1000);
	`;
	const q = query({ prompt: "test", options: {
		mcpServers: { tools: { type: "sdk", name: "tools", instance: mcp } },
		spawnClaudeCodeProcess: (options) => processObserver.spawn({ ...options, command: process.execPath, args: ["-e", script] }),
	} });
	let timeout;
	try {
		const dispatch = await Promise.race([dispatched, new Promise((_, reject) => {
			timeout = setTimeout(() => reject(new Error("SDK did not dispatch tools/call")), 2000);
		})]);
		await check(processObserver, q, dispatch);
	} finally {
		clearTimeout(timeout);
		q.close();
		processObserver.terminate();
		await processObserver.exited;
	}
}

for (const [order, frames, fence] of [
	["after", [assistant, call, errorResult], 3],
	["before", [assistant, errorResult, call], 4],
]) {
	it(`blocks the fence while a same-chunk error ${order} tools/call is unreduced`, { timeout: 5000 }, async () => {
		await withSdkChild(frames.map(JSON.stringify), async (observer, q, dispatch) => {
			assert.equal(dispatch.requestId, 7);
			assert.equal(dispatch.ingressAtDispatch, 4, "the full chunk must be counted before SDK dispatch");
			assert.equal(dispatch.ingress?.sequence, fence);
			assert.equal(dispatch.ingress?.controlRequestId, "sdk-request");
			assert.equal(observer.getMcpCall("wrong-server", 7), undefined);
			assert.equal(observer.getMcpCall("tools", "7"), undefined);
			assert.equal(observer.reducedWatermark, 1, "only SDK initialization was reduced");
			const first = (await q.next()).value;
			assert.deepEqual(first, assistant);
			assert.equal(observer.acknowledge(first), 2);
			assert.ok(observer.reducedWatermark < observer.ingressWatermark);
			const error = (await q.next()).value;
			assert.deepEqual(error, errorResult);
			assert.ok(observer.reducedWatermark < observer.ingressWatermark, "even a yielded error must be reduced explicitly");
			assert.equal(observer.acknowledge(error), order === "after" ? 4 : 3);
			assert.equal(observer.reducedWatermark, observer.ingressWatermark);
		});
	});
}

it("decodes split frames and self-acknowledges SDK host-only frames", { timeout: 5000 }, async () => {
	await withSdkChild([assistant, consumed, call].map(JSON.stringify), async (observer, q, dispatch) => {
		assert.equal(dispatch.ingressAtDispatch, 4);
		const first = (await q.next()).value;
		assert.deepEqual(first, assistant);
		assert.equal(observer.acknowledge(first), 2);
		assert.equal(observer.reducedWatermark, 4);
	}, { split: true });
});

it("observes each raw reservation in order without changing SDK delivery or reduction", { timeout: 5000 }, async () => {
	const reservations = [];
	const facts = [];
	const fault = new Error("raw observer test failure");
	await withSdkChild([assistant, consumed, call].map(JSON.stringify), async (observer, q) => {
		assert.deepEqual(reservations.map(([sequence, frame]) => [sequence, frame.type]), [
			[1, "control_response"], [2, "assistant"], [3, "system"], [4, "control_request"],
		]);
		assert.equal(observer.reducedWatermark, 1);
		assert.equal(facts.some(([sequence]) => sequence === 3), false, "observer failure cannot overtake an SDK yield");
		const first = (await q.next()).value;
		assert.deepEqual(first, assistant);
		assert.equal(observer.acknowledge(first), 2);
		observer.reduceConsumed();
		assert.deepEqual(facts.filter(([sequence]) => sequence === 3).map(([, fact]) => fact), [
			{ kind: "raw_observer_error", error: fault }, { kind: "host_session_state", state: "requires_action" },
		]);
		assert.equal(observer.reducedWatermark, observer.ingressWatermark);
	}, {
		onFact: (fact, sequence) => facts.push([sequence, fact]),
		onRawFrame: (line, sequence) => {
			const frame = JSON.parse(line);
			reservations.push([sequence, frame]);
			if (frame.sdk_host_only) throw fault;
		},
	});
});

it("reports malformed stdout in wire order even if the SDK silently filters it", { timeout: 5000 }, async () => {
	const seen = [];
	await withSdkChild(["non-JSON stdout", JSON.stringify(assistant), JSON.stringify(call)], async (observer, q) => {
		assert.equal(observer.ingressWatermark, 4);
		const first = (await q.next()).value;
		assert.deepEqual(first, assistant, "the SDK silently filtered the non-JSON line");
		observer.reduceConsumed();
		assert.deepEqual(seen, [[2, "malformed_frame"]]);
		assert.equal(observer.acknowledge(first), 3);
	}, { onFact: (fact, sequence) => { if (fact.kind === "malformed_frame") seen.push([sequence, fact.kind]); } });
});

it("preserves ordered yields across user replays, rate limits, progress and host-only idle", { timeout: 5000 }, async () => {
	const output = [
		{ type: "system", subtype: "init", session_id: "session", claude_code_version: "2.1.321" },
		{ type: "stream_event", parent_tool_use_id: null, event: { type: "message_stop" } },
		{ type: "user", uuid: "prompt", isReplay: true, parent_tool_use_id: null, message: { content: [{ type: "text", text: "prompt" }] } },
		{ type: "user", uuid: "steer", isReplay: true, parent_tool_use_id: null, message: { content: "steer" } },
		assistant,
		{ type: "rate_limit_event", rate_limit_info: { status: "allowed" } },
		{ type: "tool_progress", tool_use_id: "tool", tool_name: "alpha", parent_tool_use_id: null, elapsed_time_seconds: 30 },
		{ type: "auth_status", isAuthenticating: true, output: [] },
		{ type: "system", subtype: "api_retry", attempt: 1, max_retries: 3 },
	];
	const facts = [];
	const idle = { ...consumed, state: "idle" };
	const tail = [idle, call,
		{ type: "control_cancel_request", request_id: "unrelated" },
		{ type: "control_response", response: { subtype: "success", request_id: "unrelated" } },
		{ type: "keep_alive" }, { type: "transcript_mirror", filePath: "unused", entries: [] },
	];
	const sentinel = { ...assistant, uuid: "after-consumed-tail" };
	await withSdkChild([...output, ...tail, sentinel].map(JSON.stringify), async (observer, q) => {
		assert.deepEqual(facts, [[1, "control_response"]], "a pending SDK yield blocks all later consumed facts");
		for (const [index, raw] of output.entries()) {
			const frame = (await q.next()).value;
			assert.deepEqual(frame, raw);
			assert.equal(observer.acknowledge(frame), index + 2);
			assert.equal(observer.reducedWatermark, index + 2);
		}
		assert.equal(facts.length, 1, "acknowledging a yield does not silently reduce facts for the coordinator");
		assert.deepEqual((await q.next()).value, sentinel, "the SDK has read through the queued controls");
		observer.reduceConsumed();
		assert.deepEqual(facts.slice(1), ["host_session_state", ...tail.slice(1).map(({ type }) => type)]
			.map((kind, i) => [output.length + i + 2, kind]));
		assert.equal(observer.acknowledge(sentinel), output.length + tail.length + 2);
		observer.reduceConsumed();
		assert.deepEqual(facts.at(-1), [output.length + tail.length + 3, "sdk_reply"]);
		assert.equal(observer.reducedWatermark, observer.ingressWatermark);
	}, { onFact: (fact, sequence) => facts.push([sequence, fact.kind]) });
});

for (const [label, echo, expected] of [
	["recognizes a single exact MCP reply echo and rejects its duplicate", "exact", [undefined, /uncorrelatable control_response/]],
	["rejects a changed MCP reply echo despite matching its outer id", "changed", [/uncorrelatable control_response/]],
]) it(label, { timeout: 5000 }, async () => {
	const errors = [];
	await withSdkChild([JSON.stringify(call)], async (observer, q) => {
		const message = (await q.next()).value;
		assert.deepEqual(message, assistant);
		observer.reduceConsumed();
		assert.equal(errors.length, expected.length);
		for (const [i, error] of errors.entries()) {
			if (expected[i]) assert.match(error, expected[i]);
			else assert.equal(error, undefined);
		}
		assert.equal(observer.acknowledge(message), observer.ingressWatermark);
	}, { replyEcho: echo, onFact(fact, sequence) {
		if (fact.kind === "control_response" && sequence > 1) errors.push(fact.error);
	} });
});

it("orders both SDK permission errors across same-chunk outer id reuse", { timeout: 5000 }, async () => {
	const permission = (id) => ({ type: "control_request", request_id: "permission", request: {
		subtype: "can_use_tool", tool_name: "alpha", input: {}, tool_use_id: id,
	} });
	const facts = [];
	await withSdkChild([assistant, permission("toolu_a"), permission("toolu_b"), call].map(JSON.stringify),
		async (observer, q, dispatch) => {
			assert.equal(observer.acknowledge((await q.next()).value), 2);
			observer.reduceConsumed();
			assert.deepEqual(facts, [
				[6, "toolu_a", "canUseTool callback is not provided."],
				[7, "toolu_b", "canUseTool callback is not provided."],
			]);
			assert.equal(dispatch.ingress?.sequence, 5);
			assert.equal(observer.reducedWatermark, observer.ingressWatermark);
		}, { onFact: (fact, sequence) => {
			if (fact.kind === "sdk_reply" && fact.permission) facts.push([sequence, fact.toolUseId, fact.error]);
		} });
});
