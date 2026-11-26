// Script only the external SDK; use real child exits and cc-session-io files.
import { it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createSession, getSessionPath } from "cc-session-io";
import { digestMessages } from "../src/message-digests.js";
import { loadSessionState, saveSessionState } from "../src/session-store.js";
import { diagLogPath } from "../src/log-paths.js";
// Doubles as the cwd for spawned children and scratch files, so it must exist.
const root = process.env.CLAUDE_CONFIG_DIR;
mkdirSync(root, { recursive: true });
const mod = await import("../src/index.js");
const { __test } = mod;
let provider;
const handlers = {};
mod.default({ on: (name, fn) => { (handlers[name] ??= []).push(fn); }, registerProvider: (_id, value) => { provider = value; } });
const model = provider.models[0];
const tools = [{ name: "read", description: "read", parameters: { type: "object", properties: {} } }];
const user = (content) => ({ role: "user", content, timestamp: 1 });
const toolResult = { role: "toolResult", toolCallId: "X", content: [{ type: "text", text: "file" }], timestamp: 1 };
const call = (messages, signal, sessionId = "pi", callModel = model) => provider.streamSimple(callModel, { messages, tools }, { sessionId, signal });
const say = (text) => ({ role: "assistant", content: [{ type: "text", text }], provider: model.provider, timestamp: 1 });
const sessionsDir = () => join(process.env.PI_CODING_AGENT_DIR, "claude-bridge", "sessions");
const persisted = (id = "pi") => loadSessionState(id, assert.fail);
const stored = (state) => ({ ...state, dirtyTail: true });
const tick = () => new Promise(setImmediate);
let scripts, calls;
const reloadedModules = [];

