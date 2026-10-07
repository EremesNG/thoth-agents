import assert from "node:assert/strict";
import type {
	EntryRenderer,
	ExtensionAPI,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	type RenderKitToken,
	registerRenderKit,
	withdrawRenderKit,
} from "@thoth-agents/pi-core";
import { createTestRenderKit } from "@thoth-agents/pi-core/testing";
import { afterEach, expect, test, vi } from "vitest";
import extension from "../extensions/index.js";
import type { NativeDisplayEvent } from "../src/provider.js";

type Handler = (event: unknown, context: unknown) => unknown;
const shutdowns: Handler[] = [];
const tokens: RenderKitToken[] = [];
afterEach(async () => {
	for (const token of tokens.splice(0)) withdrawRenderKit(token);
	for (const handler of shutdowns.splice(0))
		await handler({}, { hasUI: false });
	vi.unstubAllEnvs();
});

const theme = {
	fg: (role: string, text: string) => `«${role}:${text}»`,
	bg: () => {
		throw new Error("Entry renderers must not draw a native tool shell");
	},
} as unknown as Theme;

function registerKit(): RenderKitToken {
	const token = registerRenderKit(createTestRenderKit(), {});
	tokens.push(token);
	return token;
}

async function nativeRenderer(): Promise<EntryRenderer<NativeDisplayEvent>> {
	vi.stubEnv("AGY_ENGINE", "acp");
	vi.stubEnv("AGY_ASK_TOOL", "0");
	vi.stubEnv("AGY_WEB_TOOLS", "0");
	let renderer: EntryRenderer<NativeDisplayEvent> | undefined;
	await extension({
		on: (name: string, handler: Handler) => {
			if (name === "session_shutdown") shutdowns.push(handler);
		},
		registerProvider() {},
		registerTool() {},
		registerCommand() {},
		registerEntryRenderer: (
			name: string,
			render: EntryRenderer<NativeDisplayEvent>,
		) => {
			if (name === "agy-native-event") renderer = render;
		},
		getAllTools: () => [],
		getActiveTools: () => [],
	} as unknown as ExtensionAPI);
	if (!renderer) throw new Error("agy-native-event was not registered");
	return renderer;
}

function entry(
	data: NativeDisplayEvent,
): Parameters<EntryRenderer<NativeDisplayEvent>>[0] {
	return { data } as Parameters<EntryRenderer<NativeDisplayEvent>>[0];
}

test.each([
	"completed",
	"failed",
	"started",
	"pending",
	"running",
	"cancelled",
	"rejected",
	"skipped",
	"stopped",
	"unrecognized",
])("agy-native-event signals success only for completed events (%s), preserving native output", async (status) => {
	const render = await nativeRenderer();
	const component = render(
		entry({
			name: "bash",
			status: status as NativeDisplayEvent["status"],
			command: "run",
		}),
		{ expanded: false },
		theme,
	);
	assert.ok(component);
	const native = new Text(
		`${status === "failed" ? "«error:✗»" : "«success:✓»"} «toolTitle:bash» «muted:run»`,
		0,
		0,
	).render(120);
	expect(component.render(120)).toEqual(native);
	const kit = createTestRenderKit();
	const card = vi.spyOn(kit, "card");
	const token = registerRenderKit(kit, {});
	tokens.push(token);
	// HEAD gives every non-failed event a completed footer, even while running.
	expect(component.render(120).at(-1)).toBe(
		status === "failed" ? "╰─ failed" : "╰─ completed",
	);
	const options = card.mock.calls[0][1];
	expect(options.status).toBe(status === "failed" ? "failed" : "completed");
	expect(options.isSuccess).toBe(status === "completed");
	expect(options.isError).toBe(status === "failed");
	withdrawRenderKit(token);
	expect(component.render(120)).toEqual(native);
});

