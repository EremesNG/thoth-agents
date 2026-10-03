# Change: orca-fullscreen-kitty-images

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Pi 1.0.1 (`@earendil-works/pi-coding-agent` + `pi-tui`) defaults to `tuiMode: "fullscreen"`, rendered by `TuiAltScreen` (alternate screen). Regular mode renders images correctly in Orca; regular mode is rejected by the user.
- Pi does not detect Orca; `pi-packages/pi-thoth-theme/src/tools/image-capability.ts:10-23` overrides capabilities to `images: "kitty"` at `session_start`/`agent_start`.
- `TuiAltScreen.beforeTerminalStart()` captures `this.imageProtocol` from capabilities before extensions run (`interactive-mode.js:699-700`), so in Orca it stays `null` even after the theme override; `Image` components still emit Kitty because they read live capabilities.
- `TuiAltScreen.doRender()` (pi-tui `dist/tui-alt-screen.js:1436-1544`, synchronous prototype method, plain field `imageProtocol`) only draws Kitty images after clears and text when `this.imageProtocol === "kitty"` and `isWezTerm` (`process.env.WEZTERM_PANE` or `TERM_PROGRAM=wezterm`, read once per render at `:1463`). Otherwise it emits `ESC[row;1H ESC[2K <line>` per row, erasing image rows below the anchor row.
- Orca uses `@xterm/addon-image` 0.10.0-beta.300 (Kitty alpha); it stores image tiles per cell and EL/character writes erase them (README: "Characters written over an image will erase the image information for affected cells"). Result: only the first image row survives.
- `PI_IMAGE_PROTOCOL=iterm2` is not an option: `TuiAltScreen` sets `images: null` for iTerm2 (`tui-alt-screen.js:160-166`).
- Extensions importing `@earendil-works/pi-tui` receive the bundle's own module (virtual module map), so `TuiAltScreen.prototype` is the live class.
- `getCapabilities()` caches detection; it re-detects from env only when the cache is empty.
- Follow-up (after first PASS): minimizing and restoring Orca blanks the image until the next Pi redraw (e.g. scroll). Runtime probe in an Orca pane with `?1004h`: restore delivers focus-in `ESC[I` (and `ESC[O` on minimize) and no resize. Pi fullscreen enables focus reporting with mouse mode (`tui-alt-screen.js:16-20,153-189`); its constructor-registered `handleViewportInput` (`:105,470-496`) consumes focus events without redrawing, before extension `onTerminalInput` listeners (`tui.js:685-699`). `requestRender(true)` (`tui.js:624-650`) resets render state (`tui-alt-screen.js:279-284`) and, with the patch, retransmits images as `a=T`. Orca's reveal path resumes rendering, fits, then focuses the pane (stablyai/orca `terminal-visibility-resume.ts`).
- Packaging facts: workspace `pnpm-workspace.yaml` uses `pi-packages/*`; reference package `pi-packages/pi-openai-fast` (package.json `pi.extensions: ["./src/index.ts"]`, `typecheck`/`test` scripts, files/peers, tsconfig, vitest config, README, LICENSE). `.github/workflows/ci.yml:53-82` (Ubuntu) and `:107-142` (Windows) enumerate the six packages explicitly; `AGENTS.md` and `docs/agent/testing.md:45-52` say "six". Release publishes only the root; `PI_PACKAGE_SPECS` (`src/cli/pi-install.ts:43-74`) excludes operator-installed packages such as theme and openai-fast. Theme image ownership: `src/index.ts` imports/registration, `src/shared/config.ts` `images` key, README image sections, tests `src/index.test.ts`, `test/config.test.ts`, `test/image-lifecycle.test.ts` and typed fixtures containing `images`. Theme tool framing (`box.ts` `hasImageContent`, `read.ts`) is independent of the capability/order code.
- AC-7 seam (plan review round 3 [OKAY]): `tui-alt-screen.js:105` registers `(data) => this.handleViewportInput(data)`, a call-time lookup confirmed in the executed bundle; wrapping `TuiAltScreen.prototype.handleViewportInput` reaches existing instances. Headless probe: focus-in plus `requestRender(true)` retransmits `a=T`, clears precede the image, focus consumption preserved, no loop. With mouse disabled Pi does not enable `?1004h` (acceptable degradation).
- Theme package: Vitest (`vitest run`), `tsc --noEmit`, tests in `src/**/*.test.ts` and `test/**/*.test.ts`; `image-capability.test.ts` uses real pi-tui capability functions with injected env.

