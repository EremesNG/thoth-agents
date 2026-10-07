# Feature Specification: Separate Global Installation from Project Initialization

**Change ID**: `separate-install-from-thoth-init`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Operators must receive a complete harness installation before entering a project, while project initialization must remain a bounded, repeatable OpenSpec governance operation.<br>
**Impact**: OpenCode installation will materialize all thoth-owned workflow skills in its global native skill root. `thoth-init` will stop installing project-local skills and will only initialize or repair the minimum `openspec/` structure.<br>
**Affected capabilities**: `cli-installation`, `external-required-skills`, `adaptive-sdd`

## User stories

### US1 - Complete the global OpenCode installation (Priority: P1)

As an OpenCode operator, I can run the thoth-agents installer once and receive every required global workflow skill so that SDD is available in any project without project-local skill bootstrapping.

**Independent test**: Install the bundled owned skills into an isolated home directory and verify that every canonical skill tree is present and current in OpenCode's global skill root.

**Covers**: FR-001, FR-002, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** a complete published thoth-agents package, **When** `install --agent=opencode` runs, **Then** `thoth-init`, `thoth-sdd`, `thoth-constitution`, `thoth-archive`, and `plan-reviewer` are synchronized under `~/.config/opencode/skills/` before installation can report success.
2. **Given** an existing stale copy of a thoth-owned OpenCode skill, **When** installation runs again, **Then** the global owned copy matches the canonical packaged skill rather than remaining stale.
3. **Given** dry-run installation, **When** owned skill installation is planned, **Then** the destination and five owned skills are reported without writing them.
4. **Given** an incomplete canonical bundle or a failed global skill synchronization, **When** OpenCode installation runs, **Then** the overall installation fails and does not claim provider or combined installation completion.

### US2 - Initialize only project OpenSpec governance (Priority: P1)

As a project maintainer, I can run `thoth-init` to establish or repair the minimum OpenSpec governance structure without installing tools, skills, agents, or harness configuration into the project.

**Independent test**: Run the bundled initializer against isolated empty and partially initialized projects, then assert that all created paths are beneath `openspec/` and existing project-owned governance content is unchanged.

**Covers**: FR-003, FR-004, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** an empty project directory, **When** `thoth-init` runs, **Then** it creates the minimum `openspec/` directory graph, metadata, constitution, and missing SDD templates required by the governed flows.
2. **Given** an existing constitution or template, **When** `thoth-init` synchronizes the structure, **Then** it preserves that project-owned file content and creates only missing governance assets.
3. **Given** any supported harness invokes `thoth-init`, **When** initialization completes, **Then** it creates or changes no path outside `openspec/` and performs no network or installer command.
4. **Given** a required OpenSpec directory path is occupied by a file, **When** initialization runs, **Then** it fails truthfully instead of creating a partial or misleading ready state.

### US3 - Communicate the ownership boundary accurately (Priority: P2)

As an operator, I can rely on installation and SDD documentation to distinguish global harness setup from project governance initialization.

**Independent test**: Verify public and routed documentation plus generated integration packages after synchronization.

**Covers**: FR-005, SC-005

**Acceptance scenarios**:

1. **Given** installation guidance for OpenCode, **When** an operator reads it, **Then** it assigns owned and external skills, agents, plugin configuration, and provider setup to the global installer.
2. **Given** `thoth-init` guidance for any harness, **When** a maintainer reads it, **Then** it describes only initialization and structural synchronization of `openspec/`.

## Edge cases

- A canonical owned skill directory or its `SKILL.md` is missing from the published package.
- The global OpenCode skill root exists but an owned skill destination has an incompatible filesystem type or cannot be written.
- A project already contains legacy `.agents/skills/thoth-*` copies; the bounded initializer must leave them untouched because they are outside `openspec/`.
- Repeated initialization encounters a mix of existing project-authored files and missing required directories or templates.
- The project path does not yet exist, or an expected OpenSpec directory path is occupied by a regular file.

## Functional requirements

- **FR-001 — Install owned OpenCode workflow skills globally**: `[ADDED cli-installation]` The OpenCode installer MUST synchronize the five canonical thoth-owned workflow skill trees from the installed thoth-agents package into `~/.config/opencode/skills/` as a required global installation step.
- **FR-002 — Preserve harness-native discovery**: `[MODIFIED external-required-skills]` The system MUST install external skills through their canonical repositories and MUST materialize packaged thoth-owned OpenCode workflow skills in OpenCode's global native skill root; SDD availability MUST NOT depend on `thoth-init` copying skills into a project.
- **FR-003 — Limit thoth-init to project governance**: `[ADDED adaptive-sdd]` The bundled `thoth-init` operation MUST only create, inspect, or update paths beneath the target project's `openspec/` directory and MUST NOT install skills, agents, plugins, harness configuration, or external dependencies.
- **FR-004 — Synchronize the minimum OpenSpec structure**: `[ADDED adaptive-sdd]` The bundled `thoth-init` operation MUST idempotently ensure the required `openspec/changes/archive/`, `openspec/specs/`, `openspec/memory/`, and `openspec/templates/` structure plus missing packaged governance assets while preserving existing project-owned constitutions and templates.
- **FR-005 — Keep distributed contracts aligned**: `[INTERNAL]` Canonical skills, generated plugin assets, tests, installation output, and public or routed documentation SHALL express the same global-install versus project-init ownership boundary.

## Success criteria

- **SC-001** `[buildable]`: Focused installer tests demonstrate that exactly five owned skill directories, including all nested scripts, references, and templates, are copied from the package to an isolated `~/.config/opencode/skills/` root and stale owned content is refreshed.
- **SC-002** `[buildable]`: Focused installer tests demonstrate that dry-run writes zero owned skill files and that missing bundle assets or filesystem failures produce a nonzero installation result without a false completion claim.
- **SC-003** `[buildable]`: Initializer tests for an empty project demonstrate that every created or modified path is beneath `openspec/` and that zero `.agents/`, `.opencode/`, `.codex/`, `.claude/`, root instruction, or harness configuration assets are created.
- **SC-004** `[buildable]`: Initializer tests demonstrate all four minimum governance directories, preserve every byte of existing constitutions and templates, create zero additional assets on a second run, and fail for a file/directory collision.
- **SC-005** `[buildable]`: All focused CLI, harness, generated-package, documentation, typecheck, and formatting checks pass with zero remaining contracts that assign project-local skill installation to `thoth-init`.

## Assumptions

- The published npm package continues to include the canonical top-level `skills/` directory.
- The five thoth-owned skill names are installer-managed identities, so reinstalling thoth-agents may refresh their global contents.
- OpenCode continues to discover global skills from `~/.config/opencode/skills/<name>/SKILL.md`.
- Structural synchronization means creating missing governance directories and assets, not overwriting project-authored constitutions or templates.

## Dependencies

- Node.js `>=22.13` filesystem APIs.
- The canonical skill bundle under the installed package root.
- OpenCode's documented native global skill discovery path.
- Existing integration generation for the shared Codex and Claude plugin bundle.

## Out of scope

- Removing legacy project-local skill copies created by earlier `thoth-init` versions.
- Changing the four external skill sources or the provider-owned thoth-mem setup contract.
- Changing Codex or Claude native marketplace ownership or their global skill discovery behavior.
- Overwriting project-authored constitutions or customized OpenSpec templates.