beforeEach(() => {
	__test.resetSharedSession();
	__test.activeQueryContexts.clear();
	scripts = [];
	calls = [];
	__test.setQuery(fakeQuery);
});
function fakeQuery({ options, prompt }) {
	const script = scripts.shift();
	assert.ok(script, "queued external SDK script");
	const id = options.sessionId ?? options.resume;
	const path = getSessionPath(id, options.cwd, root);
	let parent = null;
	if (options.forkSession) {
		const source = readFileSync(getSessionPath(options.resume, options.cwd, root), "utf8").trim().split("\n").map(JSON.parse);
		const cut = source.findIndex((r) => r.uuid === options.resumeSessionAt);
		assert.ok(cut >= 0);
		const kept = source.slice(0, cut + 1).map((r) => ({ ...r, sessionId: id }));
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, kept.map((r) => JSON.stringify(r) + "\n").join(""));
	}
	if (existsSync(path)) parent = readFileSync(path, "utf8").trim().split("\n").map(JSON.parse).filter((r) => r.uuid).at(-1)?.uuid;
	// A deferred record reaches the file only when the child handles SIGTERM.
	const pending = `${path}.pending`;
	const record = (role, content, uuid, deferred = false) => {
		const builder = createSession({ projectPath: options.cwd, sessionId: id });
		if (role === "assistant") builder.addAssistantMessage(content);
		else builder.addUserMessage(content);
		const value = { ...builder.records[0], ...(uuid ? { uuid } : {}), parentUuid: parent };
		parent = value.uuid;
		mkdirSync(dirname(path), { recursive: true });
		appendFileSync(deferred ? pending : path, JSON.stringify(value) + "\n");
		return value;
	};
	const childCode = `const fs=require('fs'),crypto=require('crypto'); const stop=()=>{if(${Boolean(script.hang)})return;setTimeout(()=>{const q=${JSON.stringify(pending)};if(fs.existsSync(q)){fs.appendFileSync(${JSON.stringify(path)},fs.readFileSync(q));fs.unlinkSync(q);}if(${Boolean(script.late)}){const p=${JSON.stringify(path)};const r=fs.readFileSync(p,'utf8').trim().split('\\n').map(JSON.parse).filter(r=>r.uuid).at(-1);fs.appendFileSync(p,JSON.stringify({type:'attachment',uuid:crypto.randomUUID(),parentUuid:r.uuid,sessionId:${JSON.stringify(id)},attachment:{type:'interrupted',text:'late-exit-marker'}})+'\\n');}process.exit(0)},${script.late ? 60 : 0})};process.on('SIGTERM',stop);process.stdin.on('data',stop);process.${script.cleanup ? "stderr" : "stdout"}.write('READY\\n');setInterval(()=>{},1000);`;
	const child = options.spawnClaudeCodeProcess({ command: process.execPath, args: ["-e", childCode], cwd: root, env: process.env, signal: new AbortController().signal });
	// Windows SIGTERM force-kills Node without running its handlers. Use the
	// fixture's stdin shutdown protocol there to exercise real late flush/close.
	if (process.platform === "win32") {
		const kill = child.kill.bind(child);
		child.kill = (signal) => {
			if (signal !== "SIGTERM") return kill(signal);
			if (!child.killed) child.stdin.write("stop");
			child.killed = true;
			return true;
		};
	}

	const ready = once(script.cleanup ? child.stderr : child.stdout, "data");
	const exited = once(child, "close");
	let release, stopped = false;
	const parked = new Promise((r) => { release = r; });
	const entry = { options, path, exited, child, closeCalls: 0 };
	calls.push(entry);
	const gen = (async function* () {
		await ready;
		if (script.pause) await script.pause;
		const input = typeof prompt === "string" ? null : prompt[Symbol.asyncIterator]();
		const initial = input ? (await input.next()).value : { message: { content: prompt } };
		if (input) void (async () => {
			for await (const _ of input) { /* Drain stdin like the SDK transport. */ }
		})().catch(() => {});
		entry.pulled = true;
		entry.promptUuid = initial.uuid;
		// CC pulled the prompt from stdin, then dies booting: no record, no replay.
		if (script.boot) { await parked; return; }
		record("user", initial.message.content, initial.uuid);
		if (!script.preInit) yield { type: "system", subtype: "init", session_id: id };
		if (!script.preInit && input) yield { type: "user", isReplay: true, parent_tool_use_id: null, uuid: initial.uuid, session_id: id, message: initial.message };
		if (script.tool) {
			const value = record("assistant", [{ type: "tool_use", id: script.toolId ?? "X", name: "mcp__custom-tools__read", input: {} }], undefined, script.deferTool);
			yield { type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id: "tool-api" } } };
			yield { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_start", index: 0, content_block: value.message.content[0] } };
			yield { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_stop", index: 0 } };
			yield { type: "assistant", parent_tool_use_id: null, uuid: value.uuid, message: { id: "tool-api", model: model.id, content: value.message.content } };
			yield { type: "stream_event", parent_tool_use_id: null, event: { type: "message_stop" } };
			await parked;
			if (stopped) return;
		}
		if (script.cleanup) {
			try {
				if (script.rejection) {
					const block = { type: "tool_use", id: "never-dispatched", name: "mcp__custom-tools__read", input: {} };
					const value = record("assistant", [block]);
					const apiId = "rejected-api-step";
					if (script.rejection === "streaming") {
						// Base recognizes the streamed call before message_stop, but
						// would publish immediately if fed the fallback frame alone.
						yield { type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id: apiId } } };
						yield { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_start", index: 0, content_block: block } };
					}
					yield { type: "assistant", parent_tool_use_id: null, uuid: value.uuid, message: { id: apiId, model: model.id, stop_reason: "tool_use", content: [block] } };
					const result = { type: "tool_result", tool_use_id: block.id, is_error: true, content: "CC refused the unhanded call" };
					record("user", [result], "cc-rejected-record");
					yield { type: "user", parent_tool_use_id: null, uuid: "cc-rejected-record", message: { role: "user", content: [result] } };
				} else {
					yield { type: "result", subtype: "error_during_execution", is_error: true, errors: ["ordinary SDK error held at return"], session_id: id };
				}
				assert.fail("the iterator must be closed at the intended failure");
			} finally {
				script.cleanup.entered.resolve();
				await script.cleanup.release.promise;
				script.cleanup.returned.resolve();
			}
			return;
		}
		if (script.sessionDamage) {
			const answer = { type: "text", text: "answer without a transcript record" };
			const reset = script.sessionDamage === "reset";
			if (reset) yield { type: "conversation_reset", session_id: id, new_conversation_id: "new-conversation" };
			yield { type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id: "api-damaged-answer" } } };
			yield { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_start", index: 0, content_block: answer } };
			yield { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_stop", index: 0 } };
			yield { type: "assistant", parent_tool_use_id: null, uuid: "missing-answer-record", session_id: reset ? "new-conversation" : id,
				message: { id: "api-damaged-answer", model: model.id, content: [answer] } };
			yield { type: "stream_event", parent_tool_use_id: null, event: { type: "message_stop" } };
			yield { type: "result", subtype: "success", is_error: false, result: answer.text, session_id: id };
			if (!reset) yield { type: "system", subtype: "session_writes_lost", lost: ["transcript"], transcript_session_ids: [id], error_code: "ENOSPC", session_id: id };
			return;
		}
		if (!script.error) {
			const value = record("assistant", [{ type: "text", text: "answer" }]);
			yield { type: "assistant", parent_tool_use_id: null, uuid: value.uuid, message: { id: `answer-${id}`, model: model.id, content: value.message.content } };
		}
		yield { type: "result", subtype: "success", is_error: Boolean(script.error), result: script.error ?? "answer", session_id: id };
	})();
	gen.interrupt = async () => {};
	gen.close = () => { entry.closeCalls++; stopped = true; release(); if (!child.killed) child.kill("SIGTERM"); };
	return gen;
}
afterEach(async () => {
	__test.setQuery(null);
	for (const fresh of reloadedModules.splice(0)) {
		fresh.__test.setQuery(null);
	}
	for (const call of calls) if (call.child.exitCode === null && call.child.signalCode === null) call.child.kill("SIGKILL");
	await Promise.all(calls.map((c) => c.exited));
	await tick();
});

