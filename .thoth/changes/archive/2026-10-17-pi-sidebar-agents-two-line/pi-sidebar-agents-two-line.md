# Change: pi-sidebar-agents-two-line

**Classification**: substantial
**Scope**: local
**Uncertainty**: low
**Risk**: low

## Exploration

- Follow-up to archived changes `pi-sidebar-agents-bg-clarity` and `pi-sidebar-agents-metric-priority` (2026-10-17). The sidebar Agents panel renders one line per agent through the pi-core columns layout (`createWorkPanelColumnPlan`, `fitIdentityKeepName`, `dropTinySummary` in `pi-packages/pi-core/src/work-panel-render.ts`; `sourcePanel` and `workPanelRowLineCount` in `pi-packages/pi-sidebar/src/panels/sidebar.ts`).
- User live test after the priority change: at 72 columns a row only shows icon, name, task summary, a couple of metrics and elapsed, because the summary and the metrics compete for the same line (measured: name plus elapsed, context and cost need 39 cells; a 12-cell summary plus speed needs 66 of the 61-64 available at 72).
- The original request allowed "1 line, max 2" per agent; the old 3-line grid wrapped every metric without dropping any.
- Ordering: `retainedRows` (`pi-packages/pi-sidebar/src/panels/sidebar.ts`) sorts every row by `sortStartedAt` ascending, so a newly launched running agent appears below older finished ones (user screenshot 2026-10-17).
- Agents discovery keeps only five terminal tasks ranked by `created_at` and persisted candidates are limited to 100 by launch (`pi-packages/pi-subagents/src/ui/work-panel-provider.ts:230-251`, `src/manager.ts:2438-2452`, `src/history.ts:667-680`), so a recently completed but early-launched task can be dropped before the sidebar sorts (plan review round 2 reproduction). Both providers expose `endedAt`.
- Column bug (same screenshot): a running row's `ctx 18.4%` renders after elapsed at the end of the line while finished rows (no context metric) do not reserve it, so the column is misaligned and out of priority order.

## Intent

Each sidebar Agents row uses two lines: line 1 identifies the work (status glyph, name, task summary, elapsed) and line 2 holds the metrics in the user's priority, so the summary no longer competes with metrics for space; and sidebar work panels show active work on top.

## Non-goals

- No change to the above-editor host, `/subagents` overlays or the Todos panel; the Background panel only gets the new row order.
- No change to the retained count (three finished), overflow policy, status taxonomy, colors, compact `thoth-` names or the four-cell tiny-summary rule.

## Acceptance

- AC-1: In the sidebar Agents panel every row whose line 2 has at least one admitted metric renders exactly two lines: line 1 shows the status glyph, the name (compact, never dropped), the task summary using all remaining width (truncated with `…`, hidden with its separator below four cells) and the right-aligned elapsed time (never dropped); line 2, indented under the name, shows metric columns aligned panel-wide in the priority context, cost, speed, tokens, tools, warnings, model/effort, showing a lower-priority element only when every higher-priority one fits, decided from reserved widths. A row with no admitted line-2 metric (for example only elapsed, or only a non-admitted model) renders one line.
- AC-2: Row height and visible line-2 columns stay stable when only metric digit widths change within reserved ranges; height-pressure overflow (`+N more`) counts whole two-line rows and never splits a row.
- AC-3: Regressions render provider-shaped `thoth-oracle` rows (running, completed, failed, with and without warnings) at 36, 50, 64 and 72 columns, native and test kit, asserting the two-line shape, the full priority prefix on line 2, a readable summary on line 1 at 50 columns and above, and the measured line-2 set per width recorded table-driven in the test.
- AC-4: The canonical "Stable work-panel row height" and "Sidebar work-panel launch order and retention" requirements and routed docs describe the two-line Agents layout and the new order.
- AC-5: Sidebar Agents and Background panels list active rows first in launch order (oldest active on top; activity never reorders them), then the three most recently finished rows ordered by completion time, most recent first; under height pressure the oldest finished rows hide first, then the oldest active rows.
- AC-6: A metric present on only some rows (for example context on running rows) renders in its own priority slot aligned with the other rows' columns, never after elapsed or out of priority order.

## Clarifications

- Order (user, 2026-10-17, after live test): active rows on top in launch order; finished below, most recently finished first.
- Layout (user, 2026-10-17, after live test): two lines per agent; line 1 icon, name, task summary and elapsed; line 2 the remaining metrics in the existing priority (context, cost, speed, tokens, tools, warnings, model/effort).

## Decisions

