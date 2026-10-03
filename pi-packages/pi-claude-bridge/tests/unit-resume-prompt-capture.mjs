// Resume regression: use Pi's installed structured renderer/differ and actual pi-ai
// replay, rather than manufacturing two differently ordered prompt strings.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCurrentSystemMessage, getSystemMessageText } from "@earendil-works/pi-ai";
import { projectPromptCapture } from "../src/prompt-capture.js";
import { activateWithMockPi } from "./lib/mock-pi.mjs";
import { __test } from "../src/index.js";

// These renderer/differ helpers are not public exports; resolve them relative to
// the installed development runtime, without copying their implementation here.
const {
	buildSystemPrompt,
	buildSystemPromptState,
	diffSystemPromptSections,
	normalizeBuildSystemPromptOptions,
} = await import(new URL("./core/system-prompt.js", import.meta.resolve("@earendil-works/pi-coding-agent")));

const APPEND = "Resume fixture addendum: keep the portable instructions exactly once.";
const CONTEXT = "Resume fixture project rules.";
const SKILL_PATH = "/resume-fixture/skills/check/SKILL.md";
const customSections = {
	thoth_mem_recovery: "Resume fixture recovery instructions.",
	agent_browser: "Resume fixture browser instructions.",
};
const system = (state) => ({ role: "system", ...state, timestamp: 0 });
const user = (text) => ({ role: "user", content: text, timestamp: 0 });

function resumedTurn() {
	const handlers = activateWithMockPi();
	const oldOptions = normalizeBuildSystemPromptOptions({
		cwd: "/resume-fixture",
		selectedTools: ["read", "bash"],
		toolSnippets: { read: "Read a fixture file", bash: "Run a fixture command" },
		contextFiles: [{ path: "/resume-fixture/AGENTS.md", content: CONTEXT }],
		skills: [{
			name: "resume-check",
			description: "Check the resume fixture.",
			filePath: SKILL_PATH,
			baseDir: "/resume-fixture/skills/check",
			sourceInfo: { source: "test", scope: "temporary", origin: "top-level" },
			disableModelInvocation: false,
		}],
		sections: customSections,
	});
	const initial = buildSystemPromptState(oldOptions);
	assert.equal(initial.sections.addendum, undefined, "the old transcript has no addendum");
	const messages = [system(initial), user("old turn")];

	// The real session removed the transient extension sections before resume.
	// Pi's diff emits null patches, and replay deletes their insertion positions.
	const withoutCustoms = buildSystemPromptState({ ...oldOptions, sections: {} });
	const removal = diffSystemPromptSections(initial.sections, withoutCustoms.sections);
	assert.deepEqual(removal, { thoth_mem_recovery: null, agent_browser: null });
	messages.push(system({ content: "", sections: removal }));

	const options = normalizeBuildSystemPromptOptions(oldOptions);
	handlers.get("before_agent_start")({ systemPrompt: buildSystemPrompt(options), systemPromptOptions: options });
	// A later extension mutates Pi's shared options, as thoth's append projection does.
	options.appendSystemPrompt = APPEND;
	const desired = buildSystemPromptState(options);
	const patch = diffSystemPromptSections(getCurrentSystemMessage(messages).sections, desired.sections);
	assert.deepEqual(Object.keys(patch), ["addendum", "thoth_mem_recovery", "agent_browser"]);
	messages.push(system({ content: "", sections: patch }), user("resumed turn"));

	const ctx = { getSystemPrompt: () => buildSystemPrompt(options) };
	handlers.get("agent_start")({}, ctx);
	handlers.get("turn_start")({}, ctx);
	return { handlers, messages, options, ctx, desired };
}

function sortedEntries(sections) {
	return Object.entries(sections).sort(([a], [b]) => a.localeCompare(b));
}

function occurrences(text, needle) {
	return text.split(needle).length - 1;
}

