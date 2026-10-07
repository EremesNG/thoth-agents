# Verification Report: Realign sdd-init for idempotent bootstrap backfill

## Round
round 1

## Completeness
All six in-scope source/test surfaces named in the proposal and tasks checklist are implemented. Both HOW (backfill mechanics) and WHEN (dispatch/gate) layers landed in the same change, with partial-openspec per-piece detection. No placeholder SDD artifacts created. OQ-2 resolved without a new top-level anchor.

## Build and Test Evidence
- `pnpm run lint` (biome) — PASS, 222 files, exit 0.
- `pnpm run typecheck` (tsc --noEmit) — PASS, exit 0.
- `pnpm vitest run sdd.test.ts index.test.ts skill-layout.test.ts` — PASS, 3 files / 81 tests, exit 0.
- `pnpm run build` — PASS (ESM build + schema generation), exit 0.

## Compliance Matrix (proposal success criteria)
- **SC1** pre-rigor backfill adds config.yaml mechanism sections/toggles + creates constitution.md (1.0.0) without altering existing values — MET. `src/skills/sdd-init/SKILL.md:79-99` (absent-set 5a, additive merge 5b preserving present keys verbatim), `:170-186` (7a: absent→create 1.0.0).
- **SC2** fully-aligned = reported no-op; constitution never renumbered/recreated — MET. `SKILL.md:73-74` (no-op return), `:179-184` (present→preserve content+version; 2.1.0 stays 2.1.0), Rules `:215-219`.
- **SC3** partial-openspec states each detected + individually backfilled — MET. `SKILL.md:79-81` ("detect each independently; treat partially-present per-piece, not all-or-nothing"), absent-set enumerates specs/, changes/, sections, toggles, constitution separately.
- **SC4** init-phase condition + dispatch guidance recommend init for stale openspec while still triggering when missing — MET. `src/harness/core/sdd.ts:86-87` (widened condition), `src/agents/prompt-sections.ts:361` (dispatch guidance, retains "dispatch sdd-init first"), `src/skills/requirements-interview/SKILL.md:187-191` (init gate covers stale/partial).
- **SC5** openspec-convention documents config.yaml mechanism-section additive-merge idempotency — MET. `src/skills/_shared/openspec-convention.md:206-219` (new subsection: per-section absence detection, no overwrite, report added, no-op on aligned) + widened pre-flight `:38-43`.
- **SC6** affected tests pass asserting widened trigger + additive backfill — MET. `sdd.test.ts:90-98` adds the `condition` assertion (previously absent) plus `missing`/`stale`/`mechanism sections` substring checks; full suite green above.

## Idempotency Invariants
Correctly expressed: additive-only and never-overwrite stated at SKILL.md:91-95, :215-216 and openspec-convention.md:214-216; constitution never renumbered/recreated at SKILL.md:179-184, :217-218 and convention.md:188-189; explicit no-op on fully-aligned at SKILL.md:73-74, :219 and convention.md:218-219.

## Test-Coupling Soundness
- Widened `condition` is now actually asserted: `sdd.test.ts:90-91` matches the exact string in `sdd.ts:87`; substring guards at `:96-98` lock missing+stale+mechanism semantics. Sound.
- `prompt-sections.ts:361` still contains the literal `dispatch sdd-init first`, so `index.test.ts:340` holds. Verified green.
- skill-layout anchors for sdd-init (`'Bootstrap OpenSpec structure'`, `'Persistence Mode'`) unchanged and still present; OQ-2 satisfied (content merged under existing `## Workflow`/`## Rules`, no new heading).

## Scope Discipline
No scope creep or silent narrowing: greenfield create path (steps 6-8) unchanged; the conditional test files (custom-skills.test.ts, skills.test.ts) correctly untouched since no skill description changed. No placeholder proposal/design/tasks/spec files introduced (SKILL.md:188-189 + Rules reaffirm).

## Issues Found
### Critical
None.

### Warnings
None.

## Verdict
**pass**
