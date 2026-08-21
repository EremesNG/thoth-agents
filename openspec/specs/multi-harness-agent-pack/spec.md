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

The root MUST evaluate implementation ownership independently from Direct, Accelerated, Full, or no-artifact execution; it MAY implement directly or delegate to a specialist in every route according to explicit user direction and demonstrated net gain from specialization, context isolation, independent parallelism, quality, latency, or total cost, balanced against sequential dependency, shared mutable state, accumulated context, rediscovery, and coordination overhead.

#### Scenario: US1 - Choose ownership independently from SDD route 1

- **GIVEN** a large user-facing change selected as Direct/no-artifact work
- **WHEN** designer specialization and isolated context create a net gain
- **THEN** the root may delegate the bounded UI surface to `designer`

#### Scenario: US1 - Choose ownership independently from SDD route 2

- **GIVEN** a coupled correctness-heavy Direct/no-artifact change
- **WHEN** a fresh bounded implementation context reduces interference and rediscovery is acceptable
- **THEN** the root may delegate the surface to `deep`

#### Scenario: US1 - Choose ownership independently from SDD route 3

- **GIVEN** an Accelerated or Full change with one sequential mutable surface whose planning and implementation share significant root context
- **WHEN** delegation would add coordination or rediscovery cost without a quality or latency gain
- **THEN** root may implement the accepted surface directly

#### Scenario: US2 - Delegate specialists only for demonstrated net gain 1

- **GIVEN** an independent bounded surface with a strong specialist fit
- **WHEN** its context can be isolated without overlapping writes
- **THEN** the root selects the matching specialist regardless of SDD route

#### Scenario: US2 - Delegate specialists only for demonstrated net gain 2

- **GIVEN** a short task, a single ordered reasoning chain, frequent shared-state writes, or significant already-loaded root context
- **WHEN** delegation adds more overhead than benefit
- **THEN** root remains the implementation owner regardless of SDD route

#### Scenario: US2 - Delegate specialists only for demonstrated net gain 3

- **GIVEN** explicit user direction to use or avoid an implementation subagent
- **WHEN** that direction is safe and compatible with mandatory independent verification
- **THEN** the root treats it as an ownership input rather than inferring it from Direct, Accelerated, or Full

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

Every canonical role description and generated specialist prompt MUST state positive routing triggers, negative routing triggers, allowed mutation scope, escalation conditions, verification duty, and compact return expectations, and the root prompt MUST use those contracts when choosing an owner.

#### Scenario: US1 - Receive the right implementation specialist 1

- **GIVEN** an Accelerated or Full change has passed its planning gates
- **WHEN** implementation begins
- **THEN** the root selects at least one bounded specialist

#### Scenario: US1 - Receive the right implementation specialist 2

- **GIVEN** UI/UX or visual-quality work
- **WHEN** the root selects the writer
- **THEN** `designer` owns the bounded user-facing surface and its visual QA

#### Scenario: US2 - Receive consistent routing across harnesses 1

- **GIVEN** a harness exposes an explicit role selector
- **WHEN** the root delegates
- **THEN** its instructions require that selector and the selected canonical role

#### Scenario: US2 - Receive consistent routing across harnesses 2

- **GIVEN** a Codex host does not expose an explicit custom-role selector
- **WHEN** delegation is still available
- **THEN** the generated guidance uses a bounded

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
