# Change: pi-viewer-tool-render

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- User profile `C:\tmp\piprof4` (resume + open subagents history panel/thread viewer): one-time ~4.9 s UI stall per extension in `pi-packages/pi-subagents/src/thread-view.ts` `loadExternalToolSource` (~414), which builds a new jiti and re-evaluates `pi-packages/pi-antigravity-bridge/extensions/index.ts` (3.8 s eval + 1.0 s transform) to capture tool renderers. User confirmed a pause on first panel open and on the first visit of another subagent; none on revisit. `loadPiComponents` (sync fallback) never ran; async preload took 8 ms.
- Chain: `thread-view.ts` `renderToolItem` (973) -> `ui/panel-overlay.ts` `getToolDefinition` (215) -> `resolveRegisteredToolDefinition` (80-95) -> `toolsFromAccessor` (68, `pi.getAllTools()`) -> `resolveSubagentExternalToolDefinitionFromInfo` (thread-view 456) -> `loadExternalToolSource`.
- Host facts (`@earendil-works/pi-coding-agent`): `pi.getAllTools()` returns `ToolInfo` without `renderCall`/`renderResult` (`agent-session.js:1063-1074`); no public `pi`/`ctx` path reaches `AgentSession.getToolDefinition` or `ExtensionRunner.resolveToolRenderers` (`runner.js:613-695`); `pi` is per extension, so a `registerTool` wrap only sees its own registrations; `registerToolRenderer` resolvers are composed only by the host (`runner.js:542-546`, `interactive-mode.js:1674`); `ToolExecutionComponent` uses only the definition it receives (`tool-execution.js:27-70`).
- Viewer tool cards are built with Pi's `ToolExecutionComponent`; built-ins use Pi default definitions (`thread-view.ts:805-838`) and never pass through `pi-thoth-theme`'s `registerToolRenderer` resolver (`pi-packages/pi-thoth-theme/src/tools/index.ts:67-87`), so viewer cards are native, not kit-styled, unlike the main transcript.
- Theme resolver behavior (`pi-packages/pi-thoth-theme/src/tools/index.ts:49-78`): built-ins get themed renderers; for other tools it calls `next()` and keeps downstream renderers when they exist and the tool is absent from `getAllTools` or its `sourceInfo.baseDir` belongs to a configured respected package (default `thoth-agents`, `@thoth-agents/*`, `thoth-mem`; `src/shared/config.ts:7-11`); otherwise it returns a cached generic kit renderer. So in the main transcript first-party/respected tools keep their own renderers by default and other tools show the generic kit card. The resolver closure only needs a live tool-info accessor and a `next`; it does not need the host runner.
- `ToolExecutionComponent` accepts a composed definition `{...base, ...resolvedRenderers}` and honors `renderShell` (Oracle smoke check; host `interactive-mode.js:1673-1675`).
- Registration lifecycle: Antigravity registers some tools conditionally and some after awaited startup (`pi-antigravity-bridge/extensions/index.ts:568-571,914-929,1052-1055`); Claude and subagents registration is conditional (`pi-claude-bridge/src/index.ts:2754-2756`, `pi-subagents/src/tools/registry.ts:25-33`). Subagent children load extensions in-process under lean isolation, which filters `session_start`/`session_shutdown` for non-passthrough packages (`pi-subagents/src/runner/sdk-runner.ts:273-334`, `src/config.ts:25-30`); several SDK sessions can exist at once (`sdk-runner.ts:477-535`). Native resume re-invokes extension factories (`loader.js:510-520`). Viewer component reuse ignores replaced definitions (`thread-view.ts:954-970`).
- Existing v1 kits without new members remain valid under `getRenderKit` validation (`pi-core/src/render-kit.ts:165-183`); an optional additive member needs no version bump.
- `pi-core` has a process-wide render-kit registry (`src/render-kit.ts`, `globalThis` symbol, `registerRenderKit`/`getRenderKit`/`withdrawRenderKit`) and versioned `pi.events` channels (`src/channels.ts`); no tool-definition registry exists.
- Active spec `.thoth/specs/pi-ecosystem/spec.md` "Thoth Pi render kit" requires render-time kit lookup and a native shell when absent.
- Panel task listing (`history.ts:589`, `manager.ts:2113`, 1 s render interval in `panel-overlay.ts:253`) costs ~0.7 s on open and ~20 ms per ~2 s; separate concern.

