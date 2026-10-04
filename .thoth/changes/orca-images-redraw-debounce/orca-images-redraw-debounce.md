# Change: orca-images-redraw-debounce

**Classification**: substantial
**Scope**: local
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Regression after `orca-fullscreen-kitty-images` (archived 2026-10-03): with `@thoth-agents/pi-orca-images` enabled, an agent rendered 4 generated images in Orca and Pi's TUI became nearly unusable; disabling the package fixed it.
- Measurement (real `TuiAltScreen`, stub terminal, four 1024x1024 PNGs, ~1.4 MB base64 each): streaming text below stationary images emits ~50 bytes per frame in every variant. With the package, a change in an image-covered row retransmits all four images (5,614,202 bytes, 4x `a=T`) and a one-row scroll retransmits the visible ones (4,211,114 bytes); native Pi uses `a=p` (1.5 KB) in the same cases. Cause: the package clears `uploadedKittyImages` on every eligible render (AC-4 of the previous change) and every image redraw re-emits all visible images (`tui-alt-screen.js:1460-1483,1502-1530`).
- addon-image 0.10.0-beta.300 (gitHead d3e32b34): `a=p` also re-decodes the PNG (`createImageBitmap`), so switching to `a=p` only saves transport; with images-last ordering, clearing every image row before the first placement lets `_evictOnAlternate` delete the other cleared images' Kitty payloads, so their later `a=p` fail silently (`q=2`). No Kitty command keeps a placed payload alive. The lever is redraw frequency, not encoding.
- Seam: `TuiAltScreen.prototype.prepareKittyScreen(screen)` (`tui-alt-screen.js:232-277`, same in bundle `chunk-6FX7UEPL.js:108-109`) is resolved at call time and called once per Kitty redraw frame (`:1478-1483`), returning `{ lines, evictedImageDeletion }`. Replacing image anchor lines in `lines` with `""` after calling the original suppresses all `a=T`/`a=p` while row clears, text and deletion sequences are still written. `previousScreen` stores the original `screen` (`:1540-1543`), so unchanged later frames do not restore images; `requestRender(true)` (`tui.js:624-650`, `resetRenderState` `:279-284`) re-emits them with the existing cache-clear wrapper. Probe confirmed this, including prototype patching after instance construction and no output when stopped.
- Timers: Pi uses `setTimeout(...).unref()` (`components/alt-screen-flash.js:13-20`); instance fields `stopped` (`tui.js:188`) and `altScreenActive` (`tui-alt-screen.js:49`) gate rendering.

## Intent

In Orca fullscreen with `pi-orca-images` active, scrolling or changing image-covered rows with several large images stays responsive: images are re-emitted at most once per burst of image redraws (leading edge plus one trailing redraw after the burst settles, with a bounded maximum wait), while text keeps updating every frame.

## Non-goals

- No image downscaling/transcoding (deferred option B).
- No change to the images-last ordering, env substitution, off switch, capability override or focus hook semantics beyond bypassing the debounce for forced redraws.
- No change for non-Orca terminals, tmux, or `PI_IMAGE_PROTOCOL=none|0`.
- No upstream Pi change.

## Acceptance

