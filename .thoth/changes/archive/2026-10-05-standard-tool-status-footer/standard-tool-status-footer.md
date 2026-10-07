# Change: standard-tool-status-footer

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

Baseline is the current working tree, which already contains uncommitted changes: the status line (`◆` separator, cwd + branch), running `◇` static glyph, background launch cards rendered as `launched`, and running footers for bash/PowerShell/generic and render-kit cards using the animated pyramid plus elapsed time (`<△◭▲◮> · Ns`) via `pi-thoth-theme/src/render-kit/working.ts`.

- `pi-core/src/render-kit.ts:11-137` defines kit v1 (`card`, `indicator`), statuses, card `status`/`footer`, indicator `elapsedMs`/`frame`; registry at `:150-225`; no timing/default implementation. Producers build running footers by hand from `kit.indicator(...).text`.
- Theme kit (`pi-thoth-theme/src/render-kit/index.ts`) maps running→`◇`, completed→`✓`, failed→`✗`; suppresses the static glyph only when a running footer is supplied; `indicator()` owns the ticker (`tools/ticker.ts`) and pyramid footer.
- Theme built-ins bypass the kit: bash/PowerShell/generic have running footers and terminal footers without ✓/✗ (`Exit N · elapsed · lines · words`, `Done`/`Error · …`); read/edit/write/grep/find/ls have no running footer or ticker; edit/write terminal footers are `+N -N · 1 file` / `+N lines · 1 file`.
- Producers: task-list package (call/result footer from indicator), pi-subagents tool cards (indicator footer, status omitted while running), pi-background-tasks (call indicator in body, result footer), pi-claude-bridge AskClaude (labeled indicator footer; bare running card before output), pi-antigravity-bridge (initial call card has no status/footer; partial/terminal results use indicator footer), completion/notification messages (terminal status, no elapsed).
- SDK `ToolRenderContext` exposes `executionStarted`, `state`, `invalidate`, `isPartial`, `isError`; no elapsed field. Theme ticker derives elapsed from `executionStarted` and invalidates every 1s.
- Spec `pi-ecosystem` already governs the render kit, output reuse and result borders (running footer / exit footer wording).

## Intent

Every running in-repo tool card shows one standard footer `<animated pyramid> · <elapsed>`; every finished tool card shows `<✓|✗> · <elapsed>[ · <tool summary>]`. The footer is produced by a pi-core kit contract implemented once by the theme and used by both kit producers and the theme's built-in renderers, so producers only declare status and render context.

## Non-goals

- Third-party package renderers outside this repository.
- Status line, input-box pyramid animation frames/interval, completion/notification message cards (no tool execution; keep current terminal glyph footer), widgets.
- Live updating of background `subagent_run` launch cards (stay terminal `launched`).
- Changing border colors beyond keeping the existing result-border rules.
- Package version bumps.

## Acceptance

- AC-1: pi-core kit contract exposes a standard tool status footer: given status (running/in_progress/completed/failed/…) plus the SDK render context and optional summary/elapsed override, the kit returns the footer; a pi-core fallback produces plain text (`running · Ns` / `✓`/`✗ · Ns · summary` without animation) when no kit is registered.
- AC-2: The theme implements that contract once: running → `<△◭▲◮ frame> · <elapsed>` with 1s ticker invalidation; terminal → `<✓|✗> · <elapsed>[ · summary]` with frozen elapsed; a bare `status: 'running'` card no longer renders static `◇` (it uses the standard footer when context is available).
- AC-3: All theme built-ins (bash, PowerShell, generic, read, edit, write, grep, find, ls) render the standard running footer while running and the standard terminal footer when finished, keeping their summaries (e.g. `✓ · 5s · Exit 0 · 1 line · ~1 words`, `✓ · 0s · +3 -1 · 1 file`, `✓ · 0s` for read).
- AC-4: In-repo kit producers (pi-subagents tool cards, task-list package, pi-background-tasks, pi-claude-bridge AskClaude, pi-antigravity-bridge) use the contract instead of composing running footers by hand; their running and terminal tool cards follow the standard; background `launched` cards show the terminal standard footer.
- AC-5: Existing result-border rules hold (accent while running, success/error on finish) and render-output reuse still recomputes on invalidate; all eight Windows-CI pi packages pass typecheck and tests; root `check:ci`/`typecheck`/`test` show no new failures.

