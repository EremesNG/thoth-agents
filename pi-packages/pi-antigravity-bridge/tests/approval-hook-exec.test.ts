// Direct execution tests for generated hook script (Issue #5 regression).
// Verifies that the generated script always emits a valid JSON object on stdout,
// never a bare string scalar like "deny" or "allow".
//
// Run: npm test

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";
import {
	HANDLER_TIMEOUT_MARGIN_MS,
	approvalHookFileName,
	handlerDeadlineMs,
	hookScriptSource,
	stagedTimeoutSeconds,
} from "../src/approval-hook.js";

let server: http.Server | null = null;

afterEach(async () => {
	if (server) {
		await new Promise<void>((resolve) => server!.close(() => resolve()));
		server = null;
	}
});

async function runHookScript(
	scriptContent: string,
	stdinText: string,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-exec-"));
	const scriptFile = path.join(tmpDir, approvalHookFileName(process.pid, "test-instance"));
	fs.writeFileSync(scriptFile, scriptContent, { mode: 0o700 });
	try {
		const proc = spawn("node", [scriptFile], {
			windowsHide: true,
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		proc.stdout?.on("data", (chunk) => {
			stdout += chunk;
		});
		proc.stderr?.on("data", (chunk) => {
			stderr += chunk;
		});
		proc.stdin?.write(stdinText);
		proc.stdin?.end();
		const code = await new Promise<number | null>((resolve) => {
			proc.on("close", resolve);
		});
		return { stdout, stderr, code };
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
}

function startStubServer(
	handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<number> {
	return new Promise((resolve) => {
		server = http.createServer(handler);
		server.listen(0, "127.0.0.1", () => {
			const addr = server!.address();
			resolve(typeof addr === "object" && addr ? addr.port : 0);
		});
	});
}

const stdinPayload = JSON.stringify({
	toolCall: { name: "run_command", args: { CommandLine: "npm test" } },
	stepIdx: 1,
	conversationId: "conv-1",
});

test("hook execution: direct terminal deny from POST emits valid JSON object", async () => {
	const port = await startStubServer((req, res) => {
		if (req.method === "POST" && req.url === "/approval") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ decision: "deny", reason: "tool not in matcher set" }));
			return;
		}
		res.writeHead(404).end();
	});

	const script = hookScriptSource({ port, token: "test-token", deadlineMs: 5000 });
	const { stdout, code } = await runHookScript(script, stdinPayload);

	assert.equal(code, 0);
	const parsed = JSON.parse(stdout.trim());
	assert.equal(typeof parsed, "object");
	assert.ok(parsed !== null && !Array.isArray(parsed));
	assert.equal(parsed.decision, "deny");
	assert.equal(parsed.reason, "tool not in matcher set");
	// Crucial: stdout must not be a JSON string literal like '"deny"'
	assert.notEqual(stdout.trim(), '"deny"');
});

test("hook execution: pending ticket followed by terminal deny from polling emits valid JSON object", async () => {
	let pollCount = 0;
	const port = await startStubServer((req, res) => {
		if (req.method === "POST" && req.url === "/approval") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ ticket: "ticket-deny-123" }));
			return;
		}
		if (req.method === "GET" && req.url === "/approval/ticket-deny-123") {
			pollCount += 1;
			res.writeHead(200, { "content-type": "application/json" });
			if (pollCount === 1) {
				res.end(JSON.stringify({ status: "pending" }));
			} else {
				res.end(JSON.stringify({ decision: "deny", reason: "no active antigravity turn" }));
			}
			return;
		}
		res.writeHead(404).end();
	});

	const script = hookScriptSource({ port, token: "test-token", deadlineMs: 5000 });
	const { stdout, code } = await runHookScript(script, stdinPayload);

	assert.equal(code, 0);
	const parsed = JSON.parse(stdout.trim());
	assert.equal(typeof parsed, "object");
	assert.ok(parsed !== null && !Array.isArray(parsed));
	assert.equal(parsed.decision, "deny");
	assert.equal(parsed.reason, "no active antigravity turn");
	assert.notEqual(stdout.trim(), '"deny"');
});

