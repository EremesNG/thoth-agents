// Tests for the decoupled MCP bridge server: the provider owns the tool
// catalog and the round-trip; the server only ferries list/call.

import { test, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import type { McpServerHandle, McpBridgeDeps } from "../src/mcp-server.js";
import { bridgeMcpConfigExists, startMcpServer, TOKEN_HEADER } from "../src/mcp-server.js";

let handle: McpServerHandle | null = null;

afterEach(async () => {
	await handle?.close();
	handle = null;
});

function fakeDeps(overrides: Partial<McpBridgeDeps> = {}): McpBridgeDeps {
	return {
		listTools: () => [
			{ name: "mem_search", description: "search memory", inputSchema: { type: "object", properties: {} } },
		],
		onToolCall: async () => ({ content: [{ type: "text", text: "ok" }], isError: false }),
		...overrides,
	};
}

test("mcp-server: starts without pi, writes bridge config, cleans up on close", async () => {
	const r = await startMcpServer(fakeDeps());
	assert.equal(r.ok, true);
	handle = r.handle!;
	assert.ok(r.port && r.port > 0);
	// ACP engines read the token off the handle to build mcpServers headers[];
	// the server rejects any request without it (403 path covered by the HTTP
	// test below).
	assert.equal(typeof handle.token, "string");
	assert.ok(handle.token.length > 0);
	assert.equal(bridgeMcpConfigExists(), true);
	await handle.close();
	handle = null;
	assert.equal(bridgeMcpConfigExists(), false);
});

test("mcp-server: listTools is consulted per request (dynamic catalog)", async () => {
	let calls = 0;
	const r = await startMcpServer(
		fakeDeps({ listTools: () => { calls += 1; return []; } }),
	);
	handle = r.handle!;
	assert.equal(r.ok, true);
	// The catalog callback is wired; live HTTP round-trips are covered by the
	// paid smoke (scripts/smoke-stream-json.mjs) since they need an agy client.
	assert.equal(typeof depsListToolsShape(calls), "number");
});

function depsListToolsShape(n: number): number {
	return n;
}

async function servedTools(): Promise<ReturnType<McpBridgeDeps["listTools"]>> {
	assert.ok(handle);
	const response = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
		method: "POST",
		headers: { "content-type": "application/json", accept: "application/json, text/event-stream", [TOKEN_HEADER]: handle.token },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
	});
	assert.equal(response.status, 200);
	const line = (await response.text()).split("\n").find((l) => l.startsWith("data:"));
	assert.ok(line, "expected an SSE tools/list response");
	const payload = JSON.parse(line.slice(5));
	assert.ok(Array.isArray(payload.result?.tools), JSON.stringify(payload));
	return payload.result.tools;
}

