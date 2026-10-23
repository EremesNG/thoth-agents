/**
 * Unit-suite preload: isolate HOME, Pi/Claude state and logs before imports.
 * Paths resolve lazily, but tests must never fall back to the developer's state.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "claude-bridge-test-log-"));
process.env.HOME = root;
process.env.USERPROFILE = root;
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
process.env.PI_CODING_AGENT_SESSION_DIR = join(root, "sessions");
process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
process.env.CLAUDE_BRIDGE_DEBUG_PATH = join(root, "claude-bridge.log");
mkdirSync(process.env.PI_CODING_AGENT_DIR, { recursive: true });
delete process.env.CLAUDE_BRIDGE_RECORD_STREAM;
process.on("exit", () => rmSync(root, { recursive: true, force: true }));
