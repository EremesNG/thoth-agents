// Pins for the approval-gate shadow factory (docs/TODO.md 2.8 V1).
// The shadow tool is the load-bearing piece of the approval gate: marker
// calls must NEVER reach the real builtin, non-marker calls must behave
// exactly like the builtin, and denials must throw (pi converts thrown
// errors into error tool results carrying the message).
//
// Run: npm test

import assert from "node:assert/strict";
import { test } from "vitest";
import {
	GATE_MARKER,
	MARKER_FIELDS,
	NATIVE_APPROVAL_TOOL,
	createNativeApprovalBase,
	createShadowTool,
	describeApprovalTarget,
	mapNativeToShadow,
	stripMarkerFields,
	withGateMarkerSchema,
	type AnyToolDefinition,
	type GateDecision,
} from "../src/approval-gate.js";

const ctxStub = { hasUI: false } as import("@earendil-works/pi-coding-agent").ExtensionToolContext;

interface ExecuteLog {
	params: Record<string, unknown>;
	toolCallId: string;
}

function baseBashTool() {
	const log: ExecuteLog[] = [];
	const base: AnyToolDefinition = {
		name: "bash",
		label: "Bash",
		description: "runs a shell command",
		parameters: {
			type: "object",
			properties: { command: { type: "string" }, timeout: { type: "number" } },
			required: ["command"],
		},
		execute: async (toolCallId, params) => {
			log.push({ toolCallId, params: params as Record<string, unknown> });
			return {
				content: [{ type: "text", text: `RAN:${(params as { command: string }).command}` }],
				details: { ran: true },
			};
		},
	};
	return { base, log };
}

const allow = (): GateDecision => ({ allow: true });
const denyWith = (reason: string) => (): GateDecision => ({ allow: false, reason });

/** Registry-style ticket verifier for pins: only "live" is parked. */
const verifyLive = (ticket: string): boolean => ticket === "live";

/** Marker params for a parked call: marker + ticket + native name. */
const parked = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
	[GATE_MARKER]: true,
	__agyTicket: "live",
	__agyTool: "run_command",
	...extra,
});

test("shadow keeps identity and injects marker fields into the schema", () => {
	const { base } = baseBashTool();
	const shadow = createShadowTool(base, allow);
	assert.equal(shadow.name, "bash");
	assert.equal(shadow.label, "Bash");
	assert.equal(shadow.description, "runs a shell command");
	const props = (shadow.parameters as { properties: Record<string, unknown> }).properties;
	assert.ok(props.command, "command prop preserved");
	for (const field of MARKER_FIELDS) assert.ok(props[field], `marker field ${field} present`);
	// base schema untouched
	const baseProps = (base.parameters as { properties: Record<string, unknown> }).properties;
	assert.equal(baseProps[GATE_MARKER], undefined);
});

test("marker call with allow: synthetic result, builtin never executes", async () => {
	const { base, log } = baseBashTool();
	let policyCalls = 0;
	const shadow = createShadowTool(
		base,
		(call) => {
			policyCalls += 1;
			assert.equal(call.tool, "run_command");
			return { allow: true };
		},
		{ verifyTicket: verifyLive },
	);
	const result = await shadow.execute(
		"t1",
		parked({ command: "npm test", cwd: "/w" }),
		undefined,
		undefined,
		ctxStub,
	);
	assert.equal(policyCalls, 1);
	assert.equal(log.length, 0, "builtin must not run for marker calls");
	const text = (result.content as Array<{ text?: string }>)[0]?.text ?? "";
	assert.match(text, /Approved by approval gate: run_command/);
	assert.match(text, /No local execution/);
});

test("marker call with deny: throws with the reason, builtin never executes", async () => {
	const { base, log } = baseBashTool();
	const shadow = createShadowTool(base, denyWith("rm is not allowed"), { verifyTicket: verifyLive });
	await assert.rejects(
		shadow.execute("t2", parked({ command: "rm -rf /" }), undefined, undefined, ctxStub),
		/rm is not allowed/,
	);
	assert.equal(log.length, 0);
});

test("policy throw fails closed: throws, builtin never executes", async () => {
	const { base, log } = baseBashTool();
	const shadow = createShadowTool(
		base,
		() => {
			throw new Error("policy exploded");
		},
		{ verifyTicket: verifyLive },
	);
	await assert.rejects(
		shadow.execute("t3", parked({ command: "ls" }), undefined, undefined, ctxStub),
		/approval gate policy failed: policy exploded/,
	);
	assert.equal(log.length, 0);
});

