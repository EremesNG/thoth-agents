# SDD and required skills

## Responsibility

This route owns direct/accelerated/full classification, phase ownership,
conditional gates, and the Spec Kit-compatible artifact graph. It also connects
SDD behavior to the mandatory external-skill contract without turning phases
back into skills.

## Entrypoints

- `src/harness/core/sdd.ts`: route classifier, phases, owners, prerequisites,
  typed phase protocols, dispatch envelope, artifact graph, verification, and
  archive rules.
- `src/agents/sdd-specify.ts`, `sdd-plan.ts`, `sdd-tasks.ts`: phase roles.
- `src/cli/skills.ts`: mandatory `simplify`, `tdd`,
  `progressive-context-router`, and `architectural-grilling` install.
- [`../sdd-pipeline.md`](../sdd-pipeline.md): maintained public contract.

## Invariants

- Direct is the default for clear, local, low-risk work.
- Accelerated is retained for bounded multi-file or moderate-risk work.
- Full is for explicit SDD, material uncertainty, cross-cutting scope, or high
  risk.
- Accelerated/full require `spec.md`, `plan.md`, `tasks.md`,
  `verify-report.md`, and `archive-report.md` during the change lifecycle, which
  ends under `openspec/changes/archive/YYYY-MM-DD-<feature>/`.
- Clarify, checklist, and converge are conditional on artifact-backed routes.
- `architectural-grilling` is a conditional pre-specification gate, not an SDD
  phase. Use it only on explicit request or unresolved material human-owned
  product/architecture decisions; Full SDD alone is insufficient.
- Accepted grilling decisions feed canonical `spec.md` and `plan.md`; do not
  create a duplicate blueprint by default.
- User input is only for a material unresolved choice.
- Phase agents write coordination artifacts only; implementation belongs to the
  root or one writer role.
- Static role prompts carry only the protocols that role may execute; every SDD
  delegation supplies the shared `PHASE` through `HANDOFF` envelope.
- `oracle` distinguishes read-only analyze and verify modes; the root persists
  artifact-backed verification as `verify-report.md`.
- A failed artifact-backed verification routes through append-only `sdd-tasks`
  convergence, implementation, and verification again. Direct returns straight
  to implementation and verification.
- Direct ends after focused verification. Accelerated/full archive only after a
  pass verdict, complete tasks, and no unresolved critical findings.
- Archive creates `archive-report.md`, performs the dated change-directory move,
  and never implicitly merges into `openspec/specs/`.
- There are no bundled SDD phase skills or legacy artifact-governance runtime.

## Tests

- `src/harness/core/sdd.test.ts`
- `src/harness/core/sdd-protocol.test.ts`
- `src/agents/prompt-rendering.test.ts`
- `src/harness/adapters/*.test.ts` when the rendered contract changes
- `src/cli/skills.test.ts` and operation tests for required-skill behavior

Provider persistence is an overlay only. Follow the installed provider guidance
instead of copying lifecycle mechanics into this route.
