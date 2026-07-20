# Tasks: [Feature name]

## MVP scope

[Name the first independently testable story and its completion evidence.]

## Dependencies

`T001 -> T002`; [cross-story dependency notes, or None.]

## Story US1

- [ ] T001 [US1] Add the failing behavior test for FR-001 and buildable SC-001 in `[exact/test/path]` | Verify: the focused test fails for the missing behavior
- [ ] T002 [US1] Implement FR-001 and buildable SC-001 in `[exact/source/path]` | Verify: the focused test passes
- [ ] T003 [P] [US1] Update independent documentation for FR-001 in `[exact/doc/path]` | Verify: the documented contract matches the tested behavior

Outcome SCs remain verification targets; do not manufacture implementation tasks
for them.

## Parallel execution

[Keep exactly one form below. Use `[P]` only when mutable paths cannot overlap.]

- T003 may run with T001 because `[exact/doc/path]` and `[exact/test/path]` do not overlap.
- None: [reason no tasks can safely overlap]

## Final verification

- [ ] T004 [US1] Map FR-001 and buildable SC-001 evidence in `[verify-report path]` | Verify: oracle records a passing verdict with executed evidence
