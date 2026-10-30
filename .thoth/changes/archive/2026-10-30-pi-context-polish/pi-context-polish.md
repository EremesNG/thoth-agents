# Change: pi-context-polish

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: low

## Exploration

- Follows archived changes `pi-sidebar-cost-share` and `pi-sidebar-bar-style` (2026-10-30). The user asked for three follow-ups and made the sidebar the visual and threshold reference.
- COST remainder: `pi-packages/pi-sidebar/src/panels/cost.ts:52–56` caches revision, tasks, the ranked top ten, the total and `anyRunning`; `:63–67` derives running only from live tasks; `:115–134` recomputes flags and ranking on update; `:188–209` collapses to four tasks plus a remainder when there are more than five tasks or untracked cost of at least $0.005, and hardcodes the remainder as not running; `:314–329` reserves the trailing arrow cell (accent `↑`, ASCII `^`). `anyRunning` cannot tell hidden from visible running tasks, and the ten-entry ranking cannot see running tasks beyond rank ten. `test/cost.test.ts:699` asserts the old "remainder stays unmarked" rule; related seams at `cost.test.ts:616–673`, `session.test.ts:1354`, `performance.test.ts:442,557,581,630`.
- Context colors today:
  - Sidebar SESSION meter: raw `context.percent`, `> 90` error, `> 70` warning, else success (`pi-packages/pi-sidebar/src/panels/rows.ts:150–160`; `test/chrome.test.ts:356–358`). This is the reference rule.
  - Agents/Work panel running context metric: parses the displayed one-decimal text, `>= 90` error, `>= 70` warning, else dim (`pi-packages/pi-core/src/work-panel-render.ts:1055–1059,1102–1103`; `test/work-panel-two-line.test.ts:224–233`); the provider formats with `.toFixed(1)` (`pi-packages/pi-subagents/src/ui/work-panel-provider.ts:138–144`); finished rows stay dim (`:1074–1081`).
  - Editor-border context bar and percentage: raw `contextPercent`, `>= 90` error, `>= 70` warning, else success (`pi-packages/pi-thoth-theme/src/status-line/layout.ts:128–155`; `layout.test.ts:508–520`); also used by the native editor border (`src/input-box/decorate.ts:243–249`). No other numeric context-threshold owner was found.
- Editor-border bar geometry (`layout.ts:128–155`): eight cells, sixteen half steps, nonzero percentages force at least one half step; Unicode/Nerd `◆` full, `⬖` half, dim `◇` empty; ASCII bracketed `#`, `=`, dim `-`; fill and percentage in the threshold role. Narrow variants (`:193–197`) drop the bar, then the percentage; `input-box/frame.ts:85–104` and `decorate.test.ts:364–392` pin dropping order. Tests enumerate 0, 1, 3, 12, 50, 85 and 100% (`layout.test.ts:480–506`).
- pi-thoth-theme and pi-sidebar both depend on pi-core and not on each other; the sidebar hairline glyphs live in the internal `pi-sidebar/src/panels/meter.ts` (`━`, `╾`, `─`).
- Canonical spec `.thoth/specs/pi-ecosystem/spec.md`: **Sidebar cost share panel** (`:569`) says the panel MUST "mark running tasks and the total while any task runs" and "render only from state cached at update time"; no requirement pins context thresholds or the editor-border bar glyphs.
- Docs: `pi-sidebar/README.md:71–76,130–137,185–188`; `docs/agent/harness-packaging.md:414–417` still states the Agents rule "warning at 70% and error at 90%"; `pi-thoth-theme/README.md:174`.

## Intent

The COST remainder entry shows when a task it groups is running, every context-usage color follows the sidebar rule (warning above 70%, error above 90%), and the editor-border context bar adopts the sidebar's hairline look.

## Non-goals

- No change to the Session meter rule, to base roles (Agents keeps dim, Session and the editor border keep success), to finished-row dimming, or to the height-pressure `+N more` fold line.
- No precision transport for the Agents metric; it keeps judging the one-decimal value it receives.
- No change to editor-border geometry, ASCII form or narrow variants, no link to the sidebar `Bars` preference, no new pi-core API, and no package version bumps.

