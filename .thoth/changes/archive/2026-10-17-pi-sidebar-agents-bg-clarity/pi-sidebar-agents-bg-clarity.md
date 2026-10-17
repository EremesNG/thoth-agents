# Change: pi-sidebar-agents-bg-clarity

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Ecosystem survey (librarian, 2026-10-17): no de-facto Pi standard for subagent/background lists. Pi docs give only `ctx.ui` widget/TUI primitives. Packages converge on compact panel + richer overlay, elapsed/activity, themed glyphs, bounded rows with `+N more`, and diverge on placement, ordering, retention and failure taxonomy. tintinweb/pi-subagents keeps errors 2 turns vs completions 1; gentle-shell uses a fixed 50-column rail (`lib/shell-sidebar-layout.ts` L8-18) and 1-line agent rows dropping task text → model/effort → tokens → cost, elapsed last; pi-atelier (commit 3b42825) colors each row element by semantic role (status glyph + elapsed by state, name dim, summary primary when active / muted when done, input blue, output purple, cache cyan, cost orange, separators dim, panel crown in panel role with tinted border).
- Current sidebar (`pi-packages/pi-sidebar/src/panels/sidebar.ts`): `retainedRows` (:43-81) keeps all active + 3 terminal rows, failure-class first, no TTL; header summary (:92-144) counts running/completed/failed from provider totals; `sourcePanel` forces `metricLayout:'grid'` (:413) so every Agents row wraps to 3 lines (`workPanelRowLineCount` :428); render cutoff 24 (:89,:459,:626).
- Agents (`pi-packages/pi-subagents`): manager sorts by `last_activity_at ?? started_at ?? created_at` desc (`src/manager.ts:89-107`), so active rows swap whenever activity changes (user-reported, screenshots 2026-10-17). Provider discovery caps terminals at 5 by completion time (`src/ui/work-panel-provider.ts:197-219`); does not populate `sortStartedAt`; maps cancelled/interrupted to failed state and counts them as failed (:22-25, :275). Status union: queued, running, stopping, completed, failed, cancelled, interrupted (`src/types.ts:4-11`); timeouts are `failed` with `error_metadata.category: 'total_timeout'` (`src/manager.ts:2361-2372`). `created_at` is preserved across continuation (`src/manager.ts:1698-1715`). Discovery receives persisted history capped at 100 by recent activity (`src/extension/subagents-extension.ts:322-325`, `src/manager.ts:708-715,2432-2448`, `src/history.ts:650-662`), so newer launches can be excluded when older tasks are continued (plan review round 1).
- Background (`pi-packages/pi-background-tasks`): statuses running/succeeded/failed/timed_out/cancelled (`src/types.ts:5-10`); `timed_out` and `cancelled` render as failed and count as failed (`src/navigator-provider.ts:147-149,215-232`); `isDeclaredExpectedExit(meta, exitCode)` (`src/failures.ts:57-58`) is metadata-only; recovery/supersession live only in failure journals (`src/shared-failure-observations.ts:44-46,254-274`), which the provider already reads per row in `factsForMeta` (:267-270) at snapshot time (per registry revision, not per render; perf rule of commit f616fd2). Registry sorts `startedAt` desc without tie-breaker (`src/registry.ts:229-235`).
- Width: default 44, clamp 28-72 (`pi-sidebar/src/layout/adapter.ts:29-33`, `src/controls.ts:8`, `src/settings.ts:136-140`, `src/config.ts:44-73`).
- The above-editor host uses greedy metric packing; the sidebar forces grid (`docs/agent/harness-packaging.md:358-363`). Background snapshots refresh per animation frame for animated sources and source listing calls provider summaries on each planning call (`pi-sidebar/src/panels/sidebar.ts:378-415,459-473`, `pi-core/src/work-panel.ts:244-284`).
- Status registries: `RenderStatus` and native maps in `pi-core/src/render-kit.ts:14-26,323-365`, work-panel glyphs/roles and `renderStatuses` whitelist in `pi-core/src/work-panel-render.ts:323-351,1279-1301`, test kit `pi-core/src/testing.ts:21-34`; theme `pi-thoth-theme/src/shared/icons.ts:11-99`, `src/render-kit/index.ts:31-59`. Above-editor work-panel host shares providers and status maps (`pi-core/src/work-panel-host.ts`).

## Intent

Make the sidebar Agents and Background panels unambiguous and calm: rows appear in launch order and never move, finished items follow one uniform retention rule, non-failures never look like failures, Agents rows take one line with width-responsive columns, rows use atelier-style per-element theme colors, and the sidebar defaults to 50 columns with a 36-column minimum.

## Non-goals

- The above-editor work panel's timed retention (10s success / epoch-or-30s failure) and the `/subagents` and `/bg` history overlays' ordering stay unchanged; they only inherit the new status glyphs/labels and summary counts.
- No change to Background row layout beyond status taxonomy and colors.
- No per-agent distinct hue palette for rows (cost chart keeps its existing colors).
- No new persisted metadata flags or extra per-render journal reads.
- No package version bumps.

