# Tasks: Runtime-autonomous SDD bundle

## MVP scope

The MVP is US1 + US2 + US3: seven roles, oracle-only analysis/verification, and
runtime-autonomous generated packages. US4 and US5 complete the governed parity and
safe initialization experience required for release.

## Dependencies

`T001 -> T002 -> T003/T004 -> T005 -> T006/T007 -> T008 -> T009 -> T010`.
Tasks marked `[P]` touch independent surfaces and may run in parallel only when
they retain a single writer for each file tree.

## Phase 1 - Contract tests

- [x] T001 [US2] Add failing seven-role registry and configuration assertions for FR-001, FR-002, and SC-001 in `src/agents/index.test.ts`, `src/config/constants.test.ts`, and `src/config/schema.test.ts` | Verify: tests reject any active roster other than the seven canonical roles
- [x] T002 [US3] Add failing oracle ownership assertions for FR-004, FR-005, FR-006, and SC-002 in `src/harness/core/sdd.test.ts` and `src/harness/core/sdd-protocol.test.ts` | Verify: every analyze and verify ownership assertion resolves only to oracle
- [x] T003 [P] [US1] Add failing owned-only package assertions for FR-010, FR-014, and SC-003 in `src/harness/generate-integration-packages.test.ts`, `src/harness/adapters/codex.test.ts`, and `src/harness/adapters/claude-code.test.ts` | Verify: generated-package tests reject vendored external skills and unsupported Codex agents
- [x] T004 [P] [US5] Add failing offline/idempotent init tests for FR-011, FR-012, and SC-005 in `src/harness/bundled-skills.test.ts` | Verify: a second init preserves edited project-owned files without network access
- [x] T005 [US4] Add failing Spec Kit parity fixtures for FR-009 and SC-004 in `src/harness/sdd-validator.test.ts` | Verify: each malformed artifact produces its phase-specific diagnostic

## Phase 2 - MVP implementation

- [x] T006 [US2] Remove phase-only factories, presets, schema keys, and active registry entries for FR-001, FR-002, FR-003, and SC-001 from `src/agents/index.ts`, `src/config/constants.ts`, `src/config/schema.ts`, and `src/harness/core/agent-pack.ts` | Verify: all harness packs expose the same seven-role registry with no legacy configuration keys
- [x] T007 [US3] Implement FR-003, FR-004, FR-005, FR-006, FR-007, and SC-002 in `src/harness/core/sdd.ts` and `src/agents/prompt-sections.ts` | Verify: route tests prove oracle-only review and a separate convergence/reimplementation dispatch
- [x] T008 [US1] Add canonical owned contracts for FR-008, FR-010, and FR-015 under `skills/thoth-sdd/SKILL.md` and include them in `package.json` | Verify: the package file list contains all four owned skills and no external skill copy
- [x] T009 [US1] Implement FR-010, FR-011, FR-013, FR-014, and SC-003 in `src/harness/generate-integration-packages.ts` and `src/index.ts` | Verify: Codex contains owned skills but no agents, Claude contains generated agents plus owned skills, and OpenCode exposes `/thoth-init`

## Phase 3 - Governance and release readiness

- [x] T010 [US4] Implement structural validation for FR-009 and SC-004 in `skills/thoth-sdd/scripts/validate.mjs` | Verify: progressive gates accept complete current-phase artifacts and reject incomplete IDs, coverage, evidence, and revalidation
- [x] T011 [US5] Implement FR-011, FR-012, and SC-005 in `skills/thoth-init/scripts/init.mjs` | Verify: focused init tests prove offline idempotency and user-file preservation
- [x] T012 [P] [US1] Implement FR-010, FR-013, and SC-003 in `src/cli/skills.ts` and `src/cli/codex-paths.ts` | Verify: installer tests assert exact canonical `npx skills add` commands and Codex global managed surfaces
- [x] T013 [P] [US2] Document FR-003, FR-007, FR-008, and FR-015 in `README.md`, `AGENTS.md`, and `docs/sdd-pipeline.md` | Verify: public guidance states all routes, lazy contracts, oracle ownership, installation-time CLI use, and terminal archive behavior
- [x] T014 [US1] Regenerate FR-014, SC-001, and SC-003 assets in `integrations/claude-code/.claude-plugin/plugin.json`, `integrations/codex/.codex-plugin/plugin.json`, and `thoth-agents.schema.json` | Verify: build-time verification reports synchronized 0.3.0 manifests and seven generated Claude agents
- [x] T015 [US4] Simplify FR-009/FR-015 implementation and prove SC-004/SC-006 in `openspec/changes/self-contained-sdd-bundle/verify-report.md` | Verify: phase validation, check:ci, typecheck, build, full tests, integration verification, and independent oracle review all pass

## Parallel execution examples

- After T002, T003 and T004 may proceed in parallel because package generation
  tests and init-script tests own different files.
- After T009, T012 and T013 may proceed in parallel because CLI code and public
  documentation do not overlap.
- T006 and T007 must remain sequential because both update the active role and
  ownership contracts.

## Independent story validation

- **US1**: Build packages in a temporary directory, assert that only owned skills
  are bundled, and inspect exact external-skill CLI commands independently.
- **US2**: Render all harness agent packs and assert the same seven-role roster.
- **US3**: Enumerate phase ownership and attempt a self-review dispatch; only
  oracle may receive analyze/verify.
- **US4**: Validate canonical and malformed artifact fixtures and inspect rule IDs.
- **US5**: Run init twice around a user edit and compare managed output.