## Acceptance

- AC-1: When the COST legend shows a remainder entry that groups at least one running task (any tracked task ranked below the top four, including tasks beyond the top-ten ranking), that entry shows the accent `↑` (ASCII `^`) in its reserved column; a remainder with no running task, and the untracked-only `other` entry, show none. The flag is computed at update time, a change to it bumps the tracker revision, and rendering still reads only cached state.
- AC-2: Context usage colors follow one rule: base role up to 70%, warning above 70%, error above 90%. The sidebar Session meter keeps it; the Agents/Work panel running context metric changes from `>= 70`/`>= 90` to `> 70`/`> 90` on its one-decimal value (`70.0%` stays dim, `70.1%` warning, `90.0%` warning, `90.1%` error); the editor-border context bar and percentage change from `>= 70`/`>= 90` to `> 70`/`> 90` on the raw percentage (70 success, 70.5 warning, 90 warning, 90.5 error).
- AC-3: In Unicode and Nerd modes the editor-border context bar draws its eight cells with `━` for a full cell, `╾` for a half cell and a dim `─` for empty cells, keeping its half-step geometry, minimum half step for nonzero values, threshold role on fill and percentage, narrow variants and ASCII form; 50% reads `━━━━────`, 85% reads `━━━━━━━─` and 1% reads `╾───────`.
- AC-4: `pi-packages/pi-sidebar/README.md`, `pi-packages/pi-thoth-theme/README.md` (where it describes the bar) and `docs/agent/harness-packaging.md` describe the remainder arrow, the single context color rule and the hairline editor-border bar; the stale "warning at 70% and error at 90%" wording is gone.

## Clarifications

- Remainder arrow (user, 2026-10-30): `+N more` shows `↑` when a task it groups is running; the height-pressure fold line is unchanged because the header total already shows `↑`.
- Context colors (user, 2026-10-30, free text and question tool): the sidebar is the reference; one rule everywhere, warning above 70% and error above 90%, including the Agents rows and the Work panel; this supersedes the 2026-10-17 Agents rule "from 70% / from 90%".
- Editor-border bar style (user, 2026-10-30): leave `◆◇⬖` and adopt the sidebar's thin style, always thin, not tied to the `Bars` preference.

## Decisions

- Each surface compares the most precise percentage it already has: raw for the Session meter and the editor-border bar, the one-decimal value for the Agents metric. The resulting edge difference is at most 0.05 percentage points; carrying raw precision through metric metadata is out of scope.
- Base roles stay as they are: Agents dim, Session and editor border success.
- The editor-border bar keeps eight cells because the border budget is tight; only glyphs and thresholds change. pi-thoth-theme defines the three glyphs locally instead of importing pi-sidebar or adding a pi-core utility.
- The hidden-running flag is "any running tracked task ranked fifth or lower in the full update-time ranking"; it only shows when a remainder entry is displayed.
- Ownership: three independent units with non-overlapping writes run in parallel — pi-sidebar (AC-1, thoth-worker), pi-core thresholds (AC-2, thoth-worker), pi-thoth-theme editor-border bar (AC-2 and AC-3, thoth-designer); root edits `docs/agent/harness-packaging.md`, runs the gate and collects the live check.
- The ADDED requirements do not overlap existing ones: **Sidebar bar style preference** covers sidebar bars only, and no requirement pins context thresholds or the editor-border bar.

## Durable deltas

- `MODIFIED pi-ecosystem` **Sidebar cost share panel** — The pi-sidebar Cost panel MUST render one bar spanning the panel's inner width whose segments are sized by each displayed entry's share of the panel total (the larger of the authoritative subagent total and the tracked task sum) and stay distinguishable without color, colored from a series palette shared with the `/sidebar cost` curves view that starts with the theme warning color and places the error color last, followed by a ranked legend of at most five entries showing each task display name with its share and amount, where tasks beyond the top four or untracked cost collapse into one remainder entry; it MUST mark running tasks, the remainder entry while any task it groups runs, and the total while any task runs, MUST keep the bar together with at least one legend entry under height pressure while counting hidden tasks when folding, and MUST render only from state cached at update time.
  - GIVEN 23 subagent tasks whose top four cost $3.42, $1.96, $1.31 and $0.88 within a $9.64 total, the first of them and one hidden task still running, at the default 50-column width; WHEN the Cost panel renders; THEN it shows one full-width segmented bar, four legend entries with readable display names, shares and amounts, a `+19 more tasks` entry with `21%` and `$2.07`, `↑` on the running entry, on the `+19 more tasks` entry and on the total, and the `/sidebar cost ▸ curves` footer.