## Acceptance

- AC-1: Agents and Background sidebar rows are ordered by launch (Agents `created_at`, Background `startedAt` with stable id tie-breaker), oldest at top; a running row never changes position because of activity, completion or failure.
- AC-2: Sidebar retention shows every active row plus the 3 most recently launched finished rows, with one rule for every terminal status (no failure-first priority, no TTL); when height is short, the oldest finished rows are hidden first, then the oldest active rows, and the `+N more` line counts hidden retained rows.
- AC-3: Status taxonomy distinguishes non-failures by status glyph: cancelled/interrupted render a muted ■ and never count as ✗; timed out (Agents `total_timeout`, Background `timed_out`) renders its own ◷ glyph and counts as ✗; a Background non-zero exit declared in `expected_exit_codes` renders a non-red expected-exit glyph and counts as done unless an unresolved incident exists; a Background failure whose journal has no unresolved incident and at least one recovered or superseded incident renders as resolved (↻, muted) and is not counted as ✗; new glyphs resolve through the render kit with Unicode, Nerd and ASCII fallbacks. Agents rows carry no status label (icon plus task summary; detail lives in `/subagents`); Background rows keep their status text as ordinary truncatable summary; elapsed is never dropped for a status label.
- AC-4: Panel header summaries show running ◐, queued ○ (when the panel is at least 36 columns), done ✓, actionable failures ✗ and cancelled ■ (muted), omitting zero counts.
- AC-5: Agents sidebar rows render on exactly one line at every supported width, dropping metric columns panel-wide by measured width in the order speed → context → tools → cost → model (10 cells) → tokens, then truncating the summary, keeping elapsed and name; row line count stays stable as metric digits change.
- AC-6: Sidebar rows use atelier-style per-element theme roles: status glyph and elapsed colored by state (running accent/working, done success with dim elapsed, failure/timeout error/warning), name emphasized, summary primary while active and muted when done, tokens in/out, cost and model in distinct existing theme roles, separators dim; all colors come from the active theme render roles (no hard-coded RGB) and degrade with the theme's no-color path.
- AC-7: Sidebar width defaults to 50 columns, is user-resizable and clamps to a 36-column minimum (max unchanged) in config, settings, `/sidebar resize` and both layout adapters.
- AC-8: Canonical spec `.thoth/specs/pi-ecosystem/spec.md` reflects the deltas below and routed docs (`docs/agent/harness-packaging.md` sidebar section) match the new widths and behavior.

## Clarifications

- Retention rule (user, 2026-10-17): fixed window, active + last N finished, N = 3, uniform across statuses.
- Agents row height (user): 1 line with width-based column dropping, responsive as today.
- Width (user): minimum 36, default 50, user-resizable.
- Overflow (user): hide oldest finished first; active and newest always visible.
- Timeout counts as ✗ (user); queued ○ shown separately at ≥36 columns (user).
- Status labels (user, 2026-10-17, after final verification round 2): no protected status labels; the status glyph conveys state, Agents rows show icon, name, task summary and elapsed, finer detail is in `/subagents`; Background keeps its existing status text as ordinary truncatable summary.
- Colors (user): follow pi-atelier per-element coloring; root decision: map to active theme roles instead of atelier's fixed RGB palette.
- Active-row swapping (user screenshots): root cause is activity-based manager ordering; fixed by AC-1.

## Decisions

