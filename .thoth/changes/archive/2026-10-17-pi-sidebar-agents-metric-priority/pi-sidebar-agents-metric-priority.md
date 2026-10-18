# Change: pi-sidebar-agents-metric-priority

**Classification**: substantial
**Scope**: local
**Uncertainty**: low
**Risk**: low

## Exploration

- Follow-up to archived change `pi-sidebar-agents-bg-clarity` (2026-10-17). User live test (screenshots at 50 and 72 columns): Agents rows named `thoth-oracle` show only elapsed at 50 columns and only tokens at 72, while the design table approved earlier promised tokens at ~50, model/effort and cost at ~64, tools/context/speed at ~72.
- Cause: `createWorkPanelColumnPlan` in `pi-packages/pi-core/src/work-panel-render.ts` reserves a 12-cell summary budget before keeping any optional metric column (`minIdentityWidth`), a rule added during convergence without user confirmation. With the tree prefix, glyph, a 12-cell `thoth-` name and elapsed, ~46 inner cells at 50 columns leave room for either the summary budget or tokens, not both.
- Agent names come from the pi-subagents work-panel provider row identity (`pi-packages/pi-subagents/src/ui/work-panel-provider.ts`, `taskRow`); all bundled specialists share the `thoth-` prefix, so the prefix carries no information in the sidebar.

## Intent

The sidebar Agents panel shows what matters while agents run, in the user's priority order, and names drop the redundant `thoth-` prefix.

## Non-goals

- No change to the above-editor host or `/subagents` overlays (they keep full names and their layouts).
- No change to launch order, retention, status taxonomy or element colors.
- No change to the Background panel other than hiding summary fragments shorter than four cells (user, 2026-10-17).

## Acceptance

- AC-1: In the sidebar columns layout, after the always-visible status glyph and name, elements are kept panel-wide in this priority: elapsed (A, never dropped), context (B), cost (C), task summary (F, reserved at least 12 cells or its full length), speed (D), tokens (E), tools (G), warnings (I), model/effort (H). A lower-priority element is shown only if every higher-priority element keeps its space; elapsed, context and cost do not depend on the summary reservation; the summary otherwise uses leftover width and is hidden with its separator below 4 cells; warnings use only width left after G. Decisions stay panel-wide from reserved widths and remain stable across digit changes.
- AC-2: Sidebar Agents rows show agent names without a leading `thoth-` prefix (for example `oracle`), while the above-editor host and overlays keep the full name.
- AC-3: Regressions render provider-shaped `thoth-oracle` rows with every metric through the sidebar at 36, 50, 64 and 72 columns (native and test kit): one line each, name `oracle`, and the visible elements are exactly the highest-priority prefix of A, B, C, F, D, E, G, I, H that fits; the test records the measured set per width.
- AC-5: In every sidebar columns-layout panel (Agents and Background), a truncated summary that would show fewer than four cells is hidden together with its separator, while a complete short summary (for example `ok`) always stays visible, whether the provider emits the separator and summary as one segment or separately.
- AC-4: The canonical "Stable work-panel row height" requirement and routed docs describe the new priority and name rule.

## Clarifications

- Columns (user, 2026-10-17, after live test and plan review): priority A elapsed, B context, C cost, F summary, D speed, E tokens, G tools, I warnings, H model/effort; model/effort and tools are least relevant (roles are fixed); details live in `/subagents`.
- Names (user): the sidebar shows names without `thoth-`.
- Tiny fragments (user, after final verification round 2): the four-cell summary rule also applies to Background rows.
- Earlier width table (tokens at 50, model at 64, tools/context/speed at 72) is superseded; plan review showed it was not achievable with real chrome widths. Measured budget (plan review round 2): name `oracle` plus elapsed, context and cost need 39 cells and fit at 50; adding a twelve-cell summary and speed needs 66 cells, more than the 61–64 available at 72, so speed is not promised at any sidebar width.

## Decisions

