# SDD and skills

## Responsibility

This route owns the requirements interview, direct/accelerated/full selection,
SDD phases, gates, ownership, OpenSpec artifacts, packaged skills, and task /
verification governance.

## Signals and entrypoints

- Signals: requirements interview, OpenSpec, proposal, spec, clarify, design,
  tasks, plan review, apply, verify, archive, skill manifest.
- `src/harness/core/sdd.ts` defines phases, order, prerequisites, gates, and roles.
- `src/skills/*/SKILL.md` is the packaged source of behavior for each skill.
- `src/sdd/artifact-governance/` validates artifacts and tasks.
- [`../sdd-pipeline.md`](../sdd-pipeline.md) describes the maintained pipeline.

## Invariants and risks

- Every route starts with a requirements interview; direct does not mean skipping
  requirements discovery.
- Do not skip artifacts or gates when SDD is selected.
- Plan review and user confirmation are distinct gates.
- Iterative verification is bounded by `SDD_VERIFY_MAX_ROUNDS` in code.
- `oracle` reviews read-only; if an artifact must be persisted, a write owner may
  be another role.
- `openspec/` is the governed persistence surface; do not invent parallel formats.

## Dependencies and overlays

- Load [`memory-governance.md`](memory-governance.md) if persistence includes
  `thoth-mem`, topic keys, or handoff recovery.
- Load [`agents-and-delegation.md`](agents-and-delegation.md) if the role or
  permission matrix changes.
- Load [`harness-packaging.md`](harness-packaging.md) if how a skill or
  instruction is distributed per harness changes.

## Tests and verification

- `src/harness/core/sdd.test.ts` fixes the phase contract.
- `src/harness/core/skills.test.ts` fixes skill delivery.
- `src/sdd/artifact-governance/**/*.test.ts` fixes artifact validation.
- `SKILL.md` changes may require writer/layout tests under `src/harness/`.
- [`../skills-and-mcps.md`](../skills-and-mcps.md) documents delivered surfaces.

## Common mistakes

- Confusing plan-review recovery with implementation authorization.
- Updating an SDD document without the corresponding TypeScript contract or tests.
- Persisting generated prompts as user intent.

## Evidence and uncertainty

- Verified in `src/harness/core/sdd.ts`, `src/skills/`, `src/sdd/`, and tests.
- When `docs/sdd-pipeline.md` drifts from the contract, treat current TypeScript
  and tests as execution evidence and update public docs in the same change.
