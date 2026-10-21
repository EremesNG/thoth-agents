import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { getSessionPath } from "cc-session-io";
import { SessionCheckpoints, piPrefixDigest, transcriptFingerprint, validate } from "../src/session-checkpoint.js";

const dir = mkdtempSync(join(tmpdir(), "bridge-checkpoint-"));
process.env.CLAUDE_CONFIG_DIR = dir;
const { default: activate, __test } = await import("../src/index.js");
const handlers = new Map();
let provider;
activate({ on: (name, fn) => handlers.set(name, fn), registerProvider: (_id, p) => provider = p, registerTool() {} });
const store = new SessionCheckpoints();
after(() => rmSync(dir, { recursive: true, force: true }));
const history = [
	{ role: "user", timestamp: 1, content: "question" },
	{ role: "assistant", timestamp: 2, content: [{ type: "text", text: "answer" }], usage: { input: 99 } },
];
const identity = { piSessionId: "pi-one", cwd: process.cwd(), claudeConfigDir: dir };
const sessionId = "cc-one";
const transcript = getSessionPath(sessionId, identity.cwd, dir);
mkdirSync(dirname(transcript), { recursive: true });
const original = '{"uuid":"first","text":"abc"}\n{"uuid":"last"}\n';
writeFileSync(transcript, original);
const checkpoint = () => ({
	schemaVersion: 1, status: "clean", ...identity, sessionId, cursor: 1,
	proof: { length: 2, digest: piPrefixDigest(history) },
	transcript: transcriptFingerprint(transcript),
	epoch: { recorded: "A", effective: "B", uncertain: true },
	updatedAt: Date.now(),
});

test("a completed turn, including the final assistant beyond cursor, validates after a JSON round trip", () => {
	const value = JSON.parse(JSON.stringify(checkpoint()));
	assert.deepEqual(validate(value, { ...identity, priorMessages: JSON.parse(JSON.stringify(history)) }), { ok: true, checkpoint: value });
	const store = new SessionCheckpoints(dir);
	store.write(identity.piSessionId, value);
	assert.deepEqual(store.load(identity.piSessionId), value);
});

for (const [name, change, reason] of [
	["fork/different Pi id", (c) => c.piSessionId = "fork", "pi-session-id"],
	["cwd mismatch", (c) => c.cwd = "/other", "cwd"],
	["config mismatch", (c) => c.claudeConfigDir = "/other", "claude-config-dir"],
	["in-flight", (c) => c.status = "in-flight", "status"],
	["invalid", (c) => c.status = "invalid", "status"],
	["unknown schema", (c) => c.schemaVersion = 2, "schema-version"],
	["size mismatch", (c) => c.transcript.size++, "cc-size"],
	["last-id mismatch", (c) => c.transcript.lastUuid = "other", "cc-last-uuid"],
	["digest mismatch", (c) => c.transcript.digest = "0".repeat(64), "cc-digest"],
]) test(`rejects ${name}`, () => {
	const value = checkpoint();
	change(value);
	assert.deepEqual(validate(value, { ...identity, priorMessages: history }), { ok: false, reason });
});

for (const index of [0, 1]) test(`rejects ${index ? "final-assistant-only" : "same-metadata content-only"} change`, () => {
	const changed = structuredClone(history);
	if (index) changed[index].content[0].text = "edited";
	else changed[index].content = "edited";
	assert.deepEqual(validate(checkpoint(), { ...identity, priorMessages: changed }), { ok: false, reason: "pi-prefix-digest" });
});
test("rejects a longer or shorter Pi prefix", () => {
	for (const priorMessages of [history.slice(0, 1), [...history, history[0]]])
		assert.equal(validate(checkpoint(), { ...identity, priorMessages }).reason, "pi-prefix-length");
});
test("rejects missing transcript and equal-size interior edits retaining the last uuid", () => {
	const value = checkpoint();
	try {
		writeFileSync(transcript, original.replace("abc", "xyz"));
		assert.equal(validate(value, { ...identity, priorMessages: history }).reason, "cc-digest");
		rmSync(transcript);
		assert.equal(validate(value, { ...identity, priorMessages: history }).reason, "cc-missing-or-unreadable");
	} finally { writeFileSync(transcript, original); }
});
test("canonical digest covers all model content, ignores usage/details and sorts nested arguments", () => {
	const messages = [...history, { role: "assistant", timestamp: 3, content: [
		{ type: "thinking", thinking: "reason", thinkingSignature: "sig" },
		{ type: "toolCall", id: "tool", name: "read", arguments: { b: 2, a: 1 } },
	] }, { role: "toolResult", timestamp: 4, toolCallId: "tool", toolName: "read", isError: false, content: [
		{ type: "text", text: "file" }, { type: "image", data: "abc", mimeType: "image/png" },
	], details: { hidden: true } }];
	const copy = JSON.parse(JSON.stringify(messages));
	copy[1].usage.input++;
	copy[3].details = {};
	copy[2].content[1].arguments = { a: 1, b: 2 };
	assert.equal(piPrefixDigest(copy), piPrefixDigest(messages));
	for (const mutate of [
		(m) => m[2].content[0].thinking = "different",
		(m) => m[2].content[0].thinkingSignature = "different",
		(m) => m[2].content[1].id = "different",
		(m) => m[2].content[1].arguments.a++,
		(m) => m[3].toolCallId = "different",
		(m) => m[3].toolName = "different",
		(m) => m[3].isError = true,
		(m) => m[3].content[1].data = "different",
		(m) => m[3].content[1].mimeType = "image/jpeg",
	]) {
		const changed = structuredClone(messages);
		mutate(changed);
		assert.notEqual(piPrefixDigest(changed), piPrefixDigest(messages));
	}
});
test("publication waits for exit and cannot overwrite a later invalidation", async () => {
	const store = new SessionCheckpoints(join(dir, "race"));
	const generation = store.invalidate(identity.piSessionId);
	let exit;
	const exited = new Promise((resolve) => exit = resolve);
	let built = false;
	const pending = store.publish(identity.piSessionId, generation, exited, () => { built = true; return checkpoint(); });
	assert.equal(store.load(identity.piSessionId), undefined);
	store.invalidate(identity.piSessionId);
	exit(true);
	assert.equal(await pending, false);
	assert.equal(built, false);
	assert.equal(store.load(identity.piSessionId), undefined);
});

