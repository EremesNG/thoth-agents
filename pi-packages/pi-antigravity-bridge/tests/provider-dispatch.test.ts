import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { beforeAll, test, vi } from "vitest";
import { launchInJob } from "@thoth-agents/pi-core/windows-job";
import { normalizeContext, type Api, type Model } from "@earendil-works/pi-ai";
import { AcpDriver } from "../src/acp/driver.js";
import { StreamDriver } from "../src/driver.js";
import type { TurnDriver } from "../src/driver-types.js";
import * as ownedProcess from "../src/owned-process.js";
import { ToolRoundTrips, createStreamSimple } from "../src/provider.js";
import { SessionStore } from "../src/sessions.js";
import { warmJobLauncher } from "./helpers/warm-job-launcher.js";
import { makeAgyRuntimeFixture } from "./helpers/agy-runtime-fixture.js";

vi.mock("@thoth-agents/pi-core/windows-job", async (original) => {
	const actual = await original<typeof import("@thoth-agents/pi-core/windows-job")>();
	return { ...actual, launchInJob: vi.fn(actual.launchInJob) };
});
beforeAll(warmJobLauncher, 60_000);

const model = { id: "gemini-flash", name: "Flash", api: "agy-bridge", provider: "antigravity",
	baseUrl: "agy-bridge://antigravity", reasoning: false, input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_000_000, maxTokens: 65_536 } as Model<Api>;
const request = { cwd: process.cwd(), model: "gemini-3.8-flash", mode: "accept-edits", skipPermissions: true,
	prompt: "seed", timeoutMin: 0, inactivityMin: 0 };
const server = path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs");

test.each([false, true])("stream-json provider honors AGY_BIN and uses the child cwd for its neutral runtime executable inside Orca (bare=%s)", async (bare) => {
	const f = makeAgyRuntimeFixture({ bare });
	const driver = new StreamDriver(path.join(f.root, "private"));
	const spawn = vi.spyOn(ownedProcess, "spawnOwnedProcess").mockImplementation(() => { throw new Error("offline launch boundary"); });
	try {
		await assert.rejects(driver.run({ ...request, cwd: f.root }), /offline launch boundary/);
		f.assertAlias(spawn.mock.calls[0][0]);
		assert.equal(spawn.mock.calls[0][2]?.windowsHide, true);
	} finally { await driver.close("shutdown"); spawn.mockRestore(); f.cleanup(); }
});

function requests(file: string): Array<{ method?: string; params?: { prompt?: unknown }; message?: { content?: string } }> {
	return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
}

async function strand(driver: TurnDriver) {
	const rt = new ToolRoundTrips(driver, undefined, { escalateAfterMs: 1 });
	const owner = await driver.run(request);
	await vi.waitFor(() => assert.equal(driver.snapshot().conversationId, "fake-session-0001"));
	await rt.onToolCall("stranded", "ask_user_question", {}, new AbortController().signal);
	await driver.close("recycle", "seed completed");
	await owner.outcome;
	rt.resolve("stranded", "STRANDED ANSWER", false);
	return rt;
}

function provider(driver: TurnDriver, rt: ToolRoundTrips, dir: string, engine: "acp" | "stream-json") {
	return createStreamSimple({ entries: [], store: new SessionStore(path.join(dir, "sessions.json")),
		driver, acpDriver: engine === "acp" ? driver : undefined, engine, roundTrips: rt });
}

async function boundary(simple: ReturnType<typeof createStreamSimple>, prompt?: string, signal?: AbortSignal) {
	const events = [];
	for await (const event of simple(model, normalizeContext({ messages: prompt === undefined ? [] : [
		{ role: "user", content: prompt, timestamp: 0 },
	] }), { signal })) events.push(event);
	assert.equal(events.filter(e => e.type === "done" || e.type === "error").length, 1, "exactly one terminal event");
	return events;
}

function acpFixture() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-dispatch-"));
	const log = path.join(dir, "rpc.jsonl");
	const env: Record<string, string> = { ACP_FAKE_SCENARIO: "slow", ACP_FAKE_LOG: log };
	const driver = new AcpDriver({ bin: process.execPath, binArgs: [server], extraEnv: env });
	return { dir, log, env, driver, cleanup: async () => {
		await driver.close("shutdown");
		fs.rmSync(dir, { recursive: true, force: true });
	} };
}

