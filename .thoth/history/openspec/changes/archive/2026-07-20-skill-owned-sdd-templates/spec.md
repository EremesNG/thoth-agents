# Feature Specification: Skill-owned SDD templates

**Change ID**: `skill-owned-sdd-templates`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: OpenCode must consume the installed `thoth-sdd` workflow assets without requiring project-local template copies, and generated artifacts should follow the validator contract on the first attempt.<br>
**Impact**: SDD template and validator references become skill-root-relative, `thoth-init` stops materializing `openspec/templates/`, and bundled templates gain explicit validator-aligned authoring rules.<br>
**Affected capabilities**: `adaptive-sdd`

## User stories

### US1 - Resolve workflow assets from the installed skill (Priority: P1)

As an OpenCode user, I can run an SDD workflow using the globally installed
`thoth-sdd` skill so that the agent never depends on an
`openspec/templates/` directory in my project.

**Independent test**: Inspect the canonical and generated skill bundles and prove that every phase template and validator reference is anchored to the installed skill directory, with no workflow instruction directing the agent to `openspec/templates/`.

**Covers**: FR-001, SC-001

**Acceptance scenarios**:

1. **Given** `thoth-sdd` is installed and a project has no `openspec/templates/`, **When** an OpenCode agent loads a phase contract, **Then** it resolves the required template and validator from the installed skill bundle.
2. **Given** an installed workflow asset is missing, **When** a phase attempts to load it, **Then** the workflow reports installation drift instead of searching the project or downloading a replacement.

### US2 - Initialize governance without duplicating workflow templates (Priority: P1)

As a project maintainer, I can run `thoth-init` to initialize only the minimum
OpenSpec governance surface so that workflow templates remain owned by the
installed skill.

**Independent test**: Run the initializer against empty, legacy, and deliberately incomplete bundle fixtures and prove it creates the required governance paths without creating or reading `openspec/templates/`.

**Covers**: FR-002, FR-003, SC-002

**Acceptance scenarios**:

1. **Given** an empty project, **When** `thoth-init` completes, **Then** it creates the required change, archive, spec, memory, metadata, and constitution assets but no `openspec/templates/` directory.
2. **Given** a legacy project already contains `openspec/templates/`, **When** `thoth-init` synchronizes the project, **Then** it leaves that directory and its contents untouched.
3. **Given** the initializer bundle has no `thoth-sdd/templates/`, **When** `thoth-init` runs, **Then** initialization still succeeds because those assets are outside its responsibility.
4. **Given** a project-owned constitution already exists, **When** `thoth-init` synchronizes the project, **Then** it preserves that constitution byte-for-byte.
5. **Given** any supported harness invokes `thoth-init`, **When** initialization completes, **Then** it changes no path outside `openspec/` and performs no network or installer command.
6. **Given** a required OpenSpec directory path is occupied by a file, **When** initialization runs, **Then** it fails before writing any managed OpenSpec asset.

### US3 - Author artifacts that satisfy structural gates (Priority: P1)

As an SDD authoring agent, I can follow the bundled plan and task templates so
that ordinary completed artifacts satisfy the validator's constitution,
task-format, and task-sequence rules without reverse-engineering validation
errors.

**Independent test**: Materialize representative completed artifacts from the documented template grammar, validate them through `ready`, and retain negative tests for mismatched Constitution principles, non-literal task paths, malformed tasks, and non-sequential IDs.

**Covers**: FR-004, SC-003

**Acceptance scenarios**:

1. **Given** active Constitution principles, **When** the plan template is completed, **Then** both checks contain the same exact principle headings with independent concrete pre-design and post-design evidence.
2. **Given** a tasks artifact, **When** the tasks template is completed, **Then** every checkbox uses a sequential `T###`, optional tags in canonical order, exactly one literal repository-relative path, and an observable verification result.
3. **Given** any bundled SDD template or its authoring guidance changes, **When** the template-contract tests run, **Then** validator drift is detected before the bundle is released.

## Edge cases

- The installed skill path may contain spaces or use a harness-specific global root; references must remain symbolic and package-relative rather than hard-coded to one machine.
- Existing project-owned `openspec/templates/` content may be customized or obsolete; initialization must neither delete nor update it.
- Constitution headings are case-insensitive to the validator but otherwise must match the active numbered principle headings in both checks.
- A task description may need terminology in backticks, but the validator permits exactly one backtick span before `| Verify:` and reserves it for the literal path.
- Placeholder task paths, globs, absolute paths, URI-like paths, home-relative paths, and repository escapes remain invalid completed artifacts.

