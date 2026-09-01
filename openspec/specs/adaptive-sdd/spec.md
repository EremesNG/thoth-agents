# Spec: Adaptive SDD

## Requirements

### Requirement: Select the lightest safe route

The system MUST assess intent, scope, clarity, contract risk, and failure cost, present an evidence-based Direct, Accelerated, or Full recommendation, and obtain the user's explicit route selection before route-specific execution unless the user already named a route; the user's selected route MUST win.

#### Scenario: US1 - Choose the SDD route 1

- **GIVEN** the original request already names Direct, Accelerated, or Full
- **WHEN** routing starts
- **THEN** that request counts as the user's choice and

### Requirement: Load phase contracts on demand

The root MUST own sequential coordination for `specify`, `clarify`, `plan`, `checklist`, `tasks`, `converge`, verification-report persistence, and `archive`; it MUST load detailed contracts from bundled workflow skills only when the current phase requires them and resolve every bundled phase contract, template, validator, and sibling workflow reference relative to the installed skill contract; it MUST NOT register phase-only agents, inflate every role prompt with every phase protocol, interpret bundled asset references relative to the project, require `openspec/templates/`, invoke the thoth-agents CLI or `npx skills add`, perform a network fetch, or provision missing assets during an SDD, and missing local contracts MUST be reported as installation drift.

#### Scenario: US1 - Resolve workflow assets from the installed skill 1

- **GIVEN** `thoth-sdd` is installed and a project has no `openspec/templates/`
- **WHEN** an OpenCode agent loads a phase contract
- **THEN** it resolves the required template and validator from the installed skill bundle

#### Scenario: US1 - Resolve workflow assets from the installed skill 2

- **GIVEN** an installed workflow asset is missing
- **WHEN** a phase attempts to load it
- **THEN** the workflow reports installation drift instead of searching the project or downloading a replacement

### Requirement: Preserve traceable specification semantics

Accelerated and Full specification authoring MUST inspect every affected canonical capability before choosing durable delta metadata; `MODIFIED` and `REMOVED` MUST preserve an existing exact requirement title, `RENAMED` MUST name the exact previous title when the title changes, and `ADDED` MUST be used only when no canonical requirement already expresses the behavior.

#### Scenario: US1 - Reject incorrect delta intent before planning 1

- **GIVEN** a canonical capability already contains the exact named requirement
- **WHEN** the specification marks that title `ADDED`
- **THEN** the validator rejects it with a stable added-title-exists diagnostic

#### Scenario: US1 - Reject incorrect delta intent before planning 2

- **GIVEN** a canonical capability or named requirement does not exist
- **WHEN** the specification marks that title `MODIFIED` or `REMOVED`
- **THEN** the validator rejects it with a stable missing-title diagnostic

#### Scenario: US1 - Reject incorrect delta intent before planning 3

- **GIVEN** a rename names a missing previous title or collides with an existing destination title
- **WHEN** the specification gate runs
- **THEN** the validator rejects the invalid rename before planning

#### Scenario: US1 - Reject incorrect delta intent before planning 4

- **GIVEN** a valid addition targets an existing capability under a new exact title
- **WHEN** the specification gate runs
- **THEN** the validator accepts the deterministic title check and emits a semantic-overlap review warning that identifies the existing capability baseline

#### Scenario: US1 - Reject incorrect delta intent before planning 5

- **GIVEN** the root selects a durable marker
- **WHEN** it authors the specification
- **THEN** it first reads the affected canonical specification and preserves exact existing titles for modification or removal, uses `RENAMED` for title changes, and uses `ADDED` only for genuinely new behavior

### Requirement: Preserve executable planning and task semantics

Plans MUST map verification seams and exact ownership, while tasks MUST use globally sequential `T### [P?] [US#?]` grammar, exact repository-relative paths, concrete verification outcomes, and complete FR/buildable-SC coverage; every `[P]` task MUST belong to exactly one ordered lane inside one named parallel group, every group MUST declare at least two cross-lane-independent lanes, every lane MUST bind one or more ordered tasks and their exact path union to one eligible specialist owner, and every group MUST declare explicit external prerequisites, one downstream or final-verification barrier, and concrete independence evidence, while artifacts with no safe group MUST record one evidence-backed `None` reason.

