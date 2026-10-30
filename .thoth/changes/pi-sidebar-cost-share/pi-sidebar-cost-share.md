# Change: pi-sidebar-cost-share

**Classification**: substantial
**Scope**: local
**Uncertainty**: low
**Risk**: low

## Exploration

- User report (2026-10-30, screenshot at width 50): with near-equal subagent costs ($0.12, $0.12, $0.11, $0.06, $0.02; header $0.44) the sidebar COST panel renders as one amber rectangle with labels cut to `Phase disco…` or `Final-verif…`, so the chart adds no value.
- The panel is a top-five per-task ranking: `build()` in `pi-packages/pi-sidebar/src/panels/sidebar.ts:387–459` calls `renderCostRows(tracker.ranked().slice(0, 5), …)` inside `staticPanel('cost', 'Cost', …)`; the footer `/sidebar cost ▸ curves` comes from `footerRow()` (`:237–252`); the chrome style `{ role: 'warning', icon: 'cost' }` and the 12-cell label column (9 below width 28) live in `src/panels/chrome.ts:28–36,74–77`.
- Bars (`src/panels/cost.ts:129–169`, `costBar()`): `█` plus eighth blocks (`#` in ASCII), ratio `task.cost / tasks[0].cost`, every bar in `warning`, labels muted, inner width `width − 4`. Adjacent full-block rows in one color merge, and max scaling always fills the top bar.
- Data (`src/panels/cost.ts:14–113`): `CostTracker` merges history and live task snapshots by task id (positive costs only), keeps `id`, `agent`, `label`, `cost`, `start`, `end?` and up to 120 cumulative `{at,cost}` samples, ranks by cost (top ten, at most 200 retained) and exposes a revision. Snapshot `status`, model and effort arrive at ingestion (`pi-packages/pi-core/src/subagents.ts:32–64`) but are not retained. The header total is `formatUsd(options.subagentCost() || tracker.total())` (`sidebar.ts:449–451`). Root-session cost is not part of COST; the Session panel already shows `Cost $x +$y` (`src/panels/rows.ts:160–165`).
- `/sidebar cost` opens the cumulative curves overlay (`src/curves.ts`); its colors and markers come from the exported `SERIES_PALETTE` and `seriesMarker()` and the private `paintSeries()` (`:66–111`; order starts error, warning, success, mdCode, mdLink; ASCII digits `1`–`0`). The sidebar panel has no modes and no cost-specific configuration.
- Height budgeting (`sidebar.ts:623–735`) drops footers first, folds blocks into `+N more` (counting blocks, not tasks), then collapses panels to their titles. Render caching and the no-per-render-session-traversal rule: `sidebar.ts:748–798`, `cost.ts:41–49`, package `README.md:128–132`.
- Tests are assertion-based: `test/cost.test.ts`, `test/curves.test.ts`, `test/degradation.test.ts`, `test/performance.test.ts`, `test/session.test.ts:1312–1346`. Docs: package `README.md:35,104–113,128–132,189`; `docs/agent/harness-packaging.md:445–457,480–483` states ten sidebar bars while code and tests show five.
- Canonical baseline: `.thoth/specs/pi-ecosystem/spec.md` requirement **Thoth Pi sidebar** promises "a subagent cost bar panel" and its scenario says "Cost shows bars by task display name".

## Intent

When subagent costs are similar or numerous, the sidebar COST panel shows how the subagent total splits across tasks: one full-width share bar keyed by a ranked legend with readable display names, shares and amounts, instead of max-scaled amber bars that merge into one block. The `/sidebar cost` curves view uses the same amber-first colors.

## Non-goals

- No per-agent-role roll-up; it may become a second view in the curves overlay in a separate change.
- No root-session cost in COST, no new configuration keys or panel modes, no burn-rate sparkline.
- No change to the curves overlay beyond the shared palette module and its color order.
- No change to pi-core or pi-subagents snapshot or usage contracts, and no package version bumps.

