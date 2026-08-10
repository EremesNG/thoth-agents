# Agents and delegation

## Canonical roster

The contract has seven roles:

- adaptive root: `orchestrator`;
- read-only specialists: `explorer`, `librarian`, `oracle`; and
- implementation writers: `designer`, `quick`, `deep`.

`src/harness/core/agent-pack.ts` is canonical. `src/agents/index.ts` builds role
definitions and applies overrides; harness adapters translate the same intent.

## Invariants

- Root handles clear bounded work directly and owns sequential SDD coordination.
- Delegate only for net gain; depth is one and each mutable surface has one
  writer.
- Explorer, librarian, and oracle never mutate the workspace.
- Every dispatch carries bounded thoth-mem `none|recall|observe` authorization
  independently of workspace mode. `observe` may permit a durable provider
  observation, but root lifecycle and real-user intent never transfer.
- Oracle owns each user-selected plan review and every final verification. An
  implementer cannot approve its own result, and plan approval never replaces
  verification.
- Designer owns UI/UX, quick owns narrow work, and deep owns correctness-heavy
  implementation.
- Root loads detailed phase contracts from bundled skills on demand instead of
  delegating merely to change prompts.
- Children return conclusion, evidence, verification, risks, open questions,
  and next action rather than raw dumps.
- Instruction-only harness gaps must never be described as hard enforcement.

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
| Codex | Call `collaboration.spawn_agent` with `fork_turns="none"`. | Call `collaboration.followup_task` for the existing agent. |
| Claude Code | Use a normal `Agent` invocation and do not use `fork` for independent work. | Use `SendMessage` with the prior agent ID. |

## Entrypoints and tests

- `src/harness/core/agent-pack.ts` and `.test.ts`
- `src/agents/index.ts` and `src/agents/index.test.ts`
- `src/agents/prompt-sections.ts` and prompt-rendering tests
- `src/harness/core/memory-governance.ts` and `sdd-protocol.test.ts`
- `src/config/constants.ts`, `schema.ts`, and config tests
- adapter tests for serialized harness output
