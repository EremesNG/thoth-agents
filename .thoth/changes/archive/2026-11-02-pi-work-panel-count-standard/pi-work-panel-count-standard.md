# Change: pi-work-panel-count-standard

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- Normal-mode collapsed prompt-retention headings in the pi-core work panel render `◆ Agents · N done · M failed` (`pi-packages/pi-core/src/work-panel-render.ts:70-139,1886-1917`): only done/failed, both always shown (`0 failed`), from provider `summary.completed`/`summary.failed` when defined, otherwise from the coarse retention `itemState` (`:215-223`), which misclassifies cancelled, interrupted, resolved, expected-exit and timed-out rows for providers without numeric summaries. Cancelled counts are never shown, and a section collapses to a summary line only when done or failed is non-zero, so cancelled-only or resolved-only history disappears.
- Expanded headings use `summarySegments` (`work-panel-render.ts:225-248`): provider segments or text, else `N/T done`, else `N running` plus positive `M failed`, else `N items`. Agents supply their own word segments; Background shows running and failed only, omitting completed and cancelled; Todos show `53/54 done`.
- First-party numeric summaries: Agents report running (incl. stopping), queued, completed, failed, cancelled (incl. interrupted) and total (`pi-packages/pi-subagents/src/ui/work-panel-provider.ts:293-335`); Background reports running, actionable failed/timed-out, completed/expected-exit and cancelled (`pi-packages/pi-background-tasks/src/navigator-provider.ts:65-73`); the task list reports completed and total and does not opt into prompt retention.
- The editor-replaced summary line (merged `9db8f971`, `00853876`) uses `compactSummaryCounts` (`work-panel-render.ts:258-312`, provider numerics authoritative, semantic row fallback) and `compactSummarySegments` (`:315-337`): positive glyph+number in order running, queued, failed, cancelled, completed, with `completed/total` when a total exists (`Agents ◐1 ✓13/14 · Todos ◐1 ✓12/15 · Background ◐1 ✓2`, live-verified).
- The sidebar already has a compact count standard in `sourceSummary` (`pi-packages/pi-sidebar/src/panels/sidebar.ts:126-178`): the task list as `completed/total` without glyph; Agents and Background as positive-only `glyph+number` in order running (accent), queued (dim, only when the panel is at least 36 columns), completed (success), failed (error), cancelled (muted), each colored whole; under header width pressure it drops cancelled, then queued, before the summary would vanish; other sources show their summary text. It reads counts from the pi-core discoverable registry (`pi-core/src/work-panel.ts:277-314`), not from heading rendering.
- No canonical text requires literal `0 failed`, word labels or a fixed done-before-failed order; the work-panel scenario only requires session done/failed counts (`.thoth/specs/pi-ecosystem/spec.md:157`). The taxonomy requirement (`:381`) requires header summaries to report queued and cancelled separately, which the sidebar standard already relaxes under width pressure.
- Literal heading assertions to update: `pi-core/test/work-panel-retention.test.ts:125,302,312,339-350,374,402,472,570,616,670`, `work-panel-animation.test.ts:673`, `work-panel-editor-summary.test.ts:301` and summary-line tests, `work-panel-data.test.ts:197,206`, `work-panel.test.ts:123-124,151`; sidebar coverage at `pi-sidebar/test/work-panels.test.ts:633-669`.

## Intent

One compact count standard — the sidebar's — renders work counts everywhere: sidebar panel headers (unchanged output), pi-core work-panel section headings in normal mode (collapsed and expanded) and the editor-replaced summary line, with counts that follow the terminal-status taxonomy.

## Non-goals

- No change to sidebar output, layout or width rules.
- No production-code change to provider packages (test-only assertion updates in pi-subagents, pi-background-tasks and the task-list package are in scope), the provider contract (version 2), retention or linger timing, item rows, focus, hints or overlays.
- No change to the editor-occupancy query or summary-mode activation.
- No package version bumps.

## Acceptance

