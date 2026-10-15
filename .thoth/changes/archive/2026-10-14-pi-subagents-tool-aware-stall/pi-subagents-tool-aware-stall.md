# Change: pi-subagents-tool-aware-stall

**Classification**: substantial
**Scope**: local
**Uncertainty**: low
**Risk**: medium

## Exploration

- The pi-subagents inactivity watchdog (`pi-packages/pi-subagents/src/runner/event-processing.ts:645-720`) aborts a child after `stall_timeout_ms` (default 240000, `src/config.ts:33-39`, normalized at `:478-509`). With active tools it measures the oldest active tool's `lastUpdate` (`:670-678`); a running tool does not suspend it, so a silent 10-minute test command run by a child is aborted near 4 minutes with non-retryable `stall_timeout` and the task fails.
- `subagent_extend` and the execution deadline (`timeout_ms`, default 20 min) do not affect the inactivity watchdog.
- Active-tool entries are an inline `Map<string, { name; startTime; lastUpdate }>` (`event-processing.ts:388-391`), populated at `tool_execution_start` (`:476-481`) without args; the SDK start event carries `toolCallId`, `toolName`, `args` (agent-core `agent-loop.js:378-383`).
- SDK `bash` and `powershell` accept optional `timeout` in seconds, no default (`pi-coding-agent/dist/core/tools/bash.js:12-30`, `powershell.js:24-28`); streamed output already emits `tool_execution_update`, refreshing `lastUpdate`. `bg_task_spawn`/`bg_task_watch` use `timeout_seconds` (seconds, 0 disables).
- Config type `SubagentsConfig` at `src/types.ts:73-82`; README config docs at `pi-packages/pi-subagents/README.md:358-415`.
- Baselines: `.thoth/specs/pi-ecosystem/spec.md` (Subagent stall diagnostics) and `.thoth/specs/multi-harness-agent-pack/spec.md` (timeout attention); no spec covers separate tool/model stall budgets. No active change record.
- Existing tests: `test/runner/thread-snapshots.test.ts:489-568` (silent tool stalls), `test/runner/orchestrator-inactivity.test.ts`, `test/runner/structured-errors.test.ts`, `test/config.test.ts:644-741`.

## Intent

A child running a long, silent tool is not killed by the model-inactivity watchdog while still within a tool-appropriate budget, and a tool that declares its own timeout is allowed to run to that timeout, while model-idle stalls are still detected after `stall_timeout_ms`.

## Non-goals

- No warning/attention stage before stall abort and no `subagent_extend` interaction with stall.
- No per-agent frontmatter stall override.
- No change to execution deadline, extension ceilings, compaction/retry suspension, or orchestrator-question suspension semantics.
- No interpretation of generic `timeout` args on tools other than `bash` and `powershell`.
- No package version bumps.

## Acceptance

- AC-1: New config `tool_stall_timeout_ms` (positive integer, default 900000) is read from cascaded `subagents.json` with existing normalization; effective value is never below `stall_timeout_ms`.
- AC-2: For ordinary inactivity (outside compaction/retry/question suspension), while at least one tool is active the inactivity watchdog fires only when an active tool's time since its last update exceeds that tool's budget (default `tool_stall_timeout_ms`); with no active tools it still fires after `stall_timeout_ms` of session inactivity. The maintenance suspension ceiling (`stall_suspend_max_ms`) and execution deadline behavior are unchanged and may still abort earlier.
- AC-3: A `bash`/`powershell` call with a finite positive `timeout` (seconds), or any tool call with a finite positive `timeout_seconds`, gets budget `max(tool_stall_timeout_ms, declaredSeconds*1000 + 30000)`, capped at `max_total_timeout_ms`; invalid, zero, or absent values fall back to `tool_stall_timeout_ms`.
- AC-4: The final thrown and persisted stall error (as rendered by the error formatter) names the budget that fired (session vs tool, and the applied budget in ms) in addition to existing diagnostics.
- AC-5: README documents `tool_stall_timeout_ms` and declared-timeout behavior; focused tests cover AC-1..AC-4.

## Clarifications

- User selected options 1 (tool-aware budget) and 2 (honor declared tool timeout); options 3 (attention before abort) and 4 (per-agent override) are out of scope.

## Decisions

