// Continuing Pi sessions must not consult or clean up the retired checkpoint store.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createSession, getSessionPath } from "cc-session-io";
import { recordSdkTurn } from "./lib/recorded-sdk-turn.mjs";
import { loadSessionState } from "../src/session-store.js";

const root = fs.mkdtempSync(join(tmpdir(), "legacy-checkpoints-"));
const cwd = join(root, "project");
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
fs.mkdirSync(cwd, { recursive: true });
let cleaningUp = false;
after(() => {
	// Node 22's rimraf can retain mocked fs methods even after restoreAll().
	cleaningUp = true;
	try {
		fs.rmSync(root, { recursive: true, force: true });
	} finally { cleaningUp = false; }
});

const { default: activate, __test } = await import("../src/index.js");
const handlers = new Map();
let provider;
activate({
	on: (name, handler) => handlers.set(name, handler),
	registerProvider: (_name, config) => { provider = config; },
	registerTool() {},
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const user = (content) => ({ role: "user", content, timestamp: 3 });
const records = (bytes) => bytes.toString("utf8").trim().split("\n").filter(Boolean).map(JSON.parse);

test("ignores and preserves old checkpoints, writes Pi history once, then uses the new recording", async (t) => {
	__test.resetSharedSession();
	const piSessionId = "pi-legacy-compatibility";
	const legacySessionId = "11111111-2222-4333-8444-555555555555";
	const currentAppend = "Current instructions, not the legacy append epoch";
	// Canonical key order matches the retired whole-prefix proof projection.
	const priors = [
		{ content: "Earlier Pi question", role: "user", timestamp: 1 },
		{ content: [{ text: "Earlier Pi answer", type: "text" }], role: "assistant", timestamp: 2 },
	];
	const legacySession = createSession({ sessionId: legacySessionId, projectPath: cwd, claudeDir: process.env.CLAUDE_CONFIG_DIR });
	legacySession.addUserMessage(priors[0].content);
	legacySession.addAssistantMessage(priors[1].content);
	legacySession.save();
	const legacyTranscript = fs.readFileSync(legacySession.jsonlPath);
	const legacyDir = join(process.env.PI_CODING_AGENT_DIR, "claude-bridge", "session-checkpoints");
	const legacyFile = join(legacyDir, `${sha256(piSessionId)}.json`);
	fs.mkdirSync(legacyDir, { recursive: true });
	fs.writeFileSync(legacyFile, JSON.stringify({
		schemaVersion: 1, status: "clean", piSessionId, cwd, claudeConfigDir: process.env.CLAUDE_CONFIG_DIR,
		sessionId: legacySessionId, cursor: 1,
		proof: { length: 2, digest: sha256(JSON.stringify(priors)) },
		transcript: { size: legacyTranscript.length, lastUuid: legacySession.records.at(-1).uuid, digest: sha256(legacyTranscript) },
		epoch: { recorded: "Legacy base instructions", effective: "Legacy effective instructions", uncertain: false },
		updatedAt: Date.now(),
	}));

	// Outside fixture cleanup, exempt only synchronous test inspections: even a
	// bridge read that is discarded or swallowed must fail, not just an old-id resume.
	let inspectingLegacy = false;
	const snapshot = () => {
		inspectingLegacy = true;
		try {
			return {
				entries: fs.readdirSync(legacyDir).sort(), bytes: fs.readFileSync(legacyFile),
				directory: fs.statSync(legacyDir), file: fs.statSync(legacyFile),
			};
		} finally { inspectingLegacy = false; }
	};
	const before = snapshot();
	const assertPreserved = () => {
		const after = snapshot();
		assert.deepEqual(after.entries, before.entries, "no legacy entries were added or removed");
		assert.deepEqual(after.bytes, before.bytes, "legacy checkpoint bytes are unchanged");
		for (const key of ["directory", "file"])
			for (const field of ["ino", "size", "mode", "mtimeMs", "ctimeMs"])
				assert.equal(after[key][field], before[key][field], `legacy ${key} ${field} is unchanged`);
		assert.deepEqual(fs.readFileSync(legacySession.jsonlPath), legacyTranscript, "the old Claude transcript is untouched");
	};
	const legacyReads = [];
	for (const [api, methods] of [
		[fs, ["readFileSync", "openSync", "readdirSync", "readFile", "open", "readdir"]],
		[fs.promises, ["readFile", "open", "readdir"]],
	]) {
		for (const method of methods) {
			const original = api[method];
			t.mock.method(api, method, function (path, ...args) {
				if (typeof path === "string" || Buffer.isBuffer(path) || path instanceof URL) {
					const absolute = resolve(path instanceof URL ? fileURLToPath(path) : path.toString());
					if (!cleaningUp && !inspectingLegacy && (absolute === legacyDir || absolute.startsWith(`${legacyDir}${sep}`))) {
						legacyReads.push(`${method}: ${absolute}`);
						throw new Error("Bridge read the retired checkpoint directory");
					}
				}
				return original.call(this, path, ...args);
			});
		}
	}
	syncBuiltinESMExports();

	const calls = [];
	__test.setQuery(({ prompt, options }) => {
		const sessionId = options.sessionId ?? options.resume;
		const path = getSessionPath(sessionId, options.cwd, process.env.CLAUDE_CONFIG_DIR);
		const call = { options, sessionId, before: fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0) };
		calls.push(call);
		const query = (async function* () {
			const initial = await prompt[Symbol.asyncIterator]().next();
			assert.equal(initial.done, false);
			const recorded = recordSdkTurn(options, initial.value, `Live answer ${calls.length}`);
			yield recorded.init;
			yield recorded.replay;
			yield recorded.assistant;
			yield { type: "result", subtype: "success", is_error: false };
		})();
		query.close = () => {};
		query.interrupt = async () => {};
		return query;
	});
	const ctx = { cwd, mode: "rpc", ui: {}, sessionManager: { getSessionId: () => piSessionId } };
	const turn = async (messages) => {
		const systemPrompt = "Captured continuing Pi prompt";
		handlers.get("before_agent_start")({ systemPrompt, systemPromptOptions: { appendSystemPrompt: currentAppend } });
		handlers.get("agent_start")({}, { getSystemPrompt: () => systemPrompt });
		const answer = await provider.streamSimple(provider.models[0], { systemPrompt, messages, tools: [] }, { sessionId: piSessionId }).result();
		await new Promise((done) => setImmediate(done));
		assert.deepEqual(legacyReads, [], "no sync, async, file, or directory reads of legacy state");
		assert.equal(answer.stopReason, "stop", answer.errorMessage);
		assertPreserved();
		return answer;
	};

	try {
		handlers.get("session_start")({ reason: "resume" }, ctx);
		const history = [...priors, user("Continue the Pi session")];
		history.push(await turn(history));
		assert.equal(calls.length, 1);
		const first = calls[0];
		assert.notEqual(first.sessionId, legacySessionId, "row 2 creates a new Claude session");
		assert.equal(first.options.resume, first.sessionId, "the first query resumes only its newly written Pi history");
		assert.equal(first.options.forkSession, undefined);
		assert.equal(first.options.systemPrompt.append, currentAppend);
		assert.deepEqual(records(first.before).filter((record) => record.message).map((record) => record.message.content), [
			"Earlier Pi question", [{ type: "text", text: "Earlier Pi answer" }],
		], "Pi history is written exactly once before the first live query");

		const newDir = join(process.env.PI_CODING_AGENT_DIR, "claude-bridge", "sessions");
		const newFileName = `s-${createHash("sha256").update(piSessionId, "utf16le").digest("hex")}.json`;
		assert.deepEqual(fs.readdirSync(newDir), [newFileName]);
		const stored = JSON.parse(fs.readFileSync(join(newDir, newFileName), "utf8"));
		assert.equal(stored.version, 1);
		assert.equal(stored.ccSessionId, first.sessionId);
		assert.equal(stored.cwd, cwd);
		assert.equal(stored.model, first.options.model);
		assert.equal(stored.digests.length, history.length);
		assert.equal(stored.uuids.length, history.length);
		assert.deepEqual(stored.cuttable, [true, true, true, true]);
		assert.deepEqual(stored.appendState, { base: currentAppend, refreshes: [] }, "no append state comes from the old epoch");
		assert.equal(loadSessionState(piSessionId, assert.fail).ccSessionId, first.sessionId);
		const transcript = getSessionPath(first.sessionId, cwd, process.env.CLAUDE_CONFIG_DIR);
		const afterFirst = fs.readFileSync(transcript);
		const transcriptDir = dirname(transcript);
		const filesAfterFirst = fs.readdirSync(transcriptDir).sort();

		history.push(user("Continue using the new recording"));
		history.push(await turn(history));
		assert.equal(calls.length, 2);
		assert.equal(calls[1].options.resume, first.sessionId, "the following turn reuses the new recording");
		assert.equal(calls[1].options.forkSession, undefined);
		assert.deepEqual(calls[1].before, afterFirst, "the following turn does not rewrite or re-import history");
		assert.deepEqual(fs.readdirSync(transcriptDir).sort(), filesAfterFirst, "no second history session is written");
		assert.deepEqual(fs.readdirSync(newDir), [newFileName]);
		assert.equal(loadSessionState(piSessionId, assert.fail).digests.length, history.length, "new-format recording advances after both turns");
		assert.ok(calls.every((call) => call.options.resume !== legacySessionId && call.options.sessionId !== legacySessionId));
		handlers.get("session_shutdown")({}, ctx);
		assert.deepEqual(legacyReads, []);
		assertPreserved();
	} finally {
		__test.setQuery(null);
		__test.resetSharedSession();
		__test.setPiUI(null);
		t.mock.restoreAll();
		syncBuiltinESMExports();
	}
});
