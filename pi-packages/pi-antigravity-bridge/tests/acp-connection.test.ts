// ACP connection stderr redaction: a secret the server prints to stderr must
// never leave the connection unredacted, on any surface (public getter, exit
// info, pending-request rejection reason).

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, test } from "vitest";
import { warmJobLauncher } from "./helpers/warm-job-launcher.js";
import { AcpAuthError, AcpConnection } from "../src/acp/connection.js";
import { withoutUnhandledRejections } from "./helpers/unhandled-rejections.js";

// Each isolated file owns a fresh Windows job helper.
beforeAll(warmJobLauncher, 60_000);

test("acp connection: rejecting update and exit sinks cannot escape the stdout reader", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-acp-sink-"));
	let updates = 0;
	let exits = 0;
	const conn = new AcpConnection({
		cwd: dir, bin: process.execPath,
		binArgs: [path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs")],
		extraEnv: { ACP_FAKE_SCENARIO: "happy" },
		log: () => {},
		onUpdate: async () => { updates++; throw new Error("update sink failed"); },
		onExit: async () => { exits++; throw new Error("exit sink failed"); },
	});
	try {
		await withoutUnhandledRejections(async () => {
			await conn.start();
			const info = await conn.newSession(dir);
			assert.equal((await conn.prompt(info.sessionId, "hello")).stopReason, "end_turn");
			assert.ok(updates > 0);
			await conn.kill();
			assert.equal(exits, 1);
		});
	} finally {
		await conn.kill();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("acp connection: stderr tail and exit info are redacted", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-acp-conn-"));
	const exits: Array<{ stderrTail: string }> = [];
	const conn = new AcpConnection({
		cwd: dir,
		bin: process.execPath,
		// Prints a secret-shaped token to stderr, lingers past the write so the
		// data event lands, then exits before initialize resolves.
		binArgs: [
			"-e",
			`console.error("boom key AIzaSyA-1234567890abcdefghijklmnopqrstu"); setTimeout(() => process.exit(1), 100);`,
		],
		log: () => {},
		onUpdate: () => {},
		onExit: (info) => exits.push(info),
	});
	await assert.rejects(conn.start());
	assert.ok(exits.length > 0, "exit fired");
	for (const tail of [conn.stderrTail, exits[0]!.stderrTail]) {
		assert.ok(tail.includes("<redacted>"), "tail is redacted");
		assert.equal(tail.includes("AIzaSyA"), false, "raw secret absent");
	}
	await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

test("acp connection: a token split across stderr chunks is still redacted", async () => {
	// Pins the boundary design: chunks accumulate raw, redaction runs on the
	// reassembled tail, so neither half alone matches a secret pattern.
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-acp-conn-"));
	const exits: Array<{ stderrTail: string }> = [];
	const conn = new AcpConnection({
		cwd: dir,
		bin: process.execPath,
		binArgs: [
			"-e",
			[
				`process.stderr.write("split key AIzaSy");`,
				`setTimeout(() => {`,
				`  process.stderr.write("A-1234567890abcdefghijklmnopqrstu\\n");`,
				`  setTimeout(() => process.exit(1), 100);`,
				`}, 50);`,
			].join(""),
		],
		log: () => {},
		onUpdate: () => {},
		onExit: (info) => exits.push(info),
	});
	await assert.rejects(conn.start());
	assert.ok(exits.length > 0, "exit fired");
	for (const tail of [conn.stderrTail, exits[0]!.stderrTail]) {
		assert.ok(tail.includes("<redacted>"), "reassembled token redacted");
		assert.equal(tail.includes("1234567890abcdefghijklmn"), false, "token body absent");
	}
	await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

test("acp connection: a stdout frame flood kills the connection instead of growing memory", async () => {
	// 34MB with no newline breaches the 32MB frame cap: start() must reject
	// with a typed reason and the exit path must fire, not buffer forever.
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-acp-conn-"));
	const exits: Array<{ stderrTail: string }> = [];
	const conn = new AcpConnection({
		cwd: dir,
		bin: process.execPath,
		binArgs: [
			"-e",
			// Flood stdout, and exit only when the write has fully drained: a
			// timer here would race the parent's drain speed (slow CI workers
			// read slower than the 34MB flows) and kill the flood mid-write.
			`process.stdout.write("x".repeat(34*1024*1024), () => process.exit(0));`,
		],
		log: () => {},
		onUpdate: () => {},
		onExit: (info) => exits.push(info),
	});
	let rejection: unknown;
	try {
		await conn.start();
	} catch (err) {
		rejection = err;
	}
	assert.match((rejection as Error)?.message ?? "", /frame overflow/i);
	assert.ok(exits.length > 0, "exit fired");
	await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}, 30_000);

const authErrorOperations: Record<string, (conn: AcpConnection, cwd: string) => Promise<unknown>> = {
	initialize: (conn) => conn.start(),
	authenticate: (conn) => conn.request("authenticate", { methodId: "oauth-personal" }),
	"session/new": (conn, cwd) => conn.newSession(cwd),
	"session/load": (conn, cwd) => conn.loadSession("s", cwd),
	"session/set_config_option": (conn) => conn.setConfigOption("s", "model", "m"),
	"session/prompt": (conn) => conn.prompt("s", "hello"),
	"session/cancel": (conn) => conn.cancel("s"),
	"session/close": (conn) => conn.closeSession("s"),
};

test.each(Object.entries(authErrorOperations))("ACP %s auth errors invalidate only the owning connection once", async (method, operation) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-acp-invalidate-"));
	let invalidations = 0;
	const conn = new AcpConnection({
		cwd: dir, bin: process.execPath,
		binArgs: [path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs")],
		extraEnv: { ACP_FAKE_AUTH_ERROR_METHOD: method },
		log: () => {}, onUpdate: () => {}, onExit: () => {},
		onAuthInvalidated: () => { invalidations++; },
	});
	try {
		if (method !== "initialize") await conn.start();
		await assert.rejects(operation(conn, dir), AcpAuthError);
		assert.equal(invalidations, 1, "translation through nested request guards must not double-invalidate");
	} finally {
		await conn.kill();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("connection teardown detaches its invalidation callback without affecting a sibling", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-acp-invalidate-"));
	const counts = [0, 0];
	let pending!: () => void;
	const responsePending = new Promise<void>((resolve) => { pending = resolve; });
	const connections = counts.map((_, i) => new AcpConnection({
		cwd: dir, bin: process.execPath,
		binArgs: [path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs")],
		extraEnv: { ACP_FAKE_AUTH_ERROR_METHOD: "session/prompt", ACP_FAKE_AUTH_ERROR_DELAY_MS: i === 0 ? "10000" : "0" },
		log: () => {}, onUpdate: () => pending(), onExit: () => {},
		onAuthInvalidated: () => { counts[i]++; },
	}));
	try {
		await Promise.all(connections.map((conn) => conn.start()));
		const rejected = assert.rejects(connections[0].prompt("s", "hello"), /connection killed/);
		await responsePending;
		await connections[0].kill();
		await rejected;
		assert.deepEqual(counts, [0, 0], "teardown must not invalidate either instance");
		await assert.rejects(connections[0].prompt("s", "late"), /not running/);
		await assert.rejects(connections[1].prompt("s", "hello"), AcpAuthError);
		assert.deepEqual(counts, [0, 1], "the surviving sibling retains only its own callback");
	} finally {
		await Promise.all(connections.map((conn) => conn.kill()));
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("protocol and plain connection errors never invalidate authentication", async () => {
	let invalidations = 0;
	const conn = new AcpConnection({
		cwd: process.cwd(), bin: process.execPath,
		binArgs: [path.join(import.meta.dirname, "helpers", "fake-acp-server.mjs")],
		extraEnv: { ACP_FAKE_SCENARIO: "cancel-unsupported" },
		log: () => {}, onUpdate: () => {}, onExit: () => {},
		onAuthInvalidated: () => { invalidations++; },
	});
	try {
		await conn.start();
		assert.deepEqual(await conn.cancel("s"), { supported: false });
		await conn.kill();
		await assert.rejects(conn.request("session/new"), /not running/);
		assert.equal(invalidations, 0);
	} finally { await conn.kill(); }
});
