import assert from "node:assert/strict";
import { test } from "vitest";
import { registerExitCleanup } from "../src/mcp-server.js";
import { withoutUnhandledRejections } from "./helpers/unhandled-rejections.js";

test("rejecting process exit and signal cleanup callbacks are contained", async () => {
	const before = new Set(process.listeners("exit"));
	const host = () => {};
	// A host listener prevents registerExitCleanup from re-raising the signal.
	process.on("SIGTERM", host);
	let calls = 0;
	const unregister = registerExitCleanup(async () => { calls++; throw new Error("cleanup sink failed"); }, {
		signals: ["SIGTERM"], hasHostListener: () => false,
	});
	try {
		await withoutUnhandledRejections(async () => {
			const exit = process.listeners("exit").find(listener => !before.has(listener))!;
			const signal = process.listeners("SIGTERM").find(listener => listener !== host)!;
			// Exercise the actual registered callbacks without exiting Vitest.
			exit(0);
			signal("SIGTERM");
			assert.equal(calls, 2);
		});
	} finally {
		unregister();
		process.removeListener("SIGTERM", host);
	}
});
