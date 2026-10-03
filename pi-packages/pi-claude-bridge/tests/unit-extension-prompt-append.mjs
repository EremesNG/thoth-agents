#!/usr/bin/env node

/** before_agent_start additions reach the real provider's SDK request, offline. */
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PI_PREAMBLE } from "../src/prompt-capture.js";

const { default: activate, __test } = await import("../src/index.js");
const { buildSystemPrompt } = await import(new URL(
	"../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js", import.meta.url,
).href);
const handlers = new Map();
let provider;
activate({
	on: (event, handler) => handlers.set(event, handler),
	registerProvider: (_name, config) => { provider = config; },
	registerTool: () => {},
});

let requests;
beforeEach(() => {
	__test.resetSharedSession();
	requests = [];
	__test.setQuery(({ options }) => {
		requests.push(options);
		const response = (async function* () {
			yield { type: "result", subtype: "success", is_error: false, result: "offline answer" };
		})();
		response.interrupt = async () => {};
		response.close = () => {};
		return response;
	});
});
afterEach(() => __test.setQuery(null));

function start(assembled, options) {
	// Pi's runner exposes a getter and the same mutable options object to all
	// before_agent_start handlers. Earlier handlers may have set the force already.
	handlers.get("before_agent_start")({
		get systemPrompt() { return options.forceSystemPrompt ?? assembled; },
		systemPromptOptions: options,
	});
	const ctx = { getSystemPrompt: () => options.forceSystemPrompt ?? assembled };
	handlers.get("agent_start")({}, ctx);
	handlers.get("turn_start")({}, ctx);
}

async function send(systemPrompt, tools = []) {
	const result = await provider.streamSimple(provider.models[0], {
		// Current Pi sends the forced head in the transcript, not context.systemPrompt.
		messages: [
			{ role: "system", content: systemPrompt, toolsAdded: tools, timestamp: 0 },
			{ role: "user", content: "check extension instructions", timestamp: 1 },
		],
		tools,
	}, { sessionId: "extension-append-test" }).result();
	assert.notEqual(result.stopReason, "error", result.errorMessage);
	assert.equal(requests.length, 1, "exactly one offline SDK request should start");
	const prompt = requests[0].systemPrompt;
	assert.equal(prompt.type, "preset");
	assert.equal(prompt.preset, "claude_code");
	return prompt.append;
}

const occurrences = (text, needle) => text.split(needle).length - 1;
const readTool = { name: "read", description: "Read a file", parameters: { type: "object", properties: {} } };

const thothSuffix = "\n\n<!-- thoth-agents:pi-root:start -->\nYou coordinate specialists; delegate discovery before inspecting code.\n<!-- thoth-agents:pi-root:end -->";

