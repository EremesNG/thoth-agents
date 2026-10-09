import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeContext, type Usage } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import { AcpDriver } from "../src/acp/driver.js";
import type { DriverActivity, TurnDriver } from "../src/driver-types.js";
import { type AgyModelEntry, toPiModel } from "../src/models.js";
import { createStreamSimple, ToolRoundTrips } from "../src/provider.js";
import { SessionStore } from "../src/sessions.js";
import { toPiUsage } from "../src/stream-events.js";

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
	});
	expect(usage.totalTokens).toBe(3_000_000);
});

// Prices independently verified in installed pi-ai providers/data/*.json (USD/M).
test.each([
	["gemini-3-7-flash", 0.75, 3.75, 0.075, 0],
	["gemini-3-1-pro", 2, 12, 0.2, 0],
	["claude-sonnet-4-6", 3, 15, 0.3, 3.75],
	["gpt-oss-120b", 0.15, 0.6, 0.075, 0],
	["gpt-oss-120b-low", 0.15, 0.6, 0.075, 0],
	["gpt-oss-120b-medium", 0.15, 0.6, 0.075, 0],
	["gpt-oss-120b-high", 0.15, 0.6, 0.075, 0],
] as const)("%s has explicit catalog prices, including cache-write usage", (id, input, output, cacheRead, cacheWrite) => {
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
	expect(usage.cost).toEqual({
		input,
		output,
		cacheRead,
		cacheWrite,
		total: input + output + cacheRead + cacheWrite,
	});
	expect(usage.totalTokens).toBe(4_000_000);
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
