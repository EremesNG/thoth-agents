import assert from "node:assert/strict";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TObject } from "typebox";
import { afterEach, test, vi } from "vitest";
import extension from "../extensions/index.js";
import { saveConfig } from "../src/config.js";

vi.mock("../src/models.js", async (original) => ({
	...await original<typeof import("../src/models.js")>(),
	loadModelCatalogRaw: async () => "",
	refreshModelCatalogIfNeeded: async () => {},
}));

afterEach(() => vi.unstubAllEnvs());

test("opt-in tool definitions stay within their serialized size budget", async () => {
	vi.stubEnv("AGY_ENGINE", "stream-json");
	vi.stubEnv("AGY_BIN", "/tool-budget/missing-agy");
	vi.stubEnv("AGY_BRIDGE_DISCOVERY", "private");
	vi.stubEnv("AGY_BRIDGE_TOOLS", "none");
	vi.stubEnv("AGY_ASK_TOOL", "1");
	vi.stubEnv("AGY_WEB_TOOLS", "0");
	saveConfig({ askTool: true, webTools: false, approvals: { gateMode: "off", mode: "deny" } });
	const tools: ToolDefinition<TObject>[] = [];
	const shutdown: Array<(...args: unknown[]) => unknown> = [];
	const pi = {
		registerTool: (tool: ToolDefinition<TObject>) => { tools.push(tool); },
		on: (name: string, handler: (...args: unknown[]) => unknown) => {
			if (name === "session_shutdown") shutdown.push(handler);
		},
		registerProvider() {}, registerCommand() {}, registerEntryRenderer() {},
		getAllTools: () => [], getActiveTools: () => [],
	} as unknown as ExtensionAPI;

	try {
		await extension(pi);
		assert.deepEqual(tools.map(tool => tool.name), ["AskAntigravity", "antigravity"]);
		const lengths = tools.map(({ name, description, parameters, promptSnippet, promptGuidelines }) => ({
			name,
			chars: JSON.stringify({ name, description, parameters, promptSnippet, promptGuidelines }).length,
		}));
		const total = lengths.reduce((sum, tool) => sum + tool.chars, 0);
		// Baseline: 4,434 chars. Compacted: 2,139, with 5% headroom.
		assert.ok(total <= 2_246, `Serialized tool definitions use ${total} chars: ${JSON.stringify(lengths)}`);
		assert.equal(tools[0].parameters.properties.effort, undefined, "thinking is the only effort-level parameter");
	} finally {
		for (const handler of shutdown) await handler({}, {});
	}
});
