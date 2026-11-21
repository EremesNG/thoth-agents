// Delivery + verification of the owned PreToolUse hook groups (edit gate and
// run_command guard) for agy-upstream-safety-sync.
//
// ACP: the owned groups are merged into the private staged home's
// `config/hooks.json` (upstream 62b2a20: probe-verified delivery mechanism;
// the home is isolated per connection and removed with it). Stream-json keeps
// the bridge `--add-dir` `.agents/hooks.json` (AC-5 probe on agy 1.5.13).
// Before every dispatch the gate-enabled path READS BACK the file and checks
// that each expected owned group is present, byte-for-byte what this instance
// would write, and that the instance-owned handler script it references
// exists, is readable and has the expected source. A missing or mismatched
// piece is a refusal, never a soft pass.

import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { writeFileAtomicIfChanged } from "./approval-hook.js";

/** One owned hook group plus the handler script it executes. */
export interface OwnedHookSpec {
	/** Human label for refusal text ("edit gate", "run_command guard"). */
	label: string;
	groupKey: string;
	group: Record<string, unknown>;
	scriptPath: string;
	scriptSource: string;
}

/** `config/hooks.json` inside a staged agy home. */
export function homeHooksFile(home: string): string {
	return path.join(home, "config", "hooks.json");
}

function parseHooksObject(raw: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
	} catch {
		/* invalid JSON */
	}
	return null;
}

/** Merge the owned groups into `file`, preserving every foreign group
 *  (the user's global hooks arrive here via the staged home copy). An
 *  unparsable existing file is replaced by the owned groups only: agy could
 *  not have read it either. Throws on write failure. */
export function mergeOwnedHookGroups(file: string, specs: readonly OwnedHookSpec[]): void {
	let merged: Record<string, unknown> = {};
	try {
		merged = parseHooksObject(fs.readFileSync(file, "utf8")) ?? {};
	} catch {
		/* absent: owned groups only */
	}
	for (const spec of specs) merged[spec.groupKey] = spec.group;
	writeFileAtomicIfChanged(file, JSON.stringify(merged, null, 2) + "\n");
}

/** Verification result per spec: null = usable, otherwise the reason. */
export type OwnedHookVerification = Map<string, string | null>;

/** Read `file` back and verify each spec. Keyed by groupKey. */
export function verifyOwnedHookGroups(file: string, specs: readonly OwnedHookSpec[]): OwnedHookVerification {
	const result: OwnedHookVerification = new Map();
	let groups: Record<string, unknown> | null = null;
	let fileProblem: string | null = null;
	try {
		groups = parseHooksObject(fs.readFileSync(file, "utf8"));
		if (!groups) fileProblem = `${file} is not a valid hooks object`;
	} catch (err) {
		fileProblem = `${file} is not readable (${(err as NodeJS.ErrnoException).code ?? "error"})`;
	}
	for (const spec of specs) {
		result.set(spec.groupKey, fileProblem ?? verifySpec(groups!, spec));
	}
	return result;
}

function verifySpec(groups: Record<string, unknown>, spec: OwnedHookSpec): string | null {
	if (!Object.hasOwn(groups, spec.groupKey)) return `${spec.label} group ${spec.groupKey} is missing`;
	if (!isDeepStrictEqual(groups[spec.groupKey], spec.group)) return `${spec.label} group ${spec.groupKey} is malformed or does not match this instance`;
	let script: string;
	try {
		script = fs.readFileSync(spec.scriptPath, "utf8");
	} catch {
		return `${spec.label} handler ${spec.scriptPath} is missing or unreadable`;
	}
	if (script !== spec.scriptSource) return `${spec.label} handler ${spec.scriptPath} does not match this instance`;
	return null;
}
