import assert from "node:assert/strict";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { globalConfigPath } from "../src/config.js";
import { spawnClaudeRuntime } from "../src/claude-runtime.js";

const previousDebug = process.env.CLAUDE_BRIDGE_DEBUG;
process.env.CLAUDE_BRIDGE_DEBUG = "1";
const { default: activate, __test } = await import("../src/index.js");
after(() => {
	if (previousDebug === undefined) delete process.env.CLAUDE_BRIDGE_DEBUG;
	else process.env.CLAUDE_BRIDGE_DEBUG = previousDebug;
});

const model = {
	id: "claude-opus-4-6", name: "Claude", api: "claude-bridge", provider: "claude-bridge",
	reasoning: true, input: ["text"], contextWindow: 200_000, maxTokens: 32_000,
};
const context = { messages: [{ role: "user", content: "hello", timestamp: 0 }], tools: [] };

// Hardlink when possible; CI runners keep node and the temp dir on different devices.
function placeRuntime(target) {
	try { fs.linkSync(process.execPath, target); } catch (error) {
		if (error.code !== "EXDEV") throw error;
		fs.copyFileSync(process.execPath, target);
	}
}

for (const path of ["provider", "summary", "AskClaude", "quota"]) {
	test(`${path} spawns the neutral Orca runtime, preserves SDK options and forwards stderr once`, { timeout: 10000 }, async (t) => {
		const dir = fs.mkdtempSync(join(tmpdir(), "bridge-runtime-spawn-"));
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const command = join(dir, "claude.exe");
		placeRuntime(command);
		const previousPane = process.env.ORCA_PANE_KEY;
		process.env.ORCA_PANE_KEY = "test-pane";
		t.after(() => {
			if (previousPane === undefined) delete process.env.ORCA_PANE_KEY;
			else process.env.ORCA_PANE_KEY = previousPane;
			__test.setQuery(null);
			__test.setAuxiliaryQuery(null);
			__test.resetSharedSession();
		});
		fs.writeFileSync(globalConfigPath(), JSON.stringify({
			startupNoticeShown: "2026-09-30", askClaude: { enabled: true },
			provider: { pathToClaudeCodeExecutable: command },
		}));
		let provider;
		let tool;
		let quota;
		const handlers = new Map();
		activate({
			on: (name, handler) => handlers.set(name, handler),
			registerProvider: (_id, value) => provider = value,
			registerTool: (value) => tool = value,
			registerCommand: (_name, value) => quota = value,
		});
		t.after(() => handlers.get("session_shutdown")({}, ctx));

		let child;
		let closed;
		let stdout = "";
		let spawnError;
		let receivedStderr = "";
		const stderrMarker = `runtime-stderr-${path}`;
		const stderrPayload = path === "provider" ? stderrMarker : `${stderrMarker}\n${"€".repeat(700000)}`;
		const logPath = process.env.CLAUDE_BRIDGE_DEBUG_PATH;
		const logStart = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8").length : 0;
		const launchedPath = join(dir, "launched.json");
		const controller = new AbortController();
		const captureQuery = ({ prompt, options }) => {
			const onStderr = options.stderr;
			options.stderr = (data) => { receivedStderr += data; onStderr?.(data); };
			if (path !== "provider") {
				assert.equal(options.spawnClaudeCodeProcess, undefined, "auxiliary calls use the SDK launcher");
				return query({ prompt, options: {
					...options,
					cwd: dir,
					env: { ...options.env, BRIDGE_RUNTIME_TEST: path, RUNTIME_LAUNCHED_PATH: launchedPath },
					executableArgs: ["-e", `require('node:fs').writeFileSync(process.env.RUNTIME_LAUNCHED_PATH, JSON.stringify({ executable: process.execPath, cwd: process.cwd(), env: process.env.BRIDGE_RUNTIME_TEST })); process.stderr.write(${JSON.stringify(stderrMarker)} + '\\n' + '€'.repeat(700000), () => process.exit(17))`, "--"],
				} });
			}
			assert.equal(typeof options.spawnClaudeCodeProcess, "function", "provider retains its exit-observing spawn hook");
			child = options.spawnClaudeCodeProcess({
				command,
				args: ["-e", `process.stdout.write(process.cwd() + '\\n' + process.env.BRIDGE_RUNTIME_TEST); process.stderr.write(${JSON.stringify(stderrPayload)})`],
				cwd: dir,
				env: { ...process.env, BRIDGE_RUNTIME_TEST: path },
				signal: controller.signal,
			});
			closed = new Promise((resolve) => {
				child.once("error", (error) => spawnError = error);
				child.once("close", (code) => resolve(code));
			});
			child.stdout.on("data", (chunk) => stdout += chunk);
			const q = (async function* () {
				yield { type: "result", subtype: "success", is_error: false, result: "ok" };
			})();
			q.interrupt = async () => {};
			q.close = () => {};
			return q;
		};
		__test.setQuery(captureQuery);
		__test.setAuxiliaryQuery(captureQuery);
		const ctx = {
			cwd: dir, ui: { notify() {} }, getSystemPrompt: () => "",
			sessionManager: { getSessionId: () => `runtime-${path}` },
		};
		if (path === "provider") await provider.streamSimple(provider.models[0], context, { sessionId: `runtime-${path}` }).result();
		else if (path === "summary") await __test.isolatedStreamFn(model, context, { cacheRetention: "none" }).result();
		else if (path === "AskClaude") await tool.execute("call", { prompt: "hello", mode: "none", isolated: true }, undefined, undefined, ctx);
		else await quota.handler("quota", ctx);

		if (path === "provider") {
			assert.ok(child, "provider must reach its spawn hook");
			assert.equal(await closed, 0, spawnError?.message);
			assert.equal(child.spawnfile, join(dir, "cc-bridge-runtime.exe"));
			assert.equal(stdout, `${dir}\n${path}`);
		} else {
			assert.deepEqual(JSON.parse(fs.readFileSync(launchedPath, "utf8")), { executable: join(dir, "cc-bridge-runtime.exe"), cwd: dir, env: path });
		}
		assert.equal(receivedStderr, stderrPayload, "stderr exceeds pipe capacity on auxiliary calls, with no test-installed stream drain");
		const stderrLog = fs.readFileSync(logPath, "utf8").slice(logStart).split("\n").filter((line) => line.includes("[cli-stderr ")).join("\n");
		assert.equal(stderrLog.split(stderrMarker).length - 1, 1, `${path}'s configured stderr callback receives each byte once`);
	});
}

