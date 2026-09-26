# Feature Specification: Behavioral Agent Orchestration

**Change ID**: `behavioral-agent-orchestration`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: The adaptive root currently exposes seven roles but usually behaves as a linear single-agent worker. Specialist descriptions are present without a concrete procedure for decomposing work, identifying real dependencies, selecting `quick`, `librarian`, or `designer`, dispatching independent lanes concurrently, and joining their results. The harnesses already provide native multi-agent execution; thoth-agents must improve root behavior instead of adding another runtime.<br>
**Impact**: Every generated root will shape substantive work into a small dependency and ownership plan, select specialists from the complete roster, use native harness primitives for parallel fan-out and terminal fan-in, and apply independent Oracle judgment only when route or risk justifies it. Small deterministic Direct work will no longer incur an automatic Oracle review.<br>
**Affected capabilities**: `multi-harness-agent-pack`, `adaptive-sdd`

## User stories

### US1 - Shape work as an agent graph (Priority: P1)

As a user, I can rely on the adaptive root to distinguish true dependencies from accidental ordering so that independent work is executed concurrently through native subagents.

**Independent test**: Present the root with a task containing three independent evidence or implementation lanes and one dependent synthesis lane; inspect that all ready lanes are selected before the synthesis lane and that no thoth-owned execution runtime is introduced.

**Covers**: FR-001, FR-005, SC-001, SC-002, SC-004

**Acceptance scenarios**:

1. **Given** three work units that need no output from one another, **When** the root prepares execution, **Then** it marks all three ready, assigns bounded owners, dispatches them through native harness primitives before waiting, and starts synthesis only after terminal results are available.
2. **Given** work unit B needs a concrete artifact produced by A, **When** the root prepares execution, **Then** it keeps B blocked on A instead of claiming parallelism.
3. **Given** two write-capable lanes overlap the same file or mutable surface, **When** the root evaluates parallelism, **Then** it serializes them or assigns one writer and does not create conflicting agents.
4. **Given** only one isolated, clear, low-risk action whose context is already loaded, **When** delegation overhead exceeds its value, **Then** the root may execute it directly without inventing a multi-agent graph.

### US2 - Activate the complete specialist roster (Priority: P1)

As a user, I can expect each kind of work to reach the specialist designed for it so that `quick`, `librarian`, and `designer` are real execution options rather than dormant definitions.

**Independent test**: Evaluate representative task fixtures whose semantics uniquely require each canonical specialist and verify the selected owner and forbidden alternatives across OpenCode, Codex, and Claude roots.

**Covers**: FR-002, FR-003, FR-005, SC-001, SC-002, SC-004

**Acceptance scenarios**:

1. **Given** broad or uncertain local repository discovery, **When** the root selects a specialist, **Then** it selects `explorer` and keeps the assignment read-only.
2. **Given** current, unfamiliar, version-sensitive, or externally sourced facts are required, **When** the root selects a specialist, **Then** it selects `librarian`; stable facts already established locally do not trigger it.
3. **Given** material UI/UX, interaction, accessibility, or visual-quality work, **When** the root selects a writer, **Then** it selects `designer` with bounded user-facing ownership and visual verification.
4. **Given** a known, narrow, low-risk implementation lane inside a larger coordinated task, **When** its context and writes can be isolated, **Then** the root selects `quick` rather than consuming the root's coordination path.
5. **Given** coupled contracts, concurrency, migration, shared-state, edge-case-heavy, or high-risk implementation, **When** the root selects a writer, **Then** it selects `deep` instead of `quick`.
6. **Given** material architecture, security, persistent diagnosis, contradictory evidence, or high-cost uncertainty, **When** independent judgment would change confidence or authorization, **Then** the root selects a fresh read-only `oracle`.

### US3 - Dispatch and join through the native harness (Priority: P1)

As an operator, I can preserve each harness as the sole execution authority while the root coordinates specialists consistently.

**Independent test**: Render all three roots and verify the same harness-neutral decision procedure plus truthful native dispatch, status/wait, steering, cancellation, and terminal-result instructions without a thoth executor or lifecycle state.

**Covers**: FR-001, FR-005, SC-002, SC-004

**Acceptance scenarios**:

