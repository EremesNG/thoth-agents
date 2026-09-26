# Tasks: Pi Harness Integration

## Authoring contract

Task identifiers are stable and sequential. Each implementation task has one
primary mutable path and a concrete verification outcome; test tasks precede the
behavior they specify.

## MVP scope

US1 is the MVP: from an isolated default Pi home, dry-run and apply must produce
one complete global installation with four pinned packages, one managed root
block, six specialist definitions, nine skills, the exact grep.app entry,
provider setup evidence, and a Pi ledger record only after complete success.

## Dependencies

`T001 -> T003 -> T012 -> T004`; `T002 -> T005 -> T006`; `T007 -> T010`;
`T008 -> T011`; `T009 -> T012`; `T010 -> T011 -> T012 -> T013`;
`T014 -> T019`; `T015 -> T020`; `T016 -> T021`; `T017 -> T023`;
`T018 -> T024`; `T019 -> T020 -> T026`; `T021 -> T026`; `T022 -> T026`;
`T023 -> T026`; `T024 -> T026`; `T025 -> T026`; `T027 -> T032`;
`T028 -> T033`; `T029 -> T034`; `T030 -> T036`; `T031 -> T035`;
`T032 -> T033 -> T034 -> T035 -> T036`; `T037 -> T038`; `T039 -> T041`;
`T012 -> T040`; all implementation and migration tasks precede `T049` through
`T052`.

## Shared harness foundation

- [x] T001 Add failing fourth-harness/default/unsupported assertions for FR-001 and SC-001 in `src/harness/registry.test.ts` | Verify: the test expects Pi resolution and unchanged OpenCode default before registry implementation
- [x] T002 Add failing Pi install and operation argument cases for FR-001, FR-014, and SC-001 in `src/cli/parser.test.ts` | Verify: parser tests distinguish Pi from unknown harnesses without fallback
- [x] T003 Extend the exhaustive harness type with Pi for FR-001 in `src/harness/types.ts` | Verify: TypeScript exposes exactly OpenCode, Codex, Claude, and Pi harness identifiers
- [x] T004 Register the Pi adapter while preserving OpenCode default and explicit unsupported diagnostics for FR-001 and SC-001 in `src/harness/registry.ts` | Verify: T001 passes and supported-harness order is deterministic
- [x] T005 Extend install/operation argument contracts with Pi while keeping generated plugin targets bounded for FR-001 and FR-014 in `src/cli/types.ts` | Verify: Pi is accepted only where a native runtime operation exists
- [x] T006 Parse and describe Pi install/status/list/update/sync/model selection for FR-001, FR-014, and SC-001 in `src/cli/parser.ts` | Verify: T002 passes and invalid harness input retains the existing error path

## Story US2 — Delegate through Pi-native subagents

- [x] T007 [US2] Add failing Pi dialect assertions for exact role selection, lifecycle translation, fan-in barriers, and conditional continuation/steering covering FR-005, FR-006, FR-007, and SC-004 in `src/agents/prompt-dialects.test.ts` | Verify: tests reject batch delegation, orchestrator children, and queued/nonterminal completion claims
- [x] T008 [US2] Add failing renderer assertions for one root block and exactly six owned specialist definitions covering FR-002, FR-003, FR-006, FR-008, and SC-003 in `src/harness/writers/pi-agent.test.ts` | Verify: expected paths, frontmatter names, tool allowlists, ownership markers, and deterministic content are asserted
- [x] T009 [US2] Add failing Pi capability and diagnostic assertions covering FR-004, FR-007, FR-008, FR-020, and SC-004 in `src/harness/adapters/pi.test.ts` | Verify: native, adapter-backed, conditional, provider-dependent, instruction-only, and unsupported states are distinct
- [x] T010 [US2] Implement the Pi prompt dialect and public subagent lifecycle vocabulary for FR-005, FR-006, and FR-007 in `src/agents/prompt-dialects.ts` | Verify: T007 passes with no OpenCode, Codex, or Claude prompt snapshot changes
- [x] T011 [US2] Render the managed root block and six canonical specialist Markdown definitions for FR-002, FR-003, FR-006, FR-008, and SC-003 in `src/harness/writers/pi-agent.ts` | Verify: T008 passes and repeated rendering is byte-identical
- [x] T012 [US2] Implement the Pi adapter capability matrix, rendering composition, and truthful diagnostics for FR-002, FR-004, FR-007, FR-008, and FR-020 in `src/harness/adapters/pi.ts` | Verify: T009 passes and no thoth-owned executor, task store, or root child is emitted
- [x] T013 [US2] Extend cross-harness prompt regression coverage for the Pi root/specialist contract and SC-004 in `src/agents/prompt-rendering.test.ts` | Verify: all four dialects render independently and existing harness output remains unchanged

