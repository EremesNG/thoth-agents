import { makeNodeFixture } from "./helpers/node-fixture.js";
// Unit tests for the models catalog cache (src/models.ts).
//
// Covers read/writeModelsCache round-trip + validation, and the three
// loadModelCatalogRaw branches (fresh -> no spawn, no-cache -> spawn + persist,
// stale -> discover for the current load). Spawning uses a temp fake `agy`
// binary so no real agy is needed.
// Run: npm test

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import {
	entriesFromRaw,
	FALLBACK_MODELS,
	loadModelCatalogRaw,
	MODELS_CACHE_TTL_MS,
	MODELS_OUTPUT_CAP_BYTES,
	refreshModelsInBackground,
	refreshModelCatalogIfNeeded,
	spawnAgyModelsRaw,
	toPiModel,
} from "../src/models.js";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Temp cache path unique per test (avoids touching the real user cache). */
function tempCachePath(): string {
	return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "agy-models-cache-")), "models-cache.json");
}

/** A fake `agy` binary that prints `output` (ignoring args), executable. */
function makeFakeAgy(output: string): string {
	return makeNodeFixture(`process.stdout.write(${JSON.stringify(output)});`);
}

/** Read raw field from a cache file, or null if missing/unparseable. */
function readCacheRaw(cachePath: string): string | null {
	try {
		return (JSON.parse(fs.readFileSync(cachePath, "utf8")) as { raw?: string }).raw ?? null;
	} catch {
		return null;
	}
}

/** Poll a cache file until its raw matches `expected`, or fail after timeout. */
async function waitForCacheRaw(cachePath: string, expected: string, timeoutMs = 2000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (readCacheRaw(cachePath) === expected) return;
		await sleep(20);
	}
	assert.fail(`cache did not update to ${JSON.stringify(expected)} (got ${JSON.stringify(readCacheRaw(cachePath))})`);
}

// --- TTL constant -----------------------------------------------------------

test("MODELS_CACHE_TTL_MS is 5 minutes", () => {
	assert.equal(MODELS_CACHE_TTL_MS, 5 * 60_000);
});

// --- loadModelCatalogRaw: fresh cache -> no spawn ---------------------------

test("loadModelCatalogRaw: fresh cache is returned without spawning agy", async () => {
	const cachePath = tempCachePath();
	// Seed a fresh cache whose raw differs from what the fake binary prints, so a
	// spawn would be detectable as a changed return value.
	fs.writeFileSync(cachePath, JSON.stringify({ raw: "CACHED", savedAt: Date.now() }));
	const bin = makeFakeAgy("FRESH");

	const raw = await loadModelCatalogRaw(bin, cachePath);
	assert.equal(raw, "CACHED"); // served from cache, spawn did not run
});

// --- loadModelCatalogRaw: no cache -> spawn + persist -----------------------

test("loadModelCatalogRaw: no cache discovers and persists the current catalog", async () => {
	const cachePath = tempCachePath();
	const bin = makeFakeAgy(`gemini-4-argon-low
gemini-4-argon-high`);

	const raw = await loadModelCatalogRaw(bin, cachePath);
	assert.equal(raw, `gemini-4-argon-low
gemini-4-argon-high`);
	assert.equal(readCacheRaw(cachePath), raw);
});

// --- loadModelCatalogRaw: stale cache -> discover before registration ---------

test("loadModelCatalogRaw: stale cache discovers Argon for the current load", async () => {
	const cachePath = tempCachePath();
	fs.writeFileSync(cachePath, JSON.stringify({ raw: "gemini-3.6-flash-low", savedAt: 0 }));
	const fresh = `gemini-4-argon-low
gemini-4-argon-medium
gemini-4-argon-high`;
	const raw = await loadModelCatalogRaw(makeFakeAgy(fresh), cachePath);
	assert.equal(raw, fresh);
	assert.equal(readCacheRaw(cachePath), fresh);
	assert.equal(entriesFromRaw(raw)[0].full, "gemini-4-argon");
});

// --- refreshModelsInBackground: writes the cache on success -----------------

