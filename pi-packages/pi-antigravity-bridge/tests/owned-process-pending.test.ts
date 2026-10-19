import assert from "node:assert/strict";
import { once } from "node:events";
import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, test, vi, type Mock } from "vitest";
import { launchInJob, JobLauncherUnavailable, type LaunchedJob } from "@thoth-agents/pi-core/windows-job";
import { spawnOwnedProcess } from "../src/owned-process.js";
import { terminateProcessTree } from "../src/process-termination.js";
vi.mock("@thoth-agents/pi-core/windows-job", async (original) => {
	const actual = await original<typeof import("@thoth-agents/pi-core/windows-job")>();
	return { ...actual, launchInJob: vi.fn(actual.launchInJob) };
});
afterEach(() => vi.mocked(launchInJob).mockClear());
const windows = test.skipIf(process.platform !== "win32");

windows("pending launch terminated after its deadline never leaks a late job or notifications", async () => {
	const actual = await vi.importActual<typeof import("@thoth-agents/pi-core/windows-job")>("@thoth-agents/pi-core/windows-job");
	let complete!: (job: LaunchedJob) => void;
	let started!: () => void;
	const entered = new Promise<void>((resolve) => { started = resolve; });
	vi.mocked(launchInJob).mockImplementationOnce(() => { started(); return new Promise((resolve) => { complete = resolve; }); });
	const notifications: string[] = [], warnings: string[] = [];
	const child = spawnOwnedProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { log: (message) => notifications.push(message) });
	for (const event of ["spawn", "error", "exit", "close"]) child.on(event, () => notifications.push(event));
	await entered;
	const before = Date.now();
	await terminateProcessTree(child, { timeoutMs: 25, log: (message) => warnings.push(message) });
	assert.ok(Date.now() - before < 500);
	const job = await actual.launchInJob({ file: process.execPath, args: ["-e", "setInterval(()=>{},1000)"], cwd: process.cwd(), env: process.env });
	let released!: () => void;
	const done = new Promise<void>((resolve) => { released = resolve; });
	const terminate = vi.fn(job.terminate), release = vi.fn(async () => { await job.release(); released(); });
	complete({ ...job, terminate, release });
	await done;
	await job.exited;
	assert.throws(() => process.kill(job.pid, 0), { code: "ESRCH" });
	assert.equal(terminate.mock.calls.length, 1);
	assert.equal(release.mock.calls.length, 1);
	assert.deepEqual(warnings, ["termination-warning"]);
	assert.deepEqual(notifications, []);
}, 30_000);

for (const reason of ["launcher unavailable", "helper death"]) windows(`cancelled pending ${reason} does not fall back or notify after deadline`, async () => {
	let reject!: (error: Error) => void;
	vi.mocked(launchInJob).mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
	const notifications: string[] = [], warnings: string[] = [];
	const child = spawnOwnedProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { log: (message) => notifications.push(message) });
	for (const event of ["spawn", "error", "exit", "close"]) child.on(event, () => notifications.push(event));
	await delay(0);
	await terminateProcessTree(child, { timeoutMs: 20, log: (message) => warnings.push(message) });
	reject(new JobLauncherUnavailable(reason));
	await delay(30);
	assert.equal(child.pid, undefined);
	assert.deepEqual(notifications, []);
	assert.deepEqual(warnings, ["termination-warning"]);
});

windows("fallback warns and ends only its owned leader", async () => {
	vi.mocked(launchInJob).mockRejectedValueOnce(new JobLauncherUnavailable("fixture unavailable"));
	const warnings: string[] = [];
	const child = spawnOwnedProcess(process.execPath, ["-e", `const {spawn}=require('node:child_process');const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore',windowsHide:true});console.log(p.pid);setInterval(()=>{},1000);`], { log: (message) => warnings.push(message) });
	let descendant = 0;
	try {
		descendant = Number(String((await once(child.stdout, "data"))[0]).trim());
		await terminateProcessTree(child);
		assert.doesNotThrow(() => process.kill(descendant, 0));
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /leader-only/);
	} finally {
		await terminateProcessTree(child);
		if (descendant) { try { process.kill(descendant); } catch { /* gone */ } }
	}
}, 10_000);