- Replace the drop order speed → context → tools → cost → model → tokens and the 12-cell pre-metric summary reservation with the AC-1 priority list; the summary reservation now only gates D, E, G, I and H.
- Warnings stay identity text but rank after tools; when hidden they remain visible in `/subagents`.
- The `thoth-` prefix is stripped through provider row data meant only for the columns layout (an optional compact text on the name segment, or equivalent minimal pi-core extension documented in the type), not by name matching inside pi-sidebar; host greedy/grid output stays byte-identical.

## Durable deltas

- `MODIFIED pi-ecosystem` **Stable work-panel row height** — the shared work-panel renderer MUST decide multi-line metric wrapping and, for the sidebar's single-line column layout, which elements to show from reserved widths of each metric's number format, so a row's line count and visible columns do not change when only the digit width of its metric values changes within each format's reserved range; sidebar Agents rows MUST stay on one line at every supported width, always showing the status glyph, a name without a leading `thoth-` prefix and elapsed time, then keeping elements panel-wide in the priority context, cost, task summary (reserving at least twelve cells), speed, tokens, tools, warnings and model/effort, showing a lower-priority element only when every higher-priority one keeps its space; in every sidebar columns-layout panel a truncated summary that would show fewer than four cells MUST be hidden with its separator while a complete short summary stays visible; values beyond a reserved range MAY only increase a row's line count or drop elements, never toggle back and forth.
  - GIVEN a running `thoth-oracle` subagent row with context, cost, summary, speed, tokens, tools and model whose values cross format boundaries such as 99→100 tok/s and 9s→10s; WHEN the work panel and the 50- and 72-column sidebar render it; THEN the sidebar row stays on one line showing `oracle`, elapsed, context and cost at 50 columns and additionally the task summary at 72 columns, never showing speed, tokens, tools or model/effort unless context, cost and a twelve-cell summary keep their space, while every value stays within its reserved range the visible elements do not change, and rows below it do not move.

## Plan

One designer unit: pi-core column plan priority and compact name text (`pi-packages/pi-core/src/work-panel-render.ts`, `work-panel.ts`), pi-subagents provider supplying the compact name, sidebar-level regressions, and updates to tests that encoded the previous drop order and summary budget (`pi-core/test/work-panel-column-layout.test.ts`, `work-panel-keep-name.test.ts`, `pi-sidebar/test/work-panel-columns.test.ts`, `work-panel-narrow-rows.test.ts`, `work-panel-warning-rows.test.ts`, `pi-thoth-theme/src/work-panel-*.test.ts` as needed). Root updates `docs/agent/harness-packaging.md`. Verification: touched-package typecheck and vitest, `check:ci`, `typecheck`, `build`, fresh Oracle; spec delta applied at archive.

## Tasks

- [x] AC-1: Priority-based column plan in pi-core
  - Outcome: column plan follows the AC-1 priority with the summary reservation gating only lower-priority elements
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/work-panel-render.ts` (`createWorkPanelColumnPlan`, `minIdentityWidth`, `fitIdentityKeepName`); skill `tdd`
  - Inputs: user priority decision
  - Dependencies: none
  - Output: implementation and updated pi-core tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-core/src/**`, `pi-packages/pi-core/test/**`
  - Interface boundaries: host greedy/grid unchanged
  - Focused check and PASS evidence: pi-core vitest green with a width sweep showing the priority prefix and digit stability
  - Return milestone: tests green
  - Stop / reassessment: priority breaks digit-stability guarantees
