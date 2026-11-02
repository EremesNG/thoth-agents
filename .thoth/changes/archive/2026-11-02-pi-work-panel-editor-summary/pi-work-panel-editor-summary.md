# Change: pi-work-panel-editor-summary

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- On terminals where the sidebar is hidden (default below 130 columns, `pi-packages/pi-sidebar/src/controls.ts:54-69`), Agents, Todos, Background and the `interact` hint are one pi-core work-panel widget, key `thoth-work-panel`, registered above the editor (`pi-packages/pi-core/src/work-panel-host.ts:38,528-566`). Sections are ordered by provider priority then label (`pi-core/src/work-panel-render.ts:75-77`): subagents 10, task list 20, background tasks 30.
- The stacked height budget is `min(12, floor(terminal.rows / 2))` (`work-panel-host.ts:92-99`); on a 47-row mobile remote that is 12 rows including the `interact` hint, which is the unfocused navigation hint (`work-panel-host.ts:548-565`, `work-panel-render.ts:1741-1747,1833`).
- The sidebar absorbs the sources it displays (`pi-sidebar/src/session.ts:203-231`) and the host excludes absorbed sources (`work-panel-host.ts:129-137`); the sidebar never renders fallback content above the editor.
- Provider contract (`pi-core/src/work-panel.ts:141-224`) already carries summary text/segments and running, queued, cancelled, failed, completed and total counts. Collapsed headings render counts such as `34 done · 0 failed` (`work-panel-render.ts:85-95,1781-1789`); the task list supplies `53/54 done` through summary segments (`work-panel-render.ts:230-233`). There is no all-sections one-line mode today.
- pi-core editor-slot (`pi-core/src/editor-slot.ts:20-210`) owns a process-wide registry at `globalThis[Symbol.for('thoth.pi-core.editor-slot')]`, version 1, with per-session/TUI state; the mounted proxy renders the last registered active replacement. It exposes no occupancy query, event or subscription. `refresh()` requests a TUI render.
- The question dock (`pi-questions-user/src/question-dock.ts:26-117`) returns its component from the replacement getter while expanded and `undefined` while collapsed (Ctrl+]), where it renders a one-line above-editor widget instead. It is the only production replacement contributor.
- Extensions are bundled separately with pi-core inlined (`scripts/build-pi-extensions.mjs:48-67`); cross-copy sharing goes through versioned `globalThis` registries, with existing cross-copy tests (`pi-core/test/editor-slot.test.ts:44`, `pi-core/test/work-panel-copies.test.ts:97`). The SDK also offers `pi.events`, unused for this.
- Prior change (merged `b436c86f`): the question panel is capped at 45% of terminal rows; the remaining crowding on narrow terminals comes from this work panel.

## Intent

While an editor-slot replacement occupies the editor area (today: an expanded `ask_user_question` panel), the pi-core work panel collapses to a single read-only summary line so the chat keeps its rows; the full panel returns as soon as no replacement is active (question answered, cancelled or collapsed with Ctrl+]).

## Non-goals

- No change to the desktop sidebar, its absorption rules or its panels.
- No permanent compact mode for the task list or any section outside editor replacements.
- No change to providers' data, the question panel layout or its keybindings.
- No new `pi.events` channel and no question-specific signal; occupancy is generic to editor-slot replacements.
- No package version bumps.

## Acceptance

