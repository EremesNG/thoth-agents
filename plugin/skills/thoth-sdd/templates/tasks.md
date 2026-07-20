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

[Replace the anchor with exactly one form: concrete task pairings covering every
`[P]` task, or `- None: <evidence-backed reason>`. Never keep both forms.]

<!-- PARALLEL-EXECUTION-EVIDENCE -->

## Final verification

<!-- FINAL-VERIFICATION-TASKS -->
