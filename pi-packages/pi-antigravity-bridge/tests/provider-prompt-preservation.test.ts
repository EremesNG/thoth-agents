// Stream-json prompt preservation: Pi custom messages are normalized to user
// messages before a custom provider sees TranscriptContext. The provider must
// retain the current user suffix when a trailing context message follows it.
// Run: npm test -- packages/pi-antigravity-bridge/tests/provider-prompt-preservation.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { convertToLlm } from "@earendil-works/pi-coding-agent";
import {
	normalizeContext,
	type Api,
	type Model,
	type SimpleStreamOptions,
	type TranscriptContext,
} from "@earendil-works/pi-ai";
import { ToolRoundTrips, createStreamSimple } from "../src/provider.js";
import { SessionStore } from "../src/sessions.js";
import type { DriverTurnRequest, StreamDriver } from "../src/driver.js";

const model: Model<Api> = {
	id: "gemini-flash",
	name: "Gemini 3.6 Flash (Medium)",
	api: "agy-bridge" as Api,
	provider: "antigravity",
	baseUrl: "agy-bridge://antigravity",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 1_000_000,
	maxTokens: 65_536,
};

function tmpStorePath(): string {
	return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "agy-prompt-")), "sessions.json");
}

interface SeenRequest {
	opts?: DriverTurnRequest;
	calls: number;
}

function capturingDriver(seen: SeenRequest): StreamDriver {
	return {
		run: async (opts: DriverTurnRequest) => {
			seen.calls += 1;
			seen.opts = opts;
			return {
				id: "fake-turn",
				outcome: Promise.resolve({
					status: "OK",
					response: "ok",
					finished: true,
					aborted: false,
				}),
				next: async () => null,
				pushExternal: () => {},
			};
		},
	} as unknown as StreamDriver;
}

function normalizedTurn(): TranscriptContext {
	const now = Date.now();
	const normalized = convertToLlm([
		{ role: "user", content: "HISTORICAL_TASK_MARKER", timestamp: now },
		{
			role: "assistant",
			content: [{ type: "text", text: "PRIOR_ASSISTANT_MARKER" }],
			api: "test-api",
			provider: "other-provider",
			model: "test-model",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: now,
		},
		{ role: "user", content: "CURRENT_TASK_MARKER", timestamp: now },
		{
			role: "custom",
			customType: "pi-bridge-context",
			content: "TRAILING_CONTEXT_ONE",
			display: false,
			timestamp: now,
		},
		{
			role: "custom",
			customType: "pi-bridge-context",
			content: "TRAILING_CONTEXT_TWO",
			display: false,
			timestamp: now,
		},
	] as Parameters<typeof convertToLlm>[0]);

	// This is the actual Pi conversion: CustomMessage content becomes a user
	// message; customType/display/details do not reach the provider.
	assert.deepEqual(
		normalized.map((message) => message.role),
		["user", "assistant", "user", "user", "user"],
	);
	return normalizeContext({ systemPrompt: undefined, messages: normalized });
}

function normalizedCompactionTurn(preSuffixSummary: boolean): TranscriptContext {
	const now = Date.now();
	const summary = {
		role: "compactionSummary",
		summary: "COMPACTION_SUMMARY_MARKER",
		tokensBefore: 123,
		timestamp: now,
	};
	const assistant = {
		role: "assistant",
		content: [{ type: "text", text: "COMPACTION_PRE_SUFFIX_ASSISTANT" }],
		api: "test-api",
		provider: "other-provider",
		model: "test-model",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: now,
	};
	const suffix = [
		{ role: "user", content: "CURRENT_TASK_MARKER", timestamp: now },
		{
			role: "custom",
			customType: "pi-bridge-context",
			content: "TRAILING_CONTEXT_ONE",
			display: false,
			timestamp: now,
		},
		{
			role: "custom",
			customType: "pi-bridge-context",
			content: "TRAILING_CONTEXT_TWO",
			display: false,
			timestamp: now,
		},
	];
	const normalized = convertToLlm(
		(preSuffixSummary ? [summary, assistant, ...suffix] : [summary, ...suffix]) as Parameters<typeof convertToLlm>[0],
	);
	assert.deepEqual(
		normalized.map((message) => message.role),
		preSuffixSummary ? ["user", "assistant", "user", "user", "user"] : ["user", "user", "user", "user"],
	);
	return normalizeContext({ systemPrompt: undefined, messages: normalized });
}

