# Change: compact-pi-tool-schemas

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- A bare first Pi prompt costs ~21.8k tokens of custom-tool definitions (pi-context-view). codemode `describeTool()` char lengths rank the in-repo owners: pi-background-tasks 8 tools ~25.7k chars (bg_task 7607, bg_task_watch 5830, bg_task_spawn 3448, bg_task_status 2142, bg_status 1928, bg_task_log 1887, bg_task_stop 1456, bg_task_list 1429); todo 5151; AskAntigravity 3897; AskCodex ~2.5k; ask_user_question ~4k; pi-subagents 10 tools ~3.8k.
- pi-background-tasks (`pi-packages/pi-background-tasks/src/tools.ts:171-310`) registers all eight tools unconditionally (`src/index.ts:63`). Wrappers `bg_task`/`bg_status` reuse the standalone runtime through `actionText`/`runAction` (`tools.ts:292,305,359-402`) but re-declare schemas; only the wrappers expose `clear`. Dynamic shell guidance is emitted 9 times (description + `command` + `shell` across spawn/watch/bg_task), `ConditionSchema` 4 times, `WATCH_CHECK_GUIDANCE` and blind-check text twice, `CursorFields` 6 times, deprecated `maxBytes` 6 and `tail_lines` 3 times (`tools.ts:28-182`). Tests pin the shell text in three locations (`src/tools.test.ts:13-43`), deprecated aliases (`src/output.test.ts:843-883`, `src/log-display.test.ts:91,116,157`) and the eight names (`src/e2e.test.ts:34-46`). `src/tools.test.ts:8-11` already captures raw registered definitions. No production references to the wrapper names exist outside the package; pi-subagents tests use `bg_task_spawn` and a `bg_status` name fixture (`pi-packages/pi-subagents/test/config.test.ts:1320`).
- pi-questions-user (`src/schema.ts:4-51,113-126`) declares 46 optional `labels` properties, each described `Default: "…"`; runtime resolves English defaults and nonblank overrides (`schema.ts:57-67`), validates known keys (`src/validate.ts:68-77`) and has no translator; the model supplies translations (`src/index.ts:37`). Tests pin label presence for `yes`/`no`/`typeSomething`/`submit` and guideline semantics (`test/index.test.ts:465-542`, `test/validate.test.ts:269-287`).
- pi-todo (`tool/types.ts:104-230`) builds `BatchOpSchema` by spreading six identical field schemas (`subject`, `description`, `activeForm`, `status`, `owner`, `metadata`) with their full descriptions; description 784 chars, snippet 69, eight guidelines (`todo.ts:72-93`). Tests pin guideline sentences and action names (`todo.register.test.ts:44-104`) and mixed id/ref validation (`tool/batch-schema.test.ts:5-32`).
- pi-antigravity-bridge `AskAntigravity` (`src/ask-tool.ts:78-93,404-468`) repeats mode/digest/thinking/continuation documentation in both description and parameter docs and declares an `effort` alias of `thinking` (`:430-435,615-630`). The `antigravity` replay tool is display plumbing (`extensions/index.ts:583-600`) and stays.
- pi-askcodex `AskCodex` (`src/ask-tool.ts:40-41,67-138`) declares an `effort` alias of `thinking` and boolean alternatives for `webSearch` (`:121-131`); tests exercise both (`tests/ask-tool.test.ts:474-564`).
- pi-subagents (`src/tools/registry.ts:19-35`, `src/tools/subagent-*.ts`) repeats mode-default/no-polling text between `subagent_run` description and snippet and mode-preservation text in `subagent_continue`; tests pin guidance (`test/tools/subagent-run.test.ts:41-61`, `test/tools/subagent-continue.test.ts:116-128`). Children already receive only their allowlisted tools (`src/runner/sdk-runner.ts:81-146,498-511,718-728`), so the root-visible set is the target.
- `.thoth/specs/pi-ecosystem/spec.md` does not pin wrapper tools, label descriptions or aliases; the task-list requirement pins the 2.12.0 schema shape plus batch, which trimming duplicated descriptions preserves. AGENTS.md says to ignore backward compatibility.