describe("extension prose in Claude Code append", () => {
	for (const mode of ["ordinary widening", "force identical to the assembled prompt"]) {
		it(`keeps the append byte-identical with no additions (${mode})`, async () => {
			const options = {
				customPrompt: "  unchanged custom policy\n",
				appendSystemPrompt: "unchanged configured append\n",
				contextFiles: [{ path: "/unchanged/AGENTS.md", content: "unchanged project rules" }],
			};
			const assembled = `${PI_PREAMBLE}, unchanged ${mode} baseline.\n<tools>read</tools>`;
			if (mode.startsWith("force")) options.forceSystemPrompt = assembled;
			start(assembled, options);
			const final = options.forceSystemPrompt ?? `${assembled}\n<tools>read and late-loaded tool</tools>`;
			const ctx = { getSystemPrompt: () => final };
			handlers.get("agent_start")({}, ctx);
			handlers.get("turn_start")({}, ctx);

			assert.equal(await send(final),
				'<project_context>\n\nProject-specific instructions and guidelines:\n\n<project_instructions path="/unchanged/AGENTS.md">\nunchanged project rules\n</project_instructions>\n\n</project_context>\n\n  unchanged custom policy\n\n\nunchanged configured append\n');
		});
	}

	it("keeps a wholesale replacement exactly once in the outgoing append", async () => {
		const options = {
			customPrompt: "outgoing replacement custom policy",
			appendSystemPrompt: "outgoing replacement configured append",
			contextFiles: [{ path: "/outgoing-replacement/AGENTS.md", content: "outgoing replacement project rules" }],
			forceSystemPrompt: "REPLACEMENT INSTRUCTIONS NOT PRESENT IN ANY PORTABLE PART",
		};
		const assembled = `${PI_PREAMBLE}, outgoing replacement baseline.`;
		start(assembled, options);
		const append = await send(options.forceSystemPrompt);
		for (const text of ["outgoing replacement custom policy", "outgoing replacement configured append",
			"outgoing replacement project rules", options.forceSystemPrompt]) {
			assert.equal(occurrences(append, text), 1);
		}
	});

	it("reconciles an overlapping replacement and retains portable parts it omits", async () => {
		const options = {
			customPrompt: "overlapping replacement custom policy",
			appendSystemPrompt: "overlapping replacement configured append",
			contextFiles: [
				{ path: "/overlap/AGENTS.md", content: "overlapping replacement project rules" },
				{ path: "/omitted/AGENTS.md", content: "omitted replacement project rules" },
			],
			skills: [{
				name: "omitted-browser", description: "Browse offline fixtures.",
				filePath: "/skills/omitted-browser/SKILL.md", baseDir: "/skills/omitted-browser",
				sourceInfo: { source: "test", scope: "temporary", origin: "top-level" },
				disableModelInvocation: false,
			}],
			selectedTools: ["read"],
		};
		const assembled = buildSystemPrompt({ ...options, cwd: "/original" });
		const replacement = `${buildSystemPrompt({
			...options, cwd: "/replacement", contextFiles: [options.contextFiles[0]], skills: [],
		})}\n\nOVERLAPPING EXTENSION POLICY`;
		assert.ok(!replacement.includes(assembled), "this is a replacement, not an embedded baseline");
		options.forceSystemPrompt = replacement;
		start(assembled, options);

		const append = await send(replacement, [readTool]);
		for (const text of [options.customPrompt, options.appendSystemPrompt,
			"overlapping replacement project rules", "/overlap/AGENTS.md",
			"omitted replacement project rules", "/omitted/AGENTS.md",
			"/skills/omitted-browser/SKILL.md", "OVERLAPPING EXTENSION POLICY"]) {
			assert.equal(occurrences(append, text), 1, `${text} must reach the model exactly once`);
		}
		assert.ok(append.endsWith(replacement), "the replacement's distinct content must remain byte-identical");
		assert.equal(options.forceSystemPrompt, replacement, "capturing must restore the forced prompt");
	});

	it("preserves distinct instructions that merely contain configured text", async () => {
		const options = {
			customPrompt: "Keep the configured custom policy",
			appendSystemPrompt: "Keep the configured append policy",
			contextFiles: [{ path: "/configured/AGENTS.md", content: "Same words, distinct project policy" }],
		};
		const assembled = buildSystemPrompt({ ...options, cwd: "/distinct-original" });
		const replacement = buildSystemPrompt({
			cwd: "/distinct-replacement",
			customPrompt: `A distinct instruction discusses: ${options.customPrompt} without adopting it.`,
			appendSystemPrompt: `A distinct instruction discusses: ${options.appendSystemPrompt} without adopting it.`,
			contextFiles: [{ path: "/distinct/AGENTS.md", content: options.contextFiles[0].content }],
		});
		options.forceSystemPrompt = replacement;
		start(assembled, options);

		const append = await send(replacement);
		assert.ok(append.endsWith(replacement), "distinct replacement prose must not be modified");
		assert.ok(append.includes(`\n\n${options.customPrompt}\n\n${options.appendSystemPrompt}\n\n`),
			"configured instructions are not copies of the longer replacement instructions");
		assert.equal(occurrences(append, "/configured/AGENTS.md"), 1);
		assert.equal(occurrences(append, "/distinct/AGENTS.md"), 1,
			"identical content at a distinct project path must retain both instruction blocks");
	});

	it("reconciles exact skill entries in a replacement while retaining omitted skills", async () => {
		const options = {
			customPrompt: "skill overlap custom policy",
			selectedTools: ["read"],
			skills: ["present-browser", "missing-review"].map((name) => ({
				name, description: `${name} offline instructions`,
				filePath: `/skills/${name}/SKILL.md`, baseDir: `/skills/${name}`,
				sourceInfo: { source: "test", scope: "temporary", origin: "top-level" },
				disableModelInvocation: false,
			})),
		};
		const assembled = buildSystemPrompt({ ...options, cwd: "/skill-original" });
		const replacement = `${buildSystemPrompt({
			...options, cwd: "/skill-replacement", skills: [options.skills[0]],
		})}\n\nSKILL REPLACEMENT POLICY`;
		options.forceSystemPrompt = replacement;
		start(assembled, options);

		const append = await send(replacement, [readTool]);
		for (const text of ["/skills/present-browser/SKILL.md", "/skills/missing-review/SKILL.md",
			"skill overlap custom policy", "SKILL REPLACEMENT POLICY"]) {
			assert.equal(occurrences(append, text), 1, `${text} must reach the model exactly once`);
		}
		assert.doesNotMatch(append, /Use the read tool to load/, "both skill catalogues must name the provider's reader");
		assert.equal(occurrences(append, "Use the read tool (mcp__custom-tools__read)"), 2);
		assert.ok(append.endsWith("SKILL REPLACEMENT POLICY"));
		assert.equal(options.forceSystemPrompt, replacement);
	});

	for (const guardedPart of ["project context", "skills"]) {
		it(`preserves the sendability guard when a replacement splits the ${guardedPart}`, async () => {
			const paths = ["docs/custom-provider.md", "docs/packages.md"];
			const options = {
				customPrompt: `guarded ${guardedPart} custom policy`,
				selectedTools: ["read"],
				contextFiles: guardedPart === "project context" ? paths.map((path, i) => ({
					path: `/split-guard/${i}/AGENTS.md`, content: `Policy refers to ${path}`,
				})) : [],
				skills: guardedPart === "skills" ? paths.map((path, i) => ({
					name: `guarded-skill-${i}`, description: `Policy refers to ${path}`,
					filePath: `/split-guard/${i}/SKILL.md`, baseDir: `/split-guard/${i}`,
					sourceInfo: { source: "test", scope: "temporary", origin: "top-level" },
					disableModelInvocation: false,
				})) : [],
			};
			const assembled = buildSystemPrompt({ ...options, cwd: "/guard-original" });
			const replacement = buildSystemPrompt({
				...options, cwd: "/guard-replacement",
				contextFiles: options.contextFiles.slice(0, 1), skills: options.skills.slice(0, 1),
			});
			options.forceSystemPrompt = replacement;
			start(assembled, options);

			const result = await provider.streamSimple(provider.models[0], {
				messages: [
					{ role: "system", content: replacement, toolsAdded: [readTool], timestamp: 0 },
					{ role: "user", content: "check split unsafe instructions", timestamp: 1 },
				],
			}, { sessionId: "split-extension-guard-test" }).result();
			assert.equal(result.stopReason, "error");
			assert.match(result.errorMessage, /prompt-capture: refusing to send this prompt/);
			assert.equal(requests.length, 0, "reconciliation must not bypass the original portable block's guard");
		});
	}

	it("still refuses extension prose that trips the sendability guard", async () => {
		const assembled = `${PI_PREAMBLE}, guarded extension baseline.`;
		const options = {
			forceSystemPrompt: `${assembled}\n\nUnsafe extension: docs/custom-provider.md and docs/packages.md`,
		};
		start(assembled, options);
		const result = await provider.streamSimple(provider.models[0], {
			messages: [
				{ role: "system", content: options.forceSystemPrompt, timestamp: 0 },
				{ role: "user", content: "check unsafe extension", timestamp: 1 },
			],
		}, { sessionId: "extension-guard-test" }).result();
		assert.equal(result.stopReason, "error");
		assert.match(result.errorMessage, /prompt-capture: refusing to send this prompt/);
		assert.equal(requests.length, 0, "unsafe extension instructions must never reach the SDK");
	});

	it("forwards a prefix added by a later handler after it changes the prompt options", async () => {
		const options = {
			toolSnippets: { read: "Read a file" },
			contextFiles: [{ path: "/late-prefix/AGENTS.md", content: "late prefix project rules" }],
		};
		const event = {
			get systemPrompt() {
				return options.forceSystemPrompt ?? `${PI_PREAMBLE}, late prefix baseline.\n<tools>${options.toolSnippets.read}</tools>`;
			},
			systemPromptOptions: options,
		};
		handlers.get("before_agent_start")(event);
		// The next handler first changes the options, then wraps the freshly
		// assembled event.systemPrompt and returns it. Pi assigns that result here.
		options.toolSnippets.read = "Read a file with a widened tool description";
		const forced = `LATE EXTENSION PREFIX\n\n${event.systemPrompt}`;
		options.forceSystemPrompt = forced;
		const ctx = { getSystemPrompt: () => forced };
		handlers.get("agent_start")({}, ctx);
		handlers.get("turn_start")({}, ctx);

		const append = await send(forced);
		assert.ok(append.startsWith("LATE EXTENSION PREFIX\n\n"));
		assert.equal(occurrences(append, "late prefix project rules"), 1);
		assert.equal(occurrences(append, "LATE EXTENSION PREFIX"), 1);
		assert.doesNotMatch(append, /operating inside pi|widened tool description/);
		assert.equal(options.forceSystemPrompt, forced);
	});

	it("forwards a thoth-shaped suffix forced before the bridge runs", async () => {
		const options = {
			customPrompt: "suffix custom policy",
			appendSystemPrompt: "suffix configured append",
			contextFiles: [{ path: "/suffix/AGENTS.md", content: "suffix project rules" }],
			skills: [{
				name: "suffix-browser", description: "Browse offline fixtures.",
				filePath: "/skills/suffix-browser/SKILL.md", baseDir: "/skills/suffix-browser",
				sourceInfo: { source: "test", scope: "temporary", origin: "top-level" },
				disableModelInvocation: false,
			}],
			selectedTools: ["read"],
		};
		const assembled = `${PI_PREAMBLE}, suffix baseline.\n\n${options.customPrompt}\n${options.appendSystemPrompt}\n${options.contextFiles[0].content}`;
		const forced = `${assembled}${thothSuffix}`;
		options.forceSystemPrompt = forced;
		start(assembled, options);

		assert.equal(options.forceSystemPrompt, forced, "reading the baseline must preserve Pi's forced head");
		const append = await send(forced, [readTool]);
		assert.ok(append.endsWith(thothSuffix), "the suffix must survive exact captures at all three boundaries");
		for (const text of ["suffix custom policy", "suffix configured append", "suffix project rules",
			"/skills/suffix-browser/SKILL.md", "<!-- thoth-agents:pi-root:start -->"]) {
			assert.equal(occurrences(append, text), 1, `${text} must reach the model exactly once`);
		}
		assert.doesNotMatch(append, /operating inside pi/);
	});
});
