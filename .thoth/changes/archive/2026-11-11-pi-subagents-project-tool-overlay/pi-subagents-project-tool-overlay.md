# Change: pi-subagents-project-tool-overlay

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: low
**Risk**: medium

## Exploration

- Today a project can only change a specialist's tools by shadowing the whole
  definition with `.pi/subagents/<name>.md` or `.pi/agents/<name>.md`
  (`pi-packages/pi-subagents/src/config.ts:640-663,706-722`; later same-name
  definitions replace earlier ones whole). Those copies freeze the managed
  description and prompt body; the Unity project `G:\Mi unidad\Unity\Assets\3D AI\.pi`
  shows real drift (worker/designer bodies differ from current global, not just tools).
- `subagents.json` is read globally (`$PI_CODING_AGENT_DIR` or `~/.pi/agent`) and from
  `<cwd>/.pi/subagents.json`, shallow-merged with project winning
  (`config.ts:476-479`). Unknown keys are ignored; no `agents` key is consumed
  (`config.ts:489-558`). The installer's `mergePiSubagentsConfig`
  (`src/cli/pi-install.ts:916-923`) writes only the global file and preserves unknown keys.
- Definition `tools` is parsed in `config.ts:161-176,219-221,615-630`; empty/omitted
  inherits `default_tools` (`config.ts:717`). `loadSubagents` (`config.ts:720-722`) is the
  post-precedence boundary. Runtime expansion happens in
  `runner/sdk-runner.ts:87-117,773-782` via `tool-patterns.ts` (anchored, case-sensitive,
  `*` only, unmatched globs contribute nothing, `@active` throws), then subtracts
  `disallowed_tools` and native `subagent_*`; dropped tools flow to task history
  (`manager.ts:2227-2228,2354-2355`).
- `/subagents-tools` (`tools-panel/{command,config,panel,write}.ts`) snapshots each
  winning definition, edits only its frontmatter `tools`, writes atomically with
  `.bak-<pid>-<uuid>` backups, and has no editing scope. `r defaults` appears only when
  the Thoth adapter supplies defaults. Manual entries (globs/unregistered names) are
  editable since commit `3f0522ca`.
- No current code creates project definition copies; their origin is unproven.
- `model-profiles/store.ts` resolves project profiles over global ones; it offers no
  presence-based editing-scope helper, so the initial-scope rule here is defined
  explicitly in AC-3.
- Enabled `ask_orchestrator`/`notify_orchestrator` are injected independently of the
  selected patterns (`runner/sdk-runner.ts:99-113`), as guaranteed by the canonical
  requirement "Pi children query the root orchestrator".
- `tools-panel/write.ts` `writeDefinitionText` supports safe paths, missing-file
  creation, stale checks, exclusive temp files, backups and atomic replacement, but
  no file retirement.

## Intent

A project can grant or withhold specialist tools (e.g. `mcp__blender*` only in a
Blender project) through a small per-agent overlay in `<project>/.pi/subagents.json`,
edited from `/subagents-tools` with a Global/Project scope, without copying
definitions; existing whole-file project copies can be converted into that overlay.

## Non-goals

- No overlay for model, effort, skills, `disallowed_tools`, description or body.
- No overlay read from the global `subagents.json` (the global definition file stays the
  global source of truth) and no ancestor-directory search.
- No change to OpenCode `/subagents-tools`, Claude or Codex harnesses.
- No automatic or installer-driven migration of project copies; conversion is an explicit
  panel action.
- No change to glob syntax or case sensitivity.

## Acceptance

- AC-1: `<cwd>/.pi/subagents.json` key `agents.<name>.tools` with optional `add` and
  `remove` string arrays is parsed for each loaded agent name; invalid shapes or entries
  (non-strings, empty strings, `@active`) are ignored with a debug-visible diagnostic and
  never break loading; `agents` in the global `subagents.json` has no effect.
