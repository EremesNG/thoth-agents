import assert from "node:assert/strict";
import type { BuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";
import { test } from "vitest";
import { projectSystemPrompt } from "../src/prompt-projection.js";

test("structured capture keeps operator policy, explicit overrides, context and skills, not Pi defaults", () => {
	const out = projectSystemPrompt("You are a coding assistant running inside pi.\n<tools>\ndefault tools\n</tools>", {
		cwd: "/project",
		customPrompt: "custom policy",
		appendSystemPrompt: "Thoth root",
		sections: { rules: "explicit rule", extra: "extra policy" },
		selectedTools: ["read"],
		hiddenTools: [],
		toolGuidelines: {
			read: ["read guidance", "read guidance"],
			bash: ["inactive guidance"],
		},
		promptGuidelines: ["prompt guidance"],
		contextFiles: [{ path: "AGENTS.md", content: "project policy" }],
		skills: [
			{
				name: "testing",
				description: "test well",
				filePath: "/skills/testing/SKILL.md",
				baseDir: "/skills/testing",
				sourceInfo: {
					path: "/skills/testing/SKILL.md",
					source: "user",
					scope: "user",
					origin: "top-level",
				},
				disableModelInvocation: false,
			},
		],
	});
	for (const text of [
		"custom policy",
		"Thoth root",
		"explicit rule",
		"extra policy",
		"AGENTS.md",
		"project policy",
		"/skills/testing/SKILL.md",
	])
		assert.ok(out.includes(text), text);
	for (const text of ["running inside pi", "default tools", "inactive guidance", "read guidance", "prompt guidance"])
		assert.ok(!out.includes(text), text);
});

test.each<[string, string[] | undefined, string[], string | undefined]>([
	["bash only", ["bash"], [], "Use bash to load a skill's file"],
	["read only", ["read"], [], "Use the read tool to load a skill's file"],
	["default tools", undefined, [], "Use the read tool to load a skill's file"],
	["read takes precedence", ["bash", "read"], [], "Use the read tool to load a skill's file"],
	["hidden read with visible bash", ["read", "bash"], ["read"], "Use bash to load a skill's file"],
	["hidden bash", ["bash"], ["bash"], "Load a skill's file when the task matches its description."],
	["hidden read", ["read"], ["read"], "Load a skill's file when the task matches its description."],
	["both readers hidden", ["read", "bash"], ["read", "bash"], "Load a skill's file when the task matches its description."],
	["no tools", [], [], undefined],
	["no reader", ["write"], [], undefined],
	["PowerShell is not a Pi skill reader", ["powershell"], [], undefined],
])("capture matches Pi's skills inclusion and loading hint: %s", async (_name, selectedTools, hiddenTools, hint) => {
	// The builder is not exported at the package root; resolve beside the installed SDK entry.
	const { buildSystemPrompt } = await import(
		new URL("./core/system-prompt.js", import.meta.resolve("@earendil-works/pi-coding-agent")).href
	);
	const options: BuildSystemPromptOptions = {
		cwd: "/project",
		selectedTools,
		hiddenTools,
		skills: [
			{
				name: "testing",
				description: "test well",
				filePath: "/skills/testing/SKILL.md",
				baseDir: "/skills/testing",
				sourceInfo: {
					path: "/skills/testing/SKILL.md",
					source: "user",
					scope: "user",
					origin: "top-level",
				},
				disableModelInvocation: false,
			},
		],
	};
	const assembled = buildSystemPrompt(options);
	const projected = projectSystemPrompt(assembled, options);
	assert.equal(assembled.includes("/skills/testing/SKILL.md"), hint !== undefined);
	assert.equal(projected.includes("/skills/testing/SKILL.md"), hint !== undefined);
	if (hint) {
		assert.ok(projected.includes(hint));
		const skillsBlock = assembled.match(/<skills>\n([\s\S]*?)\n<\/skills>/)?.[1];
		assert.ok(skillsBlock);
		assert.ok(projected.includes(skillsBlock), "preserves Pi's complete formatted skills catalog");
	}
});

test("without capture removes only top-level Pi defaults and identity, preserving opaque project context and appended blocks", () => {
	const prompt = `You are a coding assistant running inside pi, a coding agent harness.
<tools>
default tools
</tools>
<rules>
default rules
</rules>
<docs>
Pi docs
</docs>
<addendum>
Thoth root
</addendum>
<project_context>
<project_instructions path="AGENTS.md">
<rules>
project rules
</rules>
</project_instructions>
</project_context>
<skills>
available skills
</skills>
<cwd>
/project
</cwd>`;
	const out = projectSystemPrompt(prompt);
	for (const text of ["Thoth root", "project rules", "available skills"]) assert.ok(out.includes(text));
	for (const text of ["running inside pi", "default tools", "default rules", "Pi docs", "<cwd>"])
		assert.ok(!out.includes(text), text);
	assert.equal(projectSystemPrompt("custom instructions"), "custom instructions");
});

test("fallback handles Windows line endings and removes inherited defaults in custom prompts", () => {
	const parent =
		"You are a coding assistant running inside pi.\r\n<tools>\r\ndefault list\r\n</tools>\r\n<rules>\r\ndefault policy\r\n</rules>\r\n<addendum>\r\nparent policy\r\n</addendum>";
	const out = projectSystemPrompt("assembled", {
		cwd: "/project",
		customPrompt: `child policy\r\n${parent}`,
		sections: { tools: "explicit tools" },
	});
	assert.ok(out.includes("parent policy"));
	assert.ok(out.includes("child policy"));
	assert.ok(out.includes("explicit tools"));
	assert.ok(!out.includes("default list"));
	assert.ok(!out.includes("default policy"));
	assert.ok(!out.includes("running inside pi"));
});

test("custom instructions that use built-in tag names are policy, not Pi defaults", () => {
	const custom = "<rules>\noperator custom rules\n</rules>\n<tools>\noperator tool policy\n</tools>";
	const out = projectSystemPrompt("assembled", {
		cwd: "/project",
		customPrompt: custom,
	});
	assert.ok(out.includes(custom));
});

test("only selected visible tool guidance and explicit prompt guidance survive, deduplicated", () => {
	const out = projectSystemPrompt("assembled", {
		cwd: "/project",
		selectedTools: ["read", "bash"],
		hiddenTools: ["bash"],
		toolGuidelines: {
			read: ["read guidance", "read guidance"],
			bash: ["hidden guidance"],
			edit: ["inactive guidance"],
		},
		promptGuidelines: ["prompt guidance", "read guidance"],
	});
	assert.equal(out.match(/read guidance/g)?.length, 1);
	assert.ok(out.includes("prompt guidance"));
	assert.ok(!out.includes("hidden guidance"));
	assert.ok(!out.includes("inactive guidance"));
});

test("empty explicit overrides suppress generated context and append, while force prompts stay operator policy", () => {
	const out = projectSystemPrompt("assembled", {
		cwd: "/project",
		appendSystemPrompt: "suppressed append",
		contextFiles: [{ path: "AGENTS.md", content: "suppressed context" }],
		sections: { addendum: "", project_context: "", skills: "" },
	});
	assert.equal(out, "");
	const forced = "<rules>\nforced operator policy\n</rules>";
	assert.equal(projectSystemPrompt("assembled", { cwd: "/project", forceSystemPrompt: forced }), forced);
});
