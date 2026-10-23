// Parse generated agent.md frontmatter with real YAML: agy silently drops
// agents whose frontmatter is invalid, leaving --agent turns to fail discovery.

import { parse } from "yaml";

export function parseAgentFrontmatter(md: string): Record<string, unknown> {
	const match = /^---\n([\s\S]*?)\n---/.exec(md);
	if (!match) throw new Error("no frontmatter block found");
	return parse(match[1]) as Record<string, unknown>;
}
