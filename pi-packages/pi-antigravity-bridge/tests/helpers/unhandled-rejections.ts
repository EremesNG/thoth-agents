import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";

/** Rejections are reported after the microtask queue, not when a sink returns. */
export async function withoutUnhandledRejections(run: () => Promise<void>): Promise<void> {
	const rejections: unknown[] = [];
	const onRejection = (reason: unknown) => { rejections.push(reason); };
	process.on("unhandledRejection", onRejection);
	try {
		await run();
		await setImmediate();
		assert.deepEqual(rejections, [], "callback sinks must not leak unhandled rejections");
	} finally {
		process.removeListener("unhandledRejection", onRejection);
	}
}
