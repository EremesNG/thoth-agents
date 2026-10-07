# Feature Specification: Runtime-autonomous SDD bundle

**Change ID**: `self-contained-sdd-bundle`<br>
**Route**: Full<br>
**Status**: Complete

## User stories

### US1 - Install a complete harness distribution (Priority: P1)

As a user, I can install the OpenCode, Codex, or Claude distribution and receive
all supported plugin assets. The installer obtains external skills from their
single canonical sources, while SDD phases run entirely from local contracts.
Codex clearly identifies and uses its mandatory CLI-managed global layer.

**Independent test**: Generate each integration package in an empty temporary
directory and assert that its manifest, bundled owned skills, initialization contract,
templates, and supported harness-native surfaces are present, while Codex
contains no unsupported agent component.

**Acceptance scenarios**:

1. **Given** a generated Codex plugin, **When** its manifest is inspected,
   **Then** it declares bundled owned skills and contains no custom-agent assets, while
   the CLI plan owns global agents and `~/.codex/AGENTS.md`.
2. **Given** a generated Claude plugin, **When** it is installed, **Then** its
   agents and owned namespaced skills are discoverable, while the subsequent CLI
   step installs external skills from their canonical repositories.
3. **Given** the OpenCode plugin is loaded, **When** configuration is composed,
   **Then** `/thoth-init` is available and initializes the project from bundled
   owned assets without network access.

### US2 - Coordinate SDD without phase-only agents (Priority: P1)

As a user, I get a lightweight adaptive workflow in which the root loads phase
contracts on demand instead of delegating specification, planning, and task
decomposition to agents that differ only by prompt.

**Independent test**: Render the canonical agent pack and prompts, then assert
that exactly seven roles exist and that coordination phases belong to the root.

**Acceptance scenarios**:

1. **Given** any harness, **When** its agent pack is rendered, **Then** it
   exposes orchestrator, explorer, librarian, oracle, designer, quick, and deep,
   with no `sdd-specify`, `sdd-plan`, or `sdd-tasks` role.
2. **Given** an artifact-backed SDD route, **When** specify, clarify, plan,
   checklist, tasks, converge, or archive is executed, **Then** the root loads
   and follows the matching canonical contract.

### US3 - Receive independent analysis and verification (Priority: P1)

As a user, I receive review from an agent other than the implementer so that
self-critique is never treated as independent assurance.

**Independent test**: Query every route/phase ownership combination and assert
that `analyze` and every `verify` phase are owned by `oracle`.

**Acceptance scenarios**:

1. **Given** Direct, Accelerated, or Full routing, **When** verification starts,
   **Then** the root delegates it to `oracle` with bounded evidence and no write
   permission.
2. **Given** Full SDD, **When** pre-implementation analysis starts, **Then** it
   is delegated to `oracle`, never to the root or future implementer.
3. **Given** a failed verification, **When** remediation is needed, **Then** the
   root records convergence tasks and delegates implementation separately before
   asking `oracle` to verify again.

### US4 - Produce Spec Kit-grade governed artifacts (Priority: P2)

As a user, I receive canonical specifications, plans, task lists, clarification,
checklists, verification, and archive reports with stronger automated validation
than prose-only prompts.

**Independent test**: Run the bundled validator against canonical valid and
invalid fixtures and assert structured diagnostics for IDs, coverage, task
format, MVP/story independence, Constitution gates, and checklist revalidation.

**Acceptance scenarios**:

1. **Given** a specification, **When** it is validated, **Then** FR and SC IDs,
   prioritized independently testable stories, acceptance examples, assumptions,
   and out-of-scope boundaries are checked.
2. **Given** a task list, **When** it is validated, **Then** every item follows
   `T### [P?] [US#?] description with exact path | Verify: outcome`, IDs are
   unique and ordered, US/FR/SC coverage is complete, and
   MVP/dependency/parallel examples are present.
3. **Given** a Full SDD change, **When** planning and clarification finish,
   **Then** pre/post Constitution checks, structured ambiguity taxonomy,
   checklist coverage, and iterative revalidation are recorded.

### US5 - Initialize governance idempotently (Priority: P2)

As a user, I can invoke the native `thoth-init` capability repeatedly without
overwriting project-owned content.

