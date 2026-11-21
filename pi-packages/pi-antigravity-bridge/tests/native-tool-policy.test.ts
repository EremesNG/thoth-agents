// Allow-by-exception policy pins: read-only allowlist, MCP evidence,
// absolute-target rule.
//
// Run: npm test

import assert from "node:assert/strict";
import { test } from "vitest";
import { isAbsoluteTargetPath, isMcpToolCall, isReadOnlyAgyTool, READ_ONLY_AGY_TOOLS } from "../src/native-tool-policy.js";

test("the allowlist contains only read-only agy 1.5.13 tools; every mutating tool in the init inventory stays out", () => {
	for (const name of ["read_file", "view_file", "grep_search", "list_dir", "find_by_name", "read_url_content", "search_web", "command_status"]) {
		assert.equal(isReadOnlyAgyTool(name), true, name);
	}
	const mutating = [
		"write_file", "write_to_file", "create_file", "edit_file", "replace_file_content", "multi_replace_file_content",
		"sed_file", "notebook_edit", "notebook_execution", "run_command", "send_command_input", "delete_knowledge",
		"browser_click_element", "browser_input", "execute_browser_javascript", "open_browser_url", "capture_browser_screenshot",
		"invoke_subagent", "manage_subagents", "define_subagent", "schedule", "send_message", "manage_task", "manage_inbox",
		"generate_image", "run_workflow", "ask_permission", "ask_custom_permission", "browser_subagent", "future_unknown_tool",
	];
	for (const name of mutating) assert.equal(isReadOnlyAgyTool(name), false, name);
	assert.equal(new Set(READ_ONLY_AGY_TOOLS).size, READ_ONLY_AGY_TOOLS.length, "no duplicates");
});

test("MCP evidence requires call_mcp_tool with a server argument, or this bridge's qualified name", () => {
	assert.equal(isMcpToolCall("call_mcp_tool", { server_name: "codegraph" }), true);
	assert.equal(isMcpToolCall("call_mcp_tool", { serverName: "x" }), true);
	assert.equal(isMcpToolCall("call_mcp_tool", { server: "x" }), true);
	// Live ACP hook payload (agy 1.5.13, AC-6 probe): PascalCase argument names.
	assert.equal(isMcpToolCall("call_mcp_tool", { ServerName: "pi-agy-863e9ed5", ToolName: "write", Arguments: { path: "/w/a" } }), true);
	assert.equal(isMcpToolCall("call_mcp_tool", { ServerName: "" , ToolName: "write" }), false);
	assert.equal(isMcpToolCall("call_mcp_tool", { ToolName: "write" }), false);
	assert.equal(isMcpToolCall("call_mcp_tool", { tool: "x" }), false);
	assert.equal(isMcpToolCall("call_mcp_tool", { server_name: "" }), false);
	assert.equal(isMcpToolCall("call_mcp_tool", null), false);
	assert.equal(isMcpToolCall("mcp_pi-agy-1_bash", {}, "pi-agy-1"), true);
	assert.equal(isMcpToolCall("mcp_pi-agy-1_", {}, "pi-agy-1"), false);
	assert.equal(isMcpToolCall("mcp_pi-agy-2_bash", {}, "pi-agy-1"), false);
	assert.equal(isMcpToolCall("mcp_pi-agy-1_bash", {}), false);
	assert.equal(isMcpToolCall("write_file", { server_name: "x" }), false);
});

test.each([
	["linux", "/w/a.txt", true],
	["linux", "w/a.txt", false],
	["linux", "./a.txt", false],
	["linux", "", false],
	["linux", " /w/a.txt", false],
	["linux", "/w/a\0.txt", false],
	["win32", "C:\\w\\a.txt", true],
	["win32", "C:/w/a.txt", true],
	["win32", "\\\\srv\\share\\a.txt", true],
	["win32", "C:a.txt", false],
	["win32", "\\a.txt", false],
	["win32", "/a.txt", false],
	["win32", "a.txt", false],
] as const)("isAbsoluteTargetPath(%s, %j) = %s", (platform, p, expected) => {
	assert.equal(isAbsoluteTargetPath(p, platform), expected);
});
