# Delta for sdd-tasks-format

Task traceability and TDD ordering: per-task `[USN]` story id, P1/P2/P3
priority, and an "Independent Test" descriptor in the `sdd-tasks` template
(alongside the existing Verification block), plus a `tasks.tdd` config flag that
enforces test-first ordering, enforced by `plan-reviewer`. Back-compatible:
`executing-plans` tolerates absent markers.

## MODIFIED Requirements

### Requirement: Per-Task Traceability Fields

The `sdd-tasks` template MUST carry, for each task, a `[USN]` story-traceability
id, a priority of P1, P2, or P3, and an "Independent Test" descriptor stating
how the task's outcome can be verified in isolation. These fields MUST appear in
addition to the existing per-task Verification block, not as a replacement for
it.

#### Scenario: A task carries all traceability fields

- GIVEN a task generated from the `sdd-tasks` template
- WHEN the task is inspected
- THEN it includes a `[USN]` story id, a P1/P2/P3 priority, an "Independent Test" descriptor, and the existing Verification block

#### Scenario: Priority is constrained to the allowed set

- GIVEN a task in `tasks.md`
- WHEN its priority field is read
- THEN the value is one of P1, P2, or P3

#### Scenario: Independent Test is present and concrete

- GIVEN a task in `tasks.md`
- WHEN its "Independent Test" descriptor is read
- THEN it describes a verification that can be performed without depending on other tasks being complete

### Requirement: Backward-Compatible Consumption of Traceability Fields

`executing-plans` MUST consume the `[USN]`, priority, and "Independent Test"
fields when present and MUST tolerate their absence on legacy task files without
failing, so pre-existing `tasks.md` artifacts remain executable.

#### Scenario: Legacy tasks without new fields still execute

- GIVEN a legacy `tasks.md` whose tasks lack `[USN]`, priority, and "Independent Test" fields
- WHEN `executing-plans` consumes it
- THEN execution proceeds without error
- AND the absent fields are treated as optional

#### Scenario: New fields are surfaced when present

- GIVEN a `tasks.md` whose tasks carry `[USN]`, priority, and "Independent Test" fields
- WHEN `executing-plans` consumes it
- THEN the story id, priority, and Independent Test are surfaced during execution

## ADDED Requirements

### Requirement: TDD Ordering Config Flag

A `tasks.tdd` configuration flag MUST exist in `openspec/config.yaml`. When
`tasks.tdd` is enabled, `sdd-tasks` MUST sequence test-authoring tasks before
their corresponding implementation tasks within the same phase. When disabled,
no test-first ordering constraint is imposed.

#### Scenario: TDD enabled orders tests before implementation

- GIVEN `tasks.tdd` is enabled in `config.yaml`
- WHEN `sdd-tasks` generates a phase that includes both test and implementation tasks
- THEN the test-authoring tasks are sequenced before their corresponding implementation tasks within that phase

#### Scenario: TDD disabled imposes no ordering constraint

- GIVEN `tasks.tdd` is disabled in `config.yaml`
- WHEN `sdd-tasks` generates a phase
- THEN no test-first ordering constraint is applied

### Requirement: TDD Ordering Enforced by Plan-Reviewer

When `tasks.tdd` is enabled, `plan-reviewer` MUST verify that within each phase
every implementation task that has a corresponding test task is preceded by that
test task, and MUST report a finding when an implementation task precedes its
test task.

#### Scenario: Out-of-order implementation is flagged under TDD

- GIVEN `tasks.tdd` is enabled
- AND a phase where an implementation task appears before its corresponding test task
- WHEN `plan-reviewer` runs
- THEN it reports a TDD ordering finding for that phase

#### Scenario: Correct ordering passes under TDD

- GIVEN `tasks.tdd` is enabled
- AND a phase where every test task precedes its corresponding implementation task
- WHEN `plan-reviewer` runs
- THEN it reports no TDD ordering finding

#### Scenario: Ordering not enforced when TDD disabled

- GIVEN `tasks.tdd` is disabled
- AND a phase where an implementation task appears before a test task
- WHEN `plan-reviewer` runs
- THEN it does not report a TDD ordering finding

### Requirement: Harness-Agnostic Tasks Format

The traceability fields, the `tasks.tdd` flag semantics, and the TDD enforcement
rule MUST be defined once in shared conventions and behave identically across
OpenCode, Claude Code, and Codex, with per-harness prose limited to declared
capability gaps reported as unsupported-capability limitations.

#### Scenario: Identical tasks-format behavior across harnesses

- GIVEN the tasks-format definition in shared conventions
- WHEN `sdd-tasks` and `plan-reviewer` run under OpenCode, Claude Code, or Codex
- THEN the traceability fields and TDD ordering semantics are identical across all three harnesses
