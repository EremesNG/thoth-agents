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

Before substantive execution, the root MUST shape bounded ready and blocked lanes with exact dependencies, ownership, specialist fit, and verification inputs; for each declared ready parallel group it MUST create one fresh bounded native assignment per lane, dispatch every lane admitted by current native capacity before the first blocking wait or result collection, refill released capacity with remaining ready lanes before waiting again, accept only terminal native evidence for fan-in, and cross the declared barrier only after all lanes are reconciled, while preserving truthful sequential fallback when native concurrency is unavailable or unproven.

#### Scenario: US3 - Execute native fan-out before fan-in 1

- **GIVEN** a declared group whose ready lanes fit current native capacity
- **WHEN** implementation begins
- **THEN** the root creates one fresh bounded specialist assignment per lane and issues all native dispatches before the first wait, status, result, or assigned-work implementation action

#### Scenario: US3 - Execute native fan-out before fan-in 2

- **GIVEN** a declared group is wider than current native capacity
- **WHEN** a terminal result releases capacity
- **THEN** the root dispatches the next undispatched ready lane before waiting again and does not claim full-width concurrency

#### Scenario: US3 - Execute native fan-out before fan-in 3

- **GIVEN** a harness lacks or does not prove the needed concurrent primitive
- **WHEN** the group is reached
- **THEN** the root reports the capability gap and uses a truthful sequential fallback without adding a Thoth executor

#### Scenario: US3 - Execute native fan-out before fan-in 4

- **GIVEN** some group lanes are nonterminal, timed out, silent, or malformed
- **WHEN** fan-in is evaluated
- **THEN** the root keeps the barrier closed until every lane has terminal validated evidence

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

### Requirement: Fresh delegation at work boundaries

The canonical orchestration policy MUST make a fresh subagent instance the default whenever the objective, SDD phase, mutable surface, or independent-judgment boundary changes.

#### Scenario: US1 - Receive fresh specialists at work boundaries 1

- **GIVEN** a specialist completed one bounded assignment
- **WHEN** the root delegates a different objective, SDD phase, mutable surface, or independent judgment
- **THEN** the root creates a fresh native subagent instance

#### Scenario: US1 - Receive fresh specialists at work boundaries 2

- **GIVEN** Oracle performed an optional plan review
- **WHEN** final implementation verification begins
- **THEN** the root delegates that verification to a fresh Oracle instance

#### Scenario: US1 - Receive fresh specialists at work boundaries 3

- **GIVEN** Oracle returned findings that need clarification
- **WHEN** the root asks only about those same findings without requesting a new approval or PASS judgment
- **THEN** the root may continue that exact Oracle assignment

### Requirement: Bounded continuation exception

The canonical orchestration policy MUST permit resuming or steering an existing subagent only for the exact same bounded assignment and MUST NOT treat completed role instances as a reusable pool.

#### Scenario: US2 - Continue only the same bounded assignment 1

- **GIVEN** a specialist is still executing a bounded assignment
- **WHEN** the root supplies a correction or missing context for that same assignment
- **THEN** the root may continue the existing session

#### Scenario: US2 - Continue only the same bounded assignment 2

- **GIVEN** a specialist completed a bounded assignment
- **WHEN** the root requests clarification or completion of that unchanged assignment and no independent judgment is required
- **THEN** the root may resume it deliberately

#### Scenario: US2 - Continue only the same bounded assignment 3

- **GIVEN** the root is waiting for a running task
- **WHEN** it uses the harness status or wait surface
- **THEN** that operation is treated as collection of the existing assignment rather than permission to reuse the session for later work

### Requirement: Fresh independent judgment

Every Oracle plan review, verification round, and PASS-producing judgment MUST use a fresh Oracle instance; an existing Oracle session MAY be resumed only to clarify its current findings without issuing a new approval judgment.

#### Scenario: US1 - Receive fresh specialists at work boundaries 1

- **GIVEN** a specialist completed one bounded assignment
- **WHEN** the root delegates a different objective, SDD phase, mutable surface, or independent judgment
- **THEN** the root creates a fresh native subagent instance

#### Scenario: US1 - Receive fresh specialists at work boundaries 2

- **GIVEN** Oracle performed an optional plan review
- **WHEN** final implementation verification begins
- **THEN** the root delegates that verification to a fresh Oracle instance

#### Scenario: US1 - Receive fresh specialists at work boundaries 3

- **GIVEN** Oracle returned findings that need clarification
- **WHEN** the root asks only about those same findings without requesting a new approval or PASS judgment
- **THEN** the root may continue that exact Oracle assignment

### Requirement: Status is not reuse

