// Pins for approval-gate hooks.json staging (docs/TODO.md 2.8) and the
// legacy workspace sweep (issue #5 isolation).
//
// Since the isolation fix, the gate group stages into the session-private
// per-pid bridge dir (the extra --add-dir only this session's agy gets).
// The private file is ours alone: plain atomic replace, no merge. The
// sweep removes gate groups 1.6.x left in SHARED workspace files when
// their owning session is dead; live and foreign groups stay.
//
// Run: npm test

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import {
	approvalHookFileName,
	buildGateGroup,
	gateGroupKey,
	gateHooksStaged,
	hookScriptSource,
	removeGateHooks,
	stagedTimeoutSeconds,
	stageGateHooks,
	sweepWorkspaceGateGroups,
} from "../src/approval-hook.js";
import { logsDir } from "../src/config.js";

function tmpDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "agy-stage-"));
}
const opts = {
	port: 47881,
	token: "secret-token",
	scriptPath: "/data/dir/approval-hook.mjs",
	parkBudgetMs: 480_000,
};

function hooksFile(dir: string): string {
	return path.join(dir, ".agents", "hooks.json");
}

function readJson(file: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

test("stages into the private dir: group shape, matcher, generous timeout", () => {
	const dir = tmpDir();
	const res = stageGateHooks(dir, opts);
	assert.equal(res.wrote, true);
	assert.equal(gateHooksStaged(dir), true);
	const parsed = readJson(hooksFile(dir));
	const group = parsed[gateGroupKey()] as {
		enabled: boolean;
		PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string; timeout: number }> }>;
	};
	assert.equal(group.enabled, true);
	const handler = group.PreToolUse[0].hooks[0];
	assert.match(group.PreToolUse[0].matcher, /create_file/);
	assert.match(group.PreToolUse[0].matcher, /run_command/);
	assert.equal(handler.command, 'node "/data/dir/approval-hook.mjs"');
	// V3: timeout must exceed the park budget (soft-pass on timeout)
	assert.ok(handler.timeout >= opts.parkBudgetMs / 1000);
	fs.rmSync(dir, { recursive: true, force: true });
});

test("staging owns the private file: stale content is replaced wholesale", () => {
	const dir = tmpDir();
	fs.mkdirSync(path.join(dir, ".agents"), { recursive: true });
	fs.writeFileSync(hooksFile(dir), JSON.stringify({ "stale-leftover": { enabled: true } }));
	const res = stageGateHooks(dir, opts);
	assert.equal(res.wrote, true);
	const parsed = readJson(hooksFile(dir));
	assert.deepEqual(Object.keys(parsed), [gateGroupKey()], "only our group remains");
	fs.rmSync(dir, { recursive: true, force: true });
});

test("idempotent restage: no write", () => {
	const dir = tmpDir();
	stageGateHooks(dir, opts);
	const before = fs.readFileSync(hooksFile(dir), "utf8");
	const res = stageGateHooks(dir, opts);
	assert.equal(res.wrote, false);
	assert.equal(res.reason, "already staged");
	assert.equal(fs.readFileSync(hooksFile(dir), "utf8"), before);
	fs.rmSync(dir, { recursive: true, force: true });
});

test("removeGateHooks deletes the private file and reports absence", () => {
	const dir = tmpDir();
	assert.equal(removeGateHooks(dir).reason, "no hooks.json");
	stageGateHooks(dir, opts);
	const res = removeGateHooks(dir);
	assert.equal(res.wrote, true);
	assert.equal(fs.existsSync(hooksFile(dir)), false);
	assert.equal(gateHooksStaged(dir), false);
	assert.equal(removeGateHooks(dir).reason, "no hooks.json");
	fs.rmSync(dir, { recursive: true, force: true });
});

// --- legacy workspace sweep (issue #5): 1.6.x staged gate groups into the
// SHARED workspace hooks.json, where standalone sessions load them --------

const U = "0b6f1c2e-1d3a-4c5b-8e7f-9a0b1c2d3e4f";
const deadPid = 4194000;
const liveOpts = { ...opts, scriptPath: path.join(logsDir(), approvalHookFileName(process.pid, U)) };
const deadOpts = { ...opts, scriptPath: path.join(logsDir(), approvalHookFileName(deadPid, U)) };
// git log -p --follow establishes UUID-suffixed .js scripts, not pid-only names.
const legacyDeadOpts = { ...opts, scriptPath: path.join(logsDir(), `approval-hook-${deadPid}-${U}.js`) };

