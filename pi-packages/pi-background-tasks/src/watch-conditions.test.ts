import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateCondition } from "./conditions.js";
import { listMetasForOrigin } from "./registry.js";
import { startWatchTask, suspendScheduledWork, type WatchTaskParams } from "./runtime.js";
import { registerTools } from "./tools.js";
import type { Condition } from "./types.js";

type ToolDefinition = Parameters<ExtensionAPI["registerTool"]>[0];
const tools = new Map<string, ToolDefinition>();
registerTools({
  on() {},
  registerTool(tool: ToolDefinition) { tools.set(tool.name, tool); },
} as unknown as ExtensionAPI);
const watch = tools.get("bg_task_watch")!;
const pi = { sendUserMessage: async () => undefined } as unknown as ExtensionAPI;
const origin = { cwd: process.cwd(), sessionId: "watch-condition-validation" };
const validSuccess: Condition = { type: "exit_code", equals: 0 };

function launch(params: Record<string, unknown>) {
  return startWatchTask(pi, params as unknown as WatchTaskParams, origin.cwd, origin);
}

function normalize(params: Record<string, unknown>) {
  return validateToolArguments(watch, { type: "toolCall", id: "watch", name: watch.name,
    arguments: params as Parameters<typeof validateToolArguments>[1]["arguments"] });
}

const malformedConditions = [
  ["exit_code missing equals", { type: "exit_code" }, /exit_code requires numeric equals/],
  ["exit_code mistyped equals", { type: "exit_code", equals: "0" }, /exit_code requires numeric equals/],
  ["stdout_contains missing value", { type: "stdout_contains" }, /stdout_contains requires string value/],
  ["stdout_contains mistyped value", { type: "stdout_contains", value: 0 }, /stdout_contains requires string value/],
  ["stderr_contains missing value", { type: "stderr_contains" }, /stderr_contains requires string value/],
  ["stderr_contains mistyped value", { type: "stderr_contains", value: false }, /stderr_contains requires string value/],
  ["json_path_equals missing path", { type: "json_path_equals", value: null }, /json_path_equals requires string path/],
  ["json_path_equals mistyped path", { type: "json_path_equals", path: 0, value: null }, /json_path_equals requires string path/],
  ["json_path_equals missing value", { type: "json_path_equals", path: "$" }, /json_path_equals requires value/],
  ["json_path_exists missing path", { type: "json_path_exists" }, /json_path_exists requires string path/],
  ["json_path_exists mistyped path", { type: "json_path_exists", path: false }, /json_path_exists requires string path/],
] as const;

const malformedRoots = [undefined, null, false, 0, "exit_code", [], {}, { type: 0 }, { type: "unknown" }];

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { suspendScheduledWork(pi); vi.useRealTimers(); });

