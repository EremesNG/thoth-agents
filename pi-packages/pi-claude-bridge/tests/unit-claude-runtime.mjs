import assert from "node:assert/strict";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { test } from "node:test";
import { createAuxiliaryExecutableResolver, createClaudeCommandResolver, resolveSdkClaudeExecutable } from "../src/claude-runtime.js";

const orca = { ORCA_PANE_KEY: "pane" };

function fixture(t, name = "claude.exe") {
	const dir = fs.mkdtempSync(join(tmpdir(), "bridge-runtime-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const command = join(dir, name);
	fs.writeFileSync(command, "current binary");
	return { dir, command, alias: join(dir, `cc-bridge-runtime${extname(name)}`) };
}

test("SDK native resolution uses its exact platform packages and Linux libc fallback order", () => {
	for (const [platform, arch, preferMusl, candidates] of [
		["win32", "x64", false, ["@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe"]],
		["win32", "arm64", false, ["@anthropic-ai/claude-agent-sdk-win32-arm64/claude.exe"]],
		["darwin", "arm64", false, ["@anthropic-ai/claude-agent-sdk-darwin-arm64/claude"]],
		["darwin", "x64", false, ["@anthropic-ai/claude-agent-sdk-darwin-x64/claude"]],
		["android", "arm64", false, ["@anthropic-ai/claude-agent-sdk-linux-arm64-android/claude"]],
		["linux", "x64", false, ["@anthropic-ai/claude-agent-sdk-linux-x64/claude", "@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude"]],
		["linux", "arm64", true, ["@anthropic-ai/claude-agent-sdk-linux-arm64-musl/claude", "@anthropic-ai/claude-agent-sdk-linux-arm64/claude"]],
	]) {
		const attempts = [];
		const resolved = resolveSdkClaudeExecutable({ platform, arch, preferMusl,
			resolve: (specifier) => { attempts.push(specifier); return specifier; },
			exists: (path) => path === candidates.at(-1),
		});
		assert.equal(resolved, candidates.at(-1));
		assert.deepEqual(attempts, candidates);
	}
	assert.equal(resolveSdkClaudeExecutable({ resolve() { throw new Error("optional binary missing"); } }), undefined);
});

test("auxiliary calls inside Orca resolve and memoize the SDK's default native binary", (t) => {
	const { command, alias } = fixture(t);
	let resolutions = 0;
	const resolve = createAuxiliaryExecutableResolver({ env: orca, resolveDefaultExecutable: () => { resolutions++; return command; } });
	assert.equal(resolve(), alias);
	assert.equal(resolve(), alias);
	assert.equal(resolutions, 1);
	assert.equal(fs.statSync(alias, { bigint: true }).ino, fs.statSync(command, { bigint: true }).ino);
});

test("auxiliary options outside Orca are unchanged without default resolution or filesystem work", () => {
	let work = 0;
	const resolve = createAuxiliaryExecutableResolver({ env: {},
		resolveDefaultExecutable() { work++; throw new Error("not needed"); },
		fs: new Proxy({}, { get() { return () => { work++; throw new Error("not needed"); }; } }),
	});
	assert.equal(resolve(), undefined);
	assert.equal(resolve("configured.exe"), "configured.exe");
	assert.equal(work, 0);
});

test("auxiliary alias or default-resolution failures leave the original SDK options unchanged", (t) => {
	const { command } = fixture(t);
	const resolve = createAuxiliaryExecutableResolver({ env: orca, resolveDefaultExecutable: () => command, fs: {
		...fs, linkSync() { throw new Error("hardlinks unavailable"); },
	} });
	assert.equal(resolve(), undefined, "do not pin an unaliased SDK default");
	assert.equal(resolve(command), command, "retain an explicit original path");
	let attempts = 0;
	const missing = createAuxiliaryExecutableResolver({ env: orca, resolveDefaultExecutable() { attempts++; throw new Error("SDK optional package unavailable"); } });
	assert.equal(missing(), undefined);
	assert.equal(missing(), undefined);
	assert.equal(attempts, 1);
	assert.equal(missing("/custom/cli.js"), "/custom/cli.js", "JS executables stay on the SDK's runtime path");
});

test("Orca claude.exe resolves to a neutral hardlink sibling", (t) => {
	const { command, alias } = fixture(t);
	const resolve = createClaudeCommandResolver({ env: orca });
	assert.equal(resolve(command), alias);
	const original = fs.statSync(command, { bigint: true });
	const linked = fs.statSync(alias, { bigint: true });
	assert.equal(linked.dev, original.dev);
	assert.equal(linked.ino, original.ino);
});

test("an existing valid hardlink alias is reused without writes", (t) => {
	const { command, alias } = fixture(t);
	fs.linkSync(command, alias);
	let writes = 0;
	const resolve = createClaudeCommandResolver({ env: orca, fs: {
		...fs,
		linkSync(...args) { writes++; fs.linkSync(...args); },
	} });
	assert.equal(resolve(command), alias);
	assert.equal(writes, 0);
});

test("a stale alias is replaced atomically by a current hardlink sibling", (t) => {
	const { command, alias, dir } = fixture(t);
	fs.writeFileSync(alias, "obsolete build");
	const past = new Date("2020-01-01");
	fs.utimesSync(alias, past, past);
	const resolve = createClaudeCommandResolver({ env: orca, fs: {
		...fs,
		renameSync(from, to) {
			assert.equal(fs.readFileSync(alias, "utf8"), "obsolete build", "old alias stays intact until publication");
			assert.equal(to, alias);
			assert.equal(dirname(from), dir, "temporary file is a sibling");
			fs.renameSync(from, to);
		},
	} });
	assert.equal(resolve(command), alias);
	assert.equal(fs.readFileSync(alias, "utf8"), "current binary");
	assert.equal(fs.statSync(alias, { bigint: true }).ino, fs.statSync(command, { bigint: true }).ino);
	assert.deepEqual(fs.readdirSync(dir).sort(), ["cc-bridge-runtime.exe", "claude.exe"]);
});

test("non-Claude commands are unchanged even inside Orca", (t) => {
	for (const name of ["node.exe", "bun", "claude-code.exe", "not-claude.exe", "claude.cmd"]) {
		const { command, dir } = fixture(t, name);
		assert.equal(createClaudeCommandResolver({ env: orca })(command), command);
		assert.deepEqual(fs.readdirSync(dir), [name]);
	}
});

test("outside Orca and empty Orca markers leave commands unchanged with no filesystem work", (t) => {
	const { command } = fixture(t);
	for (const env of [{}, { ORCA_PANE_KEY: "", ORCA_TERMINAL_HANDLE: "" }]) {
		let reads = 0;
		const resolve = createClaudeCommandResolver({ env, fs: {
			...fs,
			statSync() { reads++; throw new Error("unexpected filesystem work"); },
		} });
		assert.equal(resolve(command), command);
		assert.equal(reads, 0);
	}
});

test("Orca terminal handles and case-insensitive Claude basenames retain the original extension", (t) => {
	for (const name of ["claude", "CLAUDE.EXE"]) {
		const { command, alias } = fixture(t, name);
		assert.equal(createClaudeCommandResolver({ env: { ORCA_TERMINAL_HANDLE: "terminal" } })(command), alias);
	}
});

test("successful and failed command resolutions are memoized without later filesystem work", (t) => {
	for (const fail of [false, true]) {
		const { command, alias } = fixture(t);
		const calls = [];
		const trackedFs = new Proxy({ ...fs }, { get(target, name) {
			return (...args) => {
				calls.push(name);
				if (fail) throw new Error("filesystem unavailable");
				return target[name](...args);
			};
		} });
		const resolve = createClaudeCommandResolver({ env: orca, fs: trackedFs });
		assert.equal(resolve(command), fail ? command : alias);
		assert.ok(calls.length > 0);
		calls.length = 0;
		assert.equal(resolve(command), fail ? command : alias);
		assert.deepEqual(calls, []);
	}
});

test("a concurrent valid alias wins even when this process cannot rename over it", (t) => {
	const { command, alias, dir } = fixture(t);
	const resolve = createClaudeCommandResolver({ env: orca, fs: {
		...fs,
		renameSync() {
			fs.linkSync(command, alias);
			throw new Error("another process published and started the alias");
		},
	} });
	assert.equal(resolve(command), alias);
	assert.deepEqual(fs.readdirSync(dir).sort(), ["cc-bridge-runtime.exe", "claude.exe"]);
});

test("a binary updated during alias creation is not published or launched stale", (t) => {
	const { command, dir } = fixture(t);
	const replacement = join(dir, "updated.exe");
	fs.writeFileSync(replacement, "updated binary with different bytes");
	const resolve = createClaudeCommandResolver({ env: orca, fs: {
		...fs,
		linkSync(from, to) {
			fs.linkSync(from, to);
			fs.renameSync(replacement, command);
		},
	} });
	assert.equal(resolve(command), command);
	assert.deepEqual(fs.readdirSync(dir), ["claude.exe"]);
});

test("bare and relative Claude commands are not guessed from cwd or PATH", () => {
	let operations = 0;
	const unavailableFs = new Proxy({}, { get() {
		return () => { operations++; throw new Error("no filesystem access expected"); };
	} });
	const resolve = createClaudeCommandResolver({ env: orca, fs: unavailableFs });
	for (const command of ["claude", "claude.exe", "./claude.exe", "../bin/claude.exe"]) {
		assert.equal(resolve(command), command);
	}
	assert.equal(operations, 0);
});

for (const mtime of ["preserved", "older"]) {
	for (const locked of [false, true]) {
		test(`an equal-size source replacement with ${mtime} mtime ${locked ? "falls back when the alias is locked" : "recreates the hardlink alias"}`, (t) => {
			const { command, alias, dir } = fixture(t);
			const originalTime = new Date("2020-01-02");
			fs.utimesSync(command, originalTime, originalTime);
			fs.linkSync(command, alias);
			const replacement = join(dir, "replacement.exe");
			fs.writeFileSync(replacement, "updated binary");
			const replacementTime = mtime === "older" ? new Date("2020-01-01") : originalTime;
			fs.utimesSync(replacement, replacementTime, replacementTime);
			fs.renameSync(replacement, command);
			assert.equal(fs.statSync(command).size, fs.statSync(alias).size);
			assert.notEqual(fs.statSync(command, { bigint: true }).ino, fs.statSync(alias, { bigint: true }).ino);
			const resolve = createClaudeCommandResolver({ env: orca, fs: {
				...fs,
				renameSync(from, to) {
					if (locked) throw new Error("alias in use");
					fs.renameSync(from, to);
				},
			} });
			assert.equal(resolve(command), locked ? command : alias);
			if (!locked) {
				assert.equal(fs.statSync(alias, { bigint: true }).ino, fs.statSync(command, { bigint: true }).ino);
				assert.equal(fs.readFileSync(alias, "utf8"), "updated binary");
			}
			assert.deepEqual(fs.readdirSync(dir).sort(), ["cc-bridge-runtime.exe", "claude.exe"]);
		});
	}
}

for (const locked of [false, true]) {
	test(`an existing non-hardlink alias is ${locked ? "never used when replacement fails" : "replaced even with identical size and newer mtime"}`, (t) => {
		const { command, alias } = fixture(t);
		fs.copyFileSync(command, alias);
		const future = new Date("2040-01-01");
		fs.utimesSync(alias, future, future);
		const resolve = createClaudeCommandResolver({ env: orca, fs: {
			...fs,
			renameSync(from, to) {
				if (locked) throw new Error("alias in use");
				fs.renameSync(from, to);
			},
		} });
		assert.equal(resolve(command), locked ? command : alias);
		if (!locked) assert.equal(fs.statSync(alias, { bigint: true }).ino, fs.statSync(command, { bigint: true }).ino);
	});
}

test("a new process resolution refreshes a hardlink after the original executable was replaced", (t) => {
	const { command, alias, dir } = fixture(t);
	fs.linkSync(command, alias);
	const replacement = join(dir, "replacement.exe");
	fs.writeFileSync(replacement, "newer installed binary");
	fs.renameSync(replacement, command);
	assert.equal(createClaudeCommandResolver({ env: orca })(command), alias);
	assert.equal(fs.readFileSync(alias, "utf8"), "newer installed binary");
});

for (const failure of ["statSync", "renameSync"]) {
	test(`${failure} failure falls back to the original and cleans up temporary files`, (t) => {
		const { command, dir } = fixture(t);
		const resolve = createClaudeCommandResolver({ env: orca, fs: {
			...fs,
			[failure]() { throw new Error("filesystem unavailable"); },
		} });
		assert.equal(resolve(command), command);
		assert.deepEqual(fs.readdirSync(dir), ["claude.exe"]);
	});
}

test("hardlink failure returns the original command without copying or throwing", (t) => {
	const { command, dir } = fixture(t);
	let copies = 0;
	const resolve = createClaudeCommandResolver({ env: orca, fs: {
		...fs,
		linkSync() { throw new Error("hardlinks unavailable"); },
		copyFileSync(...args) { copies++; fs.copyFileSync(...args); },
	} });
	assert.equal(resolve(command), command);
	assert.equal(copies, 0);
	assert.deepEqual(fs.readdirSync(dir), ["claude.exe"]);
});
