import assert from "node:assert/strict";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { EntryRenderer, ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { registerRenderKit, withdrawRenderKit } from "@thoth-agents/pi-core";
import { createTestRenderKit } from "@thoth-agents/pi-core/testing";
import { afterEach, test, vi } from "vitest";
import extension from "../extensions/index.js";
import { AcpDriver } from "../src/acp/driver.js";
import { TurnDiffContext } from "../src/diff-render.js";
import type { DriverActivity } from "../src/driver-types.js";
import type { PollRunData } from "../src/poll-fold.js";
import { consumeActivity, POLL_TOOL_NAME, type BlockState, type StreamSimpleDeps } from "../src/provider.js";
import { withoutUnhandledRejections } from "./helpers/unhandled-rejections.js";

// Capture the production provider boundary, keeping the real activity mapper
// and extension transcript sink; no agy process or network is needed.
const providers = vi.hoisted(() => [] as StreamSimpleDeps[]);
vi.mock("../src/provider.js", async (original) => {
	const actual = await original<typeof import("../src/provider.js")>();
	return { ...actual, createStreamSimple: (deps: StreamSimpleDeps) => {
		providers.push(deps);
		return actual.createStreamSimple(deps);
	} };
});
vi.mock("../src/models.js", async (original) => ({
	...await original<typeof import("../src/models.js")>(),
	loadModelCatalogRaw: async () => "gemini-3.8-flash Gemini 3.8 Flash",
}));

const theme = { fg: (role: string, text: string) => `«${role}:${text}»` } as Theme;
type Handler = (event: any, context: any) => unknown;
const shutdowns: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const shutdown of shutdowns.splice(0)) await shutdown();
	providers.length = 0;
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

async function session(discovery = "private") {
	vi.stubEnv("AGY_ENGINE", "acp");
	vi.stubEnv("AGY_BRIDGE_DISCOVERY", discovery);
	vi.stubEnv("AGY_ASK_TOOL", "0");
	vi.stubEnv("AGY_WEB_TOOLS", "0");
	const handlers = new Map<string, Handler[]>();
	const renderers = new Map<string, EntryRenderer<any>>();
	const entries: Array<{ name: string; data: any }> = [];
	const statuses = new Map<string, string | undefined>();
	const ctx = { hasUI: true, mode: "rpc", model: { provider: "other" }, isProjectTrusted: () => false,
		ui: { theme, notify() {}, setStatus: (key: string, text?: string) => { statuses.set(key, text); } } };
	const emit = async (name: string, event: any = { reason: "startup" }) => {
		for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
	};
	const appendEntry = vi.fn((name: string, data: any) => { entries.push({ name, data }); });
	const turnEndSetter = vi.spyOn(AcpDriver.prototype, "onTurnEnd", "set");
	await extension({
		on: (name: string, handler: Handler) => handlers.set(name, [...handlers.get(name) ?? [], handler]),
		registerProvider() {}, registerTool() {}, registerCommand() {},
		registerEntryRenderer: (name: string, render: EntryRenderer<any>) => renderers.set(name, render),
		appendEntry, getAllTools: () => [], getActiveTools: () => [],
	} as unknown as ExtensionAPI);
	const deps = providers.at(-1)!;
	const turnEnd = turnEndSetter.mock.lastCall![0]!;
	assert.ok(deps.onNativeEvent);
	assert.ok(deps.roundTrips);
	const poll = vi.spyOn(deps.roundTrips, "poll").mockReturnValue({ name: "git_commit", state: "running" });
	await emit("session_start");
	shutdowns.push(() => emit("session_shutdown"));
	const stream = createAssistantMessageEventStream();
	const partial: BlockState["partial"] = {
		role: "assistant", api: "agy-bridge", provider: "antigravity", model: "gemini-3.8-flash",
		content: [], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 1,
	};
	const blocks: BlockState = { partial, started: true, textIdx: null, thinkingIdx: null };
	const diff = new TurnDiffContext({ toplevel: () => null, showHead: () => null });
	const send = (activity: DriverActivity) => consumeActivity(stream, blocks, activity, diff, process.cwd(), {
		engine: "acp", onNativeEvent: deps.onNativeEvent,
	});
	const pollCall = (id = "park-1", mcpServer?: string) => {
		send({ type: "tool_start", name: POLL_TOOL_NAME, args: { callId: id }, mcpServer });
		send({ type: "tool_done", name: POLL_TOOL_NAME, args: { callId: id }, mcpServer, output: "STILL RUNNING" });
	};
	const render = (index: number, expanded = false) => {
		const entry = entries[index];
		const component = renderers.get(entry.name)?.({ data: entry.data } as any, { expanded }, theme);
		assert.ok(component, `${entry.name} needs a registered renderer`);
		return component;
	};
	return { deps, emit, entries, statuses, poll, send, pollCall, render, appendEntry, blocks, turnEnd };
}

