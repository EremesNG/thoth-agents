// Staging for the approval-gate hooks.json (docs/TODO.md 2.5).
//
// The agy CLI discovers `.agents/hooks.json` in its --add-dir directories
// (live-probed 2026-09-22: stream-json and interactive sessions load and
// execute PreToolUse hooks from any add-dir; print mode reads only the
// global config) and fires them before a gated tool runs (V2: deny
// honored, reason reaches the model; V3: hook TIMEOUT = soft-pass, agy
// proceeds ungated). Therefore:
//   - the staged handler timeout must exceed the whole park budget with
//     margin (never rely on timeout as a deny), and
//   - the staged command delegates to the bundled poll script, which
//     early-acks and polls the bridge for the terminal decision.
//
// ISOLATION (issue #5): the gate group is staged into the session-private
// per-pid bridge dir (bridgeMcpConfigDir()), NOT the shared workspace. Only
// this session's agy gets that dir as an extra --add-dir (driver.ts), so
// standalone IDE/CLI sessions in the workspace can never load the gate -
// neither denying their tools while pi is idle nor parking their calls
// into a live pi turn. The private file is ours alone: no merge, no
// foreign-file backup dance.
//
// Legacy: 1.6.x staged into the shared workspace `.agents/hooks.json`.
// sweepWorkspaceGateGroups() removes gate groups left there by sessions
// whose pid is dead; groups of live sessions and foreign groups are never
// touched.
//
// ALLOW-BY-EXCEPTION (agy-upstream-safety-sync): the owned group matches every
// native tool. The handler passes only the read-only allowlist and positively
// identified MCP calls itself; everything else goes to the bridge, which parks
// it for Pi approval (run_command is routed by the guard state). The handler
// owns ONE overall deadline, strictly below the group's declared hook timeout,
// that covers stdin reading and every bridge wait, so it always emits a
// verdict before agy's timeout soft-pass. The residual case - the hook
// process crashing or being killed before it writes a verdict - cannot be
// covered from inside the handler and is a documented known limitation.
//
// Run: npm test

import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { logsDir } from "./config.js";
import { APPROVAL_PARK_TIMEOUT_MS, bridgeMcpConfigDir } from "./mcp-server.js";
import { READ_ONLY_AGY_TOOLS } from "./native-tool-policy.js";

export const HOOK_GROUP = "pi-bridge-gate";

/** Group-key namespace. Each session's group is keyed per-pid
 *  (`pi-bridge-gate-<pid>`): the key doubles as the ownership proof for the
 *  legacy workspace sweep, which may only remove groups whose owning
 *  session is dead (a stale shared key must never strip a live session's
 *  gate - audit 2026-09-07). */
export const GATE_GROUP_PREFIX = "pi-bridge-gate";

/** This session's group key. */
export function gateGroupKey(pid: number = process.pid): string {
	return `${GATE_GROUP_PREFIX}-${pid}`;
}

/** True if the process is running (EPERM counts: alive but not ours). */
function pidAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		return (e as NodeJS.ErrnoException).code === "EPERM";
	}
}

/** Hook script file name. `.mjs` is load-bearing: the script uses top-level
 *  `await`, and Node 22.19 does not sniff ESM syntax for a bare `.js`
 *  without a package.json "type", so it would die with a SyntaxError (exit 1). */
export function approvalHookFileName(pid: number, instanceId: string): string {
	return `approval-hook-${pid}-${instanceId}.mjs`;
}

/** Reconstruct, rather than infer, ownership of a workspace group. History
 *  (06cda31) establishes per-pid keys, UUID-v4-suffixed .js scripts in logsDir(),
 *  and this exact buildGateGroup shape with a 480s park budget. Neither bare
 *  group keys nor pid-only script names are established: preserve them.
 *  JSON object-key order is immaterial; every value and extra key matters. */
function reconstructedGateGroupPid(key: string, group: unknown): number | null {
	const owner = /^pi-bridge-gate-([1-9]\d{0,9})$/.exec(key);
	if (!owner) return null;
	const pid = Number(owner[1]);
	// Conservative ceiling (Linux pid_max limit); never probe ambiguous numbers.
	if (pid > 4194304 || key !== gateGroupKey(pid)) return null;
	const command = (group as { PreToolUse?: Array<{ hooks?: Array<{ command?: unknown }> }> } | null)
		?.PreToolUse?.[0]?.hooks?.[0]?.command;
	if (typeof command !== "string" || !command.startsWith("node ")) return null;
	let script: unknown;
	try {
		script = JSON.parse(command.slice(5));
	} catch {
		return null;
	}
	if (typeof script !== "string") return null;
	const name = /^approval-hook-([1-9]\d{0,9})-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(mjs|js)$/.exec(path.basename(script));
	if (!name || name[1] !== owner[1]) return null;
	const instanceId = name[2] as string;
	const fileName = name[3] === "mjs" ? approvalHookFileName(pid, instanceId) : `approval-hook-${pid}-${instanceId}.js`;
	const opts = {
		port: 0, token: "", // These fields are not serialized into the group.
		scriptPath: path.join(logsDir(), fileName),
		parkBudgetMs: APPROVAL_PARK_TIMEOUT_MS,
	};
	// The pinned pre-change group (what earlier builds actually wrote into the
	// shared workspace) stays attributable independently of the live matcher.
	return isDeepStrictEqual(group, buildHistoricalGateGroup(opts)) || isDeepStrictEqual(group, buildGateGroup(opts)) ? pid : null;
}