## Clarifications

- Terminal footer format: `✓/✗ · elapsed · summary` (user choice, 2026-10-05).
- Ownership: contract in pi-core, implementation in the theme, plain fallback in pi-core (user choice, 2026-10-05).
- Scope: all running tools must have the footer, including read/edit/write/grep/find/ls (user, 2026-10-05).

## Decisions

- Kit stays `version: 1` with additive members; backward compatibility is not required by project policy, but keep the existing registry validation working for current kits.
- Elapsed derivation stays based on `executionStarted` + shared context `state` (as the theme ticker does today); producers with an authoritative duration (e.g. AskClaude `executionTime`) may pass an elapsed override.
- Completion/notification message cards keep their current terminal glyph footer (no execution timing).

## Durable deltas

- `ADDED pi-ecosystem` **Standard tool status footer** — `@thoth-agents/pi-core` MUST define a render-kit contract that produces the tool card status footer from a status and the tool render context, with a plain-text fallback when no kit is registered; `@thoth-agents/pi-thoth-theme` MUST implement it so that every running first-party tool card (theme built-ins and kit producers) shows the animated pyramid frame and elapsed time, and every finished tool card shows `✓` or `✗`, the elapsed time and the tool's optional summary.
  - GIVEN a themed read, bash or subagent tool card; WHEN it is running and then finishes; THEN its footer shows `<pyramid frame> · <elapsed>` while running and `✓ · <elapsed>[ · summary]` or `✗ · <elapsed>[ · summary]` after finishing.
- `MODIFIED pi-ecosystem` **Render kit result borders** — Themed tool and notification cards that render through the Thoth render kit or the theme's tool renderers and draw an error-colored border for failed results MUST draw the theme `success` color for affirmative terminal success, the theme `error` color wherever an error border is drawn today (including cancellation where it is red), except that the still-running shell/generic rule in the next sentence takes precedence over this error-color rule, and the theme `accent` color for every other non-error state, consistently across every part of the same card. A shell or generic tool card (bash, PowerShell, generic renderer) that is still running, even with partial output or a partial error flag, MUST show the running form of the standard tool status footer and the `accent` border until it finishes, and only completion changes its footer (to the terminal form of the standard tool status footer, whose summary carries the exit code for shells) and border; in the subagents thread viewer, tool items that are still running MUST be rendered as running, with or without a kit. Cards without a result-driven error border are unchanged.
  - GIVEN a themed bash card that has already produced output; WHEN it is still running and then completes; THEN it shows the standard running footer and the accent border while running, and after completion the standard terminal footer with `✓` and the success border for exit code 0 or `✗` and the error border for a failure.

## Plan

1. **pi-core contract (U1)** — in `pi-core/src/render-kit.ts` add a `toolFooter(options)` (name final at implementation) kit member: inputs `status`, optional `context` (SDK `ToolRenderContext`-compatible structural type), optional `elapsedMs` override, optional `summary` string parts; output footer text. Add exported helper `renderToolFooter(kit | undefined, options)` that delegates to the kit or returns the plain fallback. Update `pi-core/src/testing.ts` test kit and tests (`test/render-kit.test.ts`, `test/testing.test.ts`). Card option `status: 'running'` without footer: kit may compute the standard footer when `context` is passed in card options (additive `context` field).
2. **Theme implementation (U2, depends U1)** — `pi-thoth-theme/src/render-kit/{index,working}.ts` + `tools/ticker.ts`: implement `toolFooter` reusing the existing ticker/frame helper; terminal form freezes elapsed; remove the bare-running `◇` footer path. Tests: `test/render-kit*.test.ts`, `src/tools/ticker.test.ts`.
3. **Theme built-ins (U3, depends U2)** — `pi-thoth-theme/src/tools/{bash,generic,read,edit,write,grep,find,ls}.ts` (PowerShell re-exports bash): route running and terminal footers through the theme implementation, adding ticker + footers where missing; preserve summaries. Tests: `src/tools/render.test.ts`, `success-borders.test.ts`, `lifecycle-real-sdk.test.ts`, `test/tool-renderer-parity.test.ts`.
4. **Producers (U4a–U4e, depend U1; visual checks against U2)** — separate writers per package: pi-subagents (`src/render/tools/components.ts`, `subagent-run.ts`), task-list package (`view/format.ts`), pi-background-tasks (`src/render/tools.ts`), pi-claude-bridge (`src/askclaude-render.ts`), pi-antigravity-bridge (the antigravity tool card source under `src/`, `render-tool-card.ts`). Replace hand-built running footers with the contract; pass terminal summaries.
5. **Spec + docs (root)** — apply durable deltas at archive; update routed docs only if they describe footers.