- AC-1: pi-core exposes a read-only editor-occupancy query that, for a UI session, is true exactly while the editor-slot proxy renders an active replacement and false otherwise; it resolves through the shared editor-slot registry so it answers correctly across separately bundled pi-core copies, and a missing or incompatible registry record yields false without throwing.
- AC-2: While the editor is occupied, the work-panel widget renders exactly one row: the visible (non-absorbed, non-empty) sections in priority order, each as its label followed by its counts under the work-panel terminal-status taxonomy in the order running, queued, actionable failures, cancelled, done (done/total when the provider supplies a total), each as a status glyph plus number without words, omitting zero counts, taken from the provider's numeric summary when present and otherwise derived from rows by semantic status (never by retention state), joined with ` · `, using the render-kit status glyphs and theme roles of section headings, truncated by cell width with an ellipsis; no hint row; zero rows when no section would render.
- AC-3: When the replacement stops being active (answered, cancelled, disposed or collapsed with Ctrl+]), the next render shows the full work panel with its normal budget, sections and hint row, with no stale summary frame; the transition happens on the render that the editor-slot refresh requests.
- AC-4: While the editor is occupied, the work panel cannot be focused and consumes no keys; if it was focused when a replacement became active, it leaves focus mode as Esc would, without closing any open overlay or detail card.
- AC-5: Outside editor occupancy, existing behavior is unchanged (budgets, retention, overflow, absorption, focus and hints), and a pi-core copy whose registry lacks the occupancy query keeps rendering the full panel.

## Clarifications

- Hide versus summarize: the user chose a one-line summary over hiding the widgets or a permanent compact task list (question-tool answer, 2026-11-02).
- Restore triggers and genericity: the user accepted the proposal to restore on close and on Ctrl+] collapse, to key the behavior on a generic editor-replaced signal and to leave the desktop sidebar unchanged.

## Decisions

- D1 (user): one summary line while the editor is replaced, never hidden entirely.
- D2 (user-accepted): restore on answer, cancel, dispose and Ctrl+] collapse; generic editor-slot occupancy; sidebar unchanged.
- D3 (root): occupancy is pulled at work-panel render time from the shared editor-slot registry (an optional query on the registry record, no version bump because older copies simply lack it); no `pi.events` channel, because both live in pi-core and editor-slot refresh already requests a TUI render. The query checks owner liveness and never upgrades a legacy owner's closures.
- D6 (root, from plan review): the existing `Thoth Pi work panel` requirement is modified so its section, selection, focus and hint-row presentation rules yield to the one-line summary while a replacement is rendered; ownership, retention, linger, item closing and detail-card rules keep applying.
- D4 (root, revised after final verification round 1): each summary segment is the label plus the compact form (glyph and number, no words, zeros omitted) of its taxonomy counts in the order running, queued, actionable failures, cancelled, done (done/total when the provider supplies a total); provider numeric summaries are authoritative and the row fallback classifies by semantic status (timed-out is a failure, cancelled and interrupted are cancelled, expected-exit is done, resolved is never a failure, queued is not running); retention state is never used for counts; normal-mode collapsed headings stay unchanged (AC-5); heading glyphs and roles; the line is not selectable. The user approved the compact shape `Agents 34✓ · Todos 53/54 · Background 4✓`; extra categories appear only when non-zero.
- D5 (root): a permanent compact task list on narrow terminals stays out of scope.

## Durable deltas

