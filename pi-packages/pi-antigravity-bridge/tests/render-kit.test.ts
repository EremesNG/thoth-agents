import type {
	ExtensionAPI,
	Theme,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import {
	type RenderKitToken,
	registerRenderKit,
	withdrawRenderKit,
} from "@thoth-agents/pi-core";
import { createTestRenderKit } from "@thoth-agents/pi-core/testing";
import { afterEach, expect, test, vi } from "vitest";
import { registerAskAntigravityTool } from "../src/ask-tool.js";

type ToolRenderContext = Parameters<
	NonNullable<ToolDefinition["renderCall"]>
>[2];
const tokens: RenderKitToken[] = [];
afterEach(() => {
	for (const token of tokens.splice(0)) withdrawRenderKit(token);
	vi.unstubAllEnvs();
});

const theme = {
	fg: (_role: string, text: string) => text,
	bold: (text: string) => text,
	bg: (role: string, text: string) =>
		`\u001b[${role === "toolPendingBg" ? 43 : role === "toolErrorBg" ? 41 : 42}m${text}\u001b[0m`,
} as unknown as Theme;

function registerKit(): RenderKitToken {
	const token = registerRenderKit(createTestRenderKit(), {});
	tokens.push(token);
	return token;
}

function context(
	overrides: Partial<ToolRenderContext> = {},
): ToolRenderContext {
	return {
		args: {},
		toolCallId: "render-test",
		invalidate() {},
		lastComponent: undefined,
		state: {},
		cwd: process.cwd(),
		executionStarted: true,
		argsComplete: true,
		isPartial: true,
		expanded: false,
		showImages: false,
		isError: false,
		...overrides,
	};
}

async function askTool(): Promise<
	ToolDefinition & Required<Pick<ToolDefinition, "renderCall" | "renderResult">>
> {
	let tool: ToolDefinition | undefined;
	await registerAskAntigravityTool(
		{
			registerTool: (definition: ToolDefinition) => {
				tool = definition;
			},
		} as unknown as ExtensionAPI,
		[],
	);
	if (!tool?.renderCall || !tool.renderResult)
		throw new Error("AskAntigravity renderers were not registered");
	return {
		...tool,
		renderCall: tool.renderCall,
		renderResult: tool.renderResult,
	};
}

function nativeBox(
	text: string,
	role: "toolPendingBg" | "toolSuccessBg" | "toolErrorBg",
	width: number,
): string[] {
	const box = new Box(1, 1, (row) => theme.bg(role, row));
	box.addChild(new Text(text, 0, 0));
	return box.render(width);
}

test("AskAntigravity keeps its self shell and discovers KIT on every call-component render", async () => {
	vi.stubEnv("AGY_DEFAULT_THINKING", "high");
	const tool = await askTool();
	expect(tool.renderShell).toBe("self");
	const component = tool.renderCall(
		{
			prompt: "review",
			model: "review-model",
			mode: "plan",
			includeContext: true,
			conversationId: "conv-1",
		},
		theme,
		context(),
	);
	const expected = nativeBox(
		'AskAntigravity [model=review-model, thinking=high, mode=plan, digest, continue, context=full] "review"',
		"toolPendingBg",
		160,
	);
	expect(component.render(160)).toEqual(expected);
	const token = registerKit();
	const themed = component.render(160).join("\n");
	expect(themed).toContain("╭─ AskAntigravity");
	expect(themed).toContain(
		"model=review-model, thinking=high, mode=plan, digest, continue, context=full",
	);
	expect(themed).toContain('"review"');
	expect(themed).not.toContain("\u001b[43m");
	withdrawRenderKit(token);
	expect(component.render(160)).toEqual(expected);
	registerKit();
	expect(component.render(160).join("\n")).toContain("╭─ AskAntigravity");
});

test.each([
	{
		isPartial: true,
		isError: false,
		details: { exitCode: 0 },
		body: "(running 12s)",
		title: "◉ AskAntigravity (running 12s)",
		role: "toolPendingBg" as const,
		status: "running",
	},
	{
		isPartial: false,
		isError: false,
		details: { exitCode: 0, durationMs: 12345 },
		body: "answer",
		title: "✓ AskAntigravity 12.3s\nanswer",
		role: "toolSuccessBg" as const,
		status: "completed",
	},
	{
		isPartial: false,
		isError: true,
		details: { exitCode: 0, empty: true },
		body: "produced no output",
		title: "✗ AskAntigravity error\nproduced no output",
		role: "toolErrorBg" as const,
		status: "failed",
	},
])("AskAntigravity $status results switch KIT and native backgrounds on the same component", async ({
	isPartial,
	isError,
	details,
	body,
	title,
	role,
	status,
}) => {
	const tool = await askTool();
	const component = tool.renderResult(
		{ content: [{ type: "text", text: body }], details },
		{ expanded: false, isPartial },
		theme,
		context({ isPartial, isError }),
	);
	const token = registerKit();
	const themed = component.render(120).join("\n");
	expect(themed).toContain("╰─");
	expect(themed).not.toContain("╭─");
	expect(themed).toContain("AskAntigravity");
	expect(themed).toContain(body);
	expect(themed).toContain(status);
	if (!isPartial && !isError) expect(themed).toContain("12.3s");
	expect(themed).not.toContain("\u001b[4");
	withdrawRenderKit(token);
	const native = new Box(1, 0, (row) => theme.bg(role, row));
	native.addChild(new Text(title, 0, 0));
	expect(component.render(120)).toEqual([
		...native.render(120),
		theme.bg(role, " ".repeat(120)),
	]);
	registerKit();
	expect(component.render(120).join("\n")).toContain("╰─");
});

test.each([
	{
		isPartial: true,
		isError: false,
		resultText: "◉ AskAntigravity working",
		role: "toolPendingBg" as const,
	},
	{
		isPartial: false,
		isError: false,
		resultText: "✓ AskAntigravity\nworking",
		role: "toolSuccessBg" as const,
	},
	{
		isPartial: false,
		isError: true,
		resultText: "✗ AskAntigravity error\nworking",
		role: "toolErrorBg" as const,
	},
])("stacked AskAntigravity call/result use one padded native shell with $role", async ({
	isPartial,
	isError,
	resultText,
	role,
}) => {
	vi.stubEnv("AGY_DEFAULT_THINKING", "high");
	const tool = await askTool();
	const shared = context();
	const call = tool.renderCall(
		{ prompt: "review", model: "review-model" },
		theme,
		shared,
	);
	// Rendering before a result exists must still close the standalone native shell.
	const callText =
		'AskAntigravity [model=review-model, thinking=high] "review"';
	expect(call.render(120)).toEqual(nativeBox(callText, "toolPendingBg", 120));
	const result = tool.renderResult(
		{
			content: [{ type: "text", text: "working" }],
			details: { exitCode: isError ? 1 : 0 },
		},
		{ expanded: true, isPartial },
		theme,
		{ ...shared, isPartial, isError, lastComponent: undefined },
	);
	const expected = new Box(1, 1, (row) => theme.bg(role, row));
	expected.addChild(new Text(callText, 0, 0));
	expected.addChild(new Text(resultText, 0, 0));
	const stacked = [...call.render(120), ...result.render(120)];
	expect(stacked).toEqual(expected.render(120));
	expect(
		stacked.filter((row) => row === theme.bg(role, " ".repeat(120))),
	).toHaveLength(2);
	registerKit();
	const themed = [...call.render(120), ...result.render(120)];
	expect(themed.filter((row) => row.startsWith("╭─"))).toHaveLength(1);
	expect(themed.filter((row) => row.startsWith("╰─"))).toHaveLength(1);
	expect(themed.some((row) => row.startsWith("╭─ !"))).toBe(isError);
});

test("AskAntigravity preserves result tags and expanded versus preview content with either shell", async () => {
	initTheme("dark", false);
	const tool = await askTool();
	const body = "one\ntwo\nthree\nfour\nfive\nsix\nseventh-line";
	for (const kitPresent of [false, true]) {
		const token = kitPresent ? registerKit() : undefined;
		for (const expanded of [false, true]) {
			const component = tool.renderResult(
				{
					content: [{ type: "text", text: body }],
					details: {
						exitCode: 0,
						resolvedModel: "gemini-pro",
						thinking: "high",
						mode: "plan",
						includeContext: true,
						durationMs: 845000,
					},
				},
				{ expanded, isPartial: false },
				theme,
				context({ expanded, isPartial: false }),
			);
			const text = component.render(160).join("\n");
			expect(text).toContain(
				"model=gemini-pro, thinking=high, mode=plan, context=full",
			);
			expect(text).toContain("14m 05s");
			expect(text).toContain("six");
			expect(text.includes("seventh-line")).toBe(expanded);
			expect(text.includes("to expand")).toBe(!expanded);
		}
		if (token) withdrawRenderKit(token);
	}
});
