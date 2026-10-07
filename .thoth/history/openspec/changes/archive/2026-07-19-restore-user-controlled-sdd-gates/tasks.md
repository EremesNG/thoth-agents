# Tasks: Restore user-controlled SDD gates

## MVP scope

US1 is the first independently testable slice: the classifier exposes a
recommendation that requires explicit user confirmation, and every harness root
prompt presents Direct, Accelerated, and Full without silently choosing for the
user. US2 and US3 complete the requested review gate and distribution parity.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014 -> T015 -> T016 -> T017 -> T018 -> T019 -> T020 -> T021 -> T022 -> T023 -> T024 -> T025 -> T026 -> T027`; the central SDD and prompt contracts overlap, generated output depends on canonical source, and each red/green slice must remain observable before the next slice starts.

## Story US1

- [x] T001 [US1] Add the failing classifier contract tests for FR-001 and SC-001 in `src/harness/core/sdd.test.ts` | Verify: focused Vitest fails because unselected recommendations do not yet require user confirmation
- [x] T002 [US1] Implement user-confirmed route recommendations for FR-001 and SC-001 in `src/harness/core/sdd.ts` | Verify: the classifier tests pass for low, moderate, high, and all three explicitly selected routes
- [x] T003 [US1] Add the failing multi-dialect route-choice prompt tests for FR-001 and SC-001 in `src/agents/prompt-rendering.test.ts` | Verify: focused Vitest fails because rendered roots still select routes without presenting all user choices
- [x] T004 [US1] Implement the root route-recommendation and user-selection guidance for FR-001 and SC-001 in `src/agents/prompt-sections.ts` | Verify: OpenCode, Codex, and Claude prompt tests pass with recommendation-first native blocking input and no duplicate prompt for a named route

## Story US2

- [x] T005 [US2] Add the failing conditional plan-review graph, protocol, artifact, entry, and final-verification tests for FR-002, FR-003, FR-004, SC-002, and SC-005 in `src/harness/core/` | Verify: focused Vitest fails because Full still requires analyze and no plan-review contract exists
- [x] T006 [US2] Replace mandatory analyze with optional plan-review while preserving required Oracle verify for FR-002, FR-003, FR-004, SC-002, and SC-005 in `src/harness/core/` | Verify: phase/protocol tests pass, Direct cannot enter plan-review, both artifact-backed routes may enter after tasks, and both may implement when review is skipped
- [x] T007 [US2] Add the failing multi-dialect review-choice and Oracle-separation prompt tests for FR-002, FR-003, FR-004, SC-003, and SC-005 in `src/agents/prompt-rendering.test.ts` | Verify: focused Vitest fails because roots do not yet offer review versus proceed or distinguish plan approval from verify
- [x] T008 [US2] Implement the optional review choice, blocker loop, approved-plan confirmation, and mandatory verify guidance for FR-002, FR-003, FR-004, SC-003, and SC-005 in `src/agents/prompt-sections.ts` | Verify: all three dialect prompts render native choices, plan-reviewer dispatch, maximum-three-blocker handling, implementation confirmation after OKAY, and mandatory final Oracle verify
- [x] T009 [US2] Add the failing plan-reviewer skill contract tests for FR-003 and SC-003 in `src/harness/bundled-skills.test.ts` | Verify: focused Vitest fails because the canonical skill and freshness-aware template do not exist
- [x] T010 [US2] Add the adapted read-only plan-reviewer skill and OpenSpec artifact template for FR-003 and SC-003 in `skills/plan-reviewer/` | Verify: skill tests pass for exact OKAY/REJECT tokens, no more than three blockers, SHA-256 freshness, root-owned writes, and no thoth-mem artifact mirroring

## Story US3

- [x] T011 [US3] Add the failing owned-bundle, init, and generated-package tests for FR-005 and SC-004 in `src/harness/` | Verify: focused Vitest fails because plan-reviewer is absent from canonical owned-skill registries and generated installations
- [x] T012 [US3] Register plan-reviewer in integration generation for FR-005 and SC-004 in `src/harness/generate-integration-packages.ts` | Verify: generated-package tests recognize the fifth canonical owned skill
- [x] T013 [US3] Register plan-reviewer in project initialization for FR-005 and SC-004 in `skills/thoth-init/scripts/init.mjs` | Verify: bundled init tests materialize plan-reviewer for OpenCode and generated plugin installs
- [x] T014 [US3] Document the fifth canonical owned skill for FR-005 and SC-004 in `skills/README.md` | Verify: the canonical skill catalog names plan-reviewer and still separates all mandatory external skills
- [x] T015 [US3] Add the failing governance contract tests for FR-006 and SC-006 in `src/harness/sdd-constitution.test.ts` | Verify: focused Vitest fails because active governance still assigns route choice and mandatory Full analysis to root
- [x] T016 [US3] Amend the repository constitution from 4.0.0 to 5.0.0 for FR-006 and SC-006 in `openspec/memory/constitution.md` | Verify: lifecycle validation accepts the MAJOR amendment and its complete Sync Impact Report
- [x] T017 [US3] Align initialized project governance with optional plan review and mandatory final verify for FR-006 and SC-006 in `skills/thoth-constitution/templates/constitution.md` | Verify: governance tests accept the template wording and reject mandatory pre-implementation analyze semantics
- [x] T018 [US3] Align contributor and installed-root instructions for FR-005, FR-006, SC-004, and SC-006 in `AGENTS.md` | Verify: instruction inspection finds user-selected routes, recommended optional plan review, and mandatory final Oracle verify without the old auto-selection rule
- [x] T019 [US3] Align routed architecture, packaging, and SDD guidance for FR-005, FR-006, SC-004, and SC-006 in `docs/agent/` | Verify: routed docs name five owned skills and preserve the route-review-verify distinction
- [x] T020 [US3] Restore the public route and review workflow for FR-001, FR-002, FR-003, FR-004, and SC-003 in `docs/sdd-pipeline.md` | Verify: public pipeline guidance presents all user choices and the optional blocker-focused Oracle loop
- [x] T021 [US3] Document the bundled plan-reviewer contract for FR-003, FR-005, SC-003, and SC-004 in `docs/skills-and-mcps.md` | Verify: the skill catalog states exact review tokens, Oracle ownership, and OpenSpec-only persistence
- [x] T022 [US3] Align the main product overview and its adjacent public installation and packaging guides for FR-001, FR-002, FR-004, FR-005, FR-006, and SC-004 in `README.md` | Verify: public docs describe user-owned routing, optional plan review, required final verify, and five canonical owned skills
- [x] T023 [US3] Regenerate and verify the shared harness bundle for FR-005, SC-004, and SC-006 in `plugin/` | Verify: integration sync and integration verification pass and generated Codex and Claude assets contain plan-reviewer plus updated prompt hashes

## Parallel execution

- None: every implementation slice touches the shared SDD/prompt contract or depends on its generated skill bundle, and this change intentionally keeps one root writer for those overlapping mutable surfaces.

## Final verification

- [x] T024 Apply the simplify review to the TypeScript implementation for FR-001, FR-002, FR-003, FR-004, FR-005 and SC-001, SC-002, SC-003, SC-004, SC-005 in `src/` | Verify: focused tests still pass and no behavior, public token, route choice, or ownership contract changes
- [x] T025 Apply the simplify review to owned skill implementation for FR-002, FR-003, FR-005 and SC-002, SC-003, SC-004 in `skills/` | Verify: skill and bundle tests still pass with no duplicated or stale analyze guidance
- [x] T026 Run proportional repository validation for FR-001, FR-002, FR-003, FR-004, FR-005, FR-006 and SC-001, SC-002, SC-003, SC-004, SC-005, SC-006 in `package.json` | Verify: focused tests, constitution validation, check:ci, typecheck, build, and full Vitest suite all pass with no unrelated diff
- [x] T027 Map independent Oracle evidence for FR-001, FR-002, FR-003, FR-004, FR-005, FR-006 and SC-001, SC-002, SC-003, SC-004, SC-005, SC-006 in `openspec/changes/restore-user-controlled-sdd-gates/verify-report.md` | Verify: read-only Oracle records PASS with requirement evidence, executed commands, risks, and no unresolved critical finding
