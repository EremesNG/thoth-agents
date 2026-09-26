# Archive Report: Native Dispatch Waves

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-09-01-native-dispatch-waves/`

## Completed scope

- FR-001/SC-001/SC-002: `tasks.md` now declares strict parallel groups containing ordered writer-owned lanes, prerequisites, a downstream/final barrier, and concrete independence evidence; the validator enforces every required structural category.
- FR-002/SC-003: the implement contract maps each ready group to capacity-bounded native waves, dispatch-before-wait, capacity refill, terminal per-lane evidence, root-only task state, and barrier release after full reconciliation.
- FR-003/SC-001: the real validator CLI accepts the canonical two-lane grammar and rejects the required invalid membership, ownership, prerequisite, barrier, dependency, overlap, and mode cases with stable diagnostics.
- FR-004/SC-005: the change adds no Thoth executor, scheduler, queue, database, lifecycle ledger, trace collector, worktree manager, synthetic wait API, fixed concurrency limit, adapter runtime, or dependency.

## Verification lineage

- `verify-report.md` records independent fresh Oracle PASS with no critical finding, 112/112 focused tests, 12/12 integration tests, passing check/typecheck/build, and 1050/1050 full tests under the intended process environment.

## Canonical specification sync

- Updated: `adaptive-sdd`, `multi-harness-agent-pack`.
## Deviations and residual warnings

- The first ambient full-suite run produced 16 Codex test failures because Orca supplied its runtime `CODEX_HOME`; the four affected suites passed 49/49 and the full suite passed 1050/1050 after that ambient override was removed from the test process.
- NDW-R001 / SC-004: Codex native three-lane dispatch-before-wait is observed PASS. OpenCode and Claude Code remain explicit non-blocking outcome RISK pending one bounded two-lane smoke per harness.

## Follow-up

- Run the SC-004 bounded native smoke in OpenCode and Claude Code; record dispatch-before-wait, terminal-before-barrier, and truthful capacity/capability degradation per harness.
