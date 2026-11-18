import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import * as childProcess from "node:child_process";
import * as ownedProcess from "../src/owned-process.js";
import { randomUUID } from "node:crypto";
import { beforeAll, afterEach, expect, test, vi } from "vitest";
import { invalidatableContext } from '../../pi-core/test/owned-overlay-fixture.js';
import { warmJobLauncher } from "./helpers/warm-job-launcher.js";
import { normalizeContext, type Api, type Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerRenderKit, withdrawRenderKit } from "@thoth-agents/pi-core";
import { createTestRenderKit } from "@thoth-agents/pi-core/testing";
import extension from "../extensions/index.js";
import { CONFIG_PATH, loadConfig, saveConfig } from "../src/config.js";
import { mcpConfigPath } from "../src/mcp-registration.js";
import { agyConversationDir } from "../src/agy-paths.js";
import { TOKEN_HEADER } from "../src/mcp-server.js";
import { GATE_MARKER } from "../src/approval-gate.js";
import { ToolRoundTrips, POLL_TOOL_NAME, type PollView } from "../src/provider.js";
import * as providerModule from "../src/provider.js";
import { StreamDriver } from "../src/driver.js";
import type { TurnOutcome } from "../src/driver-types.js";
import { withoutUnhandledRejections } from "./helpers/unhandled-rejections.js";

// Each isolated file owns a fresh Windows job helper.
beforeAll(warmJobLauncher, 60_000);

