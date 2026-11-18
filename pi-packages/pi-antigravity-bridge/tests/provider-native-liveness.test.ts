import { test, expect, vi } from "vitest";
import { listNativeTools } from "@thoth-agents/pi-core";
import { normalizeContext, type Api, type Model, type SimpleStreamOptions } from "@earendil-works/pi-ai";
import { createStreamSimple, ToolRoundTrips } from "../src/provider.js";
import { SessionStore } from "../src/sessions.js";
import type { DriverActivity, TurnDriver, TurnOutcome } from "../src/driver-types.js";
import os from "node:os";
import path from "node:path";

const model: Model<Api> = {
 id: "test", name: "test", api: "agy-bridge" as Api, provider: "antigravity", baseUrl: "agy://test",
 reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000, maxTokens: 100,
};
const context = normalizeContext({ messages: [{ role: "user", content: "hello", timestamp: 1 }] });
const ok: TurnOutcome = { status: "OK", response: "ok", finished: true, aborted: false };

function setup(engine: "acp" | "stream-json", sessionId: string | null = `native-${Math.random()}`) {
 let pending: ((value: DriverActivity | null) => void) | undefined;
 const queued: DriverActivity[] = [];
 let rejectNext: ((error: Error) => void) | undefined;
 let settle!: (outcome: TurnOutcome) => void;
 const outcome = new Promise<TurnOutcome>(resolve => { settle = resolve; });
 const handle = {
  id: "turn", outcome,
  next: () => new Promise<DriverActivity | null>((resolve, reject) => { const activity = queued.shift(); if (activity) resolve(activity); else { pending = resolve; rejectNext = reject; } }),
  pushExternal: () => {},
 };
 const driver = { run: async () => ({ ...handle }), get activeHandle() { return { ...handle, pushExternal: (activity: DriverActivity) => { if (pending) { const resolve = pending; pending = undefined; resolve(activity); } else queued.push(activity); } }; }, reentry: () => ({ ...handle }), kickIdle: () => {} } as unknown as TurnDriver;
 const controller = new AbortController();
 const roundTrips = new ToolRoundTrips(driver, undefined, { escalateAfterMs: 0 });
 const simple = createStreamSimple({ entries: [], store: new SessionStore(path.join(os.tmpdir(), `native-store-${Math.random()}.json`)), driver,
  acpDriver: engine === "acp" ? driver : undefined, engine, roundTrips });
 const stream = simple(model, context, { sessionId: sessionId ?? undefined, signal: controller.signal } as SimpleStreamOptions);
 const finished = (async () => { for await (const event of stream) void event; })();
 return {
  sessionId: sessionId!, finished, controller, settle, simple, roundTrips,
  async send(activity: DriverActivity | null) { await vi.waitFor(() => expect(pending).toBeDefined()); const resolve = pending!; pending = undefined; resolve(activity); },
  async fail() { await vi.waitFor(() => expect(rejectNext).toBeDefined()); rejectNext!(new Error("transport failed")); },
 };
}

for (const engine of ["stream-json", "acp"] as const) {
 const id = engine === "acp" ? { toolCallId: "call-1" } : { stepId: 1 };
 test(`${engine}: publishes in flight and releases on done or error`, async () => {
  const turn = setup(engine);
  await turn.send({ type: "tool_start", name: "run_command", args: {}, ...id });
  await vi.waitFor(() => expect(listNativeTools(turn.sessionId).map(x => x.name)).toEqual(["run_command"]));
  await turn.send({ type: "tool_done", name: "run_command", args: {}, ...id });
  await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(0));
  await turn.send({ type: "tool_start", name: "exec_command", args: {}, ...id });
  await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(1));
  await turn.send({ type: "tool_error", name: "exec_command", message: "failed", ...id });
  await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(0));
  turn.settle(ok); await turn.send(null); await turn.finished;
 });
 for (const ending of ["settle", "abort", "error", "stream-end"] as const) {
  test(`${engine}: releases unfinished tools on ${ending}`, async () => {
   const turn = setup(engine);
   await turn.send({ type: "tool_start", name: "run_command", args: {}, ...id });
   await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(1));
   if (ending === "abort") { turn.controller.abort(); await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(0)); turn.settle({ ...ok, aborted: true }); await turn.send(null); }
   else if (ending === "settle") { turn.settle(ok); await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(0)); await turn.send(null); }
   else if (ending === "error") await turn.fail();
   else { await turn.send(null); await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(0)); turn.settle(ok); }
   await turn.finished;
   expect(listNativeTools(turn.sessionId)).toHaveLength(0);
  });
 }
}

