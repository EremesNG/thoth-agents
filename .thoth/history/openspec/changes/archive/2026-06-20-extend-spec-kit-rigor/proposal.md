# Proposal: Extend Spec-Kit Rigor (Phase 2)

## Intent

Phase 1 (`adopt-spec-kit-rigor`, archived) adopted seven spec-kit MECHANICS
(constitution + Constitution Check, `/analyze`-style consistency,
requirements-quality checklists, `[NEEDS CLARIFICATION]` cap, `[USN]`/priority/
Independent-Test traceability, TDD toggle, phase handoffs). This Phase 2 change
adds THREE more harness-agnostic mechanisms that deepen the same front-end
rigor without disturbing the multi-agent back end:

1. `[P]` parallel markers in `tasks.md`, ACTIVELY consumed by `executing-plans`
   as an explicit parallel-dispatch signal.
2. Optional, complexity-gated plan sub-artifacts alongside the always-present
   `design.md` (`research.md`, `data-model.md`, `contracts/`, `quickstart.md`).
3. A NEW dedicated `sdd-clarify` phase inserted in the Full SDD pipeline between
   spec and design (taxonomy-driven ambiguity scan + bounded Q&A + write-back +
   re-validation).

As in Phase 1, we adopt spec-kit MECHANICS, not its content. Every mechanism is
additive, back-compatible, and identical across OpenCode, Claude Code, and Codex.

## Scope

### In Scope