vi.mock("node:crypto", async (original) => {
	const actual = await original<typeof import("node:crypto")>();
	return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

const sessions: Array<{ emit: (name: string, event?: any) => Promise<void> }> = [];
const dirs: string[] = [];
const spawnProcess = childProcess.spawn;
const spawnOwned = ownedProcess.spawnOwnedProcess;
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
		ui: { notify: (message: string): void => { notices.push(message); }, setStatus: (_key: string, _text?: string): void => {} } };
	const pi = {
		on: (name: string, fn: (...args: any[]) => any) => handlers.set(name, [...handlers.get(name) ?? [], fn]),
		registerProvider: (_name: string, config: any) => { provider = config; },
		registerTool: () => {}, registerCommand: (name: string, command: any) => commands.set(name, command), registerEntryRenderer: () => {},
		getAllTools: () => tools, getActiveTools: () => tools.map((tool) => tool.name),
	} as unknown as ExtensionAPI;
	const s = {
		pi, ctx, notices, commands,
		command: (args: string, ui: any = ctx.ui) => commands.get("agy").handler(args, { ...ctx, ui }),
		emit: async (name: string, event: any = { reason: "startup" }, eventCtx: any = ctx) => {
			for (const fn of handlers.get(name) ?? []) await fn(event, eventCtx);
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
if (process.argv.includes('--version')) { console.log('1.5.8'); process.exit(0); }
if (process.argv.includes('models')) { console.log('gemini-3.6-flash-low Gemini 3.6 Flash (Low)'); process.exit(0); }
for await (const line of readline.createInterface({input:process.stdin})) {
 console.log(JSON.stringify({event:'init',init:{conversation_id:'conv-lazy'}}));
 console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:'ok',conversation_id:'conv-lazy'}}));
}
`, { mode: 0o755 }); // executable: AGY_ACP_BIN reuse requires X_OK on POSIX, else ACP auto-setup downloads for real
	vi.stubEnv("HOME", os.homedir());
	vi.stubEnv("USERPROFILE", os.homedir());
	vi.stubEnv("AGY_BIN", bin);
	vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH}`);
	vi.stubEnv("AGY_ENGINE", "stream-json");
	vi.stubEnv("AGY_BRIDGE_DISCOVERY", "private");
	vi.stubEnv("AGY_ASK_TOOL", "0");
	saveConfig({ askTool: false, webTools: false, bridgeTools: "all", approvals: { gateMode: "off", mode: "deny" } });
	vi.spyOn(ownedProcess, "spawnOwnedProcess");
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
])("$engine/$discovery: direct-schema and bridge-local name omissions reach headless stderr once with the actual discovery name", async ({ engine, discovery }) => {
	fixture();
	vi.stubEnv("AGY_ENGINE", engine);
	vi.stubEnv("AGY_BRIDGE_DISCOVERY", discovery);
	if (engine === "stream-json" && discovery === "legacy-global") vi.stubEnv("AGY_AGENTS_ROOT", path.join(os.homedir(), "agents"));
	if (engine === "acp") {
		const bin = path.join(path.dirname(process.env.AGY_BIN!), "acp.mjs");
		fs.writeFileSync(bin, "// pi-test-node-fixture\n" + fs.readFileSync(path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs"), "utf8"), { mode: 0o755 });
		vi.stubEnv("AGY_BIN", bin);
	}
	const stderr: string[] = [];
	vi.spyOn(console, "error").mockImplementation((...args) => { stderr.push(args.join(" ")); });
	const object = { type: "object", properties: { action: { type: "string" } } };
	const union = { definitions: { action: object }, anyOf: [{ $ref: "#/definitions/action" }, { type: "object" }] };
	const overlongName = "x".repeat(51);
	const s = session("antigravity", [
		{ name: "read", description: "plain", parameters: object },
		{ name: "edit", description: "union", parameters: union },
		{ name: "write", description: "unsupported", parameters: { type: "string" } },
		{ name: "agent_browser_electron", description: "22-char browser tool", parameters: object },
		{ name: "agent_browser_network_source", description: "28-char browser tool", parameters: object },
		{ name: overlongName, description: "overlong", parameters: object },
	]);
	const registerProvider = vi.spyOn(s.pi, "registerProvider");
	await extension(s.pi);
	const advertised = registerProvider.mock.calls[0][1].models!;
	assert.ok(advertised.length > 0);
	for (const model of advertised) assert.deepEqual(model.input, ["text", "image"], `${engine} image input advertised`);
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
		assert.equal(tools.some((tool: any) => tool.name === "write"), false);
		assert.deepEqual(tools.find((tool: any) => tool.name === "read").inputSchema, object);
		assert.deepEqual(tools.find((tool: any) => tool.name === "edit").inputSchema, { type: "object", definitions: { action: object }, anyOf: [{ $ref: "#/definitions/action" }, { type: "object" }] });
		assert.equal(tools.some((tool: any) => tool.name === "agent_browser_electron"), false);
		assert.equal(tools.some((tool: any) => tool.name === "agent_browser_network_source"), false);
		assert.equal(tools.some((tool: any) => tool.name === "bridge_poll_result"), !legacyStream);
		assert.equal(tools.some((tool: any) => tool.name === overlongName), false);
		assert.equal(tools.some((tool: any) => tool.name === "bridge_tool_info"), !legacyStream);
		assert.equal(tools.some((tool: any) => tool.name === "bridge_call_tool"), !legacyStream);
	}
	const omissions = stderr.filter((text) => text.includes("omitted from Antigravity"));
	assert.equal(omissions[0], "[antigravity-bridge] Pi tool write omitted from Antigravity: input schema is not an object or a supported object-only union");
	const omittedNames = legacyStream ? ["bridge_poll_result", "bridge_tool_info", "bridge_call_tool"] : [];
	assert.equal(omissions.length, omittedNames.length + 1, "one headless warning per omitted tool across catalog requests");
	for (const name of omittedNames) {
		const warning = omissions.find((text) => text.includes(`Pi tool ${name} omitted`));
		assert.ok(warning?.includes(`qualified tool name mcp_${discoveryName}_${name}`), "warning uses the engine's actual discovery name");
		assert.match(warning!, /characters \(maximum 64\)/);
	}
	assert.deepEqual(s.notices, [], "headless output must not depend on UI notifications");
	assert.equal("type" in union, false, "Pi's validation schema stays original");
});

function pendingOverlay(invalidate: () => void) {
  const complete = vi.fn();
  const custom = vi.fn((factory: any) => new Promise((resolve) => {
    factory({ requestRender() {} }, {
      fg: (_role: string, text: string) => text, bold: (text: string) => text,
    }, {}, (result: unknown) => {
      complete(result);
      invalidate();
      resolve(result);
    });
  }));
  return { custom, complete };
}

test.each(['engine', 'tasks', 'artifacts'])('/agy %s settles on reload and safely resumes after context invalidation', async (command) => {
  fixture();
  const s = session(command === 'engine' ? 'other' : 'antigravity');
  await extension(s.pi);
  await s.emit('session_start');
  if (command !== 'engine') {
    assert.deepEqual(await s.turn(), []);
    const dir = agyConversationDir('stream-json', 'conv-lazy');
    fs.mkdirSync(path.join(dir, '.system_generated', 'tasks'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'report.md'), 'offline artifact');
    fs.writeFileSync(path.join(dir, '.system_generated', 'tasks', 'task-1.log'), 'offline task');
    dirs.push(dir);
  }
  const before = fs.readFileSync(CONFIG_PATH, 'utf8');
  const { ctx, invalidate } = invalidatableContext({ ...s.ctx, mode: 'tui', hasUI: true });
  const { custom, complete } = pendingOverlay(invalidate);
  Object.assign(s.ctx.ui, { custom });
  const commandResult = s.commands.get('agy').handler(command, ctx);
  const settled = vi.fn();
  void commandResult.then(settled, settled);
  await vi.waitFor(() => expect(custom).toHaveBeenCalledTimes(1));
  await s.emit('session_shutdown', { reason: 'reload' });
  await vi.waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
  await expect(commandResult).resolves.toBeUndefined();
  expect(complete).toHaveBeenCalledExactlyOnceWith(undefined);
  expect(custom).toHaveBeenCalledTimes(1);
  expect(fs.readFileSync(CONFIG_PATH, 'utf8')).toBe(before);
});

test('first-run picker cancellation on reload does not read the invalidated startup context', async () => {
  fixture();
  const s = session('other');
  await extension(s.pi);
  vi.stubEnv('AGY_ENGINE', undefined);
  fs.rmSync(CONFIG_PATH, { force: true });
  const { ctx, invalidate } = invalidatableContext({ ...s.ctx, mode: 'tui', hasUI: true });
  const { custom, complete } = pendingOverlay(invalidate);
  Object.assign(s.ctx.ui, { custom });
  const start = s.emit('session_start', { reason: 'startup' }, ctx);
  const settled = vi.fn();
  void start.then(settled, settled);
  await vi.waitFor(() => expect(custom).toHaveBeenCalledTimes(1));
  await s.emit('session_shutdown', { reason: 'reload' });
  await vi.waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
  await expect(start).resolves.toBeUndefined();
  expect(complete).toHaveBeenCalledExactlyOnceWith(undefined);
  expect(fs.existsSync(CONFIG_PATH)).toBe(false);
});

test("/agy help ends with supported runtime commands", async () => {
	fixture();
	const s = session("other");
	await extension(s.pi);
	assert.ok(s.commands.get("agy").description.endsWith("|clear]"));
	await s.command("");
	assert.ok(s.notices.at(-1)?.endsWith("/agy clear, /agy doctor"));
	await s.command("clear");
	assert.equal(s.notices.at(-1), "Cleared all antigravity session bindings.");
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
	assert.deepEqual(spawn.mock.calls[0], ["xdg-open", [fs.realpathSync.native(path.join(dir, "report.md"))], {
		detached: true, stdio: "ignore", shell: false, windowsHide: true,
	}]);
	assert.equal(unref.mock.calls.length, 1);
});

test.each(["auth", "auth-manual"])("/agy %s only prints shared CLI sign-in instructions", async (args) => {
 fixture();
 const s = session();
 await extension(s.pi);
 const before = vi.mocked(ownedProcess.spawnOwnedProcess).mock.calls.length;
 const fetch = vi.spyOn(globalThis, "fetch");
 await s.command(args);
 assert.match(s.notices.at(-1) ?? "", /agy.*terminal.*Google sign-in/s);
 assert.match(s.notices.at(-1) ?? "", /antigravity.google/);
 assert.equal(vi.mocked(ownedProcess.spawnOwnedProcess).mock.calls.length, before);
 assert.equal(fetch.mock.calls.length, 0);
});

test("startup retires the managed build, preserves credentials, and warns about AGY_ACP_BIN once", async () => {
 fixture(); vi.stubEnv("AGY_ACP_BIN", "/retired/server");
 const root = path.join(os.homedir(), ".local", "opt", "agy-acp");
 const build = path.join(root, "old-build");
 fs.mkdirSync(build, { recursive: true });
 fs.writeFileSync(path.join(build, "agy_acp_server.par"), "old");
 fs.writeFileSync(path.join(build, "zip.sha256"), "marker");
 const credentials = path.join(os.homedir(), ".gemini", "antigravity-acp", "acp_token.json");
 fs.mkdirSync(path.dirname(credentials), { recursive: true }); fs.writeFileSync(credentials, "preserve-me");
 dirs.push(root, path.dirname(credentials));
 const output: string[] = [];
 vi.spyOn(console, "error").mockImplementation((...args) => { output.push(args.join(" ")); });
 const s = session("other"); await extension(s.pi);
 await s.emit("session_start"); await s.emit("session_start", { reason: "resume" });
 assert.equal(fs.existsSync(build), false);
 assert.equal(fs.readFileSync(credentials, "utf8"), "preserve-me");
 assert.equal(output.filter((line) => line.includes("AGY_ACP_BIN")).length, 1);
 assert.ok(output.some((line) => line.includes("antigravity-acp") && /manual/i.test(line)));
});

test.each(["stream-json", "acp"])("missing CLI on %s only prints instructions in UI and headless", async (engine) => {
 fixture(); vi.stubEnv("AGY_ENGINE", engine); vi.stubEnv("AGY_BIN", path.join(os.homedir(), "missing-agy"));
 const output: string[] = [];
 vi.spyOn(console, "error").mockImplementation((...args) => { output.push(args.join(" ")); });
 const spawn = vi.mocked(ownedProcess.spawnOwnedProcess);
 const fetch = vi.spyOn(globalThis, "fetch");
 const a = session(); await extension(a.pi); await a.emit("session_start");
 assert.ok(output.some((line) => line.includes("not installed") && line.includes("https://antigravity.google")));
 const b = session(); b.ctx.hasUI = true; await extension(b.pi); await b.emit("session_start");
 assert.ok(b.notices.some((line) => line.includes("not installed") && line.includes("https://antigravity.google")));
 assert.equal(spawn.mock.calls.length, 0);
 assert.equal(fetch.mock.calls.length, 0);
});

test.each(["stream-json", "acp"])("%s private siblings isolate MCP homes using acquired names", async (engine) => {
 fixture(); vi.stubEnv("AGY_ENGINE", engine);
 if (engine === "acp") {
  const bin = path.join(path.dirname(process.env.AGY_BIN!), "acp.mjs");
  fs.writeFileSync(bin, `// pi-test-node-fixture
${fs.readFileSync(path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs"), "utf8")}`); vi.stubEnv("AGY_BIN", bin);
 }
 fs.mkdirSync(path.dirname(mcpConfigPath()), { recursive: true });
 fs.writeFileSync(mcpConfigPath(), JSON.stringify({ mcpServers: { "pi-agy-deadbeef": {}, "pi-bridge": {}, [`pi-bridge-${process.pid}-abcdef`]: {}, unrelated: { command: "keep" } } }));
 const observed: Array<{ home: string; servers: Record<string, unknown> }> = [];
 vi.mocked(ownedProcess.spawnOwnedProcess).mockImplementation((file, args, options) => {
  const home = args[args.indexOf(engine === "acp" ? "--gemini-dir" : "--gemini_dir") + 1];
  if (home) observed.push({ home, servers: JSON.parse(fs.readFileSync(path.join(home, "config", "mcp_config.json"), "utf8")).mcpServers });
  return spawnOwned(file, args, options);
 });
 const a = session("other"), b = session("other"); await extension(a.pi); await extension(b.pi);
 assert.deepEqual(await a.turn("isolation-a"), []); assert.deepEqual(await b.turn("isolation-b"), []);
 assert.equal(observed.length, 2); assert.notEqual(observed[0].home, observed[1].home);
 const ownNames = observed.map(({ servers }) => Object.keys(servers).find((name) => name.startsWith("pi-agy-"))!);
 assert.notEqual(ownNames[0], ownNames[1]);
 for (const [i, { servers }] of observed.entries()) assert.deepEqual(Object.keys(servers).sort(), [ownNames[i], "unrelated"].sort());
 await a.emit("session_shutdown"); assert.equal(fs.existsSync(observed[0].home), false); assert.equal(fs.existsSync(observed[1].home), true);
 await b.emit("session_shutdown"); assert.equal(fs.existsSync(observed[1].home), false);
});

test.each([
 ["private", "probe"], ["private", "stage"], ["legacy-global", "probe"], ["legacy-global", "stage"],
] as const)("stream-json %s %s failure keeps its mode-qualified fallback", async (discovery, failure) => {
 fixture(); vi.stubEnv("AGY_BRIDGE_DISCOVERY", discovery);
 if (failure === "probe") {
  const bin = process.env.AGY_BIN!;
  fs.writeFileSync(bin, fs.readFileSync(bin, "utf8").replace("if (process.argv.includes('--version'))", `if (process.argv.includes('--gemini_dir') && process.argv.includes('--version')) { console.error('flag not defined'); process.exit(2); }
if (process.argv.includes('--version'))`));
 } else {
  const base = path.join(os.homedir(), ".pi", "agent", "antigravity-bridge", "acp-homes");
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(base), { recursive: true }); fs.writeFileSync(base, "block staging"); dirs.push(base);
 }
 const output: string[] = []; vi.spyOn(console, "error").mockImplementation((...args) => { output.push(args.join(" ")); });
 const s = session("other"); await extension(s.pi); assert.deepEqual(await s.turn(), []);
 const calls = vi.mocked(ownedProcess.spawnOwnedProcess).mock.calls; assert.equal(calls.length, 1); assert.equal(calls[0][1].includes("--gemini_dir"), false);
 assert.ok(output.some((line) => /isolation/i.test(line) && line.includes(discovery === "private" ? "additive private" : "global registration")));
 const keys = fs.existsSync(mcpConfigPath()) ? Object.keys(JSON.parse(fs.readFileSync(mcpConfigPath(), "utf8")).mcpServers) : [];
 assert.equal(keys.some((name) => name.startsWith("pi-bridge-")), discovery === "legacy-global");
 if (discovery === "private") assert.ok(calls[0][1].some((arg) => arg.startsWith(path.dirname(CONFIG_PATH)) && arg.includes("agy-mcp-")));
});