for (const engine of ["stream-json", "acp"] as const) {
 test(`${engine}: native completion after a real bridge continuation releases before turn settlement`, async () => {
  const turn = setup(engine);
  const id = engine === "acp" ? { toolCallId: "native" } : { stepId: 42 };
  try {
   await turn.send({ type: "tool_start", name: "run_command", args: {}, ...id });
   await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(1));
   const parked = turn.roundTrips.onToolCall("park", "bash", {}, turn.controller.signal);
   await turn.finished;
   expect(listNativeTools(turn.sessionId)).toHaveLength(1);
   const continuation = normalizeContext({ messages: [{ role: "toolResult", toolCallId: "park", toolName: "bash", content: [{ type: "text", text: "done" }], isError: false, timestamp: 2 }] });
   const stream = turn.simple(model, continuation, { sessionId: turn.sessionId, signal: turn.controller.signal } as SimpleStreamOptions);
   const finished = (async () => { for await (const event of stream) void event; })();
   await parked;
   await turn.send({ type: "tool_done", name: "run_command", args: {}, ...id });
   await turn.send({ type: "text", delta: "processed" });
   expect(listNativeTools(turn.sessionId)).toHaveLength(0);
   turn.settle(ok); await turn.send(null); await finished;
  } finally {
   turn.controller.abort(); turn.settle(ok);
  }
 });
}

test("ACP unknown completion with native and bridge pending does not release native", async () => {
 const turn = setup("acp");
 try {
  await turn.send({ type: "tool_start", name: "run_command", args: {}, toolCallId: "native" });
  await turn.send({ type: "tool_start", name: "bash", args: {}, mcpServer: "pi-bridge", toolCallId: "bridge" });
  await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(1));
  await turn.send({ type: "tool_done", name: "tool", args: {}, toolCallId: "unknown" });
  await turn.send({ type: "text", delta: "processed" });
  expect(listNativeTools(turn.sessionId).map(x => x.name)).toEqual(["run_command"]);
  await turn.send({ type: "tool_done", name: "bash", args: {}, toolCallId: "bridge" });
  await turn.send({ type: "tool_done", name: "run_command", args: {}, toolCallId: "adopted" });
  await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(0));
  turn.settle(ok); await turn.send(null); await turn.finished;
 } finally {
  turn.controller.abort(); turn.settle(ok);
 }
});

test("ACP repeated start for the same id replaces its pending identity", async () => {
 const turn = setup("acp");
 try {
  await turn.send({ type: "tool_start", name: "run_command", args: {}, toolCallId: "same" });
  await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(1));
  await turn.send({ type: "tool_start", name: "bash", args: {}, mcpServer: "pi-bridge", toolCallId: "same" });
  await turn.send({ type: "text", delta: "processed" });
  expect(listNativeTools(turn.sessionId)).toHaveLength(0);
  await turn.send({ type: "tool_start", name: "run_command", args: {}, toolCallId: "same" });
  await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(1));
  await turn.send({ type: "tool_done", name: "run_command", args: {}, toolCallId: "adopted" });
  await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(0));
  turn.settle(ok); await turn.send(null); await turn.finished;
 } finally {
  turn.controller.abort(); turn.settle(ok);
 }
});