// Copy this test file unchanged into a detached a41cfa92 worktree and set
// CLAUDE_BRIDGE_ROUND11_BASE=1 when running only these comparison cases.
const round11Base = process.env.CLAUDE_BRIDGE_ROUND11_BASE === "1";
for (const scenario of ["SDK error", "SDK error with same-session continuation", "CC rejection", "ordinary streaming rejection control"]) {
	if (round11Base && scenario.endsWith("control")) continue;
	it(`round 11 blocked cleanup: ${scenario}`, { timeout: 7000 }, async (t) => {
		const cleanup = { entered: Promise.withResolvers(), release: Promise.withResolvers(), returned: Promise.withResolvers() };
		const nextReady = Promise.withResolvers();
		const reject = !scenario.startsWith("SDK error");
		const fallback = scenario === "CC rejection" && !round11Base;
		// A fresh same-session call supersedes the still-open SDK error on base.
		// Measure it separately so it cannot mask natural terminal/shutdown behavior.
		const tryNextWhileHeld = scenario !== "SDK error";
		const ask = user("old prompt");
		scripts.push({});
		const answer = await call([ask]).result();
		assert.equal(answer.stopReason, "stop");
		const prefix = persisted();
		assert.equal(prefix.uuids.length, 2);
		const history = [ask, answer, user("acknowledged prompt")];
		scripts.push({ cleanup, rejection: reject ? fallback ? "fallback" : "streaming" : undefined });
		const stream = call(history);
		const owner = [...__test.activeQueryContexts].find((context) => context.currentPiStream === stream);
		const events = [];
		const delivered = (async () => { for await (const event of stream) events.push(event); })();
		const count = () => events.filter(({ type }) => type === "error" || type === "done").length;
		const snapshot = (entry) => ({
			terminal: count(),
			closeRequested: entry.closeCalls > 0,
			childExited: entry.child.exitCode !== null || entry.child.signalCode !== null,
			memory: __test.getSharedSession("pi")?.uuids.length,
			disk: persisted()?.uuids.length,
			nextLaunched: calls.length === 3,
		});
		try {
			await cleanup.entered.promise;
			const entry = calls[1];
			assert.ok(entry.promptUuid, "the third record is the SDK's acknowledged prompt");
			const expectedUuids = [...prefix.uuids, entry.promptUuid];
			const transcript = readFileSync(entry.path, "utf8").trim().split("\n").map(JSON.parse);
			assert.deepEqual(transcript.filter((record) => expectedUuids.includes(record.uuid)).map(({ uuid }) => uuid), expectedUuids);
			assert.equal(owner.dispatchedToolCalls.size, 0, "no handler ever dispatched the rejected id");
			if (!reject) assert.equal(owner.sawResult, true, "the reducer reached the error result on both revisions");
			await tick();
			const cause = reject ? /Claude Code rejected.*CC refused the unhanded call/ : /ordinary SDK error held at return/;
			// Base records the ordinary SDK cause on its output but does not deliver it.
			assert.match(events.find(({ type }) => type === "error")?.error.errorMessage ?? owner.turnOutput.errorMessage, cause);
			const heldAtEntry = snapshot(entry);
			const waitForExit = async () => {
				const timer = new AbortController();
				try { await Promise.race([entry.exited, delay(1000, undefined, { signal: timer.signal })]); }
				finally { timer.abort(); }
				await tick();
			};
			await waitForExit();
			const heldBeforeNext = snapshot(entry);
			const heldMemory = __test.getSharedSession("pi")?.uuids;
			const heldDisk = persisted()?.uuids;
			// Measure next-query progress without letting its snapshot replace the one under test.
			const continueSession = () => {
				scripts.push({ pause: nextReady.promise });
				return call([...history, user("same-session continuation")]);
			};
			const next = tryNextWhileHeld ? continueSession() : undefined;
			if (next) await waitForExit();
			const held = snapshot(entry);
			cleanup.release.resolve();
			await Promise.all([cleanup.returned.promise, delivered, entry.exited]);
			await tick();
			const released = snapshot(entry);
			const releasedMemory = __test.getSharedSession("pi")?.uuids;
			const releasedDisk = persisted()?.uuids;
			nextReady.resolve();
			const nextResult = (await (next ?? continueSession()).result()).stopReason;
			t.diagnostic(JSON.stringify({ setup: reject ? fallback ? "fallback" : "streaming" : "result", heldAtEntry, heldBeforeNext, held, released, nextResult,
				events: events.map(({ type }) => type), capturedUndispatchedResult: releasedMemory?.includes("cc-rejected-record") || releasedDisk?.includes("cc-rejected-record") }));
			assert.deepEqual(events.filter(({ type }) => type === "error" || type === "done").map(({ type }) => type), ["error"]);
			if (fallback) assert.deepEqual(events.map(({ type }) => type), ["error"], "no staged event or result escapes");
			assert.match(events.at(-1).error.errorMessage, round11Base && !reject && tryNextWhileHeld ? /Conversation replaced/ : cause);
			assert.equal(nextResult, "stop");
			assert.equal(heldBeforeNext.terminal, round11Base && !reject ? 0 : 1);
			assert.equal(heldAtEntry.closeRequested, !round11Base || reject, "SDK close requested before iterator cleanup can block");
			assert.equal(heldBeforeNext.childExited, !round11Base || reject, "real child exit while iterator cleanup is held");
			assert.equal(held.nextLaunched, tryNextWhileHeld, "following same-session call is not stuck behind held cleanup");
			assert.deepEqual(heldMemory, round11Base && !reject ? prefix.uuids : expectedUuids, "memory at held checkpoint");
			assert.deepEqual(heldDisk, !round11Base && (!reject || fallback) ? expectedUuids : prefix.uuids, "disk at held checkpoint");
			assert.deepEqual(releasedMemory, expectedUuids, "only the acknowledged prefix survives release");
			assert.deepEqual(releasedDisk, expectedUuids, "the acknowledged prefix is saved within the matched release bound");
		} finally {
			cleanup.release.resolve();
			nextReady.resolve();
		}
	});
}

for (const { name, prior, selected, expected } of [
	{ name: "a same-length edit", prior: [user("SECRET_BEFORE_REWRITE")],
		selected: [user("SELECTED_AFTER_REWRITE")], expected: "SELECTED_AFTER_REWRITE" },
	{ name: "shortened history", prior: [user("SECRET_BEFORE_REWRITE"), say("prior answer"), user("read")],
		selected: [user("read")], expected: "read" },
]) it(`${name} replaces the waiting query without a rewrite event`, { timeout: 5000 }, async () => {
	scripts.push({ tool: true });
	const tool = await call(prior).result();
	const ancestor = readFileSync(calls[0].path);
	scripts.push({});
	const next = call([...selected, tool, toolResult]);
	assert.equal(calls[0].child.killed, true, "the stale writer must stop");
	assert.equal((await next.result()).stopReason, "stop");
	assert.equal(calls.length, 2);
	assert.notEqual(calls[1].path, calls[0].path);
	assert.deepEqual(readFileSync(calls[0].path), ancestor);
	const records = readFileSync(calls[1].path, "utf8").trim().split("\n").map(JSON.parse);
	const blocks = records.flatMap((r) => Array.isArray(r.message?.content) ? r.message.content : []);
	assert.ok(records.some((r) => r.message?.content === expected)
		|| blocks.some((b) => b.type === "text" && b.text === expected));
	assert.doesNotMatch(JSON.stringify(records), /SECRET_BEFORE_REWRITE/);
	assert.equal(blocks.filter((b) => b.type === "tool_result" && b.tool_use_id === "X").length, 1);
});

