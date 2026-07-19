# Spec: Adaptive SDD

## Requirements

### Requirement: Select the lightest safe route

The adaptive root MUST select `direct`, `accelerated`, or `full` from intent,
scope, clarity, contract risk, failure cost, and an explicit SDD request. It MUST
NOT add artifact ceremony or delegation when clear bounded work can be completed
directly.

#### Scenario: Direct route

- **GIVEN** work is clear, local, and low risk
- **THEN** the route is `implement -> verify`
- **AND** no coordination artifacts are created.

#### Scenario: Accelerated route

- **GIVEN** work is bounded multi-file or moderate risk
- **THEN** the route is
  `specify -> plan -> tasks -> implement -> verify -> archive`
- **AND** it uses the canonical artifact formats and validator used by Full.

#### Scenario: Full route

- **GIVEN** SDD is explicit, scope is uncertain or cross-cutting, or failure cost
  is high
- **THEN** the route is
  `explore -> specify -> plan -> tasks -> analyze -> implement -> verify -> archive`.

### Requirement: Load phase contracts on demand

The root MUST own sequential coordination for `specify`, `clarify`, `plan`,
`checklist`, `tasks`, `converge`, verification-report persistence, and `archive`.
Detailed contracts MUST be loaded from the bundled `thoth-sdd`,
`thoth-constitution`, and `thoth-archive` skills only when the current phase
requires them. The system MUST NOT register phase-only agents or inflate every
agent prompt with all phase protocols. Once installation is complete, an SDD
phase MUST NOT invoke the thoth-agents CLI, `npx skills add`, or a network fetch;
missing local contracts MUST be reported as installation drift.

#### Scenario: Root advances an artifact-backed route

- **WHEN** a route reaches a coordination phase
- **THEN** root reads only that phase's bundled reference and required template
- **AND** validates the artifact before the next downstream gate.

### Requirement: Preserve Spec Kit-grade artifact semantics

Accelerated and Full MUST create `spec.md`, `plan.md`, and `tasks.md` under
`openspec/changes/<feature>/`. Specifications MUST contain prioritized,
independently testable `US#` stories, Given/When/Then acceptance scenarios,
unique `FR-###` requirements, measurable `SC-###` criteria, assumptions,
dependencies, edge cases, and explicit out-of-scope boundaries.

Plans MUST record pre-design and post-design Constitution checks and map
technical decisions to requirements, paths/interfaces, and verification seams.
Tasks MUST use `T### [P?] [US#?]` grammar, identify an MVP, preserve independent
story slices, name dependencies and safe parallel examples, place behavior tests
before implementation, and map every FR/SC to executable work.

Optional `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, and
`checklists/requirements.md` MUST be created only when useful.

### Requirement: Enforce structural gates and independent judgment

The bundled validator MUST reject malformed identifiers, missing story
independence or acceptance examples, incomplete requirement/task coverage,
missing Constitution checks, invalid task ordering or grammar, and incomplete
checklist taxonomy or revalidation. Structural validation MUST NOT substitute
for semantic oracle review.

### Requirement: Keep optional gates conditional

Clarification MUST activate only for material ambiguity. A requirements
checklist MUST activate only for high-risk, compliance-sensitive, or
ambiguity-prone scope. Convergence MUST activate only for actionable
Accelerated/Full verification failures. These artifact-dependent gates MUST NOT
run on Direct.

Clarification MUST update canonical requirements instead of creating a parallel
artifact. Checklists MUST use stable `CHK###` identifiers across Completeness,
Clarity, Consistency, Measurability, and Coverage, and MUST record a distinct
revalidation after accepted changes. Convergence MUST append traceable tasks and
MUST NOT rewrite earlier tasks or edit product code.

### Requirement: Gate architectural grilling before specification

`architectural-grilling` MUST remain outside the required phase graph. The root
MUST invoke it before specification only when explicitly requested or when a
material human-owned product or architecture decision cannot be resolved from
evidence or a safe documented assumption. Selecting Full alone MUST NOT activate
it.

### Requirement: Require independent oracle review

`analyze` and every `verify` execution MUST be owned by read-only `oracle`,
including Direct and Accelerated. The implementing root or writer MUST NOT
approve its own work. Full analysis MUST challenge cross-artifact consistency,
coverage, task ordering, checklist state, and Constitution compliance before
implementation.

Artifact-backed verification MUST persist `verify-report.md` with an explicit
PASS/FAIL verdict, compliance matrix, executed checks, stable findings, and
residual risks. Direct verification returns the same judgment in-session without
creating artifacts.

#### Scenario: Verification fails

- **GIVEN** oracle returns FAIL for Accelerated or Full
- **THEN** root appends convergence tasks linked to findings and FR/SC
- **AND** assigns implementation to a separate writer before asking oracle to
  verify again
- **AND** archive remains blocked.

#### Scenario: Direct verification fails

- **GIVEN** oracle returns FAIL for Direct
- **THEN** root returns to `implement -> verify`
- **AND** no SDD change directory or convergence artifact is created.

### Requirement: Archive verified artifact-backed changes

Accelerated and Full MUST archive only when all tasks are complete,
`verify-report.md` records PASS, and no unresolved CRITICAL finding remains.
Archive MUST create `archive-report.md` and move the complete change to
`openspec/changes/archive/YYYY-MM-DD-<feature>/`.

Archive MUST NOT implicitly merge the feature into `openspec/specs/`; durable
specification or documentation changes MUST be explicit implementation tasks.
Direct work MUST NOT create or archive an SDD change directory.
