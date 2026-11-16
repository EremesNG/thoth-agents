import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { carrierFrontmatter } from "../sysprompt-agent.js";
import os from "node:os";
import path from "node:path";
import { isPidAlive } from "../mcp-server.js";
import { readGlobalMcpConfig } from "../mcp-registration.js";

export interface OwnBridgeEntry { name: string; port: number; token: string; tokenHeader: string }

/** Match acquired local identities and legacy names, never unrelated MCPs. */
export function isPiBridgeName(name: string): boolean {
	return /^pi-agy-[0-9a-f]{8}$/.test(name) || /^pi-bridge(?:-\d+(?:-[0-9a-f-]+)?)?$/.test(name);
}

function ownBridgeValue(entry: OwnBridgeEntry) {
	return { disabled: false, headers: { [entry.tokenHeader]: entry.token }, serverUrl: `http://127.0.0.1:${entry.port}/mcp` };
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must contain a JSON object`);
	return value as Record<string, unknown>;
}

function linkDirectory(source: string, target: string): void {
	fs.symlinkSync(source, target, "junction");
}

/** Staging root for isolated agy homes. The directory name predates the
 *  stream-json engine adopting homes; renaming it would strand existing
 *  installs' unswept dirs, so both engines stage under it. */
export function agyHomeStagingDir(): string {
	return path.join(os.homedir(), ".pi", "agent", "antigravity-bridge", "acp-homes");
}

export interface StageAgyHomeOptions {
	geminiHome?: string;
	parentDir?: string;
	/** Dir-name prefix: "acp-home" (ACP engine, default) or "agy-home"
	 *  (stream-json). The sweep accepts both. */
	prefix?: "acp-home" | "agy-home";
	/** This session's bridge entry, written ENABLED straight into the staged
	 *  config (issue #14). Never ride the suppression marker here: the marker
	 *  hides bridges from an agy reading the GLOBAL config, and a private-home
	 *  agy never reads global - a marker-disabled own entry would break G9
	 *  silently inside our own home. Omit when the bridge is off. */
	ownBridge?: OwnBridgeEntry;
}

/** Isolate a spawned agy from per-pid bridge entries in the global MCP
 *  config: the staged home carries the global servers minus every
 *  pi-bridge-*, plus (optionally) exactly this session's bridge entry. */
export function stageAgyHome(opts: StageAgyHomeOptions = {}): string {
	const geminiHome = opts.geminiHome ?? path.join(os.homedir(), ".gemini");
	const globalConfigDir = path.join(geminiHome, "config");
	const globalMcpPath = path.join(globalConfigDir, "mcp_config.json");
	let config: Record<string, unknown> = { mcpServers: {} };
	try {
		// Tolerant of the CLI's 0-byte fresh-install file and a UTF-8 BOM;
		// only a missing file means "no config at all" (issue #11).
		config = record(readGlobalMcpConfig(globalMcpPath), globalMcpPath);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			throw new Error(`Cannot isolate inherited MCP config ${globalMcpPath}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	const servers = record(config.mcpServers ?? {}, `${globalMcpPath} mcpServers`);
	const filtered: Record<string, unknown> = Object.fromEntries(
		Object.entries(servers).filter(([name]) => !isPiBridgeName(name)),
	);
	if (opts.ownBridge) {
		filtered[opts.ownBridge.name] = ownBridgeValue(opts.ownBridge);
	}

	const parentDir = opts.parentDir ?? agyHomeStagingDir();
	const prefix = opts.prefix ?? "acp-home";
	fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
	const staged = fs.mkdtempSync(path.join(parentDir, `${prefix}-${process.pid}-`));
	try {
		fs.mkdirSync(path.join(staged, "config"), { mode: 0o700 });
		fs.writeFileSync(path.join(staged, "config", "mcp_config.json"), JSON.stringify({ ...config, mcpServers: filtered }), { mode: 0o600 });

		const appData = path.join(geminiHome, "antigravity-cli");
		if (fs.existsSync(appData)) linkDirectory(appData, path.join(staged, "antigravity-cli"));
		const instructions = path.join(geminiHome, "GEMINI.md");
		if (fs.existsSync(instructions)) fs.copyFileSync(instructions, path.join(staged, "GEMINI.md"));
		if (fs.existsSync(globalConfigDir)) {
			for (const entry of fs.readdirSync(globalConfigDir, { withFileTypes: true })) {
				if (entry.name === "mcp_config.json") continue;
				const source = path.join(globalConfigDir, entry.name);
				const target = path.join(staged, "config", entry.name);
				let stat: fs.Stats | fs.Dirent = entry;
				if (entry.isSymbolicLink()) {
					try {
						stat = fs.statSync(source);
					} catch (err) {
						if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
						throw err;
					}
				}
				if (stat.isDirectory()) linkDirectory(source, target);
				else if (stat.isFile()) fs.copyFileSync(source, target);
			}
		}
		return staged;
	} catch (err) {
		fs.rmSync(staged, { recursive: true, force: true });
		throw err;
	}
}

