# Change: pi-sidebar-bar-style

**Classification**: substantial
**Scope**: local
**Uncertainty**: low
**Risk**: low

## Exploration

- Follows open change `pi-sidebar-cost-share` (share-of-total COST bar). The user's live screenshots (2026-10-30) show the new behavior works, but the full-height block bar is heavy, and in a busy project (`$235`, `+99 more`) the `░` remainder texture dominates the bar row; the SESSION Context meter uses the same heavy blocks and `░` track.
- COST glyphs come from `segment()` and `marker()` in `pi-packages/pi-sidebar/src/panels/cost.ts:232–247` (`█` fill, `▌` cap on non-last segments, muted `░` remainder and remainder marker; ASCII digits and `.`).
- The Context meter is `contextMeter()` in `pi-packages/pi-sidebar/src/panels/rows.ts:101–112`, used only by the Context branch of `renderSessionRows()` (`:142–157`): eighth blocks `█▏…▉` plus a `░` track, all in the threshold role (`> 90` error, `> 70` warning, else success, `:147`), `cells = min(10, room − label − 1)`, ASCII `#`/`-` in whole cells. Tests pin the strings in `test/chrome.test.ts:275–279` (meter), `:183` (ASCII negative class) and `:293–308` (thresholds).
- Not shared: the pi-thoth-theme status line draws its own `◆◇⬖` bar (`pi-packages/pi-thoth-theme/src/status-line/layout.ts:128–155`), the work-panel context metric is text, and the antigravity `quotaBar` is separate.
- Preferences: `pi-packages/pi-sidebar/src/config.ts:16–32,44–72` persists `startup`, optional `width` and ordered `panels` in `~/.pi/agent/thoth-sidebar.json` (`PI_CODING_AGENT_DIR` override); the `/sidebar settings` overlay (`src/settings.ts:49–140`) edits visibility, order, startup and default width, Enter saves and Esc cancels; commands live in `src/session.ts:402–472`.
- `pi-tui` `visibleWidth` returns 1 for `━ ╸ ╾ ─ ○`; the `/sidebar cost` curves view already draws box-drawing lines in series colors (`src/curves.ts:78–115`). The theme `dim` color (thoth.json `#736850`) stays readable on dark backgrounds.
- Canonical baseline: `.thoth/specs/pi-ecosystem/spec.md` has no bar-style requirement; `pi-sidebar-cost-share` will modify that file when it archives, so this record's Source digest must be refreshed after that archive.

## Intent

The sidebar draws its COST share bar and SESSION Context meter as thin hairlines by default, with a persisted `/sidebar settings` choice to switch back to the classic block bars, keeping every share, legend, fold, running and threshold behavior unchanged.

## Non-goals

- No change to share allocation, ranking, legend columns, `+N more` folding, running `↑`, palette order, thresholds or ASCII output.
- No `/sidebar bars` command; the selector lives only in `/sidebar settings`.
- No change to the status-line `◆◇⬖` bar, its 70/90 threshold boundary, the curves overlay or other packages; no package version bumps.

## Acceptance

- AC-1: `thoth-sidebar.json` stores a bar style `thin` or `classic`, defaulting to `thin` when absent or invalid; the `/sidebar settings` overlay shows a `Bars` row that switches between both values, saved with Enter and discarded with Esc like the other rows, and saving re-renders the sidebar in the chosen style without restarting Pi.
- AC-2: In the thin style the COST bar draws each task segment with `━`, ends every non-last task segment in a `╸` half-cell cap (a one-cell segment is `╸` alone), draws the remainder segment as a dim `─` track, and marks the remainder legend entry with a dim `○`; cell allocation, segment colors, legend, fold and markers stay as in `pi-sidebar-cost-share`. For tasks costing $2.64, $0.73, $0.25 and $0.17 within $3.79 at width 50 the segments measure 32, 9, 3 and 2 cells: `━`×31 `╸`, `━`×8 `╸`, `━━╸`, `━━`.
- AC-3: In the thin style the Context meter uses up to 16 cells (fewer only when the row lacks room), fills `percent × cells` rounded to the nearest half cell with `━` and a `╾` for a trailing half cell, draws the rest as a dim `─` track, and keeps the fill, boundary and percentage in the existing threshold role; at 52% and 16 cells it reads `━━━━━━━━╾───────`.
- AC-4: The classic style renders exactly today's COST bar and 10-cell Context meter (existing glyph assertions pass against `classic`), and ASCII mode output is identical in both styles.
- AC-5: The style is part of the cached sidebar plan: switching styles re-plans once, and rendering keeps reading only cached state without per-render session traversal; existing performance and degradation checks stay green.
- AC-6: `pi-packages/pi-sidebar/README.md` and `docs/agent/harness-packaging.md` describe both styles, the default and the `Bars` settings row.

