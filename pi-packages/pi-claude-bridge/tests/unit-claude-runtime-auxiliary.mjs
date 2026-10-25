import assert from "node:assert/strict";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { globalConfigPath } from "../src/config.js";
import { resolveSdkClaudeExecutable } from "../src/claude-runtime.js";

// Failure diagnostics must not depend on the bridge's opt-in debug callback.
delete process.env.CLAUDE_BRIDGE_DEBUG;
delete process.env.DEBUG_CLAUDE_AGENT_SDK;
const { default: activate, __test } = await import("../src/index.js");
const model = {
	id: "claude-opus-4-6", name: "Claude", api: "claude-bridge", provider: "claude-bridge",
	reasoning: true, input: ["text"], contextWindow: 200_000, maxTokens: 32_000,
};
const context = { messages: [{ role: "user", content: "offline", timestamp: 0 }], tools: [] };
const diagnostic = "Claude Code process exited with code 17. stderr: OFFLINE_DIAGNOSTIC_MARKER";

async function sdkFailure(options) {
	const q = query({ prompt: "offline", options });
	try {
		for await (const _message of q) { /* this offline fixture only exits */ }
		assert.fail("expected the offline executable to fail");
	} catch (error) {
		return error.message;
	} finally { q.close(); }
}

test("default binary resolution matches the installed SDK without launching a process", async () => {
	let sdkExecutable;
	const failure = await sdkFailure({ spawnClaudeCodeProcess: ({ command }) => {
		sdkExecutable = command;
		throw new Error("OFFLINE_RESOLUTION_PROBE");
	} }).catch((error) => error.message);
	assert.equal(resolveSdkClaudeExecutable(), sdkExecutable);
	assert.match(failure, sdkExecutable ? /OFFLINE_RESOLUTION_PROBE/ : /Native CLI binary .* not found/);
});

for (const insideOrca of [false, true]) {
	for (const path of ["summary", "AskClaude", "quota"]) {
		test(`${path} preserves built-in stderr-tail errors with DEBUG off ${insideOrca ? "inside Orca through the alias" : "outside Orca"}`, { timeout: 10000 }, async (t) => {
			const dir = fs.mkdtempSync(join(tmpdir(), "bridge-auxiliary-runtime-"));
			t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
			const executable = join(dir, "claude.exe");
			fs.linkSync(process.execPath, executable);
			const launchedPath = join(dir, "launched-path.txt");
			const launchOptions = {
				executableArgs: ["-e", "require('node:fs').writeFileSync(process.env.RUNTIME_LAUNCHED_PATH, process.execPath); process.stderr.write(' '.repeat(2 * 1024 * 1024) + 'OFFLINE_DIAGNOSTIC_MARKER', () => process.exit(17))", "--"],
				env: { ...process.env, RUNTIME_LAUNCHED_PATH: launchedPath },
				cwd: dir,
			};
			assert.equal(await sdkFailure({ ...launchOptions, pathToClaudeCodeExecutable: executable }), diagnostic);
			fs.rmSync(launchedPath);

			const previousPane = process.env.ORCA_PANE_KEY;
			const previousHandle = process.env.ORCA_TERMINAL_HANDLE;
			delete process.env.ORCA_TERMINAL_HANDLE;
			if (insideOrca) process.env.ORCA_PANE_KEY = "test-pane";
			else delete process.env.ORCA_PANE_KEY;
			t.after(() => {
				if (previousPane === undefined) delete process.env.ORCA_PANE_KEY;
				else process.env.ORCA_PANE_KEY = previousPane;
				if (previousHandle === undefined) delete process.env.ORCA_TERMINAL_HANDLE;
				else process.env.ORCA_TERMINAL_HANDLE = previousHandle;
				__test.setAuxiliaryQuery(null);
				__test.resetSharedSession();
			});
			fs.writeFileSync(globalConfigPath(), JSON.stringify({ startupNoticeShown: "2026-09-30", askClaude: { enabled: true }, provider: { pathToClaudeCodeExecutable: executable } }));
			let tool;
			let quota;
			const handlers = new Map();
			activate({ on: (name, handler) => handlers.set(name, handler), registerProvider() {}, registerTool: (value) => tool = value, registerCommand: (_name, value) => quota = value });
			t.after(() => handlers.get("session_shutdown")({}, ctx));
			let receivedOptions;
			__test.setAuxiliaryQuery(({ prompt, options }) => {
				receivedOptions = options;
				assert.equal(options.stderr, undefined, "DEBUG is off");
				return query({ prompt, options: { ...options, ...launchOptions } });
			});
			let output;
			const ctx = { cwd: dir, ui: { notify: (message) => output = message }, getSystemPrompt: () => "", sessionManager: { getSessionId: () => `auxiliary-${path}` } };
			if (path === "summary") output = (await __test.isolatedStreamFn(model, context, { cacheRetention: "none" }).result()).errorMessage;
			else if (path === "AskClaude") output = (await tool.execute("call", { prompt: "offline", mode: "none", isolated: true }, undefined, undefined, ctx)).content[0].text;
			else await quota.handler("quota", ctx);

			assert.ok(output?.includes(diagnostic), `expected the SDK's built-in diagnostic, got: ${output}`);
			assert.equal(receivedOptions.spawnClaudeCodeProcess, undefined, "auxiliary calls retain the SDK launcher");
			const expectedPath = insideOrca ? join(dir, "cc-bridge-runtime.exe") : executable;
			assert.equal(fs.readFileSync(launchedPath, "utf8"), expectedPath);
			assert.equal(receivedOptions.pathToClaudeCodeExecutable, expectedPath);
		});
	}
}