## Intent

In Orca, in Pi fullscreen mode, Kitty images in tool results render completely (all rows) and recover after window minimize/restore, delivered by a new standalone, operator-installed Pi package `@thoth-agents/pi-orca-images` (`pi-packages/pi-orca-images`) that owns all Orca image behavior (Kitty capability override, alt-screen images-after-text ordering patch, focus-in redraw). `pi-thoth-theme` no longer owns image capability or renderer behavior and keeps only tool-result framing.

## Non-goals

- No change to Pi regular mode, iTerm2 handling, or non-Orca terminals.
- No permanent/global `WEZTERM_PANE` or `TERM_PROGRAM` mutation visible to child processes.
- No upstream pi-mono PR in this change (can follow separately).
- No package config file and no `PI_PACKAGE_SPECS`/CLI installer, subagent `lifecycle_passthrough`, or release-workflow changes.
- No change to theme tool framing (`box.ts`, `read.ts`).
- No change to the Orca application or `@xterm/addon-image`.

## Acceptance

- AC-1: When installed for Orca, a wrapped `doRender` runs the original with `this.imageProtocol === "kitty"` (only when live capabilities report `kitty`) and with the WezTerm predicate true (a truthy `WEZTERM_PANE` substituted whenever the current value is absent or empty), the substitution is active only after all component rendering of the frame (from the return of `applyLineResets` inside `doRender`) so component renderers never observe it, and afterwards `process.env.WEZTERM_PANE` is exactly as before (absent, empty, or original value), including when the original throws.
- AC-7: In Orca, when the wrapped alt-screen instance receives focus-in `ESC[I` while the patch is active (live capabilities report `kitty`), it requests a forced full redraw (`requestRender(true)`) so images are retransmitted; Pi's own focus handling (consumption, mouse/selection state) is otherwise unchanged; non-Orca or non-kitty sessions are unaffected; and in Orca after minimize→restore the image is visible again without scrolling (manual user confirmation).
- AC-8: `pi-packages/pi-orca-images` is a standalone Pi package following `pi-openai-fast` conventions (package.json named `@thoth-agents/pi-orca-images` with `pi.extensions`, `typecheck`/`test` scripts, files and peers; tsconfig; vitest config; README covering install, Orca behavior, the `PI_IMAGE_PROTOCOL=none` off switch and the regular-mode note; MIT LICENSE). Its default export applies the Kitty override at `session_start`/`agent_start` and installs the ordering and focus hooks, with no config file. When `PI_IMAGE_PROTOCOL` is `none` or `0` (case-insensitive), all three package behaviors are bypassed (override, ordering patch activation, focus redraw) even if Pi settings select `terminal.images: "kitty"`, while Pi's native settings behavior is otherwise preserved; a regression test combines that env value with an explicit Kitty capability. Dev dependencies use the theme's Pi 1.0.1 baseline; relocated lifecycle tests are discovered by the package vitest config. Its typecheck and tests pass.
- AC-9: `pi-thoth-theme` contains no image capability/order code, no `images` config key, no image registration, README image-module sections or image-only tests; remaining theme tests and typecheck pass; tool-result image framing behavior is unchanged.
- AC-10: Workspace and CI include the package: `pnpm-lock.yaml` importer updated via `pnpm install`; `.github/workflows/ci.yml` Ubuntu and Windows jobs run its typecheck and tests; `AGENTS.md` and `docs/agent/testing.md` package counts/lists updated; `pnpm run check:ci` passes.
- AC-6: On activation (protocol promoted from a non-kitty value to `kitty`), the wrapper invalidates components and forces a full screen redraw once, so already-rendered images and cached text fallbacks are re-emitted.
- AC-2: With a real `TuiAltScreen` and a stub terminal under the patch, a frame containing a Kitty image emits every row clear before the image sequence and no `ESC[2K` targets image rows after the image sequence.
- AC-3: The patch is not installed when `TERM_PROGRAM` is not Orca or `TMUX` is set; installation is idempotent; it degrades without throwing when `TuiAltScreen` or `doRender` is missing; capability cache is populated before the temporary env change so detection never caches a WezTerm result.
- AC-4: Kitty redraws keep the image visible in Orca: the wrapper clears `this.uploadedKittyImages` before each wrapped render so every image redraw is a full `a=T` transmission and never depends on a retained payload that addon-image may have deleted.
- AC-5: Manual: in Orca, fullscreen Pi, reading the reference PNG shows the whole image; user confirms with a screenshot.

