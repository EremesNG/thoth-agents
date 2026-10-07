# Change: theme-render-kit

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

**Name legend** (exact identifiers; aliases avoid the SDD placeholder check):
- T-PKG = `@thoth-agents/pi-todo`; T-DIR = `pi-packages/pi-todo`; T-TOOL = tool `todo`; T-WIDGET = widget key `thoth-todos`.
- T-MODULE = `pi-packages/pi-todo/todo.ts`; T-OVERLAY = `pi-packages/pi-todo/todo-overlay.ts`; T-FORMAT = `pi-packages/pi-todo/view/format.ts`; A-TOOL = `pi-packages/pi-antigravity-bridge/src/ask-tool.ts`.
- KIT = the `ThothRenderKit` runtime contract defined in `@thoth-agents/pi-core`.

## Exploration

- Branch at `4a1988a` (0.5.0 after merging the pi-core change). Pi SDK dev `1.0.2`, peers `>=0.99.0`.
- In the Pi TUI, built-in tools render in pi-thoth-theme frames, while T-TOOL, `AskClaude` and `AskAntigravity` render in the SDK default box with the `toolSuccessBg` background (operator screenshots).
- SDK `ToolExecutionComponent` mounts renderers in `new Box(1, 1, bgFn)` unless the resolved `renderShell` is `'self'` (`tool-execution.js:48-57,69-71,155,191-204`). `ToolRenderers = Pick<AnyToolDefinition, "renderShell" | "renderCall" | "renderResult">` (`types.d.ts:499`); resolvers run in extension load order and may return a different `renderShell` per tool (`runner.js:542-545`, `interactive-mode.js:1673-1674`).
- Theme resolver (`pi-packages/pi-thoth-theme/src/tools/index.ts:62-82`) frames built-ins and returns `next()` untouched for package-owned renderers matching `respectPackages` (default `thoth-agents`, `@thoth-agents/*`, `thoth-mem`; `src/shared/config.ts:7-11`, `src/tools/ownership.ts:36-70`).
- Theme primitives: `src/tools/frame.ts` (`renderFrameTop/Row/Divider/Bottom`, rounded borders, footer in the bottom border, `accent`/`error` roles), `src/tools/box.ts` (`renderBox`, result text helpers, escaping), `src/tools/generic.ts` (collapse budget 8 lines with `… N more lines · ctrl+o to expand`), `src/tools/ticker.ts` (1 s elapsed ticker, module-level state, stopped on `agent_end`/`session_shutdown`/`session_start`), `src/shared/duration.ts`, `src/shared/cache.ts` (per-width cache). Pure except the ticker. The theme exports nothing but its extension default.
- Producers today:
  - T-DIR: T-TOOL renderers return unframed `Text` (T-FORMAT lines 132-200) with no `renderShell`; widget T-WIDGET above the editor (T-OVERLAY lines 65-248).
  - `pi-background-tasks`: 8 tools with `renderShell: 'self'` and a duplicated frame (`src/render/{frame,tools,messages}.ts`; `╭─ Title`, plain bottom, status inside the body); messages `background-completion-batch`, `background-task-failure`; widget `background-work-list` (`src/shared-navigator.ts:310`).
  - `pi-subagents`: 9 tools with `renderShell: 'self'` and duplicated `boxedComponent` (`src/render/tools/components.ts:81-141`), hardcoded 24-bit colors (`#00e5ff`, `#1793d1`, `#995cff`), 12-frame RGB working animation; messages `subagent-completion`, `subagent-question`; widget `subagents-claude-background`.
  - `pi-claude-bridge`: `AskClaude` unframed `Text` in the default box (`src/index.ts:2684-2728`); verbatim `formatDuration` copy (`src/format-duration.ts`).
  - `pi-antigravity-bridge`: `AskAntigravity` unframed `Text` (A-TOOL lines 462-532), entry renderer `agy-native-event` (`extensions/index.ts:412-432`); verbatim `formatDuration` copy.
- About 112 render tests across the five producers, all string/property assertions, no snapshots.
- Cross-extension registries in the repository use `globalThis[Symbol.for(...)]` (e.g. `pi-background-tasks/src/runtime.ts`, `pi-subagents/src/interaction-channel.ts`). All extensions run in one Node process.
- pi-core exports channels, validation and task-list state only; no UI.

