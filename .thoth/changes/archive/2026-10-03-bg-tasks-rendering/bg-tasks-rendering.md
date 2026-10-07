# Change: bg-tasks-rendering

**Classification**: substantial
**Scope**: local
**Uncertainty**: low
**Risk**: medium

## Exploration

User screenshot: a `[background-completion-batch]` notification rendered as
Pi's generic custom-message block and `bg_task action="clear"` as a native
one-line call. Evidence (paths under `pi-packages/pi-background-tasks/`):

- Eight tools in `src/tools.ts:194-299`. Only `bg_task_log`, `bg_task` and
  `bg_status` define `renderResult`, all through
  `renderBackgroundTaskLogDisplay` (`:249-292,466-546`), which honors
  `expanded`, has no frame or expand hint, and clips by characters rather than
  display width. No tool defines `renderCall` or `renderShell`. Results are
  text; only log actions add details `{ kind: "background-task-log-display",
  head, fullLineCount, compactLines, foldedLineCount }` (`:452-464`).
- Notifications: `background-completion-batch`
  (`src/shared-callback-batcher.ts:262-293,512-518`) and
  `background-task-failure` (`src/failures.ts:141-175`,
  `shared-callback-batcher.ts:317-371,577-579`) are sent with `display: true`,
  `deliverAs: 'followUp'`, `triggerTurn: true` and no `details`; no
  `registerMessageRenderer` exists. Per-completion internal events carry
  `source, id, label, status, outcome, failureRows, decision, incidentCount`
  (`src/runtime.ts:874-927`).
- Pi-TUI `Box`, `Text`, `Component`, `truncateToWidth`, `visibleWidth` are
  available; package dev SDK is 0.99.1. Tests are colocated `src/*.test.ts`
  (`src/log-display.test.ts` pattern).
- Target visual language: pi-subagents framed boxes
  (`pi-subagents/src/render/tools/components.ts:82-148`,
  `src/ui/theme.ts:91-351`), expand-hint resolver
  (`src/render/tools/expansion-hint.ts:72-109`) and completion renderer
  (`src/render/completion-message.ts:152-287`).

## Intent

pi-background-tasks renders its own tool calls, results and notifications in
compact framed blocks consistent with pi-subagents, with no change to tool
execution or to the text the model receives.

## Non-goals

- Changing tool parameters, execution, notification text, delivery options or
  callback batching.
- Importing pi-subagents or pi-thoth-theme code.
- Publishing or version bumps.

## Acceptance

- AC-1: All eight tools register `renderShell: 'self'`, `renderCall` and
  `renderResult` that draw one display-width-safe framed block: call title with
  the tool name and a one-line argument summary (action, id, name or command),
  result collapsed by default to a short preview with the resolved expand hint,
  full when expanded, error styling for error results; the log display keeps
  its current compact preview inside the frame.
- AC-2: `background-completion-batch` and `background-task-failure` messages
  carry a bounded, JSON-safe display projection as `details`: only the packed
  entries, in packed order, with the fields actually shown or clipped in the
  text (id via `inspectId` for urgent failures, label, status, outcome, decision,
  shown incident rows and counts) plus omission counts; never raw callback
  events. Text content and send options stay unchanged, and the
  package registers message renderers that show a framed collapsed view (title
  with count and status, one line per entry, expand hint) and the full text
  when expanded; messages without details render their text in the frame.
- AC-3: Package typecheck and tests pass, including new render tests at widths
  0, 1, 40 and 80, collapsed and expanded, and existing log-display tests
  updated only where the frame changes their output.

## Clarifications

- RESOLVED: Give the fork a complete rendering rather than theme overrides
  (user, this session).

## Decisions

- Mirror pi-subagents' frame helpers by copying the minimal local helpers into
  `src/render/` (no cross-package import).
- Collapsed preview shows eight lines, matching the log display and the theme.
- Details are persisted in the session (SDK `session-manager.js:947-960`) but
  excluded from model input and compaction, so they must stay within the text's
  own 2/8 KiB budgets (plan review: raw represented entries added ~25 KB).
- Frames clamp width 0 to empty output and measure display width (ANSI, CJK);
  tests compose call and result through the real SDK component, since the SDK
  concatenates both slots and supplies errors via `context.isError`.
- `src/shared-callback-batcher.ts` carries an upstream header "Generated from
  packages/callback-batcher/index.ts. Do not edit directly."; that generator
  lives in the upstream pi-better-harness repo, not in this fork, so the fork
  edits the vendored file directly, as with the rest of the adopted package.
  A future upstream resync must reapply the details projection.
- Once all eight tools define renderers, pi-thoth-theme stops framing the five
  that currently get its generic frame (it respects owned packages); intended.

## Durable deltas

- None.

## Plan

One writer (thoth-designer) adds `src/render/{frame,tools,messages}.ts`, wires
renderers in `src/tools.ts`, adds `details` to the two notification sends and
registers message renderers in the extension entry. Verification: package
typecheck and tests, root `check:ci`, frozen install, manual Pi check of a
spawned task, its completion notification and `bg_task` actions.

