// agy per-engine state dirs ("brain" trees).
//
// Both native engines share ~/.gemini/antigravity-cli/brain/<conversationId>/
// including .system_generated/tasks/ and .system_generated/steps/.
// The standalone ACP tree is retired. A separate tree exists —
// ~/.gemini/antigravity-cli/conversations/<uuid>.db — but it serves
// one-shot print-mode calls (AskAntigravity), NOT these features; do not
// conflate the two. Conversation ids are the raw ids agy reports, no
// hashing; the ids our session store persists match these dir names.

import os from "node:os";
import path from "node:path";
import type { Engine } from "./config.js";

/** Brain root for one engine. `home` injectable for tests. */
export function agyBrainRoot(_engine: Engine, home: string = os.homedir()): string {
	return path.join(home, ".gemini", "antigravity-cli", "brain");
}

/** Per-conversation state dir. `conversationId` is the raw id agy reports
 *  (and what the session store persists). */
export function agyConversationDir(
	engine: Engine,
	conversationId: string,
	home: string = os.homedir(),
): string {
	return path.join(agyBrainRoot(engine, home), conversationId);
}
