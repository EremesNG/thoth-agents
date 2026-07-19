# Agents and delegation

## Canonical roster

The contract has ten roles:

- adaptive root: `orchestrator`;
- read-only evidence: `explorer`, `librarian`, `oracle`;
- coordination writers: `sdd-specify`, `sdd-plan`, `sdd-tasks`; and
- implementation writers: `designer`, `quick`, `deep`.

`src/harness/core/agent-pack.ts` is the canonical role/policy contract.
`src/agents/index.ts` builds OpenCode definitions and applies overrides.
Harness adapters translate the same intent into native artifacts.

## Invariants

- The root handles clear bounded work directly.
- Delegate only when specialization, context isolation, independent review, or
  safe parallel work produces a net gain.
- Maximum delegation depth is one.
- Keep one writer per mutable surface.
- Read-only roles do not mutate.
- SDD phase roles write only under `openspec/` and do not implement product code.
- Each SDD dispatch names a `phase=<id>` and supplies the canonical phase
  envelope. A reused role applies only that phase's generated protocol.
- `sdd-tasks` owns both initial task generation and append-only convergence;
  `quick` may perform mechanical archive closeout after a passing verification.
- The root uses `progressive-context-router` only for repository-instruction
  work and gates `architectural-grilling` to unresolved material human-owned
  decisions before specification.
- UI/UX belongs to `designer`, narrow mechanical work to `quick`, and
  correctness-risk work to `deep`.
- Children return conclusion, evidence, verification, risks, open questions, and
  recommended next action instead of raw dumps.

## Entrypoints and tests

- `src/harness/core/agent-pack.ts` and `.test.ts`
- `src/agents/index.ts` and `src/agents/index.test.ts`
- `src/agents/prompt-sections.ts` and prompt-rendering tests
- `src/config/constants.ts`, `schema.ts`, and config tests
- adapter tests when serialized harness output changes

Do not claim that instruction wording is hard runtime enforcement when a harness
does not expose an equivalent control.