## Intent

Reduce the model-facing size (name, description, parameter schema, prompt snippet and guidelines) of the tools registered by the in-repo Pi packages pi-background-tasks, pi-questions-user, pi-todo, pi-antigravity-bridge, pi-askcodex and pi-subagents, without removing capabilities or changing runtime behavior beyond the decided surface changes, and lock each package's size with a tested budget.

## Non-goals

- External packages and tools: thoth-mem, web search/fetch, context7, grep GitHub, goal tools, codex image generation, codemode itself, Pi built-ins and MCP proxies.
- Renaming tools referenced by product prompts (`subagent_*`, `todo`, `ask_user_question`, `AskCodex`, `AskAntigravity`) or changing their parameter names other than the removed aliases.
- Built-in label translations or a locale parameter for ask_user_question.
- Lazy/nested tool registration mechanisms, pi-claude-bridge changes and child allowlist changes.
- Version bumps or releases.

## Acceptance

- AC-1: pi-background-tasks registers only `bg_task_spawn`, `bg_task_watch`, `bg_task_list`, `bg_task_status`, `bg_task_log`, `bg_task_stop` and a new `bg_task_clear` (same clear semantics the wrappers had); `bg_task`/`bg_status`, `maxBytes` and `tail_lines` are gone; shell guidance and watch guidance appear once per tool; its serialized definitions are at most 50% of the measured baseline and locked by a budget test; package tests pass.
- AC-2: ask_user_question keeps all 46 `labels` keys and their runtime behavior but without per-key descriptions, with one concise `labels` description; serialized definition shrinks measurably and is locked by a budget test; package tests pass.
- AC-3: todo keeps its actions, batch refs and validation while batch-op fields no longer repeat top-level descriptions and the description/guidelines are condensed without losing pinned semantics; serialized definition shrinks measurably and is locked by a budget test; package tests pass.
- AC-4: AskAntigravity drops the `effort` alias and the description no longer repeats parameter documentation; AskCodex drops the `effort` alias and boolean `webSearch` alternatives and overlapping reminders; both definitions shrink measurably and are locked by budget tests; both packages' tests pass.
- AC-5: pi-subagents tool descriptions/snippets no longer repeat the same guidance between description and snippet or across tools while keeping pinned semantics and all names/params; serialized definitions shrink measurably and are locked by a budget test; package tests pass.
- AC-6: Repository closeout passes (`pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm run test:pi-extensions`) and routed docs record the budget convention and the background-tasks surface.

## Clarifications

- Background-tasks surface: user chose standalone tools only (drop `bg_task`/`bg_status`, add a small `bg_task_clear`).
- ask_user_question labels: user chose to keep the 46 keys without per-key descriptions; no locale feature.
- Scope: user chose all in-repo packages (background-tasks, questions-user, todo, antigravity-bridge, askcodex, subagents).

## Decisions

- Deprecated aliases (`maxBytes`, `tail_lines`, `effort`) and AskCodex boolean `webSearch` are removed because AGENTS.md ignores backward compatibility.
- Schema shapes stay provider-safe: no `$ref`, no new `additionalProperties`, keep existing enums/unions except the removed alternatives.
- Measurement: each package adds a focused vitest that registers its tools through the existing registration seam, serializes `{ name, description, parameters, promptSnippet, promptGuidelines }` with `JSON.stringify`, and asserts total length is at most the after-change value plus about 5% headroom; machine-dependent shell detection and config inputs are held constant, conditional registrations are explicitly enabled, and the test asserts the expected tool names so an omitted tool cannot shrink the measurement. Workers report before/after numbers from the same measurement.
- The `antigravity` replay tool stays unchanged.
- Pinned guidance semantics stay; tests asserting repetition or removed aliases are updated to the new contract.

## Durable deltas