test("consecutive ACP polls render one counted entry; a non-poll event breaks the run", async () => {
	const s = await session();
	for (let i = 0; i < 3; i++) s.pollCall();
	assert.equal(s.entries.length, 0, "an open run is represented by its live status, not one entry per frame");
	assert.equal(s.statuses.get("agy-poll"), "«dim:♊︎ bridge_poll_result → git_commit (x3)»");
	assert.equal(s.statuses.get("agy-native"), undefined, "polls never increment native-tool pending counts");
	assert.ok(s.poll.mock.calls.every(([id]) => id === "park-1"), "the provider carries the polled callId to the sink");
	s.send({ type: "tool_start", name: "run_command", args: { command: "echo ok" } });
	assert.deepEqual(s.entries.map((entry) => entry.name), ["agy-poll-run"]);
	assert.equal((s.entries[0].data as PollRunData).count, 3);
	assert.equal(s.statuses.get("agy-poll"), undefined);
	assert.equal(s.statuses.get("agy-native"), "«dim:agy run_command… (1)»");
	const component = s.render(0);
	const native = component.render(240);
	assert.match(native.join("\n"), /bridge_poll_result.*Poll git_commit \(x3\)/);
	const kit = createTestRenderKit();
	const card = vi.spyOn(kit, "card");
	const token = registerRenderKit(kit, {});
	try {
		const themed = component.render(240);
		assert.match(themed.join("\n"), /Poll git_commit \(x3\)/);
		assert.equal(component.render(240), themed, "the poll renderer reuses KIT memo lines");
		assert.equal(card.mock.calls.length, 1);
		component.invalidate();
		component.render(240);
		assert.equal(card.mock.calls.length, 2);
	} finally {
		withdrawRenderKit(token);
	}
	assert.deepEqual(component.render(240), native, "native fallback survives KIT withdrawal");
	s.send({ type: "tool_done", name: "run_command", args: { command: "echo ok" }, output: "ok" });
	s.pollCall();
	await s.emit("agent_end");
	assert.deepEqual(s.entries.map((entry) => entry.name), ["agy-poll-run", "agy-native-event", "agy-poll-run"]);
	assert.deepEqual(s.entries.filter((entry) => entry.name === "agy-poll-run").map((entry) => entry.data.count), [3, 1]);
	assert.equal(s.blocks.partial.content.length, 0, "display entries do not become model text or executable tool calls");
});

test.each(["done", "failed"] as const)("a terminal %s poll immediately closes its run, without double-counting start frames", async (state) => {
	const s = await session();
	s.pollCall();
	s.poll.mockReturnValue(state === "done" ? { name: "git_commit", state, text: "committed" } : { name: "git_commit", state, reason: "rejected" });
	s.pollCall();
	assert.equal(s.entries.length, 1, "terminal polls do not wait for another event or turn end");
	assert.equal(s.entries[0].name, "agy-poll-run");
	assert.equal(s.entries[0].data.count, 2);
	assert.equal(s.entries[0].data.state, state);
	assert.equal(s.statuses.get("agy-poll"), undefined);
	const expanded = s.render(0, true).render(240).join("\n");
	assert.match(expanded, /2 polls, .* → /);
	assert.equal(expanded.includes(", failed"), state === "failed");
	const kit = createTestRenderKit();
	const card = vi.spyOn(kit, "card");
	const token = registerRenderKit(kit, {});
	try {
		s.render(0).render(240);
		assert.equal(card.mock.calls[0][1].isSuccess, state === "done");
		assert.equal(card.mock.calls[0][1].isError, state === "failed");
	} finally {
		withdrawRenderKit(token);
	}
	s.poll.mockReturnValue({ name: "git_commit", state: "running" });
	s.pollCall();
	await s.emit("agent_end");
	assert.deepEqual(s.entries.map((entry) => entry.data.count), [2, 1], "a later poll starts a fresh run after a terminal result");
});

