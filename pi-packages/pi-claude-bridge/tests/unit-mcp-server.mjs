/**
 * What the bridge puts on the MCP wire: tool schemas must survive verbatim
 * (including below the top level), and tool calls must be paired with Claude's
 * own tool_use id.
 *
 * Drives the MCP server the same way the Agent SDK does — `instance.connect()`
 * with a transport, then raw JSON-RPC — so the assertions cover what Claude
 * actually receives rather than an intermediate representation.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createToolServer } from "../src/mcp-server.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";

const NESTED_TOOL_SCHEMA = {
	type: "object",
	properties: {
		question: { type: "string", description: "Question to ask" },
		options: {
			type: "array",
			description: "Choices to offer",
			items: {
				type: "object",
				properties: {
					label: { type: "string", description: "Short label" },
					detail: { type: "string" },
				},
				required: ["label"],
			},
		},
		config: {
			type: "object",
			properties: {
				mode: { type: "string", enum: ["single", "multi"] },
				retries: { type: "integer" },
			},
			required: ["mode"],
		},
		either: { anyOf: [{ type: "string" }, { type: "number" }] },
	},
	required: ["question", "options"],
};

// Mirrors the SDK's connectSdkMcpServer: hand the instance a transport, push
// requests into transport.onmessage, read replies out of transport.send.
async function connectClient(server) {
	const pending = new Map();
	const transport = {
		start: async () => {},
		close: async () => {},
		send: async (msg) => pending.get(msg.id)?.(msg),
	};
	await server.instance.connect(transport);

	let nextId = 0;
	const request = (method, params) =>
		new Promise((resolve) => {
			const id = ++nextId;
			pending.set(id, resolve);
			transport.onmessage({ jsonrpc: "2.0", id, method, params });
		});

	// Claude Code identifies the call it is making via _meta on every tools/call.
	const callTool = (name, toolUseId, args = {}) =>
		request("tools/call", {
			name,
			arguments: args,
			...(toolUseId ? { _meta: { "claudecode/toolUseId": toolUseId } } : {}),
		});

	await request("initialize", {
		protocolVersion: "2025-06-18",
		capabilities: {},
		clientInfo: { name: "test", version: "1.0.0" },
	});
	transport.onmessage({ jsonrpc: "2.0", method: "notifications/initialized" });
	return { request, callTool };
}

describe("MCP tool schema advertisement", () => {
	let listed;

	it("a mixed catalog omits incompatible tools without failing valid tools or the request", async () => {
		const warnings = [];
		const union = { anyOf: [{ type: "object", required: ["a"] }, { type: "object", required: ["b"] }] };
		const handler = async () => ({ content: [{ type: "text", text: "ok" }] });
		const server = createToolServer("custom-tools", [
			{ name: "bad_tool", description: "", inputSchema: { type: "string" }, handler },
			{ name: "valid_tool", description: "", inputSchema: NESTED_TOOL_SCHEMA, handler },
			{ name: "union_tool", description: "", inputSchema: union, handler },
		], (name) => warnings.push(name));
		const { request, callTool } = await connectClient(server);
		const response = await request("tools/list", {});
		assert.equal(response.error, undefined, "one unsupported schema cannot fail the request");
		const catalog = ListToolsResultSchema.parse(response.result).tools;
		assert.deepStrictEqual(catalog.map((tool) => tool.name), ["valid_tool", "union_tool"]);
		assert.deepStrictEqual(catalog[0].inputSchema, NESTED_TOOL_SCHEMA);
		assert.deepStrictEqual(catalog[1].inputSchema, {
			type: "object", properties: { input: { anyOf: [{ type: "object", required: ["a"] }, { type: "object", required: ["b"] }] } }, required: ["input"],
		});
		assert.deepStrictEqual(warnings, ["bad_tool"]);
		assert.ok(!("type" in union), "Pi still owns the original union schema");
		assert.equal((await callTool("valid_tool", "toolu_good")).result.content[0].text, "ok");
		assert.equal((await callTool("union_tool", "toolu_union", { input: { a: 1 } })).result.content[0].text, "ok");
		assert.match((await callTool("bad_tool", "toolu_bad")).error.message, /Unknown tool: bad_tool/);
	});

	it("advertises oneOf with preserved definitions, escaped local refs and repeated object refs", async () => {
		const schema = {
			definitions: { "action/shape": { type: "object", properties: { action: { const: "list" } }, required: ["action"] } },
			title: "Actions", description: "Action variants",
			oneOf: [
				{ allOf: [{ $ref: "#/definitions/action~1shape" }, { $ref: "#/definitions/action~1shape" }] },
				{ type: "object", properties: { action: { const: "open" } }, required: ["action"] },
			],
		};
		const { request } = await connectClient(createToolServer("custom-tools", [{
			name: "actions", description: "", inputSchema: schema, handler: async () => ({ content: [] }),
		}]));
		const catalog = ListToolsResultSchema.parse((await request("tools/list", {})).result).tools;
		assert.deepStrictEqual(catalog[0].inputSchema, {
			type: "object",
			definitions: { "action/shape": { type: "object", properties: { action: { const: "list" } }, required: ["action"] } },
			title: "Actions", description: "Action variants",
			properties: { input: { oneOf: [
				{ allOf: [{ $ref: "#/definitions/action~1shape" }, { $ref: "#/definitions/action~1shape" }] },
				{ type: "object", properties: { action: { const: "open" } }, required: ["action"] },
			] } }, required: ["input"],
		});
		assert.ok(!("type" in schema));
	});

	before(async () => {
		const server = createToolServer("custom-tools", [
			{
				name: "ask_user_question",
				description: "Ask the user a question",
				inputSchema: NESTED_TOOL_SCHEMA,
				handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
			},
		]);
		const { request } = await connectClient(server);
		listed = (await request("tools/list", {})).result.tools[0].inputSchema;
	});

	it("preserves top-level properties and required", () => {
		assert.deepStrictEqual(Object.keys(listed.properties).sort(), ["config", "either", "options", "question"]);
		assert.deepStrictEqual(listed.required, ["question", "options"]);
		assert.strictEqual(listed.properties.question.description, "Question to ask");
	});

	it("preserves object properties nested in an array", () => {
		const item = listed.properties.options.items;
		assert.deepStrictEqual(Object.keys(item.properties).sort(), ["detail", "label"]);
		assert.deepStrictEqual(item.required, ["label"]);
		assert.strictEqual(item.properties.label.description, "Short label");
	});

	it("preserves nested object properties, enums and required", () => {
		const config = listed.properties.config;
		assert.deepStrictEqual(Object.keys(config.properties).sort(), ["mode", "retries"]);
		assert.deepStrictEqual(config.required, ["mode"]);
		assert.deepStrictEqual(config.properties.mode.enum, ["single", "multi"]);
		assert.strictEqual(config.properties.retries.type, "integer");
	});

	it("preserves anyOf branches", () => {
		assert.deepStrictEqual(listed.properties.either.anyOf, [{ type: "string" }, { type: "number" }]);
	});
});

describe("MCP tool invocation", () => {
	// Two tools, so a handler picked by position rather than by name/id is visible.
	const twoTools = (record) => [
		{
			name: "alpha",
			description: "a",
			inputSchema: { type: "object", properties: {} },
			handler: async (toolCallId) => {
				record.push(["alpha", toolCallId]);
				return { content: [{ type: "text", text: "from alpha" }] };
			},
		},
		{
			name: "beta",
			description: "b",
			inputSchema: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
			handler: async (toolCallId) => {
				record.push(["beta", toolCallId]);
				return { content: [{ type: "text", text: "from beta" }], isError: true };
			},
		},
	];

	it("routes tools/call to the matching handler", async () => {
		const calls = [];
		const { callTool } = await connectClient(createToolServer("custom-tools", twoTools(calls)));

		const beta = await callTool("beta", "toolu_b", { x: "hi" });
		assert.deepStrictEqual(calls, [["beta", "toolu_b"]]);
		assert.strictEqual(beta.result.content[0].text, "from beta");
		assert.strictEqual(beta.result.isError, true);
	});

	// Claude sends the authoritative tool_use id on every call. Inferring it from
	// call order instead silently pairs a result with the wrong call whenever the
	// order diverges — e.g. parallel tool calls, or a call that never arrives.
	it("hands the handler Claude's tool_use id, not one inferred from call order", async () => {
		const calls = [];
		const { callTool } = await connectClient(createToolServer("custom-tools", twoTools(calls)));

		await callTool("beta", "toolu_second", { x: "hi" });
		await callTool("alpha", "toolu_first");

		assert.deepStrictEqual(calls, [["beta", "toolu_second"], ["alpha", "toolu_first"]]);
	});

	it("fails loudly when the tool_use id is absent rather than mispairing", async () => {
		const calls = [];
		const { callTool } = await connectClient(createToolServer("custom-tools", twoTools(calls)));

		const res = await callTool("alpha", null);
		const message = res.error?.message ?? JSON.stringify(res.result);
		assert.match(message, /toolUseId/i);
		assert.deepStrictEqual(calls, [], "handler must not run without an id to pair its result to");
	});

	// toolCallId is internal bookkeeping for pairing results; it is not part of
	// MCP's CallToolResult and has no business on the wire.
	it("does not leak internal fields into the tool result", async () => {
		const { callTool } = await connectClient(
			createToolServer("custom-tools", [
				{
					name: "alpha",
					description: "a",
					inputSchema: { type: "object", properties: {} },
					handler: async (toolCallId) => ({
						content: [{ type: "text", text: "ok" }],
						isError: false,
						toolCallId,
					}),
				},
			]),
		);

		const res = await callTool("alpha", "toolu_x");
		assert.deepStrictEqual(Object.keys(res.result).sort(), ["content", "isError"]);
	});

	// A schema-validation rejection would skip the handler entirely, desyncing
	// the result pairing.
	it("invokes the handler even when arguments do not match the schema", async () => {
		let called = false;
		const { callTool } = await connectClient(
			createToolServer("custom-tools", [
				{
					name: "strict",
					description: "s",
					inputSchema: {
						type: "object",
						properties: { count: { type: "number" } },
						required: ["count"],
						additionalProperties: false,
					},
					handler: async () => {
						called = true;
						return { content: [{ type: "text", text: "ran" }] };
					},
				},
			]),
		);

		const res = await callTool("strict", "toolu_y", { count: "not-a-number", extra: 1 });
		assert.ok(called, "handler must run — pi validates and executes tools, not the MCP layer");
		assert.strictEqual(res.result.content[0].text, "ran");
	});
});
