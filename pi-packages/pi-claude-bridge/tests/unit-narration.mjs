/**
 * Progress updates. On Claude 5 models the short notes the model writes between tool
 * calls ("found X, now checking Y") come back as their own `thinking` blocks, not
 * `text`. Under `display: "summarized"` — which the bridge requests whenever a thinking
 * level is set — nothing
 * in the block says so except its signature, whose envelope header carries the block
 * kind: "narration" for a progress update, "thinking" for reasoning. Claude Code
 * decodes the same tag. Mapped block type to block type, pi shows a progress update as
 * reasoning (the TUI folds adjacent thinking blocks into one italic block, and hides
 * them all behind "Thinking..." when thinking is hidden).
 *
 * The bridge now delivers a narration block as text, holding short thinking blocks
 * until their signature arrives to tell the two apart, and keeps the signature on the
 * block so a rebuilt session sends the API back the exact signed block.
 *
 * The signatures here are built from the envelope layout alone — version, a sealed
 * message whose first field is a plaintext header naming the kind, then payload the
 * bridge never reads.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { QueryContext } from "../src/query-state.js";
import { convertPiMessages } from "../src/convert.js";
import { NARRATION_HOLD_CHARS, isNarrationBlock, signatureBlockKind } from "../src/narration.js";

const { __test } = await import("../src/index.js");
const { AssistantMessageComponent } = await import("../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/assistant-message.js");
let provider;

// --- signatures ---

const varint = (n) => {
	const out = [];
	for (; n > 127; n = Math.floor(n / 128)) out.push((n % 128) | 128);
	out.push(n);
	return Buffer.from(out);
};
const varintField = (num, n) => Buffer.concat([varint(num * 8), varint(n)]);
const bytesField = (num, buf) => Buffer.concat([varint(num * 8 + 2), varint(buf.length), buf]);

/** An envelope shaped like the API's, with the given block kind in its header. */
function signature(kind, payloadBytes = 200) {
	const header = Buffer.concat([varintField(1, 18), varintField(3, 2), varintField(7, 1), bytesField(8, Buffer.from(kind))]);
	const sealed = Buffer.concat([
		bytesField(1, header),
		bytesField(2, Buffer.alloc(12, 1)),
		bytesField(3, Buffer.alloc(12, 2)),
		bytesField(4, Buffer.alloc(48, 3)),
		bytesField(5, Buffer.alloc(payloadBytes, 4)),
	]);
	return Buffer.concat([varintField(1, 4), bytesField(2, sealed), varintField(3, 1)]).toString("base64");
}

const NARRATION = signature("narration");
const THINKING = signature("thinking");

// --- stream plumbing, as in unit-nonstreaming-fallback.mjs ---

const fakeModel = { api: "anthropic-messages", provider: "anthropic", id: "test-model" };
const toolMap = new Map([["mcp__custom-tools__bash", "bash"]]);

function newTurn() {
	const c = new QueryContext();
	const events = [];
	c.currentPiStream = { push: (e) => events.push(e), end: () => events.push({ type: "end" }) };
	c.resetTurnState(fakeModel);
	return { c, events };
}

async function run(messages) {
	const { c, events } = newTurn();
	async function* gen() { for (const m of messages) yield m; }
	await __test.consumeQuery(gen(), toolMap, fakeModel, () => false, c);
	return { c, events, content: c.turnOutput.content };
}

/** Pause the SDK boundary after the supplied events, while pi retains shared partial content. */
async function pauseAfter(messages) {
	const { c, events } = newTurn();
	const paused = Promise.withResolvers();
	const resume = Promise.withResolvers();
	let aborted = false;
	async function* gen() {
		yield* messages;
		paused.resolve();
		yield* await resume.promise;
	}
	const consuming = __test.consumeQuery(gen(), toolMap, fakeModel, () => aborted, c);
	await paused.promise;
	return {
		c, events,
		abort: () => { aborted = true; },
		finish: async (rest = []) => { resume.resolve(rest); await consuming; },
	};
}

