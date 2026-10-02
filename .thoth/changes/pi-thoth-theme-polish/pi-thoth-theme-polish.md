# Change: pi-thoth-theme-polish

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

User testing of the merged `@thoth-agents/pi-thoth-theme` (archive
`2026-10-02-pi-thoth-theme`) in Pi fullscreen on Orca/Windows reported: input and
scroll lag (dropped backspaces), a status row unlike the omp `claude` reference,
`edit` and `bash` blocks split into two boxes, no images in fullscreen, glyphs that
look wrong, and `subagent_run` results too long. Evidence (installed SDK, prefix
`A` = `pi-coding-agent/dist`, `T` = `pi-tui/dist`):

- Rendering: every transcript component's `render(width)` runs each frame
  (`T/tui.js:129-136`, `T/tui-main-screen.js:229`); fullscreen deduplicates only
  within one frame (`T/layout.js:14-26,275-280`). Native `Text`/`Markdown` cache
  lines by text and width (`T/components/text.js:32-40`,
  `T/components/markdown.js:176-184`). Theme components cache nothing:
  `createComponent` in `src/tools/box.ts` recomputes parsing/diffs on every
  frame; the footer sums cost over all session entries in `render`
  (`src/status-line/index.ts:62-70`); the welcome re-renders fully.
- Tool composition: Pi adds call then result directly with no separator
  (`A/modes/interactive/components/tool-execution.js:228-277`); the default shell
  wraps them in a padded background `Box` (`:43-54`, `T/components/box.js:79-137`);
  `renderShell: "self"` uses a plain container without padding (`:43-54,184-211`),
  as pi-subagents already does (`pi-subagents/src/tools/subagent-run.ts:84`).
  Renderer context exposes `isPartial`, `expanded`, `isError`, `argsComplete`,
  `executionStarted`, shared `state` (`:71-88`); the result renderer gets
  `{expanded, isPartial}` (`:259-263`). A single framed block across call and
  result is therefore feasible with the public API.
- Fullscreen images: `T/tui-alt-screen.js:155-162` disables the `iterm2` protocol
  while fullscreen is active and supports Kitty (`:228-245,1457-1497`); the user's
  `terminal.images: "iterm2"` setting therefore yields no images in fullscreen;
  with it removed, the package's Orca Kitty fallback applies. Kitty converts
  non-PNG before display (`tool-execution.js:135-169,306-307`).
- Status row: model label from `ctx.model.id` (`src/status-line/index.ts:62-70`);
  context without data shows `?` (`layout.ts:109-119`); after compaction Pi reports
  `percent: null` (`A/core/agent-session.js:3359-3384`). Glyphs used are Nerd Font
  codepoints outside the removed v2 MDI range, yet the user sees wrong symbols.
- pi-subagents: completed `subagent_run` results print the whole response
  regardless of `expanded` (`pi-subagents/src/render/tools/subagent-run.ts:55-63,149-168`);
  the background completion renderer already collapses
  (`src/render/completion-message.ts:180-203`).
- References (MIT, already attributed): pi-omp-theme screenshots supplied by the
  user for status row, bash (`Output` divider, `Exit 1 · ~42 words` footer) and
  collapsed subagent block (title, metadata line, `ctrl+o to expand`).

## Intent

Make the theme fast and faithful to the agreed references: no perceptible input
or scroll lag, an omp-`claude`-style status row with cost and without path, each
tool call rendered as one framed block (bash with an `Output` divider), working
fullscreen images in Orca, and compact collapsed `subagent_run` results.

## Non-goals

- Sidebar; orchestrator language/notification rules (separate change).
- Patching Pi internals or prototypes; changing tool execution.
- Supporting iTerm2 images in fullscreen (Pi disables them by design).
- Publishing or version bumps.

## Acceptance

- AC-1: Every theme component (tool calls/results, footer, header) returns cached
  lines for an unchanged input and width; session cost is recomputed only on
  session events, not per frame; a render benchmark over a transcript of 500 tool
  results shows a repeat frame at least 10x cheaper than the first.