test("pre-aborted signal throws without consulting the policy", async () => {
	const { base, log } = baseBashTool();
	let policyCalls = 0;
	const shadow = createShadowTool(
		base,
		() => {
			policyCalls += 1;
			return allow();
		},
		{ verifyTicket: verifyLive },
	);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		shadow.execute("t4", parked({ command: "ls" }), controller.signal, undefined, ctxStub),
		/aborted before a decision/,
	);
	assert.equal(policyCalls, 0);
	assert.equal(log.length, 0);
});

test("forged marker without a ticket throws before the policy runs", async () => {
	const { base, log } = baseBashTool();
	let policyCalls = 0;
	const shadow = createShadowTool(
		base,
		() => {
			policyCalls += 1;
			return allow();
		},
		{ verifyTicket: verifyLive },
	);
	await assert.rejects(
		shadow.execute("t10", { command: "ls", [GATE_MARKER]: true, __agyTool: "run_command" }, undefined, undefined, ctxStub),
		/unrecognized or stale approval ticket/,
	);
	assert.equal(policyCalls, 0, "policy must never see a forged call");
	assert.equal(log.length, 0);
});

test("marker with a stale ticket (not in the registry) denies even under allow policy", async () => {
	const { base, log } = baseBashTool();
	const shadow = createShadowTool(base, allow, { verifyTicket: verifyLive });
	await assert.rejects(
		shadow.execute("t11", parked({ command: "ls", __agyTicket: "expired" }), undefined, undefined, ctxStub),
		/unrecognized or stale approval ticket/,
	);
	assert.equal(log.length, 0);
});

test("gate branch keys on the marker value, not on other __agy fields", async () => {
	const { base, log } = baseBashTool();
	const shadow = createShadowTool(base, allow, { verifyTicket: verifyLive });
	const result = await shadow.execute(
		"t5",
		parked({ command: "echo hi" }),
		undefined,
		undefined,
		ctxStub,
	);
	// marker true -> gate path (approved here), never delegation
	assert.equal(log.length, 0);
	assert.ok((result.content as Array<{ text?: string }>)[0]?.text?.includes("Approved"));
});

test("non-marker call delegates verbatim to the builtin", async () => {
	const { base, log } = baseBashTool();
	const shadow = createShadowTool(base, denyWith("no"));
	const result = await shadow.execute("t6", { command: "echo hi" }, undefined, undefined, ctxStub);
	assert.equal(log.length, 1);
	assert.deepEqual(log[0].params, { command: "echo hi" }, "builtin receives clean params");
	assert.equal((result.content as Array<{ text?: string }>)[0]?.text, "RAN:echo hi");
});

test("abort while the policy is pending unblocks execute with a throw", async () => {
	const { base, log } = baseBashTool();
	const controller = new AbortController();
	const shadow = createShadowTool(
		base,
		() => {
			controller.abort();
			return allow();
		},
		{ verifyTicket: verifyLive },
	);
	await assert.rejects(
		shadow.execute("t8", parked({ command: "ls" }), controller.signal, undefined, ctxStub),
		/aborted before a decision/,
	);
	assert.equal(log.length, 0);
});


test("abort while the policy is still pending (async policy) unblocks execute", async () => {
	const { base, log } = baseBashTool();
	const controller = new AbortController();
	const shadow = createShadowTool(
		base,
		async () => {
			await new Promise((r) => setTimeout(r, 250));
			return allow();
		},
		{ verifyTicket: verifyLive },
	);
	setTimeout(() => controller.abort(), 20);
	await assert.rejects(
		shadow.execute("t9", parked({ command: "ls" }), controller.signal, undefined, ctxStub),
		/aborted before a decision/,
	);
	assert.equal(log.length, 0);
});


test("deny without reason falls back to a generic message naming the tool", async () => {
	const { base } = baseBashTool();
	const shadow = createShadowTool(base, () => ({ allow: false }), { verifyTicket: verifyLive });
	await assert.rejects(
		shadow.execute("t7", parked({ command: "ls" }), undefined, undefined, ctxStub),
		/blocked by approval gate \(run_command\)/,
	);
});

test("stripMarkerFields removes exactly the marker fields", () => {
	const stripped = stripMarkerFields({
		command: "x",
		[GATE_MARKER]: true,
		__agyTicket: "t",
		__agyTool: "run_command",
	});
	assert.deepEqual(stripped, { command: "x" });
});

test("withGateMarkerSchema does not mutate the base schema object", () => {
	const { base } = baseBashTool();
	const before = JSON.stringify(base.parameters);
	withGateMarkerSchema(base.parameters);
	assert.equal(JSON.stringify(base.parameters), before);
});

