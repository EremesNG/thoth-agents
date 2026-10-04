# Change: orca-images-redraw-debounce

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Regression after `orca-fullscreen-kitty-images` (archived 2026-10-03): with `@thoth-agents/pi-orca-images` enabled, an agent rendered 4 generated images in Orca and Pi's TUI became nearly unusable; disabling the package fixed it.
- Measurement (real `TuiAltScreen`, stub terminal, four 1024x1024 PNGs, ~1.4 MB base64 each): streaming text below stationary images emits ~50 bytes per frame in every variant. With the package, a change in an image-covered row retransmits all four images (5,614,202 bytes, 4x `a=T`) and a one-row scroll retransmits the visible ones (4,211,114 bytes); native Pi uses `a=p` (1.5 KB) in the same cases. Cause: the package clears `uploadedKittyImages` on every eligible render (AC-4 of the previous change) and every image redraw re-emits all visible images (`tui-alt-screen.js:1460-1483,1502-1530`).
- addon-image 0.10.0-beta.300 (gitHead d3e32b34): `a=p` also re-decodes the PNG (`createImageBitmap`), so switching to `a=p` only saves transport; with images-last ordering, clearing every image row before the first placement lets `_evictOnAlternate` delete the other cleared images' Kitty payloads, so their later `a=p` fail silently (`q=2`). No Kitty command keeps a placed payload alive. The lever is redraw frequency, not encoding.
- Seam: `TuiAltScreen.prototype.prepareKittyScreen(screen)` (`tui-alt-screen.js:232-277`, same in bundle `chunk-6FX7UEPL.js:108-109`) is resolved at call time and called once per Kitty redraw frame (`:1478-1483`), returning `{ lines, evictedImageDeletion }`. Replacing image anchor lines in `lines` with `""` after calling the original suppresses all `a=T`/`a=p` while row clears, text and deletion sequences are still written. `previousScreen` stores the original `screen` (`:1540-1543`), so unchanged later frames do not restore images; `requestRender(true)` (`tui.js:624-650`, `resetRenderState` `:279-284`) re-emits them with the existing cache-clear wrapper. Probe confirmed this, including prototype patching after instance construction and no output when stopped.
- Manual check after the debounce merge (commit 287fa4e, merge f048026 on 0.5.0): with 4 images from `codex_generate_image` (1024x1536, 1672x941, ...) the TUI still lagged and a row of raw base64 text was visible for seconds, cycling with blank space. Diagnosis: Pi transmits the original image data regardless of display size; a 1024x1536 PNG (4.7 MB) becomes a 6.3 MB Kitty sequence (1,537 APC chunks) for a ~40x30-cell display, ~25 MB per redraw for four images. A real-`TuiAltScreen` probe emitted complete APCs with no base64 outside them, so the visible base64 is not a Pi slicing defect; most likely Orca/xterm.js is overwhelmed by multi-megabyte writes (unconfirmed). `pi-codex-image-gen` returns a native image block (`extensions/index.ts:544-560`) rendered by Pi's native `Image` pass (`tool-execution.js:267-290`).
- Resize facility: `@earendil-works/pi-coding-agent` exports `resizeImage(bytes, mimeType, { maxWidth, maxHeight, maxBytes, jpegQuality }) => Promise<{ data, mimeType, width, height, wasResized } | null>` (`dist/utils/image-resize.d.ts:10`, `dist/index.js:48-49`), Photon/WASM in a worker per call, reachable through the extension virtual module (`core/extensions/virtual-modules.js:11-29`). Probe: 1024x1536 PNG to 360x540 PNG in ~200 ms, 0.9 MB base64 (synthetic noise; real images compress better). The pi-tui `Image` component (`dist/components/image.js:25-59,118-120`) keeps plain fields `base64Data`, `mimeType`, `dimensions`, caches its rendered lines and is invalidated by `invalidate()`; display width is `max(1, min(width-2, maxWidthCells ?? 60))` cells, default max rows from cell dimensions (`getCellDimensions` exported, default 9x18). Component strings are separate from the tool-result blocks sent to the model (`tool-result-images.js`).
- Real-session evidence (manual AC-7 failed again after the downscale merge 217904d): `PI_TUI_WRITE_LOG` capture of a resumed session with 4 generated images and ~5-6 wheel ticks: 67.9 MB, 78 synchronized frames, 60 of them carrying image transmissions of 1.2-1.8 MB each; 110 `a=T` for 4 images (one image 43 times); downscaling applied (sent as 360x540 and 540x304 PNGs); 16,488 APC chunks all complete and zero base64 runs outside APCs, so the visible raw base64 originates on the Orca side. Frames alternate between a scroll frame that emits images (each wheel tick arrives after the 150 ms quiet window, so it counts as a leading edge) and the trailing forced redraw (`CSI 2J`) that emits them again: two transmissions per tick. Orca stays laggy even at ~1.2 MB per frame.
- Timers: Pi uses `setTimeout(...).unref()` (`components/alt-screen-flash.js:13-20`); instance fields `stopped` (`tui.js:188`) and `altScreenActive` (`tui-alt-screen.js:49`) gate rendering.