## Clarifications

- Approach B (scoped `doRender` patch, Orca only) explicitly chosen by the user; regular mode explicitly rejected.

## Decisions

- User decision: all Orca image work moves to new package `@thoth-agents/pi-orca-images` (`pi-packages/pi-orca-images`); the theme keeps only framing.
- User decision (packaging): operator-installed (`pi install` or settings path), no config file (off switch: `PI_IMAGE_PROTOCOL=none` or uninstall), no subagent passthrough (children render no TUI), standalone like other pi-packages; CI and docs updated; theme `images.enabled` removed.
- Off switch (plan review round 4 [REJECT] fix): Pi applies `terminal.images` settings after env detection, so a live-Kitty guard alone does not honor `PI_IMAGE_PROTOCOL=none`. The package checks `PI_IMAGE_PROTOCOL` (`none`/`0`, case-insensitive) itself and bypasses override, ordering activation and focus redraw. Relocation detail: `image-capability.test.ts` also holds theme-framing cases; split them so framing tests stay in the theme.
- Focus hook: wrap `TuiAltScreen.prototype.handleViewportInput`; call the original first and return its result; when input is `ESC[I` and live capabilities report `kitty` (Orca guards), call `this.requestRender(true)`. Use separate idempotence markers for the render patch and the focus hook so neither suppresses the other; marker symbols are named after the new package.
- Substitute a truthy `WEZTERM_PANE` only when `Boolean(process.env.WEZTERM_PANE)` is false. Activate it through a per-call instance shim of `applyLineResets` (TuiBase method, pi-tui `dist/tui.js:1010`; called at `tui-alt-screen.js:1455` after layout, overlays and flashes, immediately before the WezTerm read at `:1463`); the remainder of `doRender` is pure string work plus `terminal.write`. Remove the shim and restore the exact previous value (absent, empty, or original) in `finally`. If `applyLineResets` is not a function on the instance, do not activate (degrade).
- Call `getCapabilities()` before setting the env to ensure the cache is populated.
- AC-4 resolved: addon-image 0.10.0-beta.300 (gitHead d3e32b34) supports `a=p`, but deletes the retained Kitty payload when its display entry is removed (zero-tile cleanup); images-last clears image rows before placement, so `a=p` may hit a deleted ID silently (`q=2`). Decision: clear `this.uploadedKittyImages` before each wrapped render to force `a=T` (Oracle headless check confirmed this changes redraw output from `a=p` to `a=T`). If the field is absent, skip only this step.
- AC-7 approach: intercept focus-in before Pi's viewport listener consumes it, by wrapping a prototype method that is resolved at call time on the input dispatch path (e.g. `TuiAltScreen.prototype.handleViewportInput` if the constructor registers it through a call-time lookup, otherwise the TuiBase input dispatch method in pi-tui `dist/tui.js:685-699`), installed with the same Orca/TMUX/images.enabled guards and marker idempotence; call the original first and preserve its return value. Stop condition: if no call-time-resolved seam exists for already-constructed instances, return to root without patching instance listener arrays.
- Plan review round 2 (fresh Oracle): [OKAY]; headless probe against the executed bundle confirmed env isolation, exact restoration, activation redraw, `a=T` retransmission and clears-before-image ordering.
- Plan review round 1 [REJECT] fixes adopted: one-time invalidate + forced full redraw on activation (set `previousScreen` empty and call `invalidate()`), truthy substitution for empty `WEZTERM_PANE`, env activation after component rendering via the `applyLineResets` shim.

## Durable deltas

- None.

## Plan

Superseded first-round plan (implemented in the theme, now relocated): new module `src/tools/alt-screen-image-order.ts` exporting an installer that takes injectable `{ env, altScreen class, getCapabilities }`, wraps `prototype.doRender` once (marker symbol), and registration from `src/index.ts`. Tests first: unit tests for wrapper semantics (AC-1, AC-3) with a fake class, including a component renderer that records `WEZTERM_PANE` (must not see the substitute) and the empty-string case; integration tests with real `TuiAltScreen` and a stub terminal capturing writes (AC-2: clears before image; activation after an already-rendered image re-emits it; redraws use `a=T`). Focused checks: `pnpm --filter pi-thoth-theme test`, `pnpm --filter pi-thoth-theme typecheck`, `pnpm run check:ci`. Then manual Orca check by user (AC-5) and fresh Oracle final verification.

