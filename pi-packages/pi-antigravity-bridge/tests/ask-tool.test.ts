import { makeNodeFixture } from "./helpers/node-fixture.js";
// Tests for the AskAntigravity tool's catalog parsing and alias resolution.
//
// agy prints TWO columns per line: "<slug>  <display label>". --model takes
// only the slug (col 1); the label is display-only. Gemini and Claude split
// tiers to --effort; unverified families keep their exact slug without effort.
// Run: npm test

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeAll, test, vi } from "vitest";
import { warmJobLauncher } from "./helpers/warm-job-launcher.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildFinalPrompt, resolveModel, reviewerAgentMd, stageReviewerAgent, toolModelsFromRaw } from "../src/ask-tool.js";
import { toAgyEffort } from "../src/models.js";
import * as ownedProcess from "../src/owned-process.js";
import { parseAgentFrontmatter } from "./helpers/frontmatter.js";
import { withoutUnhandledRejections } from "./helpers/unhandled-rejections.js";

// Each isolated file owns a fresh Windows job helper.
beforeAll(warmJobLauncher, 60_000);

vi.mock("../src/mcp-registration.js", () => ({
	acquireBridgeSuppression: () => () => {},
}));

// The REAL `agy models` stdout shape (verified live 2026-10, trimmed to two
// flash families).
const RAW = [
	"gemini-3.8-flash-high     Gemini 3.8 Flash (High)",
	"gemini-3.8-flash-medium   Gemini 3.8 Flash (Medium)",
	"gemini-3.8-flash-low      Gemini 3.8 Flash (Low)",
	"gemini-3.6-flash-high     Gemini 3.6 Flash (High)",
	"gemini-3.6-flash-medium   Gemini 3.6 Flash (Medium)",
	"gemini-3.6-flash-low      Gemini 3.6 Flash (Low)",
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

const entries = toolModelsFromRaw(RAW);
const DEFAULT_THINKING = "medium";

test("toolModelsFromRaw: drops the retired GPT-OSS family even while listed", () => {
	assert.ok(RAW.includes("gpt-oss-120b-medium"), "fixture must exercise the filter");
	const catalog = toolModelsFromRaw(`${RAW}\ngpt-oss-999b-medium`);
	assert.equal(catalog.some(e => e.full.startsWith("gpt-oss-")), false);
	assert.equal(resolveModel("gpt-oss", catalog, DEFAULT_THINKING), null);
	assert.equal(resolveModel("gpt-oss-120b-medium", catalog, DEFAULT_THINKING), null);
});

test("resolveModel: bare tiered base ids resolve with default or explicit effort", () => {
	assert.deepEqual(resolveModel("claude-sonnet-5-5", entries, DEFAULT_THINKING), {
		model: "claude-sonnet-5-5", effort: "medium",
	});
	assert.deepEqual(resolveModel(" CLAUDE-OPUS-5-5 ", entries, DEFAULT_THINKING, "high"), {
		model: "claude-opus-5-5", effort: "high",
	});
	const noMedium = entries.filter(e => e.tier !== "medium");
	assert.deepEqual(resolveModel("claude-sonnet-5-5", noMedium, "low", "medium"), {
		model: "claude-sonnet-5-5", effort: "high",
	});
	assert.deepEqual(resolveModel("gemini-3.8-flash", entries, DEFAULT_THINKING, "low"), {
		model: "gemini-3.8-flash", effort: "low",
	});
	assert.deepEqual(resolveModel("gemini-3.1-pro", entries, DEFAULT_THINKING), {
		model: "gemini-3.1-pro", effort: "high",
	});
});

test("toolModelsFromRaw: splits the slug (col 1) off the display label", () => {
	// The label must never reach --model: full is the slug only.
	const flashHigh = entries.find((e) => e.full === "gemini-3.8-flash-high");
	assert.deepEqual(flashHigh, {
		full: "gemini-3.8-flash-high",
		family: "flash",
		version: "3.8",
		tier: "high",
	});

	// Tiered Claude slugs parse like Gemini: the -low/-medium/-high suffix is
	// the tier, family "other".
	const sonnetLow = entries.find((e) => e.full === "claude-sonnet-5-5-low");
	assert.deepEqual(sonnetLow, {
		full: "claude-sonnet-5-5-low",
		family: "other",
		version: "5",
		tier: "low",
	});
	const opus = entries.find((e) => e.full === "claude-opus-5-5-high");
	assert.equal(opus?.tier, "high");
	assert.equal(opus?.family, "other");
});

test("resolveModel: friendly alias splits Gemini base + default effort", () => {
	assert.deepEqual(resolveModel("flash", entries, DEFAULT_THINKING), {
		model: "gemini-3.8-flash",
		effort: "medium",
	});
	// Pro has no medium variant; its family default is high.
	assert.deepEqual(resolveModel("pro", entries, DEFAULT_THINKING), {
		model: "gemini-3.1-pro",
		effort: "high",
	});
});

test("resolveModel: explicit tier and pinned version", () => {
	assert.deepEqual(resolveModel("flash high", entries, DEFAULT_THINKING), {
		model: "gemini-3.8-flash",
		effort: "high",
	});
	assert.deepEqual(resolveModel("3.6 flash low", entries, DEFAULT_THINKING), {
		model: "gemini-3.6-flash",
		effort: "low",
	});
});

test("resolveModel: short aliases pick the tiered Claude entry and split base+effort", () => {
	// Claude ships low/medium/high like Gemini now: the alias resolves to the
	// base slug and the tier rides --effort (agy rejects a bare base).
	assert.deepEqual(resolveModel("sonnet", entries, DEFAULT_THINKING), {
		model: "claude-sonnet-5-5",
		effort: "medium",
	});
	assert.deepEqual(resolveModel("opus", entries, DEFAULT_THINKING), {
		model: "claude-opus-5-5",
		effort: "medium",
	});
	assert.equal(resolveModel("gpt-oss", entries, DEFAULT_THINKING), null);
});

test("resolveModel: an exact tiered slug splits to base + effort (not passed whole)", () => {
	// Passing the whole tiered slug to --model is what agy rejects; the resolver
	// must split it exactly like an alias would.
	assert.deepEqual(resolveModel("gemini-3.6-flash-high", entries, DEFAULT_THINKING), {
		model: "gemini-3.6-flash",
		effort: "high",
	});
	assert.equal(resolveModel("gpt-oss-120b-medium", entries, DEFAULT_THINKING), null);
	assert.equal(resolveModel("futuremodel-9-ultra", entries, DEFAULT_THINKING), null);
	const unverified = toolModelsFromRaw("futuremodel-x-low\nfuturemodel-x-high");
	assert.deepEqual(resolveModel("futuremodel-x-high", unverified, DEFAULT_THINKING), {
		model: "futuremodel-x-high",
	});
	// Claude tiered slugs split exactly like Gemini's.
	assert.deepEqual(resolveModel("claude-sonnet-5-5-low", entries, DEFAULT_THINKING), {
		model: "claude-sonnet-5-5",
		effort: "low",
	});
});

test("resolveModel: explicit preferred tier beats alias tier, default, and clamps to the family", () => {
	// The thinking param wins over the alias's own tier and the default.
	assert.deepEqual(resolveModel("flash high", entries, DEFAULT_THINKING, "low"), {
		model: "gemini-3.8-flash",
		effort: "low",
	});
	// Pro has no medium variant; the explicit tier clamps to the nearest
	// listed tier (distance tie low/high -> higher rank wins).
	assert.deepEqual(resolveModel("pro", entries, DEFAULT_THINKING, "medium"), {
		model: "gemini-3.1-pro",
		effort: "high",
	});
	// The explicit tier beats the Claude default and clamps to listed tiers.
	assert.deepEqual(resolveModel("sonnet", entries, DEFAULT_THINKING, "high"), {
		model: "claude-sonnet-5-5",
		effort: "high",
	});
});

test("toAgyEffort: full pi thinking-level vocabulary clamps to agy tiers", () => {
	const all: readonly ("low" | "medium" | "high")[] = ["low", "medium", "high"];
	assert.equal(toAgyEffort("minimal", all), "low");
	assert.equal(toAgyEffort("medium", all), "medium");
	assert.equal(toAgyEffort("xhigh", all), "high");
	assert.equal(toAgyEffort("max", all), "high");
	assert.equal(toAgyEffort(undefined, all), "low");
});

test("resolveModel: short aliases still resolve when agy omits them (static overlay)", () => {
	// agy lists only Gemini here; the static overlay fills in the rest so the
	// aliases never regress to the old human-name format.
	const geminiOnly = toolModelsFromRaw(
		[
			"gemini-3.6-flash-high   Gemini 3.6 Flash (High)",
			"gemini-3.6-flash-medium Gemini 3.6 Flash (Medium)",
			"gemini-3.6-flash-low    Gemini 3.6 Flash (Low)",
		].join("\n"),
	);
	assert.deepEqual(resolveModel("sonnet", geminiOnly, DEFAULT_THINKING), {
		model: "claude-sonnet-5-5",
		effort: "medium",
	});
	assert.equal(resolveModel("gpt-oss", geminiOnly, DEFAULT_THINKING), null);
	assert.deepEqual(resolveModel("opus", geminiOnly, DEFAULT_THINKING, "low"), {
		model: "claude-opus-5-5",
		effort: "low",
	});
});

// --- Prompt assembly (headless plan-mode hardening) ------------------------
// Root cause probed 2026-09-28: `agy -p --mode plan` soft-denies run_command
// and the turn ends AT the denial (exit 0, empty stdout, no second model
// turn), so one unguarded command attempt kills the whole run. The prompt is
// the only lever the tool owns without touching user config.

test("buildFinalPrompt: plan mode appends the no-commands guard", () => {
	const out = buildFinalPrompt("Review the diff.\n---\ndiff body", "plan", false);
	assert.ok(out.startsWith("Review the diff."));
	// The guard must forbid shell commands outright and point the model back
	// at the prompt material - the only reliably available input.
	assert.match(out, /Do not run shell commands/);
	assert.match(out, /ends the session immediately/);
	assert.ok(
		out.endsWith("state exactly what is missing in your answer instead of trying to fetch it."),
	);
});

test("buildFinalPrompt: plan + digest keeps digest prefix first, guard last", () => {
	const out = buildFinalPrompt("body", "plan", true);
	assert.ok(out.startsWith("(Use compact digests, not full file contents.)\n"));
	assert.ok(out.includes("(Use compact digests, not full file contents.)\nbody\n"));
	assert.ok(out.endsWith("instead of trying to fetch it."));
});

test("buildFinalPrompt: accept-edits never carries the guard", () => {
	// Edit runs keep their tools under skip-permissions; appending the guard
	// would break delegated edits and command use.
	assert.equal(buildFinalPrompt("do the edit", "accept-edits", false), "do the edit");
	assert.equal(
		buildFinalPrompt("do the edit", "accept-edits", true),
		"(Use compact digests, not full file contents.)\ndo the edit",
	);
});

// --- Plan-mode reviewer agent (enforced edit denial) -----------------------
// Probed 2026-09-28 on agy 1.2.12: a per-call agent whose tools list carries
// no file-editing tool reports "none" for edits (hard block, with or without
// the skip flag); commandExecutionPolicy auto lets read commands run headless
// with no user allow rules; plan discipline blocks a redirect-write. The
// prompt guard alone was observed failing once (a sub-agent edited files),
// so the toolset restriction is the real enforcement layer.

test("buildFinalPrompt: agent-damper plan run forbids file mutation and steers away from commands", () => {
	const out = buildFinalPrompt("review this", "plan", false, true);
	assert.match(out, /Do not create, modify, or delete any files/);
	// Read commands remain an intended analysis path, not a guarantee.
	assert.doesNotMatch(out, /Do not run shell commands/);
	assert.match(out, /Prefer the staged material and view_file/);
	assert.match(out, /a denied command ends the run|denied, the run ends/);
	assert.match(out, /state what you could not check instead of retrying commands/);
	assert.doesNotMatch(out, /Read-only commands .* are allowed for analysis/);
});

test("buildFinalPrompt: agent-damper accept-edits run is unchanged", () => {
	assert.equal(buildFinalPrompt("do the edit", "accept-edits", false, true), "do the edit");
});

test("reviewerAgentMd: frontmatter parses as YAML (issue #5 class)", () => {
	const fm = parseAgentFrontmatter(reviewerAgentMd("pi-bridge-ask-x"));
	assert.equal(fm.name, "pi-bridge-ask-x");
	assert.equal(fm.description, "Temporary Pi plan-mode reviewer");
	assert.equal(fm.mainAgent, true);
});

test("reviewerAgentMd: toolset must never contain a file-editing tool", () => {
	const md = reviewerAgentMd("pi-bridge-ask-x");
	assert.match(md, /^name: pi-bridge-ask-x$/m);
	assert.match(md, /commandExecutionPolicy: auto/);
	assert.match(md, /mainAgent: true/);
	// The damper omits native file-editing tools (not a read-only guarantee).
	assert.doesNotMatch(md, /create_file/);
	assert.doesNotMatch(md, /edit_file/);
	assert.doesNotMatch(md, /write_file/);
	assert.match(md, /- view_file/);
	assert.match(md, /- run_command/);
});

test("stageReviewerAgent: creates a unique pid-marked agent dir under root", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ask-agents-"));
	const a = stageReviewerAgent(root);
	const b = stageReviewerAgent(root);
	assert.notEqual(a.name, b.name);
	assert.match(a.name, /^pi-bridge-ask-/);
	assert.ok(fs.existsSync(path.join(a.dir, "agent.md")));
	assert.equal(fs.readFileSync(path.join(a.dir, ".pid"), "utf8").trim(), String(process.pid));
	fs.rmSync(root, { recursive: true, force: true });
});

