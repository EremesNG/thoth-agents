# Change: pi-panel-standard

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Four Pi panels duplicate frame drawing, width/truncation, key handling and viewport logic:
  - `/subagents-tools`: root extension `src/pi.ts:117-179` + `src/pi/tools-panel.ts` (titled rounded frame, selectedBg row, cursor-centered viewport, hint rows, dirty/failed-save discard screen, wide table at width >= 84, height-aware budget). No mouse. Persistence is Thoth-specific: `src/cli/pi-tool-config.ts` validates provenance, generated defaults and writes `<piRoot>/agents/<specialist>.md`. Tests: `src/pi/tools-panel.test.ts`, `src/pi.test.ts`.
  - `/subagents-model`: `pi-packages/pi-subagents/src/model-profiles/command.ts` + `formatting.ts` (own frame, string-unit width counting, accent glyph selection instead of selectedBg, edge-following viewport, no discard confirm, no height budget, direct `ctx.ui.custom`). Tests: `pi-packages/pi-subagents/test/model-profiles/ui.test.ts`.
  - History: `pi-packages/pi-core/src/history-panel.ts` `HistoryPanel<T>` (split sidebar/content, SGR/urxvt/X10 mouse+wheel parser in `history-panel-input.ts:53-96`); adapters in pi-subagents (`ui/subagents-history-panel.ts`, owned overlay) and pi-background-tasks (`src/history-panel.ts`, direct custom overlay).
  - Work detail: `pi-packages/pi-core/src/work-panel-detail.ts` + `work-panel-host.ts` (stable-size focusable card, folding sections, owned overlay).
- `openOwnedOverlay` (`pi-core/src/owned-overlay.ts`) protects overlay ownership/focus on coding-agent 1.0.2; tools, model and background history bypass it.
- pi-subagents depends on pi-core `workspace:^` (0.2.0) and has no dependency on root thoth-agents.
- Durable requirements: `.thoth/specs/multi-harness-agent-pack/spec.md` "Configure adopted Pi subagents natively" (tools panel protections); `.thoth/specs/pi-ecosystem/spec.md` work panel (:149), background history (:169), question focus over panel overlays (:209).
- Unarchived predecessors `pi-specialist-tools-panel` (not yet archived) and `pi-global-model-panel` are historical and do not authorize this change.

## Intent

Standardize Pi panels on the `/subagents-tools` design through shared pi-core panel primitives and a list-editor shell, and move `/subagents-tools` into pi-subagents next to `/subagents-model` with generic persistence plus an optional Thoth adapter.

## Non-goals

- Changing the interaction model of the history panels or the work-panel detail card (selection/content scrolling, folding, close confirmation, focus-loss behavior).
- New data channels, sidebar work, or roadmap items 1-7.
- Changing tool-selection semantics (globs, `disallowed_tools`, child inventory resolution, missing-implementation warnings).
- Archiving or editing predecessor change records; localizing existing UI labels; package version bumps.

## Acceptance

- AC-1: pi-core publicly exports panel primitives (titled frame, cell-width measurement/truncation/padding, key normalization plus SGR/urxvt/X10 mouse and wheel parsing, cursor-centered viewport, selectedBg selected row, hint rows, dirty-discard confirmation, owned-overlay host helper) and a list-editor shell with configurable wide-table/compact breakpoint and terminal-height-aware viewport, covered by unit tests.
- AC-2: pi-subagents registers `/subagents-tools`, built on the list-editor shell, with generic persistence of definition `tools` that keeps every protection of the "Configure adopted Pi subagents natively" requirement; an optional adapter registered through a process-wide versioned registry supplies reset defaults and ownership/provenance validation; the root extension registers the Thoth adapter and no longer registers the command; root `src/pi/tools-panel.ts` is removed; without an adapter the command works generically and reset-to-defaults is unavailable.
- AC-3: `/subagents-model` renders through the list-editor shell (selectedBg row, cursor-centered and height-aware viewport, wheel scrolling, dirty-discard confirmation) while keeping its keys, model filter and profile persistence.
- AC-4: `HistoryPanel<T>` and the work-panel detail card use the shared primitives for frame, width and input parsing with unchanged interaction behavior, and the tools, model and background-history overlays open through `openOwnedOverlay`.
- AC-5: affected durable specs and routed docs describe the new ownership and shell, and the local closeout gate (touched tests, `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`) passes.