test("ACP staging failure fails the native turn visibly without an agent launch", async () => {
 fixture(); vi.stubEnv("AGY_ENGINE", "acp");
 const base = path.join(os.homedir(), ".pi", "agent", "antigravity-bridge", "acp-homes");
 fs.rmSync(base, { recursive: true, force: true });
 fs.mkdirSync(path.dirname(base), { recursive: true }); fs.writeFileSync(base, "block staging"); dirs.push(base);
 const s = session("other"); await extension(s.pi);
 assert.match((await s.turn()).join(" "), /isolat|staging|EEXIST/i);
 assert.equal(vi.mocked(ownedProcess.spawnOwnedProcess).mock.calls.length, 0);
});

test.each(["stream-json", "acp"])("%s AGY_AGENTS_ROOT skips isolation and the capability probe", async (engine) => {
 fixture(); vi.stubEnv("AGY_ENGINE", engine); vi.stubEnv("AGY_AGENTS_ROOT", path.join(os.homedir(), "agents"));
 if (engine === "acp") {
  const bin = path.join(path.dirname(process.env.AGY_BIN!), "acp.mjs");
  fs.writeFileSync(bin, `// pi-test-node-fixture
${fs.readFileSync(path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs"), "utf8")}`); vi.stubEnv("AGY_BIN", bin);
 }
 const s = session("other"); await extension(s.pi); assert.deepEqual(await s.turn(), []);
 const args = vi.mocked(ownedProcess.spawnOwnedProcess).mock.calls[0][1];
 assert.equal(args.includes("--gemini_dir") || args.includes("--gemini-dir"), false);
 if (engine === "acp") assert.equal(args.includes("--agent"), false);
 assert.equal(vi.mocked(childProcess.spawn).mock.calls.some(([, argv]) => argv?.includes("--gemini_dir")), false);
});