- AC-2: A child's selected tools equal expand(definition `tools`, or inherited
  `default_tools` when empty, plus `add`) minus every tool matched by a `remove` pattern,
  then minus `disallowed_tools` and native exclusions; unmatched `add`/`remove` patterns
  contribute nothing and produce no dropped-tool warning; exact `add` names without an
  implementation follow the existing dropped/reported path. The overlay never affects
  injected `ask_orchestrator`/`notify_orchestrator`, which keep their current flag- and
  `disallowed_tools`-controlled injection after overlay composition; with both flags
  disabled, an overlay removing every selected tool fails launch with the existing
  truthful empty-selection diagnostic.
- AC-3: `/subagents-tools` offers a Global/Project scope toggle with a visible indicator.
  Initial scope is Project when the project `.pi/subagents.json` has a non-empty `agents`
  overlay or any project definition shadows a global one; otherwise Global.
- AC-4: In Project scope the panel edits each agent's overlay losslessly: the draft is
  the existing `add`/`remove` arrays verbatim, base entries are shown read-only, and the
  effective view is computed with AC-2 semantics. Turning an effective exact tool off
  drops it from `add` when present there and, if still effective, appends its exact name
  to `remove`; turning a tool on drops its exact name from `remove` and, if still not
  selected, appends it to `add`; a tool still blocked by a `remove` glob is not toggled
  and the blocking pattern is shown. Manual actions add or delete patterns in `add` or
  `remove` explicitly. Opening and saving without edits writes an identical overlay;
  untouched entries (including removals not derived from base entries) are preserved.
  Save writes only the `agents` key of `.pi/subagents.json`, preserving every other key
  and creating `.pi/` when missing; agents with empty `add` and `remove` and an empty
  `agents` object are pruned; the write is atomic with stale-content detection;
  definition Markdown is never touched. Reset in Project scope clears the agent's overlay.
- AC-5: In Global scope save edits the global definition file even when a project copy
  shadows it, and the panel warns that the copy hides the change in this project.
- AC-6: For a project definition that shadows a global definition of the same name, the
  panel offers an explicit convert action. The overlay is `add` = copy entries absent
  from the global entries and `remove` = exact names in expand(global) minus
  expand(copy) against the current registered inventory. Conversion is refused with an
  explanation when (a) any other same-name project definition (`.pi/agents` or
  `.pi/subagents`) would remain after retiring the winner, (b) global-plus-candidate
  overlay does not produce exactly the pre-conversion effective selection (copy plus
  current overlay), or (c) copy-plus-candidate overlay does not produce exactly that same
  pre-conversion selection, so the intermediate state after the overlay write is
  unchanged. The confirmation lists every non-tools difference that will be lost
  (description, body, other frontmatter including `disallowed_tools`) and that future
  tools matched by global globs will now apply. On confirm, after stale checks on both
  files, the overlay is written first; then the copy is retired by an exclusive rename to
  `.bak-<pid>-<uuid>`. If the overlay write fails the copy is untouched; if retirement
  fails the written overlay is reported as partial state, which guard (c) makes
  selection-equivalent to the pre-conversion state. Cancel changes nothing; definitions without a global counterpart are
  not offered conversion.
- AC-7: pi-subagents README, the `subagents-configuration` skill, root README and
  `docs/agent/harness-packaging.md` document the overlay schema, merge semantics,
  scopes and conversion; the thoth-agents project-shadow diagnostic
  (`src/cli/pi-resources.ts`) recommends the overlay instead of copies.

## Clarifications

- Resolved (user): store the overlay in the existing `.pi/subagents.json`.
- Resolved (user): existing copies get a panel action that converts them to an overlay.
- Resolved (user): initial scope mirrors `/subagents-model` — project wins when project
  configuration exists, else Global.

## Decisions

- Overlay is project-only and applied on top of the winning definition, so it also
  composes with a remaining project copy.