## Tasks

- [x] AC-1: Framed renderers for the eight tools
  - Outcome: every tool call and result is one framed block
  - Known entrypoints and skill paths: `pi-packages/pi-background-tasks/src/tools.ts:194-546`, `src/log-display.test.ts`; reference `pi-packages/pi-subagents/src/render/tools/components.ts:82-148`, `src/ui/theme.ts`; skills tdd, simplify
  - Inputs: Exploration
  - Dependencies: none
  - Output: `src/render/frame.ts`, `src/render/tools.ts`, wiring and tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-background-tasks/src/render/**`, `src/tools.ts`, `src/log-display.test.ts`, new `src/render/*.test.ts`
  - Interface boundaries: tool definitions keep names, parameters and execute
  - Focused check and PASS evidence: SDK-composed call+result tests per tool collapsed/expanded/error at widths 0/1/40/80 with no double frame, ANSI/CJK width cases; existing tests pass
  - Return milestone: package tests green
  - Stop / reassessment: renderShell self unsupported by the installed SDK
- [x] AC-2: Notification details and message renderers
  - Outcome: compact framed completion and failure notifications
  - Known entrypoints and skill paths: `pi-packages/pi-background-tasks/src/shared-callback-batcher.ts:262-579`, `src/failures.ts:141-175`, `src/runtime.ts:874-927`, extension entry `src/index.ts`; reference `pi-packages/pi-subagents/src/render/completion-message.ts:152-287`
  - Inputs: AC-1 frame helper
  - Dependencies: AC-1
  - Output: `src/render/messages.ts`, details on sends, registration, tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-background-tasks/src/render/**`, `src/shared-callback-batcher.ts`, `src/failures.ts`, `src/index.ts`, related tests
  - Interface boundaries: message `content` text, `display`, `deliverAs`, `triggerTurn` unchanged
  - Focused check and PASS evidence: tests assert unchanged content and options, details matching packed entry identities/order and shown fields, omission counts, overflow and long-incident cases at 2 KiB and 8 KiB with details no larger than a bounded projection, collapsed/expanded rendering, fallback without details
  - Return milestone: package tests green
  - Stop / reassessment: registerMessageRenderer unavailable
- [x] AC-3: Package verification
  - Outcome: green package checks
  - Known entrypoints and skill paths: `pi-packages/pi-background-tasks/package.json` scripts
  - Inputs: AC-1 and AC-2 outputs
  - Dependencies: AC-1, AC-2
  - Output: check evidence
  - Owner: root
  - Writes: none
  - Interface boundaries: CI package commands
  - Focused check and PASS evidence: typecheck, tests, root check:ci, frozen install pass
  - Return milestone: checks green
  - Stop / reassessment: failures outside the owned files

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 1e100ede16e54172e0539f6c5ca6875206c8f8e1b78679e79501ccc4aa2e86a2

- Provenance: plan review EXPLICIT_REVIEW, round 1 REJECT (unbounded persisted details) repaired, round 2 fresh Oracle OKAY; implementation explicitly authorized by the user; final verification by a fresh read-only thoth-oracle, round 1 PASS (task subtask_thoth-oracle_1791058246150_5d79e414).
- AC-1: PASS | tool contracts and SDK composition | eight tools keep names, parameters and execute; 128 real ToolExecutionComponent cases at widths 0/1/40/80, single frame, error styling, log preview preserved
- AC-2: PASS | notification parity, projection and integration | 50 batch and 200 urgent adversarial cases kept text identical to HEAD; options unchanged; details bounded to 2/8 KiB, packed order, inspectId, no raw events; renderers, fallback and model-input exclusion verified
- AC-3: PASS | frozen checks | typecheck 0; 311 tests pass / 4 skipped twice; frozen install 0; root check:ci 0 (package excluded from Biome)
- Source: pi-packages/pi-background-tasks/src/tools.ts | sha256:2db543a195629ab3936de188e18e25749ceb740e95b8d85b3c924f7cb42d55bc
- Source: pi-packages/pi-background-tasks/src/index.ts | sha256:44a122a0dcc4b0443e33224898592a18171ec147f9cb5bc6544efe15f6e3eebf
- Source: pi-packages/pi-background-tasks/src/shared-callback-batcher.ts | sha256:0a4ae82c3b643e20eb5f4cb542efc8bf28d0b338f3162f648008c7397f852f4c
- Source: pi-packages/pi-background-tasks/src/render/frame.ts | sha256:2f1e7863425184f38bbafd5af2617abafbde1004187b9be45a4db37d1f96d251
- Source: pi-packages/pi-background-tasks/src/render/tools.ts | sha256:a8387397cf216040c1d3af4d6a907deea6d161c0c9b98f54deeed2b596f9dd87
- Source: pi-packages/pi-background-tasks/src/render/messages.ts | sha256:7aab10c98a9d025465be4e6820da0e773f3f5de64241b45ed4521bd02f4f3be1
- Residual manual checks (user): live spawn, completion, failure and bg_task actions with expansion in Pi

## Closeout

**Archive**: READY
