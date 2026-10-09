# Change: pi-specialist-tools-panel

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- User requested `/thoth-agents:tools`, analogous to the model/effort panel, to choose tools provided by the user's own Pi environment, including MCPs. Explicit lists were restored from commit 54db74b and merged at fe4bc1d; a real Worker read/bash smoke passed after user reinstall/reload.
- Explorer task subtask_thoth-explorer_1790649869695_787c7a71 inspected the current integration read-only. `src/pi.ts` registers the models command; `src/pi/models-panel.ts` owns its draft/save/cancel UI.
- `src/cli/pi-model-config.ts` provides attributable global-agent snapshots, path and stale-content validation, preflight and recoverable partial writes through `src/cli/pi-managed-write.ts`. Model saves change model/effort only and already preserve other frontmatter. No separate configuration store is needed.
- `src/cli/pi-resources.ts::preserveOverrides` currently preserves model/effort but replaces tools/mode during synchronization. Session start, install and sync share this path.
- `src/harness/writers/pi-agent.ts` generates role defaults. The default list should be reusable for reset, not a fixed inventory of selectable user tools.
- Pi 0.87.1 ExtensionAPI offers `getAllTools()` and `getActiveTools()` on `pi`, not command context. j0k3r's wildcard lookup incorrectly probes `getTools()`; explicit names bypass this. An empty list falls back to defaults, not zero tools. Unregistered exact names may be ignored by the child registry.
- Global AGENTS/context loading is explicitly out of scope. Keep lean isolation; root passes relevant instructions in dispatch context.

## Intent

Provide a native, global specialist-tool configuration panel with explicit persisted names, discoverable user extension/MCP tools and safe synchronization. Preserve the existing model panel, all five specialists, unrelated configuration and other harnesses.

## Non-goals

- No wildcard or automatic future-tool inheritance; no j0k3r fork, patch, installation or scheduler.
- No widget, Atelier, AGENTS loading, model/effort redesign, project-local override UI, credentials or package version changes.
- Do not claim that a tool name in frontmatter guarantees child initialization, provider authentication or runtime execution.
- Do not silently install/reload the user's Pi package or alter their actual global agent selections during tests.

## Acceptance

- AC-1: `/thoth-agents:tools` opens a native panel for exactly five specialists in interactive Pi; unavailable UI/discovery yields actionable feedback without writes. Discover tools anew on each open through public Pi APIs, not a hardcoded user inventory.
- AC-2: Support keyboard multiselect, explicit save/cancel, discard protection for dirty drafts, select-all-current-active tools, and restore current role defaults. Registered inactive tools are individually selectable and clearly marked; saved unavailable names remain visible and are not silently removed. Long lists/narrow terminals remain navigable.
- AC-3: Persist nonempty explicit unique tool names only. Reject wildcards and native `subagent_*` delegation tools; preserve existing root-only question/progress-tool restrictions. Saved unregistered names can be retained or explicitly removed, not invented via free-form entry. A new tool appears on the next panel open but is never automatically selected. Successful changes apply to subsequent child launches, not running children.
- AC-4: Reuse global managed-file ownership, safe-path, stale-snapshot and preflight checks. Save preserves model, effort, subagent_mode, instructions and unrelated frontmatter; cancel makes no writes. Partial writes are reported honestly with changed roles and a recoverable refreshed snapshot; never claim transaction-wide rollback.
- AC-5: Explicit operator tools and valid subagent_mode survive synchronization/reinstallation and model-panel saves. Missing fields acquire canonical defaults. Malformed/ambiguous fields fail safely without silently reverting to broad defaults. Repeated sync is idempotent.
- AC-6: Role-default extraction leaves generated defaults unchanged. Other harnesses, root lifecycle isolation, configured model/effort including max, and existing models panel remain unaffected. Focused tests, typecheck, build and relevant package/integration checks pass or limitations are explicitly reported.
- AC-7: Public/routed documentation explains discovery, active/inactive/unavailable states, global scope, save/reset semantics, subsequent-launch effect and lack of automatic inheritance/OS sandboxing. A controlled real Pi smoke verifies save/reopen and execution of a selected extension/MCP tool where the host permits it; unexecuted live checks remain unverified, not PASS.