## Story US1 — Install the complete Pi agent pack

- [x] T014 [US1] Add failing default/custom Pi path, XDG MCP path, project-shadowing, and skills-destination cases for FR-016 and FR-017 in `src/cli/pi-paths.test.ts` | Verify: the test identifies the supported default root and blocks mismatched custom roots before mutation
- [x] T015 [US1] Add failing ordered plan/apply tests for packages, managed files, grep merge, conflicts, backups, dry-run, partial failure, and provider states covering FR-003, FR-004, FR-009, FR-020, SC-002, and SC-005 in `src/cli/pi-install.test.ts` | Verify: every injected required-step failure leaves the ledger ineligible and dry-run causes zero mutations
- [x] T016 [US1] Add failing Pi external-skill command cases for FR-015, FR-016, and SC-005 in `src/cli/skills.test.ts` | Verify: each canonical skill expects the Pi selector, global scope, confirmation, and copied materialization
- [x] T017 [US1] Add failing provider-owned Pi setup and contradictory-evidence cases for FR-010 and SC-005 in `src/cli/thoth-mem-install.test.ts` | Verify: apply and dry-run expect the exact Pi selector and only consistent complete evidence succeeds
- [x] T018 [US1] Add failing schema-v1 Pi record, preservation, invalid-state, and no-advance cases for FR-012 and FR-013 in `src/cli/install-ledger.test.ts` | Verify: existing harness records survive and Pi appears only after explicit completion
- [x] T019 [US1] Implement deterministic Pi/global-MCP path and shadowing resolution for FR-016 and FR-017 in `src/cli/pi-paths.ts` | Verify: T014 passes on Windows and POSIX-shaped fixtures without reading the real home
- [x] T020 [US1] Implement pure Pi preflight/build/format/apply seams, pinned package verification, managed root/agents, exact grep merge, backups, and independent research states for FR-003, FR-004, FR-009, FR-020, SC-002, and SC-005 in `src/cli/pi-install.ts` | Verify: T015 passes with injected command and filesystem boundaries
- [x] T021 [US1] Add Pi to the canonical external-skill installer contract for FR-015 and FR-016 in `src/cli/skills.ts` | Verify: T016 passes and commands for the other three harnesses remain byte-equivalent
- [x] T022 [US1] Synchronize the five packaged thoth-owned skills into the Pi global root for FR-003 and FR-017 in `src/cli/owned-skills.ts` | Verify: isolated fixtures contain exactly the five owned skills and preserve unrelated directories on repeat sync
- [x] T023 [US1] Accept Pi in provider setup command construction and evidence validation for FR-010 in `src/cli/thoth-mem-install.ts` | Verify: T017 passes and dry-run adds only the provider `--plan` flag
- [x] T024 [US1] Allow and atomically retain the Pi completion record in schema version 1 for FR-012 and FR-013 in `src/cli/install-ledger.ts` | Verify: T018 passes including repair backup and previous-record preservation
- [x] T025 [US1] Add failing top-level Pi install orchestration cases for preflight, ordered delegation/research packages, owned surfaces, external skills, provider evidence, dry-run, and ledger gating covering FR-009, FR-010, FR-012, FR-015, FR-017, SC-002, and SC-005 in `src/cli/install.test.ts` | Verify: tests require the dedicated Pi branch and fail before the orchestrator is implemented
- [x] T026 [US1] Route Pi install through preflight, packages, owned surfaces, external skills, provider setup, and final ledger sequencing for FR-009, FR-010, FR-012, FR-015, FR-017, SC-002, and SC-005 in `src/cli/install.ts` | Verify: T025 passes with complete order, exact dry-run preview, and fail-closed completion

## Story US3 — Operate and diagnose Pi safely