- AC-1: pi-core exports one shared compact count formatter implementing the sidebar standard: the task-list source renders `completed/total` without glyph; work sources with numeric counts render positive-only status glyph plus number with no space, in order running, queued, completed, failed, cancelled, each colored whole with roles accent, dim, success, error and muted; queued is omitted when the caller's available width is below 36 columns; when the counts exceed the caller's room it drops cancelled, then queued, before any other count; a source without numeric counts renders its summary text.
- AC-2: pi-sidebar renders its panel header summaries through the shared formatter with output identical to today for every existing sidebar case.
- AC-3: Normal-mode work-panel section headings, collapsed and expanded, render the label followed by the shared formatter's output in place of `N done · N failed`, `N/T done`, `N running · M failed` or provider word segments whenever numeric counts exist; counts come from provider numeric summaries and otherwise from a semantic row derivation (timed-out failed, cancelled and interrupted cancelled, expected-exit completed, resolved neither failed nor completed, queued separate from running), never from retention state; providers without numeric counts keep their text or segments.
- AC-4: A collapsed prompt-retention section stays visible as its one selectable summary line whenever any of its completed, failed or cancelled counts is non-zero, so cancelled-only history no longer disappears; retention, linger and selection behavior are otherwise unchanged.
- AC-5: The editor-replaced summary line renders each visible section as its label followed by the shared formatter's output, joined with ` · ` and truncated by cell width with an ellipsis (for example `Agents ◐1 ✓13 · Todos 12/15 · Background ◐1 ✓2`); its activation, zero-row, no-hint and focus rules are unchanged.
- AC-6: All other behavior is unchanged; affected tests are updated to the new strings; pi-core, pi-sidebar and pi-questions-user suites, typechecks, `check:ci` and the Pi extension build pass.

## Clarifications

- Count format: the user chose compact glyphs for both the summary line and the normal work-panel widgets, reusing the sidebar's existing standard (question-tool answer, 2026-11-02), instead of extending the word format.
- Context guidance for `ask_user_question` in the Pi root prompt sources stays unchanged by user decision; it is out of this change.

## Decisions

- D1 (user): one compact count standard, the sidebar's, for sidebar headers, work-panel headings and the summary line.
- D2 (root, follows D1): the standard's details apply unchanged everywhere: order running, queued, completed, failed, cancelled; positive counts only (no `0 failed`); the task list as `completed/total` without glyph; agents without a `/total` denominator; queued omitted below 36 columns of available width; cancelled then queued dropped under room pressure; whole-segment roles.
- D3 (root): the formatter moves to pi-core and the sidebar consumes it, so one implementation defines the standard; pi-sidebar keeps deciding its width and room.
- D4 (root): heading counts use the existing semantic derivation (`compactSummaryCounts`), provider numerics authoritative; retention state keeps deciding only retention and visibility of rows.
- D5 (root): the collapse gate counts completed, failed and cancelled so cancelled-only history stays visible as a summary line.
- D6 (root): headings keep their existing label and separator chrome; only the counter text changes.
- D7 (root, from plan review round 1): provider packages whose host-render tests assert the old heading strings (`pi-packages/pi-subagents/test/ui/work-panel-golden.test.ts`, `test/extension/work-panel-counts.test.ts`, `test/subagents.test.ts`, `pi-packages/pi-background-tasks/src/navigator-provider.test.ts`, `pi-packages/pi-background-tasks/src/work-panel.test.ts`, the task-list package's `todo-work-panel.test.ts`, and any other pi-packages test that drives the shared pi-core host and asserts the old heading strings or segment styling) receive test-only updates; their production code stays unchanged. Round 2 of plan review added the pi-background-tasks files.

## Durable deltas

- `ADDED pi-ecosystem` **Shared compact work counts** — `@thoth-agents/pi-core` MUST provide one compact count formatter used by the sidebar panel headers, the work-panel section headings and the editor-replaced work-panel summary line: the task-list source MUST render `completed/total` without a glyph; work sources with numeric counts MUST render only positive counts as a status glyph immediately followed by its number, in the order running, queued, completed, failed, cancelled, colored with the accent, dim, success, error and muted roles; the queued count MUST be omitted below 36 columns of available width, and when the counts exceed the available room the cancelled and then the queued count MUST be dropped before any other; a source without numeric counts MUST render its summary text; work-panel headings MUST take counts from provider numeric summaries and otherwise classify rows by semantic status rather than retention state, and a collapsed prompt-retention section MUST stay visible while any of its completed, failed or cancelled counts is non-zero.
  - GIVEN subagents with 1 running, 2 queued, 30 completed, 1 failed and 1 cancelled, a task list at 12 of 15 done and background tasks with 1 running and 2 completed on a wide terminal with the sidebar hidden; WHEN the work panel renders normally and then while an `ask_user_question` panel is expanded; THEN the Agents heading shows `◐1 ○2 ✓30 ✗1 ■1`, the Todos heading shows `12/15`, the Background heading shows `◐1 ✓2`, and the summary line reads `Agents ◐1 ○2 ✓30 ✗1 ■1 · Todos 12/15 · Background ◐1 ✓2`.
- `MODIFIED pi-ecosystem` **Work panel summary while the editor is replaced** — `@thoth-agents/pi-core` MUST expose a read-only editor-occupancy query resolved through the shared editor-slot registry that is true exactly while an editor-slot replacement is rendered and false when the registry record lacks it or is incompatible; while it is true the work panel MUST render exactly one non-selectable row summarizing its visible sections in priority order as each label followed by its counts rendered by the shared compact work counts formatter, MUST show no hint row, MUST render no row when no section would render, MUST NOT be focusable or consume keys and MUST leave focus mode if it was focused without closing overlays; once no replacement is rendered the next render MUST restore the full panel.
  - GIVEN a 47-row, 48-column terminal with the sidebar hidden, subagents with 34 finished tasks, a task list at 53 of 54 done and 4 finished background tasks; WHEN the root agent opens an `ask_user_question` panel, the user collapses it with Ctrl+], expands it again and answers; THEN the work panel shows one summary line while the panel is expanded, the full Agents, Todos and Background sections with their hint row while it is collapsed and after the answer, and the question keeps keyboard input while expanded.