Current plan: one worker unit creates `pi-packages/pi-orca-images` by moving `image-capability.ts`, `alt-screen-image-order.ts` and their tests (plus the relevant lifecycle tests from `test/image-lifecycle.test.ts`) out of the theme with `git mv` where possible, adds the AC-7 focus hook test-first, removes theme image config/registration/docs/tests, and updates CI, docs and the lockfile. Focused checks: package test/typecheck, theme test/typecheck, `pnpm run check:ci`. Then manual Orca checks (AC-5 re-run with the new package, AC-7 minimize/restore) and fresh Oracle final verification.

Risks: relies on Pi internals (`doRender`, `imageProtocol`, `uploadedKittyImages`) that may change across versions — mitigated by feature checks and no-throw degradation; Kitty retransmission cost per frame if cache cleared.

## Tasks

- [x] AC-4: Determine Kitty `a=p` placement support in Orca's pinned addon-image
  - Outcome: fact on whether `@xterm/addon-image` 0.10.0-beta.300 handles `a=p`
  - Known entrypoints and skill paths: xtermjs addon-image `src/kitty/KittyGraphicsHandler.ts` at the beta.300 tag/commit; stablyai/orca package.json
  - Inputs: Exploration facts above
  - Dependencies: none
  - Output: supported (beta.300 gitHead d3e32b34), with payload deletion on display removal; decision recorded
  - Owner: thoth-librarian
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: cited source lines for the action switch
  - Return milestone: evidence returned
  - Stop / reassessment: exact version source not reachable → report not confirmed
- [x] AC-1: Implement guarded doRender wrapper with env/protocol semantics and tests
  - Outcome: wrapper module + unit tests passing
  - Known entrypoints and skill paths: pi-packages/pi-thoth-theme/src/tools/image-capability.ts, src/index.ts, src/shared/config.ts; C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md
  - Inputs: Exploration, Decisions, AC-4 result
  - Dependencies: AC-4 unit
  - Output: src/tools/alt-screen-image-order.ts, its test, index.ts registration
  - Owner: thoth-worker
  - Writes: pi-packages/pi-thoth-theme/src/tools/alt-screen-image-order.ts, pi-packages/pi-thoth-theme/src/tools/alt-screen-image-order.test.ts, pi-packages/pi-thoth-theme/src/index.ts
  - Interface boundaries: pi-tui `TuiAltScreen`, `getCapabilities`; theme config `images.enabled`
  - Focused check and PASS evidence: `pnpm --filter pi-thoth-theme test` and `typecheck` pass
  - Return milestone: tests green
  - Stop / reassessment: `doRender`/`imageProtocol` not reachable on the imported class
- [x] AC-6: One-time invalidation and forced full redraw on activation, with tests
  - Outcome: already-rendered images re-emitted after promotion to kitty
  - Known entrypoints and skill paths: pi-packages/pi-thoth-theme/src/tools/alt-screen-image-order.ts
  - Inputs: wrapper module
  - Dependencies: AC-1 unit (same worker, same session)
  - Output: activation logic + unit and real-TuiAltScreen tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-thoth-theme/src/tools/alt-screen-image-order.ts, pi-packages/pi-thoth-theme/src/tools/alt-screen-image-order.test.ts
  - Interface boundaries: TuiAltScreen `invalidate()`, `previousScreen`
  - Focused check and PASS evidence: test shows image command emitted after activation on a previously rendered frame
  - Return milestone: tests green
  - Stop / reassessment: `previousScreen`/`invalidate` not reachable
