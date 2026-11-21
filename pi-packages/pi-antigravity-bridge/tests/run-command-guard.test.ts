import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { normalizeContext, type Api, type Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../extensions/index.js";
import { warmJobLauncher } from "./helpers/warm-job-launcher.js";
import { logsDir, saveConfig } from "../src/config.js";
import * as providerModule from "../src/provider.js";
import { resetSyspromptAgentForTests } from "../src/sysprompt-agent.js";
import { startMcpServer, TOKEN_HEADER } from "../src/mcp-server.js";
import * as homeModule from "../src/acp/home.js";
import * as gateDeliveryModule from "../src/gate-delivery.js";
import * as guardModule from "../src/run-command-guard.js";
import { AcpConnection } from "../src/acp/connection.js";
import * as approvalHookModule from "../src/approval-hook.js";
import {
	ALL_TOOLS_MATCHER,
	gateGroupKey,
	gateHooksStaged,
	removeGateHooks,
	stageGateHooks,
} from "../src/approval-hook.js";
import {
	buildRunCommandGuardGroup,
	formatRunCommandGuardReason,
	guardHooksStaged,
	guardHookScriptSource,
	isRunCommandGuardActive,
	removeRunCommandGuardHooks,
	runCommandGuardGroupKey,
	stageRunCommandGuardHooks,
} from "../src/run-command-guard.js";

beforeAll(warmJobLauncher, 60_000);

vi.mock("../src/models.js", async (original) => ({
	...await original<typeof import("../src/models.js")>(),
	loadModelCatalogRaw: async () => "",
}));

const tempDirs: string[] = [];
const shutdowns: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const fn of shutdowns.splice(0)) await fn();
	resetSyspromptAgentForTests();
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function mkTmp(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-guard-test-"));
	tempDirs.push(dir);
	return dir;
}

function hooksFile(dir: string): string {
	return path.join(dir, ".agents", "hooks.json");
}

