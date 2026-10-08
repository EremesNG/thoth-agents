# Change: work-panel-auto-cleanup

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

Path aliases: `TL` = `pi-packages/pi-todo` (task-list package); `TLP` = its work-panel provider module `todo-work-panel.ts`; `TLC` = its command module `todo.ts`.

## Exploration

Paths are relative to `pi-packages/`.

- Shared retention: `pi-core/src/work-panel-render.ts:58-141` (`panelSections`)
  renders, for `retention: 'prompt'` sections, running rows, failed rows with
  `endedAt >= epochStartedAt`, and the three newest current-epoch done rows; when
  the agent is idle and nothing runs, the section collapses to one selectable
  history summary. Prompt-retained rows ignore `row.expiresAt`; non-prompt rows
  survive only while `expiresAt > now` (`:130-136`). The epoch advances only on a
  recognized idle interactive/RPC prompt (`pi-core/src/work-panel-lifecycle.ts:122-151`).
- Refresh: `pi-core/src/work-panel-host.ts:320-343` schedules a refresh at the
  earliest rendered `expiresAt` plus provider intervals (chained, unreferenced
  `setTimeout`). Collapsed selection requires `provider.openHistory`
  (`:178,195`); rows without custom `open` use the generic detail card.
- Subagents: `pi-subagents/src/ui/work-panel-provider.ts` uses prompt retention,
  maps completed→done and every other terminal status (including cancelled)
  →failed; close only cancels running tasks (`:134-142`). `/subagents` opens the
  history panel (`src/extension/subagents-extension.ts:263-265`).
- Background: `pi-background-tasks/src/navigator-provider.ts` uses prompt
  retention, maps succeeded/cancelled→done and failed/timed-out→failed
  (`:135-147`); terminal close writes `dismissedAt`, hiding the row from the
  widget but not from history. `/bg` already opens the same history panel as the
  widget (`src/index.ts:55-58`) and is kept unchanged.
- Task-list: `TL/TLP.ts:13-90` lists only in-progress and not-started
  tasks, shows completed ones as a nonselectable `+N done` summary, hides the
  section when nothing is open, and opens the generic detail card of one task
  (title/status/description), which duplicates the visible row. `/todos`
  (`TL/TLC:138-190`) prints the grouped list as an info notification in
  the chat. No task list overlay exists.
- Icons/styling: `pi-core/src/render-kit.ts` resolves semantic icons and status
  glyphs through the registered kit with native Unicode fallbacks;
  `pi-thoth-theme/src/shared/icons.ts` and `src/shared/config.ts:58-72` provide
  `icons: nerd | ascii` (default Nerd) from `pi-thoth-theme.json`. Package
  literals remain (`pi-subagents/src/ui/subagents-history-panel.ts:275-282`,
  `pi-subagents/src/ui/theme.ts:11-22`, `pi-background-tasks/src/history-panel.ts:167`).
  `theme.strikethrough` is supported (`TL/view/format.ts:107`).
- Reusable overlay: `pi-core/src/history-panel.ts` `HistoryPanel<T>` with a
  `HistoryPanelAdapter<T>`; background and subagent history panels compose it.
- External research (2026-10-07): task list UIs commonly keep completed items visible
  (✓/strikethrough, `N/M`), drop completed first on overflow and clear the list
  at the next turn/request (Codex, Gemini, rpiv task list, Copilot); none uses a
  clock. Subagent/background UIs commonly linger successes briefly and failures
  longer (Claude Code: success removed, failure 30 s with manual dismiss;
  nicobailon 10 s; Fidget 3 s; VS Code toasts 10/12/15 s); history stays available.

## Intent

The widget shows current work and cleans itself; history panels keep everything.
Subagent and background rows that finished linger briefly (successes 10 s,
failures until the next prompt or manual close with at least 30 s), and both can
be dismissed by hand. The task list widget shows plan progress (completed items
marked, `done/total` counter) and opens one panel with the full current task list,
also reachable through `/todos`; a fully completed task list disappears at the next
prompt. The three widgets and their panels use consistent semantic icons, Nerd
Font by default with a configurable Unicode fallback.

## Non-goals

- Deleting or altering task records, histories, logs or model-context task list
  reinjection; cleanup is presentation-only.
