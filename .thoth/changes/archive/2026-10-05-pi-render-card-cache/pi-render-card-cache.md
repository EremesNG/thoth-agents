# Change: pi-render-card-cache

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- Symptom: typing/backspace in the Pi editor is smooth in a fresh session and degrades as the transcript grows or after `/resume` of a long session.
- CPU profiles captured by the user (`C:\tmp\piprof`, main processes `127236` = resumed long session, `122740` = fresh session) while holding a key and backspace:
  - Resumed: 79.3 s wall; `doRender` inclusive ~44.0 s; `kit.card` (`pi-packages/pi-thoth-theme/src/render-kit/index.ts:56`) inclusive 41.5 s; `renderBox` (`pi-packages/pi-thoth-theme/src/tools/box.ts:162`) 35.8 s; pi-tui `truncateToWidth` inclusive 38.1 s (24.2 s self) plus `graphemeWidth` 9.6 s self.
  - Callers (inclusive): pi-subagents `src/render/tools/components.ts:107` 27.5 s and `src/render/completion-message.ts:248` 9.1 s; task-list package (`pi-packages/pi-to*`) `view/format.ts:196`/`:259` ~4.1 s; pi-background-tasks `src/render/messages.ts:45`/`src/render/tools.ts:129` ~1.3 s; pi-subagents `resolveExpandHint` ~1.0 s; pi-claude-bridge and pi-antigravity-bridge renderers smaller.
  - Fresh: 48.0 s wall; `doRender` inclusive 0.66 s total. Editor `handleInput` ≤ 0.12 s in both, so editor-wrapper stacking is not a measured cost.
- Pi host (`@earendil-works/pi-coding-agent` `ToolExecutionComponent.updateDisplay`, `CustomMessageComponent.rebuild`) creates a fresh renderer component when args/result/state/expanded change or on `invalidate()`; ordinary frames (keystrokes) call `render(width)` on the existing instance. Ctrl+O recreates via `setExpanded`; resize only changes the `width` argument; theme change calls `ui.invalidate()`.
- pi-tui alt-screen layout renders the whole transcript container each frame, so uncached child `render(width)` cost is paid per keystroke for every historical card.
- `pi-thoth-theme` built-in tool renderers already wrap output in `cachedComponent` (`src/shared/cache.ts`, width-keyed, cleared by `invalidate()`); consumers of `kit.card` in pi-subagents, task-list package, pi-background-tasks, pi-claude-bridge and pi-antigravity-bridge return uncached `{ render, invalidate }` objects and call `getRenderKit()` + `kit.card(...)` on every render.
- Completed cards have frozen inputs; live elapsed ticking (`pi-thoth-theme/src/tools/ticker.ts`) calls `context.invalidate()`, which recreates/invalidates components.
- `renderBox` applies no row budget and calls `truncateToWidth` per body line twice plus a final `result.map(truncateToWidth)` pass; expanded subagent cards pass every response line.
- Active spec `.thoth/specs/pi-ecosystem/spec.md` "Thoth Pi render kit" requires first-party packages to look up the kit at render time and keep a native shell when it is absent.

## Intent

Make the editor stay responsive in long and resumed sessions by ensuring historical kit-rendered cards do not recompute their framed lines on every frame, and by removing redundant per-line truncation work in `renderBox`, without changing rendered output.

## Non-goals

- No changes to pi-tui / pi-coding-agent (third-party) layout traversal.
- No row budget or truncation of expanded output (expanded cards keep showing all lines).
- No caching of live above-editor widgets or overlays (e.g. `pi-packages/pi-subagents/src/ui/background-widget.ts`, the task-list package overlay (`pi-packages/pi-to*/*-overlay.ts`)): they read live state and request renders without invalidation/recreation, so width/kit-only caching would freeze them.
- No refactor of editor-factory wrapping in pi-background-tasks / pi-subagents (not a measured cost; possible follow-up).
- No change to status-line cost scan or `/resume` replay walks (lifecycle-only cost).
- No visual changes; no version bumps.

## Acceptance

