import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt, buildSystemPromptSections } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js";
import { PromptCaptures, projectPromptCapture } from "../src/prompt-capture.js";
import { diffBlocks, segment } from "../src/append-blocks.js";

const base = { cwd: "/test", selectedTools: [], contextFiles: [], skills: [] };
const project = (capture, skillReadTool = "none") => projectPromptCapture(capture, { skillReadTool });

function record(captures, options) {
	const key = buildSystemPrompt({ ...base, ...options });
	captures.record(key, {
		custom: options.customPrompt,
		append: options.appendSystemPrompt,
		contextFiles: options.contextFiles ?? [],
		skills: options.skills ?? [],
		sections: options.sections,
	});
	return { key, capture: captures.resolve(key) };
}

describe("Pi prompt sections", () => {
	it("applies addendum overrides once, including an override equal to the original append", () => {
		for (const content of ["POLICY", "REPLACEMENT"]) {
			const captures = new PromptCaptures();
			const options = { appendSystemPrompt: "POLICY", sections: { addendum: content } };
			const rendered = buildSystemPromptSections({ ...base, ...options });
			assert.equal(rendered.addendum, `<addendum>\n${content}\n</addendum>`);
			const { capture } = record(captures, options);
			assert.equal(project(capture), `<pi_prompt_section name="addendum">\n${content}\n</pi_prompt_section>`);
		}
	});
	it("replaces every renderer-built slot and keeps extension sections after those overrides", () => {
		const skills = [{ name: "fixture", description: "fixture", filePath: "/fixture/SKILL.md", baseDir: "/fixture", disableModelInvocation: false }];
		const contextFiles = [{ path: "/AGENTS.md", content: "OLD PROJECT" }];
		const defaults = { ...base, selectedTools: ["read"], appendSystemPrompt: "OLD ADDENDUM", contextFiles, skills };
		const slotNames = Object.keys(buildSystemPromptSections(defaults));
		assert.deepEqual(slotNames, ["preamble", "tools", "rules", "docs", "addendum", "project_context", "skills", "cwd"]);
		assert.throws(() => buildSystemPrompt({ ...base, sections: { preamble: "INVALID" } }), /Invalid system prompt section/);
		for (const name of slotNames.filter((name) => name !== "preamble")) {
			const options = { ...defaults, sections: { extension_first: "EXTENSION", [name]: `OVERRIDE ${name}` } };
			const rendered = buildSystemPromptSections(options);
			assert.equal(rendered[name], `<${name}>\nOVERRIDE ${name}\n</${name}>`);
			const { capture } = record(new PromptCaptures(), options);
			const projected = project(capture, "mcp");
			assert.ok(projected.includes(`<pi_prompt_section name="${name}">\nOVERRIDE ${name}\n</pi_prompt_section>`));
			assert.ok(projected.endsWith(rendered.extension_first), `${name}: extension sections are last`);
			if (name === "project_context") assert.doesNotMatch(projected, /OLD PROJECT/);
			if (name === "skills") assert.doesNotMatch(projected, /fixture\/SKILL.md/);
			if (name === "addendum") assert.doesNotMatch(projected, /OLD ADDENDUM/);
		}
	});

	it("projects inherited sections once in recorded children and derived children", () => {
		const captures = new PromptCaptures();
		const parentOptions = { sections: { recovery: "PARENT IDENTITY", addendum: "PARENT POLICY" } };
		const parent = record(captures, parentOptions);
		const customPrompt = `${parent.key}\n\n<child_task>CHILD TASK</child_task>`;
		const child = record(captures, { customPrompt, sections: { ...parentOptions.sections, child_policy: "CHILD POLICY" } });
		const projected = project(child.capture);
		assert.equal(projected.split("PARENT IDENTITY").length - 1, 1);
		assert.equal(projected.split("PARENT POLICY").length - 1, 1);
		assert.ok(projected.endsWith("<child_policy>\nCHILD POLICY\n</child_policy>"));
		assert.match(projected, /CHILD TASK/);
		assert.doesNotMatch(projected, /operating inside pi/);

		const wrapperSection = buildSystemPromptSections({ ...base, sections: { wrapper_policy: "WRAPPER POLICY" } }).wrapper_policy;
		const derivedKey = `PREFIX\n\n${child.key}\n\n${wrapperSection}`;
		const derived = project(captures.resolveOrDerive(derivedKey));
		for (const content of ["PARENT IDENTITY", "PARENT POLICY", "CHILD POLICY", "WRAPPER POLICY"]) {
			assert.equal(derived.split(content).length - 1, 1, content);
		}
		assert.match(derived, /^PREFIX/);
		assert.equal(captures.resolve(derivedKey), undefined, "derived captures remain transient");
	});

	it("does not mistake incidental instruction text for an already-carried section", () => {
		const options = { customPrompt: "IDENTITY", appendSystemPrompt: "DEFAULT", sections: { recovery: "IDENTITY", addendum: "" } };
		const { capture } = record(new PromptCaptures(), options);
		assert.equal(project(capture), `IDENTITY\n\nDEFAULT\n\n${buildSystemPromptSections({ ...base, ...options }).recovery}`);
	});

	it("does not append a section already carried by custom text", () => {
		for (const name of ["recovery", "addendum"]) {
			const sections = { [name]: "CARRIED" };
			const customPrompt = buildSystemPromptSections({ ...base, sections })[name];
			const { capture } = record(new PromptCaptures(), { customPrompt, appendSystemPrompt: name === "addendum" ? "REPLACED" : undefined, sections });
			assert.equal(project(capture), customPrompt);
		}
	});

	it("guards extension and built-in section parts, including inherited and derived captures", () => {
		for (const name of ["recovery", "addendum", "project_context", "skills", "tools", "rules", "docs", "cwd"]) {
			for (const content of ["You are an expert coding assistant operating inside pi", "docs/custom-provider.md and docs/packages.md"]) {
				const captures = new PromptCaptures();
				const parent = record(captures, { sections: { [name]: content } });
				assert.throws(() => project(parent.capture), /refusing to send this prompt/, name);
				const child = record(captures, { customPrompt: `${parent.key}\nCHILD` });
				assert.throws(() => project(child.capture), /refusing to send this prompt/, `${name}: child`);
				assert.throws(() => project(captures.resolveOrDerive(`PREFIX\n${parent.key}\nSUFFIX`)), /refusing to send this prompt/, `${name}: derived`);
			}
		}
	});

	it("keeps built-in replacements opaque and extension blocks keyed without introducing free text", () => {
		const options = {
			customPrompt: "<root_policy>ROOT</root_policy>",
			appendSystemPrompt: "<old_policy>OLD</old_policy>",
			contextFiles: [{ path: "/AGENTS.md", content: "REPLACED CONTEXT" }],
			sections: {
				extension_first: "EXTENSION",
				project_context: "RAW PROJECT\n<nested>OPAQUE</nested>",
				skills: "RAW SKILLS",
				addendum: "RAW APPEND",
				tools: "TOOLS",
				rules: "RULES",
				docs: "DOCS",
				cwd: "CWD",
				whitespace: " ",
			},
		};
		const captures = new PromptCaptures();
		const before = project(record(captures, options).capture);
		const blocks = segment(before);
		assert.equal(blocks.ambiguous, false);
		assert.deepEqual(blocks.blocks.map(({ key }) => key), [
			'xml:pi_prompt_section:name="project_context"', 'xml:pi_prompt_section:name="skills"', 'xml:root_policy',
			'xml:pi_prompt_section:name="addendum"', 'xml:pi_prompt_section:name="tools"', 'xml:pi_prompt_section:name="rules"',
			'xml:pi_prompt_section:name="docs"', 'xml:pi_prompt_section:name="cwd"', 'xml:extension_first', 'xml:whitespace',
		]);
		const after = project(record(captures, { ...options, sections: { ...options.sections, project_context: "CHANGED RAW PROJECT" } }).capture);
		const delta = diffBlocks(before, after);
		assert.equal(delta.full, false);
		assert.deepEqual(delta.removed, []);
		assert.deepEqual(delta.blocks, [{ key: 'xml:pi_prompt_section:name="project_context"', text: '<pi_prompt_section name="project_context">\nCHANGED RAW PROJECT\n</pi_prompt_section>' }]);
	});

	it("projects truthy extension sections last, in renderer insertion order, from a snapshot", () => {
		const captures = new PromptCaptures();
		const options = {
			customPrompt: "ROOT",
			appendSystemPrompt: "POLICY",
			sections: { thoth_mem_recovery: "IDENTITY", empty: "", whitespace: " \n ", agent_policy: "DELEGATE" },
		};
		const rendered = buildSystemPromptSections({ ...base, ...options });
		const { key, capture } = record(captures, options);
		options.sections.thoth_mem_recovery = "MUTATED";
		assert.equal(project(capture), ["ROOT", "POLICY", rendered.thoth_mem_recovery, rendered.whitespace, rendered.agent_policy].join("\n\n"));
		assert.equal(capture.assembledPrompt, key, "the full Pi-rendered key is unchanged");
		assert.equal(captures.resolveOrDerive(key), capture, "exact-key matching is unchanged");
	});
});
