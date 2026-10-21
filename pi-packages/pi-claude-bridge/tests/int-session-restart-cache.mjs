#!/usr/bin/env node
// Live AC-4 regression: the first provider call after a real Pi process restart
// must read the cached prefix of the last pre-restart provider call.
// Requires Pi + Claude Code auth. Run with node --import tsx (also in test's int-*.mjs glob).
// On Windows, set CLAUDE_BRIDGE_TEST_PI_CLI to the JS entrypoint used by pi.cmd.
// Haiku is the default; CLAUDE_BRIDGE_TEST_RESTART_MODEL may select Sonnet only
// when Haiku is unusable. Never point this test at a user's real Pi sessions.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { anchorText, payloadText } from "./fixtures/restart-cache-extension.ts";
import { createRpcHarness } from "./lib/rpc-harness.mjs";

const TIMEOUT = 180_000;
const MODEL = process.env.CLAUDE_BRIDGE_TEST_RESTART_MODEL ?? "claude-bridge/claude-haiku-4-5";
assert.match(MODEL, /^claude-bridge\/claude-(haiku|sonnet)-/);
const PI_CLI = process.env.CLAUDE_BRIDGE_TEST_PI_CLI;
const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/restart-cache-extension.ts");
const ROOT = mkdtempSync(join(tmpdir(), "pi-bridge-restart-cache-"));
const SESSION_DIR = join(ROOT, "sessions");
const AGENT_DIR = join(ROOT, "agent");
mkdirSync(SESSION_DIR);
mkdirSync(AGENT_DIR);
const previousLogDir = process.env.CLAUDE_BRIDGE_TEST_LOG_DIR;
process.env.CLAUDE_BRIDGE_TEST_LOG_DIR = join(ROOT, "logs");
const processes = [];

function within(promise, timeout, description) {
	let timer;
	return Promise.race([
		promise,
		new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error(`Timeout: ${description}`)), timeout);
		}),
	]).finally(() => clearTimeout(timer));
}

async function startProcess(name, sessionFile) {
	const harness = createRpcHarness({
		name: `session-restart-cache-${name}`,
		piCli: PI_CLI,
		sessionDir: SESSION_DIR,
		sessionFile,
		args: ["--model", MODEL, "--thinking", "off", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "-e", FIXTURE],
		env: { PI_CODING_AGENT_DIR: AGENT_DIR, PI_OFFLINE: "1", PI_TELEMETRY: "0" },
		defaultTimeout: TIMEOUT,
	});
	harness.start();
	const child = harness.pi();
	const exited = new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code, signal) => resolve({ code, signal }));
	});
	// Attach the rejection handler now, including during startup/teardown.
	exited.catch(() => {});
	const running = { harness, child, exited };
	processes.push(running);
	const state = await Promise.race([
		harness.send({ type: "get_state" }),
		exited.then(({ code, signal }) => { throw new Error(`Pi ${name} exited during startup (${code ?? signal})`); }),
	]);
	assert.ok(state.sessionFile, "Pi must have persistence enabled");
	assert.equal(dirname(resolve(state.sessionFile)), SESSION_DIR, "Session must stay in the test's temp directory");
	assert.equal(state.model.provider + "/" + state.model.id, MODEL);
	return { ...running, state };
}

async function stopProcess(running, graceful = true) {
	if (running.child.exitCode === null && running.child.signalCode === null) {
		if (graceful) running.child.stdin.end(); // RPC EOF runs Pi's shutdown hooks.
		else running.child.kill();
	}
	try {
		const status = await within(running.exited, 15_000, "real Pi process close");
		if (graceful) {
			assert.equal(status.code, 0, "Pi must shut down cleanly before restarting");
			assert.equal(status.signal, null);
		}
		return status;
	} finally {
		// stop() alone only flushes the RPC log; it does NOT await process exit.
		await running.harness.stop();
	}
}

async function runTurn(running, message, label) {
	const calls = [];
	const results = [];
	let ended;
	const completed = new Promise((resolve) => { ended = resolve; });
	const remove = running.harness.addListener((event) => {
		// Pi emits one turn_end for each completed provider call, including a
		// tool-use call. Do not sum agent_end messages or SDK result totals.
		if (event.type === "turn_end") {
			calls.push(event.message);
			results.push(...(event.toolResults ?? []));
		}
		if (event.type === "agent_end") ended();
	});
	try {
		await running.harness.send({ type: "prompt", message });
		await within(Promise.race([
			completed,
			running.exited.then(() => { throw new Error(`Pi exited during ${label}`); }),
		]), TIMEOUT, label);
	} finally {
		remove();
	}
	assert.ok(calls.length, `${label}: no provider calls observed`);
	for (const [index, call] of calls.entries()) {
		assert.equal(call.role, "assistant");
		assert.equal(call.provider, "claude-bridge");
		assert.ok(!["error", "aborted"].includes(call.stopReason), `${label}: provider call failed (${call.stopReason})`);
		for (const key of ["input", "cacheRead", "cacheWrite"]) {
			assert.ok(Number.isFinite(call.usage?.[key]), `${label}: missing usage.${key}`);
		}
		assert.ok(call.usage.input + call.usage.cacheRead + call.usage.cacheWrite > 0, `${label}: empty usage`);
		console.log(`${label} call ${index + 1}/${calls.length}: cacheRead=${call.usage.cacheRead}; cacheWrite=${call.usage.cacheWrite}; input=${call.usage.input}`);
	}
	return { calls, results };
}