test("startup sweeps dead-owner homes even without starting a bridge, preserving current-process siblings", async () => {
 fixture();
 const base = path.join(os.homedir(), ".pi", "agent", "antigravity-bridge", "acp-homes");
 const dead = path.join(base, "agy-home-2147483647-dead"); const live = path.join(base, `acp-home-${process.pid}-sibling`);
 fs.mkdirSync(dead, { recursive: true }); fs.mkdirSync(live, { recursive: true }); dirs.push(base);
 const s = session("other"); await extension(s.pi); await s.emit("session_start");
 assert.equal(fs.existsSync(dead), false); assert.equal(fs.existsSync(live), true);
 assert.equal(privateConfigs().length, 0);
});

test.each(["stream-json", "acp"])("doctor shows the %s CLI floor without treating ACP's CLI as optional", async (engine) => {
 fixture(); vi.stubEnv("AGY_ENGINE", engine);
 const bin = process.env.AGY_BIN!; fs.writeFileSync(bin, fs.readFileSync(bin, "utf8").replace("1.5.8", "1.5.2"));
 const s = session("other"); await extension(s.pi); await s.command("doctor");
 const notice = s.notices.at(-1) ?? "";
 assert.ok(notice.includes(engine === "acp" ? "min 1.5.3" : "min 1.1.22"));
 assert.equal(notice.includes("TOO OLD"), engine === "acp"); assert.equal(notice.includes("optional here"), false);
});