test("hook execution: pending ticket followed by terminal allow from polling emits valid JSON object", async () => {
	const port = await startStubServer((req, res) => {
		if (req.method === "POST" && req.url === "/approval") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ ticket: "ticket-allow-123" }));
			return;
		}
		if (req.method === "GET" && req.url === "/approval/ticket-allow-123") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ decision: "allow" }));
			return;
		}
		res.writeHead(404).end();
	});

	const script = hookScriptSource({ port, token: "test-token", deadlineMs: 5000 });
	const { stdout, code } = await runHookScript(script, stdinPayload);

	assert.equal(code, 0);
	const parsed = JSON.parse(stdout.trim());
	assert.equal(typeof parsed, "object");
	assert.ok(parsed !== null && !Array.isArray(parsed));
	assert.equal(parsed.decision, "allow");
	assert.notEqual(stdout.trim(), '"allow"');
});

test("hook execution: 404 unknown ticket during polling falls back to fail-closed object", async () => {
	const port = await startStubServer((req, res) => {
		if (req.method === "POST" && req.url === "/approval") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ ticket: "ticket-404" }));
			return;
		}
		if (req.method === "GET" && req.url === "/approval/ticket-404") {
			res.writeHead(404, { "content-type": "application/json" });
			res.end(JSON.stringify({ error: "unknown ticket" }));
			return;
		}
		res.writeHead(404).end();
	});

	const script = hookScriptSource({ port, token: "test-token", deadlineMs: 5000 });
	const { stdout, code } = await runHookScript(script, stdinPayload);

	assert.equal(code, 0);
	const parsed = JSON.parse(stdout.trim());
	assert.equal(typeof parsed, "object");
	assert.equal(parsed.decision, "deny");
	assert.equal(parsed.reason, "gate returned no decision");
});

test("hook execution: unreachable bridge emits fail-closed object", async () => {
	// Pick an inactive port by binding and immediately closing
	const deadPort = await startStubServer((_req, res) => res.end());
	await new Promise<void>((resolve) => server!.close(() => resolve()));
	server = null;

	const script = hookScriptSource({ port: deadPort, token: "test-token", deadlineMs: 5000 });
	const { stdout, code } = await runHookScript(script, stdinPayload);

	assert.equal(code, 0);
	const parsed = JSON.parse(stdout.trim());
	assert.equal(typeof parsed, "object");
	assert.equal(parsed.decision, "deny");
	assert.match(parsed.reason, /unreachable/);
});

test("hook execution: malformed POST body falls back to fail-closed object", async () => {
	const port = await startStubServer((_req, res) => {
		res.writeHead(200, { "content-type": "application/json" });
		res.end("<html>not json</html>");
	});

	const script = hookScriptSource({ port, token: "test-token", deadlineMs: 5000 });
	const { stdout, code } = await runHookScript(script, stdinPayload);

	assert.equal(code, 0);
	const parsed = JSON.parse(stdout.trim());
	assert.equal(typeof parsed, "object");
	assert.ok(parsed !== null && !Array.isArray(parsed));
	assert.equal(parsed.decision, "deny");
});

test("hook execution: deadline with perpetually pending ticket emits fail-closed object", async () => {
	const port = await startStubServer((req, res) => {
		if (req.method === "POST" && req.url === "/approval") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ ticket: "ticket-never" }));
			return;
		}
		if (req.method === "GET" && req.url === "/approval/ticket-never") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ status: "pending" }));
			return;
		}
		res.writeHead(404).end();
	});

	// 700ms: generous headroom for the initial POST (asserting the exact
	// deadline reason requires the POST to complete inside the window) while
	// the 500ms poll sleep still forces loop exit well under a second.
	const script = hookScriptSource({ port, token: "test-token", deadlineMs: 700 });
	const { stdout, code } = await runHookScript(script, stdinPayload);

	assert.equal(code, 0);
	const parsed = JSON.parse(stdout.trim());
	assert.equal(typeof parsed, "object");
	assert.ok(parsed !== null && !Array.isArray(parsed));
	assert.equal(parsed.decision, "deny");
	assert.equal(parsed.reason, "approval gate deadline exceeded");
});

// --- allow-by-exception + single overall deadline (agy-upstream-safety-sync) ---


const payloadFor = (name: string, args: Record<string, unknown> = {}) => JSON.stringify({ toolCall: { name, args }, stepIdx: 1 });

async function deadPortNumber(): Promise<number> {
	const port = await startStubServer((_req, res) => res.end());
	await new Promise<void>((resolve) => server!.close(() => resolve()));
	server = null;
	return port;
}

