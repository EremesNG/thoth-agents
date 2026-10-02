import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import * as childProcess from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, test, vi } from "vitest";
import { normalizeContext, type Api, type Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../extensions/index.js";
import { saveConfig } from "../src/config.js";
import { mcpConfigPath } from "../src/mcp-registration.js";
import { agyConversationDir } from "../src/agy-paths.js";
import { TOKEN_HEADER } from "../src/mcp-server.js";

vi.mock("../src/patch-cleanup.js", () => ({ patchStatus: () => ({ present: false }), restorePatch: () => ({}) }));
vi.mock("node:crypto", async (original) => {
	const actual = await original<typeof import("node:crypto")>();
	return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

const sessions: Array<{ emit: (name: string, event?: any) => Promise<void> }> = [];
const dirs: string[] = [];
const spawnProcess = childProcess.spawn;
afterEach(async () => {
	for (const s of sessions.splice(0)) await s.emit("session_shutdown");
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
	fs.rmSync(mcpConfigPath(), { force: true });
});

function session(providerName = "antigravity", tools: Array<{ name: string; description: string; parameters: object }> = []) {
	const handlers = new Map<string, Array<(...args: any[]) => any>>();
	const commands = new Map<string, any>();
	let provider: any;
	const notices: string[] = [];
	const ctx = { hasUI: false, mode: "rpc", model: { provider: providerName }, isProjectTrusted: () => false,
		ui: { notify: (message: string) => notices.push(message) } };
	const pi = {
		on: (name: string, fn: (...args: any[]) => any) => handlers.set(name, [...handlers.get(name) ?? [], fn]),
		registerProvider: (_name: string, config: any) => { provider = config; },
		registerTool: () => {}, registerCommand: (name: string, command: any) => commands.set(name, command), registerEntryRenderer: () => {},
		getAllTools: () => tools, getActiveTools: () => tools.map((tool) => tool.name),
	} as unknown as ExtensionAPI;
	const s = {
		pi, ctx, notices,
		command: (args: string, ui: any = ctx.ui) => commands.get("agy").handler(args, { ...ctx, ui }),
		emit: async (name: string, event: any = { reason: "startup" }) => {
			for (const fn of handlers.get(name) ?? []) await fn(event, ctx);
		},
		turn: async (sessionId = "lifecycle-test") => {
			const model = { ...provider.models[0], provider: "antigravity", baseUrl: provider.baseUrl } as Model<Api>;
			const stream = provider.streamSimple(model, normalizeContext({ messages: [{ role: "user", content: "hi", timestamp: 1 }] }), { cwd: process.cwd(), sessionId });
			const errors: string[] = [];
			for await (const event of stream) if (event.type === "error") errors.push(event.error.errorMessage ?? "error");
			return errors;
		},
	};
	sessions.push(s);
	return s;
}

function fixture() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-lifecycle-"));
	dirs.push(dir);
	const bin = path.join(dir, "agy.mjs");
	fs.writeFileSync(bin, `// pi-test-node-fixture
import readline from 'node:readline';
if (process.argv.includes('--version')) { console.log('1.2.14'); process.exit(0); }
if (process.argv.includes('models')) { console.log('gemini-3.6-flash-low Gemini 3.6 Flash (Low)'); process.exit(0); }
for await (const line of readline.createInterface({input:process.stdin})) {
 console.log(JSON.stringify({event:'init',init:{conversation_id:'conv-lazy'}}));
 console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:'ok',conversation_id:'conv-lazy'}}));
}
`);
	vi.stubEnv("HOME", os.homedir());
	vi.stubEnv("USERPROFILE", os.homedir());
	vi.stubEnv("AGY_BIN", bin);
	vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH}`);
	vi.stubEnv("AGY_ENGINE", "stream-json");
	vi.stubEnv("AGY_BRIDGE_DISCOVERY", "private");
	vi.stubEnv("AGY_ASK_TOOL", "0");
	saveConfig({ askTool: false, webTools: false, bridgeTools: "all", approvals: { gateMode: "off", mode: "deny" } });
	return vi.spyOn(childProcess, "spawn");
}

function privateConfigs(): Array<{ dir: string; servers: Record<string, any> }> {
	const base = path.join(os.homedir(), ".pi", "agent", "antigravity-bridge");
	if (!fs.existsSync(base)) return [];
	return fs.readdirSync(base).filter((name) => name.startsWith("agy-mcp-")).flatMap((name) => {
		const dir = path.join(base, name);
		const file = path.join(dir, ".agents", "mcp_config.json");
		return fs.existsSync(file) ? [{ dir, servers: JSON.parse(fs.readFileSync(file, "utf8")).mcpServers }] : [];
	});
}

test.each([
	{ engine: "stream-json", discovery: "private" },
	{ engine: "stream-json", discovery: "legacy-global" },
	{ engine: "acp", discovery: "private" },
	{ engine: "acp", discovery: "legacy-global" },
])("$engine/$discovery: schema and name omissions reach headless stderr once with the actual discovery name", async ({ engine, discovery }) => {
	fixture();
	vi.stubEnv("AGY_ENGINE", engine);
	vi.stubEnv("AGY_BRIDGE_DISCOVERY", discovery);
	if (engine === "acp") {
		const bin = path.join(path.dirname(process.env.AGY_BIN!), "acp.mjs");
		fs.writeFileSync(bin, "// pi-test-node-fixture\n" + fs.readFileSync(path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs"), "utf8"));
		vi.stubEnv("AGY_ACP_BIN", bin);
	}
	const stderr: string[] = [];
	vi.spyOn(console, "error").mockImplementation((...args) => { stderr.push(args.join(" ")); });
	const object = { type: "object", properties: { action: { type: "string" } } };
	const union = { definitions: { action: object }, anyOf: [{ $ref: "#/definitions/action" }, { type: "object" }] };
	const overlongName = "x".repeat(51);
	const s = session("antigravity", [
		{ name: "plain", description: "plain", parameters: object },
		{ name: "union", description: "union", parameters: union },
		{ name: "string_tool", description: "unsupported", parameters: { type: "string" } },
		{ name: "agent_browser_electron", description: "22-char browser tool", parameters: object },
		{ name: "agent_browser_network_source", description: "28-char browser tool", parameters: object },
		{ name: overlongName, description: "overlong", parameters: object },
	]);
	await extension(s.pi);
	await s.emit("session_start");
	const privateName = Object.keys(privateConfigs()[0].servers)[0];
	const endpoint = Object.values(privateConfigs()[0].servers)[0];
	const legacyStream = engine === "stream-json" && discovery === "legacy-global";
	const discoveryName = discovery === "private" ? privateName : legacyStream
		? Object.keys(JSON.parse(fs.readFileSync(mcpConfigPath(), "utf8")).mcpServers)[0] : "pi-bridge";
	for (let i = 0; i < 2; i++) {
		const response = await fetch(endpoint.serverUrl, {
			method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", [TOKEN_HEADER]: endpoint.headers[TOKEN_HEADER] },
			body: JSON.stringify({ jsonrpc: "2.0", id: i + 1, method: "tools/list", params: {} }),
		});
		assert.equal(response.status, 200);
		const data = JSON.parse((await response.text()).split("\n").find((line) => line.startsWith("data:"))!.slice(5));
		const tools = data.result.tools;
		assert.equal(tools.some((tool: any) => tool.name === "string_tool"), false);
		assert.deepEqual(tools.find((tool: any) => tool.name === "plain").inputSchema, object);
		assert.deepEqual(tools.find((tool: any) => tool.name === "union").inputSchema, { type: "object", definitions: { action: object }, anyOf: [{ $ref: "#/definitions/action" }, { type: "object" }] });
		assert.equal(tools.some((tool: any) => tool.name === "agent_browser_electron"), !legacyStream);
		assert.equal(tools.some((tool: any) => tool.name === "agent_browser_network_source"), !legacyStream);
		assert.equal(tools.some((tool: any) => tool.name === "bridge_poll_result"), !legacyStream);
		assert.equal(tools.some((tool: any) => tool.name === overlongName), false);
	}
	const omissions = stderr.filter((text) => text.includes("omitted from Antigravity"));
	assert.equal(omissions[0], "[antigravity-bridge] Pi tool string_tool omitted from Antigravity: input schema is not an object or a supported object-only union");
	const omittedNames = legacyStream ? ["agent_browser_electron", "agent_browser_network_source", overlongName, "bridge_poll_result"] : [overlongName];
	assert.equal(omissions.length, omittedNames.length + 1, "one headless warning per omitted tool across catalog requests");
	for (const name of omittedNames) {
		const warning = omissions.find((text) => text.includes(`Pi tool ${name} omitted`));
		assert.ok(warning?.includes(`qualified tool name mcp_${discoveryName}_${name}`), "warning uses the engine's actual discovery name");
		assert.match(warning!, /characters \(maximum 64\)/);
	}
	assert.deepEqual(s.notices, [], "headless output must not depend on UI notifications");
	assert.equal("type" in union, false, "Pi's validation schema stays original");
});

test.each(["artifacts open 0", "artifacts"])("/agy %s hides the detached artifact-opener console", async (args) => {
	const spawn = fixture();
	const s = session();
	await extension(s.pi);
	await s.emit("session_start");
	assert.deepEqual(await s.turn(), []);
	const dir = agyConversationDir("stream-json", "conv-lazy");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "report.md"), "offline artifact");
	dirs.push(dir);
	const unref = vi.fn();
	spawn.mockImplementation(((command: string, argv: string[], options: any) => command === "xdg-open"
		? { unref } : spawnProcess(command, argv, options)) as typeof childProcess.spawn);
	spawn.mockClear();
	const ui = {
		...s.ctx.ui,
		custom: (factory: any) => new Promise((resolve) => {
			const component = factory({ requestRender: () => {} }, {
				fg: (_color: string, text: string) => text, bold: (text: string) => text,
			}, {}, resolve);
			component.handleInput("\r");
		}),
	};
	// Artifact open is supported on Linux/macOS only today. Exercise both
	// command paths on Windows too, without ever launching an actual opener.
	const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
	try {
		Object.defineProperty(process, "platform", { value: "linux" });
		await s.command(args, ui);
	} finally {
		Object.defineProperty(process, "platform", platform);
	}
	assert.equal(spawn.mock.calls.length, 1);
	assert.deepEqual(spawn.mock.calls[0], ["xdg-open", [fs.realpathSync(path.join(dir, "report.md"))], {
		detached: true, stdio: "ignore", shell: false, windowsHide: true,
	}]);
	assert.equal(unref.mock.calls.length, 1);
});

test("private model-at-start writes unique private discovery, no global entries, and reuses it on resume", async () => {
	const spawn = fixture();
	const a = session(); const b = session();
	await extension(a.pi); await extension(b.pi);
	assert.equal(spawn.mock.calls.length, 0, "loading must not launch agy");
	await Promise.all([a.emit("session_start"), b.emit("session_start")]);
	const configs = privateConfigs();
	assert.equal(configs.length, 2);
	const names = configs.map((c) => Object.keys(c.servers)[0]);
	assert.notEqual(names[0], names[1]);
	assert.ok(names.every((name) => /^pi-agy-[a-f0-9]{8}$/.test(name)), "private discovery uses exactly eight hex digits");
	assert.ok(configs.every((config) => /^agy-mcp-\d+-[0-9a-f-]{36}$/.test(path.basename(config.dir))), "instance directories retain the full UUID");
	assert.equal(fs.existsSync(mcpConfigPath()), false);
	await a.emit("session_start", { reason: "resume" });
	assert.equal(privateConfigs().length, 2);
	assert.equal(spawn.mock.calls.filter(([, args]) => args?.includes("--version")).length, 1);
	assert.deepEqual(await a.turn(), []);
});

test("private names avoid live PID-owned keys and reserve across separately loaded factories before config writes", async () => {
	fixture();
	const base = path.join(os.homedir(), ".pi", "agent", "antigravity-bridge");
	const liveDir = path.join(base, `agy-mcp-${process.ppid}-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`);
	const file = path.join(liveDir, ".agents", "mcp_config.json");
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const original = JSON.stringify({ mcpServers: { "pi-agy-11111111": {}, "pi-agy-44444444": {} } });
	fs.writeFileSync(file, original);
	dirs.push(liveDir);
	const a = session(); const b = session(); const c = session(); const d = session();
	vi.mocked(randomUUID).mockReturnValueOnce("11111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa");
	await extension(a.pi);
	await a.emit("session_start");
	const nameA = Object.keys(privateConfigs().find((config) => config.dir !== liveDir)!.servers)[0];
	assert.notEqual(nameA, "pi-agy-11111111", "a live PID's keys cannot be acquired");
	assert.equal(fs.readFileSync(file, "utf8"), original, "collision checks never mutate a live config");
	const cacheRoot = path.join(os.homedir(), ".gemini", "antigravity-cli", "mcp");
	for (const name of [nameA, "pi-agy-11111111"]) {
		fs.mkdirSync(path.join(cacheRoot, name), { recursive: true });
		fs.writeFileSync(path.join(cacheRoot, name, "tool.json"), name);
		dirs.push(path.join(cacheRoot, name));
	}

	vi.mocked(randomUUID).mockReturnValueOnce("22222222-aaaa-4aaa-aaaa-aaaaaaaaaaaa");
	await extension(b.pi);
	// A separately loaded package copy must share reservations, not just activeInstances.
	vi.resetModules();
	const secondExtension = (await import("../extensions/index.js")).default;
	vi.mocked(randomUUID).mockReturnValueOnce("22222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb");
	await secondExtension(c.pi);
	await Promise.all([b.emit("session_start"), c.emit("session_start")]);
	const names = privateConfigs().filter((config) => config.dir !== liveDir).flatMap((config) => Object.keys(config.servers));
	assert.equal(new Set(names).size, 3, "concurrent bind/config gaps still reserve names across package copies");
	assert.ok(names.every((name) => /^pi-agy-[0-9a-f]{8}$/.test(name)));
	await a.emit("session_shutdown");
	assert.equal(fs.existsSync(path.join(cacheRoot, nameA)), false, "cleanup uses the acquired fallback key");
	assert.equal(fs.readFileSync(path.join(cacheRoot, "pi-agy-11111111", "tool.json"), "utf8"), "pi-agy-11111111", "the colliding candidate's cache is not owned");
	await b.emit("session_shutdown");
	await c.emit("session_shutdown");
	const e = session();
	vi.mocked(randomUUID).mockReturnValueOnce("22222222-eeee-4eee-eeee-eeeeeeeeeeee");
	await secondExtension(e.pi);
	await e.emit("session_start");
	assert.ok(privateConfigs().some((config) => "pi-agy-22222222" in config.servers), "shutdown releases the reservation after owned cleanup");

	const deadDir = path.join(base, "agy-mcp-2147483647-dddddddd-dddd-4ddd-dddd-dddddddddddd");
	fs.mkdirSync(path.join(deadDir, ".agents"), { recursive: true });
	fs.writeFileSync(path.join(deadDir, ".agents", "mcp_config.json"), JSON.stringify({ mcpServers: { "pi-agy-33333333": {} } }));
	dirs.push(deadDir);
	vi.mocked(randomUUID).mockReturnValueOnce("33333333-cccc-4ccc-cccc-cccccccccccc");
	await secondExtension(d.pi);
	await d.emit("session_start");
	assert.ok(privateConfigs().some((config) => "pi-agy-33333333" in config.servers), "dead PID-owned keys are not live collisions");
});

test("non-antigravity sessions do no bridge work; model_select starts once with stream-time fallback", async () => {
	const spawn = fixture();
	const s = session("anthropic");
	await extension(s.pi);
	await s.emit("session_start");
	assert.equal(privateConfigs().length, 0);
	assert.equal(spawn.mock.calls.length, 0);
	await s.emit("model_select", { model: { provider: "anthropic" } });
	assert.equal(spawn.mock.calls.length, 0);
	await Promise.all([s.emit("model_select", { model: { provider: "antigravity" } }), s.turn()]);
	assert.equal(privateConfigs().length, 1);
	assert.equal(spawn.mock.calls.filter(([, args]) => args?.includes("--version")).length, 1);
	const streamLaunch = spawn.mock.calls.find(([, args]) => args?.includes("--input-format"));
	assert.ok(streamLaunch, "provider fallback must launch the stream engine");
	const args = streamLaunch[1]!;
	const ownDir = args[args.lastIndexOf("--add-dir") + 1];
	assert.equal(fs.existsSync(path.join(ownDir, ".agents", "mcp_config.json")), true);
});

test("ACP lazy fallback and resume supply the owned bridge before session/new and session/load", async () => {
	const spawn = fixture();
	const dir = path.dirname(process.env.AGY_BIN!);
	const bin = path.join(dir, "acp.mjs");
	const log = path.join(dir, "acp-wire.jsonl");
	fs.writeFileSync(bin, "// pi-test-node-fixture\n" + fs.readFileSync(path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs"), "utf8"));
	vi.stubEnv("AGY_ENGINE", "acp");
	vi.stubEnv("AGY_ACP_BIN", bin);
	vi.stubEnv("ACP_FAKE_LOG", log);
	const s = session("anthropic");
	await extension(s.pi);
	await s.emit("session_start");
	assert.equal(spawn.mock.calls.length, 0);
	assert.equal(privateConfigs().length, 0);
	// Observe the external process boundary: the private endpoint must already
	// be staged before ACP itself can be launched.
	const observed: Array<{ dir: string; servers: Record<string, any> }> = [];
	spawn.mockImplementation(((command: string, args: string[], options: any) => {
		if (command === bin) {
			assert.equal(privateConfigs().length, 1);
			observed.push(privateConfigs()[0]);
		}
		return spawnProcess(command, args, options);
	}) as typeof childProcess.spawn);
	assert.deepEqual(await s.turn("acp-lazy-owned"), []);
	await s.emit("session_shutdown");
	assert.equal(fs.existsSync(observed[0].dir), false);
	await s.emit("session_start", { reason: "resume" });
	assert.deepEqual(await s.turn("acp-lazy-owned"), []);
	const wire = fs.readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line));
	const opens = wire.filter((r) => r.method === "session/new" || r.method === "session/load");
	assert.deepEqual(opens.map((r) => r.method), ["session/new", "session/load"]);
	assert.equal(observed.length, 2);
	const name = Object.keys(observed[0].servers)[0];
	assert.match(name, /^pi-agy-[0-9a-f]{8}$/);
	assert.equal(Object.keys(observed[1].servers)[0], name, "resume preserves the instance-owned name");
	for (const [i, request] of opens.entries()) {
		const endpoint = observed[i].servers[name];
		assert.deepEqual(request.params.mcpServers, [{ name, type: "http", url: endpoint.serverUrl, headers: [{ name: "x-bridge-token", value: endpoint.headers["x-bridge-token"] }] }]);
	}
});

test("shutdown during the deferred version check cancels later startup and leaves no child process", async () => {
	const spawn = fixture();
	const bin = process.env.AGY_BIN!;
	fs.writeFileSync(bin, fs.readFileSync(bin, "utf8").replace(
		"console.log('1.2.14'); process.exit(0);",
		"console.log('1.2.14'); await new Promise(r => setTimeout(r, 250)); process.exit(0);",
	));
	fs.rmSync(path.join(os.homedir(), ".pi", "agent", "antigravity-bridge", "models-cache.json"), { force: true });
	let started!: () => void;
	const versionStarted = new Promise<void>((resolve) => { started = resolve; });
	const children: childProcess.ChildProcess[] = [];
	spawn.mockImplementation(((command: string, args: string[], options: any) => {
		const child = spawnProcess(command, args, options);
		children.push(child);
		if (args.includes("--version")) child.stdout!.once("data", started);
		return child;
	}) as typeof childProcess.spawn);
	const s = session("anthropic");
	await extension(s.pi);
	const turn = s.turn("shutdown-during-version");
	await versionStarted;
	await s.emit("session_shutdown");
	assert.match((await turn).join("\n"), /shut down during startup/);
	assert.equal(spawn.mock.calls.filter(([, args]) => args?.includes("models")).length, 0, "cancelled startup must not begin a catalog subprocess");
	assert.equal(privateConfigs().length, 0);
	for (const child of children) assert.ok(child.exitCode !== null || child.signalCode !== null, "owned subprocess exited before shutdown returned");
	assert.match((await s.turn("shutdown-refused")).join("\n"), /shut down/);
});

test("shutdown during MCP bind closes the late bridge and refuses the waiting stream", async () => {
	const spawn = fixture();
	const realListen = http.Server.prototype.listen;
	let release!: () => void;
	let reportBound!: () => void;
	let boundServer: http.Server | undefined;
	const bound = new Promise<void>((resolve) => { reportBound = resolve; });
	vi.spyOn(http.Server.prototype, "listen").mockImplementation(function(this: http.Server, ...args: any[]) {
		const callback = args[args.length - 1] as () => void;
		args[args.length - 1] = () => {
			boundServer = this;
			let released = false;
			release = () => { if (!released) { released = true; callback(); } };
			reportBound();
		};
		return Reflect.apply(realListen, this, args);
	});
	const s = session();
	await extension(s.pi);
	const startup = s.emit("session_start");
	try {
		await bound;
		const turn = s.turn("late-bridge");
		const shutdown = s.emit("session_shutdown");
		release();
		await Promise.all([startup, shutdown]);
		assert.match((await turn).join("\n"), /shut down during startup/);
		assert.equal(boundServer!.listening, false, "late-bound endpoint was closed");
		assert.equal(privateConfigs().length, 0);
		assert.equal(spawn.mock.calls.filter(([, args]) => args?.includes("--input-format")).length, 0);
		for (const result of spawn.mock.results) if (result.type === "return") {
			const child = result.value as childProcess.ChildProcess;
			assert.ok(child.exitCode !== null || child.signalCode !== null);
		}
	} finally { release?.(); }
});

test("private discovery diagnoses a live legacy-global bridge once and sweeps only dead owners", async () => {
	fixture();
	const globalFile = mcpConfigPath();
	const liveName = `pi-bridge-${process.pid}-deadbeef`;
	const deadName = "pi-bridge-2147483647-deadbeef";
	const liveEntry = { disabled: true, serverUrl: "http://127.0.0.1:1234/mcp" };
	const foreignEntry = { disabled: false, command: "foreign-mcp" };
	fs.mkdirSync(path.dirname(globalFile), { recursive: true });
	fs.writeFileSync(globalFile, JSON.stringify({ mcpServers: { [liveName]: liveEntry, [deadName]: {}, foreign: foreignEntry, "pi-bridge-foreign": foreignEntry } }));
	const s = session();
	s.ctx.hasUI = true;
	await extension(s.pi);
	await s.emit("session_start");
	await s.emit("model_select", { model: { provider: "antigravity" } });
	await s.emit("session_shutdown");
	await s.emit("session_start", { reason: "resume" });
	const remaining = JSON.parse(fs.readFileSync(globalFile, "utf8")).mcpServers;
	assert.deepEqual(remaining, { [liveName]: liveEntry, foreign: foreignEntry, "pi-bridge-foreign": foreignEntry });
	assert.equal(s.notices.filter((message) => message.includes("Mixed discovery modes")).length, 1);
});

test("owned shutdown removes only its descriptor cache after termination, preserving siblings and old caches", async () => {
	const spawn = fixture();
	const a = session(); const b = session();
	await extension(a.pi); await extension(b.pi);
	await a.emit("session_start");
	const ownName = Object.keys(privateConfigs()[0].servers)[0];
	assert.match(ownName, /^pi-agy-[0-9a-f]{8}$/);
	await b.emit("session_start");
	const siblingName = privateConfigs().flatMap((config) => Object.keys(config.servers)).find((name) => name !== ownName)!;
	const cacheRoot = path.join(os.homedir(), ".gemini", "antigravity-cli", "mcp");
	const names = [ownName, siblingName, "pi-bridge-123-old", "foreign-server"];
	for (const name of names) {
		fs.mkdirSync(path.join(cacheRoot, name), { recursive: true });
		fs.writeFileSync(path.join(cacheRoot, name, "tool.json"), name);
	}
	assert.deepEqual(await a.turn("cache-owner"), []);
	assert.deepEqual(await b.turn("cache-sibling"), []);
	const launches = spawn.mock.calls.flatMap(([, args], index) => args?.includes("--input-format") ? [index] : []);
	assert.equal(launches.length, 2);
	const children = launches.map((index) => spawn.mock.results[index].value as childProcess.ChildProcess);
	const rmSync = fs.rmSync;
	let terminatedAtCacheRemoval = false;
	vi.spyOn(fs, "rmSync").mockImplementation((file, options) => {
		if (String(file) === path.join(cacheRoot, ownName)) terminatedAtCacheRemoval = children[0].exitCode !== null || children[0].signalCode !== null;
		return rmSync(file, options);
	});
	await a.emit("session_shutdown");
	assert.equal(terminatedAtCacheRemoval, true, "descriptor removal waits for the owned driver to terminate");
	assert.equal(fs.existsSync(path.join(cacheRoot, ownName)), false);
	for (const name of names.slice(1)) assert.equal(fs.readFileSync(path.join(cacheRoot, name, "tool.json"), "utf8"), name);
	assert.equal(children[1].exitCode, null, "sibling driver remains alive");
	assert.equal(children[1].signalCode, null);
	assert.deepEqual(privateConfigs().flatMap((config) => Object.keys(config.servers)), [siblingName]);
	await b.emit("session_shutdown");
	assert.equal(fs.existsSync(path.join(cacheRoot, siblingName)), false);
	for (const name of names.slice(2)) assert.equal(fs.readFileSync(path.join(cacheRoot, name, "tool.json"), "utf8"), name);
});

test("legacy-global shutdown removes only its acquired unique descriptor cache, preserving shared and sibling caches", async () => {
	fixture();
	vi.stubEnv("AGY_BRIDGE_DISCOVERY", "legacy-global");
	const a = session(); const b = session();
	await extension(a.pi); await extension(b.pi);
	await a.emit("session_start");
	const ownName = Object.keys(JSON.parse(fs.readFileSync(mcpConfigPath(), "utf8")).mcpServers)[0];
	assert.match(ownName, /^pi-bridge-\d+-[0-9a-f-]+$/);
	await b.emit("session_start");
	const siblingName = Object.keys(JSON.parse(fs.readFileSync(mcpConfigPath(), "utf8")).mcpServers).find((name) => name !== ownName)!;
	const cacheRoot = path.join(os.homedir(), ".gemini", "antigravity-cli", "mcp");
	const names = [ownName, siblingName, "pi-antigravity-bridge", "pi-bridge", "pi-bridge-123-old", "foreign-server"];
	for (const name of names) {
		fs.mkdirSync(path.join(cacheRoot, name), { recursive: true });
		fs.writeFileSync(path.join(cacheRoot, name, "tool.json"), name);
	}
	await a.emit("session_shutdown");
	assert.equal(fs.existsSync(path.join(cacheRoot, ownName)), false);
	for (const name of names.slice(1)) assert.equal(fs.readFileSync(path.join(cacheRoot, name, "tool.json"), "utf8"), name);
	assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(mcpConfigPath(), "utf8")).mcpServers), [siblingName]);
	// A repeated shutdown must not reacquire an old cache with the same name.
	fs.mkdirSync(path.join(cacheRoot, ownName));
	fs.writeFileSync(path.join(cacheRoot, ownName, "tool.json"), "not reacquired");
	await a.emit("session_shutdown");
	assert.equal(fs.readFileSync(path.join(cacheRoot, ownName, "tool.json"), "utf8"), "not reacquired");
	await b.emit("session_shutdown");
	assert.equal(fs.existsSync(path.join(cacheRoot, siblingName)), false);
	for (const name of names.slice(2)) assert.equal(fs.readFileSync(path.join(cacheRoot, name, "tool.json"), "utf8"), name);
});

test.each(["private", "legacy-global"])("non-antigravity shutdown deletes no descriptor cache (%s)", async (discovery) => {
	const spawn = fixture();
	vi.stubEnv("AGY_BRIDGE_DISCOVERY", discovery);
	const cacheRoot = path.join(os.homedir(), ".gemini", "antigravity-cli", "mcp");
	const names = ["pi-antigravity-bridge", "pi-bridge", "pi-agy-deadbeef", "pi-bridge-123-old", "foreign-server"];
	for (const name of names) {
		fs.mkdirSync(path.join(cacheRoot, name), { recursive: true });
		fs.writeFileSync(path.join(cacheRoot, name, "tool.json"), name);
	}
	const s = session("anthropic");
	await extension(s.pi);
	await s.emit("session_start");
	const removal = vi.spyOn(fs, "rmSync");
	await s.emit("session_shutdown");
	assert.deepEqual(removal.mock.calls.filter(([file]) => String(file).startsWith(cacheRoot + path.sep)), [], "no descriptor key was acquired");
	for (const name of names) assert.equal(fs.readFileSync(path.join(cacheRoot, name, "tool.json"), "utf8"), name);
	assert.equal(spawn.mock.calls.length, 0);
	assert.equal(privateConfigs().length, 0);
	assert.equal(fs.existsSync(mcpConfigPath()), false);
});

test("legacy-global ACP shutdown preserves shared descriptor caches", async () => {
	fixture();
	const dir = path.dirname(process.env.AGY_BIN!);
	const bin = path.join(dir, "acp.mjs");
	const log = path.join(dir, "acp-wire.jsonl");
	fs.writeFileSync(bin, "// pi-test-node-fixture\n" + fs.readFileSync(path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs"), "utf8"));
	vi.stubEnv("AGY_ENGINE", "acp");
	vi.stubEnv("AGY_ACP_BIN", bin);
	vi.stubEnv("ACP_FAKE_LOG", log);
	vi.stubEnv("AGY_BRIDGE_DISCOVERY", "legacy-global");
	const s = session();
	await extension(s.pi);
	await s.emit("session_start");
	const cacheRoot = path.join(os.homedir(), ".gemini", "antigravity-cli", "mcp");
	const names = ["pi-antigravity-bridge", "pi-bridge", "pi-agy-deadbeef", "foreign-server"];
	for (const name of names) {
		fs.mkdirSync(path.join(cacheRoot, name), { recursive: true });
		fs.writeFileSync(path.join(cacheRoot, name, "tool.json"), name);
	}
	assert.deepEqual(await s.turn("legacy-acp-cache"), []);
	const opens = fs.readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line)).filter((request) => request.method === "session/new");
	assert.equal(opens[0].params.mcpServers[0].name, "pi-bridge");
	const removal = vi.spyOn(fs, "rmSync");
	await s.emit("session_shutdown");
	assert.deepEqual(removal.mock.calls.filter(([file]) => String(file).startsWith(cacheRoot + path.sep)), []);
	for (const name of names) assert.equal(fs.readFileSync(path.join(cacheRoot, name, "tool.json"), "utf8"), name);
	assert.equal(fs.existsSync(mcpConfigPath()), false);
});

test("refused legacy-global registration acquires no descriptor cache key", async () => {
	fixture();
	vi.stubEnv("AGY_BRIDGE_DISCOVERY", "legacy-global");
	const configFile = mcpConfigPath();
	fs.mkdirSync(path.dirname(configFile), { recursive: true });
	fs.writeFileSync(configFile, "invalid JSON");
	const s = session();
	await extension(s.pi);
	await s.emit("session_start");
	const unregisteredName = path.basename(privateConfigs()[0].dir).replace("agy-mcp-", "pi-bridge-");
	const cacheRoot = path.join(os.homedir(), ".gemini", "antigravity-cli", "mcp");
	const names = [unregisteredName, "pi-antigravity-bridge", "pi-bridge", "foreign-server"];
	for (const name of names) {
		fs.mkdirSync(path.join(cacheRoot, name), { recursive: true });
		fs.writeFileSync(path.join(cacheRoot, name, "tool.json"), name);
	}
	const removal = vi.spyOn(fs, "rmSync");
	await s.emit("session_shutdown");
	assert.deepEqual(removal.mock.calls.filter(([file]) => String(file).startsWith(cacheRoot + path.sep)), []);
	for (const name of names) assert.equal(fs.readFileSync(path.join(cacheRoot, name, "tool.json"), "utf8"), name);
	assert.equal(fs.readFileSync(configFile, "utf8"), "invalid JSON");
});

test("root /new and resume recycle drivers and restage the same owned bridge without reviving stopped turns", async () => {
	const spawn = fixture();
	const s = session();
	await extension(s.pi);
	await s.emit("session_start");
	const original = privateConfigs()[0];
	const name = Object.keys(original.servers)[0];
	assert.deepEqual(await s.turn("root-original"), []);
	await s.emit("session_shutdown");
	assert.equal(fs.existsSync(original.dir), false);
	assert.match((await s.turn("root-stopped")).join("\n"), /shut down/);
	await assert.rejects(s.emit("model_select", { model: { provider: "antigravity" } }), /shut down/);
	await s.emit("session_start", { reason: "new" });
	const fresh = privateConfigs()[0];
	assert.equal(fresh.dir, original.dir);
	assert.deepEqual(Object.keys(fresh.servers), [name]);
	assert.notEqual(fresh.servers[name].headers["x-bridge-token"], original.servers[name].headers["x-bridge-token"]);
	assert.deepEqual(await s.turn("root-new"), []);
	const shutdown = s.emit("session_shutdown");
	// session_start may arrive before the preceding owned teardown has finished.
	const resume = s.emit("session_start", { reason: "resume" });
	await Promise.all([shutdown, resume]);
	assert.deepEqual(await s.turn("root-original"), []);
	assert.deepEqual(privateConfigs().flatMap((config) => Object.keys(config.servers)), [name]);
	const launches = spawn.mock.calls.filter(([, args]) => args?.includes("--input-format"));
	assert.equal(launches.length, 3);
	assert.equal(launches[1][1]!.includes("--conversation"), false, "/new uses a fresh Pi session binding");
	const resumeArgs = launches[2][1]!;
	assert.equal(resumeArgs[resumeArgs.indexOf("--conversation") + 1], "conv-lazy");
	assert.equal(spawn.mock.calls.filter(([, args]) => args?.includes("--version")).length, 1);
});
