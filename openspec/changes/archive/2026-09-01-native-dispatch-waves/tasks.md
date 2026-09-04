# Tasks: Native Dispatch Waves

## Authoring contract

Task identifiers are globally sequential. Each executable line names one literal repository-relative mutable surface and one observable result. `[P]` marks tasks belonging to an explicitly declared writer lane; ordered tasks inside a lane remain one vertical assignment, while independent lanes in the same group are dispatched before fan-in.

## MVP scope

US1 and US2 form the independently testable MVP: the real validator CLI accepts one canonical two-lane artifact and rejects malformed membership, dependency, ownership, overlap, prerequisite, and barrier cases with stable diagnostics.

## Dependencies

`T001 -> T002`; `T003 -> T004 -> T005 -> T006`; `T007 -> T008`; `T001 + T002 + T003 + T004 + T005 + T006 + T007 + T008 -> T009`; `T009 -> T010 -> T011 -> T012 -> T013`.

## Story US1

- [x] T001 [P] [US1] Add red validator CLI fixtures for canonical groups, ordered lanes, membership, owners, prerequisites, and barriers with FR-003 and SC-001 coverage in `src/harness/sdd-validator.test.ts` | Verify: the focused suite failed on legacy pairing behavior before implementation, then passed with stable group-and-lane diagnostic assertions.
- [x] T002 [P] [US1] Implement strict group-and-lane parsing plus membership, ownership, prerequisite, barrier, overlap, and declared dependency validation for FR-003 and SC-001 in `skills/thoth-sdd/scripts/validate.mjs` | Verify: 95/95 focused CLI tests passed with stable category diagnostics and no execution state.

## Story US2

- [x] T003 [P] [US2] Add red public contract assertions for canonical group grammar and the seven native lifecycle requirements with FR-001/FR-002/FR-004 and SC-002/SC-003/SC-005 coverage in `src/harness/bundled-skills.test.ts` | Verify: the contract suite failed on the retained loose pairing phrase, then passed after the canonical grammar replaced it.
- [x] T004 [P] [US2] Define strict parallel groups, ordered lanes, specialist ownership, prerequisites, barriers, and rationale for FR-001 and SC-002 in `skills/thoth-sdd/references/phases/tasks.md` | Verify: the task phase matches the canonical grammar and lane safety assertions in the 14/14 passing bundled contract suite.
- [x] T005 [P] [US2] Replace the loose pairing anchor with the canonical group-and-lane authoring form for FR-001 and SC-002 in `skills/thoth-sdd/templates/tasks.md` | Verify: the live `native-dispatch-waves` artifact passes the real ready validator with zero errors and warnings.
- [x] T006 [P] [US2] Add the capacity-bounded native wave, refill, terminal fan-in, root state, and barrier lifecycle for FR-002/FR-004 and SC-003/SC-005 in `skills/thoth-sdd/references/phases/implement.md` | Verify: all seven lifecycle assertions pass the 14/14 bundled contract suite without a universal wait or scheduler claim.

## Story US3

- [x] T007 [P] [US3] Document task-versus-lane-versus-group semantics and truthful native degradation for FR-001/FR-002/FR-004 and SC-002/SC-005 in `docs/agent/sdd-and-skills.md` | Verify: routed maintainer guidance names all three coordination levels and retains harness lifecycle authority; targeted review and diff check passed.
- [x] T008 [P] [US3] Update the public SDD workflow and example to show ordered lanes, fan-out, capacity refill, and terminal barrier release for FR-001/FR-002/FR-004 and SC-002/SC-003/SC-005 in `docs/sdd-pipeline.md` | Verify: public guidance contains one canonical group example with no loose pairing or synthetic runtime claim; targeted review and diff check passed.

## Parallel execution

### Group P1

- Lane L1: T001 -> T002 | Owner: deep
- Lane L2: T003 -> T004 -> T005 -> T006 | Owner: quick
- Lane L3: T007 -> T008 | Owner: quick
- Prerequisites: None
- Barrier: T009
- Rationale: The validator lane, canonical contract lane, and routed documentation lane own disjoint path sets, consume the accepted spec and plan rather than one another's mutable output, and retain their internal test-to-implementation ordering.

## Final verification

- [x] T009 [US3] Apply the mandatory behavior-preserving simplify review to the completed validator for FR-003 and SC-001/SC-005 in `skills/thoth-sdd/scripts/validate.mjs` | Verify: dependency edges are parsed once per artifact, Biome formatted the owned TypeScript test surface, 112/112 focused tests passed, and the ready gate remained valid.
- [x] T010 [US3] Synchronize generated skill mirrors from canonical sources for FR-001-FR-004 and SC-002/SC-003/SC-005 in `plugin` | Verify: integration sync completed under root ownership, 12/12 integration tests passed, and all four changed canonical/mirror skill pairs have identical SHA-256 hashes.
- [x] T011 [US3] Run focused validator/bundled-skill tests and proportional check, typecheck, build, and full-suite validation for FR-001-FR-004 and SC-001-SC-003/SC-005 in `package.json` | Verify: check:ci, typecheck, and build passed; 112/112 focused tests and 1050/1050 full tests passed after removing the ambient Orca CODEX_HOME from the test process, with 49/49 affected Codex tests confirming the classification.
- [x] T012 [US3] Delegate fresh read-only Oracle verification and record completeness, correctness, coherence, no-runtime scope, and SC-004 outcome disposition for FR-001-FR-004 and SC-001-SC-005 in `openspec/changes/native-dispatch-waves/verify-report.md` | Verify: a fresh Oracle returned PASS with no critical finding; Codex SC-004 is observed PASS and OpenCode/Claude remain explicit non-blocking per-harness RISK.
- [x] T013 [US3] Prepare transactional durable-delta closeout after Oracle PASS for FR-001/FR-002 and SC-001-SC-005 in `openspec/changes/native-dispatch-waves/archive-report.md` | Verify: the READY report records both durable delta targets, all completed tasks, fresh Oracle PASS lineage, and Codex PASS plus OpenCode/Claude residual SC-004 RISK.
