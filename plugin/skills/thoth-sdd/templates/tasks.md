# Tasks: [Feature name]

## MVP scope

[Name the first independently testable story and its completion evidence.]

## Dependencies

`T001 -> T002`; [cross-story dependency notes].

## Story US1

- [ ] T001 [US1] Add the failing behavior test for FR-001 and SC-001 in `[exact/test/path]` | Verify: the focused test fails for the missing behavior
- [ ] T002 [US1] Implement FR-001 in `[exact/source/path]` | Verify: the focused test passes
- [ ] T003 [P] [US1] Update independent documentation in `[exact/doc/path]` | Verify: the documented command matches the executable contract

## Parallel execution examples

- T003 may run with T001 because their mutable paths do not overlap.

## Final verification

- [ ] T004 Run [exact command] and map results to FR-001/SC-001 in `[verify-report path]` | Verify: oracle records a passing verdict with requirement evidence
