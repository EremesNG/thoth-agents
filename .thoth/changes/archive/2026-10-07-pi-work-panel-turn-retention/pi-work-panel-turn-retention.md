# Change: pi-work-panel-turn-retention

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Subagents and background tasks both render as sections of the shared pi-core Work Panel (`pi-core/src/work-panel-host.ts:398` `createWorkPanelHost`, `work-panel-render.ts:144` `renderPanel`, budget `min(12, floor(rows/2))`, preferred `rowCap ?? 3` then spare space, `+N more`). Sections without rows are discarded (`work-panel-render.ts:47–75`).
- Subagents provider (`pi-subagents/src/ui/work-panel-provider.ts:16`) lists every current-session task from the in-memory manager (`manager.ts:630` `listActiveSessionTasks`); completed/failed entries are never pruned, so the section grows with session history (observed: 0 running · 55 completed · 3 failed, `+49 more`).
- Background provider (`pi-background-tasks/src/navigator-provider.ts:87–115`) hides terminal rows 30 s after `endedAt`, excludes dismissed tasks; registry is durable (`registry.ts`), maintenance deletes terminal tasks after 7 days.
- Navigation: ← focuses (empty root editor), ↑/↓ select, Enter opens provider UI or the shared detail card (`work-panel-detail.ts`), x twice closes. Subagents has a rich history overlay (`subagents-history-panel.ts:225` `SubagentsHistoryPanel`, Ctrl+, and `/subagents`) over all session tasks plus up to 100 terminal ones; it is typed to `SubagentTask` — frame/selector/viewport/key handling are generic mechanics, content/hydration are subagent-specific. Background tasks have no history panel, command or shortcut; the detail card only walks currently visible rows.
- Logs: retained up to 4 MiB; `pageTaskLog()` pages retained bytes (64 KiB hard page cap) with retention-loss metadata (`logs.ts:75–83`).
- Turn boundary (SDK `@earendil-works/pi-coding-agent` 1.0.2): `input` with `source` `"interactive"` (or `"rpc"`, matching `src/pi.ts:209–216`) marks a human prompt submission, including while streaming; subagent completion wake-ups use `sendMessage(triggerTurn)` and emit no `input`. `ctx.isIdle()` and `agent_settled` signal that no run/continuation remains; `agent_end` is not final.
- Event plumbing: `ensureWorkPanel(ctx)` builds the host from `ExtensionContext` only (`pi-core/src/work-panel.ts:239–254`), which has no `.on()`; subagents registers with `ctx` (`pi-subagents/src/extension/subagents-extension.ts:189–199`). Only `ExtensionAPI` (`pi.on`, `pi.events`) can subscribe; `pi.events` buses are injected, not a module singleton.
- Input confirmation (SDK 1.0.2): `input` handlers run sequentially and a later handler can return `handled` with no final-result event (`runner.js:1202–1237`). A handled input produces no `before_agent_start` and no user `message_start` (`agent-session.js:1502–1506,1654–1659`). Every accepted prompt, idle or queued steer/followUp, emits `message_start` with `message.role === 'user'` on delivery (`pi-agent-core agent-loop.js:43–56,116–119,192–196`); `pi.sendUserMessage` also emits `input` with `source: 'extension'` and the same user message events; `sendMessage` messages have role `custom`. User messages carry no origin.
- Specs: `.thoth/specs/pi-ecosystem/spec.md:149` "Thoth Pi work panel" requires one line per item and an always-rendered section; no spec fixes the 30 s expiry, row caps or history shortcuts. `multi-harness-agent-pack` "Run visible background Pi specialists" (line 445) stays satisfied (live metrics rows above input while running).

## Intent

Stop completed history from flooding the above-editor panel for subagents and background tasks: sections show live work plus only the current prompt's outcomes while the agent works, collapse to a one-line summary when idle, and offer navigable history panels with the same experience for both subagents and background tasks.

## Non-goals

- The task-list section keeps its current behavior (it already clears).
- No change to subagent or task persistence, registry retention, maintenance or the subagent history content model.
- No change to status-line footer, tool-result cards or completion messages.
- No package version bumps unless CI requires them (reported, not auto-incremented).

## Acceptance

