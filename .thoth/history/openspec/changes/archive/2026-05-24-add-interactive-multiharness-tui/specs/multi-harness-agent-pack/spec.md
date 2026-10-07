# Delta for Multi-Harness Agent Pack

## ADDED Requirements

### Requirement: Launch Interactive TUI Only for Supported TTY Entry
The CLI MUST launch a rich interactive multi-harness TUI for no-argument
invocation only when the process is attached to an interactive terminal that can
support TUI rendering.

#### Scenario: No-argument interactive terminal opens the TUI
- GIVEN a user invokes `thoth-agents` with no CLI arguments
- AND stdin and stdout are interactive TTY streams
- WHEN the CLI entrypoint starts
- THEN the system MUST route to the interactive TUI shell
- AND the TUI MUST expose the supported harness actions through navigable
  terminal UI controls rather than immediately applying the default installer
  side effect

#### Scenario: No-argument non-TTY invocation remains automation-safe
- GIVEN a script, CI job, pipe, or redirected process invokes `thoth-agents`
  with no CLI arguments
- AND stdin or stdout is not an interactive TTY stream
- WHEN the CLI entrypoint starts
- THEN the system MUST NOT launch an interactive TUI
- AND it MUST return deterministic non-interactive output or guidance with a
  stable exit behavior suitable for automation
- AND it MUST NOT block waiting for terminal input

### Requirement: Preserve Existing Non-Interactive Commands
The CLI MUST preserve existing non-interactive `install` and `generate`
commands, flags, defaults, diagnostics, and dry-run behavior as stable
automation surfaces beneath the interactive TUI.

#### Scenario: Explicit install remains command-driven
- GIVEN a caller invokes `thoth-agents install` with existing options such as
  `--agent=opencode`, `--agent=codex`, `--dry-run`, `--no-tui`, `--reset`,
  `--tmux=...`, or `--skills=...`
- WHEN command parsing and execution run
- THEN the system MUST execute the command path selected by those arguments
- AND it MUST NOT require interactive TUI navigation to complete the requested
  operation
- AND existing OpenCode default install behavior MUST remain compatible when
  `--agent` is omitted

#### Scenario: Explicit generate remains available
- GIVEN a caller invokes `thoth-agents generate --harness=codex --dry-run`
- WHEN command parsing and execution run
- THEN the system MUST preserve the existing generation behavior and diagnostics
- AND the TUI MUST NOT replace or remove this command surface

### Requirement: Keep Plugin and Binary Distribution Surfaces Separate
The system MUST keep OpenCode plugin installation and npm CLI binary
availability as separate distribution surfaces with accurate user-facing
messaging.

#### Scenario: OpenCode plugin config remains package-based
- GIVEN a user installs or configures the OpenCode plugin path
- WHEN generated guidance, TUI status, or install output describes the OpenCode
  plugin entry
- THEN it MUST continue to identify the OpenCode plugin configuration as
  `plugin: ["thoth-agents@latest"]`
- AND it MUST NOT imply that this OpenCode plugin entry installs a global
  `thoth-agents` shell binary

#### Scenario: CLI binary availability is reported separately
- GIVEN the TUI or status command reports local setup state
- WHEN it describes how the `thoth-agents` command becomes available in a shell
- THEN it MUST identify npm binary delivery through supported package-manager or
  exec flows such as global install, `npx`, or `pnpm dlx`
- AND it MUST NOT mutate, inspect, or depend on OpenCode-owned plugin cache
  internals to provide the shell binary

### Requirement: Provide Multi-Harness TUI Operations
The interactive TUI MUST provide guided operations for harness status, listing,
updates, synchronization, and model configuration while reusing the same
underlying service contracts as non-interactive commands where those contracts
exist.

#### Scenario: TUI lists supported harnesses and actions
- GIVEN the interactive TUI has launched
- WHEN the user views available harness operations
- THEN it MUST list OpenCode and Codex as the supported harness targets
- AND it MUST NOT list unsupported harnesses as installable or configurable
  targets
