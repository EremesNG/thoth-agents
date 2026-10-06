# Change: pi-work-panel

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Three independent above-editor widgets coexist: `subagents-claude-background`
  (`pi-packages/pi-subagents/src/ui/background-widget.ts`, registered in
  `src/extension/subagents-extension.ts:150-267`), `thoth-todos`
  (`<task-list pkg>/*-overlay.ts:65-80`) and `background-work-list`
  (`pi-packages/pi-background-tasks/src/shared-navigator.ts:275-352`).
- Screenshots with all three active show ~20 rows above the editor: 3 lines per
  agent, completed todos still listed, inconsistent blank lines, a separate
  `← work navigator` hint line, inconsistent headings (`Agents`, `Todos`,
  lowercase `background tasks`) and ambiguous counters (`1/4`, `0/3`).
- Input is uncoordinated. Agents use `ctx.ui.onTerminalInput` and take ↑↓
  directly on an empty editor (`subagents-extension.ts:210-227`,
  `background-widget.ts:597-695`); background tasks wrap the editor and require
  ← first (`shared-navigator.ts:642-743`); Todos only has `ctrl+shift+t`
  collapse (`<task-list pkg>/index.ts:135-141`). Focus states are separate, so two
  selection cursors were visible at once, and hints contradict each other.
- Pi's editor uses ↑ on an empty editor for prompt history
  (`@earendil-works/pi-tui/src/components/editor.ts:924-938`).
- The shared navigator is a per-instance closure (`shared-navigator.ts:123-165`)
  with a reusable provider shape (`:12-71`: id, label, priority, visibleCount,
  listRows, detail, armCloseLabel, close, optional showSection/parentRow/
  onVisibleChanged) but no cross-package registration; it is not global.
- `@thoth-agents/pi-core` 0.1.0 already uses a `globalThis`/`Symbol.for`
  process-wide registry for the render kit (`pi-core/src/render-kit.ts:255-309`)
  and is a `workspace:^` dependency of all three packages.
- Item actions: subagents `SubagentManager.cancel(id, reason)`
  (`pi-subagents/src/manager.ts:1456-1488`) and `showSubagentsPanel` detail/
  history; background tasks `close(id)` stop/dismiss and provider `detail`;
  the task list has none.
- Tests: `pi-background-tasks/src/shared-navigator.test.ts`,
  `navigator-provider.test.ts`, `e2e.test.ts`; `pi-subagents/test/ui/widget.test.ts`,
  `test/subagents.test.ts:545-743`, `test/ui/panel.test.ts`;
  `<task-list pkg>/*-overlay.*.test.ts`, `test/widget-coexistence.test.ts`.

## Intent

Replace the three above-editor widgets with one compact **Work panel** owned by a
pi-core cross-package contract: each package registers a section provider, one
host renders a single widget and owns a single focus and keymap, entered with ←
from an empty editor.

## Non-goals

- No sidebar, no new pi-core state channels for subagents/background tasks
  (roadmap items stay separate), no change to the task-list tool, background task
  runtime, subagent execution, or the subagents history/detail panel itself.
- No package version bumps.

## Acceptance

- AC-1: pi-core exports a versioned work-panel contract with a process-wide
  registry; providers from separately bundled packages register/unregister into
  one panel; exactly one Work panel widget and one Work panel input listener are
  installed per UI session regardless of load order (foreground task-mode run
  controls are separate, see Decisions), and they are removed when the last provider
  unregisters.
- AC-2: Unfocused, the panel is compact: one heading per non-empty section with
  consistent casing/glyph and an explicit counter (`Agents · 2 running`,
  `Todos · 1/4 done`, `Background · 3 running · 2 failed`), one line per item,
  per-section row cap with `+N more`, a total height budget, no blank separator
  lines; unfocused, a dim `← interact` cue is shown on the panel itself (right of
  the first visible heading), and the full key hint line only while focused.
  Rows show the provider's status text (e.g. background `every 20s · 9m left`),
  never the raw command; section caps never hide open items while the total
  budget has room, and `+N more` counts exactly the hidden open items.
