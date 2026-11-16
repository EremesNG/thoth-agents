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
function harness(outcomes: TurnOutcome[] = [failure, success], activityTurns: DriverActivity[][] = []) {
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