// Absolute paths are asserted on both path flavors via the explicit platform
// parameter, so these pins do not depend on the host OS.
const POSIX = "linux" as const;
const WIN = "win32" as const;

test("mapNativeToShadow covers the legacy field shapes (absolute targets)", () => {
	// Live-captured shape (F1):
	assert.deepEqual(mapNativeToShadow("create_file", { TargetFile: "/w/a.txt", CodeContent: "hi", Description: "d", Overwrite: true }, POSIX), {
		shadow: "write",
		input: { path: "/w/a.txt", content: "hi" },
	});
	assert.deepEqual(mapNativeToShadow("write_to_file", { TargetFile: "/w/b.txt", CodeContent: "x" }, POSIX), {
		shadow: "write",
		input: { path: "/w/b.txt", content: "x" },
	});
	assert.deepEqual(mapNativeToShadow("run_command", { CommandLine: "npm test", Cwd: "/w" }, POSIX), {
		shadow: "bash",
		input: { command: "npm test", cwd: "/w" },
	});
	assert.deepEqual(mapNativeToShadow("run_command", { CommandLine: "ls" }, POSIX), {
		shadow: "bash",
		input: { command: "ls" },
	});
	assert.deepEqual(
		mapNativeToShadow("replace_file_content", { TargetFile: "/w/c.txt", SearchText: "a", ReplacementContent: "b" }, POSIX),
		{ shadow: "edit", input: { path: "/w/c.txt", edits: [{ oldText: "a", newText: "b" }] } },
	);
	assert.deepEqual(
		mapNativeToShadow("multi_replace_file_content", {
			TargetFile: "/w/d.txt",
			ReplacementChunks: [{ SearchText: "a", ReplacementContent: "b" }, { SearchText: "c", ReplacementContent: "d" }],
		}, POSIX),
		{ shadow: "edit", input: { path: "/w/d.txt", edits: [{ oldText: "a", newText: "b" }, { oldText: "c", newText: "d" }] } },
	);
	assert.deepEqual(mapNativeToShadow("edit_file", { TargetFile: "/w/e.txt", ReplacementContent: "z" }, POSIX), {
		shadow: "edit",
		input: { path: "/w/e.txt", edits: [{ oldText: "", newText: "z" }] },
	});
});

test("mapNativeToShadow recognizes the agy 1.5.11 Path/Content and Path/Target/Replacement shapes", () => {
	assert.deepEqual(mapNativeToShadow("write_file", { Path: "/w/new.txt", Content: "hello" }, POSIX), {
		shadow: "write",
		input: { path: "/w/new.txt", content: "hello" },
	});
	assert.deepEqual(mapNativeToShadow("replace_file_content", { Path: "/w/f.txt", Target: "old", Replacement: "new" }, POSIX), {
		shadow: "edit",
		input: { path: "/w/f.txt", edits: [{ oldText: "old", newText: "new" }] },
	});
	assert.deepEqual(
		mapNativeToShadow("multi_replace_file_content", {
			Path: "/w/g.txt",
			ReplacementChunks: [{ Target: "a", Replacement: "b" }],
		}, POSIX),
		{ shadow: "edit", input: { path: "/w/g.txt", edits: [{ oldText: "a", newText: "b" }] } },
	);
	assert.deepEqual(mapNativeToShadow("write_file", { Path: "C:\\w\\n.txt", Content: "x" }, WIN), {
		shadow: "write",
		input: { path: "C:\\w\\n.txt", content: "x" },
	});
});

test.each([
	["relative path", "write_file", { Path: "rel/x.txt", Content: "x" }],
	["dot-relative path", "write_file", { Path: "./x.txt", Content: "x" }],
	["missing path", "write_file", { Content: "x" }],
	["blank path", "write_file", { Path: "   ", Content: "x" }],
	["numeric path", "write_file", { Path: 42, Content: "x" }],
	["conflicting path fields", "write_file", { Path: "/w/a", TargetFile: "/w/b", Content: "x" }],
	["legacy relative TargetFile", "edit_file", { TargetFile: "src/a.ts", SearchText: "a", ReplacementContent: "b" }],
	["empty multi-edit", "multi_replace_file_content", { Path: "/w/a", ReplacementChunks: [] }],
	["all-blank multi-edit chunks", "multi_replace_file_content", { Path: "/w/a", ReplacementChunks: [{}, { Target: "", Replacement: "" }] }],
])("mapNativeToShadow denies a known write/edit tool with %s (never a guessed path)", (_label, tool, args) => {
	const mapped = mapNativeToShadow(tool, args as Record<string, unknown>, POSIX);
	assert.ok("deny" in mapped, `expected a denial, got ${JSON.stringify(mapped)}`);
});

