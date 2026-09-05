# Spec: Mandatory External Skills

## Requirements

### Requirement: Require the same four execution skills everywhere

Pi installations MUST provide `simplify`, `tdd`, `progressive-context-router`, and `architectural-grilling` from the same canonical repositories required by OpenCode, Codex, and Claude.

#### Scenario: US1 - Install the complete Pi agent pack 1

- **GIVEN** Pi `0.84.4` or a compatible evidenced release, Node.js `>=22.19`, and an empty isolated Pi home
- **WHEN** `thoth-agents install --agent=pi` is applied
- **THEN** the native Pi delegation and research packages, managed grep.app MCP configuration, root instructions, six canonical specialist definitions, owned skills, required external skills, provider setup, and Pi ledger record are completed in order

#### Scenario: US1 - Install the complete Pi agent pack 2

- **GIVEN** the same environment
- **WHEN** the installation is run with `--dry-run`
- **THEN** every intended command and managed target is reported and no Pi package, file, skill, provider, or ledger state is changed

#### Scenario: US1 - Install the complete Pi agent pack 3

- **GIVEN** any mandatory Pi-owned, thoth-agents-owned, external-skill, or provider step fails
- **WHEN** installation finishes
- **THEN** it reports bounded partial-state diagnostics and does not record complete installation

### Requirement: Preserve one canonical source

The thoth-agents repository and generated plugin packages MUST NOT vendor the
four external skill trees. Their canonical repositories MUST remain the single
source of truth so a skill update does not require synchronized copies here.

### Requirement: Install through the skills CLI

For Pi, the installer MUST invoke the canonical `skills` CLI with the concrete `pi` selector, global scope, explicit skill name, noninteractive confirmation, and copied materialization into Pi's native global skill root; failure or a detected `PI_CODING_AGENT_DIR` destination mismatch MUST fail or return an explicit manual action rather than claim discovery.

#### Scenario: US1 - Install the complete Pi agent pack 1

- **GIVEN** Pi `0.84.4` or a compatible evidenced release, Node.js `>=22.19`, and an empty isolated Pi home
- **WHEN** `thoth-agents install --agent=pi` is applied
- **THEN** the native Pi delegation and research packages, managed grep.app MCP configuration, root instructions, six canonical specialist definitions, owned skills, required external skills, provider setup, and Pi ledger record are completed in order

#### Scenario: US1 - Install the complete Pi agent pack 2

- **GIVEN** the same environment
- **WHEN** the installation is run with `--dry-run`
- **THEN** every intended command and managed target is reported and no Pi package, file, skill, provider, or ledger state is changed

#### Scenario: US1 - Install the complete Pi agent pack 3

- **GIVEN** any mandatory Pi-owned, thoth-agents-owned, external-skill, or provider step fails
- **WHEN** installation finishes
- **THEN** it reports bounded partial-state diagnostics and does not record complete installation

### Requirement: Keep SDD runtime independent of the CLI

Installation MAY invoke Pi, npm, the skills CLI, and provider setup, but after installation the native Pi package MUST supply its extension and thoth-owned SDD contracts without invoking the thoth-agents CLI, `npx skills add`, or a network fetch during an SDD phase.

#### Scenario: US2 - Run Thoth from its Pi extension boundary 1

- **GIVEN** the native package is installed
- **WHEN** Pi begins an agent turn
- **THEN** its extension injects exactly one current adaptive-root contract through the supported native lifecycle without persisting a duplicate `APPEND_SYSTEM.md` block

#### Scenario: US2 - Run Thoth from its Pi extension boundary 2

- **GIVEN** Pi loads package resources
- **WHEN** skills are enumerated
- **THEN** the five thoth-owned workflow skills resolve from the native package manifest without copied global duplicates

#### Scenario: US2 - Run Thoth from its Pi extension boundary 3

- **GIVEN** `pi-subagents-j0k3r` requires filesystem definitions
- **WHEN** the package synchronizer runs
- **THEN** exactly six attributable canonical agent definitions are discoverable globally and an unowned canonical conflict is preserved and reported rather than overwritten

#### Scenario: US4 - Preserve external ownership and existing harnesses 1

- **GIVEN** the native Pi package
- **WHEN** its packed contents are inspected
- **THEN** it contains only thoth-owned extension, agent, prompt, skill, and diagnostic assets and references external runtimes by pinned package source

#### Scenario: US4 - Preserve external ownership and existing harnesses 2

- **GIVEN** OpenCode, Codex, or Claude Code installation and runtime flows
- **WHEN** the Pi package change is present
- **THEN** their current behavior and generated artifacts remain unchanged except for shared truthful documentation

### Requirement: Preserve harness-native discovery

Pi MUST discover the five thoth-owned workflow skills directly from the installed `thoth-agents` package manifest and MUST discover exactly six package-owned specialist definitions from Pi's global agent directory; setup MUST remove only provably attributable legacy copied skill duplicates, MUST install the four external skills from their canonical repositories, and MUST remain independent of CLI/network access during SDD execution.

#### Scenario: US2 - Run Thoth from its Pi extension boundary 1

- **GIVEN** the native package is installed
- **WHEN** Pi begins an agent turn
- **THEN** its extension injects exactly one current adaptive-root contract through the supported native lifecycle without persisting a duplicate `APPEND_SYSTEM.md` block

#### Scenario: US2 - Run Thoth from its Pi extension boundary 2

- **GIVEN** Pi loads package resources
- **WHEN** skills are enumerated
- **THEN** the five thoth-owned workflow skills resolve from the native package manifest without copied global duplicates

#### Scenario: US2 - Run Thoth from its Pi extension boundary 3

- **GIVEN** `pi-subagents-j0k3r` requires filesystem definitions
- **WHEN** the package synchronizer runs
- **THEN** exactly six attributable canonical agent definitions are discoverable globally and an unowned canonical conflict is preserved and reported rather than overwritten

#### Scenario: US3 - Update, migrate, and diagnose native package state 1

- **GIVEN** a legacy complete Pi setup from the prior release
- **WHEN** Update succeeds
- **THEN** the exact native package is installed, the attributable legacy root block and duplicate owned-skill copies are removed, specialist discovery is preserved, and unrelated operator content is unchanged

#### Scenario: US3 - Update, migrate, and diagnose native package state 2

- **GIVEN** any installed first-party or external package/source/version, resource, provider, or remote-state mismatch
- **WHEN** status is requested
- **THEN** each layer is reported independently without advancing or inferring the last-complete ledger

#### Scenario: US3 - Update, migrate, and diagnose native package state 3

- **GIVEN** native package state is incomplete or conflicting
- **WHEN** Sync or Update is planned
- **THEN** it returns a bounded repair or manual action and never falls through to another harness

#### Scenario: US4 - Preserve external ownership and existing harnesses 1

- **GIVEN** the native Pi package
- **WHEN** its packed contents are inspected
- **THEN** it contains only thoth-owned extension, agent, prompt, skill, and diagnostic assets and references external runtimes by pinned package source

#### Scenario: US4 - Preserve external ownership and existing harnesses 2

- **GIVEN** OpenCode, Codex, or Claude Code installation and runtime flows
- **WHEN** the Pi package change is present
- **THEN** their current behavior and generated artifacts remain unchanged except for shared truthful documentation

### Requirement: Leave QA tooling to the project

thoth-agents MUST NOT require or install `playwright-cli`, Playwright, or another
browser/QA executable. Projects remain responsible for their own visual,
integration, and end-to-end QA tooling.
