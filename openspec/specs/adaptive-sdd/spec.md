# Spec: Adaptive SDD

## Requirements

### Requirement: Classify three routes

The root MUST select `direct`, `accelerated`, or `full` from intent, scope,
clarity, contract risk, failure cost, and an explicit SDD request.

#### Scenario: Direct route

- **GIVEN** work is clear, local, and low risk
- **THEN** the route is `implement -> verify`
- **AND** no coordination artifacts are required.

#### Scenario: Accelerated route

- **GIVEN** work is bounded multi-file, partially clear, or medium risk
- **THEN** the route is `specify -> plan -> tasks -> implement -> verify`
- **AND** accelerated SDD remains a first-class supported route.

#### Scenario: Full route

- **GIVEN** SDD is explicit, scope is materially uncertain/cross-cutting, or risk
  is high
- **THEN** the route is
  `explore -> specify -> plan -> tasks -> analyze -> implement -> verify`.

### Requirement: Preserve Spec Kit artifact semantics in openspec

Accelerated and full routes MUST create `spec.md`, `plan.md`, and `tasks.md`
under `openspec/changes/<feature>/`. Optional `research.md`, `data-model.md`,
`contracts/`, `quickstart.md`, and `checklists/requirements.md` MUST be created
only when useful.

### Requirement: Use phase agents instead of phase skills

`sdd-specify`, `sdd-plan`, and `sdd-tasks` MUST own their corresponding
coordination artifacts and MUST NOT implement product code or delegate further.
The system MUST NOT bundle legacy SDD phase skills.

### Requirement: Keep optional phases conditional

Clarification MUST activate only for a material unresolved choice. A requirements
checklist MUST activate only for high-risk/compliance/ambiguity signals.
Convergence MUST activate only for actionable verification findings.

### Requirement: Gate architectural grilling before specification

`architectural-grilling` MUST remain outside the required SDD phase graph. The
root MUST invoke it before specification only when the user explicitly requests
the interview or material human-owned product/architecture decisions remain
unresolved. Selecting Full SDD alone MUST NOT activate it.

#### Scenario: Decision tree requires grilling

- **GIVEN** a material product or architecture branch requires a human decision
- **WHEN** the root cannot resolve it from evidence or a safe local assumption
- **THEN** `architectural-grilling` runs in discovery/decision mode before
  `sdd-specify`
- **AND** accepted decisions feed canonical `spec.md` and `plan.md` artifacts.

#### Scenario: Routine SDD does not require grilling

- **GIVEN** the SDD route and material decisions are already clear
- **THEN** the root MUST continue the selected route without invoking
  `architectural-grilling`.

### Requirement: Verify proportionally

Every route MUST end with focused verification. The root MUST verify direct and
accelerated work; full SDD MUST use independent oracle analysis before
implementation and independent oracle verification afterward.