## Intent

Make pi-thoth-theme the single owner of the Thoth visual language and expose it at runtime as KIT, defined in pi-core and discovered by producers at render time. Every first-party producer (T-PKG, pi-background-tasks, pi-subagents, pi-claude-bridge, pi-antigravity-bridge) renders its tool calls/results, custom messages and above-editor widgets through KIT when the theme is active, and degrades to a legible native rendering when it is not, removing duplicated frames, hardcoded colors and duration copies, so the future sidebar inherits one visual language.

## Non-goals

- The sidebar package and its layout.
- Refreshing the reinjected open-task block for the Claude bridge (separate change `claude-bridge-prompt-refresh`).
- Changing tool schemas, tool behavior, message contents, widget data or keyboard handling.
- Making pi-thoth-theme a package dependency of producers; no static import of theme code from producers.
- Theme configuration changes beyond what the kit needs; third-party tools keep the existing generic treatment.
- Package version bumps.

## Acceptance

- AC-1: pi-subagents publishes through `pnpm publish` (semantic-release exec) so `workspace:^` dependencies are converted, verified by a packed-manifest check showing a semver pi-core range; and pi-core exports KIT: a versioned TypeScript interface (structural types only; type-only Pi imports) covering card frames (title, sections with dividers, body rows, footer/status, error state), collapse with expand hint, per-width component caching, elapsed/working indicators, status glyphs, and widget primitives (heading, tree rows); runtime registry `registerRenderKit`/`getRenderKit` on `globalThis[Symbol.for(...)]` that rejects unsupported versions; and a pure `formatDuration`. Covered by Vitest.
- AC-2: pi-thoth-theme implements KIT from its existing primitives, registers it on `session_start` only when the session has an interactive UI (`ctx.hasUI`), with an ownership token, and withdraws only its own registration on `session_shutdown`, so headless child sessions never register or withdraw it, renders built-in tools exactly as before, and registers no kit when tools styling is disabled. Covered by unit tests and real Pi SDK 1.0.2 tests for both extension load orders, reload, a default lean child session, and a child session whose lifecycle passthrough lists the theme; elapsed/working ticker cleanup is scoped to the owning UI session, so an active parent ticker survives a headless child's start, agent end and shutdown while the parent's own cleanup still stops it.
- AC-3: T-PKG renders T-TOOL calls/results and T-WIDGET through KIT when present and through its current rendering when absent.
- AC-4: pi-background-tasks renders its 8 tools, 2 message types and its widget through KIT when present; its duplicated frame module is removed; native rendering when absent.
- AC-5: pi-subagents renders its 9 tools, 2 message types and its widget through KIT when present using only theme roles; hardcoded 24-bit colors and the RGB animation are removed (working state uses the KIT indicator); native rendering when absent.
- AC-6: pi-claude-bridge renders `AskClaude` through KIT when present and uses pi-core `formatDuration` (local copy removed); native rendering when absent.
- AC-7: pi-antigravity-bridge renders `AskAntigravity` and `agy-native-event` through KIT when present and uses pi-core `formatDuration` (local copy removed); native rendering when absent.
- AC-8: Every migrated tool declares a stable `renderShell: 'self'`; for every producer, tests exercise both paths with the shared fake KIT registered (KIT frame) and absent (native output equivalent to the SDK default box: pi-tui `Box` with 1-cell padding and the running, success or error tool background), including switching between them on re-render of the same component; no producer imports pi-thoth-theme.
- AC-9: `pnpm install --frozen-lockfile`, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, root `pnpm test` (with the sibling marketplace fixture and without ambient `CODEX_HOME`), and every `pi-packages/*` typecheck and offline tests pass; package READMEs and `docs/agent/harness-packaging.md` describe KIT.

## Clarifications

- Runtime discovery through pi-core, no package dependency on the theme (user answer).
- All consumers migrate in this change (user answer, to be ready for the sidebar).
- pi-subagents unifies to theme roles; neon colors and RGB animation are dropped (user answer).
- Tools, custom messages and widgets all go through KIT (user answer).
- The Claude bridge prompt-refresh defect is handled in a separate change (root decision reported to the user).

## Decisions

