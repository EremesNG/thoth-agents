#!/usr/bin/env node
// Opt-in only: activate the real bridge in-process and run real SDK queries.
// No global Pi CLI/shim dependency; works on Windows as well as Unix.
// Exit 2 means INCONCLUSIVE (AC-3 remains unrun), never PASS.
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CLAUDE_BRIDGE_TESTING_PROMPT_REFRESH !== "1") {
	console.log("SKIP: set CLAUDE_BRIDGE_TESTING_PROMPT_REFRESH=1 to run the live append-refresh probe");
} else {
	await run();
}

async function run() {
	const logDir = resolve(
		process.env.CLAUDE_BRIDGE_TEST_LOG_DIR ?? join(dirname(dirname(fileURLToPath(import.meta.url))), ".test-output"),
	);
	mkdirSync(logDir, { recursive: true });
	const debugLog = join(logDir, "append-instructions-debug.log");
	const sdkLog = join(logDir, "append-instructions-sdk.jsonl");
	writeFileSync(debugLog, "");
	writeFileSync(sdkLog, "");
	// Set before module evaluation: the bridge captures these at import time.
	process.env.CLAUDE_BRIDGE_DEBUG = "1";
	process.env.CLAUDE_BRIDGE_DEBUG_PATH = debugLog;
	process.env.CLAUDE_BRIDGE_RECORD_STREAM = sdkLog;
	const oldCwd = process.cwd();
	const cwd = mkdtempSync(join(tmpdir(), "pi-claude-bridge-append-live-"));
	mkdirSync(join(cwd, ".pi"));
	writeFileSync(join(cwd, ".pi", "claude-bridge.json"), '{"askClaude":{"enabled":false}}\n');
	process.chdir(cwd);
	const A = `alpha_${randomUUID().replaceAll("-", "")}`;
	const B = `beta_${randomUUID().replaceAll("-", "")}`;
	const piSessionId = randomUUID();
	const messages = [];
	const handlers = new Map();
	const sessionCtx = {
		sessionManager: { getSessionId: () => piSessionId },
		mode: "rpc",
		ui: { notify: (message) => console.log(`NOTICE: ${message}`) },
	};
	let provider;
	let turnNumber = 0;
	const sessionIds = new Set();
	const inconclusive = (reason) => {
		console.log(`INCONCLUSIVE: ${reason}; AC-3 remains unrun`);
		process.exitCode = 2;
	};
	try {
		const { default: activate } = await import("../src/index.js");
		activate({
			on: (name, handler) => handlers.set(name, handler),
			registerProvider: (_name, config) => {
				provider = config;
			},
			registerTool: () => {},
		});
		handlers.get("session_start")({ reason: "new" }, sessionCtx);
		const modelId = process.env.CLAUDE_BRIDGE_TESTING_PROMPT_REFRESH_MODEL ?? "claude-haiku-4-5";
		const model = provider.models.find((m) => m.id === modelId);
		if (!model) throw new Error(`Bridge model not registered: ${modelId}`);

		async function prompt(value, deliveryEnabled) {
			const debugOffset = readFileSync(debugLog, "utf8").length;
			const sdkOffset = readFileSync(sdkLog, "utf8").length;
			process.env.CLAUDE_BRIDGE_TESTING_DISABLE_APPEND_REFRESH = deliveryEnabled ? "0" : "1";
			const append = `The current bridge_probe_value is ${value}. When asked for bridge_probe_value, report only the value from your current appended instructions, not earlier conversation answers. A newer appended-instructions version supersedes the old value.`;
			// Exercise the real lifecycle captures and the shared-options mutation
			// used by extensions running after the bridge's before_agent_start.
			const basePrompt = `Live probe prompt state ${++turnNumber}`;
			const systemPromptOptions = {};
			handlers.get("before_agent_start")({ systemPrompt: basePrompt, systemPromptOptions });
			systemPromptOptions.appendSystemPrompt = append;
			const systemPrompt = `${basePrompt}\n\n${append}`;
			const promptCtx = { ...sessionCtx, getSystemPrompt: () => systemPrompt };
			handlers.get("agent_start")({}, promptCtx);
			handlers.get("turn_start")({}, promptCtx);
			// User prompts contain no probe values; only observed replies enter history.
			messages.push({
				role: "user",
				content: "What is the current bridge_probe_value? Reply with only that value. Do not use tools.",
				timestamp: Date.now(),
			});
			const response = await provider
				.streamSimple(
					model,
					{ systemPrompt, messages, tools: [] },
					{
						sessionId: piSessionId,
						signal: AbortSignal.timeout(180_000),
					},
				)
				.result();
			messages.push(response);
			// Let the bridge's completion/finally release its query before the next prompt.
			await new Promise((done) => setImmediate(done));
			const debug = readFileSync(debugLog, "utf8").slice(debugOffset);
			const sdkMessages = readFileSync(sdkLog, "utf8")
				.slice(sdkOffset)
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line));
			const sessionId = sdkMessages.find((m) => m.type === "system" && m.subtype === "init")?.session_id;
			if (sessionId) sessionIds.add(sessionId);
			const text = response.content
				.filter((block) => block.type === "text")
				.map((block) => block.text)
				.join("")
				.trim();
			if (response.errorMessage) console.log(`Query error: ${response.errorMessage}`);
			return {
				text,
				debug,
				sessionId,
				compacted: sdkMessages.some((m) => m.type === "system" && m.subtype === "compact_boundary"),
			};
		}
		function reused(turn, sessionId) {
			const markers = [...turn.debug.matchAll(/syncResult: path=(\S+)(?: sessionId=([a-f0-9-]+))?/g)];
			return (
				sessionId &&
				turn.sessionId === sessionId &&
				!turn.compacted &&
				markers.length === 1 &&
				markers[0][1] === "reuse" &&
				markers[0][2] === sessionId
			);
		}
		const first = await prompt(A, true);
		console.log(`Initial value: ${first.text}`);
		if (
			first.text !== A ||
			!first.sessionId ||
			first.compacted ||
			!first.debug.includes("syncResult: path=clean-start") ||
			first.debug.includes("syncResult: path=rebuild")
		) {
			inconclusive("initial append was not reliably observed in a fresh recording epoch");
			return;
		}
		const control = await prompt(B, false);
		console.log(`Delivery-disabled value: ${control.text}`);
		if (
			!reused(control, first.sessionId) ||
			!control.debug.includes("append-refresh: enabled=false registered=false")
		) {
			inconclusive("delivery-disabled query reuse without rebuild was not proven");
			return;
		}
		if (control.text === B) {
			inconclusive("system prompt recording is inactive for this account/model (changed append was already visible)");
			return;
		}
		if (control.text !== A) {
			inconclusive("delivery-disabled response did not establish active recording");
			return;
		}
		console.log(`Recording active; reused CC session ${first.sessionId} without rebuild.`);
		const enabled = await prompt(B, true);
		console.log(`Delivery-enabled value: ${enabled.text}`);
		if (!reused(enabled, first.sessionId)) {
			inconclusive("delivery-enabled query did not reuse the proven recording epoch");
			return;
		}
		if (!enabled.debug.includes("append-refresh: enabled=true registered=true"))
			throw new Error("refresh hook was not registered");
		if (enabled.text !== B) throw new Error(`Expected refreshed value ${B}, got ${enabled.text}`);
		console.log("PASS: active recording + same-session reuse established; changed append delivered through the hook");
	} catch (error) {
		process.exitCode = 1;
		console.error(`FAIL: ${error.message}`);
	} finally {
		handlers.get("session_shutdown")?.({}, sessionCtx);
		delete process.env.CLAUDE_BRIDGE_TESTING_DISABLE_APPEND_REFRESH;
		const { deleteSession } = await import("cc-session-io");
		for (const sessionId of sessionIds) deleteSession(sessionId, cwd, process.env.CLAUDE_CONFIG_DIR);
		process.chdir(oldCwd);
		try {
			// Windows may briefly keep the Claude Code child's handle on the workdir.
			rmSync(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
		} catch (error) {
			console.warn(`Cleanup skipped for ${cwd}: ${error.message}`);
		}
		console.log(`Debug log: ${debugLog}\nSDK log: ${sdkLog}`);
	}
}
