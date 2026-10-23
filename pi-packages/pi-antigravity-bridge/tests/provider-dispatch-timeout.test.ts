import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, test, vi } from "vitest";
import { normalizeContext, type Api, type Model } from "@earendil-works/pi-ai";
import { AcpDriver } from "../src/acp/driver.js";
import { StreamDriver } from "../src/driver.js";
import type { TurnDriver } from "../src/driver-types.js";
import { ToolRoundTrips, createStreamSimple } from "../src/provider.js";
import { SessionStore } from "../src/sessions.js";
import { warmJobLauncher } from "./helpers/warm-job-launcher.js";

beforeAll(warmJobLauncher, 60_000);

const startupMs = 400;
const large = "BLOCKED PROMPT " + "x".repeat(8 * 1024 * 1024);
const request = { cwd: process.cwd(), model: "gemini-3.8-flash", mode: "accept-edits", skipPermissions: true,
	prompt: large, startupTimeoutMs: startupMs, queueTimeoutMs: 0, timeoutMin: 0, inactivityMin: 0 };
const model = { id: "gemini-flash", name: "Flash", api: "agy-bridge", provider: "antigravity",
	baseUrl: "agy-bridge://antigravity", reasoning: false, input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_000_000, maxTokens: 65_536 } as Model<Api>;

type RecordLine = { method?: string; message?: { content?: string }; params?: unknown; _stdinPaused?: boolean; pid?: number };
function records(file: string): RecordLine[] {
	return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
}

