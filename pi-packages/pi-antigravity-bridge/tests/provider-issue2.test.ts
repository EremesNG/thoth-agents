// Issue #2 recovery tests: the provider must fail visibly on agy's silent
// over-cap drop (OK with no model output) and clear the binding of a resumed
// conversation whose turn died before any result frame. Settling either as a
// normal reply persists a dead conversation for every later turn (probe
// 2026-09-30: a dropped-turn conversation never emits a result again).
// Run: npm test

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { normalizeContext, type Api, type Model, type SimpleStreamOptions, type TranscriptContext } from "@earendil-works/pi-ai";
import { ToolRoundTrips, createStreamSimple } from "../src/provider.js";
import { resetSyspromptAgentForTests } from "../src/sysprompt-agent.js";
import { SessionStore } from "../src/sessions.js";
import type { StreamDriver, DriverTurnRequest, TurnOutcome } from "../src/driver.js";

const model: Model<Api> = {
	id: "gemini-flash",
	name: "Gemini 3.6 Flash (Medium)",
	api: "agy-bridge" as Api,
	provider: "antigravity",
	baseUrl: "agy-bridge://antigravity",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 1_000_000,
	maxTokens: 65_536,
};

function contextWith(prompt: string, systemPrompt?: string): TranscriptContext {
	return normalizeContext({
		systemPrompt,
		messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
	});
}

interface Harness {
	seen: { opts?: DriverTurnRequest };
	streamSimple: ReturnType<typeof createStreamSimple>;
	store: SessionStore;
	dir: string;
}

function harness(scripted: TurnOutcome[]): Harness {
	let call = 0;
	const seen: { opts?: DriverTurnRequest } = {};
	const driver: StreamDriver = {
		run: async (opts: DriverTurnRequest) => {
			seen.opts = opts;
			const outcome = scripted[Math.min(call, scripted.length - 1)];
			call += 1;
			return {
				id: "fake-turn",
				outcome: Promise.resolve(outcome),
				next: async () => null,
				pushExternal: () => {},
			};
		},
	} as unknown as StreamDriver;
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-issue2-"));
	const store = new SessionStore(path.join(dir, "sessions.json"));
	const streamSimple = createStreamSimple({
		entries: [{ id: "gemini-flash", full: "gemini-3.6-flash" }],
		store,
		driver,
		roundTrips: new ToolRoundTrips(driver),
	});
	return { seen, streamSimple, store, dir };
}

interface Terminal {
	type: string;
	message?: string;
}

async function runTurn(h: Harness, prompt: string, systemPrompt?: string): Promise<Terminal> {
	const stream = h.streamSimple(
		model,
		contextWith(prompt, systemPrompt),
		{ cwd: h.dir } as unknown as SimpleStreamOptions,
	);
	let last: Terminal = { type: "none" };
	for await (const ev of stream) {
		if (ev.type === "done" || ev.type === "error") {
			// finalize() pushes the assistant message as `message` (done) or
			// `error` (error/aborted); both carry errorMessage the same way.
			const evt = ev as { message?: { errorMessage?: string }; error?: { errorMessage?: string } };
			last = { type: ev.type, message: (evt.error ?? evt.message)?.errorMessage };
		}
	}
	return last;
}

const OK_CONV = (conversationId: string): TurnOutcome => ({
	status: "OK",
	response: "ok",
	finished: true,
	aborted: false,
	conversationId,
	modelOutputSeen: true,
	sawResult: true,
});