async function capturePrompt(
	context: TranscriptContext,
	engine: "stream-json" | "acp",
	seen: SeenRequest,
	digest = false,
): Promise<void> {
	// Keep prompt assertions independent of persisted config and inherited
	// AGY_* values. The caller also supplies a disposable HOME/USERPROFILE.
	const previousAgy = Object.entries(process.env).filter(([key]) => key.startsWith("AGY_"));
	for (const [key] of previousAgy) delete process.env[key];
	process.env.AGY_MODE = "accept-edits";
	process.env.AGY_DIGEST = digest ? "1" : "0";
	process.env.AGY_SYSTEM_PROMPT = "0";
	try {
		const driver = capturingDriver(seen);
		const streamSimple = createStreamSimple({
			entries: [{ full: "gemini-3.6-flash", id: "gemini-flash" }],
			store: new SessionStore(tmpStorePath()),
			driver,
			acpDriver: engine === "acp" ? driver : undefined,
			engine,
			roundTrips: new ToolRoundTrips(driver),
		});
		const stream = streamSimple(model, context, { cwd: process.cwd() } as unknown as SimpleStreamOptions);
		for await (const event of stream) void event;
	} finally {
		for (const key of Object.keys(process.env)) {
			if (key.startsWith("AGY_")) delete process.env[key];
		}
		for (const [key, value] of previousAgy) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

test("stream-json preserves the current user task before normalized trailing context", async () => {
	const seen: SeenRequest = { calls: 0 };
	await capturePrompt(normalizedTurn(), "stream-json", seen);

	assert.equal(seen.calls, 1);
	assert.equal(
		seen.opts?.prompt,
		["CURRENT_TASK_MARKER", "TRAILING_CONTEXT_ONE", "TRAILING_CONTEXT_TWO"].join("\n\n"),
	);
	assert.equal((seen.opts?.prompt.match(/CURRENT_TASK_MARKER/g) ?? []).length, 1);
	assert.equal(seen.opts?.prompt.includes("HISTORICAL_TASK_MARKER"), false);
	assert.ok((seen.opts?.prompt.indexOf("TRAILING_CONTEXT_ONE") ?? -1) < (seen.opts?.prompt.indexOf("TRAILING_CONTEXT_TWO") ?? -1));
});

test("ACP keeps its existing last-user prompt behavior", async () => {
	const seen: SeenRequest = { calls: 0 };
	await capturePrompt(normalizedTurn(), "acp", seen);

	assert.equal(seen.calls, 1);
	assert.equal(seen.opts?.prompt, "TRAILING_CONTEXT_TWO");
});

test("stream-json digest excludes the entire current user suffix", async () => {
	const seen: SeenRequest = { calls: 0 };
	await capturePrompt(normalizedTurn(), "stream-json", seen, true);

	const prompt = seen.opts?.prompt ?? "";
	assert.equal(seen.calls, 1);
	assert.equal((prompt.match(/CURRENT_TASK_MARKER/g) ?? []).length, 1);
	assert.equal((prompt.match(/TRAILING_CONTEXT_ONE/g) ?? []).length, 1);
	assert.equal((prompt.match(/TRAILING_CONTEXT_TWO/g) ?? []).length, 1);
	assert.equal((prompt.match(/HISTORICAL_TASK_MARKER/g) ?? []).length, 1);
	assert.match(prompt, /\[earlier user message\]\nHISTORICAL_TASK_MARKER/);
	assert.match(prompt, /\[assistant turn from other-provider\]\nPRIOR_ASSISTANT_MARKER/);
});

test("ACP digest keeps its legacy last-message exclusion", async () => {
	const seen: SeenRequest = { calls: 0 };
	await capturePrompt(normalizedTurn(), "acp", seen, true);

	assert.equal(seen.calls, 1);
	assert.equal(seen.opts?.prompt, "TRAILING_CONTEXT_TWO");
	const embedded = seen.opts?.contextBlock?.text ?? "";
	assert.match(embedded, /HISTORICAL_TASK_MARKER/);
	assert.match(embedded, /CURRENT_TASK_MARKER/);
	assert.match(embedded, /TRAILING_CONTEXT_ONE/);
	assert.doesNotMatch(embedded, /TRAILING_CONTEXT_TWO/);
});

test("stream-json keeps a full-user compaction suffix once with digest off", async () => {
	const seen: SeenRequest = { calls: 0 };
	await capturePrompt(normalizedCompactionTurn(false), "stream-json", seen);

	const prompt = seen.opts?.prompt ?? "";
	assert.equal(seen.calls, 1);
	assert.equal((prompt.match(/COMPACTION_SUMMARY_MARKER/g) ?? []).length, 1);
	assert.equal((prompt.match(/CURRENT_TASK_MARKER/g) ?? []).length, 1);
	assert.equal((prompt.match(/TRAILING_CONTEXT_ONE/g) ?? []).length, 1);
	assert.equal((prompt.match(/TRAILING_CONTEXT_TWO/g) ?? []).length, 1);
});

test("stream-json does not repeat a compaction summary from the full-user suffix", async () => {
	const seen: SeenRequest = { calls: 0 };
	await capturePrompt(normalizedCompactionTurn(false), "stream-json", seen, true);

	const prompt = seen.opts?.prompt ?? "";
	assert.equal(seen.calls, 1);
	assert.equal((prompt.match(/COMPACTION_SUMMARY_MARKER/g) ?? []).length, 1);
	assert.equal((prompt.match(/CURRENT_TASK_MARKER/g) ?? []).length, 1);
	assert.equal((prompt.match(/TRAILING_CONTEXT_ONE/g) ?? []).length, 1);
	assert.equal((prompt.match(/TRAILING_CONTEXT_TWO/g) ?? []).length, 1);
	assert.doesNotMatch(prompt, /\[pi compaction summary\]/);
});

test("stream-json retains a compaction summary before the current suffix", async () => {
	const seen: SeenRequest = { calls: 0 };
	await capturePrompt(normalizedCompactionTurn(true), "stream-json", seen, true);

	const prompt = seen.opts?.prompt ?? "";
	assert.equal(seen.calls, 1);
	assert.equal((prompt.match(/COMPACTION_SUMMARY_MARKER/g) ?? []).length, 1);
	assert.equal((prompt.match(/CURRENT_TASK_MARKER/g) ?? []).length, 1);
	assert.equal((prompt.match(/TRAILING_CONTEXT_ONE/g) ?? []).length, 1);
	assert.equal((prompt.match(/TRAILING_CONTEXT_TWO/g) ?? []).length, 1);
	assert.match(prompt, /\[pi compaction summary\]/);
	assert.match(prompt, /COMPACTION_PRE_SUFFIX_ASSISTANT/);
});

test("ACP retains compaction digest behavior for a full-user suffix", async () => {
	const seen: SeenRequest = { calls: 0 };
	await capturePrompt(normalizedCompactionTurn(false), "acp", seen, true);

	assert.equal(seen.calls, 1);
	assert.equal(seen.opts?.prompt, "TRAILING_CONTEXT_TWO");
	const embedded = seen.opts?.contextBlock?.text ?? "";
	assert.equal((embedded.match(/COMPACTION_SUMMARY_MARKER/g) ?? []).length, 1);
	assert.match(embedded, /CURRENT_TASK_MARKER/);
	assert.match(embedded, /TRAILING_CONTEXT_ONE/);
	assert.doesNotMatch(embedded, /TRAILING_CONTEXT_TWO/);
});

test("stream-json does not search backward past a terminal toolResult", async () => {
	const now = Date.now();
	const normalized = convertToLlm([
		{ role: "user", content: "CURRENT_TASK_MARKER", timestamp: now },
		{
			role: "custom",
			customType: "pi-bridge-context",
			content: "TRAILING_CONTEXT_ONE",
			display: false,
			timestamp: now,
		},
		{
			role: "toolResult",
			toolCallId: "terminal-call",
			toolName: "exec_command",
			content: [{ type: "text", text: "TOOL_RESULT_MARKER" }],
			isError: false,
			timestamp: now,
		},
	] as Parameters<typeof convertToLlm>[0]);
	const seen: SeenRequest = { calls: 0 };

	await capturePrompt(normalizeContext({ systemPrompt: undefined, messages: normalized }), "stream-json", seen);
	assert.equal(seen.calls, 0);
	assert.equal(seen.opts, undefined);
});
