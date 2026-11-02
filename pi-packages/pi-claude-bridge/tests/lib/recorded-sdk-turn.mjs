// External Claude Code fixture: acknowledge the prompt and write actual records,
// including forked prefixes. Provider tests must not invent cursor-only mirrors.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createSession, getSessionPath } from "cc-session-io";

export function recordSdkTurn(options, initial, text = "OK", contexts = []) {
	const id = options.sessionId ?? options.resume;
	const path = getSessionPath(id, options.cwd, process.env.CLAUDE_CONFIG_DIR);
	mkdirSync(dirname(path), { recursive: true });
	if (options.forkSession) {
		const source = readFileSync(getSessionPath(options.resume, options.cwd, process.env.CLAUDE_CONFIG_DIR), "utf8").trim().split("\n").map(JSON.parse);
		const cut = source.findIndex((record) => record.uuid === options.resumeSessionAt);
		if (cut < 0) throw new Error("Fixture fork boundary missing");
		writeFileSync(path, source.slice(0, cut + 1).map((record) => JSON.stringify({ ...record, sessionId: id }) + "\n").join(""));
	}
	const previous = existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
	const session = createSession({ sessionId: id, projectPath: options.cwd, claudeDir: process.env.CLAUDE_CONFIG_DIR, model: options.extraArgs?.model });
	session.addUserMessage(initial.message.content);
	if (contexts.length) session.addAttachment({ type: "hook_additional_context", hookEvent: "UserPromptSubmit", content: contexts });
	session.addAssistantMessage([{ type: "text", text }]);
	const user = session.records[0], assistant = session.records.at(-1);
	user.uuid = initial.uuid;
	user.parentUuid = previous.filter((record) => record.uuid).at(-1)?.uuid ?? null;
	if (contexts.length) session.records[1].parentUuid = user.uuid;
	assistant.parentUuid = session.records.at(-2).uuid;
	appendFileSync(path, session.records.map((record) => JSON.stringify(record) + "\n").join(""));
	return {
		init: { type: "system", subtype: "init", session_id: id },
		replay: { type: "user", isReplay: true, parent_tool_use_id: null, uuid: user.uuid, session_id: id, message: initial.message },
		assistant: { type: "assistant", parent_tool_use_id: null, uuid: assistant.uuid, message: assistant.message },
	};
}
