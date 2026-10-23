import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, type Readable, Writable } from "node:stream";
import { launchInJob, JobLauncherUnavailable, type LaunchedJob } from "@thoth-agents/pi-core/windows-job";
import { emitLifecycle } from "./lifecycle.js";
import { resolveWindowsExecutable } from "./windows-executable.js";

export interface OwnedSpawnOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	stdio?: ["pipe" | "ignore", "pipe", "pipe"] | "pipe";
	windowsHide?: boolean;
	shell?: false;
	detached?: boolean;
	log?: (message: string, data?: unknown) => void;
}
export interface OwnedProcess extends EventEmitter {
	pid: number | undefined;
	/** True only after a Windows job has been acquired; false for plain spawn/fallback. */
	readonly jobBacked?: boolean;
	stdin: Writable | null;
	stdout: Readable;
	stderr: Readable;
	exitCode: number | null;
	signalCode: NodeJS.Signals | null;
	kill(signal?: NodeJS.Signals | number): boolean;
}
interface Ownership {
	terminate(timeoutMs: number): Promise<void>;
	fence(): void;
}
const ownership = new WeakMap<object, Ownership>();
/** Internal handshake used by the existing bounded termination helper. */
export function ownedProcessControl(child: object): Ownership | undefined { return ownership.get(child); }

/** Select at notification time: an asynchronous launch may become a fallback.
 * Only jobs guarantee that descendant-held pipes drain after leader exit. */
export function onOwnedProcessSettled(child: OwnedProcess, listener: (code: number | null, signal: NodeJS.Signals | null) => void): void {
	let settled = false;
	const finish = (code: number | null, signal: NodeJS.Signals | null) => {
		if (settled) return;
		settled = true;
		child.removeListener("exit", exit);
		child.removeListener("close", finish);
		listener(code, signal);
	};
	const exit = (code: number | null, signal: NodeJS.Signals | null) => { if (!child.jobBacked) finish(code, signal); };
	child.on("exit", exit);
	child.on("close", finish);
}

/** A writable, not a PassThrough: acknowledging a local buffer would falsely
 * confirm prompt dispatch. Node serializes writes and applies backpressure until
 * the acquired Job (or fallback child) acknowledges each write itself. */
class OwnedStdin extends Writable {
	#target: Writable | undefined;
	#pending: { start: () => void; finish: (error?: Error | null) => void } | undefined;