function withEnv(values: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
	const prev: Record<string, string | undefined> = {};
	for (const [k, v] of Object.entries(values)) {
		prev[k] = process.env[k];
		if (v === undefined) delete process.env[k];
		else process.env[k] = v;
	}
	return fn().finally(() => {
		for (const [k, v] of Object.entries(prev)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
	});
}

test("silent over-cap drop: turn fails visibly and never stores the binding", async () => {
	const drop: TurnOutcome = {
		status: "OK",
		response: "",
		finished: true,
		aborted: false,
		conversationId: "conv-drop",
		modelOutputSeen: false,
		sawResult: true,
	};
	const h = harness([drop, OK_CONV("conv-after")]);
	try {
		const t1 = await runTurn(h, "hello");
		assert.equal(t1.type, "error");
		assert.match(t1.message ?? "", /silently dropped/);
		// Turn 2 must start FRESH: the dropped-turn binding was never stored.
		await runTurn(h, "retry");
		assert.equal(h.seen.opts?.conversationId ?? null, null);
	} finally {
		fs.rmSync(h.dir, { recursive: true, force: true });
	}
});

test("poisoned resumed conversation: deadline with no result clears the binding", async () => {
	const poisoned: TurnOutcome = {
		status: "ERROR",
		response: "",
		error: "agy stalled for 5m with no output",
		finished: true,
		aborted: false,
		conversationId: "conv-dead",
		deadline: "stall",
		sawResult: false,
		modelOutputSeen: false,
	};
	const h = harness([OK_CONV("conv-dead"), poisoned, OK_CONV("conv-fresh")]);
	try {
		const t1 = await runTurn(h, "turn one");
		assert.equal(t1.type, "done");
		// Turn 2 dies on the deadline with no result while conv-dead is bound.
		const t2 = await runTurn(h, "turn two");
		assert.equal(t2.type, "error");
		assert.match(t2.message ?? "", /fresh conversation/);
		// Turn 3 must NOT resume conv-dead: the binding was cleared.
		await runTurn(h, "turn three");
		assert.equal(h.seen.opts?.conversationId ?? null, null);
	} finally {
		fs.rmSync(h.dir, { recursive: true, force: true });
	}
});

test("a deadline error WITH a result frame keeps the binding (not a poison signal)", async () => {
	// The deadline fired but a result frame arrived first: the turn committed,
	// the conversation holds prior turns. Not a poison signal.
	const deadlineWithResult: TurnOutcome = {
		status: "ERROR",
		response: "",
		error: "agy exceeded the 10m turn timeout",
		finished: true,
		aborted: false,
		conversationId: "conv-alive",
		deadline: "timeout",
		sawResult: true,
		modelOutputSeen: true,
	};
	const h = harness([OK_CONV("conv-alive"), deadlineWithResult, OK_CONV("conv-next")]);
	try {
		const t1 = await runTurn(h, "turn one");
		assert.equal(t1.type, "done");
		const t2 = await runTurn(h, "turn two");
		assert.equal(t2.type, "error");
		// Turn 3 resumes the STILL-VALID binding.
		await runTurn(h, "turn three");
		assert.equal(h.seen.opts?.conversationId, "conv-alive");
	} finally {
		fs.rmSync(h.dir, { recursive: true, force: true });
	}
});

test("a real terse OK turn (modelOutputSeen=true) still settles as a normal reply", async () => {
	// False-positive guard: a terse but real turn must not trip the drop
	// signature.
	const terse: TurnOutcome = {
		status: "OK",
		response: "done",
		finished: true,
		aborted: false,
		conversationId: "conv-terse",
		modelOutputSeen: true,
		sawResult: true,
	};
	const h = harness([terse]);
	try {
		const t = await runTurn(h, "hello");
		assert.equal(t.type, "done");
	} finally {
		fs.rmSync(h.dir, { recursive: true, force: true });
	}
});

test("interleaved conversations stage isolated carriers (no cross-talk)", async () => {
	// Peer-review blocker regression (2026-09-30): staging used to be a single
	// per-process slot, so conversation B's fresh gate rewrote conversation A's
	// carrier file and a respawned driver leaked B's system prompt into A.
	// Staging is now content-addressed: one dir per distinct body.
	const SYS_A = "You are pi session A. Rules A1.";
	const SYS_B = "You are pi session B. Rules B2.";
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-iso-agents-"));
	await withEnv({ AGY_SYSTEM_PROMPT: "on", AGY_AGENT: undefined, AGY_AGENTS_ROOT: root }, async () => {
		resetSyspromptAgentForTests();
		const hA = harness([OK_CONV("conv-a"), OK_CONV("conv-a")]);
		const hB = harness([OK_CONV("conv-b")]);
		try {
			await runTurn(hA, "task a", SYS_A);
			await runTurn(hB, "task b", SYS_B);
			const agentA = hA.seen.opts?.agent ?? "";
			const agentB = hB.seen.opts?.agent ?? "";
			assert.ok(agentA.startsWith("pi-bridge-sys-"));
			assert.ok(agentB.startsWith("pi-bridge-sys-"));
			assert.notEqual(agentA, agentB, "distinct bodies must stage distinct carriers");
			const mdA = fs.readFileSync(path.join(root, agentA, "agent.md"), "utf8");
			const mdB = fs.readFileSync(path.join(root, agentB, "agent.md"), "utf8");
			assert.ok(mdA.includes(SYS_A) && !mdA.includes(SYS_B));
			assert.ok(mdB.includes(SYS_B) && !mdB.includes(SYS_A));
			// A later bound turn of conversation A keeps A's own carrier (profile
			// stability + correct instructions on respawn).
			await runTurn(hA, "task a2", SYS_A);
			assert.equal(hA.seen.opts?.agent, agentA);
			assert.equal(hA.seen.opts?.prompt, "task a2");
		} finally {
			for (const h of [hA, hB]) fs.rmSync(h.dir, { recursive: true, force: true });
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

test("a deadline drop is reported as a timeout, not an over-cap drop", async () => {
	// MINOR-B fix: the deadline guard's recovered-answer probe can settle OK
	// with an empty response after the child was killed. The error must name
	// the deadline, not the ~25KB cap.
	const stalledEmpty: TurnOutcome = {
		status: "OK",
		response: "",
		finished: true,
		aborted: false,
		conversationId: "conv-stall",
		deadline: "stall",
		modelOutputSeen: false,
		sawResult: false,
	};
	const h = harness([stalledEmpty]);
	try {
		const t = await runTurn(h, "hello");
		assert.equal(t.type, "error");
		assert.match(t.message ?? "", /time limit/);
		assert.doesNotMatch(t.message ?? "", /silently dropped/);
	} finally {
		fs.rmSync(h.dir, { recursive: true, force: true });
	}
});
