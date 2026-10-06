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
  lines; the panel's last row (bottom-left, directly above the editor) is the hint
  row: a dim `← interact` while unfocused and the full key hint while focused;
  the hint only lists actions available for the selected item (no `x` when it
  cannot be closed).
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
- AC-9: Enter on an item without a custom `open` shows a framed, opaque detail
  card (render-kit card when available, bordered box natively) with every row
  padded to the card width so nothing behind shows through, sized to content and
  centered; it only shows controls that apply (log-tail `l` only for providers
  that use it, folding only for content taller than the card, `x` only when
  closable), and short sections such as a task description are shown expanded.
- AC-10: The detail card keeps a stable size while open: its width and height
  are fixed when it opens (sized for the largest item of the opened section,
  capped by the terminal) and do not change while ↑↓ moves between items. ↑↓
  in the card moves only within the opened section, so agents never appear in
  the generic card (Enter on an agent always opens its subagents panel).
- AC-11: The detail card has a visual hierarchy: field labels dim, values
  normal, status value colored by state role, section titles (e.g. `Command`,
  `Log`, `Description`) styled as headings; empty fields are omitted and no
  value is shown twice (background command appears once).
- AC-12: When another UI takes focus while the detail card is open (question
  dialog, native dialog, another overlay or custom UI), the card closes and the
  panel releases focus, so Esc always acts on the topmost visible UI.
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
- Live test 2 (2026-10-05): user asked to move `← interact` to the bottom-left
  hint row above the editor; the detail view for task-list items rendered as a
  frameless transparent box over the transcript with irrelevant controls
  (`folded`, `l 10/25`, `x unavailable`). Root decision: fix within this change
  (AC-2 amended, AC-9 added).
- Live test 3 (2026-10-05): card framed and opaque as intended; user asked to
  polish the card hierarchy, keep its size stable while navigating, and fix a
  question dialog opening over the card so Esc cancelled the question instead
  of closing the card. User decisions: card ↑↓ stays within the opened section;
  the card closes when another UI takes focus; panel standardization across the
  subagents history panel, /subagents-tools and /subagents-model is a separate
  change based on the /subagents-tools design (AC-10..AC-12 added here).
- Plan review history: round 1 Oracle REJECT (focus guards, metric visibility) repaired; round 2 fresh Oracle OKAY. Implementation authorized by explicit user choice "Implement" on 2026-10-05.
- The canonical `multi-harness-agent-pack` requirement **Run visible background
  Pi specialists** is retained unchanged: metrics stay visible above input in
  compact rows, animation lifecycle and the editor-focus input guard are
  preserved by the host, so no delta for that capability is declared.

## Durable deltas

- `MODIFIED pi-ecosystem` **Thoth Pi task-list extension** — The Thoth Pi task-list package (published under the `@thoth-agents` scope as a fork of the juicesharp rpiv 2.12.0 task-list package) MUST register the session task-list tool with the upstream 2.12.0 schema and transition rules, MUST reconstruct the session list from the branch on session start, tree navigation and compaction, MUST publish its full session snapshot on the pi-core task-list state channel after each change and in answer to a request, MUST add the open tasks to the model context before each agent start when any exist using an API detected at runtime that degrades without failing on the minimum supported Pi, and MUST show only the current session's list through its pi-core work-panel section.
  - GIVEN a session with open tasks in the task-list tool; WHEN the session is compacted and the agent starts again; THEN the list is reconstructed, the open tasks are present in the model context and the work-panel Todos section, and a fresh state snapshot is published on the pi-core task-list state channel .
