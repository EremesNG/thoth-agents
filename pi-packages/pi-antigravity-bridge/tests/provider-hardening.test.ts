import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { normalizeContext, type Api, type AssistantMessageEvent, type Message, type Model } from "@earendil-works/pi-ai";
import { createStreamSimple, ToolRoundTrips, WrapperReplay } from "../src/provider.js";
import type { DriverActivity, DriverTurnRequest, TurnDriver, TurnHandle, TurnOutcome } from "../src/driver-types.js";
import { SessionStore } from "../src/sessions.js";

const model: Model<Api> = {
	id: "gemini-flash", name: "Flash", api: "agy-bridge" as Api, provider: "antigravity",
	baseUrl: "agy-bridge://antigravity", reasoning: false, input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 65536,
};
const ok: TurnOutcome = { status: "OK", response: "final answer", finished: true, aborted: false };
const user = normalizeContext({ messages: [{ role: "user", content: "hello", timestamp: 0 }] });
function store() {
	return new SessionStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "agy-hardening-")), "sessions.json"));
}
async function collect(stream: ReturnType<ReturnType<typeof createStreamSimple>>) {
	const events: AssistantMessageEvent[] = [];
	let ends = 0;
	const end = stream.end.bind(stream);
	stream.end = (...args) => { ends++; end(...args); };
	let timer: NodeJS.Timeout | undefined;
	try {
		await Promise.race([
			(async () => { for await (const event of stream) events.push(event); })(),
			new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("provider stream never ended")), 100); }),
		]);
	} finally { if (timer) clearTimeout(timer); }
	return { events, ends };
}

for (const failure of ["next", "outcome"] as const) {
	test(`${failure} rejection emits one error, ends once, and releases the next turn`, async () => {
		let active: TurnHandle | null = null;
		let runs = 0;
		const driver = {
			get activeHandle() { return active; },
			kickIdle() {}, reentry: () => active,
			async close() { active = null; },
			async run() {
				assert.equal(active, null, "failed handle must be released before another run");
				const fail = runs++ === 0;
				active = {
					id: `turn-${runs}`,
					outcome: fail && failure === "outcome" ? Promise.resolve().then(() => { throw new Error("outcome failed"); }) : Promise.resolve(ok),
					async next() { if (fail && failure === "next") throw new Error("next failed"); return null; },
					pushExternal() {},
				};
				return active;
			},
		} as unknown as TurnDriver;
		const simple = createStreamSimple({ entries: [], store: store(), driver, roundTrips: new ToolRoundTrips(driver) });
		const first = await collect(simple(model, user));
		assert.equal(first.ends, 1);
		assert.deepEqual(first.events.filter(e => e.type === "done" || e.type === "error").map(e => e.type), ["error"]);
		const error = first.events.find(e => e.type === "error");
		assert.match(error?.type === "error" ? error.error.errorMessage ?? "" : "", new RegExp(`${failure} failed`));
		const second = await collect(simple(model, user));
		assert.equal(second.events.at(-1)?.type, "done");
	});
}

test("a legitimately parked replay ends once without recycling its active turn", async () => {
	let closes = 0;
	const handle: TurnHandle = {
		id: "parked", outcome: new Promise(() => {}),
		async next() { return { type: "tool_done", name: "run_command", args: {}, output: "recorded" }; },
		pushExternal() {},
	};
	const driver = { activeHandle: handle, run: async () => handle, close: async () => { closes++; } } as unknown as TurnDriver;
	const simple = createStreamSimple({ entries: [], store: store(), driver, roundTrips: new ToolRoundTrips(driver), replay: new WrapperReplay() });
	const result = await collect(simple(model, user));
	assert.equal(result.ends, 1);
	assert.equal(result.events.at(-1)?.type, "done");
	assert.equal(closes, 0);
});

test("outcome rejection interrupts an outstanding activity wait", async () => {
	let reject!: (error: Error) => void;
	const handle: TurnHandle = { id: "waiting", outcome: new Promise((_, r) => { reject = r; }), next: () => new Promise(() => {}), pushExternal() {} };
	const driver = { activeHandle: handle, run: async () => handle, close: async () => {} } as unknown as TurnDriver;
	const simple = createStreamSimple({ entries: [], store: store(), driver, roundTrips: new ToolRoundTrips(driver) });
	const collecting = collect(simple(model, user));
	await Promise.resolve();
	await Promise.resolve();
	reject(new Error("outcome failed while waiting"));
	const result = await collecting;
	assert.equal(result.ends, 1);
	assert.equal(result.events.at(-1)?.type, "error");
});

