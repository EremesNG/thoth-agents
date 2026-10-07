# Archive Report: Configure Model Effort by Harness

## Change

- `configure-model-effort-by-harness`
- Persistence mode: `openspec`
- Pipeline type: `full`
- Archived on: 2026-07-17

## Archive Outcome

- Status: Archived
- Archive location: `openspec/changes/archive/2026-07-17-configure-model-effort-by-harness/`
- Merged specs:
  - `openspec/specs/model-catalog/spec.md` (created)
  - `openspec/specs/multi-harness-agent-pack/spec.md` (additive requirements)

## Verification Lineage

- Verification report: `openspec/changes/archive/2026-07-17-configure-model-effort-by-harness/verify-report.md`
- Verification verdict: `round 2`, **pass**
- Tasks: 21/21 complete; requirements: 14/14 reviewed; scenarios: 39/39 compliant.
- No unresolved critical issues or warnings were reported.
- Accepted evidence includes `pnpm run check:ci`, focused and full test suites,
  coordinator typecheck, and coordinator build/declaration/schema generation.

## Mode-Based Notes

- OpenSpec-only persistence was used; no thoth-mem archive artifact was written
  or recovered.
- Full-pipeline delta specs were merged before moving the completed change
  directory.
- The active `add-claude-code-harness-adapter` change was left untouched and
  remains outside this archive operation.

## Audit Summary

- Promoted the model-catalog requirements into a new canonical spec.
- Added all configure effort requirements to the existing multi-harness spec
  without replacing unrelated requirements or duplicating headings.
- Archived the complete configure change directory under the dated archive
  location for auditability.

## Constitution Suggestion

This change touched governance/principle artifacts; consider running
`sdd-constitution` to record a constitution amendment. This suggestion is
advisory and does not block archival.
