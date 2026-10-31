# Change: pi-animation-effect-levels

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

- The accepted `pi-animation-intensity` change (archive 2026-10-29) made the
  levels lower cadence: one process-wide clock (`pi-core/src/animation-clock.ts`,
  key `thoth.pi-core.animation-clock.v2`) ticks every 100 / 200 / 500 ms for
  `full` / `reduced` / `minimal` and not at all for `off`; `subscribeAnimationSteps`
  (`pi-core/src/animation-steps.ts:52-69`) advances one frame every
  `max(1, round(intendedMs / period))` ticks, and at `off` emits
  `{ frame: undefined, static: true }` every 1000 ms from an unref'd interval.
  Effects intended at 100 ms (input-border breathing, label shimmer) therefore
  run at half speed and 5 fps at `reduced`, and at one fifth speed and 2 fps at
  `minimal`; spinners slow down too. The user (level `reduced`) perceives this
  as choppy, stalling animation.
- Stepper consumers: `pi-core/src/work-panel-host.ts:405`,
  `pi-sidebar/src/session.ts:240`, `pi-thoth-theme/src/input-box/state.ts:81`
  (one subscription advances `effectStep` and the glyph step, then requests a
  render unconditionally, `:90-97`), `pi-thoth-theme/src/tools/ticker.ts:103`,
  `pi-subagents/src/tools/subagent-run.ts:170`, `subagent-continue.ts:117`,
  `pi-askcodex/src/ask-tool.ts:339`, `pi-antigravity-bridge/src/ask-tool.ts:798`.
  Spinner rows select frames from an explicit `animationFrame`
  (`pi-core/src/work-panel-render.ts:1671-1690`); static running glyphs come
  from `resolveStaticRunningGlyph()` (`pi-core/src/render-kit.ts:365-367`).
- Shimmer phase is step-derived (`pi-thoth-theme/src/input-box/gradient.ts:32-40,
  73-91`, 2400 ms breathing cycle); at `off` the phase is zero, so the working
  glyph is painted with `DIM = #736850` (`gradient.ts:32-39,68-69`) and looks
  switched off.