- AC-2: The status row renders `● <model name> · ◐ <effort> │ ⑂ <branch> │
  [bar] NN% used │ <used>/<window> │ $<cost>` using Unicode symbols, per-segment
  colors from the thoth palette (model lapis, branch turquoise, bar
  turquoise/ochre/carnelian by threshold, cost gold, separators bronze), the
  model display name with id fallback, `—` when usage is not reported, no path and no
  extension statuses; it degrades by width without overflow.
- AC-3: `read`, `bash`, `ls`, `grep`, `find`, `edit` and `write` render call and
  result as one continuous framed block via `renderShell: "self"`, with paths
  relative to `cwd` when inside it; `bash` shows the highlighted command, an
  `Output` divider, the output preview, and a footer with exit status and size;
  `edit`/`write` show the diff inside the same frame; previous fidelity rules
  (notices, raw grep fallback, control-character escapes, width safety) still hold.
- AC-4: In fullscreen on Orca with no explicit `terminal.images`, `read` of PNG
  and JPEG shows the image; the README documents that `terminal.images: "iterm2"`
  disables images in Pi fullscreen.
- AC-5: Completed `subagent_run` results render collapsed by default (title,
  one metadata line, `ctrl+o to expand`) and show the full response only when
  expanded.

## Clarifications

- RESOLVED: Status row, bash and subagent visuals follow the user-supplied omp
  reference screenshots, minus path, plus cost (user, this session).
- RESOLVED: Single framed block (option a) is feasible through `renderShell:
  "self"`; no user choice needed between frame and gutter styles.
- RESOLVED: Fullscreen iTerm2 images are a Pi design limit; the fix is the Kitty
  fallback plus documentation.

## Decisions

- Caching: a shared `cachedComponent(renderFn)` helper caches per component
  instance by width and clears on `invalidate()` (Pi creates a fresh result
  wrapper per renderer invocation; `content`/`details` are shared references, so
  never key on payload identity across components). Footer data contract,
  settled before parallel work: `StatusData { modelName?, modelId?,
  thinkingLevel?, gitBranch?, contextTokens: number|null, contextWindow?,
  contextPercent: number|null, cost }`; the footer caches on a digest of these
  scalars plus width and clears on theme invalidation. Cost is re-aggregated on
  session start, `turn_end`, `agent_end` and `session_compact` (after
  persistence), never per frame. The benchmark asserts deterministic cache hits
  (render function call counts) and a warmed, amortized timing ratio.
- Status row glyphs are Unicode, as in the reference, so they do not depend on
  Nerd Font versions; tool icons keep Nerd Font with ASCII fallback.
- Block layout: the call component draws the top border with icon, title and
  argument summary (and for bash the command and `Output` divider); the result
  component draws body rows with side borders and the bottom border with the
  footer; while running (`isPartial`) the result draws a running footer. Before
  any result exists Pi calls only the call renderer, so the call alone draws a
  closed running frame that the result replaces seamlessly; native images
  render after the textual frame.
- pi-subagents change is limited to `renderSubagentRunResult` honoring
  `expanded`, matching the completion-message renderer.

## Durable deltas

- None.

## Plan

Units: (1) caching across theme components and benchmark test; (2) status row
redesign; (3) unified framed tool blocks for the seven tools, built on (1)'s
helper; (4) pi-subagents collapsed `subagent_run` result; (5) fullscreen image
verification and README note. The task rows define the dependency graph: cache helper, status layout and
pi-subagents unit start in parallel; footer wiring waits for the helper and the
layout; tool blocks wait for the helper; the image unit waits for tool blocks. Verification: package typecheck/tests for pi-thoth-theme and
pi-subagents, root `check:ci`, manual fullscreen session in Orca.

## Tasks

- [x] AC-1: Render cache helper for tools and welcome, with benchmark
  - Outcome: tool and welcome components return cached lines between unchanged frames
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/box.ts`, `src/welcome/index.ts`; skills tdd, simplify
  - Inputs: Exploration and Decisions of this record
  - Dependencies: none
  - Output: `cachedComponent` helper, cached tool/header components, benchmark test
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/tools/box.ts`, `src/shared/cache.ts`, `src/welcome/index.ts`, `test/render-cache.test.ts`
  - Interface boundaries: Pi `Component.render/invalidate`; tool renderers keep their exported signatures
  - Focused check and PASS evidence: benchmark over 500 tool results asserts zero re-renders on repeat frames and a warmed amortized ratio of at least 10x; existing tests pass
  - Return milestone: cache helper published and tests green
  - Stop / reassessment: a component cannot detect input changes without Pi internals
