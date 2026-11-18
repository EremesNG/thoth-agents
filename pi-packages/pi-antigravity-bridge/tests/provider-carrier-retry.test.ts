import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test, vi } from "vitest";
import { normalizeContext, type Api, type Model, type SimpleStreamOptions } from "@earendil-works/pi-ai";
import { createStreamSimple, ToolRoundTrips, TOOL_PRIORITY_NOTE } from "../src/provider.js";
import { SessionStore } from "../src/sessions.js";
import type { DriverActivity, DriverTurnRequest, TurnDriver, TurnOutcome } from "../src/driver-types.js";
import { resetSyspromptAgentForTests } from "../src/sysprompt-agent.js";

const dirs: string[] = [];
afterEach(() => {
	vi.unstubAllEnvs();
	resetSyspromptAgentForTests();
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
const model = {
	id: "gemini-flash",
	name: "flash",
	api: "agy-bridge",
	provider: "antigravity",
	baseUrl: "agy-bridge://antigravity",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 1e6,
	maxTokens: 65536,
} as Model<Api>;
const failure: TurnOutcome = {
	status: "ERROR",
	error: "attempt 1 failed (RESOURCE_EXHAUSTED: code 429)",
	response: "",
	finished: true,
	aborted: false,
	modelOutputSeen: false,
	conversationId: "rejected",
};
const success: TurnOutcome = {
	status: "OK",
	response: "hola",
	finished: true,
	aborted: false,
	modelOutputSeen: true,
	conversationId: "inline-conversation",
};
function harness(
	outcomes: TurnOutcome[] = [failure, success],
	activityTurns: DriverActivity[][] = [],
	mode: string | undefined = "tui",
	getRunCommandGuard?: () => { active: boolean; serverName?: string },
) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-carrier-retry-"));
	dirs.push(dir);
	vi.stubEnv("AGY_AGENTS_ROOT", path.join(dir, "agents"));
	vi.stubEnv("AGY_SYSTEM_PROMPT", "on");
	vi.stubEnv("AGY_AGENT", "");
	vi.stubEnv("AGY_ENGINE", "stream-json");
	vi.stubEnv("AGY_DIGEST", "off");
	const requests: DriverTurnRequest[] = [];
	const order: string[] = [];
	const close = vi.fn(async () => {
		order.push("close");
	});
	const driver = {
		run: async (request: DriverTurnRequest) => {
			requests.push(request);
			order.push("run");
			const outcome = outcomes.shift() ?? success;
			const activities = activityTurns.shift() ?? [];
			return {
				id: String(requests.length),
				conversationId: outcome.conversationId,
				next: async () => activities.shift() ?? null,
				pushExternal: () => {},
				outcome: Promise.resolve(outcome),
			};
		},
		close,
	} as unknown as TurnDriver;
	const store = new SessionStore(path.join(dir, "sessions.json"));
	const log = vi.fn();
	const stream = createStreamSimple({
		getSessionMode: () => mode,
		getRunCommandGuard,
		entries: [],
		store,
		driver,
		roundTrips: new ToolRoundTrips(driver),
		log,
	});
	const turn = async () => {
		const events = [];
		for await (const event of stream(
			model,
			normalizeContext({
				systemPrompt: "You are a coding assistant running inside pi.\n<addendum>\nThoth policy\n</addendum>",
				messages: [{ role: "user", content: "hola", timestamp: 1 }],
			}),
			{ cwd: dir } as unknown as SimpleStreamOptions,
		))
			events.push(event);
		return events;
	};
	return { dir, store, requests, order, close, log, turn };
}

test("fresh automatic carrier 429 retries once inline on a fresh process and persists only the retry binding", async () => {
	const h = harness();
	const events = await h.turn();
	assert.equal(h.requests.length, 2);
	assert.match(h.requests[0].agent!, /^pi-bridge-sys-/);
	assert.equal(h.requests[1].agent, undefined);
	assert.equal(h.requests[1].conversationId, null);
	assert.ok(h.requests[1].prompt.includes("Thoth policy"));
	assert.ok(h.requests[1].prompt.includes(TOOL_PRIORITY_NOTE));
	assert.ok(h.requests[1].prompt.endsWith("hola"));
	assert.ok(!h.requests[1].prompt.includes("You are a coding assistant running inside pi"));
	assert.deepEqual(h.order, ["run", "close", "run"]);
	assert.ok(h.log.mock.calls.some(([event]) => event === "sysprompt-inline-retry"));
	assert.ok(!events.some((event) => event.type === "error"));
	await h.turn();
	assert.equal(h.requests[2].conversationId, "inline-conversation");
	assert.equal(h.requests[2].agent, undefined);
	assert.equal(h.requests[2].prompt, "hola");
});

test("inline 429 retry preserves guarded tool priority note in non-tui mode", async () => {
	const h = harness([failure, success], [], "rpc", () => ({ active: true, serverName: "pi-agy-11223344" }));
	const events = await h.turn();
	assert.ok(!events.some((event) => event.type === "error"));
	assert.equal(h.requests.length, 2);
	assert.match(h.requests[1].prompt, /pi-agy-11223344\/bash/);
	assert.match(h.requests[1].prompt, /run_command is refused/i);
});

test.each(["tui", "print", "unknown"])("inline retry retains %s session guidance", async (mode) => {
	const h = harness([failure, success], [], mode);
	await h.turn();
	assert.equal(h.requests.length, 2);
	const carrier = fs.readFileSync(path.join(h.dir, "agents", h.requests[0].agent!, "agent.md"), "utf8");
	for (const body of [carrier, h.requests[1].prompt]) {
		assert.ok(body.includes("Long-running bridge calls do not fail"));
		assert.equal(body.includes(TOOL_PRIORITY_NOTE), mode === "tui");
		assert.equal(body.includes("prefer exec_command's session-output pattern or background agents"), mode === "tui");
	}
});

test.each([
	["resumed", {}],
	["after output", { modelOutputSeen: true }],
	["non-429", { error: "permission denied" }],
	["disabled", {}],
	["user agent", {}],
	["staging failure", {}],
	["aborted", { aborted: true }],
	["unknown output evidence", { modelOutputSeen: undefined }],
] as const)("never retries %s turns", async (variant, patch) => {
	const h = harness([{ ...failure, ...patch }]);
	if (variant === "resumed")
		h.store.set(`cwd:${h.dir}`, {
			conversationId: "prior",
			lastStepIdx: -1,
			lastMessageCount: 0,
		});
	if (variant === "disabled") vi.stubEnv("AGY_SYSTEM_PROMPT", "off");
	if (variant === "user agent") vi.stubEnv("AGY_AGENT", "operator-agent");
	if (variant === "staging failure") {
		const file = path.join(h.dir, "not-a-directory");
		fs.writeFileSync(file, "x");
		vi.stubEnv("AGY_AGENTS_ROOT", file);
	}
	const events = await h.turn();
	assert.equal(h.requests.length, 1);
	assert.equal(h.close.mock.calls.length, 0);
	if (variant === "resumed") assert.equal(h.requests[0].conversationId, "prior");
	assert.ok(events.some((event) => event.type === "error"));
});

test("retry failure is surfaced normally, never a third dispatch", async () => {
	const h = harness([failure, { ...failure, conversationId: "second-rejection" }]);
	const events = await h.turn();
	assert.equal(h.requests.length, 2);
	assert.equal(h.close.mock.calls.length, 1);
	assert.ok(events.some((event) => event.type === "error" && event.error.errorMessage?.includes("RESOURCE_EXHAUSTED")));
});

test("a plain HTTP 429 error also qualifies", async () => {
	const h = harness([{ ...failure, error: "HTTP 429 Too Many Requests" }, success]);
	await h.turn();
	assert.equal(h.requests.length, 2);
});

test("an inline retry that parks binds its own conversation without remembering the rejected carrier", async () => {
	const h = harness(
		[failure, success],
		[
			[],
			[
				{
					type: "bridge_call",
					callId: "call-1",
					name: "read",
					args: { path: "AGENTS.md" },
				},
			],
		],
	);
	const events = await h.turn();
	assert.ok(events.some((event) => event.type === "done" && event.reason === "toolUse"));
	assert.equal(h.store.get(`cwd:${h.dir}`)?.conversationId, "inline-conversation");
	await h.turn();
	assert.equal(h.requests[2].conversationId, "inline-conversation");
	assert.equal(h.requests[2].agent, undefined);
});

test("silent-drop protection still runs on the inline retry outcome", async () => {
	const h = harness([failure, { ...success, response: "", modelOutputSeen: false }]);
	const events = await h.turn();
	assert.equal(h.requests.length, 2);
	assert.equal(h.store.get(`cwd:${h.dir}`), null);
	assert.ok(events.some((event) => event.type === "error" && event.error.errorMessage?.includes("silently dropped")));
});

test.each([true, false])("identity-late parked inline retry (guardActive=%s) records guard state on continuation and does not restage on next turn", async (guardActive) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-carrier-retry-late-"));
	dirs.push(dir);
	const agentsRoot = path.join(dir, "agents");
	vi.stubEnv("AGY_AGENTS_ROOT", agentsRoot);
	vi.stubEnv("AGY_SYSTEM_PROMPT", "on");
	vi.stubEnv("AGY_AGENT", "");
	vi.stubEnv("AGY_ENGINE", "stream-json");
	vi.stubEnv("AGY_DIGEST", "off");

	const requests: DriverTurnRequest[] = [];
	const store = new SessionStore(path.join(dir, "sessions.json"));
	let activeHandle: any;
	let roundTrips: ToolRoundTrips;
	let settleLateRetry!: (outcome: TurnOutcome) => void;
	const driver = {
		get activeHandle() {
			return activeHandle;
		},
		reentry: () => activeHandle,
		kickIdle: () => {},
		run: async (request: DriverTurnRequest) => {
			requests.push(request);
			const callNum = requests.length;
			if (callNum === 1) {
				const handle = {
					id: "1",
					conversationId: failure.conversationId,
					next: async () => null,
					pushExternal: () => {},
					outcome: Promise.resolve(failure),
				};
				activeHandle = handle;
				return handle;
			}
			if (callNum === 2) {
				const queue: DriverActivity[] = [];
				let resolveNext: ((v: DriverActivity | null) => void) | undefined;
				let closed = false;
				let handle!: {
					id: string;
					conversationId?: string;
					next: () => Promise<DriverActivity | null>;
					pushExternal: (a: DriverActivity) => void;
					outcome: Promise<TurnOutcome>;
				};
				const outcome = new Promise<TurnOutcome>((resolve) => {
					settleLateRetry = (out) => {
						handle.conversationId = out.conversationId;
						closed = true;
						resolveNext?.(null);
						resolveNext = undefined;
						resolve(out);
					};
				});
				handle = {
					id: "2",
					conversationId: undefined,
					pushExternal: (a: DriverActivity) => {
						if (resolveNext) {
							const r = resolveNext;
							resolveNext = undefined;
							r(a);
						} else {
							queue.push(a);
						}
					},
					next: () => {
						if (queue.length > 0) return Promise.resolve(queue.shift()!);
						if (closed) return Promise.resolve(null);
						return new Promise<DriverActivity | null>((resolve) => {
							resolveNext = resolve;
						});
					},
					outcome,
				};
				activeHandle = handle;
				queueMicrotask(() => {
					void roundTrips.onToolCall("call-late-1", "read", { path: "AGENTS.md" }, new AbortController().signal);
				});
				return handle;
			}
			const handle = {
				id: String(callNum),
				conversationId: "inline-conversation",
				next: async () => null,
				pushExternal: () => {},
				outcome: Promise.resolve(success),
			};
			activeHandle = handle;
			return handle;
		},
		close: vi.fn(async () => {
			activeHandle = undefined;
		}),
	} as unknown as TurnDriver;

	roundTrips = new ToolRoundTrips(driver);
	const stream = createStreamSimple({
		getSessionMode: () => "rpc",
		getRunCommandGuard: () => ({ active: guardActive, serverName: "pi-agy-11223344" }),
		entries: [],
		store,
		driver,
		roundTrips,
	});

	// Turn 1: 429 on carrier -> retries inline -> parks BEFORE conversationId is known
	const turn1Events: any[] = [];
	let assistantMsg: any;
	for await (const ev of stream(
		model,
		normalizeContext({
			systemPrompt: "You are a coding assistant running inside pi.\n<addendum>\nThoth policy\n</addendum>",
			messages: [{ role: "user", content: "hola", timestamp: 1 }],
		}),
		{ cwd: dir } as unknown as SimpleStreamOptions,
	)) {
		turn1Events.push(ev);
		if (ev.type === "done") assistantMsg = ev.message;
	}
	assert.equal(requests.length, 2);
	assert.match(requests[0].agent!, /^pi-bridge-sys-/);
	assert.equal(requests[1].agent, undefined);
	assert.equal(assistantMsg?.stopReason, "toolUse");
	// Identity-late park: store must not be bound yet
	assert.equal(store.get(`cwd:${dir}`), null);

	const toolUse = assistantMsg.content.find((b: any) => b.type === "toolCall");
	assert.equal(toolUse.id, "call-late-1");

	// Continuation resolves the parked tool call, then retry finishes with conversationId
	const contPromise = (async () => {
		const events: any[] = [];
		for await (const ev of stream(
			model,
			normalizeContext({
				systemPrompt: "You are a coding assistant running inside pi.\n<addendum>\nThoth policy\n</addendum>",
				messages: [
					{ role: "user", content: "hola", timestamp: 1 },
					assistantMsg,
					{
						role: "toolResult",
						toolCallId: "call-late-1",
						toolName: "read",
						content: [{ type: "text", text: "contents" }],
						isError: false,
						timestamp: 2,
					},
				],
			}),
			{ cwd: dir } as unknown as SimpleStreamOptions,
		)) {
			events.push(ev);
		}
		return events;
	})();

	await new Promise((r) => setTimeout(r, 20));
	settleLateRetry(success);
	const contEvents = await contPromise;
	assert.deepEqual(contEvents.filter((ev) => ev.type === "error"), []);
	assert.ok(contEvents.some((ev) => ev.type === "done" && ev.reason === "stop"));

	// Stored guard state must reflect the inline retry's delivered guard state
	assert.deepEqual(store.get(`cwd:${dir}`), {
		conversationId: "inline-conversation",
		lastStepIdx: -1,
		lastMessageCount: 4,
		runCommandGuardActive: guardActive,
	});
	const stagedBeforeTurn3 = fs.readdirSync(agentsRoot);
	assert.equal(stagedBeforeTurn3.length, 1);

	// Next turn must resume inline-conversation with NO needless restage or refresh note
	for await (const _ev of stream(
		model,
		normalizeContext({
			systemPrompt: "You are a coding assistant running inside pi.\n<addendum>\nThoth policy\n</addendum>",
			messages: [{ role: "user", content: "hola", timestamp: 3 }],
		}),
		{ cwd: dir } as unknown as SimpleStreamOptions,
	)) {
		void _ev;
	}
	assert.equal(requests.length, 3);
	assert.equal(requests[2].conversationId, "inline-conversation");
	assert.equal(requests[2].agent, undefined);
	assert.equal(requests[2].prompt, "hola");
	assert.deepEqual(fs.readdirSync(agentsRoot), stagedBeforeTurn3);
});