## Clarifications

- Tools persistence after the move (user, 2026-10-09): command in pi-subagents with generic persistence plus a Thoth adapter.
- Shell scope (user, 2026-10-09): common primitives plus a list-editor shell; history and work detail adopt the primitives without interaction changes.
- Installer minimum (user, 2026-10-09, during implementation): pi-subagents >=0.3.0 is the first command-owning version; manifests are not bumped by this change.

## Decisions

- D-1: The Thoth adapter registers through a process-wide versioned registry (`Symbol.for` key, same pattern as the render-kit and work-panel registries) owned by pi-subagents, so load order between root and pi-subagents does not matter and root needs no build-time dependency on pi-subagents.
- D-2: Generic persistence edits only the `tools` field of agent definition files in the scope pi-subagents already resolves; unrelated frontmatter and body bytes are preserved, with stale-write detection.
- D-3: Width is measured in terminal cells (pi-tui measurement), replacing string-unit counting in model formatting.
- D-4: Existing mouse parsing moves from `history-panel-input.ts` into the primitives; `history-panel-input.ts` keeps re-exports only if an existing public subpath requires them.
- D-5: Existing per-panel breakpoints remain (tools wide at >= 84, model wide at >= 102) as shell options.
- D-6: The history "Cerrar" label and other copy stay unchanged.
- D-7: Supported pair and mismatch handling. pi-subagents publishes a versioned `/subagents-tools` ownership capability in its process-wide registry when it registers the command. New root (without the command) checks the capability at `session_start` and, when absent, notifies the user once that `/subagents-tools` requires an upgraded `@thoth-agents/pi-subagents` (truthful, no silent loss). The installer's pi-subagents minimum in `src/cli/pi-install.ts` `PI_PACKAGE_SPECS` is raised to the first version that owns the command. Old root + new pi-subagents (duplicate names renamed by Pi 1.0.2 `extensions/runner.js:556-597`): the worker verifies whether extensions can read registered command names; if so pi-subagents warns on a detected duplicate with upgrade guidance, otherwise this direction is documented as unsupported and prevented by shipping both packages together through the installer. Tests cover both mismatch directions and both load orders as far as Pi exposes them.
- D-8: The Thoth adapter applies only to thoth-managed global specialist definitions (canonical roles, `agents/thoth-*.md` with ownership markers); project or unmanaged definitions use generic persistence without Thoth validation, and managed files never bypass it. `src/cli/pi-tool-config.ts` validation is reused through a scoped wrapper.
- D-9: pi-core keeps existing history re-exports and optional-peer importability whichever export location (index or `./panel` subpath) the shell uses.

## Durable deltas

- `ADDED pi-ecosystem` **Shared Pi panel shell** — pi-core MUST export panel primitives (titled frame, cell-width truncation, keyboard plus SGR/urxvt/X10 mouse and wheel parsing, cursor-centered viewport, selectedBg row, hint rows, dirty-discard confirmation, owned-overlay host) and a list-editor shell; Pi list editors MUST render through the shell, and history panels and the work-panel detail card MUST use the primitives without changing their interaction model.
  - GIVEN the tools, model, history and work-detail panels; WHEN each renders and receives keyboard or wheel input; THEN they share the primitives' frame, width handling and input parsing, the list editors share the shell, and every panel overlay opens through `openOwnedOverlay`.
