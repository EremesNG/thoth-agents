// In-process MCP server that exposes pi tools to Claude Code.
//
// Pi declares tool parameters as TypeBox objects, which are already JSON
// Schema at runtime — the same thing MCP puts on the wire. This serves them
// verbatim (wrapping object-only root unions) instead of going through the
// SDK's `createSdkMcpServer`, which only
// accepts Zod and therefore forces a JSON Schema → Zod → JSON Schema round
// trip. That round trip is lossy below the top level: nested objects collapse
// to open records and `anyOf`/`const` vanish, so Claude saw only the first
// level of any tool with a nested schema — including the builtin `edit`.
//
// Handlers go on the underlying protocol server rather than through
// `McpServer.registerTool`, which is the Zod-only path. Skipping registerTool
// also skips its argument validation, which is what we want: pi validates and
// executes tools itself, and the arguments MCP sees are discarded. A rejection
// there would only prevent the handler from running, stranding the call.
//
// This rests on the Agent SDK treating what we hand it as an opaque JSON-RPC
// endpoint: `connectSdkMcpServer` in sdk.mjs calls `instance.connect(transport)`
// and nothing else, so none of McpServer's higher-level machinery is required.
// The `McpServer` wrapper is kept only because the SDK's `mcpServers` option is
// typed against that class. If this breaks after an SDK update, check whether
// the SDK began inspecting the instance — reading registered tools, or expecting
// tools/list_changed notifications we never send.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	CallToolRequestSchema, CancelledNotificationSchema, InitializedNotificationSchema,
	isJSONRPCErrorResponse, isJSONRPCNotification, isJSONRPCRequest, isJSONRPCResultResponse, ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { mcpToolUseId, TOOL_USE_ID_META, type McpWireMessage } from "./query-process.js";
import type { McpResult } from "./extract-tool-results.js";
import { normalizeToolSchema } from "./tool-schema.js";

interface McpToolDef {
	name: string;
	description: string;
	inputSchema: unknown;
	handler: (toolCallId: string, requestId: string | number) => Promise<McpResult>;
}

export function omittedToolSchemaWarning(toolName: string): string {
	return `Claude bridge: omitted tool "${toolName}" from Claude's tools because its input schema is not an object or an object-only anyOf/oneOf union.`;
}

// This server never initiates MCP requests or registers progress callbacks.
// Protocol failures determined by the inbound message belong to its raw frame.
function inspectProtocolMessage(message: unknown): Error | undefined {
	if (isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) {
		return new Error(`Received a response for an unknown message ID: ${JSON.stringify(message)}`);
	}
	if (isJSONRPCRequest(message)) return undefined;
	if (!isJSONRPCNotification(message)) return new Error(`Unknown message type: ${JSON.stringify(message)}`);
	if (message.method === "notifications/progress") return new Error(`Received unsolicited MCP progress: ${JSON.stringify(message)}`);
	if ((message.method === "notifications/cancelled" && !CancelledNotificationSchema.safeParse(message).success)
		|| (message.method === "notifications/initialized" && !InitializedNotificationSchema.safeParse(message).success)) {
		return new Error(`Invalid MCP ${message.method} notification`);
	}
	return undefined;
}

export function createToolServer(
	name: string,
	tools: McpToolDef[],
	onOmittedTool: (toolName: string) => void = (toolName) => console.warn(omittedToolSchemaWarning(toolName)),
	onTransportFailure?: (error: unknown) => void,
	usesOrderedIngress?: () => boolean,
) {
	const server = new McpServer({ name, version: "1.0.0" }, { capabilities: { tools: {} } });
	server.server.onerror = onTransportFailure;
	if (usesOrderedIngress) {
		const connect = server.connect.bind(server);
		server.connect = async (transport) => {
			await connect(transport);
			const receive = transport.onmessage;
			transport.onmessage = (message, extra) => {
				// SDK 0.3.321 forwards from this same raw MCP control request.
				// Do not echo its protocol error before the wire reducer reaches it.
				if (usesOrderedIngress() && inspectProtocolMessage(message)) return;
				receive?.(message, extra);
			};
		};
	}
	const advertised: McpToolDef[] = [];
	const omitted = new Set<string>();
	for (const tool of tools) {
		const inputSchema = normalizeToolSchema(tool.inputSchema);
		if (inputSchema) {
			advertised.push({ ...tool, inputSchema });
		} else if (!omitted.has(tool.name)) {
			omitted.add(tool.name);
			onOmittedTool(tool.name);
		}
	}
	const byName = new Map(advertised.map((tool) => [tool.name, tool]));

	server.server.setRequestHandler(ListToolsRequestSchema, () => ({
		tools: advertised.map((tool) => ({
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema as Record<string, unknown>,
		})),
	}));

	// The SDK can reject the request before invoking the handler. The ordered
	// ingress scanner uses the same envelope schema (not Pi's tool input schema)
	// and advertised tool table, while metadata is still available for correlation.
	function inspectToolCall(message: McpWireMessage): { error: Error; missingToolUseId?: true } | undefined {
		const { name } = message.params ?? {};
		if (message.jsonrpc !== "2.0" || (typeof message.id !== "string" && typeof message.id !== "number") || !CallToolRequestSchema.safeParse(message).success) {
			return { error: new Error("Invalid Claude Code MCP tools/call envelope") };
		}
		if (typeof name === "string" && !byName.has(name)) return { error: new Error(`Unknown tool: ${name}`) };
		if (!mcpToolUseId(message)) return { error: missingToolUseId(String(name)), missingToolUseId: true };
		return undefined;
	}
	const missingToolUseId = (name: string) => new Error(`${name}: tools/call is missing _meta["${TOOL_USE_ID_META}"] � cannot pair the result with its tool call`);

	server.server.setRequestHandler(CallToolRequestSchema, async (request, { requestId }) => {
		const toolUseId = mcpToolUseId(request);
		const tool = byName.get(request.params.name);
		if (!tool) throw new Error(`Unknown tool: ${request.params.name}`);
		if (!toolUseId) {
			const error = missingToolUseId(tool.name);
			if (!usesOrderedIngress?.()) onTransportFailure?.(error);
			throw error;
		}
		// Narrowed deliberately: McpResult also carries `toolCallId`, which is our
		// own bookkeeping for pairing and not part of MCP's CallToolResult.
		const { content, isError } = await tool.handler(toolUseId, requestId);
		return { content, isError };
	});

	return { type: "sdk" as const, name, instance: server, inspectToolCall, inspectProtocolMessage };
}