const streamEvent = (event) => ({ type: "stream_event", event });
const messageStart = () => streamEvent({ type: "message_start", message: { id: "msg_1" } });
const messageEnd = (stop) => [streamEvent({ type: "message_delta", delta: { stop_reason: stop } }), streamEvent({ type: "message_stop" })];

/** A thinking block as streamed: `chunk`-char deltas, then the signature, then the stop. */
function thinkingBlock(index, text, sig, { chunk = 40, close = true } = {}) {
	const out = [streamEvent({ type: "content_block_start", index, content_block: { type: "thinking", thinking: "", signature: "" } })];
	for (let i = 0; i < text.length; i += chunk) {
		out.push(streamEvent({ type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: text.slice(i, i + chunk) } }));
	}
	if (close) {
		out.push(
			streamEvent({ type: "content_block_delta", index, delta: { type: "signature_delta", signature: sig } }),
			streamEvent({ type: "content_block_stop", index }),
		);
	}
	return out;
}
const textBlock = (index, text) => [
	streamEvent({ type: "content_block_start", index, content_block: { type: "text", text: "" } }),
	streamEvent({ type: "content_block_delta", index, delta: { type: "text_delta", text } }),
	streamEvent({ type: "content_block_stop", index }),
];
const toolBlock = (index) => [
	streamEvent({ type: "content_block_start", index, content_block: { type: "tool_use", name: "mcp__custom-tools__bash", id: "toolu_1", input: {} } }),
	streamEvent({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: '{"command":"ls"}' } }),
	streamEvent({ type: "content_block_stop", index }),
];

/** Event types with their block index, e.g. "text_start#1"; `start`/`done`/`end` have none. */
const shape = (events) => events.map((e) => (e.contentIndex === undefined ? e.type : `${e.type}#${e.contentIndex}`));

const REASONING = "Checking the retry path before touching anything.";
const UPDATE = "Confirmed the retry path never refreshes the expired token. Editing auth.py to add the refresh call.\n\n";