- Default `tool_stall_timeout_ms` = 900000 (15 min), aligned with `stall_suspend_max_ms` and below the 20 min execution deadline, which stays the hard safety ceiling.
- Declared-timeout grace = 30000 ms constant; cap = normalized `max_total_timeout_ms` so absurd values defer to the deadline machinery.
- Declared timeout recognized only from explicit seconds contracts: `timeout` on `bash`/`powershell`, `timeout_seconds` on any tool; parsed from `tool_execution_start.args` before SDK validation, so non-finite or non-positive values are ignored.
- Per-tool budget is computed once at tool start and stored on the active-tool entry; updates keep refreshing `lastUpdate` as today.

## Durable deltas

- `ADDED pi-ecosystem` **Tool-aware subagent stall budgets** — For ordinary inactivity, the pi-subagents inactivity watchdog MUST apply `stall_timeout_ms` only when no tool is active; while tools are active its ordinary inactivity check MUST fire only when an active tool exceeds its own budget, defaulting to `tool_stall_timeout_ms` (default 900000, never below `stall_timeout_ms`) and extended to the declared seconds timeout plus 30 seconds for `bash`/`powershell` `timeout` or any `timeout_seconds` argument, capped at `max_total_timeout_ms`; maintenance suspension ceilings and execution deadlines are unaffected; the final stall error MUST identify the applied budget.
  - GIVEN a child running a silent `bash` command with `timeout: 1000`, default config, and a deadline beyond 20 minutes; WHEN 16 minutes pass without tool updates; THEN no stall fires, and a stall fires once 1030 seconds pass without updates, with the final error naming the tool budget of 1030000 ms.

## Plan

Single package, single writer (`thoth-worker`), test-first.

1. Config (`src/types.ts`, `src/config.ts`): add `tool_stall_timeout_ms` to `SubagentsConfig`, default 900000, positive-integer normalization. Plumbing (`src/runner/sdk-runner.ts:800-818` → `event-processing.ts:335-351` options): forward normalized `tool_stall_timeout_ms` (effective `max(tool_stall, stall)`) and normalized `max_total_timeout_ms` to the watchdog alongside `stall_timeout_ms`.
2. Runner (`src/runner/event-processing.ts`): extend the active-tool entry with `budgetMs`; at `tool_execution_start` compute it from `toolName` and `args` via a small pure helper (`resolveToolStallBudget`) implementing AC-3. Watchdog: no active tools → session idle vs `stall_timeout_ms` (unchanged); active tools → fire if any tool's `now - lastUpdate > budgetMs`. Keep suspension/refresh logic unchanged.
3. Diagnostics: add budget kind and ms to the stall details captured in `event-processing.ts` (~680-762) and render them in the final error formatter (`src/error-metadata.ts:169-190,286-291`, which `deriveErrorString` regenerates), preserving existing fields; assert on the final thrown and persisted error.
4. Docs: README config example/table and semantics lines.
5. Tests: config defaults/cascade/normalization (`test/config.test.ts`); helper unit tests; watchdog behavior with fake timers — silent tool survives past `stall_timeout_ms` and fires at tool budget; declared `timeout` extends; invalid declared values fall back; cap applies; no-active-tool session idle still fires at `stall_timeout_ms` (adapt `thread-snapshots.test.ts:489-568` which currently asserts abort for a silent tool after the session budget). Existing fake-timer tests in `orchestrator-inactivity.test.ts` and `structured-errors.test.ts` that assume active tools use the session budget must set explicit short `tool_stall_timeout_ms` where needed, preserving their reset assertions; add mixed-budget multi-tool coverage.

Verification seams: `pnpm --filter` focused vitest for pi-subagents touched tests, package typecheck, root `pnpm run check:ci` and `pnpm run typecheck`. Risk: existing tests asserting the 4-minute tool stall must be updated deliberately, not weakened.

## Tasks

- [x] AC-1: Add `tool_stall_timeout_ms` config with default, normalization, and effective floor
  - Outcome: config reader returns normalized `tool_stall_timeout_ms` with cascade and floor at `stall_timeout_ms`
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/types.ts:73-82, src/config.ts:33-39 and 478-509, test/config.test.ts:644-741; tdd skill
  - Inputs: Exploration and Decisions sections of this record
  - Dependencies: none
  - Output: config field plus tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/types.ts, src/config.ts, test/config.test.ts
  - Interface boundaries: SubagentsConfig consumers; global/project cascade
  - Focused check and PASS evidence: pi-subagents vitest test/config.test.ts passes including new cases
  - Return milestone: together with AC-2..AC-5 in one worker return
  - Stop / reassessment: config value cannot reach the runner without changing a shared public interface
