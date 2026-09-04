# Tasks: [Feature name]

## Authoring contract

Replace every HTML anchor below with real content; do not append new tasks next
to retained examples. Across the entire file, task identifiers start at `T001`
and increase by exactly one without resetting for a new story or section.

The canonical task form is:
``- [ ] T001 [P] [US1] Description with FR-###/SC-### coverage in `path/to/file` | Verify: observable outcome``

`[P]` is optional and must precede the optional `[US#]` tag. Before
`| Verify:`, each task must contain exactly one backtick span, reserved for one
literal repository-relative path. Do not use placeholders, globs, absolute or
home-relative paths, repository escapes, URIs, or extra backticks. Every task
must end with a concrete `Verify` outcome.

## MVP scope

[Name the first independently testable story and its completion evidence.]

## Dependencies

`T001 -> T002`; [cross-story dependency notes, or None.]

## Story US1

<!-- STORY-US1-TASKS -->

Outcome SCs remain verification targets; do not manufacture implementation tasks
for them.

## Parallel execution

Use this exact grammar when safe parallel work exists:

### Group P1

- Lane L1: T001 -> T002 | Owner: deep
- Lane L2: T003 -> T004 | Owner: quick
- Prerequisites: None
- Barrier: Final verification
- Rationale: Both lane path sets are disjoint and neither lane consumes peer output.

Groups and lanes are sequential and unique. Every `[P]` task belongs to exactly one lane; non-`[P]` tasks do not. Lane surfaces are the union of exact task
paths, and lanes in a group have disjoint surfaces and no cross-lane dependency.
The `Rationale` must explicitly state path-disjointness and cross-lane dependency
evidence so structural validation can gate the evidence shape and Oracle can
judge whether the claim is true.
Prerequisites name known tasks outside the group; the barrier is a downstream
task or `Final verification` after all lane members. If no group exists, use
only `- None: <evidence-backed reason>` and no task may use `[P]`.

<!-- PARALLEL-EXECUTION-EVIDENCE -->

## Final verification

<!-- FINAL-VERIFICATION-TASKS -->
