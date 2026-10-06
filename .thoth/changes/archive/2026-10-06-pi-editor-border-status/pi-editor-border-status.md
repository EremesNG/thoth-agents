# Change: pi-editor-border-status

**Classification**: substantial
**Scope**: local
**Uncertainty**: low
**Risk**: medium

## Exploration

- `pi-packages/pi-thoth-theme/src/status-line/{index.ts,layout.ts,cost.ts}` render a one-row footer via `ctx.ui.setFooter` showing model, effort, cwd/branch, context bar + `contextTokens/contextWindow`, and cost (incl. subagent `(sub)`). It reads `ctx.model`, `ctx.thinkingLevel`, `footerData.getGitBranch()`, `ctx.cwd`, `ctx.getContextUsage()`; it does not render `footerData.getExtensionStatuses()` (asserted in `status-line.test.ts`).
- `src/input-box/{decorate.ts,frame.ts,state.ts}` decorate the focused editor in place (no `setEditorComponent`; the footer decorates the focused component during `render`). `frame.ts` fits ONE label per border then fills with rule: top = `▲ ready` / native working indicator + elapsed, then `↑ N more` when scrolled; bottom = rule or `↓ N more`. Decorator deps are only `theme` and `working`.
- Installed Pi `@earendil-works/pi-coding-agent` 1.0.2 exposes protected `renderTopBorder`/`renderBottomBorder` on `Editor` (already used). `pi-core/src/work-panel-host.ts` wraps the editor factory for subagents/background tasks, so this change must keep in-place decoration and must not register an editor factory.
- Reference design: `felipeadeildo/pi-harness` `packages/look` (`render/frame.ts` `border`, `render/fit.ts` `fitRegions`) fits left/right cells against one shared budget, fills the gap with the horizontal rule and degrades lowest-priority pieces first.
- Session usage totals are derivable from `Usage.input/output/cacheRead` on entries (same entries iterated by `cost.ts`). Tok/s exists only in `pi-subagents/src/render/tools/formatting.ts` (`output * 1000 / generationMs`, generation measured `message_start`→`message_end`); nothing comparable exists in the theme.
- No `.thoth/specs/` capability covers the theme status line or input box.

## Intent

Move the editor-adjacent status into the input-box borders and slim the footer:

- Top border: left = status/spinner + elapsed, then git branch; right = cwd.
- Bottom border: left = model + effort; right = context bar + context tokens.
- Footer (below editor): cost, session tokens (input, output, cache read), tok/s.
- Nothing is added above the editor; that space stays for widgets.

## Non-goals

- No above-editor strip/widget.
- No `setEditorComponent` registration or change to `pi-core` work-panel host.
- No rendering of extension statuses (`setStatus`) — unchanged from today.
- No git ahead/behind/dirty counts, host name, permission mode or quota display.
- No package version bump; no changes outside `pi-packages/pi-thoth-theme`.

## Acceptance

- AC-1: With sufficient width, the top border renders `<status/spinner + elapsed> <branch>` at the left and `<cwd>` flush right, joined by the rule fill; scroll `↑ N more` stays visible; the line is exactly `width` visible cells.
- AC-2: The bottom border renders `<model> <effort>` at the left and `<context bar> <tokens/window>` flush right; scroll `↓ N more` stays visible; exactly `width` visible cells; absent context usage shows a dash.
- AC-3: Borders degrade deterministically as width shrinks (right segment compacts/drops before left status; status label never disappears while width allows the current minimal frame) and never exceed `width`; narrow-width plain-rule fallback remains.
- AC-4: The footer row shows only cost (with `(sub)` behavior preserved), session token totals input/output/cache-read and average tok/s; it no longer shows model, effort, cwd, branch or context; it degrades to width and stays one row.
- AC-5: Border content refreshes on the existing triggers (model/thinking change, context/message end, branch change, working state) without registering an editor factory, and existing decorator lifecycle (disposal, mouse geometry, native fallback) still passes.
- AC-7: The pre-existing stale `test/render-kit-widget.test.ts` (imports exports removed in 4c9ccaf) is aligned with the current render-kit API, or the unintentionally removed exports are restored, so the baseline package typecheck and tests pass before feature work.
- AC-6: Package checks pass: `pi-thoth-theme` typecheck and `vitest run`, and repo `pnpm run check:ci`.

## Clarifications

- User (2026-10-06): no status line above the editor (reserved for widgets); top-left status/spinner+time and git branch, top-right cwd; bottom-left model+effort, bottom-right context bar+tokens; footer cost, tokens (output, input, cache read), tok/s. Inspired by, not a copy of, the pi-harness screenshot.