for (const steering of [false, true]) it(`unchanged history reuses its waiting query${steering ? " with steering" : ""}`, { timeout: 5000 }, async () => {
	const ask = user("read");
	scripts.push({ tool: true });
	const tool = await call([ask]).result();
	const [parked] = __test.activeQueryContexts;
	call([ask, tool, toolResult, ...(steering ? [user("steer")] : [])]);
	await tick();
	assert.equal(calls.length, 1);
	assert.equal(calls[0].child.killed, false);
	assert.equal(parked.discarded, false);
	assert.ok(__test.activeQueryContexts.has(parked));
	assert.equal(parked.pendingResults.get("X").content[0].text, "file");
});

it("another session survives a history rewrite", { timeout: 5000 }, async () => {
	scripts.push({ tool: true });
	const tool = await call([user("SECRET_BEFORE_REWRITE")]).result();
	const siblingAsk = user("sibling");
	scripts.push({});
	const siblingAnswer = await call([siblingAsk], undefined, "other").result();
	const saved = __test.getSharedSession("other");
	scripts.push({ tool: true, toolId: "OTHER" });
	await call([siblingAsk, siblingAnswer, user("read")], undefined, "other").result();
	const sibling = calls.at(-1);
	const parked = [...__test.activeQueryContexts].find((c) => c.piSessionId === "other");
	const before = readFileSync(sibling.path);
	scripts.push({});
	assert.equal((await call([user("SELECTED_AFTER_REWRITE"), tool, toolResult]).result()).stopReason, "stop");
	assert.equal(calls.length, 4);
	assert.ok(__test.activeQueryContexts.has(parked));
	assert.equal(parked.discarded, false);
	assert.equal(sibling.child.killed, false);
	assert.strictEqual(__test.getSharedSession("other"), saved);
	assert.deepEqual(readFileSync(sibling.path), before);
});

it("another session's copy of a tool result never enters this session's waiting query", { timeout: 5000 }, async () => {
	const ask = user("read");
	scripts.push({ tool: true });
	const tool = await call([ask]).result();
	const [parked] = __test.activeQueryContexts;
	scripts.push({});
	assert.equal((await call([ask, tool, toolResult], undefined, "fork").result()).stopReason, "stop");
	assert.equal(calls.length, 2, "the fork runs its own query");
	assert.equal(calls[0].child.killed, false);
	assert.equal(parked.discarded, false);
	assert.equal(parked.pendingResults.size, 0);
});

it("continuation digest failures report provider errors instead of throwing", { timeout: 5000 }, async () => {
	const ask = user("read");
	scripts.push({ tool: true });
	const tool = await call([ask]).result();
	const invalid = { ...tool, content: [{ type: "toolCall", id: "X", name: "read", arguments: { value: NaN } }] };
	let next;
	assert.doesNotThrow(() => { next = call([ask, invalid, toolResult]); });
	const output = await next.result();
	assert.equal(output.stopReason, "error");
	assert.match(output.errorMessage, /JSON|finite/);
	assert.equal(calls.length, 1);
	assert.equal(__test.activeQueryContexts.size, 0, "the unverifiable query is discarded, not left parked");
});

it("quota retries delete each new file only after the child finishes its late writes", async () => {
	const prior = [user("prior"), { role: "assistant", content: [{ type: "text", text: "prior answer" }], provider: model.provider, timestamp: 1 }];
	for (let i = 0; i < 3; i++) {
		scripts.push({ error: "API Error: quota exceeded", late: true });
		const output = await call([...prior, user("retry")]).result();
		assert.equal(output.stopReason, "error");
		const current = calls.at(-1);
		assert.ok(existsSync(current.path), "iterator settlement must not delete a live child's file");
		assert.equal(__test.getSharedSession("pi"), null);
		assert.equal(persisted(), null, "a no-progress failure persists nothing");
		await current.exited;
		await tick();
		assert.equal(existsSync(current.path), false, "cleanup follows actual exit, including late writes");
	}
});

it("a launch that throws fails the turn and deletes the session it imported", async () => {
	let launched;
	__test.setQuery(({ options }) => { launched = options; throw new Error("spawn failed"); });
	const output = await call([user("prior"), say("prior answer"), user("retry")]).result();
	assert.equal(output.stopReason, "error");
	assert.match(output.errorMessage, /spawn failed/);
	await tick(); // The session is cleaned up after the terminal event.
	assert.ok(launched.resume, "the rebuild wrote pi's history to a file before launch");
	assert.equal(existsSync(getSessionPath(launched.resume, launched.cwd, root)), false);
	assert.equal(__test.getSharedSession("pi"), null);
	assert.equal(__test.activeQueryContexts.size, 0);
});

it("a no-progress fork failing before init deletes only its pre-minted target", async () => {
	const ask = user("warm");
	scripts.push({});
	const answer = await call([ask]).result();
	const prior = __test.getSharedSession("pi");
	const ancestor = getSessionPath(prior.ccSessionId, prior.cwd, root);
	await calls[0].exited;
	const before = readFileSync(ancestor);
	__test.markRebuildForSession("pi", "test");
	scripts.push({ preInit: true, error: "API Error: quota exceeded", late: true });
	await call([ask, answer, user("retry")]).result();
	const failed = calls.at(-1);
	assert.equal(failed.options.forkSession, true);
	assert.ok(failed.options.sessionId);
	assert.notEqual(failed.options.sessionId, prior.ccSessionId);
	assert.ok(existsSync(failed.path));
	assert.equal(__test.getSharedSession("pi").ccSessionId, prior.ccSessionId);
	await failed.exited;
	await tick();
	assert.equal(existsSync(failed.path), false);
	assert.deepEqual(readFileSync(ancestor), before);
});