1. **`[P]` parallel markers (active consumption).** `sdd-tasks` may emit a `[P]`
   marker on tasks that are safe to run in parallel, preserving the existing
   `N.M` phase numbering and `[USN]` labels. `executing-plans` consumes `[P]` at
   its grouping logic as an explicit parallel-dispatch signal (today grouping is
   implicit). New toggle `rules.tasks.parallel_markers` gates emission and
   consumption.
   - From: tasks carry phase numbering + `[USN]` only; `executing-plans` infers
     batching implicitly.
   - To: tasks may carry `[P]`; `executing-plans` dispatches `[P]`-marked tasks
     as an explicit parallel batch.
   - Reason: make parallelizable work an explicit, reviewable signal.
   - Impact: `src/skills/sdd-tasks/SKILL.md`, `src/skills/executing-plans/SKILL.md`,
     `openspec/config.yaml`; back-compatible (absence of `[P]` = today's behavior).

2. **Optional complexity-gated plan sub-artifacts.** `design.md` remains always
   present and authoritative. When complexity warrants, `sdd-design` may also
   produce `research.md`, `data-model.md`, a `contracts/` subdir, and
   `quickstart.md` under `openspec/changes/{change-name}/`. New toggles
   `rules.design.sub_artifacts` and `rules.design.complexity_threshold` gate this.
   The existing `checklists/` subdir is the precedent for the `contracts/` layout.
   - From: `design.md` is the sole design artifact.
   - To: `design.md` plus optional, gated sub-artifacts when complexity warrants.
   - Reason: give larger changes structured design surfaces without forcing
     ceremony on small ones.
   - Impact: `src/skills/sdd-design/SKILL.md`,
     `src/skills/_shared/openspec-convention.md` (artifacts table + dir layout),
     `openspec/config.yaml`; back-compatible (sub-artifacts absent = today).

3. **New `sdd-clarify` phase (spec -> clarify -> design).** A dedicated phase
   inserted in the Full SDD order between spec and design that performs a
   taxonomy-driven scan of residual ambiguity, runs bounded Q&A (cap aligned to
   the existing clarification policy), writes resolutions back into the spec, and
   re-validates the requirements-quality checklist. It produces no new permanent
   artifact (it updates the spec in place) and is Full-SDD only.
   - From: ambiguity is handled only upfront (requirements-interview) and via
     `[NEEDS CLARIFICATION]` markers in the spec.
   - To: a dedicated mid-pipeline clarification pass resolves residual ambiguity
     before design begins.
   - Reason: catch ambiguity that only surfaces once the spec is written, before
     it propagates into design and tasks.
   - Impact: NEW `src/skills/sdd-clarify/SKILL.md`; `src/harness/core/sdd.ts`
     (`SddPhaseContract`, `FULL_SDD_PHASE_ORDER` insert + reorder, `SDD_PHASES`,
     workflow prose); `src/agents/prompt-sections.ts` (SDD delegation matrix
     routing). Boundary: requirements-interview stays upfront-only; no duplication.

All three mechanisms are fully SHARED (`prompt-sections.ts` + `sdd.ts` are
harness-agnostic; skills live in `_shared`/per-phase SKILL.md). Zero
dialect-specific handling is required. `config.yaml rules:` gains the new toggles
under existing `tasks` and `design` sections.

### Deferred / Needs Discovery

Carried forward to the design phase (do NOT resolve here):

- **(a)** Clarify write-back: in-place spec edit vs a new artifact, and the
  thoth-mem topic key (`sdd/{change}/spec` vs a `spec-clarified` key).
- **(b)** Sub-artifact gate authority: computed by the `sdd-design` author vs a
  `config.yaml complexity_threshold`.
- **(c)** `[P]` scope: cross-phase parallelism vs same-agent batch only.

### Out of Scope

Explicit exclusions (not part of this change):

- Flat `T001` task IDs (we keep `N.M` phase numbering + `[USN]`).
- `taskstoissues` GitHub-issue export.
- `/converge` (already covered by the `sdd-verify-loop`).
- Spec-kit extension/preset/bundle system.
- `feature.json` branch-decoupling.
- Agent-context marker auto-update.
- Monolithic `/implement`.
- Weakening `sdd-verify` or `sdd-archive`.
- Python/uvx CLI.

## Approach

Implement all three mechanisms in the harness-neutral shared layer
(`_shared` conventions, per-phase SKILL.md, the unified phase contract in
`src/harness/core/sdd.ts`, and the delegation matrix in
`src/agents/prompt-sections.ts`) so OpenCode, Claude Code, and Codex inherit
identical behavior. Each mechanism is additive and independently revertable:

- `[P]` and sub-artifacts are template/skill additions gated by new
  `config.yaml` toggles; consumers tolerate their absence.
- `sdd-clarify` is inserted into `FULL_SDD_PHASE_ORDER` between spec and design;
  the insert MUST update downstream phase prerequisites and the corresponding
  tests so the pipeline stays consistent.

## Affected Areas

- `src/skills/sdd-tasks/SKILL.md` — emit `[P]` markers.
- `src/skills/executing-plans/SKILL.md` — consume `[P]` at grouping logic.
- `src/skills/sdd-design/SKILL.md` — optional gated sub-artifacts.
- `src/skills/_shared/openspec-convention.md` — artifacts table + dir layout for
  sub-artifacts.
- NEW `src/skills/sdd-clarify/SKILL.md`.
- `src/harness/core/sdd.ts` — `SddPhaseContract`, `FULL_SDD_PHASE_ORDER`,
  `SDD_PHASES`, workflow prose.
- `src/agents/prompt-sections.ts` — SDD delegation matrix routing.
- `openspec/config.yaml` — `rules.tasks.parallel_markers`,
  `rules.design.sub_artifacts`, `rules.design.complexity_threshold`.
- Tests: `src/harness/core/sdd.test.ts` (phase order/prereqs),
  `src/agents/prompt-rendering.test.ts`, `src/agents/index.test.ts`,
  `src/sdd/artifact-governance/tasks-validator.test.ts`.

## Risks

- **Prompt matrix line growth** (low) — adding `sdd-clarify` routing grows
  `prompt-sections.ts` (~+80 chars); no hard budget guard exists, but keep it
  terse.
- **Phase reorder consistency** — inserting `clarify` MUST update downstream
  prerequisites and phase-order tests, or the pipeline breaks.
- **Template churn breaking apply** — `[P]` and sub-artifacts MUST stay
  back-compatible; `executing-plans` and validators MUST tolerate their absence.
- **Boundary overlap** — `sdd-clarify` must not duplicate
  requirements-interview (which stays upfront-only).

## Rollback Plan

Each mechanism is additive and independently revertable. Removing the new
`config.yaml` toggles, reverting the `sdd-tasks`/`executing-plans`/`sdd-design`
SKILL additions, deleting `src/skills/sdd-clarify/SKILL.md`, and reverting the
`sdd-clarify` insertion in `src/harness/core/sdd.ts` + `prompt-sections.ts`
restores prior behavior. No main spec or archived change is touched.

## Success Criteria

1. `sdd-tasks` can emit `[P]`; `executing-plans` dispatches `[P]`-marked tasks as
   an explicit parallel batch; gated by `rules.tasks.parallel_markers`;
   absence of `[P]` preserves current behavior.
2. `sdd-design` can produce optional `research.md` / `data-model.md` /
   `contracts/` / `quickstart.md` alongside the always-present `design.md`, gated
   by `rules.design.sub_artifacts` + `complexity_threshold`.
3. `sdd-clarify` exists as a Full-SDD phase between spec and design, scans
   ambiguity by taxonomy, runs bounded Q&A within the clarification cap, writes
   back to the spec, and re-validates the requirements checklist.
4. `FULL_SDD_PHASE_ORDER`, `SDD_PHASES`, downstream prerequisites, and the
   delegation matrix all reflect the new phase consistently.
5. All criteria hold across OpenCode, Claude Code, and Codex; `pnpm run check:ci`
   passes.

## Constitution Check

This change is consistent with the native thoth-agents constitution. It upholds
**multi-harness parity** (all three mechanisms are fully shared, zero
dialect-specific handling), **governed persistence** (sub-artifacts and clarify
write-back use canonical OpenSpec paths + deterministic thoth-mem topic keys),
**delegate-first coordination** (`sdd-clarify` routes through the existing
delegation matrix), and **evidence-led verification** (clarify re-validates the
requirements checklist; phase-order changes are test-covered). No principle is
removed or redefined, so no constitution version bump is required.
