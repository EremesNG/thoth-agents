// Unit tests for buildFullPrompt (src/provider.ts).
//
// G10: pi's composed system prompt (operating instructions + AGENTS.md files)
// is prepended as a delimited block on the FIRST prompt of a fresh agy
// conversation. Pure function: no I/O. Run: npm test

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { normalizeContext, type Api, type Model, type SimpleStreamOptions, type TranscriptContext } from "@earendil-works/pi-ai";
import {
	SYSTEM_PROMPT_END,
	SYSTEM_PROMPT_PREAMBLE,
	TOOL_PRIORITY_NOTE,
	ToolRoundTrips,
	buildFullPrompt,
	createStreamSimple,
	type StreamSimpleDeps,
} from "../src/provider.js";
import { resetSyspromptAgentForTests } from "../src/sysprompt-agent.js";
import { SessionStore } from "../src/sessions.js";
import type { StreamDriver, DriverTurnRequest } from "../src/driver.js";

const SYS = "You are pi. Follow AGENTS.md.";

test("fresh conversation: system prompt block is prepended", () => {
	const out = buildFullPrompt(SYS, "", "hello");
	assert.ok(out.startsWith(SYSTEM_PROMPT_PREAMBLE));
	assert.ok(out.includes(SYS));
	assert.ok(out.endsWith(`${SYSTEM_PROMPT_END}\n\n---\n\nhello`));
	// Delimiters wrap exactly one block.
	assert.equal(out.split(SYSTEM_PROMPT_PREAMBLE).length, 2);
	assert.equal(out.split(SYSTEM_PROMPT_END).length, 2);
});

test("no system prompt: plain passthrough (disabled or absent)", () => {
	// The call site passes undefined when config.systemPrompt is off or the
	// conversation is already bound.
	assert.equal(buildFullPrompt(undefined, "", "hello"), "hello");
});

test("tool priority note rides the system prompt gate, before END", () => {
	const out = buildFullPrompt(SYS, "", "hello", "tui");
	const iNote = out.indexOf(TOOL_PRIORITY_NOTE);
	assert.ok(iNote > out.indexOf(SYS), "note comes after the user's system prompt");
	assert.ok(iNote < out.indexOf(SYSTEM_PROMPT_END), "note stays inside the delimited block");
	// Same gate: no system prompt, no note.
	assert.equal(buildFullPrompt(undefined, "", "hello").includes(TOOL_PRIORITY_NOTE), false);
});

test("tool priority note routes subagent delegation through pi (issue #6)", () => {
	// Native tools are named so the model recognizes what to avoid.
	assert.match(TOOL_PRIORITY_NOTE, /invoke_subagent/);
	assert.match(TOOL_PRIORITY_NOTE, /manage_subagents/);
	// Conditional: a session with no pi delegation tool bridged must still
	// be allowed to use native spawns, or the model refuses legitimate work.
	assert.match(TOOL_PRIORITY_NOTE, /only if no pi delegation tool/i);
	// Native spawns run inside agy and are invisible to pi-side harnesses.
	assert.match(TOOL_PRIORITY_NOTE, /invisible to pi/i);
	// Ecosystem delegation tool names are listed verbatim so the model
	// recognizes them in its own tool list (pi-subagents' "subagent",
	// Claude Code-style "Agent").
	assert.match(TOOL_PRIORITY_NOTE, /for example subagent, Agent, agent_spawn/);
});

test("empty-string system prompt is treated as absent", () => {
	assert.equal(buildFullPrompt("", "", "hello"), "hello");
});

test("order: system prompt block, then digest, then user prompt", () => {
	const out = buildFullPrompt(SYS, "[pi compaction summary]\nwe chose sqlite", "do it");
	const iSys = out.indexOf(SYS);
	const iDigest = out.indexOf("we chose sqlite");
	const iPrompt = out.indexOf("do it");
	assert.ok(iSys >= 0 && iDigest > iSys && iPrompt > iDigest);
});

