import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, test, vi } from "vitest";
import { normalizeContext, type Api, type Message, type Model } from "@earendil-works/pi-ai";
import { createStreamSimple, rotateAgySession, ToolRoundTrips } from "../src/provider.js";
import type { DriverTurnRequest, TurnDriver, TurnHandle } from "../src/driver-types.js";
import { SessionStore } from "../src/sessions.js";
import { StreamDriver } from "../src/driver.js";
import { AcpDriver } from "../src/acp/driver.js";
import { warmJobLauncher } from "./helpers/warm-job-launcher.js";

beforeAll(warmJobLauncher, 60_000);

const model = { id: "gemini-flash", name: "Gemini Flash", api: "agy-bridge", provider: "antigravity",
	baseUrl: "agy-bridge://antigravity", reasoning: false, input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_000_000, maxTokens: 65_536 } as Model<Api>;
const dirs: string[] = [];
afterEach(() => {
	vi.unstubAllEnvs();
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
const user = (content: string): Message => ({ role: "user", content, timestamp: 0 });
const assistant = (text: string, provider = "antigravity"): Message => ({ role: "assistant", provider,
	content: [{ type: "text", text }], timestamp: 0 }) as Message;
const result = (toolCallId: string, text: string): Message => ({ role: "toolResult", toolCallId,
	toolName: "read", content: [{ type: "text", text }], isError: false, timestamp: 0 });

function harness(engine: "stream-json" | "acp", bound = true) {
	vi.stubEnv("AGY_SYSTEM_PROMPT", "off");
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-resume-"));
	dirs.push(dir);
	const store = new SessionStore(path.join(dir, "sessions.json"));
	const key = `sid:resume${engine === "acp" ? "@acp" : ""}`;
	if (bound) store.set(key, { conversationId: "current", lastStepIdx: -1, lastMessageCount: 1 });
	const requests: DriverTurnRequest[] = [];
	let owner: TurnHandle = { id: "owner", outcome: Promise.resolve({ status: "OK", response: "ok",
		finished: true, aborted: false }), next: async () => null, pushExternal() {} };
	const driver = { get activeHandle() { return owner; }, kickIdle() {}, reentry: () => null,
		run: async (request: DriverTurnRequest) => { requests.push(request); return { ...owner,
			outcome: Promise.resolve({ status: "OK", response: "ok", finished: true, aborted: false,
				conversationId: request.conversationId ?? undefined }) }; } } as unknown as TurnDriver;
	const rt = new ToolRoundTrips(driver, undefined, { escalateAfterMs: 1 });
	const simple = createStreamSimple({ entries: [], store, driver, acpDriver: engine === "acp" ? driver : undefined,
		engine, roundTrips: rt });
	return { requests, rt, store, key,
		own(conversationId: string) { owner = { ...owner, id: conversationId, outcome: Promise.resolve({
			status: "OK", response: "ok", finished: true, aborted: false, conversationId }) }; },
		async run(messages: Message[]) {
			const events = [];
			for await (const event of simple(model, normalizeContext({ messages }), { sessionId: "resume" })) events.push(event);
			return events;
		},
	};
}

test.each(["stream-json", "acp"] as const)("%s resumes a bound retry-dropped tool-result tail", async engine => {
	const h = harness(engine);
	const events = await h.run([user("ORIGINAL TASK"), assistant("working"), result("lost", "TOOL OUTPUT")]);
	assert.equal(events.at(-1)?.type, "done");
	assert.equal(h.requests.length, 1);
	assert.equal(h.requests[0].conversationId, "current");
	assert.match(h.requests[0].prompt, /Check your conversation history/);
	assert.match(h.requests[0].prompt, /Do not repeat completed actions/);
	assert.doesNotMatch(h.requests[0].prompt, /ORIGINAL TASK|TOOL OUTPUT/);
});

test.each(["stream-json", "acp"] as const)("%s synthetic assistant-tail resumes skip the digest, ordinary user turns retain it", async engine => {
	vi.stubEnv("AGY_DIGEST", "1");
	const h = harness(engine);
	const prefix = [user("original"), assistant("OTHER PROVIDER NOTE", "other"), result("external", "EXTERNAL RESULT")];
	await h.run([...prefix, assistant("partial answer")]);
	assert.equal(h.requests.length, 1);
	assert.match(h.requests[0].prompt, /Check your conversation history/);
	assert.doesNotMatch(h.requests[0].prompt, /OTHER PROVIDER NOTE|EXTERNAL RESULT|broader pi session/);
	assert.equal(h.requests[0].contextBlock, undefined);
	const control = harness(engine);
	await control.run([...prefix, user("NEW USER INPUT")]);
	assert.match(JSON.stringify(control.requests[0]), /OTHER PROVIDER NOTE/);
	assert.match(JSON.stringify(control.requests[0]), /EXTERNAL RESULT/);
	assert.match(control.requests[0].prompt, /NEW USER INPUT/);
});

test.each(["stream-json", "acp"] as const)("%s empty or unbound retry tails retain the hard error", async engine => {
	for (const bound of [false, true]) {
		const h = harness(engine, bound);
		for (const messages of bound ? [[]] : [[assistant("partial")], [result("lost", "output")], []]) {
			const events = await h.run(messages);
			const error = events.find(event => event.type === "error");
			assert.equal(error?.error.errorMessage, "No user message to send to agy.");
		}
		assert.equal(h.requests.length, 0);
	}
});

test.each(["stream-json", "acp"] as const)("%s image-only and plain user input never use a synthetic resume", async engine => {
	const h = harness(engine);
	await h.run([{ role: "user", content: [{ type: "image", data: "aWNvbg==", mimeType: "image/png" }], timestamp: 0 }]);
	assert.equal(h.requests[0].prompt, "");
	assert.equal(h.requests[0].images?.length, 1);
	await h.run([user("FRESH INPUT")]);
	assert.equal(h.requests[1].prompt, "FRESH INPUT");
});

test.each(["stream-json", "acp"] as const)("%s recovery suppresses resume only for the recovered conversation; unknown owners stay pollable", async engine => {
	for (const origin of ["current", "other", undefined]) {
		const h = harness(engine);
		if (origin) h.own(origin);
		await h.rt.onToolCall("late", "read", {}, new AbortController().signal);
		h.rt.resolve("late", "PRIVATE LATE OUTPUT", false);
		const events = await h.run([assistant("partial"), result("late", "PRIVATE LATE OUTPUT")]);
		assert.equal(events.at(-1)?.type, "done");
		assert.deepEqual(h.requests.map(request => request.conversationId),
			origin === "other" ? ["other", "current"] : origin === "current" ? ["current"] : []);
		if (origin) {
			assert.match(h.requests[0].prompt, /Late tool delivery/);
			assert.match(h.requests[0].prompt, /PRIVATE LATE OUTPUT/);
			assert.equal(h.rt.poll("late")?.delivered, true);
		}
		if (origin === "other") {
			assert.match(h.requests.at(-1)!.prompt, /Check your conversation history/);
			assert.doesNotMatch(h.requests.at(-1)!.prompt, /PRIVATE LATE OUTPUT/);
		}
		if (!origin) {
			assert.equal(h.rt.poll("late")?.text, "PRIVATE LATE OUTPUT");
			assert.equal(h.rt.poll("late")?.delivered, false);
			assert.ok(h.rt.claimUndelivered("late"), "unknown owner remains claimable, not consumed");
		}
	}
});

const driverRequest = { cwd: process.cwd(), model: "gemini-3.8-flash", mode: "accept-edits",
	skipPermissions: true, timeoutMin: 0, inactivityMin: 0, startupTimeoutMs: 5_000 };

test("stream-json handles expose only their own live identity, never a prior turn's global binding", async () => {
	vi.stubEnv("PATH", `${path.join(import.meta.dirname, "helpers", "fake-agy-bin")}${path.delimiter}${process.env.PATH}`);
	const driver = new StreamDriver();
	try {
		const first = await driver.run({ ...driverRequest, prompt: "HANG" });
		await vi.waitFor(() => assert.equal(first.conversationId, "conv-hang"));
		assert.equal(driver.activeHandle?.conversationId, "conv-hang");
		await driver.close("recycle", "new turn");
		await first.outcome;
		// This process reports no identity, even though the requested/global
		// binding belongs to the prior turn. It must stay unavailable.
		const second = await driver.run({ ...driverRequest, prompt: "CHECKPOINT-PROGRESS", conversationId: "conv-hang" });
		assert.equal(second.conversationId, undefined);
		await second.outcome;
		assert.equal(second.conversationId, undefined);
		assert.equal(first.conversationId, "conv-hang", "retained handles do not track later driver state");
	} finally { await driver.close("shutdown"); }
}, 15_000);

test("ACP handles expose the session observed during their own setup, including recreation", async () => {
	const env = { ACP_FAKE_SCENARIO: "load-fails" };
	const driver = new AcpDriver({ bin: process.execPath,
		binArgs: [path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs")], extraEnv: env });
	try {
		const handle = await driver.run({ ...driverRequest, prompt: "hello", conversationId: "stale-requested-session" });
		assert.equal(handle.conversationId, "fake-session-0001");
		assert.equal(driver.activeHandle?.conversationId, "fake-session-0001");
		await handle.outcome;
		await driver.close("recycle", "later state must not replace handle identity");
		env.ACP_FAKE_SCENARIO = "slow";
		const later = await driver.run({ ...driverRequest, prompt: "later", conversationId: "loaded-other" });
		assert.equal(later.conversationId, "loaded-other");
		assert.equal(driver.activeHandle?.conversationId, "loaded-other");
		assert.equal(handle.conversationId, "fake-session-0001");
	} finally { await driver.close("shutdown"); }
}, 15_000);

const helperFlags = [{ cacheRetention: "none" }, { disableContinuation: true }] as const;
for (const engine of ["stream-json", "acp"] as const) {
	test.each(helperFlags)(`${engine} helper %j runs while the predecessor is parked`, async flag => {
		vi.stubEnv("PATH", `${path.join(import.meta.dirname, "helpers", "fake-agy-bin")}${path.delimiter}${process.env.PATH}`);
		vi.stubEnv("AGY_SYSTEM_PROMPT", "off");
		vi.stubEnv("AGY_QUEUE_TIMEOUT_MS", "500");
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-helper-"));
		dirs.push(dir);
		const newDriver = (scenario: string) => engine === "stream-json" ? new StreamDriver() : new AcpDriver({
			bin: process.execPath, binArgs: [path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs")],
			extraEnv: { ACP_FAKE_SCENARIO: scenario },
		});
		const owner = newDriver("slow");
		const helper = newDriver("happy");
		const store = new SessionStore(path.join(dir, "sessions.json"));
		const rt = new ToolRoundTrips(owner, undefined, { escalateAfterMs: name => name === "stranded" ? 5 : 60_000 });
		const deps = { entries: [], store, driver: owner, engine, roundTrips: rt,
			acpDriver: engine === "acp" ? owner : undefined,
			createHelper: async () => ({ driver: helper, dispose: () => helper.close("shutdown") }),
		};
		const simple = createStreamSimple(deps);
		try {
			const options = { sessionId: "helper-park", signal: AbortSignal.timeout(4000) };
			const original = simple(model, normalizeContext({ messages: [user("HANG")] }), { sessionId: options.sessionId });
			await vi.waitFor(() => assert.ok(owner.activeHandle?.conversationId), { timeout: 2500 });
			const running = owner.activeHandle!;
			const parked = rt.onToolCall("owner-call", "read", {}, new AbortController().signal);
			let released = false;
			void parked.then(() => { released = true; }, () => { released = true; });
			assert.equal((await original.result()).stopReason, "toolUse");
			const key = `sid:${options.sessionId}${engine === "acp" ? "@acp" : ""}`;
			await vi.waitFor(() => assert.equal(store.get(key)?.conversationId, running.conversationId));
			const binding = store.get(key);
			assert.equal(binding?.conversationId, running.conversationId);
			const stranded = await rt.onToolCall("stranded-call", "stranded", {}, new AbortController().signal);
			assert.ok("escalated" in stranded);
			rt.resolve("stranded-call", "untouched escrow result", false);
			const answer = await simple(model, normalizeContext({ messages: [result("stranded-call", "untouched escrow result"), user("summarize only")] }), { ...options, ...flag }).result();
			assert.equal(answer.stopReason, "stop", answer.errorMessage);
			assert.equal(owner.activeHandle?.outcome, running.outcome);
			assert.equal(released, false);
			assert.notEqual(rt.poll("stranded-call")?.delivered, true);
			assert.ok(rt.claimUndelivered("stranded-call"));
			assert.deepEqual(store.get(key), binding);
		} finally {
			rt.failAll("fixture cleanup");
			rt.clearEscalations("fixture cleanup");
			await Promise.all([owner.close("shutdown"), helper.close("shutdown")]);
		}
	}, 12_000);
}

for (const engine of ["stream-json", "acp"] as const) {
	test.each(["before-strand", "at-boundary", "done-at-boundary", "after-commit"] as const)(`${engine} leaves a rotated owner result pollable (%s)`, async timing => {
		const atBoundary = timing === "at-boundary" || timing === "done-at-boundary";
		vi.stubEnv("PATH", `${path.join(import.meta.dirname, "helpers", "fake-agy-bin")}${path.delimiter}${process.env.PATH}`);
		vi.stubEnv("AGY_SYSTEM_PROMPT", "off");
		vi.stubEnv("AGY_DIGEST", "off");
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-strand-rotation-"));
		dirs.push(dir);
		const log = path.join(dir, "prompts.jsonl");
		vi.stubEnv("AGY_FAKE_PROMPT_LOG", log);
		const store = new SessionStore(path.join(dir, "sessions.json"));
		const sessionId = "strand-rotated";
		const rotate = () => rotateAgySession(store, sessionId, dir, engine, { summary: "latest public summary", timestamp: new Date(0).toISOString() });
		let checks = 0;
		let armed = false;
		const verify = () => { if (armed && ++checks === 2) rotate(); };
		const env = { ACP_FAKE_SCENARIO: "slow", ACP_FAKE_LOG: log };
		const streamDriver = new StreamDriver();
		streamDriver.verifyDelivery = verify;
		const acpDriver = engine === "acp" ? new AcpDriver({ bin: process.execPath,
			binArgs: [path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs")], extraEnv: env, verifyDelivery: verify }) : undefined;
		const driver = acpDriver ?? streamDriver;
		const rt = new ToolRoundTrips(driver, undefined, { escalateAfterMs: 5 });
		const simple = createStreamSimple({ entries: [], store, driver: streamDriver, acpDriver,
			engine, roundTrips: rt, log: event => { if (atBoundary && event === "escalated-redelivery") armed = true; } });
		const run = (messages: Message[]) => simple(model, normalizeContext({ messages }), { sessionId }).result();
		const callId = "rotated-away-call-id";
		const payload = "ROTATED-AWAY_DISTINCTIVE_RESULT_BODY_13F31C";
		const toolResult = result(callId, payload);
		const summary = user("The conversation history before this point was compacted into the following summary:\n\n<summary>\nlatest public summary\n</summary>");
		const prompts = () => fs.readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line))
			.filter(record => record.event === "user" || record.method === "session/prompt");
		try {
			const original = run([user("HANG")]);
			// ACP learns its session ID before dispatch. Wait for the peer's
			// actual wire receipt before parking and retiring that connection.
			await vi.waitFor(() => {
				assert.ok(driver.activeHandle?.conversationId);
				assert.equal(prompts().length, 1);
			}, { timeout: 2500 });
			const origin = driver.activeHandle!;
			const ack = rt.onToolCall(callId, "read", {}, new AbortController().signal);
			assert.equal((await original).stopReason, "toolUse");
			assert.ok("escalated" in await ack);
			await driver.close("recycle", "retire owner");
			assert.ok((await origin.outcome).conversationId);
			env.ACP_FAKE_SCENARIO = "load-fails";
			if (atBoundary) {
				if (timing === "done-at-boundary") assert.ok(rt.resolve(callId, payload, false));
				await run([assistant("owner response"), toolResult]);
				assert.equal(checks, 2, "rotation happened at the real write-boundary check");
				assert.equal(prompts().length, 1, "reserved strand writes no prompt");
				armed = false;
			} else {
				rotate();
				if (timing !== "after-commit") {
					await run([summary, assistant("owner response"), toolResult]);
					assert.equal(prompts().length, 1, "old completion alone must not claim the handoff");
				}
			}
			const next = await run([summary, assistant("retained response"), ...(timing === "after-commit" ? [] : [toolResult]), user("new turn")]);
			assert.equal(next.stopReason, "stop", next.errorMessage);
			assert.equal(prompts().length, 2);
			if (timing === "after-commit") {
				assert.equal(rt.poll(callId)?.state, "running");
				const completed = await run([summary, user("new turn"), assistant("finished fresh turn"), toolResult]);
				assert.equal(completed.stopReason, "stop", completed.errorMessage);
				assert.equal(prompts().length, 2, "completion-only pass must not write another prompt");
				assert.equal(rt.poll(callId)?.state, "done");
			}
			const wire = JSON.stringify(prompts()); // Includes ACP embedded Context and stream-json inline text.
			assert.doesNotMatch(wire, new RegExp(`${callId}|${payload}`));
			assert.match(wire, /latest public summary/);
			assert.equal(rt.poll(callId)?.text, payload);
			assert.notEqual(rt.poll(callId)?.delivered, true);
			assert.ok(rt.claimUndelivered(callId), "cancelled reservation was released");
		} finally {
			rt.clearEscalations("fixture cleanup");
			await driver.close("shutdown");
		}
	}, 12_000);
}

test.each(["HANDOFF_NO_ID", "HANDOFF_UNKNOWN"])("stream-json %s relinquishes the handoff and retries in a fresh process", async first => {
	vi.stubEnv("PATH", `${path.join(import.meta.dirname, "helpers", "fake-agy-bin")}${path.delimiter}${process.env.PATH}`);
	vi.stubEnv("AGY_DIGEST", "off");
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-handoff-retry-"));
	dirs.push(dir);
	const log = path.join(dir, "prompts.jsonl");
	vi.stubEnv("AGY_FAKE_PROMPT_LOG", log);
	const store = new SessionStore(path.join(dir, "sessions.json"));
	const driver = new StreamDriver();
	const simple = createStreamSimple({ entries: [], store, driver, engine: "stream-json", roundTrips: new ToolRoundTrips(driver) });
	const sessionId = "handoff-retry";
	const summary = user("The conversation history before this point was compacted into the following summary:\n\n<summary>\nhandoff again\n</summary>");
	const run = (prompt: string) => simple(model, normalizeContext({ messages: [summary, user(prompt)] }), { sessionId }).result();
	try {
		rotateAgySession(store, sessionId, dir, "stream-json", { summary: "handoff again", timestamp: new Date(0).toISOString() });
		await run(first);
		assert.equal(store.get(`sid:${sessionId}`), null);
		assert.equal((await run("retry")).stopReason, "stop");
		const [a, b] = fs.readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
		assert.notEqual(a.pid, b.pid);
		assert.match(a.message.content, /handoff again/);
		assert.match(b.message.content, /handoff again/);
	} finally { await driver.close("shutdown"); }
});
