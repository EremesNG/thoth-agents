import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "node:test";
import { globalConfigPath } from "../src/config.js";
import activate, { __test } from "../src/index.js";

it("warns only on first TUI use, persists the notice and keeps AskClaude executable", async (t) => {
	writeFileSync(globalConfigPath(), JSON.stringify({ startupNoticeShown: "2026-09-30", askClaude: { enabled: true } }));
	let calls = 0;
	__test.setAuxiliaryQuery(() => ({
		async *[Symbol.asyncIterator]() {
			calls++;
			yield { type: "result", subtype: "success", result: "still executable", is_error: false };
		},
		close() {},
	}));
	t.after(() => __test.setAuxiliaryQuery(null));
	const notices = [];
	function instance() {
		const handlers = new Map();
		let tool;
		activate({
			on: (name, handler) => handlers.set(name, [...handlers.get(name) ?? [], handler]),
			registerProvider() {},
			registerTool: (definition) => { tool = definition; },
		});
		const ctx = {
			cwd: process.env.HOME, mode: "print", ui: { notify: (...args) => notices.push(args) },
			getSystemPrompt: () => "", sessionManager: { getSessionId: () => "ask-deprecation" },
		};
		const emit = (name) => { for (const handler of handlers.get(name) ?? []) handler({}, ctx); };
		t.after(() => emit("session_shutdown"));
		return { ctx, emit, execute: () => tool.execute("call", { prompt: "hello", mode: "none", isolated: true }, undefined, undefined, ctx) };
	}
	const first = instance();
	first.emit("session_start");
	assert.equal(notices.length, 0, "activation never warns");
	assert.equal((await first.execute()).content[0].text, "still executable");
	assert.equal(notices.length, 0, "headless execution never warns or consumes the notice");
	assert.equal(JSON.parse(readFileSync(globalConfigPath(), "utf8")).askClaudeDeprecationShown, undefined);
	first.ctx.mode = "tui";
	first.emit("session_start");
	await first.execute();
	await first.execute();
	assert.equal(notices.length, 1);
	assert.match(notices[0][0], /AskClaude is deprecated.*provider remains supported/);
	assert.equal(notices[0][1], "warning");
	assert.match(JSON.parse(readFileSync(globalConfigPath(), "utf8")).askClaudeDeprecationShown, /^\d{4}-\d{2}-\d{2}$/);
	first.emit("session_shutdown");
	const resumed = instance();
	resumed.ctx.mode = "tui";
	resumed.emit("session_start");
	assert.equal((await resumed.execute()).content[0].text, "still executable");
	assert.equal(notices.length, 1, "persisted marker suppresses a later instance's notice");
	assert.equal(calls, 4);
});