- `add` patterns join selection before expansion; `remove` patterns subtract after
  expansion, so a project can remove `mcp__x` from a global `mcp__*`.
- Project-scope panel state is the overlay itself (lossless `add`/`remove`), not a diff
  recomputed from a draft selection; toggles translate to exact-name edits.
- Overlay composition precedes the unchanged orchestrator-control injection; no
  canonical change to "Pi children query the root orchestrator".
- Conversion is registry-relative and must be selection-equivalent at conversion time
  both for the final global-plus-overlay state and the intermediate copy-plus-overlay
  state, and only when the global definition becomes the winner; otherwise it is refused.
- Overlay parsing reads the project file directly, independent of the shallow
  global/project merge of other keys.
- Reset (`r`) in Project scope means "clear overlay"; adapter defaults remain a
  Global-scope action.
- Conversion deletes the copy only after confirmation and relies on the existing backup
  convention for recovery.

## Durable deltas

- `ADDED pi-ecosystem` **Project subagent tool overlay** — pi-subagents MUST honor a per-agent tool overlay `agents.<name>.tools` with `add` and `remove` pattern arrays read only from `<cwd>/.pi/subagents.json`; `add` MUST join the winning definition's tools (or inherited `default_tools`) before glob expansion, `remove` MUST subtract every matching tool after expansion and before `disallowed_tools` and native exclusions, invalid overlay entries MUST be ignored without breaking loading, the overlay MUST NOT affect injected orchestrator controls, and `/subagents-tools` MUST offer a Global/Project scope whose Project saves losslessly edit only that overlay while preserving other keys, starting in Project when a project overlay or a shadowing project definition exists, and MUST offer an explicit confirmed conversion of a shadowing project definition copy into a selection-equivalent overlay, refusing conversion when equivalence cannot be achieved.
  - GIVEN a global thoth-worker with tools `read, bash` and a project `.pi/subagents.json` with `agents.thoth-worker.tools.add=["mcp__blender*"]` while the project registers the Blender MCP server; WHEN the user launches thoth-worker in that project and in another project; THEN the child receives the Blender tools only in the first project, the other project receives `read, bash` without dropped-tool warnings, and saving a Project-scope change in `/subagents-tools` rewrites only `agents` in `.pi/subagents.json`.
- `MODIFIED multi-harness-agent-pack` **Configure adopted Pi subagents natively** — Pi MUST expose /subagents-model using native profiles and /subagents-tools using the same shared list-editor shell with safe tool persistence, both registered by pi-subagents; /subagents-tools MUST persist, in Global scope, only the definition `tools` field generically and, in Project scope, only the project tool overlay in `<cwd>/.pi/subagents.json`, and MAY receive reset defaults and managed-file ownership validation from a registered adapter, which thoth-agents provides for its managed specialist definitions; the former Thoth model/tools commands and fork-owned SDD workflow MUST be absent. The tools panel MUST list the root's registered tools (active and inactive) and the child-provided `ask_orchestrator` and `notify_orchestrator`, offer no dynamic `*` mode, reject `@active`, and preserve glob entries and unrecognized names unchanged on save. Tool selections MAY contain globs, where `*` is an ordinary glob; every glob expands against the root's registered tools, active and inactive, excluding the native `subagent_*` tools and the definition's `disallowed_tools`. Explicitly selected tools MUST reach the child even when inactive in the root, unless removed by configuration, the project overlay, `disallowed_tools` or native exclusions. Existing explicit configurations, defaults, reserved controls, save/cancel, stale/partial recovery and unrelated fields MUST remain protected. Synchronization MUST preserve operator tool selections including globs and an operator-set `disallowed_tools`, and child launch MUST resolve its current inventory; for every selection form, selected tools without a child implementation MUST be dropped and reported as a durable warning visible on the running task's widget card and on its status, result and completion, and launch MUST fail with a truthful missing-implementation diagnostic only when no selected tool remains. When thoth-agents and pi-subagents versions do not form a supported pair for /subagents-tools ownership, the user MUST receive a truthful diagnostic with upgrade guidance instead of silent command loss; a project definition shadowing a managed specialist MUST be diagnosed with a recommendation to use the project tool overlay.
  - GIVEN exact names and globs including `*` and `agent_browser_*`, with root tools that are inactive or lack a child implementation, pi-subagents with or without the Thoth adapter, and a project overlay; WHEN the panel saves in Global or Project scope, synchronization runs and a child launches; THEN Global saves change only the definition `tools` field, Project saves change only the project overlay, exact names and globs persist unchanged, globs include root-inactive registered tools minus `subagent_*`, overlay removals and `disallowed_tools`, missing implementations are dropped and reported, the child fails only when nothing remains, and reset-to-defaults is offered only when the adapter supplies defaults.

