# Archive Report: Separate Global Installation from Project Initialization

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-07-20-separate-install-from-thoth-init/`

## Completed scope

- US1 / FR-001–FR-002 / SC-001–SC-002: OpenCode direct and managed
  installation surfaces synchronize the five packaged thoth-owned skills under
  `~/.config/opencode/skills/` before external skills and provider completion.
- US2 / FR-003–FR-004 / SC-003–SC-004: `thoth-init` is harness-neutral,
  preflighted, idempotent, and restricted to the minimum project `openspec/`
  governance structure.
- US3 / FR-005 / SC-005: canonical sources, generated plugin assets, tests,
  installation output, and public/routed documentation share the same ownership
  boundary.

## Verification lineage

- The first independent Oracle verification found critical `F-001`: emitted
  CLI chunks resolved the package root incorrectly.
- Append-only convergence task T021 reproduced and fixed `F-001`, adding both a
  simulated chunk-layout test and a real compiled CLI release-layout test.
- `verify-report.md` records the fresh independent Oracle `PASS` across every FR
  and buildable SC, with no unresolved finding, warning, or residual risk.

## Canonical specification sync

- Updated: `adaptive-sdd`, `cli-installation`, `external-required-skills`.
- Added `Install owned OpenCode workflow skills globally` to
  `cli-installation`.
- Replaced `Preserve harness-native discovery` in
  `external-required-skills`.
- Added `Limit thoth-init to project governance` and `Synchronize the minimum
  OpenSpec structure` to `adaptive-sdd`.
- FR-005 is INTERNAL and will not update a durable capability specification.

## Deviations and residual warnings

- Implementation required one verified convergence pass for `F-001`; it is
  resolved. No accepted scope deviation or residual warning remains.

## Follow-up

- None.
