# Change: overlay-question-focus

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

Path aliases: `TL` = `pi-packages/pi-todo` (task-list package); `TLH` = its history overlay module `todo-panel.ts`.

## Exploration

- Reported bug: with the `/subagents` history panel open, the root agent calls
  `ask_user_question`; after the panel closes, the questionnaire is visible but
  receives no keyboard input.
- Installed Pi is `@earendil-works/pi-coding-agent` / `pi-tui` 1.0.2.
- `pi-packages/pi-subagents/src/ui/panel-overlay.ts:211-227,359-367` and
  `TL/TLH.ts:149-181` open capturing history overlays via
  `ctx.ui.custom(..., { overlay: true })` and close them with raw `done()`.
- `pi-packages/pi-questions-user/src/index.ts:51-65` opens the questionnaire with
  non-overlay `ctx.ui.custom(factory)`, which replaces the editor container
  contents and focuses the questionnaire (`interactive-mode.js:2282-2340`).
- pi-tui `showOverlay` captures `preFocus` (the root editor); `hideOverlay`
  restores it when the overlay owns focus, without checking it is still mounted
  (`tui.js:365-397,468-481`). Its overlay-restore state machine
  (`tui.js:249-339,722-736`) refocuses an `eligible` visible overlay on the next
  key. Any `setFocus(editor)` transition (editor replacement through
  `setEditorComponent`, completion/abort of editor-replacing UI, e.g.
  `interactive-mode.js:2083-2193,2200-2264`) makes the history overlay eligible
  again; the next key moves focus to history, and closing history restores the
  detached editor. Oracle probes with the real installed TUI reproduced this.
- Custom-overlay `done()` calls top-of-stack `hideOverlay()`, so a lower overlay
  completing with raw `done()` removes whatever overlay is on top.
  `pi-packages/pi-core/src/work-panel-host.ts:40-71` already works around this
  with private `closeOwnedDetailOverlay` (temporary identity-scoped redirect of
  `tui.hideOverlay` to the owned handle).
- Since master `686456f` (pi-extension-bundles), `pi-questions-user`,
  `pi-subagents` and `TL` declare `@thoth-agents/pi-core` as a devDependency
  and ship one esbuild single-file `dist/index.ts` bundle
  (`scripts/build-pi-extensions.mjs`) that inlines pi-core; each extension
  therefore carries its own, possibly different-version, pi-core copy. pi-core
  registries are version-tolerant (`work-panel-state.ts`). The overlay sources
  of this bug are unchanged by that merge.
- Real-TUI test precedent: `pi-packages/pi-core/test/work-panel-focus.test.ts`.

## Intent

The `ask_user_question` questionnaire always keeps keyboard input when it opens
while a first-party panel overlay (subagent history, task-list history) is open, and
after that overlay closes in any order, without losing structured answers,
cancellation semantics, RPC/select fallbacks, or existing history panel state.

## Non-goals

- Patching third-party `pi-tui` / `pi-coding-agent`.
- Changing work-panel detail-card behavior beyond adopting the shared helper.
- The background-task history overlay and any other overlay not named in D-5.
- Changing question tool schema, result shape, or non-TUI fallbacks.
- Redesigning panel visuals.

## Acceptance

- AC-1: With a capturing history overlay open (subagents and task-list), an
  `ask_user_question` questionnaire opened afterwards — including after an
  intervening `setFocus(editor)` transition — receives terminal keyboard input
  and can be answered; no keys reach the hidden editor.
- AC-2: Closing the history overlay while the questionnaire is open does not
  remove, hide or unfocus the questionnaire; answering the questionnaire first
  does not close the history overlay; after both close, the root editor is
  mounted and focused. This holds in both closure orders for both transition
  types: a same-editor `setFocus(editor)` (editor-replacing UI completion) and an
  actual editor replacement through `setEditorComponent`, after which the
  focused editor is the currently mounted one, never a detached previous editor.
- AC-3: Questionnaire completion, cancellation and abort (including abort before
  the overlay handle exists and abort while a newer foreign overlay is on top)
  settle the tool promise exactly once and remove only the questionnaire overlay.
- AC-4: Existing question tool, subagents panel, task-list panel and work-panel focus
  tests keep passing; structured answers, RPC/select fallbacks and `no_ui` are
  unchanged.

## Clarifications

- User chose to consult Oracle for the fix direction; Oracle recommended option A
  (questionnaire as its own overlay plus identity-safe owned-handle closure for
  all three overlays). No further human-owned decisions remain.