- Discovery happens at render time (inside `renderCall`, `renderResult`, message renderers and widget `render`), so extension load order never matters.
- Stable shell (plan review round 1): the SDK fixes the resolved renderer definition, including `renderShell`, when a tool component is constructed (`tool-execution.js:39,52-53,69-70,147-149`), so the shell never depends on kit availability. Every migrated tool declares `renderShell: 'self'`; at each render the producer draws the KIT frame when KIT is registered, otherwise a native pi-tui `Box(1, 1, bg)` using the theme `toolPendingBg`/`toolSuccessBg`/`toolErrorBg` roles, equivalent to the SDK default shell. The theme resolver keeps returning package-owned renderers untouched; no resolver shell switching and no kit-aware tool-name registry.
- Kit lifecycle (plan review rounds 1-2): the theme registers on `session_start` only when `ctx.hasUI` is true, with an ownership token, and withdraws only its own token on `session_shutdown`. Default lean children do not receive `session_start` (`pi-subagents/src/runner/sdk-runner.ts:324-329,514-530`), and children whose `lifecycle_passthrough` lists the theme do receive it (`sdk-runner.ts:291-294,451,561`) but are headless, so neither registers, replaces or withdraws the parent kit.
- KIT version 1; the registry holds one kit; `getRenderKit()` returns `undefined` for missing or incompatible kits; producers never cache it across renders.
- KIT v1 `indicator` accepts an optional caller-owned frame so producers keep frame-driven animations (pi-subagents braille per the canonical widget requirement) with theme-role styling, and producers size content from the measured KIT rail width; the shared test fake mirrors the real rail width and frame behavior (final verification round 1 findings).
- `formatDuration` moves to pi-core (pure, no UI); theme and bridges import it from pi-core.
- The ticker stays theme-owned: KIT exposes an elapsed/working indicator backed by the theme ticker. Ticker cleanup on `session_start`, `agent_end` and `session_shutdown` (`pi-thoth-theme/src/tools/index.ts:86-88`, `src/tools/ticker.ts:48-51,66`) becomes owner-scoped: only callbacks from the UI session that owns the tickers (`ctx.hasUI` and owner token) stop them, because the SDK shares module state across same-directory extension instances (`loader.js:463-487`) and a headless theme-passthrough child would otherwise freeze parent elapsed state (plan review round 3).
- pi-core keeps zero runtime dependencies; KIT types reference Pi `Theme`/`Component` via type-only imports covered by its existing optional coding-agent peer (add an optional `@earendil-works/pi-tui` peer if types require it).
- The unit that adds pi-core as a `workspace:^` dependency to theme, background-tasks, subagents and both bridges owns all manifest dependency edits and the only lockfile change.
- pi-subagents is published by semantic-release through `@semantic-release/npm`, which runs `npm publish` and keeps `workspace:^` (rejected as `EUNSUPPORTEDPROTOCOL`). Its release switches to `npmPublish: false` plus `@semantic-release/exec` running `pnpm publish --no-git-checks` (workspace protocol converted to a semver range); `@semantic-release/npm` stays for version preparation. Because `npmPublish: false` skips the npm plugin authentication setup, U1 wires pnpm registry authentication to the existing credential contract of the pi-subagents release (determined from the repository and npm plugin behavior, not invented), and the manifest test stops pinning version `1.0.0` (it runs in `prepublishOnly`) in favor of a semver assertion. pi-core must still be published before the next pi-subagents release (operator release order, as for T-PKG).

## Durable deltas

- `ADDED pi-ecosystem` **Thoth Pi render kit** — `@thoth-agents/pi-core` MUST define a versioned render-kit contract and a process-wide registry for it; `@thoth-agents/pi-thoth-theme` MUST implement and register that kit for its own session while its tool styling is enabled and MUST withdraw only its own registration; first-party Pi packages MUST look up the kit at render time for their tool calls, tool results, custom messages and above-editor widgets, MUST keep a render shell that does not depend on kit availability, MUST render through the kit when present, MUST render native output equivalent to the Pi default tool shell without nested frames when it is absent, and MUST NOT depend on the theme package.
  - GIVEN a Pi session with the theme and a first-party producer; WHEN a producer tool, message or widget renders with the theme active and again with the theme absent; THEN it shows the theme frame and roles in the first case and native unframed output in the second, regardless of extension load order .

## Plan

