import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { expect, vi } from "vitest";

/** Native header only: launch tests intercept the OS boundary, never execute it. */
export function makeAgyRuntimeFixture({ bare = false }: { bare?: boolean } = {}) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-runtime-spawn-"));
	const binary = path.join(root, process.platform === "win32" ? "agy.exe" : "agy");
	fs.writeFileSync(binary, Buffer.from(process.platform === "win32" ? "4d5a0000" : "7f454c46", "hex"), { mode: 0o755 });
	const home = vi.spyOn(os, "homedir").mockReturnValue(root);
	vi.stubEnv("ORCA_PANE_KEY", "test-pane");
	vi.stubEnv("AGY_BIN", bare ? "agy" : binary);
	if (bare) {
		vi.stubEnv("PATH", "");
		vi.stubEnv("NoDefaultCurrentDirectoryInExePath", undefined);
	}
	return {
		root, binary,
		assertAlias(command: unknown) {
			expect(typeof command).toBe("string");
			const alias = command as string;
			expect(path.basename(alias)).toBe(process.platform === "win32" ? "ag-bridge-runtime.exe" : "ag-bridge-runtime");
			expect(alias.startsWith(path.join(root, ".pi", "agent", "antigravity-bridge", "runtime") + path.sep)).toBe(true);
			expect(fs.statSync(alias, { bigint: true }).ino).toBe(fs.statSync(binary, { bigint: true }).ino);
		},
		cleanup() {
			home.mockRestore();
			vi.unstubAllEnvs();
			fs.rmSync(root, { recursive: true, force: true });
		},
	};
}

export function completedChild(output: string): childProcess.ChildProcessWithoutNullStreams {
	const child = Object.assign(new EventEmitter(), {
		stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
		exitCode: null as number | null, signalCode: null,
		kill: vi.fn(), unref: vi.fn(),
	});
	queueMicrotask(() => {
		child.stdout.write(output);
		child.exitCode = 0;
		child.emit("exit", 0);
		child.emit("close", 0);
	});
	return child as unknown as childProcess.ChildProcessWithoutNullStreams;
}