- `MODIFIED pi-ecosystem` **Work-panel terminal status taxonomy** — First-party work-panel providers MUST render cancelled and interrupted work as a muted cancelled status that is not counted as a failure, MUST render timed-out work with a distinct timed-out status glyph counted as a failure, MUST render a background task whose non-zero exit code was declared expected as a non-error expected-exit status counted as done, and MUST render a failed background task whose failure incidents are all recovered or superseded as a muted resolved status not counted as a failure; header summaries MUST count only actionable failures as failed and MUST report queued and cancelled counts separately, except that the shared compact work counts formatter MAY omit zero counts and MAY drop the queued and cancelled counts under its width rules, and the new statuses MUST resolve through the render kit with Unicode, Nerd and ASCII glyphs.
  - GIVEN a cancelled subagent, a subagent that hit its total timeout, a background task exiting 1 with `expected_exit_codes: [1]` and a failed background task later recovered by a same-operation success; WHEN the sidebar renders their panels; THEN they show the ■ cancelled, ◷ timed-out, expected-exit and ↻ resolved glyphs respectively, the subagent rows show no status label, and the failed counters count only the timeout.

## Plan

**Approach.** One writer, in order:

1. Shared formatter in pi-core (new or existing module next to the render kit helpers, exported from the pi-core barrel used by pi-sidebar). Port `sourceSummary`'s logic from `pi-packages/pi-sidebar/src/panels/sidebar.ts:126-178` into a pure function that takes counts (running, queued, completed, failed, cancelled, total), the source kind (task list vs work source vs other) or summary text, the available width and the room for counts, and returns themed segments or text with the same roles, glyphs, order, queued width threshold and drop order. Keep the sidebar's knowledge of which sources are work sources (today `DETAIL_COMMANDS`) at the call site or pass it explicitly.
2. pi-sidebar consumes the shared formatter; existing sidebar tests must pass unchanged (byte-identical output).
3. pi-core work-panel headings: replace the collapsed `counts` rendering and the numeric branches of `summarySegments` with the shared formatter fed by `compactSummaryCounts`; providers without numeric counts keep text/segments. Update the collapse gate to include cancelled. Keep heading chrome (glyph, label, separator).
4. Summary line: replace `compactSummarySegments` with the shared formatter per section.
5. Update tests and the pi-core README section describing headings and the summary format.

**Interfaces.** Provider contract v2 unchanged; discoverable registry unchanged; pi-sidebar imports the new pi-core export (each extension bundles its own pi-core copy, so all extensions are rebuilt together).

