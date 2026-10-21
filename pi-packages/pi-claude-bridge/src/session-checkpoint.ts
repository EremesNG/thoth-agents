import { createHash, randomUUID } from "node:crypto";
import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getSessionPath } from "cc-session-io";
import type { RecordingEpoch } from "./append-instructions.js";

type RecordValue = Record<string, unknown>;
export interface CheckpointIdentity {
	piSessionId: string;
	cwd: string;
	claudeConfigDir: string;
}
export interface SessionCheckpoint extends CheckpointIdentity {
	schemaVersion: 1;
	status: "clean";
	sessionId: string;
	cursor: number;
	proof: { length: number; digest: string };
	transcript: { size: number; lastUuid: string | null; digest: string };
	epoch: RecordingEpoch;
	updatedAt: number;
}

function pick(value: RecordValue, keys: string[]): RecordValue {
	return Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));
}

function contentProjection(content: unknown): unknown {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) throw new Error("unsupported-content");
	return content.map((block: RecordValue) => {
		switch (block.type) {
			case "text": return pick(block, ["type", "text", "textSignature"]);
			case "image": return pick(block, ["type", "data", "mimeType"]);
			case "thinking": return pick(block, ["type", "thinking", "thinkingSignature", "redacted"]);
			case "toolCall": return pick(block, ["type", "id", "name", "arguments", "thoughtSignature", "namespace"]);
			default: throw new Error("unsupported-content-block");
		}
	});
}

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === "object") {
		const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
		return Object.fromEntries(entries.map(([key, child]) => [key, canonical(child)]));
	}
	return value;
}

/** JSON normalization matches Pi's session-file round trip, excluding non-model metadata. */
export function piPrefixDigest(messages: readonly unknown[]): string {
	const projection = messages.map((raw) => {
		const message = raw as RecordValue;
		if (!["user", "assistant", "toolResult"].includes(message.role as string)) throw new Error("unsupported-role");
		return { ...pick(message, ["role", "timestamp", "toolCallId", "toolName", "isError"]), content: contentProjection(message.content) };
	});
	return createHash("sha256").update(JSON.stringify(canonical(JSON.parse(JSON.stringify(projection))))).digest("hex");
}

function lastRecordUuid(fd: number, size: number): string | null {
	let tail = Buffer.alloc(0);
	let position = size;
	while (position > 0) {
		const chunk = Buffer.alloc(Math.min(64 * 1024, position));
		position -= chunk.length;
		if (readSync(fd, chunk, 0, chunk.length, position) !== chunk.length) throw new Error("unstable-transcript");
		tail = Buffer.concat([chunk, tail]);
		const end = tail.toString("utf8").trimEnd();
		const newline = end.lastIndexOf("\n");
		if (newline >= 0 || position === 0) {
			const record = JSON.parse(end.slice(newline + 1));
			if (record.uuid !== undefined && typeof record.uuid !== "string") throw new Error("invalid-record-uuid");
			return record.uuid ?? null;
		}
	}
	throw new Error("empty-transcript");
}

function transcriptLastUuid(path: string): string | null {
	const fd = openSync(path, "r");
	try {
		const { size } = fstatSync(fd);
		return lastRecordUuid(fd, size);
	} finally { closeSync(fd); }
}

/** Bounded-memory full-file hashing. Reject partial final records and concurrent writes. */
export function transcriptFingerprint(path: string): SessionCheckpoint["transcript"] {
	const fd = openSync(path, "r");
	try {
		const before = fstatSync(fd);
		const hash = createHash("sha256");
		const buffer = Buffer.alloc(64 * 1024);
		const lastUuid = lastRecordUuid(fd, before.size);
		let bytes = 0;
		for (;;) {
			const count = readSync(fd, buffer, 0, buffer.length, null);
			if (!count) break;
			bytes += count;
			hash.update(buffer.subarray(0, count));
		}
		const after = fstatSync(fd);
		if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error("unstable-transcript");
		return { size: bytes, lastUuid, digest: hash.digest("hex") };
	} finally { closeSync(fd); }
}

