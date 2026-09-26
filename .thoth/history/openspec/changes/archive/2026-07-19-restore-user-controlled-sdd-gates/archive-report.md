# Archive Report: Restore user-controlled SDD gates

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-07-19-restore-user-controlled-sdd-gates/`

## Completed scope

- US1/FR-001/SC-001 restore user selection of Direct, Accelerated, or Full after an evidence-based recommendation.
- US2/FR-002 through FR-004/SC-002, SC-003, and SC-005 restore optional Oracle plan review while preserving mandatory final verification.
- US3/FR-005 and FR-006/SC-004 and SC-006 distribute `plan-reviewer` across harnesses and align constitution, prompts, instructions, and documentation.

## Verification lineage

- `verify-report.md` records independent Oracle PASS with complete FR/SC mapping and executed repository evidence.

## Canonical specification sync

- Updated: `adaptive-sdd`, `multi-harness-agent-pack`.
## Deviations and residual warnings

- VR-R01 LOW: the separate `ready` validator is enforced by workflow ordering rather than encoded in `canEnterSddPhase`.
- VR-R02 LOW: the historical plan-review approval is stale by design and has no verify or closeout authority.

## Follow-up

- None.
