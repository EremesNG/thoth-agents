# Feature Specification: Route-independent implementation ownership

**Change ID**: `route-independent-implementation-ownership`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: The current routing contract incorrectly couples implementation
ownership to the selected SDD route: Direct strongly favors root while
Accelerated and Full normally force `designer`, `quick`, or `deep`. Official
multi-agent guidance instead selects delegation from task shape, context
isolation, independence, mutable-state contention, coordination overhead, and
measured net gain. The user's SDD route must govern artifacts and gates, not
choose the implementation owner.<br>
**Impact**: Root, `designer`, `quick`, or `deep` can own implementation under
Direct, Accelerated, Full, or an ungoverned/no-artifact request. Root evaluates
the same ownership policy in every route, respects explicit user direction, and
uses a specialist only when specialization, isolation, or safe parallelism
creates a net gain. Oracle verification, one writer per mutable surface,
specialist boundaries, models, efforts, and harness capability truthfulness
remain unchanged.<br>
**Affected capabilities**: `multi-harness-agent-pack`, `adaptive-sdd`

## User stories

### US1 - Choose ownership independently from SDD route (Priority: P1)

As a user, I can select the amount of SDD governance without implicitly forcing
or forbidding an implementation subagent, so that route choice and execution
efficiency remain separate decisions.

**Independent test**: Render Direct, Accelerated, and Full implementation
ownership and verify that all three expose the same adaptive owner decision
instead of route-specific root or specialist defaults.

**Covers**: FR-001, FR-003, FR-005, SC-001, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** a large user-facing change selected as Direct/no-artifact work,
   **When** designer specialization and isolated context create a net gain,
   **Then** the root may delegate the bounded UI surface to `designer`.
2. **Given** a coupled correctness-heavy Direct/no-artifact change, **When** a
   fresh bounded implementation context reduces interference and rediscovery is
   acceptable, **Then** the root may delegate the surface to `deep`.
3. **Given** an Accelerated or Full change with one sequential mutable surface
   whose planning and implementation share significant root context, **When**
   delegation would add coordination or rediscovery cost without a quality or
   latency gain, **Then** root may implement the accepted surface directly.

### US2 - Delegate specialists only for demonstrated net gain (Priority: P1)

As a user, I can rely on the root to compare delegation benefits with overhead
instead of spawning a writer ceremonially, so that subagents improve quality,
latency, focus, or total cost rather than merely increasing activity.

**Independent test**: Canonical policy tests expose positive delegation factors,
positive root-continuity factors, and explicitly reject SDD route as an ownership
signal.

**Covers**: FR-001, FR-002, FR-004, SC-002, SC-004

**Acceptance scenarios**:

1. **Given** an independent bounded surface with a strong specialist fit,
   **When** its context can be isolated without overlapping writes, **Then** the
   root selects the matching specialist regardless of SDD route.
2. **Given** a short task, a single ordered reasoning chain, frequent shared-state
   writes, or significant already-loaded root context, **When** delegation adds
   more overhead than benefit, **Then** root remains the implementation owner
   regardless of SDD route.
3. **Given** explicit user direction to use or avoid an implementation
   subagent, **When** that direction is safe and compatible with mandatory
   independent verification, **Then** the root treats it as an ownership input
   rather than inferring it from Direct, Accelerated, or Full.

### US3 - Preserve deterministic specialist selection after delegation (Priority: P1)

As a maintainer, I can keep the existing writer specializations after the root
decides delegation is worthwhile, so that route independence does not blur role
boundaries.

**Independent test**: For every route, routed cases keep UI/UX with `designer`,
known narrow low-risk work with `quick`, and coupled/edge-case/high-risk work
with `deep`, while root remains an eligible owner when delegation has no net
gain.

**Covers**: FR-002, FR-005, FR-007, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** the root has decided to delegate implementation, **When** the
   surface is user-facing UI/UX or visual-quality work, **Then** `designer`
   owns that surface.
2. **Given** the root has decided to delegate implementation, **When** the
   surface is known, narrow, mechanical, and low risk, **Then** `quick` owns it.