- A session-wide task list history; the task list panel shows only the current task list.
- New background commands (`/bg` stays as is) or changes to the history panels'
  content beyond styling.
- User-configurable linger durations.
- Visual changes to Pi packages other than pi-core work panel/history shell,
  TL, pi-subagents, pi-background-tasks and pi-thoth-theme icon mode.

## Acceptance

- AC-1: In prompt-retained sections a done row renders until 10 s after its
  `endedAt`; a failed row renders while it ended in the current epoch or until
  30 s after `endedAt`, whichever is later; running rows always render; the host
  refreshes at each linger boundary without polling faster than today.
- AC-2: While any row lingers the section stays expanded even when the agent is
  idle; whenever no running or lingering row remains (busy or idle) it collapses
  to the selectable history summary; the newest-three done cap still applies.
- AC-3: Subagent and background terminal rows support manual close that hides
  them from the widget only (history unchanged); running rows keep cancel/stop.
- AC-4: Cancelled is classified as failed in both subagents and background
  tasks; timed-out stays failed.
- AC-5: The task list widget lists the current task list with completed items marked
  (completed glyph, dim/strikethrough) and a `done/total` heading counter; on
  height overflow completed items are dropped first and summarized as `+N done`,
  including at the smallest height budget that shows any item row.
- AC-6: Enter on any task list row, the Todos heading summary or `+N done` opens one
  task list panel built on the pi-core history panel shell listing the full current
  task list grouped by status (in progress, not started, completed) with an
  `N/M completed` header and not-started count, showing the selected task's description
  (visible on opening and after each selection change, at any list length); `/todos` opens the same panel
  when custom UI is available and keeps the text output otherwise.
- AC-7: When every task is completed the task list stays visible until the next
  recognized prompt epoch, after which the Todos section and panel no longer show
  it (`/todos` reports no active task list); task state is untouched.
- AC-8: Task-list, subagent and background widget rows and their panels resolve
  status glyphs, selection markers and separators through render-kit semantic
  icons (no remaining hard-coded glyph literals in those surfaces, including the
  shared pi-core history panel shell borders, dividers and close mark); without a
  kit they keep their native glyphs, except that the task-list in-progress glyph is
  unified to the native `◇` in `/todos` text as in the widget.
- AC-9: `pi-thoth-theme` accepts `icons: nerd | unicode | ascii`; default and
  malformed values stay Nerd; `unicode` yields the native glyph set, substituting a
  Unicode glyph (agent `⚙`) where the native fallback is itself a Nerd glyph.
- AC-10: `.thoth/specs/pi-ecosystem/spec.md` reflects the new retention, task list
  panel and icon-mode behavior; all touched packages pass their typecheck and
  tests, and the repository `check:ci`, `typecheck` and `test` pass.

## Clarifications

- Auto-cleanup is time-based for subagents/background, prompt-based for a
  completed task list (user, after research comparison).
- Durations: successes 10 s; failures until next prompt or manual close, minimum
  30 s (user approved proposal).
- History remains reachable (`/subagents`, `/bg`, widget summary); widget removal
  never removes history (user).
- `/bg` already opens the background history panel and is kept (user asked to
  reuse it; verified in source).
- Task-list detail card has no value; replace it with a full current-list panel also
  opened by `/todos` (user, with screenshots).
- Styling: all three widgets and panels; Nerd Font by default with a
  configuration option for a Unicode fallback (user via question tool).

## Decisions

- D1: Linger rules live in pi-core `panelSections` for prompt-retained sections
  and derive from `endedAt` and row state; constants `DONE_LINGER_MS = 10_000`
  and `FAILED_MIN_LINGER_MS = 30_000` are internal, not configurable.
- D2: The idle collapse is deferred while any row lingers so failed rows stay
  visible until the next prompt as approved.
- D3: Subagent terminal close is a provider-local, session-scoped dismissal set;
  background keeps its persisted `dismissedAt`.
- D4: pi-core exposes a read-only current prompt-epoch query to providers so the
  task list provider can hide a fully completed task list once a newer epoch starts.
- D5: The Unicode fallback extends the existing `pi-thoth-theme` `icons` setting
  with `unicode` instead of adding a new configuration file.