## Clarifications

- Style family (user, 2026-10-30, question tool): A, hairline `━ ╸ ╾` on a dim `─` track, for both COST and Context.
- Context length (user, 2026-10-30): 16 cells in the thin style.
- Selector (user, 2026-10-30): a persisted switch between the current classic bars and the thin ones, only inside `/sidebar settings`; no command.
- Default (user, 2026-10-30): thin.
- Classic means exactly today's rendering, including the 10-cell Context meter, as the user asked to keep "las barras clásicas actuales".

## Decisions

- Track glyph is solid `─`; if live testing shows it reading as a second border line, switching to `╌` is a same-intent adjustment inside this change.
- Every displayed COST entry keeps at least one cell; the remainder legend marker becomes `○` only in the thin style.
- ASCII mode ignores the style: both styles render today's ASCII output, including the 10-cell Context meter geometry and coloring, asserted as complete rows at widths 36 and 50.
- Degradation and glyph regressions are parameterized over both styles so thin-bar assertions actually execute.
- One small glyph module (for example `src/panels/meter.ts`) owns both glyph sets and the ASCII branch so `cost.ts` and `rows.ts` share them; `contextMeter()` returns fill and track separately so the track can be dim.
- The config field name and settings row label follow existing `config.ts`/`settings.ts` conventions (for example `bars: "thin" | "classic"` and a `Bars` row).
- Implementation owner: one thoth-designer session after `pi-sidebar-cost-share` is archived, on the same branch; root runs the local gate and the user live-checks both styles.
- The ADDED **Sidebar bar style preference** requirement does not overlap other pi-ecosystem requirements: **Thoth Pi sidebar** covers the settings overlay generally, and the **Sidebar cost share panel** requirement added by `pi-sidebar-cost-share` stays glyph-agnostic (segments distinguishable without color), which both styles satisfy.

## Durable deltas

- `ADDED pi-ecosystem` **Sidebar bar style preference** — `@thoth-agents/pi-sidebar` MUST persist a bar style preference that is edited only through the `/sidebar settings` overlay and defaults to `thin`, and MUST draw the Cost share bar and the Session context meter in that style: `thin` draws hairline segments (`━` with `╸` caps, `╾` for a trailing half cell) on a dim `─` track with a context meter of up to 16 cells, while `classic` keeps block bars with a `░` track and a context meter of up to 10 cells; ASCII mode MUST render identically in both styles, and saving a new style MUST re-render the sidebar without restarting Pi or traversing the session on each render.
  - GIVEN no saved bar style, four subagent tasks costing $2.64, $0.73, $0.25 and $0.17 and a session context at 52% at the default 50-column width; WHEN the sidebar renders and the user then selects `classic` in `/sidebar settings` and saves; THEN the Cost bar first shows hairline segments of 32, 9, 3 and 2 cells with `╸` caps and the context meter shows a 16-cell hairline with a `╾` boundary, after saving both render as block bars with a 10-cell context meter, and `thoth-sidebar.json` records `classic`.

## Plan

One thoth-designer session implements AC-1 to AC-6 test-first (skill `tdd`) inside `pi-packages/pi-sidebar`, after `pi-sidebar-cost-share` is archived, then applies a behavior-preserving `simplify` pass:

1. Preference: add the bar style to `src/config.ts` (normalization, default `thin`, round trip) and a `Bars` row to `src/settings.ts` (switching, dirty state, Enter save, Esc cancel).
2. Glyphs: a shared module with the thin and classic glyph sets (fill, cap, half, track, remainder marker) plus the unchanged ASCII branch.
3. COST: `segment()`, `marker()` and the remainder paint in `src/panels/cost.ts` take the style (thin remainder in `dim`).
4. Context: `contextMeter()` in `src/panels/rows.ts` returns fill and track; thin uses up to 16 cells with half-cell rounding and `╾`, classic stays unchanged.
5. Wiring: pass the saved style from `src/session.ts` into the panel build in `src/panels/sidebar.ts` and include it in the cached plan key so a saved change re-plans once.
6. Tests: config default/invalid/round trip, settings row save and cancel, thin and classic COST and Context rendering (`test/cost.test.ts`, `test/chrome.test.ts`), ASCII parity, `test/degradation.test.ts` and `test/performance.test.ts`.
7. Docs: package `README.md` (around L107 and L119) and `docs/agent/harness-packaging.md`.

