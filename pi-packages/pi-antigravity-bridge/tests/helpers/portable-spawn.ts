import fs from "node:fs";
import path from "node:path";
import { vi } from "vitest";

// A provider fixture must not read the operator's persisted configuration.
vi.mock("node:os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	const home = fs.mkdtempSync(path.join(actual.tmpdir(), "agy-test-home-"));
	return { ...actual, default: { ...actual, homedir: () => home }, homedir: () => home };
});

// Redirect only explicitly marked fixtures at both launch boundaries. Native
// Windows jobs bypass child_process.spawn; agent tests still run real jobs.
function fixtureCommand(command: string, args: string[]): [string, string[]] {
	let fixture = command;
	if (command === "agy") {
		fixture = (process.env.PATH ?? "").split(path.delimiter)
			.map((dir) => path.join(dir, "agy.mjs"))
			.find((file) => fs.existsSync(file)) ?? command;
	}
	try {
		if (fixture.endsWith(".mjs") && (fs.readFileSync(fixture, "utf8").startsWith("// pi-test-node-fixture") ||
			fixture.endsWith(`${path.sep}fake-agy-web.mjs`))) return [process.execPath, [fixture, ...args]];
	} catch { /* Non-fixture: preserve actual launch errors. */ }
	return [command, args];
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
