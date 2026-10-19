import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAskAntigravityTool } from "../src/ask-tool.js";
import { StreamDriver } from "../src/driver.js";
import { AcpConnection } from "../src/acp/connection.js";
import { makeNodeFixture } from "./helpers/node-fixture.js";

// Real facade launches: native jobs on Windows, plain detached spawn on POSIX.
// Synchronous writes fill multiple pipe chunks immediately before leader exit.
const answer = "final λ " + "x".repeat(256 * 1024);
const fixtures: string[] = [];
function fixture(source: string) {
	const bin = makeNodeFixture(source); fixtures.push(bin); return bin;
}
afterEach(async () => {
	vi.unstubAllEnvs();
	for (const bin of fixtures.splice(0)) await fs.promises.rm(path.dirname(bin), { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

test("real AskAntigravity delivers all text written immediately before normal exit", async () => {
	const bin = fixture(`import fs from 'node:fs';fs.writeSync(1, ${JSON.stringify(answer)});process.exit(0);`);
	vi.stubEnv("AGY_BIN", bin);
	let tool: any;
	await registerAskAntigravityTool({ registerTool: (t: unknown) => { tool = t; } } as unknown as ExtensionAPI, [], undefined, "private");
	const result = await tool.execute("real-drain", { prompt: "hello", conversationId: "real-drain" }, undefined, undefined, { cwd: process.cwd() });
	assert.ok(result.content[0].text.startsWith(answer));
}, 15_000);

test("real stream driver delivers final stream-json output immediately before normal exit", async () => {
	const wire = JSON.stringify({ event: "result", result: { status: "SUCCESS", response: answer } }) + "\n";
	const bin = fixture(`import fs from 'node:fs';process.stdin.once('data',()=>{fs.writeSync(1,${JSON.stringify(wire)});process.exit(0);});`);
	vi.stubEnv("PATH", `${path.dirname(bin)}${path.delimiter}${process.env.PATH}`);
	const driver = new StreamDriver();
	try {
		const handle = await driver.run({ cwd: process.cwd(), model: "gemini-3.6-flash", mode: "accept-edits", skipPermissions: true, prompt: "hi", timeoutMin: 0.2, inactivityMin: 0.2 });
		const outcome = await handle.outcome;
		assert.equal(outcome.status, "OK");
		assert.equal(outcome.response, answer);
	} finally { await driver.close("shutdown"); }
}, 15_000);

test("real ACP delivers final JSON-RPC message immediately before normal exit", async () => {
	const bin = fixture(`import fs from 'node:fs';import readline from 'node:readline';
for await (const line of readline.createInterface({input:process.stdin})) {
	const r=JSON.parse(line);
	if(r.method==='initialize') {fs.writeSync(1,JSON.stringify({jsonrpc:'2.0',id:r.id,result:{protocolVersion:1,agentCapabilities:{},authMethods:[],agentInfo:{version:${JSON.stringify(answer)}}}})+'\\n');process.exit(0);}
}`);
	const conn = new AcpConnection({ cwd: process.cwd(), bin: process.execPath, binArgs: [bin], log: () => {}, onUpdate: () => {}, onExit: () => {} });
	try { await conn.start(); assert.equal(conn.serverVersion(), answer); } finally { await conn.kill(); }
}, 15_000);
