// Regression for the stream-json native tool-output wire shape captured from
// agy: completed tool output lives at step_update.tool_info.output. The fake
// child process below keeps this suite offline while exercising StreamDriver's
// real stdout parser/mapper and the provider's display-only replay path.

import assert from "node:assert/strict";
import { vi, test } from "vitest";

const fakeChild = vi.hoisted(() => {
	type Listener = (...args: any[]) => void;
	class FakeEmitter {
		#listeners = new Map<string, Listener[]>();

		on(event: string, listener: Listener): this {
			const list = this.#listeners.get(event) ?? [];
			list.push(listener);
			this.#listeners.set(event, list);
			return this;
		}

		emit(event: string, ...args: any[]): boolean {
			for (const listener of this.#listeners.get(event) ?? []) listener(...args);
			return true;
		}

		removeAllListeners(event?: string): this {
			if (event) this.#listeners.delete(event);
			else this.#listeners.clear();
			return this;
		}

		setEncoding(_encoding: string): this {
			return this;
		}
	}

	class FakeStdin extends FakeEmitter {
		write(_chunk: string): boolean {
			return true;
		}
	}

	class FakeChild extends FakeEmitter {
		pid = 7391;
		stdin = new FakeStdin();
		stdout = new FakeEmitter();
		stderr = new FakeEmitter();

		kill(_signal?: string): boolean {
			this.emit("exit", null);
			return true;
		}
	}

	const state = {
		frames: [] as string[],
		spawn: vi.fn(() => {
			const child = new FakeChild();
			const frames = [...state.frames];
			child.stdin.write = (_chunk: string): boolean => {
				queueMicrotask(() => {
					for (const frame of frames) child.stdout.emit("data", `${frame}\n`);
				});
				return true;
			};
			return child;
		}),
	};
	return state;
});

vi.mock("node:child_process", async () => ({
	...(await vi.importActual<typeof import("node:child_process")>("node:child_process")),
	spawn: fakeChild.spawn,
}));

import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { StreamDriver, type DriverActivity } from "../src/driver.js";
import {
	BlockState,
	ToolRoundTrips,
	WrapperReplay,
	consumeActivity,
} from "../src/provider.js";
import { TurnDiffContext } from "../src/diff-render.js";

const RAW_MARKER = "AGY_RAW_ECHO_7391_c39831aa\r\n";
const LEGACY_MARKER = "legacy-response-text";

type StepPatch = Record<string, unknown>;

function toolFrame(patch: StepPatch): string {
	return JSON.stringify({
		event: "step_update",
		step_update: {
			step_index: 2,
			state: "DONE",
			step_type: "tool",
			tool_name: "run_command",
			tool_info: {
				name: "run_command",
				parameters: { CommandLine: "echo AGY_RAW_ECHO_7391_c39831aa" },
			},
			...patch,
		},
	});
}

async function runWire(patch: StepPatch): Promise<{ driver: StreamDriver; activities: DriverActivity[] }> {
	fakeChild.frames = [
		JSON.stringify({ event: "init", init: { conversation_id: "conv-native-output" } }),
		toolFrame(patch),
		JSON.stringify({ event: "result", result: { status: "SUCCESS", response: "" } }),
	];
	const driver = new StreamDriver();
	const handle = await driver.run({
		prompt: "display the command result",
		cwd: process.cwd(),
		model: "gemini-3.8-flash",
		mode: "accept-edits",
		skipPermissions: true,
		timeoutMin: 1,
		inactivityMin: 1,
	});
	const activities: DriverActivity[] = [];
	for (;;) {
		const activity = await handle.next();
		if (activity === null) break;
		activities.push(activity);
	}
	assert.equal((await handle.outcome).status, "OK");
	await driver.close("shutdown");
	return { driver, activities };
}

function toolDone(activities: DriverActivity[]): Extract<DriverActivity, { type: "tool_done" }> {
	const activity = activities.find(
		(a): a is Extract<DriverActivity, { type: "tool_done" }> => a.type === "tool_done",
	);
	assert.ok(activity, "the DONE tool step should reach DriverActivity");
	return activity;
}

const outputCases: Array<{ name: string; patch: StepPatch; expected: string | undefined }> = [
	{
		name: "observed nested output without response_text",
		patch: {
			tool_info: {
				name: "run_command",
				parameters: { CommandLine: "echo AGY_RAW_ECHO_7391_c39831aa" },
				output: RAW_MARKER,
			},
		},
		expected: RAW_MARKER,
	},
	{
		name: "legacy response_text remains compatible",
		patch: { response_text: LEGACY_MARKER },
		expected: LEGACY_MARKER,
	},
	{
		name: "absent output stays absent",
		patch: {},
		expected: undefined,
	},
	{
		name: "malformed object output is ignored without serialization",
		patch: { tool_info: { output: { text: RAW_MARKER } } },
		expected: undefined,
	},
	{
		name: "non-string output falls back to legacy response_text",
		patch: { tool_info: { output: 0 }, response_text: LEGACY_MARKER },
		expected: LEGACY_MARKER,
	},
	{
		name: "explicit empty nested output is preserved",
		patch: { tool_info: { output: "" }, response_text: LEGACY_MARKER },
		expected: "",
	},
	{
		name: "nested output takes precedence when both fields are present",
		patch: { tool_info: { output: RAW_MARKER }, response_text: LEGACY_MARKER },
		expected: RAW_MARKER,
	},
	{
		name: "malformed tool_info does not crash the DONE mapping",
		patch: { tool_info: null, response_text: LEGACY_MARKER },
		expected: LEGACY_MARKER,
	},
];

for (const { name, patch, expected } of outputCases) {
	test(`stream-json DriverActivity output: ${name}`, async () => {
		const { activities } = await runWire(patch);
		assert.equal(toolDone(activities).output, expected);
	});
}

test("nested native output is consumed by the Pi wrapper replay without re-execution", async () => {
	const { driver, activities } = await runWire({
		tool_info: {
			name: "run_command",
			parameters: { CommandLine: "echo AGY_RAW_ECHO_7391_c39831aa" },
			output: RAW_MARKER,
		},
	});
	const stream = createAssistantMessageEventStream();
	const partial = {
		role: "assistant",
		content: [],
		api: "agy-bridge",
		provider: "antigravity",
		model: "gemini-3.8-flash",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	} as unknown as BlockState["partial"];
	const blocks: BlockState = { partial, textIdx: null, thinkingIdx: null, started: true };
	const replay = new WrapperReplay();
	const roundTrips = new ToolRoundTrips(driver);
	const collected: unknown[] = [];
	const originalPush = stream.push.bind(stream);
	(stream as unknown as { push: (event: unknown) => void }).push = (event: unknown) => {
		collected.push(event);
		return originalPush(event as never);
	};

	assert.equal(
		consumeActivity(
			stream,
			blocks,
			toolDone(activities),
			new TurnDiffContext({ toplevel: () => null, showHead: () => null }),
			process.cwd(),
			{ replay, roundTrips, nativeActive: () => true, engine: "stream-json" },
		),
		"parked",
	);
	const toolCallEnd = collected.find((event) => (event as { type?: string }).type === "toolcall_end") as {
		toolCall: { arguments: { key: string } };
	};
	assert.ok(toolCallEnd, "mutating tool should be surfaced as the replay wrapper");
	const key = toolCallEnd.toolCall.arguments.key;
	assert.equal(replay.take(key), RAW_MARKER);
	assert.equal(replay.size, 0, "wrapper result is single-use after Pi consumes it");
	assert.deepEqual(roundTrips.pendingIds, [key]);
	assert.equal(roundTrips.resolve(key, "ignored continuation", false), true);
});