test("private model-at-start writes unique private discovery, no global entries, and reuses it on resume", async () => {
	const spawn = fixture();
	const a = session(); const b = session();
	await extension(a.pi); await extension(b.pi);
	assert.ok(spawn.mock.calls.every(([, args]) => args?.includes("models")), "loading may only launch catalog discovery");
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
	assert.equal(spawn.mock.calls.filter(([, args]) => args?.includes("--version") && !args.includes("--gemini_dir")).length, 1);
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
	assert.equal(spawn.mock.calls.filter(([, args]) => args?.includes("--version") && !args.includes("--gemini_dir")).length, 1);
	const streamLaunch = vi.mocked(ownedProcess.spawnOwnedProcess).mock.calls.find(([, args]) => args?.includes("--input-format"));
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
	fs.writeFileSync(bin, "// pi-test-node-fixture\n" + fs.readFileSync(path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs"), "utf8"), { mode: 0o755 });
	vi.stubEnv("AGY_ENGINE", "acp");
	vi.stubEnv("AGY_BIN", bin);
	vi.stubEnv("ACP_FAKE_LOG", log);
	const s = session("anthropic");
	await extension(s.pi);
	await s.emit("session_start");
	assert.equal(spawn.mock.calls.length, 0);
	assert.equal(privateConfigs().length, 0);
	// Observe the external process boundary: the private endpoint must already
	// be staged before ACP itself can be launched.
	const observed: Array<{ dir: string; servers: Record<string, any> }> = [];
	vi.mocked(ownedProcess.spawnOwnedProcess).mockImplementation((command, args, options) => {
		if (command === bin) {
			assert.equal(privateConfigs().length, 1);
			observed.push(privateConfigs()[0]);
		}
		return spawnOwned(command, args, options);
	});
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

test("ACP auth failure and shutdown leave a sibling native connection intact", async () => {
 fixture();
 const bin = path.join(path.dirname(process.env.AGY_BIN!), "acp.mjs");
 fs.writeFileSync(bin, "// pi-test-node-fixture\n" + fs.readFileSync(path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs"), "utf8"), { mode: 0o755 });
 vi.stubEnv("AGY_ENGINE", "acp"); vi.stubEnv("AGY_BIN", bin);
 const a = session("other"); const b = session("other");
 await extension(a.pi); await extension(b.pi);
 await Promise.all([a.emit("session_start"), b.emit("session_start")]);
 assert.equal(vi.mocked(ownedProcess.spawnOwnedProcess).mock.calls.length, 0);
 assert.deepEqual(await b.turn("auth-sibling"), []);
 vi.stubEnv("ACP_FAKE_SCENARIO", "auth-required");
 assert.match((await a.turn("auth-owner")).join("\n"), /authentication required/i);
 await b.command("auth");
 assert.match(b.notices.at(-1) ?? "", /agy in your terminal/);
 await a.emit("session_shutdown");
 assert.deepEqual(await b.turn("auth-sibling"), []);
}, 20_000);

test("shutdown during the deferred version check cancels later startup and leaves no child process", async () => {
	const spawn = fixture();
	const bin = process.env.AGY_BIN!;
	fs.writeFileSync(bin, fs.readFileSync(bin, "utf8").replace(
		"console.log('1.5.8'); process.exit(0);",
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
	assert.equal(spawn.mock.calls.filter(([, args]) => args?.includes("models")).length, 1, "missing cache is discovered before registration");
	const turn = s.turn("shutdown-during-version");
	await versionStarted;
	await s.emit("session_shutdown");
	assert.match((await turn).join("\n"), /shut down during startup/);
	assert.equal(spawn.mock.calls.filter(([, args]) => args?.includes("models")).length, 1, "cancelled startup must not begin another catalog subprocess");
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

test("private additive fallback diagnoses a live legacy-global bridge once and sweeps only dead owners", async () => {
	fixture();
	vi.stubEnv("AGY_AGENTS_ROOT", path.join(os.homedir(), "agents"));
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
	const owned = vi.mocked(ownedProcess.spawnOwnedProcess);
 const launches = owned.mock.calls.flatMap(([, args], index) => args?.includes("--input-format") ? [index] : []);
	assert.equal(launches.length, 2);
	const children = launches.map((index) => owned.mock.results[index].value as ownedProcess.OwnedProcess);
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
	vi.stubEnv("AGY_AGENTS_ROOT", path.join(os.homedir(), "agents"));
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
	fs.writeFileSync(bin, "// pi-test-node-fixture\n" + fs.readFileSync(path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs"), "utf8"), { mode: 0o755 });
	vi.stubEnv("AGY_ENGINE", "acp");
	vi.stubEnv("AGY_BIN", bin);
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
	const launches = vi.mocked(ownedProcess.spawnOwnedProcess).mock.calls.filter(([, args]) => args?.includes("--input-format"));
	assert.equal(launches.length, 3);
	assert.equal(launches[1][1]!.includes("--conversation"), false, "/new uses a fresh Pi session binding");
	const resumeArgs = launches[2][1]!;
	assert.equal(resumeArgs[resumeArgs.indexOf("--conversation") + 1], "conv-lazy");
	assert.equal(spawn.mock.calls.filter(([, args]) => args?.includes("--version") && !args.includes("--gemini_dir")).length, 1);
});

test("lazy startFlight has an absolute deadline and late completion cannot publish bridge readiness", async () => {
	const spawn = fixture();
	spawn.mockImplementation((...args: any[]) => {
		if (args[1]?.includes("--version")) return spawnProcess(process.execPath, ["-e", "setTimeout(() => console.log('1.2.14'), 250)"], { stdio: ["ignore", "pipe", "pipe"] });
		return (spawnProcess as any)(...args);
	});
	vi.stubEnv("AGY_STARTUP_TIMEOUT_MS", "20");
	const s = session();
	await extension(s.pi);
	await Promise.race([
		assert.rejects(s.emit("session_start"), /startFlight.*20ms/),
		new Promise((_, reject) => setTimeout(() => reject(new Error("startFlight remained silent")), 200)),
	]);
	await new Promise(r => setTimeout(r, 350));
	assert.deepEqual(privateConfigs(), [], "timed-out startup must not publish discovery after its late check resolves");
});

test("ACP status and native-entry sinks may reject without leaking from event callbacks", async () => {
	const spawn = fixture();
	const bin = path.join(path.dirname(process.env.AGY_BIN!), "acp.mjs");
	fs.writeFileSync(bin, "// pi-test-node-fixture\n" + fs.readFileSync(path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs"), "utf8"), { mode: 0o755 });
	vi.stubEnv("AGY_ENGINE", "acp");
	vi.stubEnv("AGY_BIN", bin);
	vi.stubEnv("ACP_FAKE_SCENARIO", "tool-diff");
	const s = session();
	s.ctx.hasUI = true;
	let statuses = 0;
	let entries = 0;
	s.ctx.ui.setStatus = async () => { statuses++; throw new Error("status sink failed"); };
	s.pi.appendEntry = async () => { entries++; throw new Error("entry sink failed"); };
	await withoutUnhandledRejections(async () => {
		await extension(s.pi);
		await s.emit("session_start");
		assert.deepEqual(await s.turn("rejecting-native-ui"), []);
		assert.ok(statuses > 0);
		assert.equal(entries, 1, "the native entry must reach the rejecting Pi sink");
		await s.emit("message_update", { message: { role: "assistant", provider: "antigravity", usage: { input: 10, output: 20 } } });
		await s.emit("agent_end");
		await s.emit("session_shutdown");
		for (const result of spawn.mock.results) if (result.type === "return") {
			const child = result.value as childProcess.ChildProcess;
			assert.ok(child.exitCode !== null || child.signalCode !== null, "no owned child survives");
		}
	});
});

test("rejecting active UI notifications do not leak unhandled rejections or fail healthy turns", async () => {
	fixture();
	vi.stubEnv("AGY_AGENTS_ROOT", path.join(os.homedir(), "agents"));
	const bin = process.env.AGY_BIN!;
	fs.writeFileSync(bin, fs.readFileSync(bin, "utf8").replace("status:'SUCCESS'", "status:'ERROR'"));
	const globalFile = mcpConfigPath();
	fs.mkdirSync(path.dirname(globalFile), { recursive: true });
	fs.writeFileSync(globalFile, JSON.stringify({ mcpServers: { [`pi-bridge-${process.pid}-deadbeef`]: {} } }));
	const s = session();
	s.ctx.hasUI = true;
	let notices = 0;
	s.ctx.ui.notify = async () => { notices++; throw new Error("notification sink failed"); };
	await withoutUnhandledRejections(async () => {
		await extension(s.pi);
		await s.emit("session_start");
		assert.ok(notices > 0, "the warning must reach the rejecting UI sink");
		assert.equal((await s.turn("rejecting-notification")).length, 1);
		assert.ok(notices >= 2, "both startup and turn-end log warnings must reach the sink");
		fs.writeFileSync(bin, fs.readFileSync(bin, "utf8").replace("status:'ERROR'", "status:'SUCCESS'"));
		assert.deepEqual(await s.turn("rejecting-notification"), []);
		const beforeCommand = notices;
		await s.command("clear");
		assert.equal(notices, beforeCommand + 1, "command notifications are contained too");
		await s.emit("session_shutdown");
	});
});

test("/agy readonly toggles and reports the kill switch without starting agy", async () => {
	const spawn = fixture();
	const s = session("other");
	await extension(s.pi);
	spawn.mockClear();
	vi.mocked(ownedProcess.spawnOwnedProcess).mockClear();
	try {
		await s.command("readonly on");
		assert.equal(loadConfig().readOnly, true);
		assert.match(s.notices.at(-1)!, /provider turns and AskAntigravity are REFUSED/);
		await s.command("readonly");
		assert.match(s.notices.at(-1)!, /readOnly is on/);
		await s.command("readonly off");
		assert.equal(loadConfig().readOnly, false);
		assert.match(s.notices.at(-1)!, /readOnly off/);
		assert.equal(spawn.mock.calls.length, 0);
		assert.equal(vi.mocked(ownedProcess.spawnOwnedProcess).mock.calls.length, 0);
	} finally { saveConfig({ readOnly: false }); }
});

test.each([
	{ env: "1", value: "off", mismatch: true },
	{ env: "0", value: "on", mismatch: true },
	{ env: "0", value: "off", mismatch: false },
	{ env: "yes", value: "on", mismatch: false },
])("/agy readonly $value: warns accurately for AGY_READONLY=$env", async ({ env, value, mismatch }) => {
	fixture();
	vi.stubEnv("AGY_READONLY", env);
	const s = session("other");
	await extension(s.pi);
	try {
		await s.command(`readonly ${value}`);
		assert.equal(s.notices.some((notice) => notice.includes("overrides the config")), mismatch);
		if (mismatch) assert.match(s.notices.at(-1)!, new RegExp(`stays ${env === "0" ? "off" : "on"}`));
	} finally { saveConfig({ readOnly: false }); }
});

test("/agy mode warns for effective env-only readOnly and for plan provider refusal", async () => {
	fixture();
	const s = session("other");
	await extension(s.pi);
	try {
		vi.stubEnv("AGY_READONLY", "1");
		await s.command("mode accept-edits");
		assert.match(s.notices.at(-1)!, /readOnly is on: provider turns are refused/);
		vi.stubEnv("AGY_READONLY", "0");
		await s.command("mode plan");
		assert.match(s.notices.at(-1)!, /provider turns are REFUSED/);
	} finally { saveConfig({ readOnly: false, mode: "accept-edits" }); }
});

test.each([
	{ engine: "stream-json", readOnly: "1", mode: "accept-edits" },
	{ engine: "acp", readOnly: "1", mode: "accept-edits" },
	{ engine: "stream-json", readOnly: "0", mode: "plan" },
	{ engine: "acp", readOnly: "0", mode: "plan" },
])("$engine readOnly=$readOnly mode=$mode: refused turn never enters lazy agy startup", async ({ engine, readOnly, mode }) => {
	const spawn = fixture();
	vi.stubEnv("AGY_ENGINE", engine);
	vi.stubEnv("AGY_READONLY", readOnly);
	vi.stubEnv("AGY_MODE", mode);
	const s = session("other");
	await extension(s.pi);
	spawn.mockClear();
	vi.mocked(ownedProcess.spawnOwnedProcess).mockClear();
	const errors = await s.turn();
	assert.equal(errors.length, 1);
	assert.match(errors[0], /refused/);
	assert.match(errors[0], /host/);
	assert.equal(spawn.mock.calls.length, 0, "no version/auth/metadata probe from refused turn");
	assert.equal(vi.mocked(ownedProcess.spawnOwnedProcess).mock.calls.length, 0, "no agy engine spawn");
	assert.equal(privateConfigs().length, 0, "no bridge startup");
});


test("AC-4: an unknown owning outcome never borrows an unrelated turn's conversation", async () => {
	fixture();
	const failAll = vi.spyOn(ToolRoundTrips.prototype, "failAll");
	const run = vi.spyOn(StreamDriver.prototype, "run");
	const s = session();
	await extension(s.pi);
	await s.emit("session_start");
	assert.deepEqual(await s.turn("prime-registry"), []);
	const rt = failAll.mock.contexts[0] as ToolRoundTrips;
	let finish!: (outcome: TurnOutcome) => void;
	const owner = { id: "unknown-owner", outcome: new Promise<TurnOutcome>(resolve => { finish = resolve; }),
		next: async () => null, pushExternal() {} };
	const active = vi.spyOn(StreamDriver.prototype, "activeHandle", "get").mockReturnValue(owner);
	vi.useFakeTimers();
	try {
		const park = rt.onToolCall("orphan", "read", {}, new AbortController().signal);
		await vi.advanceTimersByTimeAsync(20_000);
		await park;
	} finally { vi.useRealTimers(); active.mockRestore(); }
	finish({ status: "OK", response: "", finished: true, aborted: false });
	await owner.outcome;
	// The unrelated real driver's turn-end callback must not claim this orphan.
	assert.deepEqual(await s.turn("unrelated-next-conversation"), []);
	rt.resolve("orphan", "PRIVATE ORPHAN RESULT", false);
	const callsBefore = run.mock.calls.length;
	assert.deepEqual(await s.turn("unrelated-next-conversation"), []);
	assert.equal(run.mock.calls.length, callsBefore + 1, "only the unrelated user prompt is dispatched");
	assert.ok(run.mock.calls.every(([request]) => !request.prompt.includes("PRIVATE ORPHAN RESULT")));
	assert.equal(rt.poll("orphan")?.conversationId, undefined);
	assert.equal(rt.poll("orphan")?.text, "PRIVATE ORPHAN RESULT");
	assert.equal(rt.poll("orphan")?.delivered ?? false, false);
});

test("AC-4: terminal poll answers mark delivery and shutdown clears the instance registry", async () => {
	fixture();
	const clear = vi.spyOn(ToolRoundTrips.prototype, "clearEscalations");
	const mark = vi.spyOn(ToolRoundTrips.prototype, "markDelivered");
	const poll = vi.spyOn(ToolRoundTrips.prototype, "poll");
	const s = session();
	await extension(s.pi);
	await s.emit("session_start");
	assert.deepEqual(await s.turn(), []);
	const endpoint = Object.values(privateConfigs()[0].servers)[0];
	const views: Array<PollView | undefined> = [undefined, { name: "tool", state: "running" },
		{ name: "tool", state: "done", text: "ANSWER" }, { name: "tool", state: "failed", reason: "failed" }];
	for (const [i, view] of views.entries()) {
		poll.mockReturnValue(view);
		const response = await fetch(endpoint.serverUrl, {
			method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", [TOKEN_HEADER]: endpoint.headers[TOKEN_HEADER] },
			body: JSON.stringify({ jsonrpc: "2.0", id: i + 1, method: "tools/call", params: { name: POLL_TOOL_NAME, arguments: { callId: "call-" + i } } }),
		});
		assert.equal(response.status, 200);
		const text = await response.text();
		if (view?.state === "done") assert.match(text, /ANSWER/);
	}
	assert.deepEqual(mark.mock.calls, [["call-2"], ["call-3"]]);
	await s.emit("session_shutdown");
	assert.deepEqual(clear.mock.calls, [["antigravity session shut down"]]);
});

test("proxy dispatch rechecks live filters, rejects raw extension names and keeps instance ownership", async () => {
 fixture();
 const tools = [
  { name: "ext", description: "Extension", parameters: { type: "object" } },
  { name: "hidden", description: "Hidden", parameters: {} },
  { name: "builtin", description: "Builtin", parameters: {}, sourceInfo: { source: "builtin" } },
  { name: "read", description: "Override", parameters: { type: "object" } },
 ];
 const s = session("antigravity", tools);
 let active = tools.map(t => t.name);
 vi.spyOn(s.pi, "getActiveTools").mockImplementation(() => active);
 const failAll = vi.spyOn(ToolRoundTrips.prototype, "failAll");
 await extension(s.pi);
 await s.emit("session_start");
 await s.turn("prime-proxy-registry");
 const registry = failAll.mock.contexts[0] as ToolRoundTrips;
 const dispatch = vi.spyOn(registry, "onToolCall").mockResolvedValue({ content: [{ type: "text", text: "executed" }], isError: false });
 await s.command("tools hide hidden");
 const endpoint = Object.values(privateConfigs()[0].servers)[0];
 const rpc = async (method: string, params: object) => {
  const response = await fetch(endpoint.serverUrl, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", [TOKEN_HEADER]: endpoint.headers[TOKEN_HEADER] }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return JSON.parse((await response.text()).split("\n").find(line => line.startsWith("data:"))!.slice(5)).result;
 };
 const listed = await rpc("tools/list", {});
 assert.deepEqual(listed.tools.map((t: any) => t.name).sort(), ["bridge_call_tool", "bridge_poll_result", "bridge_tool_info", "read"].sort());
 const call = (name: string, args: object = {}) => rpc("tools/call", { name, arguments: args });
 assert.equal((await call("ext")).isError, true);
 assert.equal(dispatch.mock.calls.length, 0);
 assert.match(JSON.stringify(await call("bridge_tool_info", { names: ["ext"] })), /Extension/);
 assert.equal((await call("bridge_call_tool", { name: "ext", arguments_json: '{"x":1}' })).isError, false);
 assert.equal(dispatch.mock.calls.length, 1);
 assert.equal(dispatch.mock.calls[0][1], "ext");
 assert.deepEqual(dispatch.mock.calls[0][2], { x: 1 });
 const owner = dispatch.mock.instances[0];
 await call("read", {});
 assert.equal(dispatch.mock.instances[1], owner);
 for (const name of ["hidden", "builtin", "antigravity", "bridge_call_tool"]) assert.equal((await call("bridge_call_tool", { name, arguments_json: "{}" })).isError, true);
 assert.equal((await call("bridge_call_tool", { name: "ext", arguments_json: "[]" })).isError, true);
 active = ["read"];
 assert.equal((await call("bridge_call_tool", { name: "ext", arguments_json: "{}" })).isError, true);
 assert.equal((await call("bridge_tool_info", { names: ["ext"] })).isError, true);
 assert.equal(dispatch.mock.calls.length, 2);
 active = tools.map(t => t.name);
 await s.command("bridge mcp");
 assert.equal((await call("bridge_call_tool", { name: "ext", arguments_json: "{}" })).isError, true);
 await s.command("bridge none");
 assert.equal((await call("bridge_call_tool", { name: "ext", arguments_json: "{}" })).isError, true);
 assert.equal(dispatch.mock.calls.length, 2);
});

test("captures structured prompt options afresh for each agent run", async () => {
	fixture();
	const capture = vi.spyOn(providerModule, "createStreamSimple");
	const s = session();
	await extension(s.pi);
	const deps = capture.mock.calls.at(-1)![0] as any;
	const options = { customPrompt: "custom", appendSystemPrompt: "append", sections: { rules: "override" }, selectedTools: ["read"], contextFiles: [{ path: "AGENTS.md", content: "policy" }], skills: [], promptGuidelines: ["guidance"] };
	await s.emit("before_agent_start", { systemPrompt: "assembled", systemPromptOptions: options });
	assert.deepEqual(deps.getSystemPromptOptions(), options);
	await s.emit("before_agent_start", { systemPrompt: "next" });
	assert.equal(deps.getSystemPromptOptions(), undefined, "missing options must not inherit the previous run");
});

test.each(["private", "legacy-global"])("ACP %s forwards staged MCP entries on new/load but bypass stays bridge-only", async (discovery) => {
 fixture();
 const dir = path.dirname(process.env.AGY_BIN!);
 const bin = path.join(dir, "acp.mjs"); const log = path.join(dir, "forward-wire.jsonl");
 fs.writeFileSync(bin, "// pi-test-node-fixture\n" + fs.readFileSync(path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs"), "utf8"), { mode: 0o755 });
 vi.stubEnv("AGY_ENGINE", "acp"); vi.stubEnv("AGY_BRIDGE_DISCOVERY", discovery);
 vi.stubEnv("AGY_BIN", bin); vi.stubEnv("ACP_FAKE_LOG", log);
 fs.mkdirSync(path.dirname(mcpConfigPath()), { recursive: true });
 fs.writeFileSync(mcpConfigPath(), JSON.stringify({ mcpServers: {
  codegraph: { command: "node", args: ["graph.js"], env: { MODE: "local" } },
  web: { serverUrl: "https://example.test/mcp" }, disabled: { command: "off", disabled: true },
  "pi-bridge-999": { command: "foreign" }, malformed: { command: 42 },
 } }));
 const s = session(); await extension(s.pi); await s.emit("session_start");
 assert.deepEqual(await s.turn(`forward-${discovery}`), []);
 await s.emit("session_shutdown"); await s.emit("session_start", { reason: "resume" });
 assert.deepEqual(await s.turn(`forward-${discovery}`), []); await s.emit("session_shutdown");
 vi.stubEnv("AGY_AGENTS_ROOT", path.join(dir, "agents"));
 await s.emit("session_start"); assert.deepEqual(await s.turn(`bypass-${discovery}`), []);
 const opens = fs.readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line)).filter((r) => ["session/new", "session/load"].includes(r.method));
 assert.deepEqual(opens.map((r) => r.method), ["session/new", "session/load", "session/new"]);
 for (const request of opens.slice(0, 2)) {
  assert.deepEqual(request.params.mcpServers.slice(1), [
   { name: "codegraph", command: "node", args: ["graph.js"], env: [{ name: "MODE", value: "local" }] },
   { name: "web", type: "http", url: "https://example.test/mcp", headers: [] },
  ]);
 }
 assert.equal(opens[2].params.mcpServers.length, 1);
});

test("/agy agent still refuses ACP user agents", async () => {
 fixture(); vi.stubEnv("AGY_ENGINE", "acp");
 const s = session("anthropic"); await extension(s.pi); await s.emit("session_start");
 const before = loadConfig().agent;
 await s.command("agent custom-user-agent");
 assert.equal(loadConfig().agent, before);
 assert.ok(s.notices.some((message) => message.includes("ACP engine has no agent selection")));
});

test("approval-gate shadow tools rebind across session_shutdown -> session_start without duplicating registrations", async () => {
	fixture();
	const dir = path.dirname(process.env.AGY_BIN!);
	const holdFile = path.join(dir, "hold");
	const bin = path.join(dir, "agy-hold.mjs");
	fs.writeFileSync(bin, `// pi-test-node-fixture
import fs from "node:fs";
import readline from "node:readline";
if (process.argv.includes("--version")) { console.log("1.5.8"); process.exit(0); }
if (process.argv.includes("models")) { console.log("gemini-3.6-flash-low Gemini 3.6 Flash (Low)"); process.exit(0); }
for await (const _line of readline.createInterface({ input: process.stdin })) {
	while (fs.existsSync(${JSON.stringify(holdFile)})) await new Promise((r) => setTimeout(r, 20));
	console.log(JSON.stringify({ event: "init", init: { conversation_id: "conv-gate-rebind" } }));
	console.log(JSON.stringify({ event: "result", result: { status: "SUCCESS", response: "ok", conversation_id: "conv-gate-rebind" } }));
}
`, { mode: 0o755 });
	vi.stubEnv("AGY_BIN", bin);
	saveConfig({ askTool: false, webTools: false, bridgeTools: "all", approvals: { gateMode: "shadow", mode: "allow" } });

	const s = session();
	const registered: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
	const origRegisterTool = s.pi.registerTool.bind(s.pi);
	s.pi.registerTool = ((def: any) => {
		registered.push(def);
		return origRegisterTool(def);
	}) as any;

	await extension(s.pi);
	await s.emit("session_start");
	assert.equal(registered.filter((t) => t.name === "edit").length, 1);
	assert.equal(registered.filter((t) => t.name === "write").length, 1);
	assert.equal(registered.filter((t) => t.name === "bash").length, 1);

	const postApproval = async (toolName: string, args: object) => {
		const endpoint = Object.values(privateConfigs()[0].servers)[0];
		const baseUrl = new URL(endpoint.serverUrl).origin;
		const res = await fetch(`${baseUrl}/approval`, {
			method: "POST",
			headers: { "content-type": "application/json", [TOKEN_HEADER]: endpoint.headers[TOKEN_HEADER] },
			body: JSON.stringify({ toolCall: { name: toolName, args } }),
		});
		return { baseUrl, token: endpoint.headers[TOKEN_HEADER], body: await res.json() as { ticket?: string; decision?: string } };
	};

	// Session 1: hold turn open so bridge has an active turn for POST /approval
	fs.writeFileSync(holdFile, "1");
	const turn1 = s.turn("gate-rebind-1");
	await vi.waitFor(() => expect(fs.existsSync(path.join(os.homedir(), ".pi", "agent", "antigravity-bridge"))).toBe(true));
	let ticket1 = "";
	await vi.waitFor(async () => {
		const res = await postApproval("edit_file", { TargetFile: "a.ts", SearchText: "x", ReplacementContent: "y" });
		expect(typeof res.body.ticket).toBe("string");
		ticket1 = res.body.ticket!;
	});
	const editShadow = registered.find((t) => t.name === "edit")!;
	const writeShadow = registered.find((t) => t.name === "write")!;
	const res1 = await editShadow.execute(
		"call-1",
		{ path: "a.ts", edits: [], [GATE_MARKER]: true, __agyTicket: ticket1, __agyTool: "edit_file" },
		undefined, undefined, { hasUI: false } as any,
	);
	assert.match(JSON.stringify(res1), /Approved by approval gate: edit_file/);
	fs.rmSync(holdFile, { force: true });
	assert.deepEqual(await turn1, []);

	// Simulate /new or /resume: session_shutdown followed by session_start
	await s.emit("session_shutdown");
	await s.emit("session_start", { reason: "new" });
	assert.equal(registered.filter((t) => t.name === "edit").length, 1, "no duplicate shadow registrations");
	assert.equal(registered.filter((t) => t.name === "write").length, 1, "no duplicate shadow registrations");

	// Stale ticket from session 1 must stay rejected
	await assert.rejects(
		editShadow.execute(
			"call-stale",
			{ path: "a.ts", edits: [], [GATE_MARKER]: true, __agyTicket: ticket1, __agyTool: "edit_file" },
			undefined, undefined, { hasUI: false } as any,
		),
		/unrecognized or stale approval ticket/,
	);

	// Session 2: fresh HTTP tickets for edit_file & write_to_file must be accepted
	fs.writeFileSync(holdFile, "1");
	const turn2 = s.turn("gate-rebind-2");
	let ticket2 = "";
	await vi.waitFor(async () => {
		const res = await postApproval("edit_file", { TargetFile: "b.ts", SearchText: "a", ReplacementContent: "b" });
		expect(typeof res.body.ticket).toBe("string");
		ticket2 = res.body.ticket!;
	});
	const res2 = await editShadow.execute(
		"call-2",
		{ path: "b.ts", edits: [], [GATE_MARKER]: true, __agyTicket: ticket2, __agyTool: "edit_file" },
		undefined, undefined, { hasUI: false } as any,
	);
	assert.match(JSON.stringify(res2), /Approved by approval gate: edit_file/);

	const writeApproval = await postApproval("write_to_file", { TargetFile: "c.ts", CodeContent: "hi" });
	assert.ok(typeof writeApproval.body.ticket === "string");
	const res3 = await writeShadow.execute(
		"call-3",
		{ path: "c.ts", content: "hi", [GATE_MARKER]: true, __agyTicket: writeApproval.body.ticket, __agyTool: "write_to_file" },
		undefined, undefined, { hasUI: false } as any,
	);
	assert.match(JSON.stringify(res3), /Approved by approval gate: write_to_file/);

	// Policy updates dynamically across restarts too
	fs.rmSync(holdFile, { force: true });
	assert.deepEqual(await turn2, []);
	await s.emit("session_shutdown");
	saveConfig({ askTool: false, webTools: false, bridgeTools: "all", approvals: { gateMode: "shadow", mode: "deny" } });
	await s.emit("session_start", { reason: "resume" });
	fs.writeFileSync(holdFile, "1");
	const turn3 = s.turn("gate-rebind-3");
	let ticket4 = "";
	await vi.waitFor(async () => {
		const res = await postApproval("edit_file", { TargetFile: "d.ts", SearchText: "1", ReplacementContent: "2" });
		expect(typeof res.body.ticket).toBe("string");
		ticket4 = res.body.ticket!;
	});
	await assert.rejects(
		editShadow.execute(
			"call-4",
			{ path: "d.ts", edits: [], [GATE_MARKER]: true, __agyTicket: ticket4, __agyTool: "edit_file" },
			undefined, undefined, { hasUI: false } as any,
		),
		/blocked by approval gate \(mode: deny\): edit_file/,
	);
	fs.rmSync(holdFile, { force: true });
	assert.deepEqual(await turn3, []);
});
