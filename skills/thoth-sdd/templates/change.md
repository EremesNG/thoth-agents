# Change: <id>

**Classification**: substantial
**Scope**: <local|coordinated|cross-cutting>
**Uncertainty**: <low|medium|high>
**Risk**: <low|medium|high>

## Exploration

TBD: Confirm current behavior, constraints, and relevant repository evidence.

## Intent

TBD: State the accepted outcome.

## Non-goals

TBD: State boundaries and excluded work.

## Acceptance

- AC-1: TBD

## Clarifications

- PENDING: Record resolved material choices or that none are needed.

## Decisions

- PENDING: Record settled assumptions and human-owned decisions.

## Durable deltas

- None.

## Plan

TBD: Record the technical approach and focused verification seams.

## Tasks

Use one checkbox row per independently acceptable work unit. Keep each checkbox
on one line in the validator-compatible form `- [ ] AC-n: ...`; indent the
remaining fields below it. Repeat an AC number when separate units contribute
to that acceptance outcome. The row text names one reviewable result; do not
combine separately acceptable outcomes into a phase-sized task. Fill the
indented fields with concrete information. For a read-only unit, write `none`
for owned writes.

- [ ] AC-1: TBD
  - Outcome: one result that root can accept independently
  - Known entrypoints and skill paths: exact paths needed for this outcome
  - Inputs: concrete accepted evidence or upstream outputs
  - Dependencies: named upstream units and their accepted outputs, or none
  - Output: concrete finding, decision, or artifact
  - Owner: root or selected role
  - Writes: exact owned paths, or none for read-only work
  - Interface boundaries: relevant contracts and callers, or none
  - Focused check and PASS evidence: check to run and observable passing result
  - Return milestone: when root can review and accept this result
  - Stop / reassessment: smallest missing input, conflict, or new scope to return

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: PENDING
**Plan review selection**: PENDING
**Implementation**: PENDING

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: PENDING
**Independent from implementer**: PENDING
**Verdict**: PENDING
**Reviewed record SHA-256**: PENDING

- AC-1: PENDING | check | evidence
- Source: relative/path | sha256:<actual-source-digest>
- Source: .thoth/specs/<capability>/spec.md | sha256:<actual-source-digest>
- Source: .thoth/specs/<new-capability>/spec.md | absent

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: PENDING