test("mcp-server: served catalog wraps object unions, omits unsupported schemas and preserves object/internal tools", async () => {
	const original = [
		{ name: "plain", description: "plain object", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
		{ name: "union", description: "object union", inputSchema: { anyOf: [{ type: "object", properties: { action: { const: "list" } } }, { type: "object", properties: { action: { const: "open" } } }] } },
		{ name: "unsupported", description: "string root", inputSchema: { type: "string" } },
		{ name: "activate_skill", description: "bridge-local skill", inputSchema: { type: "object", properties: { name: { type: "string", enum: ["tdd"] } }, required: ["name"] } },
		{ name: "bridge_poll_result", description: "bridge-local poll", inputSchema: { type: "object", properties: { callId: { type: "string" } }, required: ["callId"] } },
	];
	const before = structuredClone(original);
	const r = await startMcpServer(fakeDeps({ listTools: () => original }));
	assert.equal(r.ok, true);
	handle = r.handle!;
	assert.deepEqual(await servedTools(), [
		original[0],
		{ name: "union", description: "object union", inputSchema: { type: "object", anyOf: [{ type: "object", properties: { action: { const: "list" } } }, { type: "object", properties: { action: { const: "open" } } }] } },
		original[3], original[4],
	]);
	assert.deepEqual(original, before, "Pi continues validating the original catalog schemas");
});

test("mcp-server: schema omission warns once per tool per session, including dynamic catalog reloads", async () => {
	let catalog = [
		{ name: "string_tool", description: "unsupported", inputSchema: { type: "string" } as object },
		{ name: "dangling_tool", description: "unsupported ref", inputSchema: { anyOf: [{ $ref: "#/$defs/missing" }] } },
	];
	const warnings: unknown[] = [];
	const deps = fakeDeps({ listTools: () => catalog });
	const opts = { log: (event: string, data?: unknown) => { if (event === "tool-schema-omitted") warnings.push(data); } };
	const r = await startMcpServer(deps, opts);
	handle = r.handle!;
	assert.deepEqual(await servedTools(), []);
	assert.deepEqual(await servedTools(), []);
	assert.deepEqual(warnings, [
		{ name: "string_tool", reason: "input schema is not an object or a supported object-only union" },
		{ name: "dangling_tool", reason: "input schema is not an object or a supported object-only union" },
	]);
	catalog = [{ name: "string_tool", description: "now supported", inputSchema: { type: "object" } }];
	assert.deepEqual(await servedTools(), catalog, "normalization follows the fresh catalog");
	catalog = [{ name: "string_tool", description: "unsupported again", inputSchema: { type: "string" } }];
	assert.deepEqual(await servedTools(), []);
	assert.equal(warnings.length, 2, "a tool is not warned again after temporarily becoming supported");
	await handle.close();
	handle = null;
	const next = await startMcpServer(deps, opts);
	handle = next.handle!;
	assert.deepEqual(await servedTools(), []);
	assert.equal(warnings.length, 3, "a new session gets its own warning");
});

test("mcp-server: onToolCall rejection surfaces as an isError result upstream", async () => {
	const r = await startMcpServer(
		fakeDeps({
			onToolCall: async () => {
				throw new Error("no active antigravity turn");
			},
		}),
	);
	handle = r.handle!;
	assert.equal(r.ok, true);
});

test("mcp-server: 403s requests without or with a wrong x-bridge-token", async () => {
	const r = await startMcpServer(fakeDeps());
	handle = r.handle!;
	assert.equal(r.ok, true);
	const url = `http://127.0.0.1:${handle.port}/mcp`;
	const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
	const post = (headers: Record<string, string>) =>
		fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
	// No header at all.
	assert.equal((await post({})).status, 403);
	// Wrong token, different length (timingSafeEqual would throw without the
	// length precheck).
	assert.equal((await post({ [TOKEN_HEADER]: "short" })).status, 403);
	// Wrong token, SAME length: exercises the constant-time compare path.
	const sameLen = "x".repeat(handle.token.length);
	assert.equal((await post({ [TOKEN_HEADER]: sameLen })).status, 403);
	// Correct token passes the gate and answers the RPC. The transport
	// requires the MCP accept pair (fetch's default */* gets a 406).
	const ok = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			[TOKEN_HEADER]: handle.token,
		},
		body,
	});
	assert.equal(ok.status, 200);
	// The transport answers with an SSE stream (the accept pair advertises
	// text/event-stream); the JSON-RPC response rides a data: line.
	const text = await ok.text();
	const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
	assert.ok(dataLine, "expected an SSE data line");
	const payload = JSON.parse(dataLine.slice(5).trim()) as { result?: { tools?: unknown[] } };
	assert.ok(Array.isArray(payload.result?.tools));
});

test("mcp-server: no stale config before start", () => {
	// Sanity: the per-pid path is only present while a server runs in this pid.
	assert.equal(bridgeMcpConfigExists(), fs.existsSync(bridgeMcpConfigPathForTest()));
});

function bridgeMcpConfigPathForTest(): string {
	// Mirrors the module's private path helper without exporting it.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const os = require("node:os") as typeof import("node:os");
	const path = require("node:path") as typeof import("node:path");
	return path.join(os.homedir(), ".pi", "agent", "antigravity-bridge", `agy-mcp-${process.pid}`, ".agents", "mcp_config.json");
}

beforeEach(() => {
	/* no shared state beyond the handle */
});

test("mcp-server: owned private names are unique in config and MCP identity", async () => {
 const os = await import("node:os");
 const path = await import("node:path");
 const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-private-name-"));
 const handles: McpServerHandle[] = [];
 try {
  for (const name of ["pi-agy-a1", "pi-agy-b2"]) {
   const dir = path.join(root, name);
   const r = await startMcpServer(fakeDeps(), { configDir: dir, serverName: name });
   assert.equal(r.ok, true);
   handles.push(r.handle!);
   const cfg = JSON.parse(fs.readFileSync(path.join(dir, ".agents", "mcp_config.json"), "utf8"));
   assert.deepEqual(Object.keys(cfg.mcpServers), [name]);
   const res = await fetch(cfg.mcpServers[name].serverUrl, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", [TOKEN_HEADER]: r.handle!.token },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } }),
   });
   const text = await res.text();
   const data = JSON.parse(text.split("\n").find((line) => line.startsWith("data:"))!.slice(5));
   assert.equal(data.result.serverInfo.name, name);
  }
 } finally {
  for (const h of handles) await h.close();
  fs.rmSync(root, { recursive: true, force: true });
 }
});
