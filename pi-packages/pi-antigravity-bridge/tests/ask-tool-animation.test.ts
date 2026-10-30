import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ExtensionAPI, Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
	getAnimationLevel,
	registerRenderKit,
	setAnimationLevel,
	withdrawRenderKit,
	type RenderKitToken,
} from "@thoth-agents/pi-core";
import { createTestRenderKit } from "@thoth-agents/pi-core/testing";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { registerAskAntigravityTool } from "../src/ask-tool.js";
import * as ownedProcess from "../src/owned-process.js";

const clockKey = Symbol.for("thoth.pi-core.animation-clock.v2");
const shared = globalThis as typeof globalThis & Record<symbol, unknown>;
const tokens: RenderKitToken[] = [];
const executions: Promise<unknown>[] = [];
const children: ReturnType<typeof fakeChild>[] = [];
const theme = {
	fg: (_role: string, text: string) => text,
	bg: (_role: string, text: string) => text,
	bold: (text: string) => text,
} as unknown as Theme;

type Update = Parameters<NonNullable<Parameters<ToolDefinition["execute"]>[3]>>[0];

function fakeChild() {
	const child = Object.assign(new EventEmitter(), {
		pid: undefined,
		stdin: null,
		stdout: new PassThrough(),
		stderr: new PassThrough(),
		exitCode: null as number | null,
		signalCode: null,
		kill: () => { finish(); return true; },
	});
	function finish(code = 0) {
		if (child.exitCode !== null) return;
		child.exitCode = code;
		child.emit("exit", code, null);
		child.emit("close", code, null);
	}
	return Object.assign(child, { finish });
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(0);
	delete shared[clockKey];
	vi.stubEnv("AGY_READONLY", "false");
	vi.spyOn(ownedProcess, "spawnOwnedProcess").mockImplementation(() => {
		const child = fakeChild();
		children.push(child);
		return child;
	});
	tokens.push(registerRenderKit(createTestRenderKit(), {}));
});

