# Tasks: Consolidate Pi web research

## MVP scope

US1 is independently testable through isolated package and runtime-status contracts. US2 completes agent access and operator guidance.

## Dependencies

T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014.
Tests precede each changed behavior. One deep writer owns product tasks T001–T012 and reports simplify/check evidence for T013; root persists T013–T014 artifacts and uses a fresh Oracle. Auxiliary Pi-specific assertions may be aligned under the mapped plan surfaces while preserving preexisting edits.

## Implementation

- [x] T001 [US1] Add replacement inventory and failure/dry-run tests FR-001/SC-001 in `src/cli/pi-install.test.ts` | Verify: tests fail against prior seven-package inventory
- [x] T002 [US1] Replace required web dependencies FR-001/SC-001 in `src/cli/pi-install.ts` | Verify: exact six pins with pi-web-access@0.27.0 and no replaced package
- [x] T003 [US1] Align full installer command assertions FR-001/SC-001 in `src/cli/install.test.ts` | Verify: full orchestration keeps required order and failure guarantees
- [x] T004 [US1] Add unverified web status tests FR-002/SC-001 in `src/cli/operations/pi.test.ts` | Verify: key absence never produces Exa-required diagnostic and explicit evidence wins
- [x] T005 [US1] Implement web-access evidence model FR-002/SC-001 in `src/cli/operations/pi.ts` | Verify: package presence yields unverified and missing package yields drifted
- [x] T006 [US2] Add exact librarian permissions tests FR-003/SC-002 in `src/harness/writers/pi-agent.test.ts` | Verify: four new default web interfaces replace obsolete patterns
- [x] T007 [US2] Update librarian tool inventory FR-003/SC-002 in `src/harness/writers/pi-agent.ts` | Verify: other five specialists retain exact prior permissions
- [x] T008 [US2] Add research guidance tests FR-003/SC-002 in `src/harness/adapters/pi.test.ts` | Verify: root and librarian name workflow none and real tools
- [x] T009 [US2] Update Pi research guidance and diagnostics FR-003/SC-002 in `src/harness/adapters/pi.ts` | Verify: no dedicated Exa extension or web_fetch claims
- [x] T010 [US2] Update inventory and transition documentation FR-004/SC-003 in `docs/installation.md` | Verify: native cleanup instructions and replacement version are accurate
- [x] T011 [US2] Align public and routed research documentation FR-004/SC-003 in `docs/skills-and-mcps.md` | Verify: current README and routed docs also match frozen provider semantics
- [x] T012 [US2] Regenerate Pi definitions and provenance FR-003/SC-003 in `pi/agents/thoth-librarian.md` | Verify: integration verification finds no stale generated outputs
- [x] T013 Run simplify and proportional project checks FR-001/FR-002/FR-003/FR-004/SC-003 in `openspec/changes/pi-web-access-consolidation/verify-report.md` | Verify: focused tests, formatting, types, build, generation checks recorded with limitations
- [x] T014 Collect fresh Oracle verification and prepare closeout FR-001/FR-002/FR-003/FR-004/SC-003 in `openspec/changes/pi-web-access-consolidation/archive-report.md` | Verify: PASS evidence and explicit SC-004 outcome risk allow transactional archive

## Parallel execution

- None: Package ids feed status, tool contracts feed generated output, and documentation consumes both. One coupled writer avoids cross-lane intermediate contract drift; root verification waits for terminal implementation evidence.

## Final verification

T013 records executed checks; T014 records fresh Oracle judgment and archive readiness. SC-004 remains an outcome target, not a fabricated implementation task.
