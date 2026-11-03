import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, test, vi } from "vitest";
import { normalizeContext, type Api, type Message, type Model } from "@earendil-works/pi-ai";
import type { DriverTurnRequest, TurnDriver, TurnHandle, TurnOutcome } from "../src/driver-types.js";
import { ToolRoundTrips, createStreamSimple } from "../src/provider.js";
import { SessionStore } from "../src/sessions.js";
import { StreamDriver } from "../src/driver.js";
import { warmJobLauncher } from "./helpers/warm-job-launcher.js";

beforeAll(warmJobLauncher, 60_000);

const model = { id: "gemini-flash", name: "Flash", api: "agy-bridge", provider: "antigravity",
	baseUrl: "agy-bridge://antigravity", reasoning: false, input: ["text", "image"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_000_000, maxTokens: 65_536 } as Model<Api>;
const IMG_A = { data: Buffer.from("pixels A").toString("base64"), mimeType: "image/png" };
const IMG_B = { data: Buffer.from("pixels B").toString("base64"), mimeType: "image/jpeg" };
const roots: string[] = [];
function tempRoot() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-image-delivery-"));
	roots.push(root);
	return root;
}
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function handle(conversationId?: string, outcome?: Promise<TurnOutcome>): TurnHandle {
	return { id: `handle-${conversationId}`, conversationId,
		outcome: outcome ?? Promise.resolve({ conversationId, status: "OK", response: "ok", finished: true, aborted: false, modelOutputSeen: true }),
		next: async () => null, pushExternal() {} };
}
class RecordingDriver {
	activeHandle = handle("seed-owner");
	requests: DriverTurnRequest[] = [];
	run = vi.fn(async (request: DriverTurnRequest) => {
		this.requests.push(request);
		return handle(request.conversationId ?? "fresh-conversation");
	});
	kickIdle() {}
	reentry() { return this.activeHandle; }
	close = vi.fn(async () => {});
}
function fixture(engine: "acp" | "stream-json") {
	const recording = new RecordingDriver();
	const driver = recording as unknown as TurnDriver;
	const rt = new ToolRoundTrips(driver, undefined, { escalateAfterMs: 1 });
	const store = new SessionStore(path.join(tempRoot(), "sessions.json"));
	const simple = createStreamSimple({ entries: [], store, driver,
		acpDriver: engine === "acp" ? driver : undefined, engine, roundTrips: rt });
	return { recording, rt, store, simple };
}
async function collect(simple: ReturnType<typeof createStreamSimple>, messages: Message[] = []) {
	const events = [];
	for await (const event of simple(model, normalizeContext({ messages }))) events.push(event);
	assert.equal(events.filter(e => e.type === "done" || e.type === "error").length, 1);
	return events;
}
function user(text: string, images: Array<typeof IMG_A> = []): Message {
	return { role: "user", timestamp: 0, content: [{ type: "text", text }, ...images.map(image => ({ type: "image" as const, ...image }))] };
}

async function strand(f: ReturnType<typeof fixture>, callId: string, conversationId: string | undefined, image = IMG_A) {
	f.recording.activeHandle = handle(conversationId);
	await f.rt.onToolCall(callId, "read", {}, new AbortController().signal);
	f.rt.resolve(callId, `RESULT ${callId}`, false, [image]);
}
function toolResult(callId: string, image = IMG_A): Message {
	return { role: "toolResult", toolCallId: callId, toolName: "read", content: [
		{ type: "text", text: `RESULT ${callId}` }, { type: "image", ...image },
	], isError: false, timestamp: 0 };
}