- `ADDED pi-ecosystem` **Context usage colors** — Every Thoth Pi surface that colors a context-usage percentage, namely the pi-sidebar Session context meter, the work-panel context metric of running Agents rows and the pi-thoth-theme editor-border context bar, MUST keep its base role up to 70%, use the warning role above 70% and the error role above 90%, judged on the most precise percentage that surface receives.
  - GIVEN context usage of 70%, 70.5%, 90% and 95%; WHEN the Session meter, a running Agents row and the editor-border bar render each value; THEN 70% keeps the base role, 70.5% and 90% use the warning role and 95% uses the error role on all three surfaces.
- `ADDED pi-ecosystem` **Editor-border context hairline bar** — The pi-thoth-theme editor-border context bar MUST draw its eight cells in Unicode and Nerd modes as hairlines, `━` for a full cell, `╾` for a half cell and a dim `─` for empty cells, with sixteen half steps where any nonzero percentage fills at least one half step, the filled cells and percentage in the context usage color, and its ASCII form and narrow variants unchanged.
  - GIVEN a context usage of 85% and a wide editor border in Unicode mode; WHEN the border renders; THEN the context shows `━━━━━━━─` followed by `85%` in the warning role, and in ASCII mode it shows the existing bracketed `#`/`=`/`-` bar.

## Plan

Three parallel test-first units (skill `tdd`, then `simplify`) with non-overlapping writes:

1. pi-sidebar (thoth-worker, AC-1): in `CostTracker.update` compute a cached hidden-running flag from the full ranking (any running task at rank five or lower) with revision bumps; mark the remainder entry in the existing reserved column; keep `other` unmarked. Update `test/cost.test.ts` (replace the `:699` assertion), `session.test.ts` and `performance.test.ts`; update `pi-sidebar/README.md`.
2. pi-core (thoth-worker, AC-2): change the Agents/Work context metric thresholds to `> 70`/`> 90` in `src/work-panel-render.ts:1055–1059` with boundary tests in `test/work-panel-two-line.test.ts` (70.0, 70.1, 90.0, 90.1, finished dim).
3. pi-thoth-theme (thoth-designer, AC-2 and AC-3): thresholds `> 70`/`> 90` and hairline glyphs in `src/status-line/layout.ts:128–155`; update `layout.test.ts:480–520` and any input-box/decorate snapshots; update `pi-thoth-theme/README.md` if it describes the bar.

Root then edits `docs/agent/harness-packaging.md` (AC-4), runs the Pi sidebar local closeout gate from `docs/agent/testing.md` (all seven package suites and typechecks because pi-core changes), the validator `--through verify`, commits, merges into the main checkout with the user's agreement, rebuilds the changed packages there, collects the user's live check (COST remainder arrow, Agents colors, editor-border bar) and requests a fresh final Oracle.

Risks: Agents judges a one-decimal value (edge difference up to 0.05 points); the hairline `━╾─` on the editor border may look different from the sidebar meter because it has eight cells instead of sixteen; pi-core is shared by several packages, so its suite and dependants must stay green; tests in other packages that pin `>= 70` coloring must be updated by the owning unit only.

Focused verification seams: pi-sidebar cost/session/performance tests; pi-core work-panel two-line tests; pi-thoth-theme layout and decorate tests; ASCII and narrow variants.

## Tasks

Use one checkbox row per independently acceptable work unit. Keep each checkbox
on one line in the validator-compatible form `- [ ] AC-n: ...`; indent the
remaining fields below it. Repeat an AC number when separate units contribute
to that acceptance outcome. The row text names one reviewable result; do not
combine separately acceptable outcomes into a phase-sized task. Fill the
indented fields with concrete information. For a read-only unit, write `none`
for owned writes.

