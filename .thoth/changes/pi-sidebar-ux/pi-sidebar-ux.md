# Change: pi-sidebar-ux

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Current sidebar (`pi-packages/pi-sidebar/src/panels/sidebar.ts:24-46,203-283,400-424`): Session/Workspace titles are literal strings, cards use `renderPanelCard` without per-panel icons or colors; Workspace shows raw cwd, branch and a porcelain status string; source cards use the provider label and the shared row renderer; retention keeps running + 5 finished items and removes summary rows (`:57-94`). Plan/output caching and event-driven session data (`:140-260`, `session.ts:99-110,189-193`) implement the performance convention: no per-render session traversal.
- Workspace reader (`pi-sidebar/src/panels/workspace.ts:14-135`): branch from HEAD incl. worktrees/detached; single `git status --porcelain=v1 -b`; event-driven, 150 ms coalesced, serialized; no numstat or file counts.
- Theme path helper: `formatCwd(cwd, home)` (`pi-thoth-theme/src/status-line/layout.ts:48-59`, segments `:123-134`) abbreviates home with native `sep` (`~\` on Windows); not a public package export.
- Render kit (`pi-core/src/render-kit.ts:29-76,164-218`): card, collapse, cachedComponent, indicator, icon, statusGlyph, widgetHeading (accepts `{completed,total}`), treeRow; semantic icons incl. branch, folder, model, effort, context, cost, tokensIn/Out, agent, tool, taskInProgress, warning, box rails; nerd/unicode/ascii variants in `pi-thoth-theme/src/shared/icons.ts:16-95`. Theme roles (`pi-thoth-theme/themes/thoth.json`): accent, border*, success, error, warning, muted, dim, mdHeading, mdLink, mdCode, thinking*, toolDiffAdded/Removed, syntax*.
- Provider summaries (`pi-core/src/work-panel.ts:95-114,155,180`): `summary()` with running/failed/completed/total exists per provider (subagents merges persisted counts; background counts running/failed/succeeded; task list completed/total) but discovery (`listWorkPanelSources`, `getWorkPanelSourceRows`, `:217-280`) does not expose it.
- History rows: `tools ?` and `ctx ?` come from missing `runtime_metrics.toolUses`/`contextPercent` in persisted tasks (`pi-subagents/src/ui/work-panel-provider.ts:42-52`; `history.ts:766-770`).
- Row height flapping: metric groups are packed greedily by measured width (`pi-core/src/work-panel-render.ts:469-516`), with number formats whose width changes (`pi-subagents/src/render/tools/formatting.ts:46-65`: `9.9k`→`10.0k`→`10k`, `9s`→`10s`→`1m 05s`; ctx `9.9%`→`10.0%`; tok/s `99`→`100`). Probe `%TEMP%/thoth-row-flap-probe.ts`: at render width 59, tok/s 99→100→98 yields 2→3→2 lines; sidebar and host height budgets reflow rows below.
- Cost data: `thoth:subagents:state` task summaries carry displayName and usage.cost for in-memory tasks only; persisted session history stores display name and cost (`pi-subagents/src/history.ts:316,336-344,729,748-770`).
- Detail commands: `/subagents` (`pi-subagents/src/extension/subagents-extension.ts:290`), `/todos` (task-list extension command module, line 142), `/bg` (`pi-background-tasks/src/index.ts:57`). Provider-limits registry `listProviderLimits`/`subscribeProviderLimits` (`pi-core/src/provider-limits.ts:145-180`).
- Settings: `pi-core/src/panel-list-editor.ts:32-75` (filter, navigation, header/footer, custom actions, save/cancel) and `panel-host.ts:43-75`; `/sidebar panels` currently prints a list and has show/hide/up/down subcommands (`pi-sidebar/src/session.ts:315-352`, `config.ts:90-105`).
- References: pi-atelier a40b032 (rounded uppercase crowns, per-panel hue with tinted border, 12-cell label column, right-aligned values, context meter, `Changed N files +A −D` from `git status --porcelain=v2` + `git diff --numstat` vs HEAD tree, 250 ms event-driven refresh, F6 control center); gentle-shell 44f0007 (header counters, right-aligned degrading columns).

## Intent

Redesign the Pi sidebar after pi-atelier with gentle-shell header counters and degrading columns: themed per-panel chrome and icons, richer Session and Workspace panels, summarized work panels with detail commands, a subagent cost panel with a curves view, a settings overlay, honest history rows, and stable row heights in the shared work-panel renderer.

## Non-goals

- Interactive sidebar rows (focus, selection or actions inside the sidebar).
- Changing what the work panel above the editor shows beyond stable row heights and the AC-12 metric icons and cost.
- Periodic git polling; per-render session traversal.
- Native terminal image graphics for charts.
- Package version bumps and release.

## Acceptance

- AC-1: pi-core discovery exposes each source's provider summary (running, completed, failed, total, text) as data alongside its metadata, with revision semantics unchanged; covered by tests.
- AC-2: the shared work-panel renderer keeps a row's line count independent of digit-width changes of its metric values: packing decisions use each metric group's reserved width for its number format, so sweeping tokens, ctx, tok/s, tools, cost and elapsed across format boundaries within their reserved ranges never toggles the line count at any width from 20 to 140 columns, with and without a render kit; values beyond a reserved range may add width only monotonically; measured line counts equal rendered heights; the host and the sidebar use it; host changes are limited to line packing plus the AC-12 metric icons and cost (other text, styling and interactions unchanged) and affected host goldens are updated accordingly.
- AC-12: subagent metric labels become semantic icons in nerd and unicode modes, matching the editor status line (tools to the tool icon, up/down tokens to tokensIn/tokensOut, ctx to the context icon, tok/s to the throughput icon, elapsed to a new `elapsed` time icon, cost to the cost icon), with text labels kept in ascii mode; agent rows in both the work panel and the sidebar show the task cost.
- AC-3: sidebar chrome follows atelier with theme roles: each panel renders `╭─ <icon> TITLE … summary` with a bold uppercase title in its panel role, the border in that role dimmed with SGR dim, one inner space, one blank row between panels, a 12-cell label column with right-aligned values and ellipsis truncation, semantic icons in nerd/unicode/ascii modes; roles: Session accent, Workspace mdLink, Agents mdCode, Todos success, Background syntaxNumber, Cost warning.
- AC-4: Session shows model and provider, thinking level colored by thinking roles, a context meter (`█▏▎▍▌▋▊▉`, warning above 70%, error above 90%), cost with `(sub)` plus subagent cost, and a Limit row while a provider-limits entry is warning or rejected; all values from cached, event-driven data.
- AC-5: Workspace shows the path abbreviated with the same `formatCwd` the theme uses (moved to pi-core and consumed by both), branch with its icon, state Clean/Modified/Conflicts, `Changed N files +A −D` for tracked staged plus unstaged changes versus HEAD (empty tree when unborn), and Untracked/Binary/Conflicts rows only when non-zero; collected by `git status --porcelain=v2` and `git diff --numstat` against HEAD inside the existing event-driven, coalesced, serialized reader (no periodic polling).
- AC-6: Agents, Todos and Background panels show a header summary (Agents and Background as status-icon counts in their status roles, e.g. running spinner glyph + count, `✓` + done, `✗` + failed, omitting zero counts; Todos `completed/total`) from the discovered summary, rows through the shared renderer in a two-level column layout: the identity line (status, name, task) and, below it, every metric of the row (tools, tokens, context, speed, cost, elapsed, model·effort when available) with icons as columns aligned across rows using reserved widths, wrapping to a further aligned line when they do not fit and moving onto the identity line when the sidebar is wide enough; no metric is ever dropped and row height is stable, a footer with the detail command (`/subagents`, `/todos`, `/bg`), and a single title-plus-command line when empty.
- AC-7: persisted history rows omit missing fields and their separators instead of showing `?`.
- AC-8: Cost shows horizontal bars for the 5 most expensive subagent tasks of the session (live and persisted), labeled by task display name, scaled to the largest cost with eighth-block resolution (`#` in ascii), the session subagent total in the header, and a footer `/sidebar cost`; `/sidebar cost` opens an overlay with cumulative cost curves per task against elapsed time since each task's start, the x axis spanning 0 to the longest task duration; tasks without a display name are labeled by a short name derived from their task summary (the same summary the Agents row shows), never by agent type unless nothing else exists.
- AC-9: `/sidebar settings` opens an overlay to show/hide and reorder panels (Space, Shift+↑/↓), set startup mode and default width (←/→), saving to `thoth-sidebar.json` with Enter and cancelling with Esc.
- AC-10: height and width degradation follow the agreed rules (work panels apply the host widget's finished-row retention plus a cap of 3 finished rows per panel, most recent first with failures prioritized, active rows always shown; every visible panel first receives its title plus up to 2 lines and the remaining height is filled in order, panels that cannot get that minimum collapse to their title line with summary and never disappear; truncated panels show `+N more`; a truncated work panel keeps its detail command right-aligned on the `+N more` line; otherwise footers dropped before rows, panels reduced to a title line, label column 12→9 below 28, a one-line `/sidebar resize` hint below 24); the performance contract stays green (no session traversal per render, plan/output caching, shared 100 ms cadence).
- AC-11: specs and docs updated, and the local closeout gate (touched package tests and typechecks, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm run test:pi-extensions`) passes, followed by a live user check in both Pi modes.

## Clarifications

- References (user, 2026-10-09): pi-atelier first, then gentle-shell.
- Feedback (user, 2026-10-09): richer visuals; Workspace path like the editor border with modified-file count and +N/−N; header summaries such as `2/3`; detail commands in each work panel footer.
- Colors (user): one hue per panel from theme roles; border as the panel color dimmed with SGR dim.
- Diff scope (user): whole working tree versus HEAD like atelier.
- Cost (user): bars in the sidebar, curves in a dedicated view opened by `/sidebar cost`.
- From gentle-shell (user): header counters and degrading right-aligned columns only.
- Empty panels (user): Agents, Todos and Background stay visible as a single title-plus-command line when empty.
- Design proposal (user): approved as the base; git refresh stays event-driven (root correction of a 2 s poll in the proposal).
- Row flapping (user, live report): subagent rows toggle between 2 and 3 lines as numbers grow; fixed in this change.
- Host packing (user, 2026-10-09): accepted that some work-panel rows take one more line for stable height; only line packing changes.
- Agent row metrics (user, 2026-10-09, live check): the sidebar column layout left only elapsed visible; show all metrics with icons (tools, tokens, ctx, tok/s, elapsed, cost) on continuation lines like the work panel.
- Row layout (user, 2026-10-09): two-level layout — identity line on top, all metrics as aligned columns below (wrapping to another aligned line if needed), inline with the identity when wide.
- Header counters (user, 2026-10-09, live check): `1·22·1` is confusing; show icons with the counts.
- Sidebar cleanup (user, 2026-10-09): the Cost panel disappeared under growth; apply the widget retention plus a 3-finished-row cap, and guarantee each panel a minimum (title + 2 lines) before filling in order.
- Live check 2 (user, 2026-10-09): the curves overlay draws broken horizontal fragments instead of rising per-task curves; the truncated last panel lost its command after `+N more`; reduce the sidebar Cost panel to top 5. Root: derived labels strip the dispatch envelope (`PHASE: … / CHANGE: …`) so labels start with the meaningful text.
- Cost curves and labels (user, 2026-10-09, live check): the curves x axis must span the longest subagent duration (elapsed since each task's start), not absolute session time; tasks without a display name get a derived short name instead of the agent type.
- Metric icons and cost (user, 2026-10-09): agent rows (widget and sidebar) must show cost; use nerd-font icons instead of text labels like the editor status line (time icon for elapsed, context icon for ctx, dollar for cost) to save space.

## Decisions

- D-1: Discovery adds an optional `summary` field to `WorkPanelSource` (or a `getWorkPanelSourceSummary(id)` read) computed from `provider.summary()` with the same failure isolation as rows; the work-panel contract version stays 2 (additive optional field).
- D-2: Stable row height: metric groups carry an optional `key` (`tools`, `tokens`, `context`, `speed`, `cost`, `elapsed`, `model`) and a reserved width derived from the format's maximum within its range (tokens 5 cells, ctx 6, speed 3 digits, tools 3 digits, cost 6, elapsed 7, plus icon or label width); greedy packing compares reserved widths and rendered text is not padded; beyond-range values grow monotonically. The sidebar uses a two-level grid of keyed metrics (see AC-6 and Clarification "Row layout"; the earlier drop-by-priority column idea is superseded); the host keeps its greedy layout with stable packing.
- D-7: Semantic icon `elapsed` is added to the render-kit name union and the theme icon table (nerd clock glyph, unicode equivalent, ascii text label); metric rendering uses kit icons in nerd and unicode modes and text labels in ascii mode.
- D-3: `formatCwd` moves to pi-core (root export, no pi-tui dependency); the theme imports it with byte-identical output.
- D-4: Border tint = `\x1b[2m` + role color around border glyphs only, with reset; ascii mode uses `+ - |`.
- D-5: Cost panel data: `thoth:subagents:state` version 2 adds a bounded `history` array of up to 100 persisted session task summaries selected by highest cost (ordered by cost descending in the history query, before truncation), same strict allow-list; no production consumer of the state channel exists today (theme and sidebar consume usage), so tests migrate and the sidebar adds a state subscription and request; the cost-ranked read is a separate query and leaves recency-based history consumers unchanged. Curves use cost samples the sidebar records from state snapshots during the session; tasks without samples draw a straight segment from start to end cost.
- D-6: Settings overlay built on `createListEditor` + `openPanelOverlay`; width setting stores the default preferred width; existing `/sidebar panels` subcommands remain as text equivalents.

## Durable deltas

- `MODIFIED pi-ecosystem` **Thoth Pi sidebar** — `@thoth-agents/pi-sidebar` MUST render a read-only right sidebar in Pi fullscreen and regular modes through guarded, owner-checked layout adapters that fall back to no sidebar with a diagnostic, MUST offer Session, Workspace, work-panel source and Cost panels that can be shown, hidden and reordered with persisted order and visibility, including through a `/sidebar settings` overlay, MUST follow the pi-atelier width and auto-hide rules, offer resizing through `/sidebar resize` and fullscreen divider drag without a keyboard shortcut, MUST render atelier-style themed panel chrome with per-panel icons and colors, work-panel header summaries and detail-command footers, a Workspace path abbreviated like the editor border with changed-file and line counts versus HEAD, and a subagent cost bar panel with a `/sidebar cost` curves view, and MUST declare the work-panel sources it displays through a pi-core UI-preferences registry so the work panel neither renders nor selects nor focuses them while their sidebar panels are visible.
  - GIVEN a 160-column fullscreen session with a running subagent, two todos and modified files; WHEN the sidebar is visible with Agents, Todos, Workspace and Cost panels; THEN the transcript wraps at the remaining width, each panel shows its themed title with a summary, Agents and Todos show their detail commands, Workspace shows `~`-abbreviated path and `Changed N files +A −D`, Cost shows bars by task display name, the work panel no longer shows the absorbed sections or accepts ← focus for them, and hiding the sidebar restores them.
- `MODIFIED pi-ecosystem` **Discoverable work-panel registry** — pi-core MUST let consumers other than the host list registered work-panel sources with id, label, priority, contract version, a per-source monotonic revision that increases on registration and every provider change, and the provider's summary counts, subscribe to registration, removal and source changes, read each source's rows as data-only values bounded by a requested maximum and the source row cap, and invoke a source's open, history and close actions by source and row id; work-panel rows MUST contain no functions, and the work-panel contract version MUST be 2.
  - GIVEN the subagents, background-tasks and task-list sources registered; WHEN a consumer lists sources, subscribes and a subagent finishes; THEN it sees three sources with their summary counts, receives a change for the subagents source with a higher revision and updated counts, reads that source's rows as plain data within its bound, and can open the item through the action API.
- `ADDED pi-ecosystem` **Stable work-panel row height** — the shared work-panel renderer MUST decide multi-line metric wrapping from reserved widths of each metric's number format so a row's line count does not change when only the digit width of its metric values changes within each format's reserved range; values beyond a reserved range MAY only increase a row's line count, never toggle it back and forth.
  - GIVEN a running subagent row whose tokens, context percent, speed and elapsed values cross format boundaries such as 99→100 tok/s and 9s→10s; WHEN the work panel and the sidebar render it at any width; THEN while every value stays within its reserved range the row keeps the same number of lines and rows below it do not move.

- `MODIFIED pi-ecosystem` **Pi task state channels** — pi-subagents and pi-background-tasks MUST publish current-session task summary snapshots on versioned pi-core channels after each change and on request, containing only identity, status, agent/model/effort or kind, lifecycle times, usage/cost, exit and short preview fields, never prompts, transcripts, results, commands, environment or logs; the subagents snapshot MUST also carry a bounded set of the session's persisted task summaries selected by highest cost with the same fields; subagent usage MUST be published only on the pi-core usage channel and the Thoth status line MUST consume it from there.
  - GIVEN a resumed session with more than 100 persisted subagent tasks and running background tasks; WHEN a task changes state or a consumer requests snapshots; THEN both packages publish envelope snapshots for that session with summary fields only, the subagents snapshot includes the highest-cost persisted tasks up to its bound, and the status line shows cumulative subagent cost from the usage channel.

## Plan

Units (one writer per surface; pi-core unit first):

1. pi-core: discovery summary (D-1), stable packing + sidebar column option (D-2), `formatCwd` move (D-3) with theme migration, `thoth:subagents:state` v2 history contract (D-5). Tests: summary discovery, flapping sweep at widths 20..140 with and without kit, host goldens changed only by packing and AC-12 icons/cost, formatCwd parity, channel v2 validators, `elapsed` icon with native fallback for kits that omit it.
2. pi-subagents: provider rows with keyed metric groups, icons and cost (AC-12, D-2), history-row field omission (AC-7), cost-ranked history query and state publisher v2 (D-5). After 1.
3. pi-sidebar chrome + Session + Workspace (AC-3, AC-4, AC-5, git numstat in the reader). After 1. Owner: thoth-designer (material UI/UX per constitution principle 3).
4. pi-sidebar work panels + Cost + curves view + settings overlay + degradation (AC-6, AC-8, AC-9, AC-10). After 2 and 3 (same package and same designer writer as 3). Owner: thoth-designer.
5. Docs, gate, live check (AC-11).

Units 2 and 3 run in parallel after 1.

Risks: SGR dim rendering differences across terminals; glyph widths by font; git numstat cost on large repos (bounded by event-driven coalescing and a timeout); channel v2 break for any external state consumer (none known); visual regressions in the host (golden tests); performance regressions (performance suite).

## Tasks

- [x] AC-1: discovery exposes provider summaries
  - Outcome: summary available through discovery
  - Known entrypoints and skill paths: pi-packages/pi-core/src/{work-panel.ts,work-panel-render.ts,render-kit.ts,subagents.ts,index.ts}, test/work-panel-registry.test.ts; skills tdd, simplify
  - Inputs: Exploration; Decision D-1
  - Dependencies: none
  - Output: API and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/**, pi-packages/pi-core/test/**, pi-packages/pi-core/README.md, pi-packages/pi-thoth-theme/src/status-line/** (formatCwd import only) and src/shared/icons.ts (`elapsed` icon) and their tests
  - Interface boundaries: work-panel contract v2 compatibility
  - Focused check and PASS evidence: pi-core and theme suites and typechecks pass
  - Return milestone: core API summary with passing tests
  - Stop / reassessment: summary requires provider changes
- [x] AC-2: stable row height in the shared renderer
  - Outcome: line count independent of digit width; sidebar column option
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-render.ts:469-532,796-803; skills tdd
  - Inputs: Decision D-2; probe facts
  - Dependencies: AC-1 core unit (same writer)
  - Output: renderer change and sweep tests
  - Owner: thoth-worker
  - Writes: same as AC-1 core unit
  - Interface boundaries: host output unchanged beyond packing and AC-12 icons/cost
  - Focused check and PASS evidence: sweep test over widths 20..140 with/without kit shows constant line counts within reserved ranges and monotonic growth beyond; workPanelRowLineCount equals rendered height; host goldens differ only in line packing and AC-12 icons/cost
  - Return milestone: renderer with passing tests
  - Stop / reassessment: stable packing would change host text, styling or interactions beyond AC-12
- [x] AC-5: formatCwd shared through pi-core
  - Outcome: one path helper used by theme and sidebar
  - Known entrypoints and skill paths: pi-packages/pi-thoth-theme/src/status-line/layout.ts:48-59,123-134
  - Inputs: Decision D-3
  - Dependencies: AC-1 core unit (same writer)
  - Output: moved helper, theme migration, parity tests
  - Owner: thoth-worker
  - Writes: same as AC-1 core unit
  - Interface boundaries: theme footer and border output unchanged
  - Focused check and PASS evidence: theme suite unchanged; parity tests on Windows and POSIX separators
  - Return milestone: helper accepted
  - Stop / reassessment: none
- [x] AC-8: subagents state channel v2 with persisted history
  - Outcome: channel contract carries bounded history summaries
  - Known entrypoints and skill paths: pi-packages/pi-core/src/subagents.ts, pi-packages/pi-subagents/src/task-state-events.ts
  - Inputs: Decision D-5
  - Dependencies: AC-1 core unit (core part); publisher after core
  - Output: v2 contract, validators, publisher, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/subagents.ts + tests (core unit); pi-packages/pi-subagents/src/{task-state-events.ts,history.ts,manager.ts} (cost-ranked session history read) + tests (subagents unit)
  - Interface boundaries: strict allow-list; usage channel unchanged
  - Focused check and PASS evidence: validators reject extra fields; publisher includes up to 100 persisted summaries chosen by highest cost (a high-cost old task beyond the newest 100 is included)
  - Return milestone: channel v2 accepted
  - Stop / reassessment: an external consumer of v1 is found
- [x] AC-12: subagent rows with keyed metrics, icons and cost
  - Outcome: keyed metric groups with semantic icons (ascii labels) and a cost metric
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/ui/work-panel-provider.ts:34-81, src/render/tools/formatting.ts:46-65; pi-core render-kit semantic icons; pi-thoth-theme src/shared/icons.ts and status-line icon usage
  - Inputs: accepted core keyed-metric contract and `elapsed` icon (D-2, D-7)
  - Dependencies: AC-1 core unit accepted
  - Output: provider change and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/ui/work-panel-provider.ts and its tests
  - Interface boundaries: live row content otherwise unchanged
  - Focused check and PASS evidence: rows show icons in nerd and unicode modes and explicit text labels in ascii (not the ascii `*` tool glyph), `elapsed` falls back natively when a kit omits it, cost present for running (runtime usage) and finished tasks, keys assigned
  - Return milestone: provider change accepted
  - Stop / reassessment: cost unavailable for running tasks
- [x] AC-7: history rows omit missing fields
  - Outcome: no `?` in rows
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/ui/work-panel-provider.ts:42-52
  - Inputs: Exploration
  - Dependencies: AC-1 core unit accepted
  - Output: provider change and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/ui/work-panel-provider.ts and its tests
  - Interface boundaries: live rows unchanged beyond AC-12
  - Focused check and PASS evidence: persisted rows render without `?`; live rows unchanged beyond AC-12
  - Return milestone: provider change accepted
  - Stop / reassessment: none
- [x] AC-3: sidebar themed chrome
  - Outcome: atelier-style panel chrome with roles and icons
  - Known entrypoints and skill paths: pi-packages/pi-sidebar/src/panels/sidebar.ts, pi-core panel-frame.ts and render-kit.ts; skills tdd, simplify
  - Inputs: accepted core unit; Decision D-4
  - Dependencies: AC-1 core unit accepted
  - Output: chrome renderer and tests
  - Owner: thoth-designer
  - Writes: pi-packages/pi-sidebar/src/**, pi-packages/pi-sidebar/test/**
  - Interface boundaries: performance contract
  - Focused check and PASS evidence: render tests in nerd/unicode/ascii at widths 44 and 30; performance suite green
  - Return milestone: chrome accepted
  - Stop / reassessment: role missing from theme
- [x] AC-4: Session panel content
  - Outcome: model, thinking, context meter, cost, limit row
  - Known entrypoints and skill paths: pi-packages/pi-sidebar/src/panels/sidebar.ts:24-46, pi-core provider-limits.ts
  - Inputs: accepted chrome
  - Dependencies: AC-3 unit (same writer)
  - Output: panel and tests
  - Owner: thoth-designer
  - Writes: same as AC-3 unit
  - Interface boundaries: event-driven caches
  - Focused check and PASS evidence: meter thresholds, limit row appear/clear, zero session traversal per render
  - Return milestone: panel accepted
  - Stop / reassessment: none
- [x] AC-5: Workspace panel content and git numstat
  - Outcome: path, branch, state, changed counts
  - Known entrypoints and skill paths: pi-packages/pi-sidebar/src/panels/workspace.ts:14-135
  - Inputs: accepted formatCwd; Clarification on diff scope
  - Dependencies: AC-3 unit (same writer)
  - Output: reader extension, panel, tests
  - Owner: thoth-designer
  - Writes: same as AC-3 unit
  - Interface boundaries: event-driven, coalesced, serialized reader; git timeout
  - Focused check and PASS evidence: fixture repos for clean, modified, staged+unstaged, untracked, binary, conflict, unborn HEAD, non-git; no periodic timer
  - Return milestone: panel accepted
  - Stop / reassessment: numstat cost unacceptable on large repos
- [x] AC-6: work panels with summaries, columns, footers, empty line
  - Outcome: Agents, Todos, Background redesign
  - Known entrypoints and skill paths: pi-packages/pi-sidebar/src/panels/sidebar.ts:263-355
  - Inputs: accepted core summary and column option
  - Dependencies: AC-5 sidebar unit accepted (same writer)
  - Output: panels and tests
  - Owner: thoth-designer
  - Writes: same as AC-3 unit
  - Interface boundaries: absorption unchanged
  - Focused check and PASS evidence: summaries, degrading columns at 44/36/30, footer commands, empty single line
  - Return milestone: panels accepted
  - Stop / reassessment: none
- [x] AC-8: Cost panel and curves view
  - Outcome: top-10 bars and `/sidebar cost` overlay
  - Known entrypoints and skill paths: pi-sidebar, pi-core ./panel host
  - Inputs: accepted channel v2
  - Dependencies: AC-6 unit (same writer); channel v2 unit accepted
  - Output: panel, overlay, tests
  - Owner: thoth-designer
  - Writes: same as AC-3 unit
  - Interface boundaries: overlay focus rules
  - Focused check and PASS evidence: ranking incl. persisted tasks, labels by display name, scaling, ascii mode, curves from samples and fallback segments
  - Return milestone: cost accepted
  - Stop / reassessment: none
- [x] AC-9: settings overlay
  - Outcome: `/sidebar settings`
  - Known entrypoints and skill paths: pi-core panel-list-editor.ts, panel-host.ts; pi-sidebar config.ts, session.ts
  - Inputs: Decision D-6
  - Dependencies: AC-8 sidebar unit (same writer)
  - Output: overlay and tests
  - Owner: thoth-designer
  - Writes: same as AC-3 unit
  - Interface boundaries: config file preservation of unrecognized keys
  - Focused check and PASS evidence: toggle, reorder, startup, width, save/cancel tests
  - Return milestone: settings accepted
  - Stop / reassessment: list editor lacks reorder support without core change
- [x] AC-10: degradation rules and performance contract
  - Outcome: width/height rules; performance suite green
  - Known entrypoints and skill paths: pi-packages/pi-sidebar/src/panels/sidebar.ts, test/performance.test.ts
  - Inputs: accepted panels
  - Dependencies: AC-9 unit (same writer)
  - Output: tests
  - Owner: thoth-designer
  - Writes: same as AC-3 unit
  - Interface boundaries: performance convention
  - Focused check and PASS evidence: height/width rule tests; performance suite unchanged thresholds
  - Return milestone: rules accepted
  - Stop / reassessment: none
- [x] AC-11: docs, gate and live check
  - Outcome: docs and gate
  - Known entrypoints and skill paths: docs/agent routed docs, package READMEs
  - Inputs: accepted units
  - Dependencies: all units accepted
  - Output: docs and gate results
  - Owner: thoth-worker
  - Writes: docs and READMEs only
  - Interface boundaries: none
  - Focused check and PASS evidence: check:ci, typecheck, build, test:pi-extensions and touched suites pass
  - Return milestone: gate results
  - Stop / reassessment: unrelated environment failures reported

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW

Rounds 1-3 REJECT (host goldens vs reserved widths; cost-ranked history and channels delta; designer ownership; AC-12 vs host wording and sweep range; unqualified durable invariant) repaired; round 4 fresh Oracle [OKAY] 2026-10-09. Cautions: demonstrate stable wrapping, monotonic overflow and measured/rendered parity; glyph widths and legacy-kit fallbacks.
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
**Reviewed record SHA-256**: 2371fe24f4217eaaced83bda8d1227ad9ca9fda7b879fc21e0b2da57c7133f72

Live checks then revised AC-6 (status-icon header counters, two-level aligned metric grid) and AC-8 (elapsed-time curves axis, derived labels); round 3 FAIL (stale grid on re-exposure) repaired; round 4 fresh Oracle PASS on 2026-10-09 against sidebar-ux-manifest-4 (19 files).
Live check 2 revised AC-8 (top 5, curves rendering fix, envelope-stripped labels) and AC-10 (retention 10 s/30 s + cap 3, height fairness, `+N more` keeps command); round 5 FAIL (terminal envelope, bare-command fallback) repaired; round 6 fresh Oracle PASS on 2026-10-09 against sidebar-ux-manifest-7 (21 files). The status-line diamond gauge is a separate small user request verified in the same rounds.

Round 1 fresh Oracle FAIL (missing production model column, stale icons on finished rows after kit change, stale docs) repaired; round 2 fresh Oracle PASS on 2026-10-09 against frozen manifest sidebar-ux-manifest-2 (60 files). Live user check outstanding before archive.

- AC-1: PASS | registry tests (pi-core 957) | data-only isolated summaries; revisions and contract v2 unchanged
- AC-2: PASS | 20..140 sweeps + independent 99->100 tok/s and 9s->10s probes at 40/59 in all icon modes | stable heights, monotonic overflow, measured=rendered; host golden changes limited to packing and AC-12; 1,120 model-present/absent host comparisons identical
- AC-3: PASS | chrome tests | roles, uppercase titles, SGR dim isolation, spacing, label widths
- AC-4: PASS | Session tests | meter thresholds, thinking roles, cost with (sub), Limit row appears and clears
- AC-5: PASS | git fixture repos + formatCwd parity | porcelain v2 + numstat vs HEAD incl. unborn, binary, rename, conflicts, timeout; 250 ms event-only coalescing
- AC-6: PASS | real-provider integration probe | summaries, columns with model·effort degrading by width, detail-command footers, single-line empty panels
- AC-7: PASS | provider tests | missing history fields omitted, no `?`
- AC-8: PASS | channel/state/cost/curves tests | strict v2 allow-list, separate cost-ranked query, no live duplicates, ranked bars, curves overlay
- AC-9: PASS | settings/config tests | toggle, Shift+arrow reorder, startup and width, save/cancel, unknown keys preserved
- AC-10: PASS | degradation + performance suites (sidebar 186) | ordered budgeting, footer-first removal, narrow hint; no per-render session traversal
- AC-11: PASS | check:ci, typecheck, build, test:pi-extensions 12, package suites | docs accurate (250 ms, current triggers)
- AC-12: PASS | provider metric tests + late-kit probe (pi-subagents 1417/1 skipped) | icons in nerd/unicode, ascii labels, cost on running and finished rows; finished rows refresh on kit changes
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:a4865c5fdaf4f1bbf04fe1c7d42295fb29028bb19c317e5b12bef6bbf8daf841

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: PENDING