- `MODIFIED pi-ecosystem` **Thoth Pi work panel** — `@thoth-agents/pi-core` MUST define a versioned work-panel contract with a process-wide provider registry; first-party packages that show live work above the editor (subagents, task list, background tasks) MUST register sections through it instead of installing their own above-editor widgets or panel navigation handlers; the host MUST install exactly one panel widget and one panel input listener per UI session, MUST render compact sections with one heading and counter each, one line per rendered item, a total height budget with exact `+N more` overflow counts, and semantic theme roles for status glyphs, names, secondary text and metrics; MUST let a provider mark items it prefers to drop first on overflow and label their exact dropped count with its own summary line (such as `+N done`), and MUST let a provider make its section heading and summary lines selectable so that Enter opens that provider's own UI; for sections that opt in to prompt retention the host MUST track a prompt epoch that advances when a run starts with exactly the observed text of an interactive or RPC prompt submitted while the agent was idle, MUST compare each run's starting prompt exactly with the retained text it observed for idle interactive or RPC submissions and MUST NOT advance the epoch for a run whose prompt matches none of them (including prompts queued while streaming), and MUST track the agent idle state; MUST render running items, done items until 10 seconds after they ended (at most the three most recent), and failed items (including cancelled) while they ended in the current epoch or until 30 seconds after they ended, whichever is later; MUST keep such a section expanded while any running or lingering item remains, MUST otherwise collapse the section, whether the agent is busy or idle, to one selectable summary line whose Enter opens that provider's history panel, and MUST refresh at each linger boundary; providers MUST let the user close a finished item, hiding it from the panel without removing it from history; the host MUST keep a single selection, MUST be focused with ← only from an empty, focused root editor with no overlay or dialog open and released with Esc, MUST leave unfocused ↑/↓ to the editor, MUST end the panel with a hint row listing only the actions available for the selected item, MUST let a provider with a custom open action show its own UI and otherwise show item details in a framed opaque card of stable size whose ↑/↓ stays within the opened section, MUST close that card only when another UI actually takes focus, and MUST expose a read-only focus-guard query so other key handlers in those packages consume nothing outside the focused root editor; while an editor-slot replacement is rendered, the section, selection, focus and hint-row presentation rules above MUST yield to the one-line summary of the requirement Work panel summary while the editor is replaced, while provider registration, prompt retention and linger tracking, item closing and detail-card rules continue to apply.
  - GIVEN subagents and background tasks opted in, 55 completed subagents from earlier prompts, and a busy prompt in which one subagent completes and one background task fails; WHEN 10 seconds pass, the agent becomes idle, and a new prompt runs 40 seconds after the failure; THEN the completed subagent row disappears after 10 seconds, the failed background row stays until that new prompt, afterwards Agents and Background each render as one summary line with session done/failed counts, Enter on the Agents summary opens the subagents history panel, and `/bg` still lists the failed task.
- `ADDED pi-ecosystem` **Work panel summary while the editor is replaced** — `@thoth-agents/pi-core` MUST expose a read-only editor-occupancy query resolved through the shared editor-slot registry that is true exactly while an editor-slot replacement is rendered and false when the registry record lacks it or is incompatible; while it is true the work panel MUST render exactly one non-selectable row summarizing its visible sections in priority order as each label with its non-zero running, queued, actionable-failure, cancelled and done (or done/total) counts under the work-panel terminal-status taxonomy, each as a status glyph and number, MUST show no hint row, MUST render no row when no section would render, MUST NOT be focusable or consume keys and MUST leave focus mode if it was focused without closing overlays; once no replacement is rendered the next render MUST restore the full panel.
  - GIVEN a 47-row, 48-column terminal with the sidebar hidden, subagents with 34 finished tasks, a task list at 53 of 54 done and 4 finished background tasks; WHEN the root agent opens an `ask_user_question` panel, the user collapses it with Ctrl+], expands it again and answers; THEN the work panel shows one summary line while the panel is expanded, the full Agents, Todos and Background sections with their hint row while it is collapsed and after the answer, and the question keeps keyboard input while expanded.

## Plan

**Approach.** Two pi-core seams, one writer, in order:

1. Editor-slot occupancy (`pi-packages/pi-core/src/editor-slot.ts`). Add an exported query (for example `isEditorReplaced(tui)`) that finds the session/TUI state through the shared registry and applies the same selection the mounted proxy uses (last registered contribution whose replacement getter returns a component). Publish it as an optional member of the shared registry record so a copy calls the owner's implementation; when the record lacks it or has an incompatible shape, return false. No contract version bump.
2. Work-panel summary mode (`pi-packages/pi-core/src/work-panel-host.ts`, `pi-packages/pi-core/src/work-panel-render.ts`). At widget render time, query occupancy for the widget's TUI. When occupied, render one summary line from the visible sections' summaries (reuse existing count derivation and compact segment helpers; render-kit glyphs and theme roles), skip the hint row, and leave focus mode (selection reset as Esc would) without touching overlays; the input listener consumes nothing while occupied. Ensure any line cache or change-detection keys include occupancy so the transition is not served stale; request a render on transition when needed.
3. Docs: update pi-core README (and any work-panel docs it already has) to describe the summary mode.