/** Write only inside the isolated home, never through its global agents junction.
 * Preserve existing agents via child links after replacing the root junction. */
export function stageAcpCarrier(home: string): string {
	const agents = path.join(home, "config", "agents");
	let linked = false;
	try { linked = fs.lstatSync(agents).isSymbolicLink(); }
	catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
	if (linked) {
		const source = fs.realpathSync(agents);
		fs.unlinkSync(agents);
		fs.mkdirSync(agents, { mode: 0o700 });
		for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
			const from = path.join(source, entry.name);
			const to = path.join(agents, entry.name);
			if (fs.statSync(from).isDirectory()) linkDirectory(from, to);
			else fs.copyFileSync(from, to);
		}
	}
	const name = `pi-bridge-acp-${randomBytes(8).toString("hex")}`;
	const dir = path.join(agents, name);
	fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
	fs.writeFileSync(path.join(dir, "agent.md"), `${carrierFrontmatter(name)}\n\nAssist with the current request.\n`, { mode: 0o600 });
	return name;
}

/** Sweep staged homes whose owning pi process died. Accepts both engine
 *  prefixes; a home staged by the CURRENT process is skipped (it may be in
 *  use by a live driver - process-exit leftovers are the next start's
 *  problem). */
export function sweepStagedAgyHomes(baseDir: string = agyHomeStagingDir(), alive: (pid: number) => boolean = isPidAlive): void {
	let entries: string[];
	try {
		entries = fs.readdirSync(baseDir);
	} catch {
		return;
	}
	for (const name of entries) {
		const match = /^(?:acp|agy)-home-(\d+)-/.exec(name);
		if (!match) continue;
		const pid = Number(match[1]);
		if (pid === process.pid || alive(pid)) continue;
		removeStagedAgyHome(path.join(baseDir, name));
	}
}

/** Add or refresh this session's own bridge entry in an ALREADY-STAGED
 *  home. Publish atomically because agy watches this config. */
export function writeOwnBridgeEntry(staged: string, entry: OwnBridgeEntry): void {
	const cfgPath = path.join(staged, "config", "mcp_config.json");
	const cfg = record(readGlobalMcpConfig(cfgPath), cfgPath);
	const servers = record(cfg.mcpServers ?? {}, `${cfgPath} mcpServers`);
	servers[entry.name] = ownBridgeValue(entry);
	// Same-dir tmp + rename: agy watches config dirs, so a truncated
	// mid-write read must be impossible (issue #14 review round 3).
	const tmp = `${cfgPath}.tmp-${process.pid}`;
	try {
		fs.writeFileSync(tmp, JSON.stringify({ ...cfg, mcpServers: servers }), { mode: 0o600 });
		fs.renameSync(tmp, cfgPath);
	} finally { fs.rmSync(tmp, { force: true }); }
}

export function removeStagedAgyHome(staged: string): void {
	const base = path.basename(staged);
	if (!base.startsWith("acp-home-") && !base.startsWith("agy-home-")) return;
	try {
		if (!fs.lstatSync(staged).isDirectory()) return;
		fs.rmSync(staged, { recursive: true, force: true });
	} catch {
		// Connection teardown is best-effort; startup sweeps crash leftovers.
	}
}