it("abort commits contiguous tool progress synchronously and waits for exit before prefix-writing its source", async () => {
	const ask = user("tool"), controller = new AbortController();
	scripts.push({ tool: true, late: true });
	const tool = await call([ask], controller.signal).result();
	controller.abort();
	const captured = __test.getSharedSession("pi");
	assert.ok(captured, "onAbort synchronously publishes complete progress");
	assert.equal(captured.dirtyTail, true);
	assert.deepEqual(captured.digests, digestMessages([ask, tool]));
	assert.equal(persisted(), null, "the pointer is saved only after the child exits");
	scripts.push({});
	const next = call([ask, tool, toolResult, user("continue")]);
	await tick();
	assert.equal(calls.length, 1, "source may not be read or forked before the killed child exits");
	await next.result();
	assert.equal(calls.length, 2);
	assert.notEqual(calls[1].options.resume, captured.ccSessionId);
	assert.match(readFileSync(calls[0].path, "utf8"), /late-exit-marker/);
	assert.doesNotMatch(readFileSync(calls[1].path, "utf8"), /late-exit-marker/);
	assert.equal(calls[1].options.sessionId, undefined, "a prefix write resumes its own written id");
	assert.equal(__test.getSharedSession("pi").ccSessionId, calls[1].options.resume);
});

it("abort publishes memory at once but saves the pointer only after exit lands its deferred record", async () => {
	const ask = user("tool"), controller = new AbortController();
	scripts.push({ tool: true, late: true, deferTool: true });
	const tool = await call([ask], controller.signal).result();
	controller.abort();
	const captured = __test.getSharedSession("pi");
	assert.deepEqual(captured.digests, digestMessages([ask, tool]));
	const toolUuid = new RegExp(captured.uuids[1]);
	await tick();
	assert.doesNotMatch(readFileSync(calls[0].path, "utf8"), toolUuid, "the replayed record is not on disk yet");
	assert.equal(persisted(), null, "no pointer names an unflushed uuid");
	await calls[0].exited;
	await tick();
	assert.match(readFileSync(calls[0].path, "utf8"), toolUuid);
	assert.deepEqual(persisted(), stored(captured));
});

it("a reloaded module shares state and stopping writers, and the old finalizer never overwrites its replacement", { timeout: 5000 }, async () => {
	const ask = user("tool"), controller = new AbortController();
	scripts.push({ tool: true, hang: true });
	const tool = await call([ask], controller.signal).result();
	controller.abort();
	const committed = __test.getSharedSession("pi");
	for (const fn of handlers.session_shutdown) fn({}, { sessionManager: { getSessionId: () => "pi" } });
	const fresh = await import(`../src/index.js?reload=${Date.now()}`);
	let freshProvider;
	fresh.default({ on() {}, registerProvider: (_id, value) => { freshProvider = value; }, registerTool() {} });
	fresh.__test.setQuery(fakeQuery);
	reloadedModules.push(fresh);
	assert.strictEqual(fresh.__test.getSharedSession("pi"), committed, "the newer memory state, not the empty disk");
	const waiting = new AbortController();
	const next = freshProvider.streamSimple(model, { messages: [ask, tool, toolResult, user("next")], tools }, { sessionId: "pi", signal: waiting.signal });
	await tick();
	assert.equal(calls.length, 1, "the fresh instance waits on the old instance's stopping child");
	waiting.abort();
	assert.equal((await next.result()).stopReason, "aborted");
	const replacement = { digests: [], uuids: [], cuttable: [], ccSessionId: "cc-replacement", cwd: root, model: "replacement-model", dirtyTail: false };
	fresh.__test.setSharedSession("pi", replacement);
	saveSessionState("pi", replacement);
	calls[0].child.kill("SIGKILL");
	await calls[0].exited;
	await tick();
	assert.strictEqual(__test.getSharedSession("pi"), replacement);
	assert.deepEqual(persisted(), stored(replacement));
});

it("a fresh same-session query discards a parked query and retains its progress under CAS", async () => {
	const ask = user("tool");
	scripts.push({ tool: true, late: true });
	const tool = await call([ask]).result();
	const parked = [...__test.activeQueryContexts][0];
	scripts.push({});
	const next = call([ask, tool, user("fresh")]);
	assert.equal(parked.discarded, true);
	assert.equal(__test.getSharedSession("pi").dirtyTail, true);
	assert.deepEqual(__test.getSharedSession("pi").digests, digestMessages([ask, tool]));
	await next.result();
	assert.equal(__test.getSharedSession("pi").ccSessionId, calls[1].options.resume);
});

it("session_shutdown closes its own parked query (a terminate:true tool's) and leaves other sessions' alone", { timeout: 5000 }, async () => {
	scripts.push({ tool: true }, { tool: true, toolId: "OTHER" });
	await call([user("tool")]).result();
	await call([user("tool")], undefined, "other").result();
	const [mine, other] = calls;
	for (const fn of handlers.session_shutdown) fn({}, { sessionManager: { getSessionId: () => "pi" } });
	await mine.exited;
	assert.equal(other.child.killed, false);
	assert.deepEqual([...__test.activeQueryContexts].map((c) => c.piSessionId), ["other"]);
});