describe("signatureBlockKind", () => {
	it("reads the block kind from the envelope header", () => {
		assert.equal(signatureBlockKind(NARRATION), "narration");
		assert.equal(signatureBlockKind(THINKING), "thinking");
		assert.equal(signatureBlockKind(signature("narration", 20_000)), "narration");
	});

	it("skips fixed-width and ten-byte varint fields ahead of the kind, as Claude Code does", () => {
		const fixed = (num, wire, size) => Buffer.concat([varint(num * 8 + wire), Buffer.alloc(size, 0xff)]);
		// An int32 of -1: a negative number takes all ten varint bytes.
		const minusOne = Buffer.concat([varint(4 * 8), Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01])]);
		const header = Buffer.concat([fixed(2, 1, 8), fixed(5, 5, 4), minusOne, bytesField(8, Buffer.from("narration"))]);
		assert.equal(signatureBlockKind(bytesField(2, bytesField(1, header)).toString("base64")), "narration");
	});

	it("has no kind for anything it cannot parse", () => {
		const truncated = NARRATION.slice(0, 20);
		const lengthPastEnd = Buffer.from([0x12, 0xff, 0xff, 0xff, 0xff, 0x0f]).toString("base64");
		for (const bad of [undefined, "", "not base64 !!", "AAAA", truncated, lengthPastEnd]) {
			assert.equal(signatureBlockKind(bad), undefined, String(bad));
		}
	});

	it("keeps every recorded fixture signature's kind", () => {
		const directory = new URL("./fixtures/sdk-streams/", import.meta.url);
		let checked = 0;
		const completed = new Map();
		const streamed = [];
		for (const file of readdirSync(directory).filter((name) => name.endsWith(".jsonl"))) {
			for (const line of readFileSync(new URL(file, directory), "utf8").trim().split("\n")) {
				const message = JSON.parse(line);
				if (message.type === "stream_event" && message.event.delta?.type === "signature_delta") streamed.push(message.event.delta.signature);
				if (message.type !== "assistant") continue;
				for (const [index, block] of message.message.content.entries()) {
					if (block.type !== "thinking") continue;
					const expected = message.narration_block_indexes?.includes(index) ? "narration" : "thinking";
					assert.equal(signatureBlockKind(block.signature), expected, `${file} block ${index}`);
					completed.set(block.signature, expected);
					checked++;
				}
			}
		}
		assert.equal(checked, 7, "all completed fixture signatures were checked");
		assert.equal(streamed.length, 7, "all streamed fixture signatures were checked");
		for (const sig of streamed) {
			assert.ok(completed.has(sig), "streamed signature also appears in a completed block");
			assert.equal(signatureBlockKind(sig), completed.get(sig));
		}
	});

	it("rejects noncanonical base64 around a recognizable envelope", () => {
		for (const bad of [`!${NARRATION}`, `${NARRATION}!`, `${NARRATION}\n`, NARRATION.replace(/=+$/, ""), `${NARRATION}=`, `${NARRATION.slice(0, -3)}R==`]) {
			assert.equal(signatureBlockKind(bad), undefined, bad);
		}
	});

	it("validates trailing fields in every traversed message before returning a kind", () => {
		const kind = bytesField(8, Buffer.from("narration"));
		// A missing varint value, unterminated varint, truncated fixed64/fixed32,
		// invalid field number/wire type, overflowing uint64, and a length past the end.
		const tails = [
			Buffer.from([0x18]), Buffer.from([0x18, 0x80]),
			Buffer.from([0x19, 1]), Buffer.from([0x1d, 1]),
			Buffer.from([0]), Buffer.from([0x1b]),
			Buffer.from([0x18, ...Array(9).fill(0xff), 2]),
			Buffer.from([0x1a, 2, 1]),
		];
		for (const tail of tails) {
			const atHeader = bytesField(2, bytesField(1, Buffer.concat([kind, tail])));
			const atEnvelope = bytesField(2, Buffer.concat([bytesField(1, kind), tail]));
			const atOuter = Buffer.concat([bytesField(2, bytesField(1, kind)), tail]);
			for (const malformed of [atHeader, atEnvelope, atOuter]) {
				assert.equal(signatureBlockKind(malformed.toString("base64")), undefined, malformed.toString("hex"));
			}
		}
	});

	it("treats a block as narration only when it has text to show", () => {
		assert.equal(isNarrationBlock({ thinking: UPDATE, signature: NARRATION }), true);
		assert.equal(isNarrationBlock({ thinking: UPDATE, signature: THINKING }), false);
		assert.equal(isNarrationBlock({ thinking: UPDATE, signature: undefined }), false);
		// A progress update can come back empty (display omitted); there is nothing to render.
		assert.equal(isNarrationBlock({ thinking: " \n", signature: NARRATION }), false);
	});
});