// --- Execute wiring (argv captured through the fake-binary seam) -----------

type RegisteredTool = {
	name: string;
	execute: (
		id: string,
		params: Record<string, unknown>,
		signal?: unknown,
		onUpdate?: unknown,
		ctx?: Record<string, unknown>,
	) => Promise<{ content: Array<{ type: string; text: string }>; details?: Record<string, unknown> }>;
};

// The binary resolves at SPAWN time, so AGY_BIN must stay pointed at the
// fake through execute - registration does not spawn (the repo hit this
// exact bug before; see the ask-tool-empty-output header note).
async function registerTool(modelEntries: typeof entries = []): Promise<RegisteredTool> {
	const tools: RegisteredTool[] = [];
	const fakePi = {
		registerTool: (tool: RegisteredTool) => tools.push(tool),
	} as unknown as ExtensionAPI;
	const { registerAskAntigravityTool } = await import("../src/ask-tool.js");
	await registerAskAntigravityTool(fakePi, modelEntries);
	assert.equal(tools.length, 1);
	return tools[0];
}

/** Fake agy that records its argv (NUL-delimited) and exits 0 with a stub answer. */
function makeArgvCapturingAgyBin(argvFile: string): string {
	return makeNodeFixture(`import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(argvFile)}, process.argv.slice(2).join('\\0') + '\\0'); console.log('ok');`);
}