for (const engine of ["acp", "stream-json"] as const) {
	test(`${engine}: user images follow the engine's text boundary, including image-only suffix messages`, async () => {
		const f = fixture(engine);
		const events = await collect(f.simple, [user("old", [IMG_A]),
			{ role: "toolResult", toolCallId: "external", toolName: "read", content: [], isError: false, timestamp: 0 },
			user("queued", [IMG_A]), user("", [IMG_B])]);
		assert.equal(events.some(e => e.type === "error"), false);
		assert.equal(f.recording.requests.length, 1);
		assert.deepEqual(f.recording.requests[0].images, engine === "acp" ? [IMG_B] : [IMG_A, IMG_B]);
		if (engine === "stream-json") assert.match(f.recording.requests[0].prompt, /queued/);
	});

	test(`${engine}: initial sweep groups stranded and tombstoned pixels by their own conversation, leaving unknown owners pollable`, async () => {
		const f = fixture(engine);
		await strand(f, "a", "conversation-a");
		await strand(f, "a2", "conversation-a", IMG_B);
		await strand(f, "unknown", undefined);
		f.recording.activeHandle = handle("conversation-b");
		const controller = new AbortController();
		const dead = f.rt.onToolCall("b", "read", {}, controller.signal).catch(() => {});
		controller.abort();
		await dead;
		const events = await collect(f.simple, [toolResult("b", IMG_B)]);
		assert.equal(events.some(e => e.type === "error"), false);
		assert.deepEqual(f.recording.requests.map(r => r.conversationId), ["conversation-a", "conversation-b"]);
		assert.deepEqual(f.recording.requests[0].images, [IMG_A, IMG_B]);
		assert.deepEqual(f.recording.requests[1].images, [IMG_B]);
		assert.doesNotMatch(f.recording.requests[0].prompt, /RESULT b|RESULT unknown/);
		assert.doesNotMatch(f.recording.requests[1].prompt, /RESULT a|RESULT unknown/);
		for (const id of ["a", "a2", "b"]) {
			assert.equal(f.rt.poll(id)?.delivered, true);
			assert.equal(f.rt.claimUndelivered(id), undefined);
		}
		assert.deepEqual(f.rt.poll("b")?.images, [IMG_B]);
		assert.equal(f.rt.poll("unknown")?.delivered, false);
		assert.deepEqual(f.rt.claimUndelivered("unknown")?.images, [IMG_A]);
		f.rt.unclaim("unknown");
		await collect(f.simple);
		assert.equal(f.recording.requests.length, 2, "no result is double-consumed or dispatched to an unknown owner");
	});

	test(`${engine}: a queued user prompt stays separate from its owner's recovered images`, async () => {
		const f = fixture(engine);
		await strand(f, "a", "origin");
		await collect(f.simple, [user("CURRENT USER", [IMG_B])]);
		assert.equal(f.recording.requests.length, 2);
		assert.deepEqual(f.recording.requests[0].images, [IMG_B]);
		assert.deepEqual(f.recording.requests[1].images, [IMG_A]);
		assert.equal(f.recording.requests[1].conversationId, "origin");
		assert.doesNotMatch(f.recording.requests[1].prompt, /CURRENT USER/);
	});

	for (const continuation of [false, true]) {
		test(`${engine}: post-outcome sweep recovers pixels stranded mid-turn (continuation=${continuation})`, async () => {
			const f = fixture(engine);
			let finish!: (outcome: TurnOutcome) => void;
			const live = handle("mid-origin", new Promise(resolve => { finish = resolve; }));
			f.recording.activeHandle = live;
			live.next = async () => {
				await f.rt.onToolCall("mid", "read", {}, new AbortController().signal);
				f.rt.resolve("mid", "MID-TURN PIXELS", false, [IMG_B]);
				finish({ conversationId: "mid-origin", status: "OK", response: "done", finished: true, aborted: false, modelOutputSeen: true });
				return null;
			};
			if (!continuation) f.recording.run.mockImplementationOnce(async request => {
				f.recording.requests.push(request);
				return live;
			});
			const fast = continuation ? f.rt.onToolCall("fast", "read", {}, new AbortController().signal) : undefined;
			const events = await collect(f.simple, continuation ? [toolResult("fast")] : [user("start")]);
			await fast;
			assert.equal(events.some(e => e.type === "error"), false);
			const recovered = f.recording.requests.at(-1)!;
			assert.equal(f.recording.requests.length, continuation ? 1 : 2);
			assert.equal(recovered.conversationId, "mid-origin");
			assert.match(recovered.prompt, /MID-TURN PIXELS/);
			assert.deepEqual(recovered.images, [IMG_B]);
			assert.equal(f.rt.poll("mid")?.delivered, true);
		});
	}

	test(`${engine}: claims remain reserved until dispatch confirmation; failed starts release all unstarted image groups`, async () => {
		const f = fixture(engine);
		await strand(f, "a", "origin-a");
		await strand(f, "b", "origin-b", IMG_B);
		await strand(f, "c", "origin-c");
		let confirm!: (h: TurnHandle) => void;
		f.recording.run.mockImplementationOnce(async request => {
			f.recording.requests.push(request);
			return new Promise(resolve => { confirm = resolve; });
		});
		f.recording.run.mockRejectedValueOnce(new Error("target rejected prompt"));
		const pending = collect(f.simple);
		await vi.waitFor(() => assert.ok(confirm));
		assert.equal(f.rt.poll("a")?.delivered, false);
		assert.equal(f.rt.claimUndelivered("a"), undefined, "reserved, not delivered");
		confirm(handle("origin-a"));
		const events = await pending;
		assert.ok(events.some(e => e.type === "error"));
		assert.equal(f.rt.poll("a")?.delivered, true);
		assert.equal(f.rt.claimUndelivered("a"), undefined);
		for (const id of ["b", "c"]) {
			assert.equal(f.rt.poll(id)?.delivered, false);
			assert.ok(f.rt.claimUndelivered(id), "unstarted groups release their reservation");
			f.rt.unclaim(id);
		}
		await collect(f.simple);
		assert.deepEqual(f.recording.requests.map(r => r.conversationId), ["origin-a", "origin-b", "origin-c"]);
		assert.deepEqual(f.recording.requests[1].images, [IMG_B]);
		assert.equal(f.rt.poll("b")?.delivered, true);
	});

	test(`${engine}: a dispatched recovery that parks consumes only its group and releases later groups`, async () => {
		const f = fixture(engine);
		await strand(f, "a", "origin-a");
		await strand(f, "b", "origin-b", IMG_B);
		const parked = handle("origin-a");
		parked.next = async () => ({ type: "bridge_call", callId: "new-park", name: "read", args: {} });
		f.recording.run.mockImplementationOnce(async request => { f.recording.requests.push(request); return parked; });
		await collect(f.simple);
		assert.equal(f.recording.requests.length, 1);
		assert.deepEqual(f.recording.requests[0].images, [IMG_A]);
		assert.equal(f.rt.poll("a")?.delivered, true);
		assert.ok(f.rt.claimUndelivered("b"));
		f.rt.unclaim("b");
	});
}

