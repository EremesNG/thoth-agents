# Change: subagents-widget-focus-speed

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- The subagents widget installs a global `ctx.ui.onTerminalInput` listener
  (`pi-packages/pi-subagents/src/extension/subagents-extension.ts:131-170`). Pi TUI
  runs input listeners before the focused component and stops on `consume:true`
  (`pi-tui/dist/tui.js:685-700` vs `:739-746`).
- Widget input (`src/ui/background-widget.ts:474-562`): with active background tasks
  and an empty editor, Down activates navigation; while active, Up/Down/Enter/Left/
  Right/Escape and every other key are consumed (`:561`). Suspension only tracks the
  subagents panel and manager interaction (`subagents-extension.ts:60-65,82-84,133`;
  `src/ui/panel-overlay.ts:173-175,330-333`).
- `/subagents-model` opens `ctx.ui.custom(..., {overlay:true})`
  (`src/model-profiles/command.ts:622-645`); `/subagents-tools` opens
  `ctx.ui.custom` without overlay options (root `src/pi.ts:149-165`,
  `src/pi/tools-panel.ts:328-342`). Neither suspends the widget.
- Pi 0.99.1 TUI exposes `hasOverlay()` (`pi-tui/dist/tui.d.ts:317-320`); no generic
  "custom UI or dialog active" query was found in `ExtensionUIContext`.
- Running-card metrics (`background-widget.ts:145-159`): turns, tools, tokens
  (input+output+cacheWrite), context %, elapsed, optional compactions; absent values
  render `?`. Collection: `src/runner/snapshot-builder.ts:64-143`,
  `src/manager.ts:1468-1487,1598-1616`, `src/runner/event-processing.ts:522-563`.
  No assistant generation start/end/first-token timing is recorded today.
- Provider usage: claude-bridge updates usage at `message_start`, `message_delta`
  and assistant fallback (`pi-claude-bridge/src/index.ts:1227-1235,1310-1313,1419`);
  antigravity stream-json reports usage from init/step/result frames
  (`pi-antigravity-bridge/src/driver.ts:512-526,585,597`); ACP output counts are
  estimates unless a final exact usage arrives (`src/acp/driver.ts:352-366,426-435,746-753`).
- Spec `multi-harness-agent-pack` "Run visible background Pi specialists"
  (`.thoth/specs/multi-harness-agent-pack/spec.md:481-489`) names turns, tool uses,
  lifetime tokens, context % and elapsed; `pi-packages/pi-subagents/README.md:413`
  repeats them; widget tests in `test/ui/widget.test.ts:327,410,579-893`.

## Intent

The subagents widget no longer steals keys from other UIs, `/subagents-tools`
opens as an overlay like `/subagents-model`, and each running card shows the
subagent's average output speed (tok/s) between context and elapsed instead of turns.

## Non-goals

- Changing other metrics, status glyphs or animation behavior.
- Exact token counts for providers that only report estimates.
- Changing the widget's keybindings when the editor is active.
- Changing `/subagents-tools` behavior other than how it is presented.

## Acceptance

- AC-1: The widget handles keyboard input only when the root editor positively
  holds focus: at session start the widget explicitly installs the editor through
  `ctx.ui.setEditorComponent` with a factory that delegates to the configured factory
  (`ctx.ui.getEditorComponent()`) or, when none is configured, constructs Pi's
  exported default `CustomEditor`, and records the created instance; it compares that
  instance with `getFocusedComponent()` from the `setWidget` TUI proxy; plus no
  overlay is open (`hasOverlay()` false) and no thoth panel suspension is
  active; otherwise it never activates navigation and never consumes a key, and an
  already active navigation exits without consuming the key. Tests cover an open
  overlay, Pi native `select`/`confirm`/`input` dialogs, a non-overlay `custom()` UI,
  and navigation already active when an overlay or dialog opens; in each the key
  reaches the focused UI. Editor behavior, configured editors and keybindings are
  unchanged. When the recorded instance is no longer the installed editor (another
  extension replaced it, or `setEditorComponent` was called again), the widget fails
  closed: it passes every key through and shows a visible notice that widget
  navigation is unavailable. Tests cover the default editor, a configured custom
  editor, and a later replacement.