**Independent test**: Execute init twice in a temporary project, edit a generated
project-owned file between runs, and assert that the second run preserves it
while reporting unchanged or skipped assets.

**Acceptance scenarios**:

1. **Given** a project without governance files, **When** init runs, **Then** it
   creates a constitution, templates, bundled owned skills, and harness-specific
   managed surfaces appropriate to the installed package.
2. **Given** an existing constitution or template, **When** init runs again,
   **Then** it does not overwrite user-authored content.

## Functional requirements

- **FR-001**: The canonical agent pack MUST expose exactly seven roles:
  orchestrator, explorer, librarian, oracle, designer, quick, and deep.
- **FR-002**: The system MUST remove all active registrations, configuration
  keys, schemas, generated agents, and prompt contracts for `sdd-specify`,
  `sdd-plan`, and `sdd-tasks`.
- **FR-003**: The root MUST own sequential coordination phases and load their
  canonical contracts only when the selected route reaches that phase.
- **FR-004**: `analyze` MUST always be owned by `oracle`.
- **FR-005**: `verify` MUST always be owned by `oracle` for Direct, Accelerated,
  and Full routes, regardless of who implemented the change.
- **FR-006**: Oracle review MUST remain read-only and return verdict, findings,
  evidence, coverage, and recommended next action to the root.
- **FR-007**: The bundle MUST retain Direct, Accelerated, and Full routes and the
  verify/fail/converge/reimplement/reverify loop.
- **FR-008**: The bundle MUST provide canonical lazy contracts for constitution,
  explore, specify, clarify, plan, checklist, tasks, analyze, implement, verify,
  converge, and archive behavior.
- **FR-009**: The SDD validator MUST enforce Spec Kit-compatible artifact IDs,
  story independence, acceptance examples, task grammar, MVP/dependency/parallel
  guidance, per-task verification outcomes, US/FR/SC coverage, checklist
  taxonomy/coverage/revalidation, and Constitution principle evidence.
- **FR-010**: The plugin packages MUST bundle only thoth-owned workflow skills
  and MUST NOT vendor external skills. Installation for every harness MUST use
  `npx skills add` for missing skills against the canonical external
  repositories; SDD phases MUST NOT invoke the CLI or download contracts.
- **FR-011**: OpenCode MUST expose `/thoth-init`; Claude MUST expose its native
  plugin-namespaced init skill; Codex MUST expose `$thoth-init` through its skills
  manifest.
- **FR-012**: Init MUST be offline, idempotent, project-scoped, and preserve
  existing project-owned files.
- **FR-013**: Codex CLI setup MUST materialize six global agent TOMLs, a managed
  orchestrator section in `~/.codex/AGENTS.md`, and managed global feature
  configuration. `$thoth-init` MUST initialize project governance only.
- **FR-014**: Generated Codex and Claude integrations MUST remain synchronized
  by the existing build and version lifecycle.
- **FR-015**: Archive MUST remain a governed terminal transition for
  artifact-backed routes and record outcome, evidence, deviations, and follow-up.

## Success criteria

- **SC-001**: All active tests and generated packages reference seven roles and
  contain zero active phase-only agent definitions.
- **SC-002**: A route ownership test proves 100% of `analyze` and `verify`
  executions resolve to `oracle`.
- **SC-003**: Generated packages contain every owned skill and no external skill
  copy; installer tests prove exact `npx skills add` commands for all harnesses,
  and Codex additionally passes global agents/instructions setup tests.
- **SC-004**: The validator rejects every deliberately malformed parity fixture
  with a phase-specific diagnostic and accepts the canonical complete fixture.
- **SC-005**: Running init twice yields the same managed output and preserves all
  user-edited project-owned files.
- **SC-006**: `check:ci`, typecheck, build, and the full test suite pass.

## Assumptions

- Version 0.3.0 intentionally breaks the previous ten-role configuration.
- Historical archived changes remain immutable evidence and may mention removed
  roles.
- The CLI is an installation dependency for every harness. Only Codex also uses
  it to create global agents, root instructions, and managed feature config.

## Out of scope

- Backward-compatible aliases for removed phase agents.
- Harnesses other than OpenCode, Codex, and Claude Code.
- Provider-owned memory hooks, MCP lifecycle, or thoth-mem installation.
