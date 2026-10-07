# Tasks: Separate Global Installation from Project Initialization

## MVP scope

US1 is the MVP: a direct or managed OpenCode installation can place and refresh all five thoth-owned skills in an isolated global native root, plan zero-write dry-run, and fail truthfully on invalid source or destination state. Completion evidence is the focused owned-skill, direct-install, and OpenCode-operation test set.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007`; `T008 -> T009 -> T010 -> T011 -> T012`; `T013 -> T014 -> T015`; `T007 + T012 + T015 -> T016 -> T017 -> T018 -> T019 -> T020`. US2 can be reasoned about independently, but one root writer executes sequentially because CLI, bundled skills, generated output, and documentation share imports and contract text.

## Story US1

- [x] T001 [US1] Add failing owned-skill synchronization tests for FR-001 and SC-001/SC-002 in `src/cli/owned-skills.test.ts` | Verify: focused tests fail because five packaged skills cannot yet be planned, copied, refreshed, or rejected safely
- [x] T002 [US1] Define the one canonical five-skill identity list for FR-001 and SC-001 in `src/harness/core/owned-skills.ts` | Verify: owned-skill tests resolve exactly five stable names from one exported source
- [x] T003 [US1] Implement staged OpenCode global synchronization for FR-001 and SC-001/SC-002 in `src/cli/owned-skills.ts` | Verify: owned-skill tests pass with five complete trees, zero dry-run writes, stale refresh, and truthful failure
- [x] T004 [US1] Add failing direct-installer ordering and output tests for FR-001 and SC-002 in `src/cli/install.test.ts` | Verify: focused install tests fail until owned skills are planned or applied before external skills and provider completion
- [x] T005 [US1] Integrate required owned-skill synchronization into the direct OpenCode flow for FR-001 and SC-002 in `src/cli/install.ts` | Verify: direct install dry-run lists five owned skills and an injected synchronization failure prevents provider invocation and success output
- [x] T006 [US1] Replace external-only OpenCode operation expectations with failing owned-plus-external status, preview, and apply tests for FR-002 and SC-001/SC-002 in `src/cli/operations/opencode.test.ts` | Verify: focused operation tests fail because owned skill drift and repair are not yet modeled
- [x] T007 [US1] Add owned skill targets and synchronization to OpenCode status, install, and sync operations for FR-002 and SC-001/SC-002 in `src/cli/operations/opencode.ts` | Verify: focused operations report nine required global skills, preview owned destinations, and restore owned skills during install or sync

## Story US2

- [x] T008 [US2] Rewrite initializer behavior tests first for FR-003/FR-004 and SC-003/SC-004 in `src/harness/bundled-skills.test.ts` | Verify: focused tests fail while init accepts a harness, writes project skills, omits required OpenSpec directories, or mishandles preservation and collisions
- [x] T009 [US2] Rewrite the OpenCode command contract test first for FR-003 and SC-003 in `src/harness/opencode-init-command.test.ts` | Verify: focused command test fails while the generated invocation still supplies the obsolete harness argument
- [x] T010 [US2] Implement preflighted OpenSpec-only structural synchronization for FR-003/FR-004 and SC-003/SC-004 in `skills/thoth-init/scripts/init.mjs` | Verify: initializer tests pass for empty, partial, repeat, preservation, obsolete-argument, and collision cases with zero writes outside OpenSpec
- [x] T011 [US2] Restrict the bundled initializer instructions to OpenSpec governance for FR-003/FR-004 and SC-003/SC-004 in `skills/thoth-init/SKILL.md` | Verify: the skill contract names no harness-specific or project-local skill installation responsibility
- [x] T012 [US2] Emit the harness-neutral initializer invocation for FR-003 and SC-003 in `src/harness/opencode-init-command.ts` | Verify: the command test passes and generated instructions contain no obsolete harness flag

## Story US3

- [x] T013 [US3] Align generated-package assertions with the canonical owned-skill list and OpenSpec-only initializer for FR-005 and SC-005 in `src/harness/generate-integration-packages.test.ts` | Verify: focused generator tests cover all canonical owned skills and the new init contract
- [x] T014 [US3] Reuse the canonical owned-skill list during shared plugin generation for FR-005 and SC-005 in `src/harness/generate-integration-packages.ts` | Verify: integration generation contains one owned-skill identity source and produces all five trees
- [x] T015 [US3] Regenerate the shared plugin bundle from canonical sources for FR-005 and SC-005 in `plugin/` | Verify: integration synchronization tests pass with the OpenSpec-only initializer contract
- [x] T016 [US3] Update top-level operator guidance for FR-002/FR-005 and SC-005 in `README.md` | Verify: README assigns global skills to install and only OpenSpec governance to init
- [x] T017 [US3] Update installation, skill, quick-reference, and routed guidance for FR-002/FR-005 and SC-005 in `docs/` | Verify: bounded documentation search finds zero active claims that OpenCode init copies or installs project-local skills
- [x] T018 [US3] Update canonical bundled-skill ownership guidance for FR-005 and SC-005 in `skills/README.md` | Verify: the canonical skill README assigns OpenCode materialization to the global installer
- [x] T019 [US3] Apply behavior-preserving simplification and run proportional checks for FR-001/FR-002/FR-003/FR-004/FR-005 and SC-001/SC-002/SC-003/SC-004/SC-005 in `package.json` | Verify: focused tests, formatting check, typecheck, build, and full tests all pass or any unrelated failure is evidenced

## Parallel execution

- None: one root writer must keep the canonical skill list, CLI imports, generated bundle, init contract, tests, and public wording synchronized; splitting these mutable contracts would create overlap without net gain.

## Final verification

- [x] T020 [US3] Delegate read-only Oracle verification and persist complete FR-001/FR-002/FR-003/FR-004/FR-005 and SC-001/SC-002/SC-003/SC-004/SC-005 evidence in `openspec/changes/separate-install-from-thoth-init/verify-report.md` | Verify: Oracle records PASS with no unresolved critical finding, or actionable gaps return through convergence before closeout

## Convergence 1

- [x] T021 [US1] Remediate Oracle F-001 (partial) for FR-001/FR-002/FR-005 and SC-001/SC-005 by adding release-layout regression coverage in src/cli/owned-skills.test.ts and src/plugin-node-runtime.test.ts, resolving the package root from the emitted module location, and proving the compiled OpenCode dry-run can find all packaged owned skills in `src/cli/owned-skills.ts` | Verify: source-layout and simulated dist chunk tests pass, then the build and built-runtime test execute the compiled CLI dry-run without the canonical owned skill missing error