- AND it MAY show unsupported harnesses only as explicitly unavailable or out of
  scope

#### Scenario: TUI exposes status, update, sync, and model configuration
- GIVEN the interactive TUI has launched
- WHEN the user navigates supported operations
- THEN it MUST provide entries or flows for status, list, update, sync, and
  model configuration
- AND each flow MUST identify the target harness before any mutation is applied
- AND mutation-capable flows MUST reuse command-core behavior or shared services
  rather than duplicating side effects in presentation code

### Requirement: Report Installation State Precisely
Status and update flows MUST distinguish installed, missing, drift, outdated,
and unknown states for managed thoth-agents surfaces without collapsing them
into a single generic success or failure result.

#### Scenario: Status classifies managed state
- GIVEN the system inspects a supported harness target or package surface
- WHEN it can compare expected managed state to observed state
- THEN it MUST report `installed` when the expected managed state is present and
  current
- AND it MUST report `missing` when required managed state is absent
- AND it MUST report `drift` when managed state exists but differs from the
  expected deterministic output or managed markers
- AND it MUST report `outdated` when a known installed version or generated
  artifact version is older than the expected version
- AND it MUST report `unknown` when the system cannot safely determine state
  without unsupported inspection or mutation

#### Scenario: Update plans preserve unknown and drift detail
- GIVEN an update or sync flow evaluates a target with drift, outdated, missing,
  or unknown state
- WHEN it presents the next action
- THEN it MUST describe the specific state that caused the recommendation
- AND it MUST NOT present unknown state as safely installed or safely repairable
- AND it MUST NOT overwrite drifted or user-modified content without a
  dry-run-visible plan and explicit mutation path

### Requirement: Guard Mutations with Dry-Run and Confirmation
TUI and command-driven mutation flows MUST provide dry-run or preview behavior
and explicit safety boundaries before writing managed files, config, marketplace
entries, package artifacts, or installer-owned state.

#### Scenario: Mutation flow can preview planned changes
- GIVEN a user selects install, update, sync, repair, or model configuration in
  the TUI
- WHEN the operation would write or modify managed state
- THEN the system MUST provide a dry-run or preview of planned changes before
  applying them
- AND the preview MUST identify target harness, target paths or managed
  surfaces, backup expectations, and capability disclaimers where applicable

#### Scenario: Unsafe mutation is not implicit
- GIVEN a TUI flow detects drift, unsupported state, unknown state, or a
  capability gap
- WHEN the user attempts to continue
- THEN the system MUST require an explicit apply action or documented command
  path before mutation
- AND it MUST NOT apply writes merely because the TUI screen was opened,
  refreshed, or navigated

### Requirement: Configure Models Within Harness Capability Boundaries
The TUI model configuration flow MUST configure model or provider settings only
where the selected harness exposes a supported configuration surface, and MUST
avoid claiming unsupported role-level behavior.

#### Scenario: OpenCode model settings include supported roles
- GIVEN the user selects OpenCode model configuration
- WHEN the TUI presents configurable model settings
- THEN it MUST include the OpenCode orchestrator and subagent roles where the
  OpenCode adapter supports configuring them
- AND it MUST preserve the seven-agent roster of orchestrator, explorer,
  librarian, oracle, designer, quick, and deep
- AND it MUST NOT rename, add, or remove roles while configuring models

#### Scenario: Codex model settings avoid unsupported role claims
- GIVEN the user selects Codex model configuration
- WHEN the TUI presents configurable model settings
- THEN it MUST distinguish documented Codex configuration that can be written or
  guided from instruction-level or user-managed settings
- AND it MUST NOT claim provider-per-role, provider-per-subagent, or selectable
  orchestrator model behavior unless that behavior is backed by a supported
  Codex configuration surface
- AND unsupported Codex role model behavior MAY be shown only as a limitation,
  note, or future validation item

## MODIFIED Requirements

## REMOVED Requirements