## Clarifications

- RESOLVED: User approved explicit selection and select-all-current rather than automatic inheritance.
- RESOLVED: User explicitly selected allowing registered inactive tools when clearly identified; select-all remains active-only.
- RESOLVED: User agreed that root transmits applicable AGENTS instructions; no context-loading change is requested.
- RESOLVED: Scope matches the existing global models command. Empty selection is rejected because the current runtime would substitute defaults.

## Decisions

- Keep existing owned global agent markdown as the source of truth. Do not add another persistent settings file or j0k3r override store.
- After three parser-review rounds, the user explicitly selected a structured YAML parser instead of further regex recognition patches. Re-exploration confirmed yaml 2.9.0 already exists transitively in the lockfile; declare that exact version directly. Use its document AST and duplicate-key validation for semantic recognition, including quoted/escaped and explicit mapping keys. Preserve unrelated source bytes using parsed ranges when editing tools; reject malformed/ambiguous or unsupported alias/merge/tag structures safely rather than treating settings as absent. This is an authorized same-intent AC-5 architecture correction; classification remains coordinated/substantial with medium risk.
- Separate tools-panel state machine from model/effort UI; reuse existing native Pi UI conventions and managed persistence primitives without broad refactoring.
- Inventory snapshots belong to panel opens; tool availability is informational, not evidence of successful child execution. Retain unavailable saved selections visibly.
- Keep existing child restrictions on delegation and root-only interactive/progress controls. No OS sandbox or arbitrary-agent-depth enforcement claim.
- Use installed TDD and simplify skills. Tests target the public config operations, panel input/render contract, sync and command registration boundaries. Do not test private helpers merely to match implementation.
- This is substantial due to global persistence/recovery and coordinated UI/synchronization contracts, not file count. Root owns this record and acceptance; specialists own bounded implementation; a fresh Oracle owns final judgment.

## Durable deltas

- `ADDED multi-harness-agent-pack` **Configure Pi specialist tools explicitly** — The Pi package MUST expose `/thoth-agents:tools` for the five canonical specialists, discover user tools through native Pi APIs and persist nonempty explicit selections in attributable global definitions. It MUST support save/cancel, role-default reset, active-only select-all, explicitly selectable marked inactive tools and visible retained unavailable selections; MUST reject wildcards, native child-delegation tools and existing root-only controls; MUST preserve model/effort/mode and safe recoverable writes; MUST preserve valid explicit tools/modes across sync and reinstall; and MUST not claim automatic future inheritance or runtime availability from names alone.
  - GIVEN an owned specialist and active, inactive and saved unavailable tools; WHEN the user saves a selection and later synchronizes or edits its model; THEN the explicit selection and unrelated settings remain intact, newly registered tools are not automatically selected, and cancelled or invalid drafts do not mutate configuration.

## Plan

1. Backend unit: add tool snapshot/read/save operations alongside model configuration using existing ownership/safe-write primitives. Replace manual semantic-key/list recognition with yaml 2.9.0 parseDocument AST validation; require unique string mapping keys and a valid document, validate tools/mode value types, and preserve original text outside the edited tools value through source ranges. Do not serialize unrelated frontmatter. Retain all data-preservation regression variants; valid quoted/escaped/explicit semantic keys must either be interpreted correctly or conservatively refused, never appear absent. Root owns dependency manifest/lock edits; Worker owns parser/config/sync regressions. Extract canonical role tools for reset and writer reuse. Extend synchronization to preserve validated tools/mode overrides. Publish a small typed snapshot/save-result contract for the UI; use the existing partial-recovery semantics. Stop and return if the current parser cannot preserve legitimate frontmatter safely without a material redesign.
2. UI/integration unit: after root accepts the backend contract, implement a separate tools multiselect panel and wire `thoth-agents:tools` in `src/pi.ts`. The native API builds a deduplicated inventory with active status; reserved tool exclusions are shared with backend validation. Preserve selection across role navigation and filtering, expose unavailable choices and show exact save/retry/error behavior. Do not activate/deactivate tools on the parent as a side effect of selection.
3. Documentation/verification: root updates only routed/public command guidance and executes final checks after writers terminate. Fresh Oracle reviews agreement, actual diff and check evidence. Live installed-host smoke is distinct from automated tests; request the operator's required install/reload instead of performing it silently. Archive only after fresh independent PASS and completed acceptance.