## Acceptance

- AC-1: In Unicode mode the COST panel's first body row is one bar spanning the full inner width whose segments are allocated to the displayed legend entries in rank order by share of the panel total, using largest-remainder rounding with at least one cell per entry; every segment except the last ends in `▌` so adjacent segments stay distinct without color, and the remainder entry's segment uses `░`. For tasks costing $0.12, $0.12, $0.11, $0.06 and $0.02 with a $0.43 total at width 50 the segments measure 13, 13, 12, 6 and 2 cells. No COST rendering scales by the largest task.
- AC-2: Below the bar, legend entries in rank order show a marker in their segment's color, the task display name in default text truncated with `…` only to the width left after the share and amount columns (at least 30 cells at width 50 and at least 14 at width 36), the integer share in muted text (`<1%` under one percent) and the formatted amount. The panel shows at most five entries: with more than five tasks, or untracked cost (panel total minus tracked total) of at least half a cent, it shows the top four tasks followed by a muted `░` remainder entry labeled `+N more task`/`+N more tasks` (N hidden tasks), or `other` when N is zero, whose share and amount equal the panel total minus the four shown tasks. For 23 tasks whose top four cost $3.42, $1.96, $1.31 and $0.88 within a $9.64 total the remainder reads `+19 more tasks`, `21%` and `$2.07`. Below inner width 28 the share column is dropped.
- AC-3: A shared series module (`pi-packages/pi-sidebar/src/panels/series.ts`) provides the palette, marker and paint helpers used by both the COST panel and the `/sidebar cost` curves view; the palette starts with the theme `warning` color and places `error` last while the other colors keep their previous relative order, and rank N uses the same color and ASCII digit in both views. In ASCII mode COST segments are filled with their legend digit (`1`…`0`), the remainder with `.`, the legend markers are the same digits, and `▸`/`↑` render as `>`/`^`.
- AC-4: `CostTracker` derives each task's running state from every state snapshot (running only while present in the latest live snapshot with a non-terminal status) and bumps its revision whenever a running state changes. Running legend entries show an accent `↑` in a trailing column reserved on every entry so labels never shift, the header total shows `↑` while any tracked task runs, and both markers disappear once no task runs.
- AC-5: Under height pressure the COST panel drops its footer first, then folds legend entries from the bottom into a `+N more` line whose N counts hidden tasks (including those inside a folded remainder entry), never renders the bar without at least its first legend entry, and below that collapses to its title with the total; other sidebar panels keep their fold text and degradation behavior.
- AC-6: COST rendering reads only state cached at update time (ranked entries, panel total, task count, running flags) without per-render session traversal or iteration over all tracked tasks, and the cached panel plan is invalidated when the tracker revision changes; the existing performance tests stay green and cover the new state.
- AC-7: `pi-packages/pi-sidebar/README.md` and `docs/agent/harness-packaging.md` describe the share bar with its ranked legend, the top-four-plus-remainder rule, the running marker and the palette shared with the curves view, and no longer state that the sidebar shows ten bars.

## Clarifications

- Design (user, 2026-10-30, question tool): option 1, the share-of-total bar with a ranked legend, chosen over per-task gauge rows and a per-agent-role roll-up.
- Palette (user, 2026-10-30, question tool): amber (`warning`) first and red (`error`) last, in both the sidebar and the `/sidebar cost` view.
- No other material question remains; the defaults under Decisions were shown to the user with the options and not objected to.

## Decisions

