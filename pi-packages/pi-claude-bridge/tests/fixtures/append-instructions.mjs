// A projected append with the generic shapes emitted by prompt capture and extensions.
export const staticInstructions = "Static project guidance.\n".repeat(600);
export const taskBlock = (value) => `<thoth-todo-open-tasks>\nCurrent task: ${value}\n</thoth-todo-open-tasks>`;
export const projectedAppend = (value) =>
	[
		`<project_context>\n\nProject-specific instructions and guidelines:\n\n<project_instructions path="/workspace/AGENTS.md">\n${staticInstructions}</project_instructions>\n\n<project_instructions path="/workspace/nested/AGENTS.md">\nNested guidance\n</project_instructions>\n\n</project_context>`,
		"<available_skills>\n<skill><name>check</name></skill>\n</available_skills>",
		"<!-- thoth-agents:pi-root:start -->\nRoot instructions\n<!-- thoth-agents:pi-root:end -->",
		"Host's untagged instructions",
		taskBlock(value),
	].join("\n\n");
