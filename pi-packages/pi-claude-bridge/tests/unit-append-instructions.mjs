import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeEach, describe, it } from "node:test";
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import { AppendInstructions } from "../src/append-instructions.js";
import { projectedAppend, taskBlock } from "./fixtures/append-instructions.mjs";

const claudeDir = mkdtempSync(join(tmpdir(), "claude-bridge-append-"));
process.env.CLAUDE_CONFIG_DIR = claudeDir;
process.on("exit", () => rmSync(claudeDir, { recursive: true, force: true }));
const { default: activate, __test } = await import("../src/index.js");
let provider;
const handlers = new Map();
activate({
	on: (name, handler) => handlers.set(name, handler),
	registerProvider: (_name, config) => {
		provider = config;
	},
	registerTool: () => {},
});
const calls = [];
let nextScript;
const histories = new Map();
const submitInput = (sessionId, prompt = "test prompt") => ({
	hook_event_name: "UserPromptSubmit",
	session_id: sessionId,
	prompt,
});
const signal = new AbortController().signal;

async function turn(append, { piSessionId = "parent", script = {} } = {}) {
	const systemPrompt = `Captured prompt ${randomUUID()}`;
	handlers.get("before_agent_start")({ systemPrompt, systemPromptOptions: { appendSystemPrompt: append } });
	handlers.get("agent_start")({}, { getSystemPrompt: () => systemPrompt });
	const messages = histories.get(piSessionId) ?? [];
	messages.push({ role: "user", content: "Report current instructions", timestamp: 0 });
	histories.set(piSessionId, messages);
	nextScript = script;
	const result = await provider
		.streamSimple(provider.models[0], { systemPrompt, messages, tools: [] }, { sessionId: piSessionId })
		.result();
	messages.push(result);
	// .result() resolves before the bridge's finally removes the query context.
	await new Promise((resolve) => setImmediate(resolve));
	return calls.at(-1);
}

beforeEach(() => {
	__test.resetSharedSession();
	calls.length = 0;
	histories.clear();
	// External CC recording model: only submitted inputs and hook outputs enter
	// requests. A fresh session or snapshot opt-out deliberately changes the prefix.
	const recordedConversations = new Map();
	__test.setQuery(({ prompt, options }) => {
		const script = nextScript;
		const sessionId = script.sessionId ?? options.resume ?? randomUUID();
		const call = { options, sessionId, outputs: [], submitted: [] };
		calls.push(call);
		if (script.registrationError && options.hooks) throw new Error("UserPromptSubmit hook registration failed");
		const gen = (async function* () {
			const initial = await prompt[Symbol.asyncIterator]().next();
			assert.equal(initial.done, false);
			call.submitted.push(structuredClone(initial.value));
			yield { type: "system", subtype: "init", session_id: sessionId };
			const hooks = options.hooks?.UserPromptSubmit?.flatMap((matcher) => matcher.hooks) ?? [];
			call.hook = hooks[0];
			if (hooks.length && !script.skip) {
				const hookSignal = script.abortDelivery ? AbortSignal.abort() : signal;
				const hookOptions = script.callbackError
					? {
							get signal() {
								throw new Error("callback input unavailable");
							},
						}
					: { signal: hookSignal };
				for (const hook of hooks.slice(0, script.deliverParts ?? hooks.length))
					call.outputs.push(await hook(submitInput(sessionId), undefined, hookOptions));
				if (script.steer)
					for (const hook of hooks)
						call.outputs.push(await hook(submitInput(sessionId, "steering prompt"), undefined, { signal }));
			}
			if (script.captureRequest) {
				const recorded = (options.resume && recordedConversations.get(options.resume)) ?? {
					system: options.systemPrompt.append,
					messages: [],
				};
				if (options.systemPrompt.snapshot === false) recorded.system = options.systemPrompt.append;
				recorded.messages.push(...call.submitted.map((input) => input.message));
				for (const output of call.outputs) {
					const text = output.hookSpecificOutput?.additionalContext;
					if (text) recorded.messages.push({ role: "user", isMeta: true, content: [{ type: "text", text }] });
				}
				call.request = structuredClone(recorded);
				recorded.messages.push({ role: "assistant", content: [{ type: "text", text: "OK" }] });
				recordedConversations.set(sessionId, recorded);
			}
			if (script.compact)
				yield {
					type: "system",
					subtype: "compact_boundary",
					session_id: sessionId,
					compact_metadata: { trigger: "manual", pre_tokens: 100 },
				};
			yield { type: "result", subtype: "success", is_error: false, result: "OK" };
		})();
		gen.interrupt = async () => {};
		gen.close = () => {
			call.closed = true;
		};
		if (script.initializationError)
			gen.initializationResult = async () => {
				if (options.hooks) throw new Error("Hook registration rejected during SDK initialization");
				return {};
			};
		return gen;
	});
});
afterEach(() => {
	__test.setQuery(null);
	delete process.env.CLAUDE_BRIDGE_TESTING_DISABLE_APPEND_REFRESH;
});

