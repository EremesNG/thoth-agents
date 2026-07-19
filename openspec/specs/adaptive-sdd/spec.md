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
- **THEN** the happy-path route is
  `specify -> plan -> tasks -> implement -> verify -> archive`
- **AND** accelerated SDD remains a first-class supported route.

#### Scenario: Full route

- **GIVEN** SDD is explicit, scope is materially uncertain/cross-cutting, or risk
  is high
- **THEN** the route is
  `explore -> specify -> plan -> tasks -> analyze -> implement -> verify -> archive`.

### Requirement: Preserve Spec Kit artifact semantics in openspec

Accelerated and full routes MUST create `spec.md`, `plan.md`, and `tasks.md`
under `openspec/changes/<feature>/`. Optional `research.md`, `data-model.md`,
`contracts/`, `quickstart.md`, and `checklists/requirements.md` MUST be created
only when useful. Artifact-backed verification MUST create `verify-report.md`,
and successful closeout MUST create `archive-report.md` before the dated archive
move.

### Requirement: Use phase agents instead of phase skills

`sdd-specify`, `sdd-plan`, and `sdd-tasks` MUST own their corresponding
coordination artifacts and MUST NOT implement product code or delegate further.
The system MUST NOT bundle legacy SDD phase skills.

### Requirement: Define one canonical protocol for every phase

Every SDD phase MUST declare its objective, required inputs, instructions,
allowed writes, output schema, completion criteria, blocking conditions, and
handoff in the shared TypeScript contract. Reused roles MUST activate only the
protocol named by the dispatch envelope.

Every delegated SDD phase MUST receive these fields: `PHASE`, `ROUTE / CHANGE`,
`OBJECTIVE`, `INPUT ARTIFACTS`, `REQUIREMENTS`, `BOUNDARIES`, `VERIFICATION`,
`EXPECTED OUTPUT`, and `HANDOFF`.

#### Scenario: Oracle receives analyze mode

- **GIVEN** Full SDD has produced spec, plan, and tasks
- **WHEN** the root delegates `phase=analyze` to `oracle`
- **THEN** the oracle performs read-only cross-artifact consistency analysis
- **AND** returns requirement coverage, severity-graded findings, and a readiness
  verdict instead of applying the verify protocol.

#### Scenario: Quick receives archive mode

- **GIVEN** an artifact-backed route has a passing verification
- **WHEN** the root delegates `phase=archive` to `quick`
- **THEN** quick applies only the mechanical archive protocol
- **AND** does not reinterpret requirements or perform implementation work.

### Requirement: Keep optional phases conditional

Clarification MUST activate only for a material unresolved choice. A requirements
checklist MUST activate only for high-risk/compliance/ambiguity signals.
Clarification, requirements checklists, and convergence MUST remain unavailable
on Direct because they depend on governed coordination artifacts. Convergence
MUST activate only for actionable Accelerated/Full verification findings. It
MUST append traceable remaining work to `tasks.md`, MUST NOT rewrite existing
tasks, and MUST NOT edit product code. Control MUST return to implementation and
then verification.

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

Every route MUST include focused verification before completion. The root MUST
verify direct and accelerated work; full SDD MUST use independent oracle
analysis before implementation and independent oracle verification afterward.
Accelerated and Full MUST persist a compliance matrix, executed check evidence,
issues, risks, and an explicit `pass` or `fail` verdict in `verify-report.md`. A
read-only oracle returns the report content and the root persists it.

#### Scenario: Failed verification converges

- **GIVEN** Accelerated or Full verification returns `fail` with actionable
  findings
- **THEN** `sdd-tasks` appends a new Convergence phase to `tasks.md`
- **AND** the route continues `implement -> verify`
- **AND** archive remains blocked.

#### Scenario: Failed Direct verification retries without SDD artifacts

- **GIVEN** Direct verification returns `fail`
- **THEN** the root returns directly to `implement -> verify`
- **AND** no `tasks.md`, convergence phase, or archive is created.

### Requirement: Archive verified artifact-backed changes

Accelerated and Full MUST archive only when every task is complete,
`verify-report.md` records `pass`, and no unresolved critical issue remains.
Archive MUST create `archive-report.md` and move the complete change to
`openspec/changes/archive/YYYY-MM-DD-<feature>/`.

Archive MUST NOT implicitly merge the feature specification into
`openspec/specs/`; permanent specification or documentation changes MUST be
explicit implementation tasks. Direct work MUST NOT create or archive an SDD
change directory.
