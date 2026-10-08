import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, vi } from "vitest";
import { normalizeContext, type Api, type Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../extensions/index.js";
import { saveConfig, logsDir } from "../src/config.js";
import { mcpConfigPath } from "../src/mcp-registration.js";
import { TOKEN_HEADER } from "../src/mcp-server.js";

vi.mock("../src/models.js", async (original) => ({
	...await original<typeof import("../src/models.js")>(),
	loadModelCatalogRaw: async () => "",
}));

function session() {
	const handlers = new Map<string, Array<(...args: any[]) => any>>();
	let provider: any;
	const pi = {
		on: (name: string, fn: (...args: any[]) => any) => handlers.set(name, [...handlers.get(name) ?? [], fn]),
		registerProvider: (_name: string, config: any) => { provider = config; },
		registerTool: () => {}, registerCommand: () => {}, registerEntryRenderer: () => {},
		getAllTools: () => [], getActiveTools: () => [],
	} as unknown as ExtensionAPI;
	return {
		pi,
		emit: async (name: string) => {
			for (const fn of handlers.get(name) ?? []) await fn({ reason: "startup" }, { hasUI: false, mode: "rpc", isProjectTrusted: () => false });
		},
		turn: async () => {
			const model = { ...provider.models[0], provider: "antigravity", baseUrl: provider.baseUrl } as Model<Api>;
			const stream = provider.streamSimple(model, normalizeContext({ messages: [{ role: "user", content: "hi", timestamp: 1 }] }), { cwd: process.cwd(), sessionId: "ownership-test" });
			for await (const event of stream) assert.notEqual(event.type, "error");
		},
	};
}

function alive(pid: number): boolean {
	try { process.kill(pid, 0); return true; } catch { return false; }
}

test("sibling shutdown preserves the remaining provider, driver, bridge config, endpoint and approval hook", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-ownership-"));
	const bin = path.join(dir, "agy.mjs");
	fs.writeFileSync(bin, `// pi-test-node-fixture
import fs from 'node:fs';
import readline from 'node:readline';
fs.writeFileSync(${JSON.stringify(dir)} + '/' + process.pid + '.json', JSON.stringify({pid:process.pid,args:process.argv}));
for await (const line of readline.createInterface({input:process.stdin})) {
 console.log(JSON.stringify({event:'init',init:{conversation_id:'conv-owned'}}));
 console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:'ok',conversation_id:'conv-owned'}}));
}
`);
	vi.stubEnv("AGY_BIN", bin);
	vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH}`);
	vi.stubEnv("AGY_ENGINE", "stream-json");
	vi.stubEnv("AGY_ASK_TOOL", "0");
	saveConfig({ askTool: false, webTools: false, bridgeTools: "all", approvals: { gateMode: "shadow", mode: "deny" } });
	const parent = session();
	const sibling = session();
	try {
		await extension(parent.pi);
		await extension(sibling.pi);
		await parent.emit("session_start");
		await parent.turn();
		const record = fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
			.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
			.find((r) => r.args.includes("--input-format"));
		const privateDir = record.args[record.args.indexOf("--add-dir", record.args.indexOf("--add-dir") + 1) + 1];
		const configFile = path.join(privateDir, ".agents", "mcp_config.json");
		const hookFile = path.join(privateDir, ".agents", "hooks.json");
		const originalConfig = fs.readFileSync(configFile, "utf8");
		const originalHooks = fs.readFileSync(hookFile, "utf8");
		const scripts = fs.readdirSync(logsDir()).filter((f) => f.startsWith("approval-hook-"));
		const originalGlobal = fs.existsSync(mcpConfigPath()) ? fs.readFileSync(mcpConfigPath(), "utf8") : null;
		await sibling.emit("session_start");
		await sibling.turn();
		assert.equal(fs.readFileSync(configFile, "utf8"), originalConfig, "sibling startup must not overwrite parent discovery");
		assert.equal(fs.readFileSync(hookFile, "utf8"), originalHooks);
		await sibling.emit("session_shutdown");
		assert.equal((globalThis as Record<symbol, unknown>)[Symbol.for("pi-antigravity-bridge:active")], true);
		assert.ok(alive(record.pid), "parent driver still running");
		assert.equal(fs.readFileSync(configFile, "utf8"), originalConfig);
		assert.equal(fs.readFileSync(hookFile, "utf8"), originalHooks);
		for (const script of scripts) assert.ok(fs.existsSync(path.join(logsDir(), script)), "parent approval script survives");
		assert.equal(fs.existsSync(mcpConfigPath()) ? fs.readFileSync(mcpConfigPath(), "utf8") : null, originalGlobal);
		const endpoint = Object.values(JSON.parse(originalConfig).mcpServers)[0] as { serverUrl: string; headers: Record<string, string> };
		const response = await fetch(endpoint.serverUrl.replace("/mcp", "/approval"), {
			method: "POST", headers: { "content-type": "application/json", [TOKEN_HEADER]: endpoint.headers[TOKEN_HEADER] },
			body: JSON.stringify({ toolCall: { name: "ungated", args: {} } }),
		});
		assert.equal(response.status, 200);
		await parent.turn(); // the remaining registered provider is still usable
		assert.ok(alive(record.pid), "parent turn reused its driver");
		await parent.emit("session_shutdown");
		assert.equal(fs.existsSync(privateDir), false);
		for (const script of scripts) assert.equal(fs.existsSync(path.join(logsDir(), script)), false);
		assert.equal(fs.existsSync(mcpConfigPath()), false);
		assert.equal((globalThis as Record<symbol, unknown>)[Symbol.for("pi-antigravity-bridge:active")], undefined);
	} finally {
		await sibling.emit("session_shutdown");
		await parent.emit("session_shutdown");
		vi.unstubAllEnvs();
		fs.rmSync(dir, { recursive: true, force: true });
	}
}, 20_000);