Verification seams: each package's `typecheck` + `test` (claude bridge `test:unit`); root `pnpm run check:ci`, `pnpm run typecheck`, `pnpm test` (pre-existing `pi-subagents/test/ui/panel.test.ts` format error noted). Risks (plan review notes): the existing ticker freezes on partial errors — shells must stay running per border rules; a terminal `status` plus a self-contained footer must not duplicate glyphs; tests must cover terminal timer cleanup, same-width invalidation recompute and no-kit native-shell parity. Other risks: SDK render context shape drift (structural typing only), ticker invalidation for previously ticker-less tools (read/grep in large transcripts — terminal state must stop timers), render-output reuse cache keyed without elapsed (must recompute on invalidate), theme render-cache benchmark flakiness under concurrency.

## Tasks

- [x] AC-1: pi-core standard tool footer contract, fallback and test kit
  - Outcome: kit v1 exposes the footer member and `renderToolFooter` helper with plain fallback
  - Known entrypoints and skill paths: pi-packages/pi-core/src/render-kit.ts, src/testing.ts, test/render-kit.test.ts, test/testing.test.ts; skills tdd, simplify
  - Inputs: this record's Exploration and Decisions
  - Dependencies: none
  - Output: contract types, helper, fallback, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/
  - Interface boundaries: ThothRenderKit v1 registry validation; existing card/indicator unchanged
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-core run typecheck` and `run test` pass
  - Return milestone: contract merged in working tree with green pi-core checks
  - Stop / reassessment: need for a kit version bump or SDK type import
- [x] AC-2: theme implements standard footer and drops bare running ◇
  - Outcome: theme kit produces running/terminal standard footers with ticker
  - Known entrypoints and skill paths: pi-packages/pi-thoth-theme/src/render-kit/index.ts, working.ts, src/tools/ticker.ts, test/render-kit*.test.ts; skills tdd, simplify
  - Inputs: accepted U1 contract
  - Dependencies: AC-1 pi-core contract
  - Output: theme kit implementation and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-thoth-theme/src/render-kit/, src/tools/ticker.ts, pi-packages/pi-thoth-theme/test/
  - Interface boundaries: kit v1 contract; status-line untouched
  - Focused check and PASS evidence: theme typecheck + focused render-kit/ticker tests pass
  - Return milestone: theme kit footer green
  - Stop / reassessment: ticker lifecycle conflicts with render-output reuse
- [x] AC-3: theme built-ins use the standard footer
  - Outcome: bash/PowerShell/generic/read/edit/write/grep/find/ls show standard running and terminal footers with summaries
  - Known entrypoints and skill paths: pi-packages/pi-thoth-theme/src/tools/{bash,generic,read,edit,write,grep,find,ls,frame}.ts and tests; skills tdd, simplify
  - Inputs: accepted AC-2 implementation
  - Dependencies: AC-2 theme implementation
  - Output: updated renderers and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-thoth-theme/src/tools/
  - Interface boundaries: result-border rules; SDK tool render context
  - Focused check and PASS evidence: full theme `test` + `typecheck` pass
  - Return milestone: all theme tests green
  - Stop / reassessment: a built-in lacks executionStarted/context for timing
- [x] AC-4: pi-subagents tool cards use the contract
  - Outcome: running/terminal/launched subagent tool cards use standard footer
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/render/tools/components.ts, subagent-run.ts, test/render/, test/tools/subagent-run.test.ts, test/thread-view-real-sdk.test.ts; skills tdd, simplify
  - Inputs: accepted AC-1 contract (AC-2 for themed expectations)
  - Dependencies: AC-1, AC-2
  - Output: updated renderers/tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/render/, pi-packages/pi-subagents/test/
  - Interface boundaries: completion-message cards unchanged
  - Focused check and PASS evidence: pi-subagents typecheck + test pass
  - Return milestone: package green
  - Stop / reassessment: thread-viewer native fallback conflicts
- [x] AC-4: task-list package, pi-background-tasks, pi-claude-bridge and pi-antigravity-bridge use the contract
  - Outcome: their running and terminal tool cards use standard footer; antigravity initial call and AskClaude bare call no longer static
  - Known entrypoints and skill paths: task-list package (rpiv fork) view/format.ts; pi-packages/pi-background-tasks/src/render/tools.ts; pi-packages/pi-claude-bridge/src/askclaude-render.ts; pi-packages/pi-antigravity-bridge/src/ (antigravity tool card source and render-tool-card.ts) and their tests; skills tdd, simplify
  - Inputs: accepted AC-1 contract (AC-2 for themed expectations)
  - Dependencies: AC-1, AC-2
  - Output: updated producers/tests
  - Owner: thoth-worker
  - Writes: those four packages' render sources and tests
  - Interface boundaries: message/notification cards unchanged
  - Focused check and PASS evidence: each package typecheck + test (claude `test:unit`) pass
  - Return milestone: four packages green
  - Stop / reassessment: producer needs data not in render context
- [x] AC-5: integrated verification
  - Outcome: border rules and reuse hold; all CI checks pass
  - Known entrypoints and skill paths: root scripts; .github/workflows/ci.yml
  - Inputs: accepted AC-1..AC-4 outputs
  - Dependencies: all above
  - Output: check results and fresh Oracle verdict
  - Owner: root + thoth-oracle
  - Writes: this record only
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm run check:ci` (only pre-existing panel.test.ts issue), `pnpm run typecheck`, `pnpm test`, eight pi-package checks pass; Oracle PASS
  - Return milestone: Oracle verdict
  - Stop / reassessment: new failures

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: d2d32b7e95a870852f80e5b77b164bd7843aeba19a5a4afbda87511ea9419471