1. **Given** independent lanes and native background support, **When** the root dispatches them, **Then** it uses the harness's native role selector and task/subagent tools and does not immediately block on the first lane.
2. **Given** a dependent lane, **When** upstream work is nonterminal or its status is uncertain, **Then** the root does not treat silence, timeout, or malformed status as completion.
3. **Given** terminal specialist results, **When** the root performs fan-in, **Then** it reconciles results against user intent, dependencies, ownership, conflicts, and required verification before continuing.
4. **Given** a native primitive is unavailable or unproven, **When** coordination reaches that operation, **Then** the root reports the degradation and uses a truthful sequential fallback rather than emulating the missing primitive.

### US4 - Apply proportionate Oracle gates (Priority: P1)

As a user, I can avoid expensive ceremonial review for trivial deterministic changes while retaining independent judgment where failure cost or uncertainty warrants it.

**Independent test**: Evaluate gate fixtures for trivial Direct, material Direct, Accelerated, Full, plan review, and failed verification and verify whether Oracle is required, optional, or absent.

**Covers**: FR-004, FR-005, SC-001, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** a trivial Direct change with deterministic focused checks and no material risk or ambiguity, **When** implementation finishes, **Then** the root runs proportionate checks and completes without spawning Oracle.
2. **Given** a Direct change with material security, architecture, cross-cutting regression, persistent diagnosis, or high-cost uncertainty, **When** verification begins, **Then** a fresh read-only Oracle performs the independent judgment.
3. **Given** an Accelerated or Full implementation, **When** final verification begins, **Then** a fresh read-only Oracle remains mandatory; optional pre-implementation plan review neither replaces nor duplicates that final judgment.
4. **Given** an Oracle or other specialist has completed a different objective, **When** a new independent judgment begins, **Then** the root creates a fresh instance rather than reusing a role pool.

### US5 - Keep orchestration compact and behavior-oriented (Priority: P2)

As a maintainer, I can evolve orchestration policy without adding another execution system or tests that pass merely because role names appear in prompts.

**Independent test**: Inspect the public package, schema, tool registry, generated artifacts, and routing tests after implementation; behavior fixtures must cover decisions while no new runtime surface exists.

**Covers**: FR-005, SC-001, SC-002, SC-003, SC-005

**Acceptance scenarios**:

1. **Given** the feature is implemented, **When** public tools, configuration schemas, generated assets, and runtime hooks are inspected, **Then** no graph executor, job board, projection, orchestration telemetry, observer, or lifecycle shadow surface has been added.
2. **Given** routing tests, **When** role behavior changes while role names remain present, **Then** at least one behavior fixture fails rather than all tests passing on substring presence.
3. **Given** equivalent work semantics across harnesses, **When** roots are rendered, **Then** they expose the same role and dependency policy while naming only their own native primitives.

## Edge cases

- The user explicitly requests no delegation or explicitly selects a safe specialist; that direction is an ownership input unless it conflicts with a mandatory safety gate.
- A task appears parallelizable but both lanes require the same intermediate artifact or mutate the same surface; the root treats the dependency or conflict as real.
- Read-only research may overlap an implementation lane only when it does not review changing content as if it were final.
- A `quick` lane expands into coupled files, unclear requirements, migration, or edge-heavy behavior; it escalates to `deep` or returns the decision to the root.
- A visual task is mechanically small but materially affects interaction, accessibility, or layout; `designer` remains the correct specialist.
- Multiple specialists could contribute but would duplicate the same evidence; the root selects the smallest diverse set that can materially change the result.
- Native concurrency capacity is lower than the number of ready lanes; the root applies a bounded width and dispatches remaining ready work in later native waves.
- A native wait times out; the assignment remains nonterminal until native evidence establishes otherwise.
- The root has already loaded the exact context for a one-step fix; direct execution remains valid and must not be penalized merely to increase delegation counts.

## Functional requirements