## Intent

Opening the subagents viewer must not stall to re-evaluate already-loaded extensions, and tool cards inside the viewer must render through the same Thoth render kit styling as the main transcript when the kit is present, while keeping today's native behavior when the kit is absent.

## Non-goals

- No change to Pi host packages (`node_modules`).
- No change to panel task listing / polling cost (`history.ts`, `manager.ts`, render interval).
- No change to the async/sync Pi component loading in `thread-view.ts` (not a measured cost).
- No change to how tools render in the main transcript.
- No version bumps.

## Acceptance

- AC-1: `@thoth-agents/pi-core` exposes a process-wide tool definition registry (publish returning a per-instance handle, same-name lookup of the most recent live publication, handle-scoped withdrawal revealing earlier entries, monotonic version) and the render-kit contract gains an optional tool-renderer resolution entry point; unit tests cover two owners, stale withdrawal, version changes, and kit validation with and without the optional member (legacy v1 kits stay valid).
- AC-2: `@thoth-agents/pi-thoth-theme` implements the kit tool-renderer resolution using the same resolver it installs with `pi.registerToolRenderer` (themed built-ins, configured respected-package ownership with available downstream renderers, generic kit card otherwise), bound to its live tool-info accessor; parity tests cover default ownership, configured inclusions/exclusions, and missing downstream definitions.
- AC-3: First-party packages that register tools (pi-antigravity-bridge, pi-claude-bridge, pi-background-tasks, the task-list package, pi-subagents) publish their registered definitions to the pi-core registry on `session_start` only when `ctx.hasUI` is true, publish later/conditional registrations if already published, and withdraw by handle on `session_shutdown`; tests cover publication, no publication without UI, late/conditional registration, and withdrawal.
- AC-4: The subagents viewer resolves tool definitions from the pi-core registry before any source re-evaluation. With a kit that has the resolver, it composes `{...base, ...kit.resolveToolRenderers(name, next)}` with a cheap `next` (built-ins themed; respected tools with a cheap definition keep their own renderers; respected tools without one and other tools get the generic kit card) and never calls `loadExternalToolSource`. With a kit lacking the resolver, it uses registry definitions or Pi default rendering without re-evaluation. Without a kit, current behavior (including the jiti fallback) is unchanged. Definition/component caches clear when the registry version or kit changes. Tests cover all three states and cache invalidation.
- AC-5: Touched packages' `typecheck` and tests pass (`test:unit` for pi-claude-bridge); root `pnpm run typecheck` passes; root `check:ci`/`pnpm test` show no failures beyond the known pre-existing baseline (unchanged `panel.test.ts` formatting, inherited `CODEX_HOME`, missing sibling `thoth-plugins` checkout).
- AC-6: A user re-profile (resume + open viewer + visit subagents that used Antigravity/other tools) shows no `loadExternalToolSource` cost, and the user confirms no opening pause and themed tool cards in the viewer.

## Clarifications

- User reported noticeable pauses opening the panel and on first visit of a subagent, and asked to use pi-core and the pi-thoth-theme kit for viewer tool renders.
- With the kit present, renderer selection follows the theme's configured respected-package ownership and the availability of a cheap downstream definition (registry or cache). User chose "Tarjeta genérica del kit (Recommended)": a respected tool whose definition is not available cheaply (e.g. `thoth-mem`, which does not publish to the registry) renders with the generic kit card in the viewer instead of re-evaluating its extension. With the kit absent, the existing jiti path is kept to preserve native behavior.
- Second fresh Oracle plan review returned OKAY (user selected review explicitly); implementation authorized by explicit user choice "Implement (Recommended)".
- First Oracle plan review returned REJECT (incorrect renderer mapping, registry lifecycle under lean children/multiple sessions, missing kit-without-resolver path); record repaired as below.

