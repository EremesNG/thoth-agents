import fs from "node:fs";
import path from "node:path";
import { vi } from "vitest";

// StreamDriver honors AGY_BIN and the Orca runtime resolver scans PATH.
// Keep inherited operator settings from bypassing the fake-agy launch seam.
delete process.env.AGY_BIN;
delete process.env.ORCA_PANE_KEY;
delete process.env.ORCA_TERMINAL_HANDLE;

// A provider fixture must not read the operator's persisted configuration.
vi.mock("node:os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	const home = fs.mkdtempSync(path.join(actual.tmpdir(), "agy-test-home-"));
	return { ...actual, default: { ...actual, homedir: () => home }, homedir: () => home };
});

// Redirect only explicitly marked fixtures at both launch boundaries. Never
// let an unprovided bare agy fixture reach the operator's PATH. Native Windows
// jobs bypass child_process.spawn; agent tests still run real jobs.
function fixtureCommand(command: string, args: string[]): [string, string[]] {
	let fixture = command;
	if (command === "agy") {
		fixture = (process.env.PATH ?? "").split(path.delimiter)
			.map((dir) => path.join(dir, "agy.mjs"))
			.find((file) => fs.existsSync(file)) ?? path.join(import.meta.dirname, "missing-agy-fixture");
	}
	try {
		if (fixture.endsWith(".mjs") && (fs.readFileSync(fixture, "utf8").startsWith("// pi-test-node-fixture") ||
			fixture.endsWith(`${path.sep}fake-agy-web.mjs`))) return [process.execPath, [fixture, ...args]];
	} catch { /* Non-fixture: preserve actual launch errors. */ }
	return [fixture, args];
}
vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return { ...actual, spawn: (command: string, args: string[] = [], options = {}) =>
		actual.spawn(...fixtureCommand(command, args), options) };
});
vi.mock("../../src/owned-process.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../src/owned-process.js")>();
	return { ...actual, spawnOwnedProcess: (command: string, args: string[], options: import("../../src/owned-process.js").OwnedSpawnOptions = {}) =>
		actual.spawnOwnedProcess(...fixtureCommand(command, args), options) };
});
