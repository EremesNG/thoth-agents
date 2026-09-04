# Spec: Multi-Harness Agent Pack

## Requirements

### Requirement: Support exactly four harnesses

The system MUST support OpenCode, Codex, Claude Code, and Pi; OpenCode MUST remain the default when no harness is selected, and unsupported harnesses MUST fail explicitly without fallback artifacts or dispatch.

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

#### Scenario: US4 - Preserve existing harnesses while raising the runtime floor 1

- **GIVEN** an existing OpenCode, Codex, or Claude workflow
- **WHEN** the Pi integration is present
- **THEN** its existing adapter, installation, delegation, provider, and generated-package behavior is unchanged

#### Scenario: US4 - Preserve existing harnesses while raising the runtime floor 2

- **GIVEN** active package, CI, skill, and documentation surfaces
- **WHEN** runtime requirements are evaluated
- **THEN** they consistently require Node.js `>=22.19`

### Requirement: Preserve the seven-role contract

The native Pi package MUST derive one ambient `orchestrator` root and the six `explorer`, `librarian`, `oracle`, `designer`, `quick`, and `deep` specialists from the canonical role contracts, MUST NOT create an orchestrator child definition, and MUST preserve role prompts, model/effort metadata where Pi supports them, memory envelopes, ownership, and return contracts.

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

The Pi extension and specialist definitions MUST apply the strongest native root and child tool controls available while stating that extension execution, root injection, resource materialization, process credentials, filesystem, and network access remain within the invoking user's privileges and are not an OS sandbox.

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

### Requirement: Publish a native Pi package with runtime-autonomous assets

The published `thoth-agents` npm artifact MUST identify as a Pi package, MUST declare exactly one compiled native extension and the five packaged thoth-owned workflow skills through supported Pi manifest fields, MUST ship the six canonical specialist resources, and MUST remain usable from its installed package root without invoking the thoth-agents CLI or network during ordinary Pi runtime.

#### Scenario: US1 - Install thoth-agents as the first native Pi package 1

- **GIVEN** Pi `0.84.4`, Node.js `>=22.19`, an executing thoth-agents version, and an empty isolated Pi home
- **WHEN** Pi installation is applied
- **THEN** `pi install npm:thoth-agents@<exact-version> --no-approve` completes and is verified before delegation, research, skills, provider, or ledger steps

#### Scenario: US1 - Install thoth-agents as the first native Pi package 2

- **GIVEN** the same environment
- **WHEN** installation is previewed
- **THEN** the first-party and external package commands plus every migration and setup target are reported with zero mutation

#### Scenario: US1 - Install thoth-agents as the first native Pi package 3

- **GIVEN** first-party package installation or verification fails
- **WHEN** setup exits
- **THEN** no external dependency is installed and no complete ledger record is written

#### Scenario: US1 - Install thoth-agents as the first native Pi package 4

- **GIVEN** an existing global `thoth-agents` Pi source
- **WHEN** no valid thoth-agents ownership receipt matches that exact source
- **THEN** setup reports an unowned conflict before invoking any mutating Pi command

#### Scenario: US1 - Install thoth-agents as the first native Pi package 5

- **GIVEN** a receipt-owned prior source
- **WHEN** replacement, native-load observation, or receipt commit fails
- **THEN** setup restores and verifies the prior source, leaves the prior receipt authoritative, and blocks every downstream dependency; a failed compensation is reported explicitly

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

Pi installation MUST install and verify the exact executing `thoth-agents` package through `pi install` before installing the selected compatible `pi-subagents-j0k3r` and research packages; MUST treat one schema-validated thoth-agents Pi-package receipt as the sole authority for replacing or removing an existing global first-party source; MUST reject an unowned, ambiguous, project-local, or receipt-inconsistent first-party source before mutation; and MUST use external packages' public native surfaces without vendoring, patching, copying their internals, or reimplementing execution, concurrency, task/history, research, or provider lifecycle.

#### Scenario: US1 - Install thoth-agents as the first native Pi package 1

- **GIVEN** Pi `0.84.4`, Node.js `>=22.19`, an executing thoth-agents version, and an empty isolated Pi home
- **WHEN** Pi installation is applied
- **THEN** `pi install npm:thoth-agents@<exact-version> --no-approve` completes and is verified before delegation, research, skills, provider, or ledger steps