describe("resumed structured prompt capture", () => {
	it("keeps the provider prompt identical to the fresh getter after addendum and custom-section re-adds", () => {
		const { messages, ctx, desired } = resumedTurn();
		const replayed = getCurrentSystemMessage(messages);
		const fresh = ctx.getSystemPrompt();
		assert.deepEqual(Object.keys(replayed.sections), [
			"preamble", "tools", "rules", "docs", "project_context", "skills", "cwd",
			"addendum", "thoth_mem_recovery", "agent_browser",
		]);
		assert.deepEqual(sortedEntries(replayed.sections), sortedEntries(desired.sections),
			"replay and fresh rendering contain exactly the same complete section content");
		assert.notEqual(getSystemMessageText(replayed), fresh, "Pi replay preserves the old insertion order");
		assert.equal(__test.promptCaptures.resolve(fresh).source, "turn_start");

		const provider = __test.toBridgeContext({ messages });
		assert.equal(provider.systemPrompt, fresh, "the provider must resolve the getter's exact capture key");
		const capture = __test.promptCaptures.resolveOrDerive(provider.systemPrompt);
		const projected = projectPromptCapture(capture, { skillReadTool: "mcp" });
		assert.equal(occurrences(projected, APPEND), 1);
		assert.equal(occurrences(projected, CONTEXT), 1);
		assert.equal(occurrences(projected, SKILL_PATH), 1);
		assert.doesNotMatch(projected, /operating inside pi|docs\/packages\.md|docs\/custom-provider\.md/);
	});

	it("refuses same-length changed section content rather than reusing a resumed capture", () => {
		const { messages, ctx, desired } = resumedTurn();
		const size = __test.promptCaptures.size;
		// Include non-portable custom/tool/cwd sections: matching only the portable
		// append/context/skills would incorrectly accept some of these rewrites.
		for (const name of ["addendum", "project_context", "skills", "tools", "cwd", "thoth_mem_recovery", "agent_browser"]) {
			const original = desired.sections[name];
			const changed = original.replace("fixture", "fIxture");
			assert.notEqual(changed, original, `the ${name} instructions actually changed`);
			const rewritten = __test.toBridgeContext({ messages: [
				...messages,
				system({ content: "", sections: { [name]: changed } }),
			] }).systemPrompt;
			assert.equal(rewritten.length, ctx.getSystemPrompt().length, `${name} is a same-length rewrite`);
			assert.notEqual(rewritten, ctx.getSystemPrompt());
			assert.throws(() => __test.promptCaptures.resolveOrDerive(rewritten), /no capture for this .* system prompt/,
				`${name} must not silently reuse the unchanged capture`);
		}
		assert.equal(__test.promptCaptures.size, size, "a refused rewrite must not add a lookup key");
	});

	it("projects the resume append once across repeated turns and a later tool-section patch", () => {
		const { handlers, messages, options, ctx } = resumedTurn();
		const size = __test.promptCaptures.size;
		for (let turn = 0; turn < 3; turn++) {
			const patch = diffSystemPromptSections(getCurrentSystemMessage(messages).sections, buildSystemPromptState(options).sections);
			assert.equal(patch, undefined, "Pi does not append identical sections on subsequent turns");
			handlers.get("turn_start")({}, ctx);
			const prompt = __test.toBridgeContext({ messages }).systemPrompt;
			assert.equal(prompt, ctx.getSystemPrompt());
			const projected = projectPromptCapture(__test.promptCaptures.resolveOrDerive(prompt), { skillReadTool: "mcp" });
			assert.equal(occurrences(projected, APPEND), 1);
			assert.equal(occurrences(projected, CONTEXT), 1);
			assert.equal(occurrences(projected, SKILL_PATH), 1);
		}
		assert.equal(__test.promptCaptures.size, size, "unchanged turns reuse the same key");

		options.toolSnippets.read = "Read a widened fixture file";
		const patch = diffSystemPromptSections(getCurrentSystemMessage(messages).sections, buildSystemPromptState(options).sections);
		assert.deepEqual(Object.keys(patch), ["tools"]);
		messages.push(system({ content: "", sections: patch }));
		handlers.get("turn_start")({}, ctx);
		const prompt = __test.toBridgeContext({ messages }).systemPrompt;
		assert.equal(prompt, ctx.getSystemPrompt());
		const projected = projectPromptCapture(__test.promptCaptures.resolveOrDerive(prompt), { skillReadTool: "mcp" });
		assert.equal(occurrences(projected, APPEND), 1, "a re-keyed turn must not duplicate the extension append");
	});
});