- D7: pi-core adds provider hooks for (a) items preferred to drop first on
  overflow with a provider-labelled exact count line (`+N done`) and (b)
  selectable section heading and summary lines that open the provider UI;
  U1 owns them with integration tests and U4 consumes the accepted contract.
- D6: The task list panel reuses `HistoryPanel<T>`; no new overlay framework.

## Durable deltas

- `MODIFIED pi-ecosystem` **Thoth Pi work panel** — `@thoth-agents/pi-core` MUST define a versioned work-panel contract with a process-wide provider registry; first-party packages that show live work above the editor (subagents, task list, background tasks) MUST register sections through it instead of installing their own above-editor widgets or panel navigation handlers; the host MUST install exactly one panel widget and one panel input listener per UI session, MUST render compact sections with one heading and counter each, one line per rendered item, a total height budget with exact `+N more` overflow counts, and semantic theme roles for status glyphs, names, secondary text and metrics; MUST let a provider mark items it prefers to drop first on overflow and label their exact dropped count with its own summary line (such as `+N done`), and MUST let a provider make its section heading and summary lines selectable so that Enter opens that provider's own UI; for sections that opt in to prompt retention the host MUST track a prompt epoch that advances when a run starts with exactly the observed text of an interactive or RPC prompt submitted while the agent was idle, MUST compare each run's starting prompt exactly with the retained text it observed for idle interactive or RPC submissions and MUST NOT advance the epoch for a run whose prompt matches none of them (including prompts queued while streaming), and MUST track the agent idle state; MUST render running items, done items until 10 seconds after they ended (at most the three most recent), and failed items (including cancelled) while they ended in the current epoch or until 30 seconds after they ended, whichever is later; MUST keep such a section expanded while any running or lingering item remains, MUST otherwise collapse the section, whether the agent is busy or idle, to one selectable summary line whose Enter opens that provider's history panel, and MUST refresh at each linger boundary; providers MUST let the user close a finished item, hiding it from the panel without removing it from history; the host MUST keep a single selection, MUST be focused with ← only from an empty, focused root editor with no overlay or dialog open and released with Esc, MUST leave unfocused ↑/↓ to the editor, MUST end the panel with a hint row listing only the actions available for the selected item, MUST let a provider with a custom open action show its own UI and otherwise show item details in a framed opaque card of stable size whose ↑/↓ stays within the opened section, MUST close that card only when another UI actually takes focus, and MUST expose a read-only focus-guard query so other key handlers in those packages consume nothing outside the focused root editor.
  - GIVEN subagents and background tasks opted in, 55 completed subagents from earlier prompts, and a busy prompt in which one subagent completes and one background task fails; WHEN 10 seconds pass, the agent becomes idle, and a new prompt runs 40 seconds after the failure; THEN the completed subagent row disappears after 10 seconds, the failed background row stays until that new prompt, afterwards Agents and Background each render as one summary line with session done/failed counts, Enter on the Agents summary opens the subagents history panel, and `/bg` still lists the failed task.
- `MODIFIED pi-ecosystem` **Thoth Pi task-list extension** — The Thoth Pi task-list package (published under the `@thoth-agents` scope as a fork of the juicesharp rpiv 2.12.0 task-list package) MUST register the session task-list tool with the upstream 2.12.0 schema and transition rules, MUST reconstruct the session list from the branch on session start, tree navigation and compaction, MUST publish its full session snapshot on the pi-core task-list state channel after each change and in answer to a request, MUST add the open tasks to the model context before each agent start when any exist using an API detected at runtime that degrades without failing on the minimum supported Pi, and MUST show only the current session's list through its pi-core work-panel section; that Todos section MUST list the current list with completed tasks marked and a done/total counter, dropping completed tasks first on overflow with an exact `+N done` line; Enter on any Todos row, heading or summary line and the `/todos` command when custom UI is available MUST open one panel built on the pi-core history panel shell with the full current list grouped by status, while `/todos` without custom UI keeps its text output; once every task is completed the list MUST remain shown until the next recognized prompt epoch and then disappear from the section and panel without altering task state.
  - GIVEN a session list with 3 of 7 tasks completed that is later compacted; WHEN the agent starts again and the user selects the Todos `+N done` line or runs `/todos`; THEN the list is reconstructed, the open tasks are present in the model context, a fresh state snapshot is published on the pi-core task-list state channel, and a panel lists all seven tasks grouped by status with a `3/7 completed` header.