- [x] T027 [US3] Add failing Pi Install/Status/Update/Sync/Model plans for healthy, stale, partial, shadowed, credential-required, unreachable, and conflicting states covering FR-007, FR-011, FR-013, FR-014, FR-020, and SC-005 in `src/cli/operations/pi.test.ts` | Verify: tests require installation-equivalent Install/Update while keeping managed state, runtime provider state, and ledger authority separate
- [x] T028 [US3] Add failing Pi operation-registry selection and unknown-harness cases for FR-001, FR-014, and SC-001 in `src/cli/operations/index.test.ts` | Verify: registry returns the Pi adapter and never falls through to another harness
- [x] T029 [US3] Add failing CLI output/dispatch cases for Pi Install, status, update, sync, and disabled root-model actions covering FR-011 and FR-014 in `src/cli/commands.test.ts` | Verify: output names Pi-owned targets and explicit unsupported/conditional actions
- [x] T030 [US3] Add failing TUI harness-selection and status presentation cases for FR-014 and SC-001 in `src/cli/tui/App.test.tsx` | Verify: Pi appears as a fourth selectable harness with no changed default
- [x] T031 [US3] Add failing TUI operation dispatch/preview/apply cases for Pi Install, Update, Sync, and Model covering FR-011 and FR-014 in `src/cli/tui/operations.test.ts` | Verify: Pi Install and Update consume the complete plan instead of the Codex branch and Sync remains bounded to attributable surfaces
- [x] T032 [US3] Implement Pi managed-target inspection and Install/Status/Update/Sync/Model plans with installation-equivalent Install/Update for FR-007, FR-011, FR-013, FR-014, and FR-020 in `src/cli/operations/pi.ts` | Verify: T027 passes and no read-only status call advances state
- [x] T033 [US3] Register Pi operation metadata and adapter dispatch for FR-001 and FR-014 in `src/cli/operations/index.ts` | Verify: T028 passes with explicit unsupported results retained
- [x] T034 [US3] Format and dispatch Pi install/operation reports and actions through the CLI for FR-011, FR-013, FR-014, and FR-019 in `src/cli/commands.ts` | Verify: T029 passes and exit codes reflect blocked versus degraded outcomes
- [x] T035 [US3] Route Pi Install/Update/Sync previews and applies plus specialist-only model input through TUI operations for FR-011 and FR-014 in `src/cli/tui/operations.ts` | Verify: T031 passes without Codex fallthrough or ambient-root model mutation
- [x] T036 [US3] Present Pi as a fourth harness and expose truthful Install and operation availability in the TUI for FR-014 in `src/cli/tui/App.tsx` | Verify: T030 passes and OpenCode remains the initial selection
- [x] T037 [US3] Add failing Pi specialist model/effort catalog and root-owned limitation cases for FR-014 in `src/cli/tui/model-catalog.test.ts` | Verify: tests offer only supported specialist mutations and explain root-session ownership
- [x] T038 [US3] Implement Pi specialist model/effort choices without claiming ambient-root ownership for FR-014 in `src/cli/tui/model-catalog.ts` | Verify: T037 passes and other harness catalogs remain unchanged

## Story US4 — Preserve existing harnesses and raise the runtime floor

- [x] T039 [US4] Add failing active package/canonical/generated skill runtime assertions for Node.js 22.19 covering FR-018 and SC-006 in `src/plugin-node-runtime.test.ts` | Verify: the test rejects every active package or bundled-skill declaration that remains on Node 22.13
- [x] T040 [US4] Extend the exhaustive provider-boundary regression contract to Pi for FR-001, FR-007, and SC-007 in `src/harness/provider-boundary.test.ts` | Verify: provider governance assertions cover all four harnesses and preserve thoth-mem ownership
- [x] T041 [US4] Raise the package engine to Node.js 22.19 while retaining pnpm 11.2.2 for FR-018 and SC-006 in `package.json` | Verify: package metadata satisfies T039, rejects older Node versions, and keeps the authoritative package manager unchanged
- [x] T042 [US4] Run the CI matrix on Node.js 22.19 for FR-018 and SC-006 in `.github/workflows/ci.yml` | Verify: frozen install, check, typecheck, and tests use the new floor
- [x] T043 [US4] Run release build/verification on Node.js 22.19 for FR-018 and SC-006 in `.github/workflows/release.yml` | Verify: release remains gated by CI and builds with the selected runtime
- [x] T044 [US4] Update all canonical bundled-skill runtime declarations to Node.js 22.19 for FR-018 and SC-006 in `skills` | Verify: no canonical skill retains an active 22.13 compatibility declaration and T039 advances toward passing
- [x] T045 [US4] Regenerate bundled plugin skill copies after canonical metadata changes for FR-018 and SC-007 in `plugin` | Verify: generated integration verification and T039 report no drift
- [x] T046 [US4] Document Pi prerequisites, install/status/update, pins, ownership, security, credentials, partial recovery, and Node floor for FR-018 and FR-019 in `README.md` | Verify: public entry documentation matches the implemented CLI contract and links routed detail
- [x] T047 [US4] Update adaptive-root guidance and verified command/runtime statements for FR-018 and FR-019 in `AGENTS.md` | Verify: repository instructions describe four harnesses, Pi-native guarantees, and Node 22.19 consistently
- [x] T048 [US4] Update routed installation, harness, research-tool, runtime, testing, and Claude runtime references for FR-018, FR-019, and SC-006 in `docs` | Verify: active documentation contains no stale three-harness or Node 22.13 support claim