3. **Given** the root has decided to delegate implementation, **When** the
   surface is coupled, multi-file, migration-heavy, concurrent, edge-case-heavy,
   or high risk, **Then** `deep` owns it.

### US4 - Receive one truthful policy in every harness (Priority: P2)

As an operator across OpenCode, Codex, and Claude Code, I receive the same
route-independent ownership policy in active repository instructions, prompts,
skills, docs, tests, and generated artifacts, so no surface reintroduces
mandatory or prohibited delegation by pipeline or work type.

**Independent test**: Generate all three harness packages and inspect the active
repository `AGENTS.md`; reject stale route-coupled or unconditional specialist
phrases while preserving native selector and permission deltas.

**Covers**: FR-003, FR-004, FR-006, FR-007, SC-002, SC-005, SC-006, SC-007

**Acceptance scenarios**:

1. **Given** any generated root prompt, **When** its route and ownership guidance
   is inspected, **Then** it states that SDD route governs artifacts/gates and
   implementation ownership is a separate net-gain decision.
2. **Given** the canonical and generated `thoth-sdd` skill, **When** ownership
   guidance is compared, **Then** neither says Direct alone permits root nor
   that Accelerated/Full must select a specialist.
3. **Given** implementation by root or a specialist under any route, **When**
   work completes, **Then** a fresh Oracle still performs independent final
   verification.
4. **Given** active repository instructions for visual or UX work, **When** the
   root evaluates ownership, **Then** they select `designer` only after deciding
   that delegation creates net gain rather than requiring delegation by work
   type alone.

## Edge cases

- A user chooses Direct for a large change: the route omits governed artifacts,
  but the root may still delegate one or more proven independent surfaces.
- A user chooses Full for a tightly coupled sequential change: Full still runs
  its planning gates, but root may implement when retaining accumulated context
  is more efficient and safe.
- A UI change also alters a coupled backend contract: use one writer for each
  proven non-overlapping surface or one `deep` writer with ordered handoffs;
  route does not resolve the ownership conflict.
- A task contains many files but is mechanical and fully known: file count alone
  neither forces `deep` nor any delegation.
- A task is small but emits large logs or requires isolated research: context
  isolation can justify a subagent even when implementation itself stays with root.
- Explicit user direction conflicts with mandatory fresh Oracle verification:
  disclose the governance conflict rather than silently weakening verification.
- A harness lacks structural named-role selection: preserve the same ownership
  decision through its truthful instruction-level fallback.

## Functional requirements

- **FR-001 — Use adaptive-root delegation**: `[MODIFIED multi-harness-agent-pack]` The root MUST evaluate implementation ownership independently from Direct, Accelerated, Full, or no-artifact execution; it MAY implement directly or delegate to a specialist in every route according to explicit user direction and demonstrated net gain from specialization, context isolation, independent parallelism, quality, latency, or total cost, balanced against sequential dependency, shared mutable state, accumulated context, rediscovery, and coordination overhead.
- **FR-002 — Select specialist writers deterministically**: `[MODIFIED adaptive-sdd]` When the root decides implementation delegation creates a net gain, it MUST select `designer` for user-facing visual/UX work, `quick` for known narrow low-risk work, and `deep` for coupled multi-file, edge-case-heavy, migration, concurrency, shared-contract, or high-risk work; route alone MUST NOT select, require, or forbid any implementation owner, and one writer MUST own each mutable surface.
- **FR-003 — Express one adaptive implementation owner across routes**: `[INTERNAL]` Direct, Accelerated, and Full implementation phase contracts MUST expose the same adaptive owner set (`orchestrator`, `designer`, `quick`, `deep`) and MUST NOT encode separate Direct-root or artifact-backed-specialist defaults.
- **FR-004 — Make ownership factors explicit**: `[INTERNAL]` The canonical policy and generated root prompts MUST state when root continuity is preferable, when delegation creates net gain, how explicit user direction participates, and that model price or SDD route alone is insufficient evidence of lower total task cost.
- **FR-005 — Test route and owner as orthogonal dimensions**: `[INTERNAL]` Automated routing tests MUST cover specialist implementation under Direct/no-artifact work and root implementation under Accelerated and Full, while retaining deterministic specialist choice after a delegation decision and fresh Oracle verification after every implementation.
- **FR-006 — Synchronize route-independent guidance**: `[INTERNAL]` Active repository `AGENTS.md`, canonical source, OpenCode/Codex/Claude root prompts, bundled `thoth-sdd` skill and implement phase, routed documentation, generated plugin artifacts, and installation or rendering tests MUST contain no stale rule that Direct alone permits root, that artifact-backed routes always select a specialist, or that a work type requires delegation before the root evaluates net gain.
- **FR-007 — Preserve implementation safety boundaries**: `[INTERNAL]` The ownership correction MUST preserve maximum delegation depth one, one writer per mutable surface, non-overlapping parallel writes, role permissions, bounded handoffs, root-owned SDD state, and fresh independent Oracle verification.