describe("progress updates in the stream", () => {
	it("keeps held narration out of shared partial content through redraw and thinking toggles", async () => {
		const paused = await pauseAfter([
			messageStart(), ...textBlock(0, "Before."),
			...thinkingBlock(1, UPDATE, NARRATION, { close: false }),
		]);
		try {
			// Pi shallow-copies event.partial, retaining its content array.
			const partial = { ...paused.events.find((e) => e.type === "text_delta").partial };
			assert.strictEqual(partial.content, paused.c.turnOutput.content);
			assert.deepEqual(partial.content, [{ type: "text", text: "Before." }]);
			assert.ok(!shape(paused.events).some((type) => type.endsWith("#1")));
			const component = new AssistantMessageComponent(partial, true);
			for (const hidden of [true, false, true]) {
				component.invalidate();
				component.setHideThinkingBlock(hidden);
				const rendered = component.render(100).join("\n");
				assert.match(rendered, /Before\./);
				assert.doesNotMatch(rendered, /Thinking\.\.\.|Confirmed the retry/);
			}
		} finally {
			await paused.finish([
				streamEvent({ type: "content_block_delta", index: 1, delta: { type: "signature_delta", signature: NARRATION } }),
				streamEvent({ type: "content_block_stop", index: 1 }),
				...toolBlock(2), ...messageEnd("tool_use"),
			]);
		}
		assert.deepEqual(paused.c.turnOutput.content.map((b) => b.type), ["text", "text", "toolCall"]);
		assert.deepEqual(shape(paused.events).filter((t) => t.endsWith("#1")), ["text_start#1", "text_delta#1", "text_end#1"]);
	});

	it("shows a progress update after reasoning as text, and keeps reasoning as thinking", async () => {
		const { c, events, content } = await run([
			messageStart(),
			...thinkingBlock(0, REASONING, THINKING),
			...thinkingBlock(1, UPDATE, NARRATION),
			...toolBlock(2),
			...messageEnd("tool_use"),
		]);

		assert.deepStrictEqual(content.map((b) => b.type), ["thinking", "text", "toolCall"]);
		assert.strictEqual(content[0].thinking, REASONING);
		assert.strictEqual(content[0].thinkingSignature, THINKING);
		// Exactly as received: the API checks the text and signature it gets back.
		assert.strictEqual(content[1].text, UPDATE);
		assert.strictEqual(content[1].textSignature, NARRATION);
		assert.deepStrictEqual(Object.keys(content[1]).sort(), ["text", "textSignature", "type"]);
		assert.deepStrictEqual(Object.keys(content[0]).sort(), ["thinking", "thinkingSignature", "type"]);

		assert.deepStrictEqual(shape(events), [
			"start",
			"thinking_start#0", "thinking_delta#0", "thinking_end#0",
			"text_start#1", "text_delta#1", "text_end#1",
			"toolcall_start#2", "toolcall_delta#2", "toolcall_end#2",
			"done", "end",
		]);
		assert.strictEqual(events.find((e) => e.type === "text_end").content, UPDATE);
		assert.ok(events.every((e) => !e.partial || e.partial === c.turnOutput));
	});

	it("shows a progress update with no reasoning before it as text", async () => {
		const { content, events } = await run([
			messageStart(),
			...thinkingBlock(0, UPDATE, NARRATION),
			...toolBlock(1),
			...messageEnd("tool_use"),
		]);

		assert.deepStrictEqual(content.map((b) => b.type), ["text", "toolCall"]);
		assert.deepStrictEqual(shape(events).filter((t) => t.startsWith("thinking")), []);
	});

	it("holds a short reasoning block until it closes, then shows it whole and in order", async () => {
		const { content, events } = await run([
			messageStart(),
			...thinkingBlock(0, REASONING, THINKING, { chunk: 10 }),
			...textBlock(1, "Done."),
			...messageEnd("end_turn"),
		]);

		assert.deepStrictEqual(content.map((b) => b.type), ["thinking", "text"]);
		assert.deepStrictEqual(shape(events), [
			"start", "thinking_start#0", "thinking_delta#0", "thinking_end#0", "text_start#1", "text_delta#1", "text_end#1",
		]);
		assert.strictEqual(events.find((e) => e.type === "thinking_delta").delta, REASONING);
	});

	it("streams a long reasoning block live once it passes the hold, losing and repeating nothing", async () => {
		const text = "Weighing the retry path against the refresh path again. ".repeat(40);
		const chunk = 50;
		assert.ok(text.length > NARRATION_HOLD_CHARS * 2);

		const { content, events } = await run([
			messageStart(),
			...thinkingBlock(0, text, THINKING, { chunk }),
			...toolBlock(1),
			...messageEnd("tool_use"),
		]);

		assert.strictEqual(content[0].type, "thinking");
		assert.strictEqual(content[0].thinking, text);
		const thinking = events.filter((e) => e.type.startsWith("thinking"));
		assert.strictEqual(thinking[0].type, "thinking_start");
		assert.strictEqual(thinking.at(-1).type, "thinking_end");
		assert.strictEqual(thinking.filter((e) => e.type === "thinking_start").length, 1);
		const deltas = thinking.filter((e) => e.type === "thinking_delta").map((e) => e.delta);
		assert.strictEqual(deltas.join(""), text);
		// Released on the first delta past the hold, carrying everything gathered so far;
		// every later delta is its own event.
		assert.ok(deltas[0].length > NARRATION_HOLD_CHARS && deltas[0].length <= NARRATION_HOLD_CHARS + chunk);
		assert.strictEqual(deltas.length, 1 + Math.ceil((text.length - deltas[0].length) / chunk));
	});

	it("holds exactly 800 characters, then releases the full buffer past the limit even for narration", async () => {
		const text = "x".repeat(NARRATION_HOLD_CHARS);
		const paused = await pauseAfter([messageStart(), ...thinkingBlock(0, text, NARRATION, { close: false })]);
		try {
			assert.deepEqual(paused.c.turnOutput.content, []);
			assert.deepEqual(shape(paused.events), ["start"]);
		} finally {
			await paused.finish([
				streamEvent({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "!" } }),
				streamEvent({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "live" } }),
				streamEvent({ type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: NARRATION } }),
				streamEvent({ type: "content_block_stop", index: 0 }),
				...toolBlock(1), ...messageEnd("tool_use"),
			]);
		}
		assert.equal(paused.c.turnOutput.content[0].type, "thinking");
		assert.deepEqual(paused.events.filter((e) => e.type === "thinking_delta").map((e) => e.delta), [text + "!", "live"]);
		const short = await run([messageStart(), ...thinkingBlock(0, text, NARRATION), ...messageEnd("end_turn")]);
		assert.equal(short.content[0].type, "text");
	});

	it("discards a held block when its message is abandoned and retried", async () => {
		const { content, events } = await run([
			messageStart(), ...thinkingBlock(0, UPDATE, NARRATION, { close: false }),
			streamEvent({ type: "message_start", message: { id: "msg_retry" } }),
			...textBlock(0, "Retried."), ...toolBlock(1), ...messageEnd("tool_use"),
		]);
		assert.deepEqual(content.map((b) => b.type), ["text", "toolCall"]);
		assert.equal(content[0].text, "Retried.");
		assert.ok(!events.some((e) => e.type.startsWith("thinking")));
	});

	it("discards a held block on turn reset, including when the same stream object is reused", async () => {
		const paused = await pauseAfter([messageStart(), ...thinkingBlock(0, UPDATE, NARRATION, { close: false })]);
		const previous = paused.c.turnOutput;
		paused.c.resetTurnState(fakeModel);
		await paused.finish([
			// A late stop from the old turn must not release its hold into the new one.
			streamEvent({ type: "content_block_stop", index: 0 }),
			messageStart(), ...textBlock(0, "New turn."), ...messageEnd("end_turn"),
		]);
		assert.deepEqual(previous.content, []);
		assert.deepEqual(paused.c.turnOutput.content, [{ type: "text", text: "New turn." }]);
		assert.ok(!paused.events.some((e) => e.type.startsWith("thinking")));
	});

	it("finalizes an unfinished hold without content and ignores later classification", async () => {
		const paused = await pauseAfter([messageStart(), ...thinkingBlock(0, UPDATE, NARRATION, { close: false })]);
		await paused.finish();
		__test.finalizeCurrentStream(paused.c);
		const done = paused.events.find((e) => e.type === "done").message;
		assert.deepEqual(done.content, []);
		const snapshot = structuredClone(done);
		async function* late() {
			yield streamEvent({ type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: NARRATION } });
			yield streamEvent({ type: "content_block_stop", index: 0 });
		}
		await __test.consumeQuery(late(), toolMap, fakeModel, () => false, paused.c);
		assert.deepEqual(done, snapshot);
	});

	for (const failure of ["abort", "error"]) {
		it(`discards a held block on provider ${failure}`, { timeout: 10_000 }, async () => {
			const mod = await import("../src/index.js");
			if (!provider) mod.default({ on: () => {}, registerProvider: (_name, config) => { provider = config; }, registerTool: () => {} });
			__test.resetSharedSession();
			const parked = Promise.withResolvers();
			const resume = Promise.withResolvers();
			const settled = Promise.withResolvers();
			__test.setQuery(({ prompt, options }) => {
				const gen = (async function* () {
					await prompt[Symbol.asyncIterator]().next();
					yield { type: "system", subtype: "init", session_id: options.sessionId ?? options.resume };
					yield messageStart();
					yield* thinkingBlock(0, UPDATE, NARRATION, { close: false });
					parked.resolve();
					await resume.promise;
					if (failure === "error") throw new Error("CLI exited during hold");
				})();
				gen.interrupt = async () => {};
				gen.close = () => { resume.resolve(); if (__test.activeQueryContexts.size === 0) settled.resolve(); };
				return gen;
			});
			try {
				const controller = new AbortController();
				const stream = provider.streamSimple(provider.models[0], { messages: [{ role: "user", content: "go", timestamp: 1 }], tools: [] }, { signal: controller.signal, sessionId: `narration-${failure}` });
				await parked.promise;
				if (failure === "abort") controller.abort();
				else resume.resolve();
				const message = await stream.result();
				await settled.promise;
				assert.equal(message.stopReason, failure === "abort" ? "aborted" : "error");
				assert.deepEqual(message.content, []);
			} finally {
				resume.resolve();
				__test.setQuery(null);
			}
		});
	}

	it("announces and closes an empty block without a delta, whatever kind it is", async () => {
		for (const sig of [THINKING, NARRATION]) {
			const { content, events } = await run([messageStart(), ...thinkingBlock(0, "", sig), ...toolBlock(1), ...messageEnd("tool_use")]);
			assert.deepStrictEqual(content.map((b) => b.type), ["thinking", "toolCall"]);
			assert.deepStrictEqual(shape(events).filter((t) => t.endsWith("#0")), ["thinking_start#0", "thinking_end#0"]);
		}
	});

	it("drops a thinking block cut off before it closed, which pi never heard of", async () => {
		const { content, events } = await run([
			messageStart(),
			...thinkingBlock(0, "half a thou", "", { chunk: 4, close: false }),
			...messageEnd("end_turn"),
		]);

		assert.deepStrictEqual(content, []);
		assert.deepStrictEqual(shape(events).filter((t) => t.startsWith("thinking")), []);
	});

	it("leaves ordinary text streaming live and untouched", async () => {
		const { content, events } = await run([messageStart(), ...textBlock(0, "Hello"), ...messageEnd("end_turn")]);

		assert.deepStrictEqual(content.map((b) => ({ ...b })), [{ type: "text", text: "Hello" }]);
		assert.deepStrictEqual(shape(events), ["start", "text_start#0", "text_delta#0", "text_end#0"]);
	});
});