function withEnvs(
	values: Record<string, string | undefined>,
	fn: () => Promise<void>,
): Promise<void> {
	const prevs = Object.entries(values).map(([k]) => [k, process.env[k]] as const);
	return (async () => {
		for (const [k, v] of Object.entries(values)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
		try {
			await fn();
		} finally {
			for (const [k, prev] of prevs) {
				if (prev === undefined) delete process.env[k];
				else process.env[k] = prev;
			}
		}
	})();
}

test.each([0, -1, Number.NaN, Infinity, -Infinity, 35_791.001, 35_792, Number.MAX_VALUE])(
	"execute: rejects impossible timeoutMinutes=%s before spawning",
	async (timeoutMinutes) => {
		const tool = await registerTool();
		const spawn = vi.spyOn(ownedProcess, "spawnOwnedProcess").mockImplementation(() => {
			throw new Error("invalid timeout reached agy spawn");
		});
		try {
			const result = await tool.execute("invalid-budget", {
				prompt: "review", mode: "plan", cwd: process.cwd(), timeoutMinutes,
			}, undefined, undefined, { cwd: process.cwd() });
			assert.equal(spawn.mock.calls.length, 0, "agy must not spawn for an impossible budget");
			assert.match(result.content[0].text, /timeoutMinutes must be a positive finite number of minutes up to 35791/);
		} finally {
			spawn.mockRestore();
		}
	},
);

test.each([
	{ timeoutMinutes: undefined, notice: "about 10 minutes of wall-clock time" },
	{ timeoutMinutes: 0.5, notice: "about 30 seconds." },
	{ timeoutMinutes: 1, notice: "about 60 seconds." },
	{ timeoutMinutes: 119_999 / 60_000, notice: "about 119 seconds." },
	{ timeoutMinutes: 2, notice: "about 2 minutes of wall-clock time" },
	{ timeoutMinutes: 2.9, notice: "about 2 minutes of wall-clock time" },
	{ timeoutMinutes: 1 / 60, notice: "about 1 second." },
	{ timeoutMinutes: 999 / 60_000, notice: null },
	{ timeoutMinutes: 35_791, notice: "about 35791 minutes of wall-clock time" },
])("execute: prompt reflects timeoutMinutes=$timeoutMinutes and arms the matching watchdog", async ({ timeoutMinutes, notice }) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ask-budget-"));
	const argvFile = path.join(dir, "argv.txt");
	const binary = makeArgvCapturingAgyBin(argvFile);
	const timer = vi.spyOn(globalThis, "setTimeout");
	try {
		await withEnvs({ AGY_BIN: binary }, async () => {
			const tool = await registerTool();
			const result = await tool.execute("budget-notice", {
				prompt: "answer this", mode: "accept-edits", conversationId: "budget-notice", cwd: dir, timeoutMinutes,
			}, undefined, undefined, { cwd: dir });
			assert.match(result.content[0].text, /^ok\b/);
			assert.ok(timer.mock.calls.some(([, ms]) => ms === (timeoutMinutes ?? 10) * 60_000), "watchdog must use the resolved budget");
			const argv = fs.readFileSync(argvFile, "utf8").split("\0");
			assert.equal(argv[argv.indexOf("--print-timeout") + 1], `${timeoutMinutes ?? 10}m`);
			const prompt = argv[argv.indexOf("-p") + 1] ?? "";
			assert.ok(prompt.startsWith("answer this"));
			if (notice === null) {
				assert.doesNotMatch(prompt, /\[TIME BUDGET\]/, "sub-second budgets must not overstate the remaining time");
			} else {
				assert.equal(prompt.split("[TIME BUDGET]").length, 2, "exactly one budget notice");
				assert.ok(prompt.includes(notice));
				assert.match(prompt, /The run is terminated at the limit and you may be cut off mid-task\./);
				assert.ok(prompt.includes((timeoutMinutes ?? 10) < 2
					? "Provide a direct, concise final answer immediately."
					: "Deliver a complete final answer before it; if the task cannot fit, deliver the most valuable complete subset and state what remains."));
			}
		});
	} finally {
		timer.mockRestore();
		fs.rmSync(dir, { recursive: true, force: true });
		fs.rmSync(path.dirname(binary), { recursive: true, force: true });
	}
});