- AC-3: Interaction is unified: ← on an empty editor focuses the panel; ↑↓ move
  across all sections' items; Enter opens the item's detail; `x` performs the
  item's stop/cancel/dismiss with the existing two-press confirmation; Esc (or →)
  returns to the editor. Only one selection cursor can exist. ↑/↓ on an empty
  unfocused editor keep Pi's default behavior (prompt history). The listener
  activates only when the root editor holds focus (same editor-identity,
  overlay and suspension guards as `subagents-extension.ts:214-226`) and
  `ctx.ui.getEditorText()` is empty; it consumes nothing while any overlay,
  native dialog, detail view, the subagents panel or another custom UI is open,
  and it suspends itself while its own detail/open UI is shown and releases
  focus when that UI closes.
- AC-4: Background tasks register as a provider and no longer install their own
  widget, editor wrapper navigation or hint line; detail overlay, stop and
  dismiss keep working.
- AC-5: Subagents register as a provider (one line per agent: animated/terminal
  status glyph, agent, task label and a compact metrics segment with tool uses,
  lifetime tokens, context %, average tok/s and active elapsed; the task label
  truncates first so metrics stay readable, falling back to a separate metrics
  row only when the width cannot fit them; absent values marked, never
  fabricated; a running or queued task with dropped tools keeps a compact
  dropped-tools warning on its row as the canonical requirement **Configure
  adopted Pi subagents natively** demands) and
  no longer install their own widget or terminal-input listener; Enter opens the
  existing subagents panel for that task, `x` cancels a running task.
- AC-6: Todos register as a provider showing open tasks (in-progress first, with
  active form) plus `+N done`, and no longer install their own widget; the
  section hides when the list is empty; Enter shows the task description detail.
- AC-8: Rows keep the previous visual hierarchy through semantic segments
  styled by theme roles: status glyph colored by state (running accent/warning,
  failed error, done success, cancelled muted), primary name emphasized (agent
  name, task subject, background task name), secondary text normal, metrics and
  counters dim; task-list in-progress uses `◇` in accent with its active form,
  not-started `○` normal, `+N done` dim; headings use one glyph only, and failure
  counters in headings use the error role.
- AC-7: With the theme absent the panel renders native unframed output; with the
  theme present it renders through the render kit.

## Clarifications

- Structure: user chose a unified Work panel (2026-10-05).
- Focus key: user chose ← from an empty editor (2026-10-05).

## Decisions

- Host contract lives in pi-core using the existing `Symbol.for` registry
  pattern, so each package's bundled pi-core copy shares one panel. The host is
  installed lazily by the first `ensure(ctx)` for a session and torn down on
  session shutdown or when no providers remain.
- The provider interface is ported from the existing shared-navigator shape and
  extended with optional `open(id, ctx)` (custom detail, used by subagents) and
  `summary()` (heading counter). The contract carries a `version` field.
- Section order: Agents, Todos, Background. Empty sections are hidden.
- Footer status `← work · N` stays as the discoverability cue when unfocused.
- `ctrl+shift+t` task-list collapse is removed; the panel's compact mode supersedes it.
- Final verification round 1 (FAIL) found pre-existing foreground task-mode run
  controls in `pi-subagents/src/tools/subagent-run.ts` (`installDoubleEscapeCancel`,
  `installBackgroundHandoffShortcut`) installing their own `onTerminalInput`
  listeners and consuming Escape while an overlay holds focus. They are
  tool-execution controls, not widgets, so they stay outside the Work panel;
  root decision: keep them separate but apply the same editor-focus/overlay/
  suspension guards so they consume nothing outside the focused root editor.
  AC-1 counts Work panel listeners only.
- The same round found agent rows dropped the durable dropped-tools warning;
  it is restored on the row (AC-5).
- Live test 2026-10-05 (user screenshot after merge f648c83): no visible entry
  cue, flat single-color rows, wrong task-list `+N more` count and missing `+N done`,
  shared running glyph for task-list rows, background rows showing commands, double
  heading glyph. Root decision: fix inside this change (AC-2 amended, AC-8
  added) and re-run final verification before archive.
- Plan review history: round 1 Oracle REJECT (focus guards, metric visibility) repaired; round 2 fresh Oracle OKAY. Implementation authorized by explicit user choice "Implement" on 2026-10-05.
- The canonical `multi-harness-agent-pack` requirement **Run visible background
  Pi specialists** is retained unchanged: metrics stay visible above input in
  compact rows, animation lifecycle and the editor-focus input guard are
  preserved by the host, so no delta for that capability is declared.