test("refreshModelsInBackground: persists agy output to the cache", async () => {
	const cachePath = tempCachePath();
	const bin = makeFakeAgy("BG-RESULT");
	refreshModelsInBackground(bin, cachePath);
	await waitForCacheRaw(cachePath, "BG-RESULT");
});

// --- corrupt / missing cache -----------------------------------------------

test("loadModelCatalogRaw: corrupt cache discovers and persists a replacement", async () => {
	const cachePath = tempCachePath();
	fs.writeFileSync(cachePath, "{not valid json");
	const bin = makeFakeAgy("gemini-4-argon-low");

	const raw = await loadModelCatalogRaw(bin, cachePath);
	assert.equal(raw, "gemini-4-argon-low");
	assert.equal(readCacheRaw(cachePath), raw);
});

// --- entriesFromRaw: collapses effort-driven bases, keeps fixed models -------

// Gemini and Claude bases with >= 2 tier variants collapse to one BASE-slug
// entry whose `efforts` lists exactly what agy accepts (Pro keeps only
// low/high; Claude 5.5 ships low/medium/high). Models with 0 or 1 tier
// variants keep agy's exact qualified slug without --effort.
test("entriesFromRaw: collapses Gemini and Claude bases, keeps fixed models", () => {
	const raw = [
		"gemini-3.8-flash-high",
		"gemini-3.8-flash-medium",
		"gemini-3.8-flash-low",
		"gemini-3.6-flash-high",
		"gemini-3.6-flash-medium",
		"gemini-3.6-flash-low",
		"gemini-3.1-pro-high",
		"gemini-3.1-pro-low",
		"claude-sonnet-5-5-low",
		"claude-sonnet-5-5-medium",
		"claude-sonnet-5-5-high",
		"claude-opus-5-5-low",
		"claude-opus-5-5-medium",
		"claude-opus-5-5-high",
		"gpt-oss-120b-medium",
	].join("\n");
	const summary = entriesFromRaw(raw).map((e) =>
		e.efforts ? `${e.id}[${e.efforts.join("/")}]` : e.id,
	);
	assert.deepEqual(summary, [
		"gemini-3-8-flash[low/medium/high]",
		"gemini-3-6-flash[low/medium/high]",
		"gemini-3-1-pro[low/high]",
		"claude-sonnet-5-5[low/medium/high]",
		"claude-opus-5-5[low/medium/high]",
	]);
});

test("entriesFromRaw: trims and drops blank lines, keeps order", () => {
	const ids = entriesFromRaw("\n  claude-sonnet-5-5-high  \n\n").map((e) => e.id);
	assert.deepEqual(ids, ["claude-sonnet-5-5-high"]);
});

// Banner/auth lines and leading-dash tokens must never become models (the
// latter would reach agy's flag parser as --model -high). Unverified families
// with >= 2 tier variants stay qualified: only verified effort-capable
// families collapse, so an unknown or fixed-thinking family degrades safely.
test("entriesFromRaw: drops noise/leading-dash lines; unverified families stay qualified", () => {
	const raw = [
		"Available models:",
		"-high",
		"gemini-3.6-flash-high",
		"gemini-3.6-flash-low",
		"futuremodel-x-low",
		"futuremodel-x-high",
	].join("\n");
	const summary = entriesFromRaw(raw).map((e) =>
		e.efforts ? `${e.id}[${e.efforts.join("/")}]` : e.id,
	);
	assert.deepEqual(summary, [
		"gemini-3-6-flash[low/high]",
		"futuremodel-x-low",
		"futuremodel-x-high",
	]);
});