- The exact runtime trigger of the intervening `setFocus(editor)` in the user's
  session is unproven; the regression test injects a real SDK transition
  (`setEditorComponent` or editor-replacing UI completion), and option A is
  independent of which trigger occurred.

## Decisions

- D-1: Open the questionnaire with `overlay: true`, full-width bottom anchoring
  with its existing adaptive height (not a fake full-height modal).
- D-2: Extract and export an identity-safe owned-overlay completion helper from
  `@thoth-agents/pi-core` (generalizing `closeOwnedDetailOverlay`): it obtains
  the overlay handle via `onHandle`, hides only that handle, keeps any
  `hideOverlay` redirect synchronous and restored in `finally`, and always
  completes the custom promise (unlike the current missing-handle fallback).
  The helper is stateless (no `globalThis` registry), so separately bundled
  pi-core copies of any version interoperate: each redirect is synchronous and
  scoped to one call.
- D-4: After hiding its own handle, the owned close checks whether pi-tui
  restored focus to a component no longer attached to the TUI tree (a stale
  `preFocus`, e.g. an editor replaced through `setEditorComponent`); if so it
  focuses the currently mounted root editor-slot component instead, leaving any
  other still-mounted focus untouched. Resolution strategy: locate the mounted
  editor-slot component by walking the TUI component tree from the root (the
  SDK's editor container is the parent of the previous `preFocus` chain or the
  only focusable child mounted in the editor slot). Stop condition: if the
  installed SDK offers no reliable way to identify the mounted editor-slot
  component, the unit returns to root before shipping a heuristic.
- D-5: Scope is limited to the questionnaire, the subagents history overlay,
  the task-list history overlay and the existing work-panel detail card; the
  background-task history overlay (`pi-background-tasks/src/history-panel.ts`)
  and other overlays are out of scope.
- D-3: Use that helper for the questionnaire, the subagents history overlay and
  the task-list history overlay; work-panel host reuses it without behavior change.

## Durable deltas

- `ADDED pi-ecosystem` **Pi question focus over panel overlays** — The `ask_user_question` TUI MUST open as its own overlay and keep keyboard input while the subagents or task-list history overlay is open; the questionnaire, the subagents history overlay, the task-list history overlay and the work-panel detail card MUST close only their own overlay handle, so that closing one never removes, hides or unfocuses another, and when the focus target restored on close is no longer mounted they MUST focus the currently mounted root editor.
  - GIVEN the subagents or task-list history overlay is open; WHEN the root agent asks a question and the user then closes the history overlay; THEN the questionnaire stays visible, receives keyboard input and returns the user's answer .

## Plan

1. pi-core: move `closeOwnedDetailOverlay` logic into an exported helper (e.g.
   `src/owned-overlay.ts`, exported from `src/index.ts`) that wraps
   `ctx.ui.custom` overlay creation with `onHandle` capture and an owned `close`
   that hides only its handle, completes `done` exactly once and applies D-4
   stale-focus repair; adapt `work-panel-host.ts` to use it.
2. pi-questions-user: open the questionnaire through the helper with
   `overlay: true` and bottom full-width anchoring; route completion,
   cancellation and abort through the owned close.
3. pi-subagents and TL: route history overlay close through the helper.
4. Tests (TDD, real installed TUI harness modeled on
   `pi-core/test/work-panel-focus.test.ts`): reproduce the reported sequence
   (history open → `setFocus(editor)` transition → question → keys → close
   history → answer), both closure orders, abort-before-handle, abort beneath a
   newer overlay, exactly-once settlement, final editor focus. Cover both
   transition types (same-editor `setFocus(editor)` and real
   `setEditorComponent` replacement) × both closure orders, with a fixture that
   mounts editors as the SDK does (replacement detaches the old editor; the
   current `work-panel-fixture.ts:47-56` retains replaced editors and must not
   mask the stale-focus case).

Verification seams: focused vitest runs in pi-core, pi-questions-user,
pi-subagents, TL; `pnpm run check:ci`; `pnpm run typecheck`; `pnpm run build`
plus `scripts/pi-extension-bundles.test.mjs`, because the shipped bundles change.

## Tasks