- The two-line form is a sidebar Agents option of the pi-core columns layout (for example a `lines: 2` setting on the column plan or render options, documented in the type); the summary reservation no longer gates metrics because they live on line 2.
- Line 2 alignment: one panel-wide plan so columns line up across rows; line 2 starts under the name (after glyph and tree gutter).
- Warnings move to line 2 in their priority slot; a non-admitted warning stays visible in `/subagents`.
- Rows whose line 2 would be empty (no admitted metric, for example a task cancelled before starting or one carrying only a non-admitted model) stay single-line; an empty second line is never drawn (root decision after final verification round 1).
- The two-line packing adjustment (minimum allocation fitting a whole two-line row) applies only to panels rendering two-line rows; other panels keep their previous allocation.
- Order (user, 2026-10-17): active first in launch order, finished below by most recent completion; supersedes the earlier strict oldest-first launch order. Retention keeps the three most recently finished rows (by completion time, ties by id).
- The new order applies only to the Agents and Background sources; Todos keeps its current behavior. Under height pressure finished rows hide by oldest completion, not by displayed index.
- Agents discovery selects terminal candidates by completion time (most recent first, before truncation), from a bounded completion-ranked persisted-history input bound for discovery; the activity-ranked `/subagents` history is unchanged.

## Durable deltas

- `MODIFIED pi-ecosystem` **Stable work-panel row height** — the shared work-panel renderer MUST decide multi-line metric wrapping and, for the sidebar's column layout, which elements to show from reserved widths of each metric's number format, so a row's line count and visible columns do not change when only the digit width of its metric values changes within each format's reserved range; sidebar Agents rows MUST render a first line with the status glyph, a name without a leading `thoth-` prefix, the task summary in the remaining width and the elapsed time, and, when at least one of its other metrics is admitted, a second line under the name whose columns are aligned panel-wide and kept in the priority context, cost, speed, tokens, tools, warnings and model/effort, showing a lower-priority element only when every higher-priority one fits; in every sidebar columns-layout panel a truncated summary that would show fewer than four cells MUST be hidden with its separator while a complete short summary stays visible; values beyond a reserved range MAY only increase a row's line count or drop elements, never toggle back and forth.
  - GIVEN a running `thoth-oracle` subagent row with a long task summary, context, cost, speed, tokens, tools and model whose values cross format boundaries such as 99→100 tok/s and 9s→10s; WHEN the work panel and the 50- and 72-column sidebar render it; THEN the sidebar row shows `oracle`, a readable summary and elapsed on its first line, at least context and cost on its second line at 50 columns and at least context, cost and speed at 72 columns, while every value stays within its reserved range the visible columns and the two-line height do not change, and rows below it do not move.
- `MODIFIED pi-ecosystem` **Sidebar work-panel launch order and retention** — The pi-sidebar Agents and Background panels MUST list active rows first in launch order with the oldest active at the top (subagent original creation time, background start time with task id as tie-breaker) and MUST NOT reorder active rows because of activity, followed by the three most recently finished rows ordered by completion time with the most recent first, under one rule for every terminal status without time-based expiry; when height is insufficient they MUST hide the oldest finished rows first, then the oldest active rows, reporting hidden rows with a `+N more` line.
  - GIVEN two running subagents launched in order A then B and four background tasks that finished in order W, X, Y, Z, of which W failed; WHEN B reports activity after A and the sidebar renders; THEN A stays above B above any finished agent, and the Background panel shows Z, Y and X in that order without W.

## Plan

A worker unit makes Agents discovery completion-ranked in pi-subagents; one designer unit does sidebar row order in `retainedRows` (active first by launch, finished by completion), the column-alignment fix for sparse metrics, pi-core two-line columns option (identity line with summary using leftover width and elapsed; metrics line with the existing priority walk minus the summary reservation), pi-sidebar Agents panel opt-in and line counting for packing/overflow, regressions and updates to tests encoding the one-line Agents rule (`pi-sidebar/test/work-panel-{priority,columns,narrow-rows,warning-rows,tiny-summary}.test.ts`, `pi-core/test/work-panel-column-layout.test.ts`, `pi-thoth-theme/src/work-panel-*.test.ts` as needed). Root updates `docs/agent/harness-packaging.md`, runs the local gate and requests a fresh final Oracle; the delta is applied at archive.

## Tasks

