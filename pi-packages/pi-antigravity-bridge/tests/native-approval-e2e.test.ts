// End to end: unknown agy native tool -> generated hook handler -> real
// POST /approval -> provider park -> production Pi approval shadow (raw tool
// name + arguments) -> decision (allow AND deny) back to the handler's stdout.
//
// Run: npm test

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { createNativeApprovalBase, createShadowTool, NATIVE_APPROVAL_TOOL, GATE_MARKER } from "../src/approval-gate.js";
import { approvalHookFileName, hookScriptSource } from "../src/approval-hook.js";
import type { StreamDriver } from "../src/driver.js";
import type { DriverActivity } from "../src/driver-types.js";
import { startMcpServer, TOKEN_HEADER, type McpServerHandle } from "../src/mcp-server.js";
import { ToolRoundTrips } from "../src/provider.js";

let handle: McpServerHandle | null = null;
afterEach(async () => {
	await handle?.close();
	handle = null;
});

class RecordingDriver {
	pushed: DriverActivity[] = [];
	#handle = {
		id: "fake-turn",
		outcome: new Promise<never>(() => {}),
		next: async (): Promise<DriverActivity | null> => null,
		pushExternal: (a: DriverActivity) => this.pushed.push(a),
	};
	get activeHandle() {
		return this.#handle;
	}
	kickIdle(): void {}
	reentry(): null {
		return null;
	}
}

async function runHandler(scriptContent: string, stdinText: string): Promise<{ decision?: string; reason?: string }> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "native-e2e-"));
	const file = path.join(dir, approvalHookFileName(process.pid, "e2e-instance"));
	fs.writeFileSync(file, scriptContent, { mode: 0o700 });
	try {
		const proc = spawn("node", [file], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
		let stdout = "";
		proc.stdout?.on("data", (c) => { stdout += c; });
		proc.stdin?.end(stdinText);
		await new Promise((resolve) => proc.on("close", resolve));
		return JSON.parse(stdout.trim()) as { decision?: string; reason?: string };
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

async function setup(policy: (call: { tool: string; params: Record<string, unknown> }) => { allow: boolean; reason?: string }) {
	const received = vi.fn();
	const onToolCall = vi.fn(async (_id: string, _name: string, _args: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: "ok" }], isError: false }));
	const driver = new RecordingDriver();
	const rt = new ToolRoundTrips(driver as unknown as StreamDriver);
	const r = await startMcpServer({
		listTools: () => [{ name: "sample_tool", description: "sample", inputSchema: { type: "object" } }],
		onToolCall,
		onApproval: (ticket, payload) => {
			received(payload);
			rt.onApproval(ticket, payload);
		},
	});
	handle = r.handle!;
	rt.approvalPark = handle.approvals;
	// The production Pi shadow for unknown-target operations.
	const shadow = createShadowTool(createNativeApprovalBase(), (call) => policy({ tool: call.tool, params: call.params }), {
		verifyTicket: (t) => handle!.approvals.has(t),
	});
	// What pi's executor does with the shadow toolUse the provider emitted.
	const piSide = async () => {
		await vi.waitFor(() => expect(driver.pushed.length).toBe(1));
		const push = driver.pushed[0] as { callId: string; name: string; args: Record<string, unknown> };
		let text: string;
		let isError = false;
		try {
			const result = await shadow.execute(push.callId, push.args, undefined, undefined, { hasUI: false } as never);
			text = (result.content[0] as { text: string }).text;
		} catch (err) {
			isError = true;
			text = err instanceof Error ? err.message : String(err);
		}
		rt.resolve(push.callId, text, isError);
		return push;
	};
	const script = hookScriptSource({ port: handle.port, token: handle.token, deadlineMs: 8000 });
	return { driver, piSide, script, received, rt, onToolCall };
}

async function postBytes(route: string, first: Buffer, last: Buffer = Buffer.alloc(0)) {
	assert.ok(handle);
	let req: http.ClientRequest | undefined;
	const response = new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
		req = http.request({
			host: "127.0.0.1",
			port: handle!.port,
			path: route,
			method: "POST",
			headers: {
				[TOKEN_HEADER]: handle!.token,
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
		}, (res) => {
			res.setEncoding("utf8");
			let body = "";
			res.on("data", (chunk) => { body += chunk; });
			res.on("end", () => resolve({ status: res.statusCode, body }));
			res.on("error", reject);
		});
		req.setTimeout(2_000, () => req?.destroy(new Error("HTTP request timed out")));
		req.on("error", reject);
	});
	req!.setNoDelay(true);
	req!.write(first);
	// Let the first HTTP chunk reach the loopback server before ending the body.
	await delay(25);
	req!.end(last);
	return response;
}

const splitCases = ["é", "界", "𐐷"].flatMap(char =>
	Array.from({ length: Buffer.byteLength(char) - 1 }, (_, i) => [char, i + 1] as const),
);