- [x] AC-3: Shared owned-overlay helper in pi-core with work-panel host migrated
  - Outcome: exported stateless identity-safe owned-overlay completion helper with D-4 stale-focus repair; work-panel detail card adopts it
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-host.ts, pi-packages/pi-core/src/index.ts, pi-packages/pi-core/test/work-panel-focus.test.ts; skills tdd, simplify
  - Inputs: this record's Exploration and Decisions D-2, D-4
  - Dependencies: none
  - Output: helper module, export, unit tests with real TUI
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/** and pi-packages/pi-core/test/**
  - Interface boundaries: public pi-core export consumed by pi-questions-user, pi-subagents, TL
  - Focused check and PASS evidence: pi-core vitest pass, including real-TUI helper tests for exactly-once completion, missing-handle completion, foreign overlay on top, and stale detached preFocus after real editor replacement repaired to the mounted editor; existing work-panel-focus tests pass; pi-core typecheck clean
  - Return milestone: helper exported and tests green
  - Stop / reassessment: helper cannot be identity-safe, or the mounted editor-slot component cannot be identified reliably with installed SDK APIs (D-4 stop condition)
- [x] AC-1: Questionnaire opens as owned overlay and keeps input over history overlays
  - Outcome: questionnaire overlay with owned completion; regression tests for the reported sequence
  - Known entrypoints and skill paths: pi-packages/pi-questions-user/src/index.ts, pi-packages/pi-questions-user/src/ui/questionnaire.ts, pi-packages/pi-questions-user/test/; skills tdd, simplify
  - Inputs: accepted pi-core helper
  - Dependencies: AC-3 helper unit accepted
  - Output: updated question tool and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-questions-user/src/** and pi-packages/pi-questions-user/test/**
  - Interface boundaries: ask_user_question schema/result, RPC/select fallback, no_ui
  - Focused check and PASS evidence: pi-questions-user vitest pass including new real-TUI focus tests
  - Return milestone: tests green
  - Stop / reassessment: overlay anchoring breaks existing layout tests materially
- [x] AC-2: Subagents and task-list history overlays close only their own handle
  - Outcome: both panels use the owned helper; cross-overlay regression tests pass
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/ui/panel-overlay.ts, TL/TLH.ts, pi-packages/pi-subagents/test/ui/panel.test.ts; skills tdd, simplify
  - Inputs: accepted pi-core helper
  - Dependencies: AC-3 helper unit accepted
  - Output: updated panels and tests covering both closure orders
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/ui/**, pi-packages/pi-subagents/test/**, TL/** (source and tests)
  - Interface boundaries: panel open/close lifecycle, history state, refresh/mouse tracking disposal
  - Focused check and PASS evidence: pi-subagents and TL vitest pass including real-TUI tests for both transition types (same-editor setFocus and setEditorComponent replacement) × both closure orders with the questionnaire, ending with the mounted root editor focused
  - Return milestone: tests green
  - Stop / reassessment: panel close path needs SDK capability not available
- [x] AC-4: Integrated closeout checks
  - Outcome: whole change passes local closeout gate
  - Known entrypoints and skill paths: repository root
  - Inputs: accepted AC-1, AC-2, AC-3 units
  - Dependencies: all implementation units accepted
  - Output: check results
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: focused vitest for the four packages, pnpm run check:ci, pnpm run typecheck, pnpm run build and the pi-extension bundle test all pass
  - Return milestone: all checks green
  - Stop / reassessment: unrelated environment failure reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: b72530f1a19be046be4a4b5a85181f10e9cd9b2771607a58b0e9077e8eea9fd0

- AC-1: PASS | pi-questions-user vitest 227/227 incl. test/focus.test.ts real-TUI regressions | questionnaire keeps input after same-editor and setEditorComponent transitions; Oracle probes on real SDK proxy
- AC-2: PASS | pi-subagents vitest 1305 passed/1 skipped and pi-todo 218/218 incl. panel-overlay-focus and todo-panel-focus tests | 2 transitions x 2 closure orders end with mounted root editor focused
- AC-3: PASS | pi-core vitest 471/471 incl. owned-overlay.test.ts; questionnaire abort tests | exactly-once settlement, early/late handle, foreign overlay preserved, zero abort listeners left
- AC-4: PASS | pnpm run check:ci exit 0, pnpm run typecheck exit 0, pnpm run build ok, pnpm run test:pi-extensions 11/11, git diff --check clean | existing suites and fallbacks unchanged
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:d4c161a6048dd9925b79ebf62391d0dafb80a209ebd5fc9a07fb03f879d398da

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
