/**
 * The bridge's debug and diagnostics logs live in pi's agent dir, so a layout
 * that sets PI_CODING_AGENT_DIR keeps them beside pi's other state instead of a
 * fixed ~/.pi/agent. The debug log alone stays overridable, because the test
 * harness and the probes redirect it to a throwaway path.
 */
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { join } from "path";

export const DEBUG_LOG_PATH = process.env.CLAUDE_BRIDGE_DEBUG_PATH || join(getAgentDir(), "claude-bridge.log");
export const DIAG_LOG_PATH = join(getAgentDir(), "claude-bridge-diag.log");