describe("progress updates in the non-streaming fallback", () => {
	it("classifies completed narration without a length cap and keeps every other block", async () => {
		const long = UPDATE.repeat(20);
		assert.ok(long.length > NARRATION_HOLD_CHARS);
		const { content } = await run([{
			type: "assistant",
			message: { id: "msg_complete", content: [
				{ type: "thinking", thinking: " \n", signature: NARRATION },
				{ type: "thinking", thinking: long, signature: NARRATION },
				{ type: "thinking", thinking: REASONING, signature: "undecodable" },
				{ type: "thinking" },
				{ type: "text", text: "Done." },
			] },
		}]);
		assert.deepEqual(content, [
			{ type: "thinking", thinking: " \n", thinkingSignature: NARRATION },
			{ type: "text", text: long, textSignature: NARRATION },
			{ type: "thinking", thinking: REASONING, thinkingSignature: "undecodable" },
			{ type: "thinking", thinking: "", thinkingSignature: "" },
			{ type: "text", text: "Done." },
		]);
	});

	it("shows them as text there too", async () => {
		const { content, events } = await run([{
			type: "assistant",
			message: { id: "msg_fallback", content: [
				{ type: "thinking", thinking: REASONING, signature: THINKING },
				{ type: "thinking", thinking: UPDATE, signature: NARRATION },
				{ type: "tool_use", name: "mcp__custom-tools__bash", id: "toolu_a", input: { command: "ls" } },
			] },
		}]);

		assert.deepStrictEqual(content.map((b) => b.type), ["thinking", "text", "toolCall"]);
		assert.strictEqual(content[1].text, UPDATE);
		assert.strictEqual(content[1].textSignature, NARRATION);
		assert.deepStrictEqual(shape(events).filter((t) => t.endsWith("#1")), ["text_start#1", "text_delta#1", "text_end#1"]);
	});
});

