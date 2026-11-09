import assert from "node:assert/strict";
import { it } from "node:test";
import { __test } from "../src/index.js";
import { QueryContext } from "../src/query-state.js";

const model = { id: "sonnet", api: "claude-bridge", provider: "claude-bridge" };
const longText = "replacement text ".repeat(1024).trimEnd();

for (const { name, fragments, partial, finished, wrapped = false, earlyPath = true } of [
	{ name: "edit", fragments: ['{"path":"a.txt",', `"newText":"${longText}`, 'done"}'], partial: { path: "a.txt", newText: longText }, finished: { path: "a.txt", newText: `${longText}done` } },
	{ name: "write", fragments: ['{"path":"a.txt",', `"content":"${longText}`, 'done"}'], partial: { path: "a.txt", content: longText }, finished: { path: "a.txt", content: `${longText}done` } },
	{ name: "bash", fragments: ['{"command":', '"echo hello', ' world"}'], partial: { command: "echo hello" }, finished: { command: "echo hello world" } },
	{ name: "edit", fragments: ['{"file_path":"a.txt",', '"new_string":"replacement', ' text"}'], partial: { path: "a.txt", newText: "replacement" }, finished: { path: "a.txt", newText: "replacement text" } },
	{ name: "write", wrapped: true, fragments: ['{"input":{"file_path":"a.txt",', '"content":"file contents', ' continue"}}'], partial: { path: "a.txt", content: "file contents" }, finished: { path: "a.txt", content: "file contents continue" } },
	{ name: "write", wrapped: true, earlyPath: false, fragments: ['{"input":', '{"file_path":"a.txt","content":"file contents', ' continue"}}'], partial: { path: "a.txt", content: "file contents" }, finished: { path: "a.txt", content: "file contents continue" } },
]) it(`streams partial ${name} arguments (${wrapped ? "wrapped " : ""}${fragments[0]})`, async () => {
	const c = new QueryContext();
	c.resetTurnState(model);
	if (wrapped) c.wrappedToolNames = new Set([name]);
	const events = [];
	// Pi partials share mutable content: capture each event at emission time.
	c.currentPiStream = { push: (event) => events.push(structuredClone(event)), end() {} };
	const event = (event) => ({ type: "stream_event", parent_tool_use_id: null, event });
	const sdk = (async function* () {
		yield event({ type: "message_start", message: { id: "msg_tools" } });
		yield event({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool_1", name: `mcp__custom-tools__${name}`, input: {} } });
		for (const partial_json of fragments) yield event({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json } });
		yield event({ type: "content_block_stop", index: 0 });
		yield event({ type: "message_stop" });
	})();
	await __test.consumeQuery(sdk, new Map([[`mcp__custom-tools__${name}`, name]]), model, () => false, c);
	const deltas = events.filter((event) => event.type === "toolcall_delta");
	assert.deepEqual(deltas.map((event) => event.delta), fragments);
	if (name !== "bash" && earlyPath) assert.equal(deltas[0].partial.content[0].arguments.path, "a.txt");
	else assert.deepEqual(deltas[0].partial.content[0].arguments, {});
	assert.deepEqual(deltas[1].partial.content[0].arguments, partial);
	assert.deepEqual(events.find((event) => event.type === "toolcall_end").toolCall, {
		type: "toolCall", id: "tool_1", name, arguments: finished,
	});
});