- [x] AC-8: Create pi-orca-images package and relocate image code from the theme
  - Outcome: standalone package with moved modules/tests passing
  - Known entrypoints and skill paths: pi-packages/pi-openai-fast/ (template), pi-packages/pi-thoth-theme/src/tools/image-capability.ts(+test), src/tools/alt-screen-image-order.ts(+test), src/index.ts, test/image-lifecycle.test.ts
  - Inputs: packaging decisions, accepted AC-1..AC-6 implementation
  - Dependencies: none
  - Output: pi-packages/pi-orca-images/{package.json,tsconfig.json,vitest.config.ts,README.md,LICENSE,src/**}
  - Owner: thoth-worker
  - Writes: pi-packages/pi-orca-images/**, moved files
  - Interface boundaries: Pi ExtensionAPI events, pi-tui capability and TuiAltScreen internals
  - Focused check and PASS evidence: package test and typecheck pass
  - Return milestone: tests green
  - Stop / reassessment: package cannot resolve pi-tui the same way as the theme
- [x] AC-9: Remove image ownership from pi-thoth-theme
  - Outcome: theme free of image capability/order code and images config
  - Known entrypoints and skill paths: pi-packages/pi-thoth-theme/src/index.ts, src/shared/config.ts, README.md, package.json description, src/index.test.ts, test/config.test.ts, test/image-lifecycle.test.ts, typed fixtures with images
  - Inputs: AC-8 relocation
  - Dependencies: AC-8 unit (same worker)
  - Output: theme diff
  - Owner: thoth-worker
  - Writes: pi-packages/pi-thoth-theme/**
  - Interface boundaries: theme config file pi-thoth-theme.json (images key now ignored)
  - Focused check and PASS evidence: theme test and typecheck pass; framing image tests still pass
  - Return milestone: tests green
  - Stop / reassessment: framing depends on removed code
- [x] AC-10: Wire package into lockfile, CI and docs
  - Outcome: CI runs the package checks; docs counts updated
  - Known entrypoints and skill paths: pnpm-lock.yaml, .github/workflows/ci.yml:53-82,107-142, AGENTS.md, docs/agent/testing.md:45-52
  - Inputs: AC-8 package.json
  - Dependencies: AC-8 unit (same worker)
  - Output: workflow/docs/lockfile diff
  - Owner: thoth-worker
  - Writes: pnpm-lock.yaml, .github/workflows/ci.yml, AGENTS.md, docs/agent/testing.md
  - Interface boundaries: CI jobs
  - Focused check and PASS evidence: pnpm install succeeds; pnpm run check:ci passes
  - Return milestone: checks green
  - Stop / reassessment: lockfile changes beyond the new importer
- [x] AC-7: Force full redraw on focus-in in Orca, with tests
  - Outcome: focus-in triggers requestRender(true) for the patched alt-screen; images retransmitted
  - Known entrypoints and skill paths: pi-packages/pi-orca-images/src/alt-screen-image-order.ts (+ .test.ts, after relocation); pi-tui dist/tui-alt-screen.js:105,470-496; dist/tui.js:624-650,685-699; C:UsersEremesNG.piagentskills	ddSKILL.md
  - Inputs: Exploration follow-up facts, AC-7 decision
  - Dependencies: AC-8 unit (same worker)
  - Output: focus-in hook + unit and real-TuiAltScreen tests (focus-in after a rendered image frame re-emits the image as a=T; non-kitty/non-Orca no redraw; Pi focus consumption preserved)
  - Owner: thoth-worker
  - Writes: pi-packages/pi-orca-images/src/**
  - Interface boundaries: TuiAltScreen input handling, TuiBase requestRender
  - Focused check and PASS evidence: theme test + typecheck + check:ci pass; new integration test fails without the hook
  - Return milestone: tests green
  - Stop / reassessment: no call-time-resolved seam for focus input
- [x] AC-7: Manual Orca minimize/restore verification
  - Outcome: image visible after restore without scrolling
  - Known entrypoints and skill paths: none
  - Inputs: worktree theme loaded in Pi
  - Dependencies: AC-7 implementation unit
  - Output: user confirmation/screenshot
  - Owner: user (root coordinates)
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: image visible after restore
  - Return milestone: confirmation received
  - Stop / reassessment: still blank → timing issue, reopen
- [x] AC-2: Integration test with real TuiAltScreen and stub terminal
  - Outcome: ordering of clears vs image sequence asserted
  - Known entrypoints and skill paths: same as above
  - Inputs: wrapper module
  - Dependencies: AC-1 unit (same worker, same session)
  - Output: test cases in alt-screen-image-order.test.ts
  - Owner: thoth-worker
  - Writes: pi-packages/pi-thoth-theme/src/tools/alt-screen-image-order.test.ts
  - Interface boundaries: pi-tui Terminal interface
  - Focused check and PASS evidence: test passes; fails without the patch
  - Return milestone: tests green
  - Stop / reassessment: TuiAltScreen cannot be driven headlessly → report and keep AC-1 unit coverage
- [x] AC-3: Guard, idempotence and degradation tests
  - Outcome: non-Orca/tmux/disabled/missing-class cases covered
  - Known entrypoints and skill paths: same as above
  - Inputs: wrapper module
  - Dependencies: AC-1 unit
  - Output: tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-thoth-theme/src/tools/alt-screen-image-order.test.ts
  - Interface boundaries: none
  - Focused check and PASS evidence: tests pass
  - Return milestone: tests green
  - Stop / reassessment: none
- [x] AC-5: Manual Orca fullscreen verification
  - Outcome: user screenshot shows full image
  - Known entrypoints and skill paths: none
  - Inputs: built/linked theme package
  - Dependencies: AC-1..AC-4
  - Output: screenshot
  - Owner: user (root coordinates)
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: whole image visible
  - Return milestone: screenshot received
  - Stop / reassessment: still clipped → capture raw output, reopen

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 8740b5a1f464daedc541fdbf7fcbc6d6d34a86b0d19ba0a40545c9a5bb5afe44

- Prior round (before AC-7 and package rescope): fresh Oracle PASS for AC-1..AC-6 on record prefix b9e7b1d5b6ec2bee657f6286ce408a38591c2f3969101228c9b47ac8ad530f46.
- AC-1: PASS | env isolation unit tests | late applyLineResets shim; absent/empty/existing values and exception restore verified; component env unchanged
- AC-2: PASS | real TuiAltScreen output test | all six row clears precede the three-row image; no later ESC[2K
- AC-3: PASS | guard/degradation/prewarm tests | non-Orca, TMUX, missing internals, idempotence, capability cache warmed before substitution
- AC-4: PASS | real redraw tests | upload cache cleared each active render; redraws emit a=T, never a=p
- AC-5: PASS | manual Orca fullscreen with worktree theme + pi-orca-images | user confirmed complete images ("funciona")
- AC-6: PASS | unit + real-TUI activation tests | one-time invalidation/full redraw; recovery from cached text fallback
- AC-7: PASS | focus hook unit + real-TUI tests and manual minimize/restore | call-time prototype hook, native result preserved, separate marker, a=T retransmission; user confirmed recovery
- AC-8: PASS | package test 100 passed, typecheck PASS | scaffolding per pi-openai-fast, Pi 1.0.1 deps, none/0 off switch with explicit Kitty regression
- AC-9: PASS | theme test 369 passed, typecheck PASS | image capability/order/config/registration removed; framing tests kept; box.ts/read.ts unchanged
- AC-10: PASS | pnpm run check:ci PASS, git diff --check PASS | lockfile only new importer; Ubuntu/Windows CI steps added; seven-package docs
- Source: pi-packages/pi-orca-images/src/alt-screen-image-order.ts | sha256:4f35794af483fd0ea0aa45a2db7c0a28d8ab0b8c07b97a42ab865a32bf96e0ae
- Source: pi-packages/pi-orca-images/src/environment.ts | sha256:b1271ca23e95a048e484a90db585e64030d814132135cc445c43f21e733ecc8a
- Source: pi-packages/pi-orca-images/src/image-capability.ts | sha256:e24d48b08bc5082f151835f1d72da0b081d5d17b7c0fb98ac77daa95236dbd9b
- Source: pi-packages/pi-orca-images/src/index.ts | sha256:2bb871b9fbec08846c3222ab365c47c5a6f4e8738fbac37d64ce7bd68f1ae8c9
- Source: pi-packages/pi-orca-images/package.json | sha256:5a3d870b0125adfc155cfaf185a78196093477b0656b78b2ff7d67bc090d067e
- Source: pi-packages/pi-thoth-theme/src/index.ts | sha256:1650ae197e7204ed99fefeb17527c44dffe94efc216479c7de28ff961c1e5a6b
- Source: pi-packages/pi-thoth-theme/src/shared/config.ts | sha256:6ba64eb1a9e210ef74f099e71c291c248890c768714576511db0e9c5d0475da7
- Source: .github/workflows/ci.yml | sha256:64f17d53f3205b2e7e930d0688343a4f77f2819b442adb92d4fa7fbc713f439a
- Risk (accepted): depends on Pi 1.0.1 internals; Kitty retransmission overhead; focus recovery requires focus reporting (mouse mode). Temporary fix pending an upstream pi-mono change.

## Closeout

**Archive**: READY