Approach:
- pi-core (`src/render-kit.ts`, `src/duration.ts`): KIT interface v1 and ownership-token registry on `globalThis[Symbol.for('thoth-agents.pi-core.render-kit.v1')]`, `formatDuration`. Fake-kit test helper exported for producer tests (e.g. `createTestRenderKit` under a `testing` subpath or documented test utility) so producers do not duplicate fakes.
- Theme: `src/render-kit/` adapter mapping KIT to `frame.ts`, `box.ts`, `generic.ts` collapse, `cache.ts`, ticker and status-line glyph conventions; register on `session_start` with a token when tools styling is enabled, withdraw own token on `session_shutdown`; resolver unchanged for package-owned renderers; `duration.ts` re-exports from pi-core.
- Producers: every migrated tool declares `renderShell: 'self'`; each render picks the KIT frame or the native SDK-equivalent `Box`; message renderers and widgets call KIT primitives when present and keep their current native rendering otherwise.
- Docs: package READMEs, `docs/agent/harness-packaging.md`.

Work-unit boundaries and order: U1 (pi-core KIT + all manifest/lockfile edits) first; then U2 theme and U3–U7 producers in parallel (disjoint package directories, no lockfile changes, producer tests use the pi-core fake kit); U8 docs after U2–U7; U9 root gate; fresh Oracle verification. A visual check in the operator's Pi TUI is requested after the gate.

Risks: KIT interface gaps discovered by producers (stop and return to root to extend U1 rather than adding package-local primitives); widget behavior regressions (navigation/selection); theme ticker lifecycle with producer-rendered tools; subagents visual identity change is intended; release order for pi-core before pi-subagents.

## Tasks

