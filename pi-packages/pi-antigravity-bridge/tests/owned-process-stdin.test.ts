import assert from "node:assert/strict";
import { once } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { setImmediate as nextImmediate } from "node:timers/promises";
import { afterEach, test, vi } from "vitest";
import { launchInJob, type LaunchedJob } from "@thoth-agents/pi-core/windows-job";
import { spawnOwnedProcess } from "../src/owned-process.js";
import { terminateProcessTree } from "../src/process-termination.js";

vi.mock("@thoth-agents/pi-core/windows-job", async (original) => {
	const actual = await original<typeof import("@thoth-agents/pi-core/windows-job")>();
	return { ...actual, launchInJob: vi.fn(actual.launchInJob) };
});
afterEach(() => vi.restoreAllMocks());
const windows = test.skipIf(process.platform !== "win32");

function fixture(stdin: Writable) {
	const stdout = new PassThrough(), stderr = new PassThrough();
	let exit!: (value: { code: number }) => void;
	const job: LaunchedJob = { pid: 12345, stdin, stdout, stderr,
		exited: new Promise(resolve => { exit = resolve; }),
		terminate: async () => { stdout.end(); stderr.end(); exit({ code: 0 }); }, release: async () => {} };
	vi.mocked(launchInJob).mockResolvedValueOnce(job);
	return spawnOwnedProcess(process.execPath, []);
}

windows("job stdin facade acknowledges only the target callback and propagates its error", async () => {
	let accept!: (error?: Error | null) => void;
	const received: string[] = [];
	const target = new Writable({ write(chunk, _encoding, callback) {
		received.push(chunk.toString()); accept = callback;
	} });
	const child = fixture(target);
	const callback = vi.fn(), errors: Error[] = [];
	child.stdin!.on("error", error => errors.push(error));
	try {
		// Writes queued before Job acquisition obey the same confirmation rule.
		child.stdin!.write("prompt\n", callback);
		await once(child, "spawn");
		await nextImmediate();
		assert.deepEqual(received, ["prompt\n"]);
		assert.equal(callback.mock.calls.length, 0, "facade buffering is not target acceptance");
		const error = new Error("target rejected prompt");
		accept(error);
		await nextImmediate();
		assert.equal(callback.mock.calls.length, 1);
		assert.equal(callback.mock.calls[0][0], error);
		assert.deepEqual(errors, [error]);
	} finally {
		accept?.();
		await terminateProcessTree(child);
	}
});

windows("job stdin facade preserves backpressure, write order and target-confirmed end", async () => {
	const writes: Buffer[] = [], accept: Array<(error?: Error | null) => void> = [];
	let finishTarget!: () => void;
	const target = new Writable({ highWaterMark: 1,
		write(chunk, _encoding, callback) { writes.push(chunk); accept.push(callback); },
		final(callback) { finishTarget = callback; },
	});
	const child = fixture(target);
	child.stdin!.on("error", () => {});
	const first = vi.fn(), second = vi.fn(), ended = vi.fn();
	try {
		assert.equal(child.stdin!.write(Buffer.alloc(128 * 1024, "a"), first), false);
		child.stdin!.write("second", second);
		const drained = once(child.stdin!, "drain");
		await once(child, "spawn");
		assert.equal(writes.length, 1, "only one target write is in flight");
		assert.equal(writes[0].length, 128 * 1024);
		accept[0]();
		await nextImmediate();
		assert.equal(first.mock.calls.length, 1);
		assert.equal(second.mock.calls.length, 0);
		assert.equal(writes[1].toString(), "second");
		accept[1]();
		await drained;
		assert.equal(second.mock.calls.length, 1);
		const closed = once(child.stdin!, "close");
		child.stdin!.end("last", ended);
		assert.equal(writes[2].toString(), "last");
		accept[2]();
		await nextImmediate();
		assert.equal(ended.mock.calls.length, 0, "end waits for the target's final callback too");
		assert.equal(child.stdin!.writableFinished, false);
		finishTarget();
		await closed;
		assert.equal(ended.mock.calls.length, 1);
		assert.equal(ended.mock.calls[0][0] ?? null, null);
		assert.equal(target.writableFinished, true);
		assert.equal(target.destroyed, true);
	} finally {
		child.stdin!.destroy();
		await terminateProcessTree(child);
	}
});

windows("job stdin target close fails an in-flight write even without a target callback", async () => {
	const target = new Writable({ write() { /* the target never acknowledges */ } });
	const child = fixture(target);
	const callback = vi.fn(), errors: Error[] = [];
	child.stdin!.on("error", error => errors.push(error));
	try {
		child.stdin!.write("prompt", callback);
		await once(child, "spawn");
		const closed = once(child.stdin!, "close").catch(() => {});
		target.destroy();
		await closed;
		assert.equal(callback.mock.calls.length, 1);
		assert.match(callback.mock.calls[0][0].message, /stdin closed/);
		assert.equal(errors.length, 1);
	} finally { await terminateProcessTree(child); }
});

windows("destroying pending stdin closes a late target without forwarding or acknowledging success", async () => {
	const write = vi.fn((_chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) => callback());
	const target = new Writable({ write });
	const child = fixture(target);
	const callback = vi.fn();
	child.stdin!.on("error", () => {});
	try {
		child.stdin!.write("undispatched", callback);
		child.stdin!.destroy();
		await once(child, "spawn");
		await nextImmediate();
		assert.equal(write.mock.calls.length, 0);
		assert.equal(callback.mock.calls.length, 1);
		assert.match(callback.mock.calls[0][0].message, /stdin closed/);
		assert.equal(target.destroyed, true);
	} finally { await terminateProcessTree(child); }
});

windows("ending stdin before Job acquisition waits for the target's end callback", async () => {
	let finishTarget!: () => void;
	const target = new Writable({ write(_chunk, _encoding, callback) { callback(); },
		final(callback) { finishTarget = callback; },
	});
	const child = fixture(target), ended = vi.fn();
	try {
		child.stdin!.end(ended);
		await once(child, "spawn");
		assert.equal(target.writableEnded, true);
		assert.equal(ended.mock.calls.length, 0);
		const closed = once(child.stdin!, "close");
		finishTarget();
		await closed;
		assert.equal(ended.mock.calls.length, 1);
		assert.equal(target.writableFinished, true);
	} finally { await terminateProcessTree(child); }
});

windows("an idle target closing normally closes the facade without an error", async () => {
	const target = new PassThrough();
	const child = fixture(target), errors: Error[] = [];
	child.stdin!.on("error", error => errors.push(error));
	try {
		await once(child, "spawn");
		const closed = once(child.stdin!, "close");
		target.destroy();
		await closed;
		assert.equal(child.stdin!.writable, false);
		assert.deepEqual(errors, []);
	} finally { await terminateProcessTree(child); }
});
