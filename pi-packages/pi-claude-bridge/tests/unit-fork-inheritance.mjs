import assert from "node:assert/strict";
import { afterEach, beforeEach, it } from "node:test";
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getSessionPath } from "cc-session-io";
import activate, { __test } from "../src/index.js";
import { loadSessionState } from "../src/session-store.js";
import { recordSdkTurn } from "./lib/recorded-sdk-turn.mjs";

const handlers = {};
let provider, root, previousDir, calls;
const histories = new Map();
activate({ on: (name, fn) => { (handlers[name] ??= []).push(fn); }, registerProvider: (_id, value) => { provider = value; } });
const model = provider.models[0];
const fire = async (event, ctx) => { for (const fn of handlers.session_start) await fn(event, ctx); };
const pathFor = (state) => getSessionPath(state.ccSessionId, state.cwd, process.env.CLAUDE_CONFIG_DIR);
const contents = (state) => readFileSync(pathFor(state), "utf8");
const hookContext = (call) => call.outputs.map((output) => output.hookSpecificOutput?.additionalContext ?? "").join("\n");

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "fork-inheritance-"));
	previousDir = process.env.CLAUDE_CONFIG_DIR;
	process.env.CLAUDE_CONFIG_DIR = root;
	__test.resetSharedSession();
	histories.clear();
	calls = [];
	__test.setQuery(({ options, prompt }) => {
		const call = { options, outputs: [] };
		calls.push(call);
		const gen = (async function* () {
			const initial = (await prompt[Symbol.asyncIterator]().next()).value;
			const id = options.sessionId ?? options.resume;
			for (const hook of options.hooks?.UserPromptSubmit.flatMap((matcher) => matcher.hooks) ?? [])
				call.outputs.push(await hook({ hook_event_name: "UserPromptSubmit", session_id: id, prompt: "next" }, undefined, { signal: new AbortController().signal }));
			const recorded = recordSdkTurn(options, initial, "answer", call.outputs.flatMap((output) => output.hookSpecificOutput?.additionalContext ?? []));
			yield recorded.init;
			yield recorded.replay;
			yield recorded.assistant;
			yield { type: "result", subtype: "success", is_error: false, result: "answer" };
		})();
		gen.interrupt = async () => {};
		gen.close = () => {};
		return gen;
	});
});
afterEach(() => {
	__test.setQuery(null);
	__test.resetSharedSession();
	if (previousDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
	else process.env.CLAUDE_CONFIG_DIR = previousDir;
	rmSync(root, { recursive: true, force: true });
});

async function turn(id, append) {
	const systemPrompt = `Captured ${id}: ${append}`;
	for (const fn of handlers.before_agent_start) fn({ systemPrompt, systemPromptOptions: { appendSystemPrompt: append } });
	const messages = histories.get(id) ?? [];
	messages.push({ role: "user", content: `prompt ${messages.length}`, timestamp: 1 });
	histories.set(id, messages);
	messages.push(await provider.streamSimple(model, { systemPrompt, messages, tools: [] }, { sessionId: id }).result());
	await new Promise(setImmediate);
	return calls.at(-1);
}

for (const restart of [false, true]) {
	for (const reason of ["fork", "resume"]) it(`inherits a parent recording and dirty tail without importing (${reason}, restart=${restart})`, async () => {
		await turn("parent", "<task>A</task>");
		const parent = __test.getSharedSession("parent");
		// Cut resolution retains attached metadata, but stops before a later
		// conversational record that no confirmed Pi slot represents.
		appendFileSync(pathFor(parent), JSON.stringify({ type: "attachment", uuid: "retained-metadata", parentUuid: parent.uuids.at(-1), sessionId: parent.ccSessionId, attachment: { type: "sentinel", value: "retained metadata" } }) + "\n"
			+ JSON.stringify({ type: "assistant", uuid: "unconfirmed-tail", parentUuid: "retained-metadata", sessionId: parent.ccSessionId, message: { id: "unconfirmed-message", role: "assistant", model: model.id, content: [{ type: "text", text: "must not be inherited" }] } }) + "\n");
		const before = contents(parent);
		const parentFile = join(root, "parent.jsonl");
		writeFileSync(parentFile, JSON.stringify({ type: "session", version: 3, id: "parent", cwd: root }) + "\n");
		if (restart) __test.forgetSessionMemory();
		histories.set("child", structuredClone(histories.get("parent")));
		await fire({ reason, ...(reason === "fork" ? { previousSessionFile: parentFile } : {}) }, {
			cwd: process.cwd(), sessionManager: { getSessionId: () => "child", getHeader: () => ({ parentSession: parentFile }) },
		});
		const inherited = __test.getSharedSession("child");
		assert.ok(inherited, "a fork or resumed clone without its own recording must inherit");
		assert.equal(inherited.dirtyTail, true);
		assert.deepEqual(inherited.appendState, parent.appendState);
		assert.notStrictEqual(inherited.appendState, __test.getSharedSession("parent").appendState, "position-bound append evidence is copied, not shared");
		assert.equal(loadSessionState("child", assert.fail), null, "inheritance alone does not save a pointer before progress");
		const child = await turn("child", "<task>B</task>");
		assert.equal(child.options.resume, parent.ccSessionId);
		assert.equal(child.options.forkSession, true, "dirty inherited tail must be cut, never plain-resumed");
		assert.equal(child.options.resumeSessionAt, "retained-metadata");
		assert.match(hookContext(child), /<task>B<\/task>/);
		const childState = __test.getSharedSession("child");
		assert.doesNotMatch(contents(childState), /unconfirmed-tail/);
		assert.match(contents(childState), /retained-metadata/);
		assert.equal(contents(parent), before, "the parent's transcript is immutable");
		if (restart) {
			__test.forgetSessionMemory();
			await fire({ reason: "resume" }, { cwd: process.cwd(), sessionManager: {
				getSessionId: () => "child", getHeader: () => ({ parentSession: parentFile }),
			} });
			assert.equal(__test.getSharedSession("child").ccSessionId, childState.ccSessionId, "a child's saved pointer wins over parent inheritance after restart");
		}
		const changed = await turn("child", "<task>C</task>");
		assert.equal(changed.options.resume, childState.ccSessionId, "append changes alone must never force full import, even after restart");
		assert.match(hookContext(changed), /<task>C<\/task>/);
		for (const file of readdirSync(join(getAgentDir(), "claude-bridge", "sessions")))
			assert.equal("promptDigest" in JSON.parse(readFileSync(join(getAgentDir(), "claude-bridge", "sessions", file), "utf8")), false);
		assert.equal("promptDigest" in loadSessionState("child", assert.fail), false);
	});

	it(`redelivers an inherited append refresh whose carrier was cut (restart=${restart})`, async () => {
		await turn("parent", "<task>A</task>");
		const retained = structuredClone(histories.get("parent"));
		const first = __test.getSharedSession("parent");
		await turn("parent", "<task>B</task>");
		const parent = __test.getSharedSession("parent");
		assert.equal(parent.appendState.refreshes.length, 1);
		const before = contents(parent);
		const parentFile = join(root, "parent.jsonl");
		writeFileSync(parentFile, JSON.stringify({ type: "session", id: "parent" }) + "\n");
		if (restart) __test.forgetSessionMemory();
		await fire({ reason: "fork", previousSessionFile: parentFile }, { cwd: process.cwd(), sessionManager: { getSessionId: () => "child" } });
		histories.set("child", retained);
		const child = await turn("child", "<task>B</task>");
		assert.equal(child.options.resume, parent.ccSessionId, "the child must start from the inherited transcript, not a full import");
		assert.equal(child.options.forkSession, true);
		assert.equal(child.options.resumeSessionAt, first.uuids.at(-1));
		assert.match(hookContext(child), /<task>B<\/task>/, "a refresh carried only after the retained cut must be delivered again");
		const saved = loadSessionState("child", assert.fail);
		assert.notDeepEqual(saved.appendState.refreshes[0].positions, parent.appendState.refreshes[0].positions);
		assert.equal(contents(parent), before);
		if (restart) __test.forgetSessionMemory();
		assert.equal((await turn("child", "<task>B</task>")).options.hooks, undefined, "a retained refresh is not delivered twice after restart");
	});
}