test("digest without system prompt keeps digest preamble + prompt", () => {
	const out = buildFullPrompt(undefined, "digest-body", "hello");
	assert.ok(out.includes("\n\ndigest-body\n\n---\n\nhello"));
});

// --- G10 gating (fresh-vs-bound conversation) --------------------------------
// buildFullPrompt is pure; the DECISION lives in runTurnDriver
// (config.systemPrompt && !existing?.conversationId). On stream-json the
// delivery is a staged agent file via --agent, NOT prompt text: agy's
// ~25KB single-line cap silently drops over-cap turns and poisons the
// conversation (issue #2, probed 2026-09-30). Drive the real streamSimple
// with a fake driver and assert on the actual request handed to driver.run.

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
	dir: string;
}

function gateHarness(getSystemPromptOptions?: StreamSimpleDeps["getSystemPromptOptions"], mode: string | null = "tui", engine: "acp" | "stream-json" = "stream-json"): Harness {
	const seen: { opts?: DriverTurnRequest } = {};
	const driver: StreamDriver = {
		run: async (opts: DriverTurnRequest) => {
			seen.opts = opts;
			return {
				id: "fake-turn",
				outcome: Promise.resolve({
					status: "OK",
					response: "ok",
					finished: true,
					aborted: false,
					conversationId: "conv-g10",
				}),
				next: async () => null,
				pushExternal: () => {},
			};
		},
	} as unknown as StreamDriver;
	// One tmp dir = one stable session key (cwd-based) across both turns.
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-sysprompt-"));
	const streamSimple = createStreamSimple({
		getSystemPromptOptions,
		getSessionMode: mode === null ? undefined : () => mode,
		entries: [{ id: "gemini-flash", full: "gemini-3.6-flash" }],
		store: new SessionStore(path.join(dir, "sessions.json")),
		driver,
		acpDriver: engine === "acp" ? driver : undefined,
		engine,
		roundTrips: new ToolRoundTrips(driver),
	});
	return { seen, streamSimple, dir };
}

async function runTurn(h: Harness, prompt: string, systemPrompt?: string): Promise<void> {
	const stream = h.streamSimple(
		model,
		contextWith(prompt, systemPrompt),
		{ cwd: h.dir } as unknown as SimpleStreamOptions,
	);
	for await (const ev of stream) void ev;
}

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