Ownership and dependencies:
- Worker owns `src/cli/pi-tool-config.ts` and tests (new), minimal safe reuse additions to `src/cli/pi-model-config.ts`/tests and `src/cli/pi-managed-write.ts` only if justified, `src/cli/pi-resources.ts`/tests, and `src/harness/writers/pi-agent.ts`/tests for shared defaults. No edits to UI/extension/docs/record.
- Designer owns `src/pi/tools-panel.ts`/tests (new) and the tools-command wiring/tests in `src/pi.ts` and `src/pi.test.ts` (or the existing extension-test path identified before edits). Depends on accepted backend API and defaults; reads model panel conventions but does not modify them unless a concrete shared-host incompatibility is returned to root.
- Root owns this record and command documentation in README/public Pi installation docs and `docs/agent/harness-packaging.md`. Root will not edit active writer surfaces. Both units use the same workspace and native runtime, with sequential dependency rather than competing writers. No worktree automation, commits, installs or push are implied by feature implementation.
- Final read-only Oracle is fresh, owns no writes and sees stable inputs. The earlier Explorer is terminal and is not reused for implementation or independent approval.

Verification strategy:
- Backend red/green tests cover inline/multiline lists, invalid and duplicate fields, blank/wildcard/reserved names, role reset, saved unavailable names, ownership/symlink/stale rejection, partial-write retry and untouched model/effort/mode/body.
- Panel red/green tests cover five roles, multiselect, active-only select-all, inactive/unavailable labels, reset, scrolling/narrow viewport, cancel/discard, errors and recovery. Extension tests assert command registration, public `pi` discovery, no-UI behavior and save handoff.
- Sync tests exercise changed package defaults, explicit customized tools/mode/model/effort, absent/malformed fields, idempotence and model-panel round trips; isolated temp Pi homes only.
- Final checks: source-scoped Biome, `pnpm run typecheck`, `pnpm run build`, focused configuration/UI/extension/integration tests and `pnpm run verify:pi-package`. Full suite where practical; known `.pi/tasks` telemetry formatting and inherited CODEX_HOME are environmental, not permission to alter unrelated files or user's configuration.

## Tasks

- [ ] AC-1: Designer wires native command and fresh API discovery after accepted backend contract; test registration and unavailable UI/API handling.
- [ ] AC-2: Designer implements and tests role navigation, multiselect, active-only select-all, reset, marked inactive/unavailable entries and dirty cancel.
- [ ] AC-3: Worker implements explicit-name validation and shared role defaults; Designer applies the same rules to drafts; test blank/wildcard/reserved rejection and inventory refresh.
- [ ] AC-4: Worker implements and tests owned global snapshot/save, unrelated-field preservation, stale/unsafe rejection and partial-write recovery.
- [ ] AC-5: Worker preserves validated tool/mode overrides through sync and model saves; test default changes, absent/malformed fields and idempotence.
- [ ] AC-6: Root verifies accepted writer results with focused tests, Biome, typecheck, build and package checks; fresh Oracle reviews stable actual diff and evidence.
- [ ] AC-7: Root updates routed/public docs and coordinates real installed-host panel and selected extension/MCP execution checks before final acceptance.

## Authorization

**Plan review**: OKAY

Fresh Oracle task `subtask_thoth-oracle_1790650882083_e2fe759e` returned [OKAY] with no execution blockers and independently validated ready. The additive spec-title overlap warning was reviewed and accepted. Implementation must leave malformed/legacy wildcard definitions untouched with diagnostics, use actual native API types, and keep unexecuted live smoke checks unverified.
**Implementation**: AUTHORIZED

User explicitly selected Implement (Recommended) after the fresh Oracle [OKAY]. Global installation/reload, commits and push are not included in this authorization.