#### Scenario: US1 - Declare executable parallel groups 1

- **GIVEN** two or more lanes with disjoint exact path sets and no cross-lane dependency
- **WHEN** tasks are authored
- **THEN** every `[P]` task appears in exactly one ordered lane inside one named parallel group with a lane-level specialist owner, explicit group prerequisites, a barrier, and concrete independence rationale

#### Scenario: US1 - Declare executable parallel groups 2

- **GIVEN** two lanes select the same specialist role
- **WHEN** implementation ownership is resolved
- **THEN** each lane remains a distinct fresh assignment bounded to the union of its task paths instead of being aggregated into one role-wide handoff

#### Scenario: US1 - Declare executable parallel groups 3

- **GIVEN** no safe multi-lane group exists
- **WHEN** tasks are authored
- **THEN** the artifact records one evidence-backed `None` reason and marks no task `[P]`

#### Scenario: US2 - Preserve dependency and ownership safety 1

- **GIVEN** one proposed lane consumes a task output from another lane in the same group
- **WHEN** the tasks gate runs
- **THEN** it rejects the cross-lane dependency while allowing ordered dependencies within a lane

#### Scenario: US2 - Preserve dependency and ownership safety 2

- **GIVEN** two proposed lanes own equal or ancestor-descendant task paths
- **WHEN** the tasks gate runs
- **THEN** it rejects the group as overlapping

#### Scenario: US2 - Preserve dependency and ownership safety 3

- **GIVEN** a `[P]` task is unknown, omitted, duplicated across lanes or groups, or its lane lacks an eligible specialist owner
- **WHEN** the tasks gate runs
- **THEN** it reports a stable structural diagnostic and blocks readiness

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

The validator MUST compare every declared durable delta with the canonical requirement baseline at `specify` and every downstream artifact gate, MUST reject deterministically incompatible exact-title operations with stable diagnostic codes, MUST evaluate multiple deltas in declaration order, MUST warn when an exact-title-valid `ADDED` targets an existing nonempty capability, and MUST preserve valid additions to absent capabilities and `[INTERNAL]` behavior.

#### Scenario: US1 - Reject incorrect delta intent before planning 1

- **GIVEN** a canonical capability already contains the exact named requirement
- **WHEN** the specification marks that title `ADDED`
- **THEN** the validator rejects it with a stable added-title-exists diagnostic

#### Scenario: US1 - Reject incorrect delta intent before planning 2

- **GIVEN** a canonical capability or named requirement does not exist
- **WHEN** the specification marks that title `MODIFIED` or `REMOVED`
- **THEN** the validator rejects it with a stable missing-title diagnostic

#### Scenario: US1 - Reject incorrect delta intent before planning 3

- **GIVEN** a rename names a missing previous title or collides with an existing destination title
- **WHEN** the specification gate runs
- **THEN** the validator rejects the invalid rename before planning

#### Scenario: US1 - Reject incorrect delta intent before planning 4

- **GIVEN** a valid addition targets an existing capability under a new exact title
- **WHEN** the specification gate runs
- **THEN** the validator accepts the deterministic title check and emits a semantic-overlap review warning that identifies the existing capability baseline

#### Scenario: US1 - Reject incorrect delta intent before planning 5

- **GIVEN** the root selects a durable marker
- **WHEN** it authors the specification
- **THEN** it first reads the affected canonical specification and preserves exact existing titles for modification or removal, uses `RENAMED` for title changes, and uses `ADDED` only for genuinely new behavior

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

Pre-implementation plan review MUST remain optional and user-controlled for Accelerated and Full. Final Oracle verification MUST remain mandatory for Accelerated and Full and MUST be required for Direct only when material architecture, security, cross-cutting regression, persistent diagnosis, contradictory evidence, high failure cost, or comparable uncertainty requires independent judgment. A trivial deterministic Direct change MUST be eligible for root-run focused verification without Oracle, while every actual Oracle approval or PASS judgment MUST use a fresh read-only instance and MUST NOT be replaced by an implementation writer's self-approval.