test("target switches and filtered bridge events end folds without duplicating real Pi tool cards", async () => {
	const s = await session("legacy-global");
	s.pollCall("park-1", "pi-bridge");
	s.poll.mockReturnValue({ name: "ask_user_question", state: "running" });
	s.pollCall("park-2", "pi-bridge");
	assert.deepEqual(s.entries.map((entry) => [entry.data.target, entry.data.count]), [["git_commit", 1]]);
	assert.equal(s.statuses.get("agy-poll"), "«dim:♊︎ bridge_poll_result → ask_user_question (x1)»");
	s.send({ type: "tool_done", name: "bash", args: {}, mcpServer: "pi-bridge", output: "already has a Pi card" });
	assert.deepEqual(s.entries.map((entry) => [entry.name, entry.data.target]), [
		["agy-poll-run", "git_commit"], ["agy-poll-run", "ask_user_question"],
	]);
	assert.equal(s.statuses.get("agy-poll"), undefined);
});

test("turn end, agent end and shutdown flush only the owning instance and reset on resume", async () => {
	const a = await session();
	const b = await session();
	a.pollCall();
	a.pollCall();
	b.pollCall();
	a.turnEnd({ status: "OK", response: "ok", finished: true, aborted: false });
	assert.deepEqual(a.entries.map((entry) => entry.data.count), [2]);
	assert.equal(b.entries.length, 0);
	assert.equal(b.statuses.get("agy-poll"), "«dim:♊︎ bridge_poll_result → git_commit (x1)»");
	a.pollCall();
	await a.emit("agent_end");
	assert.deepEqual(a.entries.map((entry) => entry.data.count), [2, 1]);
	await a.emit("agent_end");
	assert.equal(a.entries.length, 2, "closing an empty fold is idempotent");
	await b.emit("session_shutdown");
	assert.deepEqual(b.entries.map((entry) => entry.data.count), [1]);
	b.pollCall();
	assert.equal(b.entries.length, 1, "late frames cannot resurrect a shut-down instance");
	await b.emit("session_start", { reason: "resume" });
	b.pollCall();
	await b.emit("agent_end");
	assert.deepEqual(b.entries.map((entry) => entry.data.count), [1, 1]);
	await b.emit("message_update", { message: { role: "assistant", provider: "antigravity", usage: { input: 10, output: 20 } } });
	assert.equal(b.statuses.get("agy-usage"), "«dim:ACP ≈ 10 in / 20 out»");
});

test.each(["throw", "reject"] as const)("a %s from the folded-entry sink cannot fail a turn or retain a closed run", async (failure) => {
	const s = await session();
	s.appendEntry.mockImplementation(() => {
		if (failure === "throw") throw new Error("entry sink failed");
		return Promise.reject(new Error("entry sink failed"));
	});
	await withoutUnhandledRejections(async () => {
		s.pollCall();
		s.turnEnd({ status: "OK", response: "ok", finished: true, aborted: false });
		assert.equal(s.appendEntry.mock.calls.length, 1);
		assert.equal(s.statuses.get("agy-poll"), undefined);
		await s.emit("agent_end");
		assert.equal(s.appendEntry.mock.calls.length, 1, "a rejected persistence sink cannot replay the same run");
	});
});

test("unknown-call and failed RPC polls are terminal, not permanently running statuses", async () => {
	const s = await session();
	s.poll.mockReturnValue(undefined);
	s.pollCall("missing");
	assert.deepEqual(s.entries.map((entry) => [entry.data.target, entry.data.state, entry.data.count]), [["unknown call", "failed", 1]]);
	assert.equal(s.statuses.get("agy-poll"), undefined);
	s.send({ type: "tool_error", name: POLL_TOOL_NAME, message: "poll RPC failed" });
	assert.deepEqual(s.entries.map((entry) => entry.data.state), ["failed", "failed"]);
	assert.equal(s.statuses.get("agy-poll"), undefined);
});