test("execute: a valid fractional budget still terminates an overlong agy run", async () => {
	const binary = makeNodeFixture("setInterval(() => {}, 1000);");
	try {
		await withEnvs({ AGY_BIN: binary }, async () => {
			const tool = await registerTool();
			const result = await tool.execute("budget-watchdog", {
				prompt: "answer", mode: "accept-edits", conversationId: "budget-watchdog", timeoutMinutes: 1 / 60,
			}, undefined, undefined, { cwd: process.cwd() });
			assert.equal(result.details?.timedOut, true);
			assert.equal(result.details?.aborted, false);
			assert.match(result.content[0].text, /timeout and was killed/);
		});
	} finally {
		fs.rmSync(path.dirname(binary), { recursive: true, force: true });
	}
}, 10_000);

test("execute: thinking clamps to agy effort and overrides the model tier and configured default", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ask-thinking-"));
	const argvFile = path.join(dir, "argv.txt");
	const binary = makeArgvCapturingAgyBin(argvFile);
	try {
		await withEnvs({ AGY_BIN: binary, AGY_DEFAULT_THINKING: "high" }, async () => {
			const tool = await registerTool(entries);
			const result = await tool.execute("thinking", {
				prompt: "hello", model: "flash high", thinking: "minimal",
				mode: "accept-edits", conversationId: "thinking-override", cwd: dir,
			}, undefined, undefined, { cwd: dir });
			assert.match(result.content[0].text, /^ok\b/);
			const argv = fs.readFileSync(argvFile, "utf8").split("\0");
			assert.equal(argv[argv.indexOf("--model") + 1], "gemini-3.8-flash");
			assert.equal(argv[argv.indexOf("--effort") + 1], "low");
		});
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
		fs.rmSync(path.dirname(binary), { recursive: true, force: true });
	}
});

