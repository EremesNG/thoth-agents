# Change: pi-animation-intensity

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

User goal: keep typing in the Pi TUI fluid while subagents run. The largest
sustained main-thread cost left is Pi TUI rendering (~7.6-9.3 s/min, ~250-570
timer-driven frames/min while children run; C:/temp/pi-prof-analysis/round5*,
round6*, outside the repository). gentle-shell addressed a similar parent CPU issue
with user-selectable animation modes (issue #1142, PR #1241; memory topic
pi-subagents/external-comparison).

Current animation inventory (paths relative to `pi-packages/`):

| Surface | Frames and computation | Driver |
|---|---|---|
| Input working glyph | `△ ◭ ▲ ◮` / ASCII `. o O 0`; `floor(now/200)%4` | shared clock (`pi-thoth-theme/src/input-box/state.ts:27,64-65`) |
| Input border breathing, label shimmer | 2400 ms cosine/band from `Date.now()` | shared clock (`pi-thoth-theme/src/input-box/gradient.ts:16-36,73-99`, `decorate.ts:164`) |
| Native Pi working indicator | theme frames, `intervalMs: 200` | Pi loader timer (`pi-thoth-theme/src/index.ts:59-65`) |
| Tool status footer glyph | `floor(elapsedMs/1000)` over working frames; a caller-supplied `frame` indexes spinner frames instead | per-card 1000 ms invalidate (`pi-thoth-theme/src/render-kit/working.ts:6-9`, `render-kit/index.ts:237-258`, `tools/ticker.ts:69-100`) |
| Work-panel running rows | `floor(now/100)` braille | shared clock (`pi-core/src/work-panel-render.ts:1669-1678`, `work-panel-host.ts:377-410`) |
| Sidebar running rows | `floor(Date.now()/100)` | shared clock (`pi-sidebar/src/panels/sidebar.ts:554-555`, `session.ts:231`) |
| Foreground `subagent_run` progress | braille `frame++` on every emit | own 250 ms heartbeat (`pi-subagents/src/render/tools/progress.ts:9-17`, `tools/subagent-run.ts:150-193`) |
| Foreground `subagent_continue` progress | `frame++` on emissions | own heartbeat (`pi-subagents/src/tools/subagent-continue.ts:65-109`) |
| AskCodex tool card | wall-clock-derived frame, periodic emits | own timer (`pi-askcodex/src/ask-tool.ts:169-172,331-342`) |
| AskAntigravity tool card | wall-clock-derived frame, periodic emits | own timer (`pi-antigravity-bridge/src/ask-tool.ts:543-546,795-804`) |

Background tasks, todo and question surfaces render through shared work-panel and
render-kit code; theme welcome and status line have no independent animation driver.
Wall-clock frame derivation skips frames at slower ticks (a ten-frame braille
sampled every 500 ms shows only two frames; 250 ms alternates steps of 2 and 3).

Shared clock (`pi-core/src/animation-clock.ts:1-96`): process-global registry
`Symbol.for('thoth.pi-core.animation-clock.v1')` with version, listeners and timer,
shape-checked with a module-local fallback; listeners receive only a timestamp;
each tick's callback recursively schedules the next with the module-local 100 ms
logic of the copy that started it; the timer exists only while subscribers exist.
Extension bundles inline pi-core (`scripts/build-pi-extensions.mjs:54-67`), so
several copies share the registry (`pi-core/test/animation-clock.test.ts:38-66`). A
read-only experiment (plan review) showed that additively hydrating new fields onto
a live v1 registry cannot change cadence or stop it: the legacy callback keeps
scheduling itself and passes no tick counter. Sidebar and work panel also defer
provider-change refreshes to the next tick while animating
(`pi-sidebar/src/session.ts:231-235`, `pi-core/src/work-panel-host.ts:399-405`).

Theme configuration (`pi-thoth-theme/src/shared/config.ts:13-96`): `icons`,
`statusLine`, `inputBox`, `tools`, `welcome`; path
`${PI_CODING_AGENT_DIR || ~/.pi/agent}/pi-thoth-theme.json`; read at extension
load; no command, settings UI or write API exists (`pi-thoth-theme/src/index.ts:15-72`).

Native working indicator (installed Pi 1.4.0 and dependency 1.0.2):
`setWorkingIndicator({frames, intervalMs})` updates at runtime
(`modes/interactive/interactive-mode.js:1831-1837` / `:1799-1805`); the Pi loader
advances one frame per interval; a single frame stops its timer; a nonpositive
interval falls back to 80 ms (pi-tui `components/loader.js:46-61`). Retry,
compaction and branch-summary loaders are separate Pi-core loaders not controlled by
that setter. Command and selector APIs exist across the supported range.

Glyph resolution: braille, triangle and ASCII sets live in
`pi-thoth-theme/src/shared/icons.ts:66-79` with fallbacks in
`pi-core/src/render-kit.ts:277-290`, `pi-core/src/testing.ts:20` and
`pi-subagents/src/render/tools/progress.ts:9-15`; `resolveFrames`/`resolveIcon`
consult the registered kit (`pi-core/src/render-kit.ts:294-324`). A mode-aware
static running glyph already exists: `◐` for Nerd/Unicode and `*` for ASCII
(`pi-thoth-theme/src/shared/icons.ts:88-89`, `pi-core/src/render-kit.ts:329-330`).