- Colors follow rank, matching the overlay; entries swap colors when their ranks swap.
- Panel total is the larger of `subagentCost()` and `tracker.total()`; the header shows it and shares use it.
- Shares are integer percentages rounded individually, so they may not sum to 100; amounts keep the existing `formatUsd` format.
- Labels truncate at the end with `…`, as elsewhere in the sidebar; no agent tags, because the overlay legend already shows `agent · label`.
- Running marker: accent `↑` without animation or timers; the remainder entry carries no marker.
- Width: the legend label shrinks to a 14-cell minimum below inner width 40, the share column is dropped below inner width 28, the bar always spans the inner width, and below 24 columns the existing widen hint applies.
- Height: the bar and the first legend entry form one unsplittable head block; folded entries report hidden tasks through a per-panel fold-text hook whose default keeps every other panel's current text.
- Palette helpers move to `src/panels/series.ts` so `cost.ts` does not import `curves.ts`.
- Root-session cost stays out of COST because the Session panel already shows it.
- The ADDED **Sidebar cost share panel** requirement does not overlap other pi-ecosystem requirements: the only Cost panel text lives in **Thoth Pi sidebar**, which this change modifies.
- Implementation owner: one thoth-designer session, following the sidebar rendering precedent of `pi-sidebar-agents-two-line`; root runs the local gate.

## Durable deltas

- `MODIFIED pi-ecosystem` **Thoth Pi sidebar** — `@thoth-agents/pi-sidebar` MUST render a read-only right sidebar in Pi fullscreen and regular modes through guarded, owner-checked layout adapters that fall back to no sidebar with a diagnostic, MUST offer Session, Workspace, work-panel source and Cost panels that can be shown, hidden and reordered with persisted order and visibility, including through a `/sidebar settings` overlay, MUST default to a 50-column width that the user can resize through `/sidebar resize`, settings and fullscreen divider drag without a keyboard shortcut down to a 36-column minimum, following the pi-atelier auto-hide rules, MUST render atelier-style themed panel chrome with per-panel icons and colors and per-element row colors drawn from the active theme roles, work-panel header summaries and detail-command footers, a Workspace path abbreviated like the editor border with changed-file and line counts versus HEAD, and a subagent cost-share panel with a `/sidebar cost` curves view, and MUST declare the work-panel sources it displays through a pi-core UI-preferences registry so the work panel neither renders nor selects nor focuses them while their sidebar panels are visible.
  - GIVEN a 160-column fullscreen session with a running subagent, two todos and modified files and no saved width; WHEN the sidebar is visible with Agents, Todos, Workspace and Cost panels; THEN the sidebar is 50 columns wide, `/sidebar resize` cannot shrink it below 36, each panel shows its themed title with a summary, Agents and Todos show their detail commands, Workspace shows `~`-abbreviated path and `Changed N files +A −D`, Cost shows a share-of-total bar keyed by task display names, and the work panel no longer shows the absorbed sections or accepts ← focus for them.
- `ADDED pi-ecosystem` **Sidebar cost share panel** — The pi-sidebar Cost panel MUST render one bar spanning the panel's inner width whose segments are sized by each displayed entry's share of the panel total (the larger of the authoritative subagent total and the tracked task sum) and stay distinguishable without color, colored from a series palette shared with the `/sidebar cost` curves view that starts with the theme warning color and places the error color last, followed by a ranked legend of at most five entries showing each task display name with its share and amount, where tasks beyond the top four or untracked cost collapse into one remainder entry; it MUST mark running tasks and the total while any task runs, MUST keep the bar together with at least one legend entry under height pressure while counting hidden tasks when folding, and MUST render only from state cached at update time.
  - GIVEN 23 subagent tasks whose top four cost $3.42, $1.96, $1.31 and $0.88 within a $9.64 total, the first of them still running, at the default 50-column width; WHEN the Cost panel renders; THEN it shows one full-width segmented bar, four legend entries with readable display names, shares and amounts, a `+19 more tasks` entry with `21%` and `$2.07`, `↑` on the running entry and on the total, and the `/sidebar cost ▸ curves` footer.

## Plan

One thoth-designer session implements AC-1 to AC-7 test-first (skill `tdd`) inside `pi-packages/pi-sidebar`, then applies a behavior-preserving `simplify` pass:

