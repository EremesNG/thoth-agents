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

### Requirement: Activate the applied agents preset

Applying any valid OpenCode model configuration plan MUST persist `preset: agents` and MUST materialize the applied configuration under the real named preset `presets.agents`.

#### Scenario: US1 - Activate applied model assignments 1

- **GIVEN** the managed OpenCode config selects `openai`
- **WHEN** the user applies one edited role
- **THEN** the persisted config selects `agents` and `presets.agents` contains the changed assignment plus every unchanged effective role assignment

#### Scenario: US1 - Activate applied model assignments 2

- **GIVEN** no role is dirty and the TUI sends every displayed role
- **WHEN** the user selects Apply
- **THEN** the same complete `agents` preset is materialized and activated

#### Scenario: US1 - Activate applied model assignments 3

- **GIVEN** the active preset and root overrides each contribute fields to a role
- **WHEN** model configuration is applied
- **THEN** the materialized `agents` preset preserves their field-level effective value before applying the requested model or effort change

### Requirement: Materialize the complete effective roster

Before activation, the system MUST derive all seven effective role configurations from the selected preset, root overrides, and canonical defaults using field-level precedence, apply the requested role changes, and preserve unrelated presets and configuration keys.

#### Scenario: US1 - Activate applied model assignments 1

- **GIVEN** the managed OpenCode config selects `openai`
- **WHEN** the user applies one edited role
- **THEN** the persisted config selects `agents` and `presets.agents` contains the changed assignment plus every unchanged effective role assignment

#### Scenario: US1 - Activate applied model assignments 2

- **GIVEN** no role is dirty and the TUI sends every displayed role
- **WHEN** the user selects Apply
- **THEN** the same complete `agents` preset is materialized and activated

#### Scenario: US1 - Activate applied model assignments 3

- **GIVEN** the active preset and root overrides each contribute fields to a role
- **WHEN** model configuration is applied
- **THEN** the materialized `agents` preset preserves their field-level effective value before applying the requested model or effort change

### Requirement: Recognize the managed agents preset

OpenCode status and model-role readback MUST recognize a complete active `presets.agents` roster as a valid managed configuration and MUST keep subsequent valid model plans eligible to apply.

#### Scenario: US2 - Reapply the activated preset safely 1

- **GIVEN** a complete applied `presets.agents` roster is active
- **WHEN** managed status is evaluated
- **THEN** the roster is recognized without an `opencode-roster-drift` blocker

#### Scenario: US2 - Reapply the activated preset safely 2

- **GIVEN** a complete applied `agents` preset
- **WHEN** model roles are loaded again
- **THEN** the selected preset and permitted root overrides determine the displayed effective values without falling back to `openai`

#### Scenario: US2 - Reapply the activated preset safely 3

- **GIVEN** the first apply completed successfully
- **WHEN** a second valid model plan is built and applied
- **THEN** it remains eligible and preserves the activated `agents` preset