Root then runs the Pi sidebar local closeout gate from `docs/agent/testing.md`, refreshes the Source digest after `pi-sidebar-cost-share` archives, runs the validator `--through verify`, collects the user's live check of both styles in both Pi modes, and requests a fresh final Oracle.

Risks: `━ ╸ ╾` are not yet confirmed in the user's Windows Terminal font (a preview snippet was offered); half-cell steps make tiny shares fainter (`╸`); a theme whose `dim` is close to the background would hide the track; the plan cache must key on the style or a saved change would not show until another update.

Focused verification seams: the pi-sidebar Vitest suite (config, settings, cost, chrome, degradation, performance, session), ASCII cases, widths 36 and 50, and a live check of both styles.

## Tasks

Use one checkbox row per independently acceptable work unit. Keep each checkbox
on one line in the validator-compatible form `- [ ] AC-n: ...`; indent the
remaining fields below it. Repeat an AC number when separate units contribute
to that acceptance outcome. The row text names one reviewable result; do not
combine separately acceptable outcomes into a phase-sized task. Fill the
indented fields with concrete information. For a read-only unit, write `none`
for owned writes.

- [x] AC-1: Persisted bar style preference with a `Bars` settings row
  - Outcome: config stores `thin`/`classic` (default `thin`, invalid normalized); `/sidebar settings` switches it with Enter save and Esc cancel; saving re-renders
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/config.ts:16–32,44–104`, `pi-packages/pi-sidebar/src/settings.ts:49–140`, `pi-packages/pi-sidebar/src/session.ts:402–472`, `pi-packages/pi-sidebar/test/config.test.ts`, `pi-packages/pi-sidebar/test/settings.test.ts`; skill `tdd`
  - Inputs: Clarifications and Decisions in this record; archived `pi-sidebar-cost-share` code
  - Dependencies: `pi-sidebar-cost-share` archived (root)
  - Output: preference, settings row and tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/src/**`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: existing config keys and settings rows unchanged; no new command
  - Focused check and PASS evidence: config and settings tests green, including default, invalid value, round trip, save and cancel
  - Return milestone: reported with the full designer session result
  - Stop / reassessment: the overlay cannot host a value row without restructuring other rows
- [x] AC-2: Thin COST share bar
  - Outcome: thin segments `━` with `╸` caps, dim `─` remainder and dim `○` remainder marker; 32/9/3/2 example exact
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/cost.ts:232–247` (`segment`, `marker`), `pi-packages/pi-sidebar/test/cost.test.ts`; skill `tdd`
  - Inputs: AC-2; AC-1 preference
  - Dependencies: AC-1 unit (same designer session)
  - Output: shared glyph module, cost rendering and tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/src/panels/**`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: allocation, legend, fold and running markers unchanged
  - Focused check and PASS evidence: cost tests assert the thin glyph strings and unchanged widths
  - Return milestone: reported with the full designer session result
  - Stop / reassessment: none
- [x] AC-3: Thin Context meter
  - Outcome: up to 16 cells, nearest-half-cell fill with `━`/`╾`, dim `─` track, threshold roles unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/rows.ts:101–157` (`contextMeter`, `renderSessionRows`), `pi-packages/pi-sidebar/test/chrome.test.ts:183,275–308`; skill `tdd`
  - Inputs: AC-3; AC-2 glyph module
  - Dependencies: AC-2 unit (same designer session)
  - Output: meter rendering and tests (52% at 16 cells, narrow rows, thresholds)
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/src/panels/**`, `pi-packages/pi-sidebar/test/**`
  - Interface boundaries: Session rows other than Context unchanged
  - Focused check and PASS evidence: chrome tests green with the thin meter strings and unchanged thresholds
  - Return milestone: reported with the full designer session result
  - Stop / reassessment: none
- [x] AC-4: Classic parity and ASCII identity
  - Outcome: classic renders exactly today's bars; ASCII identical in both styles
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/test/cost.test.ts`, `pi-packages/pi-sidebar/test/chrome.test.ts`, `pi-packages/pi-sidebar/test/degradation.test.ts`; skill `tdd`
  - Inputs: AC-4; AC-2 and AC-3 output
  - Dependencies: AC-3 unit (same designer session)
  - Output: parity tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/test/**`, `pi-packages/pi-sidebar/src/panels/**`
  - Interface boundaries: none
  - Focused check and PASS evidence: existing block-glyph assertions pass with `classic`; ASCII outputs equal across styles
  - Return milestone: reported with the full designer session result
  - Stop / reassessment: none