## Decisions

- D1: Keep in-place decoration; extend the decorator deps with a border-content provider fed by the status-line data source (single data reader shared by footer and borders).
- D2: Generalize `frame.ts` fitting to left/right regions against one shared budget with rule fill (pi-look approach); scroll indicators are appended after the left region content (status first), preserving the pre-existing ordering. Reconciled after final verification round 1.
- D3 (bounded assumption): Session token totals use the same entry scope as `cost.ts` aggregation, main session only (subagent tokens excluded; cost keeps its `(sub)` behavior).
- D4 (bounded assumption): tok/s = average over main-session assistant messages measured this runtime (sum output tokens ×1000 / sum `message_start`→`message_end` ms), mirroring the subagents formula; shows a dash until a message is measured (e.g. right after resume).
- D5: Extension statuses remain unrendered (current behavior).
- D6: Ownership per constitution: Worker owns baseline repair and nonvisual data (shared snapshot available before editor render, provider plumbing, token totals, throughput tracker); Designer owns visual composition (frame left/right fitting, border content, footer row, degradation). Units on shared files run strictly in sequence, one writer at a time.
- D7: Exact-width assertions apply to borders; the footer must stay within width.

## Durable deltas

- None.

## Plan

- Data: refactor `status-line/index.ts` to build one snapshot (model, effort, branch, cwd, context, cost, token totals, tok/s) consumed by both footer render and the editor decorator via a provider callback passed through `decorate` deps. Add a token-totals helper beside `cost.ts`, and a small throughput tracker subscribed to assistant `message_start`/`message_end`.
- Frame: in `input-box/frame.ts` add left/right region fitting (visibleWidth/truncateToWidth), degradation order: right compacts → right drops → left secondary (branch / effort) drops → truncate left; keep plain-rule path for tiny widths. Top left = existing working label (+elapsed) + branch; bottom left = model + effort; reuse `layout.ts` segment formatters (model glyph, effort, cwd shortening, context bar) instead of duplicating.
- Footer: `layout.ts` row reduced to cost, tokens (↑input ↓output cache-read), tok/s with width degradation.
- Tests first (TDD): extend `frame.test.ts` (exact widths, left/right, degradation, scroll), `decorate.test.ts`/`real-theme.test.ts` (border content via provider), `layout.test.ts`/`status-line.test.ts` (new footer row, refresh triggers), new tests for token totals and throughput.
- Risks: runtime-private `workingStatusIndicator` access (pre-existing); width math with ANSI/wide glyphs; extra repaint cost (reuse existing caching keyed by width+data).

## Tasks

- [x] AC-7: Baseline repair of the stale render-kit widget test
  - Outcome: baseline theme typecheck and tests pass before feature work
  - Known entrypoints and skill paths: pi-packages/pi-thoth-theme/test/render-kit-widget.test.ts, the missing imports now belong to pi-subagents/src/ui/background-widget.ts (removed from the theme in commit 4c9ccaf); prefer adapting the test within the theme
  - Inputs: Oracle plan review evidence (imports at :6-8, failure at :46)
  - Dependencies: none
  - Output: aligned test (or restored exports when removal was unintended), with rationale
  - Owner: thoth-worker
  - Writes: pi-packages/pi-thoth-theme/test/render-kit-widget.test.ts
  - Interface boundaries: render-kit consumers in other pi-packages must keep compiling
  - Focused check and PASS evidence: theme typecheck exit 0 and the widget test passes
  - Return milestone: baseline green
  - Stop / reassessment: if intended API is ambiguous (test vs code), return both options with facts
- [x] AC-5: Shared status snapshot, decorator provider and refresh triggers
  - Outcome: one snapshot (model, effort, branch, cwd, context, cost, token totals, tok/s) readable by the decorator independently of footer render order; refresh on model/thinking/branch/context/working changes; no editor factory
  - Known entrypoints and skill paths: src/status-line/index.ts, src/input-box/decorate.ts (deps type only), status-line.test.ts, decorate.test.ts; skill C:/Users/EremesNG/.pi/agent/skills/tdd/SKILL.md
  - Inputs: Decisions D1, D6
  - Dependencies: AC-7 accepted
  - Output: provider interface + snapshot with tests
  - Owner: thoth-worker
  - Writes: src/status-line/index.ts, src/input-box/decorate.ts (provider dependency plumbing only), related tests
  - Interface boundaries: no setEditorComponent; pi-core work-panel host untouched; existing decorator lifecycle (disposal, mouse geometry, native fallback) preserved
  - Focused check and PASS evidence: status-line and decorate suites pass including new trigger tests
  - Return milestone: provider exposes fresh data in tests
  - Stop / reassessment: data cannot reach the decorator without an editor factory
