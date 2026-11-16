// Engine config: narrowing, defaults, env precedence (plan §9.5). The engine
// key predates 1.3.2 (sqlite era): stale values must fall back to the tested
// default, never poison the config.

import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, removeLegacyAcpBin, saveConfig } from "../src/config.js";

function tmpConfig(): string {
	return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "agy-acp-cfg-")), "config.json");
}
function rm(p: string): void {
	fs.rmSync(path.dirname(p), { recursive: true, force: true });
}

test("engine defaults to acp", () => {
	const p = tmpConfig();
	try {
		const c = loadConfig(p);
		assert.equal(c.engine, "acp");
		assert.equal("bin" in c.acp, false);
	} finally {
		rm(p);
	}
});

test("engine switches to stream-json and round-trips", () => {
	const p = tmpConfig();
	try {
		saveConfig({ engine: "stream-json" }, p);
		assert.equal(loadConfig(p).engine, "stream-json");
		// Unrelated saves never clobber the engine choice.
		saveConfig({ mode: "plan" }, p);
		assert.equal(loadConfig(p).engine, "stream-json");
	} finally {
		rm(p);
	}
});

test("stale/garbage engine values fall back to acp", () => {
	const p = tmpConfig();
	try {
		saveConfig({ engine: "stream-json" }, p);
		const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
		raw.engine = "sqlite"; // pre-1.3.2 value
		fs.writeFileSync(p, JSON.stringify(raw));
		assert.equal(loadConfig(p).engine, "acp");
		raw.engine = 42;
		fs.writeFileSync(p, JSON.stringify(raw));
		assert.equal(loadConfig(p).engine, "acp");
	} finally {
		rm(p);
	}
});

test("AGY_ENGINE env overrides the file", () => {
	const p = tmpConfig();
	const prev = process.env.AGY_ENGINE;
	process.env.AGY_ENGINE = "acp";
	try {
		assert.equal(loadConfig(p).engine, "acp");
		process.env.AGY_ENGINE = "stream-json";
		assert.equal(loadConfig(p).engine, "stream-json");
	} finally {
		if (prev === undefined) delete process.env.AGY_ENGINE;
		else process.env.AGY_ENGINE = prev;
		rm(p);
	}
});

test("escalateLongTools: junk file shapes fall back to empty, strings and env still parse (issue #6)", () => {
	const p = tmpConfig();
	const prevEnv = process.env.AGY_ESCALATE_LONG_TOOLS;
	delete process.env.AGY_ESCALATE_LONG_TOOLS;
	try {
		// Non-array, non-string junk must not throw the per-call loadConfig.
		fs.writeFileSync(p, JSON.stringify({ escalateLongTools: 42 }));
		assert.deepEqual(loadConfig(p).escalateLongTools, []);
		// Non-string elements are dropped; strings are trimmed.
		fs.writeFileSync(p, JSON.stringify({ escalateLongTools: [" mem_search ", 1, null, "agent_x", ""] }));
		assert.deepEqual(loadConfig(p).escalateLongTools, ["mem_search", "agent_x"]);
		// Env string still wins over the file.
		process.env.AGY_ESCALATE_LONG_TOOLS = " a ,, b ";
		assert.deepEqual(loadConfig(p).escalateLongTools, ["a", "b"]);
	} finally {
		if (prevEnv === undefined) delete process.env.AGY_ESCALATE_LONG_TOOLS;
		else process.env.AGY_ESCALATE_LONG_TOOLS = prevEnv;
		rm(p);
	}
});

test("retired acp.bin is ignored and stripped on load and save", () => {
 const p = tmpConfig();
 const prev = process.env.AGY_ACP_BIN;
 process.env.AGY_ACP_BIN = "/retired/server";
 try {
  fs.writeFileSync(p, JSON.stringify({ acp: { bin: "/old/server", usageEstimate: "direct" }, custom: 42 }));
  assert.deepEqual(loadConfig(p).acp, { usageEstimate: "direct" });
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal("bin" in raw.acp, false);
  assert.equal(raw.custom, 42);
  saveConfig({ acp: { bin: "/retired/patch", usageEstimate: "off" } } as any, p);
  assert.deepEqual(JSON.parse(fs.readFileSync(p, "utf8")).acp, { usageEstimate: "off" });
 } finally {
  if (prev === undefined) delete process.env.AGY_ACP_BIN; else process.env.AGY_ACP_BIN = prev;
  rm(p);
 }
});

test("usageEstimate defaults to estimate; unknown values fall back", () => {
	const p = tmpConfig();
	try {
		assert.equal(loadConfig(p).acp.usageEstimate, "estimate");
		saveConfig({ acp: { usageEstimate: "direct" } }, p);
		assert.equal(loadConfig(p).acp.usageEstimate, "direct");
		const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
		const acpRaw = raw.acp as Record<string, unknown>;
		acpRaw.usageEstimate = "bogus";
		fs.writeFileSync(p, JSON.stringify(raw));
		assert.equal(loadConfig(p).acp.usageEstimate, "estimate");
	} finally {
		rm(p);
	}
});

