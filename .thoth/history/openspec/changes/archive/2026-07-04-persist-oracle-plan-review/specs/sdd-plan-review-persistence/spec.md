# Delta for sdd-plan-review-persistence

## ADDED Requirements

### Requirement: Canonical Plan-Review Artifact

For persistence modes that include OpenSpec, the SDD pipeline MUST persist each Oracle `plan-review` result as the canonical artifact `openspec/changes/{change-name}/plan-review.md`. The artifact MUST be human-readable and MUST preserve enough structured data for deterministic recovery. At minimum, it MUST record the status token or equivalent blocker status, reviewer role, review timestamp, pipeline type, persistence mode, comments, non-blocking notes, blockers, user override context when applicable, and reviewed artifact freshness data.

#### Scenario: OpenSpec mode writes a plan-review artifact

- GIVEN an SDD change is running with persistence mode `openspec`
- AND Oracle completes `plan-review` for the change
- WHEN the plan-review result is persisted
- THEN `openspec/changes/{change-name}/plan-review.md` MUST exist
- AND the artifact MUST record the status token, reviewer role, timestamp, pipeline type, persistence mode, comments, non-blocking notes, blockers, and reviewed artifact freshness data

#### Scenario: Blocking review remains recoverable

- GIVEN Oracle returns a blocking or rejection result for `plan-review`
- WHEN the result is persisted
- THEN the plan-review artifact MUST preserve the blocker status
- AND it MUST preserve the blockers and reviewer comments needed to understand why advancement is blocked

#### Scenario: User override context is captured when applicable

- GIVEN `plan-review` blocks advancement and the user explicitly overrides through the harness blocking-input surface
- WHEN the plan-review result is persisted
- THEN the artifact MUST record that an override occurred
- AND it MUST include the override context needed to distinguish the override from an Oracle approval

### Requirement: Deterministic Memory Artifact for Memory-Including Modes

For persistence modes that include thoth-mem, the SDD pipeline MUST define a deterministic plan-review artifact topic key `sdd/{change-name}/plan-review`. The thoth-mem artifact content MUST match the canonical plan-review artifact content used for OpenSpec persistence, subject to the selected persistence mode. Hybrid mode MUST converge the OpenSpec and thoth-mem copies according to the shared persistence contract.

#### Scenario: thoth-mem mode uses deterministic topic key

- GIVEN an SDD change is running with persistence mode `thoth-mem`
- AND Oracle completes `plan-review`
- WHEN the result is persisted to memory
- THEN the artifact MUST use topic key `sdd/{change-name}/plan-review`
- AND repeated saves for the same change MUST converge on that same topic key

#### Scenario: Hybrid mode writes matching copies

- GIVEN an SDD change is running with persistence mode `hybrid`
- AND Oracle completes `plan-review`
- WHEN the result is persisted
- THEN `openspec/changes/{change-name}/plan-review.md` MUST be written
- AND thoth-mem topic key `sdd/{change-name}/plan-review` MUST be written with matching content
- AND recovery MUST handle divergence using the shared hybrid convergence rules

### Requirement: Reviewed Artifact Freshness

The plan-review artifact MUST record freshness data for every planning artifact whose content Oracle reviewed. The freshness data MUST allow recovery to determine whether the saved review still applies to the current planning artifacts. At minimum, the reviewed set MUST include all planning artifacts required for the active pipeline at the plan-review gate, including proposal, delta specs in full pipelines, design in full pipelines, and tasks.

#### Scenario: Freshness data names reviewed artifacts

- GIVEN Oracle reviews proposal, specs, design, and tasks in a full pipeline
- WHEN the plan-review artifact is written
- THEN the artifact MUST identify each reviewed planning artifact
- AND it MUST include freshness data for each reviewed artifact

#### Scenario: Accelerated pipeline freshness omits absent full-pipeline artifacts

- GIVEN Oracle reviews an accelerated pipeline that has proposal and tasks but no spec or design artifacts
- WHEN the plan-review artifact is written
- THEN the artifact MUST record freshness data for proposal and tasks
- AND it MUST NOT require absent full-pipeline spec or design artifacts to exist

