# Spec: Adaptive SDD

## Requirements

### Requirement: Select the lightest safe route

The system MUST assess intent, scope, clarity, contract risk, and failure cost, present an evidence-based Direct, Accelerated, or Full recommendation, and obtain the user's explicit route selection before route-specific execution unless the user already named a route; the user's selected route MUST win.

#### Scenario: US1 - Choose the SDD route 1

- **GIVEN** the original request already names Direct, Accelerated, or Full
- **WHEN** routing starts
- **THEN** that request counts as the user's choice and

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

Pre-implementation `plan-review` MUST be conditional on the user's choice and owned by read-only Oracle when selected. Every post-implementation `verify` MUST remain owned by read-only Oracle for Direct, Accelerated, and Full, and no implementation writer or plan-review approval MAY satisfy final verification.

#### Scenario: US2 - Decide whether Oracle reviews the plan 1

- **GIVEN** the user chooses review
- **WHEN** Oracle applies `plan-reviewer`
- **THEN** it returns `[OKAY]` or `[REJECT]`, reports no more than three true

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

### Requirement: Offer user-controlled plan review

After an Accelerated or Full change passes the `ready` gate, the system MUST recommend Oracle plan review and MUST let the user choose that review or proceed without it before implementation; Direct MUST NOT activate this choice.

#### Scenario: US2 - Decide whether Oracle reviews the plan 1

- **GIVEN** the user chooses review
- **WHEN** Oracle applies `plan-reviewer`
- **THEN** it returns `[OKAY]` or `[REJECT]`, reports no more than three true

### Requirement: Execute and persist selected plan review

When the user selects review, the system MUST load the bundled `plan-reviewer` contract, delegate read-only review to Oracle, preserve exact `[OKAY]`/`[REJECT]` semantics with at most three blockers, and let the root persist `openspec/changes/<feature>/plan-review.md` with SHA-256 freshness data for the reviewed planning artifacts. A declined review MUST NOT block implementation, and `[OKAY]` MUST NOT itself authorize implementation.

#### Scenario: US2 - Decide whether Oracle reviews the plan 1

- **GIVEN** the user chooses review
- **WHEN** Oracle applies `plan-reviewer`
- **THEN** it returns `[OKAY]` or `[REJECT]`, reports no more than three true

### Requirement: Limit thoth-init to project governance

The bundled `thoth-init` operation MUST only create, inspect, or update paths beneath the target project's `openspec/` directory and MUST NOT install skills, agents, plugins, harness configuration, or external dependencies.

#### Scenario: US2 - Initialize only project OpenSpec governance 1

- **GIVEN** an empty project directory
- **WHEN** `thoth-init` runs
- **THEN** it creates the minimum `openspec/` directory graph, metadata, constitution, and missing SDD templates required by the governed flows

#### Scenario: US2 - Initialize only project OpenSpec governance 2

- **GIVEN** an existing constitution or template
- **WHEN** `thoth-init` synchronizes the structure
- **THEN** it preserves that project-owned file content and creates only missing governance assets

#### Scenario: US2 - Initialize only project OpenSpec governance 3

- **GIVEN** any supported harness invokes `thoth-init`
- **WHEN** initialization completes
- **THEN** it creates or changes no path outside `openspec/` and performs no network or installer command

#### Scenario: US2 - Initialize only project OpenSpec governance 4

- **GIVEN** a required OpenSpec directory path is occupied by a file
- **WHEN** initialization runs
- **THEN** it fails truthfully instead of creating a partial or misleading ready state

### Requirement: Synchronize the minimum OpenSpec structure

The bundled `thoth-init` operation MUST idempotently ensure the required `openspec/changes/archive/`, `openspec/specs/`, `openspec/memory/`, and `openspec/templates/` structure plus missing packaged governance assets while preserving existing project-owned constitutions and templates.

#### Scenario: US2 - Initialize only project OpenSpec governance 1

- **GIVEN** an empty project directory
- **WHEN** `thoth-init` runs
- **THEN** it creates the minimum `openspec/` directory graph, metadata, constitution, and missing SDD templates required by the governed flows

#### Scenario: US2 - Initialize only project OpenSpec governance 2

- **GIVEN** an existing constitution or template
- **WHEN** `thoth-init` synchronizes the structure
- **THEN** it preserves that project-owned file content and creates only missing governance assets

#### Scenario: US2 - Initialize only project OpenSpec governance 3

- **GIVEN** any supported harness invokes `thoth-init`
- **WHEN** initialization completes
- **THEN** it creates or changes no path outside `openspec/` and performs no network or installer command

#### Scenario: US2 - Initialize only project OpenSpec governance 4

- **GIVEN** a required OpenSpec directory path is occupied by a file
- **WHEN** initialization runs
- **THEN** it fails truthfully instead of creating a partial or misleading ready state
