import assert from "node:assert/strict";
import * as childProcess from "node:child_process";
import fs from "node:fs";
import { getEventListeners } from "node:events";
import os from "node:os";
import path from "node:path";
import { test, vi } from "vitest";
import { normalizeContext, type Api, type AssistantMessageEvent, type Model } from "@earendil-works/pi-ai";
import { StreamDriver } from "../src/driver.js";
import { AcpDriver } from "../src/acp/driver.js";
import type { TurnHandle } from "../src/driver-types.js";
import { createStreamSimple, ToolRoundTrips } from "../src/provider.js";
import { SessionStore } from "../src/sessions.js";

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
			new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("startup ownership did not settle")), 4000); }),
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

function assertSingleError(result: Awaited<ReturnType<typeof collect>>): string {
	assert.equal(result.ends, 1);
	const terminals = result.events.filter(event => event.type === "done" || event.type === "error");
	assert.deepEqual(terminals.map(event => event.type), ["error"]);
	const terminal = terminals[0];
	assert.ok(terminal?.type === "error");
	return terminal.error.errorMessage ?? "";
}

function fixture(engine: "stream-json" | "acp", log: (message: string) => void, scenario = "happy") {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-startup-ownership-"));
	fs.writeFileSync(path.join(dir, "agy.mjs"), `// pi-test-node-fixture
import readline from 'node:readline';
for await (const line of readline.createInterface({input:process.stdin})) {
 console.log(JSON.stringify({event:'init',init:{conversation_id:'owned-conversation'}}));
 if (!line.includes('healthy')) console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:'recovered'}}));
}
`);
	vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH}`);
	vi.stubEnv("AGY_MODE", "accept-edits");
	const driver = engine === "stream-json" ? new StreamDriver(path.join(dir, "private")) : new AcpDriver({
		bin: process.execPath,
		binArgs: [path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs")],
		extraEnv: { ACP_FAKE_SCENARIO: scenario },
		log,
	});
	if (driver instanceof StreamDriver) driver.log = log;
	const simple = createStreamSimple({ entries: [], store: new SessionStore(path.join(dir, "sessions.json")), driver, engine, roundTrips: new ToolRoundTrips(driver) });
	return { dir, driver, simple, async cleanup() {
		await driver.close("shutdown");
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		fs.rmSync(dir, { recursive: true, force: true });
	} };
}

for (const engine of ["stream-json", "acp"] as const) {
	test(`${engine}: throwing turn-start rolls back ownership, ends once, and allows the next call`, async () => {
		let failed: TurnHandle | null = null;
		let fail = true;
		const spawn = vi.spyOn(childProcess, "spawn");
		const f = fixture(engine, message => {
			if (message === "turn-start" && fail) {
				failed = f.driver.activeHandle;
				throw new Error("turn-start sink failed");
			}
		});
		try {
			const first = await collect(f.simple(model, user));
			assert.match(assertSingleError(first), /turn-start sink failed/);
			assert.equal(f.driver.activeHandle, null, "a rejected startup must release its published handle");
			assert.ok(failed);
			const outcome = await bounded((failed as TurnHandle).outcome);
			assert.equal(outcome.status, "ERROR");
			assert.match(outcome.error ?? "", /turn-start sink failed/);
			assert.equal(await bounded((failed as TurnHandle).next()), null, "failed handle must be closed");
			const children = spawn.mock.calls.flatMap(([command], index) => command === (engine === "stream-json" ? "agy" : process.execPath) ? [spawn.mock.results[index].value as childProcess.ChildProcess] : []);
			if (engine === "stream-json") assert.equal(children.length, 1);
			else assert.equal(children.length, 0, "ACP must not spawn after its startup was rejected");
			assert.ok(children.every(child => child.exitCode !== null || child.signalCode !== null), "failed startup must not leave an owned child alive");
			assert.notEqual(f.driver.state, "running");
			fail = false;
			const second = await collect(f.simple(model, user));
			assert.equal(second.ends, 1);
			assert.ok(second.events.some(e => e.type === "done" && e.reason === "stop"));
		} finally {
			fail = false;
			await f.cleanup();
		}
	});
}

for (const engine of ["stream-json", "acp"] as const) {
	for (const parked of [false, true]) {
		test(`${engine}: a failed startup waiter leaves its ${parked ? "parked" : "healthy"} predecessor untouched`, async () => {
			let fail = false;
			let starts = 0;
			let ready!: () => void;
			const started = new Promise<void>(resolve => { ready = resolve; });
			const f = fixture(engine, message => {
				if (message === "turn-start") {
					starts++;
					if (fail) throw new Error("turn-start sink failed");
					if (engine === "stream-json") ready();
				}
				if (message === "session-new") ready();
			}, "slow");
			vi.stubEnv("AGY_QUEUE_TIMEOUT_MS", "20");
			try {
				const predecessor = await f.driver.run({ cwd: f.dir, model: "gemini-flash", mode: "accept-edits", skipPermissions: true, prompt: "healthy", timeoutMin: 0, inactivityMin: 0 });
				await bounded(started);
				if (parked) predecessor.pushExternal({ type: "bridge_call", callId: "park", name: "read", args: {} });
				let settled = false;
				void predecessor.outcome.then(() => { settled = true; });
				const pid = f.driver.snapshot().pid;
				assert.ok(pid);
				fail = true;
				const result = await collect(f.simple(model, user));
				assert.match(assertSingleError(result), /run queue.*20ms/);
				assert.equal(settled, false);
				assert.equal(f.driver.reentry()?.id, predecessor.id);
				assert.equal(f.driver.snapshot().pid, pid);
				assert.doesNotThrow(() => process.kill(pid, 0), "predecessor child must remain alive");
				assert.equal(starts, 1, "a failed waiter must never publish a turn or call its startup sink");
				if (parked) {
					for (;;) {
						const activity = await bounded(predecessor.next());
						assert.ok(activity, "parked turn must remain open");
						if (activity.type === "bridge_call") {
							assert.equal(activity.callId, "park");
							break;
						}
					}
				}
			} finally {
				fail = false;
				await f.cleanup();
			}
		});
	}
}

test("acp: rejected startup preserves the settled predecessor's reusable connection", async () => {
	let fail = false;
	let failed: TurnHandle | null = null;
	const f = fixture("acp", message => {
		if (message === "turn-start" && fail) {
			failed = f.driver.activeHandle;
			throw new Error("turn-start sink failed");
		}
	});
	try {
		assert.equal((await collect(f.simple(model, user))).events.at(-1)?.type, "done");
		const pid = f.driver.snapshot().pid;
		assert.ok(pid);
		fail = true;
		const result = await collect(f.simple(model, user));
		assertSingleError(result);
		assert.equal(f.driver.activeHandle, null);
		assert.ok(failed);
		assert.equal((await bounded((failed as TurnHandle).outcome)).status, "ERROR");
		assert.equal(f.driver.snapshot().pid, pid);
		assert.doesNotThrow(() => process.kill(pid, 0));
		fail = false;
		assert.equal((await collect(f.simple(model, user))).events.at(-1)?.type, "done");
		assert.equal(f.driver.snapshot().stats.spawns, 1, "startup rollback must not recycle an unowned connection");
	} finally {
		fail = false;
		await f.cleanup();
	}
});

test("acp: an abort-listener setup throw rolls back the turn and unregisters its listener", async () => {
	let failed: TurnHandle | null = null;
	const f = fixture("acp", message => {
		if (message === "turn-start") failed = f.driver.activeHandle;
	});
	const controller = new AbortController();
	const add = controller.signal.addEventListener.bind(controller.signal);
	vi.spyOn(controller.signal, "addEventListener").mockImplementation((...args) => {
		add(...args);
		throw new Error("abort listener setup failed");
	});
	const remove = vi.spyOn(controller.signal, "removeEventListener");
	try {
		const result = await collect(f.simple(model, user, { signal: controller.signal }));
		assertSingleError(result);
		assert.equal(f.driver.activeHandle, null);
		assert.ok(failed);
		assert.equal((await bounded((failed as TurnHandle).outcome)).status, "ERROR");
		assert.equal(await bounded((failed as TurnHandle).next()), null);
		assert.equal(remove.mock.calls.length, 1, "startup rollback must unregister the owned abort listener");
		assert.equal(remove.mock.calls[0][0], "abort");
		assert.equal(f.driver.snapshot().stats.spawns, 0);
		assert.equal((await collect(f.simple(model, user))).events.at(-1)?.type, "done");
	} finally {
		await f.cleanup();
	}
});

for (const engine of ["stream-json", "acp"] as const) {
	test(`${engine}: partial stdout listener wiring failure releases its process and listeners`, async () => {
		const realSpawn = childProcess.spawn;
		const spawn = vi.spyOn(childProcess, "spawn");
		let child: childProcess.ChildProcess | undefined;
		let fail = true;
		spawn.mockImplementation((...args) => {
			const spawned = realSpawn(...args);
			if (fail && args[0] === (engine === "stream-json" ? "agy" : process.execPath)) {
				child = spawned;
				const on = spawned.stdout!.on.bind(spawned.stdout!);
				vi.spyOn(spawned.stdout!, "on").mockImplementation((event, listener) => {
					const result = on(event, listener);
					if (event === "data") throw new Error("stdout listener wiring failed");
					return result;
				});
			}
			return spawned;
		});
		const f = fixture(engine, () => {});
		try {
			assert.match(assertSingleError(await collect(f.simple(model, user))), /stdout listener wiring failed/);
			assert.ok(child && (child.exitCode !== null || child.signalCode !== null));
			assert.equal(child.stdout?.listenerCount("data"), 0, "failed startup must remove partially installed stdout listeners");
			assert.equal(child.stderr?.listenerCount("data"), 0);
			assert.equal(f.driver.activeHandle, null);
			fail = false;
			assert.equal((await collect(f.simple(model, user))).events.at(-1)?.type, "done");
		} finally {
			fail = false;
			await f.cleanup();
		}
	});
}

for (const engine of ["stream-json", "acp"] as const) {
	test(`${engine}: abort-listener registration failure cannot abort a successor turn`, async () => {
		const controller = new AbortController();
		const add = controller.signal.addEventListener.bind(controller.signal);
		let failed: TurnHandle | null = null;
		const f = fixture(engine, () => {});
		vi.spyOn(controller.signal, "addEventListener").mockImplementation((...args) => {
			add(...args);
			failed = f.driver.activeHandle;
			throw new Error("abort listener setup failed");
		});
		try {
			assert.match(assertSingleError(await collect(f.simple(model, user, { signal: controller.signal }))), /abort listener setup failed/);
			assert.equal(getEventListeners(controller.signal, "abort").length, 0, "rollback must unregister even a partially installed abort listener");
			const successor = await f.driver.run({ cwd: f.dir, model: "gemini-flash", mode: "accept-edits", skipPermissions: true, prompt: "recover", timeoutMin: 0, inactivityMin: 0 });
			controller.abort();
			assert.equal((await bounded(successor.outcome)).status, "OK", "aborting the failed request must not strand its successor");
			assert.ok(failed);
			assert.equal((await bounded((failed as TurnHandle).outcome)).status, "ERROR");
			assert.equal(await bounded((failed as TurnHandle).next()), null);
		} finally {
			controller.abort();
			await f.cleanup();
		}
	});
}

test("acp: a cleanup sink throw cannot leak the process from a rejected startup", async () => {
	const realSpawn = childProcess.spawn;
	const spawn = vi.spyOn(childProcess, "spawn");
	let fail = true;
	let sawKill = false;
	let child: childProcess.ChildProcess | undefined;
	spawn.mockImplementation((...args) => {
		const spawned = realSpawn(...args);
		if (fail && args[0] === process.execPath) {
			vi.spyOn(spawned.stdin!, "write").mockImplementationOnce(() => { throw new Error("initialize write failed"); });
		}
		return spawned;
	});
	const f = fixture("acp", message => {
		if (fail && message === "kill") {
			sawKill = true;
			throw new Error("kill sink failed");
		}
	});
	try {
		const result = await collect(f.simple(model, user));
		child = spawn.mock.results[spawn.mock.calls.findIndex(([command]) => command === process.execPath)].value as childProcess.ChildProcess;
		assert.ok(child.exitCode !== null || child.signalCode !== null, "rollback must terminate the child even when its cleanup log throws");
		assertSingleError(result);
		assert.equal(sawKill, true);
		assert.equal(f.driver.activeHandle, null);
		fail = false;
		assert.equal((await collect(f.simple(model, user))).events.at(-1)?.type, "done");
	} finally {
		fail = false;
		// The red implementation can mark a child killed without signalling it.
		if (child && child.exitCode === null && child.signalCode === null) {
			await bounded(new Promise<void>(resolve => { child!.once("exit", () => resolve()); child!.kill(); }));
		}
		await f.cleanup();
	}
});

for (const sink of ["spawn", "initialized"] as const) {
	test(`acp: a throwing ${sink} sink ${sink === "spawn" ? "rolls back synchronous startup" : "is ignored after the handshake"} and allows the next call`, async () => {
		const spawn = vi.spyOn(childProcess, "spawn");
		let fail = true;
		let failed: TurnHandle | null = null;
		const f = fixture("acp", message => {
			if (message === sink && fail) {
				failed = f.driver.activeHandle;
				throw new Error(`${sink} sink failed`);
			}
		});
		try {
			const first = await collect(f.simple(model, user));
			if (sink === "spawn") assert.match(assertSingleError(first), /spawn sink failed/);
			else {
				assert.equal(first.ends, 1);
				assert.equal(first.events.at(-1)?.type, "done", "an async diagnostic failure must not interrupt the turn");
			}
			const children = spawn.mock.calls.flatMap(([command], index) => command === process.execPath ? [spawn.mock.results[index].value as childProcess.ChildProcess] : []);
			assert.equal(children.length, sink === "spawn" ? 0 : 1);
			if (sink === "initialized") assert.doesNotThrow(() => process.kill(children[0].pid!, 0), "the healthy connection stays reusable");
			assert.equal(f.driver.activeHandle, null);
			assert.ok(failed);
			assert.equal((await bounded((failed as TurnHandle).outcome)).status, sink === "spawn" ? "ERROR" : "OK");
			assert.equal(await bounded((failed as TurnHandle).next()), null);
			fail = false;
			assert.equal((await collect(f.simple(model, user))).events.at(-1)?.type, "done");
			if (sink === "initialized") assert.equal(f.driver.snapshot().stats.spawns, 1);
		} finally {
			fail = false;
			await f.cleanup();
		}
	});
}

test("stream-json: a throwing spawn sink cleans up startup and the next call completes", async () => {
	const spawn = vi.spyOn(childProcess, "spawn");
	let fail = true;
	let failed: TurnHandle | null = null;
	const f = fixture("stream-json", message => {
		if (message.startsWith("spawn:") && fail) {
			failed = f.driver.activeHandle;
			throw new Error("spawn sink failed");
		}
	});
	try {
		assert.match(assertSingleError(await collect(f.simple(model, user))), /spawn sink failed/);
		const child = spawn.mock.results[spawn.mock.calls.findIndex(([command]) => command === "agy")].value as childProcess.ChildProcess;
		assert.ok(child.exitCode !== null || child.signalCode !== null, "a throwing spawn sink must not leave its child alive");
		assert.equal(child.stdout?.listenerCount("data"), 0);
		assert.equal(child.stderr?.listenerCount("data"), 0);
		assert.equal(f.driver.activeHandle, null);
		assert.ok(failed);
		assert.equal((await bounded((failed as TurnHandle).outcome)).status, "ERROR");
		assert.equal(await bounded((failed as TurnHandle).next()), null);
		fail = false;
		assert.equal((await collect(f.simple(model, user))).events.at(-1)?.type, "done");
	} finally {
		fail = false;
		await f.cleanup();
	}
});

// Missing executables emit error rather than exit, so termination uses its 3s
// fallback. Budget both bounded collections (4s each) and shutdown (up to 3s):
// a 5s runner timeout can advance to the next test while finally still owns the
// spawn spy, making that test's realSpawn capture the spy and recurse.
const spawnFailureRaceTimeoutMs = 15_000;

test("stream-json: spawn failure racing a throwing spawn sink remains contained", async () => {
	const realSpawn = childProcess.spawn;
	const spawn = vi.spyOn(childProcess, "spawn");
	let fail = true;
	spawn.mockImplementation((...args) => fail && args[0] === "agy" ? realSpawn("missing-startup-ownership-executable") : realSpawn(...args));
	const f = fixture("stream-json", message => {
		if (message.startsWith("spawn:") && fail) throw new Error("spawn sink failed");
	});
	try {
		assert.match(assertSingleError(await collect(f.simple(model, user))), /spawn sink failed/);
		assert.equal(f.driver.activeHandle, null);
		fail = false;
		assert.equal((await collect(f.simple(model, user))).events.at(-1)?.type, "done");
	} finally {
		fail = false;
		await f.cleanup();
	}
}, spawnFailureRaceTimeoutMs);

test("acp: spawn failure racing partial listener wiring remains contained", async () => {
	const realSpawn = childProcess.spawn;
	const spawn = vi.spyOn(childProcess, "spawn");
	let fail = true;
	spawn.mockImplementation((...args) => {
		if (!fail || args[0] !== process.execPath) return realSpawn(...args);
		const child = realSpawn("missing-startup-ownership-executable");
		const on = child.stdout!.on.bind(child.stdout!);
		vi.spyOn(child.stdout!, "on").mockImplementation((event, listener) => {
			const result = on(event, listener);
			if (event === "data") throw new Error("stdout listener wiring failed");
			return result;
		});
		return child;
	});
	const f = fixture("acp", () => {});
	try {
		assert.match(assertSingleError(await collect(f.simple(model, user))), /stdout listener wiring failed/);
		assert.equal(f.driver.activeHandle, null);
		fail = false;
		assert.equal((await collect(f.simple(model, user))).events.at(-1)?.type, "done");
	} finally {
		fail = false;
		await f.cleanup();
	}
}, spawnFailureRaceTimeoutMs);

test("stream-json: a synchronous prompt-write throw terminates only the failed turn's child", async () => {
	const spawn = vi.spyOn(childProcess, "spawn");
	let child: childProcess.ChildProcess | undefined;
	let failed: TurnHandle | null = null;
	let fail = true;
	const f = fixture("stream-json", message => {
		if (message === "turn-start" && fail) {
			failed = f.driver.activeHandle;
			child = spawn.mock.results[spawn.mock.calls.findIndex(([command]) => command === "agy")].value as childProcess.ChildProcess;
			vi.spyOn(child.stdin!, "write").mockImplementationOnce(() => { throw new Error("prompt write failed"); });
		}
	});
	try {
		const result = await collect(f.simple(model, user));
		assertSingleError(result);
		assert.equal(f.driver.activeHandle, null);
		assert.ok(failed);
		const outcome = await bounded((failed as TurnHandle).outcome);
		assert.equal(outcome.status, "ERROR");
		assert.match(outcome.error ?? "", /failed to write to agy driver.*prompt write failed/);
		assert.equal(await bounded((failed as TurnHandle).next()), null);
		assert.ok(child && (child.exitCode !== null || child.signalCode !== null), "prompt-write failure must terminate its owned child");
		fail = false;
		assert.equal((await collect(f.simple(model, user))).events.at(-1)?.type, "done");
	} finally {
		fail = false;
		await f.cleanup();
	}
});