it("a synthetic durable-host continuation is grouped with its next assistant, not fabricated as a pi slot", async () => {
	const ask = user("tool"), controller = new AbortController();
	scripts.push({ tool: true });
	const tool = await call([ask], controller.signal).result();
	controller.abort();
	scripts.push({});
	const answer = await call([ask, tool, toolResult]).result();
	const state = __test.getSharedSession("pi");
	assert.deepEqual(state.digests, digestMessages([ask, tool, toolResult, answer]));
	const { readTranscript, resolveRecordingCut } = await import("../src/session-transcript.js");
	const records = readTranscript(state);
	const resultCut = resolveRecordingCut(records, state, 3);
	assert.doesNotMatch(JSON.stringify(records.slice(0, resultCut.index + 1)), /Your session was interrupted and resumed/);
	assert.match(JSON.stringify(records.slice(resultCut.index + 1)), /Your session was interrupted and resumed/);
	assert.equal(resolveRecordingCut(records, state, 4).uuid, state.uuids[3]);
});

it("a restart reloads the persisted pointer dirty and forks at its last valid cut", async () => {
	const ask = user("warm");
	scripts.push({});
	const answer = await call([ask]).result();
	const saved = __test.getSharedSession("pi");
	await calls[0].exited;
	__test.forgetSessionMemory();
	const loaded = __test.getSharedSession("pi");
	assert.notStrictEqual(loaded, saved);
	assert.deepEqual(loaded, { ...saved, dirtyTail: true });
	scripts.push({});
	await call([ask, answer, user("next")]).result();
	assert.equal(calls[1].options.forkSession, true);
	assert.equal(calls[1].options.resume, saved.ccSessionId);
	assert.equal(calls[1].options.resumeSessionAt, saved.uuids.at(-1));
	assert.equal(persisted().ccSessionId, calls[1].options.sessionId);
	assert.equal(__test.getSharedSession("pi").dirtyTail, false);
});

it("a restart on another model imports pi's history instead of reusing the pointer", async () => {
	const other = provider.models.find((m) => m.id !== model.id);
	const ask = user("warm");
	scripts.push({});
	const answer = await call([ask]).result();
	const saved = persisted();
	await calls[0].exited;
	__test.forgetSessionMemory();
	scripts.push({});
	await call([ask, answer, user("next")], undefined, "pi", other).result();
	assert.equal(calls[1].options.forkSession, undefined);
	assert.equal(calls[1].options.sessionId, undefined);
	assert.notEqual(calls[1].options.resume, saved.ccSessionId);
	assert.equal(persisted().ccSessionId, calls[1].options.resume);
});

for (const [sessionDamage, error] of [["reset", /reset.*new-conversation/], ["write loss", /lost transcript.*ENOSPC/]]) {
	it(`ordinary ${sessionDamage} preserves the last valid resume pointer`, { timeout: 5000 }, async () => {
		const ask = user("warm");
		scripts.push({});
		const answer = await call([ask]).result();
		const saved = __test.getSharedSession("pi");
		scripts.push({ sessionDamage });
		const events = await Array.fromAsync(call([ask, answer, user("continue")]));
		const terminal = events.filter((event) => event.type === "done" || event.type === "error");
		assert.deepEqual(terminal.map((event) => event.type), ["error"]);
		assert.match(terminal[0].error.errorMessage, error);
		await calls[1].exited;
		assert.equal(calls[1].options.resume, saved.ccSessionId);
		assert.doesNotMatch(readFileSync(calls[1].path, "utf8"), /missing-answer-record/);
		assert.strictEqual(__test.getSharedSession("pi"), saved);
		assert.deepEqual(persisted(), stored(saved));
	});
}

it("a restart whose transcript is gone drops the persisted pointer and imports", async () => {
	const ask = user("warm");
	scripts.push({});
	const answer = await call([ask]).result();
	await calls[0].exited;
	rmSync(calls[0].path);
	__test.forgetSessionMemory();
	scripts.push({ error: "API Error: quota exceeded" });
	assert.equal((await call([ask, answer, user("next")]).result()).stopReason, "error");
	assert.equal(calls[1].options.forkSession, undefined);
	assert.ok(calls[1].options.resume, "pi's priors are written to a new session");
	assert.equal(persisted(), null, "the missing transcript's pointer is deleted, not retained");
	await calls[1].exited;
});

it("an invalid persisted file is rejected, logged, and treated as no state", async () => {
	const ask = user("warm");
	scripts.push({});
	const answer = await call([ask]).result();
	await calls[0].exited;
	const [file] = readdirSync(sessionsDir());
	writeFileSync(join(sessionsDir(), file), JSON.stringify({ ...JSON.parse(readFileSync(join(sessionsDir(), file), "utf8")), version: 2 }));
	__test.forgetSessionMemory();
	assert.equal(__test.getSharedSession("pi"), null);
	assert.match(readFileSync(diagLogPath(), "utf8"), /session_state_rejected.*unsupported version/);
	scripts.push({});
	await call([ask, answer, user("next")]).result();
	assert.equal(calls[1].options.forkSession, undefined);
	assert.equal(persisted().ccSessionId, calls[1].options.resume);
});

it("an intentional null-uuid omission survives a restart", async () => {
	const history = [user("a"), { role: "assistant", content: [], provider: model.provider, timestamp: 1 }, user("b")];
	scripts.push({});
	await call(history).result();
	const saved = __test.getSharedSession("pi");
	assert.equal(saved.uuids[1], null);
	__test.forgetSessionMemory();
	assert.deepEqual(__test.getSharedSession("pi"), { ...saved, dirtyTail: true });
});