## Verification

Integration checkpoint: Designer retry `subtask_thoth-designer_1790652554333_f71efab5` completed panel/command implementation after the initial instance was confirmed cancelled. The user-authorized temporary global `antigravity` tool was restored to the prior explicit tools list after termination; configured model/effort stayed unchanged. Root task `b904b2ac9` passed source-scoped Biome, typecheck, build, all 1092 tests and isolated Pi package verification. Root then added two focused regression cases: absent role defaults must remain visible/removable after reset; select-all adds active names without dropping existing inactive/unavailable choices. Both were observed failing before minimal fixes. UI eligibility now reuses backend validation rather than duplicating the rules. The updated 39 panel/command/model/extension tests and focused Biome pass. Final root task `be3e15e12` passed typecheck, build, all 1094 tests across 101 files, isolated `verify:pi-package` and `git diff --check`. Source Biome was green before and after the focused UI fixes. These were intermediate checkpoints; the final structured-parser review and fresh checks below supersede them. Real host panel/selected-MCP execution has not been performed and prevents full acceptance/archive.

Implementation checkpoint: Worker task `subtask_thoth-worker_1790650992439_afbc9408` failed at the 1200000ms runtime ceiling. Native status reports failed. Root inspected the installed manager timeout path: it aborts the controller, waits for active runner settlement, then finalizes failure; replacement work was withheld until termination was confirmed. Partial owned edits are preserved, including new `pi-tool-config.ts` and tests, managed-write preflight protection, model-config ownership reuse, sync preservation and shared defaults. The worker provided no completed verification report; root subsequently recovered and verified the partial backend. Root recovery task `b48ea4578` passed 28 tests across tool config, model config, resources and writer, plus `tsc --noEmit`. Root inspected the new snapshot/save API and localized existing-file diffs; the backend contract is accepted for UI integration, with final semantic review still required. No execution transcript was reread and worker red-test provenance is not claimed. Exported contract: readPiToolConfig(piRoot, roles?), savePiToolConfig(snapshot, roleInputs) -> {success, changedRoles, snapshot, error?}; roles carry role/tools/defaultTools. validatePiSpecialistTools rejects invalid explicit selections. UI integration was subsequently completed by the terminal Designer retry described above.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PENDING

**Code-review verdict**: PASS — fresh Oracle `subtask_thoth-oracle_1790656413639_0793d2e2` found no remaining code blockers and approved operator smoke. It independently passed nine in-memory parser/edit checks, including CRLF and unrelated-byte preservation, inspected the integrated diff and confirmed the canonical spec digest. Overall acceptance remains incomplete solely for the live panel/save-reopen/selected extension-MCP gate; this is not archive approval.

Review history (earlier rejections below are resolved by the final structured-parser implementation and fresh code-review PASS):

