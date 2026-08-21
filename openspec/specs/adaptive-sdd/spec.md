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

Plans MUST record evidence-backed pre/post Constitution checks using the same exact active principle headings and map technical decisions to requirements, exact paths/interfaces, risk, migration/rollback, and verification seams; optional research, data-model, contract, quickstart, or checklist artifacts MUST exist only for a concrete risk; tasks MUST use globally sequential `T### [P?] [US#?]` grammar starting at `T001`, identify an independent MVP, state dependencies, put behavior tests before implementation, include exactly one literal repository-relative path and a concrete `Verify` outcome, and cover every FR/buildable SC, while `[P]` MUST identify proven non-overlapping work or the artifact MUST record why no safe parallel work exists; automated contract tests MUST detect drift between bundled authoring guidance and the structural validator.

#### Scenario: US3 - Author artifacts that satisfy structural gates 1

- **GIVEN** active Constitution principles
- **WHEN** the plan template is completed
- **THEN** both checks contain the same exact principle headings with independent concrete pre-design and post-design evidence

#### Scenario: US3 - Author artifacts that satisfy structural gates 2

- **GIVEN** a tasks artifact
- **WHEN** the tasks template is completed
- **THEN** every checkbox uses a sequential `T###`, optional tags in canonical order, exactly one literal repository-relative path, and an observable verification result

#### Scenario: US3 - Author artifacts that satisfy structural gates 3

- **GIVEN** any bundled SDD template or its authoring guidance changes
- **WHEN** the template-contract tests run
- **THEN** validator drift is detected before the bundle is released

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

When the root decides implementation delegation creates a net gain, it MUST select `designer` for user-facing visual/UX work, `quick` for known narrow low-risk work, and `deep` for coupled multi-file, edge-case-heavy, migration, concurrency, shared-contract, or high-risk work; route alone MUST NOT select, require, or forbid any implementation owner, and one writer MUST own each mutable surface.

#### Scenario: US2 - Delegate specialists only for demonstrated net gain 1

- **GIVEN** an independent bounded surface with a strong specialist fit
- **WHEN** its context can be isolated without overlapping writes
- **THEN** the root selects the matching specialist regardless of SDD route

#### Scenario: US2 - Delegate specialists only for demonstrated net gain 2

- **GIVEN** a short task, a single ordered reasoning chain, frequent shared-state writes, or significant already-loaded root context
- **WHEN** delegation adds more overhead than benefit
- **THEN** root remains the implementation owner regardless of SDD route

#### Scenario: US2 - Delegate specialists only for demonstrated net gain 3

- **GIVEN** explicit user direction to use or avoid an implementation subagent
- **WHEN** that direction is safe and compatible with mandatory independent verification
- **THEN** the root treats it as an ownership input rather than inferring it from Direct, Accelerated, or Full

#### Scenario: US3 - Preserve deterministic specialist selection after delegation 1

- **GIVEN** the root has decided to delegate implementation
- **WHEN** the surface is user-facing UI/UX or visual-quality work
- **THEN** `designer` owns that surface

#### Scenario: US3 - Preserve deterministic specialist selection after delegation 2

- **GIVEN** the root has decided to delegate implementation
- **WHEN** the surface is known, narrow, mechanical, and low risk
- **THEN** `quick` owns it

#### Scenario: US3 - Preserve deterministic specialist selection after delegation 3

- **GIVEN** the root has decided to delegate implementation
- **WHEN** the surface is coupled, multi-file, migration-heavy, concurrent, edge-case-heavy, or high risk
- **THEN** `deep` owns it