/** Guard group-key namespace (shared hooks.json coexistence with approval gate). */
export const RUN_COMMAND_GUARD_GROUP_PREFIX = "pi-bridge-run-command-guard";

/** This session's run_command guard group key. */
export function runCommandGuardGroupKey(pid: number = process.pid): string {
	return `${RUN_COMMAND_GUARD_GROUP_PREFIX}-${pid}`;
}

/** Matcher of the owned gate group: every native tool. The handler decides
 *  (allow-by-exception); a regex alternation matcher is what agy 1.5.x
 *  accepts (the historical `a|b|c` lists were live-probed). */
export const ALL_TOOLS_MATCHER = ".*";

/** PINNED pre-change matcher (a literal copy, never derived from live
 *  constants) so legacy workspace groups written by earlier builds remain
 *  recognized and swept after the live matcher moved on. */
const HISTORICAL_GATED_AGY_TOOLS =
	"create_file|write_to_file|replace_file_content|multi_replace_file_content|edit_file|run_command";

/** The exact group shape earlier builds staged (pinned; see above). */
function buildHistoricalGateGroup(opts: { scriptPath: string; parkBudgetMs: number }): Record<string, unknown> {
	return {
		enabled: true,
		PreToolUse: [
			{
				matcher: HISTORICAL_GATED_AGY_TOOLS,
				hooks: [
					{
						type: "command",
						command: `node ${JSON.stringify(opts.scriptPath)}`,
						timeout: Math.max(60, Math.ceil(opts.parkBudgetMs / 1000) + 60),
					},
				],
			},
		],
	};
}

export interface StageOptions {
	/** Bridge HTTP port (the approval endpoints live on the bridge server). */
	port: number;
	/** Bridge shared secret (x-bridge-token). */
	token: string;
	/** Path to the bundled poll script (written by the caller). */
	scriptPath: string;
	/** Full park budget in ms; the staged hook timeout exceeds it. */
	parkBudgetMs: number;
}

/** Margin between the handler's internal overall deadline and the park
 *  budget it must outlast (the bridge park answers first, then the handler
 *  prints the terminal deny it received). */
export const HANDLER_DEADLINE_GRACE_MS = 20_000;

/** Minimum gap kept between the handler's overall deadline and the group's
 *  declared agy hook timeout: a timed-out hook soft-passes (V3). */
export const HANDLER_TIMEOUT_MARGIN_MS = 30_000;

/** The handler's one overall deadline for a given park budget. */
export function handlerDeadlineMs(parkBudgetMs: number): number {
	return parkBudgetMs + HANDLER_DEADLINE_GRACE_MS;
}

/** Source of the staged handler script. Written to disk by the caller (data
 *  dir), referenced by absolute path from the staged hooks.json. Reads the
 *  hook payload, passes read-only tools and positively identified MCP calls
 *  itself, and otherwise early-acks via POST /approval then polls GET
 *  /approval/<ticket> for the terminal Pi decision. EVERY path ends in one
 *  printed JSON verdict before the single overall deadline (stdin reading and
 *  all bridge waits included); a valid Pi allow/deny is forwarded, anything
 *  else - failure, malformed reply, no decision in time - is deny. */