### Requirement: Fresh Approval Satisfies Plan-Review Gate

SDD recovery MUST treat a saved fresh `[OKAY]` plan-review artifact as satisfying the `plan-review` gate. Recovery MUST NOT rerun Oracle solely because the root session, agent session, or compaction boundary changed. Recovery MUST keep the subsequent user implementation confirmation as a distinct gate that is not satisfied by plan-review approval.

#### Scenario: New session reuses fresh approval

- GIVEN `openspec/changes/{change-name}/plan-review.md` contains `[OKAY]`
- AND the reviewed artifact freshness data still matches the current planning artifacts
- WHEN the SDD workflow resumes in a new session
- THEN recovery MUST treat the `plan-review` gate as complete
- AND it MUST NOT rerun Oracle solely due to the session change

#### Scenario: Plan-review approval does not confirm implementation

- GIVEN recovery accepts a fresh `[OKAY]` plan-review artifact
- WHEN the workflow reaches the post-review user decision point
- THEN the system MUST still require explicit user confirmation before dispatching implementation
- AND it MUST NOT treat Oracle approval as user implementation confirmation

### Requirement: Stale Approval Requires Rerun

SDD recovery MUST treat a saved approval as stale when any reviewed planning artifact has changed since the plan-review artifact was written. A stale approval MUST NOT satisfy the `plan-review` gate and MUST require rerunning Oracle before advancement, unless a separate explicit user override is captured through the normal blocking-input surface.

#### Scenario: Changed task file invalidates approval

- GIVEN a plan-review artifact contains `[OKAY]`
- AND the artifact records freshness data for `openspec/changes/{change-name}/tasks.md`
- WHEN `tasks.md` changes after review
- THEN recovery MUST treat the saved approval as stale
- AND the `plan-review` gate MUST require a new Oracle review

#### Scenario: Changed full-pipeline spec invalidates approval

- GIVEN a full-pipeline plan-review artifact contains `[OKAY]`
- AND the artifact records freshness data for a reviewed delta spec file
- WHEN that delta spec file changes after review
- THEN recovery MUST treat the saved approval as stale
- AND the `plan-review` gate MUST require a new Oracle review

### Requirement: Legacy Changes Are Not Approved By Default

For existing or legacy changes that do not contain a plan-review artifact, recovery MUST NOT infer that `plan-review` has passed. Missing plan-review evidence MUST be safe by default: recovery MAY report that no durable approval exists, but it MUST require a fresh Oracle review before treating the gate as complete.

#### Scenario: Missing artifact requires review

- GIVEN an existing change has proposal, design, and tasks artifacts
- AND it has no `plan-review.md` artifact or deterministic thoth-mem `sdd/{change-name}/plan-review` artifact available under the selected persistence mode
- WHEN the SDD workflow resumes at or after the plan-review point
- THEN recovery MUST NOT treat the change as approved
- AND it MUST require Oracle `plan-review` before the gate is complete

#### Scenario: Non-approval status does not satisfy gate

- GIVEN a plan-review artifact exists with a status other than `[OKAY]` or an equivalent explicit approval token
- WHEN recovery evaluates the `plan-review` gate
- THEN recovery MUST NOT treat the gate as complete
- AND it MUST preserve the recorded blocker status for the user or next review

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions

- The OpenSpec artifact path is `openspec/changes/{change-name}/plan-review.md` because no existing convention defines a plan-review artifact path and this location matches other change-local SDD artifacts.
- The deterministic memory topic key is `sdd/{change-name}/plan-review`, extending the existing SDD artifact topic-key pattern for this newly durable gate result.
- Freshness data can be implemented with hashes, revision IDs, normalized manifests, or another deterministic mechanism chosen during design, as long as it satisfies the recovery behavior above.

## handoffHints

- Design MUST preserve the distinction between Oracle plan-review approval and the separate user implementation confirmation gate.
- Design MUST specify the concrete reviewed-artifact freshness mechanism and how hybrid divergence is repaired.
- Design MUST update shared OpenSpec and thoth-mem conventions so the new artifact path and topic key are canonical across harnesses.
