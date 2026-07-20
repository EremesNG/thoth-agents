# Spec: Mandatory External Skills

## Requirements

### Requirement: Require the same four execution skills everywhere

OpenCode, Codex, and Claude installations MUST provide `simplify`, `tdd`,
`progressive-context-router`, and `architectural-grilling`. Simplify,
progressive-context-router, and architectural-grilling MUST be sourced from
`https://github.com/EremesNG/skills`; TDD MUST be sourced from
`https://github.com/mattpocock/skills`.

### Requirement: Preserve one canonical source

The thoth-agents repository and generated plugin packages MUST NOT vendor the
four external skill trees. Their canonical repositories MUST remain the single
source of truth so a skill update does not require synchronized copies here.

### Requirement: Install through the skills CLI

The thoth-agents installer MUST invoke `npx skills add <repo> --skill <name>
--global --agent <harness> --yes` for every missing external skill. It MUST use
the concrete selectors `opencode`, `codex`, and `claude-code`. A failed required
skill installation MUST fail the overall operation.

### Requirement: Keep SDD runtime independent of the CLI

Installation MAY require network access and the CLI. After installation, no SDD
phase may invoke the thoth-agents CLI, `npx skills add`, or fetch phase contracts
from a repository. Owned SDD contracts MUST be available from the installed
plugin/project bundle.

### Requirement: Preserve harness-native discovery

The system MUST install external skills through their canonical repositories and MUST materialize packaged thoth-owned OpenCode workflow skills in OpenCode's global native skill root; SDD availability MUST NOT depend on `thoth-init` copying skills into a project.

#### Scenario: US1 - Complete the global OpenCode installation 1

- **GIVEN** a complete published thoth-agents package
- **WHEN** `install --agent=opencode` runs
- **THEN** `thoth-init`, `thoth-sdd`, `thoth-constitution`, `thoth-archive`, and `plan-reviewer` are synchronized under `~/.config/opencode/skills/` before installation can report success

#### Scenario: US1 - Complete the global OpenCode installation 2

- **GIVEN** an existing stale copy of a thoth-owned OpenCode skill
- **WHEN** installation runs again
- **THEN** the global owned copy matches the canonical packaged skill rather than remaining stale

#### Scenario: US1 - Complete the global OpenCode installation 3

- **GIVEN** dry-run installation
- **WHEN** owned skill installation is planned
- **THEN** the destination and five owned skills are reported without writing them

#### Scenario: US1 - Complete the global OpenCode installation 4

- **GIVEN** an incomplete canonical bundle or a failed global skill synchronization
- **WHEN** OpenCode installation runs
- **THEN** the overall installation fails and does not claim provider or combined installation completion

### Requirement: Leave QA tooling to the project

thoth-agents MUST NOT require or install `playwright-cli`, Playwright, or another
browser/QA executable. Projects remain responsible for their own visual,
integration, and end-to-end QA tooling.
