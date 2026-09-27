# Agents and delegation

## Canonical roster

The contract has six roles:

- adaptive root: `orchestrator`;
- read-only specialists: `explorer`, `librarian`, `oracle`; and
- implementation writers: `designer`, `worker`.

`src/harness/core/agent-pack.ts` is canonical. `src/agents/index.ts` builds role
definitions and applies overrides; harness adapters translate the same intent.

## Invariants

- Root owns agreement and acceptance. Root, designer, or worker may implement
  bounded work according to net gain, independently of persistence mode.
- Delegate only for demonstrated net gain; depth is one and each mutable surface
  has one writer. Treat explicit safe user direction as an ownership input.
- Before substantive execution, shape the work into bounded units: record exact
  output dependencies, mutable ownership, specialist fit, and verification inputs.
  A dependency means a lane needs a concrete upstream artifact or decision; mere
  preference for an order is not a dependency.
- Dispatch all admitted independent ready units before waiting; refill freed
  native capacity before another wait. Accept terminal fresh outputs before
  releasing each dependent consumer, without a global wave barrier. Compatibility
  includes read assumptions, interfaces and shared resources, not only filenames.
- Prefer delegation for specialization, focused context, independent bounded
  work, safe parallelism, or demonstrated quality, latency, or total-cost gain.
  Prefer root continuity for short work, one ordered reasoning chain, frequent
  shared-state writes, accumulated context, rediscovery, or coordination cost.
  Route name, file count alone, and cheaper model price without end-to-end
  evidence are insufficient ownership signals.
- Explorer, librarian, and oracle never mutate the workspace.
- Every dispatch carries bounded thoth-mem `none|recall|observe` authorization
  independently of workspace mode. `observe` may permit a durable provider
  observation, but root lifecycle and real-user intent never transfer.
- Every change verifies. Persisted or materially risky work requires a fresh
  read-only Oracle. A writer cannot approve its result; optional plan review
  never substitutes for final verification.
- Only after root decides delegation creates net gain, select the specialist:

  | Signal | Writer | Escalation boundary |
  | --- | --- | --- |
  | Material user-facing UI/UX, interaction, accessibility, or visual quality | `designer` | Coupled backend contracts or non-visual correctness work move to `worker`. |
  | Multi-file, shared-contract, migration, concurrency, edge-case-heavy, or high-risk implementation | `worker` | Material product/architecture choices return to root. |

  Proven independent surfaces may use separate writers with non-overlapping
  files. Overlapping or compatibility-coupled work stays with one `worker`
  and ordered handoffs. For narrow low-risk work, root may retain the accepted
  surface when delegation has no demonstrated net gain; otherwise `worker` owns
  implementation without a separate quick/deep tier.
- Root loads only the current work operation from bundled skills instead of
  delegating merely to change prompts.
- Children return conclusion, evidence, verification, risks, open questions,
  and next action rather than raw dumps.
- Instruction-only harness gaps must never be described as hard enforcement.

## Behavioral task shaping

Use semantic triggers, not role-name presence, to select the smallest diverse set
that can change the result:

- `explorer` handles broad or uncertain local repository discovery and stays
  read-only.
- `librarian` handles current, unfamiliar, version-sensitive, or externally
  sourced facts—for example, checking the current official API contract; stable
  facts already established locally do not trigger it.
- `oracle` handles independent judgment for material architecture, security,
  contradictory evidence, persistent diagnosis, high failure cost, and required
  final verification.
- `designer` owns material user-facing UI/UX, interaction, accessibility, or
  visual-quality work—for example, implementing and visually checking a new
  responsive settings panel.
- `worker` owns implementation when delegation provides net gain, including
  coupled contracts, shared state, migrations, concurrency, edge cases, and
  high-risk work. Narrow low-risk work no longer has a separate writer tier.

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
