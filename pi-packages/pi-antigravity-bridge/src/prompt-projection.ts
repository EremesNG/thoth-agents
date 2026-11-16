import { formatSkillsForPrompt, type BuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";

// Focused port of claude-bridge's portable capture projection. Explicit section
// overrides are operator policy, not Pi defaults, and must remain sendable.
const BUILTIN_SECTIONS = new Set([
	"preamble",
	"tools",
	"rules",
	"docs",
	"addendum",
	"project_context",
	"skills",
	"cwd",
]);

function section(name: string, content: string): string {
	return BUILTIN_SECTIONS.has(name)
		? `<pi_prompt_section name="${name}">\n${content}\n</pi_prompt_section>`
		: `<${name}>\n${content}\n</${name}>`;
}

/** Derivation for callers without a capture, including inherited assembled custom
 * prompts. Match entire top-level blocks so AGENTS.md and skills stay opaque. */
export function derivePromptProjection(assembled: string): string {
	return stripIdentity(assembled)
		.replace(/^<([a-z_]+)>\r?\n[\s\S]*?^<\/\1>[ \t]*$/gm, (block, name: string) =>
			["tools", "rules", "docs", "cwd", "environment", "preamble"].includes(name) ? "" : block,
		)
		.trim();
}

function stripIdentity(text: string): string {
	return text.replace(/^You are a coding assistant running inside pi[^\r\n]*(?:\r?\n|$)/gm, "");
}

function formatProjectContext(files: { path: string; content: string }[]): string {
	const instructions = files
		.map(({ path, content }) => `<project_instructions path="${path}">\n${content}\n</project_instructions>`)
		.join("\n\n");
	return `<project_context>\n\nProject-specific instructions and guidelines:\n\n${instructions}\n\n</project_context>`;
}

function projectCustomPrompt(custom: string): string {
	// A custom prompt is opaque operator policy. Only recognize inherited Pi
	// harness blocks when its identity line establishes their provenance.
	return /^You are a coding assistant running inside pi/m.test(custom) ? derivePromptProjection(custom) : custom;
}

export function projectSystemPrompt(assembled: string, options?: BuildSystemPromptOptions): string {
	if (!options) return derivePromptProjection(assembled);
	if (options.forceSystemPrompt) return projectCustomPrompt(options.forceSystemPrompt);
	const parts: string[] = [];
	const sections = options.sections ?? {};
	const custom = options.customPrompt ? projectCustomPrompt(options.customPrompt) : undefined;
	const addSection = (name: string, content = sections[name]): void => {
		if (!content) return;
		const rendered = section(name, content);
		if (!custom?.includes(rendered) && !custom?.includes(`<${name}>\n${content}\n</${name}>`)) parts.push(rendered);
	};
	if (sections.project_context !== undefined) addSection("project_context");
	else if (options.contextFiles?.length) {
		parts.push(formatProjectContext(options.contextFiles));
	}
	if (sections.skills !== undefined) addSection("skills");
	else {
		// Match Pi's reader precedence, including readers hidden behind another tool.
		const selectedTools = options.selectedTools ?? ["read", "bash", "edit", "write"];
		const readers = ["read", "bash"] as const;
		const fileReadTool = readers.find((tool) => selectedTools.includes(tool) && !options.hiddenTools?.includes(tool)) ??
			(readers.some((tool) => selectedTools.includes(tool)) ? "indirect" : undefined);
		if (fileReadTool) {
			const skills = formatSkillsForPrompt(options.skills ?? [], fileReadTool).trim();
			if (skills) parts.push(skills);
		}
	}
	if (custom) parts.push(custom);
	if (sections.addendum !== undefined) addSection("addendum");
	else if (options.appendSystemPrompt) parts.push(options.appendSystemPrompt);
	for (const name of Object.keys(sections)) {
		if (!["project_context", "skills", "addendum", "tool_guidelines"].includes(name)) addSection(name);
	}
	if (sections.tool_guidelines !== undefined) addSection("tool_guidelines");
	else if (sections.rules === undefined) {
		const toolGuidelines = (options.selectedTools ?? [])
			.filter((name) => !options.hiddenTools?.includes(name))
			.flatMap((name) => options.toolGuidelines?.[name] ?? []);
		const guidelines = [
			...new Set([...toolGuidelines, ...(options.promptGuidelines ?? [])].map((line) => line.trim()).filter(Boolean)),
		];
		addSection("tool_guidelines", guidelines.map((line) => `- ${line}`).join("\n"));
	}
	return stripIdentity(parts.join("\n\n")).trim();
}