export function hookScriptSource(opts: { port: number; token: string; deadlineMs: number; ownServerName?: string; checkAll?: boolean }): string {
	return `#!/usr/bin/env node
// Bridge approval hook (generated; do not edit). Polls the pi-antigravity-bridge.
const PORT = ${opts.port};
const TOKEN = ${JSON.stringify(opts.token)};
const OVERALL_MS = ${opts.deadlineMs};
const OWN_SERVER = ${JSON.stringify(opts.ownServerName ?? "")};
const READ_ONLY = new Set(${JSON.stringify(READ_ONLY_AGY_TOOLS)});
const DEADLINE = Date.now() + OVERALL_MS;
let finished = false;
// The single verdict writer. Everything below funnels through it exactly once.
function verdict(obj) {
	if (finished) return;
	finished = true;
	clearTimeout(overall);
	const safety = setTimeout(() => process.exit(0), 2000);
	safety.unref();
	process.stdout.write(JSON.stringify(obj) + "\\n", () => process.exit(0));
}
function deny(reason) {
	verdict({ decision: "deny", reason });
}
// One overall deadline over stdin reading AND every bridge wait. A hook killed
// by agy's staged timeout soft-passes (V3), so this always prints a deny first.
const overall = setTimeout(() => deny("approval gate deadline exceeded"), OVERALL_MS);
function validDecision(json) {
	return !!json && typeof json === "object" && (json.decision === "allow" || (json.decision === "deny" && typeof json.reason === "string" && json.reason.length > 0));
}
function isMcp(name, args) {
	if (name === "call_mcp_tool") {
		const a = args && typeof args === "object" ? args : {};
		return [a.ServerName, a.server_name, a.serverName, a.server].some((v) => typeof v === "string" && v.length > 0);
	}
	return OWN_SERVER !== "" && name.startsWith("mcp_" + OWN_SERVER + "_") && name.length > OWN_SERVER.length + 5;
}
const remaining = () => Math.max(1, DEADLINE - Date.now());
try {
	let body = "";
	process.stdin.setEncoding("utf8");
	for await (const chunk of process.stdin) body += chunk;
	let payload;
	try {
		payload = JSON.parse(body);
	} catch {
		deny("approval gate could not parse the hook payload");
	}
	const name = payload?.toolCall?.name;
	if (finished) {
		// already denied above
	} else if (typeof name !== "string" || name.length === 0) {
		deny("approval gate payload has no tool name");
	} else if (${opts.checkAll ? "false" : "READ_ONLY.has(name) || isMcp(name, payload.toolCall.args)"}) {
		verdict({ decision: "allow" });
	} else {
		let ticket = "";
		try {
			const res = await fetch(\`http://127.0.0.1:\${PORT}/approval\`, {
				method: "POST",
				headers: { "content-type": "application/json", "x-bridge-token": TOKEN },
				body,
				signal: AbortSignal.timeout(Math.min(10_000, remaining())),
			});
			const json = await res.json();
			// Direct terminal decisions (guard/ungated answers) arrive on the POST.
			if (json && typeof json === "object" && typeof json.decision === "string") {
				if (validDecision(json)) verdict(json);
				else deny("gate returned an invalid decision");
			} else {
				ticket = typeof json?.ticket === "string" ? json.ticket : "";
			}
		} catch {}
		if (!finished && !ticket) deny("approval gate unreachable (bridge down?)");
		while (!finished && Date.now() < DEADLINE) {
			await new Promise((r) => setTimeout(r, Math.min(500, remaining())));
			if (finished) break;
			try {
				const res = await fetch(\`http://127.0.0.1:\${PORT}/approval/\${encodeURIComponent(ticket)}\`, {
					headers: { "x-bridge-token": TOKEN },
					signal: AbortSignal.timeout(remaining()),
				});
				const json = await res.json();
				if (json?.status !== "pending") {
					if (validDecision(json)) verdict(json);
					else deny("gate returned no decision");
				}
			} catch {}
		}
		deny("approval gate deadline exceeded");
	}
} catch {
	deny("approval gate failed");
}
`;
}

/** Hook timeout (seconds) staged for a given park budget: the budget plus a
 *  60s margin, minimum 60s. V3: a timed-out hook soft-passes, so this must
 *  never be smaller than the human can plausibly need. */
export function stagedTimeoutSeconds(parkBudgetMs: number): number {
	return Math.max(60, Math.ceil(parkBudgetMs / 1000) + 60);
}

/** Build our hooks.json group for private-dir staging. */
export function buildGateGroup(opts: StageOptions): Record<string, unknown> {
	const command = `node ${JSON.stringify(opts.scriptPath)}`;
	return {
		enabled: true,
		PreToolUse: [
			{
				matcher: ALL_TOOLS_MATCHER,
				hooks: [
					{
						type: "command",
						command,
						timeout: stagedTimeoutSeconds(opts.parkBudgetMs),
					},
				],
			},
		],
	};
}

export interface StageResult {
	wrote: boolean;
	/** Why nothing was written (already current, ...). */
	reason?: string;
}

/** The session-private hooks.json path (beside mcp_config.json or in a hooks-only add-dir). */
export function hooksFilePath(dir: string = bridgeMcpConfigDir()): string {
	return path.join(dir, ".agents", "hooks.json");
}

/** True if this session's gate hooks are currently staged in the private
 *  add-dir. The driver uses this to decide whether to pass the extra
 *  --add-dir even when the MCP config is absent. */
