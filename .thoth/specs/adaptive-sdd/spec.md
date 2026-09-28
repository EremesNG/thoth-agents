# Spec: Adaptive SDD

## Purpose

Durable behavioral contract for proportional understanding, classification,
implementation, verification, and closeout.

## Requirements

### Requirement: Understand proportionally before classification

The root MUST complete `explore`, `specify`, and `clarify` in order for every
change, at a depth proportional to uncertainty and impact, before classifying.
These are reasoning phases, not mandatory artifacts, staffing, or interviews.
The root MUST investigate repository facts before asking the user, use a safe
bounded assumption only when it preserves intent, and ask only for material
human-owned decisions. An unresolved material decision MUST block classification
and implementation.

#### Scenario: Small localized work spans files

- **GIVEN** a clear low-risk mechanical fix touches a few files in one area
- **WHEN** understanding is complete
- **THEN** it proceeds to classification without a required document, specialist, or interview

#### Scenario: Material ambiguity remains

- **GIVEN** acceptance depends on an unresolved human-owned decision
- **WHEN** clarification completes
- **THEN** classification and implementation remain blocked until the decision is resolved

#### Scenario: Repository evidence can answer a question

- **GIVEN** a material uncertainty concerns current repository behavior
- **WHEN** clarification is needed
- **THEN** the root investigates relevant evidence before asking the user

### Requirement: Classify by coordination, uncertainty, and risk

Only after understanding is complete may the root classify using meaningful
coordination and contract impact, uncertainty, and risk/failure cost. Scope MUST
represent impact and coordination, not the number of changed files. Clear,
low-risk work localized to one area MAY touch several files and remain small.
Coordinated multi-area work, cross-cutting contract impact, material uncertainty,
or elevated risk MUST receive substantial planning. Risk MAY require planning
for a small patch. Increased scope or risk MUST reopen understanding and
classification before implementation expands. No user-facing or machine-facing
SDD route selection interface is permitted.

#### Scenario: File count alone does not escalate

- **GIVEN** a localized, clear, low-risk mechanical change spans several files
- **WHEN** its impact remains within one area
- **THEN** it remains eligible for small, record-free test-first implementation

#### Scenario: Elevated risk requires planning

- **GIVEN** a small patch has high failure or contract risk
- **WHEN** understanding is complete
- **THEN** it is classified as substantial and planned

#### Scenario: Scope or risk grows

- **GIVEN** implementation exposes broader coordination, uncertainty, or risk
- **WHEN** work would expand beyond the current classification
- **THEN** understanding and classification reopen before further implementation

### Requirement: Persist one stable record only for substantial work

Small, clear, low-risk work MUST use test-first implementation and focused
verification without a persistent record. Substantial work MUST create exactly
one `.thoth/changes/<id>/<id>.md` record after classification. The ID MUST be
safe lowercase kebab-case with path containment enforced. The record MUST hold
accepted intent, non-goals, acceptance, material decisions, durable deltas, plan,
tasks, authorization, verification, and closeout. No alias, identity manifest,
second planning narrative, per-change report, evidence directory, worker packet,
process script, execution wrapper, or evidence generator MAY be created, even
temporarily.

#### Scenario: Small work remains artifact-free

- **GIVEN** work is classified as small
- **WHEN** implementation and verification complete
- **THEN** no persistent SDD record or sidecar artifact is required

#### Scenario: Substantial work has one ID-named record

- **GIVEN** work is classified as substantial
- **WHEN** planning begins
- **THEN** the sole record is `.thoth/changes/<id>/<id>.md` and no alias is created

### Requirement: Preserve selected review and implementation authorization

Substantial work MUST use a plan and tasks before implementation. Checklist and
convergence are conditional. Optional fresh read-only Oracle plan review runs
only when selected and MUST NOT authorize implementation. After a selected review
returns `[OKAY]`, the root MUST preserve a separate `Implement (Recommended)` /
`Stop` decision; explicit Stop MUST win. For each of these two choices
separately, only the third confirmed answerless native return MAY select its
recommendation. Pending dialogs, unavailable tools or UI, failed questions, and
interruption MUST NOT count. These defaults MUST NOT settle material human-owned
decisions. Same-intent review blockers require correction and a fresh review.

#### Scenario: Review approval does not authorize execution

- **GIVEN** a selected Oracle review returns `[OKAY]`
- **WHEN** no implementation choice has been received
- **THEN** implementation remains blocked pending the separate choice

#### Scenario: Explicit Stop wins

- **GIVEN** the user selects Stop after review
- **WHEN** the answer is received
- **THEN** implementation does not begin

#### Scenario: Unavailable question surface does not count

- **GIVEN** a plan-choice prompt cannot be delivered or returns pending
- **WHEN** the native state is unavailable or unresolved
- **THEN** no unanswered attempt is inferred and no choice is defaulted

### Requirement: Verify independently and archive declared deltas

Every change MUST be verified. Small low-risk work receives focused checks.
Substantial or materially risky work MUST receive fresh independent read-only
Oracle judgment against accepted intent, the actual diff, executed checks, and
residual risks; no implementation writer may approve their own work. A failed
check or blocker MUST prevent closeout until corrected and reverified. After
passing verification and complete closeout, archive MUST transactionally apply
only declared exact-title durable deltas under `.thoth/specs/` and move the same
record to `.thoth/changes/archive/YYYY-MM-DD-<id>/<id>.md`. The record filename
MUST remain stable; the date appears only in the archive directory. Historical
changes MUST remain preserved. Unsafe IDs, collisions, and symlinked ancestors
MUST fail closed.

#### Scenario: Material risk requires fresh independent judgment

- **GIVEN** substantial or materially risky work reaches verification
- **WHEN** implementation evidence is complete
- **THEN** a fresh read-only Oracle judges accepted intent, the actual diff, checks, and risks

#### Scenario: Archive preserves record identity

- **GIVEN** complete passing work and declared durable deltas
- **WHEN** archive runs
- **THEN** it applies only those deltas and moves `<id>.md` into the date-prefixed directory without renaming it

### Requirement: Keep active governance in `.thoth`

The active constitution MUST reside at `.thoth/constitution.md`, and durable
specifications MUST reside under `.thoth/specs/`. Initialization MUST create
only missing minimum `.thoth/` paths and preserve existing project-owned content.
It MUST refuse an active legacy OpenSpec tree rather than creating a duplicate
active store. Historical material under `.thoth/history/openspec/` MUST remain
preserved but MUST NOT become an active workflow dependency.

#### Scenario: Initialize a new project

- **GIVEN** no project governance exists
- **WHEN** `thoth-init` runs
- **THEN** it creates minimum `.thoth/` paths without creating an active OpenSpec tree

#### Scenario: Preserve existing governance

- **GIVEN** an existing project constitution, specification, or historical record
- **WHEN** `thoth-init` runs
- **THEN** existing content remains byte-for-byte unchanged