function seedGroup(ws: string, key: string, groupOpts: typeof opts): void {
	const file = hooksFile(ws);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const current = fs.existsSync(file) ? readJson(file) : {};
	current[key] = buildGateGroup(groupOpts);
	fs.writeFileSync(file, JSON.stringify(current, null, 2) + "\n");
}

function readKeys(ws: string): string[] {
	return Object.keys(readJson(hooksFile(ws)));
}

test("sweep removes dead sessions' groups, keeps live ones", () => {
	const ws = tmpDir();
	seedGroup(ws, gateGroupKey(4194000), deadOpts); // pid dead -> sweep
	seedGroup(ws, gateGroupKey(process.pid), liveOpts); // current process alive -> keep
	seedGroup(ws, "user-linter", {
		...opts,
		scriptPath: "/data/dir/approval-hook-4194000.js",
	}); // foreign group, dead-looking -> never touched
	const swept = sweepWorkspaceGateGroups(ws);
	assert.equal(swept, 1);
	const keys = readKeys(ws);
	assert.equal(keys.includes(gateGroupKey(4194000)), false, "dead group swept");
	assert.ok(keys.includes(gateGroupKey(process.pid)), "live group kept");
	assert.ok(keys.includes("user-linter"), "foreign group kept");
	fs.rmSync(ws, { recursive: true, force: true });
});

test("sweep also removes stale pre-.mjs (legacy .js) dead groups", () => {
	const ws = tmpDir();
	seedGroup(ws, gateGroupKey(deadPid), legacyDeadOpts);
	assert.equal(sweepWorkspaceGateGroups(ws), 1);
	assert.equal(readKeys(ws).includes(gateGroupKey(deadPid)), false);
	fs.rmSync(ws, { recursive: true, force: true });
});

test("sweep keeps unattributable gate groups (foreign format)", () => {
	const ws = tmpDir();
	// gate-prefixed keys whose group carries no approval-hook-<pid>[-<instance>].mjs path
	// cannot be attributed to a session: never touched.
	fs.mkdirSync(path.join(ws, ".agents"), { recursive: true });
	fs.writeFileSync(
		hooksFile(ws),
		JSON.stringify({
			"pi-bridge-gate-weird": buildGateGroup({ ...opts, scriptPath: "/data/dir/approval-hook.mjs" }),
			"pi-bridge-gate-broken": { enabled: true },
		}),
	);
	const swept = sweepWorkspaceGateGroups(ws);
	assert.equal(swept, 0);
	assert.ok(readKeys(ws).includes("pi-bridge-gate-weird"), "unattributable group preserved");
	assert.ok(readKeys(ws).includes("pi-bridge-gate-broken"), "shapeless gate group preserved");
	fs.rmSync(ws, { recursive: true, force: true });
});

test("sweep never touches unparseable or missing files", () => {
	const ws = tmpDir();
	assert.equal(sweepWorkspaceGateGroups(ws), 0, "missing file is a no-op");
	fs.mkdirSync(path.join(ws, ".agents"), { recursive: true });
	fs.writeFileSync(hooksFile(ws), "{broken");
	assert.equal(sweepWorkspaceGateGroups(ws), 0);
	assert.equal(fs.readFileSync(hooksFile(ws), "utf8"), "{broken");
	fs.rmSync(ws, { recursive: true, force: true });
});

test("sweep with nothing to remove writes nothing", () => {
	const ws = tmpDir();
	seedGroup(ws, gateGroupKey(process.pid), liveOpts);
	seedGroup(ws, "user-linter", opts);
	const before = fs.readFileSync(hooksFile(ws), "utf8");
	assert.equal(sweepWorkspaceGateGroups(ws), 0);
	assert.equal(fs.readFileSync(hooksFile(ws), "utf8"), before);
	fs.rmSync(ws, { recursive: true, force: true });
});

// --- generated script + group shape (unchanged by the isolation fix) ------

