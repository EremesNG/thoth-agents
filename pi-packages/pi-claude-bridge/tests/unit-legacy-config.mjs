import { after, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";

const fixture = mkdtempSync(join(tmpdir(), "claude-bridge-legacy-config-"));
const previousCwd = process.cwd();
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const agentDir = join(fixture, "agent");
const projectDir = join(fixture, "project");
mkdirSync(agentDir, { recursive: true });
mkdirSync(join(projectDir, CONFIG_DIR_NAME), { recursive: true });
process.env.PI_CODING_AGENT_DIR = agentDir;
after(() => {
	process.chdir(previousCwd);
	if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
	rmSync(fixture, { recursive: true, force: true });
});

const { loadConfig } = await import("../src/config.js");
const { default: activate } = await import("../src/index.js");

it("ignores legacy AskClaude config in global and project files without registering tools", () => {
	writeFileSync(join(agentDir, "claude-bridge.json"), JSON.stringify({
		provider: { strictMcpConfig: true },
		askClaude: { enabled: true, name: "GlobalClaude", defaultMode: "full" },
		askClaudeDeprecationShown: "2026-01-01",
	}));
	writeFileSync(join(projectDir, CONFIG_DIR_NAME, "claude-bridge.json"), JSON.stringify({
		provider: { strictMcpConfig: false },
		askClaude: { enabled: true, name: "ProjectClaude", defaultIsolated: true },
		askClaudeDeprecationShown: "2026-02-01",
	}));

	assert.doesNotThrow(() => loadConfig());
	// Import before chdir: the TS loader can retain a cwd handle on Windows.
	process.chdir(projectDir);
	const tools = [];
	const providers = [];
	activate({
		on: () => {},
		registerProvider: (name) => providers.push(name),
		registerTool: (tool) => tools.push(tool.name),
	});
	assert.deepEqual(tools, [], "the provider extension must not register a tool");
	assert.deepEqual(providers, ["claude-bridge"]);
	assert.deepEqual(loadConfig(), {
		provider: { strictMcpConfig: true },
	});
});