- `ADDED pi-ecosystem` **Compact model-facing Pi tool definitions** — The in-repo Pi packages pi-background-tasks, pi-questions-user, pi-todo, pi-antigravity-bridge, pi-askcodex and pi-subagents MUST keep each package's serialized tool definitions (name, description, parameter schema, prompt snippet and guidelines) within a size budget enforced by a package test, state shared guidance once per tool, and declare no deprecated parameter aliases; pi-background-tasks MUST expose the standalone tools `bg_task_spawn`, `bg_task_watch`, `bg_task_list`, `bg_task_status`, `bg_task_log`, `bg_task_stop` and `bg_task_clear` and no action-wrapper tools.
  - GIVEN a Pi session with these packages loaded; WHEN their registered tool definitions are serialized; THEN each package stays within its tested budget, no definition declares `maxBytes`, `tail_lines` or an `effort` alias, and the background-task tools are exactly the seven standalone tools with shell guidance stated once per tool .

## Plan

Six independent package units run in parallel, one Worker per package directory (one writer per surface); no unit edits another package. Each unit, test-first: add the budget test measuring the current definitions (record the baseline), apply the reductions, update tests that pinned removed repetition or aliases, set the budget to the after value plus about 5% headroom, and run the package's own typecheck and test scripts.

- pi-background-tasks (`src/tools.ts`, `src/index.ts`, tests, README): remove wrapper registrations and their schema builders; add `bg_task_clear` reusing the wrappers' clear path; keep shell guidance in each command tool's description and shorten `command`/`shell` param descriptions; drop `maxBytes`/`tail_lines` from schemas and parsing; shorten repeated cursor/history/verbose descriptions; attach orchestration guidelines once where Pi still shows them. Interface risk: pi-subagents tests use `bg_task_spawn` (unchanged) and a `bg_status` name fixture that does not load this package; report if a pi-subagents change is actually needed instead of editing it.
- pi-questions-user (`src/schema.ts`, `src/index.ts` if needed, tests): generate `labels` properties without descriptions and add one concise `labels` description; keep `LABEL_KEYS`, defaults, validation and rendering.
- pi-todo (`tool/types.ts`, `todo.ts`, tests): batch-op fields reuse the same types without descriptions (the `ops` description points to the top-level fields); condense description/snippet/guidelines keeping proactive use, status timing, multiple in_progress, refs, 1-50 ops and the batch example.
- pi-antigravity-bridge (`src/ask-tool.ts`, tests, README): drop `effort` and its conflict validation; shorten the description to routing names, the two modes and the one-shot/continuation rule, leaving details to parameter docs.
- pi-askcodex (`src/ask-tool.ts`, tests, README): drop `effort` and boolean `webSearch`; remove overlapping reminders between description, guidelines and params.
- pi-subagents (`src/tools/subagent-*.ts`, tests): remove description/snippet repetition in run/continue and keep shared `task_id` text short; no name, param or selection changes.
- Root after all units: update `docs/agent/harness-packaging.md` with the budget convention and the background-tasks surface, then run `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build` and `pnpm run test:pi-extensions`.

Risks: user configurations or custom agents naming `bg_task`/`bg_status` or `effort` stop matching (accepted, no in-repo references); shorter text could weaken model guidance (pinned semantic tests stay); provider schema rejection (shapes unchanged); Windows timing flakiness in package tests is reported, not treated as a change failure. The real token effect is observed by the user afterwards with pi-context-view after reloading the built packages.

## Tasks

