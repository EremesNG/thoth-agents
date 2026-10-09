# Change: pi-question-dock

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Current mounting: `pi-packages/pi-questions-user/src/index.ts:62-84` opens the questionnaire through pi-core `openOwnedOverlay` (`overlay: true`, width 100%, anchor bottom-center, capturing). Overlays composite over the chat (`@earendil-works/pi-tui/dist/tui.js:950-985`) and own keyboard focus, so the chat is covered and fullscreen PgUp/PgDn defer to the overlay (`tui-alt-screen.js:461-462,546-547`).
- Introduced by commit 4e769a1 (archived change `2026-10-08-overlay-question-focus`, record :19-32, :92-106): editor-replacement mounting (`ctx.ui.custom` without overlay, `interactive-mode.js:2282-2340`) lost keys after closing the subagents/task-list history overlays because the restored focus target was a detached editor or the history recaptured focus; SDK custom-overlay completion also popped the top overlay.
- Collapse (Ctrl+]) only toggles a private flag and renders one dim row (`src/ui/questionnaire.ts:322-333,679-692`); focus is never released and collapsed state is not visible to the tool renderer (`src/render.ts:205-279`, `src/custom-ui.ts:9-15`). No earlier version released focus on collapse or showed a collapsed indicator.
- SDK 1.0.2 facilities: TUI `setFocus`, overlay handle `focus/unfocus/setHidden` (`tui.d.ts:177-194,226-227`); widgets above the editor receive the TUI (`interactive-mode.js:1821-1853`); custom editor factories (`types.d.ts:142-177`); pi-core `work-panel-host.ts:382-456` already combines an above-editor widget, a retained-editor custom-editor factory and terminal input handling. Tool render context exposes `state`, `toolCallId`, `invalidate()` (`types.d.ts:347-357`, `tool-execution.js:72-81`), and `execute` receives `onUpdate`.
- Editor Enter during an active run queues a steering message (`interactive-mode.js:2673-2682`, `agent-session.js:1514-1526`); it does not resolve the questionnaire.
- Inline mode uses native terminal scrollback (`tui-main-screen.js:99,230-244`); fullscreen scrolls the transcript with PgUp/PgDn unless an overlay owns focus.
- Durable requirement `.thoth/specs/pi-ecosystem/spec.md` "Pi question focus over panel overlays" (:209-217) mandates an own overlay and continuous keyboard ownership.

## Intent

The open question occupies the editor area instead of covering the chat, keeps the chat visible and scrollable, collapses with Ctrl+] to a one-line dock that returns the editor and keyboard to the user, re-expands with Ctrl+] from anywhere, shows its collapsed state on its chat tool-call card, and still regains keyboard input after any panel overlay closes while expanded.

## Non-goals

- Question types, answers, previews, review step, fallback and result card content.
- Mouse support inside the questionnaire.
- Changing the history panels or work-panel overlays beyond what focus handoff requires.
- Package version bumps.

## Acceptance