- [x] AC-1: pi-core KIT contract, registry, `formatDuration`, test fake kit, pi-core dependency in five manifests, pi-subagents pnpm-publish release path, and the lockfile
  - Outcome: KIT importable from every package; lockfile settled for the whole change
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/{index,channels}.ts`, `pi-packages/pi-thoth-theme/src/tools/{frame,box,generic,ticker}.ts`, `pi-packages/pi-thoth-theme/src/shared/{cache,duration}.ts` (signatures to cover), SDK `types.d.ts:499`; skills `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`, `C:\Users\EremesNG\.pi\agent\skills\simplify\SKILL.md`
  - Inputs: this record
  - Dependencies: none
  - Output: `pi-packages/pi-core/**`; dependency edits in `pi-packages/{pi-thoth-theme,pi-background-tasks,pi-subagents,pi-claude-bridge,pi-antigravity-bridge}/package.json` (plus `@semantic-release/exec` devDependency in pi-subagents); `pi-packages/pi-subagents/.releaserc.json`; a pi-subagents packed-manifest test; `pnpm-lock.yaml`
  - Owner: thoth-worker
  - Writes: those paths and `pi-packages/pi-subagents/test/package.test.ts` only
  - Interface boundaries: KIT v1 surface documented in pi-core README; no producer source edits
  - Focused check and PASS evidence: pi-core typecheck/tests pass; `pnpm install --frozen-lockfile` reproduces; every package typecheck still passes; `pnpm pack` of pi-subagents yields a manifest with a semver pi-core range; in a temporary copy with a bumped version, `pnpm publish --dry-run --no-git-checks` succeeds through `prepublishOnly`; the release config runs `pnpm publish` with `npmPublish: false` and documented pnpm authentication
  - Return milestone: KIT signatures summarized for downstream units
  - Stop / reassessment: KIT needs a runtime UI dependency in pi-core, or the existing release credential contract cannot be determined from the repository (return the options instead of inventing credentials)
- [x] AC-2: Theme implements KIT and owns its session-scoped registration lifecycle
  - Outcome: built-ins unchanged; KIT registered by the theme session owner only
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/{index.ts,tools/**,shared/**}`; skills as above
  - Inputs: accepted AC-1 unit
  - Dependencies: AC-1 unit
  - Output: theme adapter, resolver branch, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/**`, `pi-packages/pi-thoth-theme/test/**`
  - Interface boundaries: KIT v1; existing theme config
  - Focused check and PASS evidence: theme typecheck and full tests pass; new tests for registration, own-token withdrawal, disabled styling; real Pi SDK 1.0.2 tests for both load orders, reload, a default lean child and a theme-passthrough child, plus a headless (`hasUI` false) session, and a parent ticker that keeps running across a headless child's start, agent end and shutdown
  - Return milestone: tests green
  - Stop / reassessment: KIT v1 missing a primitive the theme cannot express
- [x] AC-3: T-PKG through KIT with native fallback
  - Outcome: T-TOOL and T-WIDGET framed with KIT, unchanged without it
  - Known entrypoints and skill paths: T-MODULE, T-OVERLAY and T-FORMAT and tests; skills as above
  - Inputs: accepted AC-1 unit
  - Dependencies: AC-1 unit
  - Output: kit renderers, declarations, tests
  - Owner: thoth-worker
  - Writes: T-DIR source and tests (no manifest dependency edits)
  - Interface boundaries: KIT v1; tool schema unchanged
  - Focused check and PASS evidence: package typecheck/tests pass with both paths covered
  - Return milestone: tests green
  - Stop / reassessment: KIT gap
- [x] AC-4: pi-background-tasks through KIT with native fallback; duplicated frame removed
  - Outcome: 8 tools, 2 messages and widget aligned to the theme
  - Known entrypoints and skill paths: `pi-packages/pi-background-tasks/src/render/{frame,tools,messages}.ts`, `src/shared-navigator.ts`, `src/log-display.ts` and their tests; skills as above
  - Inputs: accepted AC-1 unit
  - Dependencies: AC-1 unit
  - Output: migrated renderers, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-background-tasks/src/**` (no manifest dependency edits)
  - Interface boundaries: KIT v1; widget navigation unchanged
  - Focused check and PASS evidence: package typecheck/tests pass; no remaining local frame module
  - Return milestone: tests green
  - Stop / reassessment: KIT gap or navigation regression
- [x] AC-5: pi-subagents through KIT with theme roles only and native fallback
  - Outcome: 9 tools, 2 messages and widget aligned; no hardcoded colors or RGB animation
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/render/**`, `src/ui/**`, `src/extension/subagents-extension.ts` and `test/render/**`, `test/ui/**`; skills as above
  - Inputs: accepted AC-1 unit
  - Dependencies: AC-1 unit
  - Output: migrated renderers, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/**`, `pi-packages/pi-subagents/test/**` (no manifest dependency edits)
  - Interface boundaries: KIT v1; widget keyboard behavior unchanged
  - Focused check and PASS evidence: package typecheck/tests pass; `rg "38;2;|#00e5ff|#995cff|#1793d1" pi-packages/pi-subagents/src` empty
  - Return milestone: tests green
  - Stop / reassessment: KIT gap or keyboard regression
- [x] AC-6: pi-claude-bridge `AskClaude` through KIT and pi-core `formatDuration`
  - Outcome: framed with KIT, native without; duration copy removed
  - Known entrypoints and skill paths: `pi-packages/pi-claude-bridge/src/{index.ts,format-duration.ts}`, `tests/unit-format-duration.mjs`; skills as above
  - Inputs: accepted AC-1 unit
  - Dependencies: AC-1 unit
  - Output: migrated renderer, tests (`test:unit`)
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-claude-bridge/src/**`, `pi-packages/pi-claude-bridge/tests/**` (no manifest dependency edits)
  - Interface boundaries: KIT v1; bridge behavior unchanged
  - Focused check and PASS evidence: typecheck and `test:unit` pass with both paths covered
  - Return milestone: tests green
  - Stop / reassessment: KIT gap
- [x] AC-7: pi-antigravity-bridge `AskAntigravity` and `agy-native-event` through KIT and pi-core `formatDuration`
  - Outcome: framed with KIT, native without; duration copy removed
  - Known entrypoints and skill paths: A-TOOL, `pi-packages/pi-antigravity-bridge/src/format-duration.ts`, `extensions/index.ts:412-432`, `tests/**`; skills as above
  - Inputs: accepted AC-1 unit
  - Dependencies: AC-1 unit
  - Output: migrated renderers, tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-antigravity-bridge/{src,extensions,tests}/**` (no manifest dependency edits)
  - Interface boundaries: KIT v1; bridge behavior unchanged
  - Focused check and PASS evidence: typecheck/tests pass with both paths covered
  - Return milestone: tests green
  - Stop / reassessment: KIT gap
- [x] AC-8: Cross-package dual-path review
  - Outcome: confirmed both paths are tested in every producer and no producer imports the theme
  - Known entrypoints and skill paths: accepted U3–U7 outputs
  - Inputs: accepted AC-3..AC-7 units
  - Dependencies: AC-3, AC-4, AC-5, AC-6, AC-7 units
  - Output: search and test evidence in Verification
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `rg "pi-thoth-theme" pi-packages --glob '!pi-thoth-theme/**' --glob '!**/node_modules/**'` shows no imports; each producer test suite contains kit-present and kit-absent cases
  - Return milestone: before docs
  - Stop / reassessment: missing path coverage returns to the owning unit
- [x] AC-9: Docs and full repository gate
  - Outcome: READMEs and harness packaging docs describe KIT; all checks pass
  - Known entrypoints and skill paths: package READMEs, `docs/agent/harness-packaging.md`, root `package.json` scripts, `.github/workflows/ci.yml`
  - Inputs: accepted AC-1..AC-8
  - Dependencies: all previous units
  - Output: docs edits (worker) and gate results (root) in Verification
  - Owner: thoth-worker for docs, root for the gate
  - Writes: `pi-packages/*/README.md`, `docs/agent/harness-packaging.md`
  - Interface boundaries: none
  - Focused check and PASS evidence: gate commands named in AC-9 exit 0
  - Return milestone: before Oracle verification
  - Stop / reassessment: any failure returns to the owning unit

## Authorization

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

- Plan review history: round 1 [REJECT] shell lifetime vs kit availability and npm publish of `workspace:^` — stable self shell with native Box fallback, session-scoped registration, pnpm publish; round 2 [REJECT] leftover tool-name registry, passthrough children, publish auth and pinned version test — repaired; round 3 [REJECT] shared ticker cleanup across headless children — owner-scoped; round 4 fresh Oracle [OKAY].
- Implementation authorized by explicit user choice (Implement) after [OKAY].

## Verification

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: a4e323de6f9450cdb77ee8ad01df2319f3d2aadde73016319928d7f5d44a7c36

- Review history: final round 1 FAIL (pi-subagents widget KIT path lost the canonical braille animation and truncated metrics at narrow widths) repaired with an optional KIT indicator frame, measured rail width and a faithful test fake; final round 2 fresh Oracle PASS.
- AC-1: PASS | pi-core 149 tests, packed pi-subagents manifest, release/auth tests | KIT v1 (with additive optional indicator frame), ownership-token registry, formatDuration, shared fake; packed pi-core range ^0.1.0; temporary npmrc cleaned on success and failure
- AC-2: PASS | theme 554 tests incl. real Pi SDK 1.0.2 lifecycle tests | both load orders, reload, headless and lean/passthrough children keep the parent kit and ticker; built-in frame geometry unchanged; resolver unchanged
- AC-3: PASS | pi-todo 220 tests incl. packed loader | KIT/native paths and same-component switching for tool and widget
- AC-4: PASS | pi-background-tasks 416 tests (4 skipped), default suite | 8 tools, 2 messages and widget migrated; local frame module removed
- AC-5: PASS | real-adapter probes + subagents 1084 tests (1 skipped) | braille animation frames change with KIT, metrics, selection and mouse targets intact at widths 46 and 50; no hardcoded 24-bit colors
- AC-6: PASS | claude-bridge 344 offline unit tests | AskClaude KIT/native single-shell rendering; local duration copy removed
- AC-7: PASS | antigravity 670 tests (9 skipped) | AskAntigravity and agy-native-event KIT/native rendering; local duration copy removed
- AC-8: PASS | import search + dual-path test review | every migrated tool uses a stable self shell; five producers cover KIT/native switching; no producer imports the theme
- AC-9: PASS | frozen install, check:ci, typecheck, build, root 1455 tests (sibling marketplace fixture, CODEX_HOME unset), all package typechecks and offline suites; docs reviewed | all pass; pi-background-tasks default parallel suite shows intermittent timing failures in untouched process tests, also reproduced on clean HEAD 4a1988a (2/6 runs), disclosed as preexisting reliability risk
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:c98e54c855994178079ad6b4c0a37f4f886e2cb8e147bc7955dbb4426020a06c

## Closeout

**Archive**: READY