**Interfaces.** Editor-slot registry record (version 1, additive optional member), work-panel host render and input listener, provider summaries (read-only). Callers: pi-questions-user dock (unchanged), pi-sidebar absorption (unchanged).

**Risks.** Cross-copy ownership (an old owner lacking the query degrades to the full panel); stale render caches; focus/overlay interplay with the question panel (spec requirement "Pi question focus over panel overlays" must still hold).

**Verification seams.** pi-core unit tests for the query (including a second loaded copy and a malformed record), work-panel summary rendering (ordering, counts, glyph roles, truncation, zero rows, absorbed sources), transitions and focus release; one integration test driving a real editor-slot replacement (expand, collapse, dispose); existing pi-core, pi-sidebar and pi-questions-user suites; package typechecks; root `pnpm run typecheck`, `pnpm run check:ci`; `pnpm run build:pi-extensions`.

## Tasks

- [x] AC-1: Editor-slot occupancy query with cross-copy and malformed-record fallback
  - Outcome: pi-core exports an occupancy query that is true only while a replacement is rendered, works across loaded copies and returns false on missing or incompatible registry members
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/editor-slot.ts`, `pi-packages/pi-core/test/editor-slot.test.ts`, `pi-packages/pi-core/test/editor-slot-focus.test.ts`; installed `tdd` and `simplify` skills
  - Inputs: Exploration and Decisions D2, D3 of this record
  - Dependencies: none
  - Output: query implementation, exports and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/editor-slot.ts`, pi-core package exports if needed, `pi-packages/pi-core/test/editor-slot*.test.ts`
  - Interface boundaries: shared editor-slot registry record stays version 1 with an additive optional member; the question dock is not modified
  - Focused check and PASS evidence: `npm test --prefix pi-packages/pi-core` passes, including new tests for expanded, collapsed, disposed, second-copy and malformed-record cases
  - Return milestone: query and tests pass
  - Stop / reassessment: the registry cannot expose the query without a version bump or an owner upgrade
- [x] AC-2: Work-panel one-line summary while the editor is occupied
  - Outcome: the work-panel widget renders the one-line summary described in AC-2 while occupied
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/work-panel-host.ts`, `pi-packages/pi-core/src/work-panel-render.ts`, `pi-packages/pi-core/src/work-panel.ts`, `pi-packages/pi-core/test/work-panel*.test.ts`
  - Inputs: accepted AC-1 query; Decisions D1, D4
  - Dependencies: AC-1 editor-slot occupancy query
  - Output: summary rendering and tests (ordering, counts, glyph roles, truncation, zero rows, absorbed sources excluded)
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/work-panel-host.ts`, `pi-packages/pi-core/src/work-panel-render.ts`, `pi-packages/pi-core/test/work-panel*.test.ts`
  - Interface boundaries: provider contract version 2 unchanged; sidebar absorption unchanged
  - Focused check and PASS evidence: pi-core tests pass with new summary-mode assertions
  - Return milestone: summary mode renders correctly in tests
  - Stop / reassessment: summary needs provider contract changes
- [x] AC-3: Restore the full panel without stale frames on every exit path
  - Outcome: answer, cancel, dispose and Ctrl+] collapse all restore the full panel on the next requested render
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/work-panel-host.ts`, `pi-packages/pi-core/src/editor-slot.ts`, `pi-packages/pi-questions-user/src/question-dock.ts` (read-only)
  - Inputs: accepted AC-1 and AC-2 units
  - Dependencies: AC-2 summary mode
  - Output: transition handling and an integration test driving a real editor-slot replacement through expand, collapse, re-expand and dispose
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/work-panel-host.ts`, `pi-packages/pi-core/test/` integration test file
  - Interface boundaries: question dock behavior unchanged
  - Focused check and PASS evidence: integration test shows summary, full, summary, full across the transitions with no stale frame
  - Return milestone: transitions verified
  - Stop / reassessment: transitions require changes to the question dock
