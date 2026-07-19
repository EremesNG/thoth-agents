# Spec: Adaptive SDD

## Requirements

### Requirement: Select the lightest safe route

The adaptive root MUST select `direct`, `accelerated`, or `full` from intent,
scope, clarity, contract risk, and failure cost. An explicitly named route MUST
win. A generic request to use SDD MUST make Accelerated the minimum without
preventing Full when Full risk signals apply.

Clear low-risk documentation or mechanical work MAY remain Direct across
multiple files. File count alone MUST NOT add artifact ceremony or delegation.

#### Scenario: Direct route

- **GIVEN** work is clear, bounded, low risk, and documentation/mechanical
- **THEN** the route is `implement -> verify`
- **AND** no coordination artifacts are created.

#### Scenario: Accelerated route

- **GIVEN** SDD is requested generically, clarity is partial, risk is moderate,
  or behavior/architecture spans multiple surfaces
- **THEN** the route is
  `specify -> plan -> tasks -> implement -> verify -> archive`
- **AND** root fast-forwards specification, plan, and tasks without routine user
  pauses.

#### Scenario: Full route

- **GIVEN** a material decision is unresolved, behavior/architecture is
  cross-cutting, contract risk is high, or failure cost is high
- **THEN** the route is
  `explore -> specify -> plan -> tasks -> analyze -> implement -> verify -> archive`.

### Requirement: Load phase contracts on demand

The root MUST own sequential coordination for `specify`, `clarify`, `plan`,
`checklist`, `tasks`, `converge`, verification-report persistence, and `archive`.
Detailed contracts MUST be loaded from bundled workflow skills only when the
current phase requires them. The system MUST NOT register phase-only agents or
inflate every role prompt with every phase protocol.

After installation, an SDD phase MUST NOT invoke the thoth-agents CLI,
`npx skills add`, or a network fetch. Missing local contracts MUST be reported as
installation drift.

### Requirement: Preserve traceable specification semantics

Accelerated and Full MUST create `spec.md`, `plan.md`, and `tasks.md` under
`openspec/changes/<feature>/`. A specification MUST record Why, Impact, and
affected capability slugs; prioritized independent `US#` stories; explicit
story-to-FR/SC coverage; Given/When/Then scenarios; assumptions; dependencies;
edge cases; and non-goals.

Every FR MUST have a sequential ID, descriptive title, normative `MUST`/`SHALL`
statement, and exactly one marker: INTERNAL, ADDED, MODIFIED, REMOVED, or RENAMED
with a capability target. Every SC MUST be typed buildable or outcome. Buildable
SCs MUST receive executable task coverage; outcome SCs MUST remain measurable
verification targets and MUST NOT create fake implementation work.

### Requirement: Preserve executable planning and task semantics

Plans MUST record evidence-backed pre/post Constitution checks and map technical
decisions to requirements, exact paths/interfaces, risk, migration/rollback, and
verification seams. Optional research, data model, contract, quickstart, or
checklist artifacts MUST exist only for a concrete risk.

Tasks MUST use `T### [P?] [US#?]` grammar, identify an independent MVP, state
dependencies, put behavior tests before implementation, include exact paths and
verification outcomes, and cover every FR/buildable SC. `[P]` MUST identify a
proven non-overlapping pairing; otherwise tasks MUST record why no safe parallel
work exists.

### Requirement: Keep requirement checklists conditional and structured

A checklist MUST activate only for material contract/failure risk, compliance
sensitivity, or ambiguity-prone scope and MUST record the activation reason. It
MUST cover Completeness, Clarity, Consistency, Measurability, and Coverage with
stable `CHK###` IDs.

Applicable domain lenses MUST be derived from actual security, privacy,
accessibility, compliance, performance, migration, or domain risk. If none
apply, the checklist MUST record evidence-backed None. After
requirement-affecting changes it MUST record checked revalidation; if nothing
relevant changed it MUST record an evidence-backed no-op.

### Requirement: Enforce route-specific structural gates

The validator MUST expose `specify`, `plan`, `tasks`, `checklist`, `ready`, and
`closeout` gates. Accelerated MUST validate specify, ready, and closeout; Full
MUST additionally validate plan and tasks separately. A gate MUST NOT require a
future artifact.

`ready` MUST validate the pre-analysis/implementation set. `closeout` MUST
require completed tasks, independent oracle PASS, no unresolved CRITICAL
finding, complete FR/buildable-SC compliance evidence, an observed PASS with
concrete evidence or an explicit residual RISK for every outcome SC, and an
archive report marked READY. Structural validation MUST NOT substitute for
oracle judgment.

### Requirement: Isolate constitution lifecycle from routine SDD

Routine planning MUST read active constitution principles and record design
evidence, but MUST NOT bump or validate constitution lifecycle metadata. An
explicit constitution amendment MUST use complete governance SemVer, ISO dates,
a Sync Impact Report, placeholder validation, and propagation to affected
templates, instructions, and documentation.

### Requirement: Gate architectural grilling before specification

`architectural-grilling` MUST remain outside the required phase graph. The root
MUST invoke it only when explicitly requested or when a material human-owned
product/architecture decision cannot be resolved from evidence or a safe
assumption. Selecting Full alone MUST NOT activate it.

### Requirement: Require independent oracle judgment

`analyze` and every `verify` MUST be owned by read-only `oracle`, including
Direct and Accelerated. The implementing root or writer MUST NOT approve its own
work. Oracle MUST judge completeness, correctness, and cross-artifact coherence
as distinct dimensions.

Full analysis MUST challenge contradictions, ambiguity, duplication, scope
drift, task ordering, checklist state, Constitution compliance, and missing
FR/buildable-SC coverage. Verification MUST map every FR/buildable SC to
implementation evidence and executed checks. Artifact-backed verification MUST
persist `verify-report.md`; Direct returns the same judgment in-session.

### Requirement: Revalidate proportionally when evidence refines artifacts

When implementation evidence refines the accepted intent, root MUST update the
canonical artifact and revalidate only affected downstream artifacts and gates.
A changed intent MUST start a new change rather than expand the active one
silently.

### Requirement: Converge append-only after failed verification

For an artifact-backed FAIL, root MUST classify each gap as missing, partial,
contradicts, or unrequested and append one traceable task per actionable gap.
Convergence MUST NOT rewrite prior tasks or product code. When no actionable gap
exists, `tasks.md` MUST remain byte-for-byte unchanged. Oracle MUST verify again
after the next implementation pass.

### Requirement: Transactionally archive verified durable deltas

Accelerated and Full MUST archive only when closeout passes. Archive MUST
validate every declared durable delta before changing permanent specs, then
transactionally apply ADDED, MODIFIED, REMOVED, and RENAMED named requirement blocks
and their scenarios to `openspec/specs/`.

INTERNAL requirements and undeclared prose MUST NOT update permanent specs. If a
delta, report update, or final move raises a handled error, report recovery and
canonical rollback MUST be attempted independently, all recoverable canonical
writes MUST roll back, and the active change MUST remain in place.

Archive is not crash-atomic across forced process or operating-system
termination. It MUST disclose that staged or backup files may require inspection
before retrying.

On success, archive MUST mark `archive-report.md` ARCHIVED, record updated
capabilities or no durable delta, and move the complete change to
`openspec/changes/archive/YYYY-MM-DD-<feature>/`. Direct MUST NOT create or
archive an SDD change directory.
