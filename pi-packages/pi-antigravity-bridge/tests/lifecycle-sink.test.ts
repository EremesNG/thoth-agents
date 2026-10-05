import assert from "node:assert/strict";
import * as childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, vi } from "vitest";
import { normalizeContext, type Api, type AssistantMessageEvent, type Model } from "@earendil-works/pi-ai";
import { AcpDriver } from "../src/acp/driver.js";
import { StreamDriver } from "../src/driver.js";
import type { DriverActivity, TurnDriver, TurnHandle } from "../src/driver-types.js";
import { createStreamSimple, ToolRoundTrips, type NativeDisplayEvent } from "../src/provider.js";
import { SessionStore } from "../src/sessions.js";
import { withoutUnhandledRejections } from "./helpers/unhandled-rejections.js";

const model: Model<Api> = {
	id: "gemini-flash", name: "Flash", api: "agy-bridge" as Api, provider: "antigravity",
	baseUrl: "agy-bridge://antigravity", reasoning: false, input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 65536,
};
const user = normalizeContext({ messages: [{ role: "user", content: "hello", timestamp: 0 }] });

async function bounded<T>(promise: Promise<T>): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("lifecycle failure did not settle")), 4500); }),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

async function collect(stream: ReturnType<ReturnType<typeof createStreamSimple>>) {
	const events: AssistantMessageEvent[] = [];
	let ends = 0;
	const end = stream.end.bind(stream);
	stream.end = (...args) => { ends++; end(...args); };
	await bounded((async () => { for await (const event of stream) events.push(event); })());
	return { events, ends };
}

function assertSingleError(result: Awaited<ReturnType<typeof collect>>) {
	assert.equal(result.ends, 1);
	const terminals = result.events.filter(event => event.type === "done" || event.type === "error");
	assert.deepEqual(terminals.map(event => event.type), ["error"]);
}