- [x] AC-1: COST remainder entry marks a running grouped task
  - Outcome: cached hidden-running flag from the full update-time ranking; remainder `↑`/`^` when set; `other` never; revision bump on change
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/panels/cost.ts:52–67,115–134,188–209,314–329`, `pi-packages/pi-sidebar/test/cost.test.ts:616–699`, `test/session.test.ts:1354`, `test/performance.test.ts:442,557,581,630`, `pi-packages/pi-sidebar/README.md:130–137,185–188`; skill `tdd`
  - Inputs: Clarifications and Decisions in this record
  - Dependencies: none
  - Output: tracker flag, remainder marker, tests and README lines
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-sidebar/src/**`, `pi-packages/pi-sidebar/test/**`, `pi-packages/pi-sidebar/README.md`
  - Interface boundaries: fold line, header arrow, legend layout and other panels unchanged
  - Focused check and PASS evidence: pi-sidebar Vitest suite and typecheck green, including hidden-running set/clear beyond rank ten, `other` unmarked and a running-only replan
  - Return milestone: final report with tests, commands and changed files
  - Stop / reassessment: the flag cannot be kept at update time without per-render iteration
- [x] AC-2: Agents/Work context metric uses the sidebar thresholds
  - Outcome: `> 70` warning and `> 90` error on the one-decimal value; base dim and finished dimming unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/work-panel-render.ts:1055–1059,1074–1081,1102–1103`, `pi-packages/pi-core/test/work-panel-two-line.test.ts:224–235`; skill `tdd`
  - Inputs: Clarifications and Decisions
  - Dependencies: none
  - Output: threshold change and boundary tests (70.0, 70.1, 90.0, 90.1)
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/**`, `pi-packages/pi-core/test/**`, and only if they pin Agents context colors `pi-packages/pi-thoth-theme/src/work-panel-*.test.ts`
  - Interface boundaries: metric order, formatting and widths unchanged; no other pi-core behavior
  - Focused check and PASS evidence: pi-core Vitest suite and typecheck green
  - Return milestone: final report with tests, commands and changed files
  - Stop / reassessment: another package's non-test code needs a change
- [x] AC-3: Editor-border context bar uses hairlines and the sidebar thresholds
  - Outcome: `━`/`╾`/dim `─` cells, `> 70`/`> 90` roles, geometry, ASCII and narrow variants unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/status-line/layout.ts:128–155,193–197`, `src/status-line/layout.test.ts:480–520`, `src/input-box/decorate.ts:243–249`, `src/input-box/decorate.test.ts:364–392`, `pi-packages/pi-thoth-theme/README.md:174`; skill `tdd`
  - Inputs: Clarifications and Decisions; sidebar glyph reference `pi-packages/pi-sidebar/src/panels/meter.ts` (read-only)
  - Dependencies: none
  - Output: glyph and threshold change, updated tests (0/1/3/12/50/85/100% and 70/70.5/90/90.5 boundaries), README wording if it describes the bar
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/status-line/**`, `pi-packages/pi-thoth-theme/src/input-box/**` tests only if they pin the glyphs, `pi-packages/pi-thoth-theme/README.md`
  - Interface boundaries: `pi-thoth-theme/src/work-panel-*.test.ts` belong to the AC-2 unit; no pi-sidebar or pi-core edits
  - Focused check and PASS evidence: pi-thoth-theme Vitest suite and typecheck green
  - Return milestone: final report with rendered samples, tests, commands and changed files
  - Stop / reassessment: a glyph needs a shared module outside pi-thoth-theme