- `ADDED pi-ecosystem` **Thoth theme icon modes** — `@thoth-agents/pi-thoth-theme` MUST accept an `icons` setting of `nerd`, `unicode` or `ascii`, MUST default to `nerd` when omitted or malformed, and in `unicode` mode MUST supply the native glyph set for semantic icons and status glyphs, substituting a Unicode glyph wherever the native fallback is itself a Nerd glyph.
  - GIVEN `pi-thoth-theme.json` with `"icons": "unicode"`; WHEN a work-panel row renders a completed status; THEN it shows the native Unicode completed glyph instead of the Nerd icon.

## Plan

Units (writes never overlap; dependencies are concrete outputs):

- U1 core retention (worker): `pi-core/src/work-panel-render.ts`,
  `work-panel-host.ts`, `work-panel-lifecycle.ts`, `work-panel.ts` and their
  tests. Implements AC-1/AC-2, D4 epoch query (existing `getWorkPanelLifecycle`) with
  lifecycle binding when only the task-list provider is active, plus D7 hooks;
  extends refresh scheduling to linger boundaries. Check: `pi-core` typecheck + `work-panel-retention`,
  `work-panel`, `work-panel-lifecycle` tests.
- U2 icon foundation (worker): `pi-core/src/render-kit.ts` (new semantic names:
  task-list status glyphs, selection marker, as needed by AC-8),
  `pi-thoth-theme/src/shared/{icons,config}.ts` + tests. Implements AC-9 and the
  icon names consumed by U3/U4. Check: `render-kit`, `icon-modes`, `icons` tests.
- U3 subagents + background providers and panels (worker, after U1 and U2):
  `pi-subagents/src/ui/{work-panel-provider,subagents-history-panel,theme}.ts`,
  `pi-background-tasks/src/{navigator-provider,history-panel}.ts` + tests.
  AC-3, AC-4, AC-8 for those surfaces.
- U4 task list widget, panel and `/todos` (designer, after U1 and U2):
  `TL/TLP.ts`, new task list panel module, `TL/TLC`,
  `TL/view/*` + tests. AC-5, AC-6, AC-7, AC-8 for task list.
- U5 spec + docs (root, after U3/U4): apply durable deltas at archive; update
  package READMEs for `/todos` panel and `icons: unicode`.
- U6 final verification (fresh Oracle) against record, diff and checks (AC-10).

Risks: idle-collapse change alters an existing spec scenario (covered by delta);
timer scheduling must stay unreferenced and bounded; task list epoch hiding must not
affect model-context reinjection; Windows CI job runs pi-packages tests.

## Tasks

- [x] AC-1: Linger rules and refresh scheduling in pi-core prompt retention
  - Outcome: done rows linger 10 s, failed rows current epoch or 30 s min, host refreshes at boundaries
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-render.ts, work-panel-host.ts, work-panel-lifecycle.ts, work-panel.ts; skills tdd, simplify
  - Inputs: Exploration evidence and D1, D2, D4
  - Dependencies: none
  - Output: updated pi-core sources, tests and exported epoch query
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/work-panel*.ts, pi-packages/pi-core/test/work-panel*.test.ts
  - Interface boundaries: WorkPanelProvider/row contract consumed by TL, pi-subagents, pi-background-tasks
  - Focused check and PASS evidence: pi-core typecheck and work-panel tests pass with new linger/idle cases using fake clocks at the 10 s and 30 s boundaries
  - Return milestone: tests green and contract change summarized
  - Stop / reassessment: contract change needed in a provider package or spec conflict
- [x] AC-2: Idle collapse deferred while rows linger
  - Outcome: section stays expanded while lingering rows exist, collapses afterwards
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-render.ts; skill tdd
  - Inputs: D2
  - Dependencies: none (same unit as AC-1 row above, same owner)
  - Output: retention tests covering idle with lingering failed row
  - Owner: thoth-worker
  - Writes: same as AC-1 unit
  - Interface boundaries: history summary/openHistory behavior
  - Focused check and PASS evidence: work-panel-retention tests pass
  - Return milestone: with AC-1 unit
  - Stop / reassessment: with AC-1 unit