- `ADDED pi-ecosystem` **Thoth Pi work panel** — `@thoth-agents/pi-core` MUST define a versioned work-panel contract with a process-wide provider registry; first-party packages that show live work above the editor (subagents, task list, background tasks) MUST register sections through it instead of installing their own above-editor widgets or panel navigation handlers; the host MUST install exactly one panel widget and one panel input listener per UI session, MUST render compact sections with one heading and counter each, one line per item, a total height budget with exact `+N more` overflow counts, and semantic theme roles for status glyphs, names, secondary text and metrics, MUST keep a single selection, MUST be focused with ← only from an empty, focused root editor with no overlay or dialog open and released with Esc, MUST leave unfocused ↑/↓ to the editor, MUST end the panel with a hint row listing only the actions available for the selected item, MUST let a provider with a custom open action show its own UI and otherwise show item details in a framed opaque card of stable size whose ↑/↓ stays within the opened section, MUST close that card only when another UI actually takes focus, and MUST expose a read-only focus-guard query so other key handlers in those packages consume nothing outside the focused root editor.
  - GIVEN subagents, todos and background tasks active in one Pi session; WHEN the user presses ← on an empty editor, moves with ↑↓ across sections, opens a task-list item's detail, moves with ↑↓, a question dialog then opens, and the user presses Esc; THEN one panel with one cursor traverses all items, the detail card keeps its size and stays in the Todos section, the card closes when the dialog opens so Esc acts on the dialog, and unfocused ↑ recalls prompt history .

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
- [x] AC-2: pi-core host compact rendering
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
- [x] AC-8: semantic row segments and theme-role hierarchy across the panel and its three providers
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
- [x] AC-9: framed opaque detail card with applicable controls only, and bottom-left hint row
  - Outcome: AC-9 detail card plus amended AC-2 hint row and action-aware hints
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-host.ts:67-162,330-340; pi-packages/pi-core/src/work-panel-detail.ts:94-185; pi-packages/pi-core/src/work-panel-render.ts:353-378; pi-packages/pi-thoth-theme/src/render-kit/index.ts:75-140 (read-only reference); <task-list pkg>/*-work-panel.ts:61-82; skills C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md, C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: live test 2 findings in Decisions; detail overlay explorer evidence
  - Dependencies: none
  - Output: pi-core detail and hint changes, provider capability flags, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/**, <task-list pkg>/**, pi-packages/pi-background-tasks/** (capability flag only)
  - Interface boundaries: render-kit contract unchanged; pi-tui overlay options have no background option, so opacity comes from width-padded framed rows
  - Focused check and PASS evidence: detail tests assert frame, full-width padded rows, no `l`/`x`/fold controls for task-list details, kit and native; hint-row tests assert bottom-left cue and action-aware hints
  - Return milestone: pi-core, task-list and background package tests green
  - Stop / reassessment: overlay compositor does not overwrite underlying cells with padded rows
- [x] AC-10: stable-size, section-scoped detail card
  - Outcome: card size fixed while open; card ↑↓ limited to the opened section
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-host.ts:127-165; pi-packages/pi-core/src/work-panel-detail.ts; skills C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md, C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: live test 3 decisions
  - Dependencies: none
  - Output: pi-core changes and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/**
  - Interface boundaries: provider contract unchanged except optional fields
  - Focused check and PASS evidence: tests assert identical card dimensions across ↑↓ between items of different content size and that ↑↓ never leaves the section
  - Return milestone: pi-core tests green
  - Stop / reassessment: overlay API cannot hold a fixed height
- [x] AC-11: detail card visual hierarchy and deduplicated fields
  - Outcome: styled labels/values/status/section titles; empty fields omitted; background command shown once
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-detail.ts:94-245; pi-packages/pi-background-tasks/src/navigator-provider.ts; <task-list pkg>/*-work-panel.ts
  - Inputs: live test 3 screenshots (background card flat, duplicated command, `pgid · –`)
  - Dependencies: none
  - Output: styled detail rendering, provider detail cleanup, tests
  - Owner: thoth-worker (same session as AC-10 unit)
  - Writes: pi-packages/pi-core/**, pi-packages/pi-background-tasks/**, <task-list pkg>/**
  - Interface boundaries: render-kit contract unchanged
  - Focused check and PASS evidence: recording-theme tests assert roles per label/value/status/heading; tests assert no empty field and single command occurrence
  - Return milestone: three packages green
  - Stop / reassessment: theme lacks a needed role
- [x] AC-12: detail card closes when another UI takes focus
  - Outcome: card closes and panel releases focus when a question dialog, native dialog or other overlay/custom UI opens
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-host.ts:119-214
  - Inputs: live test 3 Esc incident
  - Dependencies: none
  - Output: host change and tests
  - Owner: thoth-worker (same session as AC-10 unit)
  - Writes: pi-packages/pi-core/**
  - Interface boundaries: Pi overlay/custom UI APIs
  - Focused check and PASS evidence: test opens another custom UI or overlay while the card is open and asserts the card is closed and the next Esc reaches the new UI
  - Return milestone: pi-core tests green
  - Stop / reassessment: no observable signal when another UI opens
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
**Reviewed record SHA-256**: 8651a5d53ca25c611fbba0e5761a7b9ae41ea26685d16d9d7e76f0e632bb2eee

- AC-1: PASS | shared registry, concurrent installation and teardown | pi-core lifecycle tests, 298 passed (Oracle round 4)
- AC-2: PASS | compact budget, preferred caps, exact overflow, bottom hint row and provider status text | pi-core render tests and background provider tests; live hint row confirmed by user
- AC-3: PASS | unified navigation, two-press close, editor guards and detail suspension | pi-core input tests; pi-subagents task-mode tests
- AC-4: PASS | background provider replaces standalone navigation with detail, stop and dismiss kept | pi-background-tasks 462 passed, 4 skipped
- AC-5: PASS | agent metrics, dropped-tools warning, animation, custom panel and cancel | pi-subagents 1220 passed, 1 skipped
- AC-6: PASS | open-task ordering, active form, done summary, description and session isolation | task-list package 192 passed
- AC-7: PASS | render-kit discovery and withdrawal and native unframed panel | pi-core kit and native tests
- AC-8: PASS | semantic segment hierarchy, state glyph roles and failure counters | pi-core recording-theme tests and provider tests
- AC-9: PASS | framed opaque padded card with applicable controls and expanded short content | pi-core detail tests with installed compositor; live card confirmed by user
- AC-10: PASS | stable opening dimensions and section-scoped navigation | pi-core detail tests with and without kit
- AC-11: PASS | styled fields and headings, omitted empty values, single background command | pi-core hierarchy tests and background detail regression
- AC-12: PASS | same-card refocus survives; foreign focus closes only the owned card | installed-TUI focus tests (9); live question-over-card case confirmed by user
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:aaf8a80d64a297922c81ebd4e26bbe8bd7769dee0bf1e6446a5fd1a66c60dd43

History: final verification round 1 FAIL (task-mode listeners, dropped-tools warning), round 2 PASS, live tests added AC-8..AC-12, round 3 FAIL (same-card refocus dismissal, delta overclaim), round 4 PASS by a fresh Oracle at commit 99c17cb against prefix be5ce6bc7e419690b776a8e4e0e8c2827275a769ffde428ec74262ddf914bb0d; a fresh Oracle re-attested the current prefix after task checkboxes were completed.

Repository checks: `pnpm run check:ci` and `pnpm run typecheck` exit 0 at 99c17cb; `pnpm run build` exit 0 and `pnpm test` 102 files / 1455 passed (with THOTH_PLUGINS_ROOT) run independently by Oracle round 3 at 5bd8599, with only pi-core changed since and pi-core 298 passed. Not run: build and root suite at 99c17cb itself.

## Closeout

**Archive**: READY
