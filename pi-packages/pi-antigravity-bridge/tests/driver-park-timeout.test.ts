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

async function start(timeoutMin = 1 / 60, inactivityMin = 0) {
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
		prompt: "hello", timeoutMin, inactivityMin, startupTimeoutMs: 25,
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

function tool(child: ownedProcess.OwnedProcess, step_index: number | undefined, state: string) {
 child.stdout.emit("data", `${JSON.stringify({ step_type: "tool", step_index, state, tool_name: "run_command" })}
`);
}

test("stream-json: concurrent tools and parks independently suspend idle until final completion", async () => {
 const { driver, child, handle, settled } = await start(0, 1 / 60);
 tool(child, 1, "ACTIVE"); tool(child, 1, "ACTIVE"); tool(child, 2, "ACTIVE");
 await vi.advanceTimersByTimeAsync(2_000);
 park(handle); driver.kickIdle();
 tool(child, 1, "DONE");
 await vi.advanceTimersByTimeAsync(2_000);
 expect(settled).not.toHaveBeenCalled();
 park(handle); tool(child, 2, "ERROR");
 await vi.advanceTimersByTimeAsync(2_000);
 expect(settled).not.toHaveBeenCalled();
 driver.kickIdle();
 await vi.advanceTimersByTimeAsync(999);
 expect(settled).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1);
 expect(await handle.outcome).toMatchObject({ status: "ERROR", deadline: "stall" });
});

test("stream-json: native work does not pause the overall cap", async () => {
 const { child, handle } = await start(1 / 60, 1 / 120);
 tool(child, 7, "ACTIVE");
 await vi.advanceTimersByTimeAsync(1_000);
 expect(await handle.outcome).toMatchObject({ status: "ERROR", deadline: "timeout" });
});

test("stream-json: last completion starts a full idle budget and recognized frames refresh it", async () => {
 const { child, handle, settled } = await start(0, 1 / 60);
 tool(child, 4, "ACTIVE");
 await vi.advanceTimersByTimeAsync(3_000);
 tool(child, 4, "DONE");
 await vi.advanceTimersByTimeAsync(500);
 // A recognized frame refreshes the ordinary idle guard even if it is stray.
 tool(child, 9, "ERROR");
 await vi.advanceTimersByTimeAsync(999);
 expect(settled).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1);
 expect(await handle.outcome).toMatchObject({ deadline: "stall" });
});

test("stream-json: an unfinished tool cannot suspend a subsequent turn", async () => {
 const { driver, child, handle } = await start(0, 1 / 60);
 tool(child, 1, "ACTIVE");
 child.stdout.emit("data", `${JSON.stringify({ event: "result", result: { status: "SUCCESS", response: "done" } })}\n`);
 expect(await handle.outcome).toMatchObject({ status: "OK" });
 const next = await driver.run({ cwd: process.cwd(), model: "gemini-3.6-flash", mode: "accept-edits", skipPermissions: true, prompt: "next", timeoutMin: 0, inactivityMin: 1 / 60, startupTimeoutMs: 25 });
 await vi.advanceTimersByTimeAsync(1_000);
 expect(await next.outcome).toMatchObject({ deadline: "stall" });
});

test("stream-json: overlapping unidentified starts remain suspended until settle and the overall cap still fires", async () => {
 const { child, handle, settled } = await start(4 / 60, 1 / 60);
 tool(child, undefined, "ACTIVE"); tool(child, undefined, "ACTIVE");
 tool(child, undefined, "DONE");
 await vi.advanceTimersByTimeAsync(2_000);
 expect(settled).not.toHaveBeenCalled();
 tool(child, undefined, "DONE");
 await vi.advanceTimersByTimeAsync(2_000);
 expect(await handle.outcome).toMatchObject({ deadline: "timeout" });
});

test("stream-json: a single unidentified tool re-arms idle on completion", async () => {
 const { child, handle, settled } = await start(0, 1 / 60);
 tool(child, undefined, "ACTIVE"); tool(child, undefined, "DONE");
 await vi.advanceTimersByTimeAsync(999);
 expect(settled).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1);
 expect(await handle.outcome).toMatchObject({ deadline: "stall" });
});

test("stream-json: forwards MCP server identity from the tool frame", async () => {
 const { child, handle } = await start(0, 0);
 child.stdout.emit("data", `${JSON.stringify({ step_type: "tool", step_index: 3, state: "ACTIVE", tool_name: "call_mcp_tool", tool_info: { parameters: { server_name: "pi-bridge", tool: "bash" } } })}\n`);
 expect(await handle.next()).toMatchObject({ type: "tool_start", mcpServer: "pi-bridge" });
});
