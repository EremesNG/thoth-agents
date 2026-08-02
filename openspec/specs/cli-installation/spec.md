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

### Requirement: Install owned OpenCode workflow skills globally

The OpenCode installer MUST synchronize the five canonical thoth-owned workflow skill trees from the installed thoth-agents package into `~/.config/opencode/skills/` as a required global installation step.

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

### Requirement: Pin the OpenCode plugin to the executing release

Every OpenCode install or applied update MUST replace all managed thoth-agents plugin entry forms with exactly one `thoth-agents@<executing-package-version>` entry while preserving unrelated plugin entries.

#### Scenario: US1 - Install the exact OpenCode plugin release 1

- **GIVEN** the executing thoth-agents package version is `0.4.8`
- **WHEN** OpenCode installation configures the plugin
- **THEN** the resulting managed entry is exactly `thoth-agents@0.4.8` and is not `thoth-agents@latest`

#### Scenario: US1 - Install the exact OpenCode plugin release 2

- **GIVEN** OpenCode configuration contains a bare, tagged, or differently versioned thoth-agents entry plus unrelated plugins
- **WHEN** installation runs again from version `0.4.8`
- **THEN** every prior thoth-agents entry is replaced by one `thoth-agents@0.4.8` entry and unrelated plugins retain their relative order

#### Scenario: US1 - Install the exact OpenCode plugin release 3

- **GIVEN** the executing package version cannot be resolved as a non-empty valid package version
- **WHEN** installation or update would write the OpenCode plugin entry
- **THEN** the operation fails without substituting `latest` and without partially rewriting the configuration

### Requirement: Make applied Update installation-equivalent

Applying Update through either the interactive CLI or the public update command MUST execute the same complete harness-specific refresh contract as `install --agent=<selected-harness>` rather than a reduced reconciliation plan.

#### Scenario: US2 - Refresh complete harness installations from Update 1

- **GIVEN** OpenCode is selected in the interactive CLI or update command
- **WHEN** Update is applied
- **THEN** it performs the complete OpenCode installation refresh, including the exact plugin pin, default-agent configuration, managed configuration, thoth-owned skills, required external skills, and provider setup

#### Scenario: US2 - Refresh complete harness installations from Update 2

- **GIVEN** Codex is selected
- **WHEN** Update is applied
- **THEN** it performs native plugin-manager setup before refreshing the global agent pack, required external skills, and provider setup under the same failure rules as `install --agent=codex`

#### Scenario: US2 - Refresh complete harness installations from Update 3

- **GIVEN** Claude Code is selected
- **WHEN** Update is applied
- **THEN** it performs native marketplace/plugin refresh, required external skills, and provider setup under the same failure rules as `install --agent=claude`

#### Scenario: US2 - Refresh complete harness installations from Update 4

- **GIVEN** an update is only previewed or dry-run is requested
- **WHEN** the plan is rendered
- **THEN** every complete refresh step is represented and no harness, skill, provider, cache, or configuration mutation occurs

#### Scenario: US2 - Refresh complete harness installations from Update 5

- **GIVEN** any required harness-owned, skill, or provider step fails or returns a non-complete outcome
- **WHEN** Update is applied
- **THEN** the update returns failure and does not claim complete installation

### Requirement: Preserve complete per-harness setup

Complete update refreshes MUST include OpenCode managed configuration and owned skills, Codex native plugin setup and global agent-pack setup, Claude native plugin refresh, every harness's required external skills, and every harness's provider-owned thoth-mem setup in the same order and with the same fail-closed outcomes as explicit installation.

#### Scenario: US2 - Refresh complete harness installations from Update 1

- **GIVEN** OpenCode is selected in the interactive CLI or update command
- **WHEN** Update is applied
- **THEN** it performs the complete OpenCode installation refresh, including the exact plugin pin, default-agent configuration, managed configuration, thoth-owned skills, required external skills, and provider setup

#### Scenario: US2 - Refresh complete harness installations from Update 2

- **GIVEN** Codex is selected
- **WHEN** Update is applied
- **THEN** it performs native plugin-manager setup before refreshing the global agent pack, required external skills, and provider setup under the same failure rules as `install --agent=codex`

#### Scenario: US2 - Refresh complete harness installations from Update 3

- **GIVEN** Claude Code is selected
- **WHEN** Update is applied
- **THEN** it performs native marketplace/plugin refresh, required external skills, and provider setup under the same failure rules as `install --agent=claude`

#### Scenario: US2 - Refresh complete harness installations from Update 4

- **GIVEN** an update is only previewed or dry-run is requested
- **WHEN** the plan is rendered
- **THEN** every complete refresh step is represented and no harness, skill, provider, cache, or configuration mutation occurs

#### Scenario: US2 - Refresh complete harness installations from Update 5

- **GIVEN** any required harness-owned, skill, or provider step fails or returns a non-complete outcome
- **WHEN** Update is applied
- **THEN** the update returns failure and does not claim complete installation

### Requirement: Record the last complete CLI-managed version

The CLI MUST maintain a versioned global installation ledger keyed independently by OpenCode, Codex, and Claude Code, and MUST atomically record the executing package version for one harness only after every required install or applied-update step for that harness completes successfully.

#### Scenario: US3 - Track the authoritative CLI-managed version 1

