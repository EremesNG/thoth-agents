import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import * as childProcess from "node:child_process";
import { afterEach, test, vi } from "vitest";
import { normalizeContext, type Api, type Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../extensions/index.js";
import { saveConfig } from "../src/config.js";
import { mcpConfigPath } from "../src/mcp-registration.js";

vi.mock("../src/patch-cleanup.js", () => ({ patchStatus: () => ({ present: false }), restorePatch: () => ({}) }));

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

function session(providerName = "antigravity") {
	const handlers = new Map<string, Array<(...args: any[]) => any>>();
	let provider: any;
	const notices: string[] = [];
	const ctx = { hasUI: false, mode: "rpc", model: { provider: providerName }, isProjectTrusted: () => false,
		ui: { notify: (message: string) => notices.push(message) } };
	const pi = {
		on: (name: string, fn: (...args: any[]) => any) => handlers.set(name, [...handlers.get(name) ?? [], fn]),
		registerProvider: (_name: string, config: any) => { provider = config; },
		registerTool: () => {}, registerCommand: () => {}, registerEntryRenderer: () => {},
		getAllTools: () => [], getActiveTools: () => [],
	} as unknown as ExtensionAPI;
	const s = {
		pi, ctx, notices,
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
	assert.ok(names.every((name) => /^pi-agy-[a-f0-9]+$/.test(name) && name.length <= 40));
	assert.equal(fs.existsSync(mcpConfigPath()), false);
	await a.emit("session_start", { reason: "resume" });
	assert.equal(privateConfigs().length, 2);
	assert.equal(spawn.mock.calls.filter(([, args]) => args?.includes("--version")).length, 1);
	assert.deepEqual(await a.turn(), []);
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
