# Agents and delegation

## Canonical roster

The contract has seven roles:

- adaptive root: `orchestrator`;
- read-only specialists: `explorer`, `librarian`, `oracle`; and
- implementation writers: `designer`, `quick`, `deep`.

`src/harness/core/agent-pack.ts` is canonical. `src/agents/index.ts` builds role
definitions and applies overrides; harness adapters translate the same intent.

## Invariants

- Root owns sequential SDD coordination. SDD routes govern artifacts and gates,
  not implementation ownership: root, `designer`, `quick`, or `deep` may
  implement in Direct, Accelerated, or Full.
- Delegate only for demonstrated net gain; depth is one and each mutable surface
  has one writer. Treat explicit safe user direction as an ownership input.
- Before substantive execution, shape the work into bounded units: record exact
  output dependencies, mutable ownership, specialist fit, and verification inputs.
  A dependency means a lane needs a concrete upstream artifact or decision; mere
  preference for an order is not a dependency.
- Mark lanes ready only when their inputs are available and blocked when they need
  a nonterminal upstream result. Dispatch every ready, conflict-free lane in the
  current native wave before waiting; apply bounded native capacity in later waves.
  Join only terminal native results, reconcile them against intent and ownership,
  then release dependent lanes.
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
- Every route verifies. Trivial deterministic Direct work may use focused root
  checks; materially risky Direct work and every Accelerated or Full final verify
  use a fresh read-only Oracle. An implementer cannot approve its own result, and
  optional plan approval never replaces final verification.
- Only after root decides delegation creates net gain, select the specialist:

  | Signal | Writer | Escalation boundary |
  | --- | --- | --- |
  | User-facing UI/UX or visual quality | `designer` | Coupled backend contracts or high risk move to `deep`. |
  | Known narrow mechanical low-risk surface | `quick` | Discovery, coupling, migrations, edge cases, or higher failure cost move to `deep`. |
  | Coupled multi-file, shared contracts, migrations, concurrency, edge cases, or high risk | `deep` | Material product/architecture choices return to root. |

  Proven independent surfaces may use separate writers with non-overlapping
  files. Overlapping or compatibility-coupled work stays with one `deep` writer
  and ordered handoffs. When delegation has no demonstrated net gain, root may
  retain the accepted surface under any route.
- Root loads detailed phase contracts from bundled skills on demand instead of
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
- `quick` owns a known narrow, clear, low-risk isolated edit—for example, a
  bounded mechanical rename in one assigned file; expansion or uncertainty
  escalates to `deep`.
- `deep` owns coupled contracts, shared state, migrations, concurrency,
  edge-case-heavy, or high-risk implementation.

Native harness execution and lifecycle are the sole authority for role selection,
fan-out, status/wait, steering, cancellation, and terminal results. If a native
primitive is unavailable or unproven, report the degradation and use a truthful
sequential fallback; do not emulate another runtime.

## Subagent session lifecycle

A new objective, SDD phase, mutable surface, or independent judgment is a work
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

## Entrypoints and tests

- `src/harness/core/agent-pack.ts` and `.test.ts`
- `src/agents/index.ts` and `src/agents/index.test.ts`
- `src/agents/prompt-sections.ts` and prompt-rendering tests
- `src/harness/core/memory-governance.ts` and `sdd-protocol.test.ts`
- `src/config/constants.ts`, `schema.ts`, and config tests
- adapter tests for serialized harness output