test.each([
	false,
	true,
])("agy-native-event reuses KIT lines (expanded=%s) until width, invalidation or registration changes", async (expanded) => {
	const render = await nativeRenderer();
	const data: NativeDisplayEvent = {
		name: "bash",
		status: "completed",
		command: "run\nverify",
		output: "done",
	};
	const create = () => {
		const component = render(entry(data), { expanded }, theme);
		assert.ok(component);
		return component;
	};
	const component = create();
	const native = component.render(100);
	const kit = createTestRenderKit();
	const card = vi.spyOn(kit, "card");
	tokens.push(registerRenderKit(kit, {}));
	const lines = component.render(100);
	expect(lines).toEqual([
		"╭─ bash",
		...(expanded
			? [
					"├─ Command",
					"«toolOutput:run»",
					"«toolOutput:verify»",
					"├─ Output",
					"«toolOutput:done»",
				]
			: ["«muted:run»"]),
		"╰─ completed",
	]);
	expect(component.render(100)).toBe(lines);
	expect(card).toHaveBeenCalledTimes(1);
	component.render(40);
	expect(card).toHaveBeenCalledTimes(2);
	component.invalidate();
	component.render(40);
	expect(card).toHaveBeenCalledTimes(3);
	expect(component.render(100)).toEqual(lines);
	expect(card).toHaveBeenCalledTimes(4);
	expect(create().render(100)).toEqual(lines);
	expect(card).toHaveBeenCalledTimes(5);

	const replacement = createTestRenderKit();
	const replacementCard = vi.spyOn(replacement, "card");
	const replacementToken = registerRenderKit(replacement, {});
	tokens.push(replacementToken);
	expect(component.render(100)).toEqual(lines);
	expect(component.render(100)).toEqual(lines);
	expect(replacementCard).toHaveBeenCalledTimes(1);
	withdrawRenderKit(replacementToken);
	expect(component.render(100)).toEqual(native);
	const nativeInvalidate = vi.spyOn(Text.prototype, "invalidate");
	component.invalidate();
	expect(nativeInvalidate).toHaveBeenCalledTimes(1);
	expect(component.render(100)).toEqual(native);
	nativeInvalidate.mockRestore();
	tokens.push(registerRenderKit(kit, {}));
	expect(component.render(100)).toEqual(lines);
	expect(card).toHaveBeenCalledTimes(6);
});

test("agy-native-event switches KIT sections and unchanged native Text on the same entry component", async () => {
	const render = await nativeRenderer();
	const component = render(
		entry({
			name: "edit",
			status: "failed",
			path: "/work/foo.ts",
			command: "apply patch\nverify",
			diff: " context\n-before\n+after",
			output: "patch failed",
		}),
		{ expanded: true },
		theme,
	);
	assert.ok(component);
	const native = new Text(
		[
			"«error:✗» «toolTitle:edit» «muted:foo.ts»",
			"«dim:/work/foo.ts»",
			"«toolDiffContext: context»",
			"«toolDiffRemoved:-before»",
			"«toolDiffAdded:+after»",
			"«toolOutput:patch failed»",
		].join("\n"),
		0,
		0,
	).render(240);
	expect(component.render(240)).toEqual(native);
	const token = registerKit();
	const themed = component.render(240).join("\n");
	expect(themed).toContain("╭─ ! edit");
	expect(themed).toContain("├─ Diff");
	expect(themed).toContain("├─ Command");
	expect(themed).toContain("├─ Output");
	expect(themed).toContain("«toolDiffContext: context»");
	expect(themed).toContain("«toolDiffRemoved:-before»");
	expect(themed).toContain("«toolDiffAdded:+after»");
	expect(themed).toContain("«toolOutput:apply patch»");
	expect(themed).toContain("«toolOutput:verify»");
	expect(themed).toContain("patch failed");
	withdrawRenderKit(token);
	expect(component.render(240)).toEqual(native);
	registerKit();
	expect(component.render(240).join("\n")).toContain("├─ Diff");
});

test.each([
	{
		data: {
			name: "edit",
			status: "completed" as const,
			path: "/work/foo.ts",
			command: "run command",
			output: "display text",
			diff: "+change",
		},
		detail: "foo.ts",
	},
	{
		data: {
			name: "bash",
			status: "completed" as const,
			command: "run command\nsecond line",
			output: "display text",
		},
		detail: "run command",
	},
	{
		data: {
			name: "ls",
			status: "completed" as const,
			output: "display text\nsecond line",
		},
		detail: "display text",
	},
	{ data: { name: "ls", status: "completed" as const }, detail: undefined },
])("collapsed native events retain detail precedence without duplicated names ($detail)", async ({
	data,
	detail,
}) => {
	const render = await nativeRenderer();
	const component = render(entry(data), { expanded: false }, theme);
	assert.ok(component);
	const expected = `«success:✓» «toolTitle:${data.name}»${detail ? ` «muted:${detail}»` : ""}`;
	expect(component.render(240)).toEqual(new Text(expected, 0, 0).render(240));
	registerKit();
	const themed = component.render(240).join("\n");
	expect(themed).toContain(`╭─ ${data.name}`);
	if (detail) expect(themed).toContain(`«muted:${detail}»`);
	expect(themed).not.toContain("├─");
	expect(themed).not.toContain("second line");
	expect(themed).not.toContain(`«muted:${data.name}»`);
});

test("successful expanded diff entries omit redundant output in both paths", async () => {
	const render = await nativeRenderer();
	const component = render(
		entry({
			name: "edit",
			status: "completed",
			diff: "+change",
			output: "redundant output",
		}),
		{ expanded: true },
		theme,
	);
	assert.ok(component);
	expect(component.render(120).join("\n")).not.toContain(
		"«toolOutput:redundant output»",
	);
	registerKit();
	const themed = component.render(120).join("\n");
	expect(themed).toContain("├─ Diff");
	expect(themed).not.toContain("├─ Output");
	expect(themed).not.toContain("redundant output");
});