Fresh implementation reviewer `subtask_thoth-oracle_1790653620028_4bef9fd0` found one AC-5 data-preservation blocker: quoted semantic tools/mode keys, quoted duplicates and indented continuations after scalar tools can be treated as absent or accepted by the regex parser. Read-only reproductions showed quoted tools producing an empty override and mixed duplicate spellings being accepted. Same-intent repair must reject unsupported/ambiguous malformed forms, preserve affected files byte-for-byte with diagnostics, and prevent a save from adding duplicate semantic keys. Correction Worker `subtask_thoth-worker_1790653732662_e3acc01a` completed only the three owned parser/config/sync test files. It reported 13 red regression failures before the fix and 40/40 focused tests plus source Biome passing afterward. Shared parsing now guards quoted/whitespace-varied semantic keys, duplicate fields, invalid continuations and caller-supplied save snapshots. Root consolidation `b4c27767d` caught a flatMap literal-inference type error, corrected by an explicit FrontmatterFieldLine generic. Recheck `bbf9bed41` passed 1108 tests, typecheck, build and package verification. Fresh Oracle `subtask_thoth-oracle_1790654441966_aaeed310` still rejected AC-5: column-zero comments truncated list scanning or bypassed scalar-continuation checks; escaped quoted semantic keys could appear absent. Correction Worker `subtask_thoth-worker_1790654533126_d45bcd03` reported 14 red regressions then 54 green focused tests, typecheck and source Biome. Parsing and replacement now consistently skip blank/comment lines; quoted semantic keys are decoded, and unsupported quoted escapes fail closed. Root consolidation `bb26c72de` passed 1127 tests, build and package verification. Fresh Oracle `subtask_thoth-oracle_1790655183858_dbcdea40` confirmed earlier fixes but found unsupported YAML explicit mapping keys (`? tools` / `: read`, including duplicate forms) still treated as absent. Root stopped accumulating regex patches and reopened architecture with the user, who selected structured YAML parsing. Installed dependency inspection found yaml 2.9.0 already transitively available; Context7 /eemeli/yaml and installed dist/options.d.ts confirm parseDocument, strict/uniqueKeys and source-token options. Root offline dependency task `b45d592f8` succeeded with no downloads; manifest/lock diff only declares the existing yaml 2.9.0 version directly. Worker `subtask_thoth-worker_1790655451352_b53700c1` replaced the manual tools/mode parser with AST recognition and source-range edits. Explicit semantic mapping regression was red first, then 64 focused tests, typecheck and source Biome passed. Quoted/escaped/explicit mapping keys are recognized; semantic duplicates reject. Aliases, anchors, merge keys, tags, non-mapping documents and unsafe flow-map insertion fail closed. Root full consolidation `bd64c6177` passed build, all 1130 tests across 101 files, isolated package verification and diff check. The fresh independent code-review PASS above followed this frozen-input result. The separate live panel/MCP gate remains unverified.
**Reviewed record SHA-256**: 8895822d880149977654172f950512dfd7521b1efac6ad52502e5a7c5249c537

This digest binds the unchanged plan prefix inspected for the code review; it does not complete the live acceptance gate.

- AC-1: PASS | tools-command tests and isolated package verification | native registration/discovery/no-UI paths pass in the 1130-test run and verified package load.
- AC-2: PENDING | tools-panel component tests pass | multiselect/reset/inactive/unavailable/cancel/width behavior covered; operator interactive observation remains to be collected.
- AC-3: PASS | tool-config and panel selection tests | explicit names, nonempty/duplicate/reserved/wildcard validation and inventory behavior pass.
- AC-4: PASS | persistence/recovery and AST source-range regressions | ownership/stale/unsafe path/partial retry and unrelated-byte preservation pass; independent nine-case review reproduction passed.
- AC-5: PASS | synchronization/model-save and malformed YAML regressions | valid overrides retained, malformed/ambiguous forms preserved with diagnostics, structured semantic-key cases covered.
- AC-6: PASS | final build/full suite/typecheck/Biome/package/diff checks | 1130 tests across 101 files pass; fresh independent code-review PASS.
- AC-7: PENDING | README, installation and routed docs updated | actual operator save/reopen and child execution of a selected extension/MCP tool remain unverified.
- Source: .thoth/specs/multi-harness-agent-pack/spec.md | sha256:d271e4cb5556d60c5d7bef39233cac692558f0a698eae1246cc1471cc0959f03
- Source: src/cli/pi-tool-config.ts | sha256:c8b8607a83ed8fc1bcf55781f28540636f0f74c3fccc7e4c6d30985f9a238402
- Source: src/cli/pi-resources.ts | sha256:9868bac2bea469b4a106af2284244cb6a83fab759f54b2ad5167f40100002637
- Source: src/pi/tools-panel.ts | sha256:04a18e2ee5d0942145d1f89b59616ede8ef2ad958fab2084d258fd511e11557f
- Source: src/pi.ts | sha256:29b22bda782ff9185709254ac2065129bccbced2f3c89a7dc87d49792086440d
- Source: package.json | sha256:b9cc1c27b875b5dbf58c18cb587b0b2ec97fb1b60c9fcb8873800edc0f572bba
- Source: pnpm-lock.yaml | sha256:bdbc82fb00f8d0ee4866e48172822dea12126817cf185ab5bf00cb68d7c414cc

## Closeout

**Archive**: PENDING
