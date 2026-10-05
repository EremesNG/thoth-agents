import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { afterEach, it } from "node:test";
import { getPublishedToolDefinition, getToolDefinitionRegistryVersion } from "@thoth-agents/pi-core";
import { globalConfigPath } from "../src/config.js";
import activate from "../src/index.js";

const instances = [];
afterEach(async () => {
	for (const s of instances.splice(0)) await s.emit("session_shutdown");
});

function configure(enabled = true) {
	writeFileSync(globalConfigPath(), JSON.stringify({
		startupNoticeShown: "2026-09-30", askClaude: { enabled, name: "PublishedAskClaude" },
	}));
}

function instance(hasUI, startDuringProviderRegistration = false) {
	const handlers = new Map();
	const tools = [];
	const ctx = {
		hasUI, mode: "rpc", ui: {},
		sessionManager: { getSessionId: () => "tool-publication" },
		modelRegistry: { getProvider: () => ({}) },
	};
	const emit = async (name, event = { reason: "startup" }) => {
		for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
	};
	let startup;
	activate({
		on(name, handler) {
			handlers.set(name, [...handlers.get(name) ?? [], handler]);
		},
		registerTool(definition) { tools.push(definition); },
		registerProvider() {
			// Start before the opt-in tool is registered to exercise late publication.
			if (startDuringProviderRegistration) startup = emit("session_start");
		},
	});
	const s = { tools, emit, startup };
	instances.push(s);
	return s;
}

it("UI session_start publishes the exact full AskClaude definition only once", async () => {
	configure();
	const s = instance(true);
	assert.equal(s.tools.length, 1);
	const tool = s.tools[0];
	assert.equal(getPublishedToolDefinition(tool.name), undefined);
	await s.emit("session_start");
	assert.strictEqual(getPublishedToolDefinition(tool.name), tool);
	assert.equal(typeof tool.execute, "function");
	assert.equal(typeof tool.renderCall, "function");
	assert.equal(typeof tool.renderResult, "function");
	assert.equal(tool.renderShell, "self");
	const version = getToolDefinitionRegistryVersion();
	await s.emit("session_start");
	assert.equal(getToolDefinitionRegistryVersion(), version);
});

it("session_shutdown withdraws AskClaude and allows the same instance to republish on resume", async () => {
	configure();
	const s = instance(true);
	await s.emit("session_start");
	const tool = s.tools[0];
	await s.emit("session_shutdown");
	assert.equal(getPublishedToolDefinition(tool.name), undefined);
	await s.emit("session_start", { reason: "resume" });
	assert.strictEqual(getPublishedToolDefinition(tool.name), tool);
	await s.emit("session_shutdown");
	assert.equal(getPublishedToolDefinition(tool.name), undefined);
});

it("headless child start and shutdown never publish or withdraw the UI parent's tool", async () => {
	configure();
	const parent = instance(true);
	await parent.emit("session_start");
	const tool = parent.tools[0];
	const version = getToolDefinitionRegistryVersion();
	const child = instance(false);
	await child.emit("session_start");
	assert.equal(getToolDefinitionRegistryVersion(), version);
	assert.strictEqual(getPublishedToolDefinition(tool.name), tool);
	await child.emit("session_shutdown");
	assert.strictEqual(getPublishedToolDefinition(tool.name), tool);
	await parent.emit("session_shutdown");
	await child.emit("session_start");
	assert.equal(getPublishedToolDefinition(child.tools[0].name), undefined);
});

it("an enabled AskClaude registered after UI startup publishes immediately", async () => {
	configure();
	const s = instance(true, true);
	assert.ok(s.startup, "the lifecycle starts during provider registration");
	assert.equal(s.tools.length, 1);
	assert.strictEqual(getPublishedToolDefinition(s.tools[0].name), s.tools[0]);
	await s.startup;
	await s.emit("session_shutdown");
	assert.equal(getPublishedToolDefinition(s.tools[0].name), undefined);
});

it("late AskClaude registration in a headless session never publishes", async () => {
	configure();
	const s = instance(false, true);
	assert.ok(s.startup);
	await s.startup;
	assert.equal(s.tools.length, 1);
	assert.equal(getPublishedToolDefinition(s.tools[0].name), undefined);
});

it("disabled AskClaude is neither registered nor published", async () => {
	configure(false);
	const s = instance(true);
	await s.emit("session_start");
	assert.deepEqual(s.tools, []);
	assert.equal(getPublishedToolDefinition("PublishedAskClaude"), undefined);
});

it("withdrawing the latest UI instance reveals the earlier instance's same-name tool", async () => {
	configure();
	const first = instance(true);
	const second = instance(true);
	await first.emit("session_start");
	await second.emit("session_start");
	assert.strictEqual(getPublishedToolDefinition(first.tools[0].name), second.tools[0]);
	await second.emit("session_shutdown");
	assert.strictEqual(getPublishedToolDefinition(first.tools[0].name), first.tools[0]);
	await first.emit("session_shutdown");
	assert.equal(getPublishedToolDefinition(first.tools[0].name), undefined);
});