test("ACP adopted bridge completion does not block a later sole native adoption", async () => {
 const turn = setup("acp");
 await turn.send({ type: "tool_start", name: "bash", args: {}, mcpServer: "pi-bridge", toolCallId: "bridge" });
 await turn.send({ type: "tool_done", name: "bash", args: {}, mcpServer: "pi-bridge", toolCallId: "adopted-bridge" });
 await turn.send({ type: "tool_start", name: "run_command", args: {}, toolCallId: "native" });
 await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(1));
 await turn.send({ type: "tool_error", name: "tool", message: "unknown", toolCallId: "unknown" });
 await turn.send({ type: "text", delta: "processed" });
 expect(listNativeTools(turn.sessionId)).toHaveLength(1);
 await turn.send({ type: "tool_done", name: "run_command", args: {}, toolCallId: "adopted-native" });
 await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(0));
 turn.settle(ok); await turn.send(null); await turn.finished;
});

test("ACP completion adopting a different id releases the sole started tool", async () => {
 const turn = setup("acp");
 await turn.send({ type: "tool_start", name: "run_command", args: {}, toolCallId: "start" });
 await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(1));
 await turn.send({ type: "tool_done", name: "run_command", args: {}, toolCallId: "adopted" });
 await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(0));
 turn.settle(ok); await turn.send(null); await turn.finished;
});

test("settling one concurrent turn does not clear another turn in the same session", async () => {
 const session = `shared-${Math.random()}`;
 const a = setup("stream-json", session), b = setup("stream-json", session);
 await a.send({ type: "tool_start", name: "first", args: {}, stepId: 1 });
 await b.send({ type: "tool_start", name: "second", args: {}, stepId: 1 });
 await vi.waitFor(() => expect(listNativeTools(session).map(x => x.name).sort()).toEqual(["first", "second"]));
 a.settle(ok); await a.send(null); await a.finished;
 expect(listNativeTools(session).map(x => x.name)).toEqual(["second"]);
 b.settle(ok); await b.send(null); await b.finished;
 expect(listNativeTools(session)).toHaveLength(0);
});

test("unidentified overlapping stream-json starts remain registered until turn settlement", async () => {
 const turn = setup("stream-json");
 await turn.send({ type: "tool_start", name: "first", args: {} });
 await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(1));
 await turn.send({ type: "tool_start", name: "second", args: {} });
 await turn.send({ type: "tool_done", name: "first", args: {} });
 await turn.send({ type: "text", delta: "after completion" });
 // Wait for a subsequent read, so the earlier completion has been consumed.
 await turn.send({ type: "text", delta: "confirmed" });
 expect(listNativeTools(turn.sessionId)).toHaveLength(1);
 turn.settle(ok); await turn.send(null); await turn.finished;
 expect(listNativeTools(turn.sessionId)).toHaveLength(0);
});

test("a parked Pi stream retains native activity until the underlying turn settles", async () => {
 const turn = setup("stream-json");
 await turn.send({ type: "tool_start", name: "run_command", args: {}, stepId: 1 });
 await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(1));
 await turn.send({ type: "bridge_call", callId: "bridge-1", name: "read", args: {} });
 await turn.finished;
 expect(listNativeTools(turn.sessionId)).toHaveLength(1);
 turn.settle(ok);
 await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(0));
});

test("ACP unknown completion does not release concurrent known calls", async () => {
 const turn = setup("acp");
 await turn.send({ type: "tool_start", name: "first", args: {}, toolCallId: "first" });
 await turn.send({ type: "tool_start", name: "second", args: {}, toolCallId: "second" });
 await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(2));
 await turn.send({ type: "tool_done", name: "tool", args: {}, toolCallId: "unknown" });
 await turn.send({ type: "text", delta: "processed" });
 expect(listNativeTools(turn.sessionId)).toHaveLength(2);
 turn.settle(ok); await turn.send(null); await turn.finished;
 expect(listNativeTools(turn.sessionId)).toHaveLength(0);
});