- AC-1: `@thoth-agents/pi-core` exports a render memo helper that returns cached lines for repeated renders at the same width with the same registered kit, recomputes when width or the looked-up kit changes, and clears on `invalidate()`; covered by unit tests.
- AC-2: `renderBox` output is byte-identical to the current implementation for existing and new edge-case tests (ANSI, escape-split ZWJ/flag grapheme clusters such as `xx👩\x1b[31m‍💻\x1b[0m`, wide graphemes, over-width lines, narrow widths) while skipping `truncateToWidth` only for escape-free printable-ASCII lines whose length fits the limit; every other line keeps all current truncation passes.
- AC-3: pi-subagents tool cards, completion and question messages render each card body once per (width, kit) between invalidations, and the expand-hint key text is not re-resolved on every frame; existing render tests stay green and new tests prove reuse plus invalidation/width/kit-change recomputation.
- AC-4: task-list package, pi-background-tasks, pi-claude-bridge and pi-antigravity-bridge kit-rendered components reuse lines the same way, with native (kit-absent) fallbacks unchanged; existing tests stay green and new tests prove reuse and recomputation.
- AC-5: Each touched pi-package `typecheck` + tests (`test:unit` for pi-claude-bridge) and root `pnpm run typecheck` pass; root `pnpm run check:ci` and `pnpm test` introduce no new failures relative to the pre-existing baseline (user-authorized baseline exception: unchanged `pi-packages/pi-subagents/test/ui/panel.test.ts` formatting, inherited `CODEX_HOME`, missing sibling `thoth-plugins` checkout).
- AC-6: A user re-profile of a resumed long session while holding a key shows render time dominated neither by `kit.card` nor `renderBox` (target: `doRender` inclusive reduced by an order of magnitude from ~44 s) and the user reports smooth typing.

## Clarifications

- User selected "Planificar el arreglo (Recommended)": plan a cache-based fix across all affected packages after profiling evidence.
- User chose "Aceptar excepción de base (Recommended)" after final Oracle found AC-5 unmet only by pre-existing, diff-independent root check failures; AC-5 amended accordingly.
- User chose to verify first, then commit and merge to `0.5.0` (their Pi loads `C:\DEV\Proyectos\Webstorm\thoth-agents` on `0.5.0`) before re-profiling for AC-6.
- Plan review: first fresh Oracle returned REJECT (non-equivalent renderBox predicate; live widgets inside the delta); record repaired; second fresh Oracle returned OKAY with the note to keep expand-hint memoization per-instance or reload-invalidated.
- Implementation authorized by explicit user choice "Implement (Recommended)" after OKAY.
- No human-owned decision remains: expanded output stays complete (non-goal on budgets), caching is internal and output-preserving.

## Decisions

- Cache at the consumer component level, not inside `kit.card`: card options are rebuilt per call, so a content-keyed cache inside `card` would still pay hashing/build cost; per-instance caching matches Pi's component lifecycle.
- Cache key is (width, kit identity) and `getRenderKit()` is called on every render, including cache hits, so the spec rule "look up the kit at render time" holds: a withdrawn/replaced kit forces recomputation and the native shell path stays reachable.
- Scope of caching is input-stable transcript renderers only (tool call/result renderers and custom message renderers whose inputs are captured at component creation). Live widgets/overlays are excluded (Oracle plan review finding).
- Put the helper in `@thoth-agents/pi-core` (already a dependency of every consumer and owner of the render-kit contract) to avoid five copies; keep `ThothRenderKit.cachedComponent` unchanged.
- `renderBox` optimization is a narrow pure fast path: skip `truncateToWidth` only for escape-free printable-ASCII lines with `length <= limit`; all other lines, and the final bounding pass for them, keep current behavior. The broader `visibleWidth <= limit` predicate was rejected by Oracle plan review (escape-split grapheme counterexample).

## Durable deltas

- `ADDED pi-ecosystem` **Render kit output reuse** — First-party Pi transcript tool-call, tool-result and custom-message renderers whose inputs are fixed at component creation and that render through the Thoth render kit MUST reuse their rendered lines for repeated renders at the same width while the same kit remains registered, and MUST recompute after `invalidate()`, a width change, or a kit change, without altering rendered output; live above-editor widgets and overlays are excluded.
  - GIVEN a completed kit-rendered transcript tool or message card; WHEN the host renders it repeatedly at the same width with the same registered kit; THEN the card body is built once and identical lines are returned until invalidation, a width change, or a kit change .

