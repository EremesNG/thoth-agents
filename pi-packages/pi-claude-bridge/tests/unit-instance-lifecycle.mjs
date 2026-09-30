/** Cached extension factories must not let child load/teardown mutate a parent. */
import { after, afterEach, beforeEach, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Keep both config reads and any conversation imports inside this package.
const outputDir = fileURLToPath(new URL("../.test-output/", import.meta.url));
mkdirSync(outputDir, { recursive: true });
const fixtureDir = mkdtempSync(join(outputDir, "instance-lifecycle-"));
process.env.PI_CODING_AGENT_DIR = join(fixtureDir, "agent");
process.env.CLAUDE_CONFIG_DIR = join(fixtureDir, "claude");
mkdirSync(process.env.PI_CODING_AGENT_DIR, { recursive: true });
const configPath = join(process.env.PI_CODING_AGENT_DIR, "claude-bridge.json");
const configure = (provider) => writeFileSync(configPath, JSON.stringify({
	startupNoticeShown: "2026-09-30", askClaude: { enabled: false }, provider,
}));
configure({ strictMcpConfig: true });
const { default: activate, __test } = await import("../src/index.js");
const activeStreamKey = Symbol.for("claude-bridge:activeStreamSimple");
after(() => rmSync(fixtureDir, { recursive: true, force: true }));

function instance() {
	const handlers = new Map();
	const registered = [];
	activate({
		on: (name, handler) => {
			const list = handlers.get(name) ?? [];
			list.push(handler);
			handlers.set(name, list);
		},
		registerProvider: (name, config) => registered.push({ name, config }),
		registerTool: () => {},
	});
	return {
		registered,
		emit(name, sessionId, event = {}) {
			const ctx = {
				sessionManager: { getSessionId: () => sessionId },
				modelRegistry: { getProvider: () => ({}) }, ui: {}, mode: "rpc",
			};
			for (const handler of handlers.get(name) ?? []) handler(event, ctx);
		},
	};
}

const user = (content) => ({ role: "user", content, timestamp: 1 });
const answer = (content) => ({
	role: "assistant", content: [{ type: "text", text: content }],
	api: "claude-bridge", provider: "claude-bridge", model: "claude-opus-4-6",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "stop", timestamp: 2,
});
const gate = () => {
	let open;
	const promise = new Promise((resolve) => { open = resolve; });
	return { promise, open };
};
const calls = [];
const scripts = [];
beforeEach(() => {
	delete globalThis[activeStreamKey];
	__test.resetSharedSession();
	calls.length = 0;
	scripts.length = 0;
	configure({ strictMcpConfig: true });
	__test.setQuery(({ options }) => {
		const script = scripts.shift();
		assert.ok(script, "only the expected SDK queries start");
		const call = { options, interrupts: 0, closes: 0 };
		calls.push(call);
		const sdk = (async function* () {
			yield { type: "system", subtype: "init", session_id: options.resume ?? script.id };
			script.ready?.open();
			if (script.wait) await script.wait.promise;
			yield { type: "result", subtype: "success", is_error: false, result: "survived" };
		})();
		sdk.interrupt = async () => { call.interrupts++; };
		sdk.close = () => { call.closes++; };
		return sdk;
	});
});
afterEach(() => { __test.setQuery(null); });

function provider(parent) {
	const config = parent.registered[0].config;
	return (sessionId, messages) => config.streamSimple(config.models[0], { messages, tools: [] }, { sessionId });
}

it("loading the cached factory without session_start preserves the parent's provider settings and conversation", { timeout: 5000 }, async (t) => {
	const parent = instance();
	const call = provider(parent);
	scripts.push({ id: "cc-parent" });
	await call("pi-parent", [user("first")]).result();

	const ready = gate(), wait = gate();
	scripts.push({ id: "ignored", ready, wait });
	const running = call("pi-parent", [user("first"), answer("survived"), user("second")]);
	t.after(async () => { wait.open(); await running.result(); });
	await ready.promise;
	const parentQuery = calls.at(-1);

	configure({ strictMcpConfig: false, pathToClaudeCodeExecutable: "child-only-executable" });
	const child = instance(); // Same factory, not a fresh module import; no session_start.
	assert.equal(child.registered.length, 0, "the inherited provider is not overwritten");
	assert.equal(parentQuery.interrupts, 0);
	assert.equal(parentQuery.closes, 0, "the parent's in-flight query stays alive");
	wait.open();
	assert.equal((await running.result()).stopReason, "stop");

	scripts.push({ id: "ignored" });
	await call("pi-parent", [user("first"), answer("survived"), user("second"), answer("survived"), user("third")]).result();
	assert.equal(calls.at(-1).options.resume, "cc-parent", "the parent's mirror survives child load");
	assert.ok("strict-mcp-config" in calls.at(-1).options.extraArgs, "child config cannot change the pinned provider");
	assert.equal(calls.at(-1).options.pathToClaudeCodeExecutable, undefined);
	assert.equal(instance().registered.length, 0, "the load-time registration marker remains pinned");
});

it("a cached child's shutdown clears only its own mirror and leaves the parent query and registration alive", { timeout: 5000 }, async (t) => {
	const parent = instance();
	parent.emit("session_start", "pi-parent");
	const call = provider(parent);
	scripts.push({ id: "cc-parent" });
	await call("pi-parent", [user("first")]).result();
	scripts.push({ id: "cc-child" });
	await call("pi-child", [user("child task")]).result();
	// A second parent-side conversation has a dormant mirror: completing the
	// live query below cannot accidentally repair it after an unsafe shutdown.
	scripts.push({ id: "cc-parent-dormant" });
	await call("pi-parent-dormant", [user("dormant")]).result();

	const ready = gate(), wait = gate();
	scripts.push({ id: "ignored", ready, wait });
	const running = call("pi-parent", [user("first"), answer("survived"), user("second")]);
	t.after(async () => { wait.open(); await running.result(); });
	await ready.promise;
	const parentQuery = calls.at(-1);
	const child = instance();
	assert.equal(child.registered.length, 0);
	// Lean children never start this instance; exercise shutdown defensively anyway.
	child.emit("session_shutdown", "pi-child");
	assert.equal(parentQuery.interrupts, 0);
	assert.equal(parentQuery.closes, 0);
	wait.open();
	assert.equal((await running.result()).stopReason, "stop");

	scripts.push({ id: "ignored" });
	await call("pi-parent", [user("first"), answer("survived"), user("second"), answer("survived"), user("third")]).result();
	assert.equal(calls.at(-1).options.resume, "cc-parent", "shutdown preserves the parent's conversation");
	scripts.push({ id: "ignored" });
	await call("pi-parent-dormant", [user("dormant"), answer("survived"), user("continue")]).result();
	assert.equal(calls.at(-1).options.resume, "cc-parent-dormant", "teardown did not erase dormant foreign mirrors either");
	assert.equal(instance().registered.length, 0, "a cached child cannot release the parent's registration marker");
	scripts.push({ id: "cc-child-new" });
	await call("pi-child", [user("new child task")]).result();
	assert.equal(calls.at(-1).options.resume, undefined, "only the child's mirror was cleared");

	parent.emit("session_shutdown", "pi-parent");
	assert.equal(instance().registered.length, 1, "the real owner can still release registration for reload");
});

it("a session transition clears the owner's previous mirror without resetting sibling sessions or registration", { timeout: 5000 }, async () => {
	const parent = instance();
	parent.emit("session_start", "pi-parent");
	const call = provider(parent);
	scripts.push({ id: "cc-parent" });
	await call("pi-parent", [user("first")]).result();
	scripts.push({ id: "cc-child" });
	await call("pi-child", [user("child")]).result();

	parent.emit("session_start", "pi-parent-new", { reason: "new" });
	assert.equal(instance().registered.length, 0, "a session transition does not release the live provider");
	scripts.push({ id: "ignored" });
	await call("pi-child", [user("child"), answer("survived"), user("continue")]).result();
	assert.equal(calls.at(-1).options.resume, "cc-child", "the sibling keeps its own mirror");
	scripts.push({ id: "cc-parent-new" });
	await call("pi-parent", [user("new task")]).result();
	assert.equal(calls.at(-1).options.resume, undefined, "the previous owner mirror was cleared");
});