- **GIVEN** version `0.4.8` completes every required installation step for OpenCode, Codex, or Claude Code
- **WHEN** the CLI commits installation success
- **THEN** it atomically records `0.4.8` as that harness's last complete CLI-managed version without changing the other harness records

#### Scenario: US3 - Track the authoritative CLI-managed version 2

- **GIVEN** a dry-run, cancelled preview, or failed native-manager, managed-surface, required-skill, or provider step
- **WHEN** the operation ends
- **THEN** no harness record is advanced and the previous complete version remains authoritative

#### Scenario: US3 - Track the authoritative CLI-managed version 3

- **GIVEN** Codex or Claude independently updates its marketplace plugin
- **WHEN** thoth-agents status is evaluated
- **THEN** the last successful CLI record remains the official CLI-managed version and the native marketplace version is not rewritten or treated as proof that separate managed surfaces were refreshed

#### Scenario: US3 - Track the authoritative CLI-managed version 4

- **GIVEN** the executing CLI version differs from a harness's recorded version
- **WHEN** status or Update is opened
- **THEN** both versions and the need for a complete CLI refresh are presented without silently changing the record

#### Scenario: US3 - Track the authoritative CLI-managed version 5

- **GIVEN** no valid record exists for a harness
- **WHEN** status is evaluated
- **THEN** the CLI reports the managed-install version as unknown or missing rather than inferring it from OpenCode cache or Codex/Claude marketplace state

### Requirement: Treat the CLI ledger as authoritative for managed setup

CLI status and update decisions MUST use each harness's last complete ledger record as the official CLI-managed version, MUST expose the executing and recorded versions when they differ, and MUST NOT infer or advance that record from OpenCode package cache or Codex/Claude marketplace state.

#### Scenario: US3 - Track the authoritative CLI-managed version 1

- **GIVEN** version `0.4.8` completes every required installation step for OpenCode, Codex, or Claude Code
- **WHEN** the CLI commits installation success
- **THEN** it atomically records `0.4.8` as that harness's last complete CLI-managed version without changing the other harness records

#### Scenario: US3 - Track the authoritative CLI-managed version 2

- **GIVEN** a dry-run, cancelled preview, or failed native-manager, managed-surface, required-skill, or provider step
- **WHEN** the operation ends
- **THEN** no harness record is advanced and the previous complete version remains authoritative

#### Scenario: US3 - Track the authoritative CLI-managed version 3

- **GIVEN** Codex or Claude independently updates its marketplace plugin
- **WHEN** thoth-agents status is evaluated
- **THEN** the last successful CLI record remains the official CLI-managed version and the native marketplace version is not rewritten or treated as proof that separate managed surfaces were refreshed

#### Scenario: US3 - Track the authoritative CLI-managed version 4

- **GIVEN** the executing CLI version differs from a harness's recorded version
- **WHEN** status or Update is opened
- **THEN** both versions and the need for a complete CLI refresh are presented without silently changing the record

#### Scenario: US3 - Track the authoritative CLI-managed version 5

- **GIVEN** no valid record exists for a harness
- **WHEN** status is evaluated
- **THEN** the CLI reports the managed-install version as unknown or missing rather than inferring it from OpenCode cache or Codex/Claude marketplace state

### Requirement: Prohibit runtime self-update mutation

The OpenCode runtime version checker MAY notify about a newer release but MUST NOT rewrite plugin configuration, invalidate package-manager state, or invoke package installation; release changes MUST require an explicit CLI install or Update action.

#### Scenario: US4 - Keep release changes operator-controlled 1

- **GIVEN** OpenCode is running a pinned release and a newer release exists
- **WHEN** the background version check completes
- **THEN** it only notifies the operator and does not rewrite the plugin entry, invalidate cached package state, or run an installation command

#### Scenario: US4 - Keep release changes operator-controlled 2

- **GIVEN** an operator wants the newer release
- **WHEN** they follow CLI guidance or apply Update
- **THEN** the selected harness receives the complete refresh and OpenCode, when selected, is pinned to the CLI release performing that refresh

#### Scenario: US4 - Keep release changes operator-controlled 3

- **GIVEN** installation and update help or documentation
- **WHEN** an operator reads the OpenCode guidance
- **THEN** it explains the exact-version pin and that re-running the latest CLI installer or applying Update is the supported update mechanism

### Requirement: Document the explicit update contract

CLI help, status and operation messaging, and routed public installation guidance SHALL describe exact OpenCode version pinning, the last complete CLI-managed version, native marketplace independence, and the complete CLI-driven update path consistently.

#### Scenario: US4 - Keep release changes operator-controlled 1

- **GIVEN** OpenCode is running a pinned release and a newer release exists
- **WHEN** the background version check completes
- **THEN** it only notifies the operator and does not rewrite the plugin entry, invalidate cached package state, or run an installation command

#### Scenario: US4 - Keep release changes operator-controlled 2

- **GIVEN** an operator wants the newer release
- **WHEN** they follow CLI guidance or apply Update
- **THEN** the selected harness receives the complete refresh and OpenCode, when selected, is pinned to the CLI release performing that refresh

#### Scenario: US4 - Keep release changes operator-controlled 3

- **GIVEN** installation and update help or documentation
- **WHEN** an operator reads the OpenCode guidance
- **THEN** it explains the exact-version pin and that re-running the latest CLI installer or applying Update is the supported update mechanism