Spec constraints: `.thoth/specs/pi-ecosystem/spec.md` "Standard tool status footer"
requires running cards to show the theme working animation frame;
`.thoth/specs/multi-harness-agent-pack/spec.md` "Run visible background Pi
specialists" requires an animated braille running indicator. No canonical
requirement fixes the clock cadence.

## Intent

The user can choose how much the Thoth Pi UI animates (`full`, `reduced`,
`minimal`, `off`); every first-party animation follows that choice, steps through
all of its frames in order at any speed, and with `off` shows static in-progress
icons and runs no periodic animation timer.

## Non-goals

- Pi-core retry, compaction and branch-summary loaders and Pi TUI render cost.
- Per-surface intensity overrides or new glyph sets beyond the existing static
  running glyph.
- Changing what elapsed-time and data refreshes show; the subagent overlay 1 s
  refresh.
- Boundary-only subagent persistence (change `pi-subagent-boundary-persistence`)
  and off-thread WAL checkpoints.
- Package version bumps, push or release.

## Acceptance

- AC-1: pi-core provides a shared animation clock under a new versioned registry key (`v2`) with levels `full`, `reduced`, `minimal` and `off` and tick periods of 100, 200 and 500 ms (no timer at `off`); it ticks on period boundaries, passes every listener a tick counter that increases by exactly one per tick, applies a level change immediately and notifies level-change subscribers, and defaults to `full`; separately loaded new copies share one v2 clock, while a live legacy v1 clock from previous code is left untouched and stops when its own subscribers leave, in either load order.
- AC-2: pi-core provides an animation stepper that, at `full`, `reduced` and `minimal`, calls back on the shared clock every `max(1, round(intendedMs / periodMs))` ticks with a frame index increasing by exactly one, and at `off` calls back every 1000 ms with a static marker; the work panel, sidebar, input working glyph, tool status footer glyph, foreground `subagent_run` and `subagent_continue` progress, AskCodex and AskAntigravity cards step their frames through it (or through the clock tick counter at the same rule) and never from wall-clock time or per emission, so at every level consecutive steps show every frame in order.
- AC-3: The input border breathing and the working-label shimmer advance one evenly spaced step per tick, dividing their cycle into 24, 12 and 5 steps at `full`, `reduced` and `minimal`.
- AC-4: With `off`, no first-party periodic animation timer runs: running indicators and tool footers show the mode-aware static running glyph (`◐` Nerd/Unicode, `*` ASCII) even when a caller supplies a frame, the border and label are static, the native working indicator shows a single static frame, elapsed times keep updating every second, and sidebar and work-panel provider changes render without waiting for a tick.
- AC-5: `pi-thoth-theme.json` accepts `animation` with `full`, `reduced`, `minimal` or `off`, defaulting to `full` when missing or malformed; `/thoth-animation` without arguments opens a selector marking the current level and with a valid argument applies it, both saving the file atomically and applying immediately without restart, while an invalid argument is rejected with a message and leaves the configuration unchanged; the native working indicator uses Pi's loader with 200, 200 and 500 ms intervals at `full`, `reduced` and `minimal`.
- AC-6: Without the theme installed, every animation behaves as at `full`.
- AC-7: Tests, typecheck, Biome and builds pass for pi-core, pi-thoth-theme, pi-sidebar, pi-subagents, pi-askcodex and pi-antigravity-bridge, the bundled extension builds succeed, and root `pnpm run check:ci` and `pnpm run typecheck` pass.

## Clarifications

- Levels and periods: `full` 100 ms, `reduced` 200 ms, `minimal` 500 ms, plus `off` (user choice); `off` shows static in-progress icons instead of animation.
- Default level: `full`, preserving current visuals (user choice).
- Scope: all first-party animations, including the tool status footer, foreground subagent progress, bridge tool cards and the native working indicator interval set by the theme (user choice).
- Setting home: `pi-thoth-theme.json`, changed through `/thoth-animation` (selector without arguments, direct value with an argument), applied immediately (user choice).
- Static icon: the existing running glyph `◐` (Nerd/Unicode) and `*` (ASCII) (user choice).
- Requirement from the user: at any speed every animated icon keeps animating smoothly, with no skipped frames and no aliasing that makes it look static.

## Decisions

- D1: The theme owns the persisted setting and pushes the level into the pi-core clock registry at load, session start and on change; other packages read level and ticks only from pi-core; without the theme the clock stays at `full`.
- D2: Frames are tick-stepped through one pi-core stepper rule: each surface has an intended frame period at `full` (braille 100 ms, input glyph 200 ms, foreground subagent and bridge progress 200 ms, tool footer glyph 1000 ms) and advances one frame every `max(1, round(intendedMs / periodMs))` ticks; surfaces whose callback also refreshes elapsed time get the 1000 ms static-marker refresh at `off`.
- D3: Continuous effects take `round(2400 / periodMs)` evenly spaced steps per cycle (24 / 12 / 5).
- D4: The tool status footer glyph is driven by the stepper (intended 1000 ms), so each step both advances the glyph and refreshes elapsed time; the theme footer renders the static running glyph at `off` regardless of any caller-supplied frame, and caller-supplied frames come from the stepper.
- D5: The only first-party animation not driven by the shared clock is the theme-configured native Pi working indicator: Pi's loader steps it one frame per interval (200 / 200 / 500 ms), and at `off` it receives a single frame holding the static running glyph.
- D6: With `off` the sidebar and work panel behave as non-animating: no clock subscription, static glyphs, and immediate change-gated refreshes; a level change re-renders subscribers so they switch modes at once.
- D7: The clock moves to a new registry key `thoth.pi-core.animation-clock.v2` with its own shape check. A legacy v1 registry is never modified: its live timer and listeners belong to old module copies, keep their old 100 ms behavior until those copies unsubscribe on teardown, and then stop. This replaces additive hydration because a live v1 timer runs the old scheduling closure, which cannot be taken over safely.