- [x] AC-6: pi-core selectable heading/summary and drop-first overflow hooks
  - Outcome: providers can make heading and summary lines open their UI and label drop-first overflow with an exact count
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-render.ts, work-panel-host.ts, work-panel.ts; skill tdd
  - Inputs: D7 and plan-review evidence (work-panel-render.ts :35-36, :484-510)
  - Dependencies: none (same unit and owner as the AC-1 row)
  - Output: contract fields, host behavior and integration tests incl. mixed-section overflow and navigation
  - Owner: thoth-worker
  - Writes: same as AC-1 unit
  - Interface boundaries: WorkPanelProvider contract consumed by TL
  - Focused check and PASS evidence: work-panel and work-panel-focus tests pass with new hook cases
  - Return milestone: with AC-1 unit
  - Stop / reassessment: with AC-1 unit
- [x] AC-7: Lifecycle binding when only the task-list provider is active
  - Outcome: prompt epoch and idle state tracked even without prompt-retained providers
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-lifecycle.ts, work-panel-host.ts
  - Inputs: D4 and plan-review caution
  - Dependencies: none (same unit and owner as the AC-1 row)
  - Output: lifecycle wiring and standalone lifecycle tests
  - Owner: thoth-worker
  - Writes: same as AC-1 unit
  - Interface boundaries: getWorkPanelLifecycle
  - Focused check and PASS evidence: work-panel-lifecycle tests pass
  - Return milestone: with AC-1 unit
  - Stop / reassessment: with AC-1 unit