function startSession(persisted = true) {
	__test.resetSharedSession();
	handlers.get("session_start")({ reason: "resume" }, { sessionManager: {
		getSessionId: () => identity.piSessionId, getSessionFile: () => persisted ? join(dir, "pi.jsonl") : undefined,
	}, ui: {} });
}
function capture(append) {
	const systemPrompt = `captured-${append}`;
	handlers.get("before_agent_start")({ systemPrompt, systemPromptOptions: { appendSystemPrompt: append } });
	return systemPrompt;
}
function mockQuery(calls, spawnArgs) {
	__test.setQuery(({ prompt, options }) => {
		const call = { options, outputs: [] };
		calls.push(call);
		if (spawnArgs) options.spawnClaudeCodeProcess(spawnArgs(options));
		const result = (async function* () {
			await prompt[Symbol.asyncIterator]().next();
			yield { type: "system", subtype: "init", session_id: options.resume ?? sessionId };
			for (const hook of options.hooks?.UserPromptSubmit.flatMap((h) => h.hooks) ?? [])
				call.outputs.push(await hook({ hook_event_name: "UserPromptSubmit", session_id: options.resume }, undefined, { signal: new AbortController().signal }));
			yield { type: "result", subtype: "success", is_error: false, result: "OK" };
		})();
		result.close = () => {};
		result.interrupt = async () => {};
		return result;
	});
}
after(() => __test.setQuery(null));
test("lazy restore resumes the same CC id, recorded append and epoch without importing history", async () => {
	startSession();
	const value = checkpoint();
	value.epoch = { recorded: "recorded append A", effective: "effective append B", uncertain: true };
	store.write(identity.piSessionId, value);
	const calls = [];
	mockQuery(calls);
	const systemPrompt = capture("effective append B");
	const messages = [...structuredClone(history), { role: "user", content: "next", timestamp: 5 }];
	const result = await provider.streamSimple(provider.models[0], { systemPrompt, messages, tools: [] }, { sessionId: identity.piSessionId }).result();
	await new Promise(setImmediate);
	assert.equal(calls[0].options.resume, sessionId);
	assert.equal(calls[0].options.systemPrompt.append, "recorded append A");
	assert.match(calls[0].outputs[0].hookSpecificOutput.additionalContext, /full current appended instructions/);
	assert.match(calls[0].outputs[0].hookSpecificOutput.additionalContext, /effective append B/);
	assert.equal(transcriptFingerprint(transcript).digest, value.transcript.digest, "restore must not import/rewrite the CC transcript");
	assert.equal(store.load(identity.piSessionId), undefined, "query start invalidates even when mocked transport cannot prove exit");
	messages.push(result, { role: "user", content: "update instructions", timestamp: 6 });
	const updated = await provider.streamSimple(provider.models[0], { systemPrompt: capture("new append C"), messages, tools: [] }, { sessionId: identity.piSessionId }).result();
	await new Promise(setImmediate);
	assert.equal(calls[1].options.resume, sessionId);
	assert.match(calls[1].outputs[0].hookSpecificOutput.additionalContext, /new append C/);
	messages.push(updated, { role: "user", content: "unchanged instructions", timestamp: 7 });
	await provider.streamSimple(provider.models[0], { systemPrompt: capture("new append C"), messages, tools: [] }, { sessionId: identity.piSessionId }).result();
	assert.equal(calls[2].options.hooks, undefined, "restored epoch commits new updates normally");
});