function replayFixture(ttlMs?: number, beforeMarker = false) {
	let active: TurnHandle | null = null;
	let settle!: (outcome: TurnOutcome) => void;
	let launches = 0;
	const activities: DriverActivity[] = [
		{ type: "tool_done", name: "run_command", args: {}, output: "recorded output" },
		{ type: "thought", delta: "remaining activity" },
	];
	const original: TurnHandle = { id: "original-turn", outcome: new Promise(r => { settle = r; }), next: async () => activities.shift() ?? null, pushExternal() {} };
	const driver = {
		get activeHandle() { return active; }, reentry: () => active, kickIdle() {},
		async run() {
			launches++; active = original;
			if (beforeMarker) { active = null; rt.failAll("turn settled"); settle(ok); }
			return original;
		},
	} as unknown as TurnDriver;
	const rt = new ToolRoundTrips(driver, undefined, ttlMs === undefined ? {} : { replayTtlMs: ttlMs });
	const replay = new WrapperReplay();
	const simple = createStreamSimple({ entries: [], store: store(), driver, roundTrips: rt, replay });
	return {
		simple, rt, replay, launches: () => launches,
		settle(outcome = ok) { active = null; rt.failAll("turn settled"); settle(outcome); },
	};
}
function continuation(events: AssistantMessageEvent[]) {
	const call = events.find(e => e.type === "toolcall_end");
	assert.ok(call?.type === "toolcall_end");
	return normalizeContext({ messages: [{ role: "toolResult", toolCallId: call.toolCall.id, toolName: "antigravity", content: [{ type: "text", text: "replayed" }], isError: false, timestamp: 0 } as Message] });
}
for (const ordering of ["before marker", "after marker"] as const) {
	test(`settlement ${ordering} preserves the replay's final outcome and unread activities`, async () => {
		const f = replayFixture(undefined, ordering === "before marker");
		const firstStream = f.simple(model, user);
		const first = await collect(firstStream);
		if (ordering === "after marker") f.settle();
		const second = await collect(f.simple(model, continuation(first.events)));
		assert.equal(f.launches(), 1, "a matching continuation must not launch another agy prompt");
		assert.ok(second.events.some(e => e.type === "thinking_delta" && e.delta === "remaining activity"));
		assert.ok(second.events.some(e => e.type === "text_delta" && e.delta === "final answer"));
		assert.ok(second.events.some(e => e.type === "done" && e.reason === "stop"));
		assert.equal(f.replay.size, 1, "recorded display output is unchanged");
	});
}

test("a settled replay's error reaches its matching continuation", async () => {
	const f = replayFixture();
	const first = await collect(f.simple(model, user));
	f.settle({ ...ok, status: "ERROR", error: "settled failure" });
	const second = await collect(f.simple(model, continuation(first.events)));
	assert.equal(f.launches(), 1);
	const error = second.events.find(e => e.type === "error");
	assert.equal(error?.type === "error" ? error.error.errorMessage : undefined, "settled failure");
});

test("settled replay tombstones expire without blocking a fresh prompt", async () => {
	const f = replayFixture(10);
	const first = await collect(f.simple(model, user));
	f.settle();
	await new Promise(r => setTimeout(r, 25));
	const expired = await collect(f.simple(model, continuation(first.events)));
	assert.equal(expired.events.at(-1)?.type, "error");
	assert.equal(f.launches(), 1);
	const fresh = await collect(f.simple(model, user));
	assert.equal(fresh.events.at(-1)?.type, "done");
	assert.equal(f.launches(), 2);
});

test("shutdown clears replay tombstones and does not retain stale buffered markers", async () => {
	const f = replayFixture();
	const first = await collect(f.simple(model, user));
	f.settle();
	f.rt.clearReplayTurns();
	const afterShutdown = await collect(f.simple(model, continuation(first.events)));
	assert.equal(afterShutdown.events.at(-1)?.type, "error");
	assert.equal(f.launches(), 1);

	const g = replayFixture(undefined, true);
	const stream = g.simple(model, user);
	g.rt.clearReplayTurns(); // shutdown while run()/buffer consumption is still queued
	const parked = await collect(stream);
	const stale = await collect(g.simple(model, continuation(parked.events)));
	assert.equal(stale.events.at(-1)?.type, "error");
});

