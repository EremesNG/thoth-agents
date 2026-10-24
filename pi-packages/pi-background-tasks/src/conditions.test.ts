import { describe, expect, it } from "vitest";
import { evaluateCondition, resolveJsonPath, validateCondition } from "./conditions.js";
import type { CommandResult } from "./types.js";

const baseResult: CommandResult = {
  exitCode: 0,
  signal: null,
  stdout: '{"status":"done","items":[{"name":"first"}],"nested":{"count":2}}',
  stderr: "",
  startedAt: 1,
  endedAt: 2,
};

describe("resolveJsonPath", () => {
  it("resolves dot and array paths", () => {
    expect(resolveJsonPath(baseResult.stdout, "$.items[0].name")).toEqual({ ok: true, value: "first" });
    expect(resolveJsonPath(baseResult.stdout, "$.nested.count")).toEqual({ ok: true, value: 2 });
  });

  it("distinguishes unsupported paths from missing fields", () => {
    expect(resolveJsonPath(baseResult.stdout, "status")).toEqual({ ok: false, error: "unsupported JSON path: status" });
    expect(resolveJsonPath(baseResult.stdout, "$.missing.value")).toEqual({ ok: false, error: "JSON path not found: $.missing.value" });
  });
});

describe("validateCondition", () => {
  it.each([
    { type: "exit_code" },
    { type: "exit_code", equals: "0" },
    { type: "exit_code", equals: null },
    { type: "exit_code", equals: Number.NaN },
  ])("rejects exit_code with missing or nonnumeric equals: %j", condition => {
    expect(validateCondition(condition)).toBe("exit_code requires numeric equals.");
  });

  it.each([
    { type: "stdout_contains" },
    { type: "stdout_contains", value: 0 },
    { type: "stdout_contains", value: null },
  ])("rejects stdout_contains with missing or nonstring value: %j", condition => {
    expect(validateCondition(condition)).toBe("stdout_contains requires string value.");
  });

  it.each([
    { type: "stderr_contains" },
    { type: "stderr_contains", value: false },
    { type: "stderr_contains", value: null },
  ])("rejects stderr_contains with missing or nonstring value: %j", condition => {
    expect(validateCondition(condition)).toBe("stderr_contains requires string value.");
  });

  it.each([
    { type: "json_path_equals", value: null },
    { type: "json_path_equals", path: 1, value: null },
    { type: "json_path_equals", path: null, value: null },
  ])("rejects json_path_equals with missing or nonstring path: %j", condition => {
    expect(validateCondition(condition)).toBe("json_path_equals requires string path.");
  });

  it.each([
    { type: "json_path_equals", path: "$" },
    { type: "json_path_equals", path: "$", value: undefined },
  ])("rejects json_path_equals without a value: %j", condition => {
    expect(validateCondition(condition)).toBe("json_path_equals requires value (any JSON value, including null).");
  });

  it.each([
    { type: "json_path_exists" },
    { type: "json_path_exists", path: [] },
    { type: "json_path_exists", path: null },
  ])("rejects json_path_exists with missing or nonstring path: %j", condition => {
    expect(validateCondition(condition)).toBe("json_path_exists requires string path.");
  });
});

describe.each(["json_path_equals", "json_path_exists"] as const)("%s path validation", type => {
  it.each(["status", "$..status", "$[*]", "$.items[-1]", "$.status."])("rejects unsupported grammar: %s", path => {
    expect(validateCondition({ type, path, value: null })).toMatch(/^unsupported JSON path:/);
  });

  it.each(["$", "$.items[0].name", '$["field.name"]', "$['field-name']"])("keeps supported grammar: %s", path => {
    expect(validateCondition({ type, path, value: null })).toBeUndefined();
  });
});

describe("evaluateCondition", () => {
  it("matches exit code and stdout", () => {
    expect(evaluateCondition({ type: "exit_code", equals: 0 }, baseResult).matched).toBe(true);
    expect(evaluateCondition({ type: "exit_code", equals: 1 }, baseResult).matched).toBe(false);
    expect(evaluateCondition({ type: "stdout_contains", value: "pending" }, baseResult).matched).toBe(false);
    expect(evaluateCondition({ type: "stdout_contains", value: "done" }, { ...baseResult, stdout: "", stderr: "done" }).matched).toBe(false);
    expect(evaluateCondition({ type: "stdout_contains", value: "done" }, baseResult).matched).toBe(true);
  });

  it("matches JSON path equality and existence", () => {
    expect(evaluateCondition({ type: "json_path_equals", path: "$.status", value: "done" }, baseResult).matched).toBe(true);
    expect(evaluateCondition({ type: "json_path_exists", path: "$.items[0]" }, baseResult).matched).toBe(true);
    expect(evaluateCondition({ type: "json_path_equals", path: "$.status", value: "pending" }, baseResult).matched).toBe(false);
    expect(evaluateCondition({ type: "json_path_exists", path: "$.items[1]" }, baseResult)).toEqual({
      matched: false, error: "JSON path not found: $.items[1]",
    });
  });
});