- **FR-001 — Use adaptive-root delegation**: `[MODIFIED multi-harness-agent-pack]` Before substantive execution, the root MUST identify bounded work units, exact output dependencies, mutable ownership, specialist fit, verification inputs, and ready versus blocked lanes; it MUST dispatch two or more independent conflict-free lanes concurrently through native harness primitives when capacity and net gain permit, MUST wait for terminal native evidence before dependent fan-in, and MAY retain one isolated clear low-risk action only when coordination overhead exceeds the benefit.
- **FR-002 — Expose routable role contracts**: `[MODIFIED multi-harness-agent-pack]` Every root MUST present the complete specialist roster with equally salient positive and negative semantic triggers, MUST consider all six specialists during task shaping, and MUST distinguish role existence from an actual dispatch decision.
- **FR-003 — Select specialist writers deterministically**: `[MODIFIED adaptive-sdd]` After task shaping establishes a delegation benefit, the root MUST select `designer` for material user-facing experience, `quick` for a known narrow low-risk isolated lane, and `deep` for coupled or high-risk work; it MUST evaluate these triggers independently of SDD route and MUST preserve one writer per mutable surface.
- **FR-004 — Require independent oracle judgment**: `[MODIFIED adaptive-sdd]` Pre-implementation plan review MUST remain optional and user-controlled for Accelerated and Full. Final Oracle verification MUST remain mandatory for Accelerated and Full and MUST be required for Direct only when material architecture, security, cross-cutting regression, persistent diagnosis, contradictory evidence, high failure cost, or comparable uncertainty requires independent judgment. A trivial deterministic Direct change MUST be eligible for root-run focused verification without Oracle, while every actual Oracle approval or PASS judgment MUST use a fresh read-only instance and MUST NOT be replaced by an implementation writer's self-approval.
- **FR-005 — Behavior-oriented orchestration contract**: `[INTERNAL]` Canonical policy, generated roots, and tests MUST encode task shaping, semantic role activation, dependency-aware parallelism, native fan-out/fan-in, ownership conflict prevention, proportional gates, and truthful degradation as observable decisions; they MUST NOT add a thoth-owned executor, job board, persistent or projected lifecycle state, graph telemetry, observer hooks, or orchestration tool surface.

## Success criteria

- **SC-001** `[buildable]`: A behavior fixture suite contains at least 15 realistic cases, exercises every canonical specialist, includes at least two positive cases each for `quick`, `librarian`, and `designer`, and covers independent fan-out, true dependency, overlapping writes, trivial Direct without Oracle, material Direct with Oracle, and artifact-backed final Oracle verification.
- **SC-002** `[buildable]`: OpenCode, Codex, and Claude generated roots expose the same ordered task-shaping and role-selection procedure, use only truthful harness-native delegation/lifecycle primitives, and add zero public orchestration tools, runtime schemas, observer hooks, persistent stores, or generated job-board assets.
- **SC-003** `[buildable]`: All gate tests prove that trivial deterministic Direct work does not require Oracle, material-risk Direct work does, Accelerated and Full final verification still do, and optional plan review does not substitute for final verification.
- **SC-004** `[outcome]`: In a bounded live smoke corpus for each supported harness, every expected `quick`, `librarian`, and `designer` case dispatches the matching native specialist; every eligible multi-lane case dispatches all ready lanes before waiting for a dependent result; every ineligible case remains direct or sequential for the documented reason; and no trivial deterministic Direct case spawns Oracle.
- **SC-005** `[buildable]`: The compact orchestration decision procedure and role directory increase each generated root by no more than 2,500 characters relative to its pre-change baseline and introduce no duplicate harness-neutral policy blocks.

## Assumptions

- OpenCode, Codex, and Claude remain responsible for actual dispatch, concurrency, status, wait, steering, cancellation, and terminal results according to the primitives they expose at runtime.
- Root task shaping is an instruction and policy concern; for non-SDD work it may remain ephemeral, while existing `tasks.md` dependencies remain canonical for artifact-backed changes.
- Parallel implementation is permitted only for provably disjoint mutable ownership or native isolated worktrees; read-only lanes may be broader when they do not review moving targets as final.
- Width is bounded by current native capacity and task value, not by a universal hard-coded agent count.
- Smoke-test outcomes are nondeterministic operational evidence and therefore remain outcome criteria rather than build tasks that claim guaranteed model behavior.

## Dependencies

- Current native subagent surfaces and truthful capability descriptions for OpenCode, Codex, and Claude.
- Existing seven-role canonical agent pack and SDD route contracts.
- Existing provider-owned thoth-mem boundary; this change does not alter memory lifecycle.

## Out of scope

- A graph execution engine, scheduler, job board, task database, lifecycle ledger, projection, trace collector, metrics subsystem, observer hook, wake loop, or reconciliation runtime.
- Reimplementing native status, wait, steering, cancellation, terminal-result, worktree, mailbox, or background-task capabilities.
- GNNs, learned routing, persistent interaction graphs, topology optimization, graph databases, or A2A/MCP protocol changes.
- Increasing agent count, adding new roles, or importing large external agent catalogs.
- Modifying marketplace/plugin publishing work or its known sibling-repository CI assumption.
