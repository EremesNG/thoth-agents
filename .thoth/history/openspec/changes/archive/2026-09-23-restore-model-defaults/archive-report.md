# Archive Report: Restore model defaults

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-09-23-restore-model-defaults/`

## Completed scope

- US1 and FR-001 through FR-003: restore defaults preview in every harness model menu, explicit native apply for Codex/OpenCode/Pi, truthful Claude restriction.
- SC-001 and SC-002: four-harness preview/cancellation and isolated persistence/ownership evidence.

## Verification lineage

- verify-report.md records independent oracle PASS with executed evidence.
- Fresh oracle_restore_verify reviewed source, artifacts and logs after implementation.
- Focused 146 tests and full 1177 tests pass; check:ci, typecheck and build pass.

## Canonical specification sync

- Updated: `model-catalog`.
## Deviations and residual warnings

- Restore labeling is UI state so issued native plan identity and content stay unchanged.
- Catalog-loading previews can require reopening after loading. Claude cache writes remain unsupported by native ownership contract.
- Three ADDED overlap warnings reviewed: these requirements introduce the explicit restore action, distinct from existing discovery/effort allocation.

## Follow-up

- None.