**Risks.** Sidebar output drift (guarded by unchanged sidebar tests); heading width on narrow terminals (the formatter's room handling); test churn in pi-core; stable row height requirement (headings are single-line, unaffected).

**Verification seams.** New unit tests for the shared formatter (order, roles, positives only, task list, text fallback, queued width threshold, drop order, ASCII/Nerd glyph modes); unchanged sidebar suite; updated pi-core heading and summary tests including cancelled-only collapsed sections and fallback rows; package typechecks; root `pnpm run typecheck`, `pnpm run check:ci`; `pnpm run build:pi-extensions`.

## Tasks

- [x] AC-1: Shared compact count formatter in pi-core
  - Outcome: one exported pi-core formatter reproducing the sidebar standard, with unit tests
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/sidebar.ts:126-178` (source logic), pi-core render-kit/status glyph helpers and package exports; installed `tdd` and `simplify` skills
  - Inputs: Exploration; Decisions D1-D3
  - Dependencies: none
  - Output: formatter module, export and tests
  - Owner: thoth-worker
  - Writes: new or existing pi-core source module for the formatter, pi-core export barrel, pi-core tests
  - Interface boundaries: provider contract and registry unchanged
  - Focused check and PASS evidence: `npm test --prefix pi-packages/pi-core` (run alone) passes with new formatter tests
  - Return milestone: formatter and tests pass
  - Stop / reassessment: the standard cannot be expressed without sidebar-specific state
- [x] AC-2: Sidebar headers render through the shared formatter
  - Outcome: identical sidebar output using the pi-core formatter
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/sidebar.ts`, `pi-packages/pi-sidebar/test/work-panels.test.ts:633-669`
  - Inputs: accepted AC-1 formatter
  - Dependencies: AC-1 shared formatter
  - Output: sidebar refactor with unchanged tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-sidebar/src/panels/sidebar.ts`
  - Interface boundaries: sidebar width and room decisions stay in pi-sidebar
  - Focused check and PASS evidence: `npm test --prefix pi-packages/pi-sidebar` passes without changing existing sidebar assertions
  - Return milestone: sidebar suite green
  - Stop / reassessment: any sidebar assertion would need to change
- [x] AC-3: Normal-mode headings use the standard with semantic counts
  - Outcome: collapsed and expanded headings render the shared formatter's output from semantic counts
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/work-panel-render.ts:70-139,215-337,1886-1932`
  - Inputs: accepted AC-1 formatter; Decisions D4, D6
  - Dependencies: AC-1 shared formatter
  - Output: heading rendering change and updated tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/work-panel-render.ts`, pi-core work-panel tests
  - Interface boundaries: retention and linger logic unchanged
  - Focused check and PASS evidence: pi-core suite passes with updated heading assertions and new fallback-row cases
  - Return milestone: headings verified
  - Stop / reassessment: headings need provider contract changes
- [x] AC-4: Cancelled-only collapsed sections stay visible
  - Outcome: the collapse gate includes cancelled counts
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/work-panel-render.ts:70-139`, `pi-packages/pi-core/test/work-panel-retention.test.ts`
  - Inputs: accepted AC-3 unit; Decision D5
  - Dependencies: AC-3 headings
  - Output: gate change and regression tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/work-panel-render.ts`, pi-core retention tests
  - Interface boundaries: retention eligibility unchanged
  - Focused check and PASS evidence: a cancelled-only history renders one selectable summary line; resolved-only behavior documented by test
  - Return milestone: gate verified
  - Stop / reassessment: gate change alters retention eligibility
- [x] AC-5: Summary line uses the shared formatter
  - Outcome: editor-replaced summary line renders each section through the standard
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/work-panel-render.ts:253-337`, `pi-packages/pi-core/test/work-panel-editor-summary.test.ts`
  - Inputs: accepted AC-1 formatter
  - Dependencies: AC-1 shared formatter
  - Output: summary rendering change and updated tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/work-panel-render.ts`, `pi-packages/pi-core/test/work-panel-editor-summary.test.ts`
  - Interface boundaries: activation, focus and zero-row rules unchanged
  - Focused check and PASS evidence: summary tests show the standard strings, ordering and truncation
  - Return milestone: summary verified
  - Stop / reassessment: none expected
- [x] AC-6: Regression suites, docs and build
  - Outcome: all suites and checks pass and docs describe the standard
  - Known entrypoints and skill paths: pi-core README, `pi-packages/pi-questions-user/test/`, `pi-packages/pi-subagents/test/ui/work-panel-golden.test.ts`, `pi-packages/pi-subagents/test/extension/work-panel-counts.test.ts`, `pi-packages/pi-subagents/test/subagents.test.ts`, `pi-packages/pi-background-tasks/src/navigator-provider.test.ts`, `pi-packages/pi-background-tasks/src/work-panel.test.ts`, the task-list package's `todo-work-panel.test.ts`
  - Inputs: accepted AC-1 to AC-5 units; Decision D7
  - Dependencies: AC-1, AC-2, AC-3, AC-4, AC-5
  - Output: passing suites, README update, built extensions
  - Owner: thoth-worker
  - Writes: pi-core README; test-only heading assertion updates in pi-subagents, pi-background-tasks, the task-list package and any other pi-packages test asserting the old heading strings
  - Interface boundaries: none
  - Focused check and PASS evidence: pi-core (alone), pi-sidebar, pi-questions-user, pi-subagents, pi-background-tasks and task-list package suites pass, and a search of pi-packages tests finds no remaining assertion of the old heading strings; pi-core and pi-sidebar typechecks; root `pnpm run typecheck` and `pnpm run check:ci` exit 0; `pnpm run build:pi-extensions` succeeds
  - Return milestone: all checks green
  - Stop / reassessment: an unrelated suite failure is reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review rounds 1 and 2 rejected missing test-only ownership in provider packages; round 3 (subtask_thoth-oracle_1793641595521_1d2126ca) returned OKAY for record SHA-256 adeb21bfd800c8f996f32784248b90353d58235a8228d23f09cd7702f23ee43d after auditing 607 candidate assertions.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 6b902fd8a7b765b07354c971e8f6775182f9a5f57a4445e74e408ad0b716a76e

Final verification (subtask_thoth-oracle_1793642767907_40ef3c44); delivered thoth-gate-verdict valid:true, kind final-verification, verdict PASS, mode record, recordDigest match.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1 through AC-6 and all three durable deltas are satisfied. No blocking regressions found.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record",
      "locator": ".thoth/changes/pi-work-panel-count-standard/pi-work-panel-count-standard.md:29-153",
      "claim": "Reviewed the assigned record and exact pre-Authorization bytes. The installed validator passed --through verify; the canonical pi-ecosystem source digest matches.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "implementation",
      "locator": "pi-packages/pi-core/src/work-panel-counts.ts:20-65; pi-packages/pi-core/test/work-panel-counts.test.ts",
      "claim": "One exported formatter implements count order, whole-count roles, positive-only counts, Todos fractions, text fallback, queued threshold and cancelled-before-queued removal. Unicode, ASCII and Nerd cases pass.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "implementation",
      "locator": "pi-packages/pi-core/src/work-panel-render.ts:84-112,224-325; pi-packages/pi-core/test/work-panel-retention.test.ts:668-735",
      "claim": "Headings use authoritative provider numerics with semantic row fallback, not retention state. Cancelled-only histories remain selectable; resolved-only histories hide after eligibility expires. Retention eligibility is unchanged.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "behavior",
      "locator": "pi-packages/pi-core/src/work-panel-render.ts:1823-1849,1881-1915; pi-packages/pi-core/test/work-panel-editor-summary.test.ts:86-165,585-638,808-834",
      "claim": "Tests and independent render probes reproduce all supplied heading/summary examples. Text and segments survive without numerics; Todos without total renders N items normally and label-only in summary mode. Summary clipping, focus release and key non-consumption pass.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "differential",
      "locator": "pi-packages/pi-sidebar/src/panels/sidebar.ts:130-159; pi-packages/pi-sidebar/test/work-panels.test.ts:633-693",
      "claim": "Sidebar test diff is empty. Old-versus-new summary output is byte-identical across 8,112 cases covering Unicode/ASCII/Nerd, widths below 36, long/wide labels and room pressure.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "scope",
      "locator": "git status --short; git diff; git diff --cached",
      "claim": "All 19 product files reviewed. Provider-package changes are exclusively the six assigned test files; no provider production changes, version bumps or staged changes. Final product-input fingerprint remained 4a332c9190fa75297d3840f9713ff3bc76618b335a99c55aac59880356765982.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "execution",
      "locator": "Requested package test/typecheck scripts; root pnpm run typecheck and pnpm run check:ci",
      "claim": "Passed: core 1220 tests run alone; sidebar 533; questions 313; subagents 2021; background 756; todo 318. Five tests skipped. Core/sidebar/root typechecks and check:ci exited 0; lint reported 767 warnings and 9 infos.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "build",
      "locator": "scripts/build-pi-extensions.mjs:24-80; independent no-write esbuild execution",
      "claim": "All ten extension bundles compiled in memory using the build script's options; every declared runtime asset was readable. No dist output was written.",
      "basis": "observed",
      "uncertainty": "The native build command's filesystem deletion/copy steps were not executed."
    },
    {
      "id": "E9",
      "kind": "regression",
      "locator": ".thoth/specs/pi-ecosystem/spec.md:149,209,239,269,279,369,379,629",
      "claim": "Reviewed the named canonical requirements against the diff and passing suites. Registry v2, stable row layout, sidebar launch/retention ordering and question/overlay focus behavior remain unchanged outside the declared deltas.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1: shared formatter",
      "method": "Source review and formatter tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E7"],
      "reason": "Formatting, roles, widths and glyph modes match the standard."
    },
    {
      "check": "AC-2: unchanged sidebar output",
      "method": "Empty sidebar-test diff, unchanged suite and differential probes",
      "outcome": "pass",
      "evidenceIds": ["E5", "E7"],
      "reason": "No sidebar assertion changed; 8,112 byte comparisons matched."
    },
    {
      "check": "AC-3 and AC-4: semantic headings and collapse gate",
      "method": "Diff review, regression tests and independent edge probes",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4"],
      "reason": "Numeric overrides, semantic taxonomy, cancelled collapse and resolved-only behavior match the contract without changing retention eligibility."
    },
    {
      "check": "AC-5: editor-replaced summary",
      "method": "Summary tests and exact-example probes",
      "outcome": "pass",
      "evidenceIds": ["E4", "E7"],
      "reason": "Shared counts, priority order, cell clipping, visibility and focus rules pass."
    },
    {
      "check": "AC-6: regressions, documentation and build viability",
      "method": "Whole-diff review, requested scripts and no-write compilation",
      "outcome": "pass",
      "evidenceIds": ["E6", "E7", "E8", "E9"],
      "reason": "Requested scripts pass; README matches behavior; all extension bundles compile."
    },
    {
      "check": "Native build:pi-extensions command",
      "method": "Not executed",
      "outcome": "not-run",
      "evidenceIds": ["E8"],
      "reason": "It deletes/writes dist directories. Equivalent compilation and asset-read checks preserved read-only scope."
    },
    {
      "check": "Three durable deltas and canonical compatibility",
      "method": "Record/spec comparison, validator and implementation review",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E3", "E4", "E9"],
      "reason": "Declared changes are implemented coherently; named unaffected requirements remain satisfied."
    },
    {
      "check": "Record binding and unchanged review inputs",
      "method": "SHA-256 calculation, final input fingerprint and git diff --check",
      "outcome": "pass",
      "evidenceIds": ["E1", "E6"],
      "reason": "Record-prefix digest matches this result; product inputs stayed frozen and whitespace checks passed."
    }
  ],
  "risks": [
    {
      "description": "Read-only verification establishes bundle compilation and asset availability, not execution of the native build script's dist-writing steps.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E8"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate the delivered gate verdict, record this PASS and matching digest with AC evidence, then run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-work-panel-count-standard/pi-work-panel-count-standard.md",
    "reviewedRecordSha256": "6b902fd8a7b765b07354c971e8f6775182f9a5f57a4445e74e408ad0b716a76e"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | formatter source review and work-panel-counts tests (Unicode/ASCII/Nerd) | E2, E7
- AC-2: PASS | empty sidebar test diff, sidebar suite 533 tests, 8,112 byte-identical differential cases | E5, E7
- AC-3: PASS | semantic heading tests and edge probes; `◆ Agents · ◐1 ○2 ✓30 ✗1 ■1` | E3, E4
- AC-4: PASS | cancelled-only and resolved-only retention regressions, eligibility unchanged | E3
- AC-5: PASS | summary tests; `Agents ◐1 ○2 ✓30 ✗1 ■1 · Todos 12/15 · Background ◐1 ✓2` | E4, E7
- AC-6: PASS | core 1220, sidebar 533, questions 313, subagents 2021, background 756, todo 318; typechecks, check:ci, worker-run build:pi-extensions and Oracle in-memory bundle compilation | E6, E7, E8, E9
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:0a277ff9280cf31231d3228eb7da3a20cf084d15b7607b11f9baea08e495a5cb

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