test("ACP redelivery: initialize failure releases a claim, then the next boundary dispatches exactly once", async () => {
	const f = acpFixture();
	try {
		const rt = await strand(f.driver);
		fs.writeFileSync(f.log, "");
		f.env.ACP_FAKE_AUTH_ERROR_METHOD = "initialize";
		f.env.ACP_FAKE_AUTH_ERROR_DELAY_MS = "100";
		const simple = provider(f.driver, rt, f.dir, "acp");
		const failed = boundary(simple);
		await vi.waitFor(() => assert.equal(requests(f.log)[0]?.method, "initialize"));
		assert.equal(rt.poll("stranded")?.delivered, false, "a reservation is not delivery during setup");
		const events = await failed;
		assert.ok(events.some(e => e.type === "error" && /agy turn failed: .+/i.test(e.error.errorMessage ?? "")));
		assert.deepEqual(requests(f.log).map(r => r.method), ["initialize"]);
		assert.equal(rt.poll("stranded")?.delivered, false);
		const claim = rt.claimUndelivered("stranded");
		assert.ok(claim, "pre-dispatch failure releases the reservation");
		rt.unclaim("stranded");
		delete f.env.ACP_FAKE_AUTH_ERROR_METHOD;
		f.env.ACP_FAKE_SCENARIO = "happy";
		const retried = await boundary(simple);
		assert.ok(retried.some(e => e.type === "done"));
		assert.equal(rt.poll("stranded")?.delivered, true);
		assert.equal(rt.poll("stranded")?.text, "STRANDED ANSWER", "still pollable");
		await boundary(simple);
		const prompts = requests(f.log).filter(r => r.method === "session/prompt");
		assert.equal(prompts.length, 1);
		assert.match(JSON.stringify(prompts[0].params), /STRANDED ANSWER/);
	} finally { await f.cleanup(); }
}, 15_000);

test("ACP redelivery: a session/prompt error after dispatch never retries the result", async () => {
	const f = acpFixture();
	try {
		const rt = await strand(f.driver);
		fs.writeFileSync(f.log, "");
		f.env.ACP_FAKE_AUTH_ERROR_METHOD = "session/prompt";
		const simple = provider(f.driver, rt, f.dir, "acp");
		const events = await boundary(simple);
		assert.ok(events.some(e => e.type === "error" && /authentication required/i.test(e.error.errorMessage ?? "")));
		assert.equal(rt.poll("stranded")?.delivered, true);
		assert.equal(rt.claimUndelivered("stranded"), undefined);
		await boundary(simple);
		assert.equal(requests(f.log).filter(r => r.method === "session/prompt").length, 1);
	} finally { await f.cleanup(); }
}, 15_000);

test("ACP normal provider startup failure emits one explicit terminal error", async () => {
	const f = acpFixture();
	try {
		f.env.ACP_FAKE_AUTH_ERROR_METHOD = "initialize";
		const events = await boundary(provider(f.driver, new ToolRoundTrips(f.driver), f.dir, "acp"), "hello");
		assert.ok(events.some(e => e.type === "error" && /agy failed to start: .+/i.test(e.error.errorMessage ?? "")));
		assert.deepEqual(requests(f.log).map(r => r.method), ["initialize"]);
		assert.equal(f.driver.activeHandle, null);
	} finally { await f.cleanup(); }
}, 15_000);

test("ACP abort while initialize is pending terminates the owned child before the provider error", async () => {
	const f = acpFixture();
	const spawn = vi.spyOn(ownedProcess, "spawnOwnedProcess");
	try {
		f.env.ACP_FAKE_AUTH_ERROR_METHOD = "initialize";
		f.env.ACP_FAKE_AUTH_ERROR_DELAY_MS = "10000";
		const controller = new AbortController();
		const pending = boundary(provider(f.driver, new ToolRoundTrips(f.driver), f.dir, "acp"), "hello", controller.signal);
		await vi.waitFor(() => assert.equal(requests(f.log)[0]?.method, "initialize"));
		const child = spawn.mock.results[0].value as ownedProcess.OwnedProcess;
		const pid = child.pid;
		assert.ok(pid);
		controller.abort();
		const events = await pending;
		assert.ok(events.some(e => e.type === "error"));
		assert.throws(() => process.kill(pid, 0), "terminal event must follow owned process termination");
		assert.deepEqual(requests(f.log).map(r => r.method), ["initialize"]);
	} finally { spawn.mockRestore(); await f.cleanup(); }
}, 15_000);

test("ACP prompt activities remain buffered until the published handle is consumed", async () => {
	const f = acpFixture();
	try {
		f.env.ACP_FAKE_SCENARIO = "happy";
		const handle = await f.driver.run({ ...request, prompt: "instant reply" });
		await handle.outcome; // All updates arrive before the first consumer attaches.
		let text = "";
		for (;;) {
			const event = await handle.next();
			if (!event) break;
			if (event.type === "text") text += event.delta;
		}
		assert.equal(text, "HELLO");
	} finally { await f.cleanup(); }
}, 15_000);