test("execute: rejecting periodic and final update sinks do not escape or fail delegation", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ask-update-sink-"));
	const release = path.join(dir, "release");
	// The child completes only after the periodic update reaches the sink.
	const binary = makeNodeFixture(`import fs from 'node:fs';
const deadline = setTimeout(() => process.exit(2), 4000);
let finished = false;
function released() {
 if (!finished && fs.existsSync(${JSON.stringify(release)})) {
  finished = true; watcher.close(); clearTimeout(deadline); console.log('answer');
 }
}
const watcher = fs.watch(${JSON.stringify(dir)}, released);
// A native job cold start may finish after the first status update already
// wrote the release file. Check existing state as well as future events.
released();`);
	let updates = 0;
	try {
		await withEnvs({ AGY_BIN: binary }, async () => {
			await withoutUnhandledRejections(async () => {
				const tool = await registerTool();
				const result = await tool.execute("update-sink", { prompt: "hello", mode: "accept-edits", conversationId: "sink-conversation", cwd: dir }, undefined, async () => {
					updates++;
					if (updates === 1) fs.writeFileSync(release, "done");
					throw new Error("update sink failed");
				}, { cwd: dir });
				assert.match(result.content[0].text, /^answer/);
				assert.equal(updates, 2, "periodic and final updates must both reach the rejecting sink");
			});
		});
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
		fs.rmSync(path.dirname(binary), { recursive: true, force: true });
	}
});

