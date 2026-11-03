import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { afterEach, expect, test, vi } from "vitest";
import { StreamDriver } from "../src/driver.js";
import type { TurnHandle } from "../src/driver-types.js";
import * as ownedProcess from "../src/owned-process.js";
import * as termination from "../src/process-termination.js";

let driver: StreamDriver | undefined;

afterEach(async () => {
	await driver?.close("shutdown");
	driver = undefined;
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function start(timeoutMin = 1 / 60) {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
	const child: ownedProcess.OwnedProcess = Object.assign(new EventEmitter(), {
		pid: 12345,
		stdin: new Writable({ write(_chunk, _encoding, callback) { callback(); } }),
		stdout: new PassThrough(),
		stderr: new PassThrough(),
		exitCode: null,
		signalCode: null,
		kill: vi.fn(() => {
			child.exitCode = 1;
			child.stdin?.destroy();
			child.stdout.destroy();
			child.stderr.destroy();
			child.emit("exit", 1, null);
			return true;
		}),
	});
	// Replace only process I/O/termination; the driver, queue and timers are real.
	vi.spyOn(ownedProcess, "spawnOwnedProcess").mockReturnValue(child);
	vi.spyOn(termination, "terminateProcessTree").mockImplementation(async () => { child.kill(); });
	driver = new StreamDriver();
	const handle = await driver.run({
		cwd: process.cwd(), model: "gemini-3.6-flash", mode: "accept-edits", skipPermissions: true,
		prompt: "hello", timeoutMin, inactivityMin: 0, startupTimeoutMs: 25,
	});
	const settled = vi.fn();
	void handle.outcome.then(settled);
	return { driver, child, handle, settled };
}

function park(handle: TurnHandle, callId = "park") {
	handle.pushExternal({ type: "bridge_call", callId, name: "bash", args: {} });
}

test("stream-json: parked tool time does not consume the overall turn budget", async () => {
	const { child, handle, settled } = await start();
	await vi.advanceTimersByTimeAsync(400);
	park(handle);
	await vi.advanceTimersByTimeAsync(5_000);
	expect(settled).not.toHaveBeenCalled();
	expect(child.kill).not.toHaveBeenCalled();
});

test("stream-json: unpark resumes only the remaining overall turn budget", async () => {
	const { driver, child, handle, settled } = await start();
	await vi.advanceTimersByTimeAsync(400);
	park(handle);
	await vi.advanceTimersByTimeAsync(200);
	driver.kickIdle();
	await vi.advanceTimersByTimeAsync(599);
	expect(settled).not.toHaveBeenCalled();
	expect(child.kill).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	expect(await handle.outcome).toMatchObject({
		status: "ERROR", deadline: "timeout",
		error: expect.stringMatching(/^agy exceeded the .*m turn timeout$/),
	});
	expect(child.kill).toHaveBeenCalledTimes(1);
});

test("stream-json: nested parks pause once and resume only after the final unpark", async () => {
	const { driver, child, handle, settled } = await start();
	await vi.advanceTimersByTimeAsync(400);
	park(handle, "outer");
	await vi.advanceTimersByTimeAsync(200);
	park(handle, "inner");
	await vi.advanceTimersByTimeAsync(200);
	driver.kickIdle();
	await vi.advanceTimersByTimeAsync(5_000);
	expect(settled).not.toHaveBeenCalled();
	expect(child.kill).not.toHaveBeenCalled();
	driver.kickIdle();
	await vi.advanceTimersByTimeAsync(300);
	// A duplicate kick must not reset the running deadline.
	driver.kickIdle();
	await vi.advanceTimersByTimeAsync(299);
	expect(settled).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	expect(await handle.outcome).toMatchObject({ status: "ERROR", deadline: "timeout" });
	expect(child.kill).toHaveBeenCalledTimes(1);
});

test("stream-json: an exhausted overall budget fires immediately after unpark", async () => {
	const { driver, child, handle, settled } = await start();
	// Move the clock without firing callbacks to model a park racing a due timer.
	vi.setSystemTime(new Date("2026-01-01T00:00:01Z"));
	park(handle);
	await vi.advanceTimersByTimeAsync(5_000);
	expect(settled).not.toHaveBeenCalled();
	driver.kickIdle();
	await vi.advanceTimersByTimeAsync(0);
	expect(await handle.outcome).toMatchObject({ status: "ERROR", deadline: "timeout" });
	expect(child.kill).toHaveBeenCalledTimes(1);
});

test("stream-json: a zero overall budget stays disabled across nested park cycles", async () => {
	const { driver, child, handle, settled } = await start(0);
	await vi.advanceTimersByTimeAsync(60 * 60_000);
	park(handle, "outer");
	await vi.advanceTimersByTimeAsync(60 * 60_000);
	park(handle, "inner");
	driver.kickIdle();
	await vi.advanceTimersByTimeAsync(60 * 60_000);
	driver.kickIdle();
	driver.kickIdle();
	await vi.advanceTimersByTimeAsync(60 * 60_000);
	park(handle, "again");
	driver.kickIdle();
	await vi.advanceTimersByTimeAsync(60 * 60_000);
	expect(settled).not.toHaveBeenCalled();
	expect(child.kill).not.toHaveBeenCalled();
	child.stdout.emit("data", `${JSON.stringify({ event: "result", result: { status: "SUCCESS", response: "done" } })}\n`);
	expect(await handle.outcome).toMatchObject({ status: "OK", response: "done" });
});