export function gateHooksStaged(dir: string = bridgeMcpConfigDir()): boolean {
	return fs.existsSync(hooksFilePath(dir));
}

function readHooksObject(file: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		/* absent or invalid JSON */
	}
	return null;
}

/** Atomically write `content` to `file` (mode 0600) only when missing or changed. */
export function writeFileAtomicIfChanged(file: string, content: string): boolean {
	try {
		if (fs.readFileSync(file, "utf8") === content) return false;
	} catch {
		/* absent or unreadable: write */
	}
	fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
	const tmp = `${file}.${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmp, content, { mode: 0o600 });
		fs.renameSync(tmp, file);
	} catch (err) {
		try {
			fs.unlinkSync(tmp);
		} catch {
			/* nothing */
		}
		throw err;
	}
	return true;
}

function writeHooksAtomic(file: string, groups: Record<string, unknown>): StageResult {
	const wrote = writeFileAtomicIfChanged(file, JSON.stringify(groups, null, 2) + "\n");
	return wrote ? { wrote: true } : { wrote: false, reason: "already staged" };
}

/** Stage one owned hook group into dir/.agents/hooks.json while preserving
 *  sibling owned groups selected by preserveKey (dropping stale leftovers). */
export function stageManagedHooksGroup(
	dir: string,
	groupKey: string,
	group: Record<string, unknown>,
	preserveKey: (key: string) => boolean,
): StageResult {
	const file = hooksFilePath(dir);
	const existing = readHooksObject(file);
	const nextGroups: Record<string, unknown> = {};
	if (existing) {
		for (const [k, v] of Object.entries(existing)) {
			if (k === groupKey) nextGroups[k] = group;
			else if (preserveKey(k)) nextGroups[k] = v;
		}
	}
	if (!Object.hasOwn(nextGroups, groupKey)) nextGroups[groupKey] = group;
	if (existing && isDeepStrictEqual(existing, nextGroups)) {
		return { wrote: false, reason: "already staged" };
	}
	return writeHooksAtomic(file, nextGroups);
}

/** Remove one owned hook group from dir/.agents/hooks.json, preserving any
 *  remaining groups or deleting the file when empty. */
export function removeManagedHooksGroup(
	dir: string,
	groupKey: string,
	missingReason: string,
): StageResult {
	const file = hooksFilePath(dir);
	if (!fs.existsSync(file)) return { wrote: false, reason: "no hooks.json" };
	const existing = readHooksObject(file);
	if (!existing || !Object.hasOwn(existing, groupKey)) {
		return { wrote: false, reason: missingReason };
	}
	delete existing[groupKey];
	if (Object.keys(existing).length === 0) {
		try {
			fs.rmSync(file, { force: true });
			return { wrote: true };
		} catch {
			return { wrote: false, reason: "remove failed" };
		}
	}
	try {
		return writeHooksAtomic(file, existing);
	} catch {
		return { wrote: false, reason: "remove failed" };
	}
}

/** Stage the gate group into the session-private per-pid dir:
 *  <bridgeMcpConfigDir()>/.agents/hooks.json, preserving a staged guard group. */
export function stageGateHooks(dir: string, opts: StageOptions): StageResult {
	return stageManagedHooksGroup(
		dir,
		gateGroupKey(),
		buildGateGroup(opts),
		(k) => k === runCommandGuardGroupKey(),
	);
}

/** Remove the private gate hooks group while preserving any staged guard group. */
export function removeGateHooks(dir: string = bridgeMcpConfigDir()): StageResult {
	return removeManagedHooksGroup(dir, gateGroupKey(), "no gate group");
}

/** Legacy cleanup (issue #5): remove gate groups that 1.6.x staged into the
 *  SHARED workspace `.agents/hooks.json` when their owning session is dead
 *  (its bridge is gone; the hook would fail closed forever). Live sessions'
 *  groups and groups we cannot attribute are never touched; foreign groups
 *  and foreign files are never touched. Returns the number of swept groups. */
export function sweepWorkspaceGateGroups(workspaceDir: string): number {
	const file = path.join(workspaceDir, ".agents", "hooks.json");
	let current: Record<string, unknown>;
	try {
		if (fs.lstatSync(file).isSymbolicLink()) return 0;
		const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return 0;
		current = parsed as Record<string, unknown>;
	} catch {
		return 0;
	}
	let swept = 0;
	for (const key of Object.keys(current)) {
		const pid = reconstructedGateGroupPid(key, current[key]);
		if (pid === null || pidAlive(pid)) continue;
		delete current[key];
		swept += 1;
	}
	if (swept === 0) return 0;
	try {
		fs.writeFileSync(file, JSON.stringify(current, null, 2) + "\n");
	} catch {
		return 0;
	}
	return swept;
}