test("AGY_USAGE_ESTIMATE env overrides acp.usageEstimate", () => {
	const p = tmpConfig();
	const prev = process.env.AGY_USAGE_ESTIMATE;
	process.env.AGY_USAGE_ESTIMATE = "off";
	try {
		assert.equal(loadConfig(p).acp.usageEstimate, "off");
		process.env.AGY_USAGE_ESTIMATE = "nonsense";
		assert.equal(loadConfig(p).acp.usageEstimate, "estimate");
	} finally {
		if (prev === undefined) delete process.env.AGY_USAGE_ESTIMATE;
		else process.env.AGY_USAGE_ESTIMATE = prev;
		rm(p);
	}
});

test("legacy acp.permissions key is ignored on load and dropped on save", () => {
	const p = tmpConfig();
	try {
		fs.writeFileSync(
			p,
			JSON.stringify({ acp: { bin: "/bin/test", permissions: "auto", usageEstimate: "estimate" } }),
		);
		const c = loadConfig(p);
		assert.equal("permissions" in c.acp, false);
		saveConfig({ digest: true }, p);
		const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
		const acpRaw = raw.acp as Record<string, unknown>;
		assert.equal("permissions" in acpRaw, false);
	} finally {
		rm(p);
	}
});


test("escalateLongTools: strings, cap, empty env and raw-file persistence", () => {
	const p = tmpConfig();
	const prev = process.env.AGY_ESCALATE_LONG_TOOLS;
	delete process.env.AGY_ESCALATE_LONG_TOOLS;
	try {
		fs.writeFileSync(p, JSON.stringify({ escalateLongTools: "slow_one, slow_two" }));
		assert.deepEqual(loadConfig(p).escalateLongTools, ["slow_one", "slow_two"]);
		const names = Array.from({ length: 40 }, (_, i) => "tool_" + i);
		fs.writeFileSync(p, JSON.stringify({ escalateLongTools: names }));
		assert.equal(loadConfig(p).escalateLongTools?.length, 32);
		saveConfig({ escalateLongTools: ["custom"] }, p);
		process.env.AGY_ESCALATE_LONG_TOOLS = "override";
		saveConfig({ digest: true }, p);
		assert.deepEqual(loadConfig(p).escalateLongTools, ["override"]);
		assert.deepEqual(JSON.parse(fs.readFileSync(p, "utf8")).escalateLongTools, ["custom"]);
		process.env.AGY_ESCALATE_LONG_TOOLS = "";
		assert.deepEqual(loadConfig(p).escalateLongTools, []);
		delete process.env.AGY_ESCALATE_LONG_TOOLS;
		assert.deepEqual(loadConfig(p).escalateLongTools, ["custom"]);
	} finally {
		if (prev === undefined) delete process.env.AGY_ESCALATE_LONG_TOOLS; else process.env.AGY_ESCALATE_LONG_TOOLS = prev;
		rm(p);
	}
});

test("removeLegacyAcpBin strips the retired key and keeps the rest of the file", () => {
	const p = tmpConfig();
	try {
		fs.writeFileSync(p, JSON.stringify({
			engine: "acp",
			acp: { bin: "", permissions: "auto", usageEstimate: "estimate" },
			mode: "accept-edits",
			patchCleanupNotified: false,
		}));
		assert.equal(removeLegacyAcpBin(p), true);
		const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
		assert.deepEqual(raw.acp, { permissions: "auto", usageEstimate: "estimate" });
		assert.equal(raw.engine, "acp");
		assert.equal(raw.mode, "accept-edits");
		assert.equal(raw.patchCleanupNotified, false);
		assert.equal("digest" in raw, false, "raw passthrough: no defaults baked in");
		assert.equal(removeLegacyAcpBin(p), false);
	} finally {
		rm(p);
	}
});

test("removeLegacyAcpBin leaves files without a bin key untouched", () => {
	const p = tmpConfig();
	try {
		fs.writeFileSync(p, JSON.stringify({ acp: { usageEstimate: "estimate" }, engine: "stream-json" }));
		const before = fs.readFileSync(p, "utf8");
		assert.equal(removeLegacyAcpBin(p), false);
		assert.equal(fs.readFileSync(p, "utf8"), before);
		fs.writeFileSync(p, "{ not json");
		assert.equal(removeLegacyAcpBin(p), false);
		assert.equal(fs.readFileSync(p, "utf8"), "{ not json");
	} finally {
		rm(p);
	}
});

test("removeLegacyAcpBin writes through a symlinked config instead of replacing it", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-acp-link-"));
	const real = path.join(dir, "real.json");
	const link = path.join(dir, "config.json");
	try {
		fs.writeFileSync(real, JSON.stringify({ acp: { bin: "/opt/old-server.par", usageEstimate: "estimate" } }));
		fs.symlinkSync(real, link);
		assert.equal(removeLegacyAcpBin(link), true);
		assert.equal(fs.lstatSync(link).isSymbolicLink(), true, "the symlink itself must survive");
		assert.deepEqual(JSON.parse(fs.readFileSync(real, "utf8")), { acp: { usageEstimate: "estimate" } });
		assert.equal(removeLegacyAcpBin(link), false);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});
