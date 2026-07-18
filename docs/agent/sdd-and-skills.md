# SDD and required skills

## Responsibility

This route owns direct/accelerated/full classification, phase ownership,
conditional gates, and the Spec Kit-compatible artifact graph. It also connects
SDD behavior to the mandatory external-skill contract without turning phases
back into skills.

## Entrypoints

- `src/harness/core/sdd.ts`: route classifier, phases, owners, prerequisites,
  artifact graph, and verification rules.
- `src/agents/sdd-specify.ts`, `sdd-plan.ts`, `sdd-tasks.ts`: phase roles.
- `src/cli/skills.ts`: mandatory `simplify`, `tdd`,
  `progressive-context-router`, and `architectural-grilling` install.
- [`../sdd-pipeline.md`](../sdd-pipeline.md): maintained public contract.

## Invariants

- Direct is the default for clear, local, low-risk work.
- Accelerated is retained for bounded multi-file or moderate-risk work.
- Full is for explicit SDD, material uncertainty, cross-cutting scope, or high
  risk.
- Accelerated/full require `spec.md`, `plan.md`, and `tasks.md` under
  `openspec/changes/<feature>/`.
- Clarify, checklist, and converge are conditional.
- `architectural-grilling` is a conditional pre-specification gate, not an SDD
  phase. Use it only on explicit request or unresolved material human-owned
  product/architecture decisions; Full SDD alone is insufficient.
- Accepted grilling decisions feed canonical `spec.md` and `plan.md`; do not
  create a duplicate blueprint by default.
- User input is only for a material unresolved choice.
- Phase agents write coordination artifacts only; implementation belongs to the
  root or one writer role.
- Every route ends in focused verification; full adds independent analysis and
  verification.
- There are no bundled SDD phase skills or legacy artifact-governance runtime.

## Tests

- `src/harness/core/sdd.test.ts`
- `src/agents/prompt-rendering.test.ts`
- `src/harness/adapters/*.test.ts` when the rendered contract changes
- `src/cli/skills.test.ts` and operation tests for required-skill behavior

Provider persistence is an overlay only. Follow the installed provider guidance
instead of copying lifecycle mechanics into this route.
