// Engine config: narrowing, defaults, env precedence (plan §9.5). The engine
// key predates 1.3.2 (sqlite era): stale values must fall back to the tested
// default, never poison the config.

import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, saveConfig } from "../src/config.js";

function tmpConfig(): string {
	return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "agy-acp-cfg-")), "config.json");
}
function rm(p: string): void {
	fs.rmSync(path.dirname(p), { recursive: true, force: true });
}

test("engine defaults to stream-json (ACP is opt-in)", () => {
	const p = tmpConfig();
	try {
		const c = loadConfig(p);
		assert.equal(c.engine, "stream-json");
		assert.equal(c.acp.bin, "");
	} finally {
		rm(p);
	}
});

test("engine switches to acp and round-trips", () => {
	const p = tmpConfig();
	try {
		saveConfig({ engine: "acp" }, p);
		assert.equal(loadConfig(p).engine, "acp");
		// Unrelated saves never clobber the engine choice.
		saveConfig({ mode: "plan" }, p);
		assert.equal(loadConfig(p).engine, "acp");
	} finally {
		rm(p);
	}
});

test("stale/garbage engine values fall back to stream-json", () => {
	const p = tmpConfig();
	try {
		saveConfig({ engine: "acp" }, p);
		const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
		raw.engine = "sqlite"; // pre-1.3.2 value
		fs.writeFileSync(p, JSON.stringify(raw));
		assert.equal(loadConfig(p).engine, "stream-json");
		raw.engine = 42;
		fs.writeFileSync(p, JSON.stringify(raw));
		assert.equal(loadConfig(p).engine, "stream-json");
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

test("AGY_ACP_BIN env overrides acp.bin", () => {
	const p = tmpConfig();
	const prev = process.env.AGY_ACP_BIN;
	process.env.AGY_ACP_BIN = "/opt/agy-acp/server.par";
	try {
		assert.equal(loadConfig(p).acp.bin, "/opt/agy-acp/server.par");
	} finally {
		if (prev === undefined) delete process.env.AGY_ACP_BIN;
		else process.env.AGY_ACP_BIN = prev;
		rm(p);
	}
});

test("acp.bin persists through saveConfig", () => {
	const p = tmpConfig();
	try {
		saveConfig({ acp: { bin: "~/.local/opt/agy-acp/current/agy_acp_server.par", usageEstimate: "estimate" } }, p);
		assert.equal(loadConfig(p).acp.bin, "~/.local/opt/agy-acp/current/agy_acp_server.par");
		saveConfig({ digest: true }, p);
		assert.equal(loadConfig(p).acp.bin, "~/.local/opt/agy-acp/current/agy_acp_server.par");
		assert.equal(loadConfig(p).digest, true);
	} finally {
		rm(p);
	}
});

test("usageEstimate defaults to estimate; unknown values fall back", () => {
	const p = tmpConfig();
	try {
		assert.equal(loadConfig(p).acp.usageEstimate, "estimate");
		saveConfig({ acp: { bin: "", usageEstimate: "direct" } }, p);
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