- `MODIFIED multi-harness-agent-pack` **Configure adopted Pi subagents natively** — Pi MUST expose /subagents-model using native profiles and /subagents-tools using the same shared list-editor shell with safe tool persistence, both registered by pi-subagents; /subagents-tools MUST persist only the definition `tools` field generically and MAY receive reset defaults and managed-file ownership validation from a registered adapter, which thoth-agents provides for its managed specialist definitions; the former Thoth model/tools commands and fork-owned SDD workflow MUST be absent. The tools panel MUST edit exact tool names only, list the root's registered tools (active and inactive) and the child-provided `ask_orchestrator`, offer no dynamic `*` mode, reject `@active`, and preserve glob entries and unrecognized names unchanged on save. Tool selections MAY contain globs, where `*` is an ordinary glob; every glob expands against the root's registered tools, active and inactive, excluding the native `subagent_*` tools and the definition's `disallowed_tools`. Explicitly selected tools MUST reach the child even when inactive in the root, unless removed by configuration, `disallowed_tools` or native exclusions. Existing explicit configurations, defaults, reserved controls, save/cancel, stale/partial recovery and unrelated fields MUST remain protected. Synchronization MUST preserve operator tool selections including globs and an operator-set `disallowed_tools`, and child launch MUST resolve its current inventory; for every selection form, selected tools without a child implementation MUST be dropped and reported as a durable warning visible on the running task's widget card and on its status, result and completion, and launch MUST fail with a truthful missing-implementation diagnostic only when no selected tool remains. When thoth-agents and pi-subagents versions do not form a supported pair for /subagents-tools ownership, the user MUST receive a truthful diagnostic with upgrade guidance instead of silent command loss.
  - GIVEN exact names and globs including `*` and `agent_browser_*`, with root tools that are inactive or lack a child implementation, and pi-subagents with or without the Thoth adapter; WHEN the panel saves, synchronization runs and a child launches; THEN only the `tools` field changes, exact names and globs persist unchanged, globs include root-inactive registered tools minus `subagent_*` and `disallowed_tools`, missing implementations are dropped and reported, the child fails only when nothing remains, and reset-to-defaults is offered only when the adapter supplies defaults.

## Plan

Units (one writer per surface):

