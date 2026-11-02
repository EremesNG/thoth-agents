import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateCost, normalizeContext, type Usage } from "@earendil-works/pi-ai";
import { getModels } from "@earendil-works/pi-ai/compat";
import { beforeAll, expect, test } from "vitest";
import { warmJobLauncher } from "./helpers/warm-job-launcher.js";
import { AcpDriver } from "../src/acp/driver.js";
import type { DriverActivity, TurnDriver } from "../src/driver-types.js";
import { type AgyModelEntry, toPiModel } from "../src/models.js";
import { createStreamSimple, ToolRoundTrips } from "../src/provider.js";
import { SessionStore } from "../src/sessions.js";
import { toPiUsage } from "../src/stream-events.js";

// Each isolated file owns a fresh Windows job helper.
beforeAll(warmJobLauncher, 60_000);

function emptyUsage(): Usage {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

test("normalized Gemini Flash usage reports catalog API-equivalent cost", () => {
	const usage = emptyUsage();
	toPiUsage(
		{ input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_tokens: 1_000_000 },
		usage,
		"gemini-3-6-flash",
	);
	expect(usage.cost).toEqual({
		input: 0.75,
		output: 3.75,
		cacheRead: 0.075,
		cacheWrite: 0,
		total: 4.575,
		totalFromProvider: false,
	});
	expect(usage.totalTokens).toBe(3_000_000);
});

// Check each normalized id against SDK pricing for its catalog equivalent,
// including input-token tiers, rather than a frozen price snapshot.
// Single-tier discovery preserves the qualified id, so price those variants too.
test.each([
	["gemini-3-8-flash", "google", "gemini-3.8-flash"],
	["gemini-3-8-flash-low", "google", "gemini-3.8-flash"],
	["gemini-3-8-flash-medium", "google", "gemini-3.8-flash"],
	["gemini-3-8-flash-high", "google", "gemini-3.8-flash"],
	["claude-sonnet-5-5", "anthropic", "claude-sonnet-5-5"],
	["claude-sonnet-5-5-low", "anthropic", "claude-sonnet-5-5"],
	["claude-sonnet-5-5-medium", "anthropic", "claude-sonnet-5-5"],
	["claude-sonnet-5-5-high", "anthropic", "claude-sonnet-5-5"],
	["claude-opus-5-5", "anthropic", "claude-opus-5-5"],
	["claude-opus-5-5-low", "anthropic", "claude-opus-5-5"],
	["claude-opus-5-5-medium", "anthropic", "claude-opus-5-5"],
	["claude-opus-5-5-high", "anthropic", "claude-opus-5-5"],
	["gemini-3-7-flash", "google", "gemini-3.7-flash"],
	["gemini-3-1-pro", "google", "gemini-3.1-pro-preview"],
	["claude-sonnet-4-6", "anthropic", "claude-sonnet-4-6"],
	["gpt-oss-120b", "groq", "openai/gpt-oss-120b"],
	["gpt-oss-120b-low", "groq", "openai/gpt-oss-120b"],
	["gpt-oss-120b-medium", "groq", "openai/gpt-oss-120b"],
	["gpt-oss-120b-high", "groq", "openai/gpt-oss-120b"],
] as const)("%s has explicit catalog prices, including cache-write usage", (id, provider, catalogId) => {
	const catalogModel = getModels(provider).find((model) => model.id === catalogId);
	expect(catalogModel).toBeDefined();
	const expectedUsage = {
		...emptyUsage(),
		input: 1_000_000,
		output: 1_000_000,
		cacheRead: 1_000_000,
		cacheWrite: 1_000_000,
		totalTokens: 4_000_000,
	};
	calculateCost(catalogModel!, expectedUsage);
	const usage = emptyUsage();
	toPiUsage(
		{
			input_tokens: 1_000_000,
			output_tokens: 1_000_000,
			cache_read_tokens: 1_000_000,
			cache_write_tokens: 1_000_000,
		},
		usage,
		id,
	);
	expect(usage).toEqual(expectedUsage);
	expect(usage.cost.total).toBeGreaterThan(0);
});

test("Gemini Argon stays zero-cost and warns once without a verified catalog equivalent", () => {
	const events: unknown[][] = [];
	const log = (...args: unknown[]) => events.push(args);
	const usage = emptyUsage();
	toPiUsage({ input_tokens: 1_000_000 }, usage, "gemini-3-6-flash");
	expect(usage.cost.total).toBeGreaterThan(0);
	toPiUsage({ output_tokens: 1_000_000 }, usage, "gemini-4-argon", log);
	toPiUsage({ output_tokens: 2_000_000 }, usage, "gemini-4-argon", log);
	expect(usage.cost).toEqual(emptyUsage().cost);
	expect(events).toEqual([["usage-unpriced", { modelId: "gemini-4-argon" }, "warn"]]);
});

test("unmapped ids stay unpriced and log once, without guessing from CLI names", () => {
	const events: unknown[][] = [];
	const log = (...args: unknown[]) => events.push(args);
	const usage = emptyUsage();
	toPiUsage({ input_tokens: 1_000_000 }, usage, "gemini-3-6-flash");
	toPiUsage({ output_tokens: 1_000_000 }, usage, "unmapped-cost-test", log);
	toPiUsage({ output_tokens: 2_000_000 }, usage, "unmapped-cost-test", log);
	expect(usage.cost).toEqual(emptyUsage().cost);
	expect(events).toEqual([["usage-unpriced", { modelId: "unmapped-cost-test" }, "warn"]]);
	toPiUsage({ input_tokens: 1_000_000 }, usage, "gemini-3.6-flash", log);
	expect(usage.cost.total).toBe(0);
	expect(events).toHaveLength(2);
});

async function finalUsage(driver: TurnDriver, entry: AgyModelEntry, engine: "stream-json" | "acp") {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-message-cost-"));
	const streamSimple = createStreamSimple({
		entries: [entry],
		driver,
		engine,
		store: new SessionStore(path.join(dir, "sessions.json")),
		roundTrips: new ToolRoundTrips(driver),
	});
	const seenCosts: number[] = [];
	try {
		const stream = streamSimple(
			toPiModel(entry),
			normalizeContext({ messages: [{ role: "user", content: "one two three", timestamp: 0 }] }),
		);
		for await (const event of stream) {
			if (event.type === "text_delta") seenCosts.push(event.partial.usage.cost.total);
			if (event.type === "done") return { usage: event.message.usage, seenCosts };
			if (event.type === "error") throw new Error(event.error.errorMessage);
		}
		throw new Error("missing terminal message");
	} finally {
		await driver.close("shutdown");
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

test("stream-json terminal message has cost from normalized Pi id, not CLI slug", async () => {
	const activities: DriverActivity[] = [
		{
			type: "usage",
			usage: { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_tokens: 1_000_000 },
		},
		{ type: "text", delta: "priced answer" },
	];
	const driver = {
		run: async () => ({
			id: "cost-turn",
			next: async () => activities.shift() ?? null,
			pushExternal: () => {},
			outcome: Promise.resolve({
				status: "OK",
				response: "priced answer",
				finished: true,
				aborted: false,
			}),
		}),
		close: async () => {},
	} as unknown as TurnDriver;
	const result = await finalUsage(
		driver,
		{ full: "gemini-3.6-flash", id: "gemini-3-6-flash", efforts: ["low", "high"] },
		"stream-json",
	);
	expect(result.usage.cost.total).toBe(4.575);
	expect(result.seenCosts).toEqual([4.575]);
});

test("ACP terminal exact usage replaces live estimates and recomputes every cost component", async () => {
	const driver = new AcpDriver({
		bin: process.execPath,
		binArgs: [fileURLToPath(new URL("./helpers/fake-acp-server.mjs", import.meta.url))],
		extraEnv: { ACP_FAKE_SCENARIO: "exact-usage" },
		usageEstimate: "estimate",
		log: () => {},
	});
	const result = await finalUsage(
		driver,
		{ full: "claude-sonnet-4-6", id: "claude-sonnet-4-6" },
		"acp",
	);
	// Three prompt + two response word estimates were priced before text emission.
	expect(result.seenCosts[0]).toBeCloseTo(0.000039, 12);
	expect(result.usage).toMatchObject({
		input: 1000,
		output: 2000,
		cacheRead: 3000,
		cacheWrite: 4000,
		totalTokens: 10000,
	});
	expect(result.usage.cost.input).toBeCloseTo(0.003, 12);
	expect(result.usage.cost.output).toBeCloseTo(0.03, 12);
	expect(result.usage.cost.cacheRead).toBeCloseTo(0.0009, 12);
	expect(result.usage.cost.cacheWrite).toBeCloseTo(0.015, 12);
	expect(result.usage.cost.total).toBeCloseTo(0.0489, 12);
});
