import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

export const ANTIGRAVITY_NAMESPACE = {
	name: "antigravity",
	description: "Google Antigravity delegation, live web search and public URL reading.",
	instructions: "Use AskAntigravity for a self-contained workspace task with all required material; it cannot see this conversation. Reuse details.conversationId to continue. Plan is NOT a read-only guarantee; enforce read-only in the host. Delegation is refused when already using the Antigravity provider. Use agy_web_search for a short cited answer about current information, and agy_read_url for the main text of a public http(s) page. Each web call starts a one-shot CLI process and consumes Antigravity quota. These tools are available only when enabled in package configuration.",
} satisfies NonNullable<ToolDefinition["namespace"]>;
