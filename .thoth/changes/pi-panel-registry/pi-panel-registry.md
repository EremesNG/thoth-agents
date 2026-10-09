# Change: pi-panel-registry

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Work-panel registry (`pi-packages/pi-core/src/work-panel.ts:129-231`, `work-panel-state.ts:5-56`): process-wide on `Symbol.for('thoth.pi-core.work-panel')`, contract version 1, holds providers, hosts and lifecycle WeakMaps; registration returns an idempotent unregister and incompatible versions contribute nothing. There is no public listing, no registry-change subscription and no revision counter; provider notifications (`onVisibleChanged`) refresh every host (`:171-172,215-219`). Public index exports registration only (`pi-core/src/index.ts:122`).
- Provider members: identity/config (`version`, `id`, `label`, `priority`, `retention`, `supportsLogTail`, `selectableHeading`, `selectableSummary`, `refreshIntervalMs`, `rowCap`), required callbacks (`visibleCount`, `listRows`, `detail`, `armCloseLabel`, `close`) and optional callbacks (`open`, `openHistory`, `droppedSummary`, `summary`, `showSection`, `parentRow`, `onVisibleChanged`).
- Rows (`work-panel.ts:37-86`): segments/content are data, but `statusGlyph` may be a function and `render(width, now)` is a callback. Subagents rows use both (`pi-subagents/src/ui/work-panel-provider.ts:121-139`); background (`pi-background-tasks/src/navigator-provider.ts:138-163`) and the task-list extension (its work-panel module, lines 62-94; completed segments may embed theme strikethrough output) return data.
- Host ordering by priority then label (`work-panel-render.ts:71-72`); retention/linger lifecycle per spec "Thoth Pi work panel" (`.thoth/specs/pi-ecosystem/spec.md:149-151`).
- Other registries: render-kit (versioned key, single current registration, lookup validation), tool registry (versioned key, global monotonic mutation counter `getToolDefinitionRegistryVersion`), editor slot (arbitration key, no listing).
- Channels (`thoth:subagents:state`, `thoth:background:state` and the task-list state channel) carry domain summaries but not section identity/order, visible rows, provider dismissals or actions.
- Spec "Version-tolerant pi-core registries" (`spec.md:199`) requires one version-independent work-panel ownership slot and that an incompatible copy installs no host and registers no section.
- Package versions: pi-subagents, pi-background-tasks, pi-thoth-theme 0.2.0 with installer floors already `>=0.3.0`; the task-list extension 0.2.0 with floor `>=0.1.0`.

## Intent

Make the work-panel registry publicly discoverable for consumers other than the host: list registered sources with a per-source revision, subscribe to registry and source changes, read data-only rows bounded per source, and invoke a source's actions by source and row id; rows become pure data so any consumer can render them with the render kit.

## Non-goals

- The sidebar itself, layout-root adapters, UI preferences, lineage, provider status channels.
- Changing what the work panel shows, its retention/linger rules, selection, focus or keys.
- Changing channel payloads.
- Package version bumps (only installer floors).

## Acceptance