## Durable deltas

- `ADDED pi-ecosystem` **Animation intensity** — `@thoth-agents/pi-thoth-theme` MUST offer an `animation` setting in `pi-thoth-theme.json` with the levels `full`, `reduced`, `minimal` and `off`, defaulting to `full` when missing or malformed, changeable at runtime through `/thoth-animation` and persisted; `@thoth-agents/pi-core` MUST drive first-party periodic animation through one shared clock ticking every 100, 200 or 500 ms for `full`, `reduced` and `minimal` and not at all for `off`, and every animated glyph or effect MUST advance by exactly one frame or step per fixed number of ticks rather than from wall-clock time or per emission, so every frame appears in order at every level; the theme-configured native Pi working indicator is the exception and MUST use Pi's loader at 200, 200 or 500 ms; with `off`, running indicators and tool footers MUST show the mode-aware static running glyph, continuous effects MUST be static and the native working indicator MUST show a single frame, while elapsed times keep updating at least every second without animating.
  - GIVEN Nerd icons and a running subagent; WHEN the user runs `/thoth-animation minimal` and later `/thoth-animation off`; THEN the braille indicator steps through all ten frames in order at one frame per 500 ms, and after `off` it shows a static `◐` with no animation timer while its elapsed time still advances.
- `MODIFIED pi-ecosystem` **Standard tool status footer** — `@thoth-agents/pi-core` MUST define a render-kit contract that produces the tool card status footer from a status and the tool render context, with a plain-text fallback when no kit is registered; `@thoth-agents/pi-thoth-theme` MUST implement it so that every running first-party tool card (theme built-ins and kit producers) shows the theme working animation frame for the configured icon mode, or the static running glyph for that mode when the animation intensity is `off`, and elapsed time, and every finished tool card shows the theme completed or failed status icon for the configured icon mode, the elapsed time and the tool optional summary.
  - GIVEN a themed read, bash or subagent tool card with Nerd icons; WHEN it is running and then finishes; THEN its footer shows `<pyramid frame> · <elapsed>` while running (`◐ · <elapsed>` when the animation intensity is `off`) and `<completed icon> · <elapsed>[ · summary]` or `<failed icon> · <elapsed>[ · summary]` after finishing, and in ASCII mode the ASCII frame, separator and status icons.
- `MODIFIED multi-harness-agent-pack` **Run visible background Pi specialists** — Omitted mode MUST run specialists in background while respecting explicit modes, and the runtime MUST display truthful live execution metrics in a tree above input. Tool uses, lifetime tokens, available child-context percentage, average output speed in tokens per second (total output tokens over total generation time) and active elapsed time MUST remain readable even with long task/model text, using compact or separate metric rows as needed and marking absent values without fabrication. Running status MUST use an animated braille indicator, or the static running glyph when the user's Pi animation intensity is `off`, and terminal statuses MUST use simple distinguishable completion, cancellation and failure glyphs. Animation MUST remain inactive when no child runs and MUST clean up on task termination or session teardown without blocking root input. The widget MUST NOT consume keyboard input unless the root editor holds focus, so overlays, Thoth panels, native dialogs and other custom UIs receive their keys.
  - GIVEN a child running or queued and later completing or stopping, and an overlay possibly open; WHEN the UI renders, keys are pressed and the session tears down; THEN metrics including average output speed and status symbols remain truthful, keys reach the focused overlay, dialog or custom UI, root stays interactive and no idle animation timer remains.

## Plan

Approach: a level-aware, tick-counting v2 clock plus one stepper helper in pi-core;
every surface steps frames through them; the theme owns the persisted level and the
command.

Work units:

1. pi-core clock, stepper and work panel (AC-1, AC-2, AC-4, AC-6). New v2 registry
   in `src/animation-clock.ts` (levels, period-aligned scheduling, tick counter,
   level getters/setters, level-change subscription, no timer at `off`), leaving
   any v1 registry untouched; a stepper helper (D2) with the 1000 ms static-marker
   refresh at `off`; a static running-glyph resolver from render-kit status glyphs;
   work-panel render/host on the stepper with static glyph and immediate refresh at
   `off`. Seams: `test/animation-clock.test.ts` (including live v1 + v2 copies in
   both load orders, `off` and cadence changes), `test/work-panel-animation.test.ts`,
   `test/render-kit.test.ts`, `test/work-panel-host-segments.test.ts`.
2. Theme (AC-2, AC-3, AC-4, AC-5), after unit 1. Config field, validation and atomic
   save; `/thoth-animation` with selector; level pushed to the clock at load,
   session start and on change; native working indicator per D5; input glyph and
   breathing/shimmer tick-stepped and static at `off`; footer glyph via the stepper
   (replacing the per-card elapsed ticker) and static at `off` even with a
   caller-supplied frame. Seams: `src/shared/config.test.ts`, `src/index.test.ts`,
   `src/tools/ticker.test.ts`, `src/input-box/*.test.ts`, `test/render-kit*.test.ts`,
   `test/tool-renderer-parity.test.ts`.
