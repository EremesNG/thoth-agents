import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { buildSystemPrompt } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { segment } from "../src/append-blocks.js";

const claudeDir = mkdtempSync(join(tmpdir(), "claude-bridge-tool-note-"));
process.env.CLAUDE_CONFIG_DIR = claudeDir;
process.on("exit", () => rmSync(claudeDir, { recursive: true, force: true }));
const { default: activate, __test } = await import("../src/index.js");
let provider;
const handlers = new Map();
activate({
	on: (name, handler) => handlers.set(name, handler),
	registerProvider: (_name, config) => { provider = config; },
	registerTool: () => {},
});
const calls = [];
const tool = { name: "subagent_run", description: "Delegate a task", parameters: { type: "object", properties: { task: { type: "string" } }, required: ["task"] } };

beforeEach(() => {
	__test.resetSharedSession();
	calls.length = 0;
	__test.setQuery(({ prompt, options }) => {
		calls.push(options);
		const gen = (async function* () {
			await prompt[Symbol.asyncIterator]().next();
			yield { type: "system", subtype: "init", session_id: randomUUID() };
			yield { type: "result", subtype: "success", is_error: false, result: "OK" };
		})();
		gen.interrupt = async () => {};
		gen.close = () => {};
		return gen;
	});
});
afterEach(() => __test.setQuery(null));

function record(options = {}) {
	const systemPromptOptions = { cwd: `/tool-note/${randomUUID()}`, selectedTools: [], contextFiles: [], skills: [], ...options };
	const key = buildSystemPrompt(systemPromptOptions);
	handlers.get("before_agent_start")({ systemPrompt: key, systemPromptOptions });
	handlers.get("agent_start")({}, { getSystemPrompt: () => key });
	return key;
}

async function query(systemPrompt, tools = [tool]) {
	const result = await provider.streamSimple(provider.models[0], {
		systemPrompt, tools, messages: [{ role: "user", content: "Delegate the task", timestamp: 0 }],
	}, { sessionId: randomUUID() }).result();
	await new Promise((resolve) => setImmediate(resolve));
	assert.notEqual(result.stopReason, "error", result.errorMessage);
	return calls.at(-1);
}

async function advertisedTools(call) {
	const server = call.mcpServers["custom-tools"].instance;
	const client = new Client({ name: "tool-note-test", version: "1.0.0" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	try {
		await server.connect(serverTransport);
		await client.connect(clientTransport);
		return (await client.listTools({}, { timeout: 2000 })).tools;
	} finally {
		await client.close();
		await server.close();
	}
}

function note(append) {
	const blocks = append?.match(/<mcp_tool_names>\n[\s\S]*?\n<\/mcp_tool_names>/g) ?? [];
	assert.equal(blocks.length, 1, "the outer provider append contains exactly one note");
	return blocks[0];
}

describe("provider MCP tool-name disclosure", () => {
	it("keeps MCP catalog bytes and note bytes constant across section changes, in Pi tool order", async () => {
		const tools = [tool, { name: "status", description: "Report status", parameters: { type: "object", properties: {} } }];
		const first = await query(record(), tools);
		const firstCatalog = JSON.stringify(await advertisedTools(first));
		const changed = await query(record({ sections: { recovery: "IDENTITY B", policy: "POLICY" } }), tools);
		const changedCatalog = JSON.stringify(await advertisedTools(changed));
		assert.equal(firstCatalog, '[{"name":"subagent_run","description":"Delegate a task","inputSchema":{"type":"object","properties":{"task":{"type":"string"}},"required":["task"]}},{"name":"status","description":"Report status","inputSchema":{"type":"object","properties":{}}}]');
		assert.equal(changedCatalog, firstCatalog, "names, descriptions, schemas, and order stay byte-identical");
		assert.equal(note(changed.systemPrompt.append), note(first.systemPrompt.append));
		const blocks = segment(changed.systemPrompt.append);
		assert.equal(blocks.ambiguous, false);
		assert.deepEqual(blocks.blocks.map(({ key }) => key), ["xml:mcp_tool_names", "xml:recovery", "xml:policy"]);
	});
	it("emits a single outer note for recorded and derived children, even when the parent advertised tools", async () => {
		const parent = record({ sections: { recovery: "PARENT IDENTITY" } });
		const parentNote = note((await query(parent)).systemPrompt.append);
		const child = record({ customPrompt: `${parent}\n\n<child_task>DELEGATE</child_task>`, sections: { child_policy: "CHILD POLICY" } });
		assert.equal(note((await query(child)).systemPrompt.append), parentNote);
		const derived = `PREFIX\n\n${child}\n\n<derived_task>REVIEW</derived_task>`;
		const derivedCall = await query(derived);
		assert.equal(note(derivedCall.systemPrompt.append), parentNote);
		assert.match(derivedCall.systemPrompt.append, /PARENT IDENTITY[\s\S]*CHILD POLICY[\s\S]*REVIEW/);
		assert.doesNotMatch((await query(derived, [])).systemPrompt.append, /mcp_tool_names/, "a child's note depends on its query's tools, not its ancestors");
	});

	it("omits the note when no tools are advertised, including omitted schemas", async () => {
		const key = record({ sections: { recovery: "IDENTITY" } });
		for (const tools of [[], [{ ...tool, parameters: { type: "string" } }]]) {
			assert.equal((await query(key, tools)).systemPrompt.append, "<recovery>\nIDENTITY\n</recovery>");
		}
	});

	it("adds the note even when there is no prompt capture or portable prompt content", async () => {
		note((await query(undefined)).systemPrompt.append);
		note((await query(record())).systemPrompt.append);
		assert.equal((await query(undefined, [])).systemPrompt.append, undefined);
	});
	it("discloses plain-name mapping without skills or a read tool, before section blocks", async () => {
		const key = record({ sections: { recovery: "IDENTITY" } });
		const call = await query(key);
		const block = note(call.systemPrompt.append);
		assert.match(block, /plain.*\bX\b[\s\S]*mcp__custom-tools__X/);
		assert.match(block, /not.*unavailable/);
		assert.ok(call.systemPrompt.append.indexOf(block) < call.systemPrompt.append.indexOf("<recovery>"));
		assert.equal(__test.promptCaptures.resolve(key).assembledPrompt, key);
		assert.doesNotMatch(key, /mcp_tool_names/);
	});
});