it("a stale completion's CAS never overwrites the persisted replacement", async () => {
	const controller = new AbortController();
	scripts.push({ tool: true });
	await call([user("tool")], controller.signal).result();
	const replacement = { digests: [], uuids: [], cuttable: [], ccSessionId: "cc-replacement", cwd: root, model: "replacement-model", dirtyTail: false };
	__test.setSharedSession("pi", replacement);
	saveSessionState("pi", replacement);
	controller.abort();
	await calls[0].exited;
	await tick();
	assert.strictEqual(__test.getSharedSession("pi"), replacement);
	assert.deepEqual(persisted(), stored(replacement));
});

it("an unattributed query never writes provider state", async () => {
	scripts.push({});
	await provider.streamSimple(model, { messages: [user("a"), say("b"), user("c")], tools }, {}).result();
	await calls[0].exited;
	assert.deepEqual(existsSync(sessionsDir()) ? readdirSync(sessionsDir()) : [], []);
});

it("switching pi sessions retains every other session's state", async () => {
	scripts.push({});
	await call([user("warm")]).result();
	const saved = __test.getSharedSession("pi");
	for (const reason of ["new", "resume", "fork"]) {
		for (const fn of handlers.session_start) fn({ reason }, { cwd: process.cwd(), sessionManager: { getSessionId: () => `other-${reason}` } });
	}
	assert.strictEqual(__test.getSharedSession("pi"), saved);
	assert.deepEqual(persisted(), stored(saved));
});

it("a pi fork or clone forks its parent's Claude Code session instead of importing", async () => {
	const ask = user("warm");
	scripts.push({});
	const answer = await call([ask]).result();
	const parent = __test.getSharedSession("pi");
	const parentFile = join(root, "parent.jsonl");
	writeFileSync(parentFile, JSON.stringify({ type: "session", version: 3, id: "pi", timestamp: "", cwd: root }) + "\n");
	for (const fn of handlers.session_start) await fn({ reason: "fork", previousSessionFile: parentFile }, { cwd: process.cwd(), sessionManager: { getSessionId: () => "pi-clone" } });
	assert.equal(readdirSync(sessionsDir()).length, 1, "the inherited copy is not saved before its own turn");
	scripts.push({});
	await call([ask, answer, user("next")], undefined, "pi-clone").result();
	assert.equal(calls[1].options.forkSession, true);
	assert.equal(calls[1].options.resume, parent.ccSessionId);
	assert.equal(calls[1].options.resumeSessionAt, parent.uuids.at(-1));
	assert.strictEqual(__test.getSharedSession("pi"), parent, "the parent keeps its own session");
});

it("fork inheritance waits for the parent's stopping writer and copies its final append evidence", async () => {
	const controller = new AbortController();
	scripts.push({ tool: true, late: true, deferTool: true });
	await call([user("tool")], controller.signal).result();
	controller.abort();
	const parentFile = join(root, "parent-stopping.jsonl");
	writeFileSync(parentFile, JSON.stringify({ type: "session", id: "pi" }) + "\n");
	await Promise.all(handlers.session_start.map((fn) => fn({ reason: "fork", previousSessionFile: parentFile }, {
		cwd: process.cwd(), sessionManager: { getSessionId: () => "pi-stopping-child" },
	})));
	const child = __test.getSharedSession("pi-stopping-child");
	assert.deepEqual(child.appendState, { base: calls[0].options.systemPrompt.append, refreshes: [] }, "inherit after the source's exit snapshot, not its provisional in-memory commit");
	assert.deepEqual(child.appendState, persisted().appendState);
	assert.match(readFileSync(calls[0].path, "utf8"), /late-exit-marker/);
});

it("a prompt CC pulled but never replayed stays a gap, so a boot abort persists no absent anchor", async () => {
	const ask = user("warm");
	scripts.push({});
	const answer = await call([ask]).result();
	const saved = __test.getSharedSession("pi");
	await calls[0].exited;
	const controller = new AbortController(), booting = user("booting");
	scripts.push({ boot: true });
	const aborted = call([ask, answer, booting], controller.signal);
	while (!calls[1]?.pulled) await tick();
	assert.equal(calls[1].options.resume, saved.ccSessionId, "a plain resume appends to the saved file");
	controller.abort();
	assert.equal((await aborted.result()).stopReason, "aborted");
	assert.deepEqual(persisted(), stored(saved), "only the old valid prefix is retained");
	const placeholder = { role: "assistant", content: [{ type: "text", text: "" }], provider: model.provider, stopReason: "aborted", timestamp: 1 };
	scripts.push({});
	assert.equal((await call([ask, answer, booting, placeholder, user("again")]).result()).stopReason, "stop");
	assert.equal(calls[2].options.forkSession, undefined);
	assert.notEqual(calls[2].options.resume, saved.ccSessionId, "the unpersisted prompt is rewritten after the old cut");
	const state = __test.getSharedSession("pi");
	const records = readFileSync(getSessionPath(state.ccSessionId, state.cwd, root), "utf8");
	for (const uuid of state.uuids) if (uuid) assert.match(records, new RegExp(uuid));
});

it("an abort cancels a fresh query's wait on a stopping writer", { timeout: 5000 }, async () => {
	const controller = new AbortController(), ask = user("tool");
	scripts.push({ tool: true, hang: true });
	const tool = await call([ask], controller.signal).result();
	controller.abort();
	const state = __test.getSharedSession("pi");
	assert.equal(state.ccSessionId, calls[0].options.sessionId);
	const next = new AbortController();
	const waiting = call([ask, tool, toolResult, user("next")], next.signal);
	await tick();
	next.abort();
	assert.equal((await waiting.result()).stopReason, "aborted");
	assert.equal(calls.length, 1, "nothing launched while the old child is still stopping");
	assert.deepEqual(__test.getSharedSession("pi"), state);
	calls[0].child.kill("SIGKILL");
	await calls[0].exited;
});