- AC-1: Debounce, not throttle: when a Kitty redraw frame (a `prepareKittyScreen` call) contains image lines and either a suppressed burst is open on that instance or the last emitted image redraw was less than 150 ms ago, the frame opens/extends the burst and is written without any Kitty transmission or placement (`a=T`/`a=p`), while row clears, text and `evictedImageDeletion` are preserved. A burst stays suppressed until it closes by quiet period, maximum wait or a forced redraw.
- AC-2: A burst closes with exactly one trailing forced render (`requestRender(true)`), scheduled for `min(lastSuppressed + 150 ms, firstSuppressed + 1000 ms)` and rescheduled on each suppressed frame; it emits all visible images. A forced redraw that emits images before the timer fires cancels the obsolete trailing timer.
- AC-3: Leading-edge and full redraws always emit images: the first image redraw after a quiet period with no open burst, and every full redraw — detected at `doRender` entry (after the package's protocol-promotion reset) as empty `previousScreen` or `previousScreenWidth`/`previousScreenHeight` differing from the terminal's current columns/rows, covering activation, focus-in, the trailing redraw and resize — are never suppressed.
- AC-4: The trailing timer is unref'd, at most one is scheduled per instance, and it does nothing when the instance is stopped or the alternate screen is inactive.
- AC-5: The debounce is installed only under the existing package guards (Orca, no TMUX, off switch not set) with its own idempotence marker, and degrades silently if `prepareKittyScreen` is missing or its result lacks `lines`; frames without image lines are untouched.
- AC-6: Measured with a real `TuiAltScreen`, a stub terminal, a controllable clock and four images, a burst of 30 one-row scrolls spanning more than 150 ms and less than 1000 ms emits image transmissions only on the leading frame and the single trailing redraw (instead of every frame); a burst longer than 1000 ms emits by maximum wait; multiple instances keep independent state; existing package tests still pass.
- AC-7: Manual: in Orca fullscreen with several generated/large images, scrolling and interacting stay responsive; images reappear shortly after scrolling stops and after minimize/restore (user confirmation).

## Clarifications

- User selected option A (debounce image redraws) over downscaling or documenting the limitation.

## Decisions

- Wrap `TuiAltScreen.prototype.prepareKittyScreen` in `pi-packages/pi-orca-images/src/alt-screen-image-order.ts`, installed by the existing installer, always calling the original first so upload-cache and eviction semantics are preserved; suppress by replacing image lines in the returned `lines` with `""`.
- Per-instance state in a `WeakMap`: last image emission time, first-suppressed time, scheduled timer.
- Full redraws bypass suppression: the existing `doRender` wrapper, after its protocol-promotion reset, records per instance whether `previousScreen` is empty or `previousScreenWidth`/`previousScreenHeight` differ from `Math.max(1, terminal.columns/rows)` (mirroring `tui-alt-screen.js:1439-1460`), and the prepare wrapper reads that flag. Plan review round 1 [REJECT] fixes: debounce instead of throttle; dimension-triggered full redraws included.
- Window 150 ms, max wait 1000 ms, exported constants; injectable clock/timers for tests.
- Image line detection uses pi-tui's exported image-line helper if available, otherwise Kitty APC (`\x1b_G`) detection.

## Durable deltas

- None.

## Plan

One worker unit, test-first: unit tests with fake clock/timers for suppression, trailing redraw, max wait, bypass, timer lifecycle and guards; real `TuiAltScreen` integration tests with a stub terminal for AC-1/AC-2/AC-6 (count `a=T`/`a=p` across a scroll burst), failing without the debounce. Update the package README (performance behavior). Focused checks: package test and typecheck, `pnpm run check:ci`. Manual Orca check by the user, then fresh Oracle final verification.

Risks: Pi internals drift (`prepareKittyScreen` shape); suppressed output and Pi's recorded screen diverge until the trailing redraw; images are blank during a scroll burst by design.

## Tasks

- [x] AC-1: Debounce image emission in prepareKittyScreen with trailing forced redraw, tests and README
  - Outcome: debounce implemented and covered for AC-1..AC-6
  - Known entrypoints and skill paths: pi-packages/pi-orca-images/src/alt-screen-image-order.ts, src/alt-screen-image-order.test.ts, src/index.ts, src/environment.ts, README.md; pi-tui dist/tui-alt-screen.js:232-284,1436-1544; C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md; C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: Exploration, Decisions
  - Dependencies: none
  - Output: wrapper + tests + README update
  - Owner: thoth-worker
  - Writes: pi-packages/pi-orca-images/src/**, pi-packages/pi-orca-images/README.md
  - Interface boundaries: TuiAltScreen prepareKittyScreen, requestRender, stopped, altScreenActive
  - Focused check and PASS evidence: package test + typecheck + check:ci pass; scroll-burst integration test counts transmissions only on leading and trailing frames and fails without the debounce
  - Return milestone: tests green
  - Stop / reassessment: prepareKittyScreen unreachable or forced redraws indistinguishable
- [x] AC-2: Trailing forced redraw and max wait, with tests
  - Outcome: debounce implemented and covered for AC-1..AC-6
  - Known entrypoints and skill paths: pi-packages/pi-orca-images/src/alt-screen-image-order.ts, src/alt-screen-image-order.test.ts, src/index.ts, src/environment.ts, README.md; pi-tui dist/tui-alt-screen.js:232-284,1436-1544; C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md; C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: Exploration, Decisions
  - Dependencies: AC-1 unit (same worker, same session)
  - Output: wrapper + tests + README update
  - Owner: thoth-worker
  - Writes: pi-packages/pi-orca-images/src/**, pi-packages/pi-orca-images/README.md
  - Interface boundaries: TuiAltScreen prepareKittyScreen, requestRender, stopped, altScreenActive
  - Focused check and PASS evidence: package test + typecheck + check:ci pass; scroll-burst integration test counts transmissions only on leading and trailing frames and fails without the debounce
  - Return milestone: tests green
  - Stop / reassessment: prepareKittyScreen unreachable or forced redraws indistinguishable
- [x] AC-3: Leading-edge and forced-redraw bypass, with tests
  - Outcome: debounce implemented and covered for AC-1..AC-6
  - Known entrypoints and skill paths: pi-packages/pi-orca-images/src/alt-screen-image-order.ts, src/alt-screen-image-order.test.ts, src/index.ts, src/environment.ts, README.md; pi-tui dist/tui-alt-screen.js:232-284,1436-1544; C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md; C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: Exploration, Decisions
  - Dependencies: AC-1 unit (same worker, same session)
  - Output: wrapper + tests + README update
  - Owner: thoth-worker
  - Writes: pi-packages/pi-orca-images/src/**, pi-packages/pi-orca-images/README.md
  - Interface boundaries: TuiAltScreen prepareKittyScreen, requestRender, stopped, altScreenActive
  - Focused check and PASS evidence: package test + typecheck + check:ci pass; scroll-burst integration test counts transmissions only on leading and trailing frames and fails without the debounce
  - Return milestone: tests green
  - Stop / reassessment: prepareKittyScreen unreachable or forced redraws indistinguishable
- [x] AC-4: Timer lifecycle, with tests
  - Outcome: debounce implemented and covered for AC-1..AC-6
  - Known entrypoints and skill paths: pi-packages/pi-orca-images/src/alt-screen-image-order.ts, src/alt-screen-image-order.test.ts, src/index.ts, src/environment.ts, README.md; pi-tui dist/tui-alt-screen.js:232-284,1436-1544; C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md; C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: Exploration, Decisions
  - Dependencies: AC-1 unit (same worker, same session)
  - Output: wrapper + tests + README update
  - Owner: thoth-worker
  - Writes: pi-packages/pi-orca-images/src/**, pi-packages/pi-orca-images/README.md
  - Interface boundaries: TuiAltScreen prepareKittyScreen, requestRender, stopped, altScreenActive
  - Focused check and PASS evidence: package test + typecheck + check:ci pass; scroll-burst integration test counts transmissions only on leading and trailing frames and fails without the debounce
  - Return milestone: tests green
  - Stop / reassessment: prepareKittyScreen unreachable or forced redraws indistinguishable
- [x] AC-5: Guards, idempotence and degradation, with tests
  - Outcome: debounce implemented and covered for AC-1..AC-6
  - Known entrypoints and skill paths: pi-packages/pi-orca-images/src/alt-screen-image-order.ts, src/alt-screen-image-order.test.ts, src/index.ts, src/environment.ts, README.md; pi-tui dist/tui-alt-screen.js:232-284,1436-1544; C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md; C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: Exploration, Decisions
  - Dependencies: AC-1 unit (same worker, same session)
  - Output: wrapper + tests + README update
  - Owner: thoth-worker
  - Writes: pi-packages/pi-orca-images/src/**, pi-packages/pi-orca-images/README.md
  - Interface boundaries: TuiAltScreen prepareKittyScreen, requestRender, stopped, altScreenActive
  - Focused check and PASS evidence: package test + typecheck + check:ci pass; scroll-burst integration test counts transmissions only on leading and trailing frames and fails without the debounce
  - Return milestone: tests green
  - Stop / reassessment: prepareKittyScreen unreachable or forced redraws indistinguishable
- [x] AC-6: Scroll-burst integration measurement, with tests
  - Outcome: debounce implemented and covered for AC-1..AC-6
  - Known entrypoints and skill paths: pi-packages/pi-orca-images/src/alt-screen-image-order.ts, src/alt-screen-image-order.test.ts, src/index.ts, src/environment.ts, README.md; pi-tui dist/tui-alt-screen.js:232-284,1436-1544; C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md; C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: Exploration, Decisions
  - Dependencies: AC-1 unit (same worker, same session)
  - Output: wrapper + tests + README update
  - Owner: thoth-worker
  - Writes: pi-packages/pi-orca-images/src/**, pi-packages/pi-orca-images/README.md
  - Interface boundaries: TuiAltScreen prepareKittyScreen, requestRender, stopped, altScreenActive
  - Focused check and PASS evidence: package test + typecheck + check:ci pass; scroll-burst integration test counts transmissions only on leading and trailing frames and fails without the debounce
  - Return milestone: tests green
  - Stop / reassessment: prepareKittyScreen unreachable or forced redraws indistinguishable
- [ ] AC-7: Manual Orca responsiveness verification
  - Outcome: user confirms responsive TUI with several large images
  - Known entrypoints and skill paths: none
  - Inputs: package loaded from the main checkout after merge, or worktree path
  - Dependencies: AC-1 unit
  - Output: user confirmation
  - Owner: user (root coordinates)
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: scrolling responsive, images reappear after stop
  - Return milestone: confirmation received
  - Stop / reassessment: still slow → reopen with option B (downscaling)

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: PENDING
**Independent from implementer**: PENDING
**Verdict**: PENDING
**Reviewed record SHA-256**: PENDING

- AC-1: PENDING | check | evidence
- AC-2: PENDING | check | evidence
- AC-3: PENDING | check | evidence
- AC-4: PENDING | check | evidence
- AC-5: PENDING | check | evidence
- AC-6: PENDING | check | evidence
- AC-7: PENDING | check | evidence

## Closeout

**Archive**: PENDING
