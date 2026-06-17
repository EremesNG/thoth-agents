# Delta for sdd-requirements-quality

A domain-typed requirements-quality checklist ("unit tests for English")
generated at or after the spec phase, validating requirement QUALITY and gating
progression to tasks with an explicit user override. Gated by a dedicated
`config.yaml rules:` section.

## ADDED Requirements

### Requirement: Domain-Typed Requirements-Quality Checklist Artifact

The SDD pipeline MUST produce a domain-typed requirements-quality checklist
artifact at or after the spec phase, generated for the change under
`openspec/changes/{change-name}/`. The checklist MUST contain items that
validate requirement QUALITY along the dimensions of completeness, clarity,
measurability, and testability, and MUST be organized per spec domain so that
each authored domain is covered.

#### Scenario: Checklist is generated for each spec domain

- GIVEN a change whose spec phase authored three domain spec files
- WHEN the requirements-quality checklist is generated
- THEN the checklist artifact exists under the change directory
- AND it contains quality items covering all three domains

#### Scenario: Checklist items cover the required quality dimensions

- GIVEN a generated requirements-quality checklist
- WHEN the checklist is inspected
- THEN every domain section includes items addressing completeness, clarity, measurability, and testability

### Requirement: Checklist Gate Before Tasks

Progression from the spec phase to the tasks phase MUST be gated on the
requirements-quality checklist being complete (every checklist item resolved as
pass or explicitly waived). An incomplete checklist MUST block progression to
tasks. The block MUST be overridable only through an explicit user decision via
the harness blocking-input surface, and the override MUST be logged.

#### Scenario: Incomplete checklist blocks tasks

- GIVEN a requirements-quality checklist with at least one unresolved item
- WHEN the pipeline attempts to advance to the tasks phase
- THEN progression is blocked
- AND the unresolved items are reported

#### Scenario: Complete checklist allows tasks

- GIVEN a requirements-quality checklist where every item is resolved as pass or explicitly waived
- WHEN the pipeline advances to the tasks phase
- THEN progression proceeds without a block

#### Scenario: User override unblocks an incomplete checklist

- GIVEN an incomplete checklist blocking progression to tasks
- WHEN the user explicitly overrides through the harness blocking-input surface
- THEN the override decision is logged with the unresolved item identities
- AND progression to tasks proceeds

### Requirement: Harness-Agnostic Checklist Mechanism

The checklist artifact format, quality dimensions, and gate semantics MUST be
defined once in shared conventions and behave identically across OpenCode,
Claude Code, and Codex, with per-harness prose limited to declared capability
gaps reported as unsupported-capability limitations.

#### Scenario: Identical checklist behavior across harnesses

- GIVEN the requirements-quality checklist definition in shared conventions
- WHEN the checklist is generated and gated under OpenCode, Claude Code, or Codex
- THEN the artifact format and gate semantics are identical across all three harnesses

### Requirement: Requirements-Quality Config Section

`openspec/config.yaml` MUST expose a dedicated `rules:` section that gates the
requirements-quality checklist mechanism, including whether the incomplete
checklist block is enforced. When the section disables enforcement, an
incomplete checklist MUST be reported but MUST NOT block progression to tasks.

#### Scenario: Disabled config downgrades the checklist block to a report

- GIVEN a `config.yaml rules:` requirements-quality section with blocking disabled
- WHEN an incomplete checklist would otherwise block progression
- THEN the incomplete items are reported
- AND progression to tasks is not blocked