test("execute: plan run passes --agent and NO skip flag, prompt carries the review guard, agent dir cleaned up", () =>
	withEnvs(
		{ AGY_SKIP_PERMISSIONS: "true" },
		async () => {
			const agentsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ask-agents-root-"));
			const argvFile = path.join(agentsRoot, "argv.txt");
			const tool = await registerTool();
			const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ask-cwd-"));
			await withEnvs(
				{ AGY_AGENTS_ROOT: agentsRoot, AGY_BIN: makeArgvCapturingAgyBin(argvFile) },
				async () => {
					const result = await tool.execute("t1", { prompt: "review this", mode: "plan", cwd }, undefined, undefined, { cwd });
					// Surface an execute failure instead of a confusing argv ENOENT.
					assert.equal(result.content[0].text, "ok");
					const argv = fs.readFileSync(argvFile, "utf8").split("\0");
					const agentIdx = argv.indexOf("--agent");
					assert.ok(agentIdx !== -1, "plan run must pass --agent");
					const agentName = argv[agentIdx + 1] ?? "";
					assert.match(agentName, /^pi-bridge-ask-/);
					// The restricted toolset is only a damper (#1181), never a reason
					// to auto-approve a plan run.
					assert.ok(!argv.some((arg) => arg.startsWith("--dangerously-skip-permissions")));
					const prompt = argv[argv.indexOf("-p") + 1] ?? "";
					assert.match(prompt, /Do not create, modify, or delete any files/);
					assert.doesNotMatch(prompt, /Do not run shell commands/);
					assert.match(prompt, /\[TIME BUDGET\] You have about 10 minutes/);
					assert.ok(prompt.indexOf("[TIME BUDGET]") < prompt.indexOf("--- Review constraints ---"));
					assert.ok(prompt.trimEnd().endsWith("if information you need is missing, state exactly what is missing in your answer."), "review guard stays final");
					assert.ok(!fs.existsSync(path.join(agentsRoot, agentName)), "agent dir must be removed after the run");
					fs.rmSync(cwd, { recursive: true, force: true });
					fs.rmSync(agentsRoot, { recursive: true, force: true });
				},
			);
		},
	));