test("mapNativeToShadow treats drive-relative and rooted-without-drive Windows paths as relative", () => {
	for (const p of ["C:foo.txt", "\\foo.txt", "/foo.txt", "foo.txt"]) {
		assert.ok("deny" in mapNativeToShadow("write_file", { Path: p, Content: "x" }, WIN), p);
	}
	assert.ok(!("deny" in mapNativeToShadow("write_file", { Path: "\\\\server\\share\\f.txt", Content: "x" }, WIN)), "UNC is absolute");
});

test("mapNativeToShadow maps the observed live ACP write_file/edit_file shapes with absolute-path approval", () => {
	assert.deepEqual(mapNativeToShadow("write_file", { Content: "hi", Overwrite: true, Path: "/w/new.txt" }, POSIX), {
		shadow: "write",
		input: { path: "/w/new.txt", content: "hi" },
	});
	assert.deepEqual(mapNativeToShadow("edit_file", { Path: "/w/f.txt", Target: "old", Replacement: "new" }, POSIX), {
		shadow: "edit",
		input: { path: "/w/f.txt", edits: [{ oldText: "old", newText: "new" }] },
	});
	assert.ok("deny" in mapNativeToShadow("write_file", { Content: "hi", Overwrite: true, Path: "rel.txt" }, POSIX));
	assert.ok("deny" in mapNativeToShadow("edit_file", { Path: "rel.txt", Target: "a", Replacement: "b" }, POSIX));
});

test("mapNativeToShadow maps unknown tools to the raw-arguments shadow with no fabricated target", () => {
	for (const name of ["sed_file", "notebook_edit", "totally_unknown_future_tool"]) {
		const args = { Path: "/w/n.ipynb", Cell: 3 };
		assert.deepEqual(mapNativeToShadow(name, args, POSIX), {
			shadow: NATIVE_APPROVAL_TOOL,
			input: { tool: name, arguments: args },
		});
	}
	assert.deepEqual(mapNativeToShadow("run_command", {} as Record<string, unknown>, POSIX), {
		shadow: "bash",
		input: { command: "" },
	});
});

test("the unknown-target approval shadow carries raw tool name and arguments and never executes", async () => {
	const base = createNativeApprovalBase();
	assert.equal(base.name, NATIVE_APPROVAL_TOOL);
	const props = (base.parameters as { properties: Record<string, unknown> }).properties;
	assert.deepEqual(Object.keys(props).sort(), ["arguments", "tool"]);
	const shadow = createShadowTool(base, () => ({ allow: true }), { verifyTicket: () => true });
	assert.ok(Object.keys((shadow.parameters as { properties: Record<string, unknown> }).properties).includes("__agyGate"));
	await assert.rejects(
		shadow.execute("c1", { tool: "sed_file", arguments: { Path: "/w/x" } }, undefined, undefined, ctxStub),
		/approval-only tool and never executes/,
	);
	const decided = await shadow.execute(
		"c2",
		{ tool: "sed_file", arguments: { Path: "/w/x" }, [GATE_MARKER]: true, __agyTicket: "t", __agyTool: "sed_file" },
		undefined, undefined, ctxStub,
	);
	assert.match(JSON.stringify(decided), /Approved by approval gate: sed_file/);
});

test.each([["server-only", String.raw`\\server`], ["server with trailing slash", "\\\\server\\"], ["forward-slash server-only", "//server"]])(
	"mapNativeToShadow denies an incomplete UNC target (%s)",
	(_label, p) => {
		assert.ok("deny" in mapNativeToShadow("write_file", { Path: p, Content: "x" }, WIN), p);
	},
);

test("mapNativeToShadow accepts a complete UNC share path", () => {
	for (const p of [String.raw`\\server\share`, String.raw`\\server\share\dir\f.txt`, "//server/share/f.txt"]) {
		assert.ok(!("deny" in mapNativeToShadow("write_file", { Path: p, Content: "x" }, WIN)), p);
	}
});

test("describeApprovalTarget shows the complete raw arguments of an unknown tool, never a silent cutoff", () => {
	const big = "x".repeat(5000) + "TAIL-MARKER";
	const what = describeApprovalTarget({ tool: "sed_file", arguments: { Path: "/w/a", Body: big } });
	assert.ok(what.includes("sed_file"));
	assert.ok(what.includes("TAIL-MARKER"), "tail of long arguments must be visible");
	assert.ok(what.includes(big));
});

test("describeApprovalTarget keeps command and path targets verbatim", () => {
	assert.equal(describeApprovalTarget({ command: "ls -la" }), "ls -la");
	assert.equal(describeApprovalTarget({ path: "/w/a" }), "/w/a");
});