- [x] AC-4: Token totals and throughput data
  - Outcome: session input/output/cache-read totals (D3) and average tok/s (D4) computed and exposed in the snapshot
  - Known entrypoints and skill paths: src/status-line/cost.ts, new helpers beside it, pi-subagents/src/render/tools/formatting.ts (formula reference), pi-subagents/src/runner/snapshot-builder.ts
  - Inputs: Decisions D3, D4
  - Dependencies: AC-5 accepted
  - Output: helpers + tests (finite/positive durations, session reset, unmatched message events)
  - Owner: thoth-worker
  - Writes: src/status-line/ new helper files and tests, src/status-line/index.ts wiring
  - Interface boundaries: cost (sub) behavior preserved
  - Focused check and PASS evidence: helper tests pass
  - Return milestone: snapshot carries totals and tok/s
  - Stop / reassessment: usage fields unavailable on entries
- [x] AC-1: Left/right border fitting in the input-box frame
  - Outcome: frame composes left and right regions against one budget with rule fill and scroll indicators, exact width
  - Known entrypoints and skill paths: src/input-box/frame.ts, frame.test.ts; reference github.com/felipeadeildo/pi-harness packages/look/src/render/frame.ts
  - Inputs: Decisions D2, D7
  - Dependencies: AC-4 accepted (serializes writers)
  - Output: frame API + tests
  - Owner: thoth-designer
  - Writes: src/input-box/frame.ts, frame.test.ts
  - Interface boundaries: callers in decorate.ts
  - Focused check and PASS evidence: frame tests pass with exact-width cases
  - Return milestone: frame tests green
  - Stop / reassessment: border hooks cannot carry right-aligned content
- [x] AC-2: Border content composition from the snapshot
  - Outcome: top left status+elapsed, branch / top right cwd; bottom left model+effort / bottom right context bar+tokens
  - Known entrypoints and skill paths: src/input-box/decorate.ts, src/status-line/layout.ts (reuse formatters), real-theme.test.ts, decorate.test.ts
  - Inputs: AC-1 frame API, AC-5 provider
  - Dependencies: AC-1 accepted
  - Output: rendered borders with tests
  - Owner: thoth-designer
  - Writes: src/input-box/decorate.ts, src/status-line/layout.ts and their tests
  - Interface boundaries: provider interface from AC-5 unchanged
  - Focused check and PASS evidence: decorate and real-theme suites pass
  - Return milestone: borders render new content
  - Stop / reassessment: provider interface insufficient
- [x] AC-4: Slim footer row
  - Outcome: footer shows cost, ↑input ↓output cache-read, tok/s only, one row within width
  - Known entrypoints and skill paths: src/status-line/layout.ts, layout.test.ts, status-line.test.ts
  - Inputs: AC-4 data, AC-2 output
  - Dependencies: AC-2 accepted
  - Output: footer row + tests
  - Owner: thoth-designer
  - Writes: src/status-line/layout.ts and tests
  - Interface boundaries: cost (sub) behavior preserved
  - Focused check and PASS evidence: layout and status-line suites pass
  - Return milestone: footer tests green
  - Stop / reassessment: none
- [x] AC-3: Width degradation coverage
  - Outcome: deterministic degradation for borders (exact width) and footer (within width) across widths 24..200 and the narrow fallback
  - Known entrypoints and skill paths: frame.test.ts, layout.test.ts, real-theme.test.ts
  - Inputs: AC-1, AC-2, footer outputs
  - Dependencies: slim footer accepted
  - Output: degradation tests
  - Owner: thoth-designer
  - Writes: theme test files
  - Interface boundaries: none
  - Focused check and PASS evidence: tests pass
  - Return milestone: suite green
  - Stop / reassessment: none
- [x] AC-6: Package and repo checks
  - Outcome: theme typecheck and vitest run plus repo pnpm run check:ci pass
  - Known entrypoints and skill paths: pi-packages/pi-thoth-theme/package.json
  - Inputs: all prior outputs
  - Dependencies: AC-3 accepted
  - Output: passing check evidence
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: all three commands exit 0
  - Return milestone: all green
  - Stop / reassessment: new failures go back to the owning unit

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 5cdf6b1df067779562840ee89f449a5aff09a1cd190c9bb44567690a742eccf5