- [x] AC-4: Routed docs and local closeout gate
  - Outcome: `docs/agent/harness-packaging.md` states the single context rule, the remainder arrow and the hairline editor-border bar; Pi sidebar gate green; live check collected
  - Known entrypoints and skill paths: `docs/agent/harness-packaging.md:414–417`, `docs/agent/testing.md:299–400`, `C:/DEV/Proyectos/Webstorm/thoth-agents/skills/thoth-sdd/scripts/validate.mjs`
  - Inputs: accepted AC-1, AC-2 and AC-3 results
  - Dependencies: the three units above
  - Output: doc edit and gate results in Verification
  - Owner: root (live check: user)
  - Writes: `docs/agent/harness-packaging.md`, this record
  - Interface boundaries: none
  - Focused check and PASS evidence: seven package suites and typechecks with `--maxWorkers=2`, `pnpm install --frozen-lockfile`, `check:ci`, `typecheck`, `build`, `test:pi-extensions`, `git diff --check` exit 0; validator `--through verify` valid; user confirms the remainder arrow, Agents colors and editor-border bar live
  - Return milestone: ready for a fresh final Oracle
  - Stop / reassessment: a Windows timing failure is rerun once and both outcomes are reported

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: SKIPPED
**Plan review selection**: EXPLICIT_SKIP
**Implementation**: AUTHORIZED

Plan review explicitly skipped by the user on 2026-10-30 (question tool: `Seguir sin revisión`); implementation authorized separately the same day (`Implementar`).

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 81fbd817f96afd42fd81bfa45c21db837d2680fd5788a09e2fa48364ed5e02ad

