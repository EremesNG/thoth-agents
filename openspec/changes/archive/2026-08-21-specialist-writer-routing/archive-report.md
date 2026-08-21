# Archive Report: Predictable specialist-writer routing

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-21-specialist-writer-routing/`

## Completed scope

- FR-001–FR-008 and buildable SC-001–SC-006 are implemented and independently verified.
- Canonical routing now selects `designer`, `quick`, or `deep` deterministically for artifact-backed implementation, preserves one bounded Direct root micro-action, and keeps final verification with a fresh Oracle.
- OpenCode, Codex, and Claude expose truthful routable role contracts and proportional effort defaults without overstating native enforcement.
- Shared specialist prompts are canonical and smaller; source skills, operator documentation, tests, and generated plugin output are synchronized.
- Convergence round 1 closed V-001, V-002, and V-003 with a seven-case cross-harness regression, consumed realistic `quick` case, and unambiguous Direct-root wording.

## Verification lineage

- Plan review: fresh Oracle `[OKAY]`, recorded with reviewed-artifact SHA-256 hashes in `plan-review.md`.
- Verification round 1: independent Oracle `FAIL` on V-001–V-003; no behavioral check failed.
- Convergence round 1: T040–T042 completed with a fresh `quick` writer.
- Verification round 2: a new independent Oracle recorded `PASS` in `verify-report.md`; focused 198 tests, integration 12 tests, `check:ci`, typecheck, full 991 tests, context validation, diff, and secret checks passed.
- Writer evidence also records an exit-zero `pnpm run build`; the final Oracle corroborated it through typecheck, generation parity, integration, declarations/runtime output, and the full suite without rerunning the writing command.

## Canonical specification sync

- Updated: `adaptive-sdd`, `model-catalog`, `multi-harness-agent-pack`.
- Applied: replaced `Use adaptive-root delegation` and added `Expose routable role contracts` plus `Use the strongest truthful native role selector` in `multi-harness-agent-pack`.
- Applied: added `Select specialist writers deterministically` in `adaptive-sdd`.
- Applied: added `Apply proportionate specialist effort` in `model-catalog`.
- FR-006–FR-008 are `[INTERNAL]` and do not mutate canonical capability specifications.
- Existing-capability overlap warnings were semantically reviewed during specify/ready validation; the newly titled requirements are distinct, non-duplicative contracts.

## Deviations and residual warnings

- The first verification failed on regression-coverage completeness and root-wording coherence; the append-only convergence and second fresh Oracle closed every actionable finding.
- The final Oracle did not rerun the writing build command under its read-only boundary; independent corroborating checks were green.
- `R-SC-007` remains a truthful non-blocking outcome risk because representative post-release consumer telemetry does not yet exist.

## Follow-up

- On the next representative artifact-backed consumer SDD, record at least one appropriate `designer`, `quick`, or `deep` assignment and confirm zero duplicate root implementation of the assigned surface for SC-007.
