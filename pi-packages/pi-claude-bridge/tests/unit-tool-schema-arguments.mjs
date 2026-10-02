import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSession } from "cc-session-io";
import activate, { __test } from "../src/index.js";
import { convertPiMessages } from "../src/convert.js";

const tools = [
	{ name: "Actions", description: "Choose an action", parameters: { type: "object", anyOf: [
		{ type: "object", properties: { action: { const: "list" }, input: { type: "object" } }, required: ["action"] },
		{ type: "object", properties: { action: { const: "open" } }, required: ["action"] },
	] } },
	{ name: "ordinary", description: "An ordinary input field", parameters: {
		type: "object", properties: { input: { type: "object" } }, required: ["input"],
	} },
];
const original = { action: "list", input: { path: "nested-original-input" } };
const ordinary = { input: { action: "not-a-wrapper" } };
const calls = [
	{ type: "tool_use", id: "toolu_union", name: "mcp__custom-tools__Actions", input: { input: original } },
	{ type: "tool_use", id: "toolu_ordinary", name: "mcp__custom-tools__ordinary", input: ordinary },
];

function provider(t) {
	const handlers = new Map();
	let registered;
	activate({
		on: (event, handler) => {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		registerProvider: (_name, definition) => { registered = definition; }, registerTool: () => {},
	});
	const ctx = { ui: { notify: () => {} }, mode: "print", sessionManager: { getSessionId: () => t.name }, modelRegistry: { getProvider: () => ({}) } };
	for (const handler of handlers.get("session_start") ?? []) handler({}, ctx);
	t.after(() => {
		__test.setQuery(null);
		for (const handler of handlers.get("session_shutdown") ?? []) handler({}, ctx);
	});
	return registered;
}

function streamMessages({ initialInput = false } = {}) {
	const event = (event) => ({ type: "stream_event", event });
	return [
		event({ type: "message_start", message: { id: "msg_streamed" } }),
		...calls.flatMap((call, index) => [
			event({ type: "content_block_start", index, content_block: { ...call, input: initialInput ? call.input : {} } }),
			...(!initialInput ? [
				event({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(call.input).slice(0, 12) } }),
				event({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(call.input).slice(12) } }),
			] : []),
			event({ type: "content_block_stop", index }),
		]),
		event({ type: "message_stop" }),
	];
}

async function deliver(t, messages, history = [{ role: "user", content: "Use the tools", timestamp: 1 }], inspectQuery = () => {}) {
	const registered = provider(t);
	__test.setQuery((request) => {
		inspectQuery(request);
		const sdk = (async function* () {
			for (const message of messages) yield message;
			yield { type: "result", subtype: "success", is_error: false, result: "done" };
		})();
		sdk.interrupt = async () => {};
		sdk.close = () => {};
		return sdk;
	});
	const result = await registered.streamSimple(registered.models[0], { messages: history, tools }, { sessionId: t.name }).result();
	assert.equal(result.stopReason, "toolUse");
	return result;
}

it("streamed tool_use unwraps only advertised unions and preserves an ordinary input field", async (t) => {
	const result = await deliver(t, streamMessages());
	assert.deepEqual(result.content.filter((block) => block.type === "toolCall").map((block) => [block.name, block.arguments]), [
		["Actions", original], ["ordinary", ordinary],
	]);
});

it("completed tool_use unwraps only advertised unions and preserves an ordinary input field", async (t) => {
	const result = await deliver(t, [{ type: "assistant", message: { id: "msg_completed", content: calls } }]);
	assert.deepEqual(result.content.filter((block) => block.type === "toolCall").map((block) => [block.name, block.arguments]), [
		["Actions", original], ["ordinary", ordinary],
	]);
});

it("streamed tool_use unwraps initial input even without JSON deltas", async (t) => {
	const result = await deliver(t, streamMessages({ initialInput: true }));
	assert.deepEqual(result.content.filter((block) => block.type === "toolCall").map((block) => block.arguments), [original, ordinary]);
});

it("Pi history re-wraps advertised unions and round-trips to the original Pi arguments", async (t) => {
	const piMessage = { role: "assistant", provider: "claude-bridge", content: [
		{ type: "toolCall", id: "toolu_union", name: "actions", arguments: original },
		{ type: "toolCall", id: "toolu_ordinary", name: "ordinary", arguments: ordinary },
	] };
	const before = structuredClone(piMessage);
	const names = new Map([["actions", "mcp__custom-tools__Actions"], ["ordinary", "mcp__custom-tools__ordinary"]]);
	const converted = convertPiMessages([piMessage], names, new Set(["Actions", "actions"])).anthropicMessages[0];
	assert.deepEqual(converted.content, calls, "history must match the schemas Claude sees");
	assert.deepEqual(piMessage, before, "Pi history must not be mutated");
	const result = await deliver(t, [{ type: "assistant", message: { id: "msg_replayed", content: converted.content } }]);
	assert.deepEqual(result.content.filter((block) => block.type === "toolCall").map((block) => block.arguments), [original, ordinary]);
	assert.deepEqual(convertPiMessages([piMessage]).anthropicMessages[0].content.map((block) => block.input), [original, ordinary],
		"conversion without an advertised wrapped catalog (AskClaude) stays unchanged");
});

it("provider session rebuild writes wrapped history for the advertised catalog", async (t) => {
	const claudeDir = mkdtempSync(join(tmpdir(), "claude-union-history-"));
	const previousDir = process.env.CLAUDE_CONFIG_DIR;
	process.env.CLAUDE_CONFIG_DIR = claudeDir;
	t.after(() => {
		if (previousDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
		else process.env.CLAUDE_CONFIG_DIR = previousDir;
		rmSync(claudeDir, { recursive: true, force: true });
	});
	const history = [
		{ role: "user", content: "Use the tools", timestamp: 1 },
		{ role: "assistant", provider: "claude-bridge", content: [
			{ type: "toolCall", id: "toolu_union", name: "Actions", arguments: original },
			{ type: "toolCall", id: "toolu_ordinary", name: "ordinary", arguments: ordinary },
		], timestamp: 2 },
		{ role: "toolResult", toolCallId: "toolu_union", toolName: "Actions", content: "ok", timestamp: 3 },
		{ role: "toolResult", toolCallId: "toolu_ordinary", toolName: "ordinary", content: "ok", timestamp: 4 },
		{ role: "user", content: "Do it again", timestamp: 5 },
	];
	await deliver(t, streamMessages(), history, ({ options }) => {
		assert.ok(options.resume, "history must be rebuilt before the query starts");
		const session = openSession({ sessionId: options.resume, projectPath: options.cwd, claudeDir });
		const replayed = session.messages.filter((record) => record.type === "assistant").flatMap((record) => record.message.content);
		assert.deepEqual(replayed, calls);
	});
});