- Each package bundles its own pi-core copy; the shared registry keeps one
  clock across copies (precedent D7 of the archived record moved v1 to v2
  because a live timer runs its creator's scheduling closure).
- Separate symptom, not addressed here: in the user's Orca recording (15 fps GIF)
  the input-border shimmer advances, freezes about 1 s and then jumps ahead to the
  position its step count implies, so steps and render requests continue while
  the screen does not update. Three read-only explorations found no render gate
  or cache in our packages; each pi-tui alt-screen frame is one write wrapped in
  DEC 2026 synchronized output (`pi-tui/dist/tui-alt-screen.js:1484-1539`). A
  comparison in another terminal is pending with the user.

## Intent

Animation levels choose which effects animate, never how fast: every effect
that animates runs at its `full` speed and frame rate at every level, so no
level produces slowed or choppy animation. Lower levels save work by keeping
fewer effects animated, and a static working indicator keeps its active colour
instead of looking switched off.

## Non-goals

- Fixing the ~1 s freeze observed in Orca; it is tracked separately pending the
  terminal comparison.
- Restoring the 20 fps input-border breathing at `full` (user keeps 10 fps for now).
- Changing persisted setting values, the default level, icon modes, frame sets,
  elapsed formatting, the sidebar/work-panel layout or unrelated render caching.
- Package version bumps or a release.

## Acceptance

- AC-1: pi-core drives every enabled animation from one shared clock that ticks every 100 ms at `full`, `reduced` and `minimal` while an enabled subscriber exists and never runs with no enabled subscriber or at `off`; each enabled effect advances exactly one frame per `max(1, round(intendedMs / 100))` ticks at every level that enables it.
- AC-2: pi-core exposes effect kinds — continuous (`ambient`), secondary running indicators (`secondary`) and the primary working indicator (`primary`) — enabled per level as `full` = all three, `reduced` = secondary and primary, `minimal` = primary, `off` = none; a stepper whose kind is disabled behaves like today's `off` path (static emission with no clock subscription and an elapsed refresh at least every second) and switches live, in both directions, when the level changes.
- AC-3: The theme input box animates its working glyph as `primary` and its border breathing and label shimmer as `ambient`; when `ambient` is disabled the border and label are static in their active working colours, and at `off` the working glyph is the mode-aware static running glyph painted, together with the label, in the active working colour rather than the dimmed phase colour; at `full` the output is unchanged.
- AC-4: The theme-configured native Pi working indicator uses Pi's loader at 200 ms at `full`, `reduced` and `minimal`, and a single static frame at `off`.
- AC-5: Secondary running indicators — sidebar rows, pi-core work-panel host rows, theme tool-card footers, foreground `subagent_run`/`subagent_continue` progress, AskCodex and AskAntigravity cards — animate at `full` speed at `full` and `reduced`, and at `minimal` and `off` show the mode-aware static running glyph with elapsed time updating at least every second and no clock subscription.
- AC-6: `/thoth-animation` (selector and argument help) and the affected package READMEs describe the levels by which effects animate; persisted values `full`/`reduced`/`minimal`/`off` and the `full` default are unchanged.
- AC-7: The integrated closeout passes: `pnpm run build:pi-extensions`, the tests and typechecks of every affected package, `pnpm run check:ci` and `pnpm run typecheck`.

## Clarifications

- User chose "Always fluid: levels remove effects, not fps": `reduced` = spinners
  at normal speed without input-border breathing/shimmer; `minimal` = only the
  working indicator animated, other surfaces static with elapsed every second;
  `off` = no animation.
- User requires the `off` working indicator over the input editor to show in the
  yellow/animation colour, not dimmed.
- `full` keeps 10 fps breathing for now; revisit only if the user still notices
  choppiness after this change and the terminal investigation.
- User asked to plan this now while they compare terminals.

## Decisions

- D1: Effect kinds and level mapping as in AC-2. The primary working indicator
  is the input-box working glyph plus the native Pi working indicator; the label
  shimmer and border breathing are `ambient`; everything listed in AC-5 is
  `secondary`.
- D2: `subscribeAnimationSteps` gains a required effect `kind`; a disabled kind
  reuses the existing static emission path. pi-core also exports a kind-aware
  predicate (for example `isAnimationEffectEnabled(kind, level?)`) and every
  place that today selects the static running glyph, drops a retained frame or
  coalesces refreshes only when the level is `off` switches to "this effect's
  kind is disabled": `pi-core/src/work-panel-render.ts:1670` and the
  work-panel host coalescing, theme `src/render-kit/working.ts:10` and
  `src/render-kit/index.ts:257`, sidebar provider coalescing,
  `pi-subagents/src/render/tools/{progress,components,subagent-run}.ts` and both
  ask-tool renderers. A disabled emission must never leave a retained or
  default-zero animated frame on screen. The input box splits its single
  subscription into a `primary` glyph stepper and an `ambient` effect stepper.
- D3: The clock period becomes 100 ms for every animating level. The v2 timer
  reschedules through its creator's level-dependent cadence function
  (`pi-core/src/animation-clock.ts:71-110`), so a mixed older copy could keep
  200/500 ms ticks: the clock moves to a new registry key
  `thoth.pi-core.animation-clock.v3` with its own shape check, and v2 is left
  untouched, following archived D7.
- D4: Static colours: a disabled `ambient` effect renders with the active working
  colour (the breathing peak for the border, the label's active colour without a
  highlight), and the `off` working glyph uses that same active colour; `DIM` is
  no longer used for a running indicator.
- D5: `resolveStaticRunningGlyph()` and frame sets stay unchanged.
- D6: No package version bumps; release is a separate user decision.

## Durable deltas

- `MODIFIED pi-ecosystem` **Animation intensity** — `@thoth-agents/pi-thoth-theme` MUST offer an `animation` setting in `pi-thoth-theme.json` with the levels `full`, `reduced`, `minimal` and `off`, defaulting to `full` when missing or malformed, changeable at runtime through `/thoth-animation` and persisted. Levels MUST select which effects animate, never their speed: `full` animates continuous effects (input-border breathing and label shimmer), secondary running indicators (sidebar and work-panel rows, tool card footers, foreground subagent progress, AskCodex and AskAntigravity cards) and the primary working indicator (the input-box working glyph and the native Pi working indicator); `reduced` animates the secondary and primary indicators; `minimal` animates only the primary working indicator; `off` animates nothing. `@thoth-agents/pi-core` MUST drive first-party periodic animation through one shared clock ticking every 100 ms while an enabled effect is subscribed and not at all otherwise, and every enabled glyph or effect MUST advance by exactly one frame or step per fixed number of ticks derived from its intended cadence rather than from wall-clock time or per emission, so it keeps the same speed and frame order at every level that enables it; the theme-configured native Pi working indicator is the exception and MUST use Pi's loader at 200 ms at `full`, `reduced` and `minimal`. A disabled effect MUST be static without a clock subscription: disabled running indicators and tool footers show the mode-aware static running glyph, disabled continuous effects render in their active working colours rather than a dimmed phase, at `off` the native working indicator shows a single frame and the input-box working glyph and label use the active working colour, and elapsed times keep updating at least every second without animating.
  - GIVEN Nerd icons and a running subagent; WHEN the user runs `/thoth-animation reduced`, then `/thoth-animation minimal` and later `/thoth-animation off`; THEN at `reduced` the braille indicator steps through all ten frames in order at its `full` per-frame cadence while the input border stops breathing and shimmering in its active colours, at `minimal` the subagent row shows a static `◐` with advancing elapsed time while the input-box working glyph keeps animating, and after `off` no animation timer remains and the input-box working glyph and label show in the active working colour.
- `MODIFIED pi-ecosystem` **Standard tool status footer** — `@thoth-agents/pi-core` MUST define a render-kit contract that produces the tool card status footer from a status and the tool render context, with a plain-text fallback when no kit is registered; `@thoth-agents/pi-thoth-theme` MUST implement it so that every running first-party tool card (theme built-ins and kit producers) shows the theme working animation frame for the configured icon mode, or the static running glyph for that mode when the animation intensity is `minimal` or `off`, and elapsed time, and every finished tool card shows the theme completed or failed status icon for the configured icon mode, the elapsed time and the tool optional summary.
  - GIVEN a themed read, bash or subagent tool card with Nerd icons; WHEN it is running and then finishes; THEN its footer shows `<pyramid frame> · <elapsed>` while running (`◐ · <elapsed>` when the animation intensity is `minimal` or `off`) and `<completed icon> · <elapsed>[ · summary]` or `<failed icon> · <elapsed>[ · summary]` after finishing, and in ASCII mode the ASCII frame, separator and status icons.
- `MODIFIED multi-harness-agent-pack` **Run visible background Pi specialists** — Omitted mode MUST run specialists in background while respecting explicit modes, and the runtime MUST display truthful live execution metrics in a tree above input. Tool uses, lifetime tokens, available child-context percentage, average output speed in tokens per second (total output tokens over total generation time) and active elapsed time MUST remain readable even with long task/model text, using compact or separate metric rows as needed and marking absent values without fabrication. Running status MUST use an animated braille indicator, or the static running glyph when the user's Pi animation intensity is `minimal` or `off`, and terminal statuses MUST use simple distinguishable completion, cancellation and failure glyphs. Animation MUST remain inactive when no child runs and MUST clean up on task termination or session teardown without blocking root input. The widget MUST NOT consume keyboard input unless the root editor holds focus, so overlays, Thoth panels, native dialogs and other custom UIs receive their keys.
  - GIVEN a child running or queued and later completing or stopping, and an overlay possibly open; WHEN the UI renders, keys are pressed and the session tears down; THEN metrics including average output speed and status symbols remain truthful, keys reach the focused overlay, dialog or custom UI, root stays interactive and no idle animation timer remains.

## Plan

Approach: make the level an effect filter in pi-core and let each consumer
declare its effect kind, reusing the existing static path for disabled kinds.

- U1 pi-core (AC-1, AC-2, AC-5): add the effect-kind type and the kind-aware
  predicate; make `getAnimationPeriodMs` return 100 for every animating level (or
  replace it with a constant cadence plus an enabled-kind check); require `kind`
  in `subscribeAnimationSteps` and route disabled kinds to the static 1 s path,
  rescheduling on level changes in both directions; move the clock to the v3
  key (D3); declare `secondary` for the work-panel host and make
  `work-panel-render.ts` static-glyph selection and host coalescing kind-aware.
  Seams: `pi-core/test` clock, stepper and work-panel animation tests (100 ms
  ticks at every animating level, ticksPerStep from intended ms, disabled kind
  static with no clock subscription, live level switching, no timer without
  enabled subscribers, v2 registry untouched, `minimal` rows static even with a
  supplied or retained frame).
- U2 pi-thoth-theme (AC-3, AC-4, AC-6): split the input-box subscription into a
  `primary` glyph stepper and an `ambient` effect stepper; static ambient and
  `off` glyph/label use active working colours (D4); tool footer ticker declares
  `secondary` and the theme render-kit (`src/render-kit/working.ts`,
  `src/render-kit/index.ts`) selects the static glyph whenever `secondary` is
  disabled; native loader intervals 200/200/200 and a single frame at `off`;
  update `/thoth-animation` texts and the theme README. Seams:
  `src/input-box/*.test.ts`, `src/tools/ticker.test.ts`, render-kit tests, the
  animation command and native-indicator tests, `test/render-kit-real-sdk.test.ts`;
  `full` output unchanged; `minimal` footers static with supplied frames and with
  an absent kit; live `minimal`↔`reduced` transitions.
- U3 pi-sidebar (AC-5, AC-6): declare `secondary` for the sidebar stepper and
  make provider coalescing kind-aware; at `minimal` rows are static with
  second-level elapsed refresh, at `reduced` they animate at `full` speed;
  README if it describes levels. Seams: `test/session.test.ts`,
  `test/performance.test.ts`.
- U4 subagents and ask cards (AC-5, AC-6): declare `secondary` in
  `pi-subagents` run/continue progress, `pi-askcodex` and
  `pi-antigravity-bridge` ask tools, and make their renderers
  (`pi-subagents/src/render/tools/{progress,components,subagent-run}.ts`, both
  ask-tool renderers) select the static glyph whenever `secondary` is disabled;
  READMEs if they describe levels. Seams: each package's progress / ask-tool
  animation tests, including the existing
  `pi-askcodex/tests/ask-tool-animation.test.ts` minimal-level expectations.
- U5 closeout (AC-7): root runs the integrated gate after U1-U4 are accepted.

U2-U4 depend on U1's accepted API and own disjoint packages, so they run in
parallel. Package units run only their own package tests and typecheck (the
theme unit may build only its own package for the real-SDK test); the
cross-package `build:pi-extensions` runs once in U5. Risks: mixed bundled
pi-core copies sharing the registry (D3); `full` must stay byte-identical;
`reduced` now ticks at 100 ms whenever a secondary or primary effect is visible,
so its render rate rises versus today while `minimal` falls to the primary
indicator only. Canonical specs change only through the declared deltas at
archive.

## Tasks

- [x] AC-1: pi-core cadence, effect kinds and kind-aware stepper (U1)
  - Outcome: one 100 ms cadence for animating levels on the v3 clock key, level→kind mapping and kind-aware predicate, required `kind` on `subscribeAnimationSteps` with disabled kinds on the static path, work-panel host declared `secondary` with kind-aware static glyph selection and coalescing
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/animation-clock.ts:71-110`, `pi-packages/pi-core/src/animation-steps.ts`, `pi-packages/pi-core/src/work-panel-host.ts:405`, `pi-packages/pi-core/src/work-panel-render.ts:1670`, `pi-packages/pi-core/src/render-kit.ts:365-367`, `pi-packages/pi-core/test/`; skills `tdd`, `simplify`
  - Inputs: this record's Exploration, AC-1, AC-2, AC-5, D1-D3, D5
  - Dependencies: none
  - Output: pi-core source and tests, including the exported predicate name and signature for U2-U4
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/**`, `pi-packages/pi-core/test/**`, `pi-packages/pi-core/README.md`
  - Interface boundaries: exported pi-core API consumed by theme, sidebar, subagents, askcodex and antigravity bridge; `resolveStaticRunningGlyph` and frame sets unchanged; persisted level values unchanged
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-core test` and `pnpm --dir pi-packages/pi-core run typecheck` pass, with new tests for 100 ms ticks at `reduced`/`minimal`, per-kind enablement, static disabled kinds without clock subscription, live level switching, an untouched v2 registry and static `minimal` work-panel rows despite a supplied or retained frame
  - Return milestone: pi-core API and tests green
  - Stop / reassessment: a consumer outside the listed packages, or the v3 move needing more than a new key and shape check
- [x] AC-2: Effect-kind level mapping verified at the pi-core boundary (U1)
  - Outcome: tests prove `full`/`reduced`/`minimal`/`off` enable exactly the kinds in AC-2 and that switching levels moves subscribers between animated and static modes in both directions
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/animation-steps.ts`, `pi-packages/pi-core/test/`
  - Inputs: AC-2, D1, D2
  - Dependencies: none (delivered with U1)
  - Output: mapping and switching tests in pi-core
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/**`, `pi-packages/pi-core/test/**`
  - Interface boundaries: same as U1
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-core test` passes with the mapping and switching tests named in the result
  - Return milestone: with U1
  - Stop / reassessment: mapping ambiguity for a surface not listed in D1
- [x] AC-3: Theme input box primary glyph and ambient effects with active static colours (U2)
  - Outcome: input box uses a `primary` glyph stepper and an `ambient` effect stepper; disabled ambient and `off` glyph/label in active working colours; `full` output unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/input-box/state.ts:41-45,75-99`, `src/input-box/gradient.ts:32-40,68-69,73-91`, `src/input-box/decorate.ts`, `src/input-box/*.test.ts`; skills `tdd`, `simplify`
  - Inputs: accepted U1 API, AC-3, D2, D4
  - Dependencies: U1 accepted
  - Output: theme input-box source and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/input-box/**`, `pi-packages/pi-thoth-theme/src/status-line/**` only if needed for the render callback
  - Interface boundaries: editor decoration and status line rendering; no change to `full` bytes
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-thoth-theme test` and `run typecheck` pass, with tests for `reduced` (glyph animates, static active border/label), `minimal` (same) and `off` (static glyph and label in active colour, no `DIM`)
  - Return milestone: theme input-box tests green
  - Stop / reassessment: active colour undefined for a theme mode
- [x] AC-4: Native Pi working indicator cadence (U2)
  - Outcome: native loader at 200 ms for `full`, `reduced`, `minimal`; single frame at `off`
  - Known entrypoints and skill paths: pi-thoth-theme native working-indicator configuration (located by the worker within `pi-packages/pi-thoth-theme/src/`)
  - Inputs: AC-4
  - Dependencies: U1 accepted
  - Output: theme source and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/**` (indicator configuration and its tests)
  - Interface boundaries: Pi loader API
  - Focused check and PASS evidence: theme tests assert 200 ms at the three animating levels and a single frame at `off`
  - Return milestone: with the other U2 rows
  - Stop / reassessment: Pi loader cannot take the interval
- [x] AC-5: Theme tool-card footer and render-kit static when secondary is disabled (U2)
  - Outcome: footer ticker declared `secondary` animates at `full`/`reduced`; the render-kit shows the static glyph with 1 s elapsed at `minimal`/`off`, with supplied frames and with an absent kit
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/ticker.ts:103-111`, `src/tools/ticker.test.ts`, `src/render-kit/working.ts:10`, `src/render-kit/index.ts:257`, `test/render-kit-real-sdk.test.ts`
  - Inputs: accepted U1 API, AC-5, D2
  - Dependencies: U1 accepted
  - Output: ticker and render-kit source and tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/tools/**`, `pi-packages/pi-thoth-theme/src/render-kit/**`, `pi-packages/pi-thoth-theme/test/**`
  - Interface boundaries: render-kit footer contract
  - Focused check and PASS evidence: ticker and render-kit tests cover `reduced` animating, `minimal` static with a supplied frame and with no kit, and a live `minimal`↔`reduced` transition
  - Return milestone: with the other U2 rows
  - Stop / reassessment: none expected
- [x] AC-6: `/thoth-animation` texts and theme README describe effect levels (U2)
  - Outcome: selector and argument help describe effects per level; README updated; values and default unchanged
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/animation.ts`, `src/shared/config.ts`, `pi-packages/pi-thoth-theme/README.md`
  - Inputs: AC-6, D1
  - Dependencies: U1 accepted
  - Output: command texts, tests and README
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/animation.ts`, its tests, `pi-packages/pi-thoth-theme/README.md`
  - Interface boundaries: persisted `animation` values
  - Focused check and PASS evidence: theme command tests pass and assert the new descriptions
  - Return milestone: with the other U2 rows
  - Stop / reassessment: none expected
- [x] AC-5: Sidebar rows declared secondary (U3)
  - Outcome: sidebar stepper declared `secondary` and provider coalescing kind-aware; sidebar animates at `full` speed at `full`/`reduced`, static rows with second-level elapsed at `minimal`/`off`
  - Known entrypoints and skill paths: `pi-packages/pi-sidebar/src/session.ts:240-286`, `src/panels/sidebar.ts`, `test/session.test.ts`, `test/performance.test.ts`; skills `tdd`, `simplify`
  - Inputs: accepted U1 API, AC-5
  - Dependencies: U1 accepted
  - Output: sidebar source, tests and README if it describes levels
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-sidebar/src/**`, `pi-packages/pi-sidebar/test/**`, `pi-packages/pi-sidebar/README.md`
  - Interface boundaries: sidebar output and settings unchanged at `full`
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-sidebar test` and `run typecheck` pass with `reduced` and `minimal` cases
  - Return milestone: sidebar tests green
  - Stop / reassessment: plan cache keyed by level needs changes beyond the kind declaration
- [x] AC-5: Subagent progress and ask cards declared secondary (U4)
  - Outcome: `subagent_run`/`subagent_continue` progress, AskCodex and AskAntigravity cards declared `secondary` animate at `full`/`reduced`, and their renderers show the static glyph at `minimal`/`off` without a retained or default-zero frame
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/tools/subagent-run.ts:154-180`, `subagent-continue.ts:117`, `pi-packages/pi-subagents/src/render/tools/{progress,components,subagent-run}.ts`, `pi-packages/pi-askcodex/src/ask-tool.ts:339-350`, `pi-packages/pi-askcodex/tests/ask-tool-animation.test.ts:156-162`, `pi-packages/pi-antigravity-bridge/src/ask-tool.ts:798`; skills `tdd`, `simplify`
  - Inputs: accepted U1 API, AC-5, D2
  - Dependencies: U1 accepted
  - Output: source, tests and READMEs if they describe levels
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/tools/**`, `pi-packages/pi-subagents/src/render/**`, `pi-packages/pi-subagents/test/**`, `pi-packages/pi-askcodex/src/**`, `pi-packages/pi-askcodex/tests/**`, `pi-packages/pi-antigravity-bridge/src/**`, `pi-packages/pi-antigravity-bridge/tests/**`, the three READMEs
  - Interface boundaries: tool update payloads unchanged apart from frame values
  - Focused check and PASS evidence: each package's `test` and `typecheck` pass with `minimal` static cases, supplied frames and live `minimal`↔`reduced` transitions
  - Return milestone: three packages green
  - Stop / reassessment: a payload change visible to other consumers
- [x] AC-7: Integrated closeout gate (U5)
  - Outcome: all gate commands pass on the integrated diff
  - Known entrypoints and skill paths: root `package.json` scripts `build:pi-extensions`, `check:ci`, `typecheck`; package `test`/`typecheck` scripts
  - Inputs: accepted U1-U4
  - Dependencies: U1, U2, U3, U4 accepted
  - Output: command results recorded in Verification
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run build:pi-extensions`, then `pnpm --dir pi-packages/<pkg> test` and `run typecheck` for pi-core, pi-thoth-theme, pi-sidebar, pi-subagents, pi-askcodex and pi-antigravity-bridge, `pnpm run check:ci` and `pnpm run typecheck` all exit 0
  - Return milestone: gate complete
  - Stop / reassessment: a failure outside the changed packages is reported as environment, not fixed here

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Round 1 (fresh Oracle subtask_thoth-oracle_1793479255695_c087f915, validated verdict REJECT): kind declaration alone left off-only static selection, retained frames and coalescing in renderers; AskCodex tests live under tests/**. Both repaired in this record.
Round 2 (fresh Oracle subtask_thoth-oracle_1793479512787_10dae116): validated delivery verdict valid, kind plan-review, verdict OKAY, recordSha256 cab932c5c10ce39bcd365edcd2478d3822637d8bdc5ee2ef916f2f57d604cb48 (match).

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 0d26a9d5d8a0f01bfe810a16eb693218bd6c4df98770610dde14dc481ed9ec06

Final verification by a fresh Oracle (task subtask_thoth-oracle_1793481298836_96afa62b); validated delivery verdict: valid, kind final-verification, verdict PASS, mode record, recordDigest match.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1 through AC-7 are satisfied. No implementation blocker found. Default-worker test failures are consistent with unrelated timeout/cleanup cascades; bounded-worker suites pass.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record",
      "locator": ".thoth/changes/pi-animation-effect-levels/pi-animation-effect-levels.md",
      "claim": "Verify validation passes without warnings. Both canonical source digests match, and all three durable deltas correctly modify existing requirements. Record-prefix SHA-256 remained unchanged during review.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "execution",
      "locator": "pi-packages/pi-core",
      "claim": "1142 tests pass with --maxWorkers=2, covering fixed cadence, effect mapping, disabled static refreshes, bidirectional transitions, timer cleanup and untouched live v2 clocks. The untracked v2 fixture matches HEAD's clock implementation apart from its introductory comment.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "execution",
      "locator": "pi-packages/pi-thoth-theme",
      "claim": "1444 tests pass with PI_IMAGE_PROTOCOL=none. Coverage includes primary/ambient separation, active static colours across icon/colour modes, retained-frame replacement, native loader configuration, command help and unchanged full-level byte assertions. Pi's loader starts no interval for a single frame.",
      "basis": "observed",
      "uncertainty": "No external-terminal visual comparison performed."
    },
    {
      "id": "E4",
      "kind": "execution",
      "locator": "pi-packages/{pi-sidebar,pi-subagents,pi-askcodex,pi-antigravity-bridge}",
      "claim": "Complete suites pass with --maxWorkers=2: sidebar 524; subagents 2021 plus 1 skipped; AskCodex 315 plus 4 skipped; Antigravity 1153 plus 12 skipped. Reviewed renderers suppress supplied/default/retained animated frames when secondary effects are disabled; tests cover static elapsed refresh and live transitions.",
      "basis": "observed",
      "uncertainty": "Existing skipped tests remain skipped."
    },
    {
      "id": "E5",
      "kind": "execution",
      "locator": "Affected package typechecks and root check:ci/typecheck",
      "claim": "All six affected package typechecks, pnpm run check:ci and pnpm run typecheck exit successfully.",
      "basis": "observed",
      "uncertainty": "Biome reports existing warnings and informational diagnostics."
    },
    {
      "id": "E6",
      "kind": "build-verification",
      "locator": "scripts/build-pi-extensions.mjs",
      "claim": "Read-only esbuild executions using the script's bundle options successfully reproduce byte-identical dist/index.ts output for all ten extension packages.",
      "basis": "observed",
      "uncertainty": "The reported successful pnpm build was reused; destructive dist recreation and asset copying were not repeated."
    },
    {
      "id": "E7",
      "kind": "failure-analysis",
      "locator": "pi-packages/pi-subagents/test/history-compaction.test.ts:193-240",
      "claim": "Default-worker execution reproduced four failures and one unhandled error, all in unchanged history-compaction tests: a 5-second late-process timeout followed by cleanup/recursive DatabaseSync.exec spy failures. Animation tests passed. Compaction, manager and helper files match HEAD; the complete bounded-worker suite passes. A parallel default core run also timed out during SDK-dependent tests, then passed completely with bounded workers.",
      "basis": "observed",
      "uncertainty": "Resource contention is the supported explanation, not a baseline-controlled proof. Names from the original integrated failure were unavailable."
    },
    {
      "id": "E8",
      "kind": "diff-review",
      "locator": "git diff and untracked animation-clock-v2.ts",
      "claim": "All 40 implementation/documentation/test files are in declared scope. No version, generated tracked, secret or unrelated changes found. Full-level rendering formulas and frame sets remain unchanged. Config values/default remain unchanged. Final implementation fingerprint: c33d4b0ab491d95d161f71d7e4b050056b15f24b571a42d54462cda5e5053b5c.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E9",
      "kind": "memory",
      "locator": "thoth-mem:5201095c-275f-490b-88a9-ce006f5e37df",
      "claim": "Read-only project recall confirmed historical v2 context for git:3726a62c-51e1-43ba-a466-57d41c5b7048. No memory writes or session-lifecycle attribution performed.",
      "basis": "observed",
      "uncertainty": "Historical context only; current judgment uses workspace evidence."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Clock/stepper source review and complete core suite",
      "outcome": "pass",
      "evidenceIds": ["E2"],
      "reason": "Enabled effects share 100 ms ticks and intended-cadence stepping; disabled-only subscriptions leave no animation timer."
    },
    {
      "check": "AC-2",
      "method": "Mapping, static refresh and transition tests",
      "outcome": "pass",
      "evidenceIds": ["E2"],
      "reason": "Exact kind mapping and live scheduling changes verified."
    },
    {
      "check": "AC-3",
      "method": "Theme source review, colour assertions and full-level regression tests",
      "outcome": "pass",
      "evidenceIds": ["E3", "E8"],
      "reason": "Static ambient effects and off glyph/label use active colours; full output is preserved."
    },
    {
      "check": "AC-4",
      "method": "Configuration tests and installed Pi loader inspection",
      "outcome": "pass",
      "evidenceIds": ["E3"],
      "reason": "200 ms at all enabled levels; one static frame and no loader interval at off."
    },
    {
      "check": "AC-5",
      "method": "Consumer source review and complete affected suites",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4"],
      "reason": "Secondary indicators animate at full speed only when enabled and otherwise show mode-aware static glyphs with second-level elapsed refresh."
    },
    {
      "check": "AC-6",
      "method": "Command tests, README/config diff review",
      "outcome": "pass",
      "evidenceIds": ["E3", "E8"],
      "reason": "Effect-based help is accurate; persisted values and full default are unchanged."
    },
    {
      "check": "AC-7",
      "method": "Complete affected suites, typechecks, root checks and read-only bundle reproduction",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4", "E5", "E6"],
      "reason": "Integrated artifacts and checks pass with documented environment/concurrency controls."
    },
    {
      "check": "Unrestricted-worker reliability",
      "method": "Independent default-worker executions and failure tracing",
      "outcome": "fail",
      "evidenceIds": ["E7"],
      "reason": "Timeout-sensitive test infrastructure remains unreliable under high concurrency; no animation regression reproduced."
    },
    {
      "check": "Record binding, durable deltas and scope",
      "method": "Validator, canonical comparison, SHA-256 calculation and complete diff review",
      "outcome": "pass",
      "evidenceIds": ["E1", "E8"],
      "reason": "Baselines match, deltas preserve unrelated requirements, and review inputs remain consistent."
    }
  ],
  "risks": [
    {
      "description": "Default-worker runs can still fail through timeout and cleanup cascades. Record the reproduced history-compaction failures and bounded-worker commands rather than describing every run as green.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["E7"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Record this review and its test caveats, validate closeout, then archive the declared deltas.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-animation-effect-levels/pi-animation-effect-levels.md",
    "reviewedRecordSha256": "0d26a9d5d8a0f01bfe810a16eb693218bd6c4df98770610dde14dc481ed9ec06"
  }
}
```

- AC-1: PASS | `pnpm --dir pi-packages/pi-core test` | 1142 passed; 100 ms ticks at every animating level, intended-cadence stepping, no timer without enabled subscribers, live v2 registry untouched (test/animation-clock.test.ts, test/animation-steps.test.ts)
- AC-2: PASS | `pnpm --dir pi-packages/pi-core test` | exact kind mapping per level, disabled kinds static without clock subscription, live switching both directions (test/animation-steps.test.ts)
- AC-3: PASS | `PI_IMAGE_PROTOCOL=none pnpm --dir pi-packages/pi-thoth-theme test` | 1444 passed; primary/ambient split, active static colours, off glyph and label never DIM, full-level bytes unchanged (src/input-box/*.test.ts)
- AC-4: PASS | `PI_IMAGE_PROTOCOL=none pnpm --dir pi-packages/pi-thoth-theme test` | native loader 200 ms at full/reduced/minimal, single frame and no interval at off (src/index.test.ts)
- AC-5: PASS | package tests for pi-core, pi-thoth-theme, pi-sidebar (524), pi-subagents (2021, 1 skipped), pi-askcodex (315, 4 skipped), pi-antigravity-bridge (`--maxWorkers=2`, 1153, 12 skipped) | secondary indicators static at minimal/off with supplied or retained frames, second-level elapsed, live transitions
- AC-6: PASS | theme command tests and README diff review | effect-based `/thoth-animation` help; persisted values and full default unchanged
- AC-7: PASS | `pnpm run build:pi-extensions`; affected package tests and typechecks (plus pi-todo, pi-background-tasks); `pnpm run check:ci`; `pnpm run typecheck` | all exit 0 with the environment and concurrency controls noted below

AC-7 notes: theme tests need `PI_IMAGE_PROTOCOL=none` inside Orca (inherited kitty image protocol fails the unchanged `generic.test.ts:258` image test); antigravity runs with `--maxWorkers=2` (default concurrency hits known timing flakes in tests/driver.test.ts and tests/sessions.test.ts; Biome excludes that package). The first integrated pi-subagents run failed 4 tests plus 1 error (names not captured); four reruns passed 2021/1 skipped, and the Oracle reproduced the default-worker failures in unchanged `test/history-compaction.test.ts:193-240` (5 s late-process timeout then cleanup cascade), not in animation tests.
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:6a6d863578d5dd87f8502a7eea69ab050c07b7335b39301db452fc18164f8e9e
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:d5da5fef996990429b771bc4bee1e9e27952a6b27ece1d2987441ea28e0e72ec

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
