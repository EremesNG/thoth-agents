// Allow-by-exception policy for agy native tools seen by the PreToolUse gate.
//
// The owned gate group matches EVERY tool; the handler (and, defense in depth,
// the bridge's POST /approval) lets only these pass without Pi approval:
//   - the read-only allowlist below,
//   - MCP calls identified by positive payload evidence,
//   - run_command while the separate headless guard is verified-delivered.
// Everything else - write_file, sed_file, notebook_edit, any future tool -
// requires Pi approval. Allowlist drift fails safe: a new read-only tool just
// costs an extra approval.

import path from "node:path";

/** Read-only agy native tools. Source of inventory: the `init` frame of
 *  `agy --input-format stream-json --output-format stream-json` on agy 1.5.13
 *  (init.tools, observed with no prompt sent, 2026-11-21):
 *    ask_custom_permission ask_permission ask_question browser_click_element
 *    browser_drag_pixel_to_pixel browser_get_dom browser_get_network_request
 *    browser_input browser_list_network_requests browser_mouse_down
 *    browser_mouse_up browser_move_mouse browser_press_key
 *    browser_refresh_page browser_resize_window browser_scroll
 *    browser_scroll_dom browser_select_option browser_subagent call_mcp_tool
 *    capture_browser_console_logs capture_browser_screenshot
 *    click_browser_pixel command_status define_subagent delete_knowledge
 *    execute_browser_javascript find_by_name finish generate_image
 *    grep_search invoke_subagent list_browser_pages list_dir list_permissions
 *    list_plugin_accounts list_resources manage_inbox manage_subagents
 *    manage_task multi_replace_file_content notebook_edit notebook_execution
 *    open_browser_url read_browser_page read_resource read_url_content
 *    replace_file_content run_command run_workflow schedule search_marketplace
 *    search_web sed_file send_command_input send_message view_file wait
 *    wait_5_seconds write_to_file
 *  ACP exposes a DIFFERENT native inventory than stream-json: the AC-6 live
 *  ACP probe (agy 1.5.13) observed `read_file` (read) next to `write_file` and
 *  `edit_file` (mutating). `read_file` is therefore allowlisted. Other ACP
 *  names were checked against src/acp/events.ts, src/native-tools.ts and
 *  docs/ACP-PROTOCOL-REFERENCE.md (tool kinds `edit`/`read`/`execute`, titles
 *  "Run create_file?"/"Running view_file"): no further read-only name is
 *  attested there, so nothing else is added on a guess.
 *  Only tools with no filesystem, process, browser-interaction or
 *  account side effect are listed; ask_* (permission/identity prompts),
 *  screenshots (write artifacts), marketplace search and everything that
 *  mutates stay out and require approval. */
export const READ_ONLY_AGY_TOOLS: readonly string[] = [
	"browser_get_dom",
	"browser_get_network_request",
	"browser_list_network_requests",
	"capture_browser_console_logs",
	"command_status",
	"find_by_name",
	"finish",
	"grep_search",
	"list_browser_pages",
	"list_dir",
	"list_permissions",
	"list_plugin_accounts",
	"list_resources",
	"read_browser_page",
	"read_file",
	"read_resource",
	"read_url_content",
	"search_web",
	"view_file",
	"wait",
	"wait_5_seconds",
];

const READ_ONLY_SET: ReadonlySet<string> = new Set(READ_ONLY_AGY_TOOLS);

export function isReadOnlyAgyTool(name: string): boolean {
	return READ_ONLY_SET.has(name);
}

/** Positive MCP evidence in a hook payload. agy surfaces MCP calls as the
 *  native `call_mcp_tool` wrapper carrying a server name argument. Live ACP
 *  hook payload (agy 1.5.13, AC-6): `{ServerName, ToolName, Arguments}`;
 *  stream-json step records use `server_name`/`serverName`/`server`. Or - for this bridge
 *  only - as the qualified catalog name `mcp_<ownServer>_<tool>`. Absence of
 *  evidence is NOT MCP: such a call requires approval. */
export function isMcpToolCall(name: string, args: unknown, ownServerName?: string): boolean {
	if (name === "call_mcp_tool") {
		const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
		return [a.ServerName, a.server_name, a.serverName, a.server].some((v) => typeof v === "string" && v.length > 0);
	}
	return !!ownServerName && name.startsWith(`mcp_${ownServerName}_`) && name.length > ownServerName.length + 5;
}

/** A target agy will mutate exactly as written: absolute on the host
 *  platform and never resolved against a guessed base. Rooted-without-drive
 *  (`\x`, `/x`) and drive-relative (`C:x`) Windows forms are ambiguous. */
export function isAbsoluteTargetPath(p: string, platform: NodeJS.Platform = process.platform): boolean {
	if (typeof p !== "string" || p.length === 0 || p.trim() !== p || p.includes("\0")) return false;
	// Drive-absolute or a COMPLETE UNC path (server + share); a server-only
	// target (`\\server`, `\\server\`) names no mutable location.
	if (platform === "win32") return /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/]+[^\\/])/.test(p) && path.win32.isAbsolute(p);
	return path.posix.isAbsolute(p);
}