describe("progress updates on replay", () => {
	const toSdk = new Map([["bash", "mcp__custom-tools__bash"]]);
	const replay = (content, provider = "claude-bridge") => convertPiMessages([{ role: "assistant", provider, content }], toSdk);

	it("sends one back as the exact signed thinking block it arrived as", () => {
		const { anthropicMessages, origins } = replay([
			{ type: "thinking", thinking: REASONING, thinkingSignature: THINKING },
			{ type: "text", text: UPDATE, textSignature: NARRATION },
			{ type: "toolCall", id: "toolu_1", name: "bash", arguments: { command: "ls" } },
		]);

		// The API wants a turn's thinking blocks returned verbatim, and reads the full
		// note from the signature — so neither the text nor its trailing newlines change.
		assert.deepStrictEqual(anthropicMessages[0].content, [
			{ type: "thinking", thinking: REASONING, signature: THINKING },
			{ type: "thinking", thinking: UPDATE, signature: NARRATION },
			{ type: "tool_use", id: "toolu_1", name: "mcp__custom-tools__bash", input: { command: "ls" } },
		]);
		assert.deepEqual(origins, [[0]]);
	});

	it("never turns other text into thinking", () => {
		const cases = [
			{ type: "text", text: "Hello" },
			{ type: "text", text: "Hello", textSignature: JSON.stringify({ v: 1, id: "msg_abc", phase: "commentary" }) },
			{ type: "text", text: "Hello", textSignature: THINKING },
			{ type: "text", text: " \n", textSignature: NARRATION },
		];
		for (const block of cases) {
			assert.deepStrictEqual(replay([block]).anthropicMessages[0].content, [{ type: "text", text: block.text }]);
		}
	});

	it("preserves conversion origins and wrapped-tool input envelopes beside narration", () => {
		const { anthropicMessages, origins } = convertPiMessages([
			{ role: "user", content: "go" },
			{ role: "assistant", provider: "claude-bridge", content: [
				{ type: "text", text: UPDATE, textSignature: NARRATION },
				{ type: "toolCall", id: "toolu_wrapped", name: "bash", arguments: { command: "ls" } },
			] },
		], toSdk, new Set(["bash"]));
		assert.deepEqual(origins, [[0], [1]]);
		assert.deepEqual(anthropicMessages[1].content, [
			{ type: "thinking", thinking: UPDATE, signature: NARRATION },
			{ type: "tool_use", id: "toolu_wrapped", name: "mcp__custom-tools__bash", input: { input: { command: "ls" } } },
		]);
	});

	it("does not hand another provider's message a signature as if it were ours", () => {
		const block = { type: "text", text: UPDATE, textSignature: NARRATION };
		assert.deepStrictEqual(replay([block], "anthropic").anthropicMessages[0].content, [{ type: "text", text: UPDATE }]);
	});
});