## Durable deltas

- `MODIFIED pi-ecosystem` **Thoth Pi task-list extension** — The Thoth Pi task-list package (published under the `@thoth-agents` scope as a fork of the juicesharp rpiv 2.12.0 task-list package) MUST register the session task-list tool with the upstream 2.12.0 schema and transition rules, MUST reconstruct the session list from the branch on session start, tree navigation and compaction, MUST publish its full session snapshot on the pi-core task-list state channel after each change and in answer to a request, MUST add the open tasks to the model context before each agent start when any exist using an API detected at runtime that degrades without failing on the minimum supported Pi, and MUST show only the current session's list through its pi-core work-panel section.
  - GIVEN a session with open tasks in the task-list tool; WHEN the session is compacted and the agent starts again; THEN the list is reconstructed, the open tasks are present in the model context and the work-panel Todos section, and a fresh state snapshot is published on the pi-core task-list state channel .
- `ADDED pi-ecosystem` **Thoth Pi work panel** — `@thoth-agents/pi-core` MUST define a versioned work-panel contract with a process-wide provider registry; first-party packages that show live work above the editor (subagents, task list, background tasks) MUST register sections through it instead of installing their own above-editor widgets or input handlers; the host MUST install exactly one widget and one input listener per UI session, MUST keep a single selection, MUST be focused with ← from an empty editor and released with Esc, and MUST leave unfocused ↑/↓ to the editor.
  - GIVEN subagents, todos and background tasks active in one Pi session; WHEN the user presses ← on an empty editor, moves with ↑↓ across sections and presses Esc; THEN one panel with one cursor traverses all items and focus returns to the editor, while unfocused ↑ recalls prompt history .

## Plan

`<task-list pkg>` denotes the task-list package directory (`pi-packages/pi-to*`, package `@thoth-agents/pi-to*`).

1. **pi-core contract + host** (`pi-packages/pi-core/src/work-panel.ts` +
   export): types (`WorkPanelProvider`, `WorkPanelRow`, `WorkPanelSummary`,
   `WORK_PANEL_VERSION`), `Symbol.for('thoth.pi-core.work-panel')` registry,
   `registerWorkPanelProvider(pi|ctx, provider) => unregister`,
   `ensureWorkPanel(ctx)`. Host ports the renderer, editor-empty ← trigger,
   focused navigation, two-press close and detail overlay from
   `shared-navigator.ts`, adds compact/focused rendering, row caps and height
   budget, and one `onTerminalInput` listener that consumes keys only while
   focused or for ← on an empty editor.
2. **Background tasks** adopt the provider via pi-core; delete
   `shared-navigator.ts` UI pieces now hosted by pi-core.
3. **Subagents** adopt the provider; remove widget registration and terminal
   listener; keep `background-widget.ts` row formatting only if reused.
4. **Todos** adopt the provider; remove `TodoOverlay` widget and shortcut.
5. Update pi-ecosystem spec deltas at archive.

Verification seams: pi-core host unit tests (registry across two module copies,
single install, focus/keymap, single cursor, compact rendering, kit/no-kit);
each package's provider tests; package typechecks and offline tests; root
`pnpm run check:ci`, `pnpm run typecheck`, `pnpm test`.

## Tasks

