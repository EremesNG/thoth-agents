import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import activate, { __test } from "../src/index.js";
import { QueryContext } from "../src/query-state.js";
import { DIAG_LOG_PATH } from "../src/log-paths.js";

function startSession(sessionId, mode, notify) {
	const handlers = new Map(), registered = [];
	activate({
		on: (event, handler) => {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		registerProvider: (_name, provider) => registered.push(provider), registerTool: () => {},
	});
	const ctx = {
		ui: { notify }, mode, sessionManager: { getSessionId: () => sessionId },
		modelRegistry: { getProvider: () => ({}) },
	};
	for (const handler of handlers.get("session_start") ?? []) handler({}, ctx);
	const shutdown = () => {
		for (const handler of handlers.get("session_shutdown") ?? []) handler({}, ctx);
	};
	shutdown.provider = registered[0];
	return shutdown;
}

const tools = [{ name: "incompatible", description: "", parameters: { type: "string" } }];
function buildFor(sessionId, catalog = tools) {
	const queryCtx = new QueryContext();
	queryCtx.piSessionId = sessionId;
	return __test.buildMcpServers(catalog, queryCtx);
}

it("headless omission warnings are visible once per tool per session, not per query or globally", (t) => {
	const warnings = [];
	t.mock.method(console, "warn", (message) => warnings.push(message));
	const catalog = [...tools, { name: "mixed_union", description: "", parameters: { anyOf: [{ type: "object" }, { type: "string" }] } }];
	buildFor("pi-headless-a", catalog);
	buildFor("pi-headless-a", catalog);
	buildFor("pi-headless-b", catalog);
	buildFor("pi-headless-b", catalog);
	assert.equal(warnings.length, 4);
	assert.match(warnings[0], /omitted tool "incompatible"/);
	assert.match(warnings[0], /pi-headless-a/);
	assert.match(warnings[1], /omitted tool "mixed_union"/);
	assert.match(warnings[2], /pi-headless-b/);
	assert.match(warnings[3], /omitted tool "mixed_union"/);
	const entries = readFileSync(DIAG_LOG_PATH, "utf8").trim().split("\n").map((line) => JSON.parse(line));
	const omissions = entries.filter((entry) => entry.label === "tool_schema_omitted");
	assert.deepEqual(omissions.map((entry) => [entry.piSessionId, entry.toolName]), [
		["pi-headless-a", "incompatible"], ["pi-headless-a", "mixed_union"],
		["pi-headless-b", "incompatible"], ["pi-headless-b", "mixed_union"],
	]);
});

it("notifies the owning UI but keeps no-op UI and lean-child warnings visible without notifying the parent", (t) => {
	const warnings = [], notices = [];
	t.mock.method(console, "warn", (message) => warnings.push(message));
	const shutdown = startSession("pi-tui", "tui", (message, level) => notices.push({ message, level }));
	t.after(shutdown);
	buildFor("pi-tui");
	buildFor("pi-tui");
	assert.equal(notices.length, 1);
	assert.equal(notices[0].level, "warning");
	assert.match(notices[0].message, /omitted tool "incompatible"/);
	assert.equal(warnings.length, 0, "terminal UI already displays the warning");

	// Lean SDK children never emit session_start for this extension instance.
	buildFor("pi-lean-child");
	buildFor("pi-lean-child");
	assert.equal(notices.length, 1, "a child warning must not go to the parent's UI");
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /pi-lean-child/);

	// The SDK's headless UI implements notify as a no-op.
	const shutdownHeadless = startSession("pi-noop-ui", "print", () => {});
	t.after(shutdownHeadless);
	buildFor("pi-noop-ui");
	buildFor("pi-noop-ui");
	assert.equal(warnings.length, 2);
	assert.match(warnings[1], /pi-noop-ui/);
});

it("the provider does not dispatch a hallucinated call to an omitted tool", async (t) => {
	const shutdown = startSession("pi-omitted-call", "print", () => {});
	t.after(shutdown);
	t.after(() => __test.setQuery(null));
	t.mock.method(console, "warn", () => {});
	__test.setQuery(() => {
		const sdk = (async function* () {
			yield { type: "assistant", message: { content: [
				{ type: "tool_use", id: "toolu_omitted", name: "mcp__custom-tools__incompatible", input: {} },
				{ type: "text", text: "valid response" },
			] } };
			yield { type: "result", subtype: "success", is_error: false, result: "valid response" };
		})();
		sdk.interrupt = async () => {};
		sdk.close = () => {};
		return sdk;
	});
	const { streamSimple, models } = shutdown.provider;
	const result = await streamSimple(models[0], {
		messages: [{ role: "user", content: "Use the available tools", timestamp: 1 }],
		tools: [...tools, { name: "valid", description: "", parameters: { type: "object" } }],
	}, { sessionId: "pi-omitted-call" }).result();
	assert.equal(result.stopReason, "stop");
	assert.deepEqual(result.content.filter((block) => block.type === "toolCall"), [],
		"only tools actually served over MCP may be executed by Pi");
});

it("a failed UI warning falls back to stderr without failing server construction", (t) => {
	const warnings = [];
	t.mock.method(console, "warn", (message) => warnings.push(message));
	const shutdown = startSession("pi-failed-ui", "tui", () => { throw new Error("UI unavailable"); });
	t.after(shutdown);
	assert.doesNotThrow(() => buildFor("pi-failed-ui"));
	buildFor("pi-failed-ui");
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /omitted tool "incompatible"/);
});