- AC-2: `/subagents-tools` opens as an overlay; its existing behavior and tests
  (persistence, protections, preview) are unchanged.
- AC-3: Running cards drop turns and show average output speed `N tok/s` between
  context and elapsed, computed from dedicated counters: the sum of assistant
  `message_end` output usage paired with that message's measured start-to-end
  interval (excluding tool execution, compaction, standalone and tool-result usage);
  both counters accumulate across continuations and are persisted through manager
  and history so a continuation restored from history keeps them; the value renders
  `?` until measurable or when historical timing is unavailable, and never fabricates;
  estimated provider counts are accepted as reported.
- AC-4: Docs and the spec delta describe the new metric set and focus behavior;
  README metric text updated.
- AC-5: pi-subagents typecheck/tests, focused root tests, root `check:ci` and
  `typecheck` pass; after merge and restart, live: arrows work in
  `/subagents-model` and `/subagents-tools` while a background subagent runs, and a
  running card shows tok/s.

## Clarifications

- tok/s is the task average, not the last message (user, 2026-10-01).
- Widget handles keys only with the editor active; `/subagents-tools` becomes an
  overlay (user, 2026-10-01).

## Decisions

- Plan review round 3: REJECT on default/replaced editors and the unsafe fallback.
  User decision (2026-10-01): install the editor explicitly at session start and
  fail closed with a visible notice when identity is lost; recreating the empty
  editor at startup is accepted (Pi copies text, not cursor/undo).
- Editor identity comes from wrapping the editor factory, because
  `getEditorComponent()` returns the factory, not the instance
  (`interactive-mode.js:2009`), and `getFocusedComponent()` identifies only the
  focused component (`tui.js:245`, proxied by `tui-renderer.js:37-59`). Plan review
  round 2: REJECT on editor identity only; repaired with the wrapper. History
  counters use additive `ensureColumn` migrations, nullable for legacy rows.
- Focus check requires a positive editor-focus test in addition to `hasOverlay()`
  and the suspension set, because Pi native dialogs and default `custom()` UIs take
  focus without being overlays (`interactive-mode.js:2034-2123,2239-2296`); the
  widget captures the TUI proxy passed to `setWidget`.
- Generation time is measured in the runner from assistant `message_start` to
  `message_end` arrival, paired with that message's `message_end` output usage;
  `getSessionStats()` totals are not used for the rate because they include
  compaction, standalone and tool-result usage (`agent-session.js:3304-3337`).
- Both counters are persisted in task history; restored continuations resume them.
- Plan review round 1 (fresh Oracle): REJECT on editor-focus guard and rate
  accounting/persistence; repaired here. Overlay sizing: model-style options;
  `maxHeight` clips, so test short terminals.
- Implementation checkpoint (root, 2026-10-01): `6d69f59` (/subagents-tools overlay,
  height-aware viewport; 86 focused tests) and the pi-subagents commit (editor focus
  guard with installed editor and fail-closed replacement notice; dedicated tok/s
  counters with history persistence and legacy migration; README). Frozen checks:
  frozen install 0; pi-subagents typecheck 0 / 504 passed; antigravity 0 / 542
  passed, 9 skipped; claude-bridge 0 / unit 290; root check:ci, typecheck, build 0;
  root `pnpm test` without Orca CODEX_HOME 1160 passed / 4 missing-sibling failures;
  operator claude-bridge.json hash unchanged. Live AC-5 follows after merge.
- Live AC-5 (2026-10-01, after merge c58eb68/d39367f and full Pi restart): operator
  confirmed arrow navigation in `/subagents-model`, the `/subagents-tools` overlay and
  native dialogs while background subagents ran, and running cards showing tok/s.

## Durable deltas