1. `src/panels/series.ts`: move `SERIES_PALETTE`, `seriesMarker()` and `paintSeries()` out of `src/curves.ts`, reorder the palette (warning first, error last, others keep relative order) and make the curves view import it.
2. `CostTracker` (`src/panels/cost.ts`): a task count, per-task running state recomputed from every live state snapshot (absent or terminal means not running) with a revision bump on change, and a cached any-running flag.
3. Renderer (`src/panels/cost.ts`): replace the max-scaled `renderCostRows`/`costBar` rows with a share renderer covering entry selection (top five, or top four plus remainder), largest-remainder cell allocation with at least one cell per entry, segment glyphs (`█` ending in `▌`, `░`; ASCII digits and `.`), legend rows (marker, label, muted share, amount, reserved `↑` column) and the width rules.
4. Panel build (`src/panels/sidebar.ts:387–459`, `src/panels/chrome.ts`): wire the renderer, the panel total and the header `↑`; drop the fixed cost label column if nothing else uses it.
5. Degradation (`src/panels/sidebar.ts:623–735`): the unsplittable head block and the fold-text hook so `+N more` counts tasks, with the default unchanged for other panels.
6. Tests: `test/cost.test.ts` (flat 13/13/12/6/2 at width 50, a dominant task, 23 tasks, width 36, ASCII, running, untracked remainder), `test/curves.test.ts` (palette order), `test/degradation.test.ts` and `test/performance.test.ts`.
7. Docs: package `README.md` and `docs/agent/harness-packaging.md`.

Root then runs the Pi sidebar local closeout gate from `docs/agent/testing.md` and the validator `--through verify`, the user performs the live check in both Pi modes, and root requests a fresh final Oracle; the durable deltas apply at archive.

Risks: overlay colors change by design; `●` (already used by the overlay) and the new `↑` have ambiguous East Asian width; rounded shares may not sum to 100; rank colors swap on overtakes; running state must clear for tasks trimmed from snapshots or `↑` sticks; any need to change pi-core or another package returns to root for reassessment.

Focused verification seams: the pi-sidebar vitest suite (cost, curves, degradation, performance, session), ASCII-mode cases, and widths 36 and 50.

## Tasks

Use one checkbox row per independently acceptable work unit. Keep each checkbox
on one line in the validator-compatible form `- [ ] AC-n: ...`; indent the
remaining fields below it. Repeat an AC number when separate units contribute
to that acceptance outcome. The row text names one reviewable result; do not
combine separately acceptable outcomes into a phase-sized task. Fill the
indented fields with concrete information. For a read-only unit, write `none`
for owned writes.

- [x] AC-3: Shared amber-first series palette for COST and the curves view
  - Outcome: `src/panels/series.ts` owns the palette, marker and paint helpers with `warning` first and `error` last; `src/curves.ts` uses it with unchanged behavior apart from color order
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/curves.ts:66–111` (`SERIES_PALETTE`, `seriesMarker`, `paintSeries`), `pi-packages/pi-sidebar/test/curves.test.ts`; skill `tdd`
  - Inputs: user palette decision (Clarifications)
  - Dependencies: none
  - Output: shared module, curves wiring and a palette-order test
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/src/panels/series.ts`, `pi-packages/pi-sidebar/src/curves.ts`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: curves overlay layout, legend and keys unchanged; no `cost.ts` → `curves.ts` import
  - Focused check and PASS evidence: pi-sidebar curves tests green, including the new palette-order assertion
  - Return milestone: reported with the full designer session result
  - Stop / reassessment: reordering requires theme or pi-core changes
