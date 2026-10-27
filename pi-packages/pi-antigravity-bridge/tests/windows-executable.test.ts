import assert from "node:assert/strict";
import { once } from "node:events";
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import { test, vi } from "vitest";
import { resolveWindowsExecutable } from "../src/windows-executable.js";
import { spawnOwnedProcess } from "../src/owned-process.js";

const windows = test.skipIf(process.platform !== "win32");
windows("Windows resolver differential matrix matches the executable Node spawn runs", async () => {
	// This matrix supplies native temp executables and must observe Node itself,
	// not the portable fake-agy redirection used by provider tests.
	const { spawn } = await vi.importActual<typeof import("node:child_process")>("node:child_process");
	const root = mkdtempSync(join(tmpdir(), "agy-resolver-"));
	const cwd = join(root, "cwd"), path = join(root, "path;quoted"), relative = join(cwd, "relative");
	for (const dir of [cwd, path, relative]) mkdirSync(dir);
	const copy = (directory: string, name: string) => copyFileSync(process.execPath, join(directory, name));
	copy(path, "bare.exe"); copy(path, "agy.exe"); copy(cwd, "agy.exe");
	copy(path, "exact.bin"); copy(path, "exact.bin.com");
	copy(path, "priority.com"); copy(path, "priority.exe");
	copy(relative, "relative.exe");
	copy(path, "ignored");
	mkdirSync(join(path, "directory.exe"));
	writeFileSync(join(path, "bad.exe"), "not a PE executable");
	const old = process.env.NoDefaultCurrentDirectoryInExePath;
	const env = { ...process.env, PATH: `"${path}"`, Path: undefined };
	const run = async (file: string, childEnv = env) => {
		const child = spawn(file, ["-e", "console.log(process.execPath)"], { cwd, env: childEnv, windowsHide: true, shell: false });
		let output = "";
		child.stdout!.on("data", (chunk) => { output += String(chunk); });
		await once(child, "close");
		return win32.normalize(output.trim()).toLowerCase();
	};
	try {
		delete process.env.NoDefaultCurrentDirectoryInExePath;
		for (const file of ["bare", process.execPath.replace(/\.exe$/i, ""), "exact.bin", "priority", "agy.", ".\\agy.", ".\\relative\\relative", "agy"]) {
			assert.equal(win32.normalize(resolveWindowsExecutable(file, cwd, env)).toLowerCase(), await run(file), file);
		}
		process.env.NoDefaultCurrentDirectoryInExePath = "1";
		assert.equal(win32.normalize(resolveWindowsExecutable("agy", cwd, env)).toLowerCase(), await run("agy"));
		assert.equal(await run("agy"), join(path, "agy.exe").toLowerCase());
		const relativeEnv = { ...env, PATH: "relative" };
		assert.equal(win32.normalize(resolveWindowsExecutable("relative", cwd, relativeEnv)).toLowerCase(), await run("relative", relativeEnv));
		for (const file of ["ignored", "directory", "missing"]) {
			assert.throws(() => resolveWindowsExecutable(file, cwd, env), { code: "ENOENT" });
			await assert.rejects(run(file), { code: "ENOENT" });
		}
		assert.equal(win32.normalize(resolveWindowsExecutable("bad", cwd, env)), join(path, "bad.exe"));
	} finally {
		if (old === undefined) delete process.env.NoDefaultCurrentDirectoryInExePath; else process.env.NoDefaultCurrentDirectoryInExePath = old;
		rmSync(root, { recursive: true, force: true });
	}
}, 30_000);

windows("missing owned executable asynchronously emits ENOENT then close, without spawn or exit", async () => {
	const child = spawnOwnedProcess("thoth-nonexistent-executable-67812", []);
	const events: string[] = [];
	child.on("spawn", () => events.push("spawn")); child.on("exit", () => events.push("exit"));
	const closed = new Promise<void>((resolve) => child.once("close", () => { events.push("close"); resolve(); }));
	const error = await new Promise<NodeJS.ErrnoException>((resolve) => child.once("error", (error) => { events.push("error"); resolve(error); }));
	await closed;
	assert.equal(error.code, "ENOENT");
	assert.deepEqual(events, ["error", "close"]);
});