const context = (call) => call.outputs[0]?.hookSpecificOutput?.additionalContext;

// Only the CLI transport is fake: the real SDK owns initialization and input pumping.
function fakeClaudeProcess(
	options,
	sessionId,
	submitted,
	{ acceptHooks = false, outputs = [], initializations = [] } = {},
) {
	const child = new EventEmitter();
	const stdout = new PassThrough();
	const send = (message) => stdout.write(`${JSON.stringify(message)}\n`);
	let acceptedInput = false;
	let callbackIds = [];
	let delivered = 0;
	const complete = () => {
		send({ type: "result", subtype: "success", is_error: false, result: "OK" });
	};
	const stdin = new Writable({
		write(chunk, _encoding, done) {
			for (const line of chunk.toString().trim().split("\n")) {
				const message = JSON.parse(line);
				if (message.type === "control_request" && message.request.subtype === "initialize") {
					initializations.push(message.request);
					callbackIds = message.request.hooks?.UserPromptSubmit?.flatMap((matcher) => matcher.hookCallbackIds) ?? [];
					// The SDK pumps once this write completes, not once initialization is
					// acknowledged. Reject on the next tick, after any eager input arrives.
					setImmediate(() => {
						if (stdout.destroyed || stdout.writableEnded) return;
						send({
							type: "control_response",
							response:
								options.hooks && !acceptHooks
									? { subtype: "error", request_id: message.request_id, error: "Hook initialization rejected" }
									: { subtype: "success", request_id: message.request_id, response: {} },
						});
						if (options.hooks && !acceptHooks && acceptedInput)
							send({
								type: "result",
								subtype: "error_during_execution",
								is_error: true,
								errors: ["Hook initialization rejected"],
							});
					});
				} else if (message.type === "user") {
					acceptedInput = true;
					submitted.push({ append: options.systemPrompt.append, hooks: Boolean(options.hooks) });
					// A hook-bearing process accepts input but then rejects initialization;
					// a hookless process completes the turn normally.
					if (!options.hooks || acceptHooks) {
						send({ type: "system", subtype: "init", session_id: sessionId });
						if (!callbackIds.length) complete();
						for (const [index, callbackId] of callbackIds.entries())
							send({
								type: "control_request",
								request_id: `part-${index}`,
								request: { subtype: "hook_callback", callback_id: callbackId, input: submitInput(sessionId) },
							});
					}
				} else if (message.type === "control_response" && message.response.request_id.startsWith("part-")) {
					assert.equal(message.response.subtype, "success");
					outputs[Number(message.response.request_id.slice(5))] = message.response.response;
					if (++delivered === callbackIds.length) complete();
				}
			}
			done();
		},
		final(done) {
			child.exitCode = 0;
			stdout.end();
			child.emit("exit", 0, null);
			done();
		},
	});
	return Object.assign(child, {
		stdin,
		stdout,
		killed: false,
		exitCode: null,
		kill() {
			this.killed = true;
			stdin.end();
			return true;
		},
	});
}

function useEagerSdk({ hideInitializationResult = false, ...transport } = {}) {
	const submitted = [];
	__test.setQuery(({ prompt, options }) => {
		const sessionId = options.resume ?? randomUUID();
		calls.push({ options, sessionId, outputs: [] });
		const query = sdkQuery({
			prompt,
			options: {
				...options,
				spawnClaudeCodeProcess: () => fakeClaudeProcess(options, sessionId, submitted, transport),
			},
		});
		if (hideInitializationResult) query.initializationResult = undefined;
		return query;
	});
	return submitted;
}