test("clean publication binds finalized Pi assistant and waits for a delayed final CC write after close", async () => {
	startSession();
	store.write(identity.piSessionId, checkpoint());
	const calls = [];
	const lateRecord = '{"uuid":"late","text":"flushed at exit"}\n';
	mockQuery(calls, () => {
		assert.equal(store.load(identity.piSessionId), undefined, "invalidated before CC starts");
		return {
			command: process.execPath,
			args: ["-e", `setTimeout(() => { require('node:fs').appendFileSync(${JSON.stringify(transcript)}, ${JSON.stringify(lateRecord)}); process.exit(0); }, 120)`],
			env: process.env,
			signal: new AbortController().signal,
		};
	});
	const messages = [...structuredClone(history), { role: "user", content: "next", timestamp: 5 }];
	const result = await provider.streamSimple(provider.models[0], { systemPrompt: capture("A"), messages, tools: [] }, { sessionId: identity.piSessionId }).result();
	const saved = store.load(identity.piSessionId);
	assert.equal(saved.transcript.lastUuid, "late");
	assert.equal(saved.cursor, 3);
	assert.equal(saved.proof.length, 4);
	assert.equal(saved.proof.digest, piPrefixDigest([...messages, result]));
	assert.deepEqual(validate(saved, { ...identity, priorMessages: JSON.parse(JSON.stringify([...messages, result])) }), { ok: true, checkpoint: saved });
	writeFileSync(transcript, original);
});

test("a non-persisted Pi session skips restore and publication", async () => {
	startSession(false);
	store.write(identity.piSessionId, checkpoint());
	const calls = [];
	mockQuery(calls);
	const messages = [...structuredClone(history), { role: "user", content: "next", timestamp: 5 }];
	await provider.streamSimple(provider.models[0], { systemPrompt: capture("A"), messages, tools: [] }, { sessionId: identity.piSessionId }).result();
	assert.notEqual(calls[0].options.resume, sessionId);
	assert.equal(store.load(identity.piSessionId), undefined);
});

test("rejected restore uses the existing rebuild and removes the stale checkpoint", async () => {
	startSession();
	store.write(identity.piSessionId, checkpoint());
	const calls = [];
	mockQuery(calls);
	const messages = [...structuredClone(history), { role: "user", content: "next", timestamp: 5 }];
	messages[1].content[0].text = "edited final assistant";
	await provider.streamSimple(provider.models[0], { systemPrompt: capture("A"), messages, tools: [] }, { sessionId: identity.piSessionId }).result();
	assert.notEqual(calls[0].options.resume, sessionId);
	assert.equal(store.load(identity.piSessionId), undefined);
});

for (const event of ["session_compact", "session_tree"]) test(`${event} deletes a checkpoint even after memory was cleared`, () => {
	startSession();
	store.write(identity.piSessionId, checkpoint());
	handlers.get(event)({}, { sessionManager: { getSessionId: () => identity.piSessionId } });
	assert.equal(store.load(identity.piSessionId), undefined);
});

test("needsRebuild and forceRotate delete a checkpoint", () => {
	for (const flag of ["needsRebuild", "forceRotate"]) {
		startSession();
		store.write(identity.piSessionId, checkpoint());
		__test.setSharedSession(identity.piSessionId, { sessionId, cursor: 1, cwd: identity.cwd, [flag]: true });
		assert.equal(store.load(identity.piSessionId), undefined);
	}
});

test("abort while waiting for confirmed exit cannot publish or report clean completion", async () => {
	startSession();
	store.write(identity.piSessionId, checkpoint());
	const controller = new AbortController();
	const calls = [];
	mockQuery(calls, () => ({ command: process.execPath, args: ["-e", "setTimeout(() => process.exit(0), 120)"], env: process.env, signal: new AbortController().signal }));
	const result = provider.streamSimple(provider.models[0], { systemPrompt: capture("A"), messages: [...structuredClone(history), { role: "user", content: "next", timestamp: 5 }], tools: [] }, { sessionId: identity.piSessionId, signal: controller.signal }).result();
	setTimeout(() => controller.abort(), 50);
	assert.equal((await result).stopReason, "aborted");
	assert.equal(store.load(identity.piSessionId), undefined);
});

test("fingerprints transcripts whose final metadata record has no uuid", () => {
	try {
		writeFileSync(transcript, original + '{"type":"metadata","value":1}\n');
		const value = checkpoint();
		assert.equal(value.transcript.lastUuid, null);
		assert.equal(validate(value, { ...identity, priorMessages: history }).ok, true);
	} finally { writeFileSync(transcript, original); }
});

