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
- Explorer, librarian, and oracle never mutate.
- Oracle owns Full analysis and every verification. An implementer cannot
  approve its own result.
- Designer owns UI/UX, quick owns narrow work, and deep owns correctness-heavy
  implementation.
- Root loads detailed phase contracts from bundled skills on demand instead of
  delegating merely to change prompts.
- Children return conclusion, evidence, verification, risks, open questions,
  and next action rather than raw dumps.
- Instruction-only harness gaps must never be described as hard enforcement.

## Entrypoints and tests

- `src/harness/core/agent-pack.ts` and `.test.ts`
- `src/agents/index.ts` and `src/agents/index.test.ts`
- `src/agents/prompt-sections.ts` and prompt-rendering tests
- `src/config/constants.ts`, `schema.ts`, and config tests
- adapter tests for serialized harness output