3. Sidebar (AC-2, AC-4), after unit 1. Seams: `test/session.test.ts`,
   `test/performance.test.ts`, `test/panels.test.ts`, `test/work-panels.test.ts`.
4. Foreground subagent progress (AC-2, AC-4), after unit 1. `subagent_run` and
   `subagent_continue` heartbeats and frames from the stepper. Seams:
   `test/tools/subagent-run.test.ts`, continuation tool tests, `test/render/progress.test.ts`,
   `test/render/tool-status-footer*.test.ts`.
5. AskCodex (AC-2, AC-4), after unit 1: card heartbeat and frame from the stepper.
6. AskAntigravity (AC-2, AC-4), after unit 1: same.
7. Default-level tests (AC-6) and closeout checks (AC-7) by root, including
   `pnpm run build:pi-extensions`.

Interfaces: unit 1 defines and reports the exact clock, stepper and glyph exports
consumed by units 2-6; units 2-6 own disjoint packages or files and run in parallel
after unit 1. Unit 4 edits only `src/tools/subagent-run.ts`,
`src/tools/subagent-continue.ts`, `src/render/tools/*` and their tests, disjoint from
change `pi-subagent-boundary-persistence` (runner, manager, types). Risks: many
timing-pinned tests change; color quantization may make adjacent breathing steps
look equal at `minimal`; native loaders outside the theme keep animating; old
extension copies keep a v1 timer until they unsubscribe; both active changes modify
`pi-ecosystem`, so whichever archives second must refresh its Source digest and
recheck its deltas against the new baseline.

## Tasks

- [x] AC-1: Add the v2 level-aware shared clock in pi-core
  - Outcome: v2 registry with levels, periods, tick counter, level-change notification, no timer at off, v1 untouched
  - Known entrypoints and skill paths: pi-packages/pi-core/src/animation-clock.ts (:1-96); src/index.ts; test/animation-clock.test.ts (:38-66 multi-copy); scripts/build-pi-extensions.mjs (:54-67); C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: Exploration clock evidence; decisions D1, D7
  - Dependencies: none
  - Output: clock API with tests for new copies sharing v2 and live v1 plus v2 copies in both load orders, off and cadence changes
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/animation-clock.ts, pi-packages/pi-core/src/index.ts, pi-packages/pi-core/test/animation-clock.test.ts
  - Interface boundaries: existing subscribe/unsubscribe callers; process-global registry keys
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-core exec vitest run test/animation-clock.test.ts` passes
  - Return milestone: tests green with the exact exported API reported
  - Stop / reassessment: v1 and v2 copies cannot coexist without shared-state changes
- [x] AC-2: Add the pi-core stepper and static glyph helpers and use them in the work panel
  - Outcome: stepper per D2, static running-glyph resolver, work-panel rows on the stepper with static glyph and immediate refresh at off
  - Known entrypoints and skill paths: pi-packages/pi-core/src/render-kit.ts (:277-330); src/work-panel-render.ts (:1669-1678); src/work-panel-host.ts (:377-410); test/work-panel-animation.test.ts; test/render-kit.test.ts; test/work-panel-host-segments.test.ts; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: accepted clock API from the AC-1 unit; decisions D2, D6
  - Dependencies: AC-1 unit accepted (same owner, sequential)
  - Output: helpers, work-panel integration and tests sampling consecutive steps at every level and off
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/render-kit.ts, pi-packages/pi-core/src/work-panel-render.ts, pi-packages/pi-core/src/work-panel-host.ts, pi-packages/pi-core/src/index.ts, new pi-core helper module, pi-packages/pi-core/test/
  - Interface boundaries: render-kit v1 contract; work-panel provider API; retention deadlines
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-core test` and `pnpm --dir pi-packages/pi-core typecheck` pass
  - Return milestone: package green with helper exports reported
  - Stop / reassessment: render-kit contract change required
- [x] AC-5: Add the theme animation setting and /thoth-animation command
  - Outcome: persisted level with validation, selector and argument command, immediate application and native indicator per D5
  - Known entrypoints and skill paths: pi-packages/pi-thoth-theme/src/shared/config.ts (:13-96); src/index.ts (:15-72); src/shared/config.test.ts; src/index.test.ts; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: accepted pi-core exports from the AC-1 and AC-2 units; decisions D1, D5
  - Dependencies: AC-1 and AC-2 units accepted
  - Output: config field, atomic save, command, clock and native indicator wiring with tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-thoth-theme/src/shared/config.ts, pi-packages/pi-thoth-theme/src/index.ts, new theme command module and their tests
  - Interface boundaries: Pi command and selector API; existing config readers; native setWorkingIndicator
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-thoth-theme exec vitest run src/shared/config.test.ts src/index.test.ts` passes with save, invalid-argument and immediate-apply cases
  - Return milestone: tests green with diff summary
  - Stop / reassessment: Pi command or selector API unavailable in the supported range
- [x] AC-3: Tick-step the theme input glyph, breathing, shimmer and tool footer glyph
  - Outcome: input glyph, breathing and shimmer stepped per D2 and D3; footer glyph via the stepper; static at off even with caller-supplied frames
  - Known entrypoints and skill paths: pi-packages/pi-thoth-theme/src/input-box/state.ts (:27, :64-65); src/input-box/gradient.ts (:16-36, :73-99); src/input-box/decorate.ts (:164); src/render-kit/working.ts (:6-9); src/render-kit/index.ts (:237-258); src/tools/ticker.ts (:51-100); src/input-box/*.test.ts; src/tools/ticker.test.ts; test/render-kit*.test.ts; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: accepted pi-core exports; decisions D2, D3, D4
  - Dependencies: AC-1 and AC-2 units accepted; AC-5 unit (same owner, sequential)
  - Output: tick-stepped theme animations with tests sampling consecutive steps per level and off
  - Owner: thoth-worker
  - Writes: pi-packages/pi-thoth-theme/src/input-box/, pi-packages/pi-thoth-theme/src/render-kit/, pi-packages/pi-thoth-theme/src/tools/ticker.ts, pi-packages/pi-thoth-theme/test/ and colocated tests
  - Interface boundaries: render-kit footer contract; input box decoration
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-thoth-theme test` and typecheck pass
  - Return milestone: package green with diff summary
  - Stop / reassessment: footer contract change required