function streamFixture() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-stream-dispatch-"));
	const log = path.join(dir, "prompts.jsonl");
	const fail = path.join(dir, "post-dispatch-failure");
	const hold = path.join(dir, "hold-response");
	fs.writeFileSync(path.join(dir, "agy.mjs"), `// pi-test-node-fixture
import fs from 'node:fs';
import readline from 'node:readline';
for await (const line of readline.createInterface({input:process.stdin})) {
 const r = JSON.parse(line);
 if (r.message.content === 'seed') {
  console.log(JSON.stringify({event:'init',init:{conversation_id:'fake-session-0001'}}));
  continue;
 }
 fs.appendFileSync(${JSON.stringify(log)}, line + '\\n');
 if (fs.existsSync(${JSON.stringify(hold)})) continue;
 const failed = fs.existsSync(${JSON.stringify(fail)});
 console.log(JSON.stringify({event:'result',result:{status:failed ? 'ERROR' : 'SUCCESS',response:failed ? '' : 'DELIVERED',error:failed ? 'post-dispatch failure' : undefined}}));
}
`);
	vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH}`);
	const driver = new StreamDriver(path.join(dir, "private"));
	return { dir, log, fail, hold, driver, cleanup: async () => {
		await driver.close("shutdown");
		vi.unstubAllEnvs();
		fs.rmSync(dir, { recursive: true, force: true });
	} };
}

test("stream-json redelivery: asynchronous stdin failure releases the claim for exactly one later dispatch", async () => {
	const f = streamFixture();
	try {
		const rt = await strand(f.driver);
		const spawn = ownedProcess.spawnOwnedProcess;
		const spy = vi.spyOn(ownedProcess, "spawnOwnedProcess").mockImplementationOnce((...args) => {
			const child = spawn(...args);
			// Fail before forwarding any bytes, as a failed asynchronous launch/pipe would.
			vi.spyOn(child.stdin!, "write").mockImplementation((_chunk, ...args: unknown[]) => {
				const callback = args.find(arg => typeof arg === "function") as ((error: Error) => void) | undefined;
				queueMicrotask(() => {
					const error = new Error("pre-dispatch stdin failure");
					callback?.(error);
					child.stdin!.emit("error", error);
				});
				return false;
			});
			return child;
		});
		const simple = provider(f.driver, rt, f.dir, "stream-json");
		const failed = await boundary(simple);
		spy.mockRestore();
		assert.ok(failed.some(e => e.type === "error" && /pre-dispatch stdin failure/.test(e.error.errorMessage ?? "")));
		assert.equal(requests(f.log).length, 0, "nothing reached the CLI");
		assert.equal(rt.poll("stranded")?.delivered, false);
		assert.ok(rt.claimUndelivered("stranded"));
		rt.unclaim("stranded");
		assert.ok((await boundary(simple)).some(e => e.type === "done"));
		assert.equal(rt.poll("stranded")?.delivered, true);
		await boundary(simple);
		assert.equal(requests(f.log).length, 1);
		assert.match(requests(f.log)[0].message?.content ?? "", /STRANDED ANSWER/);
	} finally { vi.restoreAllMocks(); await f.cleanup(); }
}, 15_000);

test("stream-json redelivery: a real process launch failure releases the claim before any frame is sent", async () => {
	const f = streamFixture();
	try {
		const rt = await strand(f.driver);
		const spawn = ownedProcess.spawnOwnedProcess;
		const spy = vi.spyOn(ownedProcess, "spawnOwnedProcess").mockImplementationOnce((command, args, options) =>
			spawn(command, args, { ...options, cwd: path.join(f.dir, "missing-directory") }));
		const simple = provider(f.driver, rt, f.dir, "stream-json");
		assert.ok((await boundary(simple)).some(e => e.type === "error"));
		spy.mockRestore();
		assert.equal(requests(f.log).length, 0);
		assert.equal(rt.poll("stranded")?.delivered, false);
		assert.ok((await boundary(simple)).some(e => e.type === "done"));
		await boundary(simple);
		assert.equal(requests(f.log).length, 1);
	} finally { vi.restoreAllMocks(); await f.cleanup(); }
}, 15_000);

test("stream-json redelivery: an error result after dispatch is never retried", async () => {
	const f = streamFixture();
	try {
		const rt = await strand(f.driver);
		fs.writeFileSync(f.fail, "");
		const simple = provider(f.driver, rt, f.dir, "stream-json");
		assert.ok((await boundary(simple)).some(e => e.type === "error"));
		assert.equal(rt.poll("stranded")?.delivered, true);
		await boundary(simple);
		assert.equal(requests(f.log).length, 1);
	} finally { await f.cleanup(); }
}, 15_000);

/** Fault at the real owned facade's target, never at child.stdin. Other ACP
 * frames still travel through the actual Job's pipe with their original bytes. */
async function interceptJobPrompt(failWrite: boolean) {
	const actual = await vi.importActual<typeof import("@thoth-agents/pi-core/windows-job")>("@thoth-agents/pi-core/windows-job");
	const observed = { target: undefined as Writable | undefined, attempts: 0, accepted: false };
	vi.mocked(launchInJob).mockImplementationOnce(async options => {
		const job = await actual.launchInJob(options);
		const target = new Writable({ write(chunk, encoding, callback) {
			const frame = JSON.parse(chunk.toString());
			const prompt = frame.method === "session/prompt" || frame.event === "user";
			if (prompt) observed.attempts += 1;
			if (prompt && failWrite) {
				// Asynchronous rejection, before any prompt byte reaches the process.
				setImmediate(() => callback(new Error("owned target rejected prompt")));
				return;
			}
			job.stdin.write(chunk, encoding, error => {
				if (prompt && !error) observed.accepted = true;
				callback(error);
			});
		} });
		observed.target = target;
		return { ...job, stdin: target };
	});
	return observed;
}

for (const engine of ["acp", "stream-json"] as const) {
	const windows = test.skipIf(process.platform !== "win32");
	windows(`${engine} redelivery: Job target write failure releases the claim, then delivers exactly once`, async () => {
		const f = engine === "acp" ? acpFixture() : streamFixture();
		try {
			const rt = await strand(f.driver);
			fs.writeFileSync(f.log, "");
			if ("env" in f) f.env.ACP_FAKE_SCENARIO = "happy";
			const observed = await interceptJobPrompt(true);
			const simple = provider(f.driver, rt, f.dir, engine);
			const events = await boundary(simple);
			assert.ok(events.some(e => e.type === "error" && Boolean(e.error.errorMessage)));
			assert.equal(observed.attempts, 1);
			assert.equal(observed.accepted, false);
			const prompts = () => requests(f.log).filter(r => engine === "acp" ? r.method === "session/prompt" : r.message);
			assert.equal(prompts().length, 0, "no prompt bytes reached agy");
			assert.equal(rt.poll("stranded")?.delivered, false);
			assert.ok(rt.claimUndelivered("stranded"), "failed target write releases the reservation");
			rt.unclaim("stranded");
			assert.ok((await boundary(simple)).some(e => e.type === "done"));
			assert.equal(rt.poll("stranded")?.delivered, true);
			assert.equal(rt.poll("stranded")?.text, "STRANDED ANSWER");
			await boundary(simple);
			assert.equal(prompts().length, 1);
			assert.match(JSON.stringify(prompts()[0]), /STRANDED ANSWER/);
		} finally { vi.restoreAllMocks(); await f.cleanup(); }
	}, 15_000);

	windows(`${engine} redelivery: a confirmed Job target write followed by a pipe failure never retries`, async () => {
		const f = engine === "acp" ? acpFixture() : streamFixture();
		let pending: ReturnType<typeof boundary> | undefined;
		try {
			const rt = await strand(f.driver);
			fs.writeFileSync(f.log, "");
			if ("hold" in f) fs.writeFileSync(f.hold, "");
			const observed = await interceptJobPrompt(false);
			const simple = provider(f.driver, rt, f.dir, engine);
			pending = boundary(simple);
			const prompts = () => requests(f.log).filter(r => engine === "acp" ? r.method === "session/prompt" : r.message);
			await vi.waitFor(() => {
				assert.equal(observed.accepted, true);
				assert.equal(rt.poll("stranded")?.delivered, true);
				assert.equal(prompts().length, 1);
			});
			observed.target!.destroy(new Error("pipe failed after confirmed dispatch"));
			assert.ok((await pending).some(e => e.type === "error" && Boolean(e.error.errorMessage)));
			assert.equal(rt.claimUndelivered("stranded"), undefined);
			await boundary(simple);
			assert.equal(prompts().length, 1, "a proven dispatch is never retried");
		} finally {
			vi.restoreAllMocks();
			await f.cleanup();
			await pending;
		}
	}, 15_000);
}
