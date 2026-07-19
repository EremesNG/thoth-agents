# Spec: Multi-Harness Agent Pack

## Requirements

### Requirement: Support exactly three harnesses

The system MUST support OpenCode, Codex, and Claude Code. OpenCode MUST remain the
default when no harness is selected. Unsupported harnesses MUST fail explicitly
without generating fallback artifacts.

#### Scenario: Default install

- **WHEN** the CLI runs without an explicit harness in a non-interactive context
- **THEN** it routes to OpenCode
- **AND** it does not mutate Codex or Claude targets.

### Requirement: Preserve the ten-role contract

Every harness MUST derive its behavior from the canonical roles
`orchestrator`, `explorer`, `librarian`, `oracle`, `sdd-specify`, `sdd-plan`,
`sdd-tasks`, `designer`, `quick`, and `deep`.

#### Scenario: Specialist materialization

- **WHEN** Codex is installed
- **THEN** the ambient session is the root and nine specialist TOMLs are written
- **AND** no orchestrator child TOML is created.

#### Scenario: Claude package materialization

- **WHEN** Claude Code is installed
- **THEN** the package contains the orchestrator main-thread agent and all nine
  specialist agents.

### Requirement: Use adaptive-root delegation

The root MUST work directly on clear bounded tasks and MUST delegate only for net
gain. Delegation depth MUST be one, overlapping writes MUST NOT run in parallel,
and each mutable surface MUST have one writer.

#### Scenario: Simple documentation change

- **GIVEN** a clear local README edit with low failure cost
- **WHEN** the root routes the work
- **THEN** it performs direct work and focused verification
- **AND** it does not create an SDD pipeline or delegate without a concrete gain.

### Requirement: Keep role permissions explicit

Read-only roles MUST NOT mutate. SDD coordination roles MUST write only under
`openspec/`. Implementation writers MUST remain scoped to assigned surfaces.
Adapters MUST disclose any instruction-only enforcement gap.

### Requirement: Distinguish capability gaps from fatal generation errors

Integration generation MUST deduplicate diagnostics by code. An error with an
`instruction-only` or `diagnostic-only` fallback MUST be presented as a
non-fatal capability gap. Only an error without a recoverable fallback MUST make
the generator exit nonzero.

#### Scenario: Current Codex package has no hooks

- **GIVEN** the generated Codex package contains no hook artifact
- **WHEN** integration packages are synchronized
- **THEN** no hook activation, feature-gate, or trust-readiness diagnostic is
  emitted.

#### Scenario: Required generation outcome has no fallback

- **GIVEN** generation reports an error without a recoverable fallback
- **THEN** it is presented as an error
- **AND** the generator exits nonzero.

### Requirement: Isolate harness-specific writing

OpenCode, Codex, and Claude artifacts MUST be written only by their corresponding
adapter/writer/CLI operation. Shared contracts MUST NOT depend on harness-only
APIs.

### Requirement: Use minimal plugin manifests

Codex and Claude plugin manifests MUST contain only documented fields and current
package identity/version. External required skills MUST NOT be represented as
fake plugin dependencies or plugin settings.

### Requirement: Publish repository-native marketplaces

The repository and npm package MUST include `.agents/plugins/marketplace.json`
for Codex and `.claude-plugin/marketplace.json` for Claude Code. Their sources
MUST resolve to versioned packages under `integrations/codex` and
`integrations/claude-code` respectively.

#### Scenario: Marketplace package generation

- **WHEN** integration packages are synchronized for a release
- **THEN** both marketplace files and both referenced packages are generated
  deterministically from the harness adapters
- **AND** their plugin versions equal the root package version.

### Requirement: Preserve native plugin-manager ownership

thoth-agents MUST NOT copy or merge plugin packages into personal Codex or
Claude plugin-manager directories. Claude install, enablement, and inspection
MUST use its native plugin CLI. Codex registration and trust MUST remain a native
interactive marketplace step.

#### Scenario: Claude native installation

- **WHEN** Claude Code installation is applied
- **THEN** the CLI registers `EremesNG/thoth-agents` and installs
  `thoth-agents@thoth-agents` through the Claude plugin manager
- **AND** no thoth-agents operation edits the manager-owned installed cache.

### Requirement: Preserve provider ownership

No generated package MUST bundle thoth-mem hooks, MCP, protocol, lifecycle, or
persistence implementation. Provider capability MUST be reported from evidence
as supported, degraded, or unsupported.

### Requirement: Use OpenAI as the only OpenCode built-in preset

Generated OpenCode configuration MUST contain only the `openai` built-in preset.
It MUST NOT generate Kimi, Copilot, ZAI/GLM, or mixed-provider mappings.

#### Scenario: Fresh OpenCode configuration

- **WHEN** installation creates thoth-agents configuration
- **THEN** `preset` is `openai`
- **AND** `presets` contains only the ten-role OpenAI mapping.