function fixture(engine: "stream-json" | "acp", log: (message: string) => void) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-lifecycle-sink-"));
	fs.writeFileSync(path.join(dir, "agy.mjs"), `// pi-test-node-fixture
import readline from 'node:readline';
for await (const line of readline.createInterface({input:process.stdin})) {
 console.log(JSON.stringify({event:'init',init:{conversation_id:'sink-conversation'}}));
 if (!line.includes('healthy')) console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:'recovered'}}));
}
`);
	vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH}`);
	vi.stubEnv("AGY_MODE", "accept-edits");
	const extraEnv = { ACP_FAKE_SCENARIO: "happy" };
	const driver = engine === "acp" ? new AcpDriver({
		bin: process.execPath,
		binArgs: [path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs")],
		extraEnv,
		log,
	}) : new StreamDriver(path.join(dir, "private"));
	if (driver instanceof StreamDriver) driver.log = log;
	const simple = createStreamSimple({ entries: [], store: new SessionStore(path.join(dir, "sessions.json")), driver, engine, roundTrips: new ToolRoundTrips(driver) });
	return { dir, driver, simple, extraEnv, async cleanup() {
		await driver.close("shutdown");
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		fs.rmSync(dir, { recursive: true, force: true });
	} };
}

test("provider: a throwing pre-dispatch error sink cannot escape or prevent stream termination", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-lifecycle-provider-"));
	try {
		const simple = createStreamSimple({ entries: [], store: new SessionStore(path.join(dir, "sessions.json")), log: () => { throw new Error("provider sink failed"); } });
		const result = await collect(simple(model, user));
		// This rejection ends synchronously, before collect can instrument end().
		assert.deepEqual(result.events.filter(event => event.type === "done" || event.type === "error").map(event => event.type), ["error"]);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("provider: a rejected async lifecycle sink does not become an unhandled rejection", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-lifecycle-provider-"));
	try {
		const simple = createStreamSimple({ entries: [], store: new SessionStore(path.join(dir, "sessions.json")), log: async () => { throw new Error("async sink failed"); } });
		const result = await collect(simple(model, user));
		assert.equal(result.events.at(-1)?.type, "error");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

function nativeFixture(activities: DriverActivity[], onNativeEvent: (event: NativeDisplayEvent) => void) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-native-sink-"));
	let active: TurnHandle | null = null;
	let runs = 0;
	const driver = {
		get activeHandle() { return active; },
		async run() {
			assert.equal(active, null, "the previous turn must not block the next call");
			const unread = [...activities];
			active = {
				id: `native-${++runs}`,
				outcome: Promise.resolve({ status: "OK", response: "final answer", finished: true, aborted: false }),
				async next() {
					const activity = unread.shift();
					if (activity) return activity;
					active = null;
					return null;
				},
				pushExternal() {},
			};
			return active;
		},
	} as unknown as TurnDriver;
	vi.stubEnv("AGY_MODE", "accept-edits");
	const simple = createStreamSimple({ entries: [], store: new SessionStore(path.join(dir, "sessions.json")), acpDriver: driver, engine: "acp", roundTrips: new ToolRoundTrips(driver), onNativeEvent });
	return { simple, runs: () => runs, cleanup() {
		vi.unstubAllEnvs();
		fs.rmSync(dir, { recursive: true, force: true });
	} };
}

const nativeActivities: DriverActivity[] = [
	{ type: "tool_start", name: "run_command", args: {} },
	{ type: "tool_done", name: "run_command", args: {}, output: "recorded" },
	{ type: "tool_error", name: "run_command", message: "tool failed" },
];

for (const [index, status] of ["started", "completed", "failed"].entries()) {
 test(`provider: a rejecting native ${status} sink ends once and the next call proceeds without unhandled rejections`, async () => {
	let sinkCalls = 0;
	const f = nativeFixture([nativeActivities[index]], async () => { sinkCalls++; throw new Error(`native ${status} sink failed`); });
	try {
		await withoutUnhandledRejections(async () => {
			for (let call = 0; call < 2; call++) {
				const result = await collect(f.simple(model, user));
				assert.equal(result.ends, 1);
				assert.deepEqual(result.events.filter(event => event.type === "done" || event.type === "error").map(event => event.type), ["done"]);
				assert.ok(result.events.some(event => event.type === "text_delta" && event.delta === "final answer"));
			}
			assert.equal(f.runs(), 2);
			assert.equal(sinkCalls, 2, "each activity must reach the rejecting sink");
		});
	} finally { f.cleanup(); }
 });
}

for (const behavior of ["healthy", "throwing"] as const) {
 test(`provider: ${behavior} synchronous native rendering preserves its thinking fallback`, async () => {
	const seen: string[] = [];
	const f = nativeFixture(nativeActivities, event => {
		seen.push(event.status);
		if (behavior === "throwing") throw new Error("stale renderer");
	});
	try {
		const result = await collect(f.simple(model, user));
		assert.equal(result.ends, 1);
		assert.equal(result.events.at(-1)?.type, "done");
		assert.deepEqual(seen, ["started", "completed", "failed"]);
		const thinking = result.events.flatMap(event => event.type === "thinking_delta" ? [event.delta] : []).join("");
		assert.equal(thinking, behavior === "healthy" ? "" : "[agy tool: run_command]\n[agy tool: run_command failed: tool failed]\n");
	} finally { f.cleanup(); }
 });
}

for (const engine of ["acp", "stream-json"] as const) {
 test(`${engine}: ENOENT and a throwing spawn-error sink end once, settle the handle, and allow the next call`, async () => {
	let failed: TurnHandle | null = null;
	let sawSpawnError = false;
	const f = fixture(engine, message => {
		if (message === "turn-start") failed = f.driver.activeHandle;
		if (message === "spawn-error") {
			sawSpawnError = true;
			throw new Error("spawn-error sink failed");
		}
	});
	const missing = path.join(f.dir, "nonexistent-executable");
	vi.stubEnv("AGY_ACP_BIN", engine === "acp" ? missing : "");
	const realSpawn = childProcess.spawn;
	const spawn = vi.spyOn(childProcess, "spawn");
	let fail = true;
	spawn.mockImplementation((...args) => engine === "stream-json" && fail && args[0] === "agy" ? realSpawn(missing) : realSpawn(...args));
	try {
		assertSingleError(await collect(f.simple(model, user)));
		assert.equal(sawSpawnError, true);
		assert.equal(f.driver.activeHandle, null);
		assert.ok(failed);
		assert.equal((await bounded((failed as TurnHandle).outcome)).status, "ERROR");
		assert.equal(await bounded((failed as TurnHandle).next()), null);
		vi.stubEnv("AGY_ACP_BIN", "");
		fail = false;
		const second = await collect(f.simple(model, user));
		assert.equal(second.ends, 1);
		assert.equal(second.events.at(-1)?.type, "done");
	} finally {
		await f.cleanup();
		assert.ok(spawn.mock.results.every(result => result.type !== "return" || !result.value.pid || result.value.exitCode !== null || result.value.signalCode !== null), "no owned child survives");
	}
 });

 test(`${engine}: a throwing async exit sink cannot skip settlement or block the next call`, async () => {
	let failed: TurnHandle | null = null;
	let ready!: () => void;
	const started = new Promise<void>(resolve => { ready = resolve; });
	let sawExit = false;
	const f = fixture(engine, message => {
		if (message === "turn-start") {
			failed = f.driver.activeHandle;
			if (engine === "stream-json") ready();
		}
		if (message === "session-new") ready();
		if (message === "exit" || message.startsWith("exit:") || message === "connection-exited") {
			sawExit = true;
			throw new Error("exit sink failed");
		}
	});
	f.extraEnv.ACP_FAKE_SCENARIO = "slow";
	const spawn = vi.spyOn(childProcess, "spawn");
	const healthy = normalizeContext({ messages: [{ role: "user", content: "healthy", timestamp: 0 }] });
	try {
		const first = collect(f.simple(model, healthy));
		await bounded(started);
		const child = spawn.mock.results[spawn.mock.calls.findIndex(([command]) => command === (engine === "acp" ? process.execPath : "agy"))].value as childProcess.ChildProcess;
		const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
		child.kill();
		assertSingleError(await first);
		await bounded(exited);
		assert.equal(sawExit, true);
		assert.equal(f.driver.activeHandle, null);
		assert.ok(failed);
		assert.equal((await bounded((failed as TurnHandle).outcome)).status, "ERROR");
		assert.equal(await bounded((failed as TurnHandle).next()), null);
		assert.ok(child.exitCode !== null || child.signalCode !== null);
		f.extraEnv.ACP_FAKE_SCENARIO = "happy";
		const second = await collect(f.simple(model, user));
		assert.equal(second.ends, 1);
		assert.equal(second.events.at(-1)?.type, "done");
	} finally {
		await f.cleanup();
	}
 });
}