## Intent

In Orca fullscreen with `pi-orca-images` active, images are transmitted at their displayed pixel size instead of their original size, and scrolling or changing image-covered rows with several large images stays responsive: images are never transmitted while scrolling or while image-covered rows change; they are emitted once per settle by a single trailing full redraw (bounded by a maximum wait), while text keeps updating every frame.

## Non-goals

- Downscaling never alters the tool-result content sent to the model; no new dependency (uses Pi's exported `resizeImage`).
- No change to the images-last ordering, env substitution, off switch, capability override or focus hook semantics beyond bypassing the debounce for forced redraws.
- No change for non-Orca terminals, tmux, or `PI_IMAGE_PROTOCOL=none|0`.
- No upstream Pi change.

## Acceptance

- AC-1: Images never transmit on non-full redraws: every Kitty redraw frame (a `prepareKittyScreen` call) that is not a full redraw and contains image lines is written without any Kitty transmission or placement (`a=T`/`a=p`), while row clears, text and `evictedImageDeletion` are preserved; there is no leading-edge emission for scroll or covered-row changes.
- AC-2: Images are emitted once per settle: each suppressed frame (re)schedules exactly one trailing forced render (`requestRender(true)`) at `min(lastSuppressed + 800 ms, firstSuppressed + 3000 ms)`, which emits all visible images; a full redraw that emits images before the timer fires cancels the obsolete timer.
- AC-3: Full redraws always emit images: every full redraw, detected at `doRender` entry (after the package's protocol-promotion reset) as empty `previousScreen` or `previousScreenWidth`/`previousScreenHeight` differing from the terminal's current columns/rows, covering activation, focus-in, the trailing redraw and resize, is never suppressed.
- AC-4: The trailing timer is unref'd, at most one is scheduled per instance, and it does nothing when the instance is stopped or the alternate screen is inactive.
- AC-5: The debounce is installed only under the existing package guards (Orca, no TMUX, off switch not set) with its own idempotence marker, and degrades silently if `prepareKittyScreen` is missing or its result lacks `lines`; frames without image lines are untouched.
- AC-6: Measured with a real `TuiAltScreen`, a stub terminal, a controllable clock and four images, a sequence of 6 one-row scrolls spaced 300 ms apart emits no image transmission on any scroll frame and exactly one transmission set from the single trailing redraw after the last scroll; scrolls spaced 1000 ms apart emit one trailing set per scroll; 30 rapid scrolls within 600 ms emit images only from the single trailing redraw; a continuously suppressed burst longer than 3000 ms emits by maximum wait; multiple instances keep independent state; existing package tests still pass.
- AC-8: In Orca with the package active (same guards and off switch), the first render of a pi-tui `Image` whose `mimeType` is `image/png` and whose base64 exceeds 256 KB starts one asynchronous `resizeImage` to its displayed pixel box (display columns times cell width by display rows times cell height, from `getCellDimensions`), until it completes the component renders blank lines with the row count Pi computes for the original dimensions (no Kitty sequence); on success with `wasResized` and a PNG result it replaces only that component's display data and `dimensions` with the actual encoded result (so Kitty crop metadata stays correct), clears the component's cached converted data (`pngData`), invalidates it and requests an ordinary TUI render (respecting the debounce); the final row count comes from the encoded dimensions and may differ from the placeholder by at most one row, a single accepted adjustment; a result whose computed row count differs by more than one row (e.g. orientation applied by the resizer) is discarded and the original data kept. A result that was not resized, a non-PNG result, a null result or any error keeps the original data once, with no retry. Images at or below 256 KB, non-Orca sessions and the off switch keep Pi's behavior.
- AC-9: Resized results are cached by a SHA-256 digest of the source data (never the source string), bounded by 32 entries and 16 MB of cached base64, so re-created components for the same image do not resize again; at most one resize is in flight per source; the model-facing tool-result content is unchanged; with four 1024x1536 PNG fixtures, an 80x140 viewport and pinned 9x18-pixel cells, the Kitty bytes per full redraw drop by at least 5x versus the original data (measured with a real `TuiAltScreen`). Regression tests cover a 655x600 PNG whose resized row count differs by one, a >256 KB JPEG that is left to Pi's native path, a resize result whose row count differs by more than one (discarded), and a non-PNG resize result (discarded; the image still renders as Kitty with no transcoder registered).
- AC-7: Manual: in Orca fullscreen with several generated/large images, scrolling and interacting stay responsive; images reappear shortly after scrolling stops and after minimize/restore (user confirmation).

## Clarifications

- User selected option A (debounce image redraws) over downscaling or documenting the limitation.

## Decisions

- Wrap `TuiAltScreen.prototype.prepareKittyScreen` in `pi-packages/pi-orca-images/src/alt-screen-image-order.ts`, installed by the existing installer, always calling the original first so upload-cache and eviction semantics are preserved; suppress by replacing image lines in the returned `lines` with `""`.
- Per-instance state in a `WeakMap`: last image emission time, first-suppressed time, scheduled timer.
- Full redraws bypass suppression: the existing `doRender` wrapper, after its protocol-promotion reset, records per instance whether `previousScreen` is empty or `previousScreenWidth`/`previousScreenHeight` differ from `Math.max(1, terminal.columns/rows)` (mirroring `tui-alt-screen.js:1439-1460`), and the prepare wrapper reads that flag. Plan review round 1 [REJECT] fixes: debounce instead of throttle; dimension-triggered full redraws included.
- Quiet window 800 ms (user-selected after manual feedback that the pause when reversing scroll direction exceeded 400 ms and triggered a redraw), max wait 3000 ms, exported constants; injectable clock/timers for tests (superseding the first-round 150 ms / 1000 ms values).
- User decision context: option B (downscale) was the recorded fallback if the debounce alone stayed slow; AC-7 failed, so B is added to this change.
- Downscale: wrap pi-tui `Image.prototype.render` (call-time, own idempotence marker); target box = cells computed the way Pi does (`maxWidth = max(1, min(width-2, maxWidthCells ?? 60))`, rows from aspect ratio and cell dimensions) times `getCellDimensions()`; `resizeImage(Buffer.from(base64, 'base64'), mimeType, { maxWidth, maxHeight, maxBytes: <original decoded byte length> })` so the PNG candidate (tried first) is selected whenever it is not larger than the source; the TUI instance to re-render is the latest alt-screen instance seen by the existing `doRender` wrapper, skipped when stopped or inactive; threshold 256 KB, cache 32 entries / 16 MB are exported constants. Plan review round 3 [REJECT] fixes: placeholder from original geometry with actual encoded dimensions after swap (one-row adjustment accepted, not stretched); no PNG assumption, `pngData` cleared and Pi's transcoder handles non-PNG; digest-keyed byte-bounded cache. Plan review round 4 [REJECT] fix (EXIF orientation can change geometry by many rows): downscale only `image/png` sources, which Pi does not orientation-correct in its native Kitty path, and discard any result whose row count differs from the placeholder by more than one row; non-PNG sources keep Pi's native behavior. Plan review round 5 [REJECT] fix: Pi's PNG transcoder is not guaranteed registered in Orca, so only PNG resize outputs are accepted; non-PNG outputs are discarded. Accepted risk: if Pi's resize worker fails, its in-process Photon fallback can block the UI briefly.
- Revision after the real-session evidence (user selected option A, final bounded attempt; stop condition: if Orca is still laggy, stop code changes, document the limitation and escalate to Orca/xterm.js): remove the leading-edge emission so only full redraws emit images, raise the quiet window to 400 ms so wheel ticks a few hundred milliseconds apart form one settle (plan review round 7 [OKAY] noted that 150 ms still yields one full redraw per 300 ms-spaced tick), and raise the maximum wait to 3000 ms so a long scroll does not stall mid-way.
- Image line detection uses pi-tui's exported image-line helper if available, otherwise Kitty APC (`\x1b_G`) detection.

## Durable deltas

- None.

## Plan

One worker unit, test-first: unit tests with fake clock/timers for suppression, trailing redraw, max wait, bypass, timer lifecycle and guards; real `TuiAltScreen` integration tests with a stub terminal for AC-1/AC-2/AC-6 (count `a=T`/`a=p` across a scroll burst), failing without the debounce. Update the package README (performance behavior). Focused checks: package test and typecheck, `pnpm run check:ci`. Manual Orca check by the user, then fresh Oracle final verification.

Risks: Pi internals drift (`prepareKittyScreen` shape); suppressed output and Pi's recorded screen diverge until the trailing redraw; images are blank during a scroll burst by design.

## Tasks

- [x] AC-1: Suppress image emission on non-full redraws in prepareKittyScreen, with tests and README
  - Outcome: debounce implemented and covered for AC-1..AC-6
  - Known entrypoints and skill paths: pi-packages/pi-orca-images/src/alt-screen-image-order.ts, src/alt-screen-image-order.test.ts, src/index.ts, src/environment.ts, README.md; pi-tui dist/tui-alt-screen.js:232-284,1436-1544; C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md; C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: Exploration, Decisions
  - Dependencies: none
  - Output: wrapper + tests + README update
  - Owner: thoth-worker
  - Writes: pi-packages/pi-orca-images/src/**, pi-packages/pi-orca-images/README.md
  - Interface boundaries: TuiAltScreen prepareKittyScreen, requestRender, stopped, altScreenActive
  - Focused check and PASS evidence: package test + typecheck + check:ci pass; scroll integration tests count no transmissions on scroll frames and one set per settle from the trailing redraw and fails without the debounce
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
  - Focused check and PASS evidence: package test + typecheck + check:ci pass; scroll integration tests count no transmissions on scroll frames and one set per settle from the trailing redraw and fails without the debounce
  - Return milestone: tests green
  - Stop / reassessment: prepareKittyScreen unreachable or forced redraws indistinguishable
- [x] AC-3: Full-redraw bypass, with tests
  - Outcome: debounce implemented and covered for AC-1..AC-6
  - Known entrypoints and skill paths: pi-packages/pi-orca-images/src/alt-screen-image-order.ts, src/alt-screen-image-order.test.ts, src/index.ts, src/environment.ts, README.md; pi-tui dist/tui-alt-screen.js:232-284,1436-1544; C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md; C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: Exploration, Decisions
  - Dependencies: AC-1 unit (same worker, same session)
  - Output: wrapper + tests + README update
  - Owner: thoth-worker
  - Writes: pi-packages/pi-orca-images/src/**, pi-packages/pi-orca-images/README.md
  - Interface boundaries: TuiAltScreen prepareKittyScreen, requestRender, stopped, altScreenActive
  - Focused check and PASS evidence: package test + typecheck + check:ci pass; scroll integration tests count no transmissions on scroll frames and one set per settle from the trailing redraw and fails without the debounce
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
  - Focused check and PASS evidence: package test + typecheck + check:ci pass; scroll integration tests count no transmissions on scroll frames and one set per settle from the trailing redraw and fails without the debounce
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
  - Focused check and PASS evidence: package test + typecheck + check:ci pass; scroll integration tests count no transmissions on scroll frames and one set per settle from the trailing redraw and fails without the debounce
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
  - Focused check and PASS evidence: package test + typecheck + check:ci pass; scroll integration tests count no transmissions on scroll frames and one set per settle from the trailing redraw and fails without the debounce
  - Return milestone: tests green
  - Stop / reassessment: prepareKittyScreen unreachable or forced redraws indistinguishable
- [x] AC-8: Downscale large images to their displayed size before Kitty transmission, with tests
  - Outcome: Image render wrapper with async resize, blank placeholder, fallback, guards
  - Known entrypoints and skill paths: pi-packages/pi-orca-images/src/** (new module image-downscale.ts + test, registration in src/index.ts), README.md; pi-tui dist/components/image.js:25-120, dist/terminal-image.js:7-13,362-389,520-544; coding-agent dist/utils/image-resize.d.ts, dist/utils/image-resize-core.js; C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md; C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md
  - Inputs: Exploration resize facts, Decisions (Downscale)
  - Dependencies: AC-1 unit (accepted, merged)
  - Output: module + tests + README
  - Owner: thoth-worker
  - Writes: pi-packages/pi-orca-images/src/**, pi-packages/pi-orca-images/README.md
  - Interface boundaries: pi-tui Image component, getCellDimensions, coding-agent resizeImage, TuiAltScreen requestRender
  - Focused check and PASS evidence: package test + typecheck + check:ci pass; tests show placeholder rows, swap after resolve, fallback on failure, unchanged result content
  - Return milestone: tests green
  - Stop / reassessment: resizeImage or Image fields unreachable from the extension
- [x] AC-9: Resize cache and byte-reduction measurement, with tests
  - Outcome: bounded cache, single in-flight resize, measured byte reduction
  - Known entrypoints and skill paths: same as the AC-8 unit
  - Inputs: AC-8 module
  - Dependencies: AC-8 unit (same worker, same session)
  - Output: tests incl. real TuiAltScreen measurement with four 1024x1536 PNGs
  - Owner: thoth-worker
  - Writes: pi-packages/pi-orca-images/src/**
  - Interface boundaries: none beyond AC-8
  - Focused check and PASS evidence: Kitty bytes per full redraw at least 5x lower than original
  - Return milestone: tests green
  - Stop / reassessment: reduction below 5x on realistic images
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
  - Stop / reassessment: still laggy → stop code changes (option B of the evidence review: document and escalate to Orca/xterm.js)

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
- AC-8: PENDING | check | evidence
- AC-9: PENDING | check | evidence

## Closeout

**Archive**: PENDING