// agy prints TWO columns: "<slug>  <display label>". --model takes only the
// slug (col 1); the label is display-only and must never reach --model. This
// is the REAL `agy models` stdout shape (verified live), distinct from the
// bare-slug fixtures above, which document format tolerance (a line with no
// whitespace splits to col1 = itself, so bare slugs still parse).
test("entriesFromRaw: splits slug from label in agy's real two-column output", () => {
	const raw = [
		"gemini-3.8-flash-high     Gemini 3.8 Flash (High)",
		"gemini-3.8-flash-medium   Gemini 3.8 Flash (Medium)",
		"gemini-3.8-flash-low      Gemini 3.8 Flash (Low)",
		"gemini-3.1-pro-high       Gemini 3.1 Pro (High)",
		"gemini-3.1-pro-low        Gemini 3.1 Pro (Low)",
		"claude-opus-5-5-low       Claude Opus 5.5 (Low)",
		"claude-opus-5-5-medium    Claude Opus 5.5 (Medium)",
		"claude-opus-5-5-high      Claude Opus 5.5 (High)",
		"claude-sonnet-5-5-low     Claude Sonnet 5.5 (Low)",
		"claude-sonnet-5-5-medium  Claude Sonnet 5.5 (Medium)",
		"claude-sonnet-5-5-high    Claude Sonnet 5.5 (High)",
		"gpt-oss-120b-medium       GPT-OSS 120B (Medium)",
	].join("\n");
	const summary = entriesFromRaw(raw).map((e) =>
		e.efforts ? `${e.id}[${e.efforts.join("/")}]` : e.id,
	);
	assert.deepEqual(summary, [
		"gemini-3-8-flash[low/medium/high]",
		"gemini-3-1-pro[low/high]",
		"claude-opus-5-5[low/medium/high]",
		"claude-sonnet-5-5[low/medium/high]",
	]);
});

test("entriesFromRaw: drops the retired GPT-OSS family even while listed", () => {
	const ids = entriesFromRaw([
		"gemini-3.8-flash-high", "gemini-3.8-flash-low",
		"gpt-oss-120b-medium", "gpt-oss-999b-medium",
	].join("\n")).map(e => e.id);
	assert.deepEqual(ids, ["gemini-3-8-flash"]);
});

// A banner word split from its line (col1 = "Available") is NOT a model slug.
// Real agy slugs always contain a hyphen (family-version-name); requiring one
// keeps prose banners out once we split columns (the old whole-line space
// rejection no longer applies after the col1 split).
test("entriesFromRaw: two-column output drops banner tokens lacking a hyphen", () => {
	const raw = [
		"Available models:",
		"gemini-3.6-flash-high   Gemini 3.6 Flash (High)",
		"gemini-3.6-flash-low    Gemini 3.6 Flash (Low)",
	].join("\n");
	const summary = entriesFromRaw(raw).map((e) => e.id);
	assert.deepEqual(summary, ["gemini-3-6-flash"]);
});

// --- toPiModel: toggle + level restriction follow the base's tiers -----------

test("toPiModel: effort-driven base shows toggle restricted to its tiers", () => {
	const flash = toPiModel({
		full: "gemini-3.6-flash",
		id: "gemini-3-6-flash",
		efforts: ["low", "medium", "high"],
	});
	const pro = toPiModel({
		full: "gemini-3.1-pro",
		id: "gemini-3-1-pro",
		efforts: ["low", "high"],
	});
	const claude = toPiModel({
		full: "claude-sonnet-5-5",
		id: "claude-sonnet-5-5",
		efforts: ["low", "medium", "high"],
	});
	const unverified = toPiModel({ full: "futuremodel-x-medium", id: "futuremodel-x-medium" });

	assert.equal(flash.reasoning, true);
	assert.equal(pro.reasoning, true);
	assert.equal(claude.reasoning, true);
	assert.equal(unverified.reasoning, false);

	// off/minimal always hidden (agy has no no-thinking); Pro also hides medium.
	assert.deepEqual(flash.thinkingLevelMap, { off: null, minimal: null });
	assert.deepEqual(pro.thinkingLevelMap, { off: null, minimal: null, medium: null });
	assert.deepEqual(claude.thinkingLevelMap, { off: null, minimal: null });
	assert.equal(unverified.thinkingLevelMap, undefined);
});

// --- spawnAgyModelsRaw stdout cap -------------------------------------------

/** Fake `agy` streams `chunks` x 64KiB, awaiting each write's drain so the
	*  cap exercises the live process rather than racing an early natural exit. */
function makeStreamingFakeAgy(chunks: number): string {
	return makeNodeFixture(`for(let i=0;i<${chunks};i++) await new Promise(r => process.stdout.write('x'.repeat(65536), r));`);
}

