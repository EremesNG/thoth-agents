import fs from "node:fs";
import path from "node:path";
import { vi } from "vitest";

// A provider fixture must not read the operator's persisted configuration.
vi.mock("node:os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	const home = fs.mkdtempSync(path.join(actual.tmpdir(), "agy-test-home-"));
	return { ...actual, default: { ...actual, homedir: () => home }, homedir: () => home };
});

// Thin test-side redirection: all real process/stdio/exit behavior is retained.
// Only explicitly marked fixture programs are redirected; missing executables
// still take the real spawn-error path. Bare .mjs is not executable on Windows.
vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return {
		...actual,
		spawn: (command: string, args: string[] = [], options: import("node:child_process").SpawnOptions = {}) => {
			let fixture = command;
			if (command === "agy") {
				fixture = (process.env.PATH ?? "").split(path.delimiter)
					.map((dir) => path.join(dir, "agy.mjs"))
					.find((file) => fs.existsSync(file)) ?? command;
			}
			try {
				if (fixture.endsWith(".mjs") && (fs.readFileSync(fixture, "utf8").startsWith("// pi-test-node-fixture") ||
					fixture.endsWith(`${path.sep}fake-agy-web.mjs`))) {
					return actual.spawn(process.execPath, [fixture, ...args], options);
				}
			} catch { /* Non-fixture: preserve actual spawn behavior. */ }
			return actual.spawn(command, args, options);
		},
	};
});