- [x] AC-1: Share-of-total segmented bar in the COST panel
  - Outcome: the first COST body row is the full-width share bar (largest remainder, at least one cell per entry, `▌` separators, `░` remainder); max scaling removed
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/cost.ts:129–169` (`costBar`, `renderCostRows`), `pi-packages/pi-sidebar/src/panels/sidebar.ts:387–459` (`build`), `pi-packages/pi-sidebar/src/panels/chrome.ts:28–36,74–77`, `pi-packages/pi-sidebar/test/cost.test.ts`; skill `tdd`
  - Inputs: AC-1 and Decisions in this record; AC-3 module
  - Dependencies: AC-3 unit (same designer session)
  - Output: share renderer, panel wiring and tests (flat 13/13/12/6/2 at width 50, dominant task, 23 tasks)
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/src/panels/**`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: other panels unchanged; header summary still the formatted total
  - Focused check and PASS evidence: cost tests assert exact segment widths and glyphs
  - Return milestone: reported with the full designer session result
  - Stop / reassessment: the bar cannot fill the inner width without changing shared chrome
- [x] AC-2: Ranked legend with remainder entry and width rules
  - Outcome: legend entries (marker, label, muted share, amount), top four plus `+N more tasks`/`other` remainder, label minimums at widths 50 and 36, share column dropped below inner width 28
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/cost.ts`, `pi-packages/pi-core/src/panel-primitives.ts:34–45` (truncate/pad helpers, read-only), `pi-packages/pi-sidebar/test/cost.test.ts`; skill `tdd`
  - Inputs: AC-2 and Decisions; AC-1 renderer
  - Dependencies: AC-1 unit (same designer session)
  - Output: legend rendering and tests (23-task remainder `+19 more tasks` 21% $2.07, untracked `other`, `<1%`, widths 36 and 50)
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/src/panels/**`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: `formatUsd` output unchanged
  - Focused check and PASS evidence: cost tests green with the listed cases
  - Return milestone: reported with the full designer session result
  - Stop / reassessment: none
- [x] AC-4: Running markers from cached tracker state
  - Outcome: `CostTracker` keeps running state per task from every snapshot with revision bumps; `↑` on running entries in a reserved column and after the header total
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/cost.ts:41–113` (`CostTracker.update`, ranking, revision), `pi-packages/pi-sidebar/src/session.ts:154–170`, `pi-packages/pi-core/src/subagents.ts:32–64` (snapshot status, read-only); skill `tdd`
  - Inputs: AC-4 and Decisions; AC-2 legend
  - Dependencies: AC-2 unit (same designer session)
  - Output: tracker state, markers and tests (start, finish, trimmed from snapshot, layout stable when toggling)
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/src/panels/**`, `pi-packages/pi-sidebar/src/session.ts`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: no change to the pi-core snapshot contract or channel subscriptions
  - Focused check and PASS evidence: cost and session tests green, including marker clearing after a task leaves the live snapshot
  - Return milestone: reported with the full designer session result
  - Stop / reassessment: running state needs data outside the existing snapshots
- [x] AC-5: Height degradation keeps the bar with a legend entry and counts hidden tasks
  - Outcome: footer drops first, entries fold from the bottom into `+N more` counting tasks, bar never alone, title-only collapse unchanged; other panels unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/sidebar.ts:623–735` (budget planner, block folding), `pi-packages/pi-sidebar/test/degradation.test.ts`; skill `tdd`
  - Inputs: AC-5 and Decisions; AC-1 and AC-2 output
  - Dependencies: AC-2 unit (same designer session)
  - Output: head-block marking, fold-text hook and tests at several heights
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/src/panels/**`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: default fold text for every other panel unchanged
  - Focused check and PASS evidence: degradation tests green, including existing cases for other panels and an explicit COST boundary between the whole head block and title-only collapse that never emits a bare overflow count
  - Return milestone: reported with the full designer session result
  - Stop / reassessment: the hook would change the shared panel contract outside pi-sidebar
