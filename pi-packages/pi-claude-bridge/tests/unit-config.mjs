import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { claudeCodeSettings, loadConfig } from "../src/config.js";

function withTempHome(fn) {
	const keys = ["HOME", "PI_CODING_AGENT_DIR", ...(process.platform === "win32" ? ["USERPROFILE"] : [])];
	const previous = new Map(keys.map((key) => [key, process.env[key]]));
	const home = mkdtempSync(join(tmpdir(), "claude-bridge-home-"));
	try {
		process.env.HOME = home;
		process.env.PI_CODING_AGENT_DIR = join(home, ".pi", "agent");
		if (process.platform === "win32") process.env.USERPROFILE = home;
		return fn(home);
	} finally {
		for (const [key, value] of previous) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		rmSync(home, { recursive: true, force: true });
	}
}

describe("claudeCodeSettings", () => {
	it("disables auto-memory by default", () => {
		assert.deepEqual(claudeCodeSettings(), { autoMemoryEnabled: false });
	});

	it("allows auto-memory to be enabled", () => {
		assert.deepEqual(claudeCodeSettings({ autoMemoryEnabled: true }), { autoMemoryEnabled: true });
	});
});

describe("loadConfig", () => {
	it("isolates the agent directory and restores environment overrides even on failure", () => {
		const keys = ["HOME", "USERPROFILE", "PI_CODING_AGENT_DIR"];
		const previous = keys.map((key) => process.env[key]);
		assert.throws(() => withTempHome((home) => {
			assert.equal(getAgentDir(), join(home, ".pi", "agent"));
			if (process.platform === "win32") assert.equal(process.env.USERPROFILE, home);
			throw new Error("fixture failure");
		}), /fixture failure/);
		assert.deepEqual(keys.map((key) => process.env[key]), previous);
	});

	it("never loads project provider settings", () => withTempHome(() => {
		const cwd = mkdtempSync(join(tmpdir(), "claude-bridge-project-"));
		const previousCwd = process.cwd();
		try {
			const configDir = join(cwd, CONFIG_DIR_NAME);
			mkdirSync(configDir, { recursive: true });
			writeFileSync(join(configDir, "claude-bridge.json"), JSON.stringify({
				provider: { plan: "max", pathToClaudeCodeExecutable: join(cwd, "evil") },
			}));

			process.chdir(cwd);
			assert.deepEqual(loadConfig(), {
				provider: {},
			});
		} finally {
			process.chdir(previousCwd);
			rmSync(cwd, { recursive: true, force: true });
		}
	}));

	it("resolves global config via PI_CODING_AGENT_DIR override, not hardcoded ~/.pi/agent", () => withTempHome(() => {
		const agentDir = mkdtempSync(join(tmpdir(), "claude-bridge-agent-"));
		const cwd = mkdtempSync(join(tmpdir(), "claude-bridge-project-"));
		const oldEnv = process.env.PI_CODING_AGENT_DIR;
		try {
			process.env.PI_CODING_AGENT_DIR = agentDir;
			writeFileSync(join(agentDir, "claude-bridge.json"), JSON.stringify({
				provider: { plan: "max" },
			}));

			assert.deepEqual(loadConfig(), {
				provider: { plan: "max" },
			});
		} finally {
			if (oldEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = oldEnv;
			rmSync(agentDir, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	}));
});