- [x] AC-4: Tick-step the sidebar running rows with static and immediate behavior at off
  - Outcome: sidebar frames via the stepper, static glyph and immediate change-gated refresh at off, re-render on level change
  - Known entrypoints and skill paths: pi-packages/pi-sidebar/src/panels/sidebar.ts (:554-555); src/session.ts (:228-268); test/session.test.ts; test/performance.test.ts; test/panels.test.ts; test/work-panels.test.ts; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: accepted pi-core exports; decision D6
  - Dependencies: AC-1 and AC-2 units accepted
  - Output: sidebar integration with tests per level and off
  - Owner: thoth-worker
  - Writes: pi-packages/pi-sidebar/src/, pi-packages/pi-sidebar/test/
  - Interface boundaries: sidebar output and plan cache; work-panel preferences
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-sidebar test` and typecheck pass
  - Return milestone: package green with diff summary
  - Stop / reassessment: plan cache keys need non-revision inputs
- [x] AC-2: Step foreground subagent_run and subagent_continue progress through the stepper
  - Outcome: both foreground heartbeats and braille frames driven by the stepper, static glyph at off, elapsed refresh kept
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/tools/subagent-run.ts (:150-193); src/tools/subagent-continue.ts (:65-109); src/render/tools/progress.ts (:9-17, :35-72); src/render/tools/subagent-run.ts (:53-70); src/render/tools/components.ts (:116-123); test/tools/subagent-run.test.ts (:301-497); continuation tool tests; test/render/progress.test.ts; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: accepted pi-core exports; decisions D2, D4
  - Dependencies: AC-1 and AC-2 units accepted
  - Output: stepper-driven progress with tests per level and off for both tools
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/tools/subagent-run.ts, pi-packages/pi-subagents/src/tools/subagent-continue.ts, pi-packages/pi-subagents/src/render/tools/, pi-packages/pi-subagents/test/tools/, pi-packages/pi-subagents/test/render/
  - Interface boundaries: tool update payload; theme indicator replacement; files edited by change pi-subagent-boundary-persistence stay untouched
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-subagents exec vitest run test/tools test/render` passes
  - Return milestone: tests green with diff summary
  - Stop / reassessment: progress emission needs manager or runner changes