- [x] AC-6: Performance contract preserved for the new cached state
  - Outcome: render reads only cached ranked entries, total, count and running flags; plan cache invalidates on tracker revision
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/test/performance.test.ts` (from line 440), `pi-packages/pi-sidebar/src/panels/sidebar.ts:748–798`, `pi-packages/pi-sidebar/README.md:128–132`; skill `tdd`
  - Inputs: AC-6; AC-1 to AC-5 output
  - Dependencies: AC-4 and AC-5 units (same designer session)
  - Output: performance assertions for the new state
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/test/**`, `pi-packages/pi-sidebar/src/panels/**`
  - Interface boundaries: none
  - Focused check and PASS evidence: performance tests green, including revision invalidation on a running-state change
  - Return milestone: reported with the full designer session result
  - Stop / reassessment: none
- [x] AC-7: Routed docs describe the cost share panel
  - Outcome: package README and harness-packaging guide describe the share bar, legend, remainder rule, running marker and shared palette; the ten-bars statement is gone
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/README.md:35,104–113,128–132,189`, `docs/agent/harness-packaging.md:445–457,480–483`
  - Inputs: implemented behavior from AC-1 to AC-6
  - Dependencies: AC-6 unit (same designer session)
  - Output: doc edits
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/README.md`, `docs/agent/harness-packaging.md`
  - Interface boundaries: none
  - Focused check and PASS evidence: docs match the implemented behavior; `pnpm run check:ci` stays green
  - Return milestone: designer session result with changed files and test evidence
  - Stop / reassessment: none
- [ ] AC-7: Local closeout gate
  - Outcome: repository gate green and record ready for final verification
  - Known entrypoints and skill paths: `docs/agent/testing.md:299–400` (local closeout gate, Pi sidebar/layout/UI-preference rules), `C:/DEV/Proyectos/Webstorm/thoth-agents/skills/thoth-sdd/scripts/validate.mjs`
  - Inputs: accepted designer result
  - Dependencies: every designer unit above
  - Output: command results recorded in Verification, plus the user's live-check outcome
  - Owner: root (live check: user)
  - Writes: this record
  - Interface boundaries: none
  - Focused check and PASS evidence: full Vitest suites and typechecks for pi-sidebar, pi-core, pi-thoth-theme, pi-subagents, pi-questions-user, pi-background-tasks and pi-todo, each run separately with `--maxWorkers=2`; `pnpm install --frozen-lockfile`, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm run test:pi-extensions` and `git diff --check` exit 0; validator `--through verify` valid; live COST check in fullscreen and regular Pi modes reported by the user
  - Return milestone: ready for a fresh final Oracle
  - Stop / reassessment: a Windows timing failure is rerun once and both outcomes are reported; unrelated environment failures are reported with evidence, not treated as change failures

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review round 1: fresh thoth-oracle task `subtask_thoth-oracle_1793346142464_7c51c641`; delivered `thoth-gate-verdict` valid, kind `plan-review`, verdict `OKAY`, record `.thoth/changes/pi-sidebar-cost-share/pi-sidebar-cost-share.md`, `recordSha256` null (plan review is not digest-bound).
Nonblocking cautions incorporated after review without changing intent, acceptance or deltas: the AC-7 local gate now follows the full Pi sidebar rules of `docs/agent/testing.md`, the AC-5 check covers the COST head-block/title-only boundary, and Exploration notes that `SERIES_PALETTE` and `seriesMarker()` are already exported.
Implementation authorized by the user on 2026-10-30 through the question tool (`Implementar`), after the validated plan-review OKAY.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: PENDING
**Independent from implementer**: PENDING
**Verdict**: PENDING
**Reviewed record SHA-256**: PENDING

**Oracle envelope**:

```thoth-result
PENDING
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PENDING | check | evidence
- AC-2: PENDING | check | evidence
- AC-3: PENDING | check | evidence
- AC-4: PENDING | check | evidence
- AC-5: PENDING | check | evidence
- AC-6: PENDING | check | evidence
- AC-7: PENDING | check | evidence
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:4f4a72721e9f56ede60899576cb6e657f0245a009c069f6244cc7db2400b1fc2

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: PENDING
