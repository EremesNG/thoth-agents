import { spawn, type ChildProcess } from "node:child_process";

export interface TerminationOptions {
	timeoutMs?: number;
	log?: (message: string, data?: unknown) => void;
}

/** Kill an owned process tree and await exit, never indefinitely. POSIX
 * callers spawn detached children so negative PIDs address the process group. */
export function terminateProcessTree(child: ChildProcess, opts: TerminationOptions = {}): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
	const timeoutMs = Math.max(1, opts.timeoutMs ?? 3_000);
	const warn = (reason: string) => {
		const data = { pid: child.pid, reason, timeoutMs };
		if (opts.log) opts.log("termination-warning", data);
		else console.warn("[antigravity-bridge] termination-warning", data);
	};
	return new Promise<void>((resolve) => {
		let exited = false;
		let signalled = false;
		let done = false;
		let escalation: NodeJS.Timeout | undefined;
		let taskkill: ChildProcess | undefined;
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
			try { taskkill?.kill(); } catch { /* best effort */ }
			finish();
		}, timeoutMs);
		child.once("exit", onExit);
		if (process.platform === "win32" && child.pid) {
			// No shell: argv is passed directly, including paths with spaces.
			taskkill = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, shell: false, stdio: "ignore" });
			taskkill.once("error", (error) => {
				warn(`taskkill failed: ${error.message}`);
				try { child.kill("SIGTERM"); } catch { /* already gone */ }
				signalled = true;
				check();
			});
			taskkill.once("close", (code) => {
				if (code !== 0 && !exited && !done) warn(`taskkill exited with status ${code}`);
				signalled = true;
				check();
			});
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