- [x] AC-2: Compact agent names in the sidebar
  - Outcome: columns layout shows `oracle` for `thoth-oracle`; host and overlays keep full names
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/ui/work-panel-provider.ts` (`taskRow`), `pi-packages/pi-core/src/work-panel.ts`
  - Inputs: AC-1 output
  - Dependencies: AC-1 unit (same designer session)
  - Output: provider data and renderer support, tests
  - Owner: thoth-designer
  - Writes: those files and `pi-packages/pi-subagents/test/**`
  - Interface boundaries: `WorkPanelSegment` type
  - Focused check and PASS evidence: pi-subagents vitest green; host golden output unchanged
  - Return milestone: tests green
  - Stop / reassessment: requires pi-sidebar name matching
- [x] AC-3: Sidebar width regressions for thoth-named agents
  - Outcome: pi-sidebar tests at 36/50/64/72 (native and kit) asserting the exact visible priority prefix per width with provider-shaped rows
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/test/fixture.ts`, `pi-packages/pi-sidebar/test/work-panel-columns.test.ts`
  - Inputs: AC-1 and AC-2 outputs
  - Dependencies: AC-1, AC-2
  - Output: tests and the measured per-width set
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/test/**`, `pi-packages/pi-thoth-theme/src/work-panel-*.test.ts`
  - Interface boundaries: none
  - Focused check and PASS evidence: pi-sidebar and pi-thoth-theme vitest green incl. performance
  - Return milestone: tests green
  - Stop / reassessment: none
- [x] AC-4: Routed docs updated for priority and compact names
  - Outcome: `docs/agent/harness-packaging.md` columns paragraph matches the new rule
  - Known entrypoints and skill paths: `docs/agent/harness-packaging.md`
  - Inputs: accepted implementation
  - Dependencies: AC-1..AC-3
  - Output: doc edit; local gate (`check:ci`, `typecheck`, `build`) green
  - Owner: root
  - Writes: `docs/agent/harness-packaging.md`
  - Interface boundaries: none
  - Focused check and PASS evidence: commands exit 0; validator `--through verify` valid
  - Return milestone: ready for final Oracle
  - Stop / reassessment: none
- [x] AC-5: Four-cell summary rule across sidebar columns panels
  - Outcome: truncated summaries under four cells hidden with their separator in Agents and Background; complete short summaries kept for combined and split segment shapes
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/work-panel-render.ts` (`dropTinySummary`); skill `tdd`
  - Inputs: user decision; final verification round 2 findings
  - Dependencies: AC-1 unit
  - Output: fix and regressions (combined ` · ok` vs split short summary; Background provider-shaped rows at 36–40 native and kit)
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-core/src/**`, `pi-packages/pi-core/test/**`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: host greedy/grid unchanged
  - Focused check and PASS evidence: pi-core and pi-sidebar vitest green
  - Return milestone: tests green
  - Stop / reassessment: none

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review history: round 1 REJECT (unachievable width table), round 2 REJECT (speed promised at 72), round 3 OKAY validated with validate-result.mjs (exit 0). Nonblocking caution: regressions keep provider-real labels and actual gutters; the 50-column kit case has zero spare cells.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: c19032ee84bd69df7b2f50a60b5edb5accb5b10c7b5d5d2d66921581338173ca

Final verification history: round 1 FAIL (warning admission, sub-4-cell summaries); round 2 FAIL (combined short summary hidden, Background change — brought in scope by user); round 3 PASS, envelope validated with validate-result.mjs (exit 0).

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The amended record and actual uncommitted implementation satisfy AC-1 through AC-5 and the stated non-goals.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/pi-sidebar-agents-metric-priority/pi-sidebar-agents-metric-priority.md",
      "claim": "Independently recomputed prefix SHA-256 matches c19032ee84bd69df7b2f50a60b5edb5accb5b10c7b5d5d2d66921581338173ca. Reviewed the amended Background scope, acceptance, clarifications, decisions and durable delta.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "diff-review",
      "locator": "git status --short; git diff; three untracked regression tests",
      "claim": "Reviewed all changed code, docs and tests. Column admission follows the requested priority; warning admission is panel-wide; compact names and tiny-summary removal are columns-only. git diff --check passes.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "test-execution",
      "locator": "pi-core work-panel tests; pi-sidebar work-panel tests; pi-subagents compact-name, golden, metrics and counts tests",
      "claim": "Independent focused reruns passed: 233 core, 66 sidebar and 29 subagents tests, totaling 328.",
      "basis": "observed",
      "uncertainty": "Broad CI, typecheck, build and full-package totals were root-reported, not independently rerun."
    },
    {
      "id": "E4",
      "kind": "behavior-probe",
      "locator": "Actual createSubagentsWorkPanelProvider rows rendered through SidebarPanels",
      "claim": "Native and kit modes each render three single-line oracle rows. Measured sets: 36 elapsed plus leftover summary; 50 elapsed/context/cost; 64 and 72 elapsed/context/cost/summary.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "comparative-verification",
      "locator": "In-memory comparison against HEAD work-panel-render.ts",
      "claim": "8,712 greedy/grid output comparisons were byte-identical. Across 354 Background column comparisons, all nine changed outputs exclusively removed truncated summaries below four cells; complete ok summaries remained unchanged.",
      "basis": "observed",
      "uncertainty": "Bounded synthetic status, summary, segment-shape and width matrix."
    },
    {
      "id": "E6",
      "kind": "governance-and-docs",
      "locator": "Installed validate.mjs --through verify; canonical pi-ecosystem spec; docs/agent/harness-packaging.md:361-370",
      "claim": "Verify validator passes. Canonical spec SHA-256 remains f5e8a0252cb92fa8bc9dc6c38575a4dde9dd70f1f0e871b90cc6f841fe263bbb, correctly awaiting archive. Routed docs describe priority and columns-only compact names.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1: priority, warning admission and digit stability",
      "method": "Source review and independent core/sidebar regressions.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Higher-priority reservations gate lower elements, warnings cannot bypass admission, and reserved-width stability tests pass."
    },
    {
      "check": "AC-2 and non-goals",
      "method": "Provider review, compact-name tests, host goldens and HEAD output comparison.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E5"],
      "reason": "Sidebar names compact correctly; host rendering remains unchanged. Background differences stay within the amended exception."
    },
    {
      "check": "AC-3: native/kit width regressions",
      "method": "Run committed-shape regression files and independently render actual provider output.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4"],
      "reason": "All four required widths have the expected measured elements and one line per row."
    },
    {
      "check": "AC-4: durable delta and routed docs",
      "method": "Review normative delta, documentation and canonical baseline.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E6"],
      "reason": "Priority and name rules are documented; canonical application is correctly deferred until archive."
    },
    {
      "check": "AC-5: tiny and complete short summaries",
      "method": "Run combined/split summary and Background regressions; compare Background outputs against HEAD.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E5"],
      "reason": "Truncated fragments below four cells disappear with their separator, while complete short summaries survive."
    },
    {
      "check": "Record binding and verify gate",
      "method": "Independent byte hashing and installed validator execution.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E6"],
      "reason": "Record and baseline digests match the assignment; verify validation succeeds."
    }
  ],
  "risks": [
    {
      "description": "Routed docs abbreviate the rule as summaries hiding below four cells without explicitly stating the complete-short-summary exception. Implementation and normative delta are correct; this is minor wording polish.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E1", "E6"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root validates the unchanged envelope, records acceptance evidence, runs closeout, then archives and applies the declared delta.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-sidebar-agents-metric-priority/pi-sidebar-agents-metric-priority.md",
    "reviewedRecordSha256": "c19032ee84bd69df7b2f50a60b5edb5accb5b10c7b5d5d2d66921581338173ca"
  }
}
```

- AC-1: PASS | priority walk, warning admission, digit-stability regressions (pi-core, pi-sidebar work-panel-priority) | Oracle r3 E2/E3
- AC-2: PASS | compact-name tests, host goldens unchanged (pi-subagents) | Oracle r3 E2/E3/E5
- AC-3: PASS | native/kit width regressions 36/50/64/72 | Oracle r3 E3/E4
- AC-4: PASS | docs/agent/harness-packaging.md and delta reviewed; check:ci, typecheck, build exit 0 | Oracle r3 E1/E6
- AC-5: PASS | tiny-summary combined/split and Background regressions | Oracle r3 E2/E3/E5
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:f5e8a0252cb92fa8bc9dc6c38575a4dde9dd70f1f0e871b90cc6f841fe263bbb

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