#### Scenario: US1 - Install thoth-agents as the first native Pi package 2

- **GIVEN** the same environment
- **WHEN** installation is previewed
- **THEN** the first-party and external package commands plus every migration and setup target are reported with zero mutation

#### Scenario: US1 - Install thoth-agents as the first native Pi package 3

- **GIVEN** first-party package installation or verification fails
- **WHEN** setup exits
- **THEN** no external dependency is installed and no complete ledger record is written

#### Scenario: US1 - Install thoth-agents as the first native Pi package 4

- **GIVEN** an existing global `thoth-agents` Pi source
- **WHEN** no valid thoth-agents ownership receipt matches that exact source
- **THEN** setup reports an unowned conflict before invoking any mutating Pi command

#### Scenario: US1 - Install thoth-agents as the first native Pi package 5

- **GIVEN** a receipt-owned prior source
- **WHEN** replacement, native-load observation, or receipt commit fails
- **THEN** setup restores and verifies the prior source, leaves the prior receipt authoritative, and blocks every downstream dependency; a failed compensation is reported explicitly

#### Scenario: US4 - Preserve external ownership and existing harnesses 1

- **GIVEN** the native Pi package
- **WHEN** its packed contents are inspected
- **THEN** it contains only thoth-owned extension, agent, prompt, skill, and diagnostic assets and references external runtimes by pinned package source

#### Scenario: US4 - Preserve external ownership and existing harnesses 2

- **GIVEN** OpenCode, Codex, or Claude Code installation and runtime flows
- **WHEN** the Pi package change is present
- **THEN** their current behavior and generated artifacts remain unchanged except for shared truthful documentation

### Requirement: Distinguish capability gaps from generation failure

Pi capability reporting MUST independently identify first-party package state as missing, conflicting, configured, loadable, observed-at-install, unobserved, or unavailable; MUST reserve `observed-at-install` for a real Pi subprocess whose final provider request contains exactly one current root marker for the receipt's exact source and manifest/extension digests; and MUST independently report packaged-skill discovery, specialist materialization, delegation, research, external credentials, provider setup, and unsupported security or lifecycle guarantees. Direct native-package activation with missing external dependencies MUST degrade truthfully without crashing or claiming complete installation.

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

### Requirement: Preserve provider ownership

No generated package may bundle thoth-mem hooks, MCP lifecycle, protocol, or
persistence implementation. Provider capability MUST be reported only from
evidence as supported, degraded, or unsupported.

### Requirement: Use OpenAI as the only OpenCode built-in preset

Generated OpenCode configuration MUST contain only the `openai` built-in preset
for the seven-role roster. It MUST NOT generate Kimi, Copilot, ZAI/GLM, or
mixed-provider mappings.

### Requirement: Bundle the plan reviewer

Canonical workflow skills and generated root prompts MUST express the three standard SDD decisions through each harness's native blocking input surface, MUST distinguish explicit answers from no-answer results, MUST limit unanswered retries to three total attempts, and MUST identify and apply the specified recommended fallback after the third unanswered attempt.

#### Scenario: US1 - Continue with the recommended route after silence 1

- **GIVEN** the request does not name a route
- **WHEN** the root is ready to ask Direct, Accelerated, or Full
- **THEN** it first gives the user a concise evidence-based scope/risk/context summary and identifies its recommendation

#### Scenario: US1 - Continue with the recommended route after silence 2

- **GIVEN** a recommended route and no user answer
- **WHEN** the route prompt has completed unanswered three times
- **THEN** the recommendation counts as the selected route

#### Scenario: US1 - Continue with the recommended route after silence 3

- **GIVEN** the user answers on any attempt
- **WHEN** the route is selected
- **THEN** that explicit selection wins and no fallback is applied

#### Scenario: US2 - Default to Oracle review and converge to approval 1

- **GIVEN** an Accelerated or Full change passed `ready`
- **WHEN** the Oracle-review question completes unanswered three times
- **THEN** `Review plan with Oracle (Recommended)` is treated as selected

#### Scenario: US2 - Default to Oracle review and converge to approval 2