test("hook execution: allowlisted read-only tools pass locally without contacting the bridge", async () => {
	const port = await deadPortNumber();
	const script = hookScriptSource({ port, token: "<REDACTED>", deadlineMs: 5000 });
	for (const name of ["view_file", "grep_search", "list_dir", "find_by_name", "search_web"]) {
		const { stdout, code } = await runHookScript(script, payloadFor(name, { Path: "/w/x" }));
		assert.equal(code, 0);
		assert.deepEqual(JSON.parse(stdout.trim()), { decision: "allow" }, name);
	}
});

test("hook execution: positively identified MCP calls pass locally; look-alikes are not MCP", async () => {
	const port = await deadPortNumber();
	const script = hookScriptSource({ port, token: "<REDACTED>", deadlineMs: 5000, ownServerName: "pi-agy-abcd1234" });
	for (const [name, args] of [
		["call_mcp_tool", { server_name: "codegraph", tool: "search" }],
		["call_mcp_tool", { serverName: "foreign", tool: "x" }],
		["mcp_pi-agy-abcd1234_bash", { command: "ls" }],
	] as Array<[string, Record<string, unknown>]>) {
		const { stdout } = await runHookScript(script, payloadFor(name, args));
		assert.deepEqual(JSON.parse(stdout.trim()), { decision: "allow" }, name);
	}
	// No server evidence / another server's qualified name: not MCP -> bridge (down) -> deny.
	for (const [name, args] of [
		["call_mcp_tool", { tool: "x" }],
		["call_mcp_tool", { server_name: "" }],
		["mcp_other_bash", {}],
		["mcp_pi-agy-abcd1234_", {}],
	] as Array<[string, Record<string, unknown>]>) {
		const { stdout } = await runHookScript(script, payloadFor(name, args));
		assert.equal(JSON.parse(stdout.trim()).decision, "deny", name);
	}
});

test("hook execution: write_file, sed_file, notebook_edit and unknown tools are never passed locally", async () => {
	const port = await deadPortNumber();
	const script = hookScriptSource({ port, token: "<REDACTED>", deadlineMs: 5000 });
	for (const name of ["write_file", "sed_file", "notebook_edit", "future_tool_9"]) {
		const { stdout } = await runHookScript(script, payloadFor(name, { Path: "/w/x", Content: "c" }));
		assert.equal(JSON.parse(stdout.trim()).decision, "deny", `${name} reaches the (down) bridge and fails closed`);
	}
});

test("hook execution: garbage or nameless stdin denies", async () => {
	const port = await deadPortNumber();
	const script = hookScriptSource({ port, token: "<REDACTED>", deadlineMs: 5000 });
	for (const input of ["not json", "{}", JSON.stringify({ toolCall: { name: "" } }), ""]) {
		const { stdout, code } = await runHookScript(script, input);
		assert.equal(code, 0);
		assert.equal(JSON.parse(stdout.trim()).decision, "deny", JSON.stringify(input));
	}
});

test("hook execution: a valid Pi allow arriving before the internal deadline is forwarded as allow", async () => {
	let polls = 0;
	const port = await startStubServer((req, res) => {
		if (req.method === "POST" && req.url === "/approval") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ ticket: "late-allow" }));
			return;
		}
		if (req.url === "/approval/late-allow") {
			polls += 1;
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify(polls < 3 ? { status: "pending" } : { decision: "allow" }));
			return;
		}
		res.writeHead(404).end();
	});
	const script = hookScriptSource({ port, token: "<REDACTED>", deadlineMs: 6000 });
	const { stdout } = await runHookScript(script, payloadFor("write_file", { Path: "/w/x", Content: "c" }));
	assert.deepEqual(JSON.parse(stdout.trim()), { decision: "allow" });
	assert.ok(polls >= 3);
});

test.each([
	["unknown decision word", { decision: "maybe" }],
	["deny without a reason", { decision: "deny" }],
	["non-string decision", { decision: 1 }],
])("hook execution: an invalid decision from the bridge denies (%s)", async (_label, reply) => {
	const port = await startStubServer((req, res) => {
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify(req.method === "POST" ? reply : {}));
	});
	const script = hookScriptSource({ port, token: "<REDACTED>", deadlineMs: 5000 });
	const { stdout } = await runHookScript(script, payloadFor("write_file", { Path: "/w/x", Content: "c" }));
	assert.equal(JSON.parse(stdout.trim()).decision, "deny");
});

