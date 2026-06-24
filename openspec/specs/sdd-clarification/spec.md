# Spec: sdd-clarification

A dedicated `sdd-clarify` phase inserted into the Full SDD pipeline between
`spec` and `design`. It performs a taxonomy-driven scan of residual ambiguity
in the authored spec, runs bounded Q&A within the existing clarification cap,
writes resolutions back into the spec, and re-validates the
requirements-quality checklist. It is Full-SDD only and produces no new
permanent artifact (it updates the spec in place). Its boundary with the
upfront `requirements-interview` is explicit: no duplication.

## Requirements

### Requirement: Dedicated Clarify Phase Between Spec and Design

The Full SDD pipeline MUST include a dedicated `clarify` phase ordered after
`spec` and before `design`. The phase MUST be registered as an
`SddPhaseContract` and MUST appear in `FULL_SDD_PHASE_ORDER` and `SDD_PHASES`
in `src/harness/core/sdd.ts`. The `design` phase and every downstream phase MUST
declare prerequisites consistent with `clarify` preceding `design`.

#### Scenario: Clarify is ordered between spec and design

- GIVEN the Full SDD phase order
- WHEN the order is inspected
- THEN `clarify` appears after `spec` and before `design`

#### Scenario: Downstream prerequisites reflect the inserted phase

- GIVEN the inserted `clarify` phase
- WHEN the prerequisites of `design` and downstream phases are evaluated
- THEN they are consistent with `clarify` running between `spec` and `design`

### Requirement: Clarify Is Full-SDD Only

The `clarify` phase MUST run only in the Full SDD pipeline. The accelerated
pipeline, which produces no spec, MUST NOT include a `clarify` phase.

#### Scenario: Accelerated pipeline omits clarify

- GIVEN the accelerated SDD pipeline
- WHEN its phase order is inspected
- THEN no `clarify` phase is present

#### Scenario: Full pipeline includes clarify

- GIVEN the Full SDD pipeline
- WHEN its phase order is inspected
- THEN a `clarify` phase is present between spec and design

### Requirement: Taxonomy-Driven Residual-Ambiguity Scan

The `sdd-clarify` skill MUST scan the authored spec for residual ambiguity using
a defined taxonomy of ambiguity categories. The scan MUST identify unresolved
`[NEEDS CLARIFICATION]` markers and other taxonomy-classified ambiguities as
candidates for clarification.

#### Scenario: Residual ambiguity is detected by taxonomy

- GIVEN a spec containing a `[NEEDS CLARIFICATION]` marker and a taxonomy-classified ambiguity
- WHEN `sdd-clarify` scans the spec
- THEN both are identified as clarification candidates

#### Scenario: Unambiguous spec yields no candidates

- GIVEN a spec with no `[NEEDS CLARIFICATION]` markers and no taxonomy-classified ambiguity
- WHEN `sdd-clarify` scans the spec
- THEN no clarification candidates are produced

### Requirement: Bounded Clarification Q&A Within the Clarification Cap

`sdd-clarify` MUST run bounded Q&A for the identified clarification candidates,
bounded by the existing clarification policy cap
(`rules.clarification.max_markers_per_spec`). The number of clarification
exchanges resolved per spec file MUST NOT exceed that cap.

#### Scenario: Q&A stays within the configured cap

- GIVEN `rules.clarification.max_markers_per_spec` is 3
- AND a spec with more than 3 ambiguity candidates
- WHEN `sdd-clarify` runs bounded Q&A
- THEN at most 3 clarifications are resolved for that spec file

#### Scenario: Cap aligns with existing clarification policy

- GIVEN the configured clarification cap
- WHEN `sdd-clarify` bounds its Q&A
- THEN it uses the same cap value as the established clarification discipline rather than a separate bound

### Requirement: Write-Back of Resolutions Into the Spec

`sdd-clarify` MUST write resolved clarifications back so they are reflected in
the authoritative spec content consumed by the `design` phase. Resolved
ambiguities MUST replace or annotate the corresponding `[NEEDS CLARIFICATION]`
markers or ambiguous statements so the spec no longer presents them as
unresolved.

#### Scenario: Resolved marker is written back

- GIVEN a `[NEEDS CLARIFICATION]` marker resolved during Q&A
- WHEN `sdd-clarify` completes
- THEN the authoritative spec reflects the resolution
- AND the marker is no longer presented as unresolved

#### Scenario: Design consumes the clarified spec

- GIVEN `sdd-clarify` has written back resolutions
- WHEN the `design` phase reads the spec
- THEN it sees the clarified content

### Requirement: Re-Validation of the Requirements-Quality Checklist

After write-back, `sdd-clarify` MUST re-validate the requirements-quality
checklist at `openspec/changes/{change-name}/checklists/requirements.md` so the
checklist reflects the clarified spec before the pipeline advances to `design`.

#### Scenario: Checklist is re-validated after clarification

- GIVEN clarifications written back into the spec
- WHEN `sdd-clarify` completes
- THEN the requirements-quality checklist is re-validated against the clarified spec

#### Scenario: Re-validation surfaces newly satisfied items

- GIVEN a checklist item that was unmet due to an ambiguity now resolved
- WHEN `sdd-clarify` re-validates the checklist
- THEN the item's state reflects the resolution

### Requirement: Boundary With Requirements-Interview

The `sdd-clarify` phase MUST NOT duplicate the upfront `requirements-interview`.
`requirements-interview` remains the upfront, pre-pipeline discovery step;
`sdd-clarify` addresses only residual ambiguity that surfaces in the authored
spec after the spec phase. The two MUST have non-overlapping responsibilities.

#### Scenario: Clarify targets only post-spec residual ambiguity

- GIVEN ambiguity that was already resolved during the upfront requirements-interview
- WHEN `sdd-clarify` runs
- THEN it does not re-ask the already-resolved upfront questions
- AND it targets only ambiguity residual in the authored spec

#### Scenario: Requirements-interview stays upfront-only

- GIVEN the SDD pipeline
- WHEN the responsibilities of `requirements-interview` and `sdd-clarify` are compared
- THEN `requirements-interview` is upfront-only and `sdd-clarify` is mid-pipeline, with no duplicated scope

### Requirement: Clarify Routed Through the Delegation Matrix

The `sdd-clarify` phase MUST be represented in the SDD delegation matrix in
`src/agents/prompt-sections.ts` so it is routed consistently with the other SDD
phases. The matrix entry MUST reflect the phase's position between `spec` and
`design`.

#### Scenario: Delegation matrix includes clarify routing

- GIVEN the SDD delegation matrix
- WHEN it is rendered
- THEN it includes a routing entry for `sdd-clarify` consistent with its pipeline position

### Requirement: Harness-Agnostic Clarify Phase

The `clarify` phase contract, its phase-order position, its taxonomy-driven scan,
bounded Q&A, write-back, checklist re-validation, and delegation routing MUST be
defined once in the shared phase contract, shared conventions, and the shared
delegation matrix, and behave identically across OpenCode, Claude Code, and
Codex, with per-harness prose limited to declared capability gaps reported as
unsupported-capability limitations.

#### Scenario: Identical clarify behavior across harnesses

- GIVEN the clarify-phase definition in the shared layer
- WHEN the SDD pipeline runs under OpenCode, Claude Code, or Codex
- THEN the phase position, behavior, and routing are identical across all three harnesses