test("execute: plan run with agent staging failed falls back to no agent, no skip flag, command forbidding guard", () =>
	withEnvs(
		{ AGY_SKIP_PERMISSIONS: "true" },
		async () => {
			// An agents root under a regular file makes mkdir fail -> staging throws.
			const blocker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ask-blocker-")), "not-a-dir");
			fs.writeFileSync(blocker, "x");
			const argvFile = path.join(path.dirname(blocker), "argv.txt");
			const tool = await registerTool();
			const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ask-cwd-"));
			await withEnvs(
				{ AGY_AGENTS_ROOT: path.join(blocker, "sub"), AGY_BIN: makeArgvCapturingAgyBin(argvFile) },
				async () => {
					const result = await tool.execute("t1", { prompt: "review this", mode: "plan", cwd }, undefined, undefined, { cwd });
					assert.equal(result.content[0].text, "ok");
					const argv = fs.readFileSync(argvFile, "utf8").split("\0");
					assert.ok(!argv.includes("--agent"), "staging failure must not pass --agent");
					assert.ok(
						!argv.includes("--dangerously-skip-permissions"),
						"fallback plan run must keep the no-skip rule (guard-only)",
					);
					const prompt = argv[argv.indexOf("-p") + 1] ?? "";
					assert.match(prompt, /Do not run shell commands/);
					assert.match(prompt, /\[TIME BUDGET\] You have about 10 minutes/);
					assert.ok(prompt.indexOf("[TIME BUDGET]") < prompt.indexOf("--- Headless session constraints ---"));
					assert.ok(prompt.trimEnd().endsWith("If information you need is missing, state exactly what is missing in your answer instead of trying to fetch it."), "fallback guard stays final");
					fs.rmSync(path.dirname(blocker), { recursive: true, force: true });
				},
			);
		},
	));

test("resolveModel: integer-version Argon aliases use their own family and default effort", () => {
	const catalog = toolModelsFromRaw([RAW,
		"gemini-4-argon-low", "gemini-4-argon-medium", "gemini-4-argon-high",
		"gemini-5-argon-low", "gemini-5-argon-high",
		"gemini-4-nova-low", "gemini-4-nova-high",
	].join("\n"));
	for (const alias of ["gemini-4-argon", "Gemini 4 Argon", "4 argon"]) {
		assert.deepEqual(resolveModel(alias, catalog, "medium"), { model: "gemini-4-argon", effort: "medium" });
	}
	assert.deepEqual(resolveModel("Argon", catalog.filter(e => e.version !== "5"), "medium"), { model: "gemini-4-argon", effort: "medium" });
	assert.deepEqual(resolveModel("argon high", catalog, "medium"), { model: "gemini-5-argon", effort: "high" });
	assert.deepEqual(resolveModel("gemini-4-argon-high", catalog, "low"), { model: "gemini-4-argon", effort: "high" });
	assert.deepEqual(resolveModel("4 argon high", catalog, "medium", "low"), { model: "gemini-4-argon", effort: "low" });
	assert.deepEqual(resolveModel("Gemini 4 Nova", catalog, "medium"), { model: "gemini-4-nova", effort: "high" });
	assert.equal(resolveModel("gemini-4-unknown", catalog, "medium"), null);
});