function checkAnchors(sessionFile, expected) {
	const entries = readFileSync(sessionFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
	const anchors = entries.filter((entry) => entry.type === "custom_message" && entry.customType === "test-anchor");
	assert.equal(anchors.length, expected, "Hidden reminder must be persisted on every human turn");
	for (const anchor of anchors) {
		assert.equal(anchor.display, false);
		assert.equal(anchor.content, anchorText);
	}
	console.log(`Persisted hidden test-anchor messages: ${anchors.length}`);
}

function sessionIds(harness) {
	return [...new Set([...readFileSync(harness.DEBUG_LOG, "utf8").matchAll(/syncResult: path=[a-z-]+ sessionId=([a-f0-9-]+)/g)].map((match) => match[1]))];
}

try {
	const version = execFileSync(PI_CLI ? process.execPath : "pi", PI_CLI ? [PI_CLI, "--version"] : ["--version"], { encoding: "utf8", timeout: 15_000 }).trim();
	console.log("=== session-restart-cache ===");
	console.log(`Pi CLI: ${PI_CLI ?? "pi (PATH)"}; version=${version}; model=${MODEL}`);
	const a = await startProcess("A");
	const turn1 = await runTurn(a, "Call RestartCachePayload exactly once, then reply READY in one word. Do not use any other tools or repeat the data.", "A turn 1");
	assert.equal(turn1.results.filter((result) => result.toolName === "RestartCachePayload" && !result.isError && result.content?.some((block) => block.text === payloadText)).length, 1, "Turn 1 must contain the full sizable tool result exactly once");
	assert.ok(turn1.calls.length >= 2, "The tool result must be consumed by a subsequent provider call");
	const turn2 = await runTurn(a, "Reply ACK in one word, without using tools.", "A turn 2");
	const lastA = turn2.calls.at(-1).usage;
	const prior = lastA.cacheRead + lastA.cacheWrite; // Deliberately exclude uncached input and output.
	const lastACompletedAt = Date.now();
	assert.ok(prior > turn1.calls[0].usage.cacheRead + turn1.calls[0].usage.cacheWrite + 5_000, "Cached conversation must exceed the initial tools/system prefix by >5K tokens");
	const stateA = await a.harness.send({ type: "get_state" });
	checkAnchors(stateA.sessionFile, 2);
	const closedA = await stopProcess(a);
	console.log(`Process A closed: code=${closedA.code}; pid=${a.child.pid}`);

	const b = await startProcess("B", stateA.sessionFile);
	assert.notEqual(b.child.pid, a.child.pid, "Restart must create a different OS process");
	assert.equal(b.state.sessionId, stateA.sessionId, "Restart must resume the same Pi session id");
	assert.equal(b.state.sessionFile, stateA.sessionFile);
	assert.equal(b.state.messageCount, stateA.messageCount, "Restart must reload the persisted history");
	const turn3 = await runTurn(b, "Reply DONE in one word, without using tools.", "B turn 3");
	const post = turn3.calls[0].usage;
	const restartMs = Date.now() - lastACompletedAt;
	assert.ok(restartMs < 300_000, "Post-restart call must finish within the five-minute cache TTL");
	checkAnchors(stateA.sessionFile, 3);
	console.log(`CC session ids: A=${sessionIds(a.harness).join(",") || "unobserved"}; B=${sessionIds(b.harness).join(",") || "unobserved"}`);
	console.log(`Pi session id: ${stateA.sessionId}; restart-to-first-call-complete=${restartMs}ms`);
	console.log(`Prior: A turn 2 call ${turn2.calls.length}/${turn2.calls.length}; cacheRead=${lastA.cacheRead}; cacheWrite=${lastA.cacheWrite}; prior=${prior}`);
	console.log(`Post: B turn 3 call 1/${turn3.calls.length}; cacheRead=${post.cacheRead}; cacheWrite=${post.cacheWrite}; input=${post.input}`);
	console.log(`Cache deficit=${prior - post.cacheRead}; allowed=256; assertion shortfall=${prior - 256 - post.cacheRead}`);
	assert.ok(post.cacheRead >= prior - 256, `First post-restart call cacheRead ${post.cacheRead} < prior - 256 (${prior - 256})`);
	console.log("PASS: first post-restart call reused the cached prefix");
} catch (error) {
	process.exitCode = 1;
	console.error(`FAIL: ${error.message}`);
} finally {
	for (const running of processes) {
		try {
			await stopProcess(running, false);
		} catch (error) {
			process.exitCode = 1;
			console.error(`Teardown failed: ${error.message}`);
		}
	}
	if (previousLogDir === undefined) delete process.env.CLAUDE_BRIDGE_TEST_LOG_DIR;
	else process.env.CLAUDE_BRIDGE_TEST_LOG_DIR = previousLogDir;
	rmSync(ROOT, { recursive: true, force: true });
}