function fixture(engine: "acp" | "stream-json", extraEnv: Record<string, string> = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-blocked-dispatch-"));
	const log = path.join(dir, "requests.jsonl");
	const pause = path.join(dir, "pause");
	const env: Record<string, string> = { ACP_FAKE_SCENARIO: "happy", ACP_FAKE_LOG: log,
		ACP_FAKE_PAUSE_STDIN_MS: "1500", ACP_FAKE_PAUSE_STDIN_FILE: pause, ...extraEnv };
	let driver: TurnDriver;
	if (engine === "acp") {
		driver = new AcpDriver({ bin: process.execPath,
			binArgs: [path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs")], extraEnv: env });
	} else {
		fs.writeFileSync(path.join(dir, "agy.mjs"), `// pi-test-node-fixture
import fs from 'node:fs';
import readline from 'node:readline';
const log = ${JSON.stringify(log)};
const rl = readline.createInterface({input:process.stdin});
if (fs.existsSync(${JSON.stringify(pause)})) {
 rl.pause(); process.stdin.pause();
 fs.appendFileSync(log, JSON.stringify({_stdinPaused:true,pid:process.pid}) + '\\n');
 setTimeout(() => rl.resume(), 1500);
}
rl.on('line', line => {
 if (JSON.parse(line).message.content === 'seed') {
  console.log(JSON.stringify({event:'init',init:{conversation_id:'fake-session-0001'}}));
  return;
 }
 fs.appendFileSync(log, line + '\\n');
 console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:'DELIVERED'}}));
});
`);
		vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH}`);
		driver = new StreamDriver(path.join(dir, "private"));
	}
	const rt = new ToolRoundTrips(driver, undefined, { escalateAfterMs: 1 });
	const simple = createStreamSimple({ entries: [], store: new SessionStore(path.join(dir, "sessions.json")),
		driver, acpDriver: engine === "acp" ? driver : undefined, engine, roundTrips: rt });
	return { driver, rt, simple, log,
		async strand(answer: string) {
			env.ACP_FAKE_SCENARIO = "slow";
			const owner = await driver.run({ ...request, prompt: "seed", startupTimeoutMs: 2000 });
			await vi.waitFor(() => assert.equal(driver.snapshot().conversationId, "fake-session-0001"));
			await rt.onToolCall("stranded", "ask_user_question", {}, new AbortController().signal);
			await driver.close("recycle");
			await owner.outcome;
			rt.resolve("stranded", answer, false);
			env.ACP_FAKE_SCENARIO = "happy";
			fs.writeFileSync(log, "");
		},
		block() { fs.writeFileSync(pause, ""); },
		unblockNext() { fs.rmSync(pause, { force: true }); },
		prompts: () => records(log).filter(r => engine === "acp" ? r.method === "session/prompt" : r.message),
		async pausedPid() {
			let pid: number | undefined;
			await vi.waitFor(() => { pid = records(log).find(r => r._stdinPaused)?.pid; assert.ok(pid); }, { timeout: 2000, interval: 10 });
			return pid!;
		},
		async cleanup() {
			await driver.close("shutdown");
			vi.unstubAllEnvs();
			fs.rmSync(dir, { recursive: true, force: true });
		},
	};
}

async function within<T>(work: Promise<T>): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([work, new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error("blocked dispatch remained silent past its startup bound")), 2200);
		})]);
	} finally { clearTimeout(timer); }
}

async function boundary(f: ReturnType<typeof fixture>, prompt?: string) {
	const events = [];
	for await (const event of f.simple(model, normalizeContext({ messages: prompt === undefined ? [] : [
		{ role: "user", content: prompt, timestamp: 0 },
	] }))) events.push(event);
	assert.equal(events.filter(e => e.type === "done" || e.type === "error").length, 1, "exactly one terminal event");
	return events;
}

function configure(startup = startupMs) {
	vi.stubEnv("AGY_STARTUP_TIMEOUT_MS", String(startup));
	vi.stubEnv("AGY_QUEUE_TIMEOUT_MS", "0");
	vi.stubEnv("AGY_TURN_TIMEOUT_MIN", "0");
	vi.stubEnv("AGY_INACTIVITY_TIMEOUT_MIN", "0");
	vi.stubEnv("AGY_SYSTEM_PROMPT", "0");
}

for (const engine of ["acp", "stream-json"] as const) {
	test(`${engine} blocked prompt dispatch rejects run and releases the serialized queue without later dispatch`, async () => {
		const f = fixture(engine);
		let recovered: ReturnType<TurnDriver["run"]> | undefined;
		try {
			f.block();
			const started = Date.now();
			const rejected = assert.rejects(f.driver.run(request), /(?:startup|prompt dispatch).*400ms deadline/i);
			const pid = await f.pausedPid();
			f.unblockNext();
			recovered = f.driver.run({ ...request, prompt: "RECOVERED", startupTimeoutMs: 2000 });
			await within(rejected);
			assert.ok(Date.now() - started < 2000, "dispatch failure stays near the startup bound (including owned cleanup)");
			assert.throws(() => process.kill(pid, 0), "expired transport is dead before run rejects");
			const next = await recovered;
			assert.equal((await next.outcome).status, "OK");
			assert.equal(f.prompts().length, 1, "only the queued recovery prompt reaches a server");
			assert.match(JSON.stringify(f.prompts()[0]), /RECOVERED/);
			assert.doesNotMatch(JSON.stringify(f.prompts()[0]), /BLOCKED PROMPT/);
		} finally { await f.cleanup(); await recovered?.catch(() => {}); }
	}, 10_000);

	test(`${engine} provider blocked prompt dispatch emits one explicit startup error and the next turn succeeds`, async () => {
		const f = fixture(engine);
		let pending: ReturnType<typeof boundary> | undefined;
		try {
			configure();
			f.block();
			const started = Date.now();
			pending = boundary(f, large);
			const pid = await f.pausedPid();
			const events = await within(pending);
			assert.ok(events.some(e => e.type === "error" && /(?:startup|prompt dispatch).*400ms deadline/i.test(e.error.errorMessage ?? "")));
			assert.ok(Date.now() - started < 2000, "terminal error stays near the startup bound");
			assert.throws(() => process.kill(pid, 0));
			assert.equal(f.prompts().length, 0);
			f.unblockNext();
			assert.ok((await boundary(f, "RECOVERED")).some(e => e.type === "done"));
			assert.equal(f.prompts().length, 1);
		} finally { await f.cleanup(); await pending; }
	}, 10_000);

	test(`${engine} blocked stranded-result dispatch releases its claim and later delivers exactly once`, async () => {
		const f = fixture(engine);
		let pending: ReturnType<typeof boundary> | undefined;
		try {
			const answer = "STRANDED ANSWER " + large;
			await f.strand(answer);
			configure();
			f.block();
			pending = boundary(f);
			const pid = await f.pausedPid();
			assert.equal(f.rt.poll("stranded")?.delivered, false);
			assert.equal(f.rt.claimUndelivered("stranded"), undefined, "reservation remains held until dispatch fails");
			assert.ok((await within(pending)).some(e => e.type === "error" && /400ms deadline/.test(e.error.errorMessage ?? "")));
			assert.throws(() => process.kill(pid, 0));
			assert.equal(f.prompts().length, 0);
			assert.equal(f.rt.poll("stranded")?.delivered, false);
			assert.ok(f.rt.claimUndelivered("stranded"), "expiry releases the reservation");
			f.rt.unclaim("stranded");
			f.unblockNext();
			assert.ok((await boundary(f)).some(e => e.type === "done"));
			assert.equal(f.rt.poll("stranded")?.delivered, true);
			assert.equal(f.rt.poll("stranded")?.text, answer, "result stays pollable");
			await boundary(f);
			assert.equal(f.prompts().length, 1, "expired prompt never arrives and proven delivery is never repeated");
			assert.match(JSON.stringify(f.prompts()[0]), /STRANDED ANSWER/);
		} finally { await f.cleanup(); await pending; }
	}, 10_000);

	test(`${engine} startupTimeoutMs=0 leaves blocked dispatch waiting until explicit shutdown`, async () => {
		const f = fixture(engine);
		let pending: ReturnType<typeof boundary> | undefined;
		try {
			configure(0);
			f.block();
			let settled = false;
			pending = boundary(f, large).finally(() => { settled = true; });
			const pid = await f.pausedPid();
			await new Promise(resolve => setTimeout(resolve, startupMs + 100));
			assert.equal(settled, false, "zero does not introduce a dispatch deadline");
			assert.equal(f.prompts().length, 0);
			assert.doesNotThrow(() => process.kill(pid, 0));
			await f.driver.close("shutdown");
			assert.ok((await pending).some(e => e.type === "error" && Boolean(e.error.errorMessage)), "shutdown ends the wait with an explicit error");
			assert.throws(() => process.kill(pid, 0));
			assert.equal(f.prompts().length, 0);
		} finally { await f.cleanup(); await pending; }
	}, 10_000);
}

test("ACP dispatch expiry also retires a previously reusable connection", async () => {
	const f = fixture("acp");
	try {
		const warm = await f.driver.run({ ...request, prompt: "WARM", startupTimeoutMs: 2000 });
		assert.equal((await warm.outcome).status, "OK");
		f.block();
		const rejected = assert.rejects(f.driver.run(request), /ACP prompt dispatch startup.*400ms deadline/);
		const pid = await f.pausedPid();
		f.unblockNext();
		await within(rejected);
		assert.throws(() => process.kill(pid, 0), "reuse cannot preserve a transport with an expired write");
		const recovered = await f.driver.run({ ...request, prompt: "RECOVERED", startupTimeoutMs: 2000 });
		assert.equal((await recovered.outcome).status, "OK");
		assert.equal(f.driver.snapshot().stats.spawns, 2);
		assert.equal(f.prompts().length, 2, "only the warm-up and recovery prompts dispatch");
	} finally { await f.cleanup(); }
}, 10_000);

test("ACP separate setup deadline still retires a reused connection with a pending RPC", async () => {
	const f = fixture("acp", { ACP_FAKE_AUTH_ERROR_METHOD: "session/load", ACP_FAKE_AUTH_ERROR_DELAY_MS: "1500" });
	try {
		const warm = await f.driver.run({ ...request, prompt: "WARM", startupTimeoutMs: 2000 });
		assert.equal((await warm.outcome).status, "OK");
		const pid = f.driver.snapshot().pid!;
		await within(assert.rejects(f.driver.run({ ...request, conversationId: "fake-session-0001" }), /ACP exclusive startup.*400ms deadline/));
		assert.throws(() => process.kill(pid, 0), "setup expiry cannot leave a pending RPC on a reusable transport");
		const recovered = await f.driver.run({ ...request, prompt: "RECOVERED", startupTimeoutMs: 2000 });
		assert.equal((await recovered.outcome).status, "OK");
		assert.equal(f.prompts().length, 2);
	} finally { await f.cleanup(); }
}, 10_000);