- [x] AC-4: Focus and input isolation while occupied
  - Outcome: the work panel cannot be focused and consumes no keys while occupied, and leaves focus mode without closing overlays
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/work-panel-host.ts`, `pi-packages/pi-core/test/work-panel-retention.test.ts`, `pi-packages/pi-core/test/editor-slot-focus.test.ts`
  - Inputs: accepted AC-2 unit; spec requirement "Pi question focus over panel overlays"
  - Dependencies: AC-2 summary mode
  - Output: focus handling and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/work-panel-host.ts`, pi-core focus tests
  - Interface boundaries: overlay handles and the detail card close only on their existing triggers
  - Focused check and PASS evidence: tests show ← ignored and no keys consumed while occupied, and a previously focused panel released with overlays intact
  - Return milestone: focus tests pass
  - Stop / reassessment: releasing focus requires closing an overlay
- [x] AC-2: Taxonomy-consistent compact counts (converge after final verification round 1)
  - Outcome: summary-mode counts follow the terminal-status taxonomy (running, queued, actionable failures, cancelled, done or done/total) from provider numerics or a semantic row fallback, glyph plus number, zeros omitted; normal-mode headings unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/work-panel-render.ts` (summary ~253-285, heading counts ~85-95, ~204-212, ~1781-1799), `pi-packages/pi-core/test/work-panel-editor-summary.test.ts`; provider summaries in `pi-packages/pi-subagents/src/ui/work-panel-provider.ts:293-334` and `pi-packages/pi-background-tasks/src/navigator-provider.ts:65-73,172-180` (read-only)
  - Inputs: final verification round 1 findings E5, E6, E10; revised AC-2, D4 and ADDED delta
  - Dependencies: accepted AC-1 and AC-2 implementation
  - Output: corrected summary derivation and taxonomy regression tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/work-panel-render.ts`, `pi-packages/pi-core/test/work-panel-editor-summary.test.ts`, pi-core README if it shows the format
  - Interface boundaries: provider contract version 2 and provider packages unchanged; retention behavior unchanged
  - Focused check and PASS evidence: pi-core suite (run alone) passes with new taxonomy cases
  - Return milestone: corrected counts verified by tests
  - Stop / reassessment: matching heading counts requires a provider contract change
- [x] AC-5: Regression suites, docs and build
  - Outcome: unchanged behavior outside occupancy is proven and docs describe the summary mode
  - Known entrypoints and skill paths: pi-core README, `pi-packages/pi-sidebar/test/`, `pi-packages/pi-questions-user/test/`
  - Inputs: accepted AC-1 to AC-4 units
  - Dependencies: AC-1, AC-2, AC-3, AC-4
  - Output: passing suites, README update, built extensions
  - Owner: thoth-worker
  - Writes: pi-core README
  - Interface boundaries: none
  - Focused check and PASS evidence: `npm test --prefix` for pi-core, pi-sidebar and pi-questions-user pass; pi-core typecheck; root `pnpm run typecheck` and `pnpm run check:ci` exit 0; `pnpm run build:pi-extensions` succeeds
  - Return milestone: all checks green
  - Stop / reassessment: an unrelated suite failure is reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review round 1 (subtask_thoth-oracle_1793605092113_2b240ac9) rejected the ADDED-only delta; round 2 (subtask_thoth-oracle_1793605411169_f0631d84) returned OKAY for record SHA-256 71d0380c3bb1d5884d4cd643b13ea1505a8027680b6f0eb9301753344b7dc098.
The user first chose Stop at implementation authorization, then explicitly authorized implementing the approved plan (2026-11-02).

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 92c7c109ce846f0c2123c21fe1171113dca6c486a053acc8ce37f65d60bed3b5