- [x] AC-1: Two-line Agents columns layout in pi-core and pi-sidebar
  - Outcome: Agents rows render line 1 (glyph, name, summary, elapsed) and line 2 (priority metrics, panel-aligned); Background and Todos unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/work-panel-render.ts` (`createWorkPanelColumnPlan`, `fitIdentityKeepName`, `dropTinySummary`), `pi-packages/pi-core/src/work-panel.ts`, `pi-packages/pi-sidebar/src/panels/sidebar.ts` (`sourcePanel`, `workPanelRowLineCount`); skill `tdd`
  - Inputs: user layout decision
  - Dependencies: none
  - Output: implementation and updated tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-core/src/**`, `pi-packages/pi-core/test/**`, `pi-packages/pi-sidebar/src/panels/**`, `pi-packages/pi-sidebar/test/**`, `pi-packages/pi-thoth-theme/src/work-panel-*.test.ts`
  - Interface boundaries: host greedy/grid output unchanged; other columns panels unchanged
  - Focused check and PASS evidence: pi-core, pi-sidebar, pi-thoth-theme vitest green
  - Return milestone: tests green
  - Stop / reassessment: two-line rows break overflow packing or performance tests
- [x] AC-2: Stability and overflow for two-line rows
  - Outcome: digit-stability and whole-row overflow regressions pass
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/sidebar.ts` packing, `pi-packages/pi-sidebar/test/panels.test.ts`, `pi-packages/pi-sidebar/test/performance.test.ts`
  - Inputs: AC-1 output
  - Dependencies: AC-1 unit (same designer session)
  - Output: tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/test/**`, `pi-packages/pi-core/test/**`
  - Interface boundaries: none
  - Focused check and PASS evidence: pi-sidebar vitest green incl. performance
  - Return milestone: tests green
  - Stop / reassessment: none
- [x] AC-3: Width regressions with measured line-2 sets
  - Outcome: table-driven native/kit tests at 36/50/64/72 with provider-shaped rows
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/test/fixture.ts`, `pi-packages/pi-sidebar/test/work-panel-priority.test.ts`
  - Inputs: AC-1 output
  - Dependencies: AC-1 unit
  - Output: tests and measured table
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: none
  - Focused check and PASS evidence: tests green
  - Return milestone: tests green
  - Stop / reassessment: none
- [x] AC-4: Routed docs and local gate
  - Outcome: `docs/agent/harness-packaging.md` describes the two-line Agents layout; `check:ci`, `typecheck`, `build` green
  - Known entrypoints and skill paths: `docs/agent/harness-packaging.md`
  - Inputs: accepted implementation
  - Dependencies: AC-1..AC-3
  - Output: doc edit
  - Owner: root
  - Writes: `docs/agent/harness-packaging.md`
  - Interface boundaries: none
  - Focused check and PASS evidence: commands exit 0; validator `--through verify` valid
  - Return milestone: ready for final Oracle
  - Stop / reassessment: none
- [x] AC-5: Completion-ranked Agents discovery in pi-subagents
  - Outcome: discovery returns active tasks plus terminal candidates ranked by completion time (bounded, persisted and live merged without duplicates), so the most recently finished tasks are always available to the sidebar
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/ui/work-panel-provider.ts:230-251`, `pi-packages/pi-subagents/src/manager.ts:2438-2452`, `pi-packages/pi-subagents/src/history.ts:667-680`, `pi-packages/pi-subagents/src/extension/subagents-extension.ts`; skill `tdd`
  - Inputs: user order decision; plan review round 2 reproduction
  - Dependencies: none
  - Output: completion-ranked history query and discovery selection, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: `WorkPanelSource` discovery contract; activity-ranked `/subagents` history unchanged
  - Focused check and PASS evidence: pi-subagents vitest green including reverse completion order (six tasks finishing in reverse launch order) and a resumed recent completion outside the launch-ranked window
  - Return milestone: tests green
  - Stop / reassessment: requires schema migration
- [x] AC-5: Active-first row order in sidebar work panels
  - Outcome: in Agents and Background only, active rows on top in launch order, finished rows below by most recent completion, retention of the three most recently finished, overflow hiding finished rows by oldest completion; Todos unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/sidebar.ts` (`retainedRows`), `pi-packages/pi-sidebar/test/{panels,work-panels}.test.ts`; skill `tdd`
  - Inputs: user order decision
  - Dependencies: none
  - Output: implementation and rewritten order tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/src/panels/**`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: providers' `sortStartedAt` and `endedAt`
  - Focused check and PASS evidence: pi-sidebar vitest green incl. performance
  - Return milestone: tests green
  - Stop / reassessment: rows lack completion time