- [x] AC-2: Step the AskCodex tool card through the stepper
  - Outcome: AskCodex heartbeat and frame from the stepper, static glyph at off, elapsed refresh kept
  - Known entrypoints and skill paths: pi-packages/pi-askcodex/src/ask-tool.ts (:169-172, :331-342) and its tests; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: accepted pi-core exports; decisions D2, D4
  - Dependencies: AC-1 and AC-2 units accepted
  - Output: stepper-driven card with tests per level and off
  - Owner: thoth-worker
  - Writes: pi-packages/pi-askcodex/src/, pi-packages/pi-askcodex/test/ or colocated tests
  - Interface boundaries: tool update payload; Codex delegation behavior unchanged
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-askcodex test` and typecheck pass
  - Return milestone: tests green with diff summary
  - Stop / reassessment: pi-core is not available to this package
- [x] AC-2: Step the AskAntigravity tool card through the stepper
  - Outcome: AskAntigravity heartbeat and frame from the stepper, static glyph at off, elapsed refresh kept
  - Known entrypoints and skill paths: pi-packages/pi-antigravity-bridge/src/ask-tool.ts (:543-546, :795-804) and its tests; C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: accepted pi-core exports; decisions D2, D4
  - Dependencies: AC-1 and AC-2 units accepted
  - Output: stepper-driven card with tests per level and off
  - Owner: thoth-worker
  - Writes: pi-packages/pi-antigravity-bridge/src/, pi-packages/pi-antigravity-bridge/test/ or colocated tests
  - Interface boundaries: tool update payload; bridge delegation behavior unchanged
  - Focused check and PASS evidence: `pnpm --dir pi-packages/pi-antigravity-bridge test` and typecheck pass
  - Return milestone: tests green with diff summary
  - Stop / reassessment: pi-core is not available to this package
- [x] AC-6: Prove behavior without the theme
  - Outcome: every surface animates at full when no level was set
  - Known entrypoints and skill paths: pi-packages/pi-core/test/animation-clock.test.ts; pi-packages/pi-sidebar/test/; pi-packages/pi-subagents/test/tools/; pi-askcodex and pi-antigravity-bridge tests
  - Inputs: AC-1 to AC-4 units and the bridge units
  - Dependencies: all implementation units accepted
  - Output: default-level tests in each consumer package
  - Owner: thoth-worker
  - Writes: tests in pi-packages/pi-core/test/, pi-packages/pi-sidebar/test/, pi-packages/pi-subagents/test/tools/, pi-packages/pi-askcodex, pi-packages/pi-antigravity-bridge test locations
  - Interface boundaries: none
  - Focused check and PASS evidence: the package tests above pass with explicit default-level cases
  - Return milestone: tests green
  - Stop / reassessment: a consumer depends on the theme for timing
- [x] AC-7: Run closeout checks
  - Outcome: package, bundle and root checks pass on the final diff
  - Known entrypoints and skill paths: pi-packages/pi-core, pi-thoth-theme, pi-sidebar, pi-subagents, pi-askcodex, pi-antigravity-bridge; repository root
  - Inputs: accepted AC-1 to AC-6 units
  - Dependencies: AC-1 to AC-6 units accepted
  - Output: check results for verification
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: each package test, typecheck and build, `pnpm exec biome check pi-packages`, `pnpm run build:pi-extensions`, `pnpm run check:ci` and `pnpm run typecheck` all exit 0
  - Return milestone: all checks green
  - Stop / reassessment: unrelated environment failure reported separately

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review: round 1 REJECT (subtask_thoth-oracle_1793322064416_8c7b38f1: bridge/continuation coverage, legacy v1 clock migration, single-clock delta vs drivers), repaired; round 2 OKAY (subtask_thoth-oracle_1793322470799_ed5eb8c9), reviewed record SHA-256 0e97abd867a9d50bd3cc6f73c48b6221f83a7e2c403c154a2d7b8264196179f0.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 30a6128c0d9f56ea5c3bec8da18d7ce4a01ee26a42b7f1a0ac3cc8c372ddc2d1

Final verification round 3 by a fresh Oracle (task subtask_thoth-oracle_1793328870341_e29e2252); validated delivery verdict: valid, kind final-verification, verdict PASS, mode record, recordDigest match. The same Oracle re-emitted the envelope once as a format-only repair (repo-relative reviewedRecord, findings and verdict unchanged); the envelope below is that re-emission.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: AC-1 through AC-7 are satisfied. The AC-4 repair preserves elapsed refresh without animation, timer leaks or frame-order regressions. No blocking defect found.",
  "evidence": [
    {
      "id": "E1",
      "kind": "freshness",
      "locator": ".thoth/changes/pi-animation-intensity/pi-animation-intensity.md; scoped git diff; seven untracked files; canonical specs",
      "claim": "Independently recomputed record-prefix SHA-256 30a6128c0d9f56ea5c3bec8da18d7ce4a01ee26a42b7f1a0ac3cc8c372ddc2d1. Scoped diff digest, seven untracked hashes and both supplied baseline hashes match before and after verification.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-core/src/animation-clock.ts:14-27,70-110,117-166; test/animation-clock.test.ts:21-185,207-235",
      "claim": "The separate v2 registry defaults to full, shares state across copies, schedules 100/200/500 ms boundary-aligned ticks with consecutive counters, stops at off, and immediately notifies level subscribers. Tests exercise live v1 coexistence in both load orders without modifying v1.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-core/src/animation-steps.ts:19-76; src/work-panel-host.ts:404-418,489-506; pi-packages/pi-sidebar/src/session.ts:233-255; src/panels/sidebar.ts:359-375",
      "claim": "The stepper implements the rounded tick rule and preserves its next frame across level changes. At off, only an unref'd 1000 ms static refresh runs. Work-panel/sidebar static callbacks retain frame position, refresh live data and handle provider changes immediately.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "repair-verification",
      "locator": "pi-packages/pi-thoth-theme/src/input-box/state.ts:31-45,70-99,155-181; src/input-box/state.test.ts:19-229; src/input-box/gradient.ts:27-40,73-94",
      "claim": "Quiet root work at off receives elapsed invalidation every second without advancing glyphStep or effectStep. Background-only work at off is timer-free. End/dispose remove refreshes and level subscriptions; off/full transitions retain one timer and resume glyph order. Effects use 24/12/5 evenly spaced phases and a fixed phase at off.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "elapsed-surface-audit",
      "locator": "pi-packages/pi-thoth-theme/src/tools/ticker.ts:58-115; src/render-kit/index.ts:172-187,243-275; src/render-kit/working.ts:6-29; src/tools/codemode.ts:69-79,174-182; src/welcome/resources.ts:110-142",
      "claim": "Live tool footers retain one-second elapsed invalidation and suppress animation-frame updates at off. Indicator rendering overrides supplied frames with the mode-aware static glyph. Other theme durations are producer-supplied codemode snapshots or historical welcome ages, not live elapsed clocks.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "source-and-tests",
      "locator": "pi-packages/pi-thoth-theme/src/animation.ts:14-77; src/shared/config.ts:76-126; src/index.test.ts:135-245",
      "claim": "Configuration validates four levels and defaults to full. Commands mark the current selector choice, reject invalid arguments without changes, save atomically before applying, and immediately configure native frames and 200/200/500 ms intervals; off supplies one mode-aware static frame.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "consumer-verification",
      "locator": "pi-packages/pi-subagents/src/tools/subagent-run.ts:148-215,325-327; src/tools/subagent-continue.ts:95-162,277-281; test/tools/foreground-animation.test.ts:176-260",
      "claim": "Both foreground tools advance frames only through the stepper, preserve frames on ordinary emissions, use static off-mode progress with one-second elapsed updates, and dispose subscriptions on termination, abort and handoff.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "consumer-verification",
      "locator": "pi-packages/pi-askcodex/src/ask-tool.ts:172-186,339-353,444-448; tests/ask-tool-animation.test.ts:156-282; pi-packages/pi-antigravity-bridge/src/ask-tool.ts:540-548,797-811,874-877,1009-1010; tests/ask-tool-animation.test.ts:95-204",
      "claim": "Both bridge cards carry stepper-owned frames, update elapsed at off without animation, resolve static glyphs independently of supplied frames, and clean up their subscriptions. Explicit unset-level cases verify full defaults.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E9",
      "kind": "execution",
      "locator": "Sequential pnpm exec vitest run commands across the six affected packages",
      "claim": "576 focused tests passed: theme state 26, built-theme real SDK 7, ticker 22, configuration/index/gradient/render-kit 111; core clock/steps/work-panel/render-kit 168; sidebar session/performance 114; subagents foreground/progress/footers 60; AskCodex animation 14; Antigravity changed suites 52; two named flaky cases 2. No focused failure.",
      "basis": "observed",
      "uncertainty": "22 unrelated cases were filtered out in the two-case flake check."
    },
    {
      "id": "E10",
      "kind": "flake-assessment",
      "locator": "pi-packages/pi-antigravity-bridge/tests/driver.test.ts:6-15,322-332; tests/helpers/fake-agy-bin/agy.mjs:3-14; tests/sessions.test.ts:99-120; src/sessions.ts:130-160",
      "claim": "The named intermittent cases exercise unchanged real-process deadlines and asynchronous filesystem persistence, not changed ask-tool animation. Their source/test files have no diff, and both targeted reruns passed. Classification as unrelated timing instability is supported.",
      "basis": "inferred",
      "uncertainty": "Windows exclusivity is not established; SessionStore is a filesystem case. The initially unnamed closeout failure cannot be independently attributed."
    },
    {
      "id": "E11",
      "kind": "reported-closeout",
      "locator": "Root's fresh closeout supplied in this assignment, bound to matching E1 inputs",
      "claim": "Fresh bundle builds, all six package suites/typechecks, applicable Biome checks, root check:ci and root typecheck passed. Antigravity had subsequent complete green runs despite intermittent failures. Independent git diff --check also passed.",
      "basis": "inferred",
      "uncertainty": "Full closeout commands were reused from root's supplied evidence rather than redundantly rerun; focused execution is independently recorded in E9."
    },
    {
      "id": "E12",
      "kind": "governance-validation",
      "locator": "node C:/DEV/Proyectos/Webstorm/thoth-agents/skills/thoth-sdd/scripts/validate.mjs --change .thoth/changes/pi-animation-intensity --through verify --json",
      "claim": "Validator exited 0 with valid:true, no errors, matching spec baselines and only the advisory ADDED-capability overlap warning. Animation intensity is distinct from the existing footer requirement, which this record separately modifies.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Clock source review and focused clock tests.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E9"],
      "reason": "PASS | v2 sharing, periods, consecutive ticks, immediate transitions and untouched live v1 | pi-core/src/animation-clock.ts:14-27,70-166; test/animation-clock.test.ts:21-185."
    },
    {
      "check": "AC-2",
      "method": "Stepper and every listed consumer reviewed; focused suites passed.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E5", "E7", "E8", "E9"],
      "reason": "PASS | consecutive tick-owned frames rather than wall-clock/emission-derived frames | pi-core/src/animation-steps.ts:52-68; theme/src/input-box/state.ts:85-97; sidebar/src/session.ts:239-247; subagents/src/tools/subagent-run.ts:170-207; askcodex/src/ask-tool.ts:339-353; antigravity-bridge/src/ask-tool.ts:797-811."
    },
    {
      "check": "AC-3",
      "method": "Continuous-effect implementation and phase-cycle regressions.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E9"],
      "reason": "PASS | 24/12/5 evenly spaced breathing/shimmer phases, one effect step per tick | pi-thoth-theme/src/input-box/gradient.ts:27-40,73-94; src/input-box/state.test.ts:19-55."
    },
    {
      "check": "AC-4",
      "method": "Elapsed-surface audit; static-mode, transitions and cleanup regressions.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E4", "E5", "E6", "E7", "E8", "E9"],
      "reason": "PASS | root input, footers, work panel, sidebar and foreground/bridge cards refresh live elapsed every second without advancing frames; native indicator is single-frame; provider changes are immediate | theme/src/input-box/state.test.ts:58-229; src/tools/ticker.test.ts:141-155; core/test/work-panel-animation.test.ts:76-219; sidebar/test/session.test.ts:1018-1179; subagents/test/tools/foreground-animation.test.ts:176-225."
    },
    {
      "check": "AC-5",
      "method": "Configuration persistence, command and native-indicator tests.",
      "outcome": "pass",
      "evidenceIds": ["E6", "E9"],
      "reason": "PASS | validated defaults, atomic save, marked selector, immediate application and unchanged invalid-input configuration | pi-thoth-theme/src/shared/config.ts:76-126; src/animation.ts:14-77; src/index.test.ts:135-245."
    },
    {
      "check": "AC-6",
      "method": "Default registry and unset-level consumer cases without theme initialization.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E7", "E8", "E9"],
      "reason": "PASS | full remains the theme-independent default | pi-core/src/animation-clock.ts:19-27; pi-sidebar/test/session.test.ts:979-1015; pi-subagents/test/tools/foreground-animation.test.ts:228-260; pi-askcodex/tests/ask-tool-animation.test.ts:156-184; pi-antigravity-bridge/tests/ask-tool-animation.test.ts:95-122."
    },
    {
      "check": "AC-7",
      "method": "Reuse fresh matching-input root closeout; independently run focused tests and whitespace checks.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E9", "E10", "E11"],
      "reason": "PASS | builds, package/root checks and typechecks have fresh green closeout evidence; 576 independent focused tests and git diff --check passed. Retain the unrelated intermittent bridge-test caveat."
    },
    {
      "check": "Record binding and verify gate",
      "method": "Independent exact-byte hashing, initial/final freshness comparison and bundled validator.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E12"],
      "reason": "Record digest and both canonical baselines match; relevant inputs remained unchanged throughout review; verify gate is valid."
    }
  ],
  "risks": [
    {
      "description": "Existing intermittent Antigravity driver/filesystem tests reduce closeout reproducibility. The named failures are unrelated to this diff; neither Windows exclusivity nor the initially unnamed failure's cause is proven.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E10", "E11"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root: record the per-AC PASS evidence and matching digest, preserve the flake caveat, then validate closeout before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-animation-intensity/pi-animation-intensity.md",
    "reviewedRecordSha256": "30a6128c0d9f56ea5c3bec8da18d7ce4a01ee26a42b7f1a0ac3cc8c372ddc2d1"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | `pnpm --dir pi-packages/pi-core test` | 1107 passed; test/animation-clock.test.ts covers the v2 registry, 100/200/500 ms boundary-aligned ticks with consecutive counters, no timer at off, immediate level notification, default full and live v1 plus v2 copies in both load orders (pi-core/src/animation-clock.ts:14-27,70-166)
- AC-2: PASS | package tests of pi-core, pi-thoth-theme, pi-sidebar, pi-subagents, pi-askcodex and pi-antigravity-bridge | animation-steps, work-panel-animation, sidebar session, theme state and ticker, foreground-animation and both ask-tool-animation suites sample consecutive steps at every level, including the first step after the initial paint, with no skipped or repeated frames
- AC-3: PASS | `pnpm --dir pi-packages/pi-thoth-theme test` | 1432 passed; src/input-box/state.test.ts and gradient tests show 24/12/5 evenly spaced breathing and shimmer steps, one per tick, static at off
- AC-4: PASS | theme, pi-core, sidebar, pi-subagents and bridge package tests | at off: mode-aware static glyph even with caller-supplied frames, single-frame native indicator, 1 s elapsed refresh without frame advance for root input, tool footers, work panel, sidebar, foreground and bridge cards, immediate provider renders and no timer where no elapsed text is shown (state.test.ts:58-229, work-panel-animation.test.ts:76-219, session.test.ts:1018-1179)
- AC-5: PASS | `pnpm --dir pi-packages/pi-thoth-theme test` | src/index.test.ts and src/shared/config.test.ts: selector marking the current level, valid and invalid arguments, atomic same-directory save preserving unknown keys, malformed or non-object file left byte-identical, immediate apply, native intervals 200/200/500 ms
- AC-6: PASS | consumer package tests | unset-level cases in pi-core, pi-sidebar, foreground subagent tools and both bridge suites behave as full
- AC-7: PASS | `pnpm run build:pi-extensions`, then package tests and typechecks of the six packages, Biome, `pnpm run check:ci`, `pnpm run typecheck`, `git diff --check` | all exit 0 after repairs (pi-core 1107, theme 1432, sidebar 367, askcodex 312 + 4 skipped, pi-subagents 2006 + 1 skipped, antigravity 1150 + 12 skipped on rerun)

Final verification round 1 (fresh Oracle subtask_thoth-oracle_1793325813396_ccabb4d1, validated verdict FAIL, recordSha256 ef8c8821eae1bfa054380afab5457d3a93fe62676875a0c683995efedf11ee5c): no implementation defect; the root-owned AC-7 task row was unchecked, so the verify gate failed. Round 2 (fresh Oracle subtask_thoth-oracle_1793326390017_206f369c, validated verdict FAIL, recordSha256 30a6128c0d9f56ea5c3bec8da18d7ce4a01ee26a42b7f1a0ac3cc8c372ddc2d1): AC-4, the root input working label froze at off because the input state dropped its only periodic invalidation.

Convergence: the input state keeps an unref'd 1000 ms elapsed refresh while root works at off, without advancing glyph or effects, and stays timer-free for background-only work, with quiet-work, cleanup and transition regressions; the built-theme real-SDK test fixture now fakes timeouts and persists its session file (test-only). Earlier repairs during implementation: work-panel 1 s refresh and immediate provider renders at off, no repeated first frame in sidebar, footer and foreground progress, and malformed-config protection in saveAnimationLevel.

AC-7 notes: the first closeout ran package tests before the extension build and missed the dist-dependent theme test/render-kit-real-sdk.test.ts; the final closeout built first. pi-antigravity-bridge `run check` is intermittent in unchanged real-process and filesystem tests (tests/driver.test.ts inactivity budget, tests/sessions.test.ts multi-process persist; one closeout failure name not captured); reruns pass and this change edits only src/ask-tool.ts in that package.
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:f5151e87691e5ca8899b23829072ee4d5ed9f46b737fbeb0a73401d99c8037ad
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:f6ce5e17bf2ef65393e77ef3189a1a26800bc3d36cc425326f3de5ac638e6a10

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY

Follow-up outside this change: commit and live rollout into the main checkout with rebuilt extension dists, a same-scenario CPU re-profile, and the separate off-thread WAL checkpoint change.
