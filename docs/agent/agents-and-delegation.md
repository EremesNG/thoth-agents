# Agents and delegation

## Canonical roster

The contract has seven roles:

- adaptive root: `orchestrator`;
- read-only specialists: `explorer`, `librarian`, `oracle`; and
- implementation writers: `designer`, `quick`, `deep`.

`src/harness/core/agent-pack.ts` is canonical. `src/agents/index.ts` builds role
definitions and applies overrides; harness adapters translate the same intent.

## Invariants

- Root retains goals, constraints, decisions, coordination, semantic acceptance
  and synthesis. Specialists perform discovery, external research and
  implementation by default, independently of persistence mode.
- Delegation depth is one and each mutable surface has one writer. Treat explicit
  safe user direction as an ownership input.
- Before substantive execution, shape the work into bounded units: record exact
  output dependencies, mutable ownership, specialist fit, and verification inputs.
  A dependency means a lane needs a concrete upstream artifact or decision; mere
  preference for an order is not a dependency.
- Dispatch all admitted independent ready units before waiting; refill freed
  native capacity before another wait. Accept terminal fresh outputs before
  releasing each dependent consumer, without a global wave barrier. Compatibility
  includes read assumptions, interfaces and shared resources, not only filenames.
- Unknown local source, effective flow or responsibility triggers Explorer before
  root repository search or dependency traversal. Its bounded assignment may
  name an unknown location; root does not perform exploratory pre-reading to
  prepare it. The assigned investigator owns applicable discovery-tool fallback.
- Root may consult a known source for one bounded question or make a minimal
  authorized low-risk edit only when source, scope and verification are known
  and no discovery or independent judgment is needed. Another search or
  dependency ends this exception. File count, accumulated context and
  coordination overhead do not extend it.
- Explorer, librarian, and oracle never mutate the workspace.
- Every dispatch carries bounded thoth-mem `none|recall|observe` authorization
  independently of workspace mode. `observe` may permit a durable provider
  observation, but root lifecycle and real-user intent never transfer.
- Every change verifies. Persisted or materially risky work requires a fresh
  read-only Oracle. A writer cannot approve its result; optional plan review
  never substitutes for final verification.
- Route known sufficiently bounded implementation directly to its writer without
  a mandatory Explorer stage:

  | Signal | Writer | Escalation boundary |
  | --- | --- | --- |
  | User-facing UI/UX or visual quality | `designer` | Coupled backend contracts or high risk move to `deep`. |
  | Known narrow mechanical low-risk surface | `quick` | Discovery, coupling, migrations, edge cases, or higher failure cost move to `deep`. |
  | Coupled multi-file, shared contracts, migrations, concurrency, edge cases, or high risk | `deep` | Material product/architecture choices return to root. |

  Proven independent surfaces may use separate writers with non-overlapping
  files. Overlapping or compatibility-coupled work stays with one `deep` writer
  and ordered handoffs. Roles are selected as needed, never as a mechanical
  Explorer-to-writer-to-Oracle pipeline.
- Root loads only the current work operation from bundled skills instead of
  delegating merely to change prompts.
- Children return conclusions, localized evidence, verification, uncertainty,
  open questions and next action rather than raw dumps. Root does not duplicate
  delegated discovery before, during or after the assignment; unsupported claims
  receive targeted evidence requests or bounded inspection of identified
  evidence. Mandatory independent verification remains intact.
- Delegation failure is reported truthfully and never silently authorizes
  unrestricted root execution. Instructions and coordination artifacts are not
  a loophole for source or log dumps.
- Instruction-only harness gaps must never be described as hard enforcement.

## Behavioral task shaping

Use semantic triggers, not role-name presence, to select the smallest diverse set
that can change the result:

- `explorer` handles unknown or uncertain local source, effective flow,
  responsibility or behavior and stays read-only. Known bounded implementation
  does not require an Explorer relay.
- `librarian` handles current, unfamiliar, version-sensitive, or externally
  sourced facts—for example, checking the current official API contract; stable
  facts already established locally do not trigger it.
- `oracle` handles independent judgment for material architecture, security,
  contradictory evidence, persistent diagnosis, high failure cost, and required
  final verification.
- `designer` owns material user-facing UI/UX, interaction, accessibility, or
  visual-quality work—for example, implementing and visually checking a new
  responsive settings panel.
- `quick` owns a known narrow, clear, low-risk isolated edit—for example, a
  bounded mechanical rename in one assigned file; expansion or uncertainty
  escalates to `deep`.
- `deep` owns coupled contracts, shared state, migrations, concurrency,
  edge-case-heavy, or high-risk implementation.

For Pi, keep simple work as one direct `subagent` launch. Use
`workflowScript`/`runs.all` only for real parallel fan-out, not as a scheduler for
ordinary jobs. Librarian launches explicitly request `async: true` because the
frontmatter and `asyncByDefault` values are overridable and foreground children
do not load ambient extensions. Tool allowlists do not load research providers;
provider and required-tool registration must be verified before claiming
evidence.

Native harness execution and lifecycle are the sole authority for role selection,
fan-out, status/wait, steering, cancellation, and terminal results. If a native
primitive is unavailable or unproven, report the degradation and use a truthful
sequential fallback; do not emulate another runtime.

## Subagent session lifecycle

A new objective, work phase, mutable surface, or independent judgment is a work
boundary and defaults to a fresh subagent instance. A completed agent with the
desired role is not a reusable role pool. Continue an existing session only to
steer, complete, or clarify the exact same bounded assignment; wait and status
operations only collect that active nonterminal assignment.

Every Oracle plan review, verification round, and approval or PASS judgment
uses a fresh Oracle instance. The prior Oracle session may be resumed only to
clarify its current findings without issuing a new judgment.

| Harness | Fresh work | Same-assignment continuation |
| --- | --- | --- |
| OpenCode | Call `task` without `task_id`. | Pass the prior `task_id`. |
| Codex | Call `collaboration.spawn_agent` with `fork_turns="none"`; set `agent_type` when the active schema exposes it, otherwise use a role-prefixed bounded fallback and report instruction-only selection. | Call `collaboration.followup_task` for the existing agent. |
| Claude Code | Use a normal `Agent` invocation and do not use `fork` for independent work. | Use `SendMessage` with the prior agent ID. |
| Pi | Call `subagents_enable({})`, then on the next request call `subagent` with one canonical `agent` and a bounded `task`. Thoth normally requests `context: "fresh"`; native `fork` and `profile` remain available when policy intentionally selects them. `async` follows the overridable runtime default, so pass `async: true` whenever background execution is required, especially for librarian/MCP work. | Use native `subagent` actions with the known run `id`: `status`, `stop`, or `steer` (`mode: steer|follow_up|auto`). |

## Entrypoints and tests

- `src/harness/core/agent-pack.ts` and `.test.ts`
- `src/agents/index.ts` and `src/agents/index.test.ts`
- `src/agents/prompt-sections.ts` and prompt-rendering tests
- `src/harness/core/memory-governance.ts` and `workflow.test.ts`
- `src/config/constants.ts`, `schema.ts`, and config tests
- adapter tests for serialized harness output