- [x] AC-1: pi-core work-panel contract, process-wide registry and single host install
  - Outcome: pi-core exports the versioned contract; providers from two module copies share one host; one widget and one input listener per UI session; teardown when empty
  - Known entrypoints and skill paths: pi-packages/pi-core/src/render-kit.ts:255-309, pi-packages/pi-core/src/index.ts, pi-packages/pi-background-tasks/src/shared-navigator.ts (provider shape :12-71, render :329-493, input :642-743, detail :791-1102); skills: C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md
  - Inputs: Exploration and Decisions above
  - Dependencies: none
  - Output: pi-core/src/work-panel*.ts, exports, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/**, pi-packages/pi-core/package.json (exports only if needed)
  - Interface boundaries: render-kit contract unchanged; no edits in other packages
  - Focused check and PASS evidence: pi-core typecheck and tests pass, including two-registry-copy, single-install, single-cursor, ← focus/Esc release, unfocused ↑ not consumed, compact budget and kit/no-kit tests
  - Return milestone: contract + host tests green
  - Stop / reassessment: Pi UI API lacks a needed hook (e.g. editor-empty detection without wrapping)
- [ ] AC-2: pi-core host compact rendering
  - Outcome: headings with consistent casing and counters, one line per item, per-section caps with `+N more`, total height budget, no blank separators, hint line only when focused
  - Known entrypoints and skill paths: pi-packages/pi-core/src/render-kit.ts:129-169; pi-packages/pi-background-tasks/src/shared-navigator.ts:329-493
  - Inputs: accepted AC-1 host
  - Dependencies: AC-1 unit
  - Output: renderer and render tests in pi-core
  - Owner: thoth-worker (same session as AC-1 unit)
  - Writes: pi-packages/pi-core/src/**
  - Interface boundaries: render-kit contract unchanged
  - Focused check and PASS evidence: pi-core render tests assert line counts, caps, headings and budget at several widths
  - Return milestone: render tests green
  - Stop / reassessment: render kit lacks a needed member
- [x] AC-3: pi-core host unified focus and keymap
  - Outcome: ← on empty editor focuses; ↑↓ across sections; Enter detail/open; x two-press close; Esc/→ release; single cursor; unfocused ↑/↓ not consumed
  - Known entrypoints and skill paths: pi-packages/pi-background-tasks/src/shared-navigator.ts:642-743,791-1102; pi-packages/pi-subagents/src/extension/subagents-extension.ts:210-227
  - Inputs: accepted AC-1 host
  - Dependencies: AC-1 unit
  - Output: input handling and tests in pi-core
  - Owner: thoth-worker (same session as AC-1 unit)
  - Writes: pi-packages/pi-core/src/**
  - Interface boundaries: Pi `onTerminalInput` consume semantics
  - Focused check and PASS evidence: pi-core input tests for each key path; non-consumption when unfocused, when the editor is not focused, when an overlay/dialog/custom UI is open, and while the host's own detail/open UI is shown; focus released after that UI closes
  - Return milestone: input tests green
  - Stop / reassessment: editor emptiness not observable from the listener
- [x] AC-7: pi-core host kit and native rendering
  - Outcome: panel renders through the render kit when registered and native unframed output when absent
  - Known entrypoints and skill paths: pi-packages/pi-core/src/render-kit.ts:255-309
  - Inputs: accepted AC-2 renderer
  - Dependencies: AC-2 unit
  - Output: kit/no-kit tests in pi-core
  - Owner: thoth-worker (same session as AC-1 unit)
  - Writes: pi-packages/pi-core/src/**
  - Interface boundaries: render-kit registry
  - Focused check and PASS evidence: tests render with and without a registered kit
  - Return milestone: tests green
  - Stop / reassessment: none beyond AC-2
- [ ] AC-8: semantic row segments and theme-role hierarchy across the panel and its three providers
  - Outcome: rows and headings render with the AC-8 hierarchy; AC-2 live-test fixes (entry cue, status text, caps/counts, done summary)
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel.ts, work-panel-render.ts, work-panel-host.ts; pi-packages/pi-subagents/src/ui/work-panel-provider.ts, src/ui/background-widget.ts; pi-packages/pi-background-tasks/src/navigator-provider.ts; <task-list pkg>/*-work-panel.ts; skills C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md, C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: live-test screenshot findings in Decisions; previous widgets' styling at HEAD a5b2721
  - Dependencies: none
  - Output: styled segment contract, provider adoption, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/**, pi-packages/pi-subagents/**, pi-packages/pi-background-tasks/**, <task-list pkg>/**
  - Interface boundaries: render-kit contract unchanged; contract version bump of the work-panel row type only if fields become required
  - Focused check and PASS evidence: render tests assert theme roles per segment with a recording theme, entry cue when unfocused, exact `+N more`, `+N done`, background status text; package typechecks and tests green
  - Return milestone: all four packages green with styled-segment and live-test regression tests
  - Stop / reassessment: theme lacks a role needed for a segment, or a provider cannot supply status text without a contract change beyond the row type
- [x] AC-4: background tasks register through the pi-core work panel
  - Outcome: background tasks shown, focused, detailed, stopped and dismissed only via the panel
  - Known entrypoints and skill paths: pi-packages/pi-background-tasks/src/index.ts:13-29, src/navigator-provider.ts, src/shared-navigator.ts
  - Inputs: accepted AC-1 contract
  - Dependencies: AC-1 unit
  - Output: provider adoption, removed duplicate UI, updated tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-background-tasks/**
  - Interface boundaries: pi-core work-panel contract (read-only)
  - Focused check and PASS evidence: package typecheck and offline tests pass
  - Return milestone: package green
  - Stop / reassessment: contract gap requiring pi-core change
- [x] AC-5: subagents register through the pi-core work panel
  - Outcome: agents shown one line each, Enter opens existing panel, x cancels, no own widget/listener
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/extension/subagents-extension.ts:150-267, src/ui/background-widget.ts, src/manager.ts:630-638,1456-1488, src/ui/panel-overlay.ts
  - Inputs: accepted AC-1 contract
  - Dependencies: AC-1 unit
  - Output: provider adoption, removed widget/listener, updated tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/**
  - Interface boundaries: pi-core work-panel contract (read-only); history panel behavior unchanged
  - Focused check and PASS evidence: package typecheck and offline tests pass, including dropped-tools warning on running/queued rows, task-mode double-Esc/handoff listeners not consuming input while an overlay/dialog/custom UI holds focus or the editor is not focused, metric-segment readability with long task/model text at narrow widths, absent-value marking, animation stopping when no child runs, and the subagents panel receiving its keys after Enter
  - Return milestone: package green
  - Stop / reassessment: contract gap requiring pi-core change
- [x] AC-6: todos register through the pi-core work panel
  - Outcome: open todos + `+N done` in the panel, Enter shows description, no own widget/shortcut
  - Known entrypoints and skill paths: <task-list pkg>/index.ts:95-191, *-overlay.ts, state/store.ts, test/widget-coexistence.test.ts
  - Inputs: accepted AC-1 contract
  - Dependencies: AC-1 unit
  - Output: provider adoption, removed overlay, updated tests
  - Owner: thoth-worker
  - Writes: <task-list pkg>/**
  - Interface boundaries: pi-core work-panel contract (read-only); task-list tool and state channel unchanged
  - Focused check and PASS evidence: package typecheck and offline tests pass
  - Return milestone: package green
  - Stop / reassessment: contract gap requiring pi-core change

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 500bc3d2c10485b01d2380446931ceea39396d310642ceb772fcc5fd7719b404

- AC-1: PASS | pi-core lifecycle tests (independent module copies, concurrent ensure, registration order, final unregister) | pi-core 257 tests pass; Oracle r2 independent rerun
- AC-2: PASS | pi-core render tests at several widths (caps, budget, continuation rows, no blank separators, focused-only hint) | pi-packages/pi-core/test/work-panel.test.ts; Oracle r2
- AC-3: PASS | pi-core host input tests (all keys, one cursor, history preserved, focus/overlay guards, detail suspension) plus task-mode listeners using the host guard | pi-core tests; pi-subagents 1218 passed/1 skipped; Oracle r2
- AC-4: PASS | background provider and e2e tests (detail/log, two-press stop/dismiss, session filter, standalone navigation removed) | pi-background-tasks 460 passed/4 skipped
- AC-5: PASS | agents provider tests (truthful metrics, absent values, animation cleanup, dropped-tools warning, panel open, cancel) | pi-subagents 1218 passed/1 skipped; Oracle r2
- AC-6: PASS | task-list provider tests (active form ordering, done summary, detail, empty hiding, replay, child isolation) | task-list package 191 passed
- AC-7: PASS | kit registration/withdrawal and native unframed rendering tests | pi-core tests; Oracle r2
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:aaf8a80d64a297922c81ebd4e26bbe8bd7769dee0bf1e6446a5fd1a66c60dd43

Record prefix re-attested by a fresh read-only Oracle after administrative closeout edits (checkboxes, authorization tokens, provenance note); final-verification PASS was against prefix edebbea673fb640fa7625bda4b0804cc42e442a377daf1e166e931d399df5e2f.

Repository checks (root, after all edits): `pnpm run check:ci` exit 0; `pnpm run typecheck` exit 0; `pnpm run build` exit 0 (before the additive pi-core guard export, typechecked afterwards); `pnpm test` with THOTH_PLUGINS_ROOT set: 102 files / 1455 passed (publish-marketplace tests need the thoth-plugins checkout). Not run: live interactive Pi terminal smoke test.

## Closeout

**Archive**: READY