## Plan

1. Runtime (pi-subagents `config.ts`, `runner/sdk-runner.ts`, `tool-patterns.ts` reuse,
   `types.ts`): add a validated `toolOverlay { add: string[]; remove: string[] }` to the
   loaded definition from a direct read of `<cwd>/.pi/subagents.json` in
   `loadSubagents`; in the runner, append `add` to the selection before expansion and
   subtract `remove` matches after expansion, before `disallowed_tools`/native exclusion.
   Unmatched overlay globs are not dropped-tool warnings; orchestrator-control injection
   stays after overlay composition and unchanged. Tests first in
   `test/config.test.ts` and `test/runner/tool-selectors-real-sdk.test.ts`.
2. Panel (pi-subagents `tools-panel/*`): snapshot both base definitions (global winner
   excluding project copies for Global scope) and the project overlay; scope toggle key,
   indicator and initial-scope rule; Project draft is the overlay (lossless add/remove)
   with toggles mapped to exact-name edits; save writes JSON through an atomic write
   helper reusing `write.ts` conventions (exclusive temp, stale check, backup, rename);
   Project reset clears the overlay; Global save targets the global file with a shadow
   warning; convert action computes a selection-equivalent overlay or refuses, confirms
   lost differences, writes overlay then retires the copy by exclusive rename. Tests first
   in `test/tools-panel/{config,panel,command}.test.ts`.
3. Docs and harness diagnostic: pi-subagents README, `skills/subagents-configuration/SKILL.md`,
   root README, `docs/agent/harness-packaging.md`; `src/cli/pi-resources.ts` shadow
   diagnostic text plus its test.

Focused verification: pi-subagents package tests for config/runner/tools-panel,
`src/cli/pi-resources.test.ts`, `pnpm run check:ci`, `pnpm run typecheck`, package
typecheck, `pnpm run build`.

## Tasks

- [x] AC-1: Project overlay parsed into loaded definitions
  - Outcome: `loadSubagents` attaches a validated overlay per agent from the project file only
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/config.ts, src/types.ts, test/config.test.ts; tdd skill
  - Inputs: Exploration and Decisions of this record
  - Dependencies: none
  - Output: overlay type, parser, tests (valid, invalid entries, global `agents` ignored, missing file)
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/config.ts, src/types.ts, test/config*.test.ts
  - Interface boundaries: SubagentDefinition shape consumed by manager/runner/tools-panel
  - Focused check and PASS evidence: pi-subagents vitest config tests pass; package typecheck passes
  - Return milestone: parser and tests green
  - Stop / reassessment: definition type change breaks unrelated callers beyond pi-subagents