const deliveredPayload = (outputs) =>
	outputs
		.map((output) => {
			const part = output.hookSpecificOutput.additionalContext;
			assert.ok(part.length <= 9_000);
			return part.slice(part.indexOf("\n\n") + 2, part.lastIndexOf("\n</claude-bridge-appended-instructions>"));
		})
		.join("");
const callbacks = (hooks) => hooks?.UserPromptSubmit.flatMap((matcher) => matcher.hooks) ?? [];

describe("multipart appended instructions", () => {
	it("delivers multiple callbacks for one event through the real SDK transport", { timeout: 5000 }, async () => {
		const outputs = [];
		const initializations = [];
		useEagerSdk({ acceptHooks: true, outputs, initializations });
		await turn(projectedAppend("A"));
		const append = projectedAppend("B".repeat(25_000));
		await turn(append);
		const callbackIds = initializations.at(-1).hooks.UserPromptSubmit[0].hookCallbackIds;
		assert.ok(callbackIds.length > 1);
		assert.equal(outputs.length, callbackIds.length);
		assert.ok(deliveredPayload(outputs).includes(taskBlock("B".repeat(25_000))));
		assert.equal((await turn(append)).options.hooks, undefined);
	});

	it("commits only after every part returns context, even when callbacks arrive out of order", async () => {
		const state = new AppendInstructions();
		const sessionId = randomUUID();
		state.start(sessionId, projectedAppend("A"));
		const append = projectedAppend("B".repeat(25_000));
		const hooks = callbacks(state.hooks(sessionId, append, () => true));
		assert.ok(hooks.length > 1);
		const outputs = [];
		for (const index of [...hooks.keys()].reverse()) {
			if (outputs.length)
				assert.ok(
					state.hooks(sessionId, append, () => true),
					"no premature commit",
				);
			outputs[index] = await hooks[index](submitInput(sessionId), undefined, { signal });
			assert.deepEqual(await hooks[index](submitInput(sessionId, "steering"), undefined, { signal }), {});
		}
		assert.ok(deliveredPayload(outputs).includes(taskBlock("B".repeat(25_000))));
		assert.equal(
			state.hooks(sessionId, append, () => true),
			undefined,
		);
	});

	for (const next of ["A", "C"]) {
		it(`forces a full replacement after partial B delivery followed by ${next}`, async () => {
			await turn(projectedAppend("A"));
			const partial = await turn(projectedAppend("B".repeat(25_000)), { script: { deliverParts: 1 } });
			assert.equal(partial.outputs.length, 1);
			const replacement = await turn(projectedAppend(next));
			assert.ok(replacement.options.hooks, "uncertainty overrides equality with the old effective append");
			const payload = deliveredPayload(replacement.outputs);
			assert.match(payload, /supersedes all earlier appended-instructions versions/);
			assert.ok(payload.includes(projectedAppend(next)), "replacement carries the complete current append");
			assert.equal((await turn(projectedAppend(next))).options.hooks, undefined);
		});
	}

	it("keeps uncertainty across a skipped or partial replacement", async () => {
		await turn(projectedAppend("A"));
		await turn(projectedAppend("B".repeat(25_000)), { script: { deliverParts: 1 } });
		await turn(projectedAppend("A"), { script: { skip: true } });
		await turn(projectedAppend("A"), { script: { deliverParts: 1 } });
		const complete = await turn(projectedAppend("A"));
		assert.ok(deliveredPayload(complete.outputs).includes(projectedAppend("A")));
		assert.equal((await turn(projectedAppend("A"))).options.hooks, undefined);
	});
});

