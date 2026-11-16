import path from "node:path";
import { readGlobalMcpConfig } from "../mcp-registration.js";
import { isPiBridgeName } from "./home.js";
import type { AcpMcpServer } from "./connection.js";

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pairs(value: unknown = {}): Array<{ name: string; value: string }> {
	if (!record(value) || Object.values(value).some((v) => typeof v !== "string")) throw new Error("invalid string map");
	return Object.entries(value).map(([name, value]) => ({ name, value: value as string }));
}

/** ACP does not discover the home's MCP config when session mcpServers is supplied.
 * Read only the effective isolated home; never fall back to the global config. */
export function stagedAcpMcpServers(home: string | undefined, log: (message: string) => void = () => {}): AcpMcpServer[] {
	if (!home) return [];
	let servers: unknown;
	try {
		servers = readGlobalMcpConfig(path.join(home, "config", "mcp_config.json")).mcpServers;
		if (!record(servers)) throw new Error("invalid servers");
	} catch {
		log("mcp-config-skipped: cannot read staged MCP servers");
		return [];
	}
	const result: AcpMcpServer[] = [];
	for (const [name, entry] of Object.entries(servers)) {
		if (isPiBridgeName(name) || (record(entry) && entry.disabled === true)) continue;
		try {
			if (!record(entry)) throw new Error("invalid entry");
			if (entry.disabled !== undefined && typeof entry.disabled !== "boolean") throw new Error("invalid disabled");
			if (typeof entry.serverUrl === "string") {
				const url = new URL(entry.serverUrl);
				if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid URL");
				result.push({ name, type: "http", url: entry.serverUrl, headers: pairs(entry.headers) });
			} else {
				if (typeof entry.command !== "string" || !entry.command.trim()) throw new Error("invalid command");
				const args = entry.args === undefined ? [] : entry.args;
				if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) throw new Error("invalid args");
				result.push({ name, command: entry.command, args, env: pairs(entry.env) });
			}
		} catch {
			// No config values (which may be secrets) in debug diagnostics.
			log(`mcp-entry-skipped: malformed server ${name}`);
		}
	}
	return result;
}