windows("late cleanup failure cannot warn or notify after a termination deadline", async () => {
	const actual = await vi.importActual<typeof import("@thoth-agents/pi-core/windows-job")>("@thoth-agents/pi-core/windows-job");
	let cleaned!: () => void;
	const done = new Promise<void>((resolve) => { cleaned = resolve; });
	vi.mocked(launchInJob).mockImplementationOnce(async (options) => {
		const job = await actual.launchInJob(options);
		return { ...job, terminate: async (timeout) => {
			await job.terminate(timeout);
			await job.release();
			await delay(60);
			cleaned();
			throw new Error("late cleanup failure");
		} };
	});
	const warnings: string[] = [], notifications: string[] = [];
	const child = spawnOwnedProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { log: (message) => notifications.push(message) });
	await once(child, "spawn");
	await terminateProcessTree(child, { timeoutMs: 5, log: (message) => warnings.push(message) });
	const count = notifications.length;
	await done;
	await delay(20);
	assert.equal(notifications.length, count);
	assert.deepEqual(warnings, ["termination-warning"]);
}, 30_000);

windows("normal exit and concurrent explicit termination share one terminate and release", async () => {
	const actual = await vi.importActual<typeof import("@thoth-agents/pi-core/windows-job")>("@thoth-agents/pi-core/windows-job");
	let terminate!: Mock<LaunchedJob["terminate"]>, release!: Mock<LaunchedJob["release"]>;
	vi.mocked(launchInJob).mockImplementationOnce(async (options) => {
		const job = await actual.launchInJob(options);
		terminate = vi.fn(job.terminate); release = vi.fn(job.release);
		return { ...job, terminate, release };
	});
	const child = spawnOwnedProcess(process.execPath, ["-e", "console.log('ready');process.stdin.once('data',()=>process.exit(0))"]);
	const closed = once(child, "close");
	await once(child.stdout, "data");
	const exited = once(child, "exit");
	child.stdin!.end("exit");
	await exited;
	await Promise.all([terminateProcessTree(child), terminateProcessTree(child)]);
	await closed;
	assert.equal(terminate.mock.calls.length, 1);
	assert.equal(release.mock.calls.length, 1);
}, 30_000);

windows("helper death reports error but still drains buffered pipes before close", async () => {
	let rejectExit!: (error: Error) => void;
	const stdout = new PassThrough(), stderr = new PassThrough();
	vi.mocked(launchInJob).mockResolvedValueOnce({ pid: process.pid, stdin: new PassThrough(), stdout, stderr,
		exited: new Promise((_resolve, reject) => { rejectExit = reject; }), terminate: async () => {}, release: async () => {} });
	const child = spawnOwnedProcess(process.execPath, []);
	let output = "";
	child.stdout.on("data", (chunk) => { output += String(chunk); });
	const closed = new Promise<void>((resolve) => child.once("close", resolve));
	await once(child, "spawn");
	const error = new Promise<void>((resolve) => child.once("error", () => resolve()));
	rejectExit(new JobLauncherUnavailable("helper died"));
	await error;
	stdout.end("buffered final output"); stderr.end();
	await closed;
	assert.equal(output, "buffered final output");
});

windows("target launch errors never fall back", async () => {
	vi.mocked(launchInJob).mockRejectedValueOnce(Object.assign(new Error("target rejected"), { code: 193 }));
	const warnings: string[] = [];
	const child = spawnOwnedProcess(process.execPath, [], { log: (message) => warnings.push(message) });
	const error = await new Promise<NodeJS.ErrnoException>((resolve) => child.once("error", resolve));
	assert.equal(error.code, 193);
	assert.equal(child.pid, undefined);
	assert.deepEqual(warnings, []);
});
