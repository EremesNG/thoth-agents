# Proposal: Add Artifact Governance Layer for SDD Artifacts

## Intent
Plan an Artifact Governance Layer that validates SDD artifacts as coordination contracts so the orchestrator can trust `tasks.md` and persistence state without adopting OpenSpec as a runtime or CLI dependency.

## Scope
### In Scope
- Define an MVP focused on read-only validation for `tasks.md`.
- Make validation mode-aware for `thoth-mem`, `openspec`, `hybrid`, and `none`.
- Classify findings by `error`, `warning`, and `info` for later gates.
- Validate contract-first concerns before format rigidity: task states, verification blocks, execution readiness, and persistence expectations.
- Plan how the validator fits after `sdd-tasks` and before `sdd-apply` without breaking delegate-first orchestration, root thoth-mem ownership, `plan-reviewer`, `executing-plans`, or `requirements-interview`.
- Define initial hybrid-divergence handling as warning-first unless recovery is impossible.

### Out of Scope
- Adopting OpenSpec CLI/runtime or making filesystem artifacts the only source of truth.
- Exact markdown linting or freezing early formatting rules.
- Broad semantic validation for proposal, spec, or design artifacts.
- Hard enforcement from day one.
- Replacing `plan-reviewer` or changing agent ownership boundaries.

## Approach
Treat artifact governance as a thin validation layer over the existing SDD pipeline, not as a new workflow engine. Start with `tasks.md` because it is the handoff contract between planning and execution in the accelerated path. Define a validator contract that reads artifacts by persistence mode, inspects execution-critical structure and persistence expectations, and emits severity-tagged findings. In hybrid mode, detect divergence between thoth-mem and filesystem artifacts, prefer recoverability when both copies remain usable, and reserve hard errors for unrecoverable or execution-blocking states. Keep the first slice read-only so the team can calibrate false positives before introducing post-`sdd-tasks` and pre-`sdd-apply` enforcement.

## Affected Areas
- `src/skills/_shared/persistence-contract.md` for governance expectations across persistence modes.
- `src/skills/sdd-tasks/SKILL.md` for post-generation validation handoff.
- `src/skills/executing-plans/SKILL.md` for future pre-execution gate integration.
- `src/skills/plan-reviewer/SKILL.md` to preserve non-overlapping responsibilities.
- `src/agents/orchestrator.ts` for future orchestration points and reporting flow.
- `openspec/changes/2026-05-13-artifact-governance-layer/` for accelerated SDD artifacts.

## Risks
- False positives could slow execution and erode trust in the validator.
- Mode mismatch could cause invalid assumptions about source-of-truth priority.
- Hybrid divergence could be over-reported if repairable states are treated as failures.
- Freezing format rules too early could block future skill evolution.
- Governance and `plan-reviewer` responsibilities could overlap unless boundaries stay explicit.

## Rollback Plan
Keep the change scoped to planning artifacts and later incremental implementation. If the direction proves noisy, remove the validator-specific tasks and revert any orchestration hooks without affecting the existing SDD runtime path.

## Success Criteria
- Accelerated `sdd-tasks` work can be derived from this proposal without requiring spec or design artifacts.
- The resulting task plan includes a concrete MVP for mode-aware `tasks.md` validation and severity reporting.
- The plan explicitly preserves delegate-first orchestration, root memory ownership, and `plan-reviewer` separation.
- The plan defines hybrid-divergence handling that warns first when repair is possible.
- The plan clearly excludes OpenSpec runtime adoption, exact markdown linting, and broad artifact-semantic validation from the MVP.