test("beforeStart deadline emits a named error and never launches the expired request", async () => {
	const previous = process.env.AGY_STARTUP_TIMEOUT_MS;
	process.env.AGY_STARTUP_TIMEOUT_MS = "10";
	let ready!: () => void;
	let launches = 0;
	const driver = { run: async () => { launches++; return { id: "fresh", next: async () => null, outcome: Promise.resolve(ok) }; } } as unknown as TurnDriver;
	const simple = createStreamSimple({ entries: [], store: store(), driver, roundTrips: new ToolRoundTrips(driver), beforeStart: () => new Promise<void>(r => { ready = r; }) });
	try {
		const expired = await collect(simple(model, user));
		const error = expired.events.find(e => e.type === "error");
		assert.match(error?.type === "error" ? error.error.errorMessage ?? "" : "", /beforeStart.*10ms/);
		assert.equal(expired.ends, 1);
		ready();
		await Promise.resolve();
		assert.equal(launches, 0);
	} finally {
		ready?.();
		if (previous === undefined) delete process.env.AGY_STARTUP_TIMEOUT_MS; else process.env.AGY_STARTUP_TIMEOUT_MS = previous;
	}
});

test("disabled startup and queue caps are forwarded without introducing a total-turn bound", async () => {
	const previousStartup = process.env.AGY_STARTUP_TIMEOUT_MS;
	const previousQueue = process.env.AGY_QUEUE_TIMEOUT_MS;
	process.env.AGY_STARTUP_TIMEOUT_MS = "0";
	process.env.AGY_QUEUE_TIMEOUT_MS = "0";
	let bounds: [number | undefined, number | undefined] | undefined;
	const driver = { async run(request: DriverTurnRequest) {
		bounds = [request.startupTimeoutMs, request.queueTimeoutMs];
		return { id: "disabled", next: async () => null, outcome: Promise.resolve(ok) };
	} } as unknown as TurnDriver;
	try {
		const simple = createStreamSimple({ entries: [], store: store(), driver, roundTrips: new ToolRoundTrips(driver), beforeStart: async () => { await new Promise(r => setTimeout(r, 30)); } });
		const result = await collect(simple(model, user));
		assert.equal(result.events.at(-1)?.type, "done");
		assert.deepEqual(bounds, [0, 0]);
	} finally {
		if (previousStartup === undefined) delete process.env.AGY_STARTUP_TIMEOUT_MS; else process.env.AGY_STARTUP_TIMEOUT_MS = previousStartup;
		if (previousQueue === undefined) delete process.env.AGY_QUEUE_TIMEOUT_MS; else process.env.AGY_QUEUE_TIMEOUT_MS = previousQueue;
	}
});

for (const failure of ["activity", "persistence"] as const) {
	test(`${failure} throw emits one terminal error and the next call proceeds`, async () => {
		let fail = true;
		let active: TurnHandle | null = null;
		const driver = {
			get activeHandle() { return active; },
			close: async () => { active = null; },
			async run() {
				let read = false;
				active = { id: "throwing", outcome: Promise.resolve({ ...ok, conversationId: "bound" }), next: async () => {
					if (read || failure === "persistence") return null;
					read = true;
					return { type: "tool_done", name: "run_command", args: {}, output: "display" };
				}, pushExternal() {} };
				return active;
			},
		} as unknown as TurnDriver;
		const sessionStore = store();
		const set = sessionStore.set.bind(sessionStore);
		if (failure === "persistence") sessionStore.set = (...args) => { if (fail) throw new Error("persistence failed"); set(...args); };
		const simple = createStreamSimple({ entries: [], store: sessionStore, driver, roundTrips: new ToolRoundTrips(driver), replay: new WrapperReplay(), nativeActive: () => { if (fail) throw new Error("activity failed"); return true; } });
		// A read-only mapped activity exercises the caller's display predicate.
		if (failure === "activity") driver.run = async () => {
			let read = false;
			active = { id: "activity", outcome: Promise.resolve(ok), next: async () => read ? null : (read = true, { type: "tool_done", name: "view_file", args: { path: "file.txt" }, output: "recorded" }), pushExternal() {} };
			return active;
		};
		const first = await collect(simple(model, user));
		assert.equal(first.ends, 1);
		assert.deepEqual(first.events.filter(e => e.type === "done" || e.type === "error").map(e => e.type), ["error"]);
		fail = false;
		const second = await collect(simple(model, user));
		assert.equal(second.events.at(-1)?.type, "done");
	});
}