/** Spawn the handler with stdin held open; resolve with the verdict and timing. */
async function runHeldOpen(scriptContent: string, written: string): Promise<{ stdout: string; ms: number; code: number | null }> {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-held-"));
	const scriptFile = path.join(tmpDir, approvalHookFileName(process.pid, "held-instance"));
	fs.writeFileSync(scriptFile, scriptContent, { mode: 0o700 });
	try {
		const started = Date.now();
		const proc = spawn("node", [scriptFile], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
		let stdout = "";
		proc.stdout?.on("data", (chunk) => { stdout += chunk; });
		if (written) proc.stdin?.write(written); // never ended
		const code = await new Promise<number | null>((resolve) => proc.on("close", resolve));
		return { stdout, ms: Date.now() - started, code };
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
}

test("hook execution: stdin held open emits deny at the overall deadline, before the declared hook timeout", async () => {
	// Scale: the real relation (handler deadline + margin <= declared timeout) is pinned for
	// production values below; here a short deadline proves the stdin read itself is covered.
	const park = 0;
	assert.ok(handlerDeadlineMs(park) + HANDLER_TIMEOUT_MARGIN_MS <= stagedTimeoutSeconds(park) * 1000);
	const script = hookScriptSource({ port: 1, token: "<REDACTED>", deadlineMs: 1200 });
	const silent = await runHeldOpen(script, "");
	assert.equal(silent.code, 0);
	assert.equal(JSON.parse(silent.stdout.trim()).decision, "deny");
	assert.match(JSON.parse(silent.stdout.trim()).reason, /deadline exceeded/);
	assert.ok(silent.ms >= 1000 && silent.ms < 6000, `emitted at ${silent.ms}ms`);
	// A payload written but stdin never closed is the same wait.
	const partial = await runHeldOpen(script, '{"toolCall":{"name":"write_file"');
	assert.equal(JSON.parse(partial.stdout.trim()).decision, "deny");
	assert.ok(partial.ms < 6000);
});

test("hook execution: a bridge that accepts the POST but never answers still ends in deny at the overall deadline", async () => {
	const port = await startStubServer(() => { /* never respond */ });
	const script = hookScriptSource({ port, token: "<REDACTED>", deadlineMs: 1500 });
	const { stdout, ms, code } = await runHeldOpenEnded(script, payloadFor("write_file", { Path: "/w/x", Content: "c" }));
	assert.equal(code, 0);
	assert.equal(JSON.parse(stdout.trim()).decision, "deny");
	assert.ok(ms < 6000, `emitted at ${ms}ms`);
});

async function runHeldOpenEnded(scriptContent: string, stdinText: string): Promise<{ stdout: string; ms: number; code: number | null }> {
	const started = Date.now();
	const { stdout, code } = await runHookScript(scriptContent, stdinText);
	return { stdout, ms: Date.now() - started, code };
}

test("hook execution: the exact live ACP bridge-call payload (ServerName/ToolName/Arguments) passes locally without the bridge", async () => {
	const port = await deadPortNumber();
	const script = hookScriptSource({ port, token: "<REDACTED>", deadlineMs: 5000 });
	const livePayload = JSON.stringify({
		artifactDirectoryPath: "/a",
		conversationId: "c-1",
		cwd: "/w",
		hookEventName: "PreToolUse",
		lastUserInput: "write a file",
		modelName: "gemini-3.8-flash",
		stepIdx: 4,
		toolCall: { id: "t-1", name: "call_mcp_tool", args: { ServerName: "pi-agy-863e9ed5", ToolName: "write", Arguments: { path: "/w/x.txt", content: "hi" } } },
		transcriptPath: "/t",
		workspacePaths: ["/w"],
	});
	const { stdout } = await runHookScript(script, livePayload);
	assert.deepEqual(JSON.parse(stdout.trim()), { decision: "allow" });
});

test("hook execution: read_file (ACP's native read tool) passes locally", async () => {
	const port = await deadPortNumber();
	const script = hookScriptSource({ port, token: "<REDACTED>", deadlineMs: 5000 });
	const { stdout } = await runHookScript(script, payloadFor("read_file", { Path: "/w/x.txt" }));
	assert.deepEqual(JSON.parse(stdout.trim()), { decision: "allow" });
});