- [x] AC-2: Tool-aware watchdog with per-tool budgets
  - Outcome: active tools judged against their own budget, session idle unchanged
  - Known entrypoints and skill paths: src/runner/event-processing.ts:388-391, 426-505, 645-720; test/runner/thread-snapshots.test.ts:489-568; test/runner/orchestrator-inactivity.test.ts
  - Inputs: AC-1 config value, AC-3 helper
  - Dependencies: AC-1 and AC-3 (same worker)
  - Output: runner change and config plumbing plus tests
  - Owner: thoth-worker
  - Writes: src/runner/event-processing.ts, src/runner/sdk-runner.ts, related runner tests (thread-snapshots, orchestrator-inactivity)
  - Interface boundaries: watchdog suspension for compaction/retry/questions, maintenance ceiling, and execution deadline must remain unchanged; sdk-runner forwards normalized tool_stall_timeout_ms and max_total_timeout_ms
  - Focused check and PASS evidence: runner tests pass, including silent-tool-survives and session-idle-fires cases
  - Return milestone: single worker return
  - Stop / reassessment: watchdog structure requires refactor beyond event-processing.ts
- [x] AC-3: Declared-timeout budget resolution
  - Outcome: pure helper computes per-tool budget from toolName/args per AC-3
  - Known entrypoints and skill paths: src/runner/event-processing.ts (or adjacent runner module); SDK bash.js:12-30 semantics
  - Inputs: Decisions section
  - Dependencies: AC-1
  - Output: helper plus unit tests (valid, zero, negative, non-numeric, huge capped, timeout_seconds)
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/runner/ (helper location chosen by worker), matching test file
  - Interface boundaries: none external
  - Focused check and PASS evidence: helper tests pass
  - Return milestone: single worker return
  - Stop / reassessment: args unavailable at start in the runner's event shape
- [x] AC-4: Stall diagnostics identify applied budget
  - Outcome: final thrown and persisted stall error include budget kind and ms
  - Known entrypoints and skill paths: src/runner/event-processing.ts:680-775, src/error-metadata.ts:169-190 and 286-291, test/runner/structured-errors.test.ts:169-327
  - Inputs: AC-2 budgets
  - Dependencies: AC-2
  - Output: diagnostic field plus test
  - Owner: thoth-worker
  - Writes: src/runner/event-processing.ts, src/error-metadata.ts, test/runner/structured-errors.test.ts
  - Interface boundaries: existing diagnostics fields preserved
  - Focused check and PASS evidence: structured-errors tests pass with new assertions
  - Return milestone: single worker return
  - Stop / reassessment: diagnostics schema is consumed by another package needing change
- [x] AC-5: README documentation for new key and declared-timeout behavior
  - Outcome: README config example, table, and semantics describe the change
  - Known entrypoints and skill paths: pi-packages/pi-subagents/README.md:358-415
  - Inputs: AC-1..AC-4 behavior
  - Dependencies: AC-1..AC-4
  - Output: README edits
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/README.md
  - Interface boundaries: none
  - Focused check and PASS evidence: README mentions tool_stall_timeout_ms, default, declared timeout grace and cap; pnpm run check:ci passes
  - Return milestone: single worker return
  - Stop / reassessment: none expected

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW

Round 1 fresh Oracle REJECT (scenario budget math, sdk-runner plumbing, error-metadata formatter ownership) repaired in-record; round 2 fresh Oracle OKAY, envelope validated (exit 0). Nonblocking caution: keep the tool fixture unresolved in the 1030 s watchdog test.
**Implementation**: AUTHORIZED

