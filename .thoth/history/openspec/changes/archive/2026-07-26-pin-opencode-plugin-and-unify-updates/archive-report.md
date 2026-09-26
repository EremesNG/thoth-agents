# Archive Report: Pin OpenCode Plugin and Unify Harness Updates

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-07-26-pin-opencode-plugin-and-unify-updates/`

## Completed scope

- US1 / FR-001-FR-002 / SC-001-SC-002: OpenCode installation and applied Update pin exactly the executing package release, replace prior managed forms, and fail before mutation when package identity is invalid.
- US2 / FR-003-FR-005 / SC-003-SC-005: Interactive and command Update paths perform the complete selected-harness refresh with truthful previews, ordered native/managed/skill/provider/ledger effects, and failing outcomes for incomplete required steps.
- US3 / FR-006-FR-007 / SC-006-SC-007: A versioned global ledger records the last complete CLI-managed release independently for OpenCode, Codex, and Claude and remains independent of native marketplace versions.
- US4 / FR-008-FR-009 / SC-008-SC-009: The OpenCode runtime only notifies about newer releases, while CLI/TUI/public documentation consistently identifies the CLI as the official complete update path.

## Verification lineage

- `verify-report.md` records independent oracle PASS with `pnpm run check:ci`, `pnpm run typecheck`, `pnpm run build`, `pnpm run integration:verify`, and `pnpm test` all passing; the full suite completed 939/939 tests.
- Oracle mapped every FR-001 through FR-009 and buildable SC-001 through SC-009 to implementation evidence and executed checks, with no critical issue.

## Canonical specification sync

- Updated: `cli-installation`.
## Deviations and residual warnings

- No scope deviation. A stale provider-boundary source-layout assertion was updated to follow the accepted shared finalization seam without weakening provider ownership.
- W-001: The TUI preview renders five item details and summarizes remaining planned stages as a count; the underlying plan and CLI preview enumerate every required stage.
- R-001: Native manager, external skill, and provider effects were verified through isolated/mocked seams; live external mutation was intentionally not invoked.
- R-002: Ledger replacement is atomic, but already completed external effects are not rolled back if the final ledger commit fails; retry is the documented recovery path.
- R-003: Existing nonfatal Codex enforcement-gap notices remain truthful capability disclosures.

## Follow-up

- None.
