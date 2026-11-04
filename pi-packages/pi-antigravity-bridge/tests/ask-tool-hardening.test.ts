import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ExtensionAPI, Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { getAnimationLevel, setAnimationLevel } from "@thoth-agents/pi-core";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { registerAskAntigravityTool } from "../src/ask-tool.js";
import * as ownedProcess from "../src/owned-process.js";

type Update = Parameters<NonNullable<Parameters<ToolDefinition["execute"]>[3]>>[0];
const theme = {
	fg: (_role: string, text: string) => text,
	bg: (_role: string, text: string) => text,
} as unknown as Theme;
const children: ReturnType<typeof fakeChild>[] = [];
const executions: Promise<unknown>[] = [];
let previousAnimation: ReturnType<typeof getAnimationLevel>;

function fakeChild() {
	const child = Object.assign(new EventEmitter(), {
		pid: undefined,
		jobBacked: true,
		stdin: null,
		stdout: new PassThrough(),
		stderr: new PassThrough(),
		exitCode: null as number | null,
		signalCode: null,
		kill: () => true,
	});
	return Object.assign(child, {
		finish(code = 0) {
			child.exitCode = code;
			child.emit("close", code, null);
		},
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubEnv("AGY_READONLY", "false");
	previousAnimation = getAnimationLevel();
	setAnimationLevel("off");
	vi.spyOn(ownedProcess, "spawnOwnedProcess").mockImplementation(() => {
		const child = fakeChild();
		children.push(child);
		return child;
	});
});

afterEach(async () => {
	for (const child of children.splice(0)) child.finish();
	await Promise.all(executions.splice(0));
	setAnimationLevel(previousAnimation);
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

async function registerTool() {
	let tool: ToolDefinition | undefined;
	await registerAskAntigravityTool({
		registerTool: (definition: ToolDefinition) => { tool = definition; },
	} as unknown as ExtensionAPI, [], undefined, "private");
	if (!tool?.renderResult) throw new Error("AskAntigravity did not register");
	return tool;
}

async function beginRun() {
	const tool = await registerTool();
	const updates: Update[] = [];
	const execution = tool.execute("hardening", {
		prompt: "review", mode: "accept-edits", conversationId: "hardening-test",
	}, undefined, update => { updates.push(update); }, {
		cwd: process.cwd(),
	} as Parameters<ToolDefinition["execute"]>[4]);
	executions.push(execution);
	return { execution, updates, child: children.at(-1)! };
}

const SECRET = "sk-abcdefghijklmnopqrstuvwx";
const CONVERSATION_FOOTER = "\n\n[agy conversationId: hardening-test - pass as conversationId to continue this conversation]";

test.each(["success", "nonzero", "empty", "spawn error"])(
	"%s results and progress persist redacted reassembled stderr, not raw credentials",
	async (outcome) => {
		const { execution, updates, child } = await beginRun();
		child.stderr.emit("data", `diagnostic ${SECRET.slice(0, 8)}`);
		child.stderr.emit("data", `${SECRET.slice(8)}\nAuthorization: Bearer bearer-secret\n`);
		if (outcome !== "empty") child.stdout.emit("data", `answer with ${SECRET}`);
		vi.advanceTimersByTime(1000);
		if (outcome === "spawn error") child.emit("error", new Error("launch failed"));
		else child.finish(outcome === "nonzero" ? 1 : 0);
		const result = await execution;
		for (const exposed of [...updates, result]) {
			expect(exposed.details).toMatchObject({
				stderr: "diagnostic <redacted>\nAuthorization: Bearer <redacted>\n",
			});
		}
		if (outcome === "success" || outcome === "nonzero") {
			expect(result.content[0]).toMatchObject({ text: expect.stringContaining(`answer with ${SECRET}`) });
		}
	},
);

test.each(["newline", "close", "process error"])("progress keeps an incomplete stderr credential private until %s", async (completion) => {
	const { execution, updates, child } = await beginRun();
	child.stderr.emit("data", "safe diagnostic\ndiagnostic sk-abcdefghijk");
	vi.advanceTimersByTime(1000);
	expect(updates).toHaveLength(1);
	expect(updates[0].details).toMatchObject({ stderr: "safe diagnostic\n" });

	child.stderr.emit("data", "lmnopqrstuvwx");
	vi.advanceTimersByTime(1000);
	expect(updates).toHaveLength(2);
	expect(updates[1].details).toMatchObject({ stderr: "safe diagnostic\n" });
	if (completion === "newline") {
		child.stderr.emit("data", "\n");
		vi.advanceTimersByTime(1000);
		expect(updates[2].details).toMatchObject({ stderr: "safe diagnostic\ndiagnostic <redacted>\n" });
	}
	child.stdout.emit("data", "answer");
	if (completion === "process error") child.emit("error", new Error("launch failed"));
	else child.finish();
	const result = await execution;
	expect(result.details).toMatchObject({
		stderr: `safe diagnostic\ndiagnostic <redacted>${completion === "newline" ? "\n" : ""}`,
	});
	for (const update of updates) expect(JSON.stringify(update.details)).not.toContain("sk-abcdefghijk");
});

// Caps include the truncation marker and are in UTF-16 code units, like JS strings.
test.each(["one oversized chunk", "many chunks"])("retained output stays bounded for %s and preserves answer head/tail and recent diagnostics", async (delivery) => {
	const { execution, updates, child } = await beginRun();
	const stdout = `ANSWER START\n${"x".repeat(1_100_000)}\nANSWER END`;
	const stderr = `obsolete diagnostic\n${"e".repeat(100_000)}\nlatest diagnostic\n`;
	for (const [stream, text] of [[child.stdout, stdout], [child.stderr, stderr]] as const) {
		const chunkSize = delivery === "one oversized chunk" ? text.length : 8192;
		for (let i = 0; i < text.length; i += chunkSize) stream.emit("data", text.slice(i, i + chunkSize));
	}
	vi.advanceTimersByTime(1000);
	child.finish();
	const result = await execution;
	const answer = (result.content[0] as { text: string }).text;
	expect(answer.length).toBeLessThanOrEqual(1_000_000 + CONVERSATION_FOOTER.length);
	expect(answer).toMatch(/^ANSWER START\n/);
	expect(answer).toContain("[stdout truncated]");
	expect(answer.endsWith(`\nANSWER END${CONVERSATION_FOOTER}`)).toBe(true);
	for (const exposed of [...updates, result]) {
		expect(exposed.details).toMatchObject({ stdoutTruncated: true, stderrTruncated: true });
		const retained = (exposed.details as { stderr: string }).stderr;
		expect(retained.length).toBeLessThanOrEqual(65_536);
		expect(retained).toMatch(/^\[stderr truncated\]/);
		expect(retained.endsWith("latest diagnostic\n")).toBe(true);
		expect(retained).not.toContain("obsolete diagnostic");
	}
});

test.each(["one chunk", "split after overflow"])("stderr truncation does not expose credential suffixes when dropping their prefix (%s)", async (delivery) => {
	const { execution, updates, child } = await beginRun();
	const oversizedSecret = `Authorization: Bearer ${"s".repeat(100_000)}`;
	if (delivery === "one chunk") child.stderr.emit("data", `${oversizedSecret}\nrecent diagnostic`);
	else {
		child.stderr.emit("data", oversizedSecret);
		vi.advanceTimersByTime(1000);
		child.stderr.emit("data", "ssss-private-suffix\nrecent diagnostic");
	}
	child.stdout.emit("data", "answer");
	vi.advanceTimersByTime(1000);
	child.finish();
	const result = await execution;
	for (const exposed of [...updates, result]) {
		const retained = (exposed.details as { stderr: string }).stderr;
		expect(retained).not.toContain("ssss");
		expect(retained).not.toContain("private-suffix");
		expect(retained.length).toBeLessThanOrEqual(65_536);
	}
	expect((result.details as { stderr: string }).stderr).toContain("recent diagnostic");
});

test("stderr remains line-safe when redaction expands complete lines beyond the retention cap", async () => {
	const { execution, updates, child } = await beginRun();
	// Raw stderr fits the cap; replacing each short cookie with <redacted>
	// expands the published text beyond it without triggering the raw valve.
	child.stderr.emit("data", `${"cookie: a\n".repeat(6000)}recent diagnostic\n`);
	child.stdout.emit("data", "answer");
	vi.advanceTimersByTime(1000);
	child.finish();
	const result = await execution;
	for (const exposed of [...updates, result]) {
		expect(exposed.details).toMatchObject({ stderrTruncated: true });
		const retained = (exposed.details as { stderr: string }).stderr;
		expect(retained.length).toBeLessThanOrEqual(65_536);
		expect(retained.startsWith("[stderr truncated]\ncookie: <redacted>\n")).toBe(true);
		expect(retained.endsWith("recent diagnostic\n")).toBe(true);
		const lines = retained.split("\n");
		for (const line of lines.slice(1, -2)) expect(line).toBe("cookie: <redacted>");
	}
});

test("normal-size stdout remains the complete unredacted answer, trimmed once", async () => {
	const { execution, child } = await beginRun();
	child.stdout.emit("data", `  answer start ${SECRET}\n`);
	child.stdout.emit("data", `${"detail\n".repeat(1000)}answer end  \n`);
	child.finish();
	const result = await execution;
	expect(result.content[0]).toMatchObject({
		text: `answer start ${SECRET}\n${"detail\n".repeat(1000)}answer end${CONVERSATION_FOOTER}`,
	});
	expect(result.details).not.toMatchObject({ stdoutTruncated: true });
	expect(result.details).not.toMatchObject({ stderrTruncated: true });
});

test.each([
	{ reason: "readOnly accept-edits", readOnly: true, params: { mode: "accept-edits" } },
	{ reason: "readOnly plan", readOnly: true, params: { mode: "plan" } },
	{ reason: "antigravity provider", provider: "antigravity" },
	{ reason: "agy provider", provider: "agy" },
	{ reason: "option-shaped model", params: { model: "--invalid" } },
	{ reason: "missing cwd", params: { cwd: `${import.meta.filename}-missing` } },
	{ reason: "file cwd", params: { cwd: import.meta.filename } },
	{ reason: "invalid timeout", params: { timeoutMinutes: 0 } },
])("$reason refusal reports a host error and renders as failed without spawning", async ({ readOnly, provider, params }) => {
	if (readOnly) vi.stubEnv("AGY_READONLY", "true");
	const tool = await registerTool();
	const result = await tool.execute("refusal", { prompt: "review", ...params }, undefined, undefined, {
		cwd: process.cwd(), model: provider ? { provider } : undefined,
	} as Parameters<ToolDefinition["execute"]>[4]);
	expect(ownedProcess.spawnOwnedProcess).not.toHaveBeenCalled();
	expect((result as { isError?: boolean }).isError).toBe(true);
	expect(result.details).toMatchObject({ refused: true });
	expect((result.details as { exitCode: number }).exitCode).not.toBe(0);
	const rendered = tool.renderResult!(result, { expanded: false, isPartial: false }, theme, {
		state: {}, isPartial: false, isError: true,
	} as Parameters<NonNullable<ToolDefinition["renderResult"]>>[3]);
	expect(rendered.render(200).join("\n")).toContain("✗ AskAntigravity error");
});

test("host isError also selects the failed glyph when subprocess details look successful", async () => {
	const tool = await registerTool();
	const rendered = tool.renderResult!({
		content: [{ type: "text", text: "host failure" }], details: { exitCode: 0 },
	}, { expanded: false, isPartial: false }, theme, {
		state: {}, isPartial: false, isError: true,
	} as Parameters<NonNullable<ToolDefinition["renderResult"]>>[3]);
	expect(rendered.render(200).join("\n")).toContain("✗ AskAntigravity error");
});