## Parallel execution

- None: adapter contracts feed the installer, the installer feeds operation planning, and exhaustive shared harness/CLI/TUI unions plus generated documentation create overlapping mutable surfaces, so serial ownership avoids conflicting changes and false test failures.

## Final verification

- [x] T049 Run focused Pi renderer, adapter, install, skill, memory, ledger, operation, parser, CLI, and TUI tests for FR-001 through FR-020 and SC-001 through SC-005 in `package.json` | Verify: every focused Vitest target passes with no skipped Pi contract case
- [x] T050 Run formatting/lint, type checking, build, and the complete regression suite for SC-006 and SC-007 in `package.json` | Verify: `check:ci`, `typecheck`, `build`, and full `test` all exit successfully on Node 22.19 or newer
- [x] T051 Regenerate and verify shared integration artifacts while confirming Pi remains CLI/runtime-native for SC-007 in `src/harness/generate-integration-packages.test.ts` | Verify: generated Codex/Claude plugin output changes only where Node/four-harness guidance requires it and has no unexplained drift
- [x] T052 Execute an isolated Windows Pi smoke for package/resource discovery, one foreground and one background specialist lifecycle, Context7, Exa registration, and grep.app search covering SC-008 and SC-009 in `openspec/changes/pi-harness-integration/verify-report.md` | Verify: real evidence records all expected registrations and lifecycle outcomes or names the exact external credential/service blocker without mocked success

## Convergence after Oracle verification round 1

**Implementation owner**: adaptive root. The three findings share installer and
operation contracts already loaded by root; one sequential writer avoids
duplicate discovery and overlapping edits. Mutable surface:
`src/cli/pi-install.ts`, `src/cli/pi-install.test.ts`,
`src/cli/operations/pi.ts`, `src/cli/operations/pi.test.ts`, and only if needed
`src/cli/commands.test.ts`. Accepted scope is V-001 through V-003 mapped below;
non-goals are new packages, new remote probes, real-home mutation, or changed
user intent. Verification is the focused Pi suite followed by the complete
pre-merge command sequence and a fresh read-only Oracle.

- [x] T053 Remediate V-001: Add adversarial wrong-version and malformed Pi list evidence tests for FR-004, FR-009, FR-020, and SC-005 (classification: partial) in `src/cli/pi-install.test.ts` | Verify: name-only or wrong-version output cannot satisfy an exact pinned package
- [x] T054 Remediate V-001: Require exact planned package source/version evidence before accepting each Pi package step for FR-004, FR-009, FR-020, and SC-005 (classification: partial) in `src/cli/pi-install.ts` | Verify: T053 passes while exact pinned output remains accepted
- [x] T055 Remediate V-002: Add direct operation and CLI rejection tests for unsupported Pi effort values covering FR-014 (classification: partial) in `src/cli/operations/pi.test.ts` | Verify: `ultra`, unknown values, and unavailable catalog efforts fail before mutation, including through CLI dispatch
- [x] T056 Remediate V-002: Centralize Pi effort validation at the operation boundary for FR-014 (classification: partial) in `src/cli/operations/pi.ts` | Verify: only `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or inherited effort can produce an applicable plan
- [x] T057 Remediate V-003: Add independent Context7, Exa, and grep.app runtime-state tests for FR-007, FR-013, FR-020, and SC-009 (classification: missing) in `src/cli/operations/pi.test.ts` | Verify: managed package/config health remains separate from ready, credential-required, unreachable, drifted, and failed runtime observations
- [x] T058 Remediate V-003: Implement explicit independent research-provider status entries for FR-007, FR-013, FR-020, and SC-009 (classification: missing) in `src/cli/operations/pi.ts` | Verify: T057 passes without remote reachability or credentials changing ledger authority
- [x] T059 Rerun focused Pi tests, formatting, type checking, build, full regression, integration verification, and diff/secret checks after V-001 through V-003 using `package.json` | Verify: every command passes before a fresh Oracle verification round