## Decisions

- Registry lives in pi-core as a `globalThis`-symbol process registry (same pattern as the render kit), not a `pi.events` channel, because payloads contain functions.
- Tool-renderer resolution is exposed through the kit contract as an optional member so the viewer composes it like the host does (`resolve(toolName, next)`), keeping kit lookup at render time.
- `next` passed by the viewer only returns cheap definitions (registry or already-cached); it must never trigger source re-evaluation.
- Third-party tools keep the jiti fallback only when no kit is registered.
- The kit resolver uses the theme's own live tool-info accessor (`pi.getAllTools` of the theme instance that registered the kit) and the caller-supplied `next`.
- Registry ownership: `publish` returns a per-instance handle; same-name lookup returns the most recent live publication; `withdraw(handle)` removes only that handle's entries, revealing earlier ones; a monotonic registry version lets the viewer clear its definition/component caches when entries change.
- Publication happens only from interactive root sessions: each package publishes its registered definitions on `session_start` when `ctx.hasUI` is true (lean children either never receive `session_start` or have no UI), publishes later/conditional registrations immediately if that instance already published, and withdraws on `session_shutdown`. No runner change.
- Kit present without the optional resolver: the viewer uses registry definitions with their own renderers, otherwise Pi default rendering, and never re-evaluates sources. Kit absent: unchanged native behavior.

## Durable deltas

- `ADDED pi-ecosystem` **Thoth Pi tool definition registry** — `@thoth-agents/pi-core` MUST provide a process-wide registry where first-party Pi packages publish the tool definitions they register, returning a per-instance handle, resolving a tool name to its most recent live publication, and letting a handle withdraw only its own entries; first-party packages that register tools MUST publish them only from interactive sessions with a UI and withdraw them on session shutdown.
  - GIVEN a first-party package registered a tool with Pi; WHEN another first-party package looks the tool up by name in the registry; THEN it receives the full definition including its renderers without re-evaluating the owning extension .
- `ADDED pi-ecosystem` **Subagent viewer tool rendering** — The subagents thread viewer MUST resolve tool definitions from the tool definition registry before re-evaluating any extension source; when a render kit is registered it MUST NOT re-evaluate extension sources and MUST render tool calls and results through the kit's tool-renderer resolution when the kit provides it, following the theme's respected-package ownership for tools whose definitions are cheaply available and using the generic kit card otherwise; when no kit is registered it MUST keep native rendering.
  - GIVEN a render kit is registered and a subagent used a tool from an already-loaded extension; WHEN the user opens that subagent in the viewer; THEN the tool card renders through the kit without re-evaluating the extension source .

## Plan

Units:

1. **pi-core registry + kit contract (AC-1)** — `pi-packages/pi-core/src/` new `tool-registry.ts` (or within render-kit module), export from entry; add optional `resolveToolRenderers?(toolName, next)` to `ThothRenderKit` and accept it in `getRenderKit` validation. Producers/consumers depend on this.
2. **Theme kit resolver (AC-2)** — `pi-packages/pi-thoth-theme/src/tools/index.ts` factor the resolver so `registerToolRenderer` and `src/render-kit/index.ts` share it. Depends on 1.
3. **First-party publication (AC-3)** — per package: collect the definitions it registers (including conditional/late ones), publish on `session_start` when `ctx.hasUI`, publish late registrations immediately if already published, withdraw by handle on `session_shutdown`. pi-subagents uses its existing `registerTool` wrapper in `src/extension/subagents-extension.ts:52-60`. Depends on 1. Split: (3a) pi-antigravity-bridge + pi-claude-bridge, (3b) pi-background-tasks + task-list package + pi-subagents `src/extension/**` and `src/tools/registry.ts`.
4. **Viewer adoption (AC-4)** — `pi-packages/pi-subagents/src/ui/panel-overlay.ts` (`resolveRegisteredToolDefinition`, `toolsFromAccessor`) and `src/thread-view.ts` (`renderableToolDefinition`, `builtInToolDefinition`, `cachedToolComponent`): registry lookup first; kit with resolver -> compose `{...base, ...kit.resolveToolRenderers(name, next)}` with cheap `next`; kit without resolver -> registry/default definitions; no kit -> unchanged; never `loadExternalToolSource` when a kit exists; clear `toolComponentCacheByTask`/definition caches on registry version or kit change. Depends on 1 and 2 (interface), and on 3 for live behavior (tests use fakes). Must not overlap unit 3's pi-subagents edits (unit 3 touches only `src/extension/**` and `src/tools/registry.ts`).
5. **Repository checks (AC-5)** — root.
6. **User re-profile (AC-6)** — after merge to `0.5.0`.

