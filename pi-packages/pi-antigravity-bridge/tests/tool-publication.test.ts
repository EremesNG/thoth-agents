import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getPublishedToolDefinition, getToolDefinitionRegistryVersion, type ToolDefinitionLike } from "@thoth-agents/pi-core";
import extension from "../extensions/index.js";
import { saveConfig } from "../src/config.js";

vi.mock("../src/models.js", async (original) => ({
	...await original<typeof import("../src/models.js")>(),
	loadModelCatalogRaw: async () => "",
	refreshModelCatalogIfNeeded: async () => {},
}));
vi.mock("../src/patch-cleanup.js", () => ({ patchStatus: () => ({ present: false }), restorePatch: () => ({}) }));

const sessions: Array<{ emit: (name: string) => Promise<void> }> = [];
afterEach(async () => {
	for (const s of sessions.splice(0)) await s.emit("session_shutdown");
	vi.unstubAllEnvs();
});

function session(hasUI: boolean) {
	const handlers = new Map<string, Array<(...args: any[]) => any>>();
	const tools: ToolDefinitionLike[] = [];
	const ctx = {
		hasUI, mode: "rpc", model: { provider: "other" }, isProjectTrusted: () => false,
		ui: { notify() {}, setStatus() {} },
	};
	const pi = {
		on: (name: string, fn: (...args: any[]) => any) => handlers.set(name, [...handlers.get(name) ?? [], fn]),
		registerTool: (tool: ToolDefinitionLike) => { tools.push(tool); },
		registerProvider() {}, registerCommand() {}, registerEntryRenderer() {},
		getAllTools: () => [], getActiveTools: () => [],
	} as unknown as ExtensionAPI;
	const s = {
		pi, tools, ctx,
		async emit(name: string, event: any = { reason: "startup" }) {
			for (const fn of handlers.get(name) ?? []) await fn(event, ctx);
		},
	};
	sessions.push(s);
	return s;
}

function configure() {
	vi.stubEnv("AGY_ENGINE", "stream-json");
	vi.stubEnv("AGY_BIN", "/tool-publication/missing-agy");
	vi.stubEnv("AGY_BRIDGE_DISCOVERY", "private");
	vi.stubEnv("AGY_ASK_TOOL", "1");
	vi.stubEnv("AGY_WEB_TOOLS", "1");
	saveConfig({ askTool: true, webTools: true, bridgeTools: "none", approvals: { gateMode: "off", mode: "deny" } });
}

test("UI session_start publishes the exact host definitions, including opt-in delegation and web tools", async () => {
	configure();
	const s = session(true);
	await extension(s.pi);
	assert.deepEqual(s.tools.map(tool => tool.name), ["AskAntigravity", "agy_web_search", "agy_read_url", "antigravity"]);
	for (const tool of s.tools) assert.equal(getPublishedToolDefinition(tool.name), undefined, "loading alone must not publish");
	await s.emit("session_start");
	for (const tool of s.tools) assert.strictEqual(getPublishedToolDefinition(tool.name), tool);
	const version = getToolDefinitionRegistryVersion();
	await s.emit("session_start");
	assert.equal(getToolDefinitionRegistryVersion(), version, "repeated starts must not create another owner");
});

test("session_shutdown withdraws only the instance's tools and allows a later UI start to republish", async () => {
	configure();
	const s = session(true);
	await extension(s.pi);
	await s.emit("session_start");
	await s.emit("session_shutdown");
	for (const tool of s.tools) assert.equal(getPublishedToolDefinition(tool.name), undefined);
	await s.emit("session_start", { reason: "resume" });
	for (const tool of s.tools) assert.strictEqual(getPublishedToolDefinition(tool.name), tool);
	await s.emit("session_shutdown");
	for (const tool of s.tools) assert.equal(getPublishedToolDefinition(tool.name), undefined);
});

test("SDK children never publish, and their shutdown cannot withdraw a UI parent's definitions", async () => {
	configure();
	const parent = session(true);
	await extension(parent.pi);
	await parent.emit("session_start");
	const version = getToolDefinitionRegistryVersion();
	const child = session(false);
	await extension(child.pi);
	await child.emit("session_start");
	assert.equal(getToolDefinitionRegistryVersion(), version);
	for (const tool of parent.tools) assert.strictEqual(getPublishedToolDefinition(tool.name), tool);
	await child.emit("session_shutdown");
	for (const tool of parent.tools) assert.strictEqual(getPublishedToolDefinition(tool.name), tool);
	await parent.emit("session_shutdown");
	await child.emit("session_start");
	for (const tool of child.tools) assert.equal(getPublishedToolDefinition(tool.name), undefined);
});

test.each([true, false])("post-startup shadow tools publish only for UI sessions (hasUI=%s)", async (hasUI) => {
	configure();
	saveConfig({ bridgeTools: "all", approvals: { gateMode: "shadow", mode: "deny" } });
	const s = session(hasUI);
	await extension(s.pi);
	await s.emit("session_start");
	assert.equal(s.tools.some(tool => tool.name === "bash"), false, "bridge startup is lazy for another provider");
	await s.emit("model_select", { model: { provider: "antigravity" } });
	assert.deepEqual(s.tools.slice(-3).map(tool => tool.name), ["bash", "write", "edit"]);
	for (const tool of s.tools) assert.strictEqual(getPublishedToolDefinition(tool.name), hasUI ? tool : undefined);
	await s.emit("session_shutdown");
	for (const tool of s.tools) assert.equal(getPublishedToolDefinition(tool.name), undefined);
});

test("opt-out delegation and web tools are neither registered nor published", async () => {
	configure();
	vi.stubEnv("AGY_ASK_TOOL", "0");
	vi.stubEnv("AGY_WEB_TOOLS", "0");
	const s = session(true);
	await extension(s.pi);
	await s.emit("session_start");
	assert.deepEqual(s.tools.map(tool => tool.name), ["antigravity"]);
	for (const name of ["AskAntigravity", "agy_web_search", "agy_read_url"]) assert.equal(getPublishedToolDefinition(name), undefined);
});

test("withdrawing a newer UI instance reveals the earlier instance's same-name tools", async () => {
	configure();
	const first = session(true);
	const second = session(true);
	await extension(first.pi);
	await extension(second.pi);
	await first.emit("session_start");
	await second.emit("session_start");
	for (const tool of second.tools) assert.strictEqual(getPublishedToolDefinition(tool.name), tool);
	await second.emit("session_shutdown");
	for (const tool of first.tools) assert.strictEqual(getPublishedToolDefinition(tool.name), tool);
	await first.emit("session_shutdown");
	for (const tool of first.tools) assert.equal(getPublishedToolDefinition(tool.name), undefined);
});
