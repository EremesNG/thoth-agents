import assert from "node:assert/strict";
import { it } from "node:test";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { __test } from "../src/index.js";
import { QueryContext } from "../src/query-state.js";
import { digestMessages } from "../src/message-digests.js";

const model = { id: "sonnet", api: "claude-bridge", provider: "claude-bridge", cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
const prompt = { role: "user", content: "Use both tools", timestamp: 1 };
const names = new Map([["mcp__custom-tools__Actions", "Actions"], ["mcp__custom-tools__edit", "edit"]]);
const completedInput = { action: "list", count: 5, input: { path: "ordinary-nested-input" } };
const blocks = [
	{ type: "tool_use", id: "union", name: "mcp__custom-tools__Actions", input: { input: completedInput } },
	{ type: "tool_use", id: "edit", name: "mcp__custom-tools__edit", input: { file_path: "a.txt", edits: '{"oldText":"a","newText":"b"}' } },
];

for (const timing of ["before-stop", "after-stop", "nonstreaming"]) it(`completed tool arguments and recording agree with wrapped inputs and normalized edits (${timing})`, async () => {
	const c = new QueryContext();
	c.wrappedToolNames = new Set(["Actions"]);
	c.resetTurnState(model);
	c.recording.users([prompt], 0, "prompt-uuid", true);
	const stream = c.currentPiStream = createAssistantMessageEventStream();
	const event = (event) => ({ type: "stream_event", parent_tool_use_id: null, event });
	const completed = { type: "assistant", parent_tool_use_id: null, uuid: "assistant-uuid", message: { id: "msg_tools", model: model.id, content: blocks } };
	const sdk = (async function* () {
		if (timing === "nonstreaming") { yield completed; return; }
		yield event({ type: "message_start", message: { id: "msg_tools" } });
		for (const [index, block] of blocks.entries()) {
			yield event({ type: "content_block_start", index, content_block: { ...block, input: {} } });
			const input = index === 0 && timing === "before-stop"
				? { input: { ...completedInput, count: "5" } } : block.input;
			yield event({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } });
		}
		if (timing === "before-stop") yield completed;
		for (const index of blocks.keys()) yield event({ type: "content_block_stop", index });
		yield event({ type: "message_stop" });
		if (timing === "after-stop") yield completed;
	})();
	await __test.consumeQuery(sdk, names, model, () => false, c);
	const output = await stream.result();
	assert.deepEqual(output.content.map((block) => block.arguments), [
		completedInput,
		{ path: "a.txt", edits: [{ oldText: "a", newText: "b" }] },
	]);
	assert.deepEqual(c.recording.recorded.digests, digestMessages([prompt, output]), "recording must use the same mapped representation Pi executed");
	assert.deepEqual(c.recording.recorded.uuids, ["prompt-uuid", "assistant-uuid"]);
	assert.equal(c.recording.hasGaps, false);
	assert.deepEqual(blocks[0].input, { input: completedInput }, "mapping must not mutate CC's completed block");
});