#### Scenario: US4 - Apply proportionate Oracle gates 1

- **GIVEN** a trivial Direct change with deterministic focused checks and no material risk or ambiguity
- **WHEN** implementation finishes
- **THEN** the root runs proportionate checks and completes without spawning Oracle

#### Scenario: US4 - Apply proportionate Oracle gates 2

- **GIVEN** a Direct change with material security, architecture, cross-cutting regression, persistent diagnosis, or high-cost uncertainty
- **WHEN** verification begins
- **THEN** a fresh read-only Oracle performs the independent judgment

#### Scenario: US4 - Apply proportionate Oracle gates 3

- **GIVEN** an Accelerated or Full implementation
- **WHEN** final verification begins
- **THEN** a fresh read-only Oracle remains mandatory; optional pre-implementation plan review neither replaces nor duplicates that final judgment

#### Scenario: US4 - Apply proportionate Oracle gates 4

- **GIVEN** an Oracle or other specialist has completed a different objective
- **WHEN** a new independent judgment begins
- **THEN** the root creates a fresh instance rather than reusing a role pool

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

Archive MUST use the same canonical parser and durable-delta preflight rules as the validator, MUST report the same stable incompatibility codes before staging or changing permanent specifications, and MUST preserve its existing transactional apply, rollback, report update, and dated-move behavior for valid deltas.

#### Scenario: US2 - Preserve the same final archive defense 1

- **GIVEN** an otherwise ready change marks an existing title `ADDED`
- **WHEN** archive preflight runs
- **THEN** it reports the same added-title-exists code, changes no canonical specification, and leaves the active change in place

#### Scenario: US2 - Preserve the same final archive defense 2

- **GIVEN** an otherwise ready change marks a missing title `MODIFIED`
- **WHEN** archive preflight runs
- **THEN** it reports the same missing-title code, changes no canonical specification, and leaves the active change in place

#### Scenario: US2 - Preserve the same final archive defense 3

- **GIVEN** all durable deltas agree with the canonical baseline
- **WHEN** archive runs
- **THEN** its existing transactional synchronization behavior remains unchanged

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

The bundled `thoth-init` operation MUST only create, inspect, or update paths beneath the target project's `openspec/` directory and MUST initialize only the minimum project OpenSpec governance surface; it MUST NOT install skills, agents, plugins, harness configuration, external dependencies, run network or installer commands, or create, copy, read, validate, or synchronize SDD workflow templates, and it MUST leave any pre-existing constitution and legacy `openspec/templates/` tree untouched.

#### Scenario: US2 - Initialize governance without duplicating workflow templates 1

- **GIVEN** an empty project
- **WHEN** `thoth-init` completes
- **THEN** it creates the required change, archive, spec, memory, metadata, and constitution assets but no `openspec/templates/` directory

#### Scenario: US2 - Initialize governance without duplicating workflow templates 2

- **GIVEN** a legacy project already contains `openspec/templates/`
- **WHEN** `thoth-init` synchronizes the project
- **THEN** it leaves that directory and its contents untouched

#### Scenario: US2 - Initialize governance without duplicating workflow templates 3

- **GIVEN** the initializer bundle has no `thoth-sdd/templates/`
- **WHEN** `thoth-init` runs
- **THEN** initialization still succeeds because those assets are outside its responsibility

#### Scenario: US2 - Initialize governance without duplicating workflow templates 4

- **GIVEN** a project-owned constitution already exists
- **WHEN** `thoth-init` synchronizes the project
- **THEN** it preserves that constitution byte-for-byte

#### Scenario: US2 - Initialize governance without duplicating workflow templates 5

- **GIVEN** any supported harness invokes `thoth-init`
- **WHEN** initialization completes
- **THEN** it changes no path outside `openspec/` and performs no network or installer command

#### Scenario: US2 - Initialize governance without duplicating workflow templates 6