- AC-1: pi-core exposes a session-scoped lifecycle bridge bound from `ExtensionAPI` by each opting-in extension, with exactly one effective subscription per session (deduplicated across bindings and disposed on session switch/shutdown); it advances a prompt epoch by an observed-text heuristic (not an origin guarantee): each non-blank `interactive`/`rpc` `input` submitted while the agent is idle records the text the bridge observes (which may already include earlier handlers' transforms) as a candidate (bounded to the most recent few, cleared on session switch/shutdown), and `before_agent_start` advances the epoch only when its `prompt` exactly equals a recorded candidate, which it then removes; runs whose prompt matches no candidate (prompts transformed or expanded after the bridge observed them, handled input with no later match, steer/followUp queued during streaming, extension `sendUserMessage` with distinct text, `sendMessage` wake-ups) never advance it, while any run whose prompt equals a retained candidate advances it, whatever its origin; it tracks an agent busy state from `agent_start`/`agent_settled` and `ctx.isIdle()`; providers opt in to turn retention per section, so sections that do not opt in (task list) render unchanged.
- AC-2: For an opted-in section while the agent is busy or the section has running items: running items always show; items that failed in the current prompt epoch all show; completed items from the current epoch show at most the 3 most recent; older terminal items do not render as rows; budget and `+N more` count only rows eligible to render.
- AC-3: For an opted-in section with no running items while the agent is idle, the section renders as exactly one selectable summary line (heading glyph, label, session done/failed counts), e.g. `▲ Agents · 4 done · 1 failed`; ← focuses it, ↑/↓ moves between section lines and items, Enter on a summary line opens that provider's history panel, →/Esc releases focus; hint row lists only the available actions.
- AC-4: pi-core exposes a generic history panel shell (frame, wide split list / narrow selector strip, content viewport with ↑/↓ PgUp/PgDn Home/End scrolling, ←/→ item selection, injected keybindings, mouse wheel, close keys) driven by an item adapter; the subagents history panel uses it with no user-visible behavior change (existing panel tests pass unchanged in assertions).
- AC-5: pi-background-tasks registers a history panel built on the shell, listing all current-session tasks including expired and dismissed ones (newest first), whose content shows status, command, timing/exit/error metadata and the retained log paged through `pageTaskLog` with a visible notice when output was lost to retention; opened from the collapsed summary line, from Enter on a background row (selecting that task), and from a `/bg` command; running tasks can be stopped from it (x twice).
- AC-6: The background section no longer uses the 30-second expiry; its rows follow AC-2/AC-3. Dismissed tasks stay out of panel rows but remain in the history panel.
- AC-7: The subagents section opts in to AC-2/AC-3; Enter on a subagent summary line opens the existing history panel (same as Ctrl+, / `/subagents`), Enter on a subagent row keeps its current behavior.
- AC-8: Package typechecks and tests pass for pi-core, pi-subagents, pi-background-tasks, the task-list package and pi-thoth-theme; root `pnpm run check:ci`, `pnpm run typecheck` and `pnpm test` pass; the pi-ecosystem spec deltas are recorded.

## Clarifications

- Policy: user chose "por turno + colapso en reposo" (turn-scoped rows, max 3 completed, failed until next prompt, one-line idle summary with history navigation).
- Scope: user chose subagents and background tasks only; task-list stays unchanged.
- Collapsed navigation: user accepted ← focus, ↑/↓ across section lines, Enter opens the section history, →/Esc leaves.
- Background history: user chose a panel in the subagents history style with full session history, own command.
- 30 s expiry: user chose to replace it with the turn policy.

## Decisions

- Prompt boundary = observed-text heuristic (the repository's language-anchor precedent in `src/pi.ts:209–229`). The SDK awaits input handlers, authentication and compaction before `before_agent_start` and does not serialize concurrent `prompt()`/RPC/`sendUserMessage` calls, so event order cannot correlate a `before_agent_start` with an input; any count/reset rule can be defeated by a delayed call surviving a reset. Rule: every non-blank `interactive`/`rpc` input while `ctx.isIdle()` records the text the bridge observes as a candidate (keep the latest few, clear on session switch/shutdown); at `before_agent_start` advance only when `event.prompt` exactly equals a recorded candidate and remove it. The SDK passes plain prompt text unchanged to `before_agent_start` (`agent-session.js:1509–1555`), so ordinary prompts advance. Accepted, documented limits: earlier handlers' transforms are invisible to the bridge, so a prompt transformed before the bridge sees it still advances; any run (including an extension run or a different submission transformed into the same text) whose prompt equals a retained candidate advances; prompts transformed or expanded after observation, and prompts typed while streaming (steer/followUp), do not advance. Rationale: the epoch only controls which rows are visible; a missed advance keeps earlier rows visible until the next matching idle prompt, and a coincidental-text advance only hides earlier rows one prompt early.
- Event bridge: pi-core exports a binder taking `ExtensionAPI` (and the session) that opting-in extensions call on activation; the first live binding per session is the only effective subscriber, later bindings are inert, and disposal on session switch/shutdown lets a fresh binding take over.
- Busy = `!ctx.isIdle()` refreshed on `agent_start`/`agent_settled` (not `agent_end`).
- Policy lives in pi-core (one host owns the turn/busy state); providers only declare opt-in and supply per-item `state` (running/failed/done) and `endedAt`.
- History panel shell is extracted into pi-core and the subagents panel migrates onto it so both panels share mechanics and keys (user asked for the same experience).
- Version bumps are not scheduled: `scripts/check-pi-version-bumps.mjs` is warn-only.
- Background history command is `/bg`; no default shortcut is added (avoid keybinding conflicts); Ctrl+, stays with subagents.
- Done/failed counts on the summary line are session totals; `timed_out` counts as failed (existing semantics).

## Durable deltas

- `MODIFIED pi-ecosystem` **Thoth Pi work panel** — `@thoth-agents/pi-core` MUST define a versioned work-panel contract with a process-wide provider registry; first-party packages that show live work above the editor (subagents, task list, background tasks) MUST register sections through it instead of installing their own above-editor widgets or panel navigation handlers; the host MUST install exactly one panel widget and one panel input listener per UI session, MUST render compact sections with one heading and counter each, one line per rendered item, a total height budget with exact `+N more` overflow counts, and semantic theme roles for status glyphs, names, secondary text and metrics; for sections that opt in to prompt retention the host MUST track a prompt epoch that advances when a run starts with exactly the observed text of an interactive or RPC prompt submitted while the agent was idle, MUST compare each run's starting prompt exactly with the retained text it observed for idle interactive or RPC submissions and MUST NOT advance the epoch for a run whose prompt matches none of them (including prompts queued while streaming), and MUST track the agent idle state; MUST render running items, items failed in the current epoch and at most the three most recent items completed in the current epoch while the agent is busy or the section has running items, and MUST otherwise collapse the section to one selectable summary line whose Enter opens that provider's history panel; the host MUST keep a single selection, MUST be focused with ← only from an empty, focused root editor with no overlay or dialog open and released with Esc, MUST leave unfocused ↑/↓ to the editor, MUST end the panel with a hint row listing only the actions available for the selected item, MUST let a provider with a custom open action show its own UI and otherwise show item details in a framed opaque card of stable size whose ↑/↓ stays within the opened section, MUST close that card only when another UI actually takes focus, and MUST expose a read-only focus-guard query so other key handlers in those packages consume nothing outside the focused root editor.
  - GIVEN subagents and background tasks opted in, 55 completed subagents from earlier prompts and an idle agent; WHEN the user presses ← on an empty editor, moves with ↓ to the Agents summary line and presses Enter; THEN Agents and Background each render as one summary line with session done/failed counts, and the subagents history panel opens; and while a later prompt is busy, only running items, that prompt's failed items and its three most recent completed items render as rows .
- `ADDED pi-ecosystem` **Background task history panel** — `@thoth-agents/pi-background-tasks` MUST provide a history panel built on the pi-core history panel shell that lists every current-session task, including expired and dismissed ones, newest first, and shows each task's status, command, timing, exit or error metadata and its retained log paged in bounded pages with a visible notice when earlier output was lost to retention; it MUST open from the Background summary line, from Enter on a background row with that task selected, and from the `/bg` command, and MUST let the user stop a running task with a confirmed close action.
  - GIVEN a session with a dismissed completed task and a running task; WHEN the user runs `/bg`; THEN both tasks are listed newest first, selecting the completed task shows its metadata and paged log, and pressing x twice on the running task stops it .

## Plan

1. **pi-core retention + collapse (U1).** Extend `WorkPanelProvider` (versioned contract in `pi-core/src/work-panel.ts`) with opt-in `retention: 'prompt'`, per-item `state`/`endedAt`, and `openHistory()`. A new `pi-core/src/work-panel-lifecycle.ts` bridge (bound from `ExtensionAPI`, deduplicated per session) tracks the run-start epoch (idle human `input` texts matched exactly by `before_agent_start` prompt) and busy state (`agent_start`/`agent_settled` + `ctx.isIdle()`) and feeds the host; renderer (`work-panel-render.ts`) filters eligible items, caps completed at 3, renders a selectable summary line when collapsed; input handling routes Enter on summary to `openHistory()`. Non-opted providers (task list) unchanged. Tests: `pi-core/test/work-panel*.test.ts` for epoch advance on an idle interactive/rpc prompt whose `before_agent_start` prompt matches the observed text (including text transformed by an earlier handler before the bridge observed it, and a retained handled candidate matched by a later run with the same text); no advance for later-handler `handled` input without a later matching run, steer/followUp queued during streaming (including extension steer before a human follow-up), extension `sendUserMessage` with distinct text/`sendMessage`, text transformed or expanded after observation, and the reproduced interleavings (extension input → human input handled → extension `before_agent_start`; human input → extension input → `before_agent_start`; a prompt's `before_agent_start` overtaking another waiting call; extension A delayed in a handler while extension B starts, then human C handled, then A's `before_agent_start`); candidate bound and session clearing; binding dedupe and disposal, busy/idle collapse, caps, `+N more`, navigation/hint, task-list unchanged.
2. **pi-core history panel shell (U2).** New module (e.g. `pi-core/src/history-panel.ts`) extracted from `pi-subagents/src/ui/subagents-history-panel.ts` generic mechanics and `panel-input.ts` key/mouse classification; adapter interface: `items()`, `renderItemLabel`, `renderContent(item, width)`, optional `close(item)`, refresh. Tests in `pi-core/test/history-panel.test.ts`.
3. **pi-subagents migration + opt-in (U3, after U1, U2).** `SubagentsHistoryPanel` uses the shell keeping content/hydration; provider sets `retention: 'prompt'`, item state/endedAt, `openHistory` → existing opener. Existing `test/ui/panel.test.ts` and `widget.test.ts` assertions unchanged except row-visibility expectations driven by the new policy.
4. **pi-background-tasks history + opt-in (U4, after U1, U2).** New history adapter/panel over registry session metas (including dismissed/expired) with `pageTaskLog` content; `/bg` command; row Enter opens panel selecting task; remove 30 s expiry; provider opts in. Tests: `navigator-provider.test.ts`, `work-panel.test.ts`, new history panel test.
5. **Spec + docs (U5, root, after U3/U4).** Apply README/usage doc updates in the owning packages during U3/U4; spec deltas are applied at archive.

U1 and U2 run in parallel on disjoint pi-core files; U1 is the only writer of `pi-core/src/index.ts`. After both are accepted, root adds the one history-panel export line to `pi-core/src/index.ts` (mechanical), then U3 and U4 run in parallel.

Implementation note: re-exporting the history panel from `pi-core/src/index.ts` broke `test/work-panel-optional-peers.test.ts` (the public entry must import without the optional `@earendil-works/pi-tui` peer, and the shell imports it statically). Root instead exposed it as the subpath export `@thoth-agents/pi-core/history-panel` (`pi-core/package.json` exports, asserted in `pi-core/test/package.test.ts`); U3/U4 import from that subpath.

## Tasks

- [x] AC-1: pi-core prompt epoch, busy state and per-section opt-in retention
  - Outcome: host tracks epoch/busy; opted-in sections filter rows; non-opted sections unchanged
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel.ts, work-panel-host.ts, work-panel-render.ts, test/work-panel.test.ts; skills tdd, simplify
  - Inputs: Exploration and Decisions of this record
  - Dependencies: none
  - Output: extended versioned provider contract and host/render behavior
  - Owner: thoth-worker (U1)
  - Writes: pi-packages/pi-core/src/work-panel*.ts (including new work-panel-lifecycle.ts), pi-packages/pi-core/src/index.ts (sole writer in U1/U2; U2 adds no index.ts edits), pi-packages/pi-core/test/work-panel*.test.ts, pi-packages/pi-core/README.md
  - Interface boundaries: WorkPanelProvider contract consumed by pi-subagents, pi-background-tasks and the task-list package
  - Focused check and PASS evidence: pi-core typecheck + tests pass; task-list package tests pass unchanged
  - Return milestone: contract and host tests green
  - Stop / reassessment: SDK event unavailable in host context or contract change breaks the task-list package
- [x] AC-2: rendering of running, current-epoch failed and up to 3 recent completed items
  - Outcome: renderer eligibility, cap and `+N more` over eligible rows
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-render.ts; skills tdd
  - Inputs: U1 contract
  - Dependencies: none (same U1 unit)
  - Output: render tests for busy-state rows
  - Owner: thoth-worker (U1)
  - Writes: same as U1
  - Interface boundaries: render budget shared across sections
  - Focused check and PASS evidence: work-panel render tests pass
  - Return milestone: with U1
  - Stop / reassessment: budget allocation conflicts with spec
- [x] AC-3: idle collapse to a selectable summary line with Enter → openHistory and hint row
  - Outcome: collapsed section rendering and navigation
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-host.ts, work-panel-render.ts, test/work-panel-focus.test.ts
  - Inputs: U1 contract
  - Dependencies: none (same U1 unit)
  - Output: focus/navigation tests on summary lines
  - Owner: thoth-worker (U1)
  - Writes: same as U1
  - Interface boundaries: focus guard, hint row
  - Focused check and PASS evidence: focus/navigation tests pass
  - Return milestone: with U1
  - Stop / reassessment: summary line conflicts with single-selection model
- [x] AC-4: pi-core generic history panel shell
  - Outcome: reusable shell with adapter, keys, mouse, layouts
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/ui/subagents-history-panel.ts:225–970, panel-input.ts, pi-packages/pi-core/src; skills tdd, simplify
  - Inputs: Exploration of this record
  - Dependencies: none
  - Output: pi-core/src/history-panel.ts (+ export) and tests
  - Owner: thoth-worker (U2)
  - Writes: pi-packages/pi-core/src/history-panel*.ts, no edit to pi-packages/pi-core/src/index.ts (root adds the history-panel export line after U1 and U2 are accepted, before U3/U4 start), pi-packages/pi-core/test/history-panel*.test.ts, pi-packages/pi-core/package.json exports if needed
  - Interface boundaries: must not touch work-panel files owned by U1
  - Focused check and PASS evidence: pi-core typecheck + history-panel tests pass
  - Return milestone: shell API and tests green
  - Stop / reassessment: generic extraction requires subagent-specific types
- [x] AC-4: subagents history panel migrated onto the shell without behavior change
  - Outcome: SubagentsHistoryPanel uses shell; panel tests unchanged
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/ui/subagents-history-panel.ts, panel-overlay.ts, panel-input.ts, test/ui/panel.test.ts
  - Inputs: accepted U2 shell
  - Dependencies: U2
  - Output: migrated panel
  - Owner: thoth-worker (U3)
  - Writes: pi-packages/pi-subagents/src/ui/**, pi-packages/pi-subagents/src/extension/subagents-extension.ts (lifecycle binding), pi-packages/pi-subagents/test/ui/**, pi-packages/pi-subagents/test/subagents.test.ts, pi-packages/pi-subagents/README.md
  - Interface boundaries: history shortcut/command unchanged
  - Focused check and PASS evidence: pi-subagents typecheck + full tests pass
  - Return milestone: migration + opt-in green
  - Stop / reassessment: shell lacks a needed capability (return to root)
- [x] AC-7: subagents section opts in to prompt retention and summary Enter opens history
  - Outcome: provider declares retention, state, endedAt, openHistory
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/ui/work-panel-provider.ts, test/ui/widget.test.ts, test/subagents.test.ts
  - Inputs: accepted U1 contract
  - Dependencies: U1
  - Output: opted-in provider and tests
  - Owner: thoth-worker (U3)
  - Writes: same as U3
  - Interface boundaries: WorkPanelProvider contract
  - Focused check and PASS evidence: widget tests for busy/idle rendering pass
  - Return milestone: with U3
  - Stop / reassessment: contract mismatch
- [x] AC-5: background tasks history panel with paged logs and /bg
  - Outcome: panel over all session tasks incl. dismissed/expired; entry points; stop action
  - Known entrypoints and skill paths: pi-packages/pi-background-tasks/src/navigator-provider.ts, registry.ts, logs.ts, shared-log-utils.ts, index.ts; skills tdd, simplify
  - Inputs: accepted U1 and U2
  - Dependencies: U1, U2
  - Output: history adapter/panel, command, tests
  - Owner: thoth-worker (U4)
  - Writes: pi-packages/pi-background-tasks/src/** (including index.ts lifecycle binding), pi-packages/pi-background-tasks/README.md, pi-packages/pi-background-tasks/docs/usage.md
  - Interface boundaries: registry and log paging APIs unchanged; tool outputs unchanged
  - Focused check and PASS evidence: package typecheck + tests (incl. new history panel tests) pass
  - Return milestone: panel, opt-in and expiry removal green
  - Stop / reassessment: log paging cannot run synchronously in render (return design question)
- [x] AC-6: background section uses prompt retention instead of 30 s expiry
  - Outcome: expiry removed, opt-in, dismissed hidden from rows only
  - Known entrypoints and skill paths: pi-packages/pi-background-tasks/src/navigator-provider.ts, navigator-provider.test.ts
  - Inputs: accepted U1 contract
  - Dependencies: U1
  - Output: updated provider and tests
  - Owner: thoth-worker (U4)
  - Writes: same as U4
  - Interface boundaries: WorkPanelProvider contract
  - Focused check and PASS evidence: navigator-provider tests pass
  - Return milestone: with U4
  - Stop / reassessment: contract mismatch
- [x] AC-8: full verification and spec deltas
  - Outcome: all package and root checks green; record verification complete
  - Known entrypoints and skill paths: package.json scripts; C:\DEV\Proyectos\Webstorm\thoth-agents\skills\thoth-sdd\scripts\validate.mjs
  - Inputs: accepted U1–U4
  - Dependencies: U1, U2, U3, U4
  - Output: check results; fresh Oracle verdict
  - Owner: root + thoth-oracle
  - Writes: this record
  - Interface boundaries: none
  - Focused check and PASS evidence: check:ci, typecheck, test, pi-packages typecheck/tests pass; Oracle PASS
  - Return milestone: closeout
  - Stop / reassessment: any failing check

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review: user selected Review plan with Oracle; rounds 1–5 [REJECT] repaired in this record; fresh round-6 Oracle returned [OKAY].

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: d78e0d53ee0fa67634b1c6500c5b7e56bc6a211eca19498c6535c84666e9da86

- AC-1: PASS | pi-core work-panel lifecycle tests (pnpm test in pi-packages/pi-core) | 400 passed incl. observed-text epoch, interleavings, dedupe/disposal
- AC-2: PASS | pi-core work-panel render tests | busy rows, 3-completed cap and eligible `+N more` covered; 400 passed
- AC-3: PASS | pi-core work-panel focus/navigation tests | summary line, Enter→openHistory, hint and Esc/→ release covered; 400 passed
- AC-4: PASS | pi-core history-panel tests + pi-subagents panel tests | shell tests green; 78 subagents panel assertions unchanged; pi-subagents 1282 passed, 1 skipped
- AC-5: PASS | pi-background-tasks history panel, /bg, paging and stop tests | 541 passed, 4 skipped
- AC-6: PASS | pi-background-tasks navigator-provider tests | 30 s expiry removed, prompt retention rows; 541 passed
- AC-7: PASS | pi-subagents widget/extension tests | opt-in rows and summary→history; 1282 passed
- AC-8: PASS | root check:ci, typecheck, pnpm test; package typecheck+tests for pi-core, pi-subagents, pi-background-tasks, pi-todo, pi-thoth-theme | check:ci 0 errors (714 pre-existing warnings), typecheck clean, root 1577 passed; packages 400/1282/541/200/1033 passed
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:c2bccc619a03b77aeea49838eb187eeccd8591dfe86e377535c79d15fd89d747

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