## Functional requirements

- **FR-001 — Load phase contracts on demand**: `[MODIFIED adaptive-sdd]` The root MUST own sequential coordination for `specify`, `clarify`, `plan`, `checklist`, `tasks`, `converge`, verification-report persistence, and `archive`; it MUST load detailed contracts from bundled workflow skills only when the current phase requires them and resolve every bundled phase contract, template, validator, and sibling workflow reference relative to the installed skill contract; it MUST NOT register phase-only agents, inflate every role prompt with every phase protocol, interpret bundled asset references relative to the project, require `openspec/templates/`, invoke the thoth-agents CLI or `npx skills add`, perform a network fetch, or provision missing assets during an SDD, and missing local contracts MUST be reported as installation drift.
- **FR-002 — Limit thoth-init to project governance**: `[MODIFIED adaptive-sdd]` The bundled `thoth-init` operation MUST only create, inspect, or update paths beneath the target project's `openspec/` directory and MUST initialize only the minimum project OpenSpec governance surface; it MUST NOT install skills, agents, plugins, harness configuration, external dependencies, run network or installer commands, or create, copy, read, validate, or synchronize SDD workflow templates, and it MUST leave any pre-existing constitution and legacy `openspec/templates/` tree untouched.
- **FR-003 — Synchronize the minimum OpenSpec structure**: `[MODIFIED adaptive-sdd]` The bundled `thoth-init` operation MUST idempotently ensure `openspec/changes/archive/`, `openspec/specs/`, `openspec/memory/`, `.thoth-agents.json`, and a missing packaged constitution while preserving existing project-owned assets and remaining independent of `thoth-sdd/templates/`; it MUST preflight every required source and target path before writing and fail truthfully without a partial ready state when a required directory or file path has an incompatible type.
- **FR-004 — Preserve executable planning and task semantics**: `[MODIFIED adaptive-sdd]` Plans MUST record evidence-backed pre/post Constitution checks using the same exact active principle headings and map technical decisions to requirements, exact paths/interfaces, risk, migration/rollback, and verification seams; optional research, data-model, contract, quickstart, or checklist artifacts MUST exist only for a concrete risk; tasks MUST use globally sequential `T### [P?] [US#?]` grammar starting at `T001`, identify an independent MVP, state dependencies, put behavior tests before implementation, include exactly one literal repository-relative path and a concrete `Verify` outcome, and cover every FR/buildable SC, while `[P]` MUST identify proven non-overlapping work or the artifact MUST record why no safe parallel work exists; automated contract tests MUST detect drift between bundled authoring guidance and the structural validator.

## Success criteria

- **SC-001** `[buildable]`: All canonical and generated SDD workflow references pass tests proving that template and validator paths are skill-root-relative and zero instructions require project-local `openspec/templates/`.
- **SC-002** `[buildable]`: Initializer tests pass for empty, legacy, repeated, and template-less bundle fixtures while creating zero new paths beneath `openspec/templates/` and preserving all pre-existing legacy template bytes.
- **SC-003** `[buildable]`: A representative Accelerated artifact set authored from the revised template contract passes the `ready` gate, while focused mutations reproduce and reject `SDD-PLAN-CONSTITUTION-COVERAGE`, `SDD-TASK-FORMAT`, and `SDD-TASK-SEQUENCE` violations.

## Assumptions

- Canonical workflow assets remain under `skills/thoth-sdd/` and generated harness bundles continue to mirror that directory layout.
- Removing initializer ownership does not authorize deletion of legacy project-local templates.
- Codex and Claude continue consuming the same bundled templates; the path contract must work for all harness bundles even though the reported runtime failure is OpenCode-specific.

## Dependencies

- Existing `thoth-sdd` validator and integration bundle generation pipeline.
- Existing `thoth-constitution` packaged template used by `thoth-init`.

## Out of scope

- Migrating or deleting legacy `openspec/templates/` directories from existing projects.
- Changing the SDD route graph, validator policy, or artifact schema beyond clarifying and testing the already intended grammar.
- Installing new external skills or changing global harness installation behavior completed by the prior change.
