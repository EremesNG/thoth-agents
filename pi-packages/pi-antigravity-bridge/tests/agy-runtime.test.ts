import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { createAgyCommandResolver } from "../src/agy-runtime.js";
import { resolveWindowsExecutable } from "../src/windows-executable.js";

const roots: string[] = [];
afterEach(() => {
	vi.unstubAllEnvs();
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-runtime-"));
	roots.push(root);
	const binary = path.join(root, process.platform === "win32" ? "agy.exe" : "agy");
	fs.writeFileSync(binary, Buffer.from(process.platform === "win32" ? "4d5a0000" : "7f454c46", "hex"), { mode: 0o755 });
	return { root, binary, runtimeDir: path.join(root, "pi", "runtime") };
}

test.skipIf(process.platform !== "win32").each([
	"cwd only", "cwd before PATH", "PATHEXT shim before exe", "explicit extensionless", "relative extensionless",
	"explicit shim", "non-agy native", "com before exe",
])("runtime resolution matches the Windows launcher: %s", (scenario) => {
	const f = fixture();
	const cwd = path.join(f.root, "cwd"), bin = path.join(f.root, "bin");
	fs.mkdirSync(cwd); fs.mkdirSync(bin);
	const native = fs.readFileSync(f.binary);
	const cwdExe = path.join(cwd, "agy.exe"), pathExe = path.join(bin, "agy.exe");
	const shim = path.join(bin, "agy.cmd"), other = path.join(bin, "other.exe"), com = path.join(bin, "agy.com");
	fs.writeFileSync(shim, "@echo off\necho not-the-native-target\n");
	let command = "agy", expected = pathExe, eligible = true;
	if (scenario === "cwd only" || scenario === "cwd before PATH") {
		fs.writeFileSync(cwdExe, native);
		expected = cwdExe;
	}
	if (scenario !== "cwd only") fs.writeFileSync(pathExe, native);
	if (scenario === "explicit extensionless") command = path.join(bin, "agy");
	if (scenario === "relative extensionless") command = path.join("..", "bin", "agy");
	if (scenario === "explicit shim") { command = shim; expected = shim; eligible = false; }
	if (scenario === "non-agy native") { fs.writeFileSync(other, native); command = other; expected = other; eligible = false; }
	if (scenario === "com before exe") { fs.writeFileSync(com, native); expected = com; eligible = false; }
	vi.stubEnv("NoDefaultCurrentDirectoryInExePath", undefined);
	const env = { ORCA_PANE_KEY: "pane", PATH: bin, PATHEXT: scenario === "PATHEXT shim before exe" ? ".CMD;.EXE" : ".EXE;.CMD" };
	const launched = resolveWindowsExecutable(command, cwd, env);
	expect(path.normalize(launched)).toBe(path.normalize(expected));
	const resolve = createAgyCommandResolver({ env, runtimeDir: f.runtimeDir });
	const alias = resolve(command, env, cwd);
	if (!eligible) {
		expect(alias).toBe(command);
		expect(fs.existsSync(f.runtimeDir)).toBe(false);
	} else {
		expect(path.basename(alias)).toBe("ag-bridge-runtime.exe");
		expect(fs.statSync(alias, { bigint: true }).ino).toBe(fs.statSync(launched, { bigint: true }).ino);
		expect(fs.statSync(alias, { bigint: true }).dev).toBe(fs.statSync(launched, { bigint: true }).dev);
	}
});

test.skipIf(process.platform === "win32").each([
	["./agy", ""], ["agy", "."], ["agy", ""],
])("POSIX resolution respects the child cwd for %s with PATH=%s", (command, searchPath) => {
	const f = fixture();
	const env = { ORCA_PANE_KEY: "pane", PATH: searchPath };
	const alias = createAgyCommandResolver({ env, runtimeDir: f.runtimeDir })(command, env, f.root);
	expect(path.basename(alias)).toBe("ag-bridge-runtime");
	expect(fs.statSync(alias, { bigint: true }).ino).toBe(fs.statSync(f.binary, { bigint: true }).ino);
});

test("a missing cached alias fails open when re-publication is denied", () => {
	const f = fixture();
	const linkSync = vi.fn(fs.linkSync);
	const resolve = createAgyCommandResolver({ fs: { ...fs, linkSync }, env: { ORCA_PANE_KEY: "pane" }, runtimeDir: f.runtimeDir });
	const alias = resolve(f.binary);
	fs.unlinkSync(alias);
	linkSync.mockImplementation(() => { throw new Error("EACCES"); });
	expect(resolve(f.binary)).toBe(f.binary);
	expect(fs.existsSync(alias)).toBe(false);
});

test.each(["missing", "stale"])("a cached successful alias is revalidated when %s", (state) => {
	const f = fixture();
	const resolve = createAgyCommandResolver({ env: { ORCA_PANE_KEY: "pane" }, runtimeDir: f.runtimeDir });
	const alias = resolve(f.binary);
	fs.unlinkSync(alias);
	if (state === "stale") fs.writeFileSync(alias, "not the source inode");
	const resolved = resolve(f.binary);
	expect(resolved).toBe(alias);
	expect(fs.statSync(resolved, { bigint: true }).ino).toBe(fs.statSync(f.binary, { bigint: true }).ino);
	expect(fs.statSync(resolved, { bigint: true }).dev).toBe(fs.statSync(f.binary, { bigint: true }).dev);
});

test("an update publishes a different alias without replacing the old inode, even in one Pi process", () => {
	const f = fixture();
	const resolve = createAgyCommandResolver({ env: { ORCA_PANE_KEY: "pane" }, runtimeDir: f.runtimeDir });
	const oldAlias = resolve(f.binary);
	const oldIdentity = fs.statSync(oldAlias, { bigint: true }).ino;
	fs.renameSync(f.binary, `${f.binary}.old`);
	fs.writeFileSync(f.binary, fs.readFileSync(`${f.binary}.old`), { mode: 0o755 });
	const alias = resolve(f.binary);
	expect(alias).not.toBe(oldAlias);
	expect(fs.statSync(alias, { bigint: true }).ino).toBe(fs.statSync(f.binary, { bigint: true }).ino);
	expect(fs.statSync(oldAlias, { bigint: true }).ino).toBe(oldIdentity);
});

test("a hardlink failure fails open and is memoized without copying the executable", () => {
	const f = fixture();
	const linkSync = vi.fn(() => { throw new Error("EXDEV"); });
	const resolve = createAgyCommandResolver({ fs: { ...fs, linkSync }, env: { ORCA_PANE_KEY: "pane" }, runtimeDir: f.runtimeDir });
	expect(resolve(f.binary)).toBe(f.binary);
	expect(resolve(f.binary)).toBe(f.binary);
	expect(linkSync).toHaveBeenCalledTimes(1);
	expect(fs.readdirSync(f.runtimeDir).flatMap(dir => fs.readdirSync(path.join(f.runtimeDir, dir)))).toEqual([]);
});

test("a concurrent publisher that wins the rename is safely reused, including Windows in-use errors", () => {
	const f = fixture();
	const resolve = createAgyCommandResolver({
		env: { ORCA_PANE_KEY: "pane" }, runtimeDir: f.runtimeDir,
		fs: { ...fs, renameSync: (temporary, alias) => {
			fs.linkSync(f.binary, alias);
			throw new Error("EPERM: concurrent alias already running");
		} },
	});
	const alias = resolve(f.binary);
	expect(alias).not.toBe(f.binary);
	expect(fs.statSync(alias, { bigint: true }).ino).toBe(fs.statSync(f.binary, { bigint: true }).ino);
	expect(fs.readdirSync(path.dirname(alias))).toEqual([path.basename(alias)]);
});

test("an agy update during publication fails open and removes the temporary hardlink", () => {
	const f = fixture();
	const resolve = createAgyCommandResolver({
		env: { ORCA_PANE_KEY: "pane" }, runtimeDir: f.runtimeDir,
		fs: { ...fs, linkSync: (source, temporary) => {
			fs.linkSync(source, temporary);
			fs.renameSync(f.binary, `${f.binary}.old`);
			fs.writeFileSync(f.binary, fs.readFileSync(`${f.binary}.old`));
		} },
	});
	expect(resolve(f.binary)).toBe(f.binary);
	expect(fs.readdirSync(f.runtimeDir).flatMap(dir => fs.readdirSync(path.join(f.runtimeDir, dir)))).toEqual([]);
});

test.each(["other.exe", "agy.cmd", "agy.bat", "agy.ps1", "agy", "AGY.EXE"])("non-agy commands and script shims are unchanged: %s", (name) => {
	const f = fixture();
	const command = path.join(f.root, name);
	fs.unlinkSync(f.binary); // No native sibling for Windows extensionless lookup.
	fs.writeFileSync(command, "#!/bin/sh\necho shim\n", { mode: 0o755 });
	const resolve = createAgyCommandResolver({ env: { ORCA_PANE_KEY: "pane" }, runtimeDir: f.runtimeDir });
	expect(resolve(command)).toBe(command);
	expect(fs.existsSync(f.runtimeDir)).toBe(false);
});

test("a bare command is resolved through the launcher's PATH lookup", () => {
	const f = fixture();
	const resolve = createAgyCommandResolver({
		env: { ORCA_PANE_KEY: "pane", Path: f.root, PATHEXT: ".EXE;.CMD" }, runtimeDir: f.runtimeDir,
	});
	// PATH is case-insensitive on Windows; POSIX uses its exact spelling.
	const posixResolve = createAgyCommandResolver({ env: { ORCA_PANE_KEY: "pane", PATH: f.root }, runtimeDir: f.runtimeDir });
	const alias = (process.platform === "win32" ? resolve : posixResolve)("agy");
	expect(path.isAbsolute(alias)).toBe(true);
	expect(path.basename(alias)).toBe(process.platform === "win32" ? "ag-bridge-runtime.exe" : "ag-bridge-runtime");
	expect(fs.statSync(alias, { bigint: true }).ino).toBe(fs.statSync(f.binary, { bigint: true }).ino);
});

test.each(["ORCA_PANE_KEY", "ORCA_TERMINAL_HANDLE"])("%s publishes and reuses a neutral hardlink outside the install directory", (key) => {
	const f = fixture();
	const options = { env: { [key]: "pane" }, runtimeDir: f.runtimeDir };
	const resolve = createAgyCommandResolver(options);
	const alias = resolve(f.binary);
	expect(path.basename(alias)).toBe(process.platform === "win32" ? "ag-bridge-runtime.exe" : "ag-bridge-runtime");
	expect(alias.startsWith(f.runtimeDir + path.sep)).toBe(true);
	expect(fs.statSync(alias, { bigint: true }).ino).toBe(fs.statSync(f.binary, { bigint: true }).ino);
	expect(fs.statSync(alias, { bigint: true }).dev).toBe(fs.statSync(f.binary, { bigint: true }).dev);
	expect(resolve(f.binary)).toBe(alias);
	expect(createAgyCommandResolver(options)(f.binary)).toBe(alias);
	expect(fs.readdirSync(path.dirname(alias))).toEqual([path.basename(alias)]);
});

test("outside Orca the command is unchanged and no runtime directory is created", () => {
	const f = fixture();
	const resolve = createAgyCommandResolver({ env: {}, runtimeDir: f.runtimeDir });
	expect(resolve(f.binary)).toBe(f.binary);
	expect(resolve("agy")).toBe("agy");
	expect(fs.existsSync(f.runtimeDir)).toBe(false);
});