- [x] AC-1: Cached footer wiring and event-driven cost
  - Outcome: footer renders from a cached digest; cost recomputed only on session events
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/status-line/{index.ts,cost.ts,status-line.test.ts}`
  - Inputs: AC-1 cache helper; AC-2 layout with the settled `StatusData` contract
  - Dependencies: AC-1 cache helper, AC-2
  - Output: updated footer wiring and integration tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/status-line/index.ts`, `src/status-line/cost.ts`, `src/status-line/status-line.test.ts`
  - Interface boundaries: `setFooter`; `StatusData` contract in Decisions; Pi events `turn_end`, `agent_end`, `session_compact`
  - Focused check and PASS evidence: integration tests assert new row format, model display name, cost refresh after events, and no session traversal on repeat frames
  - Return milestone: status-line tests green
  - Stop / reassessment: cost entries not persisted by the chosen events
- [x] AC-2: Status row in the reference style
  - Outcome: omp-claude-style row with cost, thoth colors, Unicode glyphs
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/status-line/layout.ts`, its tests; user reference screenshot described in Exploration
  - Inputs: AC-1 footer caching contract (render data digest)
  - Dependencies: none (layout is pure; AC-1 owns index.ts wiring)
  - Output: new layout with tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/status-line/layout.ts`, `src/status-line/layout.test.ts`
  - Interface boundaries: `renderStatusLine(data, options)` signature; `StatusData` may gain `modelName` and `contextTokens`
  - Focused check and PASS evidence: layout tests for segment order, colors, `—` for unreported usage, no path/extension statuses, width degradation
  - Return milestone: tests green
  - Stop / reassessment: model display name unavailable from `ctx.model`
- [ ] AC-3: Unified framed tool blocks
  - Outcome: each of seven tools renders one continuous framed block
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/*.ts`; `pi-subagents/src/tools/subagent-run.ts:84` for `renderShell: "self"` usage
  - Inputs: AC-1 cache helper
  - Dependencies: AC-1
  - Output: updated renderers and render tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-thoth-theme/src/tools/{bash,read,ls,grep,find,edit,write,index}.ts`, `src/tools/render.test.ts`, `src/tools/frame.ts`
  - Interface boundaries: `renderShell: "self"`, renderer context `isPartial`/`isError`/`expanded`; fidelity rules from the archived change
  - Focused check and PASS evidence: tests assert top/side/bottom borders join across call and result, bash `Output` divider and exit footer, relative paths, and all prior fidelity tests pass
  - Return milestone: tests green
  - Stop / reassessment: self shell drops image rendering or native expansion
- [ ] AC-4: Fullscreen images on Orca
  - Outcome: images visible in fullscreen without explicit iterm2
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/image-capability.ts`, `src/tools/read.ts`, `README.md`
  - Inputs: AC-3 read renderer under self shell
  - Dependencies: AC-3
  - Output: verified image path in self shell, README note
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/README.md`, `src/tools/image-capability.test.ts`
  - Interface boundaries: Pi `showImages` context, Kitty conversion path
  - Focused check and PASS evidence: test that a read result with image content under the self shell still yields image content; manual Orca check listed for the user
  - Return milestone: tests green, manual check handed to the user
  - Stop / reassessment: self shell suppresses Pi's native image pass
- [x] AC-5: Collapsed subagent_run results
  - Outcome: compact collapsed result, full response only when expanded
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/render/tools/subagent-run.ts`, `src/render/completion-message.ts:180-203` as the pattern
  - Inputs: Exploration evidence
  - Dependencies: none
  - Output: renderer honoring `expanded` with tests
  - Owner: thoth-designer
  - Writes: `pi-packages/pi-subagents/src/render/tools/subagent-run.ts` and its test file
  - Interface boundaries: `renderSubagentRunResult` signature; completion message unchanged
  - Focused check and PASS evidence: tests for collapsed (title, metadata, hint, no body) and expanded (full body); pi-subagents typecheck and tests pass
  - Return milestone: tests green
  - Stop / reassessment: expansion state not delivered to self-shell results

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

## Closeout

**Archive**: PENDING
