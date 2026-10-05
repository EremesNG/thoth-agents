#!/usr/bin/env node
// Opt-in only: activate the real bridge in-process and run real SDK queries.
// No global Pi CLI/shim dependency; works on Windows as well as Unix.
// Exit 2 means INCONCLUSIVE (live acceptance remains unrun), never PASS.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";

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
	const staticAppend = `<bridge-probe-static>\n${"This is unchanged static probe guidance, not a probe value. Follow the current value block.\n".repeat(150)}</bridge-probe-static>`;
	assert.ok(staticAppend.length > 10_000);
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
	let bridgeTest;
	let deliveredContexts = [];
	let deliveryError;
	const sessionIds = new Set();
	const inconclusive = (reason) => {
		console.log(`INCONCLUSIVE: ${reason}; live acceptance remains unrun`);
		process.exitCode = 2;
	};
	try {
		const { default: activate, __test } = await import("../src/index.js");
		bridgeTest = __test;
		// Observe real SDK hook deliveries without changing bridge query semantics.
		__test.setQuery(({ prompt, options }) => {
			if (!options.hooks) return sdkQuery({ prompt, options });
			const hooks = {
				...options.hooks,
				UserPromptSubmit: options.hooks.UserPromptSubmit.map((matcher) => ({
					...matcher,
					hooks: matcher.hooks.map((hook) => async (...args) => {
						const output = await hook(...args);
						const context = output.hookSpecificOutput?.additionalContext;
						if (context !== undefined) {
							deliveredContexts.push(context);
							if (context.length > 9_000)
								deliveryError = new Error(`Delivered context exceeded 9,000 units: ${context.length}`);
						}
						return output;
					}),
				})),
			};
			return sdkQuery({ prompt, options: { ...options, hooks } });
		});
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
			deliveredContexts = [];
			deliveryError = undefined;
			const valueBlock = `<bridge-probe-value>\nThe current bridge_probe_value is ${value}. When asked for bridge_probe_value, report only the value from your current appended instructions, not earlier conversation answers. A newer appended-instructions version supersedes the old value.\n</bridge-probe-value>`;
			const append = `${staticAppend}\n\n${valueBlock}`;
			assert.ok(append.indexOf(valueBlock) > 2_000, "changed sentinel must be outside CC's persisted-output preview");
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
			if (deliveryError) throw deliveryError;
			assert.ok(deliveredContexts.every((context) => context.length <= 9_000));
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
				contexts: [...deliveredContexts],
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
		assert.ok(enabled.contexts.length > 0, "registered refresh must actually deliver context");
		assert.ok(
			enabled.contexts.every((context) => context.length <= 9_000),
			"every delivered context must stay inline",
		);
		assert.ok(
			enabled.contexts.some((context) => context.includes("<bridge-probe-value>")),
			"changed sentinel block must be delivered",
		);
		assert.ok(
			enabled.contexts.every((context) => !context.includes("<bridge-probe-static>")),
			"unchanged large block must not be resent",
		);
		if (enabled.text !== B) throw new Error(`Expected refreshed value ${B}, got ${enabled.text}`);
		console.log(
			"PASS: active recording + same-epoch reuse established; model reported new sentinel beyond the large static append; every hook value ≤9,000 units",
		);
	} catch (error) {
		process.exitCode = 1;
		console.error(`FAIL: ${error.message}`);
	} finally {
		handlers.get("session_shutdown")?.({}, sessionCtx);
		bridgeTest?.setQuery(null);
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