describe("appended instructions on resumed queries", () => {
	it("delivers only the changed task block within a large projected append", async () => {
		await turn(projectedAppend("A"));
		const changed = await turn(projectedAppend("B"));
		assert.match(context(changed), /supersede.*same-keyed blocks/);
		assert.match(context(changed), /unlisted blocks remain/);
		assert.ok(context(changed).includes(taskBlock("B")));
		assert.doesNotMatch(context(changed), /Static project guidance|Nested guidance|Root instructions|available_skills/);
		assert.ok(context(changed).length <= 9_000);
		assert.equal((await turn(projectedAppend("B"))).options.hooks, undefined);
	});

	it("preserves byte-identical prior request content and supplies updates only on the new turn", async () => {
		// This is a request-content contract, not live cache telemetry. The CLI's
		// recording and trailing reminder behavior are separate documented evidence.
		let priorRequest = { system: projectedAppend("A"), messages: [] };
		let sessionId;
		for (const value of ["A", "B", "C", "A"]) {
			const history = histories.get("parent") ?? [];
			const priorHistory = JSON.stringify(history);
			const priorBytes = JSON.stringify(priorRequest);
			const call = await turn(projectedAppend(value), { script: { captureRequest: true } });
			assert.equal(
				JSON.stringify(history.slice(0, history.length - 2)),
				priorHistory,
				"bridge must not rewrite previous Pi messages",
			);
			if (sessionId) assert.equal(call.options.resume, sessionId);
			sessionId = call.sessionId;
			assert.deepEqual(
				call.submitted.map((input) => input.message),
				[
					{
						role: "user",
						content: [{ type: "text", text: "Report current instructions" }],
					},
				],
				"resumed SDK input contains only the new user turn, never replacement history or append text",
			);
			assert.deepEqual(call.options.systemPrompt, {
				type: "preset",
				preset: "claude_code",
				append: projectedAppend(value),
			});
			const prefixLength = priorRequest.messages.length;
			assert.equal(
				JSON.stringify({ system: call.request.system, messages: call.request.messages.slice(0, prefixLength) }),
				priorBytes,
				"recorded system and all earlier request messages stay byte-identical",
			);
			const contexts = call.request.messages.slice(prefixLength + 1);
			if (value === "A" && prefixLength === 0) assert.deepEqual(contexts, []);
			else {
				assert.equal(contexts.length, 1);
				assert.ok(contexts[0].content[0].text.includes(taskBlock(value)));
				assert.doesNotMatch(contexts[0].content[0].text, /Static project guidance|Root instructions/);
				assert.ok(contexts[0].isMeta, "updates are new-turn hook context, not a prefix replacement");
			}
			priorRequest = structuredClone(call.request);
			priorRequest.messages.push({ role: "assistant", content: [{ type: "text", text: "OK" }] });
		}
	});

	it("delivers added/removed keys and empty appends, and falls back fully on changed order or ambiguity", async () => {
		await turn("<a>A</a>\n<b>B</b>");
		const changed = await turn("<a>A</a>\n<c>C</c>");
		assert.match(context(changed), /Removed block keys: \["xml:b"\]/);
		assert.match(context(changed), /<c>C<\/c>/);
		assert.doesNotMatch(context(changed), /<a>A<\/a>|<b>B<\/b>/);
		const reordered = await turn("<c>C</c>\n<a>A</a>");
		assert.match(context(reordered), /supersedes all earlier appended-instructions versions/);
		assert.ok(deliveredPayload(reordered.outputs).endsWith("<c>C</c>\n<a>A</a>"));
		const empty = await turn("");
		assert.match(context(empty), /Removed block keys: \["xml:c","xml:a"\]/);
		const ambiguous = await turn("<rules>unclosed");
		assert.match(context(ambiguous), /full current appended instructions/);
		assert.ok(deliveredPayload(ambiguous.outputs).endsWith("<rules>unclosed"));
		assert.match(context(await turn("Host free text")), /full current appended instructions/);
	});

	it("delivers changed projected append without changing the systemPrompt option", async () => {
		const first = await turn("Value=A");
		const resumed = await turn("Value=B");
		assert.equal(resumed.options.resume, first.sessionId);
		assert.deepEqual(resumed.options.systemPrompt, { type: "preset", preset: "claude_code", append: "Value=B" });
		assert.equal(first.options.hooks, undefined);
		assert.match(
			context(resumed) ?? "",
			/supersede the same-keyed blocks of all earlier appended-instructions versions/,
		);
		assert.match(
			context(resumed) ?? "",
			/<claude-bridge-appended-instructions>\n[\s\S]*Value=B\n<\/claude-bridge-appended-instructions>/,
		);
		assert.doesNotMatch(context(resumed), /Value=A/);
	});

	it("delivers consecutive changes, restoration A→B→A, and an explicit empty append, but not unchanged versions", async () => {
		await turn("Value=A");
		assert.equal((await turn("Value=A")).options.hooks, undefined);
		assert.match(context(await turn("Value=B")), /Value=B/);
		assert.equal((await turn("Value=B")).options.hooks, undefined);
		assert.match(context(await turn("Value=A")), /Value=A/, "A→B→A restores the recorded value through context");
		assert.match(context(await turn("Value=C")), /Value=C/);
		assert.match(context(await turn("Value=A")), /Value=A/);
		const empty = await turn("");
		assert.equal(empty.options.systemPrompt.append, undefined);
		assert.match(context(empty), /none — there are no current appended instructions/);
		assert.equal((await turn("")).options.hooks, undefined);
	});

	it("retries B when the registered callback never ran", async () => {
		await turn("Value=A");
		assert.ok((await turn("Value=B", { script: { skip: true } })).options.hooks);
		assert.match(context(await turn("Value=B")), /Value=B/);
	});

	for (const failure of ["abortDelivery", "callbackError"]) {
		it(`retries B after ${failure} without throwing`, async () => {
			await turn("Value=A");
			const failed = await turn("Value=B", { script: { [failure]: true } });
			assert.deepEqual(failed.outputs, [{}]);
			assert.match(context(await turn("Value=B")), /Value=B/);
		});
	}

	it("returns context only once per query, never replaying it for steering prompts", async () => {
		await turn("Value=A");
		const changed = await turn("Value=B", { script: { steer: true } });
		assert.match(context(changed), /Value=B/);
		assert.deepEqual(changed.outputs[1], {}, "the steering callback runs while the same query is still active");
		assert.equal((await turn("Value=B")).options.hooks, undefined);
	});

	it("keeps the disabled live-probe delivery uncommitted so enabling it retries B", async () => {
		await turn("Value=A");
		process.env.CLAUDE_BRIDGE_TESTING_DISABLE_APPEND_REFRESH = "1";
		assert.equal((await turn("Value=B")).options.hooks, undefined);
		delete process.env.CLAUDE_BRIDGE_TESTING_DISABLE_APPEND_REFRESH;
		assert.match(context(await turn("Value=B")), /Value=B/);
	});

	it("does not commit a skipped callback after its query has ended", async () => {
		await turn("Value=A");
		const skipped = await turn("Value=B", { script: { skip: true } });
		assert.match(context(await turn("Value=C")), /Value=C/);
		assert.deepEqual(await skipped.hook(submitInput(skipped.sessionId), undefined, { signal }), {});
		assert.match(context(await turn("Value=B")), /Value=B/);
	});

	for (const failure of ["registrationError", "initializationError"]) {
		it(`degrades on ${failure}, preserving the previous effective append for a B retry`, async () => {
			await turn("Value=A");
			const degraded = await turn("Value=B", { script: { [failure]: true } });
			assert.equal(degraded.options.hooks, undefined, "fallback query must use today's SDK options without hooks");
			assert.equal(degraded.options.systemPrompt.append, "Value=B");
			assert.equal(calls.length, 3, "exactly one attempt with hooks and one fallback query");
			if (failure === "initializationError") assert.equal(calls[1].closed, true);
			assert.match(context(await turn("Value=B")), /Value=B/);
		});
	}

	it(
		"submits the changed prompt only once when the real SDK pumps input before initialization rejection",
		{ timeout: 5000 },
		async () => {
			const submitted = useEagerSdk();
			await turn("Value=A");
			const changed = await turn("Value=B");
			assert.deepEqual(
				submitted,
				[
					{ append: "Value=A", hooks: false },
					{ append: "Value=B", hooks: false },
				],
				"initialization failure must not replay an already-accepted prompt",
			);
			assert.equal(changed.options.systemPrompt.append, "Value=B");
			await turn("Value=B");
			assert.ok(calls.at(-2).options.hooks, "fallback must leave B uncommitted so the next query retries delivery");
			assert.equal(submitted.length, 3, "the retry query also submits only once");
		},
	);

	it(
		"surfaces the original error without replay when SDK initialization acknowledgement is unavailable",
		{ timeout: 5000 },
		async () => {
			const submitted = useEagerSdk({ hideInitializationResult: true });
			await turn("Value=A");
			await turn("Value=B");
			assert.deepEqual(submitted, [
				{ append: "Value=A", hooks: false },
				{ append: "Value=B", hooks: true },
			]);
			assert.equal(calls.length, 2, "input may already be accepted, so no hookless restart is allowed");
			const result = histories.get("parent").at(-1);
			assert.equal(result.stopReason, "error");
			assert.match(result.errorMessage, /Hook initialization rejected/);
		},
	);

	it("starts a new epoch when a new CC session id is captured", async () => {
		await turn("Value=A");
		const replacementId = randomUUID();
		const replacement = await turn("Value=B", { script: { sessionId: replacementId } });
		assert.deepEqual(replacement.outputs, [{}], "a hook for the old session cannot change the new epoch");
		const next = await turn("Value=B");
		assert.equal(next.options.resume, replacementId);
		assert.equal(next.options.hooks, undefined);
		assert.match(context(await turn("Value=A")), /Value=A/);
	});

	it("starts a fresh epoch on transcript rebuild even with the same CC UUID", async () => {
		const first = await turn("Value=A");
		histories
			.get("parent")
			.push(
				{ role: "user", content: "other provider's turn", timestamp: 0 },
				{ role: "assistant", content: [{ type: "text", text: "other answer" }], timestamp: 0 },
			);
		const rebuilt = await turn("Value=B");
		assert.equal(rebuilt.options.resume, first.sessionId, "this is an in-place rebuild, not a new UUID");
		assert.equal(rebuilt.options.hooks, undefined, "the rebuilt epoch records B in its first system prompt");
		assert.equal((await turn("Value=B")).options.hooks, undefined);
		assert.match(context(await turn("Value=A")), /Value=A/);
	});

	it("resets only the compacting Pi session's epoch", async () => {
		const parent = await turn("Value=A");
		await turn("Child=A", { piSessionId: "child" });
		handlers.get("session_compact")(
			{ reason: "manual", willRetry: false },
			{ sessionManager: { getSessionId: () => "child" } },
		);
		assert.match(context(await turn("Value=B")), /Value=B/, "child compaction must not reset the parent");
		handlers.get("session_compact")(
			{ reason: "manual", willRetry: false },
			{ sessionManager: { getSessionId: () => "parent" } },
		);
		const compacted = await turn("Value=C");
		assert.equal(compacted.options.resume, parent.sessionId);
		assert.equal(compacted.options.hooks, undefined);
		assert.equal((await turn("Value=C")).options.hooks, undefined);
		assert.match(context(await turn("Value=B")), /Value=B/);
	});

	it("starts a new epoch on a CC compact_boundary message", async () => {
		await turn("Value=A");
		await turn("Value=B", { script: { skip: true, compact: true } });
		assert.equal((await turn("Value=B")).options.hooks, undefined, "compaction re-records this query's append B");
		assert.match(context(await turn("Value=A")), /Value=A/);
	});

	it("keeps child and shorter-context ephemeral queries from changing the parent's effective append", async () => {
		await turn("Value=A");
		const parent = await turn("Value=B");
		await turn("Child=A", { piSessionId: "child" });
		assert.match(context(await turn("Child=B", { piSessionId: "child" })), /Child=B/);
		const parentHistory = histories.get("parent");
		histories.delete("parent");
		const ephemeral = await turn("Ephemeral=C");
		assert.equal(ephemeral.options.resume, undefined);
		assert.equal(ephemeral.options.hooks, undefined);
		histories.set("parent", parentHistory);
		const continued = await turn("Value=B");
		assert.equal(continued.options.resume, parent.sessionId);
		assert.equal(continued.options.hooks, undefined);
		assert.match(context(await turn("Value=A")), /Value=A/);
	});

	it("does not let an undelivered callback from an old epoch commit after an in-place rebuild", async () => {
		await turn("Value=A");
		const pending = await turn("Value=B", { script: { skip: true } });
		__test.markRebuildForSession("parent", "test rebuild");
		const rebuilt = await turn("Value=C");
		assert.equal(rebuilt.options.hooks, undefined);
		assert.deepEqual(await pending.hook(submitInput(pending.sessionId), undefined, { signal }), {});
		assert.equal((await turn("Value=C")).options.hooks, undefined);
	});
});