## Success criteria

- **SC-001** `[buildable]`: For all three routes, `getSddPhaseOwner(route, 'implement')` returns the same adaptive implementation owner, and the public owner type contains no `selected-writer` branch.
- **SC-002** `[buildable]`: Active repository `AGENTS.md` plus generated OpenCode, Codex, and Claude roots state that SDD route governs artifacts/gates rather than implementation ownership and contain zero occurrences of rules equivalent to “Direct alone permits root,” “artifact-backed implementation always selects a specialist,” “Accelerated and Full select a writer,” or unconditional “all UI/UX work goes through designer.”
- **SC-003** `[buildable]`: Table-driven tests pass at least Direct→`designer`, Direct→`deep`, Accelerated→root, Full→root, and route-neutral delegated `quick` cases, with exact positive and forbidden ownership conditions.
- **SC-004** `[buildable]`: All canonical policy tests demonstrate both delegation-benefit and root-continuity factors, explicit user direction, one-writer ownership, and rejection of route or model price as sufficient ownership signals.
- **SC-005** `[buildable]`: Active repository instructions, canonical and generated skills, docs, root prompts, and routing fixtures remain synchronized; integration verification and progressive-context validation report zero errors or warnings, and always-loaded context does not increase from 8,465 characters (~2,117 estimated tokens).
- **SC-006** `[buildable]`: Focused ownership, SDD, prompt, adapter, skill, documentation, generation, and routing tests pass, followed by exit code zero from `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, and `pnpm test`.
- **SC-007** `[outcome]`: The next representative Direct/no-artifact and artifact-backed consumer tasks record at least one justified specialist delegation outside Accelerated/Full and at least one justified root implementation inside Accelerated/Full, with no ownership decision justified only by route name.

## Assumptions

- Direct is the no-governed-artifact route; it does not mean “no subagents.”
- Accelerated and Full add planning and closeout governance; they do not mean
  “mandatory implementation subagent.”
- Root remains write-capable in every route and still owns all sequential SDD
  coordination artifacts.
- Existing role models, reasoning efforts, selectors, permissions, lifecycle,
  and compact return contracts remain correct.
- Explicit user direction about implementation delegation is honored when it
  does not conflict with safety, capability, or mandatory Oracle verification.

## Dependencies

- Official OpenAI multi-agent guidance for independent bounded work, context
  isolation, shared-state contention, and coordination overhead.
- Official Anthropic subagent guidance for description/task-driven delegation,
  main-context continuity, focused isolation, and cheaper specialist models.
- Existing canonical role contracts, three harness adapters, SDD validator,
  generation scripts, and progressive-context validation.

## Out of scope

- Changing Direct, Accelerated, or Full artifact/gate definitions.
- Adding roles, changing models or effort defaults, or changing harness-native
  selector and permission capabilities.
- Weakening mandatory fresh Oracle verification or root ownership of OpenSpec
  task state.
- Introducing a runtime cost estimator, token-price oracle, nested delegation,
  or automatic parallel writes to shared mutable surfaces.
- Editing the archived `specialist-writer-routing` audit trail.