- `MODIFIED multi-harness-agent-pack` **Run visible background Pi specialists** — Omitted mode MUST run specialists in background while respecting explicit modes, and the runtime MUST display truthful live execution metrics in a tree above input. Tool uses, lifetime tokens, available child-context percentage, average output speed in tokens per second (total output tokens over total generation time) and active elapsed time MUST remain readable even with long task/model text, using compact or separate metric rows as needed and marking absent values without fabrication. Running status MUST use an animated braille indicator and terminal statuses MUST use simple distinguishable completion, cancellation and failure glyphs. Animation MUST remain inactive when no child runs and MUST clean up on task termination or session teardown without blocking root input. The widget MUST NOT consume keyboard input unless the root editor holds focus, so overlays, Thoth panels, native dialogs and other custom UIs receive their keys.
  - GIVEN a child running or queued and later completing or stopping, and an overlay possibly open; WHEN the UI renders, keys are pressed and the session tears down; THEN metrics including average output speed and status symbols remain truthful, keys reach the focused overlay, dialog or custom UI, root stays interactive and no idle animation timer remains .

## Plan

1. Worker A (sole writer of `pi-packages/pi-subagents/**`): focus guard in the
   extension/widget input path; generation-time tracking in the runner snapshot and
   manager accumulation; card renderer swap (turns -> tok/s between context and
   elapsed); tests; README.
2. Worker B (sole writer of root `src/pi.ts`, `src/pi/tools-panel.ts`,
   `src/pi/tools-command.test.ts`, `src/pi/tools-panel.test.ts`): open
   `/subagents-tools` as an overlay with the same options pattern as
   `/subagents-model`; tests.
3. Root: checks, commits, merge, live check after restart, fresh Oracle, archive.

## Tasks

- [x] AC-1: focus guard
  - Outcome: widget never consumes keys while an overlay or thoth panel is open
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/extension/subagents-extension.ts:60-178`, `src/ui/background-widget.ts:474-600`, tdd skill
  - Inputs: Exploration
  - Dependencies: none
  - Output: code + tests
  - Owner: worker A
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: keybindings unchanged with editor active
  - Focused check and PASS evidence: tests for overlay, native select/confirm/input, non-overlay custom UI and navigation active before opening: keys reach the focused UI; existing widget tests green
  - Return milestone: tests green
  - Stop / reassessment: installing the editor at session start changes editor behavior beyond recreating the empty editor
- [x] AC-2: /subagents-tools as overlay
  - Outcome: overlay presentation, same behavior
  - Known entrypoints and skill paths: `src/pi.ts:149-165`, `pi-packages/pi-subagents/src/model-profiles/command.ts:622-645` (pattern)
  - Inputs: Clarifications
  - Dependencies: none
  - Output: code + tests
  - Owner: worker B
  - Writes: `src/pi.ts`, `src/pi/tools-panel.ts`, `src/pi/tools-panel.test.ts`, `src/pi/tools-command.test.ts`
  - Interface boundaries: panel persistence unchanged
  - Focused check and PASS evidence: test asserts overlay option with model-style sizing; existing panel tests green; short-terminal render checked
  - Return milestone: tests green
  - Stop / reassessment: overlay sizing breaks the panel layout
- [x] AC-3: tok/s metric
  - Outcome: cards show average output speed instead of turns
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/runner/snapshot-builder.ts`, `src/runner/event-processing.ts`, `src/manager.ts:1468-1616`, `src/history.ts`, `src/ui/background-widget.ts:145-159`, `src/types.ts`
  - Inputs: Decisions
  - Dependencies: none (same writer as AC-1)
  - Output: code + tests
  - Owner: worker A
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: other metrics unchanged
  - Focused check and PASS evidence: tests for accumulation across messages, exclusion of tool/compaction time and usage, persistence and continuation after history reload including a legacy database migrated by `ensureColumn`, `?` before measurable or with unavailable historical timing, card order
  - Return milestone: tests green
  - Stop / reassessment: message start/end events unavailable in the runner
