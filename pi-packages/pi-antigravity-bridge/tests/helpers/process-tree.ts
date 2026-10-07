import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { makeNodeFixture } from "./node-fixture.js";

export function pidAlive(pid: number): boolean {
	try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Real Node descendants, with readiness before the deadline or abort. The
 * grandchild ignores TERM on POSIX to exercise escalation after parent exit. */
export function makeProcessTreeFixture(output = ""): {
	bin: string;
	ready: (expectAlive?: boolean) => Promise<number[]>;
	cleanup: () => void;
} {
	const bin = makeNodeFixture("");
	const record = path.join(path.dirname(bin), "pids.json");
	fs.writeFileSync(bin, `// pi-test-node-fixture
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const child = spawn(process.execPath, ['-e', ${JSON.stringify("process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000);")}], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
child.once('message', () => {
  writeFileSync(${JSON.stringify(record)}, JSON.stringify([process.pid, child.pid]));
  process.stdout.write(${JSON.stringify(output)});
});
setInterval(() => {}, 1000);
`);
	return {
		bin,
		async ready(expectAlive = true) {
			const deadline = Date.now() + 5_000;
			while (!fs.existsSync(record) && Date.now() < deadline) await delay(25);
			assert.ok(fs.existsSync(record), "process tree did not become ready");
			const pids = JSON.parse(fs.readFileSync(record, "utf8")) as number[];
			assert.equal(pids.length, 2);
			assert.ok(pids.every((pid) => Number.isInteger(pid) && pid > 0), "fixture must record valid process IDs");
			if (expectAlive) assert.ok(pids.every(pidAlive), "both fixture processes must start alive");
			return pids;
		},
		cleanup() {
			if (fs.existsSync(record)) {
				const pids = JSON.parse(fs.readFileSync(record, "utf8")) as number[];
				if (process.platform === "win32" && pidAlive(pids[0])) {
					spawnSync("taskkill", ["/PID", String(pids[0]), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 5_000 });
				}
				for (const pid of pids) {
					try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
				}
			}
			fs.rmSync(path.dirname(bin), { recursive: true, force: true });
		},
	};
}

export async function assertTreeExited(pids: number[]): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (pids.some(pidAlive) && Date.now() < deadline) await delay(25);
	assert.deepEqual(pids.filter(pidAlive), [], "no parent or grandchild may survive termination");
}

export async function within<T>(run: Promise<T>): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([run, new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error("operation did not settle after termination")), 5_000);
		})]);
	} finally {
		clearTimeout(timer);
	}
}