test("missing session id never publishes under the cwd fallback", async () => {
 const turn = setup("stream-json", null);
 await turn.send({ type: "tool_start", name: "run_command", args: {}, stepId: 1 });
 await turn.send({ type: "text", delta: "processed" });
 expect(listNativeTools(process.cwd())).toHaveLength(0);
 expect(listNativeTools(`cwd:${process.cwd()}`)).toHaveLength(0);
 turn.settle(ok); await turn.send(null); await turn.finished;
});

for (const engine of ["stream-json", "acp"] as const) {
 test(`${engine}: bridge MCP executions do not duplicate Pi tools in the native registry`, async () => {
  const turn = setup(engine);
  const bridgeId = engine === "acp" ? { toolCallId: "bridge" } : { stepId: 1 };
  const nativeId = engine === "acp" ? { toolCallId: "native" } : { stepId: 2 };
  await turn.send({ type: "tool_start", name: "bash", args: { timeout: 10 }, mcpServer: "pi-agy-aabbccdd", ...bridgeId });
  await turn.send({ type: "tool_start", name: "run_command", args: {}, ...nativeId });
  await vi.waitFor(() => expect(listNativeTools(turn.sessionId).map(x => x.name)).toEqual(["run_command"]));
  // A completion from the skipped bridge must not adopt/release a native call.
  await turn.send({ type: "tool_done", name: "bash", args: {}, ...bridgeId });
  await turn.send({ type: "text", delta: "processed" });
  expect(listNativeTools(turn.sessionId).map(x => x.name)).toEqual(["run_command"]);
  await turn.send({ type: "tool_done", name: "run_command", args: {}, ...nativeId });
  await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(0));
  turn.settle(ok); await turn.send(null); await turn.finished;
 });
}

test("stream-json: a matching parked bridge call releases its unlabelled MCP wrapper", async () => {
 const turn = setup("stream-json");
 await turn.send({ type: "tool_start", name: "call_mcp_tool", args: { tool: "bash" }, stepId: 1 });
 await turn.send({ type: "tool_start", name: "run_command", args: {}, stepId: 2 });
 await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(2));
 const parked = turn.roundTrips.onToolCall("park", "bash", { timeout: 10 }, turn.controller.signal);
 await turn.finished;
 expect(listNativeTools(turn.sessionId).map(x => x.name)).toEqual(["run_command"]);
 turn.roundTrips.resolve("park", "done", false); await parked;
 turn.settle(ok);
 await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(0));
});

test("stream-json: sequential same-target bridge parks reconcile across continuation", async () => {
 const turn = setup("stream-json");
 try {
  await turn.send({ type: "tool_start", name: "call_mcp_tool", args: { tool: "bash" }, stepId: 1 });
  await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(1));
  const first = turn.roundTrips.onToolCall("park-1", "bash", {}, turn.controller.signal);
  await turn.finished;
  expect(listNativeTools(turn.sessionId)).toHaveLength(0);
  const continuation = normalizeContext({ messages: [{ role: "toolResult", toolCallId: "park-1", toolName: "bash", content: [{ type: "text", text: "done" }], isError: false, timestamp: 2 }] });
  const stream = turn.simple(model, continuation, { sessionId: turn.sessionId, signal: turn.controller.signal } as SimpleStreamOptions);
  const finished = (async () => { for await (const event of stream) void event; })();
  await first;
  await turn.send({ type: "tool_done", name: "call_mcp_tool", args: { tool: "bash" }, stepId: 1 });
  await turn.send({ type: "tool_start", name: "call_mcp_tool", args: { tool: "bash" }, stepId: 2 });
  await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(1));
  const second = turn.roundTrips.onToolCall("park-2", "bash", {}, turn.controller.signal);
  await finished;
  expect(listNativeTools(turn.sessionId)).toHaveLength(0);
  turn.roundTrips.resolve("park-2", "done", false); await second;
 } finally {
  turn.roundTrips.resolve("park-1", "cleanup", false); turn.roundTrips.resolve("park-2", "cleanup", false);
  turn.controller.abort(); turn.settle(ok);
 }
});