for (const forward of [false, true]) {
	test(`the provider spawn drains more than pipe capacity ${forward ? "and forwards UTF-8 stderr exactly once" : "without a stderr callback"}`, { timeout: 5000 }, async (t) => {
		let received = "";
		const child = spawnClaudeRuntime({
			command: process.execPath,
			args: ["-e", "process.stderr.write('€'.repeat(700000), () => process.exit(0))"],
			env: process.env, signal: new AbortController().signal,
		}, forward ? (data) => received += data : undefined);
		const closed = new Promise((resolve, reject) => {
			child.once("error", reject);
			child.once("close", resolve);
		});
		t.after(async () => {
			if (child.exitCode === null) child.kill();
			await closed;
		});
		assert.equal(await closed, 0);
		if (forward) assert.equal(received, "€".repeat(700000));
	});
}

test("the provider spawn preserves the SDK's forwarded abort signal", { timeout: 5000 }, async (t) => {
	const controller = new AbortController();
	const child = spawnClaudeRuntime({
		command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"],
		env: process.env, signal: controller.signal,
	});
	t.after(() => { if (child.exitCode === null) child.kill(); });
	let aborted;
	const closed = new Promise((resolve) => {
		child.once("error", (error) => aborted = error);
		child.once("close", resolve);
	});
	child.once("spawn", () => controller.abort());
	await closed;
	assert.equal(aborted?.code, "ABORT_ERR");
	assert.equal(child.killed, true);
});