function streamFixture(f: ReturnType<typeof fixture>) {
	const root = tempRoot();
	const log = path.join(root, "frames.jsonl");
	const bin = path.join(root, "agy.mjs");
	fs.writeFileSync(bin, `// pi-test-node-fixture
import fs from 'node:fs';
import readline from 'node:readline';
for await (const line of readline.createInterface({input:process.stdin})) {
 fs.appendFileSync(${JSON.stringify(log)}, line + '\\n');
 console.log(JSON.stringify({event:'init',init:{conversation_id:'origin'}}));
 console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:'ok',conversation_id:'origin'}}));
}
`);
	vi.stubEnv("AGY_BIN", bin);
	const driver = new StreamDriver(path.join(root, "private"));
	const logger = vi.fn();
	driver.log = logger;
	const simple = createStreamSimple({ entries: [], store: f.store, driver, engine: "stream-json", roundTrips: f.rt });
	return { driver, logger, simple, frames: () => fs.readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line).message.content as string) };
}

function stagedPaths(prompt: string): string[] {
	return prompt.split("\n").filter(line => line.startsWith("- ")).map(line => line.slice(2));
}

test("stream-json stages only the whole trailing user suffix into the actual frame", async () => {
	const f = fixture("stream-json");
	const stream = streamFixture(f);
	const stageRoot = tempRoot();
	vi.spyOn(os, "tmpdir").mockReturnValue(stageRoot);
	try {
		const events = await collect(stream.simple, [user("old", [IMG_A]),
			{ role: "toolResult", toolCallId: "external", toolName: "read", content: [], isError: false, timestamp: 0 },
			user("queued", [IMG_A]), user("last", [IMG_B])]);
		assert.equal(events.some(e => e.type === "error"), false);
		assert.equal(stream.frames().length, 1);
		const prompt = stream.frames()[0];
		assert.match(prompt, /queued\n\nlast/);
		assert.deepEqual(stagedPaths(prompt).map(file => fs.readFileSync(file, "utf8")), ["pixels A", "pixels B"]);
	} finally { await stream.driver.close("shutdown"); }
}, 15_000);

for (const stagingFailure of [false, true]) {
	test(`stream-json frame carries staged pixels or an explicit notice after claim (stagingFailure=${stagingFailure})`, async () => {
		const f = fixture("stream-json");
		await strand(f, "a", "origin", stagingFailure ? { ...IMG_A, data: "!!!" } : IMG_A);
		const stream = streamFixture(f);
		const stageRoot = path.join(tempRoot(), "staging root with spaces");
		fs.mkdirSync(stageRoot);
		vi.spyOn(os, "tmpdir").mockReturnValue(stageRoot);
		const mkdtemp = fs.mkdtempSync;
		const stage = vi.spyOn(fs, "mkdtempSync").mockImplementation((prefix, ...args) => {
			if (String(prefix).includes("pi-bridge-img-")) {
				assert.equal(f.rt.poll("a")?.delivered, false);
				assert.equal(f.rt.claimUndelivered("a"), undefined, "staging must happen after reservation");
			}
			return mkdtemp(prefix, ...args);
		});
		try {
			const events = await collect(stream.simple);
			assert.equal(events.some(e => e.type === "error"), false, events.filter(e => e.type === "error").map(e => e.error.errorMessage).join("; "));
			assert.equal(stream.frames().length, 1);
			const prompt = stream.frames()[0];
			assert.match(prompt, /RESULT a/);
			assert.ok(stage.mock.calls.some(([prefix]) => String(prefix).includes("pi-bridge-img-")));
			if (stagingFailure) {
				assert.match(prompt, /1 image\(s\) could not be delivered/);
				assert.doesNotMatch(prompt, /pi-bridge-img-/);
				assert.ok(stream.logger.mock.calls.some(([event, data]) => event === "image-staging-failed" && data.count === 1));
				assert.deepEqual(fs.readdirSync(stageRoot), []);
			} else {
				const paths = stagedPaths(prompt);
				assert.equal(paths.length, 1);
				assert.equal(path.dirname(path.dirname(paths[0])), stageRoot);
				assert.equal(fs.readFileSync(paths[0], "utf8"), "pixels A");
				assert.match(prompt, /pi read tool/i);
			}
			assert.equal(f.rt.poll("a")?.delivered, true);
			assert.equal(f.rt.claimUndelivered("a"), undefined);
			await collect(stream.simple);
			assert.equal(stream.frames().length, 1, "a staging failure still consumes exactly one confirmed dispatch");
		} finally { await stream.driver.close("shutdown"); }
	}, 15_000);
}
