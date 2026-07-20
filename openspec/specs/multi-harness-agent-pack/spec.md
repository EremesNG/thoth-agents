# Spec: Multi-Harness Agent Pack

## Requirements

### Requirement: Support exactly three harnesses

The system MUST support OpenCode, Codex, and Claude Code. OpenCode MUST remain
the default when no harness is selected. Unsupported harnesses MUST fail
explicitly without generating fallback artifacts.

### Requirement: Preserve the seven-role contract

Every harness MUST derive behavior from `orchestrator`, `explorer`, `librarian`,
`oracle`, `designer`, `quick`, and `deep`. No active registration, schema key,
model mapping, generated agent, or prompt contract may expose phase-only SDD
roles.

#### Scenario: Codex specialist materialization

- **WHEN** mandatory Codex CLI installation runs with the native manager available
- **THEN** the ambient session remains root and six global specialist TOMLs are written
- **AND** the orchestrator contract is merged into `~/.codex/AGENTS.md`
- **AND** no orchestrator child TOML is created.

#### Scenario: Claude package materialization

- **WHEN** the Claude package is generated
- **THEN** it contains the orchestrator main-thread agent and six specialist
  agents derived from `src/agents/`.

### Requirement: Use adaptive-root delegation

The root MUST handle clear bounded work directly and delegate only for net gain.
Delegation depth MUST be one, overlapping writes MUST NOT run in parallel, and
each mutable surface MUST have one writer. Every implementation MUST receive
independent verification from oracle.

### Requirement: Keep role permissions explicit

Explorer, librarian, and oracle MUST remain read-only. Implementation writers
MUST remain scoped to assigned surfaces. Adapters MUST disclose any
instruction-only enforcement gap; a missing harness permission primitive MUST
NOT be represented as equivalent enforcement.

### Requirement: Distribute runtime-autonomous assets with explicit bootstrap

The shared Codex and Claude plugin bundle MUST include one copy of the canonical
owned workflow skills and MUST NOT vendor mandatory external execution skills.
Installation for every harness MUST use the thoth-agents CLI as the authority
and invoke `npx skills add` against each missing external skill's canonical
repository. During SDD execution, no agent may invoke the CLI or download a
phase contract.

OpenCode MUST expose `/thoth-init`, Codex MUST expose `$thoth-init`, and Claude
MUST expose its namespaced `thoth-init` skill. Initialization MUST be offline,
idempotent, project-scoped, and preserve project-owned files.

Codex MUST NOT be described as a zero-step or agent-bearing plugin. Its manifest
cannot declare custom agents or global instructions; mandatory CLI setup MUST
materialize six standalone global TOMLs and the required root/config surfaces.
`$thoth-init` MUST create project governance only.

### Requirement: Publish repository-native marketplaces

The repository and npm package MUST include `.agents/plugins/marketplace.json`
for Codex and `.claude-plugin/marketplace.json` for Claude. Their sources MUST
resolve to the same versioned bundle under `plugin/`; generated plugin versions
MUST equal the root package version.

### Requirement: Install the Codex plugin through its native manager

The Codex installer MUST inspect JSON marketplace and plugin state, register
`EremesNG/thoth-agents` when absent, and install or enable
`thoth-agents@thoth-agents` through official `codex plugin` commands before
writing global agent-pack files. It MUST fail closed on unreadable state, a
same-named marketplace from another source, command failure, or failed
post-install verification. Dry-run MUST plan these commands without mutating the
native manager.

### Requirement: Generate the shared plugin from canonical source

Claude agents MUST be generated from `src/agents/`. The shared bundle MUST
receive one copy of the canonical thoth-owned `skills/` tree and MUST contain
separate harness-specific manifests and MCP surfaces. The Codex plugin manifest
MUST NOT declare generated role TOMLs; the CLI writer remains their canonical
delivery surface. Build and npm version lifecycle commands MUST synchronize the
generated shared plugin output.

### Requirement: Preserve native plugin-manager ownership

thoth-agents MUST NOT copy or merge the plugin bundle into personal Codex or
Claude manager directories. Marketplace registration, enablement, trust, and
installed caches remain harness-owned. Project initialization may write only
the documented project surfaces required by the workflow.

### Requirement: Distinguish capability gaps from generation failure

Generation MUST deduplicate diagnostics by code. Instruction-only or
diagnostic-only fallbacks MUST be reported as non-fatal capability gaps. A
required outcome with no recoverable fallback MUST make generation fail.

### Requirement: Preserve provider ownership

No generated package may bundle thoth-mem hooks, MCP lifecycle, protocol, or
persistence implementation. Provider capability MUST be reported only from
evidence as supported, degraded, or unsupported.

### Requirement: Use OpenAI as the only OpenCode built-in preset

Generated OpenCode configuration MUST contain only the `openai` built-in preset
for the seven-role roster. It MUST NOT generate Kimi, Copilot, ZAI/GLM, or
mixed-provider mappings.

### Requirement: Bundle the plan reviewer

The canonical thoth-owned skill bundle and every generated or initialized harness distribution MUST include `plan-reviewer`, while generated root prompts MUST express route selection and review selection through each harness's native blocking input surface.

#### Scenario: US3 - Receive the same choices in every harness 1

- **GIVEN** any supported harness
- **WHEN** its root prompt is rendered
- **THEN** it tells the root to recommend a route, wait for the user's choice, and offer

#### Scenario: US3 - Receive the same choices in every harness 2

- **GIVEN** Codex or Claude uses a harness-specific blocking input primitive
- **WHEN** either user decision is requested
- **THEN** the generated prompt names