test("spawnAgyModelsRaw kills a runaway stream past the cap and fails closed", async () => {
	// 40 chunks = 2.5MiB, well past MODELS_OUTPUT_CAP_BYTES.
	const bin = makeStreamingFakeAgy(40);
	const raw = await spawnAgyModelsRaw(bin);
	assert.equal(raw, "");
});

test("spawnAgyModelsRaw keeps output at exactly the cap (strict > boundary)", async () => {
	// 16 chunks = 1MiB exactly: must pass through untouched, exit 0.
	const bin = makeStreamingFakeAgy(16);
	const raw = await spawnAgyModelsRaw(bin);
	assert.equal(raw.length, MODELS_OUTPUT_CAP_BYTES);
	assert.match(raw, /^x+$/);
});

test("loadModelCatalogRaw: discovery failures retain stale cache or select static fallback", async () => {
	for (const output of ["", "Available models:"]) {
		const bin = makeFakeAgy(output);
		const cachePath = tempCachePath();
		assert.equal(await loadModelCatalogRaw(bin, cachePath), "");
		fs.writeFileSync(cachePath, JSON.stringify({ raw: "gemini-3.6-flash-low", savedAt: 0 }));
		assert.equal(await loadModelCatalogRaw(bin, cachePath), "gemini-3.6-flash-low");
		assert.equal(readCacheRaw(cachePath), "gemini-3.6-flash-low");
	}
	assert.equal(await loadModelCatalogRaw(path.join(os.tmpdir(), "missing-agy-binary"), tempCachePath()), "");
});

test("loadModelCatalogRaw: unwritable cache does not discard successful discovery", async () => {
	const cachePath = tempCachePath();
	fs.writeFileSync(cachePath, "parent is a file");
	const raw = await loadModelCatalogRaw(makeFakeAgy("gemini-4-argon-low"), path.join(cachePath, "child.json"));
	assert.equal(raw, "gemini-4-argon-low");
});

test("fallback catalog refreshes Flash and Sonnet without removing Argon", () => {
	assert.deepEqual(FALLBACK_MODELS.map(e => e.full), [
		"gemini-4-argon", "gemini-3.8-flash", "gemini-3.1-pro", "claude-sonnet-5-5",
	]);
	assert.deepEqual(FALLBACK_MODELS.find(e => e.full === "claude-sonnet-5-5")?.efforts, ["low", "medium", "high"]);
});

test("fallback catalog exposes Argon with all three efforts", () => {
	assert.deepEqual(FALLBACK_MODELS.find(e => e.full === "gemini-4-argon"), {
		full: "gemini-4-argon", id: "gemini-4-argon", efforts: ["low", "medium", "high"],
	});
});

test("loadModelCatalogRaw: concurrent stale loads share discovery and persist once", async () => {
	const cachePath = tempCachePath();
	const marker = path.join(path.dirname(cachePath), "launches");
	const bin = makeNodeFixture(`import fs from 'node:fs'; fs.appendFileSync(${JSON.stringify(marker)}, 'x'); setTimeout(() => console.log('gemini-4-argon-low'), 50);`);
	const results = await Promise.all([loadModelCatalogRaw(bin, cachePath), loadModelCatalogRaw(bin, cachePath), refreshModelCatalogIfNeeded(bin, cachePath)]);
	assert.equal(results[0], "gemini-4-argon-low\n");
	assert.equal(results[1], results[0]);
	assert.equal(fs.readFileSync(marker, "utf8"), "x");
});

test("loadModelCatalogRaw: hung discovery times out and retains stale cache", async () => {
	const cachePath = tempCachePath();
	fs.writeFileSync(cachePath, JSON.stringify({ raw: "gemini-3.6-flash-low", savedAt: 0 }));
	const start = Date.now();
	const raw = await loadModelCatalogRaw(makeNodeFixture("setInterval(() => {}, 1000);"), cachePath);
	assert.equal(raw, "gemini-3.6-flash-low");
	assert.ok(Date.now() - start < 11000, "discovery and termination must remain bounded");
}, 12000);