it("a failed state save ends the turn with that error without a host exit or retry", async () => {
	// Run in a child to verify the detached finalizer cannot terminate the host.
	const script = `
		import { createHash } from "node:crypto";
		import { mkdirSync } from "node:fs";
		import { join } from "node:path";
		const { recordSdkTurn } = await import(${JSON.stringify(new URL("./lib/recorded-sdk-turn.mjs", import.meta.url).href)});
		const mod = await import(${JSON.stringify(new URL("../src/index.ts", import.meta.url).href)});
		let provider;
		mod.default({ on() {}, registerProvider: (_id, value) => { provider = value; }, registerTool() {} });
		const model = provider.models[0];
		mod.__test.getSharedSession("pi");
		const file = "s-" + createHash("sha256").update("pi", "utf16le").digest("hex") + ".json";
		mkdirSync(join(process.env.PI_CODING_AGENT_DIR, "claude-bridge", "sessions", file, "occupied"), { recursive: true });
		let launches = 0;
		mod.__test.setQuery(({ prompt, options }) => {
			launches++;
			const gen = (async function* () {
				const initial = (await prompt[Symbol.asyncIterator]().next()).value;
				const recorded = recordSdkTurn(options, initial, "answer");
				yield recorded.init;
				yield recorded.replay;
				yield recorded.assistant;
				yield { type: "result", subtype: "success", is_error: false, result: "answer", session_id: options.sessionId };
			})();
			gen.interrupt = async () => {};
			gen.close = () => {};
			return gen;
		});
		const output = await provider.streamSimple(model, { messages: [{ role: "user", content: "hi", timestamp: 1 }], tools: [] }, { sessionId: "pi" }).result();
		console.log(JSON.stringify({ stopReason: output.stopReason, errorMessage: output.errorMessage }));
		setTimeout(() => console.log("survived", launches), 200);
	`;
	const child = spawn(process.execPath, ["--import", "tsx", "--import", "./tests/lib/setup.mjs", "--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "pipe"] });
	let stdout = "", stderr = "";
	child.stdout.on("data", (d) => { stdout += d; });
	child.stderr.on("data", (d) => { stderr += d; });
	const [code] = await once(child, "close");
	const lines = stdout.trim().split("\n");
	assert.deepEqual(JSON.parse(lines[0]).stopReason, "error", stdout + stderr);
	assert.match(JSON.parse(lines[0]).errorMessage, process.platform === "win32" ? /EPERM/ : /EISDIR/);
	assert.equal(code, 0, stderr);
	assert.ok(lines.includes("survived 1"), stdout + stderr);
});

for (const parked of [false, true]) it(`an unexpected session id fails without a host exit and commits nothing${parked ? " before a parked fallback" : ""}`, async () => {
	const script = `
		import { createHash } from "node:crypto";
		import { existsSync } from "node:fs";
		import { join } from "node:path";
		const mod = await import(${JSON.stringify(new URL("../src/index.ts", import.meta.url).href)});
		let provider;
		mod.default({ on() {}, registerProvider: (_id, value) => { provider = value; }, registerTool() {} });
		const model = provider.models[0];
		const file = join(process.env.PI_CODING_AGENT_DIR, "claude-bridge", "sessions", "s-" + createHash("sha256").update("pi", "utf16le").digest("hex") + ".json");
		mod.__test.setQuery(({ prompt }) => {
			const parked = Promise.withResolvers();
			const gen = (async function* () {
				const initial = (await prompt[Symbol.asyncIterator]().next()).value;
				if (${parked}) {
					for (const id of ["toolu_a", "toolu_b"]) yield {
						type: "assistant", parent_tool_use_id: null, uuid: id,
						message: { id: "fallback", model: model.id, stop_reason: "tool_use", content: [
							{ type: "tool_use", id, name: "mcp__custom-tools__read", input: { path: "log" } },
						] },
					};
				}
				yield { type: "system", subtype: "init", session_id: "wrong-session" };
				if (${parked}) { await parked.promise; return; }
				yield { type: "user", isReplay: true, parent_tool_use_id: null, uuid: initial.uuid, message: initial.message };
				yield { type: "assistant", parent_tool_use_id: null, uuid: "answer-uuid", message: { id: "answer", model: model.id, content: [{ type: "text", text: "answer" }] } };
				yield { type: "result", subtype: "success", is_error: false, result: "answer", session_id: "wrong-session" };
			})();
			gen.interrupt = async () => {};
			gen.close = parked.resolve;
			return gen;
		});
		const stream = provider.streamSimple(model, { messages: [{ role: "user", content: "hi", timestamp: 1 }], tools: [
			{ name: "read", description: "Read a file", parameters: { type: "object", properties: { path: { type: "string" } } } },
		] }, { sessionId: "pi" });
		const output = await stream.result();
		const events = [];
		for await (const event of stream) events.push(event.type);
		console.log(JSON.stringify({ stopReason: output.stopReason, errorMessage: output.errorMessage, events, state: mod.__test.getSharedSession("pi"), saved: existsSync(file) }));
		setTimeout(() => console.log("survived"), 200);
	`;
	const child = spawn(process.execPath, ["--import", "tsx", "--import", "./tests/lib/setup.mjs", "--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "pipe"] });
	let stdout = "", stderr = "";
	child.stdout.on("data", (d) => { stdout += d; });
	child.stderr.on("data", (d) => { stderr += d; });
	const [code] = await once(child, "close");
	const lines = stdout.trim().split("\n");
	const result = JSON.parse(lines[0]);
	assert.equal(result.stopReason, "error", stdout + stderr);
	assert.match(result.errorMessage, /unexpected session wrong-session/);
	assert.deepEqual(result.events, ["error"]);
	assert.equal(result.state, null, "no state under the wrong target");
	assert.equal(result.saved, false);
	assert.equal(code, 0, stderr);
	assert.ok(lines.includes("survived"));
});