test("epoch import preserves recorded/effective/uncertain field-wise and does not alias the snapshot", async () => {
	const { AppendInstructions } = await import("../src/append-instructions.js");
	const epochs = new AppendInstructions();
	const epoch = { recorded: "recorded", effective: "effective", uncertain: true };
	epochs.import(sessionId, epoch);
	epoch.effective = "mutated outside";
	assert.deepEqual(epochs.export(sessionId), { recorded: "recorded", effective: "effective", uncertain: true });
	const hooks = epochs.hooks(sessionId, "effective", () => true);
	assert.ok(hooks, "uncertainty forces replacement even at the old effective value");
});

test("atomic replacement and opportunistic pruning retain recent checkpoints only", async () => {
	const { readdirSync, utimesSync } = await import("node:fs");
	const local = new SessionCheckpoints(join(dir, "prune"));
	local.write("old", checkpoint());
	local.write("recent", checkpoint());
	const updated = { ...checkpoint(), epoch: { recorded: "updated", effective: "updated", uncertain: false } };
	local.write("recent", updated);
	assert.deepEqual(local.load("recent"), updated);
	const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
	utimesSync(local.path("old"), old, old);
	local.prune();
	assert.equal(local.load("old"), undefined);
	assert.deepEqual(local.load("recent"), updated);
	assert.equal(readdirSync(local.directory).length, 1, "no abandoned temporary files");
});

test("a query error deletes its checkpoint", async () => {
	startSession();
	store.write(identity.piSessionId, checkpoint());
	__test.setQuery(({ prompt }) => {
		assert.equal(store.load(identity.piSessionId), undefined, "invalidated before submission");
		const query = (async function* () {
			await prompt[Symbol.asyncIterator]().next();
			yield { type: "system", subtype: "init", session_id: sessionId };
			throw new Error("transport failure");
		})();
		query.close = () => {};
		query.interrupt = async () => {};
		return query;
	});
	const output = await provider.streamSimple(provider.models[0], { systemPrompt: capture("A"), messages: [...structuredClone(history), { role: "user", content: "next", timestamp: 5 }], tools: [] }, { sessionId: identity.piSessionId }).result();
	assert.equal(output.stopReason, "error");
	assert.equal(store.load(identity.piSessionId), undefined);
});

test("a tool-result continuation checkpoints the latest Pi history plus its final assistant", async () => {
	startSession();
	store.write(identity.piSessionId, checkpoint());
	let continueQuery;
	const continued = new Promise((resolve) => continueQuery = resolve);
	__test.setQuery(({ prompt, options }) => {
		options.spawnClaudeCodeProcess({ command: process.execPath, args: ["-e", "setTimeout(() => process.exit(0), 120)"], env: process.env, signal: new AbortController().signal });
		const query = (async function* () {
			await prompt[Symbol.asyncIterator]().next();
			yield { type: "system", subtype: "init", session_id: options.resume };
			yield { type: "assistant", message: { content: [{ type: "tool_use", id: "tool-next", name: "mcp__custom-tools__read", input: { path: "file" } }] } };
			await continued;
			yield { type: "result", subtype: "success", is_error: false, result: "after tool" };
		})();
		query.close = () => {};
		query.interrupt = async () => {};
		return query;
	});
	const systemPrompt = capture("A");
	const tools = [{ name: "read", description: "Read", parameters: { type: "object", properties: { path: { type: "string" } } } }];
	const messages = [...structuredClone(history), { role: "user", content: "read file", timestamp: 5 }];
	const toolAssistant = await provider.streamSimple(provider.models[0], { systemPrompt, messages, tools }, { sessionId: identity.piSessionId }).result();
	assert.equal(toolAssistant.stopReason, "toolUse");
	assert.equal(store.load(identity.piSessionId), undefined, "no checkpoint at a tool boundary");
	messages.push(toolAssistant, { role: "toolResult", toolCallId: "tool-next", toolName: "read", content: [{ type: "text", text: "file data" }], isError: false, timestamp: 6 });
	const finalResult = provider.streamSimple(provider.models[0], { systemPrompt, messages, tools }, { sessionId: identity.piSessionId }).result();
	continueQuery();
	const finalAssistant = await finalResult;
	const saved = store.load(identity.piSessionId);
	assert.equal(saved.cursor, 5);
	assert.equal(saved.proof.length, 6);
	assert.equal(saved.proof.digest, piPrefixDigest([...messages, finalAssistant]));
});

test("malformed field types cannot masquerade as a known checkpoint schema", () => {
	const value = checkpoint();
	value.sessionId = [sessionId];
	assert.equal(validate(value, { ...identity, priorMessages: history }).ok, false);
});
