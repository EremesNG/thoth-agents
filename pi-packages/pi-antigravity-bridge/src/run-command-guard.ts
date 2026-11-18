import fs from "node:fs";
import {
	gateGroupKey,
	hooksFilePath,
	removeManagedHooksGroup,
	runCommandGuardGroupKey,
	stageManagedHooksGroup,
	writeFileAtomicIfChanged,
	type StageResult,
} from "./approval-hook.js";
import type { BridgeTools } from "./config.js";

export { runCommandGuardGroupKey };

export interface RunCommandGuardInput {
	/** Pi session mode (undefined = non-interactive). */
	sessionMode: string | undefined;
	/** Guard config setting (default true). */
	enabled: boolean;
	/** Bridge tools mode ("none" disables the MCP bridge entirely). */
	bridgeTools: BridgeTools;
	/** All registered Pi tools, active tool names, and session-hidden names. */
	allTools: readonly { name: string }[];
	activeTools: readonly string[];
	hiddenTools: ReadonlySet<string>;
}

/** Shared activation predicate for the non-interactive run_command guard.
 *  Drives hook staging, built-in bash catalog admission, and the prompt note. */
export function isRunCommandGuardActive(input: RunCommandGuardInput): boolean {
	if (input.sessionMode === "tui") return false;
	if (!input.enabled) return false;
	if (input.bridgeTools === "none") return false;
	if (input.hiddenTools.has("bash")) return false;
	if (!input.activeTools.includes("bash")) return false;
	return input.allTools.some((tool) => tool.name === "bash");
}

/** Model-visible denial reason naming the session's Pi bash bridge tool. */
export function formatRunCommandGuardReason(serverName: string): string {
	return `Native run_command is refused in non-interactive sessions. Use the Pi bridge bash tool (${serverName}/bash; mcp_${serverName}_bash) for every shell command, passing its timeout argument (in seconds) for long work.`;
}

/** Source of the static PreToolUse guard hook script (Windows & POSIX safe). */
export function guardHookScriptSource(reason: string): string {
	const payload = JSON.stringify({ decision: "deny", reason });
	return `// Bridge run_command guard hook (generated; do not edit).\nconsole.log(${JSON.stringify(payload)});\n`;
}

/** Write or update the guard hook script atomically with owner-only perms. */
export function writeGuardHookScript(scriptPath: string, reason: string): boolean {
	return writeFileAtomicIfChanged(scriptPath, guardHookScriptSource(reason));
}

/** Build the dedicated run_command-only PreToolUse hook group. */
export function buildRunCommandGuardGroup(scriptPath: string): Record<string, unknown> {
	return {
		enabled: true,
		PreToolUse: [
			{
				matcher: "run_command",
				hooks: [
					{
						type: "command",
						command: `node ${JSON.stringify(scriptPath)}`,
						timeout: 30,
					},
				],
			},
		],
	};
}

/** True when dir/.agents/hooks.json exists (used by ACP hooks-only --add-dir). */
export function guardHooksStaged(dir: string): boolean {
	return fs.existsSync(hooksFilePath(dir));
}

/** Stage the guard group into dir/.agents/hooks.json while preserving a staged gate group. */
export function stageRunCommandGuardHooks(dir: string, scriptPath: string): StageResult {
	return stageManagedHooksGroup(
		dir,
		runCommandGuardGroupKey(),
		buildRunCommandGuardGroup(scriptPath),
		(k) => k === gateGroupKey(),
	);
}

/** Remove the guard group from dir/.agents/hooks.json while preserving a staged gate group. */
export function removeRunCommandGuardHooks(dir: string): StageResult {
	return removeManagedHooksGroup(dir, runCommandGuardGroupKey(), "no guard group");
}