- AC-1: while expanded, the questionnaire renders in the editor area (the editor is not visible, as before commit 4e769a1), nothing is composited over the chat, and the chat stays scrollable (native scrollback inline, PgUp/PgDn in fullscreen because no overlay owns focus).
- AC-2: Ctrl+] collapses the questionnaire to a one-line dock above the restored editor with keyboard focus on the editor (typing and Enter work; Enter queues a steering message and the question stays open); Ctrl+] from the editor re-expands it with focus; answers and cursor state survive collapse/expand; Esc semantics unchanged.
- AC-3: the question's chat tool-call card shows a collapsed indicator while collapsed and returns to its normal open rendering when expanded or answered.
- AC-4: while expanded, opening and closing the subagents, task-list or background history overlay or the work-panel detail card leaves the questionnaire visible and receiving keyboard input; while collapsed, closing those overlays returns focus to the editor; closing never removes or hides another overlay or dock.
- AC-5: spec updated, docs updated, and the local closeout gate (pi-questions-user and pi-core tests and typechecks, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm run test:pi-extensions`) passes, followed by a live user check.

## Clarifications

- Mounting (user, 2026-10-09): docked design; the user prefers the pre-4e769a1 look where the question replaces the editor, with the defect that closing an overlay such as /subagents left the question unreachable.
- Editor submission while collapsed (user, 2026-10-09): allowed; Enter queues a steering message and the question stays open.
- Keyboard ownership applies while expanded; collapsed hands input to the editor (follows from the user's requirement).

## Decisions

- D-1: One shared pi-core editor-slot owner. SDK `getEditorComponent()` returns a factory and re-invokes it, which breaks chained factories and the work-panel first-invocation guard (`work-panel-host.ts:266-277,416-422`). pi-core therefore installs a single editor factory (process-wide, version-tolerant registry like the work panel) and lets contributors register slot contributions: the work panel keeps its above-editor rows and input routing through it, and the questionnaire registers a slot contribution that replaces the editor while expanded and renders a one-line dock above the retained editor while collapsed. The questionnaire never uses an overlay. Exported from the `./panel` subpath.
- D-2: State-aware focus lifecycle in pi-core. Acquisition (open or expand): if an owned overlay is visible and holds or would recapture focus, focus is transferred through that overlay handle's `unfocus({target: questionnaire})` so the next key does not return to it; otherwise `setFocus(questionnaire)`. Owned-overlay close restores the expanded questionnaire, otherwise the mounted editor (existing detached-target repair extended to the slot). Release (collapse, completion, cancellation, abort): focus moves to the root editor only when no visible foreign overlay currently holds focus; a still-visible foreign overlay keeps its focus. No polling.
- D-3: Ctrl+] is handled by a terminal input handler while a question is open so it works from the editor; it is consumed only while a question is open.
- D-4: Collapsed state flows to the renderer through a bridge from execute to the tool render shared `state` keyed by `toolCallId` plus row `invalidate()` (verified to refresh an open call on SDK 1.0.2); `onUpdate` partial results are not used because they mark the call as having a result.
- D-6: While a question is open, Ctrl+] is consumed by the terminal input handler and shadows the editor `jumpForward` binding; documented.
- D-5: pi-questions-user stops using `openOwnedOverlay`; pi-core owned-overlay stays for the history and work-detail overlays.

## Durable deltas

- `MODIFIED pi-ecosystem` **Pi question focus over panel overlays** — The `ask_user_question` TUI MUST occupy the editor area without covering the chat, MUST keep keyboard input while expanded even when the subagents, task-list or background history overlay or the work-panel detail card is opened and closed, MUST collapse with Ctrl+] to a one-line dock that returns keyboard input to the root editor and re-expand with Ctrl+] while open, and MUST mark its tool-call card as collapsed while collapsed; the subagents history overlay, the task-list history overlay and the work-panel detail card MUST close only their own overlay handle, so that closing one never removes, hides or unfocuses another, and when the focus target restored on close is no longer mounted they MUST focus the expanded questionnaire or otherwise the currently mounted root editor; collapsing, answering or cancelling the question MUST NOT take focus from a still-visible foreign overlay.
  - GIVEN the subagents or task-list history overlay is open; WHEN the root agent asks a question, the user closes the history overlay, collapses the question, types in the editor and expands it again; THEN the chat stays uncovered and scrollable, the questionnaire receives keyboard input when expanded, the editor receives it when collapsed, the tool-call card shows the collapsed state, and the user's answer is returned.

## Plan

One writer, sequential, owning pi-questions-user plus the pi-core editor-slot and focus files:

1. pi-core editor-slot owner (D-1): new slot module, work-panel host migrated onto it with unchanged behavior, exports through `./panel`.
2. Focus lifecycle (D-2) in pi-core owned-overlay/slot code, with real-SDK 1.0.2 regression tests (stable wrapper preFocus recapture, unfocus target, foreign-overlay preservation).
3. Questionnaire mount, collapse/expand handoff (D-3, D-6) and dock rendering.
4. Renderer indicator (D-4) in `src/render.ts`.
5. Docs and gate; live check by the user.

Verification seams: real SDK 1.0.2 TUI probes for focus and fullscreen PgUp/PgDn (fake focus fixtures alone are insufficient); unit tests with fake TUI/overlay handles (existing `test/` harness for pi-questions-user and pi-core `owned-overlay.test.ts`/`panel-overlay-focus` patterns); fullscreen PgUp/PgDn not intercepted; build; live check of the four scenarios.

Risks: composition with the work-panel editor factory; focus races on overlay close; fullscreen vs inline differences; Ctrl+] conflicting with other terminal input handlers.

## Tasks

- [x] AC-1: questionnaire mounted in the editor area without overlay
  - Outcome: expanded questionnaire in editor slot, chat uncovered and scrollable
  - Known entrypoints and skill paths: pi-packages/pi-questions-user/src/{index.ts,ui/questionnaire.ts,custom-ui.ts}, pi-packages/pi-core/src/{work-panel-host.ts,owned-overlay.ts,panel.ts}; skills tdd, simplify
  - Inputs: Exploration; Decisions D-1, D-5
  - Dependencies: none
  - Output: pi-core editor-slot owner, work panel migrated, questionnaire mounted in the slot, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-questions-user/src/**, pi-packages/pi-questions-user/test/**, pi-packages/pi-core/src/{editor-slot.ts (new),work-panel-host.ts,panel.ts}, pi-packages/pi-core/test/editor-slot*.test.ts (new) and existing work-panel host tests only where the host wiring moves
  - Interface boundaries: tool result contract unchanged; work-panel editor factory composition
  - Focused check and PASS evidence: pi-questions-user vitest and typecheck pass; tests show no overlay use and editor-slot rendering
  - Return milestone: mounting with passing tests
  - Stop / reassessment: work-panel behavior would change, or pi-core root index.ts must change
- [x] AC-2: Ctrl+] collapse/expand hands focus between questionnaire and editor
  - Outcome: collapse/expand and editor typing while collapsed
  - Known entrypoints and skill paths: pi-packages/pi-questions-user/src/ui/questionnaire.ts, src/index.ts; skills tdd
  - Inputs: AC-1 mounting; Decision D-3
  - Dependencies: AC-1 unit accepted (same writer, sequential)
  - Output: focus handoff with tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-questions-user/src/**, pi-packages/pi-questions-user/test/**
  - Interface boundaries: editor submission semantics unchanged
  - Focused check and PASS evidence: tests for collapse focus to editor, Ctrl+] from editor re-expands, state preserved
  - Return milestone: handoff with passing tests
  - Stop / reassessment: Ctrl+] cannot be intercepted while the editor has focus
- [x] AC-3: collapsed indicator on the tool-call card
  - Outcome: renderCall shows collapsed state and refreshes on change
  - Known entrypoints and skill paths: pi-packages/pi-questions-user/src/render.ts; skills tdd
  - Inputs: Decision D-4
  - Dependencies: AC-2 unit accepted (same writer)
  - Output: renderer change with tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-questions-user/src/**, pi-packages/pi-questions-user/test/**
  - Interface boundaries: result card unchanged
  - Focused check and PASS evidence: render tests for collapsed, expanded and answered states
  - Return milestone: renderer with passing tests
  - Stop / reassessment: SDK offers no refresh path for a open call
- [x] AC-4: expanded question regains focus after overlays close
  - Outcome: focus repair across history overlays and work detail
  - Known entrypoints and skill paths: pi-packages/pi-core/src/owned-overlay.ts, pi-packages/pi-core/test/owned-overlay.test.ts, pi-packages/pi-subagents/test/ui/panel-overlay-focus.test.ts; skills tdd
  - Inputs: Decision D-2
  - Dependencies: AC-1 unit accepted (same writer)
  - Output: focus repair with tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-questions-user/src/**, test/**; pi-packages/pi-core/src/{owned-overlay.ts,editor-slot.ts} and their tests
  - Interface boundaries: owned-overlay public API stays compatible
  - Focused check and PASS evidence: real SDK 1.0.2 tests open/close each overlay with expanded and collapsed questions, expand while a history overlay is open (next key reaches the questionnaire), and complete/cancel while a foreign overlay is visible (its focus is kept)
  - Return milestone: focus repair with passing tests
  - Stop / reassessment: repair requires changing history panel packages
- [x] AC-5: docs and closeout gate
  - Outcome: docs updated, gate green
  - Known entrypoints and skill paths: pi-packages/pi-questions-user/README.md, docs/agent routed Pi docs, docs/installation.md
  - Inputs: accepted AC-1 to AC-4
  - Dependencies: AC-1, AC-2, AC-3, AC-4 units accepted
  - Output: docs and gate results
  - Owner: thoth-worker
  - Writes: docs and package README only
  - Interface boundaries: none
  - Focused check and PASS evidence: pnpm run check:ci, pnpm run typecheck, pnpm run build, pnpm run test:pi-extensions, touched-package tests pass
  - Return milestone: gate results
  - Stop / reassessment: unrelated environment failures reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW

Round 1 REJECT (chained editor factories; incomplete focus lifecycle) repaired; round 2 fresh Oracle [OKAY] 2026-10-09. Cautions: after unfocus({target}) also setFocus(target) for the blocked-restore branch; preserve retained-editor callbacks, app actions, work-panel focus guards and teardown; serialize shared docs/spec closeout with pi-task-channels.
**Implementation**: AUTHORIZED

User selected Implement on 2026-10-09 after [OKAY].

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 1ffd9f33b4a473a1247c10f1a9c0fa8f4e0664dadec256f214ec26fee5469fd7

Fresh independent Oracle PASS on 2026-10-09 (first final round). Live user check outstanding before archive.

- AC-1: PASS | slot/viewport tests + native SDK probe | no overlay; shared editor slot keeps work rows; fullscreen PgUp/PgDn scroll the transcript
- AC-2: PASS | questionnaire tests + native SDK probe | collapse restores editor input; Enter steers without settling; collapsed Esc native; state preserved; Ctrl+] released after
- AC-3: PASS | real SDK ToolExecutionComponent tests | shared state + invalidate update the row without onUpdate; indicator clears on expand/complete
- AC-4: PASS | real SDK focus regressions | unfocus({target}) + setFocus prevents recapture; close restores question/editor; foreign overlay focus preserved
- AC-5: PASS | check:ci, typecheck, test:pi-extensions, package suites | pi-core 812, pi-questions-user 245, pi-subagents 1385/1 skipped; docs match
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:71ad5c74b483c4f83097262c26556ff84ef532c9664b1205367cbf9f08953803

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: PENDING
