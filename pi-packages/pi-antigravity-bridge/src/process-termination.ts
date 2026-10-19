import { type ChildProcess } from "node:child_process";
import { emitLifecycle } from "./lifecycle.js";
import { ownedProcessControl, type OwnedProcess } from "./owned-process.js";

export interface TerminationOptions {
	timeoutMs?: number;
	log?: (message: string, data?: unknown) => void;
}

/** Kill an owned process tree and await exit, never indefinitely. POSIX
 * callers spawn detached children so negative PIDs address the process group. */
export function terminateProcessTree(child: ChildProcess | OwnedProcess, opts: TerminationOptions = {}): Promise<void> {
	const owned = ownedProcessControl(child);
	if (!owned && (child.exitCode !== null || child.signalCode !== null)) return Promise.resolve();
	const timeoutMs = Math.max(1, opts.timeoutMs ?? 3_000);
	const warn = (reason: string) => {
		const data = { pid: child.pid, reason, timeoutMs };
		emitLifecycle(() => {
			if (opts.log) return opts.log("termination-warning", data);
			console.warn("[antigravity-bridge] termination-warning", data);
		});
	};
	if (owned) {
		return new Promise<void>((resolve) => {
			let done = false;
			const finish = () => { done = true; clearTimeout(deadline); resolve(); };
			const deadline = setTimeout(() => {
				owned.fence();
				warn("gave up waiting for process-tree termination");
				finish();
			}, timeoutMs);
			void owned.terminate(timeoutMs).then(finish, (error: unknown) => {
				if (done) return;
				warn(`job termination failed: ${String(error)}`);
				owned.fence(); finish();
			});
		});
	}
	return new Promise<void>((resolve) => {
		let exited = false;
		let signalled = false;
		let done = false;
		let escalation: NodeJS.Timeout | undefined;
		const finish = () => {
			if (done) return;
			done = true;
			clearTimeout(deadline);
			if (escalation) clearTimeout(escalation);
			child.removeListener("exit", onExit);
			resolve();
		};
		const check = () => { if (exited && signalled) finish(); };
		const onExit = () => { exited = true; check(); };
		const deadline = setTimeout(() => {
			warn("gave up waiting for process-tree termination");
			finish();
		}, timeoutMs);
		child.once("exit", onExit);
		if (process.platform === "win32") {
			// Only the owned process handle: never discover descendants by PID.
			try { child.kill("SIGTERM"); } catch { /* already gone */ }
			signalled = true;
			check();
		} else if (child.pid) {
			try { process.kill(-child.pid, "SIGTERM"); } catch { /* already gone */ }
			// Keep the group escalation even if the leader exits first: a
			// descendant may ignore SIGTERM. This preserves stream-json behavior.
			escalation = setTimeout(() => {
				try { process.kill(-child.pid!, "SIGKILL"); } catch { /* already gone */ }
				signalled = true;
				check();
			}, 750);
		} else {
			try { child.kill("SIGTERM"); } catch { /* spawn failed */ }
			signalled = true;
			check();
		}
	});
}