- AC-1: pi-core exports `listWorkPanelSources()` (id, label, priority, contract version, revision, selectable flags, row cap), `subscribeWorkPanelRegistry(listener)` (fires on register, unregister and source change with the affected source id), `getWorkPanelSourceRows(id, { maxRows })` (data rows bounded by `maxRows` and the source row cap) and `invokeWorkPanelAction(ctx, id, rowId, action)` for the provider's open, history and close actions, where `ctx` is the caller's live Pi `ExtensionContext` for the same session (open/history require a UI-capable context; a missing, stale or non-UI context returns `unavailable` without calling the provider, and while an open/history action runs the host's panel input is suspended exactly as for host-initiated actions); each source revision is a per-source monotonic integer that increases on registration and on every provider change notification; covered by tests including mixed-version copies.
- AC-2: the row contract is data-only: no function members (`render` removed, `statusGlyph` a semantic value); subagents rows express their current look through segments and semantic roles, and background/task-list rows carry no pre-styled theme output; the host renders them through the render kit with the existing look (golden render tests for each section).
- AC-3: the work-panel contract version becomes 2 under the version-independent ownership slot with first-owner arbitration unchanged: whichever copy claims the slot first owns it, and an incompatible non-owning copy (v1 under a v2 owner, or v2 under a v1 owner) installs no host, registers no section and exposes no discovery without throwing; both load orders are tested, including discovery reporting no sources from a v2 copy under a v1 owner; the subagents, background-tasks and task-list providers register v2; installer floor for the task-list extension rises to `>=0.3.0` (subagents and background-tasks already `>=0.3.0`).
- AC-4: work panel behavior is unchanged: existing work-panel, retention, lifecycle and focus tests keep their observable behavior assertions; contract-specific test code (version literals, `row.render` calls, closure-based row fixtures, isolated-core fixtures) is migrated to the v2 data contract without weakening those assertions.
- AC-5: spec and routed docs updated, and the local closeout gate (touched package tests and typechecks, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm run test:pi-extensions`) passes, followed by a live user check of the work panel.

## Clarifications

- Approach (user, 2026-10-09): extend the existing work-panel registry with discovery, subscription and per-source revisions instead of a separate sidebar registry or channels-only discovery.
- Rows (user, 2026-10-09): data-only rows; subagents closures are replaced with semantic segments and status; current look preserved.

## Decisions

- D-1: Discovery lives in the existing registry record; revisions are stored per registration and survive host refreshes; a re-registration of the same id continues that id's revision sequence.
- D-2: `subscribeWorkPanelRegistry` listeners run synchronously after state changes, are isolated from each other's failures and are removed by their disposer; no polling.
- D-3: Action invocation takes the caller's live `ExtensionContext`, verifies it belongs to the session of a registered host (session-manager identity used by the host), routes through the same host path that suspends panel input and owns overlay completion, and returns `ok | unavailable | missing`; consumers never receive provider closures. Context-free consumers can list and read but cannot open UI.
- D-6: Data-only rendering semantics: rows carry identity and metric groups with continuations so the host preserves responsive layout; running status resolves through the render-kit `indicator(..., { frame })` with native spinner frames (animated), terminal statuses through `resolveStatusGlyph`; completed task-list items use a semantic `completed` role rendered dim with the theme strikethrough; no new render-kit API.
- D-4: Contract version 2 (row shape change); the ownership slot stays version-independent per "Version-tolerant pi-core registries".
- D-5: Discovery exports go in the pi-core root index (no pi-tui); host rendering stays in the TUI-only modules.

## Durable deltas

- `ADDED pi-ecosystem` **Discoverable work-panel registry** — pi-core MUST let consumers other than the host list registered work-panel sources with id, label, priority, contract version and a per-source monotonic revision that increases on registration and every provider change, subscribe to registration, removal and source changes, read each source's rows as data-only values bounded by a requested maximum and the source row cap, and invoke a source's open, history and close actions by source and row id; work-panel rows MUST contain no functions, and the work-panel contract version MUST be 2.
  - GIVEN the subagents, background-tasks and task-list sources registered; WHEN a consumer lists sources, subscribes and a subagent finishes; THEN it sees three sources, receives a change for the subagents source with a higher revision, reads that source's rows as plain data within its bound, and can open the item through the action API.

## Plan

1. Registry + host (pi-core, one writer): discovery API, revisions, subscription, action invocation, v2 row contract and host rendering of data-only rows; mixed-version tests. Blocks 2-3.
2. Subagents provider migration (pi-subagents): replace `render`/`statusGlyph` closures with segments and semantic status, keep look (golden tests).
3. Background and task-list provider updates (pi-background-tasks, task-list extension): v2 registration, remove pre-styled theme output from rows. Parallel with 2.
4. Installer floor for the task-list extension (`src/cli/pi-install.ts`); parallel from start.
5. Docs + gate; live check.

Risks: visual drift in subagents rows; mixed-version installs hide sections until all three packages are upgraded (installer floors); listeners re-entering the registry.

## Tasks

- [x] AC-1: pi-core discovery API, revisions, subscription and action invocation
  - Outcome: public discovery surface with tests
  - Known entrypoints and skill paths: pi-packages/pi-core/src/{work-panel.ts,work-panel-state.ts,work-panel-host.ts,work-panel-render.ts,index.ts}, pi-packages/pi-core/test/{work-panel.test.ts,work-panel-copies.test.ts,registry-copies.test.ts}; skills tdd, simplify
  - Inputs: Exploration; Decisions D-1, D-2, D-3, D-5, D-6
  - Dependencies: none
  - Output: registry extensions and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/{work-panel.ts,work-panel-state.ts,work-panel-host.ts,work-panel-render.ts,index.ts}, pi-packages/pi-core/test/work-panel*.test.ts, pi-packages/pi-core/test/isolated-core-fixture.ts, pi-packages/pi-core/test/registry-copies.test.ts, pi-packages/pi-core/README.md
  - Interface boundaries: host behavior unchanged; editor-slot untouched
  - Focused check and PASS evidence: pi-core vitest and typecheck pass
  - Return milestone: API summary with passing tests
  - Stop / reassessment: discovery requires changing host behavior
- [x] AC-2: data-only row contract rendered by the host
  - Outcome: v2 rows without functions, host renders via render kit
  - Known entrypoints and skill paths: pi-packages/pi-core/src/{work-panel.ts,work-panel-render.ts}, pi-packages/pi-core/test/work-panel*.test.ts; skills tdd, simplify
  - Inputs: Decision D-4
  - Dependencies: AC-1 unit (same writer, same files)
  - Output: contract and host rendering with golden tests
  - Owner: thoth-worker
  - Writes: same as AC-1 unit
  - Interface boundaries: render kit API unchanged
  - Focused check and PASS evidence: golden render tests for data rows pass
  - Return milestone: contract with passing tests
  - Stop / reassessment: subagents look cannot be expressed with segments and roles
- [x] AC-3: v2 contract version and mixed-version tolerance
  - Outcome: version 2 with v1 copies isolated
  - Known entrypoints and skill paths: pi-packages/pi-core/src/work-panel-state.ts, pi-packages/pi-core/test/work-panel-copies.test.ts
  - Inputs: Decision D-4
  - Dependencies: AC-1 unit (same writer)
  - Output: version bump and tests
  - Owner: thoth-worker
  - Writes: same as AC-1 unit
  - Interface boundaries: version-independent ownership slot
  - Focused check and PASS evidence: v1 copy installs no host and registers nothing without throwing
  - Return milestone: tests passing
  - Stop / reassessment: ownership slot must change shape
- [x] AC-2: subagents rows migrated to data-only segments
  - Outcome: subagents provider without closures, same look
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/ui/work-panel-provider.ts and its tests; skills tdd, simplify
  - Inputs: accepted pi-core v2 contract
  - Dependencies: pi-core unit accepted
  - Output: migrated provider and golden tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/ui/work-panel-provider.ts, pi-packages/pi-subagents/test/ui/work-panel*.test.ts, pi-packages/pi-subagents/test/ui/widget.test.ts (contract-specific migration only)
  - Interface boundaries: subagents history and widget unchanged
  - Focused check and PASS evidence: pi-subagents vitest and typecheck pass; golden rows match previous output
  - Return milestone: migrated provider
  - Stop / reassessment: needs a new semantic role in pi-core
- [x] AC-3: background and task-list providers on v2
  - Outcome: both providers register v2 with plain-data rows
  - Known entrypoints and skill paths: pi-packages/pi-background-tasks/src/navigator-provider.ts, the task-list extension work-panel module and its tests; skills tdd
  - Inputs: accepted pi-core v2 contract
  - Dependencies: pi-core unit accepted
  - Output: updated providers and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-background-tasks/src/navigator-provider.ts and its tests, the task-list extension work-panel module, its index.ts registration and their tests
  - Interface boundaries: channels unchanged
  - Focused check and PASS evidence: both package suites and typechecks pass
  - Return milestone: updated providers
  - Stop / reassessment: strikethrough cannot be expressed semantically
- [x] AC-3: installer floor for the task-list extension
  - Outcome: floor `>=0.3.0`
  - Known entrypoints and skill paths: src/cli/pi-install.ts, src/cli/pi-install.test.ts
  - Inputs: Decision D-4
  - Dependencies: none
  - Output: floor change and tests
  - Owner: thoth-worker
  - Writes: src/cli/pi-install.ts, src/cli/pi-install.test.ts and tests asserting floors
  - Interface boundaries: other installer behavior unchanged
  - Focused check and PASS evidence: installer tests pass
  - Return milestone: floor updated
  - Stop / reassessment: none
- [x] AC-4: work-panel behavior unchanged
  - Outcome: existing behavior tests pass
  - Known entrypoints and skill paths: pi-packages/pi-core/test/work-panel*.test.ts, pi-subagents/pi-background-tasks/task-list work-panel tests
  - Inputs: accepted migrations
  - Dependencies: all implementation units accepted
  - Output: test evidence
  - Owner: thoth-worker
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: unchanged behavior tests pass
  - Return milestone: evidence reported with the gate
  - Stop / reassessment: behavior test needs a semantic change
- [x] AC-5: docs and closeout gate
  - Outcome: docs and gate
  - Known entrypoints and skill paths: docs/agent routed Pi docs, package READMEs
  - Inputs: accepted units
  - Dependencies: all implementation units accepted
  - Output: docs and gate results
  - Owner: thoth-worker
  - Writes: docs and READMEs only
  - Interface boundaries: none
  - Focused check and PASS evidence: check:ci, typecheck, build, test:pi-extensions and touched suites pass
  - Return milestone: gate results
  - Stop / reassessment: unrelated environment failures reported

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW

Round 1 REJECT (action context binding; first-owner arbitration; contract-specific test ownership) repaired; round 2 fresh Oracle [OKAY] 2026-10-09. Cautions: test missing/uninstalled/disposed hosts and throwing stale-context getters returning unavailable without provider invocation; suspension clears after both resolution and rejection.
**Implementation**: AUTHORIZED

User selected Implement on 2026-10-09 after [OKAY].

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 750c4b874cb9b24273366816acc7da1ec8dc9e80852b4cefc79ea430c535ee72

A first final reviewer stalled on a long command without a verdict; root reran the suites and a fresh Oracle returned PASS on 2026-10-09. Live user check outstanding before archive.

- AC-1: PASS | discovery/action tests (pi-core 844) | bounds, revision continuity, isolated reentrant listeners, stale-context guards, suspension cleared on resolve and reject
- AC-2: PASS | native/themed golden rows | function-free rows; closed statusGlyph union with fallback; subagents responsive metrics and spinner, background statuses, todo diamond and strikethrough match v1
- AC-3: PASS | copies tests + installer tests | v2 first-owner arbitration and discovery isolation in both load orders; task-list floor >=0.3.0 (root 284 passed)
- AC-4: PASS | existing test diff review + suites | observable assertions preserved; subagents 1389/1 skipped, background 567/4 skipped, todo 220
- AC-5: PASS | check:ci, typecheck, build, test:pi-extensions, diff check | all pass; docs match
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:04cc22cd57558b7df1fa48667e437b0d9ded42fc4e69458d9b11d00a0a6f2d62

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: PENDING