- AC-1: PASS | pi-core typecheck + 216 tests; Oracle focused API/fallback tests | status mapping, elapsed freezing, overrides, plain fallback verified
- AC-2: PASS | pi-thoth-theme typecheck + 931 tests; Oracle lifecycle/card tests | animated running footer, terminal timer cleanup, glyph de-dup, context-free ◇
- AC-3: PASS | real-SDK theme tests across nine built-ins | running/terminal footers with retained summaries
- AC-4: PASS | pi-subagents 1261 pass/1 skip, todo 237, background-tasks 457+4 skip, claude-bridge 424, antigravity 775 (+1 flaky sessions test passing alone) | footer follows tool execution lifecycle; native no-kit shells unchanged
- AC-5: PASS | check:ci (only pre-existing panel.test.ts format error), typecheck, build, root test (only 4 env failures publish-marketplace missing ..\thoth-plugins), openai-fast 49; Oracle border/reuse tests | accent while running, recompute on invalidate
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:ea2ad9ed704c82f07c98ba548655828d7d70574c1eb48031f2f05419820d25df

## Closeout

**Archive**: READY

Provenance: plan review round 1 REJECT (shorthand MODIFIED border delta), fixed, round 2 fresh Oracle OKAY; implementation authorized by explicit user choice "Implement" (2026-10-05); final verification round 1 FAIL (AC-4 pi-subagents footer status from task snapshot + native footer row), fixed, round 2 fresh Oracle PASS on record prefix d0c0941b…; prefix then changed only by status-field normalization (Plan review/Implementation values, AC-5 checkbox), re-confirmed by a fresh Oracle.