Risks: definition identity drift if a package re-registers on reload (mitigated by owner-scoped replace); kit resolver relying on `pi.getAllTools` closure from the theme's own session; component cache in viewer must be cleared when kit changes (reuse `toolComponentCacheByTask` clearing).
Verification seams: pi-core unit tests; theme parity tests; viewer tests with fake kit/registry asserting `loadExternalToolSource` is not called and renderers come from the kit resolver.

## Tasks

- [x] AC-1: pi-core tool definition registry and optional kit tool-renderer entry point
  - Outcome: tested registry + kit contract extension exported from `@thoth-agents/pi-core`
  - Known entrypoints and skill paths: `pi-packages/pi-core/src/render-kit.ts`, `pi-packages/pi-core/src/index.ts`, `pi-packages/pi-core/test/`; skills `tdd`, `simplify`
  - Inputs: Exploration and Decisions in this record
  - Dependencies: none
  - Output: exported API + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-core/src/**`, `pi-packages/pi-core/test/**`
  - Interface boundaries: existing `registerRenderKit`/`getRenderKit`/`withdrawRenderKit`/`createKitRenderMemo` unchanged for current callers
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-core typecheck` and `test` pass
  - Return milestone: API and tests green
  - Stop / reassessment: kit contract validation incompatibility with registered kits
- [x] AC-2: theme implements kit tool-renderer resolution with parity
  - Outcome: shared resolver used by `registerToolRenderer` and the kit
  - Known entrypoints and skill paths: `pi-packages/pi-thoth-theme/src/tools/index.ts`, `pi-packages/pi-thoth-theme/src/render-kit/index.ts`, theme tests; skills `tdd`, `simplify`
  - Inputs: accepted AC-1 interface
  - Dependencies: AC-1 unit accepted
  - Output: implementation + parity tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-thoth-theme/src/**`, `pi-packages/pi-thoth-theme/test/**`
  - Interface boundaries: main-transcript rendering unchanged
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-thoth-theme typecheck` and `test` pass
  - Return milestone: tests green
  - Stop / reassessment: resolver depends on host-only inputs not reproducible in the kit
- [x] AC-3: bridges publish their tool definitions from interactive sessions
  - Outcome: publication/withdrawal lifecycle in pi-antigravity-bridge and pi-claude-bridge, incl. conditional and post-startup registrations
  - Known entrypoints and skill paths: `pi-packages/pi-antigravity-bridge/extensions/index.ts` (568-571, 914-929, 1052-1055), `pi-packages/pi-claude-bridge/src/index.ts` (2754-2756); skills `tdd`, `simplify`
  - Inputs: accepted AC-1 interface
  - Dependencies: AC-1 unit accepted
  - Output: publication code + lifecycle tests
  - Owner: thoth-worker
  - Writes: those packages' source and tests only
  - Interface boundaries: tool behavior and host registration unchanged
  - Focused check and PASS evidence: both packages `typecheck` and tests (`test:unit` for claude) pass, incl. hasUI gating, late registration, withdrawal
  - Return milestone: tests green
  - Stop / reassessment: a registration that cannot be observed by the package
- [x] AC-3: background-tasks, task-list package and pi-subagents publish their tool definitions
  - Outcome: publication/withdrawal lifecycle in the remaining first-party packages
  - Known entrypoints and skill paths: `registerTool` sites in `pi-packages/pi-background-tasks`, `pi-packages/pi-to*`, `pi-packages/pi-subagents/src/extension/subagents-extension.ts:52-60` and `src/tools/registry.ts:25-33`; skills `tdd`, `simplify`
  - Inputs: accepted AC-1 interface
  - Dependencies: AC-1 unit accepted
  - Output: publication code + lifecycle tests
  - Owner: thoth-worker
  - Writes: those packages' source/tests; pi-subagents limited to `src/extension/**`, `src/tools/registry.ts` and their tests
  - Interface boundaries: tool behavior unchanged; no edits to `src/ui/**` or `src/thread-view.ts`
  - Focused check and PASS evidence: each package `typecheck` and tests pass, incl. hasUI gating and withdrawal
  - Return milestone: tests green
  - Stop / reassessment: a registration that cannot be observed by the package
- [x] AC-4: viewer renders tools via registry and kit without re-evaluation
  - Outcome: viewer resolution order and kit-based renderers
  - Known entrypoints and skill paths: `pi-packages/pi-subagents/src/ui/panel-overlay.ts`, `pi-packages/pi-subagents/src/thread-view.ts`, tests `pi-packages/pi-subagents/test/thread-view.test.ts`, `test/thread-view-real-sdk.test.ts`, `test/ui/panel.test.ts`; skills `tdd`, `simplify`
  - Inputs: accepted AC-1 and AC-2 interfaces
  - Dependencies: AC-1 and AC-2 units accepted
  - Output: implementation + tests
  - Owner: thoth-worker
  - Writes: `pi-packages/pi-subagents/src/ui/panel-overlay.ts`, `pi-packages/pi-subagents/src/ui/subagents-history-panel.ts` (panel cache invalidation, added after final-verification finding), `pi-packages/pi-subagents/src/thread-view.ts`, their tests
  - Interface boundaries: kit-absent behavior unchanged; no edits under `src/extension/**`
  - Focused check and PASS evidence: `pnpm --filter @thoth-agents/pi-subagents typecheck` and `test` pass, incl. tests for kit-with-resolver, kit-without-resolver and no-kit states, `loadExternalToolSource` never invoked with a kit, and cache invalidation on registry version/kit change
  - Return milestone: tests green
  - Stop / reassessment: `ToolExecutionComponent` cannot accept a composed definition
- [x] AC-5: package and root checks
  - Outcome: green package checks; root failures limited to the known baseline
  - Known entrypoints and skill paths: root `package.json` scripts
  - Inputs: accepted AC-1..AC-4 diffs
  - Dependencies: AC-1, AC-2, both AC-3, AC-4 units accepted
  - Output: check results
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: package checks exit 0; root `pnpm run typecheck` exit 0; root `check:ci`/`pnpm test` failures only in the baseline
  - Return milestone: results classified
  - Stop / reassessment: any root failure attributable to the diff
- [ ] AC-6: user re-profile confirms no viewer stall and themed cards
  - Outcome: measured absence of re-evaluation and user confirmation
  - Known entrypoints and skill paths: user profiling procedure; analysis script outside the repo
  - Inputs: accepted AC-5; merge to `0.5.0`
  - Dependencies: AC-5 accepted
  - Output: before/after comparison
  - Owner: root with user
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: no `loadExternalToolSource` samples; user confirms no pause and themed cards
  - Return milestone: user provides new profile
  - Stop / reassessment: remaining stall outside this scope

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
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:4e32f6b2e6c579dd14f796fdeaa5e2fa5e4fc4f5e04a6fb216ec7b07a78b9b32

## Closeout

**Archive**: PENDING