User explicitly selected Implement after validated OKAY.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 9f31ab420a3ef521fcdc029b339655e93b9d0a84f19c13e9f1cd58a19a16582d

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The actual diff and both untracked files satisfy AC-1–AC-5, Decisions, Non-goals, and the durable delta. One unrelated optional-suite filesystem failure passed on isolated rerun.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/pi-subagents-tool-aware-stall/pi-subagents-tool-aware-stall.md",
      "claim": "Independently computed prefix SHA-256 matches the supplied digest; canonical spec digest also matches. The verify validator passes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "diff-review",
      "locator": "pi-packages/pi-subagents/src/{config.ts,types.ts,runner/sdk-runner.ts,runner/event-processing.ts,runner/tool-stall-budget.ts}",
      "claim": "Config normalization, cascade, base-budget floor, per-tool timeout resolution and runner plumbing match the record. Session-idle logic, suspension/reset semantics, maintenance ceiling, execution deadlines and subagent_extend remain unchanged.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "diagnostics-and-tests",
      "locator": "pi-packages/pi-subagents/src/error-metadata.ts; test/runner/{structured-errors,orchestrator-inactivity,thread-snapshots,tool-stall-budget}.test.ts",
      "claim": "Thrown and persisted errors identify applied budget kind and milliseconds while retaining existing diagnostics. Existing assertions are preserved; short explicit tool budgets retain previous regression coverage.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "documentation",
      "locator": "pi-packages/pi-subagents/README.md",
      "claim": "README accurately documents defaults, normalization, timeout contracts, seconds, grace, cap, invalid fallback and independent suspension/deadline behavior.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "execution",
      "locator": "Independent required checks",
      "claim": "All 192 focused tests pass. Package typecheck, root check:ci and root typecheck pass. check:ci reports warnings/information but no errors; git diff --check passes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "execution",
      "locator": "Optional full pi-subagents suite; test/model-profiles/ui.test.ts",
      "claim": "Full suite: 1647 passed, 1 skipped, 1 failed with Windows EPERM during a temporary profiles.json rename. The unchanged failing test file subsequently passes all 60 tests in isolation.",
      "basis": "observed",
      "uncertainty": "The filesystem failure's underlying cause was not established."
    }
  ],
  "verification": [
    {
      "check": "Record binding and governance",
      "method": "Hash exact bytes before ## Authorization, compare spec digest, run bundled verify validator.",
      "outcome": "pass",
      "evidenceIds": ["E1"],
      "reason": "Both digests match; validator reports valid."
    },
    {
      "check": "AC-1–AC-3 and preserved boundaries",
      "method": "Review actual tracked/untracked changes and execute focused config/watchdog/helper tests.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E5"],
      "reason": "Budget selection, parsing, refreshes, fallback and caps match the declared contracts; unrelated timeout machinery is untouched."
    },
    {
      "check": "AC-4–AC-5 and regression integrity",
      "method": "Inspect formatter, persistence assertions, README and test diff.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E5"],
      "reason": "Required diagnostics and documentation are present; existing tests were not weakened."
    },
    {
      "check": "Four explicitly requested commands",
      "method": "Run focused tests, package typecheck, root check:ci and root typecheck independently.",
      "outcome": "pass",
      "evidenceIds": ["E5"],
      "reason": "All commands exit successfully."
    },
    {
      "check": "Optional full package suite",
      "method": "Run full suite, then isolate the single failing test file.",
      "outcome": "fail",
      "evidenceIds": ["E6"],
      "reason": "Full run encountered an unrelated EPERM rename failure; isolated rerun passes."
    }
  ],
  "risks": [
    {
      "description": "Optional full-suite execution remains susceptible to an intermittent Windows filesystem failure in unchanged model-profile code.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E6"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Validate this envelope, record acceptance evidence, and run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-subagents-tool-aware-stall/pi-subagents-tool-aware-stall.md",
    "reviewedRecordSha256": "9f31ab420a3ef521fcdc029b339655e93b9d0a84f19c13e9f1cd58a19a16582d"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | pnpm --filter @thoth-agents/pi-subagents test (5 focused files, 192 passed); package typecheck, root check:ci, root typecheck exit 0 | src/config.ts default/normalization/floor; test/config.test.ts
- AC-2: PASS | pnpm --filter @thoth-agents/pi-subagents test (5 focused files, 192 passed); package typecheck, root check:ci, root typecheck exit 0 | src/runner/event-processing.ts per-tool budgets, sdk-runner.ts plumbing; orchestrator-inactivity + thread-snapshots tests
- AC-3: PASS | pnpm --filter @thoth-agents/pi-subagents test (5 focused files, 192 passed); package typecheck, root check:ci, root typecheck exit 0 | src/runner/tool-stall-budget.ts; tool-stall-budget.test.ts, unresolved timeout:1000 scenario fires after 1030000 ms
- AC-4: PASS | pnpm --filter @thoth-agents/pi-subagents test (5 focused files, 192 passed); package typecheck, root check:ci, root typecheck exit 0 | src/error-metadata.ts budget kind+ms; structured-errors thrown/persisted assertions
- AC-5: PASS | README review by Oracle; check:ci exit 0 | pi-packages/pi-subagents/README.md tool_stall_timeout_ms, grace, cap, fallback
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:b2e1f2c5fd0d1cd7f37c439b49589d1e02dfe4c93572213ef87c79dd7a91cb66

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY

Residual risk: optional full pi-subagents suite had one unrelated Windows EPERM rename failure in unchanged test/model-profiles/ui.test.ts that passes in isolation.