- [x] AC-6: Sparse metric columns aligned in priority slot
  - Outcome: a metric present only on some rows keeps its priority slot aligned across rows
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/work-panel-render.ts` (`createWorkPanelColumnPlan`, columns rendering)
  - Inputs: user screenshot
  - Dependencies: AC-1 unit (same designer session)
  - Output: fix and regression with mixed running/finished rows
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-core/src/**`, `pi-packages/pi-core/test/**`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: host greedy/grid unchanged
  - Focused check and PASS evidence: regression green
  - Return milestone: tests green
  - Stop / reassessment: none

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review history: round 1 OKAY on the two-line-only version (superseded when the user added ordering), round 2 REJECT (launch-ranked Agents discovery), round 3 OKAY validated with validate-result.mjs (exit 0). After round 3, the delta scenario wording was relaxed to "at least" per its nonblocking caution (speed already fits at 50). Caution carried to dispatch: one completion/id tie direction (completion desc, id desc) across persisted, provider and sidebar truncation.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 0e489cf5d06a9fbe49ecaf89c83ac8ee7eb12bc77ff262668b16250e6f871980

Final verification history: round 1 FAIL (packing change affected Todos/Background; empty line 2 contract), resolved by restricting packing to two-line panels and the root decision that line 2 renders only with an admitted metric; round 2 PASS, envelope validated with validate-result.mjs (exit 0). Post-PASS: root fixed the nonblocking test-helper typing in `pi-packages/pi-sidebar/test/oracle-row.ts` (metric key typed as `WorkPanelMetricKey`); pi-sidebar `tsc --noEmit` exit 0 and 299 tests pass. A pi-background-tasks timing failure (`src/task-state-events.test.ts`, package untouched) passed 3/3 on rerun.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS against the amended acceptance and non-goals. Round-1 findings are resolved. One nonblocking test-typing issue remains.",
  "evidence": [
    {
      "id": "binding",
      "kind": "hash",
      "locator": ".thoth/changes/pi-sidebar-agents-two-line/pi-sidebar-agents-two-line.md",
      "claim": "Independent prefix hash matches 0e489cf5d06a9fbe49ecaf89c83ac8ee7eb12bc77ff262668b16250e6f871980. Canonical spec hash matches 47174407db3837a5d1ce802579635d14d86668c09b16d0aba0b106b740e2d563; deltas remain unapplied.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "implementation",
      "kind": "diff-review",
      "locator": "pi-packages/pi-core/src/work-panel-render.ts; pi-packages/pi-sidebar/src/panels/sidebar.ts",
      "claim": "Reviewed actual tracked diff and all three named untracked test files. Renderer separates identity/elapsed from panel-aligned priority metrics and suppresses empty second lines. Packing changes are confined to the Agents option; other panels retain baseline allocation.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ordering",
      "kind": "diff-review",
      "locator": "pi-packages/pi-subagents/src/{history.ts,manager.ts,ui/work-panel-provider.ts}; pi-packages/pi-sidebar/src/panels/sidebar.ts",
      "claim": "Discovery ranks terminal candidates by completion before truncation. Sidebar orders active rows by launch, retains three newest completions, and drops oldest completions before oldest active rows. Activity-ranked overlays remain unchanged.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "tests",
      "kind": "execution",
      "locator": "Independent Vitest runs: pi-sidebar; pi-core test/work-panel; pi-thoth-theme work-panel tests; pi-subagents work-panel-counts tests",
      "claim": "299 sidebar, 237 core, 6 theme and 9 subagents tests passed, including width matrices, sparse columns, whole-row packing, mixed-panel baseline allocation and model-only [2,1] line counts.",
      "basis": "observed",
      "uncertainty": "Other full-package suites were not independently repeated."
    },
    {
      "id": "degradation",
      "kind": "execution",
      "locator": "SidebarPanels direct rendering at heights 9 and 12",
      "claim": "Height 9 preserves one whole two-line Agent row and Cost content; height 12 also shows +5 more and /subagents. Missing count/footer at height 9 follows the unchanged fitBlocks lone-row fallback, so the adjusted expectation preserves the declared overflow-policy non-goal.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "docs",
      "kind": "artifact-review",
      "locator": "docs/agent/harness-packaging.md; assigned record Durable deltas",
      "claim": "Routed documentation and both durable deltas describe two-line Agents and completion-ranked retention consistently with the amended decisions.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "checks",
      "kind": "execution",
      "locator": "Root/package typechecks; thoth-sdd validator; git diff --check",
      "claim": "Root typecheck, pi-core typecheck, pi-subagents typecheck, verify validator and diff whitespace check passed. Reviewed input fingerprint remained unchanged through final validation.",
      "basis": "observed",
      "uncertainty": "Build and check:ci results are root-reported, not independently repeated."
    },
    {
      "id": "test-types",
      "kind": "diagnostic",
      "locator": "pi-packages/pi-sidebar/test/work-panel-order.test.ts:171,316; test/oracle-row.ts",
      "claim": "Package-local sidebar typecheck fails with two TS2367 diagnostics because oracleRow's inferred metric-key union excludes context/elapsed. This is confined to test-helper typing; runtime regressions and the stated root typecheck pass.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "Record binding and verify gate",
      "method": "Independent byte hashing and installed validator --through verify",
      "outcome": "pass",
      "evidenceIds": ["binding", "checks"],
      "reason": "Expected record and baseline digests match; structural validation succeeds."
    },
    {
      "check": "AC-1",
      "method": "Renderer review and native/kit regressions",
      "outcome": "pass",
      "evidenceIds": ["implementation", "tests"],
      "reason": "Two lines only when an admitted second-line element exists; identity, elapsed and priority admission satisfy the amended contract."
    },
    {
      "check": "AC-2",
      "method": "Digit-boundary, packing and direct degradation checks",
      "outcome": "pass",
      "evidenceIds": ["tests", "degradation"],
      "reason": "Reserved-width stability and whole-row overflow hold."
    },
    {
      "check": "AC-3",
      "method": "Table-driven native/kit tests at 36/50/64/72 columns",
      "outcome": "pass",
      "evidenceIds": ["tests"],
      "reason": "Provider-shaped running/completed/failed and warning cases pass measured priority-prefix and summary assertions."
    },
    {
      "check": "AC-4",
      "method": "Documentation, declared deltas and unchanged canonical baseline review",
      "outcome": "pass",
      "evidenceIds": ["binding", "docs"],
      "reason": "Documentation and archive-time deltas cover both requirements."
    },
    {
      "check": "AC-5",
      "method": "Discovery/order/drop review and persisted-history regressions",
      "outcome": "pass",
      "evidenceIds": ["ordering", "tests"],
      "reason": "Completion-ranked discovery, active-first ordering, three-finished retention and hiding precedence are implemented."
    },
    {
      "check": "AC-6",
      "method": "Sparse-metric native/kit alignment regressions",
      "outcome": "pass",
      "evidenceIds": ["implementation", "tests"],
      "reason": "Missing metrics reserve their slots; elapsed stays on line 1."
    },
    {
      "check": "Non-goals and round-1 remediation",
      "method": "Full diff inspection and compatibility regressions",
      "outcome": "pass",
      "evidenceIds": ["implementation", "ordering", "tests", "degradation"],
      "reason": "Host/overlay behavior, Todos allocation, Background layout, retention count and overflow fallback remain unchanged."
    },
    {
      "check": "Additional package-local sidebar typecheck",
      "method": "pnpm --filter @thoth-agents/pi-sidebar typecheck",
      "outcome": "fail",
      "evidenceIds": ["test-types"],
      "reason": "Two test-only typing diagnostics; nonblocking under the assigned acceptance-only severity threshold."
    }
  ],
  "risks": [
    {
      "description": "Sidebar's package-local typecheck remains red in the new test helper. Explicit metric-key typing should resolve the two diagnostics; no acceptance behavior failure was found.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["test-types"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope before closeout. Track the nonblocking test-helper typing correction separately.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-sidebar-agents-two-line/pi-sidebar-agents-two-line.md",
    "reviewedRecordSha256": "0e489cf5d06a9fbe49ecaf89c83ac8ee7eb12bc77ff262668b16250e6f871980"
  }
}
```

- AC-1: PASS | two-line renderer and native/kit regressions | Oracle r2 implementation/tests
- AC-2: PASS | digit-boundary, whole-row packing and degradation checks | Oracle r2 tests/degradation
- AC-3: PASS | table-driven 36/50/64/72 width regressions (pi-sidebar work-panel-priority) | Oracle r2 tests
- AC-4: PASS | docs/agent/harness-packaging.md and both deltas reviewed; check:ci, typecheck, build exit 0 | Oracle r2 binding/docs
- AC-5: PASS | completion-ranked discovery (pi-subagents) and active-first order (pi-sidebar work-panel-order) | Oracle r2 ordering/tests
- AC-6: PASS | sparse-metric alignment regressions | Oracle r2 implementation/tests
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:47174407db3837a5d1ce802579635d14d86668c09b16d0aba0b106b740e2d563

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
