import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { it } from "node:test";

it("names the minimum Pi version when the Anthropic catalog is empty", async (t) => {
	const entryUrl = new URL("../src/index.ts", import.meta.url).href;
	const hooks = registerHooks({
		resolve(specifier, context, nextResolve) {
			if (specifier === "@earendil-works/pi-ai/compat" && context.parentURL?.split("?")[0] === entryUrl) {
				return { url: "data:text/javascript,export function getModels() { return []; }", shortCircuit: true };
			}
			return nextResolve(specifier, context);
		},
	});
	let activate;
	try {
		({ default: activate } = await import("../src/index.js?empty-catalog"));
	} finally {
		hooks.deregister();
	}

	const errors = [];
	t.mock.method(console, "error", (message) => errors.push(message));
	activate({ on: () => {}, registerProvider: () => {}, registerTool: () => {} });
	assert.deepEqual(errors, [
		"claude-bridge: no models available from pi-ai's anthropic catalog — update @earendil-works/pi-ai (requires >=0.99.0)",
	]);
});