## Plan

Units:

1. **pi-core render memo (AC-1)** — add `createKitRenderMemo` (name final at implementation) in `pi-packages/pi-core/src/render-kit.ts` (exported from the package entry): `render(width, build: (kit) => string[])` keyed by width + `getRenderKit()` identity, `invalidate()` clears. Tests in pi-core. Consumers depend on this output.
2. **renderBox fast path (AC-2)** — `pi-packages/pi-thoth-theme/src/tools/box.ts` only, plus tests in `src/tools/render.test.ts` / `frame-composition.test.ts`. Independent of unit 1.
3. **pi-subagents adoption (AC-3)** — `src/render/tools/components.ts`, `src/render/completion-message.ts`, `src/render/question-message.ts`, `src/render/tools/expansion-hint.ts` (memoize resolved key text, invalidated on theme/keybinding reload if such a hook exists, else per component instance). Depends on unit 1.
4. **Other consumers adoption (AC-4)** — `pi-packages/pi-to*/view/format.ts` (task-list package), `pi-background-tasks/src/render/{messages,tools}.ts`, `pi-claude-bridge/src/askclaude-render.ts`, `pi-antigravity-bridge/src/native-event-render.ts`. Depends on unit 1. Disjoint from unit 3.
5. **Repository verification (AC-5)** — root runs repo checks after units 2–4 are accepted.
6. **User re-profile (AC-6)** — user repeats the resumed-session profile; root compares with the same analysis.

Risks: stale card if a component reads mutable state without recreation (mitigated: inputs captured at creation; tests prove invalidate/width/kit recompute); memory per cached width is bounded by Pi component lifetime.
Verification seams: per-package vitest/node tests with a spy on `kit.card`/build counts; byte-identical `renderBox` comparisons.

## Tasks

- [x] AC-1: pi-core exports a (width, kit)-keyed render memo with invalidate
  - Outcome: tested helper exported from `@thoth-agents/pi-core`
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/render-kit.ts`, pi-core package entry; skills `tdd`, `simplify`
  - Inputs: Exploration and Decisions in this record
  - Dependencies: none
  - Output: helper + unit tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/**`, `pi-packages/pi-core/test/**` (or colocated tests)
  - Interface boundaries: existing `ThothRenderKit`, `getRenderKit`, `registerRenderKit` unchanged
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-core typecheck` and `test` pass with new tests
  - Return milestone: helper and tests green
  - Stop / reassessment: package entry/export constraints that prevent consumers importing it
- [x] AC-2: renderBox skips truncation for fitting plain-ASCII lines with byte-identical output
  - Outcome: faster `renderBox` with identical output
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/box.ts`, `src/tools/render.test.ts`, `src/tools/frame-composition.test.ts`; skills `tdd`, `simplify`
  - Inputs: Exploration profile evidence
  - Dependencies: none
  - Output: optimized `renderBox` + equivalence tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/tools/box.ts`, pi-thoth-theme test files
  - Interface boundaries: `renderBox` signature and output unchanged; `kit.card` unchanged
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-thoth-theme typecheck` and `test` pass incl. equivalence cases
  - Return milestone: tests green
  - Stop / reassessment: any case where output would differ