test.each(splitCases)("approval POST preserves %s split at byte %i in the exact target and raw args", async (char, offset) => {
	const { driver, received, rt } = await setup(() => ({ allow: false }));
	const root = process.platform === "win32" ? "C:/w" : "/w";
	const args = { Path: `${root}/caf${char}.txt`, Content: `payload ${char}` };
	const payload = { toolCall: { name: "write_file", args } };
	const body = Buffer.from(JSON.stringify(payload));
	const split = body.indexOf(Buffer.from(char)) + offset;
	try {
		const response = await postBytes("/approval", body.subarray(0, split), body.subarray(split));
		assert.equal(response.status, 200);
		assert.deepEqual(received.mock.calls, [[payload]]);
		const push = driver.pushed[0];
		assert.equal(push?.type, "bridge_call");
		assert.equal(push.name, "write");
		assert.equal(push.args.path, args.Path);
		assert.equal(push.args.content, args.Content);
	} finally {
		rt.failAll("test complete");
	}
});

test("MCP tools/call POST preserves split UTF-8 arguments", async () => {
	const { onToolCall } = await setup(() => ({ allow: false }));
	const args = { sample: "café" };
	const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "sample_tool", arguments: args } }));
	const split = body.indexOf(Buffer.from("é")) + 1;
	const response = await postBytes("/mcp", body.subarray(0, split), body.subarray(split));
	assert.equal(response.status, 200);
	assert.equal(onToolCall.mock.calls.length, 1);
	assert.deepEqual(onToolCall.mock.calls[0]?.[2], args);
});

test.each(["/approval", "/mcp"])("%s POST rejects invalid UTF-8 before dispatch", async (route) => {
	const { driver, received, rt, onToolCall } = await setup(() => ({ allow: false }));
	const payload = route === "/approval"
		? { toolCall: { name: "write_file", args: { Path: "/w/café.txt", Content: "" } } }
		: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "sample_tool", arguments: { sample: "café" } } };
	const body = Buffer.from(JSON.stringify(payload));
	body[body.indexOf(Buffer.from("é")) + 1] = 0x20;
	try {
		const response = await postBytes(route, body);
		assert.equal(response.status, 400);
		assert.equal(received.mock.calls.length, 0);
		assert.equal(onToolCall.mock.calls.length, 0);
		assert.equal(driver.pushed.length, 0);
	} finally {
		rt.failAll("test complete");
	}
});

test.each(["/approval", "/mcp"])("%s POST enforces the limit in bytes before dispatch", async (route) => {
	const { received, onToolCall } = await setup(() => ({ allow: false }));
	const body = Buffer.from(JSON.stringify({
		toolCall: { name: "write_file", args: { Path: "/w/file", Content: "é".repeat(500_000) } },
	}));
	assert.ok(body.length > 1_000_000);
	const response = await postBytes(route, body.subarray(0, 750_000), body.subarray(750_000));
	assert.equal(response.status, 413);
	assert.equal(received.mock.calls.length, 0);
	assert.equal(onToolCall.mock.calls.length, 0);
});

const rawArgs = { Path: "/w/book.ipynb", Cell: 3, Source: "import os" };
const payload = JSON.stringify({ toolCall: { name: "notebook_edit", args: rawArgs }, stepIdx: 2 });

test("unknown native tool: raw name+arguments reach the Pi shadow and an allow decision returns to the hook", async () => {
	const seen: Array<{ tool: string; params: Record<string, unknown> }> = [];
	const { piSide, script } = await setup((call) => {
		seen.push(call);
		return { allow: true };
	});
	const [verdict, push] = await Promise.all([runHandler(script, payload), piSide()]);
	assert.equal(push.name, NATIVE_APPROVAL_TOOL);
	assert.equal(push.args.tool, "notebook_edit");
	assert.deepEqual(push.args.arguments, rawArgs);
	assert.equal(push.args.path, undefined, "no fabricated path");
	assert.equal(push.args.command, undefined, "no fabricated command");
	assert.equal(push.args[GATE_MARKER], true);
	assert.equal(seen.length, 1);
	assert.equal(seen[0]!.tool, "notebook_edit");
	assert.deepEqual(seen[0]!.params.arguments, rawArgs, "policy sees the raw arguments");
	assert.deepEqual(verdict, { decision: "allow" });
});

test("unknown native tool: a Pi deny returns to the hook as deny with the reason", async () => {
	const { piSide, script } = await setup(() => ({ allow: false, reason: "declined in pi (agy notebook_edit)" }));
	const [verdict] = await Promise.all([runHandler(script, payload), piSide()]);
	assert.equal(verdict.decision, "deny");
	assert.match(verdict.reason ?? "", /declined in pi/);
});