1. Shell (pi-core): new panel primitives and list-editor shell modules exported from `pi-packages/pi-core/src/index.ts` (or a `./panel` subpath, worker's choice, consistent with `./history-panel`). Move the mouse parser here. Unit tests for frame, cell truncation, input parsing, viewport centering, discard confirmation and breakpoints. Blocks units 2-4.
2. Tools move (pi-subagents + root): port `src/pi/tools-panel.ts` behavior onto the shell inside pi-subagents; implement generic `tools` persistence and the adapter registry (D-1, D-2); register the command in the pi-subagents extension; root registers the Thoth adapter (reusing `src/cli/pi-tool-config.ts` validation/defaults) and drops command registration and `src/pi/tools-panel.ts`. Port tests (22 panel tests plus root registration tests).
3. Model migration (pi-subagents `src/model-profiles/` only): render through the shell, add discard confirmation, height budget, wheel scrolling, owned overlay; keep keys/filter/persistence. Runs in parallel with unit 2 (disjoint files; unit 2 owns extension registration).
4. Primitive adoption (pi-core history/work-detail files + pi-background-tasks history host): replace duplicated frame/width/input helpers; open background history through `openOwnedOverlay`; existing behavior tests must pass unchanged. Parallel with units 2-3.
5. Docs/spec: routed docs (`docs/agent/` Pi pages) and READMEs of pi-core/pi-subagents; durable deltas applied at archive.

Verification seams: per-package vitest for pi-core, pi-subagents, pi-background-tasks and root `src/pi*.test.ts`; `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`; live smoke by the user of the four panels.

Risks: coding-agent 1.0.2 overlay internals; behavior drift in history/detail while swapping helpers; persistence safety regressions for tools (globs, stale writes, provenance); mixed-version installs where root and pi-subagents versions differ (registry versioning must tolerate absence).

## Tasks

- [x] AC-1: pi-core panel primitives and list-editor shell exported with tests
  - Outcome: public, tested primitives and list-editor shell in pi-core
  - Known entrypoints and skill paths: pi-packages/pi-core/src/{index.ts,history-panel.ts,history-panel-input.ts,owned-overlay.ts,render-kit.ts}; src/pi/tools-panel.ts (design reference, read-only); skills tdd, simplify
  - Inputs: Exploration, Decisions D-3, D-4, D-5
  - Dependencies: none
  - Output: new pi-core shell modules, exports and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/panel*.ts (new), pi-packages/pi-core/src/history-panel-input.ts (parser move only), pi-packages/pi-core/src/index.ts, pi-packages/pi-core/package.json (exports only if a subpath is added), pi-packages/pi-core/test/panel*.test.ts
  - Interface boundaries: existing pi-core public exports stay source-compatible
  - Focused check and PASS evidence: pi-core vitest and typecheck pass
  - Return milestone: API summary plus passing pi-core tests
  - Stop / reassessment: shell requires changing history/work-detail interaction or existing public API
- [x] AC-2: /subagents-tools owned by pi-subagents with generic persistence and Thoth adapter
  - Outcome: command moved, generic persistence, adapter registry, root adapter registration
  - Known entrypoints and skill paths: src/pi.ts, src/pi/tools-panel.ts, src/pi/tools-panel.test.ts, src/pi.test.ts, src/cli/pi-tool-config.ts, pi-packages/pi-subagents/src/extension/subagents-extension.ts, pi-packages/pi-subagents/src/model-profiles/; skills tdd, simplify
  - Inputs: accepted AC-1 shell API; Decisions D-1, D-2, D-7, D-8; requirement "Configure adopted Pi subagents natively"
  - Dependencies: AC-1 shell unit accepted
  - Output: pi-subagents tools command, adapter registry, root adapter, ported tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/tools-panel/** (new), pi-packages/pi-subagents/src/extension/subagents-extension.ts, pi-packages/pi-subagents/test/tools-panel/** (new), src/pi.ts, src/pi/tools-panel.ts (delete), src/pi/tools-panel.test.ts (delete/port), src/pi.test.ts, src/cli/pi-tool-config.ts, src/cli/pi-install.ts (pi-subagents minimum only) and its test
  - Interface boundaries: thoth sync of definitions; child tool resolution unchanged
  - Focused check and PASS evidence: pi-subagents vitest (including generic-writer safety cases: stale/pre-write race, partial-save retry, preserved globs and unrecognized names, reserved controls, `ask_orchestrator` listing, no `*` mode, `@active` rejection; adapter applicability per D-8; both mismatch directions and load orders per D-7), root src/pi*.test.ts and src/cli/pi-tool-config / pi-install tests pass; typecheck passes
  - Return milestone: command works with and without adapter in tests
  - Stop / reassessment: a protection cannot be kept generically or root must import pi-subagents at build time
- [x] AC-3: /subagents-model rendered through the list-editor shell
  - Outcome: model command on shell with discard confirm, height budget, wheel, owned overlay
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/model-profiles/{command.ts,formatting.ts}, pi-packages/pi-subagents/test/model-profiles/ui.test.ts; skills tdd, simplify
  - Inputs: accepted AC-1 shell API; Decisions D-3, D-5
  - Dependencies: AC-1 shell unit accepted
  - Output: migrated model command and updated tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/model-profiles/**, pi-packages/pi-subagents/test/model-profiles/**
  - Interface boundaries: profile persistence and command registration unchanged
  - Focused check and PASS evidence: pi-subagents model-profiles tests and typecheck pass
  - Return milestone: migrated command with passing tests
  - Stop / reassessment: shell cannot express typed filtering or picker without API changes
- [x] AC-4: history panels and work detail adopt primitives; background history uses owned overlay
  - Outcome: duplicated helpers removed with unchanged interactions
  - Known entrypoints and skill paths: pi-packages/pi-core/src/{history-panel.ts,work-panel-detail.ts,work-panel-host.ts}, pi-packages/pi-background-tasks/src/history-panel.ts, pi-packages/pi-subagents/src/ui/subagents-history-panel.ts; skills simplify
  - Inputs: accepted AC-1 shell API
  - Dependencies: AC-1 shell unit accepted
  - Output: refactored panels with existing tests passing
  - Owner: thoth-worker
  - Writes: pi-packages/pi-core/src/{history-panel.ts,work-panel-detail.ts,work-panel-host.ts}, pi-packages/pi-background-tasks/src/history-panel.ts, related existing tests only if helper imports move
  - Interface boundaries: HistoryPanel<T> public API, work-panel spec behavior, question-focus spec
  - Focused check and PASS evidence: pi-core and pi-background-tasks vitest pass with unchanged behavior tests
  - Return milestone: refactor complete with passing tests
  - Stop / reassessment: any interaction behavior would change
- [x] AC-5: routed docs updated and local closeout gate passes
  - Outcome: docs reflect ownership/shell; gate green
  - Known entrypoints and skill paths: docs/agent/index.md and routed Pi docs, pi-packages/pi-core/README.md, pi-packages/pi-subagents/README.md
  - Inputs: accepted AC-1 to AC-4 outputs
  - Dependencies: AC-1, AC-2, AC-3, AC-4 units accepted
  - Output: updated docs and gate results
  - Owner: thoth-worker
  - Writes: routed docs and package READMEs only
  - Interface boundaries: none
  - Focused check and PASS evidence: pnpm run check:ci, pnpm run typecheck, pnpm run build, touched-package tests pass
  - Return milestone: gate results reported
  - Stop / reassessment: unrelated environment failures reported with evidence

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW

Round 1 REJECT (incomplete MODIFIED delta; mixed-version command ownership) repaired; round 2 fresh Oracle [OKAY] 2026-10-09. Caution: use pi.getCommands() duplicate detection on Pi 1.0.2; installer minimum = first shipped command-owning pi-subagents release.
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
**Reviewed record SHA-256**: 022f5e9ad8a237244f652d07b6c89e509df258073ac330c95de19022f3c3549d

Round 1 FAIL (CSI-u Enter/Escape, regular-mode mouse activation, incomplete AC-4 frame/input adoption) and round 2 FAIL (CSI-u Ctrl-C normalization) repaired; round 3 fresh Oracle PASS on 2026-10-09.

- AC-1: PASS | pi-core vitest + typecheck | 579 passed; ./panel exports, normalization (incl. CSI-u Enter/Escape/Ctrl-C), frames, viewport, discard, mouse leases; optional-peer root import verified
- AC-2: PASS | pi-subagents vitest + root focused vitest | 1377 passed/1 skipped; 239 root passed; generic tools-only writes, Thoth adapter scope, mismatch diagnostics both directions and load orders, installer >=0.3.0
- AC-3: PASS | pi-subagents model-profiles tests | shell rendering, selectedBg, wheel, filter, dirty-discard and profile persistence pass
- AC-4: PASS | pi-core + pi-background-tasks vitest, golden frames | 18/18 history/detail frames byte-identical vs HEAD; 549 passed/4 skipped; owned overlay for background history
- AC-5: PASS | check:ci, typecheck, build, test:pi-extensions, git diff --check | all pass; 11 bundle tests; routed docs updated
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:b07ebdb159c859b4485a719f81a717ee3b33bbe9f4cdadb187d00244bd466715
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:d0fcc37c3b4e3aae5db80675a0991d7d01500e303b3df10f91f251f1e143624c

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
