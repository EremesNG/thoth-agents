# Tasks: Pi interaction and web extensions

## MVP scope

US1 + US2 provide installed question/progress tools and accurate root guidance; US3 completes requested web capability. Final release scope includes all three stories.

## Dependencies

T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014 -> T015.
Each test/implementation pair is a vertical TDD slice. One deep owns product mutations; root owns final reports.

## Story US1

- [x] T001 [US1] Add failing required-package install and failure tests for FR-001/SC-001 in `src/cli/pi-install.test.ts` | Verify: new exact pins absent before implementation cause expected red tests.
- [x] T002 [US1] Add native package pins and preserve apply ordering for FR-001/SC-001 in `src/cli/pi-install.ts` | Verify: required-package tests pass and failure prevents completion.
- [x] T003 [US1] Add status and Update-plan parity regression for FR-001/FR-005/SC-001 in `src/cli/operations/pi.test.ts` | Verify: each missing/mismatched new source is visible; inspected shared apply branch preserves Install/Update behavior.
- [x] T004 [US1] Reconcile package status descriptions for FR-005/SC-001 in `src/cli/operations/pi.ts` | Verify: installed evidence is distinct from live operation.

## Story US2

- [x] T005 [US2] Add root/child question and progress regression for FR-002/FR-003/SC-002 in `src/harness/adapters/pi.test.ts` | Verify: incorrect ask_user and child todo/dialog guidance produce red evidence.
- [x] T006 [US2] Map actual question/progress tool names for FR-002/FR-003/SC-002 in `src/agents/prompt-dialects.ts` | Verify: Pi uses ask_user_question/todo and other dialects remain unchanged.
- [x] T007 [US2] Keep Pi child questions/progress root-owned for FR-002/FR-003/SC-002 in `src/agents/prompt-sections.ts` | Verify: rendered children escalate instead of invoking unavailable interaction tools.
- [x] T008 [US2] Add explicit root usage and cancellation/no-UI rules for FR-002/FR-003/SC-002 in `src/harness/adapters/pi.ts` | Verify: schema-compatible root guidance and no false approval.

## Story US3

- [x] T009 [US3] Add librarian web allowlist regression for FR-004/SC-003 in `src/harness/writers/pi-agent.test.ts` | Verify: exact two missing web tools fail before implementation.
- [x] T010 [US3] Expose complementary librarian web tools for FR-004/SC-003 in `src/harness/writers/pi-agent.ts` | Verify: existing research tools remain and other roles gain none.
- [x] T011 [US3] Explain provider/output limits in root and librarian guidance for FR-004/SC-003 in `src/harness/adapters/pi.ts` | Verify: actual web names, prerequisites and error handling are explicit.

## Documentation and verification

- [x] T012 Document operator capabilities and package counts for FR-005/SC-004 in `docs/installation.md` | Verify: README and routed docs agree with new dependencies and ownership.
- [x] T013 Regenerate owned Pi resources for FR-002/FR-003/FR-004/SC-004 in `pi/.thoth-agents-assets.json` | Verify: generated assets and hashes match canonical source without other-harness drift.
- [x] T014 Run focused/full checks and fresh Oracle verification for FR-001/FR-002/FR-003/FR-004/FR-005/SC-001/SC-002/SC-003/SC-004 in `openspec/changes/pi-rpiv-extensions/verify-report.md` | Verify: independent PASS with observed evidence and explicit SC-005 residuals.
- [x] T015 Prepare verified closeout and declared delta summary for FR-001/FR-002/FR-003/FR-004/FR-005/SC-004 in `openspec/changes/pi-rpiv-extensions/archive-report.md` | Verify: archive report records completed scope, verified lineage and declared canonical deltas; the archive command performs the terminal move after closeout validation.

## Parallel execution

- None: package/rendering tests, docs and generated outputs consume common contracts; one deep writer avoids overlapping mutable surfaces. Root artifacts are sequential downstream evidence, not a separate implementation lane.

## Final verification

Fresh Oracle required after product writer completion. Root persists verdict, resolves all blockers, validates closeout and archives. Outcome SC-005 gets PASS observations or explicit RISK; no manufactured implementation tasks.