- [x] AC-1: pi-background-tasks exposes seven compact standalone tools under a tested budget
  - Outcome: wrappers and deprecated aliases removed, `bg_task_clear` added, guidance deduplicated, budget test locks the reduced size
  - Known entrypoints and skill paths: `pi-packages/pi-background-tasks/src/tools.ts`, `src/index.ts`, `src/tools.test.ts`, `src/e2e.test.ts`, `src/output.test.ts`, `src/log-display.test.ts`, `src/tool-publication.test.ts`, `src/test-support/lifecycle-harness.ts`, README; skills `tdd`, `simplify`
  - Inputs: Exploration bullets for pi-background-tasks; user decision standalone-only
  - Dependencies: none
  - Output: package diff plus before/after serialized char counts
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-background-tasks/**`
  - Interface boundaries: tool names consumed by pi-subagents tests and agent allowlists; history panel, `/bg` command and task state channels unchanged
  - Focused check and PASS evidence: package typecheck and test scripts pass; budget test passes with after ≤ 50% of baseline
  - Return milestone: package checks green with measured numbers
  - Stop / reassessment: a needed edit outside the package or a behavior change beyond the decided surface
- [x] AC-2: ask_user_question labels compacted under a tested budget
  - Outcome: 46 label properties without per-key descriptions plus one concise labels description; budget test
  - Known entrypoints and skill paths: `pi-packages/pi-questions-user/src/schema.ts`, `src/index.ts`, `src/validate.ts`, `test/index.test.ts`, `test/validate.test.ts`, `test/ui.test.ts`; skills `tdd`, `simplify`
  - Inputs: Exploration bullets for pi-questions-user; user decision keep keys without descriptions
  - Dependencies: none
  - Output: package diff plus before/after serialized char counts
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-questions-user/**`
  - Interface boundaries: pi-core question service and RPC fallback unchanged; root prompt guidance about `recommended` and `details.answers`
  - Focused check and PASS evidence: package typecheck and test scripts pass; budget test passes with a reduced size
  - Return milestone: package checks green with measured numbers
  - Stop / reassessment: a needed edit outside the package or a provider schema concern
- [x] AC-3: todo definition deduplicated under a tested budget
  - Outcome: batch-op fields without repeated descriptions, condensed description/snippet/guidelines, budget test
  - Known entrypoints and skill paths: `pi-packages/pi-todo/tool/types.ts`, `todo.ts`, `todo.register.test.ts`, `tool/batch-schema.test.ts`; skills `tdd`, `simplify`
  - Inputs: Exploration bullets for pi-todo; pi-ecosystem task-list requirement
  - Dependencies: none
  - Output: package diff plus before/after serialized char counts
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-todo/**`
  - Interface boundaries: task-list state channel, work panel and reducer semantics unchanged
  - Focused check and PASS evidence: package typecheck and test scripts pass; budget test passes with a reduced size
  - Return milestone: package checks green with measured numbers
  - Stop / reassessment: a schema-shape change or edit outside the package
- [x] AC-4: AskAntigravity compacted under a tested budget
  - Outcome: `effort` alias removed, description no longer repeats parameter docs, budget test
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/src/ask-tool.ts`, `tests/ask-tool.test.ts`, `tests/render-kit.test.ts`, `tests/tool-publication.test.ts`, README; skills `tdd`, `simplify`
  - Inputs: Exploration bullets for pi-antigravity-bridge
  - Dependencies: none
  - Output: package diff plus before/after serialized char counts
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/**`
  - Interface boundaries: `antigravity` replay tool, provider stream and MCP bridge catalog unchanged
  - Focused check and PASS evidence: package typecheck and test scripts pass; budget test passes with a reduced size
  - Return milestone: package checks green with measured numbers
  - Stop / reassessment: an edit outside the package or a provider behavior change
- [x] AC-4: AskCodex compacted under a tested budget
  - Outcome: `effort` alias and boolean `webSearch` removed, overlapping reminders removed, budget test
  - Known entrypoints and skill paths: `pi-packages/pi-askcodex/src/ask-tool.ts`, `src/config.ts`, `tests/ask-tool.test.ts`, README; skills `tdd`, `simplify`
  - Inputs: Exploration bullets for pi-askcodex
  - Dependencies: none
  - Output: package diff plus before/after serialized char counts
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-askcodex/**`
  - Interface boundaries: app-server delegation, approvals and Windows job containment unchanged
  - Focused check and PASS evidence: package typecheck and test scripts pass; budget test passes with a reduced size
  - Return milestone: package checks green with measured numbers
  - Stop / reassessment: an edit outside the package or a config contract change
- [x] AC-5: pi-subagents tool text deduplicated under a tested budget
  - Outcome: run/continue description-snippet repetition removed, shared task_id text short, budget test
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/tools/registry.ts`, `src/tools/subagent-*.ts`, `test/tools/subagent-run.test.ts`, `test/tools/subagent-continue.test.ts`, `test/extension/tool-publication.test.ts`; skills `tdd`, `simplify`
  - Inputs: Exploration bullets for pi-subagents
  - Dependencies: none
  - Output: package diff plus before/after serialized char counts
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/**`
  - Interface boundaries: tool names and params used by `src/agents/prompt-dialects.ts`, `src/harness/adapters/pi.ts`; child tool selection unchanged
  - Focused check and PASS evidence: package typecheck and test scripts pass; budget test passes with a reduced size
  - Return milestone: package checks green with measured numbers
  - Stop / reassessment: a name/param change or edit outside the package
- [x] AC-6: Routed docs updated and repository closeout passes
  - Outcome: `docs/agent/harness-packaging.md` records the budget convention and background-tasks surface; repository checks green
  - Known entrypoints and skill paths: `docs/agent/harness-packaging.md`, `docs/agent/testing.md`
  - Inputs: accepted outputs of all AC-1 to AC-5 rows
  - Dependencies: all AC-1 to AC-5 rows accepted
  - Output: docs diff and check results
  - Owner: root
  - Writes: `docs/agent/harness-packaging.md`
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm run test:pi-extensions` exit 0
  - Return milestone: all checks green
  - Stop / reassessment: a failing check traced to a package unit returns to that unit

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review: fresh Oracle returned a validated OKAY with three nonblocking cautions; two were folded into Decisions/Plan, the capacity caution is handled by dispatching within max_concurrency 5. User explicitly selected Implement.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 3557f79c1a1c3601dd5190cc1f16a34d63869573d43567844b18a1fd319ee46d

Round 2 fresh Oracle (independent from all workers and from round 1) returned PASS; root validated it with `validate-result.mjs --review-kind final-verification --record-sha256 3557f79c…e46d` (valid, no issues).

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The reviewed diff satisfies AC-1 through AC-6. Round-1 parameter-semantic regressions are resolved; no blocking findings remain.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/compact-pi-tool-schemas/compact-pi-tool-schemas.md",
      "claim": "Independently recomputed prefix SHA-256 matches 3557f79c1a1c3601dd5190cc1f16a34d63869573d43567844b18a1fd319ee46d. Canonical pi-ecosystem spec remains dd422afba5535522426f658838c29ce833c8d7ad5845ec52978c677f140b9a62. Installed verify validator passes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "semantic-comparison",
      "locator": "pi-packages/pi-background-tasks/src/tools.ts; HEAD equivalent; src/output.test.ts",
      "claim": "All effective wrapper list/status/log/stop/clear controls remain available except intentionally removed aliases. Clear preserves status filtering, omitted/empty filters, ID precedence, ownership and terminal-only protections. Stop exposes history; clear exposes max_bytes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "budget-verification",
      "locator": "Six untracked tool-budget.test.ts files",
      "claim": "All six budget tests pass, assert expected names and serialize all five contracted fields with controlled relevant inputs and in-scope conditional tools enabled. Independent same-fixture background measurement reproduces 30,933 to 13,605 characters: 44.0% of baseline and below 13,810.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "focused-tests",
      "locator": "Changed-package Vitest checks, --maxWorkers=2",
      "claim": "568 tests across 28 files pass: background 203, questions 185, todo 20, Antigravity 57, AskCodex 58, subagents 45. Coverage includes restored controls, ownership, label behavior, guidance, publication and removed aliases.",
      "basis": "observed",
      "uncertainty": "Focused checks, not complete package-suite reruns."
    },
    {
      "id": "E5",
      "kind": "contract-diff",
      "locator": "Full tracked diff and untracked budget tests",
      "claim": "Questions retain all 46 optional labels. Todo HEAD/current schemas are identical after removing description text. All nine changed subagent factories retain identical names and parameter expressions. Ask tools remove only decided alternatives; safety guidance remains. Documentation matches the surface; no non-goal implementation changes were found.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "execution",
      "locator": "Package typechecks; repository check:ci, typecheck, test:pi-extensions; git diff --check",
      "claim": "All six package typechecks and repository checks pass. Bundle tests pass 13/13. Biome reports nonfatal warnings; diff whitespace check passes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "supplied-execution",
      "locator": "Root convergence handoff",
      "claim": "Root reports pnpm run build exited 0 after convergence.",
      "basis": "inferred",
      "uncertainty": "Build was not independently rerun because it generates output; the assignment explicitly permits reuse."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "HEAD semantic comparison, independent size measurement and focused background tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4"],
      "reason": "Seven standalone tools preserve required capabilities and meet both size limits."
    },
    {
      "check": "AC-2",
      "method": "Schema/runtime diff and question tests",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E5"],
      "reason": "All 46 labels and runtime behavior remain; per-key descriptions are removed."
    },
    {
      "check": "AC-3",
      "method": "Description-independent HEAD schema comparison and todo tests",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E5"],
      "reason": "Schema constraints, actions, refs and validation are preserved."
    },
    {
      "check": "AC-4",
      "method": "Ask-tool diff, schema/runtime tests and budgets",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E5"],
      "reason": "Effort aliases and boolean webSearch alternatives are removed; remaining behavior and safety guidance are preserved."
    },
    {
      "check": "AC-5",
      "method": "HEAD name/parameter comparison, guidance tests and budget",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E5"],
      "reason": "Names and parameters are unchanged; pinned guidance remains without repeated text."
    },
    {
      "check": "AC-6",
      "method": "Documentation review, independent repository checks and supplied fresh build result",
      "outcome": "pass",
      "evidenceIds": ["E5", "E6", "E7"],
      "reason": "Docs are accurate; required closeout commands have passing evidence."
    }
  ],
  "risks": [],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope, record acceptance evidence, then run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/compact-pi-tool-schemas/compact-pi-tool-schemas.md",
    "reviewedRecordSha256": "3557f79c1a1c3601dd5190cc1f16a34d63869573d43567844b18a1fd319ee46d"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

Round 1 final verification (fresh Oracle): validated FAIL — `bg_task_clear` dropped the wrappers' optional `status` filter. Converged within AC-1: restored the status filter with a mixed-status regression test, plus `history` on `bg_task_stop` and `max_bytes` on `bg_task_clear` found by the same audit; background-tasks total 30,933 → 13,605 chars (budget 13,810). Root reran `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm run test:pi-extensions` (13/13), all exit 0.

- AC-1: PASS | `src/tool-budget.test.ts`, HEAD semantic comparison, background focused tests (203) and full package suite (578 passed, 4 skipped) | seven standalone tools incl. `bg_task_clear` with status filter; 30,933 → 13,605 chars (44.0%, budget 13,810); no `maxBytes`/`tail_lines`
- AC-2: PASS | `test/tool-budget.test.ts`, schema/default comparison, package suite (283 passed) | 46 optional labels without per-key descriptions; 5,759 → 3,880 chars (budget 4,074)
- AC-3: PASS | `tool/tool-budget.test.ts`, description-independent HEAD schema comparison, package suite (284 passed) | batch fields without repeated descriptions; 6,313 → 4,597 chars (budget 4,827)
- AC-4: PASS | `tests/tool-budget.test.ts` in pi-antigravity-bridge and pi-askcodex, package suites (932 passed / 9 skipped; 295 passed / 4 skipped) | AskAntigravity+replay 4,434 → 2,139 (budget 2,246); AskCodex 2,035 → 1,537 (budget 1,614); no `effort` alias or boolean `webSearch`
- AC-5: PASS | `test/tools/tool-budget.test.ts`, HEAD name/param comparison, package suite (1681 passed, 1 skipped) | names/params unchanged; 4,869 → 4,049 chars (budget 4,252)
- AC-6: PASS | `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm run test:pi-extensions` | all exit 0, bundles 13/13; `docs/agent/harness-packaging.md` documents the surface and budget convention
- Known environment flakes (not change failures): background-tasks Windows 5s watch deadline under parallel load passed on retry; antigravity untouched provider-watermark/native-render-kit timeouts at default concurrency, green with `--maxWorkers=2`.
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:dd422afba5535522426f658838c29ce833c8d7ad5845ec52978c677f140b9a62

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