- **GIVEN** a required OpenSpec directory path is occupied by a file
- **WHEN** initialization runs
- **THEN** it fails before writing any managed OpenSpec asset

### Requirement: Synchronize the minimum OpenSpec structure

The bundled `thoth-init` operation MUST idempotently ensure `openspec/changes/archive/`, `openspec/specs/`, `openspec/memory/`, `.thoth-agents.json`, and a missing packaged constitution while preserving existing project-owned assets and remaining independent of `thoth-sdd/templates/`; it MUST preflight every required source and target path before writing and fail truthfully without a partial ready state when a required directory or file path has an incompatible type.

#### Scenario: US2 - Initialize governance without duplicating workflow templates 1

- **GIVEN** an empty project
- **WHEN** `thoth-init` completes
- **THEN** it creates the required change, archive, spec, memory, metadata, and constitution assets but no `openspec/templates/` directory

#### Scenario: US2 - Initialize governance without duplicating workflow templates 2

- **GIVEN** a legacy project already contains `openspec/templates/`
- **WHEN** `thoth-init` synchronizes the project
- **THEN** it leaves that directory and its contents untouched

#### Scenario: US2 - Initialize governance without duplicating workflow templates 3

- **GIVEN** the initializer bundle has no `thoth-sdd/templates/`
- **WHEN** `thoth-init` runs
- **THEN** initialization still succeeds because those assets are outside its responsibility

#### Scenario: US2 - Initialize governance without duplicating workflow templates 4

- **GIVEN** a project-owned constitution already exists
- **WHEN** `thoth-init` synchronizes the project
- **THEN** it preserves that constitution byte-for-byte

#### Scenario: US2 - Initialize governance without duplicating workflow templates 5

- **GIVEN** any supported harness invokes `thoth-init`
- **WHEN** initialization completes
- **THEN** it changes no path outside `openspec/` and performs no network or installer command

#### Scenario: US2 - Initialize governance without duplicating workflow templates 6

- **GIVEN** a required OpenSpec directory path is occupied by a file
- **WHEN** initialization runs
- **THEN** it fails before writing any managed OpenSpec asset

### Requirement: Select specialist writers deterministically

After task shaping establishes a delegation benefit, the root MUST select `designer` for material user-facing experience, `quick` for a known narrow low-risk isolated lane, and `deep` for coupled or high-risk work; it MUST evaluate these triggers independently of SDD route and MUST preserve one writer per mutable surface.

#### Scenario: US2 - Activate the complete specialist roster 1

- **GIVEN** broad or uncertain local repository discovery
- **WHEN** the root selects a specialist
- **THEN** it selects `explorer` and keeps the assignment read-only

#### Scenario: US2 - Activate the complete specialist roster 2

- **GIVEN** current, unfamiliar, version-sensitive, or externally sourced facts are required
- **WHEN** the root selects a specialist
- **THEN** it selects `librarian`; stable facts already established locally do not trigger it

#### Scenario: US2 - Activate the complete specialist roster 3

- **GIVEN** material UI/UX, interaction, accessibility, or visual-quality work
- **WHEN** the root selects a writer
- **THEN** it selects `designer` with bounded user-facing ownership and visual verification

#### Scenario: US2 - Activate the complete specialist roster 4

- **GIVEN** a known, narrow, low-risk implementation lane inside a larger coordinated task
- **WHEN** its context and writes can be isolated
- **THEN** the root selects `quick` rather than consuming the root's coordination path

#### Scenario: US2 - Activate the complete specialist roster 5

- **GIVEN** coupled contracts, concurrency, migration, shared-state, edge-case-heavy, or high-risk implementation
- **WHEN** the root selects a writer
- **THEN** it selects `deep` instead of `quick`

#### Scenario: US2 - Activate the complete specialist roster 6

- **GIVEN** material architecture, security, persistent diagnosis, contradictory evidence, or high-cost uncertainty
- **WHEN** independent judgment would change confidence or authorization
- **THEN** the root selects a fresh read-only `oracle`