- [x] AC-5: Style in the cached plan without per-render work
  - Outcome: style keyed into the cached plan; a saved change re-plans once; no per-render session traversal
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/sidebar.ts` (cached plan), `pi-packages/pi-sidebar/test/performance.test.ts`; skill `tdd`
  - Inputs: AC-5; AC-1 to AC-4 output
  - Dependencies: AC-4 unit (same designer session)
  - Output: performance assertions
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/test/**`, `pi-packages/pi-sidebar/src/**`
  - Interface boundaries: none
  - Focused check and PASS evidence: performance and degradation tests green, including a re-plan on style change
  - Return milestone: reported with the full designer session result
  - Stop / reassessment: none
- [x] AC-6: Routed docs describe both bar styles
  - Outcome: README and harness-packaging guide document thin (default) and classic styles and the `Bars` settings row
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/README.md`, `docs/agent/harness-packaging.md`
  - Inputs: implemented behavior
  - Dependencies: AC-5 unit (same designer session)
  - Output: doc edits
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-sidebar/README.md`, `docs/agent/harness-packaging.md`
  - Interface boundaries: none
  - Focused check and PASS evidence: docs match behavior; `git diff --check` clean
  - Return milestone: designer session result with changed files and test evidence
  - Stop / reassessment: none
- [ ] AC-6: Local closeout gate and live check of both styles
  - Outcome: repository gate green, Source digest refreshed, record ready for final verification, user live check of thin and classic
  - Known entrypoints and skill paths: `docs/agent/testing.md:299–400`, `C:/DEV/Proyectos/Webstorm/thoth-agents/skills/thoth-sdd/scripts/validate.mjs`
  - Inputs: accepted designer result
  - Dependencies: every designer unit above
  - Output: command results and live-check outcome recorded in Verification
  - Owner: root (live check: user)
  - Writes: this record
  - Interface boundaries: none
  - Focused check and PASS evidence: Pi sidebar gate (seven package suites and typechecks with `--maxWorkers=2`, `pnpm install --frozen-lockfile`, `check:ci`, `typecheck`, `build`, `test:pi-extensions`, `git diff --check`) exit 0; validator `--through verify` valid; user confirms both styles in fullscreen and regular modes
  - Return milestone: ready for a fresh final Oracle
  - Stop / reassessment: a Windows timing failure is rerun once and both outcomes are reported

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review round 1: fresh thoth-oracle task `subtask_thoth-oracle_1793378338590_a1f86346`; delivered `thoth-gate-verdict` valid, kind `plan-review`, verdict `OKAY`, record `.thoth/changes/pi-sidebar-bar-style/pi-sidebar-bar-style.md`, `recordSha256` null (plan review is not digest-bound).
Nonblocking cautions incorporated after review without changing intent or deltas: ASCII parity keeps the 10-cell Context geometry in both styles, degradation and glyph tests are parameterized over both styles, and a later `─` to `╌` track switch must reconcile acceptance and delta wording before final review.
Implementation authorized by the user on 2026-10-30 through the question tool (`Implementar`), after the validated plan-review OKAY; dispatch waits until `pi-sidebar-cost-share` is archived.

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
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:30bed5c6a4af290f704c8d8f3515e2d48e7418dea716be642878b17698336990

Implementation (thoth-designer task `subtask_thoth-designer_1793379419853_a45c02f1`): pi-sidebar suite 21 files / 492 tests, typecheck and Biome green. Noted deviations: `bars` stays optional in the saved config and absent or invalid values fall back to `thin` at the use sites (an existing test pins the saved keys after `startup off`); `contextMeter` moved to the new `src/panels/meter.ts` and returns fill and track; ASCII digit handling for COST stays in `cost.ts`; test fixtures gained an optional `bars` argument and an ASCII render kit that keeps theme colors.
Local closeout gate (root, 2026-10-30, Windows): `pnpm install --frozen-lockfile`, `pnpm run check:ci` (954 files, no errors; the 767 warnings are unchanged from the previous gate), `pnpm run typecheck`, `pnpm run build`, `pnpm run test:pi-extensions`, pi-sidebar typecheck, pi-sidebar Vitest 21 files / 492 tests and `git diff --check` exit 0. pi-core, pi-thoth-theme, pi-subagents, pi-questions-user, pi-background-tasks and pi-todo are unchanged since today's green run for `pi-sidebar-cost-share` and do not depend on pi-sidebar, so those results are reused.

Source digest refreshed after `pi-sidebar-cost-share` archived (commit `2a4b8f90`), which modified **Thoth Pi sidebar** and added **Sidebar cost share panel**; the ADDED **Sidebar bar style preference** still does not overlap them.

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: PENDING