	attach(target: Writable): void {
		this.#target = target;
		target.on("error", error => this.destroy(error));
		// A normal process exit closes an idle stdin without a write failure.
		target.once("close", () => {
			this.destroy(this.#pending && !target.writableFinished ? new Error("owned process stdin closed") : undefined);
		});
		if (this.destroyed) target.destroy();
		else if (target.destroyed) this.destroy(target.errored ?? (this.#pending ? new Error("owned process stdin closed") : undefined));
		else this.#pending?.start();
	}

	#forward(write: (target: Writable, callback: (error?: Error | null) => void) => void, callback: (error?: Error | null) => void): void {
		let finished = false;
		const finish = (error?: Error | null) => {
			// Target close/destroy may race its eventual write callback.
			if (finished) return;
			finished = true;
			this.#pending = undefined;
			callback(error);
		};
		const start = () => {
			try { write(this.#target!, finish); }
			catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
		};
		this.#pending = { start, finish };
		if (this.#target) start();
	}

	override _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
		this.#forward((target, done) => { target.write(chunk, encoding, done); }, callback);
	}

	override _final(callback: (error?: Error | null) => void): void {
		this.#forward((target, done) => { target.end(done); }, callback);
	}

	override _destroy(error: Error | null, callback: (error: Error | null) => void): void {
		this.#pending?.finish(error ?? new Error("owned process stdin closed"));
		this.#target?.destroy();
		callback(error);
	}
}

/** Synchronous ChildProcess subset. Job-backed `close` includes pipe drain and
 * cleanup; use onOwnedProcessSettled to preserve exit-based non-job behavior. */
export function spawnOwnedProcess(file: string, args: string[], options: OwnedSpawnOptions = {}): OwnedProcess {
	const { log, ...baseOptions } = options;
	const spawnOptions = { ...baseOptions, detached: process.platform !== "win32", shell: false, windowsHide: true, stdio: options.stdio ?? ("pipe" as const) };
	if (process.platform !== "win32") return spawn(file, args, spawnOptions) as ChildProcess & OwnedProcess;
	const child = new EventEmitter() as OwnedProcess;
	const sources: Readable[] = [];
	const stdout = new PassThrough(), stderr = new PassThrough();
	const stdin = Array.isArray(options.stdio) && options.stdio[0] === "ignore" ? null : new OwnedStdin();
	Object.assign(child, { pid: undefined, stdin, stdout, stderr, exitCode: null, signalCode: null });
	let job: LaunchedJob | undefined;
	Object.defineProperty(child, "jobBacked", { get: () => job !== undefined });
	let fallback: ChildProcess | undefined;
	let cleanup: Promise<void> | undefined;
	let cancelled = false, fenced = false, leaderExited = false, settled = false;
	let terminationTimeout = 3_000;
	let resolveClosed!: () => void;
	const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
	let closeEmitted = false;
	const notify = (event: string, ...values: unknown[]) => { if (!fenced) child.emit(event, ...values); };
	const warn = (message: string, data?: unknown) => { if (!fenced) emitLifecycle(() => log ? log(message, data) : console.warn(`[antigravity-bridge] ${message}`, data)); };
	// Match ChildProcess's next-tick flushStdio after exit: an unread pipe
	// must not prevent close forever (readable 'end' requires consumption).
	const flushStdio = () => process.nextTick(() => { stdout.resume(); stderr.resume(); });
	const close = () => {
		if (!closeEmitted && leaderExited && settled && stdout.readableEnded && stderr.readableEnded) {
			closeEmitted = true;
			notify("close", child.exitCode, child.signalCode);
			resolveClosed();
		}
	};
	stdout.once("end", close);
	stderr.once("end", close);
	const cleanJob = (): Promise<void> => cleanup ??= (async () => {
		if (!job) return;
		await job.terminate(terminationTimeout);
		await job.release();
	})();
	const attach = (source: Readable, target: PassThrough) => {
		sources.push(source);
		source.on("error", (error) => { if (!fenced) target.destroy(error); });
		source.once("close", () => target.end());
		if (fenced) source.resume();
		else source.pipe(target);
	};
	const attachStdin = (target: Writable) => {
		if (stdin) stdin.attach(target);
		else {
			// The Job still supplies a pipe when the public stdin is ignored.
			target.on("error", () => {});
			target.end();
		}
	};
	const failed = (error: unknown) => {
		child.exitCode = -1;
		leaderExited = true; settled = true;
		if (!job) { stdout.end(); stderr.end(); }
		stdin?.destroy();
		notify("error", error);
		// A failed launch has no exit event. Helper death may still leave
		// buffered pipe data: only the source streams may end those targets.
		flushStdio();
		close();
	};
	const launched = Promise.resolve().then(async () => {
		try {
			if (cancelled) return;
			const cwd = options.cwd ?? process.cwd(), env = options.env ?? process.env;
			const executable = resolveWindowsExecutable(file, cwd, env);
			try {
				job = await launchInJob({ file: executable, args, cwd, env });
			} catch (error) {
				if (cancelled) return;
				if (!(error instanceof JobLauncherUnavailable)) throw error;
				warn("job-launcher-unavailable: falling back to leader-only termination", { error: error.message });
				if (cancelled) return;
				fallback = spawn(file, args, spawnOptions);
				child.pid = fallback.pid;
				if (fallback.stdout) attach(fallback.stdout, stdout);
				if (fallback.stderr) attach(fallback.stderr, stderr);
				if (fallback.stdin) attachStdin(fallback.stdin);
				fallback.on("spawn", () => notify("spawn"));
				fallback.on("error", failed);
				fallback.on("exit", (code, signal) => {
					child.exitCode = code; child.signalCode = signal; leaderExited = true;
					notify("exit", code, signal);
					flushStdio();
				});
				fallback.on("close", () => { settled = true; close(); });
				return;
			}
			child.pid = job.pid;
			attach(job.stdout, stdout); attach(job.stderr, stderr);
			attachStdin(job.stdin);
			notify("spawn");
			void job.exited.then(async ({ code }) => {
				child.exitCode = code; leaderExited = true;
				notify("exit", code, null);
				flushStdio();
				try { await cleanJob(); } catch (error) { warn("termination-warning", { pid: child.pid, reason: String(error) }); }
				settled = true; close();
			}, async (error: unknown) => {
				// Helper death closes the kill-on-close job; still attempt ownership cleanup.
				try { await cleanJob(); } catch { /* helper unavailable */ }
				failed(error);
			});
			if (cancelled) await cleanJob();
		} catch (error) { if (!cancelled) failed(error); }
	});
	const terminate = async (timeoutMs: number) => {
		cancelled = true; terminationTimeout = timeoutMs;
		await launched;
		if (job) await cleanJob();
		else if (fallback && fallback.exitCode === null && fallback.signalCode === null) {
			await new Promise<void>((resolve) => { fallback!.once("exit", () => resolve()); fallback!.kill(); });
		}
		// Only jobs guarantee descendant-held pipes will close. Await their
		// drain boundary; plain fallback termination stops at leader exit.
		// The termination helper bounds this wait and fences it on expiry.
		if (job && !fenced) await closed;
	};
	ownership.set(child, {
		terminate,
		fence: () => {
			fenced = true;
			resolveClosed();
			for (const source of sources) { source.unpipe(); source.resume(); }
			stdout.destroy(); stderr.destroy(); stdin?.destroy();
		},
	});
	child.kill = () => { void terminate(3_000).catch((error) => warn("termination-warning", { reason: String(error) })); return true; };
	return child;
}