describe.each(["success_when", "failure_when"] as const)("%s launch validation", field => {
  it.each(malformedConditions)("rejects direct %s before recording or scheduling a watch", (_name, condition, error) => {
    const before = listMetasForOrigin(origin);
    expect(() => launch({ shell: "none", argv: [process.execPath], success_when: validSuccess, [field]: condition }))
      .toThrow(new RegExp(`^${field}: ${error.source}`));
    expect(listMetasForOrigin(origin)).toEqual(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(malformedConditions.filter(([name]) => !/mistyped (equals|path)/.test(name)))(
    "rejects Pi-normalized %s before recording or scheduling a watch", (_name, condition, error) => {
      const before = listMetasForOrigin(origin);
      const args = normalize({ shell: "none", argv: [process.execPath], success_when: validSuccess, [field]: condition });
      expect(args[field]).toEqual(condition);
      expect(() => launch(args)).toThrow(new RegExp(`^${field}: ${error.source}`));
      expect(listMetasForOrigin(origin)).toEqual(before);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([
    { type: "exit_code", equals: {} },
    { type: "json_path_equals", path: {}, value: null },
    { type: "json_path_exists", path: {} },
  ])("rejects mistyped numeric/path fields through Pi validation: %j", condition => {
    const before = listMetasForOrigin(origin);
    expect(() => normalize({ success_when: validSuccess, [field]: condition }))
      .toThrow(new RegExp(field));
    expect(listMetasForOrigin(origin)).toEqual(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["json_path_equals", "json_path_exists"] as const)(
    "rejects unsupported %s grammar after Pi normalization", type => {
      const before = listMetasForOrigin(origin);
      const args = normalize({ shell: "none", argv: [process.execPath], success_when: validSuccess,
        [field]: { type, path: "$..status", value: null } });
      expect(() => launch(args)).toThrow(new RegExp(`^${field}: unsupported JSON path`));
      expect(listMetasForOrigin(origin)).toEqual(before);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(malformedRoots.filter(value => field === "success_when" || value !== undefined))(
    "rejects a malformed condition object or type: %j", condition => {
      const before = listMetasForOrigin(origin);
      expect(() => launch({ shell: "none", argv: [process.execPath], success_when: validSuccess, [field]: condition }))
        .toThrow(new RegExp(`^${field}: condition (must be an object|type must be)`));
      expect(listMetasForOrigin(origin)).toEqual(before);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});

const validConditions: Array<{ condition: Condition; stdout?: string; matched: boolean }> = [
  { condition: { type: "exit_code", equals: 0 }, matched: true },
  { condition: { type: "exit_code", equals: 1 }, matched: false },
  { condition: { type: "stdout_contains", value: "done" }, matched: true },
  { condition: { type: "stdout_contains", value: "pending" }, matched: false },
  { condition: { type: "stdout_contains", value: "" }, matched: true },
  { condition: { type: "stderr_contains", value: "warning" }, matched: true },
  { condition: { type: "stderr_contains", value: "done" }, matched: false },
  { condition: { type: "stderr_contains", value: "" }, matched: true },
  { condition: { type: "json_path_equals", path: "$.status", value: "done" }, matched: true },
  { condition: { type: "json_path_equals", path: "$.status", value: "pending" }, matched: false },
  { condition: { type: "json_path_exists", path: "$.items[0]" }, matched: true },
  { condition: { type: "json_path_exists", path: "$.missing" }, matched: false },
  ...[null, false, 0, "", [1, false], { ready: true }].map(value => ({
    condition: { type: "json_path_equals" as const, path: "$", value },
    stdout: JSON.stringify(value), matched: true,
  })),
];

describe.each(["success_when", "failure_when"] as const)("valid %s", field => {
  it.each(validConditions)("preserves Pi-normalized launch and evaluation: $condition", ({ condition, stdout, matched }) => {
    const args = normalize({ shell: "none", argv: [process.execPath], success_when: validSuccess, [field]: condition });
    expect(args[field]).toEqual(condition);
    const meta = launch(args);
    expect(field === "success_when" ? meta.successWhen : meta.failureWhen).toEqual(condition);
    const result = { exitCode: 0, signal: null, stdout: stdout ?? '{"status":"done","items":[null]}',
      stderr: "warning", startedAt: 1, endedAt: 2 };
    expect(evaluateCondition(condition, result).matched).toBe(matched);
    expect(evaluateCondition(args[field] as Condition, result)).toEqual(evaluateCondition(condition, result));
  });
});

describe("watch condition declarations", () => {
  it("declares the same flat condition object for success_when and failure_when", () => {
    const { success_when, failure_when } = JSON.parse(JSON.stringify(watch.parameters)).properties;
    expect(success_when.type).toBe("object");
    expect(success_when.required).toEqual(["type"]);
    expect(Object.keys(success_when.properties)).toEqual(["type", "equals", "value", "path"]);
    expect(success_when.properties.type).toMatchObject({
      type: "string",
      enum: ["exit_code", "stdout_contains", "stderr_contains", "json_path_equals", "json_path_exists"],
    });
    expect(success_when.properties.equals.type).toBe("number");
    expect(success_when.properties.path).toMatchObject({ type: "string", pattern: "^\\$" });
    const serialized = JSON.stringify(success_when);
    expect(JSON.stringify(failure_when)).toBe(serialized);
    expect(serialized).not.toMatch(/"(?:\$ref|\$defs|anyOf|oneOf|uniqueItems)"/);
  });
});
