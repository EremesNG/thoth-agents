import { MCP_TOOL_PREFIX } from "./skills.js";

// Query-independent bytes: keep this out of tool definitions and capture keys.
export const MCP_TOOL_NAME_NOTE = [
	"<mcp_tool_names>",
	`In these instructions, a plain Pi tool name X refers to ${MCP_TOOL_PREFIX}X. Use that MCP tool; do not treat the plain name as unavailable.`,
	"</mcp_tool_names>",
].join("\n");