Final verification round 2 (subtask_thoth-oracle_1793635101058_dafe7d23); delivered thoth-gate-verdict valid:true, kind final-verification, verdict PASS, mode record, recordDigest match.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The whole diff satisfies AC-1–AC-5 and both durable deltas. Round-1 E5/E6 are fixed; no blocking findings.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record",
      "locator": ".thoth/changes/pi-work-panel-editor-summary/pi-work-panel-editor-summary.md",
      "claim": "Reviewed the current authorized record. Its prefix SHA-256 is 92c7c109ce846f0c2123c21fe1171113dca6c486a053acc8ce37f65d60bed3b5; the canonical source digest matches.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-core/src/editor-slot.ts:49-96,175-179; src/panel.ts:7; test/editor-slot.test.ts:29-240",
      "claim": "Occupancy uses the shared registry and owner liveness, follows active replacement selection, and safely returns false for missing, legacy or incompatible records without upgrading them. Cross-copy and disposal cases pass.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-core/src/work-panel-render.ts:44,118,133,258-339,1834-1852; test/work-panel-editor-summary.test.ts:35-468",
      "claim": "Compact summaries preserve taxonomy order, authoritative numeric zeros, semantic fallback counts, pre-retention items, glyph roles, priority, clipping and visible-section filtering.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "independent-execution",
      "locator": "Read-only inline Node/tsx assertions against panelSections and renderPanel",
      "claim": "Reproduced E5/E6: numeric summary → Agents ◐1 ○2 ✗1 ■1 ✓30/35; fallback with conflicting retention states → Agents ◐1 ○1 ✗2 ■2 ✓2 under both retention modes; collapsed expected-exit plus resolved → Background ✓1. Corrected 48-column fixture renders the stated line in 47 cells.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "provider-contract",
      "locator": "pi-packages/pi-background-tasks/src/navigator-provider.ts:65-73,172-180; .thoth/specs/pi-ecosystem/spec.md:379-387",
      "claim": "The first-party provider counts expected exits as completed and resolved work as neither failed nor completed. Background ✓1 is consistent with both that provider and the record's resolved-is-never-a-failure rule.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-core/src/work-panel-host.ts:345-359,547-610; test/work-panel-editor-summary.test.ts:470-708; test/work-panel-focus.test.ts:134-170",
      "claim": "Replacement transitions restore full output on the requested render. Occupancy releases panel focus and close arming, consumes no panel keys, preserves overlays/detail cards, and participates in change detection. Legacy registries retain full-panel rendering.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "baseline-comparison",
      "locator": "pi-packages/pi-core/src/work-panel-render.ts:85-101,1886-1939; independent comparison with git HEAD",
      "claim": "All 144 normal-mode comparisons match HEAD across widths, budgets, selections, expanded sections and collapsed headings. Normal-mode count derivation remains unchanged.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "test-execution",
      "locator": "npm test --prefix pi-packages/pi-core; npm test --prefix pi-packages/pi-sidebar; npm test --prefix pi-packages/pi-questions-user",
      "claim": "PASS: pi-core 53 files/1189 tests, run alone; sidebar 21 files/533 tests; questions 10 files/313 tests.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E9",
      "kind": "check-execution",
      "locator": "npm run typecheck --prefix pi-packages/pi-core; pnpm run typecheck; pnpm run check:ci; git diff --check",
      "claim": "All exit 0. check:ci reports 767 warnings and 9 informational diagnostics, with no failures.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E10",
      "kind": "validation-and-freshness",
      "locator": "Installed thoth-sdd validate.mjs --through verify --json; final SHA-256 comparison",
      "claim": "Validator returns valid:true with no errors. All eight implementation/doc/test files, the canonical baseline and record prefix remain unchanged through verification.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Registry/liveness inspection and cross-copy, malformed-record and lifecycle tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E8"],
      "reason": "Generic read-only occupancy and compatibility fallback satisfy the contract."
    },
    {
      "check": "AC-2 and round-1 E5/E6",
      "method": "Independent provider-shaped numeric/fallback assertions plus summary regression tests",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E5", "E8"],
      "reason": "Queued and cancelled are separate; failures are actionable; expected exits count as done; resolved is not failed; retention does not determine compact counts."
    },
    {
      "check": "AC-3",
      "method": "Real editor-slot collapse, re-expansion, completion and disposal transition tests",
      "outcome": "pass",
      "evidenceIds": ["E6", "E8"],
      "reason": "The next requested render restores full output without stale summary frames."
    },
    {
      "check": "AC-4",
      "method": "Input isolation and mock/real-TUI overlay tests",
      "outcome": "pass",
      "evidenceIds": ["E6", "E8"],
      "reason": "Panel focus is released without dismissing overlays; panel keys are not consumed while occupied."
    },
    {
      "check": "AC-5 and unchanged normal-mode headings",
      "method": "Whole-diff inspection, 144 HEAD comparisons and regression suites",
      "outcome": "pass",
      "evidenceIds": ["E7", "E8", "E9"],
      "reason": "Normal rendering, budgets, retention, overflow, absorption, focus and hints remain unchanged."
    },
    {
      "check": "MODIFIED and ADDED durable deltas",
      "method": "Compare implementation with the record and exact canonical baseline",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E3", "E6", "E7", "E10"],
      "reason": "The explicit summary-mode exception preserves existing ownership, retention, closing and detail-card obligations."
    },
    {
      "check": "Canonical regression requirements",
      "method": "Review Thoth Pi work panel, version-tolerant registries, question focus over overlays, discoverable registry, sidebar, stable row height and terminal taxonomy against the diff and suites",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E5", "E6", "E7", "E8"],
      "reason": "No regression found in the seven named requirements."
    },
    {
      "check": "Required commands and record freshness",
      "method": "Execute every assigned command and compare final input hashes",
      "outcome": "pass",
      "evidenceIds": ["E8", "E9", "E10"],
      "reason": "All required checks pass against unchanged review inputs."
    }
  ],
  "risks": [
    {
      "description": "Normal-mode collapsed headings retain their existing retention-based count inaccuracies at work-panel-render.ts:85-101,1887-1900. This is explicitly deferred by the revised record and is not introduced by this diff.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E1", "E7"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate the delivered gate result, record this unchanged envelope and digest, then run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-work-panel-editor-summary/pi-work-panel-editor-summary.md",
    "reviewedRecordSha256": "92c7c109ce846f0c2123c21fe1171113dca6c486a053acc8ce37f65d60bed3b5"
  }
}
```

Final verification round 1 (subtask_thoth-oracle_1793634103818_4fa147a6) returned FAIL: compact counts omitted queued and cancelled counts required by the terminal-status taxonomy, and fallback counts used retention state instead of semantic status. AC-2, D4 and the ADDED delta were revised to reuse the heading taxonomy; a convergence task was added.

- AC-1: PASS | registry/liveness review and cross-copy, malformed-record and lifecycle tests | E2, E8: `isEditorReplaced` in pi-core/src/editor-slot.ts:49-96, test/editor-slot.test.ts:29-240
- AC-2: PASS | independent numeric/fallback taxonomy probes and summary tests | E3, E4, E5: `Agents ◐1 ○2 ✗1 ■1 ✓30/35`, 48-column fixture in 47 cells, pi-core 1189 tests
- AC-3: PASS | real editor-slot collapse, re-expansion, completion and disposal transitions | E6, E8: test/work-panel-editor-summary.test.ts:470-708
- AC-4: PASS | input isolation and real-TUI overlay tests | E6: work-panel-host.ts:345-359, test/work-panel-focus.test.ts:134-170
- AC-5: PASS | 144 normal-mode HEAD comparisons and pi-core, pi-sidebar, pi-questions-user suites, typechecks, check:ci | E7, E8, E9
- Follow-up (non-blocking): normal-mode collapsed headings keep their pre-existing retention-based counts (work-panel-render.ts:85-101,1887-1900), outside this change.
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:4f69af586f1a4d67e87091b614924782c4c41bccba2658871127f1a0babd8cd0

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