type Validation = { ok: true; checkpoint: SessionCheckpoint } | { ok: false; reason: string };
export function validate(value: unknown, expected: CheckpointIdentity & { priorMessages: readonly unknown[] }): Validation {
	const reject = (reason: string): Validation => ({ ok: false, reason });
	if (!value || typeof value !== "object") return reject("missing-or-invalid");
	const c = value as SessionCheckpoint;
	if (c.schemaVersion !== 1) return reject("schema-version");
	if (c.status !== "clean") return reject("status");
	if (c.piSessionId !== expected.piSessionId) return reject("pi-session-id");
	if (c.cwd !== expected.cwd) return reject("cwd");
	if (c.claudeConfigDir !== expected.claudeConfigDir) return reject("claude-config-dir");
	if (
		typeof c.sessionId !== "string" || !/^[a-zA-Z0-9-]+$/.test(c.sessionId) ||
		!Number.isSafeInteger(c.cursor) || c.cursor < 0 ||
		!c.proof || c.proof.length !== c.cursor + 1 || typeof c.proof.digest !== "string" ||
		!c.transcript || !Number.isSafeInteger(c.transcript.size) || c.transcript.size <= 0 ||
		(c.transcript.lastUuid !== null && typeof c.transcript.lastUuid !== "string") ||
		typeof c.transcript.digest !== "string" ||
		!c.epoch || typeof c.epoch.recorded !== "string" || typeof c.epoch.effective !== "string" ||
		typeof c.epoch.uncertain !== "boolean" || !Number.isFinite(c.updatedAt)
	) return reject("invalid-fields");
	if (expected.priorMessages.length !== c.proof.length) return reject("pi-prefix-length");
	try {
		if (piPrefixDigest(expected.priorMessages) !== c.proof.digest) return reject("pi-prefix-digest");
	} catch { return reject("pi-prefix-unsupported"); }
	const path = getSessionPath(c.sessionId, c.cwd, c.claudeConfigDir);
	try {
		if (statSync(path).size !== c.transcript.size) return reject("cc-size");
		if (transcriptLastUuid(path) !== c.transcript.lastUuid) return reject("cc-last-uuid");
		const fingerprint = transcriptFingerprint(path);
		if (fingerprint.size !== c.transcript.size || fingerprint.lastUuid !== c.transcript.lastUuid) return reject("cc-unstable");
		if (fingerprint.digest !== c.transcript.digest) return reject("cc-digest");
	} catch { return reject("cc-missing-or-unreadable"); }
	return { ok: true, checkpoint: c };
}

/** Synchronous commit/delete make generation checking and rename indivisible in this process. */
export class SessionCheckpoints {
	private readonly generations = new Map<string, number>();
	readonly directory: string;
	constructor(agentDir = getAgentDir()) { this.directory = join(agentDir, "claude-bridge", "session-checkpoints"); }
	path(piSessionId: string): string { return join(this.directory, `${createHash("sha256").update(piSessionId).digest("hex")}.json`); }
	load(piSessionId: string): unknown {
		try { return JSON.parse(readFileSync(this.path(piSessionId), "utf8")); } catch { return undefined; }
	}
	invalidate(piSessionId: string): number {
		const generation = (this.generations.get(piSessionId) ?? 0) + 1;
		this.generations.set(piSessionId, generation);
		rmSync(this.path(piSessionId), { force: true });
		return generation;
	}
	write(piSessionId: string, checkpoint: SessionCheckpoint): void {
		mkdirSync(this.directory, { recursive: true, mode: 0o700 });
		const path = this.path(piSessionId);
		const temp = `${path}.${randomUUID()}.tmp`;
		try {
			writeFileSync(temp, JSON.stringify(checkpoint), { mode: 0o600, flag: "wx" });
			// Same-directory rename replaces atomically on Windows too. Never unlink the target first.
			renameSync(temp, path);
		} finally { rmSync(temp, { force: true }); }
		this.prune();
	}
	async publish(piSessionId: string, generation: number, exited: Promise<boolean>, build: () => SessionCheckpoint): Promise<boolean> {
		if (!(await exited) || this.generations.get(piSessionId) !== generation) return false;
		const checkpoint = build();
		if (this.generations.get(piSessionId) !== generation) return false;
		this.write(piSessionId, checkpoint);
		return true;
	}
	prune(now = Date.now()): void {
		try {
			for (const name of readdirSync(this.directory)) {
				if (!/^[a-f0-9]{64}\.json(?:\..*\.tmp)?$/.test(name)) continue;
				const path = join(this.directory, name);
				if (now - statSync(path).mtimeMs > 7 * 24 * 60 * 60 * 1000) rmSync(path, { force: true });
			}
		} catch { /* Opportunistic cleanup must not fail a turn. */ }
	}
}