- AC-1: PASS | Top-border composition and alignment | Frame/decorator tests verify status, branch, flush-right cwd, scroll ordering and exact width.
- AC-2: PASS | Bottom-border composition and alignment | Decorator and real-theme tests verify model, effort, context, scroll counts, absent-usage dash and exact width.
- AC-3: PASS | Deterministic degradation | Tests cover widths 0-200, ANSI/wide glyphs, Windows cwd compaction, right-before-left degradation and native narrow fallback.
- AC-4: PASS | Slim footer and usage calculations | Layout/integration tests verify cost including (sub), main-session input/output/cache-read, weighted tok/s, reset behavior and one-row width bounds.
- AC-5: PASS | Refresh and decorator lifecycle | Tests verify event invalidation, pre-footer snapshot reads, post-persistence leaf refresh, working animation, disposal, mouse geometry and native fallback.
- AC-6: PASS | Required validation | Package typecheck exit 0; pnpm test 35 files/978 tests passed; root check:ci exit 0 with no errors; git diff --check passed.
- AC-7: PASS | Baseline render-kit test alignment | render-kit-widget.test.ts uses current indicator/widgetHeading/treeRow APIs; package typecheck and tests pass.
- Source: pi-packages/pi-thoth-theme/src/input-box/decorate.test.ts | sha256:d2895a28295b19636bf2156b3d018c8cd0a83550d40129aaa028e2b4b225d317
- Source: pi-packages/pi-thoth-theme/src/input-box/decorate.ts | sha256:bd981c9fd5c93a05a327bec12f3ebda3c24101b2beed1b1344602057dd34a06c
- Source: pi-packages/pi-thoth-theme/src/input-box/frame.test.ts | sha256:2ffcb5daae48057f69aa7788c0262508ddf9a1889dcf576d7abba0115234c775
- Source: pi-packages/pi-thoth-theme/src/input-box/frame.ts | sha256:f7560c50816e45111023f099d2467265907b6b357d967443d61a524aa6085bf6
- Source: pi-packages/pi-thoth-theme/src/input-box/real-theme.test.ts | sha256:73d727fe1c2599b45055c8d6752c93991aca8ff10d4a02be6c63c5305e421199
- Source: pi-packages/pi-thoth-theme/src/status-line/index.ts | sha256:b1e1aabb83c56aba6d0cd82fe033cb9818dd0429cefa46abe8b5469ed8eb0248
- Source: pi-packages/pi-thoth-theme/src/status-line/layout.test.ts | sha256:f33db49ce31f715a4e441d860752e44309343332908d1234d85b9e9c2de769fc
- Source: pi-packages/pi-thoth-theme/src/status-line/layout.ts | sha256:34ad1b9610dc1f99db4d29e3d97868e3b8968815675295834b42ac77ff633f4e
- Source: pi-packages/pi-thoth-theme/src/status-line/snapshot.ts | sha256:2dffa0bc0f01ff07ba7fb1b939c812f9948609210edcf3eda98c55f484c1559b
- Source: pi-packages/pi-thoth-theme/src/status-line/status-line.test.ts | sha256:37a2ac2925917a3feefcb30f30bc082dff1a2ccc984e9617a1e1e5a937b7e741
- Source: pi-packages/pi-thoth-theme/src/status-line/throughput.test.ts | sha256:3421bf5f9fbd9b15e7b793e9ef212910219cc71112cee8c8f5b0fbd0cf3fb482
- Source: pi-packages/pi-thoth-theme/src/status-line/throughput.ts | sha256:9a0c3ff1afc75c3615e028f148f8e758156f2ebf073e74eb731c7fc7f5cb9f67
- Source: pi-packages/pi-thoth-theme/src/status-line/tokens.test.ts | sha256:7b44c78e773aa8f38e8e1c4c3f4fbb389740401ac6a51c13fdf68fa2b7c53bdc
- Source: pi-packages/pi-thoth-theme/src/status-line/tokens.ts | sha256:6856cce007c75b1f729efd7fbacf513ebc56df9e7b73b27c0e18fe5e6186cefa
- Source: pi-packages/pi-thoth-theme/test/render-kit-widget.test.ts | sha256:80dcf6ebd43b7c4a9536235602d2be4aca8dfaeb2503b6f5c8418fde6b33d93e
- Provenance: plan review OKAY on round 3 after two REJECT rounds (fresh Oracle each); implementation authorized by explicit user choice 2026-10-06; final reviewer task subtask_thoth-oracle_1791303330240_22ea8d2f (R1 FAIL fixed, R2 PASS without fingerprints, R3 record-only confirmation).
- Risk: private Pi editor hooks remain a compatibility risk; no interactive terminal smoke test was performed.

## Closeout

**Archive**: READY