afterEach(async () => {
	for (const child of children.splice(0)) child.finish();
	await Promise.all(executions.splice(0));
	for (const token of tokens.splice(0)) withdrawRenderKit(token);
	expect(vi.getTimerCount()).toBe(0);
	delete shared[clockKey];
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

async function beginRun() {
	let registered: ToolDefinition | undefined;
	await registerAskAntigravityTool({
		registerTool: (tool: ToolDefinition) => { registered = tool; },
	} as unknown as ExtensionAPI, []);
	if (!registered?.renderResult) throw new Error("AskAntigravity was not registered");
	const tool = registered;
	const renderResult = registered.renderResult;
	const updates: Update[] = [];
	const controller = new AbortController();
	const execution = tool.execute("animation", {
		prompt: "answer", mode: "accept-edits", conversationId: "animation-test", cwd: process.cwd(),
	}, controller.signal, update => { updates.push(update); }, { cwd: process.cwd() } as Parameters<ToolDefinition["execute"]>[4]);
	executions.push(execution);
	const child = children.at(-1)!;
	const render = (update = updates.at(-1)!) => renderResult(update, {
		expanded: false, isPartial: true,
	}, theme, {
		state: {}, isPartial: true, executionStarted: true,
	} as Parameters<typeof renderResult>[3]).render(200).join("\n");
	return { updates, execution, child, controller, render };
}

test.each([
	["default", 200],
	["full", 200],
	["reduced", 200],
	["minimal", 500],
] as const)("%s emits every frame in order with refreshed elapsed time and status", async (level, stepMs) => {
	if (level !== "default") setAnimationLevel(level);
	expect(getAnimationLevel()).toBe(level === "default" ? "full" : level);
	const run = await beginRun();
	expect(run.updates).toHaveLength(0);
	const glyphs: string[] = [];
	for (let step = 0; step < 11; step++) {
		run.child.stdout.emit("data", `chunk-${step};`);
		vi.advanceTimersByTime(stepMs);
		expect(run.updates).toHaveLength(step + 1);
		const update = run.updates.at(-1)!;
		expect(update.details).toMatchObject({ durationMs: (step + 1) * stepMs });
		expect(update.content[0]).toMatchObject({ text: expect.stringContaining(`chunk-${step};`) });
		glyphs.push(run.render().match(/(\S+) AskAntigravity/)![1]);
		// An unrelated render between steps must not advance the frame.
		const clock = vi.spyOn(Date, "now").mockReturnValue(90_000);
		try {
			expect(run.render()).toContain(`${glyphs.at(-1)} AskAntigravity`);
		} finally {
			clock.mockRestore();
		}
	}
	expect(glyphs).toEqual(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏", "⠋"]);
});

test.each([
	["unicode", "◐"], ["ascii", "*"], ["native", "◐"],
] as const)("off uses the %s static glyph and refreshes status only every second", async (mode, glyph) => {
	if (mode === "native") withdrawRenderKit(tokens.pop()!);
	if (mode === "ascii") {
		const kit = createTestRenderKit();
		kit.statusGlyph = () => "*";
		tokens.push(registerRenderKit(kit, {}));
	}
	setAnimationLevel("off");
	const intervals = vi.spyOn(globalThis, "setInterval");
	const run = await beginRun();
	expect(vi.getTimerCount()).toBe(2); // watchdog plus static data refresh, no animation clock
	expect(intervals.mock.results[0].value.hasRef()).toBe(false);
	run.child.stdout.emit("data", "first");
	vi.advanceTimersByTime(999);
	expect(run.updates).toHaveLength(0);
	vi.advanceTimersByTime(1);
	expect(run.updates).toHaveLength(1);
	expect(run.updates[0].content[0]).toMatchObject({ text: "(running 1s)\n…first" });
	expect(run.updates[0].details).toMatchObject({ durationMs: 1000 });
	expect(run.render()).toContain(`${glyph} AskAntigravity`);
	run.child.stdout.emit("data", " second");
	vi.advanceTimersByTime(1000);
	expect(run.updates).toHaveLength(2);
	expect(run.updates[1].content[0]).toMatchObject({ text: "(running 2s)\n…first second" });
	expect(run.updates[1].details).toMatchObject({ durationMs: 2000 });
	expect(run.render()).toContain(`${glyph} AskAntigravity`);
});

test("level changes repaint static immediately and preserve the next animated frame", async () => {
	const run = await beginRun();
	vi.advanceTimersByTime(200);
	expect(run.render()).toContain("⠋ AskAntigravity");
	setAnimationLevel("minimal");
	vi.advanceTimersByTime(500);
	expect(run.updates).toHaveLength(2);
	expect(run.render()).toContain("⠙ AskAntigravity");
	setAnimationLevel("reduced");
	vi.advanceTimersByTime(200);
	expect(run.updates).toHaveLength(3);
	expect(run.render()).toContain("⠹ AskAntigravity");
	setAnimationLevel("off");
	expect(run.render()).toContain("◐ AskAntigravity");
	vi.advanceTimersByTime(999);
	expect(run.updates).toHaveLength(3);
	vi.advanceTimersByTime(1);
	expect(run.updates).toHaveLength(4);
	expect(run.render()).toContain("◐ AskAntigravity");
	setAnimationLevel("full");
	vi.advanceTimersByTime(200);
	expect(run.updates).toHaveLength(5);
	expect(run.render()).toContain("⠸ AskAntigravity");
});

test.each(["full", "off"] as const)("%s disposes heartbeat and level subscriptions on every exit path", async level => {
	setAnimationLevel(level);
	for (const outcome of ["completion", "failure", "error", "abort", "timeout", "spawn throw"] as const) {
		if (outcome === "spawn throw") {
			vi.mocked(ownedProcess.spawnOwnedProcess).mockImplementationOnce(() => { throw new Error("launch failed"); });
		}
		const run = await beginRun();
		if (outcome === "completion" || outcome === "failure") {
			run.child.stdout.emit("data", "answer");
			run.child.finish(outcome === "failure" ? 1 : 0);
		} else if (outcome === "error") run.child.emit("error", new Error("process failed"));
		else if (outcome === "abort") run.controller.abort();
		else if (outcome === "timeout") vi.advanceTimersByTime(600_000);
		const result = await run.execution;
		if (outcome === "abort") expect(result.details).toMatchObject({ aborted: true });
		if (outcome === "timeout") expect(result.details).toMatchObject({ timedOut: true });
		if (outcome === "error" || outcome === "spawn throw") expect(result.content[0]).toMatchObject({ text: expect.stringContaining("failed to run agy") });
		const updates = run.updates.length;
		expect(vi.getTimerCount()).toBe(0);
		setAnimationLevel(level === "off" ? "full" : "off");
		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(2000);
		expect(run.updates).toHaveLength(updates);
		setAnimationLevel(level);
	}
});