- **GIVEN** Oracle returns `[REJECT]`
- **WHEN** the blockers are actionable within the accepted intent
- **THEN** root corrects the canonical planning artifacts, revalidates the affected gates, and starts a fresh Oracle plan-review round

#### Scenario: US2 - Default to Oracle review and converge to approval 3

- **GIVEN** repeated review rounds
- **WHEN** Oracle returns `[OKAY]`
- **THEN** plan review is approved and the workflow advances to the implementation decision

#### Scenario: US2 - Default to Oracle review and converge to approval 4

- **GIVEN** the user explicitly selects `Proceed without review`
- **WHEN** the answer is received
- **THEN** the review fallback is not applied and the existing no-review path remains available

#### Scenario: US3 - Default to implementation after an approved-plan summary 1

- **GIVEN** Oracle returned `[OKAY]`
- **WHEN** root prepares the implementation question
- **THEN** it first summarizes the approved scope, approach, ownership, verification, and material risks

#### Scenario: US3 - Default to implementation after an approved-plan summary 2

- **GIVEN** the approved-plan question completes unanswered three times
- **WHEN** no explicit choice exists
- **THEN** `Implement (Recommended)` is treated as selected

#### Scenario: US3 - Default to implementation after an approved-plan summary 3

- **GIVEN** the user selects stop on any attempt
- **WHEN** the answer is received
- **THEN** implementation does not start

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

Pi root guidance MUST translate fresh work to a new single-agent `subagent_run`, same-assignment collection to status/result/list, running-task correction to `subagent_send_message` only when supported, cancellation to `subagent_cancel`, and completed-task continuation to `subagent_continue` only when explicitly enabled; new objectives, phases, mutable surfaces, and independent judgments MUST receive fresh tasks.

#### Scenario: US2 - Delegate through Pi-native subagents 1

- **GIVEN** a fresh bounded assignment and an explicit canonical specialist
- **WHEN** the Pi root delegates
- **THEN** it invokes `subagent_run` with one canonical `agent`, task, and bounded context and receives either the terminal task result or a background task identifier

#### Scenario: US2 - Delegate through Pi-native subagents 2

- **GIVEN** a running background assignment owned by the current parent session
- **WHEN** the root needs progress, correction, result, or cancellation
- **THEN** it uses the package's status, send-message, result, list, or cancel surface without treating collection as permission to reuse the specialist

#### Scenario: US2 - Delegate through Pi-native subagents 3

- **GIVEN** a completed assignment and continuation is disabled
- **WHEN** the root reaches a new work boundary
- **THEN** it creates a fresh task rather than claiming continuation support

#### Scenario: US2 - Delegate through Pi-native subagents 4

- **GIVEN** live steering is unavailable, a queued message is not confirmed as delivered, or a task is nonterminal
- **WHEN** fan-in is evaluated
- **THEN** the root keeps the barrier closed and reports the actual capability state

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

The Pi adapter MUST require the public `agent` field with one exact canonical specialist name for delegation and MUST NOT use deprecated batch input, implicit role inference, or a different harness's selector as evidence of native support.

#### Scenario: US2 - Delegate through Pi-native subagents 1

- **GIVEN** a fresh bounded assignment and an explicit canonical specialist
- **WHEN** the Pi root delegates
- **THEN** it invokes `subagent_run` with one canonical `agent`, task, and bounded context and receives either the terminal task result or a background task identifier

#### Scenario: US2 - Delegate through Pi-native subagents 2

- **GIVEN** a running background assignment owned by the current parent session
- **WHEN** the root needs progress, correction, result, or cancellation
- **THEN** it uses the package's status, send-message, result, list, or cancel surface without treating collection as permission to reuse the specialist

#### Scenario: US2 - Delegate through Pi-native subagents 3

- **GIVEN** a completed assignment and continuation is disabled
- **WHEN** the root reaches a new work boundary
- **THEN** it creates a fresh task rather than claiming continuation support

#### Scenario: US2 - Delegate through Pi-native subagents 4

- **GIVEN** live steering is unavailable, a queued message is not confirmed as delivered, or a task is nonterminal
- **WHEN** fan-in is evaluated
- **THEN** the root keeps the barrier closed and reports the actual capability state
