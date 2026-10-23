// /agy auth tests against the scripted fake ACP server (authenticate ->
// {}), with tokenless session probes and auth-error invalidation.
// Fully offline; token and verified-marker paths are fixtures, never real ones.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, test } from "vitest";
import { warmJobLauncher } from "./helpers/warm-job-launcher.js";
import { runAcpAuth } from "../src/acp/auth.js";

// Each isolated file owns a fresh Windows job helper.
beforeAll(warmJobLauncher, 60_000);

const FAKE_SERVER = fileURLToPath(new URL("./helpers/fake-acp-server.mjs", import.meta.url));

function tmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "agy-acp-auth-"));
}

/** Wire a fake-server run whose token directory is a fixture under `dir`. */
function authOpts(dir: string, scenario = "happy") {
	return {
		bin: process.execPath,
		binArgs: [FAKE_SERVER],
		cwd: dir,
		extraEnv: { ACP_FAKE_SCENARIO: scenario, ACP_FAKE_LOG: path.join(dir, "fake-log.jsonl") },
		tokenDir: path.join(dir, "token-fixture"),
		authVerifiedFile: path.join(dir, "verified.json"),
		tokenGraceMs: 200,
		timeoutMs: 15_000,
	};
}

function seedToken(dir: string): void {
	const tokenDir = path.join(dir, "token-fixture");
	fs.mkdirSync(tokenDir, { recursive: true });
	fs.writeFileSync(path.join(tokenDir, "acp_token.json"), "{}");
}

describe("acp/auth runAcpAuth", () => {
	test("sends authenticate with the oauth-personal method and succeeds when the token is present", async () => {
		const dir = tmpDir();
		const logPath = path.join(dir, "fake-log.jsonl");
		seedToken(dir);
		const r = await runAcpAuth(authOpts(dir));
		assert.equal(r.ok, true);
		assert.equal(r.error, undefined);
		assert.equal(r.note, undefined);
		const marker = JSON.parse(fs.readFileSync(path.join(dir, "verified.json"), "utf8"));
		assert.deepEqual(Object.keys(marker).sort(), ["at", "verified"]);
		assert.equal(marker.verified, true);
		assert.ok(Number.isFinite(Date.parse(marker.at)));
		const requests = fs
			.readFileSync(logPath, "utf8")
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l) as { method?: string; params?: { methodId?: string } });
		assert.ok(
			requests.some((m) => m.method === "authenticate" && m.params?.methodId === "oauth-personal"),
			"the authenticate RPC must carry the oauth-personal method id",
		);
	});

	test("a dead binary fails with an error, not a hang", async () => {
		const r = await runAcpAuth({ bin: path.join(tmpDir(), "no-such-server.par"), timeoutMs: 5_000, tokenDir: path.join(tmpDir(), "t") });
		assert.equal(r.ok, false);
		assert.ok(r.error && r.error.length > 0);
	});

	test("a second concurrent run fails fast instead of racing the token write", async () => {
		const dir = tmpDir();
		seedToken(dir);
		const first = runAcpAuth(authOpts(dir));
		const second = await runAcpAuth(authOpts(dir));
		const a = await first;
		assert.equal(a.ok, true);
		assert.equal(second.ok, false);
		assert.match(second.error ?? "", /already running/);
	});

	test("tokenless authenticate succeeds only after a live session probe in the configured cwd", async () => {
		const dir = tmpDir();
		assert.notEqual(dir, process.cwd());
		const r = await runAcpAuth(authOpts(dir));
		assert.equal(r.ok, true);
		assert.match(r.note ?? "", /existing credentials/);
		assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "verified.json"), "utf8")).verified, true);
		assert.equal(fs.existsSync(path.join(dir, "token-fixture", "acp_token.json")), false);
		const requests = fs.readFileSync(path.join(dir, "fake-log.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
		assert.deepEqual(requests.map((request) => request.method), ["initialize", "authenticate", "session/new", "session/close"], "auth and probe share one connection");
		const probe = requests.find((request) => request.method === "session/new");
		assert.equal(probe?.params.cwd, dir, "probe must not use process.cwd()");
		assert.ok(requests.some((request) => request.method === "session/close" && request.params.sessionId === "fake-session-0001"));
	});

	test.each(["authenticate", "session/new", "session/close"])("an auth error from %s clears an earlier verified marker", async (method) => {
		const dir = tmpDir();
		const opts = authOpts(dir);
		fs.writeFileSync(opts.authVerifiedFile, '{"verified":true}');
		const r = await runAcpAuth({ ...opts, extraEnv: { ...opts.extraEnv, ACP_FAKE_AUTH_ERROR_METHOD: method } });
		assert.equal(r.ok, false);
		assert.equal(fs.existsSync(opts.authVerifiedFile), false);
	});

	test("tokenless authenticate fails when the session probe finds no usable credentials", async () => {
		const dir = tmpDir();
		const r = await runAcpAuth(authOpts(dir, "auth-required"));
		assert.equal(r.ok, false);
		assert.match(r.error ?? "", /usable credentials.*session probe failed/);
		assert.equal(fs.existsSync(path.join(dir, "verified.json")), false);
	});
});