- [x] AC-2: Overlay applied in child tool selection
  - Outcome: runner composes add before expansion and remove after, before disallowed/native exclusions
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/runner/sdk-runner.ts, src/tool-patterns.ts, src/manager.ts, test/runner/tool-selectors-real-sdk.test.ts
  - Inputs: AC-1 overlay type
  - Dependencies: AC-1 unit accepted
  - Output: runner change and tests (add glob, add missing exact → dropped warning, remove from glob, unmatched overlay silent, remove-all with both orchestrator flags disabled → existing empty diagnostic, remove patterns never strip injected orchestrator controls)
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/runner/sdk-runner.ts and runner tests
  - Interface boundaries: dropped-tool reporting path in manager.ts unchanged
  - Focused check and PASS evidence: runner tests pass
  - Return milestone: selection tests green
  - Stop / reassessment: expansion lives in more than one path requiring manager changes
- [x] AC-3: Scope toggle and initial-scope rule in /subagents-tools
  - Outcome: panel shows Global/Project indicator, toggles scope, starts in Project when project config exists
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/tools-panel/{command,config,panel}.ts, test/tools-panel/*
  - Inputs: AC-1 overlay parser
  - Dependencies: AC-1 unit accepted
  - Output: snapshot of base + overlay per scope, toggle, tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/tools-panel/*, test/tools-panel/*
  - Interface boundaries: shared pi-core list-editor shell API, Thoth adapter contract
  - Focused check and PASS evidence: tools-panel tests pass
  - Return milestone: scope toggle tests green
  - Stop / reassessment: pi-core shell lacks a slot for a scope indicator
- [x] AC-4: Project-scope save and reset write only the overlay
  - Outcome: lossless overlay editing written atomically to .pi/subagents.json preserving other keys; reset clears overlay
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/tools-panel/{config,write}.ts
  - Inputs: AC-3 snapshot model
  - Dependencies: AC-3 unit accepted (same writer, same surface)
  - Output: overlay draft model, JSON writer and tests (toggle mapping incl. tool under base glob → exact remove, remove-glob-blocked toggle, reopen/save equivalence, preserved non-base removals, create .pi, preserve keys, prune empty, stale detection, Markdown untouched)
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/tools-panel/*, test/tools-panel/*
  - Interface boundaries: existing write.ts atomic conventions
  - Focused check and PASS evidence: tools-panel tests pass
  - Return milestone: project save tests green
  - Stop / reassessment: concurrent writers to subagents.json discovered
- [x] AC-5: Global-scope save targets the global definition with shadow warning
  - Outcome: Global save never edits a project copy; warning shown when shadowed
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/tools-panel/{config,panel}.ts
  - Inputs: AC-3 snapshot model
  - Dependencies: AC-3 unit accepted
  - Output: target selection change and tests
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/tools-panel/*, test/tools-panel/*
  - Interface boundaries: Thoth adapter managed-file validation
  - Focused check and PASS evidence: tools-panel tests pass
  - Return milestone: global target tests green
  - Stop / reassessment: adapter validation rejects global targets when copies exist
- [x] AC-6: Confirmed conversion of project copies into the overlay
  - Outcome: convert action lists lost differences, writes overlay, removes copy with backup; cancel is a no-op
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/tools-panel/{config,panel,write}.ts; pi-core dirty-discard confirmation primitive
  - Inputs: AC-4 overlay writer
  - Dependencies: AC-4 and AC-5 units accepted
  - Output: action, confirmation, tests (selection equivalence incl. global `*` vs copy `read,bash`, refusal when not equivalent, refusal when a copy exists in both `.pi/agents` and `.pi/subagents`, refusal when an existing overlay makes copy-plus-candidate differ (existing overlay + retirement failure regression), lost-diff listing, no global counterpart, cancel, stale input, overlay-write failure keeps copy, retirement failure reports partial state)
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/tools-panel/*, test/tools-panel/*
  - Interface boundaries: write.ts backup convention
  - Focused check and PASS evidence: tools-panel tests pass
  - Return milestone: conversion tests green
  - Stop / reassessment: deletion cannot be made recoverable with existing backup helper
- [x] AC-7: Documentation and shadow diagnostic updated
  - Outcome: docs describe overlay/scopes/conversion; pi-resources shadow diagnostic recommends overlay
  - Known entrypoints and skill paths: pi-packages/pi-subagents/README.md, pi-packages/pi-subagents/skills/subagents-configuration/SKILL.md, README.md, docs/agent/harness-packaging.md, src/cli/pi-resources.ts, src/cli/pi-resources.test.ts
  - Inputs: accepted AC-1..AC-6 behavior
  - Dependencies: AC-6 unit accepted
  - Output: doc edits and diagnostic text/test
  - Owner: thoth-worker
  - Writes: the listed files
  - Interface boundaries: none
  - Focused check and PASS evidence: src/cli/pi-resources.test.ts passes; check:ci passes
  - Return milestone: docs and test green
  - Stop / reassessment: docs contradict shipped behavior

- [x] AC-4: Repair manual Project remove of an exact base tool (final verification round 1 FAIL)
  - Outcome: `x` in Project scope accepts a pattern already present in base entries; validation of manual overlay patterns is independent of immutable base tools
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/tools-panel/panel.ts (~L493-500), test/tools-panel/panel.test.ts
  - Inputs: Oracle FAIL evidence E7
  - Dependencies: none
  - Output: fix plus regression x → read with base ['read']
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/tools-panel/*, test/tools-panel/*
  - Interface boundaries: overlay draft model
  - Focused check and PASS evidence: tools-panel tests pass
  - Return milestone: regression green
  - Stop / reassessment: none
- [x] AC-6: Repair conversion equivalence to include orchestrator controls (final verification round 1 FAIL)
  - Outcome: guards (b)/(c) compare effective selection including enabled/disabled `ask_orchestrator`/`notify_orchestrator` injection and their `disallowed_tools` denials; conversions changing control availability are refused
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/tools-panel/config.ts (~L383-405), src/runner/sdk-runner.ts (~L100-110), test/tools-panel/conversion.test.ts
  - Inputs: Oracle FAIL evidence E8
  - Dependencies: none
  - Output: fix plus ask/notify denial regressions
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/tools-panel/*, test/tools-panel/*, minimal shared helper export in src/runner or src/tool-patterns if needed
  - Interface boundaries: runtime injection semantics unchanged
  - Focused check and PASS evidence: conversion and runner tests pass
  - Return milestone: regressions green
  - Stop / reassessment: injection config unavailable to the panel
- [x] AC-1: Repair config-host-runtime isolated fixture for the new debug import (final verification round 1 FAIL)
  - Outcome: test/config-host-runtime.test.ts passes without weakening SDK/YAML isolation
  - Known entrypoints and skill paths: pi-packages/pi-subagents/test/config-host-runtime.test.ts (~L18-34), src/config.ts:9
  - Inputs: Oracle FAIL evidence E9
  - Dependencies: none
  - Output: fixture or import fix
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/test/config-host-runtime.test.ts and/or src/config.ts
  - Interface boundaries: host-runtime isolation contract
  - Focused check and PASS evidence: both host-runtime tests pass
  - Return milestone: tests green
  - Stop / reassessment: isolation requires dropping the debug diagnostic
- [x] AC-6: Revalidate full resolution before conversion mutation (final verification round 2 FAIL)
  - Outcome: conversion re-resolves the current definition winners (all global and project sources), effective config flags and overlay immediately before writing; any change from the prepared plan refuses as stale
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/tools-panel/config.ts (~L354-415,444-473), test/tools-panel/conversion.test.ts
  - Inputs: Oracle round 2 evidence E6
  - Dependencies: none
  - Output: fix plus agents-to-subagents global precedence regression
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/tools-panel/*, test/tools-panel/*
  - Interface boundaries: conversion prepare/execute API
  - Focused check and PASS evidence: conversion tests pass
  - Return milestone: regression green
  - Stop / reassessment: none
- [x] AC-4: Validate only the new manual candidate (final verification round 2 FAIL)
  - Outcome: adding a distinct manual pattern succeeds while untouched existing lane entries (including duplicates) remain unchanged
  - Known entrypoints and skill paths: pi-packages/pi-subagents/src/tools-panel/panel.ts (~L495-503), test/tools-panel/panel.test.ts
  - Inputs: Oracle round 2 evidence E7
  - Dependencies: none
  - Output: fix plus regression add=['future*','future*'] then a new* appends
  - Owner: thoth-worker
  - Writes: pi-packages/pi-subagents/src/tools-panel/*, test/tools-panel/*
  - Interface boundaries: overlay draft model
  - Focused check and PASS evidence: panel tests pass
  - Return milestone: regression green
  - Stop / reassessment: none

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review round 3 OKAY (fresh Oracle, record sha256 185cd544f0a9eea8cae6e55f86a2c0c710a5ee50e10f472621e91c5e7622a94e); rounds 1-2 REJECT repaired in this record.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: a25dc5228e90977d7ba81f00b8e4fb88ff41b71785686a3099e511e49f71a8c7

Final verification round 3 (fresh Oracle) PASS; rounds 1-2 FAIL repaired via the repair task rows.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1 through AC-7 and both durable deltas are satisfied. The prior blocking regressions are repaired; no remaining acceptance-blocking defect was found.",
  "evidence": [
    {
      "id": "E1",
      "kind": "inspection",
      "locator": "git status; full git diff; all untracked files",
      "claim": "Reviewed all 23 uncommitted files. No staged changes or unrelated additions were found. Input hashes remained unchanged throughout verification.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "test",
      "locator": "pi-packages/pi-subagents: vitest run covering four test/config*.test.ts files, test/runner/tool-selectors-real-sdk.test.ts and test/tools-panel/",
      "claim": "Fresh run: 548 tests passed across 10 files, including previous failure regressions and conversion dependency revalidation.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "probe",
      "locator": "Independent in-memory execution of tool-patterns.ts, parseToolOverlay and createToolsPanel",
      "claim": "Six runtime selection cases passed. Additional probes confirmed invalid-entry diagnostics, duplicate-preserving manual additions, exact-base removals and overlay-only Project save payloads.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "inspection",
      "locator": "pi-packages/pi-subagents/src/tools-panel/{config,panel,frontmatter,write}.ts",
      "claim": "Reviewed lossless drafts, scope routing, atomic/stale-checked writes, Global-to-Project baseline propagation, conversion equivalence, current-winner re-resolution, inventory checks and partial-state reporting.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "test",
      "locator": "pnpm exec vitest run src/cli/pi-resources.test.ts; four changed documentation surfaces",
      "claim": "Fresh root run: 60 tests passed. Required documentation explains schema, composition, scopes and conversion; the shadow diagnostic recommends overlays.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "check",
      "locator": "pnpm run typecheck; pi-subagents pnpm run typecheck; pnpm run check:ci; git diff --check",
      "claim": "All exited successfully. Biome reported 784 warnings and 10 infos, with no errors.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "build",
      "locator": "pnpm run build",
      "claim": "Full build succeeded, including declarations, schema generation and Pi extension bundles. No additional working-tree drift resulted.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "digest",
      "locator": "Change record and canonical Source files; thoth-sdd validate.mjs --through verify",
      "claim": "Verify gate passed. Canonical digests match Source lines: pi-ecosystem=3ea11d7c9032e6b1e73c7bd49b62fb8e58bddea56fced530a24e0e056ff9a1a7; multi-harness-agent-pack=3716a8d1f5df7edf35bad2c2ea639a8524394dd41f211df962985322074ad8c4. Exact pre-Authorization record bytes hash to the reviewed digest.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Inspect project-only parser and run config/host-runtime tests plus malformed-entry probes.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E3"],
      "reason": "Valid overlays attach after definition resolution; malformed entries are ignored diagnostically; global and ancestor overlays do not apply."
    },
    {
      "check": "AC-2",
      "method": "Inspect shared selection resolver; run real-SDK selector tests and six independent selection cases.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3"],
      "reason": "Expansion/removal ordering, exclusions, missing-exact reporting, silent unmatched globs, injected controls and empty-selection failure are preserved."
    },
    {
      "check": "AC-3",
      "method": "Run scope snapshot, panel rendering/key and command tests.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4"],
      "reason": "Visible scope switching and presence/shadow-based initial scope work."
    },
    {
      "check": "AC-4",
      "method": "Inspect persistence and run lossless editing, toggle, manual-entry, reset, creation, pruning and stale-input tests.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4"],
      "reason": "Project edits preserve untouched entries and unrelated JSON, avoid Markdown writes, and reject stale configuration/base inputs. Both manual-entry regressions are repaired."
    },
    {
      "check": "AC-5",
      "method": "Run shadowed Global-target and changed-precedence tests; inspect warning and baseline propagation.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4"],
      "reason": "Global saves target the global definition without replacing project copies and display the shadow warning."
    },
    {
      "check": "AC-6",
      "method": "Inspect conversion prepare/execute paths and run confirmation, equivalence, stale-dependency and failure-recovery tests.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4"],
      "reason": "Conversion includes control injection in equivalence, re-resolves current winners/configuration/inventory before mutation, lists lost differences, writes overlay first and retires recoverably."
    },
    {
      "check": "AC-7",
      "method": "Review all four required documentation diffs and run root pi-resources tests.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E5"],
      "reason": "Documentation and the project-shadow recommendation match the implemented contract."
    },
    {
      "check": "Decisions and both durable deltas",
      "method": "Compare the complete diff and checks against the settled decisions and normative statements.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E4", "E5", "E8"],
      "reason": "Project-only composition, native controls, scoped persistence and explicit selection-equivalent conversion satisfy the declared changes."
    },
    {
      "check": "Static validation and build",
      "method": "Run root/package typechecks, check:ci, diff whitespace check and full build.",
      "outcome": "pass",
      "evidenceIds": ["E6", "E7"],
      "reason": "Every requested command completed successfully."
    },
    {
      "check": "Source freshness and record binding",
      "method": "Calculate exact-byte SHA-256 values before and after verification.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E8"],
      "reason": "Canonical Source entries match and reviewed inputs remained frozen."
    }
  ],
  "risks": [
    {
      "description": "Nonblocking caution: check:ci succeeds but is not warning-free (784 warnings and 10 infos).",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E6"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should record this PASS and unchanged envelope, run closeout, then archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-subagents-project-tool-overlay/pi-subagents-project-tool-overlay.md",
    "reviewedRecordSha256": "a25dc5228e90977d7ba81f00b8e4fb88ff41b71785686a3099e511e49f71a8c7"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | config*.test.ts incl. config-host-runtime + config-tool-overlay | Oracle E2/E3, 344 tests
- AC-2: PASS | runner/tool-selectors-real-sdk.test.ts + resolver comparison | Oracle E2/E3
- AC-3: PASS | tools-panel scope/command tests | Oracle E2/E4
- AC-4: PASS | tools-panel lossless editing/manual-entry/stale tests | Oracle E2/E3/E4
- AC-5: PASS | tools-panel global-target/precedence tests | Oracle E2/E4
- AC-6: PASS | tools-panel conversion tests (guards, stale re-resolution, recovery) | Oracle E2/E4
- AC-7: PASS | src/cli/pi-resources.test.ts (60) + doc review | Oracle E5
- Source: .thoth/specs/pi-ecosystem/spec.md | sha256:3ea11d7c9032e6b1e73c7bd49b62fb8e58bddea56fced530a24e0e056ff9a1a7
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:3716a8d1f5df7edf35bad2c2ea639a8524394dd41f211df962985322074ad8c4

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
