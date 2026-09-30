/**
 * Guards the guard: if tests/lib/setup.mjs stops being preloaded, unit tests
 * would silently start writing to the developer's real debug log instead of a
 * temp dir. That regression is otherwise invisible unless CLAUDE_BRIDGE_DEBUG=1.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

describe("test harness", () => {
	it("isolates global config before extension activation on every platform", () => {
		assert.ok(process.env.PI_CODING_AGENT_DIR, "setup must override the agent directory");
		assert.equal(getAgentDir(), join(dirname(process.env.CLAUDE_BRIDGE_DEBUG_PATH), "agent"));
		assert.notEqual(getAgentDir(), join(homedir(), ".pi", "agent"));
	});

	it("redirects the bridge debug log away from the real one", () => {
		const path = process.env.CLAUDE_BRIDGE_DEBUG_PATH;
		assert.ok(path, "CLAUDE_BRIDGE_DEBUG_PATH must be set — is tests/lib/setup.mjs still preloaded via --import?");
		// Compare against the production default specifically; a blanket "not under
		// $HOME" check would misfire for anyone whose TMPDIR lives inside their home.
		assert.notEqual(
			path,
			join(getAgentDir(), "claude-bridge.log"),
			"debug log must not resolve to the real one",
		);
		assert.notEqual(
			path,
			join(homedir(), ".pi", "agent", "claude-bridge.log"),
			"debug log must not resolve to the developer's real one",
		);
	});
});

describe("log paths", () => {
	it("follow PI_CODING_AGENT_DIR when no debug path override is set", () => {
		// log-paths.ts resolves at import time, so read it from a fresh process.
		const probeDir = "/tmp/pi-agent-dir-probe";
		const env = { ...process.env, PI_CODING_AGENT_DIR: probeDir };
		delete env.CLAUDE_BRIDGE_DEBUG_PATH;
		const src = new URL("../src/log-paths.ts", import.meta.url).href;
		const out = execFileSync(process.execPath, [
			"--import", "tsx", "--input-type=module", "-e",
			`const p = await import(${JSON.stringify(src)}); console.log(JSON.stringify(p));`,
		], { env, encoding: "utf8" });
		assert.deepEqual(JSON.parse(out), {
			DEBUG_LOG_PATH: join(probeDir, "claude-bridge.log"),
			DIAG_LOG_PATH: join(probeDir, "claude-bridge-diag.log"),
		});
	});
});