Native wait and status operations MUST remain scoped to collecting a nonterminal assignment and MUST NOT authorize reusing that session for a later work unit.

#### Scenario: US2 - Continue only the same bounded assignment 1

- **GIVEN** a specialist is still executing a bounded assignment
- **WHEN** the root supplies a correction or missing context for that same assignment
- **THEN** the root may continue the existing session

#### Scenario: US2 - Continue only the same bounded assignment 2

- **GIVEN** a specialist completed a bounded assignment
- **WHEN** the root requests clarification or completion of that unchanged assignment and no independent judgment is required
- **THEN** the root may resume it deliberately

#### Scenario: US2 - Continue only the same bounded assignment 3

- **GIVEN** the root is waiting for a running task
- **WHEN** it uses the harness status or wait surface
- **THEN** that operation is treated as collection of the existing assignment rather than permission to reuse the session for later work

### Requirement: Native lifecycle translation

Each supported harness MUST render its native fresh and continuation mechanisms: Codex `spawn_agent` with `fork_turns="none"` versus `followup_task`, OpenCode `task` without `task_id` versus the prior `task_id`, and Claude Code normal `Agent` versus `SendMessage`, while avoiding inherited/forked context for independent work.

#### Scenario: US3 - Apply native lifecycle operations consistently 1

- **GIVEN** Codex requires fresh delegation
- **WHEN** its root prompt is rendered
- **THEN** it names `collaboration.spawn_agent` with `fork_turns="none"`; continuation names `collaboration.followup_task`

#### Scenario: US3 - Apply native lifecycle operations consistently 2

- **GIVEN** OpenCode requires fresh delegation
- **WHEN** its root prompt is rendered
- **THEN** it names `task` without `task_id`; continuation allows the prior `task_id` only for the same assignment

#### Scenario: US3 - Apply native lifecycle operations consistently 3

- **GIVEN** Claude Code requires fresh delegation
- **WHEN** its root prompt is rendered
- **THEN** it names a normal `Agent` invocation; continuation names `SendMessage` to the prior agent ID and independent work forbids forked context inheritance

### Requirement: Expose routable role contracts

Every root MUST present the complete specialist roster with equally salient positive and negative semantic triggers, MUST consider all six specialists during task shaping, and MUST distinguish role existence from an actual dispatch decision.

#### Scenario: US2 - Activate the complete specialist roster 1

- **GIVEN** broad or uncertain local repository discovery
- **WHEN** the root selects a specialist
- **THEN** it selects `explorer` and keeps the assignment read-only

#### Scenario: US2 - Activate the complete specialist roster 2

- **GIVEN** current, unfamiliar, version-sensitive, or externally sourced facts are required
- **WHEN** the root selects a specialist
- **THEN** it selects `librarian`; stable facts already established locally do not trigger it

#### Scenario: US2 - Activate the complete specialist roster 3

- **GIVEN** material UI/UX, interaction, accessibility, or visual-quality work
- **WHEN** the root selects a writer
- **THEN** it selects `designer` with bounded user-facing ownership and visual verification

#### Scenario: US2 - Activate the complete specialist roster 4

- **GIVEN** a known, narrow, low-risk implementation lane inside a larger coordinated task
- **WHEN** its context and writes can be isolated
- **THEN** the root selects `quick` rather than consuming the root's coordination path

#### Scenario: US2 - Activate the complete specialist roster 5

- **GIVEN** coupled contracts, concurrency, migration, shared-state, edge-case-heavy, or high-risk implementation
- **WHEN** the root selects a writer
- **THEN** it selects `deep` instead of `quick`

#### Scenario: US2 - Activate the complete specialist roster 6

- **GIVEN** material architecture, security, persistent diagnosis, contradictory evidence, or high-cost uncertainty
- **WHEN** independent judgment would change confidence or authorization
- **THEN** the root selects a fresh read-only `oracle`

### Requirement: Use the strongest truthful native role selector

Each harness adapter MUST instruct the root to use an explicit canonical-role selector when the native runtime exposes one and MUST provide a bounded instruction-level fallback otherwise; capability metadata MUST NOT claim structural enforcement that the generated package cannot guarantee.

#### Scenario: US2 - Receive consistent routing across harnesses 1

- **GIVEN** a harness exposes an explicit role selector
- **WHEN** the root delegates
- **THEN** its instructions require that selector and the selected canonical role

#### Scenario: US2 - Receive consistent routing across harnesses 2

- **GIVEN** a Codex host does not expose an explicit custom-role selector
- **WHEN** delegation is still available
- **THEN** the generated guidance uses a bounded