- Launch time for Agents is original `created_at` (stable across continuation), so a continued task keeps its place.
- Background tie-breaker for equal `startedAt` is task id ascending (ids embed pid, timestamp and sequence).
- Resolved classification: a Background task with terminal failure status is resolved only when its journal has no `unresolved` incident and at least one `resolved` or `superseded` incident; a task whose only incidents are `expected` maps to expectedExit; any unresolved incident keeps it failed. The classification is cached in the provider keyed by the background registry generation: any registry notification (including a same-operation success that recovers earlier tasks' journals without rewriting their metadata) invalidates all cached classifications for the session, which are recomputed once in the next snapshot and shared by rows and summary counts; summary, row and animation-frame calls within an unchanged generation never read journals.
- Expected exit is evaluated with `isDeclaredExpectedExit(meta, meta.lastExitCode)`; counted as done.
- New render statuses: `timedOut`, `resolved`, `expectedExit` added to pi-core `RenderStatus`, native glyph maps, `renderStatuses`, test kit and pi-thoth-theme `STATUS_ICONS`/`STATUS_ROLE`/`TOOL_FOOTER_STATUS`. Glyphs: timedOut ◷ (ASCII `T`, warning role), resolved ↻ (ASCII `~`, muted), expectedExit ✓ (ASCII `+`, dim). Cancelled keeps ■ (ASCII `#`).
- The sidebar uses the existing pi-core `'columns'` drop layout path (extended to the decided drop order and a 10-cell model column) instead of the wrapping grid; the above-editor host keeps its greedy layout and its retention-state semantics independent of presentation status.
- Agents discovery gets a separate launch-ranked persisted-history input (history query ordered by `created_at` desc, bounded) bound in the extension; the existing activity-ranked history used by `/subagents` overlays is unchanged.
- Visual units (single-line layout, per-element coloring, header summary, sidebar row rendering) are owned by thoth-designer; contract, provider, retention and width logic by thoth-worker. Within a package, writers are sequential: pi-core worker contract → pi-core designer layout/coloring; pi-sidebar worker retention/width → pi-sidebar designer rendering.
- Provider discovery returns terminals ordered by launch (most recently launched first) and capped high enough (≥3) for sidebar selection; sidebar owns final ordering and retention.
- Provider summary counts gain `queued` and `cancelled`; `failed` counts only actionable failures including timed out.
- The internal 24-column render floor remains as a safety cutoff for effective widths reduced by main-pane preservation; configured minimum becomes 36.

## Durable deltas

- `MODIFIED pi-ecosystem` **Thoth Pi sidebar** — `@thoth-agents/pi-sidebar` MUST render a read-only right sidebar in Pi fullscreen and regular modes through guarded, owner-checked layout adapters that fall back to no sidebar with a diagnostic, MUST offer Session, Workspace, work-panel source and Cost panels that can be shown, hidden and reordered with persisted order and visibility, including through a `/sidebar settings` overlay, MUST default to a 50-column width that the user can resize through `/sidebar resize`, settings and fullscreen divider drag without a keyboard shortcut down to a 36-column minimum, following the pi-atelier auto-hide rules, MUST render atelier-style themed panel chrome with per-panel icons and colors and per-element row colors drawn from the active theme roles, work-panel header summaries and detail-command footers, a Workspace path abbreviated like the editor border with changed-file and line counts versus HEAD, and a subagent cost bar panel with a `/sidebar cost` curves view, and MUST declare the work-panel sources it displays through a pi-core UI-preferences registry so the work panel neither renders nor selects nor focuses them while their sidebar panels are visible.
  - GIVEN a 160-column fullscreen session with a running subagent, two todos and modified files and no saved width; WHEN the sidebar is visible with Agents, Todos, Workspace and Cost panels; THEN the sidebar is 50 columns wide, `/sidebar resize` cannot shrink it below 36, each panel shows its themed title with a summary, Agents and Todos show their detail commands, Workspace shows `~`-abbreviated path and `Changed N files +A −D`, Cost shows bars by task display name, and the work panel no longer shows the absorbed sections or accepts ← focus for them.
- `ADDED pi-ecosystem` **Sidebar work-panel launch order and retention** — The pi-sidebar Agents and Background panels MUST list rows in launch order with the oldest at the top (subagent original creation time, background start time with task id as tie-breaker) and MUST NOT reorder rows because of activity, completion or failure; they MUST show every active row plus the three most recently launched finished rows under one rule for every terminal status without time-based expiry, and when height is insufficient MUST hide the oldest finished rows first, then the oldest active rows, reporting hidden rows with a `+N more` line.
  - GIVEN two running subagents launched in order A then B and four finished background tasks of which the oldest failed; WHEN B reports activity after A and the sidebar renders; THEN A stays above B, and the Background panel shows its three most recently launched finished tasks in launch order without the older failure.
- `ADDED pi-ecosystem` **Work-panel terminal status taxonomy** — First-party work-panel providers MUST render cancelled and interrupted work as a muted cancelled status that is not counted as a failure, MUST render timed-out work with a distinct timed-out status glyph counted as a failure, MUST render a background task whose non-zero exit code was declared expected as a non-error expected-exit status counted as done, and MUST render a failed background task whose failure incidents are all recovered or superseded as a muted resolved status not counted as a failure; header summaries MUST count only actionable failures as failed and MUST report queued and cancelled counts separately, and the new statuses MUST resolve through the render kit with Unicode, Nerd and ASCII glyphs.
  - GIVEN a cancelled subagent, a subagent that hit its total timeout, a background task exiting 1 with `expected_exit_codes: [1]` and a failed background task later recovered by a same-operation success; WHEN the sidebar renders their panels; THEN they show the ■ cancelled, ◷ timed-out, expected-exit and ↻ resolved glyphs respectively, the subagent rows show no status label, and the failed counters count only the timeout.
- `MODIFIED pi-ecosystem` **Stable work-panel row height** — the shared work-panel renderer MUST decide multi-line metric wrapping and, for the sidebar's single-line column layout, which metric columns to drop from reserved widths of each metric's number format, so a row's line count and visible columns do not change when only the digit width of its metric values changes within each format's reserved range; sidebar Agents rows MUST stay on one line at every supported width, dropping columns panel-wide in the order speed, context, tools, cost, model, tokens before truncating the summary; values beyond a reserved range MAY only increase a row's line count or drop columns, never toggle back and forth.
  - GIVEN a running subagent row whose tokens, context percent, speed and elapsed values cross format boundaries such as 99→100 tok/s and 9s→10s; WHEN the work panel and the 36- and 50-column sidebar render it; THEN while every value stays within its reserved range the row keeps the same number of lines and visible columns, the sidebar row stays on one line, and rows below it do not move.

## Plan

Approach: extend the shared status and layout contract in pi-core/pi-thoth-theme first, then adapt the two providers and the sidebar in parallel (disjoint packages), then update spec deltas through archive and routed docs.

1. **Core contract (pi-core + pi-thoth-theme)**: add `timedOut`, `resolved`, `expectedExit` render statuses to `RenderStatus`, native glyph/role maps, `terminalFooterGlyphs`, `renderStatuses` whitelist, test kit, and theme `STATUS_ICONS` (unicode/nerd/ascii), `STATUS_ROLE`, `TOOL_FOOTER_STATUS`; extend the work-panel summary type with `queued` and `cancelled`; extend the `'columns'` metric layout with the decided drop order, a 10-cell model column, panel-wide decision from reserved widths, single-line guarantee; add per-element theme role selection for rows (status-driven glyph/elapsed, name, summary active vs done, tokens in/out, cost, model, separators) using existing theme roles only. Seams: `pi-core/test/work-panel-data.test.ts`, `work-panel.test.ts`, new column-drop tests, `pi-thoth-theme/test/icons.test.ts`.
2. **Agents provider (pi-subagents)**: add a launch-ranked persisted-history query and bind it for discovery; set `sortStartedAt` from `created_at`; map cancelled/interrupted to cancelled, `total_timeout` failures to timedOut; summary counts queued/cancelled separately and failed = actionable incl. timedOut; discovery terminals ordered by launch and capped ≥3. Seams: `test/ui/work-panel-{counts,golden,metrics}.test.ts`, `test/extension/work-panel-counts.test.ts`.
3. **Background provider (pi-background-tasks)**: map `timed_out` → timedOut, `cancelled` → cancelled, expected exits → expectedExit, journal-all-recovered/superseded → resolved, cached per registry generation and shared by rows and summaries (no journal reads from summary or per-frame calls within a generation), with a real-provider test covering cross-task recovery invalidation and read counts; launch-order with id tie-breaker; summary counts. Seams: `src/navigator-provider.test.ts`, `src/work-panel.test.ts`, `src/intent.integration.test.ts`; `pi-sidebar/test/performance.test.ts` must stay green.
4. **Sidebar (pi-sidebar)**: `retainedRows` by launch order with uniform last-3 finished; overflow drops oldest finished then oldest active; header summary with ○ (≥36) and ■; Agents panel uses the single-line columns layout; per-element colors; width default 50 / min 36 across adapter, controls, config, settings and both layout adapters. Seams: `test/{panels,work-panels,degradation,config,settings,controls,session,performance}.test.ts`, `test/layout/fullscreen-adapter.test.ts`.
5. **Docs and spec**: `docs/agent/harness-packaging.md` sidebar width/behavior lines and the work-panel registry paragraph (:358-363) describing sidebar grid wrapping; spec deltas applied by `thoth-archive` in Closeout after Oracle PASS (not a task).

Risks: shared status maps also change the above-editor host and history overlays (accepted: they inherit glyphs/labels/counts only); journal-derived resolved state must not add per-render reads; ASCII/Nerd glyph widths for ◷/↻ must be single-cell; tests asserting failed-first retention and cancelled-as-failed counts are intentionally rewritten.

Verification: per-package typecheck + focused vitest for touched packages, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`; final fresh Oracle.

## Tasks

- [x] AC-3: Core status taxonomy and summary contract in pi-core and pi-thoth-theme
  - Outcome: `timedOut`, `resolved`, `expectedExit` statuses render through render kit and native fallbacks (Unicode/Nerd/ASCII) with roles; summary type carries queued and cancelled
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/render-kit.ts:14-75,225,323-365`, `pi-packages/pi-core/src/work-panel-render.ts:323-351,1078-1124,1265-1301`, `pi-packages/pi-core/src/work-panel.ts:78-115,229-310`, `pi-packages/pi-core/src/testing.ts:21-34`, `pi-packages/pi-thoth-theme/src/shared/icons.ts:11-99`, `pi-packages/pi-thoth-theme/src/render-kit/index.ts:31-59`; skill `tdd`
  - Inputs: Decisions section glyph/role choices
  - Dependencies: none
  - Output: extended types, maps and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/**`, `pi-packages/pi-core/test/**`, `pi-packages/pi-thoth-theme/src/**`, `pi-packages/pi-thoth-theme/test/**`
  - Interface boundaries: `RenderStatus`, `WorkPanelRow`, work-panel summary type consumed by providers, sidebar and above-editor host
  - Focused check and PASS evidence: pi-core and pi-thoth-theme typecheck and vitest pass, including new glyph/role/summary tests
  - Return milestone: contract types and tests green
  - Stop / reassessment: a status-map change that breaks an unrelated consumer contract
- [x] AC-5: Single-line column-drop layout in pi-core
  - Outcome: `'columns'` layout drops speed → context → tools → cost → model (10 cells) → tokens, then truncates summary, panel-wide from reserved widths, always one line
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/work-panel-render.ts:471-705`; skill `tdd`
  - Inputs: AC-5 and Stable row height delta
  - Dependencies: AC-3 core contract task accepted (pi-core writer handoff from worker to designer)
  - Output: layout implementation and tests across widths 36/50/64/72 and digit-boundary stability
  - Owner: thoth-designer (single pi-core writer for layout and coloring after the contract task)
  - Writes: `pi-packages/pi-core/src/work-panel-render.ts`, `pi-packages/pi-core/test/**`
  - Interface boundaries: `renderWorkPanelRow` options used by sidebar and host; host keeps greedy
  - Focused check and PASS evidence: new vitest cases show one line and stable visible columns across format boundaries
  - Return milestone: layout tests green
  - Stop / reassessment: drop logic requiring sidebar-specific knowledge inside pi-core beyond an option
- [x] AC-6: Per-element theme role coloring in pi-core row renderer
  - Outcome: row elements colored by atelier-style mapping using existing theme roles, no hard-coded RGB, no-color path preserved
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/work-panel-render.ts`, `pi-packages/pi-core/src/render-kit.ts`
  - Inputs: AC-6 and atelier findings in Exploration
  - Dependencies: AC-3 core contract task accepted; same designer session as the pi-core layout task
  - Output: role selection and golden tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-core/src/**`, `pi-packages/pi-core/test/**`
  - Interface boundaries: render kit role API
  - Focused check and PASS evidence: tests assert roles per element for running/done/failed/timedOut rows
  - Return milestone: coloring tests green
  - Stop / reassessment: required role missing from the theme contract
- [x] AC-1: Agents provider launch order, taxonomy and counts in pi-subagents
  - Outcome: discovery receives a launch-ranked persisted-history input; rows carry `sortStartedAt` = `created_at`; cancelled/interrupted → cancelled; `total_timeout` → timedOut; counts queued/cancelled/actionable failed; discovery terminals ordered by launch, cap ≥3
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/ui/work-panel-provider.ts:22-26,138-295`, `pi-packages/pi-subagents/src/manager.ts:708-715,2361-2372,2432-2448`, `pi-packages/pi-subagents/src/history.ts:625-662`, `pi-packages/pi-subagents/src/extension/subagents-extension.ts:322-325`; skill `tdd`
  - Inputs: accepted core contract task output
  - Dependencies: AC-3 core contract task
  - Output: provider changes and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/ui/**`, `pi-packages/pi-subagents/src/history.ts`, `pi-packages/pi-subagents/src/manager.ts`, `pi-packages/pi-subagents/src/extension/subagents-extension.ts`, `pi-packages/pi-subagents/test/**`
  - Interface boundaries: `WorkPanelSource` discovery contract; activity-ranked history and manager ordering for `/subagents` overlays unchanged
  - Focused check and PASS evidence: pi-subagents typecheck and focused vitest pass, including a test that activity on an older running task does not reorder rows and a resumed-session test where more than 100 older tasks were recently continued and the three most recently launched finished tasks are still discovered
  - Return milestone: provider tests green
  - Stop / reassessment: launch order requires changing manager sorting used by other surfaces
- [x] AC-3: Background provider taxonomy, launch order and counts in pi-background-tasks
  - Outcome: timed_out → timedOut, cancelled → cancelled, expected exit (or only-expected incidents) → expectedExit, no-unresolved with ≥1 resolved/superseded → resolved, id tie-breaker, counts updated; classification cached per registry generation (invalidated by any registry notification, covering cross-task recovery) and shared by rows and summaries
  - Known entrypoints and skill paths: `pi-packages/pi-background-tasks/src/navigator-provider.ts:56-270`, `pi-packages/pi-background-tasks/src/failures.ts:57-103`, `pi-packages/pi-background-tasks/src/shared-failure-observations.ts:44-46,254-316`, `pi-packages/pi-background-tasks/src/registry.ts:229-235`; skill `tdd`
  - Inputs: accepted core contract task output
  - Dependencies: AC-3 core contract task
  - Output: provider changes and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-background-tasks/src/**`
  - Interface boundaries: `/bg` history ordering unchanged; journal formats unchanged
  - Focused check and PASS evidence: pi-background-tasks typecheck and focused vitest pass for each status case, plus a real-provider test that caches a failed task, completes a same-operation retry, verifies the unchanged earlier metadata now renders resolved with an updated failure count, then verifies repeated summary/row/animation-frame calls in the unchanged generation add no journal reads; `pi-sidebar/test/performance.test.ts` green
  - Return milestone: provider tests green
  - Stop / reassessment: resolved detection needs new persisted metadata or per-render journal reads
- [x] AC-2: Sidebar launch-order retention and overflow in pi-sidebar
  - Outcome: `retainedRows` orders by `sortStartedAt` (id tie-breaker), keeps active + 3 most recently launched finished uniformly, overflow hides oldest finished then oldest active with `+N more`
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/sidebar.ts:43-81,216-241,500-603`; skill `tdd`
  - Inputs: accepted core contract output
  - Dependencies: AC-3 core contract task
  - Output: sidebar retention changes and rewritten retention tests (`test/panels.test.ts:144,288`, `test/work-panels.test.ts:473`)
  - Owner: thoth-worker (pi-sidebar writer for retention and width; hands off to designer)
  - Writes: `pi-packages/pi-sidebar/src/panels/**`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: providers' discovery snapshots
  - Focused check and PASS evidence: vitest cases for launch order, uniform last-3 retention and overflow order pass; `test/performance.test.ts` green
  - Return milestone: retention tests green
  - Stop / reassessment: retention needing provider data not in rows
- [x] AC-4: Sidebar header summary with queued and cancelled counts
  - Outcome: header shows ◐ ○(≥36) ✓ ✗(actionable) ■(muted), zero counts omitted
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/sidebar.ts:92-144`
  - Inputs: accepted core summary type
  - Dependencies: AC-3 core contract task; pi-sidebar AC-2 and AC-7 worker tasks accepted
  - Output: header rendering and tests (`test/work-panels.test.ts:335-414`)
  - Owner: thoth-designer (pi-sidebar writer after the worker retention and width tasks are accepted)
  - Writes: `pi-packages/pi-sidebar/src/panels/**`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: pi-core summary type
  - Focused check and PASS evidence: header tests at 30 and 40 columns pass
  - Return milestone: header tests green
  - Stop / reassessment: none
- [x] AC-5: Sidebar Agents panel uses single-line column layout with per-element colors
  - Outcome: Agents rows render one line via the pi-core columns layout; rows use the per-element role mapping
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/sidebar.ts:378-458` (`metricLayout` at :413, `workPanelRowLineCount` at :428)
  - Inputs: accepted pi-core layout and coloring outputs
  - Dependencies: AC-5 and AC-6 pi-core tasks; pi-sidebar AC-2 and AC-7 worker tasks accepted
  - Output: sidebar render changes and tests
  - Owner: thoth-designer (same pi-sidebar designer session)
  - Writes: `pi-packages/pi-sidebar/src/panels/**`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: `renderWorkPanelRow` options
  - Focused check and PASS evidence: tests show one line per Agents row at 36 and 50 columns and expected roles per element
  - Return milestone: render tests green
  - Stop / reassessment: layout option insufficient for sidebar needs
- [x] AC-6: Sidebar row color roles verified at panel level
  - Outcome: Agents and Background panel rows show status-driven glyph/elapsed roles, dim separators and distinct token/cost/model roles
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/sidebar.ts`, `pi-packages/pi-sidebar/test/work-panels.test.ts`
  - Inputs: accepted pi-core coloring output
  - Dependencies: AC-6 pi-core task; pi-sidebar AC-2 and AC-7 worker tasks accepted
  - Output: panel-level color tests
  - Owner: thoth-designer (same pi-sidebar designer session)
  - Writes: `pi-packages/pi-sidebar/test/**`, `pi-packages/pi-sidebar/src/panels/**`
  - Interface boundaries: render kit roles
  - Focused check and PASS evidence: panel color tests pass with the test render kit
  - Return milestone: color tests green
  - Stop / reassessment: none
- [x] AC-7: Sidebar width default 50 and minimum 36
  - Outcome: default 50, clamp 36..72 across adapter, controls, config, settings and both layout adapters
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/layout/adapter.ts:29-33`, `src/controls.ts:8,55-90`, `src/config.ts:21-73`, `src/settings.ts:136-140`, `src/layout/fullscreen-adapter.ts:51,99,118`, `src/layout/inline-adapter.ts:32,98,140`
  - Inputs: user decision
  - Dependencies: none
  - Output: constant/clamp changes and tests (`test/{config,settings,controls,session}.test.ts`, `test/layout/fullscreen-adapter.test.ts:136`)
  - Owner: thoth-worker (same session as the pi-sidebar retention task; precedes designer sidebar tasks)
  - Writes: `pi-packages/pi-sidebar/src/**`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: persisted `thoth-sidebar.json` width values below 36 clamp up
  - Focused check and PASS evidence: width tests assert default 50 and clamp at 36
  - Return milestone: width tests green
  - Stop / reassessment: none
- [x] AC-8: Routed docs updated for sidebar widths and behavior
  - Outcome: `docs/agent/harness-packaging.md` sidebar section states default 50, min 36, launch order, uniform retention and status taxonomy, and the work-panel registry paragraph describes the sidebar single-line columns layout instead of grid wrapping
  - Known entrypoints and skill paths: `docs/agent/harness-packaging.md:358-363,377-425`
  - Inputs: accepted sidebar task output
  - Dependencies: sidebar task
  - Output: doc edit
  - Owner: root
  - Writes: `docs/agent/harness-packaging.md`
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci` passes; doc lines match implemented values
  - Return milestone: doc edit done
  - Stop / reassessment: none
- [x] AC-8: Pre-Oracle local gate and delta readiness
  - Outcome: `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build` and touched-package focused tests pass; durable deltas still match the implemented behavior and the canonical baseline digest is unchanged (spec application and archive happen in Closeout after Oracle PASS)
  - Known entrypoints and skill paths: `C:/DEV/Proyectos/Webstorm/thoth-agents/skills/thoth-sdd/scripts/validate.mjs`
  - Inputs: all implementation tasks accepted
  - Dependencies: all tasks above
  - Output: green local gate and `--through verify` validation
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: commands exit 0; validator `--through verify` valid
  - Return milestone: ready to request final Oracle verification
  - Stop / reassessment: unrelated environment failures reported with evidence
- [x] AC-3: Remove protected status labels and keep elapsed always visible
  - Outcome: pi-core protected-segment API and elapsed-drop logic removed; Agents summaries no longer prefixed by status labels; Background status text unprotected; real 36/50-column sidebar renders keep glyph, name, summary and elapsed on one line
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/{work-panel,work-panel-render}.ts`, `pi-packages/pi-subagents/src/ui/work-panel-provider.ts`, `pi-packages/pi-background-tasks/src/navigator-provider.ts`; skill `tdd`
  - Inputs: user decision on status labels; final verification round 2 finding
  - Dependencies: all earlier tasks
  - Output: code and tests without protected labels
  - Owner: thoth-designer
  - Writes: those three source files, `pi-packages/pi-core/test/**`, `pi-packages/pi-subagents/test/**`, `pi-packages/pi-background-tasks/src/navigator-provider.test.ts`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: host greedy/grid output unchanged
  - Focused check and PASS evidence: package typechecks and vitest green; sidebar renders at 36/50 show elapsed on every row
  - Return milestone: tests green
  - Stop / reassessment: elapsed cannot fit with name floor at 36 columns

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review history: round 1 REJECT (launch-ranked Agents history, designer ownership, archive-before-verify task); round 2 REJECT (cross-task recovery cache invalidation); round 3 OKAY, validated with validate-result.mjs (exit 0). Nonblocking caution carried to implementation: initialize the shared generation snapshot from either summary or rows, and the recovery regression calls summary before rows.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 8271eb407231c3d5acc11b8aebca799edaec03dc4e3d74df3f3dc36386616228

Final verification history: rounds 1-7 FAIL (expected-exit precedence, timeout labelling, dim separators; label truncation resolved by user decision to drop status labels; warning removed name; Nerd token direction and metricless muting; expectedExit tone and warning separators; output-only tokens and combined-warning separators fixed structurally; Background host-layout regression). Round 8 PASS, envelope validated with validate-result.mjs (exit 0).

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The actual diff satisfies AC-1 through AC-8, clarifications, decisions and declared non-goals. No blocking findings.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/pi-sidebar-agents-bg-clarity/pi-sidebar-agents-bg-clarity.md",
      "claim": "Independently recomputed prefix SHA-256 matches 8271eb407231c3d5acc11b8aebca799edaec03dc4e3d74df3f3dc36386616228. Canonical baseline matches 85fc9a941fff5b00a87e19f14b76c46c57af1a414ba874b44cc875b4b4f39589; verify validator returns valid.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "diff-review",
      "locator": "git status/diff; all untracked tests under pi-packages/",
      "claim": "Reviewed 48 tracked changes and 10 untracked test files against the complete record. No package versions, persisted metadata formats or history-overlay ordering changed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "test-execution",
      "locator": "pi-packages/pi-core",
      "claim": "All 992 tests passed across initial passing files and affected-file reruns. Coverage includes column dropping, role-preserving fitting, elapsed/name retention, host flat-segment parity and timed retention.",
      "basis": "observed",
      "uncertainty": "Initial broad concurrent execution required low-concurrency reruns."
    },
    {
      "id": "E4",
      "kind": "test-execution",
      "locator": "pi-packages/pi-sidebar",
      "claim": "All 266 tests passed across initial passing files and affected-file reruns, covering ordering, retention, overflow, counts, widths, layouts and performance.",
      "basis": "observed",
      "uncertainty": "Two initially timed-out files passed unchanged with bounded concurrency."
    },
    {
      "id": "E5",
      "kind": "test-execution",
      "locator": "pi-packages/pi-subagents; pi-packages/pi-background-tasks",
      "claim": "33 focused Agents tests and 28 focused Background tests passed, including resumed launch-ranked discovery, taxonomy, unresolved-incident precedence and summary-first cross-task recovery without repeated journal reads.",
      "basis": "observed",
      "uncertainty": "Other provider tests rely on root-reported execution."
    },
    {
      "id": "E6",
      "kind": "test-execution",
      "locator": "pi-packages/pi-thoth-theme; five touched package typechecks",
      "claim": "1113 theme tests and all five package typechecks passed. Real-kit Unicode, Nerd and ASCII tests cover provider-shaped rows, token directions, combined warnings and terminal roles.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1 and AC-2",
      "method": "Provider/sidebar implementation review and launch, retention and overflow tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4", "E5"],
      "reason": "Stable launch keys drive ordering; uniform last-three terminal retention and finished-before-active hiding match the contract."
    },
    {
      "check": "AC-3 and no-protected-status-labels clarification",
      "method": "Taxonomy, precedence, row-shape and narrow-render checks",
      "outcome": "pass",
      "evidenceIds": ["E3", "E5", "E6"],
      "reason": "Distinct terminal glyphs/counts are correct; Agents carry no status label, Background text remains truncatable, and elapsed is not sacrificed."
    },
    {
      "check": "AC-4",
      "method": "Header summary implementation and sidebar tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4"],
      "reason": "Running, queued, done, actionable-failed and muted-cancelled counters follow the declared width and zero-count behavior."
    },
    {
      "check": "AC-5",
      "method": "Column-plan, digit-boundary and narrow-row tests",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4"],
      "reason": "Agents remain single-line; panel-wide reserved widths enforce the required drop order while retaining name and elapsed."
    },
    {
      "check": "AC-6",
      "method": "Source review and real-kit role assertions across icon modes",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E6"],
      "reason": "Semantic theme roles preserve token direction, warning boundaries, dim separators and state-driven glyph/elapsed colors."
    },
    {
      "check": "AC-7",
      "method": "Config, settings, controls, session and both adapter tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4"],
      "reason": "Preferred width defaults to 50 and clamps to 36–72; narrow-terminal effective widths preserve the main pane."
    },
    {
      "check": "AC-8 and durable deltas",
      "method": "Documentation/delta comparison, baseline hashing and verify validator",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2"],
      "reason": "Routed documentation matches implementation; durable deltas are ready for the explicitly deferred post-PASS archive application."
    },
    {
      "check": "Non-goals and round-7 regression",
      "method": "Actual diff, host parity/retention tests and recovery read-count checks",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E5"],
      "reason": "Greedy/grid hosts preserve flat segments, timed retention remains unchanged, overlays retain their ordering, and unchanged registry generations add no journal reads."
    }
  ],
  "risks": [
    {
      "description": "Broad concurrent Windows test execution produced timeouts and one apparent cascade assertion; every affected file passed unchanged with --maxWorkers=2.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E3", "E4"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope, complete closeout bookkeeping, then apply declared spec deltas through archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-sidebar-agents-bg-clarity/pi-sidebar-agents-bg-clarity.md",
    "reviewedRecordSha256": "8271eb407231c3d5acc11b8aebca799edaec03dc4e3d74df3f3dc36386616228"
  }
}
```

- AC-1: PASS | launch-order and launch-ranked history tests (pi-subagents, pi-sidebar) | Oracle r8 E2/E4/E5
- AC-2: PASS | uniform last-3 retention and overflow tests (pi-sidebar panels/work-panels) | Oracle r8 E4
- AC-3: PASS | taxonomy, unresolved precedence, recovery cache tests (pi-background-tasks, pi-subagents, pi-thoth-theme) | Oracle r8 E3/E5/E6
- AC-4: PASS | header summary tests (pi-sidebar work-panels) | Oracle r8 E4
- AC-5: PASS | column-layout, keep-name, narrow-row tests (pi-core, pi-sidebar) | Oracle r8 E3/E4
- AC-6: PASS | real-kit role audits in Unicode/Nerd/ASCII (pi-thoth-theme) | Oracle r8 E6
- AC-7: PASS | width config/controls/settings/session/adapter tests (pi-sidebar) | Oracle r8 E4
- AC-8: PASS | check:ci, typecheck, build exit 0; docs/agent/harness-packaging.md reviewed | Oracle r8 E1/E2
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:85fc9a941fff5b00a87e19f14b76c46c57af1a414ba874b44cc875b4b4f39589

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