function readJson(file: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

async function runNodeScript(scriptSource: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
	const dir = mkTmp();
	const file = path.join(dir, "run-command-guard.mjs");
	fs.writeFileSync(file, scriptSource, { mode: 0o600 });
	const proc = spawn(process.execPath, [file], {
		windowsHide: true,
		stdio: ["pipe", "pipe", "pipe"],
	});
	let stdout = "";
	let stderr = "";
	proc.stdout?.on("data", (chunk) => { stdout += chunk; });
	proc.stderr?.on("data", (chunk) => { stderr += chunk; });
	proc.stdin?.end(JSON.stringify({ toolCall: { name: "run_command", args: { CommandLine: "sleep 30" } } }));
	const code = await new Promise<number | null>((resolve) => proc.on("close", resolve));
	return { stdout, stderr, code };
}

describe("isRunCommandGuardActive shared predicate", () => {
	const base = {
		sessionMode: "rpc" as string | undefined,
		enabled: true,
		bridgeTools: "all" as const,
		allTools: [{ name: "bash" }, { name: "read" }],
		activeTools: ["bash", "read"],
		hiddenTools: new Set<string>(),
	};

	test.each(["rpc", "print", "subagent", undefined])("active in non-tui mode %s with enabled setting and active bash", (sessionMode) => {
		expect(isRunCommandGuardActive({ ...base, sessionMode })).toBe(true);
	});

	test("inactive in tui mode", () => {
		expect(isRunCommandGuardActive({ ...base, sessionMode: "tui" })).toBe(false);
	});

	test("inactive when disabled by setting", () => {
		expect(isRunCommandGuardActive({ ...base, enabled: false })).toBe(false);
	});

	test("inactive when bridgeTools is none", () => {
		expect(isRunCommandGuardActive({ ...base, bridgeTools: "none" })).toBe(false);
	});

	test("inactive when bash is hidden or not active or not registered", () => {
		expect(isRunCommandGuardActive({ ...base, hiddenTools: new Set(["bash"]) })).toBe(false);
		expect(isRunCommandGuardActive({ ...base, activeTools: ["read"] })).toBe(false);
		expect(isRunCommandGuardActive({ ...base, allTools: [{ name: "read" }] })).toBe(false);
	});
});

describe("guard hook group and execution", () => {
	test("reason names the session bridge bash tool and timeout argument", () => {
		const reason = formatRunCommandGuardReason("pi-agy-1234abcd");
		expect(reason).toContain("pi-agy-1234abcd/bash");
		expect(reason).toContain("mcp_pi-agy-1234abcd_bash");
		expect(reason).toMatch(/timeout/i);
		expect(reason).toMatch(/run_command/);
	});

	test("guard script executes under node on this platform and prints valid deny JSON", async () => {
		const reason = formatRunCommandGuardReason("pi-agy-deadbeef");
		const { stdout, stderr, code } = await runNodeScript(guardHookScriptSource(reason));
		assert.equal(code, 0, stderr);
		const parsed = JSON.parse(stdout.trim()) as { decision: string; reason: string };
		assert.deepEqual(parsed, { decision: "deny", reason });
	});

	test("buildRunCommandGuardGroup uses matcher run_command only and node script command", () => {
		const scriptPath = path.join(os.tmpdir(), "agy-guard", "run-command-guard.mjs");
		const group = buildRunCommandGuardGroup(scriptPath) as {
			enabled: boolean;
			PreToolUse: Array<{ matcher: string; hooks: Array<{ type: string; command: string; timeout: number }> }>;
		};
		assert.equal(group.enabled, true);
		assert.equal(group.PreToolUse.length, 1);
		assert.equal(group.PreToolUse[0].matcher, "run_command");
		assert.equal(group.PreToolUse[0].hooks.length, 1);
		assert.equal(group.PreToolUse[0].hooks[0].type, "command");
		assert.equal(group.PreToolUse[0].hooks[0].command, `node ${JSON.stringify(scriptPath)}`);
		assert.ok(group.PreToolUse[0].hooks[0].timeout >= 10);
	});
});

describe("approval gate coexistence in hooks.json", () => {
	const gateOpts = {
		port: 47881,
		token: "secret-token",
		scriptPath: "/data/dir/approval-hook.mjs",
		parkBudgetMs: 480_000,
	};

	test("staging guard then gate preserves both groups; the gate matches every tool (run_command routing is the handler/bridge decision)", () => {
		const dir = mkTmp();
		const guardScript = path.join(dir, "run-command-guard.mjs");
		assert.equal(stageRunCommandGuardHooks(dir, guardScript).wrote, true);
		assert.equal(guardHooksStaged(dir), true);

		assert.equal(stageGateHooks(dir, gateOpts).wrote, true);
		const parsed = readJson(hooksFile(dir));
		assert.deepEqual(Object.keys(parsed).sort(), [gateGroupKey(), runCommandGuardGroupKey()].sort());

		const gateGroup = parsed[gateGroupKey()] as { PreToolUse: Array<{ matcher: string }> };
		assert.equal(gateGroup.PreToolUse[0].matcher, ALL_TOOLS_MATCHER);

		const guardGroup = parsed[runCommandGuardGroupKey()] as { PreToolUse: Array<{ matcher: string }> };
		assert.equal(guardGroup.PreToolUse[0].matcher, "run_command");

		// Idempotent restages keep both intact
		assert.equal(stageRunCommandGuardHooks(dir, guardScript).wrote, false);
		assert.equal(stageGateHooks(dir, gateOpts).wrote, false);
	});

	test("staging gate then guard preserves both groups", () => {
		const dir = mkTmp();
		const guardScript = path.join(dir, "run-command-guard.mjs");
		assert.equal(stageGateHooks(dir, gateOpts).wrote, true);
		assert.equal(stageRunCommandGuardHooks(dir, guardScript).wrote, true);

		const parsed = readJson(hooksFile(dir));
		assert.deepEqual(Object.keys(parsed).sort(), [gateGroupKey(), runCommandGuardGroupKey()].sort());
	});

	test("removeGateHooks preserves guard group; removeRunCommandGuardHooks preserves gate group", () => {
		const dir = mkTmp();
		const guardScript = path.join(dir, "run-command-guard.mjs");
		stageRunCommandGuardHooks(dir, guardScript);
		stageGateHooks(dir, gateOpts);

		const removedGate = removeGateHooks(dir);
		assert.equal(removedGate.wrote, true);
		assert.equal(fs.existsSync(hooksFile(dir)), true);
		assert.equal(guardHooksStaged(dir), true);
		assert.deepEqual(Object.keys(readJson(hooksFile(dir))), [runCommandGuardGroupKey()]);

		// Re-add gate and remove guard instead
		stageGateHooks(dir, gateOpts);
		const removedGuard = removeRunCommandGuardHooks(dir);
		assert.equal(removedGuard.wrote, true);
		assert.equal(fs.existsSync(hooksFile(dir)), true);
		assert.equal(gateHooksStaged(dir), true);
		const remainingGate = readJson(hooksFile(dir))[gateGroupKey()] as { PreToolUse: Array<{ matcher: string }> };
		assert.equal(remainingGate.PreToolUse[0].matcher, ALL_TOOLS_MATCHER);

		// Removing last remaining group deletes hooks.json
		assert.equal(removeGateHooks(dir).wrote, true);
		assert.equal(fs.existsSync(hooksFile(dir)), false);
	});

	test("removeRunCommandGuardHooks deletes hooks.json when guard is the only group", () => {
		const dir = mkTmp();
		const guardScript = path.join(dir, "run-command-guard.mjs");
		stageRunCommandGuardHooks(dir, guardScript);
		assert.equal(removeRunCommandGuardHooks(dir).wrote, true);
		assert.equal(fs.existsSync(hooksFile(dir)), false);
		assert.equal(removeRunCommandGuardHooks(dir).wrote, false);
	});

	test("MCP POST /approval denies run_command synchronously when guarded while still parking other gated tools", async () => {
		const dir = mkTmp();
		const parked: string[] = [];
		const result = await startMcpServer(
			{
				listTools: () => [],
				onToolCall: async () => ({ content: [{ type: "text", text: "ok" }], isError: false }),
				onApproval: (ticket, payload) => {
					parked.push(payload.toolCall.name);
					result.handle?.approvals.resolve(ticket, { allow: true });
				},
				denyApprovalReason: (name) => name === "run_command" ? formatRunCommandGuardReason("pi-agy-12345678") : undefined,
			},
			{ configDir: dir, serverName: "pi-agy-12345678" },
		);
		assert.equal(result.ok, true);
		const handle = result.handle!;
		shutdowns.push(() => handle.close());

		const runCmdRes = await fetch(`http://127.0.0.1:${handle.port}/approval`, {
			method: "POST",
			headers: { "content-type": "application/json", [TOKEN_HEADER]: handle.token },
			body: JSON.stringify({ toolCall: { name: "run_command", args: { CommandLine: "echo hi" } } }),
		});
		assert.equal(runCmdRes.status, 200);
		const runCmdJson = await runCmdRes.json() as { decision: string; reason: string };
		assert.equal(runCmdJson.decision, "deny");
		assert.ok(runCmdJson.reason.includes("pi-agy-12345678/bash"));
		assert.deepEqual(parked, []);

		const editRes = await fetch(`http://127.0.0.1:${handle.port}/approval`, {
			method: "POST",
			headers: { "content-type": "application/json", [TOKEN_HEADER]: handle.token },
			body: JSON.stringify({ toolCall: { name: "edit_file", args: { TargetFile: "a.ts" } } }),
		});
		assert.equal(editRes.status, 200);
		const editJson = await editRes.json() as { ticket?: string };
		assert.ok(typeof editJson.ticket === "string");
		assert.deepEqual(parked, ["edit_file"]);
	});
});

describe("ACP hooksDir launch wiring", () => {
	test("AcpConnection passes --add-dir when hooksDir is set and omits it when undefined", async () => {
		const dir = mkTmp();
		const hooksOnlyDir = path.join(dir, "acp-hooks");
		fs.mkdirSync(path.join(hooksOnlyDir, ".agents"), { recursive: true });
		fs.writeFileSync(path.join(hooksOnlyDir, ".agents", "hooks.json"), "{}");
		const argvLog = path.join(dir, "argv.json");
		const fakeAcp = path.join(dir, "fake-acp.mjs");
		fs.writeFileSync(
			fakeAcp,
			`import fs from "node:fs";
import { fileURLToPath } from "node:url";
fs.writeFileSync(${JSON.stringify(argvLog)}, JSON.stringify(process.argv));
const mod = await import(${JSON.stringify(new URL("./helpers/fake-acp-server.mjs", import.meta.url).href)});
`,
		);

		const conn = new AcpConnection({
			cwd: dir,
			bin: process.execPath,
			binArgs: [fakeAcp],
			hooksDir: () => hooksOnlyDir,
			extraEnv: { ACP_FAKE_SCENARIO: "happy" },
			log: () => {},
			onUpdate: () => {},
			onExit: () => {},
		});
		shutdowns.push(() => conn.kill());
		await conn.start();
		const argv = JSON.parse(fs.readFileSync(argvLog, "utf8")) as string[];
		const idx = argv.indexOf("--add-dir");
		assert.ok(idx !== -1, "expected --add-dir in ACP argv");
		assert.equal(argv[idx + 1], hooksOnlyDir);
	});
});

function createExtensionSession(
	mode: string | undefined,
	tools: Array<{ name: string; description: string; parameters: object; sourceInfo?: { source?: string } }>,
	initialActiveToolNames: string[] = tools.map((t) => t.name),
) {
	let activeToolNames = [...initialActiveToolNames];
	const handlers = new Map<string, Array<(...args: any[]) => any>>();
	const commands = new Map<string, any>();
	let provider: any;
	const ctx = {
		hasUI: false,
		mode,
		model: { provider: "antigravity" },
		isProjectTrusted: () => false,
		ui: { notify: () => {}, setStatus: () => {} },
	};
	const pi = {
		on: (name: string, fn: (...args: any[]) => any) => handlers.set(name, [...(handlers.get(name) ?? []), fn]),
		registerProvider: (_name: string, config: any) => { provider = config; },
		registerTool: () => {},
		registerCommand: (name: string, cmd: any) => commands.set(name, cmd),
		registerEntryRenderer: () => {},
		getAllTools: () => tools,
		getActiveTools: () => activeToolNames,
	} as unknown as ExtensionAPI;
	const emit = async (name: string, event: any = { reason: "startup" }) => {
		for (const fn of handlers.get(name) ?? []) await fn(event, ctx);
	};
	const command = (args: string) => commands.get("agy").handler(args, ctx);
	const setActiveTools = (names: string[]) => {
		activeToolNames = [...names];
	};
	const turnRaw = async (
		sessionId = `guard-test-${randomUUID().slice(0, 8)}`,
		systemPrompt?: string,
		messages: any[] = [{ role: "user", content: "hi", timestamp: 1 }],
	) => {
		const model = { ...provider.models[0], provider: "antigravity", baseUrl: provider.baseUrl } as Model<Api>;
		const stream = provider.streamSimple(
			model,
			normalizeContext({
				...(systemPrompt ? { systemPrompt } : {}),
				messages,
			}),
			{ cwd: process.cwd(), sessionId },
		);
		const errors: string[] = [];
		let doneMessage: any;
		for await (const ev of stream) {
			if (ev.type === "error") errors.push(eventErrorMessage(ev));
			if (ev.type === "done") doneMessage = ev.message;
		}
		return { errors, message: doneMessage };
	};
	const turn = async (sessionId = `guard-test-${randomUUID().slice(0, 8)}`, systemPrompt?: string) =>
		(await turnRaw(sessionId, systemPrompt)).errors;
	return { pi, emit, command, setActiveTools, turn, turnRaw };
}

function eventErrorMessage(ev: any): string {
	return ev.error?.errorMessage ?? "error";
}

function setupFakeCarrier(engine: "stream-json" | "acp", opts: { holdFile?: string } = {}) {
	const dir = mkTmp();
	const launchLog = path.join(dir, "launch.json");
	const launchesLog = path.join(dir, "launches.jsonl");
	const streamLog = path.join(dir, "stream.jsonl");
	const acpLog = path.join(dir, "acp.jsonl");
	const bin = path.join(dir, engine === "acp" ? "acp.mjs" : "agy.mjs");
	if (engine === "stream-json") {
		fs.writeFileSync(
			bin,
			`// pi-test-node-fixture
import fs from "node:fs";
import readline from "node:readline";
if (process.argv.includes("--version")) { console.log("1.5.8"); process.exit(0); }
if (process.argv.includes("models")) { console.log("gemini-3.6-flash-low Gemini 3.6 Flash (Low)"); process.exit(0); }
fs.writeFileSync(${JSON.stringify(launchLog)}, JSON.stringify(process.argv));
fs.appendFileSync(${JSON.stringify(launchesLog)}, JSON.stringify(process.argv) + "\\n");
let conv = 0;
const convIdx = process.argv.indexOf("--conversation");
const id = convIdx !== -1 && process.argv[convIdx + 1] ? process.argv[convIdx + 1] : "conv-guard-1";
for await (const line of readline.createInterface({ input: process.stdin })) {
	if (line.trim()) fs.appendFileSync(${JSON.stringify(streamLog)}, line.trim() + "\\n");
	while (${JSON.stringify(opts.holdFile ?? "")} && fs.existsSync(${JSON.stringify(opts.holdFile ?? "")})) {
		await new Promise((r) => setTimeout(r, 20));
	}
	conv += 1;
	console.log(JSON.stringify({ event: "init", init: { conversation_id: id } }));
	console.log(JSON.stringify({ event: "result", result: { status: "SUCCESS", response: "ok", conversation_id: id } }));
}
`,
			{ mode: 0o755 },
		);
	} else {
		const holdScript = opts.holdFile
			? `// pi-test-node-fixture
import fs from "node:fs";
import readline from "node:readline";
if (process.argv.includes("--version")) { console.log("1.5.8"); process.exit(0); }
if (process.argv.includes("models")) { console.log("gemini-3.8-flash-low Gemini 3.8 Flash (Low)"); process.exit(0); }
fs.writeFileSync(${JSON.stringify(launchLog)}, JSON.stringify(process.argv));
{ const gi = process.argv.indexOf("--gemini-dir"); if (gi !== -1) { try { fs.copyFileSync(process.argv[gi + 1] + "/config/hooks.json", ${JSON.stringify(launchLog + ".home-hooks.json")}); } catch {} } }
fs.appendFileSync(${JSON.stringify(launchesLog)}, JSON.stringify(process.argv) + "\\n");
const logPath = ${JSON.stringify(acpLog)};
const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\\n");
const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) {
	const trimmed = line.trim();
	if (!trimmed) continue;
	const msg = JSON.parse(trimmed);
	fs.appendFileSync(logPath, JSON.stringify(msg) + "\\n");
	const { id, method, params } = msg;
	if (method === "initialize") {
		send({ jsonrpc: "2.0", id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true, promptCapabilities: { image: true }, mcpCapabilities: { http: true } }, authMethods: [], agentInfo: { name: "fake-acp", title: "Fake ACP", version: "1.0" } } });
	} else if (method === "authenticate") {
		send({ jsonrpc: "2.0", id, result: {} });
	} else if (method === "session/new") {
		send({ jsonrpc: "2.0", id, result: { sessionId: "fake-session-0001", modes: { currentModeId: "default", availableModes: [] }, models: { availableModels: [], currentModelId: "fake-model" }, configOptions: [] } });
	} else if (method === "session/load") {
		send({ jsonrpc: "2.0", id, result: { configOptions: [] } });
	} else if (method === "session/set_config_option") {
		send({ jsonrpc: "2.0", id, result: { configOptions: [{ id: params.configId, currentValue: params.value, options: [], type: "select", name: params.configId, category: params.configId }] } });
	} else if (method === "session/prompt") {
		while (fs.existsSync(${JSON.stringify(opts.holdFile)})) await new Promise((r) => setTimeout(r, 20));
		send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "fake-session-0001", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "OK" } } } });
		send({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } });
	}
}
`
			: `// pi-test-node-fixture
import fs from "node:fs";
if (!process.argv.includes("--version") && !process.argv.includes("models")) {
	fs.writeFileSync(${JSON.stringify(launchLog)}, JSON.stringify(process.argv));
	{ const gi = process.argv.indexOf("--gemini-dir"); if (gi !== -1) { try { fs.copyFileSync(process.argv[gi + 1] + "/config/hooks.json", ${JSON.stringify(launchLog + ".home-hooks.json")}); } catch {} } }
	fs.appendFileSync(${JSON.stringify(launchesLog)}, JSON.stringify(process.argv) + "\\n");
}
await import(${JSON.stringify(new URL("./helpers/fake-acp-server.mjs", import.meta.url).href)});
`;
		fs.writeFileSync(bin, holdScript, { mode: 0o755 });
		vi.stubEnv("ACP_FAKE_LOG", acpLog);
	}
	vi.stubEnv("AGY_BIN", bin);
	vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH}`);
	vi.stubEnv("AGY_ENGINE", engine);
	vi.stubEnv("AGY_BRIDGE_DISCOVERY", "private");
	vi.stubEnv("AGY_ASK_TOOL", "0");
	return launchLog;
}

function findPrivateEndpoint(): { dir: string; serverUrl: string; token: string } {
	const base = path.join(os.homedir(), ".pi", "agent", "antigravity-bridge");
	for (const name of fs.readdirSync(base)) {
		if (!name.startsWith("agy-mcp-")) continue;
		const dir = path.join(base, name);
		const file = path.join(dir, ".agents", "mcp_config.json");
		if (!fs.existsSync(file)) continue;
		const cfg = JSON.parse(fs.readFileSync(file, "utf8")) as { mcpServers: Record<string, { serverUrl: string; headers: Record<string, string> }> };
		const entry = Object.values(cfg.mcpServers)[0];
		if (entry) return { dir, serverUrl: entry.serverUrl, token: entry.headers[TOKEN_HEADER] };
	}
	throw new Error("no private MCP config found");
}

async function mcpRequest(endpoint: { serverUrl: string; token: string }, method: string, params: object) {
	const res = await fetch(endpoint.serverUrl, {
		method: "POST",
		headers: { "content-type": "application/json", accept: "application/json, text/event-stream", [TOKEN_HEADER]: endpoint.token },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	});
	const text = await res.text();
	const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
	return JSON.parse(dataLine ? dataLine.slice(5) : text) as { result?: any };
}

const builtinBash = {
	name: "bash",
	description: "Run bash",
	parameters: { type: "object", properties: { command: { type: "string" }, timeout: { type: "number" } }, required: ["command"] },
	sourceInfo: { source: "builtin" },
};

describe("extension carrier staging for AC-1", () => {
	test.each([
		{ engine: "stream-json" as const, skipPermissions: true, gateMode: "off" as const },
		{ engine: "stream-json" as const, skipPermissions: false, gateMode: "shadow" as const },
		{ engine: "stream-json" as const, skipPermissions: true, gateMode: "auto" as const },
		{ engine: "acp" as const, skipPermissions: true, gateMode: "off" as const },
		{ engine: "acp" as const, skipPermissions: false, gateMode: "shadow" as const },
		{ engine: "acp" as const, skipPermissions: true, gateMode: "auto" as const },
	])("$engine non-tui stages run_command guard regardless of skipPermissions=$skipPermissions gateMode=$gateMode", async ({ engine, skipPermissions, gateMode }) => {
		const launchLog = setupFakeCarrier(engine);
		saveConfig({
			askTool: false,
			webTools: false,
			bridgeTools: "all",
			skipPermissions,
			approvals: { gateMode, mode: "deny" },
		});
		const s = createExtensionSession("rpc", [builtinBash]);
		shutdowns.push(() => s.emit("session_shutdown"));
		await extension(s.pi);
		await s.emit("session_start");
		assert.deepEqual(await s.turn(), []);

		const argv = JSON.parse(fs.readFileSync(launchLog, "utf8")) as string[];
		const addDirs: string[] = [];
		for (let i = 0; i < argv.length - 1; i++) {
			if (argv[i] === "--add-dir") addDirs.push(argv[i + 1]);
		}
		// ACP with the edit gate enabled delivers BOTH owned groups through the
		// private home's config/hooks.json (no hooks-only --add-dir); every other
		// combination keeps the add-dir delivery.
		const gated = gateMode === "shadow";
		let hooksJson: Record<string, unknown>;
		let hooksAddDir: string | undefined;
		if (engine === "acp" && gated) {
			assert.equal(addDirs.some((d) => fs.existsSync(path.join(d, ".agents", "hooks.json"))), false, "no hooks add-dir under the gated ACP home delivery");
			hooksJson = readJson(`${launchLog}.home-hooks.json`);
			assert.ok(hooksJson[gateGroupKey()], "edit gate group delivered in the private home");
		} else {
			hooksAddDir = addDirs.find((d) => fs.existsSync(path.join(d, ".agents", "hooks.json")));
			assert.ok(hooksAddDir, `expected --add-dir with .agents/hooks.json in ${JSON.stringify(argv)}`);
			if (engine === "acp") {
				assert.equal(
					fs.existsSync(path.join(hooksAddDir, ".agents", "mcp_config.json")),
					false,
					"ACP hooks dir must never contain .agents/mcp_config.json",
				);
			}
			hooksJson = readJson(path.join(hooksAddDir, ".agents", "hooks.json"));
		}
		const guardGroup = hooksJson[runCommandGuardGroupKey()] as {
			enabled: boolean;
			PreToolUse: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
		};
		assert.ok(guardGroup, "guard group present");
		assert.equal(guardGroup.enabled, true);
		assert.equal(guardGroup.PreToolUse[0].matcher, "run_command");

		// Execute the staged command to verify its exact stdout JSON
		const cmd = guardGroup.PreToolUse[0].hooks[0].command;
		assert.ok(cmd.startsWith("node "));
		const scriptPath = JSON.parse(cmd.slice(5)) as string;
		const { stdout, code } = await runNodeScript(fs.readFileSync(scriptPath, "utf8"));
		assert.equal(code, 0);
		const decision = JSON.parse(stdout.trim()) as { decision: string; reason: string };
		assert.equal(decision.decision, "deny");
		assert.match(decision.reason, /pi-agy-[0-9a-f]{8}\/bash/);
		assert.match(decision.reason, /timeout/i);

		if (gated) {
			const gateGroup = hooksJson[gateGroupKey()] as { PreToolUse: Array<{ matcher: string }> };
			assert.ok(gateGroup, "approval gate group coexists");
			assert.equal(gateGroup.PreToolUse[0].matcher, ALL_TOOLS_MATCHER, "the gate matches every tool; run_command routing is decided by the handler/bridge");
		}

		await s.emit("session_shutdown");
		assert.equal(fs.existsSync(scriptPath), false, "guard script removed on shutdown");
		if (hooksAddDir) assert.equal(fs.existsSync(hooksAddDir), false, "hooks dir cleaned up on shutdown");
	});
});

describe("AC-5 catalog bash exposure and missing/hidden bash behavior", () => {
	test("guarded non-tui session exposes builtin bash with full schema, accepts calls, and excludes other builtins", async () => {
		setupFakeCarrier("stream-json");
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", approvals: { gateMode: "off", mode: "deny" } });

		const bashSchema = {
			type: "object",
			properties: { command: { type: "string" }, timeout: { type: "number" } },
			required: ["command"],
		};
		const s = createExtensionSession("rpc", [
			{ name: "bash", description: "Run shell command", parameters: bashSchema, sourceInfo: { source: "builtin" } },
			{ name: "read", description: "Read file", parameters: { type: "object", properties: { path: { type: "string" } } }, sourceInfo: { source: "builtin" } },
			{ name: "git_commit", description: "Commit", parameters: { type: "object", properties: {} }, sourceInfo: { source: "extension" } },
		]);
		shutdowns.push(() => s.emit("session_shutdown"));
		await extension(s.pi);
		await s.emit("session_start");

		const endpoint = findPrivateEndpoint();
		const listRes = await mcpRequest(endpoint, "tools/list", {});
		const tools = listRes.result.tools as Array<{ name: string; inputSchema: object }>;
		const bashTool = tools.find((t) => t.name === "bash");
		assert.ok(bashTool, "builtin bash must be exposed when guarded");
		assert.deepEqual(bashTool.inputSchema, bashSchema);
		assert.equal(tools.some((t) => t.name === "read"), false, "other builtin tools remain excluded");

		// Invocation-time re-filter must accept bash (reaches active-turn check rather than not-exposed error)
		// and reject unexposed builtin read.
		const bashCall = await mcpRequest(endpoint, "tools/call", { name: "bash", arguments: { command: "echo hi" } });
		const bashText = (bashCall.result?.content?.[0]?.text ?? "") as string;
		assert.equal(bashText.includes("not active or not exposed to Antigravity"), false, `unexpected exposure rejection: ${bashText}`);
		assert.match(bashText, /no active antigravity turn/i);

		const readCall = await mcpRequest(endpoint, "tools/call", { name: "read", arguments: { path: "a.ts" } });
		assert.match(readCall.result?.content?.[0]?.text ?? "", /not active or not exposed to Antigravity/);

		// Hiding bash via /agy tools hide bash removes it from catalog and rejects invocation
		await s.command("tools hide bash");
		const listHidden = await mcpRequest(endpoint, "tools/list", {});
		assert.equal((listHidden.result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), false);
		const hiddenCall = await mcpRequest(endpoint, "tools/call", { name: "bash", arguments: { command: "echo hi" } });
		assert.match(hiddenCall.result?.content?.[0]?.text ?? "", /not active or not exposed to Antigravity/);
	});

	test("no guard is staged and builtin bash stays excluded when bash is inactive or hidden", async () => {
		setupFakeCarrier("stream-json");
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", approvals: { gateMode: "off", mode: "deny" } });

		const s = createExtensionSession(
			"rpc",
			[
				builtinBash,
				{ name: "read", description: "Read file", parameters: { type: "object", properties: {} }, sourceInfo: { source: "extension" } },
			],
			["read"], // bash NOT active
		);
		shutdowns.push(() => s.emit("session_shutdown"));
		await extension(s.pi);
		await s.emit("session_start");

		const endpoint = findPrivateEndpoint();
		assert.equal(guardHooksStaged(endpoint.dir), false, "no guard staged when bash is inactive");
		const listRes = await mcpRequest(endpoint, "tools/list", {});
		assert.equal((listRes.result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), false);
	});
});

describe("AC-2 tui passthrough and runCommandGuard opt-out", () => {
	test.each([
		{ label: "tui default", mode: "tui", runCommandGuard: true, engine: "stream-json" as const },
		{ label: "tui default", mode: "tui", runCommandGuard: true, engine: "acp" as const },
		{ label: "non-tui opt-out", mode: "rpc", runCommandGuard: false, engine: "stream-json" as const },
		{ label: "non-tui opt-out", mode: "rpc", runCommandGuard: false, engine: "acp" as const },
	])("$label on $engine leaves run_command unguarded and builtin bash excluded", async ({ mode, runCommandGuard, engine }) => {
		const launchLog = setupFakeCarrier(engine);
		saveConfig({
			askTool: false,
			webTools: false,
			bridgeTools: "all",
			runCommandGuard,
			approvals: { gateMode: "off", mode: "deny" },
		});

		const s = createExtensionSession(mode, [builtinBash]);
		shutdowns.push(() => s.emit("session_shutdown"));
		await extension(s.pi);
		await s.emit("session_start");
		assert.deepEqual(await s.turn("ac2-test"), []);

		const argv = JSON.parse(fs.readFileSync(launchLog, "utf8")) as string[];
		const addDirs: string[] = [];
		for (let i = 0; i < argv.length - 1; i++) {
			if (argv[i] === "--add-dir") addDirs.push(argv[i + 1]);
		}
		assert.equal(addDirs.some((d) => fs.existsSync(path.join(d, ".agents", "hooks.json"))), false);

		const endpoint = findPrivateEndpoint();
		const listRes = await mcpRequest(endpoint, "tools/list", {});
		assert.equal((listRes.result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), false);
	});
});

function readLaunches(launchLog: string): string[][] {
	const launchesLog = path.join(path.dirname(launchLog), "launches.jsonl");
	return fs.readFileSync(launchesLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as string[]);
}

function addDirsFromArgv(argv: string[]): string[] {
	const dirs: string[] = [];
	for (let i = 0; i < argv.length - 1; i++) {
		if (argv[i] === "--add-dir") dirs.push(argv[i + 1]);
	}
	return dirs;
}

function deliveredPromptTexts(engine: "stream-json" | "acp", launchLog: string): string[] {
	const dir = path.dirname(launchLog);
	if (engine === "acp") {
		const acpLog = path.join(dir, "acp.jsonl");
		return fs.readFileSync(acpLog, "utf8")
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((l) => JSON.parse(l) as { method?: string; params?: { prompt?: Array<{ type: string; text?: string }> } })
			.filter((r) => r.method === "session/prompt")
			.map((r) => r.params?.prompt?.find((b) => b.type === "text")?.text ?? "");
	}
	const out: string[] = [];
	for (const argv of readLaunches(launchLog)) {
		const idx = argv.indexOf("--agent");
		const agentName = idx !== -1 ? argv[idx + 1] : undefined;
		if (!agentName) { out.push(""); continue; }
		const agentDir = path.join(os.homedir(), ".gemini", "config", "agents", agentName);
		tempDirs.push(agentDir);
		out.push(fs.readFileSync(path.join(agentDir, "agent.md"), "utf8"));
	}
	return out;
}

function expectGuardHooksState(engine: "stream-json" | "acp", endpointDir: string, argv: string[], expectedActive: boolean) {
	const acpHooksDir = path.join(endpointDir, "acp-hooks");
	if (engine === "acp") {
		const hasHooksAddDir = addDirsFromArgv(argv).includes(acpHooksDir);
		assert.equal(hasHooksAddDir, expectedActive, `ACP --add-dir ${acpHooksDir} expected=${expectedActive} in ${JSON.stringify(argv)}`);
		assert.equal(guardHooksStaged(acpHooksDir), expectedActive);
	} else {
		const hasBridgeAddDir = addDirsFromArgv(argv).includes(endpointDir);
		assert.equal(hasBridgeAddDir, true);
		const hooksFile = path.join(endpointDir, ".agents", "hooks.json");
		if (expectedActive) {
			assert.equal(fs.existsSync(hooksFile), true);
			assert.ok(readJson(hooksFile)[runCommandGuardGroupKey()]);
		} else {
			assert.equal(fs.existsSync(hooksFile) && Boolean(readJson(hooksFile)[runCommandGuardGroupKey()]), false);
		}
	}
}

describe("R3 session-frozen guard snapshot", () => {
	test.each([
		{ engine: "stream-json" as const },
		{ engine: "acp" as const },
	])("$engine same-session setting toggle (true -> false and false -> true) leaves hooks, catalog and note unchanged", async ({ engine }) => {
		const nonce = randomUUID().slice(0, 8);
		const launchLog = setupFakeCarrier(engine);
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: true, approvals: { gateMode: "off", mode: "deny" } });
		const capture = vi.spyOn(providerModule, "createStreamSimple");

		// Session 1: started guarded -> mid-session disable must leave hooks, catalog, and note unchanged
		const s1 = createExtensionSession("rpc", [builtinBash]);
		shutdowns.push(() => s1.emit("session_shutdown"));
		await extension(s1.pi);
		await s1.emit("session_start");
		const deps1 = capture.mock.calls.at(-1)![0] as { getRunCommandGuard: () => { active: boolean; serverName: string } };

		const conv1 = `r3-${engine}-e2d-${nonce}`;
		assert.deepEqual(await s1.turn(conv1, "System prompt"), []);
		const endpoint1 = findPrivateEndpoint();
		assert.equal(readLaunches(launchLog).length, 1);
		expectGuardHooksState(engine, endpoint1.dir, readLaunches(launchLog)[0], true);
		assert.equal(deps1.getRunCommandGuard().active, true);
		assert.equal(((await mcpRequest(endpoint1, "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), true);

		// Flip setting to false mid-session
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: false, approvals: { gateMode: "off", mode: "deny" } });
		assert.equal(deps1.getRunCommandGuard().active, true);
		expectGuardHooksState(engine, endpoint1.dir, readLaunches(launchLog)[0], true);
		assert.equal(((await mcpRequest(endpoint1, "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), true);
		const bashCall1 = await mcpRequest(endpoint1, "tools/call", { name: "bash", arguments: { command: "echo hi" } });
		assert.match((bashCall1.result?.content?.[0]?.text ?? "") as string, /no active antigravity turn/i);

		// Same-conversation turn must not recycle; fresh conversation in same session still carries guarded note
		assert.deepEqual(await s1.turn(conv1), []);
		assert.equal(readLaunches(launchLog).length, 1, "must not recycle on same conversation");
		assert.deepEqual(await s1.turn(`r3-${engine}-e2d-fresh-${nonce}`, "System prompt"), []);
		const prompts1 = deliveredPromptTexts(engine, launchLog);
		assert.match(prompts1[0], /Native run_command is refused/);
		assert.match(prompts1.at(-1)!, /Native run_command is refused/);
		await s1.emit("session_shutdown");

		// Session 2: started unguarded -> mid-session enable must leave hooks unstaged, builtin bash excluded, and note unguarded
		const launchLog2 = setupFakeCarrier(engine);
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: false, approvals: { gateMode: "off", mode: "deny" } });
		const s2 = createExtensionSession("rpc", [builtinBash]);
		shutdowns.push(() => s2.emit("session_shutdown"));
		await extension(s2.pi);
		await s2.emit("session_start");
		const deps2 = capture.mock.calls.at(-1)![0] as { getRunCommandGuard: () => { active: boolean; serverName: string } };

		const conv2 = `r3-${engine}-d2e-${nonce}`;
		assert.deepEqual(await s2.turn(conv2, "System prompt"), []);
		const endpoint2 = findPrivateEndpoint();
		assert.equal(readLaunches(launchLog2).length, 1);
		expectGuardHooksState(engine, endpoint2.dir, readLaunches(launchLog2)[0], false);
		assert.equal(deps2.getRunCommandGuard().active, false);
		assert.equal(((await mcpRequest(endpoint2, "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), false);

		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: true, approvals: { gateMode: "off", mode: "deny" } });
		assert.equal(deps2.getRunCommandGuard().active, false);
		expectGuardHooksState(engine, endpoint2.dir, readLaunches(launchLog2)[0], false);
		assert.equal(((await mcpRequest(endpoint2, "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), false);
		const deniedBash = await mcpRequest(endpoint2, "tools/call", { name: "bash", arguments: { command: "echo hi" } });
		assert.match((deniedBash.result?.content?.[0]?.text ?? "") as string, /not active or not exposed to Antigravity/);

		assert.deepEqual(await s2.turn(conv2), []);
		assert.equal(readLaunches(launchLog2).length, 1, "must not recycle on same conversation");
		assert.deepEqual(await s2.turn(`r3-${engine}-d2e-fresh-${nonce}`, "System prompt"), []);
		const prompts2 = deliveredPromptTexts(engine, launchLog2);
		assert.match(prompts2[0], /run commands in the foreground within the turn/);
		assert.match(prompts2.at(-1)!, /run commands in the foreground within the turn/);
		assert.equal(prompts2.at(-1)!.includes("Native run_command is refused"), false);
	});

	test.each([
		{ engine: "stream-json" as const, action: "hidden" as const },
		{ engine: "acp" as const, action: "hidden" as const },
		{ engine: "stream-json" as const, action: "inactive" as const },
		{ engine: "acp" as const, action: "inactive" as const },
	])("$engine same-session bash $action change enforces live catalog filter while hooks and note stay frozen", async ({ engine, action }) => {
		const nonce = randomUUID().slice(0, 8);
		const launchLog = setupFakeCarrier(engine);
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: true, approvals: { gateMode: "off", mode: "deny" } });
		const capture = vi.spyOn(providerModule, "createStreamSimple");
		const readExt = { name: "read", description: "Read", parameters: { type: "object", properties: {} }, sourceInfo: { source: "extension" } };

		// Case A: starts guarded -> hide or deactivate bash mid-session -> bash leaves live catalog & calls reject, while hooks and note stay frozen
		const s1 = createExtensionSession("rpc", [builtinBash, readExt], ["bash", "read"]);
		shutdowns.push(() => s1.emit("session_shutdown"));
		await extension(s1.pi);
		await s1.emit("session_start");
		const deps1 = capture.mock.calls.at(-1)![0] as { getRunCommandGuard: () => { active: boolean } };

		const conv1 = `r3-${engine}-${action}-a-${nonce}`;
		assert.deepEqual(await s1.turn(conv1, "System prompt"), []);
		const endpoint1 = findPrivateEndpoint();
		assert.equal(readLaunches(launchLog).length, 1);

		if (action === "hidden") await s1.command("tools hide bash");
		else s1.setActiveTools(["read"]);

		assert.equal(deps1.getRunCommandGuard().active, true);
		expectGuardHooksState(engine, endpoint1.dir, readLaunches(launchLog)[0], true);
		assert.equal(((await mcpRequest(endpoint1, "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), false);
		const hiddenOrInactiveCall = await mcpRequest(endpoint1, "tools/call", { name: "bash", arguments: { command: "echo hi" } });
		assert.match((hiddenOrInactiveCall.result?.content?.[0]?.text ?? "") as string, /not active or not exposed to Antigravity/);

		assert.deepEqual(await s1.turn(conv1), []);
		assert.equal(readLaunches(launchLog).length, 1, "must not recycle on same conversation");
		assert.deepEqual(await s1.turn(`r3-${engine}-${action}-a-fresh-${nonce}`, "System prompt"), []);
		assert.match(deliveredPromptTexts(engine, launchLog).at(-1)!, /Native run_command is refused/);
		await s1.emit("session_shutdown");

		// Case B: starts with bash inactive -> activate bash mid-session -> hooks and note stay unguarded, builtin bash stays excluded
		if (action === "inactive") {
			const launchLog2 = setupFakeCarrier(engine);
			const s2 = createExtensionSession("rpc", [builtinBash, readExt], ["read"]);
			shutdowns.push(() => s2.emit("session_shutdown"));
			await extension(s2.pi);
			await s2.emit("session_start");
			const deps2 = capture.mock.calls.at(-1)![0] as { getRunCommandGuard: () => { active: boolean } };

			const conv2 = `r3-${engine}-b-${nonce}`;
			assert.deepEqual(await s2.turn(conv2, "System prompt"), []);
			const endpoint2 = findPrivateEndpoint();
			assert.equal(deps2.getRunCommandGuard().active, false);
			expectGuardHooksState(engine, endpoint2.dir, readLaunches(launchLog2)[0], false);
			assert.equal(((await mcpRequest(endpoint2, "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), false);

			s2.setActiveTools(["bash", "read"]);
			assert.equal(deps2.getRunCommandGuard().active, false);
			expectGuardHooksState(engine, endpoint2.dir, readLaunches(launchLog2)[0], false);
			assert.equal(((await mcpRequest(endpoint2, "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), false);
			const denied = await mcpRequest(endpoint2, "tools/call", { name: "bash", arguments: { command: "echo hi" } });
			assert.match((denied.result?.content?.[0]?.text ?? "") as string, /not active or not exposed to Antigravity/);

			assert.deepEqual(await s2.turn(conv2), []);
			assert.equal(readLaunches(launchLog2).length, 1);
			assert.deepEqual(await s2.turn(`r3-${engine}-b-fresh-${nonce}`, "System prompt"), []);
			assert.match(deliveredPromptTexts(engine, launchLog2).at(-1)!, /run commands in the foreground within the turn/);
		}
	});

	test.each([
		{ engine: "stream-json" as const },
		{ engine: "acp" as const },
	])("$engine session_shutdown -> session_start picks up changed setting and bash availability", async ({ engine }) => {
		const nonce = randomUUID().slice(0, 8);
		const launchLog = setupFakeCarrier(engine);
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: true, approvals: { gateMode: "off", mode: "deny" } });
		const capture = vi.spyOn(providerModule, "createStreamSimple");
		const readExt = { name: "read", description: "Read", parameters: { type: "object", properties: {} }, sourceInfo: { source: "extension" } };

		const s = createExtensionSession("rpc", [builtinBash, readExt], ["bash", "read"]);
		shutdowns.push(() => s.emit("session_shutdown"));
		await extension(s.pi);
		await s.emit("session_start");
		const deps = capture.mock.calls.at(-1)![0] as { getRunCommandGuard: () => { active: boolean } };

		// Session 1: guarded
		assert.deepEqual(await s.turn(`r3-restart-${engine}-1-${nonce}`, "System prompt"), []);
		const endpoint1 = findPrivateEndpoint();
		assert.equal(deps.getRunCommandGuard().active, true);
		expectGuardHooksState(engine, endpoint1.dir, readLaunches(launchLog)[0], true);
		assert.equal(((await mcpRequest(endpoint1, "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), true);

		// Mid-session disable stays frozen until shutdown -> new session
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: false, approvals: { gateMode: "off", mode: "deny" } });
		await s.emit("session_shutdown");
		await s.emit("session_start", { reason: "new" });

		// Session 2: picks up runCommandGuard: false
		assert.deepEqual(await s.turn(`r3-restart-${engine}-2-${nonce}`, "System prompt"), []);
		const endpoint2 = findPrivateEndpoint();
		let launches = readLaunches(launchLog);
		assert.equal(launches.length, 2);
		assert.equal(deps.getRunCommandGuard().active, false);
		expectGuardHooksState(engine, endpoint2.dir, launches[1], false);
		assert.equal(((await mcpRequest(endpoint2, "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), false);

		// Re-enable setting and resume: Session 3 restages hooks / ACP --add-dir
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: true, approvals: { gateMode: "off", mode: "deny" } });
		await s.emit("session_shutdown");
		await s.emit("session_start", { reason: "resume" });

		assert.deepEqual(await s.turn(`r3-restart-${engine}-3-${nonce}`, "System prompt"), []);
		launches = readLaunches(launchLog);
		assert.equal(launches.length, 3);
		assert.equal(deps.getRunCommandGuard().active, true);
		expectGuardHooksState(engine, findPrivateEndpoint().dir, launches[2], true);
		assert.equal(((await mcpRequest(findPrivateEndpoint(), "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), true);

		// Deactivate bash before next session: Session 4 picks up missing bash -> unguarded
		s.setActiveTools(["read"]);
		await s.emit("session_shutdown");
		await s.emit("session_start", { reason: "new" });

		assert.deepEqual(await s.turn(`r3-restart-${engine}-4-${nonce}`, "System prompt"), []);
		launches = readLaunches(launchLog);
		assert.equal(launches.length, 4);
		assert.equal(deps.getRunCommandGuard().active, false);
		expectGuardHooksState(engine, findPrivateEndpoint().dir, launches[3], false);
		assert.equal(((await mcpRequest(findPrivateEndpoint(), "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), false);

		const prompts = deliveredPromptTexts(engine, launchLog);
		assert.match(prompts[0], /Native run_command is refused/);
		assert.match(prompts[1], /run commands in the foreground within the turn/);
		assert.match(prompts[2], /Native run_command is refused/);
		assert.match(prompts[3], /run commands in the foreground within the turn/);
	});

	test.each([
		{ engine: "stream-json" as const },
		{ engine: "acp" as const },
	])("$engine never recycles or aborts during in-flight or parked turns when setting/bash changes mid-turn", async ({ engine }) => {
		const holdDir = mkTmp();
		const holdFile = path.join(holdDir, "hold");
		const launchLog = setupFakeCarrier(engine, { holdFile });
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: true, approvals: { gateMode: "off", mode: "deny" } });
		const capture = vi.spyOn(providerModule, "createStreamSimple");

		const readExt = { name: "read", description: "Read", parameters: { type: "object", properties: {} }, sourceInfo: { source: "extension" } };
		const s = createExtensionSession("rpc", [builtinBash, readExt], ["bash", "read"]);
		shutdowns.push(() => s.emit("session_shutdown"));
		await extension(s.pi);
		await s.emit("session_start");
		const deps = capture.mock.calls.at(-1)![0] as { getRunCommandGuard: () => { active: boolean } };

		fs.writeFileSync(holdFile, "1");
		const sid = `r3-inflight-${engine}`;
		const turn1 = s.turnRaw(sid, "System prompt");
		await vi.waitFor(() => expect(readLaunches(launchLog).length).toBe(1));
		const endpoint = findPrivateEndpoint();

		// Park a bash bridge call inside the active turn (simulating ACP/stream-json tool round-trip)
		const parkedCall = mcpRequest(endpoint, "tools/call", { name: "bash", arguments: { command: "echo hi" } });
		const firstParkResult = await turn1;
		assert.deepEqual(firstParkResult.errors, []);
		assert.equal(firstParkResult.message?.stopReason, "toolUse");
		const toolUseBlock = (firstParkResult.message?.content ?? []).find((b: any) => b.type === "toolCall") as { id: string; name: string };
		assert.equal(toolUseBlock?.name, "bash");

		// Mutate setting + hide/deactivate bash while the turn is active & parked
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: false, approvals: { gateMode: "off", mode: "deny" } });
		await s.command("tools hide bash");
		s.setActiveTools(["read"]);
		expectGuardHooksState(engine, endpoint.dir, readLaunches(launchLog)[0], true);
		assert.equal(deps.getRunCommandGuard().active, true);
		assert.equal(((await mcpRequest(endpoint, "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), false);
		const rejectedCall = await mcpRequest(endpoint, "tools/call", { name: "bash", arguments: { command: "echo hi" } });
		assert.match((rejectedCall.result?.content?.[0]?.text ?? "") as string, /not active or not exposed to Antigravity/);

		// Re-enter with the tool result while carrier is still held, then release
		const reentry = s.turnRaw(sid, "System prompt", [
			{ role: "user", content: "hi", timestamp: 1 },
			firstParkResult.message,
			{
				role: "toolResult",
				toolCallId: toolUseBlock.id,
				toolName: "bash",
				content: [{ type: "text", text: "ran: echo hi" }],
				isError: false,
				timestamp: 2,
			},
		]);
		await new Promise((r) => setTimeout(r, 40));
		fs.rmSync(holdFile, { force: true });

		const [parkRes, reentryRes] = await Promise.all([parkedCall, reentry]);
		assert.equal(parkRes.result?.isError, false);
		assert.match(parkRes.result?.content?.[0]?.text ?? "", /ran: echo hi/);
		assert.deepEqual(reentryRes.errors, []);
		assert.equal(reentryRes.message?.stopReason, "stop");
		assert.equal(readLaunches(launchLog).length, 1, "active/parked turn must never recycle");

		// An extra turn on ACP reuses the same connection too with no recycle
		if (engine === "acp") {
			assert.deepEqual(await s.turn(`r3-inflight-acp-next-${randomUUID().slice(0, 6)}`, "System prompt"), []);
			assert.equal(readLaunches(launchLog).length, 1);
			assert.match(deliveredPromptTexts(engine, launchLog).at(-1)!, /Native run_command is refused/);
		}
	});
});

function readStreamStdinPrompts(launchLog: string): string[] {
	const streamLog = path.join(path.dirname(launchLog), "stream.jsonl");
	return fs.readFileSync(streamLog, "utf8")
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((l) => (JSON.parse(l) as { message?: { content?: string } }).message?.content ?? "");
}

function readSessionsFile(): Record<string, { conversationId: string; lastStepIdx: number; lastMessageCount?: number; runCommandGuardActive?: boolean }> {
	const file = path.join(os.homedir(), ".pi", "agent", "antigravity-bridge", "sessions.json");
	return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeSessionsFile(data: Record<string, unknown>): void {
	const file = path.join(os.homedir(), ".pi", "agent", "antigravity-bridge", "sessions.json");
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function sessionStoreKey(sessionId: string, engine: "stream-json" | "acp"): string {
	return `sid:${sessionId}${engine === "acp" ? "@acp" : ""}`;
}

describe("R4 same-sessionId /resume guard refresh", () => {
	test.each([
		{ engine: "stream-json" as const },
		{ engine: "acp" as const },
	])("$engine same-sessionId resume enabled->disabled->enabled delivers updated guard note once on first resumed turn, not repeated later", async ({ engine }) => {
		const nonce = randomUUID().slice(0, 8);
		const sid = `r4-flip-${engine}-${nonce}`;
		const key = sessionStoreKey(sid, engine);
		const launchLog = setupFakeCarrier(engine);
		const readExt = { name: "read", description: "Read", parameters: { type: "object", properties: {} }, sourceInfo: { source: "extension" } };

		// 1. Start guarded (enabled)
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: true, approvals: { gateMode: "off", mode: "deny" } });
		const s1 = createExtensionSession("rpc", [builtinBash, readExt], ["bash", "read"]);
		shutdowns.push(() => s1.emit("session_shutdown"));
		await extension(s1.pi);
		await s1.emit("session_start");

		assert.deepEqual(await s1.turn(sid, "System prompt"), []);
		assert.deepEqual(await s1.turn(sid, "System prompt"), []);
		if (engine === "acp") {
			const prompts = deliveredPromptTexts(engine, launchLog);
			assert.equal(prompts.length, 2);
			assert.match(prompts[0], /Native run_command is refused/);
			assert.equal(prompts[1], "hi");
		} else {
			assert.equal(readLaunches(launchLog).length, 1);
			assert.match(deliveredPromptTexts(engine, launchLog)[0], /Native run_command is refused/);
			assert.deepEqual(readStreamStdinPrompts(launchLog), ["hi", "hi"]);
		}
		await vi.waitFor(() => assert.equal(readSessionsFile()[key]?.runCommandGuardActive, true));
		await s1.emit("session_shutdown");

		// 2. Resume with guard disabled (new lifecycle / fresh extension instance, same Pi sessionId)
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: false, approvals: { gateMode: "off", mode: "deny" } });
		const s2 = createExtensionSession("rpc", [builtinBash, readExt], ["bash", "read"]);
		shutdowns.push(() => s2.emit("session_shutdown"));
		await extension(s2.pi);
		await s2.emit("session_start", { reason: "resume" });

		assert.deepEqual(await s2.turn(sid, "System prompt"), []);
		const endpoint2 = findPrivateEndpoint();
		expectGuardHooksState(engine, endpoint2.dir, readLaunches(launchLog).at(-1)!, false);
		assert.equal(((await mcpRequest(endpoint2, "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), false);
		await vi.waitFor(() => assert.equal(readSessionsFile()[key]?.runCommandGuardActive, false));

		// Second turn in same resumed session: note must NOT be repeated
		assert.deepEqual(await s2.turn(sid, "System prompt"), []);
		if (engine === "acp") {
			const prompts = deliveredPromptTexts(engine, launchLog);
			assert.equal(prompts.length, 4);
			assert.match(prompts[2], /run commands in the foreground within the turn/);
			assert.equal(prompts[2].includes("Native run_command is refused"), false);
			assert.equal(prompts[3], "hi");
		} else {
			assert.equal(readLaunches(launchLog).length, 2, "must launch once for resumed session without recycling on turn 2");
			const carrierBody = deliveredPromptTexts(engine, launchLog)[1];
			assert.match(carrierBody, /run commands in the foreground within the turn/);
			assert.equal(carrierBody.includes("Native run_command is refused"), false);
			assert.deepEqual(readStreamStdinPrompts(launchLog), ["hi", "hi", "hi", "hi"]);
		}

		// 3. Resume again in same extension instance with guard re-enabled (disabled -> enabled)
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: true, approvals: { gateMode: "off", mode: "deny" } });
		await s2.emit("session_shutdown");
		await s2.emit("session_start", { reason: "resume" });

		assert.deepEqual(await s2.turn(sid, "System prompt"), []);
		const endpoint3 = findPrivateEndpoint();
		expectGuardHooksState(engine, endpoint3.dir, readLaunches(launchLog).at(-1)!, true);
		assert.equal(((await mcpRequest(endpoint3, "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), true);
		await vi.waitFor(() => assert.equal(readSessionsFile()[key]?.runCommandGuardActive, true));

		// Second turn after re-enable: note must NOT be repeated
		assert.deepEqual(await s2.turn(sid, "System prompt"), []);
		if (engine === "acp") {
			const prompts = deliveredPromptTexts(engine, launchLog);
			assert.equal(prompts.length, 6);
			assert.match(prompts[4], /Native run_command is refused/);
			assert.equal(prompts[5], "hi");
		} else {
			assert.equal(readLaunches(launchLog).length, 3, "must launch once for re-enabled resume without recycling on turn 2");
			assert.match(deliveredPromptTexts(engine, launchLog)[2], /Native run_command is refused/);
			assert.deepEqual(readStreamStdinPrompts(launchLog), ["hi", "hi", "hi", "hi", "hi", "hi"]);
		}
	});

	test.each([
		{ engine: "stream-json" as const, guardEnabled: true },
		{ engine: "stream-json" as const, guardEnabled: false },
		{ engine: "acp" as const, guardEnabled: true },
		{ engine: "acp" as const, guardEnabled: false },
	])("$engine same-sessionId resume with unchanged guard state ($guardEnabled) sends no extra note", async ({ engine, guardEnabled }) => {
		const nonce = randomUUID().slice(0, 8);
		const sid = `r4-same-${engine}-${guardEnabled}-${nonce}`;
		const launchLog = setupFakeCarrier(engine);
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: guardEnabled, approvals: { gateMode: "off", mode: "deny" } });

		const s1 = createExtensionSession("rpc", [builtinBash]);
		shutdowns.push(() => s1.emit("session_shutdown"));
		await extension(s1.pi);
		await s1.emit("session_start");
		assert.deepEqual(await s1.turn(sid, "System prompt"), []);
		await s1.emit("session_shutdown");

		// Resume with the same guard state in a fresh extension instance
		const stageSpy = vi.spyOn(await import("../src/sysprompt-agent.js"), "stageSyspromptAgent");
		const s2 = createExtensionSession("rpc", [builtinBash]);
		shutdowns.push(() => s2.emit("session_shutdown"));
		await extension(s2.pi);
		await s2.emit("session_start", { reason: "resume" });
		assert.deepEqual(await s2.turn(sid, "System prompt"), []);

		if (engine === "acp") {
			const prompts = deliveredPromptTexts(engine, launchLog);
			assert.equal(prompts.length, 2);
			assert.equal(prompts[1], "hi");
		} else {
			assert.equal(stageSpy.mock.calls.length, 0, "unchanged state must not restage carrier");
			assert.deepEqual(readStreamStdinPrompts(launchLog), ["hi", "hi"]);
		}
	});

	test.each([
		{ engine: "stream-json" as const },
		{ engine: "acp" as const },
	])("$engine legacy SessionStore binding without runCommandGuardActive refreshes once in non-tui and never refreshes in tui", async ({ engine }) => {
		const nonce = randomUUID().slice(0, 8);
		const launchLog = setupFakeCarrier(engine);
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: true, approvals: { gateMode: "off", mode: "deny" } });

		const rpcSid = `r4-legacy-rpc-${engine}-${nonce}`;
		const tuiSid = `r4-legacy-tui-${engine}-${nonce}`;
		const rpcKey = sessionStoreKey(rpcSid, engine);
		const tuiKey = sessionStoreKey(tuiSid, engine);
		writeSessionsFile({
			[rpcKey]: { conversationId: "legacy-conv-rpc", lastStepIdx: -1, lastMessageCount: 1 },
			[tuiKey]: { conversationId: "legacy-conv-tui", lastStepIdx: -1, lastMessageCount: 1 },
		});

		// Non-tui legacy binding: refreshes once on first turn, records true, never repeats
		const sRpc = createExtensionSession("rpc", [builtinBash]);
		shutdowns.push(() => sRpc.emit("session_shutdown"));
		await extension(sRpc.pi);
		await sRpc.emit("session_start", { reason: "resume" });
		assert.deepEqual(await sRpc.turn(rpcSid, "System prompt"), []);
		await vi.waitFor(() => assert.equal(readSessionsFile()[rpcKey]?.runCommandGuardActive, true));
		assert.deepEqual(await sRpc.turn(rpcSid, "System prompt"), []);

		if (engine === "acp") {
			const prompts = deliveredPromptTexts(engine, launchLog);
			assert.equal(prompts.length, 2);
			assert.match(prompts[0], /Native run_command is refused/);
			assert.equal(prompts[1], "hi");
		} else {
			assert.equal(readLaunches(launchLog).length, 1);
			assert.match(deliveredPromptTexts(engine, launchLog)[0], /Native run_command is refused/);
			assert.deepEqual(readStreamStdinPrompts(launchLog), ["hi", "hi"]);
		}
		await sRpc.emit("session_shutdown");

		// Tui legacy binding: must NOT inject any extra note or restage a carrier
		const stageSpy = vi.spyOn(await import("../src/sysprompt-agent.js"), "stageSyspromptAgent");
		const sTui = createExtensionSession("tui", [builtinBash]);
		shutdowns.push(() => sTui.emit("session_shutdown"));
		await extension(sTui.pi);
		await sTui.emit("session_start", { reason: "resume" });
		assert.deepEqual(await sTui.turn(tuiSid, "System prompt"), []);

		if (engine === "acp") {
			const prompts = deliveredPromptTexts(engine, launchLog);
			assert.equal(prompts.length, 3);
			assert.equal(prompts[2], "hi");
		} else {
			assert.equal(stageSpy.mock.calls.length, 0);
			assert.deepEqual(readStreamStdinPrompts(launchLog), ["hi", "hi", "hi"]);
		}
	});

	test("stream-json resume without systemPrompt falls back to inline guard note once and clears stale carrier", async () => {
		const nonce = randomUUID().slice(0, 8);
		const sid = `r4-no-sysprompt-${nonce}`;
		const key = sessionStoreKey(sid, "stream-json");
		const launchLog = setupFakeCarrier("stream-json");

		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: true, approvals: { gateMode: "off", mode: "deny" } });
		const s1 = createExtensionSession("rpc", [builtinBash]);
		shutdowns.push(() => s1.emit("session_shutdown"));
		await extension(s1.pi);
		await s1.emit("session_start");
		assert.deepEqual(await s1.turn(sid, "System prompt"), []);
		await s1.emit("session_shutdown");

		// Resume with guard disabled and NO systemPrompt passed on the turn
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: false, approvals: { gateMode: "off", mode: "deny" } });
		await s1.emit("session_start", { reason: "resume" });
		assert.deepEqual(await s1.turn(sid), []);
		await vi.waitFor(() => assert.equal(readSessionsFile()[key]?.runCommandGuardActive, false));
		assert.deepEqual(await s1.turn(sid), []);

		const launches = readLaunches(launchLog);
		assert.equal(launches.length, 2);
		assert.equal(launches[0].includes("--agent"), true);
		assert.equal(launches[1].includes("--agent"), false, "stale guarded carrier must not be passed");
		const prompts = readStreamStdinPrompts(launchLog);
		assert.equal(prompts.length, 3);
		assert.equal(prompts[0], "hi");
		assert.match(prompts[1], /run commands in the foreground within the turn/);
		assert.equal(prompts[1].includes("Native run_command is refused"), false);
		assert.equal(prompts[2], "hi");
	});

	test.each([
		{ engine: "stream-json" as const },
		{ engine: "acp" as const },
	])("$engine parked tool round-trip on resumed turn with changed guard state persists new state without repeating note", async ({ engine }) => {
		const nonce = randomUUID().slice(0, 8);
		const sid = `r4-parked-${engine}-${nonce}`;
		const key = sessionStoreKey(sid, engine);
		const holdDir = mkTmp();
		const holdFile = path.join(holdDir, "hold");
		const launchLog = setupFakeCarrier(engine, { holdFile });
		const readExt = { name: "read", description: "Read", parameters: { type: "object", properties: {} }, sourceInfo: { source: "extension" } };

		// 1. Start guarded
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: true, approvals: { gateMode: "off", mode: "deny" } });
		const s = createExtensionSession("rpc", [builtinBash, readExt], ["bash", "read"]);
		shutdowns.push(() => s.emit("session_shutdown"));
		await extension(s.pi);
		await s.emit("session_start");
		assert.deepEqual(await s.turn(sid, "System prompt"), []);
		await s.emit("session_shutdown");

		// 2. Resume with guard disabled; turn parks on a bridged read tool call
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: false, approvals: { gateMode: "off", mode: "deny" } });
		await s.emit("session_start", { reason: "resume" });

		fs.writeFileSync(holdFile, "1");
		const resumedTurn = s.turnRaw(sid, "System prompt");
		await vi.waitFor(() => expect(readLaunches(launchLog).length).toBe(2));
		const endpoint = findPrivateEndpoint();

		const parkedCall = mcpRequest(endpoint, "tools/call", { name: "read", arguments: {} });
		const parkResult = await resumedTurn;
		assert.deepEqual(parkResult.errors, []);
		assert.equal(parkResult.message?.stopReason, "toolUse");
		const toolUseBlock = (parkResult.message?.content ?? []).find((b: any) => b.type === "toolCall") as { id: string; name: string };
		assert.equal(toolUseBlock?.name, "read");

		const reentry = s.turnRaw(sid, "System prompt", [
			{ role: "user", content: "hi", timestamp: 1 },
			parkResult.message,
			{
				role: "toolResult",
				toolCallId: toolUseBlock.id,
				toolName: "read",
				content: [{ type: "text", text: "file body" }],
				isError: false,
				timestamp: 2,
			},
		]);
		await new Promise((r) => setTimeout(r, 40));
		fs.rmSync(holdFile, { force: true });

		const [parkRes, reentryRes] = await Promise.all([parkedCall, reentry]);
		assert.equal(parkRes.result?.isError, false);
		assert.deepEqual(reentryRes.errors, []);
		assert.equal(reentryRes.message?.stopReason, "stop");
		await vi.waitFor(() => assert.equal(readSessionsFile()[key]?.runCommandGuardActive, false));

		// Next turn must NOT repeat the note or restage
		assert.deepEqual(await s.turn(sid, "System prompt"), []);
		if (engine === "acp") {
			const prompts = deliveredPromptTexts(engine, launchLog);
			assert.equal(prompts.length, 3);
			assert.match(prompts[1], /run commands in the foreground within the turn/);
			assert.equal(prompts[2], "hi");
		} else {
			assert.equal(readLaunches(launchLog).length, 2);
			assert.deepEqual(readStreamStdinPrompts(launchLog), ["hi", "hi", "hi"]);
		}
	});
});

describe("R5 configured-agent inline refresh clears stale carrier", () => {
	test("guarded carrier -> resume unguarded with configured agent -> remove configured agent never reuses stale guarded carrier", async () => {
		const nonce = randomUUID().slice(0, 8);
		const sid = `r5-agent-${nonce}`;
		const key = sessionStoreKey(sid, "stream-json");
		const launchLog = setupFakeCarrier("stream-json");
		vi.stubEnv("AGY_AGENT", undefined);

		// 1. Start guarded without configured agent -> stages guarded carrier
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: true, agent: undefined, approvals: { gateMode: "off", mode: "deny" } });
		const s1 = createExtensionSession("rpc", [builtinBash]);
		shutdowns.push(() => s1.emit("session_shutdown"));
		await extension(s1.pi);
		await s1.emit("session_start");
		assert.deepEqual(await s1.turn(sid, "System prompt"), []);
		await vi.waitFor(() => assert.equal(readSessionsFile()[key]?.runCommandGuardActive, true));
		await s1.emit("session_shutdown");

		// 2. Resume unguarded with configured agent -> refreshes inline and clears staged carrier
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: false, agent: "custom-override", approvals: { gateMode: "off", mode: "deny" } });
		const s2 = createExtensionSession("rpc", [builtinBash]);
		shutdowns.push(() => s2.emit("session_shutdown"));
		await extension(s2.pi);
		await s2.emit("session_start", { reason: "resume" });
		assert.deepEqual(await s2.turn(sid, "System prompt"), []);
		await vi.waitFor(() => assert.equal(readSessionsFile()[key]?.runCommandGuardActive, false));

		// 3. Remove configured agent on next turn -> must NOT reuse the old guarded carrier
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: false, agent: undefined, approvals: { gateMode: "off", mode: "deny" } });
		assert.deepEqual(await s2.turn(sid, "System prompt"), []);

		const launches = readLaunches(launchLog);
		assert.equal(launches.length, 3);
		const agentIdx0 = launches[0].indexOf("--agent");
		assert.notEqual(agentIdx0, -1);
		assert.match(launches[0][agentIdx0 + 1], /^pi-bridge-sys-/);
		const agentIdx1 = launches[1].indexOf("--agent");
		assert.notEqual(agentIdx1, -1);
		assert.equal(launches[1][agentIdx1 + 1], "custom-override");
		assert.equal(launches[2].includes("--agent"), false, "stale guarded carrier must not be reused after override removal");

		const stdinPrompts = readStreamStdinPrompts(launchLog);
		assert.equal(stdinPrompts[0], "hi");
		assert.match(stdinPrompts[1], /run commands in the foreground within the turn/);
		assert.equal(stdinPrompts[1].includes("Native run_command is refused"), false);
		assert.equal(stdinPrompts[2], "hi");

		// 4. Re-enable guard on a later resume without configured agent -> restages fresh carrier from current state
		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: true, agent: undefined, approvals: { gateMode: "off", mode: "deny" } });
		await s2.emit("session_shutdown");
		await s2.emit("session_start", { reason: "resume" });
		assert.deepEqual(await s2.turn(sid, "System prompt"), []);
		const launchesAfter = readLaunches(launchLog);
		assert.equal(launchesAfter.length, 4);
		const agentIdx3 = launchesAfter[3].indexOf("--agent");
		assert.notEqual(agentIdx3, -1);
		assert.match(launchesAfter[3][agentIdx3 + 1], /^pi-bridge-sys-/);
		assert.notEqual(launchesAfter[3][agentIdx3 + 1], launches[0][agentIdx0 + 1]);
		const restagedDir = path.join(os.homedir(), ".gemini", "config", "agents", launchesAfter[3][agentIdx3 + 1]);
		tempDirs.push(restagedDir);
		assert.match(fs.readFileSync(path.join(restagedDir, "agent.md"), "utf8"), /Native run_command is refused/);
	});
});

describe("explicit systemPrompt: false suppresses guard-refresh notes while hook enforces", () => {
	test.each([
		{ engine: "stream-json" as const },
		{ engine: "acp" as const },
	])("$engine with systemPrompt: false enforces guard hook and bash catalog while suppressing prompt/refresh notes", async ({ engine }) => {
		const nonce = randomUUID().slice(0, 8);
		const sid = `sysprompt-false-${engine}-${nonce}`;
		const key = sessionStoreKey(sid, engine);
		const launchLog = setupFakeCarrier(engine);
		vi.stubEnv("AGY_SYSTEM_PROMPT", undefined);

		// Seed a legacy bound session without runCommandGuardActive (would normally trigger refresh in rpc mode)
		writeSessionsFile({
			[key]: { conversationId: `legacy-sys-off-${nonce}`, lastStepIdx: -1, lastMessageCount: 1 },
		});

		saveConfig({ askTool: false, webTools: false, bridgeTools: "all", runCommandGuard: true, systemPrompt: false, approvals: { gateMode: "off", mode: "deny" } });
		const s1 = createExtensionSession("rpc", [builtinBash]);
		shutdowns.push(() => s1.emit("session_shutdown"));
		await extension(s1.pi);
		await s1.emit("session_start", { reason: "resume" });

		// Bound turn with systemPrompt: false -> no guard-refresh note, yet hook & bash catalog still enforce
		assert.deepEqual(await s1.turn(sid, "System prompt"), []);
		const endpoint1 = findPrivateEndpoint();
		expectGuardHooksState(engine, endpoint1.dir, readLaunches(launchLog).at(-1)!, true);
		assert.equal(((await mcpRequest(endpoint1, "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), true);
		if (engine === "acp") {
			assert.deepEqual(deliveredPromptTexts(engine, launchLog), ["hi"]);
		} else {
			assert.equal(readLaunches(launchLog).at(-1)!.includes("--agent"), false);
			assert.deepEqual(readStreamStdinPrompts(launchLog), ["hi"]);
		}
		await s1.emit("session_shutdown");

		// Fresh conversation with systemPrompt: false and guard enabled -> hook enforces, no system prompt or guard note delivered
		const freshSid = `sysprompt-false-fresh-${engine}-${nonce}`;
		const s2 = createExtensionSession("rpc", [builtinBash]);
		shutdowns.push(() => s2.emit("session_shutdown"));
		await extension(s2.pi);
		await s2.emit("session_start");
		assert.deepEqual(await s2.turn(freshSid, "System prompt"), []);
		const endpoint2 = findPrivateEndpoint();
		expectGuardHooksState(engine, endpoint2.dir, readLaunches(launchLog).at(-1)!, true);
		assert.equal(((await mcpRequest(endpoint2, "tools/list", {})).result.tools as Array<{ name: string }>).some((t) => t.name === "bash"), true);
		if (engine === "acp") {
			assert.deepEqual(deliveredPromptTexts(engine, launchLog), ["hi", "hi"]);
		} else {
			assert.equal(readLaunches(launchLog).at(-1)!.includes("--agent"), false);
			assert.deepEqual(readStreamStdinPrompts(launchLog), ["hi", "hi"]);
		}
	});
});

// --- AC-2: gated delivery, pre-dispatch verification and guard routing ----------


const GATED_CONFIG = {
	askTool: false,
	webTools: false,
	bridgeTools: "all" as const,
	approvals: { gateMode: "shadow" as const, mode: "deny" as const },
};

function carrierLogs(launchLog: string) {
	const dir = path.dirname(launchLog);
	return { stream: path.join(dir, "stream.jsonl"), acp: path.join(dir, "acp.jsonl"), homeHooks: `${launchLog}.home-hooks.json` };
}

/** True when the carrier received a prompt (any engine). */
function promptReached(engine: "stream-json" | "acp", launchLog: string): boolean {
	const logs = carrierLogs(launchLog);
	const file = engine === "acp" ? logs.acp : logs.stream;
	if (!fs.existsSync(file)) return false;
	const text = fs.readFileSync(file, "utf8");
	return engine === "acp" ? text.includes('"session/prompt"') : text.trim().length > 0;
}

function handlerScripts(): string[] {
	let names: string[] = [];
	try { names = fs.readdirSync(logsDir()); } catch { /* none */ }
	return names.filter((n) => n.startsWith(`approval-hook-${process.pid}-`)).map((n) => path.join(logsDir(), n));
}

async function postApproval(endpoint: { serverUrl: string; token: string }, name: string, args: Record<string, unknown>) {
	const res = await fetch(new URL("/approval", endpoint.serverUrl), {
		method: "POST",
		headers: { "content-type": "application/json", [TOKEN_HEADER]: endpoint.token },
		body: JSON.stringify({ toolCall: { name, args } }),
	});
	return (await res.json()) as { decision?: string; reason?: string; ticket?: string };
}

async function startGated(engine: "stream-json" | "acp", overrides: Record<string, unknown> = {}, tools: unknown[] = [builtinBash], mode: string = "rpc") {
	const launchLog = setupFakeCarrier(engine);
	saveConfig({ ...GATED_CONFIG, ...overrides } as never);
	const s = createExtensionSession(mode, tools as never);
	shutdowns.push(() => s.emit("session_shutdown"));
	await extension(s.pi);
	await s.emit("session_start");
	return { s, launchLog };
}

test.each([
	["stream-json", "off", "shadow"],
	["stream-json", "shadow", "off"],
	["acp", "off", "shadow"],
	["acp", "shadow", "off"],
] as const)("%s keeps the initial %s gate when MCP startup changes config to %s", async (engine, initial, changed) => {
	const mcp = await import("../src/mcp-server.js");
	const startServer = mcp.startMcpServer;
	vi.spyOn(mcp, "startMcpServer").mockImplementation(async (...args) => {
		const result = await startServer(...args);
		saveConfig({ ...GATED_CONFIG, approvals: { gateMode: changed, mode: "deny" } });
		return result;
	});
	const { s, launchLog } = await startGated(engine, { approvals: { gateMode: initial, mode: "deny" } });
	assert.deepEqual(await s.turn(), [], "delivery and wiring agree with the startup latch");
	assert.equal(promptReached(engine, launchLog), true);
	const hooks = engine === "acp" ? carrierLogs(launchLog).homeHooks : hooksFile(findPrivateEndpoint().dir);
	const groups = fs.existsSync(hooks) ? readJson(hooks) : {};
	assert.equal(Object.hasOwn(groups, gateGroupKey()), initial === "shadow");
	assert.equal(handlerScripts().length > 0, initial === "shadow");
	if (initial === "shadow") {
		for (const f of handlerScripts()) fs.rmSync(f, { force: true });
		assert.match((await s.turn()).join("\n"), /approval gate is enabled but .*handler .* missing or unreadable/);
	}
});

describe("AC-2 gated delivery verified before every dispatch", () => {
	test.each([{ engine: "stream-json" as const }, { engine: "acp" as const }])("$engine: a missing handler script refuses the turn before any prompt", async ({ engine }) => {
		const { s, launchLog } = await startGated(engine);
		const scripts = handlerScripts();
		assert.ok(scripts.length > 0, "handler written at bridge start");
		for (const f of scripts) fs.rmSync(f, { force: true });
		const errors = await s.turn();
		assert.match(errors.join("\n"), /approval gate is enabled but .*handler .* missing or unreadable/);
		assert.equal(promptReached(engine, launchLog), false);
	});

	test.each([{ engine: "stream-json" as const }, { engine: "acp" as const }])("$engine: a handler script that does not match this instance refuses the turn", async ({ engine }) => {
		const { s, launchLog } = await startGated(engine);
		for (const f of handlerScripts()) fs.writeFileSync(f, "console.log('{\"decision\":\"allow\"}')\n");
		const errors = await s.turn();
		assert.match(errors.join("\n"), /handler .* does not match this instance/);
		assert.equal(promptReached(engine, launchLog), false);
	});

	test("stream-json: a missing or malformed owned group in the bridge hooks file refuses the turn", async () => {
		const { s, launchLog } = await startGated("stream-json");
		const dir = findPrivateEndpoint().dir;
		const file = hooksFile(dir);
		const good = readJson(file);
		// missing group
		fs.writeFileSync(file, JSON.stringify({ foreign: { enabled: true } }));
		assert.match((await s.turn()).join("\n"), /edit gate group .* is missing/);
		// malformed group (matcher narrowed)
		const narrowed = JSON.parse(JSON.stringify(good)) as Record<string, any>;
		narrowed[gateGroupKey()].PreToolUse[0].matcher = "run_command";
		fs.writeFileSync(file, JSON.stringify(narrowed));
		assert.match((await s.turn()).join("\n"), /malformed or does not match this instance/);
		// not JSON
		fs.writeFileSync(file, "{nope");
		assert.match((await s.turn()).join("\n"), /not a valid hooks object/);
		assert.equal(promptReached("stream-json", launchLog), false);
		// restored: dispatches
		fs.writeFileSync(file, JSON.stringify(good));
		assert.deepEqual(await s.turn(), []);
		assert.equal(promptReached("stream-json", launchLog), true);
	});

	test("acp: a home whose owned group was lost refuses the next turn before any new prompt", async () => {
		const { s, launchLog } = await startGated("acp");
		assert.deepEqual(await s.turn(), []);
		const home = readLaunches(launchLog)[0]![readLaunches(launchLog)[0]!.indexOf("--gemini-dir") + 1]!;
		const hooks = path.join(home, "config", "hooks.json");
		assert.equal(fs.existsSync(hooks), true, "owned groups live in the private home");
		const prompts = () => (fs.readFileSync(carrierLogs(launchLog).acp, "utf8").match(/"session\/prompt"/g) ?? []).length;
		assert.equal(prompts(), 1);
		fs.writeFileSync(hooks, JSON.stringify({ foreign: { enabled: true } }));
		assert.match((await s.turn()).join("\n"), /edit gate group .* is missing/);
		assert.equal(prompts(), 1, "no second prompt was sent");
	});

	test("stream-json: gate staging failure refuses the turn visibly (no soft pass)", async () => {
		const failing = vi.spyOn(approvalHookModule, "stageGateHooks").mockImplementation(() => { throw new Error("EACCES: simulated"); });
		const { s, launchLog } = await startGated("stream-json");
		assert.match((await s.turn()).join("\n"), /approval gate is enabled but .*(missing|not readable|not a valid)/);
		assert.equal(promptReached("stream-json", launchLog), false);
		failing.mockRestore();
	});

	test("acp: home merge failure refuses the turn before the carrier is even spawned", async () => {
		vi.spyOn(gateDeliveryModule, "mergeOwnedHookGroups").mockImplementation(() => { throw new Error("EROFS: simulated"); });
		const { s, launchLog } = await startGated("acp");
		const errors = await s.turn();
		assert.match(errors.join("\n"), /Cannot stage isolated ACP home: .*EROFS/);
		assert.equal(fs.existsSync(carrierLogs(launchLog).acp), false);
	});

	test.each([{ engine: "stream-json" as const }, { engine: "acp" as const }])("$engine: gate enabled with the bridge disabled refuses the turn", async ({ engine }) => {
		const { s, launchLog } = await startGated(engine, { bridgeTools: "none" });
		assert.match((await s.turn()).join("\n"), /bridge or hook handler is unavailable/);
		assert.equal(promptReached(engine, launchLog), false);
	});

	test("acp: AGY_AGENTS_ROOT legacy override with the gate enabled is refused visibly; gate off keeps the previous behavior", async () => {
		const root = mkTmp();
		vi.stubEnv("AGY_AGENTS_ROOT", root);
		const gated = await startGated("acp");
		assert.match((await gated.s.turn()).join("\n"), /AGY_AGENTS_ROOT bypasses private ACP home staging/);
		assert.equal(promptReached("acp", gated.launchLog), false);
		await gated.s.emit("session_shutdown");

		const off = await startGated("acp", { approvals: { gateMode: "off", mode: "deny" } });
		assert.deepEqual(await off.s.turn(), []);
		assert.equal(promptReached("acp", off.launchLog), true);
	});

	test("acp: foreign hooks in the user's config are preserved next to the owned groups; the home is cleaned up on shutdown", async () => {
		const globalHooks = path.join(os.homedir(), ".gemini", "config", "hooks.json");
		fs.mkdirSync(path.dirname(globalHooks), { recursive: true });
		const foreign = { "user-hook": { enabled: true, PreToolUse: [{ matcher: "view_file", hooks: [{ type: "command", command: "node user.mjs", timeout: 5 }] }] } };
		fs.writeFileSync(globalHooks, `\uFEFF${JSON.stringify(foreign)}`);
		tempDirs.push(globalHooks);
		const { s, launchLog } = await startGated("acp");
		assert.deepEqual(await s.turn(), []);
		const captured = readJson(carrierLogs(launchLog).homeHooks);
		assert.deepEqual(captured["user-hook"], foreign["user-hook"]);
		assert.ok(captured[gateGroupKey()] && captured[runCommandGuardGroupKey()]);
		const home = readLaunches(launchLog)[0]![readLaunches(launchLog)[0]!.indexOf("--gemini-dir") + 1]!;
		assert.equal(JSON.parse(fs.readFileSync(globalHooks, "utf8").replace(/^\uFEFF/, "")).hasOwnProperty("user-hook"), true, "the global file itself is never modified");
		await s.emit("session_shutdown");
		await vi.waitFor(() => expect(fs.existsSync(home)).toBe(false));
	});

	test("acp: two instances deliver to separate private homes that reference their own handler", async () => {
		const first = await startGated("acp");
		assert.deepEqual(await first.s.turn(), []);
		const hooks1 = readJson(carrierLogs(first.launchLog).homeHooks);
		const second = await startGated("acp");
		assert.deepEqual(await second.s.turn(), []);
		const hooks2 = readJson(carrierLogs(second.launchLog).homeHooks);
		const cmd = (h: Record<string, any>) => h[gateGroupKey()].PreToolUse[0].hooks[0].command as string;
		assert.notEqual(cmd(hooks1), cmd(hooks2), "each instance owns its handler script");
		const home1 = readLaunches(first.launchLog)[0]!;
		const home2 = readLaunches(second.launchLog)[0]!;
		assert.notEqual(home1[home1.indexOf("--gemini-dir") + 1], home2[home2.indexOf("--gemini-dir") + 1]);
	});

	test("stream-json: the bridge dir is the LAST --add-dir (production ordering) and carries the verified owned groups", async () => {
		const { s, launchLog } = await startGated("stream-json");
		assert.deepEqual(await s.turn(), []);
		const argv = readLaunches(launchLog)[0]!;
		const addDirs = addDirsFromArgv(argv);
		const bridgeDir = findPrivateEndpoint().dir;
		assert.equal(addDirs.at(-1), bridgeDir, `bridge dir last in ${JSON.stringify(argv)}`);
		assert.equal(addDirs[0], process.cwd(), "workspace add-dir first");
		const hooks = readJson(hooksFile(bridgeDir));
		assert.ok(hooks[gateGroupKey()] && hooks[runCommandGuardGroupKey()]);
	});

	test("stream-json: a failing MCP-home staging keeps the additive fallback and still dispatches with the gate verified", async () => {
		// Gate delivery on stream-json is the separate bridge --add-dir, verified
		// independently of the staged MCP home.
		vi.spyOn(homeModule, "stageAgyHome").mockImplementation(() => { throw new Error("EACCES: simulated"); });
		const { s, launchLog } = await startGated("stream-json");
		assert.deepEqual(await s.turn(), []);
		assert.equal(readLaunches(launchLog)[0]!.includes("--gemini_dir"), false);
		assert.equal(promptReached("stream-json", launchLog), true);
	});
});

describe("AC-1/AC-2 run_command routing under the edit gate", () => {
	test.each([{ engine: "stream-json" as const }, { engine: "acp" as const }])("$engine: verified guard -> the gate passes run_command (the guard hook denies it)", async ({ engine }) => {
		const { s } = await startGated(engine, { approvals: { gateMode: "shadow", mode: "allow" } });
		assert.deepEqual(await s.turn(), []);
		assert.deepEqual(await postApproval(findPrivateEndpoint(), "run_command", { CommandLine: "ls" }), { decision: "allow" });
	});

	test.each([{ engine: "stream-json" as const }, { engine: "acp" as const }])("$engine: expected guard missing/unusable -> the edit gate itself denies run_command with the Pi bash redirect, even under approvals.mode=allow", async ({ engine }) => {
		const { s } = await startGated(engine, { approvals: { gateMode: "shadow", mode: "allow" } });
		assert.deepEqual(await s.turn(), []);
		const endpoint = findPrivateEndpoint();
		assert.equal((await postApproval(endpoint, "run_command", { CommandLine: "ls" })).decision, "allow");
		// Break the guard handler; the next pre-dispatch verification notices.
		fs.rmSync(path.join(endpoint.dir, "run-command-guard.mjs"), { force: true });
		assert.deepEqual(await s.turn(), [], "a bad guard does not refuse the turn; it makes the gate deny run_command");
		const denied = await postApproval(endpoint, "run_command", { CommandLine: "ls" });
		assert.equal(denied.decision, "deny");
		assert.equal(denied.reason, formatRunCommandGuardReason(/pi-agy-[0-9a-f]{8}/.exec(denied.reason ?? "")![0]));
		assert.match(denied.reason ?? "", /pi-agy-[0-9a-f]{8}\/bash/);
		assert.equal(denied.ticket, undefined, "denied directly, never parked for Pi approval");
	});

	test.each([{ engine: "stream-json" as const }, { engine: "acp" as const }])("$engine: a guard-only staging failure at startup still wires the edit gate; run_command is denied with the Pi bash redirect", async ({ engine }) => {
		vi.spyOn(guardModule, "writeGuardHookScript").mockImplementation(() => { throw new Error("EACCES: simulated guard write failure"); });
		const { s } = await startGated(engine, { approvals: { gateMode: "shadow", mode: "allow" } });
		assert.deepEqual(await s.turn(), [], "the gated turn still dispatches");
		const endpoint = findPrivateEndpoint();
		const denied = await postApproval(endpoint, "run_command", { CommandLine: "ls" });
		assert.equal(denied.decision, "deny");
		assert.match(denied.reason ?? "", /pi-agy-[0-9a-f]{8}\/bash/);
		assert.equal(denied.ticket, undefined, "denied directly, never parked");
		const edit = await postApproval(endpoint, "create_file", { TargetFile: "/w/x", CodeContent: "a" });
		assert.equal(typeof edit.ticket, "string", "the edit gate is wired and parks other native tools");
		// Restart on the same bridge dir must not see a stuck partial bridge.
		await s.emit("session_shutdown");
		vi.restoreAllMocks();
		const again = await startGated(engine, { approvals: { gateMode: "shadow", mode: "allow" } });
		assert.deepEqual(await again.s.turn(), []);
		assert.equal((await postApproval(findPrivateEndpoint(), "run_command", { CommandLine: "ls" })).decision, "allow", "healthy restart verifies the guard");
	});

	test.each([{ engine: "stream-json" as const }, { engine: "acp" as const }])("$engine: guard intentionally inactive -> run_command requires Pi approval like any other tool", async ({ engine }) => {
		const { s } = await startGated(engine, { approvals: { gateMode: "shadow", mode: "allow" } }, [builtinBash], "tui");
		assert.deepEqual(await s.turn(), []);
		const body = await postApproval(findPrivateEndpoint(), "run_command", { CommandLine: "ls" });
		assert.equal(typeof body.ticket, "string", "parked for Pi approval");
		assert.equal(body.decision, undefined);
	});

	test.each([{ engine: "stream-json" as const }, { engine: "acp" as const }])("$engine: gate OFF + guard staging failure is not swallowed (fails visibly like HEAD)", async ({ engine }) => {
		vi.spyOn(guardModule, "writeGuardHookScript").mockImplementation(() => { throw new Error("EACCES: simulated guard write failure"); });
		await assert.rejects(
			() => startGated(engine, { approvals: { gateMode: "off", mode: "deny" } }),
			/simulated guard write failure/,
		);
	});

	test("gate off: guard delivery is unchanged (hooks-only add-dir on ACP, bridge dir on stream-json) and the gate is not verified", async () => {
		for (const engine of ["acp", "stream-json"] as const) {
			const { s, launchLog } = await startGated(engine, { approvals: { gateMode: "off", mode: "deny" } });
			assert.deepEqual(await s.turn(), []);
			const argv = readLaunches(launchLog)[0]!;
			expectGuardHooksState(engine, findPrivateEndpoint().dir, argv, true);
			await s.emit("session_shutdown");
		}
	});
});