Fresh Oracle round 1 (task subtask_thoth-oracle_1793386084564_e46e0ffb); harness gate verdict valid, kind final-verification, mode record, recordDigest match.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. No blocking findings. AC-1 through AC-4, Decisions, Non-goals and all three Durable deltas are satisfied.",
  "evidence": [
    {
      "id": "E1",
      "kind": "integrity",
      "locator": ".thoth/changes/pi-context-polish/pi-context-polish.md",
      "claim": "Independently calculated prefix SHA-256 matches the assigned digest. HEAD is 1e0b6862028182ebbce58889b8c06b7de448fce6; the only working-tree change is the AC-4 checkbox. Committed and working-tree diff checks pass.",
      "basis": "observed",
      "uncertainty": "None."
    },
    {
      "id": "E2",
      "kind": "source-review",
      "locator": "pi-packages/pi-sidebar/src/panels/cost.ts:58-139,193-222,334-340",
      "claim": "Update sorts all tracked tasks before truncating to ten and caches whether any task at rank five or lower runs. Running-state changes trigger revision increments. Rendering reads cached state; an untracked-only other entry cannot have a hidden running task. Remainder arrows use the existing reserved accent column and ASCII caret.",
      "basis": "observed",
      "uncertainty": "None."
    },
    {
      "id": "E3",
      "kind": "source-review",
      "locator": "pi-packages/pi-core/src/work-panel-render.ts:1055-1103; pi-packages/pi-sidebar/src/panels/rows.ts:150-160",
      "claim": "Agents uses strict >70 and >90 comparisons on received percentage text, retaining base dim and finished-row dimming. Session retains its strict comparisons on raw percentages and base success.",
      "basis": "observed",
      "uncertainty": "Agents' existing one-decimal precision is intentionally unchanged."
    },
    {
      "id": "E4",
      "kind": "source-review",
      "locator": "pi-packages/pi-thoth-theme/src/status-line/layout.ts:128-198",
      "claim": "Editor-border fill and percentage use strict >70 and >90 roles with success as base. Unicode/Nerd use ━, ╾ and dim ─. Eight-cell/sixteen-half-step geometry, minimum nonzero half step, ASCII rendering and narrow variants remain unchanged.",
      "basis": "observed",
      "uncertainty": "None."
    },
    {
      "id": "E5",
      "kind": "executed-tests",
      "locator": "Focused Vitest runs with --maxWorkers=2",
      "claim": "All 463 focused tests passed: sidebar cost/session/performance/chrome 273; core work-panel-two-line 15; theme layout/status-line/decorate/real-theme 175. Coverage includes hidden ranks beyond ten, set/clear and revision/cache behavior, other suppression, ASCII arrows, exact color boundaries, finished dimming, glyph samples and narrow rendering.",
      "basis": "observed",
      "uncertainty": "These are focused reruns, not a repeat of the broad closeout gate."
    },
    {
      "id": "E6",
      "kind": "documentation-review",
      "locator": "pi-packages/pi-sidebar/README.md:71-78,130-140,185-192; pi-packages/pi-thoth-theme/README.md:175-177; docs/agent/harness-packaging.md:417-420,493-499",
      "claim": "Routed documentation describes the remainder arrow, strict shared context rule and hairline editor-border bar. The obsolete at-70/at-90 threshold wording is absent.",
      "basis": "observed",
      "uncertainty": "None."
    },
    {
      "id": "E7",
      "kind": "contract-validation",
      "locator": ".thoth/specs/pi-ecosystem/spec.md:569-587; installed thoth-sdd validator --through verify",
      "claim": "Verify gate passes. Canonical baseline SHA-256 matches c605026ea9e607df835b7d1bbdb6968a35530543b00377b8fcb7e56dff493687. The modified cost requirement matches implementation; both added requirements introduce distinct behavior without overlapping existing requirements.",
      "basis": "observed",
      "uncertainty": "Validator overlap warnings were resolved by semantic baseline review."
    },
    {
      "id": "E8",
      "kind": "reported-validation",
      "locator": "Delegated task: ROOT-RECORDED EVIDENCE",
      "claim": "Root reports the full local gate and seven package suites/typechecks passing, rebuilt merged artifacts, and the user's post-restart live confirmation: Si se ve bien.",
      "basis": "observed",
      "uncertainty": "Broad checks, merge/rebuild and live appearance were reported by root, not independently repeated."
    }
  ],
  "verification": [
    {
      "check": "Record binding and baseline freshness",
      "method": "Independent hashes, git identity/status checks and installed verify gate.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E7"],
      "reason": "Assigned record digest and reviewed canonical baseline match."
    },
    {
      "check": "AC-1",
      "method": "Tracker/render-path inspection and focused cost, session and cache regressions.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E5"],
      "reason": "Full-ranking cached flag, revision invalidation, remainder marking and other suppression satisfy the contract."
    },
    {
      "check": "AC-2",
      "method": "Inspect all three threshold owners and execute boundary regressions.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E5"],
      "reason": "Strict thresholds and existing precision/base-role behavior are preserved as specified."
    },
    {
      "check": "AC-3",
      "method": "Review glyph-only geometry changes and execute layout/editor integration tests.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5"],
      "reason": "Hairline glyphs, colors and required examples pass; ASCII and narrow behavior remain unchanged."
    },
    {
      "check": "AC-4",
      "method": "Review routed documentation and root-provided closeout/live evidence.",
      "outcome": "pass",
      "evidenceIds": ["E6", "E8"],
      "reason": "Documentation matches implementation and removes the stale threshold rule."
    },
    {
      "check": "Decisions, Non-goals and Durable deltas",
      "method": "Review implementation diff against the record and canonical baseline.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E3", "E4", "E7"],
      "reason": "All three deltas match behavior; no precision transport, fold-line, geometry, preference coupling, pi-core API or package-version changes were introduced."
    }
  ],
  "risks": [
    {
      "description": "Agents retains the accepted one-decimal precision difference from raw-percentage surfaces near thresholds.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E3"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate and record this result, then complete closeout and archive without changing reviewed inputs.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-context-polish/pi-context-polish.md",
    "reviewedRecordSha256": "81fbd817f96afd42fd81bfa45c21db837d2680fd5788a09e2fa48364ed5e02ad"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | cached full-ranking hidden-running flag, remainder ↑/^ incl. beyond rank ten, other unmarked, revision replan (cost, session, performance tests) | Oracle r1 E2/E5
- AC-2: PASS | strict >70/>90 on Session, Agents (one-decimal) and editor border with base roles kept (chrome, work-panel-two-line, layout tests) | Oracle r1 E3/E4/E5
- AC-3: PASS | eight-cell ━/╾/dim ─ editor-border bar, ASCII and narrow variants unchanged (layout, status-line, decorate, real-theme tests) | Oracle r1 E4/E5
- AC-4: PASS | READMEs and harness-packaging docs; local gate green (seven packages); merged 9bb696e8 and rebuilt; user live check "Si se ve bien" | Oracle r1 E6/E8
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:c605026ea9e607df835b7d1bbdb6968a35530543b00377b8fcb7e56dff493687

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
