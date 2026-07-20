# Cli Installation Specification

## Purpose

Durable behavioral contract for `cli-installation`.

## Requirements

### Requirement: Mandatory provider setup

The installer MUST invoke `npx -y thoth-mem@latest setup <opencode|codex|claude> --scope global --json` for every supported harness after thoth-agents-owned setup and mandatory external skills, adding `--plan` only for dry-run.

#### Scenario: US1 - Complete harness installation 1

- **GIVEN** any supported harness
- **WHEN** its thoth-agents installation reaches provider setup
- **THEN** it invokes the official global thoth-mem setup command after thoth-agents-owned setup and required skills

#### Scenario: US1 - Complete harness installation 2

- **GIVEN** dry-run installation
- **WHEN** provider setup is planned
- **THEN** the thoth-mem command includes `--plan` and performs no provider mutation

#### Scenario: US1 - Complete harness installation 3

- **GIVEN** thoth-mem reports `partial`, `failed`, `requires_user_action`, malformed output, or contradictory exit evidence
- **WHEN** thoth-agents finishes the command
- **THEN** it preserves bounded diagnostics, manual actions, and receipt evidence and does not claim complete installation

### Requirement: Truthful provider outcome

The installer MUST parse the documented thoth-mem JSON result, accept only internally consistent `complete` evidence as success, and surface diagnostics, manual actions, and receipt information without claiming completion for any other state.

#### Scenario: US1 - Complete harness installation 1

- **GIVEN** any supported harness
- **WHEN** its thoth-agents installation reaches provider setup
- **THEN** it invokes the official global thoth-mem setup command after thoth-agents-owned setup and required skills

#### Scenario: US1 - Complete harness installation 2

- **GIVEN** dry-run installation
- **WHEN** provider setup is planned
- **THEN** the thoth-mem command includes `--plan` and performs no provider mutation

#### Scenario: US1 - Complete harness installation 3

- **GIVEN** thoth-mem reports `partial`, `failed`, `requires_user_action`, malformed output, or contradictory exit evidence
- **WHEN** thoth-agents finishes the command
- **THEN** it preserves bounded diagnostics, manual actions, and receipt evidence and does not claim complete installation

### Requirement: Public operator guidance

README and routed documentation MUST describe mandatory provider setup, all harness mappings, dry-run planning, non-complete outcomes, and the independent ownership boundary.

#### Scenario: US3 - Accurate installation and limitation guidance 1

- **GIVEN** the README or installation documentation
- **WHEN** a user follows a harness path
- **THEN** it states that the thoth-agents CLI invokes thoth-mem setup while thoth-mem retains ownership of its hooks, MCP, skill, lifecycle, receipts, and recovery
