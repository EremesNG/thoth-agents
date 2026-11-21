// Approval-gate shadow tools (docs/TODO.md section 2.5, design v2).
//
// When the approval gate is active, the bridge re-registers pi's mutating
// builtins (bash, write, edit) as SHADOW tools (plus agy_native_approval for
// unknown native tools, carrying their raw name and arguments): same name, same schema plus
// internal __agy* marker fields. Two behaviors, keyed on the marker:
//
//   - marker absent: delegate to the captured real builtin. Normal pi
//     behavior (including the G9 path, where pi tools execute for real) is
//     untouched.
//   - marker present: the call is an approval round-trip for an agy NATIVE
//     tool. NEVER execute locally. Ask the policy for a decision; agy runs
//     the tool in its own loop either way.
//
// Decision mapping (consumed by the provider's /approval park):
//   resolve (success result)      -> {"decision":"allow"}
//   throw                         -> {"decision":"deny","reason": message}
// pi's tool executor converts thrown errors into error tool results with
// the message as text, matching how builtins report failures (write.js,
// edit-diff.js). A tool_call handler that blocks the shadow call upstream
// (any third-party permission extension) produces the same error result
// without execute() running, so both paths land on the same deny mapping.
//
// Run: npm test

import type {
	AgentToolResult,
	AgentToolUpdateCallback,
	ExtensionToolContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { isAbsoluteTargetPath } from "./native-tool-policy.js";

/** Marker flag: this shadow-tool call is an approval round-trip, not a real
 *  invocation. The bridge's provider sets it when composing the toolUse. */
export const GATE_MARKER = "__agyGate";

/** Internal context fields the provider may attach next to the marker.
 *  Stripped before delegating to the real builtin. */
export const MARKER_FIELDS = [GATE_MARKER, "__agyTicket", "__agyTool"] as const;

export type AnyToolDefinition = ToolDefinition<any, any, any>;

export interface GateDecision {
	allow: boolean;
	reason?: string;
}

/** Fallback policy: consulted only when NO extension blocked the shadow
 *  tool_call. Implementations map approvals.mode: ask -> ctx.ui.confirm
 *  (guarded by ctx.hasUI), allow -> {allow:true}, deny -> {allow:false}. */
export type GatePolicy = (call: {
	tool: string;
	params: Record<string, unknown>;
	ctx: unknown;
}) => Promise<GateDecision> | GateDecision;

/** Marker schemas injected into the shadow parameters. Optional, so the
 *  model's own calls stay valid; audited permission extensions match only
 *  their known fields (command/path) and ignore these. */
const MARKER_SCHEMAS: Record<string, unknown> = {
	[GATE_MARKER]: {
		type: "boolean",
		description:
			"Internal bridge approval marker. Never set this yourself; calls without local execution intent must not set it.",
	},
	__agyTicket: { type: "string" },
	__agyTool: { type: "string", description: "Native agy tool this approval round-trip is for." },
};

/** Clone a tool's parameter schema with the marker fields added as optional
 *  properties. Field-exact for everything the permission extensions match on
 *  (command, path, edits, ...). Does not mutate the base schema. */
export function withGateMarkerSchema(base: AnyToolDefinition["parameters"]): AnyToolDefinition["parameters"] {
	const src = base as { properties?: Record<string, unknown> };
	return { ...base, properties: { ...src.properties, ...MARKER_SCHEMAS } } as AnyToolDefinition["parameters"];
}

/** Copy of params without the internal marker fields, for delegation. */
export function stripMarkerFields(params: Record<string, unknown>): Record<string, unknown> {
	const out = { ...params };
	for (const field of MARKER_FIELDS) delete out[field];
	return out;
}

/** Name of the production Pi shadow for native tools with no known target
 *  shape. Its schema carries the raw tool name and arguments only. */
export const NATIVE_APPROVAL_TOOL = "agy_native_approval";

export interface ShadowMapping {
	shadow: "bash" | "write" | "edit" | typeof NATIVE_APPROVAL_TOOL;
	input: Record<string, unknown>;
}

/** The call cannot be approved against a trustworthy target: deny. */
export interface NativeDenial {
	deny: string;
}

/** Map an agy native tool call (hook stdin payload) onto the shadow surface.
 *  Argument names are runtime-attested: create_file is live-captured (F1), the
 *  write/edit pairs come from agy 1.5.11 PreToolUse captures (Path/Content and
 *  Path/Target/Replacement; upstream 62b2a20/b5aa839) with the older
 *  docs-attested names kept as fallbacks. A known write/edit tool is approved
 *  only against an ABSOLUTE target path taken verbatim from its arguments (the
 *  path agy will mutate); a relative, missing, conflicting or unresolvable
 *  target - or an edit carrying no change - is denied, never guessed. Unknown
 *  tools map to the raw-arguments approval shadow (no fabricated path or
 *  command). */
export function mapNativeToShadow(
	name: string,
	args: Record<string, unknown>,
	platform: NodeJS.Platform = process.platform,
): ShadowMapping | NativeDenial {
	const a = args ?? {};
	const str = (v: unknown): string => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
	const pick = (...vals: unknown[]): string => {
		for (const v of vals) {
			const s = str(v);
			if (s !== "") return s;
		}
		return "";
	};
	const target = (): string | NativeDenial => {
		const candidates = [a.Path, a.TargetFile].filter((v) => v !== undefined && v !== null && v !== "");
		const first = candidates[0];
		if (typeof first !== "string" || candidates.some((v) => v !== first)) {
			return { deny: `${name}: target path is missing, not a string or ambiguous; refusing to approve against a guessed path` };
		}
		if (!isAbsoluteTargetPath(first, platform)) {
			return { deny: `${name}: target path must be absolute (got ${JSON.stringify(first.slice(0, 200))}); refusing to approve against a guessed path` };
		}
		return first;
	};
	switch (name) {
		case "run_command": {
			const input: Record<string, unknown> = { command: str(a.CommandLine) };
			if (a.Cwd !== undefined && a.Cwd !== null && a.Cwd !== "") input.cwd = str(a.Cwd);
			return { shadow: "bash", input };
		}
		case "write_to_file":
		case "write_file":
		case "create_file": {
			const path = target();
			if (typeof path !== "string") return path;
			return { shadow: "write", input: { path, content: pick(a.Content, a.CodeContent) } };
		}
		case "replace_file_content":
		case "edit_file": {
			const path = target();
			if (typeof path !== "string") return path;
			return {
				shadow: "edit",
				input: {
					path,
					edits: [{ oldText: pick(a.Target, a.SearchText), newText: pick(a.Replacement, a.ReplacementContent) }],
				},
			};
		}
		case "multi_replace_file_content": {
			const path = target();
			if (typeof path !== "string") return path;
			const chunks = Array.isArray(a.ReplacementChunks) ? a.ReplacementChunks : [];
			const edits = chunks.map((c) => {
				const chunk = (c ?? {}) as Record<string, unknown>;
				return { oldText: pick(chunk.Target, chunk.SearchText), newText: pick(chunk.Replacement, chunk.ReplacementContent) };
			});
			if (edits.length === 0 || edits.every((e) => e.oldText === "" && e.newText === "")) {
				return { deny: `${name}: no resolvable edit chunks; refusing to approve an edit with no change information` };
			}
			return { shadow: "edit", input: { path, edits } };
		}
		default:
			return { shadow: NATIVE_APPROVAL_TOOL, input: { tool: name, arguments: a } };
	}
}

/** Confirmation body for a gated call. Unknown native tools show their raw
 *  name and COMPLETE serialized arguments: approval must never rest on a
 *  silently truncated view of what agy will run. */
export function describeApprovalTarget(params: Record<string, unknown>): string {
	if (typeof params.command === "string") return params.command;
	if (typeof params.path === "string") return params.path;
	if (typeof params.tool === "string") {
		// Compact JSON has no structural whitespace. Escape spaces too so every
		// run can be counted, and escape every non-ASCII UTF-16 code unit to
		// make bidi, zero-width and terminal control characters inert.
		return JSON.stringify({ tool: params.tool, arguments: params.arguments ?? null })
			.replace(/[^!-~]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
	}
	return JSON.stringify(stripMarkerFields(params));
}

/** Base definition behind the unknown-target approval shadow. Its schema
 *  carries the raw native tool name and arguments only; it can never execute
 *  anything (marker calls are decided by the policy, non-marker calls refuse),
 *  and its declaration is hidden from provider requests so no model is invited
 *  to call it. */
export function createNativeApprovalBase(): AnyToolDefinition {
	return {
		name: NATIVE_APPROVAL_TOOL,
		label: "Antigravity native approval",
		description: "Internal approval round-trip for an Antigravity native tool without a known target. Never call this yourself.",
		prepareLoadout: () => ({ hiddenDeclarations: [NATIVE_APPROVAL_TOOL] }),
		parameters: Type.Object({
			tool: Type.String({ description: "Raw native agy tool name awaiting approval." }),
			arguments: Type.Unknown({ description: "Raw native tool arguments, shown as reversible escaped JSON for approval." }),
		}),
		execute: async () => {
			throw new Error(`${NATIVE_APPROVAL_TOOL} is an approval-only tool and never executes.`);
		},
	} as unknown as AnyToolDefinition;
}

/** Options for the shadow factory. */
export interface ShadowOptions {
	/** Registry lookup for the park's ticket. When set, a marker call whose
	 *  __agyTicket is missing or unrecognized throws (deny) BEFORE the policy
	 *  runs: a model that sets __agyGate:true itself can then never produce a
	 *  fake-approved result, even under approvals.mode "allow". */
	verifyTicket?: (ticket: string) => boolean;
}

/** Build the shadow definition for one builtin. `base` MUST be a definition
 *  of the real builtin - the extension passes factory twins created with
 *  pi's public createBashToolDefinition/createWriteToolDefinition/
 *  createEditToolDefinition (pi.getAllTools() returns ToolInfo, which strips
 *  execute, so the live definition cannot be captured). */
export function createShadowTool(base: AnyToolDefinition, policy: GatePolicy, opts: ShadowOptions = {}): AnyToolDefinition {
	const execute = async (
		toolCallId: string,
		params: any,
		signal: AbortSignal | undefined,
		onUpdate: AgentToolUpdateCallback<any> | undefined,
		ctx: ExtensionToolContext,
	): Promise<AgentToolResult<unknown>> => {
		const p = (params ?? {}) as Record<string, unknown>;
		if (p[GATE_MARKER] !== true) {
			return base.execute(toolCallId, stripMarkerFields(p), signal, onUpdate, ctx);
		}
		const native = typeof p.__agyTool === "string" && p.__agyTool.length > 0 ? p.__agyTool : base.name;
		// Ticket binding (peer review 2026-09-07): only calls the provider parked
		// carry a live ticket. Anything else with the marker set was forged by
		// the model (or the park is gone); fail closed without consulting the
		// policy, so approvals.mode "allow" can never bless it either.
		const ticket = typeof p.__agyTicket === "string" ? p.__agyTicket : "";
		if (!ticket || !opts.verifyTicket?.(ticket)) {
			throw new Error(
				`approval gate: unrecognized or stale approval ticket; refusing to decide (${native}).`,
			);
		}
		if (signal?.aborted) {
			throw new Error(`approval gate aborted before a decision was reached (${native}).`);
		}
		let decision: GateDecision;
		// Race the policy against the abort signal: a cancelled turn must
		// unblock execute() instead of hanging on a human decision.
		const aborted = new Error(`approval gate aborted before a decision was reached (${native}).`);
		const abortp = new Promise<never>((_, reject) => {
			signal?.addEventListener("abort", () => reject(aborted), { once: true });
		});
		abortp.catch(() => {}); // late rejection must not become unhandled
		try {
			decision = await Promise.race([Promise.resolve(policy({ tool: native, params: p, ctx })), abortp]);
		} catch (err) {
			if (signal?.aborted) throw aborted;
			// Fail closed: a broken policy must never look like an approval.
			throw new Error(`approval gate policy failed: ${err instanceof Error ? err.message : String(err)}`);
		}
		if (signal?.aborted) {
			// Sync-abort inside the policy settles the policy promise BEFORE the
			// race starts, so the rejection loses the ordering tie. Re-check.
			throw aborted;
		}
		if (!decision.allow) {
			throw new Error(decision.reason || `blocked by approval gate (${native}).`);
		}
		return {
			content: [
				{
					type: "text",
					text: `Approved by approval gate: ${native}. No local execution happened; the tool runs in the Antigravity agent loop.`,
				},
			],
			details: { gate: "allow", native },
		};
	};
	return { ...base, parameters: withGateMarkerSchema(base.parameters), execute } as AnyToolDefinition;
}