test("gate: fresh conversation stages the system prompt as an agent, not prompt text", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-gate-agents-"));
	await withEnv({ AGY_SYSTEM_PROMPT: "on", AGY_AGENT: undefined, AGY_AGENTS_ROOT: root }, async () => {
		resetSyspromptAgentForTests();
		const h = gateHarness();
		try {
			await runTurn(h, "hello", SYS);
			// The prompt line carries ONLY the user message: the block must not
			// ride it (the cap drop is the bug being fixed).
			assert.equal(h.seen.opts?.prompt, "hello");
			const agent = h.seen.opts?.agent ?? "";
			assert.ok(agent.startsWith("pi-bridge-sys-"), "carrier agent passed via --agent");
			const md = fs.readFileSync(path.join(root, agent, "agent.md"), "utf8");
			assert.ok(md.includes(SYS));
			assert.ok(md.includes(TOOL_PRIORITY_NOTE));
		} finally {
			fs.rmSync(h.dir, { recursive: true, force: true });
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

test("print sessions stage tool guidance without the background preference", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-mode-agents-"));
	await withEnv({ AGY_SYSTEM_PROMPT: "on", AGY_AGENT: undefined, AGY_AGENTS_ROOT: root }, async () => {
		const h = gateHarness(undefined, "print");
		try {
			await runTurn(h, "hello", SYS);
			const md = fs.readFileSync(path.join(root, h.seen.opts!.agent!, "agent.md"), "utf8");
			assert.ok(md.includes("Long-running bridge calls do not fail"));
			assert.ok(!md.includes("prefer exec_command's session-output pattern or background agents"));
		} finally {
			fs.rmSync(h.dir, { recursive: true, force: true });
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

test.each(["tui", "print", "unknown", null])("ACP inline guidance for %s preserves the rest of the note", async (mode) => {
	await withEnv({ AGY_SYSTEM_PROMPT: "on", AGY_AGENT: undefined }, async () => {
		const h = gateHarness(undefined, mode, "acp");
		try {
			await runTurn(h, "hello", SYS);
			const expected = mode === "tui" ? TOOL_PRIORITY_NOTE : TOOL_PRIORITY_NOTE.replace(
				"For work you already know is long, prefer exec_command's session-output pattern or background agents so you keep working while it runs.",
				"For work you already know is long, run commands in the foreground within the turn.",
			);
			assert.ok(h.seen.opts!.prompt.includes(expected));
			assert.equal(h.seen.opts!.prompt.includes(TOOL_PRIORITY_NOTE), mode === "tui");
		} finally { fs.rmSync(h.dir, { recursive: true, force: true }); }
	});
});

test("stream-json stages distinct reusable carriers for tui and print with the same system prompt", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-mode-isolation-"));
	await withEnv({ AGY_SYSTEM_PROMPT: "on", AGY_AGENT: undefined, AGY_AGENTS_ROOT: root }, async () => {
		resetSyspromptAgentForTests();
		const sessions = [gateHarness(undefined, "tui"), gateHarness(undefined, "print"), gateHarness(undefined, "tui")];
		try {
			for (const h of sessions) await runTurn(h, "hello", SYS);
			const [tui, print, tuiAgain] = sessions.map((h) => h.seen.opts!.agent!);
			assert.notEqual(tui, print);
			assert.equal(tui, tuiAgain);
			assert.ok(fs.readFileSync(path.join(root, tui, "agent.md"), "utf8").includes(TOOL_PRIORITY_NOTE));
			const printBody = fs.readFileSync(path.join(root, print, "agent.md"), "utf8");
			assert.ok(printBody.includes("Long-running bridge calls do not fail"));
			assert.ok(!printBody.includes("prefer exec_command's session-output pattern or background agents"));
		} finally {
			for (const h of sessions) fs.rmSync(h.dir, { recursive: true, force: true });
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

test.each(["tui", "print"])("stream-json inline fallback keeps %s guidance on staging failure and user agent", async (mode) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-mode-fallback-"));
	const blocker = path.join(root, "file");
	fs.writeFileSync(blocker, "x");
	try {
		for (const [agent, agentsRoot] of [[undefined, blocker], ["custom-agent", root]] as const) {
			await withEnv({ AGY_SYSTEM_PROMPT: "on", AGY_AGENT: agent, AGY_AGENTS_ROOT: agentsRoot }, async () => {
				const h = gateHarness(undefined, mode);
				try {
					await runTurn(h, "hello", SYS);
					const prompt = h.seen.opts!.prompt;
					assert.ok(prompt.includes("Long-running bridge calls do not fail"));
					assert.equal(prompt.includes(TOOL_PRIORITY_NOTE), mode === "tui");
					assert.equal(prompt.includes("prefer exec_command's session-output pattern or background agents"), mode === "tui");
				} finally { fs.rmSync(h.dir, { recursive: true, force: true }); }
			});
		}
	} finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("gate: bound conversation keeps the carrier agent and never re-sends the block", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-gate-agents-"));
	await withEnv({ AGY_SYSTEM_PROMPT: "on", AGY_AGENT: undefined, AGY_AGENTS_ROOT: root }, async () => {
		resetSyspromptAgentForTests();
		const h = gateHarness();
		try {
			await runTurn(h, "hello", SYS);
			await runTurn(h, "turn two", SYS);
			// Turn 1 bound conv-g10 via the outcome; turn 2 must ride agy's own
			// history with the bare user message only. The agent name stays
			// stable so the driver profile never drifts on "agent".
			assert.equal(h.seen.opts?.prompt, "turn two");
			assert.ok((h.seen.opts?.agent ?? "").startsWith("pi-bridge-sys-"));
		} finally {
			fs.rmSync(h.dir, { recursive: true, force: true });
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

test("gate: systemPrompt off suppresses the block and the carrier agent", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-gate-agents-"));
	await withEnv({ AGY_SYSTEM_PROMPT: "off", AGY_AGENT: undefined, AGY_AGENTS_ROOT: root }, async () => {
		resetSyspromptAgentForTests();
		const h = gateHarness();
		try {
			await runTurn(h, "hello", SYS);
			assert.equal(h.seen.opts?.prompt, "hello");
			assert.equal(h.seen.opts?.agent, undefined);
		} finally {
			fs.rmSync(h.dir, { recursive: true, force: true });
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

test("gate: a user-configured agent wins; the block falls back inline (never clobber)", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-gate-agents-"));
	await withEnv({ AGY_SYSTEM_PROMPT: "on", AGY_AGENT: "my-own-agent", AGY_AGENTS_ROOT: root }, async () => {
		resetSyspromptAgentForTests();
		const h = gateHarness();
		try {
			await runTurn(h, "hello", SYS);
			assert.equal(h.seen.opts?.agent, "my-own-agent");
			const prompt = h.seen.opts?.prompt ?? "";
			assert.ok(!prompt.includes(SYSTEM_PROMPT_PREAMBLE));
			assert.ok(prompt.includes(SYS));
			// Nothing staged: the user's agent directory stays untouched.
			assert.equal(fs.readdirSync(root).length, 0);
		} finally {
			fs.rmSync(h.dir, { recursive: true, force: true });
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

test("carrier projects away Pi harness while preserving appended policy", async () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-projection-"));
 await withEnv({ AGY_SYSTEM_PROMPT: "on", AGY_AGENT: undefined, AGY_AGENTS_ROOT: root }, async () => {
  resetSyspromptAgentForTests();
  const h = gateHarness();
  try {
   await runTurn(h, "hello", "You are a coding assistant running inside pi.\n<tools>\nPi tools\n</tools>\n<addendum>\nThoth instructions\n</addendum>");
   const md = fs.readFileSync(path.join(root, h.seen.opts!.agent!, "agent.md"), "utf8");
   assert.ok(md.includes("Thoth instructions"));
   assert.ok(md.includes(TOOL_PRIORITY_NOTE));
   assert.ok(!md.includes(SYSTEM_PROMPT_PREAMBLE));
   assert.ok(!md.includes("You are a coding assistant running inside pi"));
   assert.ok(!md.includes("\nPi tools\n"));
  } finally { fs.rmSync(h.dir, { recursive:true, force:true }); fs.rmSync(root, { recursive:true, force:true }); }
 });
});

test("carrier uses the latest structured capture rather than assembled default sections", async () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"agy-structured-projection-"));
 await withEnv({AGY_SYSTEM_PROMPT:"on",AGY_AGENT:undefined,AGY_AGENTS_ROOT:root},async()=>{
  resetSyspromptAgentForTests();
  const h=gateHarness(()=>({cwd:"/project",appendSystemPrompt:"structured appended policy",sections:{tools:"operator override"},contextFiles:[{path:"AGENTS.md",content:"loaded project policy"}]}));
  try {
   await runTurn(h,"hello","You are a coding assistant running inside pi.\n<tools>\nassembled defaults\n</tools>");
   const md=fs.readFileSync(path.join(root,h.seen.opts!.agent!,"agent.md"),"utf8");
   for(const text of ["structured appended policy","operator override","loaded project policy"]) assert.ok(md.includes(text));
   assert.ok(!md.includes("assembled defaults"));
  } finally { fs.rmSync(h.dir,{recursive:true,force:true});fs.rmSync(root,{recursive:true,force:true}); }
 });
});