test("hook script source: posts, polls, fails closed on deadline", () => {
	const src = hookScriptSource({ port: 47881, token: "secret-token", deadlineMs: 540_000 });
	assert.match(src, /\/approval/);
	assert.match(src, /x-bridge-token/);
	assert.equal(src.includes("secret-token"), true);
	assert.match(src, /decision: "deny", reason: "approval gate deadline exceeded"/);
	assert.match(src, /decision: "deny", reason: "approval gate unreachable/);
});

test("stagedTimeoutSeconds floors at 60s and adds margin", () => {
	assert.equal(stagedTimeoutSeconds(480_000), 540);
	assert.equal(stagedTimeoutSeconds(0), 60, "floor at 60s");
	assert.equal(stagedTimeoutSeconds(1_000), 61, "margin dominates above the floor");
});

test("buildGateGroup carries port/token only through the script path", () => {
	const group = buildGateGroup(opts);
	const handler = (group as { PreToolUse: Array<{ hooks: Array<{ command: string }> }> }).PreToolUse[0].hooks[0];
	assert.equal(handler.command, 'node "/data/dir/approval-hook.mjs"');
	assert.equal(handler.command.includes("secret-token"), false, "token stays in the script file, not hooks.json");
});

// --- exact reconstruction (key, path, and complete JSON value must agree) ---

function sweptFor(scriptPath: string): boolean {
	return sweptForGroup(buildGateGroup({ ...opts, scriptPath }));
}

test("sweep recognizes established script names only in the production logs dir", () => {
	assert.equal(sweptFor(deadOpts.scriptPath), true);
	assert.equal(sweptFor(legacyDeadOpts.scriptPath), true);
	assert.equal(sweptFor(path.join(logsDir(), "approval-hook-4194000.js")), false, "no production history for pid-only name");
	assert.equal(sweptFor(String.raw`C:\Users\me\data dir\approval-hook-4194000-${U}.mjs`), false, "foreign Windows directory");
});

test("sweep ignores look-alike hook names and hook-shaped directories", () => {
	const name = approvalHookFileName(deadPid, U);
	assert.equal(sweptFor(path.join(logsDir(), `not-${name}`)), false, "prefixed");
	assert.equal(sweptFor(`${deadOpts.scriptPath}.bak`), false, "suffixed .bak");
	assert.equal(sweptFor(deadOpts.scriptPath.replace(/\.mjs$/, ".json")), false, "suffixed .json");
	assert.equal(sweptFor(path.join(deadOpts.scriptPath, "other.mjs")), false, "directory name");
	assert.equal(sweptFor(String.raw`C:\x\approval-hook-4194000-${U}.mjs\other.mjs`), false, "windows directory name");
});

function sweptForCommand(command: string): boolean {
	const group = buildGateGroup(deadOpts) as Group;
	group.PreToolUse[0].hooks[0].command = command;
	return sweptForGroup(group);
}

test("sweep attributes only the exact command buildGateGroup writes", () => {
	const script = deadOpts.scriptPath;
	const quoted = JSON.stringify(script);
	const productionCommand = prodCommand(deadPid);
	assert.equal(sweptForCommand(productionCommand), true, "production command");
	for (const command of [
		`node foreign.mjs&&${script}`,
		`node --require=${script}`,
		`${productionCommand} && rm -rf x`,
		`node --require=${quoted}`,
		`node ${script}`,
		` ${productionCommand}`,
		`FOO=1 ${productionCommand}`,
		`node  ${quoted}`,
		`${productionCommand} `,
		`node ${JSON.stringify(`--require=${script}`)}`,
		`node ${JSON.stringify(`--import=${script}`)}`,
		`node ${JSON.stringify(approvalHookFileName(deadPid, U))}`,
		`node ${JSON.stringify(`./${approvalHookFileName(deadPid, U)}`)}`,
	]) {
		assert.equal(sweptForCommand(command), false, command);
	}
});

// --- strict attribution: grammar, JSON spelling, whole-group agreement ---

type Group = {
	enabled: boolean;
	PreToolUse: Array<{
		matcher: string;
		hooks: Array<{ type: string; command: string; timeout: number; [key: string]: unknown }>;
		[key: string]: unknown;
	}>;
	[key: string]: unknown;
};

function prodCommand(pid: number): string {
	return (buildGateGroup({ ...opts, scriptPath: path.join(logsDir(), approvalHookFileName(pid, U)) }) as Group).PreToolUse[0].hooks[0].command;
}

function sweptForCommands(commands: string[]): boolean {
	const group = buildGateGroup(deadOpts) as Group;
	group.PreToolUse[0].hooks = commands.map((command) => ({ ...group.PreToolUse[0].hooks[0], command }));
	return sweptForGroup(group);
}

test("sweep rejects non-production JSON spellings of the command", () => {
	const production = prodCommand(deadPid);
	assert.equal(sweptForCommand(production.replace("approval", String.raw`\u0061pproval`)), false);
	assert.equal(sweptForCommand(production.replace("-4194000", String.raw`\u002d4194000`)), false);
	const escapedSeparator = process.platform === "win32"
		? production.replace(String.raw`\\`, String.raw`\u005c`)
		: production.replace("/", String.raw`\/`);
	assert.equal(sweptForCommand(escapedSeparator), false);
});

test("sweep treats backslashes in POSIX paths as literal", () => {
	assert.equal(sweptForCommand(`node ${JSON.stringify(`/data/dir/not-\\${approvalHookFileName(deadPid, U)}`)}`), false);
});

test("sweep requires the single production handler, preserving added handlers", () => {
	const dead = prodCommand(4194000);
	assert.equal(sweptForCommands([dead]), true, "production group");
	assert.equal(sweptForCommands([dead, dead]), false, "production never writes duplicate handlers");
	assert.equal(sweptForCommands([dead, "echo keep-me"]), false, "foreign handler");
	assert.equal(sweptForCommands([dead, prodCommand(process.pid)]), false, "live-owner handler");
	assert.equal(sweptForCommands([dead, prodCommand(4194001)]), false, "different dead pids");
	assert.equal(sweptForCommands([]), false, "no handlers");
});

function sweptForGroup(group: unknown, key: string = gateGroupKey(deadPid)): boolean {
	const ws = tmpDir();
	try {
		const file = hooksFile(ws);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		const before = JSON.stringify({ [key]: group }, null, 2) + "\n";
		fs.writeFileSync(file, before);
		const swept = sweepWorkspaceGateGroups(ws);
		if (swept === 0) assert.equal(fs.readFileSync(file, "utf8"), before, "preserved byte-for-byte");
		else assert.deepEqual(readJson(file), {}, "only the confirmed dead group was removed");
		return swept === 1;
	} finally {
		fs.rmSync(ws, { recursive: true, force: true });
	}
}

const productionGroup = buildGateGroup(deadOpts) as Group;
const productionEntry = productionGroup.PreToolUse[0];
const productionHook = productionEntry.hooks[0];

test("sweep preserves a production-looking group with a foreign lifecycle hook", () => {
	const group = { ...productionGroup, PostToolUse: [{ hooks: [{ type: "command", command: "echo keep-me" }] }] };
	assert.equal(sweptForGroup(group), false);
});

const changedGroups: Array<[string, unknown]> = [
	["SessionStart hook", { ...productionGroup, SessionStart: [{ hooks: [{ type: "command", command: "echo keep-me" }] }] }],
	["PostToolUse dead-hook command", { ...productionGroup, PostToolUse: [productionEntry] }],
	["empty lifecycle event", { ...productionGroup, PostToolUse: [] }],
	["prompt handler", { ...productionGroup, PreToolUse: [{ ...productionEntry, hooks: [productionHook, { type: "prompt", prompt: "keep me" }] }] }],
	["prompt with a production-looking command", { ...productionGroup, PreToolUse: [{ ...productionEntry, hooks: [{ ...productionHook, type: "prompt", prompt: "keep me" }] }] }],
	["foreign matcher", { ...productionGroup, PreToolUse: [{ ...productionEntry, matcher: "*" }] }],
	["missing matcher", { ...productionGroup, PreToolUse: [{ hooks: [productionHook] }] }],
	["extra group key", { ...productionGroup, notes: "foreign" }],
	["extra entry key", { ...productionGroup, PreToolUse: [{ ...productionEntry, notes: "foreign" }] }],
	["extra handler key", { ...productionGroup, PreToolUse: [{ ...productionEntry, hooks: [{ ...productionHook, notes: "foreign" }] }] }],
	["disabled group", { ...productionGroup, enabled: false }],
	["missing enabled", { PreToolUse: [productionEntry] }],
	["different timeout", { ...productionGroup, PreToolUse: [{ ...productionEntry, hooks: [{ ...productionHook, timeout: 541 }] }] }],
	["string timeout", { ...productionGroup, PreToolUse: [{ ...productionEntry, hooks: [{ ...productionHook, timeout: "540" }] }] }],
	["missing timeout", { ...productionGroup, PreToolUse: [{ ...productionEntry, hooks: [{ type: "command", command: productionHook.command }] }] }],
	["malformed additional handler", { ...productionGroup, PreToolUse: [{ ...productionEntry, hooks: [productionHook, null] }] }],
	["null group", null],
	["array group", [productionGroup]],
	["string group", productionHook.command],
	["object instead of PreToolUse array", { ...productionGroup, PreToolUse: { 0: productionEntry } }],
	["object instead of hooks array", { ...productionGroup, PreToolUse: [{ ...productionEntry, hooks: { 0: productionHook } }] }],
];

test.each(changedGroups)("sweep preserves foreign or modified group: %s", (_label, group) => {
	assert.equal(sweptForGroup(group), false);
});

const extraEntries: Array<[string, unknown]> = [
	["null", null],
	["scalar", 7],
	["empty object", {}],
	["missing hooks", { matcher: "*" }],
	["malformed hooks", { hooks: "foreign" }],
	["empty hooks", { hooks: [] }],
	["malformed handler", { hooks: [{}] }],
	["prompt", { hooks: [{ type: "prompt", prompt: "keep me" }] }],
	["duplicate production entry", productionEntry],
];

test.each(extraEntries)("sweep preserves malformed/extra PreToolUse entry: %s", (_label, entry) => {
	assert.equal(sweptForGroup({ ...productionGroup, PreToolUse: [productionEntry, entry] }), false);
});

test.each([
	"pi-bridge-gate",
	"pi-bridge-gate-arbitrary",
	`pi-bridge-gate-arbitrary-${deadPid}`,
	`${gateGroupKey(deadPid)}-${U}`,
	gateGroupKey(deadPid + 1),
	gateGroupKey(process.pid),
	`${gateGroupKey(process.pid)}-${deadPid}`,
	`${gateGroupKey(deadPid)}\n`,
])("sweep preserves a dead-hook group under a key production never wrote: %s", (key) => {
	assert.equal(sweptForGroup(productionGroup, key), false);
});

test.each([
	"0", "00", "04194000", "4194305", "2147483648", "4294967296", "9007199254740991",
	"9007199254740992", "9007199254740993", "999999999999999999999999999999999999999", "Infinity",
	"-1", "+4194000", "4194000.0", "4.194e6",
])("sweep preserves invalid or noncanonical PID: %s", (pid) => {
	const group = buildGateGroup({ ...opts, scriptPath: path.join(logsDir(), `approval-hook-${pid}-${U}.mjs`) });
	assert.equal(sweptForGroup(group, `pi-bridge-gate-${pid}`), false, "key and script both noncanonical");
	assert.equal(sweptForGroup(group), false, "canonical dead key must not validate an ambiguous script PID");
});

test.each([
	"", "--", "-bad", "bad", U.toUpperCase(), U.replace("-4c5b-", "-1c5b-"),
	U.replace("-8e7f-", "-7e7f-"), U.replace("-8e7f-", "-ce7f-"), `${U}-`,
])("sweep preserves an instance suffix randomUUID never produces: %s", (instanceId) => {
	assert.equal(sweptFor(path.join(logsDir(), approvalHookFileName(deadPid, instanceId))), false);
});

const nonProductionPaths: Array<[string, string]> = [
	["foreign absolute directory", path.join(os.tmpdir(), approvalHookFileName(deadPid, U))],
	["trailing slash directory", `${deadOpts.scriptPath}/`],
	["trailing backslash directory", `${deadOpts.scriptPath}\\`],
	["Windows current-drive-rooted", String.raw`\x\approval-hook-${deadPid}-${U}.mjs`],
	["Windows drive root", String.raw`\approval-hook-${deadPid}-${U}.mjs`],
	["UNC share root", String.raw`\\server\approval-hook-${deadPid}-${U}.mjs`],
	["UNC file", String.raw`\\server\share\approval-hook-${deadPid}-${U}.mjs`],
	["device path", String.raw`\\.\C:\x\approval-hook-${deadPid}-${U}.mjs`],
	["extended device path", String.raw`\\?\C:\x\approval-hook-${deadPid}-${U}.mjs`],
	["extended UNC path", String.raw`\\?\UNC\server\share\approval-hook-${deadPid}-${U}.mjs`],
	["NUL in directory", path.join(`${logsDir()}\0`, approvalHookFileName(deadPid, U))],
	["NUL in file name", `${deadOpts.scriptPath}\0`],
	["un-normalized directory", `${logsDir()}${path.sep}..${path.sep}logs${path.sep}${approvalHookFileName(deadPid, U)}`],
];

test.each(nonProductionPaths)("sweep preserves non-production path: %s", (_label, scriptPath) => {
	assert.equal(sweptFor(scriptPath), false);
});

test("sweep compares complete JSON values independent of object key order", () => {
	const group = {
		PreToolUse: [{
			hooks: [{ timeout: 540, command: productionHook.command, type: "command" }],
			matcher: "create_file|write_to_file|replace_file_content|multi_replace_file_content|edit_file|run_command",
		}],
		enabled: true,
	};
	assert.equal(sweptForGroup(group), true);
});

test("sweep preserves a production live-pid group", () => {
	assert.equal(sweptForGroup(buildGateGroup(liveOpts), gateGroupKey(process.pid)), false);
});