- [x] AC-4: docs
  - Outcome: docs match
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/README.md:413`
  - Inputs: AC-1, AC-3
  - Dependencies: AC-3
  - Output: updated README
  - Owner: worker A
  - Writes: `pi-packages/pi-subagents/README.md`
  - Interface boundaries: none
  - Focused check and PASS evidence: README lists the new metric set and focus behavior
  - Return milestone: docs updated
  - Stop / reassessment: none expected
- [x] AC-5: checks and live
  - Outcome: green checks; live focus and tok/s
  - Known entrypoints and skill paths: package filters, root scripts, operator Pi after merge
  - Inputs: AC-1..AC-4
  - Dependencies: AC-1..AC-4
  - Output: evidence
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: checks exit 0; live arrows and tok/s observed
  - Return milestone: evidence captured
  - Stop / reassessment: new failure

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

The user explicitly selected Review plan with Oracle. Rounds 1-3 returned [REJECT]
(editor focus identity, rate accounting), repaired in this record; round 4 fresh Oracle
subtask_thoth-oracle_1790831757392_380d37d0 returned [OKAY]. Notes: build the default
editor with `{ embedWorkingStatus: true }`; detect replacement by comparing
`getEditorComponent()` with the installed wrapper (unfocused alone is not replacement);
test repeated session starts, `setEditorComponent(undefined)` restoration and
same-wrapper reinstallation; deduplicate the notice.

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: cd67a829c41ac9522227345161eaf34e4ec9ac4d6d4fd553fd3ed5297b0ecaf2

Fresh read-only Oracle subtask_thoth-oracle_1790866558712_6db2494c returned PASS at
HEAD 9eac15c (diffs 6d69f59, 96638d9, 95bef54; no secret/generated/unrelated drift).

- AC-1: PASS | diff review + focus-guard tests | positive editor-identity/focus guard, overlay/suspension exclusions, navigation reset, deduplicated replacement warning; default/configured/replaced editor and overlay/native/custom UI tests pass
- AC-2: PASS | diff review + root panel tests | tools command opens as centered overlay; sizing/resize and persistence/protection tests pass
- AC-3: PASS | diff review + accounting tests | paired assistant generation counters exclude tool/compaction/standalone usage, persist through continuations/history, unknown legacy timing renders ?; render order tested
- AC-4: PASS | README + delta review | README and exact-title MODIFIED delta match accepted behavior; delta validation passes, spec baseline matches
- AC-5: PASS | fresh checks + operator live confirmation | subagents 516/516, focused root 86/86, both typechecks and check:ci pass; post-restart operator confirmed arrows in /subagents-model, /subagents-tools overlay and native dialogs plus tok/s cards
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:c42781ec2e06373bdf4601bbdfb2dd3b56e715085cdd951aad29619adedfaa7b
- Source: pi-packages/pi-subagents/src/ui/background-widget.ts | sha256:460c69764f558cbbffb5a59ab6e6303c69ca1856127d7b92ee6fdfd71f95cc98
- Source: pi-packages/pi-subagents/src/extension/subagents-extension.ts | sha256:b72b4ec81b34c2f46f0842b69e5723d0eab7857d8e41e3b878f9d4a74eacf72f
- Source: pi-packages/pi-subagents/src/runner/event-processing.ts | sha256:6dd221d2aeebdffc8208104f03f225184c00ef526e2868470011368d0f26db70
- Source: pi-packages/pi-subagents/src/runner/snapshot-builder.ts | sha256:023e10dd6a7df0e4f60652a46364490791f9afbc2a417171b0c0243dc21e8695
- Source: pi-packages/pi-subagents/src/history.ts | sha256:e2fa68a6998514ed4dbb1b84753aafdc367f51d159619d77c9279aca7f07a63b
- Source: pi-packages/pi-subagents/src/manager.ts | sha256:931b9a964667d84aae0c5c0d5308f481f48b669ff697cad9ae5a5dfa5e62772b
- Source: pi-packages/pi-subagents/src/types.ts | sha256:5d7ebc67fb07624a855444d0e20e59d05fc17b4cbbfcdcda07ded389964a87cc
- Source: pi-packages/pi-subagents/README.md | sha256:a475f9a602ccc1a0e099b049f373eacae34ffb1f7ff5e34f4f2ad840d09572c6
- Source: src/pi.ts | sha256:7c67b6e19d382475273a10a4e3b3a615ab5b58e260bcb65971d65d2479dbb741
- Source: src/pi/tools-panel.ts | sha256:fb44c6526bf1461cd00d49ca2ec4cd843da3eb8a635c318e3ae3bfbfe21557f4

## Closeout

**Archive**: READY