- [x] AC-9: Semantic icon names and theme unicode mode
  - Outcome: render-kit names for task list/selection glyphs; pi-thoth-theme icons nerd|unicode|ascii
  - Known entrypoints and skill paths: pi-packages/pi-core/src/render-kit.ts, pi-packages/pi-thoth-theme/src/shared/icons.ts, config.ts; skill tdd
  - Inputs: D5, AC-8 surfaces list
  - Dependencies: none
  - Output: new semantic names and unicode icon table with tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/render-kit.ts, pi-packages/pi-core/test/render-kit.test.ts, pi-packages/pi-thoth-theme/src/shared/*, pi-packages/pi-thoth-theme/test/icon*.test.ts
  - Interface boundaries: render-kit v1 optional icon lookup
  - Focused check and PASS evidence: render-kit, icon-modes, icons tests pass
  - Return milestone: tests green and names listed
  - Stop / reassessment: render-kit version bump required
- [x] AC-3: Manual close of finished subagent and background rows
  - Outcome: terminal close hides row from widget only
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/ui/work-panel-provider.ts, pi-packages/pi-background-tasks/src/navigator-provider.ts
  - Inputs: accepted AC-1 contract, D3
  - Dependencies: AC-1 unit
  - Output: provider changes and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/ui/*, pi-packages/pi-subagents/test/ui/*, pi-packages/pi-background-tasks/src/{navigator-provider,history-panel}*.ts
  - Interface boundaries: history panels unchanged in content
  - Focused check and PASS evidence: both packages typecheck and UI tests pass
  - Return milestone: with AC-4 and AC-8 provider surfaces
  - Stop / reassessment: history requires change
- [x] AC-4: Cancelled classified as failed in subagents and background
  - Outcome: consistent failure classification
  - Known entrypoints and skill paths: same as AC-3 unit
  - Inputs: Exploration
  - Dependencies: AC-1 unit
  - Output: mapping change with tests
  - Owner: thoth-worker
  - Writes: same as AC-3 unit
  - Interface boundaries: summary counts
  - Focused check and PASS evidence: navigator-provider and work-panel tests pass
  - Return milestone: with AC-3 unit
  - Stop / reassessment: with AC-3 unit
- [x] AC-8: Semantic icons in subagent and background widgets/panels
  - Outcome: no hard-coded glyph literals in those surfaces
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/ui/subagents-history-panel.ts, theme.ts, pi-packages/pi-background-tasks/src/history-panel.ts
  - Inputs: accepted AC-9 icon names
  - Dependencies: AC-9 unit
  - Output: styled panels with tests
  - Owner: thoth-worker (same unit as AC-3)
  - Writes: same as AC-3 unit
  - Interface boundaries: render-kit lookup
  - Focused check and PASS evidence: semantic-icons, history-panel tests pass
  - Return milestone: with AC-3 unit
  - Stop / reassessment: missing icon name
- [x] AC-5: Task-list widget shows progress with completed marked
  - Outcome: full current task list with done/total and completed-first overflow
  - Known entrypoints and skill paths: TL/TLP.ts, TL/view/format.ts; skill tdd
  - Inputs: accepted AC-1 unit outputs (linger rules, D7 hooks, epoch query) and AC-9 icon names
  - Dependencies: AC-1 unit, AC-9 unit
  - Output: provider changes and tests
  - Owner: thoth-designer
  - Writes: TL/** (excluding state/tool schema)
  - Interface boundaries: work-panel provider contract, task list state selectors
  - Focused check and PASS evidence: TL typecheck and TLP tests pass
  - Return milestone: with AC-6/AC-7
  - Stop / reassessment: state/tool schema change needed
- [x] AC-6: Task-list panel opened from widget and /todos
  - Outcome: one HistoryPanel-based panel of the current task list
  - Known entrypoints and skill paths: pi-packages/pi-core/src/history-panel.ts, TL/TLC
  - Inputs: D6
  - Dependencies: AC-1 unit, AC-9 unit
  - Output: panel module, provider open/openHistory, /todos change with tests
  - Owner: thoth-designer (same unit as AC-5)
  - Writes: same as AC-5 unit
  - Interface boundaries: ctx.ui.custom; no-UI fallback keeps text
  - Focused check and PASS evidence: TLC command and panel tests pass
  - Return milestone: with AC-5 unit
  - Stop / reassessment: pi-core shell change needed
- [x] AC-7: Fully completed task list hidden after next prompt
  - Outcome: section and panel hide after a newer epoch; state untouched
  - Known entrypoints and skill paths: TL/TLP.ts, pi-core epoch query
  - Inputs: accepted D4 query
  - Dependencies: AC-1 unit
  - Output: lifecycle tests
  - Owner: thoth-designer (same unit as AC-5)
  - Writes: same as AC-5 unit
  - Interface boundaries: model-context reinjection unchanged
  - Focused check and PASS evidence: TLP lifecycle tests pass
  - Return milestone: with AC-5 unit
  - Stop / reassessment: with AC-5 unit
- [x] AC-10: Docs, full checks and independent verification
  - Outcome: READMEs updated; check:ci, typecheck, test pass; fresh Oracle PASS
  - Known entrypoints and skill paths: package READMEs, skills/thoth-sdd/references/phases/verify.md
  - Inputs: all accepted units
  - Dependencies: AC-3, AC-5 units
  - Output: verification entries in this record
  - Owner: root (docs, checks), thoth-oracle (verification)
  - Writes: pi-packages/{TL,pi-thoth-theme}/README.md, this record
  - Interface boundaries: none
  - Focused check and PASS evidence: pnpm run check:ci, typecheck, test pass; Oracle PASS
  - Return milestone: Oracle verdict
  - Stop / reassessment: failing checks or Oracle findings

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW

Round 1 fresh Oracle REJECT (core hooks ownership; abbreviated MODIFIED deltas), repaired in record; round 2 fresh Oracle OKAY.
Cautions: verify real task-list-only lifecycle wiring; place the new panel module under a shipped path or update the package files allowlist.
**Implementation**: AUTHORIZED

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: PENDING
**Independent from implementer**: PENDING
**Verdict**: PENDING
**Reviewed record SHA-256**: PENDING

Round 1 fresh Oracle FAIL (AC-2/5/6/8/9 findings) repaired; round 2 fresh Oracle: AC-1..AC-9 PASS, AC-10 FAIL only on repository test gate (reviewed pre-Authorization SHA-256 fd2acb34fb45a6e50f120ba8bf366d04da8c19e58356a605669dd5b88022bc96).
Local Windows `pnpm test` red only on unrelated unchanged src/harness tests (git timeouts; reproducible EPERM in setup-codex-local.test.ts:185). User decision: close AC-10 with GitHub CI (Linux) green run on push/PR, then gate-only fresh Oracle, closeout and archive.

- AC-1: PENDING | check | evidence
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:857c33772cfc4b86fff3bae07118f3efc6dca578933a76bf68654dee4c0a9d67

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: PENDING