test("stream-json: concurrent same-target parks cannot identify one wrapper", async () => {
 const turn = setup("stream-json");
 try {
  await turn.send({ type: "tool_start", name: "call_mcp_tool", args: { tool: "bash" }, stepId: 1 });
  await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(1));
  const first = turn.roundTrips.onToolCall("park-1", "bash", {}, turn.controller.signal);
  const second = turn.roundTrips.onToolCall("park-2", "bash", {}, turn.controller.signal);
  await turn.finished;
  expect(listNativeTools(turn.sessionId).map(x => x.name)).toEqual(["call_mcp_tool"]);
  turn.roundTrips.resolve("park-1", "done", false); turn.roundTrips.resolve("park-2", "done", false);
  await Promise.all([first, second]);
 } finally {
  turn.roundTrips.resolve("park-1", "cleanup", false); turn.roundTrips.resolve("park-2", "cleanup", false);
  turn.controller.abort(); turn.settle(ok);
 }
});

for (const engine of ["stream-json", "acp"] as const) {
 test(`${engine}: foreign MCP activity remains native and legacy bridge activity is excluded`, async () => {
  const turn = setup(engine);
  const first = engine === "acp" ? { toolCallId: "foreign" } : { stepId: 1 };
  const second = engine === "acp" ? { toolCallId: "legacy" } : { stepId: 2 };
  await turn.send({ type: "tool_start", name: "foreign_tool", args: {}, mcpServer: "third-party", ...first });
  await turn.send({ type: "tool_start", name: "bash", args: {}, mcpServer: "pi-bridge", ...second });
  await turn.send({ type: "text", delta: "processed" });
  expect(listNativeTools(turn.sessionId).map(x => x.name)).toEqual(["foreign_tool"]);
  turn.settle(ok); await turn.send(null); await turn.finished;
 });
}

test("stream-json: ambiguous unidentified MCP targets stay native when a Pi call parks", async () => {
 const turn = setup("stream-json");
 await turn.send({ type: "tool_start", name: "call_mcp_tool", args: { tool: "bash" }, stepId: 1 });
 await turn.send({ type: "tool_start", name: "call_mcp_tool", args: { tool: "bash" }, stepId: 2 });
 await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(2));
 const parked = turn.roundTrips.onToolCall("park", "bash", {}, turn.controller.signal);
 await turn.finished;
 expect(listNativeTools(turn.sessionId)).toHaveLength(2);
 turn.roundTrips.resolve("park", "done", false); await parked;
 turn.settle(ok);
 await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(0));
});

test("stream-json: later explicit foreign identity prevents inference for an existing wrapper", async () => {
 const turn = setup("stream-json");
 try {
  await turn.send({ type: "tool_start", name: "call_mcp_tool", args: { tool: "bash" }, stepId: 1 });
  await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(1));
  await turn.send({ type: "tool_start", name: "call_mcp_tool", args: { tool: "bash" }, mcpServer: "foreign", stepId: 1 });
  await turn.send({ type: "text", delta: "processed" });
  const parked = turn.roundTrips.onToolCall("park", "bash", {}, turn.controller.signal);
  await turn.finished;
  expect(listNativeTools(turn.sessionId).map(x => x.name)).toEqual(["call_mcp_tool"]);
  turn.roundTrips.resolve("park", "done", false); await parked;
 } finally {
  turn.roundTrips.resolve("park", "cleanup", false);
  turn.controller.abort(); turn.settle(ok);
 }
});

test("stream-json: explicit foreign server identity wins over a matching park", async () => {
 const turn = setup("stream-json");
 await turn.send({ type: "tool_start", name: "call_mcp_tool", args: { tool: "bash" }, mcpServer: "foreign", stepId: 1 });
 await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(1));
 const parked = turn.roundTrips.onToolCall("park", "bash", {}, turn.controller.signal);
 await turn.finished;
 expect(listNativeTools(turn.sessionId)).toHaveLength(1);
 turn.roundTrips.resolve("park", "done", false); await parked;
 turn.settle(ok);
 await vi.waitFor(() => expect(listNativeTools(turn.sessionId)).toHaveLength(0));
});
