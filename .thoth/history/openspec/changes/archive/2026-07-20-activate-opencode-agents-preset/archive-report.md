# Archive Report: Activate the applied OpenCode agents preset

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-07-20-activate-opencode-agents-preset/`

## Completed scope

- US1: Both dirty and unchanged/full OpenCode model Apply persist and activate a complete seven-role `presets.agents` roster while preserving effective fields and unrelated configuration.
- US2: The active complete `agents` preset is recognized as managed, remains readable and safely reapplicable, and does not revive root-only legacy layouts.
- Install and sync continue to select the built-in `openai` preset, and README guidance distinguishes those paths from explicit model Apply.

## Verification lineage

- Initial independent Oracle verification recorded FAIL findings V-001, V-002, and V-003.
- Root convergence added missing clean/full and selected-preset evidence, corrected managed-over-legacy precedence, and documented/tested omitted-variant stability.
- `verify-report.md` records final independent Oracle PASS for FR-001 through FR-004 and SC-001 through SC-004 with no unresolved critical issue.
- Focused validation passed 71/71 tests; repository validation passed build, typecheck, formatting, and 867/867 tests.

## Canonical specification sync

- Updated: `cli-installation`.
- The declared sync contains three `[ADDED cli-installation]` requirements; FR-004 remains `[INTERNAL]` and does not modify the canonical specification.

## Deviations and residual warnings

- The optional pre-implementation plan-review digests became stale after convergence; the final Oracle independently reviewed the revised plan.
- Closeout corrected the three unchanged-intent durable delta tags from `MODIFIED` to `ADDED` because their requirement titles do not yet exist in the canonical capability specification.
- An initial parallel build/test validation raced on generated integration files; the required sequential build and full test rerun passed.
- A first archive attempt exposed multiline acceptance scenarios that the canonical-sync parser truncated; root rolled back only that attempt's three additions, restored the active audit trail, and normalized the same scenario wording to the parser's single-line contract before retrying.
- No material product residual risk remains.

## Follow-up

- None.