- [x] AC-3: pi-subagents cards and messages reuse rendered lines
  - Outcome: cached subagent tool/completion/question rendering and memoized expand-hint text
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/render/tools/components.ts`, `src/render/completion-message.ts`, `src/render/question-message.ts`, `src/render/tools/expansion-hint.ts`, tests under `pi-packages/pi-subagents/test/render/`; skills `tdd`, `simplify`
  - Inputs: accepted AC-1 helper
  - Dependencies: AC-1 unit accepted
  - Output: adopted caching + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/render/**`, `pi-packages/pi-subagents/test/render/**`
  - Interface boundaries: rendered output unchanged; native fallback unchanged
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-subagents typecheck` and `test` pass with reuse/recompute tests
  - Return milestone: tests green
  - Stop / reassessment: a renderer that reads live mutable state without recreation
- [x] AC-4: task-list package, pi-background-tasks and both bridges reuse rendered lines
  - Outcome: cached kit rendering in the remaining consumers
  - Known entrypoints and skill paths: `pi-packages/pi-to*/view/format.ts`, `pi-packages/pi-background-tasks/src/render/messages.ts`, `pi-packages/pi-background-tasks/src/render/tools.ts`, `pi-packages/pi-claude-bridge/src/askclaude-render.ts`, `pi-packages/pi-antigravity-bridge/src/native-event-render.ts` and their tests; skills `tdd`, `simplify`
  - Inputs: accepted AC-1 helper
  - Dependencies: AC-1 unit accepted
  - Output: adopted caching + tests
  - Owner: thoth-worker
  - Writes: those source files and their package test files only
  - Interface boundaries: rendered output unchanged; native fallbacks unchanged
  - Focused check and PASS evidence: each package `typecheck` and tests (`test:unit` for pi-claude-bridge) pass
  - Return milestone: tests green
  - Stop / reassessment: a renderer that reads live mutable state without recreation
- [x] AC-5: package checks pass and root checks show no new failures
  - Outcome: touched-package checks and root typecheck green; root check:ci/test failures limited to the user-authorized pre-existing baseline
  - Known entrypoints and skill paths: root `package.json` scripts
  - Inputs: accepted AC-1..AC-4 diffs
  - Dependencies: AC-1, AC-2, AC-3, AC-4 units accepted
  - Output: check results
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: each touched package `typecheck` + tests exit 0; root `pnpm run typecheck` exit 0; root `pnpm run check:ci` and `pnpm test` fail only on the baseline (unchanged `panel.test.ts` formatting; `src/cli` Codex tests via inherited `CODEX_HOME`; `src/harness/publish-marketplace.test.ts` missing sibling checkout), none under the diff
  - Return milestone: package checks green and root failures classified
  - Stop / reassessment: any root failure attributable to the diff
- [x] AC-6: user re-profile confirms smooth typing
  - Outcome: measured render-time reduction in a resumed long session
  - Known entrypoints and skill paths: user profiling procedure (NODE_OPTIONS `--cpu-prof`), analysis script outside the repo
  - Inputs: accepted AC-5
  - Dependencies: AC-5 accepted
  - Output: before/after comparison
  - Owner: root with user
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `doRender` inclusive far below ~44 s baseline and user confirms smooth typing
  - Return milestone: user provides new profile
  - Stop / reassessment: remaining hot path outside this scope

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 91922d47cebb14e3550c377de2978c0aa3a44098c60382cccbec91f8ddc57e41

- AC-1: PASS | pi-core typecheck + 156/156 tests; Oracle memo/export review | width/kit reuse, kit looked up every render, invalidation and kit registration transitions covered
- AC-2: PASS | pi-thoth-theme typecheck + 590/590 tests incl. box.test.ts; Oracle equivalence review | 4,608 byte-equivalence comparisons vs frozen original incl. escape-split ZWJ; only fitting printable ASCII bypasses truncation
- AC-3: PASS | pi-subagents typecheck + 1121 pass/1 skip; Oracle review + real-SDK ticker probe | tool, completion and question cards reuse/recompute; expansion hints resolve at construction
- AC-4: PASS | task-list 225/225, background-tasks 423+4 skip, antigravity 738+9 skip, claude-bridge test:unit 389/0; Oracle review | reuse, recomputation, native fallback equivalence; antigravity invalidate forwards to native Text
- AC-5: PASS | package typechecks/tests and root pnpm run typecheck exit 0; root check:ci/test classified | failures limited to user-authorized pre-existing baseline (panel.test.ts formatting, CODEX_HOME, missing thoth-plugins checkout), none under the diff
- AC-6: PASS | user CPU profiles before/after, same long session with /resume | doRender 44.424 s -> 2.722 s, kit.card 41.529 s -> 0.204 s, renderBox 35.828 s -> 0.161 s; user reports typing smooth like a fresh session
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:d9809a10645b2edc66d8b076e6c661d42ea139138193af1c509be3a170111d3e

## Closeout

**Archive**: READY
